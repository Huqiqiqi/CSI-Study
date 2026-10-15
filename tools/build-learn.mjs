import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dependency} from './dependencies.mjs';
const {marked}=dependency('marked');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
fs.mkdirSync(path.join(root,'learn'),{recursive:true});
const short=['开始之前','视频输入与采集','驱动与底层处理','处理框架与编码','封装与本地存储','流媒体与网页播放','远程分发与安全','解码与硬件加速','显示与音画同步','多路 CSI 与 AI','实验手册与排错','资料与适用范围'];
const chapters=fs.readdirSync(path.join(root,'chapters')).filter(f=>f.endsWith('.md')).sort().map((file,i)=>{
  const md=fs.readFileSync(path.join(root,'chapters',file),'utf8');
  const tokens=marked.lexer(md), title=tokens[0].text;
  let groups=[], current={title:'导读',raw:''};
  for(const token of tokens.slice(1)){
    if(token.type==='heading'&&token.depth===2){if(current.raw.trim())groups.push(current);current={title:token.text,raw:''};}
    else current.raw+=token.raw;
  }
  if(current.raw.trim())groups.push(current);
  return {id:`ch${i}`,number:i,title,short:short[i],file,lessons:groups.map((g,j)=>{
    let html=marked.parse(g.raw);
    html=html.replace(/src="assets\//g,'src="/assets/').replace(/href="(examples|templates)\//g,'href="/files/$1/');
    html=html.replace(/<table>/g,'<div class="table-wrap"><table>').replace(/<\/table>/g,'</table></div>');
    html=html.replace(/<a href="https?:[^\"]*"/g,m=>m+' target="_blank" rel="noopener noreferrer"');
    return {id:`ch${i}-s${j}`,chapterId:`ch${i}`,title:g.title,html,text:g.raw,minutes:Math.max(2,Math.ceil(g.raw.length/450))};
  })};
});
const data={version:1,updated:'2026-10-15',title:'RK3588 视频开发学习站',chapters};
fs.writeFileSync(path.join(root,'learn','course.json'),JSON.stringify(data));
console.log(JSON.stringify({chapters:chapters.length,lessons:chapters.reduce((n,c)=>n+c.lessons.length,0),sourceCharacters:chapters.flatMap(c=>c.lessons).reduce((n,l)=>n+l.text.length,0)}));
