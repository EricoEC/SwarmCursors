const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require('/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:800},...(process.env.RECORD?{recordVideo:{dir:'/tmp/swarm-fidelity-record',size:{width:1200,height:800}}}:{})});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{let seed=1234;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);window.browser={runtime:{sendMessage:(m,cb)=>{const r={agents:8,autoAgents:false,speed:1,sound:false,enabled:true};cb?.(r);return Promise.resolve(r)},onMessage:{addListener(){}}},storage:{local:{get:async()=>({})}}};});
 const svg=i=>`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="70"><rect width="90" height="70" fill="${['red','blue','green','orange','pink','purple'][i]}"/></svg>`;
 const html='<meta charset="utf-8"><style>body{margin:30px;font:16px sans-serif}.row{display:flex;gap:12px}.card{width:120px;background:#eee;border:1px solid #aaa;padding:8px}.chip{display:inline-flex;gap:8px;align-items:center;border:1px solid #aaa;background:#ddd;border-radius:20px;padding:12px}.chip svg{width:20px;height:20px}#suggestions{position:fixed;top:440px;left:30px}#author{visibility:hidden}</style><div class="row">'+Array.from({length:6},(_,i)=>`<article class="card"><img width="90" height="70" src="data:image/svg+xml,${encodeURIComponent(svg(i))}"><p>图片标题 ${i}</p></article>`).join('')+'</div><div class="row">'+Array.from({length:4},(_,i)=>`<button class="chip"><svg viewBox="0 0 20 20"><path d="M0 0 L${12+i} 0 L10 20Z" fill="blue"/></svg><span>按钮文字 ${i}</span></button>`).join('')+'</div><input id="input"><section id="suggestions" hidden></section><p id="author">原生隐藏</p>';
 fs.writeFileSync('/tmp/swarm-fidelity-fixture.html',html);
 await p.goto('data:text/html,'+encodeURIComponent(html));
 for(const n of ['mask','swarm'])await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../web-extension/content/'+n+'.js'),'utf8')});
 await p.waitForFunction(()=>__swarmRebuild.app?.engine);
 await p.evaluate(()=>{window.__stages={grow:false,type:false,moveCopy:false,selectAll:false,edit:false};window.__kinds={};window.__seen=new Set();const tick=()=>{const E=__swarmRebuild.app?.engine;if(E){for(const t of E.tasks)if(!__seen.has(t.id)){__seen.add(t.id);__kinds[t.spec.type]=(__kinds[t.spec.type]||0)+1;}for(const it of E.items||[]){if(it.draw?.w>0&&it.draw.w<it.w)__stages.grow=true;if(it.kind==='text'&&it.shown>0&&it.shown<it.total&&it.live.textContent.length<it.full.textContent.length)__stages.type=true;if(it.mode==='master'&&(Math.abs(it.dx)>1||Math.abs(it.dy)>1)&&it.node?.isConnected&&it.vis)__stages.moveCopy=true;if(it.selAll)__stages.selectAll=true;if(it.editTask&&it.mode==='own'&&it.shown>0&&it.shown<it.total)__stages.edit=true;} }window.__watch=requestAnimationFrame(tick)};tick();});
 await p.waitForFunction(()=>__swarmRebuild.app.complete,{},{timeout:30000});
 const result=await p.evaluate(()=>({stages:__stages,kinds:__kinds,pending:document.querySelectorAll('[data-swarm-pending]').length,hidden:getComputedStyle(document.querySelector('#author')).visibility}));
 console.log(JSON.stringify(result));for(const k of ['grow','type','moveCopy','selectAll','edit'])assert.equal(result.stages[k],true,k);
 for(const kind of ['dup','swap','edit'])assert(result.kinds[kind]>0,kind);assert.equal(result.kinds.dup,8);assert.equal(result.kinds.swap,8);
 assert.equal(result.hidden,'hidden');
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.chip,.chip *,.card,.card *')].every(el=>!el.hasAttribute('data-swarm-pending'))),true);
 console.log('PASS original generators: progressive box, character reveal, moving master copy, select-all/edit; SVG buttons and image cards');
 if(process.env.STAGES_ONLY){await p.waitForTimeout(1200);return;}
 // A website inspects authored visibility before supplying suggestion text.
 // Extension masks must not alter that decision, even while the engine pauses.
 await p.evaluate(()=>{const E=__swarmRebuild.app.engine;window.__step=E.step;E.step=()=>{};const list=document.querySelector('#suggestions');list.hidden=false;list.innerHTML='<div class="option"><span></span></div>';});
 await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#suggestions span')).visibility),'visible');
 await p.evaluate(()=>{const s=document.querySelector('#suggestions span');if(getComputedStyle(s).visibility==='visible')s.textContent='网站立即填入的建议文字';__swarmRebuild.app.engine.step=__step;});
 await p.waitForFunction(()=>document.querySelector('#suggestions span').classList.contains('__swarm-drawn'),{},{timeout:12000});
 assert.equal(await p.evaluate(()=>document.querySelector('#suggestions span').hasAttribute('data-swarm-pending')),false);
 console.log('PASS suggestion population based on native visibility completes without hover');
 for(let i=0;i<30;i++){
  await p.evaluate(i=>{const list=document.querySelector('#suggestions');list.hidden=true;list.innerHTML=Array.from({length:4},(_,j)=>`<div class="option"><span>第${i}轮建议${j}</span></div>`).join('');list.hidden=false;},i);
  await p.waitForFunction(()=>[...document.querySelectorAll('#suggestions,#suggestions *')].every(el=>!el.hasAttribute('data-swarm-pending')),{},{timeout:10000});
 }
 assert.deepEqual(errors,[]);console.log('PASS 30 popup replacement cycles, no pointer events, no remaining extension masks');
 await p.screenshot({path:'/tmp/swarm-fidelity-final.png'});
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
