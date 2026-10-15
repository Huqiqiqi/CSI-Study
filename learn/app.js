'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='rk3588-learning-v1';
let course,lessons=[],current=null,status={},quote='',quoteLesson='',selectedText='',busy=false;
let state={completed:[],notes:{},last:'',chat:[],quiz:{}};
try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved&&typeof saved==='object')state={...state,...saved};}catch{}
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{toast('浏览器存储不可用或已满，请导出学习记录。');}}
function download(name,text,type='application/json'){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function api(path,body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100000);try{const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':status.csrf}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'请求失败');return data;}catch(e){if(e.name==='AbortError')throw Error('请求等待超过 100 秒，本次未收到答案。请检查 API 服务。');if(e instanceof TypeError)throw Error('本机学习服务未连接，请重新运行启动脚本并刷新页面。');throw e;}finally{clearTimeout(timer);}}
const descriptions=[
  '认清开发板、Linux 主机和观看端，建立可验证的版本基线。',
  '看懂 sensor、CSI-2、D-PHY 和 RAW；先算带宽，再选模组。',
  '沿着媒体拓扑找到第一帧，逐步读懂设备树和 sensor 驱动。',
  '从测试图建立 pipeline，理解编码，再接入 RK 硬件处理。',
  '从十秒录像走向分段存储，理解容器、容量和音视频轨道。',
  '打通发布、媒体服务器和浏览器，同时掌握录像与推流。',
  '看清地址、协议和延迟，把局域网链路带到远程。',
  '分清软硬件解码与各处理单元，建立零复制的正确认识。',
  '让视频真正显示出来，理解时间戳、音画同步和回放。',
  '逐步扩展双路和四路，加入监控、元数据和 NPU 旁路。',
  '按实验成果推进，随时查阅排错索引、自测题和术语。',
  '回到板卡官方资料与接口文档，核对版本和适用范围。'
];
const quizzes={
  ch1:{q:'CSI-2 与 I²C 在常见摄像头模组中分别做什么？',options:['CSI-2 传图像，I²C 配寄存器','I²C 传高清视频，CSI-2 配曝光','两者都只是电源线'],answer:0,why:'CSI-2 是图像数据通路；I²C/CCI 常用于控制 sensor。供电、时钟和复位也要分别核对。'},
  ch2:{q:'看到了 /dev/video0，就能确定它是摄像头图像出口吗？',options:['能，编号最小的一定是主摄像头','不能，要结合媒体拓扑、节点能力和格式确认','能，只要设备文件存在即可'],answer:1,why:'视频节点还可能是 ISP 统计、参数或其他设备。先看 media-ctl -p 与 v4l2-ctl 的能力和格式。'},
  ch3:{q:'把 NV12 原始数据改名为 .h264 会发生什么？',options:['自动变成可播放 H.264','完成封装但没有压缩','文件名变了，数据仍是原始像素'],answer:2,why:'编码器才会把像素压缩成码流。扩展名不会改变文件内容，封装器也不是编码器。'},
  ch4:{q:'按固定编码码率估算录像容量，首先应使用哪项数据？',options:['编码码率 × 时长，再换算 bit 与 byte','摄像头像素数 × 文件名长度','CSI lane 数 × 屏幕尺寸'],answer:0,why:'编码后存储量主要由平均码率和时长决定，另加音频、容器开销与余量。MB 与 MiB 也不要混用。'},
  ch5:{q:'网页里的 <video> 能普遍直接播放 rtsp:// 地址吗？',options:['可以，所有浏览器都内置 RTSP','不能这样假设，通常需转为 WebRTC/HLS 等浏览器路径','把端口改成 80 就可以'],answer:1,why:'RTSP 常作为摄像头到服务器的协议。浏览器路径还涉及协议支持、编码兼容、自动播放策略和网络可达性。'},
  ch6:{q:'局域网里能播放，外网不能播放，最先应该做什么？',options:['立即重写 sensor 驱动','随机调高编码分辨率','分层检查地址、路由、端口、鉴权以及 WebRTC 候选地址'],answer:2,why:'先定位网络和服务层。已有局域网图像表明采集链路至少在当前测试条件下有效，不应跳回盲改驱动。'},
  ch7:{q:'使用了硬件解码器，就一定端到端零复制吗？',options:['是，硬件会消除所有内存复制','否，还取决于缓冲共享、像素格式、布局和下游支持','只要 CPU 低于 50% 就是零复制'],answer:1,why:'硬件加速与零复制是不同问题。DMABUF、stride、modifier、缓存一致性和接收端能力需要整条链路匹配。'},
  ch8:{q:'音画同步主要依据什么来调度呈现？',options:['文件名排序','两条线程恰好运行相同次数','时间戳与共同的播放时钟'],answer:2,why:'PTS 表示呈现时间；解码顺序与显示顺序可能不同。缓冲、时钟选择及设备时钟漂移也会影响同步。'},
  ch9:{q:'扩展四路 CSI，应该采用怎样的验收顺序？',options:['先确认每路单独稳定，再逐步并发并记录丢帧和资源指标','只看芯片宣传的最大像素数','一次开启全部功能，看有没有画面'],answer:0,why:'多路共享 ISP、内存、编码器、存储和网络资源；连接器数量不等于任何组合都能满速同时工作。'}
};

function navigation(){
  $('#syllabus').innerHTML=course.chapters.map(c=>`<details class="chapter-group" data-chapter="${c.id}"><summary><span class="chapter-number">${c.number===0?'序':c.number<10?String(c.number).padStart(2,'0'):'附'}</span>${esc(c.short)}</summary>${c.lessons.map(l=>`<a href="#${l.id}" data-lesson="${l.id}">${esc(l.title)}</a>`).join('')}</details>`).join('');
  updateProgress();
}
function updateProgress(){
  const n=state.completed.length,percentage=Math.round(n/lessons.length*100);
  $('#progress').value=percentage;$('#progress-label').textContent=percentage+'%';$('#progress-count').textContent=`已完成 ${n} / ${lessons.length} 个小节`;
  $('#notes-count').textContent=Object.values(state.notes).filter(x=>x.trim()).length;
  $$('[data-lesson]').forEach(a=>a.classList.toggle('done',state.completed.includes(a.dataset.lesson)));
}
function dashboard(){
  const next=lessons.find(l=>l.id===state.last)||lessons[0];
  return `<section class="hero"><span class="eyebrow">FROM SENSOR TO SCREEN</span><h1>从第一帧图像，<br>到<em>完整的视频系统。</em></h1><p>为零基础开发者准备的 RK3588 学习路线。把摄像头、驱动、编码、存储和网页播放连起来，一步一步做出自己的系统。</p><div class="hero-actions"><a class="primary" href="#${next.id}">${state.last?'继续学习':'开始第一课'} <span aria-hidden="true">→</span></a><small>${state.last?esc(next.title):'先认识设备与版本，再开始接线和写代码'}</small></div></section>
  <div class="stats"><div class="stat"><strong>9</strong><span>核心章节</span></div><div class="stat"><strong>${lessons.length}</strong><span>完整学习小节</span></div><div class="stat"><strong>21</strong><span>编号实验 · 0—20</span></div><div class="stat"><strong>12</strong><span>原创原理图解</span></div></div>
  <div class="section-heading"><h2>你将打通的这条链路</h2><small>每一站，都能解释与验证</small></div>
  <div class="pipeline-strip">${[['INPUT','CSI 采集'],['LINUX','驱动 / ISP'],['CODEC','硬件编码'],['OUTPUT','存储 / 推流'],['PLAYER','网页 / 显示']].map((p,i)=>`${i?'<span class="pipeline-arrow">→</span>':''}<div class="pipeline-step"><span>${p[0]}</span>${p[1]}</div>`).join('')}</div>
  <div class="notice"><strong>你的学习基线：</strong>正点原子 RK3588，摄像头待选。先在实验 0 确认内核、SDK 和底板版本；教程中的节点编号和设备树示例需按实际环境适配。</div>
  <div class="section-heading"><h2>按路线，逐章解锁能力</h2><small>完成状态保存在当前浏览器</small></div><div class="course-grid">${course.chapters.map(c=>{const done=c.lessons.filter(l=>state.completed.includes(l.id)).length;return `<a class="course-card" href="#${c.lessons[0].id}"><div class="card-top"><span class="card-index">${c.number===0?'START':c.number<10?'CH '+String(c.number).padStart(2,'0'):'REFERENCE'}</span><span>${c.lessons.length} 小节</span></div><h3>${esc(c.short)}</h3><p>${descriptions[c.number]}</p><div class="card-footer"><span>${done?`已完成 ${done} / ${c.lessons.length}`:'从这里开始'}</span><span>阅读 →</span></div></a>`;}).join('')}</div>
  <div class="section-heading"><h2>随手可用的开发资料</h2></div><div class="resource-links"><a href="/reader" target="_blank">完整图文教材 ↗</a><a href="/files/examples/README.md" target="_blank">配套实验说明 ↗</a><a href="/files/templates/board-profile.md" download>下载板卡记录模板 ↓</a><a href="#notebook">备份学习记录 →</a></div>`;
}
function quizHtml(chapter){const q=quizzes[chapter];if(!q)return '';return `<section class="quiz-card"><h3>停一下，检查自己是否理解</h3><p>${q.q}</p><div class="quiz-options">${q.options.map((o,i)=>`<button data-quiz="${chapter}" data-option="${i}">${String.fromCharCode(65+i)}. ${o}</button>`).join('')}</div><p class="quiz-result" id="quiz-result"></p></section>`;}
function lessonHtml(l){const chapter=course.chapters.find(c=>c.id===l.chapterId),index=lessons.indexOf(l),done=state.completed.includes(l.id);return `<header class="lesson-header"><span class="eyebrow">${esc(chapter.short)} · ${chapter.lessons.indexOf(l)+1} / ${chapter.lessons.length}</span><h1>${esc(l.title)}</h1><div class="lesson-meta"><span>约 ${l.minutes} 分钟阅读</span><span>可选中文字向助手提问</span><button class="text-button" id="ask-current">请助手解释本节 ↗</button></div></header><article class="article" id="lesson-article">${l.html}</article><div class="lesson-tools"><button id="complete" class="${done?'quiet':'primary'}">${done?'✓ 已理解本节 · 可取消':'标记本节已理解 ✓'}</button><button class="quiet" id="ask-lab">带我做这一节</button><button class="quiet" id="copy-context">复制小节信息</button></div>${chapter.lessons.at(-1).id===l.id?quizHtml(chapter.id):''}<section class="notes-card"><h3>把理解写下来</h3><textarea id="lesson-note" rows="4" maxlength="30000" placeholder="用自己的话记下：这一节解决什么问题？实验输出是什么？还有什么疑问？">${esc(state.notes[l.id]||'')}</textarea><small id="note-status">自动保存在当前浏览器 · 可以在“我的笔记”导出备份</small></section><nav class="lesson-navigation" aria-label="前后小节">${index?`<a href="#${lessons[index-1].id}">← 上一节<br>${esc(lessons[index-1].title)}</a>`:'<span></span>'}${index<lessons.length-1?`<a href="#${lessons[index+1].id}">下一节 →<br>${esc(lessons[index+1].title)}</a>`:'<a href="#home">回到学习概览 →</a>'}</nav>`;}
function notebook(){const notes=Object.entries(state.notes).filter(([id,t])=>t.trim()&&lessons.some(l=>l.id===id));return `<span class="eyebrow">YOUR LEARNING JOURNAL</span><h1>我的笔记与学习记录</h1><p>把每次理解、报错和实验结果记下来。学习记录保存在本机浏览器；导出文件可用于备份或换浏览器继续学。</p><div class="lesson-tools"><button class="primary" id="export-state">导出全部学习记录</button><button class="quiet" id="import-state">导入学习记录</button><button class="quiet" id="export-notes">导出 Markdown 笔记</button></div><div class="notice">备份包括学习进度、笔记、自测结果和问答记录，不包含 API 密钥。导入会合并进度和笔记，同一小节的笔记以导入文件为准。</div><div class="section-heading"><h2>${notes.length} 篇学习笔记</h2><small>已完成 ${state.completed.length} 个小节</small></div>${notes.length?notes.map(([id,note])=>`<section class="notebook-entry"><h3><a href="#${id}">${esc(lessons.find(l=>l.id===id).title)} →</a></h3><p>${esc(note)}</p></section>`).join(''):'<div class="empty">还没有笔记。每个小节下方都有笔记框，随读随记。</div>'}<div class="section-heading"><h2>最近提过的问题</h2><small>保留最近 60 条对话消息</small></div>${state.chat.filter(m=>m.role==='user').slice(-15).reverse().map(m=>`<section class="notebook-entry"><p>${esc(m.content)}</p>${m.lessonId&&lessons.some(l=>l.id===m.lessonId)?`<a href="#${m.lessonId}">回到提问时的小节 →</a>`:''}</section>`).join('')||'<div class="empty">打开学习助手，提出你的第一个问题。</div>'}`;}
function lab(){return `<span class="eyebrow">INTERACTIVE ENGINEERING LAB</span><h1>把带宽算明白</h1><p>同一段视频，在 CSI 线上、内存中和录像文件里，数据量并不一样。动手改几个参数，观察差别。</p><section class="panel"><h3>① 先设定图像与编码参数</h3><div class="lab-grid">${[['width','图像宽度 / 像素',1920],['height','图像高度 / 像素',1080],['fps','每秒帧数 / fps',30],['cameras','摄像头路数',1],['bits','CSI 每像素位数 / RAW10 填 10',10],['lanes','每路摄像头的数据 lane 数',4],['bitrate','每路编码码率 / Mbps',8],['hours','录像时间 / 小时',1]].map(([id,label,v])=>`<div class="field"><label for="lab-${id}">${label}</label><input id="lab-${id}" data-calc="${id}" type="number" min="${id==='bitrate'||id==='hours'?'.01':'1'}" max="100000" step="any" value="${v}"></div>`).join('')}</div></section><section class="calculation" aria-live="polite"><h3>② 看看数据去了哪里</h3><div class="lab-results" id="lab-results"></div><p id="lab-note"></p></section><section class="panel"><h3>③ 学会解释数字</h3><p><strong>CSI 有效载荷</strong> = 宽 × 高 × 帧率 × 线上位深。它没有计入包开销、时序约束或余量，不能直接作为最终 D-PHY 配置。</p><p><strong>NV12 内存数据量</strong> ≈ 宽 × 高 × 帧率 × 1.5 字节。这里按紧密排列的 8-bit NV12 计算；真实 buffer 还有 stride/对齐，多次读写会继续消耗内存带宽。</p><p><strong>编码录像容量</strong> ≈ 总平均码率 × 时间 ÷ 8。这里只算视频，另加音频、封装和容量余量。GB 使用十进制。</p><p>多路数会增加总负载；每个 CSI 接口的 lane 速率按它自己承担的流量计算。虚拟通道共享一个物理接收端时，要合计该端口的流量。</p><a href="#${lessons.find(l=>l.title.includes('算清带宽'))?.id||'home'}">回到带宽实验的完整讲解 →</a></section>`;}
function calculate(){const v={};$$('[data-calc]').forEach(e=>v[e.dataset.calc]=Number(e.value));if(Object.values(v).some(n=>!Number.isFinite(n)||n<=0||n>100000)||['width','height','cameras','lanes','bits'].some(k=>!Number.isInteger(v[k]))){$('#lab-results').textContent='请输入合理的正数；分辨率、路数、lane 数与位深应为整数。';$('#lab-note').textContent='';return;}const pixels=v.width*v.height*v.fps,csi=pixels*v.bits/1e9;$('#lab-results').innerHTML=[['单路 CSI 有效载荷',csi.toFixed(3)+' Gbps'],['每条 lane 平均有效载荷',(csi/v.lanes).toFixed(3)+' Gbps'],['全部摄像头的 NV12 数据量',(pixels*1.5*v.cameras/1e6).toFixed(1)+' MB/s'],['视频录像预计容量',(v.bitrate*v.cameras*v.hours*3600/8000).toFixed(2)+' GB']].map(([name,value])=>`<div><small>${name}</small><strong>${value}</strong></div>`).join('');$('#lab-note').textContent=`当前为 ${v.cameras} 路 ${v.width} × ${v.height} @ ${v.fps} fps。以上是计算估算，不代表 RK3588 实测或已支持此模式。`;}

function render(){
  let id=decodeURIComponent(location.hash.slice(1)||'home');current=lessons.find(l=>l.id===id)||null;
  if(!current&&!['home','notebook','lab'].includes(id))id='home';
  $('#main').innerHTML=current?lessonHtml(current):id==='notebook'?notebook():id==='lab'?lab():dashboard();
  $('#breadcrumb').textContent=current?course.chapters.find(c=>c.id===current.chapterId).short+' / '+current.title:({home:'学习概览',notebook:'我的学习记录',lab:'带宽实验台'}[id]);
  document.title=(current?current.title:({home:'从一帧开始',notebook:'我的笔记',lab:'带宽实验台'}[id]))+' · RK3588 学习站';
  $$('[data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===id));
  $$('[data-lesson]').forEach(a=>a.classList.toggle('active',a.dataset.lesson===current?.id));
  if(current){state.last=current.id;persist();const details=$(`[data-chapter="${current.chapterId}"]`);if(details)details.open=true;}
  $('#context-label').textContent='当前：'+(current?.title||'课程概览');
  document.body.classList.remove('menu-open');$('#selection-bar').hidden=true;
  if(quoteLesson&&quoteLesson!==current?.id)clearQuote();
  window.scrollTo(0,0);updateProgress();decorateCode($('#main'));
  if(id==='lab')calculate();
  if(current&&$('#quiz-result')&&state.quiz[current.chapterId]!==undefined)showQuiz(current.chapterId,state.quiz[current.chapterId]);
}
function decorateCode(root){root.querySelectorAll('pre').forEach(pre=>{if(pre.querySelector('.copy-code'))return;const b=document.createElement('button');b.className='copy-code';b.textContent='复制代码';b.onclick=async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.textContent||pre.firstChild.textContent);b.textContent='已复制';setTimeout(()=>b.textContent='复制代码',1500);}catch{toast('复制失败，请选中代码手动复制。');}};pre.append(b);});}
function showQuiz(ch,choice){const q=quizzes[ch];if(!q)return;$$('[data-quiz]').forEach(b=>{b.classList.toggle('correct',Number(b.dataset.option)===q.answer);b.classList.toggle('wrong',Number(b.dataset.option)===choice&&choice!==q.answer);});$('#quiz-result').textContent=(choice===q.answer?'答对了。':'再想一想。')+q.why;}
function showAssistant(){document.body.classList.remove('assistant-hidden');document.body.classList.add('chat-open');}
function clearQuote(){quote='';quoteLesson='';$('#quote-box').hidden=true;$('#selection-bar').hidden=true;}
function useQuote(text){quote=text.slice(0,3000);quoteLesson=current?.id||'';$('#quote-text').textContent=quote;$('#quote-box').hidden=!quote;$('#selection-bar').hidden=true;}
function renderRich(text){
  // Escape first. Only a small fixed set of formatting is added afterward.
  return String(text).split(/```[^\n]*\n([\s\S]*?)```/g).map((part,i)=>i%2?`<pre><code>${esc(part)}</code></pre>`:esc(part).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\[(ch\d+-s\d+)\]/g,(all,id)=>lessons.some(l=>l.id===id)?`<a href="#${id}">[${id}]</a>`:all)).join('');
}
function chatRender(){
  $('#chat').innerHTML=state.chat.length?state.chat.map(m=>`<div class="message ${m.role==='user'?'user':m.mode==='error'?'error':'answer'}"><div class="message-label"><span>${m.role==='user'?'你':m.mode==='ai'?'AI 讲解':m.mode==='error'?'连接提示':'教材检索'}</span>${m.role!=='user'?'<button class="text-button save-answer">记入本节笔记</button>':''}</div><div class="message-body">${renderRich(m.content)}</div>${(m.sources||[]).filter(s=>lessons.some(l=>l.id===s.id)).map(s=>`<a class="message-source" href="#${s.id}"><strong>${esc(s.title)} ↗</strong>${s.excerpt?`<p>${esc(s.excerpt)}</p>`:''}</a>`).join('')}</div>`).join(''):`<div class="welcome"><div class="orb">✧</div><h3>把不懂的地方，变成下一步。</h3><p>我会跟随你正在阅读的小节。你可以直接提问，也可以选中正文中的一句话，再点“解释选中文字”。</p><ul><li>没配 API：搜索相关教材原文</li><li>接通 API：用你的模型讲解与追问</li><li>问答记录：保留在当前浏览器</li></ul><button class="text-button" id="welcome-settings">我有 URL 和 API，去设置 →</button></div>`;
  $$('#chat .message').forEach((node,i)=>{const b=node.querySelector('.save-answer');if(b)b.onclick=()=>{const m=state.chat[i];const id=m.lessonId||current?.id;if(!id||!lessons.some(l=>l.id===id)){toast('先打开一个学习小节，再保存为笔记。');return;}state.notes[id]=((state.notes[id]||'')+'\n\n【'+(m.mode==='ai'?'AI 讲解':'教材检索')+'】\n'+m.content).trim();persist();updateProgress();if(current?.id===id&&$('#lesson-note'))$('#lesson-note').value=state.notes[id];toast('已记入对应小节的笔记。');};});
  decorateCode($('#chat'));$('#chat').scrollTop=$('#chat').scrollHeight;
}
async function ask(event){event?.preventDefault();if(busy)return;const question=$('#question').value.trim();if(!question){$('#question').focus();return;}const mode=$('#answer-mode').value;if(mode==='ai'&&!status.configured){openSettings();toast('先连接 API，或选择“教材检索”。');return;}
  const lessonId=current?.id||'',savedQuote=quote;
  const history=state.chat.filter(m=>m.role==='user'||m.mode==='ai').slice(-6).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content}));
  state.chat.push({role:'user',content:question,lessonId,quote:savedQuote,time:Date.now()});state.chat=state.chat.slice(-60);persist();chatRender();$('#question').value='';busy=true;$('#send').disabled=true;$('#clear-chat').disabled=true;
  const pending=document.createElement('div');pending.className='message';pending.id='pending';pending.textContent=mode==='ai'?'正在请你的模型讲解…':'正在查找教材原文…';$('#chat').append(pending);$('#chat').scrollTop=$('#chat').scrollHeight;
  try{const data=await api('/api/ask',{question,lessonId,quote:savedQuote,mode,history});state.chat.push({role:'assistant',mode:data.mode,content:data.answer,sources:data.sources,lessonId,time:Date.now()});if(mode==='ai')$('#api-status').textContent='AI 已连接 · '+status.model;}
  catch(e){state.chat.push({role:'assistant',mode:'error',content:e.message,lessonId,time:Date.now()});}
  finally{state.chat=state.chat.slice(-60);busy=false;$('#send').disabled=false;$('#clear-chat').disabled=false;persist();chatRender();}
}
async function refreshStatus(){status=await api('/api/status');$('#api-status').textContent=status.configured?'已配置 · 待提问验证 · '+status.model:'未配置 API · 可以使用教材检索';}
function openSettings(){ $('#api-url').value=status.url||'';$('#api-model').value=status.model||'';$('#api-protocol').value=status.protocol||'responses';$('#api-key').value='';$('#settings-feedback').textContent='';$('#settings-dialog').showModal();}
function search(){const query=$('#search-input').value.trim().toLowerCase();if(!query){$('#search-results').innerHTML='<div class="empty">输入一个概念、命令或错误关键词，搜索全部小节。</div>';return;}const tokens=query.match(/[a-z0-9_.+-]+|[\u4e00-\u9fff]{1,}/g)||[query];const found=lessons.map(l=>({l,score:tokens.reduce((n,t)=>n+(l.title.toLowerCase().includes(t)?8:0)+(l.text.toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,30);$('#search-results').innerHTML=found.length?found.map(({l})=>{const t=l.text.replace(/[#*`|]/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'');const ix=Math.max(0,t.toLowerCase().indexOf(tokens.find(k=>t.toLowerCase().includes(k))||query)-35);return `<a class="search-result" href="#${l.id}"><strong>${esc(l.title)}</strong><small>${esc(course.chapters.find(c=>c.id===l.chapterId).short)}</small><p>${esc(t.slice(ix,ix+150))}…</p></a>`;}).join(''):'<div class="empty">没有找到，试试更短的术语，例如 V4L2、NV12 或丢帧。</div>';}
function openSearch(){$('#search-dialog').showModal();search();$('#search-input').focus();}
function exportState(){download('RK3588-学习记录-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),...state},null,2));toast('学习记录已导出，不包含 API 密钥。');}
function validateImport(data){if(!data||data.version!==1||!Array.isArray(data.completed)||!data.notes||typeof data.notes!=='object')throw Error('这不是支持的学习记录文件。');const ids=new Set(lessons.map(l=>l.id)),notes={};for(const [id,text]of Object.entries(data.notes)){if(ids.has(id)&&typeof text==='string'&&text.length<=60000)notes[id]=text;}const completed=data.completed.filter(id=>ids.has(id));const quiz={};for(const [id,n]of Object.entries(data.quiz||{}))if(quizzes[id]&&Number.isInteger(n)&&n>=0&&n<=2)quiz[id]=n;const chat=(Array.isArray(data.chat)?data.chat:[]).slice(-60).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=60000).map(m=>({role:m.role,mode:['ai','local','error'].includes(m.mode)?m.mode:'local',content:m.content,lessonId:ids.has(m.lessonId)?m.lessonId:'',time:Number(m.time)||Date.now(),sources:Array.isArray(m.sources)?m.sources.filter(s=>s&&ids.has(s.id)&&typeof s.title==='string').map(s=>({id:s.id,title:s.title.slice(0,200),excerpt:typeof s.excerpt==='string'?s.excerpt.slice(0,900):''})):[]}));return {completed,notes,quiz,chat,last:ids.has(data.last)?data.last:''};}

async function init(){
  const r=await fetch('/course.json');if(!r.ok)throw Error('教材数据读取失败。');course=await r.json();lessons=course.chapters.flatMap(c=>c.lessons);
  try{state={...state,...validateImport({version:1,...state})};}catch{state={completed:[],notes:{},last:'',chat:[],quiz:{}};}
  navigation();render();chatRender();
  try{await refreshStatus();if(status.configured)$('#answer-mode').value='ai';}catch(e){$('#api-status').textContent=e.message;}
  window.addEventListener('hashchange',render);
  document.addEventListener('click',async e=>{
    const close=e.target.closest('[data-close]');if(close)$('#'+close.dataset.close).close();
    if(e.target.closest('.search-result'))$('#search-dialog').close();
    const img=e.target.closest('.article img');if(img){$('#figure-large').src=img.src;$('#figure-large').alt=img.alt;$('#figure-caption').textContent=img.alt;$('#figure-dialog').showModal();}
    if(e.target.id==='complete'&&current){state.completed=state.completed.includes(current.id)?state.completed.filter(id=>id!==current.id):[...state.completed,current.id];persist();const y=scrollY;render();window.scrollTo(0,y);}
    if(['ask-current','ask-lab'].includes(e.target.id)){showAssistant();$('#question').value=e.target.id==='ask-lab'?'带我做这一节的实验，先说明前提、每一步目的和验收方法。':'请用零基础能理解的话解释这一节，给一个具体例子。';$('#question').focus();}
    if(e.target.id==='copy-context'){try{await navigator.clipboard.writeText(`RK3588 学习站\n${current.title}\n${location.href}\n板卡：正点原子 RK3588；摄像头、准确内核/SDK 待确认。`);toast('已复制小节信息。');}catch{toast('无法复制，请手动复制页面地址。');}}
    const q=e.target.closest('[data-quiz]');if(q){state.quiz[q.dataset.quiz]=Number(q.dataset.option);persist();showQuiz(q.dataset.quiz,Number(q.dataset.option));}
    const prompt=e.target.closest('[data-prompt]');if(prompt){$('#question').value=prompt.dataset.prompt;$('#question').focus();}
    if(e.target.id==='welcome-settings')openSettings();
    if(e.target.id==='export-state')exportState();
    if(e.target.id==='import-state')$('#import-file').click();
    if(e.target.id==='export-notes'){const text='# RK3588 学习笔记\n\n'+Object.entries(state.notes).filter(([id,t])=>t.trim()).map(([id,t])=>'## '+(lessons.find(l=>l.id===id)?.title||id)+'\n\n'+t).join('\n\n');download('RK3588-学习笔记.md',text,'text/markdown;charset=utf-8');}
  });
  document.addEventListener('input',e=>{if(e.target.id==='lesson-note'&&current){state.notes[current.id]=e.target.value;persist();updateProgress();$('#note-status').textContent='已保存到当前浏览器 · '+new Date().toLocaleTimeString();}if(e.target.matches('[data-calc]'))calculate();});
  $('#assistant-open').onclick=showAssistant;$('#assistant-close').onclick=()=>{document.body.classList.remove('chat-open');document.body.classList.add('assistant-hidden');};
  $('#menu').onclick=()=>document.body.classList.toggle('menu-open');$('#scrim').onclick=()=>document.body.classList.remove('menu-open','chat-open');
  $('#settings-open').onclick=openSettings;$('#search-open').onclick=openSearch;$('#search-input').oninput=search;
  $('#clear-quote').onclick=clearQuote;$('#ask-form').onsubmit=ask;
  $('#question').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ask();}});
  $('#clear-chat').onclick=()=>{state.chat=[];persist();chatRender();};
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!$('dialog[open]')){e.preventDefault();openSearch();}});
  document.addEventListener('selectionchange',()=>{const sel=window.getSelection();const article=$('#lesson-article');if(!article||!sel.rangeCount){$('#selection-bar').hidden=true;return;}const range=sel.getRangeAt(0);if(article.contains(range.commonAncestorContainer)&&sel.toString().trim().length>1){selectedText=sel.toString().trim();$('#selection-bar').hidden=false;}else if(!sel.toString().trim())$('#selection-bar').hidden=true;});
  $('#ask-selection').onpointerdown=e=>e.preventDefault();$('#ask-selection').onclick=()=>{useQuote(selectedText);showAssistant();$('#question').value='请解释我选中的这段文字，并联系 RK3588 开发举例。';$('#question').focus();};
  $('#settings-form').onsubmit=async e=>{e.preventDefault();const submit=e.submitter;submit.disabled=true;try{const data=await api('/api/config',{url:$('#api-url').value,model:$('#api-model').value,protocol:$('#api-protocol').value,key:$('#api-key').value});$('#api-key').value='';await refreshStatus();$('#answer-mode').value='ai';$('#settings-feedback').textContent='设置已保存。实际请求地址：'+data.endpoint+'。可以关闭设置并提问验证连接。';toast('API 已配置，首次提问将验证连接。');}catch(err){$('#settings-feedback').textContent=err.message;}finally{submit.disabled=false;}};
  $('#settings-dialog').addEventListener('close',()=>$('#api-key').value='');
  $('#clear-api').onclick=async()=>{try{await api('/api/clear',{});await refreshStatus();$('#api-key').value='';$('#api-url').value='';$('#api-model').value='';$('#answer-mode').value='local';$('#settings-feedback').textContent='已断开，服务内存中的连接配置与密钥已清除。';}catch(e){$('#settings-feedback').textContent=e.message;}};
  $('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('文件过大，请选择本站导出的学习记录。');const data=validateImport(JSON.parse(await file.text()));state.completed=[...new Set([...state.completed,...data.completed])];Object.assign(state.notes,data.notes);Object.assign(state.quiz,data.quiz);if(!state.chat.length)state.chat=data.chat;if(data.last)state.last=data.last;persist();render();chatRender();toast('学习记录已导入并合并。');}catch(err){toast(err.message||'导入失败，请检查文件。');}finally{e.target.value='';}};
}
init().catch(e=>{$('#main').innerHTML=`<section class="panel"><h1>暂时无法加载学习站</h1><p>${esc(e.message)}</p><p>请运行“启动学习网站.ps1”，再打开本机地址。完整教材仍可通过目录中的 index.html 阅读。</p></section>`;});
