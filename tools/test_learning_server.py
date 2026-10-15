"""Integration tests use local mock APIs only; no external model calls."""
import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('learning_server', Path(__file__).resolve().parents[1] / 'learn/server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class MockAPI(BaseHTTPRequestHandler):
    requests = []
    behavior = 'success'
    def log_message(self, *args):
        pass
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.requests.append((self.path, data, self.headers.get('Authorization')))
        if self.behavior == 'error':
            self.send_response(401); self.end_headers(); self.wfile.write(b'provider secret details'); return
        if self.behavior == 'redirect':
            self.send_response(302); self.send_header('Location', '/stolen'); self.end_headers(); return
        if self.behavior == 'empty':
            result = {}
        elif self.path.endswith('/responses'):
            result = {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'CSI-2 传图像，I2C 配置寄存器。[ch1-s1]'}]}]}
        else:
            result = {'choices': [{'message': {'content': '这是模拟的 Chat Completions 解释。'}}]}
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps(result).encode())

class LearningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.mock = ThreadingHTTPServer(('127.0.0.1', 0), MockAPI)
        for server in (cls.server, cls.mock):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.mock_base = f'http://127.0.0.1:{cls.mock.server_port}/v1'
    @classmethod
    def tearDownClass(cls):
        for server in (cls.server, cls.mock):
            server.shutdown(); server.server_close()
    def setUp(self):
        app.CONFIG.clear(); MockAPI.requests.clear(); MockAPI.behavior = 'success'
    def request(self, path, data=None, headers=None):
        h = {'X-CSRF-Token': app.TOKEN, 'Content-Type': 'application/json'}
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode() if data is not None else None, headers=h)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())
    def configure(self, protocol='responses', **kwargs):
        data = dict(url=self.mock_base, model='mock-teacher', key='mock-secret-key', protocol=protocol)
        data.update(kwargs)
        return self.request('/api/config', data)
    def test_responses_with_context_and_history(self):
        self.assertEqual(self.configure()[0], 200)
        code, data = self.request('/api/ask', {'question': 'CSI 与 I2C 有什么区别？', 'mode': 'ai', 'lessonId': 'ch1-s1', 'quote': '三条通路', 'history': [{'role': 'user', 'content': '我是新手'}]})
        self.assertEqual(code, 200); self.assertIn('CSI-2', data['answer'])
        path, payload, auth = MockAPI.requests[-1]
        self.assertEqual(path, '/v1/responses'); self.assertEqual(auth, 'Bearer mock-secret-key')
        self.assertFalse(payload['store']); self.assertFalse(payload['stream'])
        self.assertIn('三条通路', payload['input'][-1]['content'])
        self.assertIn('[教材', payload['input'][-1]['content']); self.assertEqual(payload['input'][0]['content'], '我是新手')
        self.assertTrue(data['sources'])
    def test_chat_completions(self):
        self.configure('chat')
        code, data = self.request('/api/ask', {'question': '编码是什么', 'mode': 'ai'})
        self.assertEqual(code, 200); self.assertIn('Chat Completions', data['answer'])
        path, payload, _ = MockAPI.requests[-1]
        self.assertEqual(path, '/v1/chat/completions'); self.assertEqual(payload['messages'][0]['role'], 'system')
    def test_local_retrieval_no_network(self):
        code, data = self.request('/api/ask', {'question': 'V4L2 驱动', 'mode': 'local'})
        self.assertEqual(code, 200); self.assertEqual(data['mode'], 'local'); self.assertTrue(data['sources']); self.assertFalse(MockAPI.requests)
        matched = app.retrieve('CSI 和 I2C 分别做什么？')
        self.assertIn('三条通路', ' '.join(l['title'] for l in matched))
        self.assertNotEqual(matched[0]['chapterId'], 'ch11')
    def test_keys_not_returned_or_reused_for_different_url(self):
        _, response = self.configure()
        _, status = self.request('/api/status')
        self.assertNotIn('mock-secret-key', json.dumps([response, status]))
        self.configure(key=''); self.assertEqual(app.CONFIG['key'], 'mock-secret-key')
        self.configure(url=self.mock_base+'/other', key=''); self.assertEqual(app.CONFIG['key'], '')
        self.request('/api/clear', {}); self.assertFalse(app.CONFIG)
    def test_csrf_and_origin(self):
        self.assertEqual(self.request('/api/config', {}, {'X-CSRF-Token': 'wrong'})[0], 403)
        self.assertEqual(self.request('/api/config', {}, {'Origin': 'https://other-site.example'})[0], 403)
        self.assertEqual(self.request('/api/status', headers={'Host': 'evil.example'})[0], 403)
    def test_missing_config_and_errors(self):
        self.assertEqual(self.request('/api/ask', {'question': 'CSI', 'mode': 'ai'})[0], 409)
        self.configure(); MockAPI.behavior = 'error'
        code, data = self.request('/api/ask', {'question': 'CSI', 'mode': 'ai'})
        self.assertEqual(code, 502); self.assertIn('401', data['error']); self.assertNotIn('secret', data['error'])
    def test_redirect_not_followed(self):
        self.configure(); MockAPI.behavior = 'redirect'
        code, data = self.request('/api/ask', {'question': 'CSI', 'mode': 'ai'})
        self.assertEqual(code, 502); self.assertEqual(len(MockAPI.requests), 1)
    def test_empty_response(self):
        self.configure(); MockAPI.behavior = 'empty'
        self.assertEqual(self.request('/api/ask', {'question': 'CSI', 'mode': 'ai'})[0], 400)
    def test_paths_and_endpoint(self):
        self.assertEqual(self.request('/files/../learn/server.py')[0], 404)
        self.assertEqual(self.request('/assets/%2e%2e/learn/server.py')[0], 404)
        self.assertEqual(self.request('/server.py')[0], 404)
        self.assertEqual(app.endpoint('https://example.com', 'responses'), 'https://example.com/v1/responses')
        self.assertEqual(app.endpoint('https://example.com/api/v1', 'chat'), 'https://example.com/api/v1/chat/completions')
        self.assertEqual(app.endpoint('https://example.com/v1/responses', 'responses'), 'https://example.com/v1/responses')
        for url in ('http://remote.example/v1', 'https://user:key@example.com/v1', 'https://example.com/v1?key=secret'):
            with self.assertRaises(ValueError):
                app.endpoint(url, 'responses')
        with self.assertRaises(ValueError):
            app.endpoint('https://example.com/v1/responses', 'chat')
    def test_full_course_structure(self):
        self.assertEqual(len(app.COURSE['chapters']), 12); self.assertEqual(len(app.LESSONS), 79)
        self.assertEqual(sum(l['html'].count('<img ') for l in app.LESSONS.values()), 12)
        self.assertEqual(sum(l['html'].count('<pre>') for l in app.LESSONS.values()), 38)

if __name__ == '__main__':
    unittest.main(verbosity=2)
