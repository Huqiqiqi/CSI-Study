from pathlib import Path
import ast
import json
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
docs = sorted((root/'chapters').glob('*.md'))
images = []
external = set()
for p in docs:
    text = p.read_text(encoding='utf-8')
    assert len(re.findall(r'^```', text, re.M)) % 2 == 0, f'Unclosed code fence: {p}'
    for img in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', text):
        assert (root/img).is_file(), f'Missing diagram: {img}'
        images.append(img)
    external.update(re.findall(r'\]\((https?://[^)]+)\)', text))
    assert '\ufffd' not in text, f'Replacement character: {p}'
    assert 'turn0search' not in text and 'cite' not in text, 'Internal citation leaked'
assert len(images) == 12 and len(set(images)) == 12
for svg in (root/'assets').glob('*.svg'):
    xml = ET.parse(svg)
    assert xml.getroot().find('{http://www.w3.org/2000/svg}title') is not None
ast.parse((root/'examples/pipeline.py').read_text(encoding='utf-8'))
report = {'markdown_files':len(docs), 'figures':len(images),
          'unique_external_reference_urls':len(external),
          'checks':['balanced code fences','all figure files exist','SVG XML and titles',
                    'no replacement characters or internal citation markers','Python syntax']}
(root/'tools/qa').mkdir(parents=True, exist_ok=True)
(root/'tools/qa/content-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
