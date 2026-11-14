const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {webkit} = require(process.env.PLAYWRIGHT_MODULE || '/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
const root = path.resolve(__dirname, '../../web-extension/content');
(async () => {
 const browser = await webkit.launch();
 try {
 const page = await browser.newPage(process.env.MOBILE ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {viewport:{width:1000,height:800}});
 const errors=[]; page.on('pageerror', e=>errors.push(String(e))); page.on('console', m=>{if(m.type()==='error')errors.push(m.text())});
 await page.addInitScript(() => {
   window.__listeners=[];
   window.browser={storage:{local:{get:async()=>({swarmEnabled:true})}},runtime:{sendMessage:(m,cb)=>{const s={agents:100,autoAgents:false,speed:3,sound:false,enabled:true}; if(cb)cb(s); return Promise.resolve(s)},onMessage:{addListener:f=>window.__listeners.push(f)}}};
 });
 await page.addInitScript({content:fs.readFileSync(path.join(root,'mask.js'),'utf8')});
 await page.goto('data:text/html,'+encodeURIComponent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px}p{display:inline-block;width:40px;height:22px;margin:3px;font-size:9px}#popup{position:fixed;top:50px;left:50px} .hidden{display:none}#below{position:absolute;top:2000px}.panel{background:#ddd;padding:10px}#scroller{height:80px;overflow:auto}</style><div class="panel" id="first"><h1>标题完整显示</h1>${Array.from({length:160},(_,i)=>`<p>内容 ${i}</p>`).join('')}</div><div id="below">下方内容</div><div id="popup" class="hidden">弹窗文字</div><div style="opacity:0" id="authorHidden">不得显示</div>`));
 await page.evaluate(() => {
   const mask=window.__swarmMask, commit=mask.commit;
   window.__commits=[]; window.__violations=[];
   mask.commit=function(token){
     const E=window.__swarmRebuild?.app?.engine;
     const owner=E?.cursors.find(c=>c.task?.spec.it?.nativeTokens?.includes(token)||(c.task?.spec.type==='dup'&&c.task.spec.g.dst[c.task.spec.k].items.some(it=>it.nativeTokens?.includes(token))));
     if(!owner) window.__violations.push('commit without cursor');
     const ok=commit(token);
     if(ok) window.__commits.push({text:token.record.el.textContent.slice(0,40),value:token.record.el.value,cursor:owner?.id});
     return ok;
   };
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'swarm.js'),'utf8')});
 await page.waitForFunction(()=>window.__swarmRebuild?.app?.engine?.started);
 await page.waitForFunction(()=>document.querySelector('h1').classList.contains('__swarm-drawn'),{},{timeout:20000});
 assert.equal(await page.evaluate(()=>window.__swarmRebuild.app.engine.cursors.length),100);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('h1')).visibility),'visible');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#authorHidden')).opacity),'0');
 await page.waitForFunction(()=>window.__swarmRebuild.app.complete,{},{timeout:30000}).catch(async err=>{
 console.log('DEBUG',await page.evaluate(()=>{const E=window.__swarmRebuild.app.engine;return {stats:__swarmStats,wait:E.waitCount,flocking:E.flocking,active:E.cursors.filter(c=>c.task).map(c=>({id:c.id,el:c.task.spec.token?.record.el.outerHTML.slice(0,120),version:c.task.spec.token?.record.version})),pending:E.tasks.filter(t=>t.state==='wait').slice(0,8).map(t=>t.spec.token?.record.el.outerHTML.slice(0,120))}}));throw err;});
 const rendered = await page.evaluate(()=>{const a=window.__swarmRebuild.app;return {hostVisibility:getComputedStyle(a.view.host).visibility, count:a.view.cursorEls.size, visible:[...a.view.cursorEls.values()].filter(el=>getComputedStyle(el).visibility==='visible' && Number(getComputedStyle(el).opacity)>0).length}});
 assert.equal(rendered.hostVisibility,'visible');assert.equal(rendered.count,100);assert.equal(rendered.visible,100);
 console.log('PASS initial content and idle, 100 actual rendered and working cursors');
 await page.evaluate(()=>{ document.querySelector('#popup').classList.remove('hidden'); });
 await page.waitForFunction(()=>document.querySelector('#popup').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS existing popup becomes visible through cursor task after idle');
 await page.evaluate(()=>{const d=document.createElement('section'); d.id='new';d.innerHTML='<h2>新弹窗标题</h2><ul><li>新列表第一项</li><li>新列表第二项</li></ul>';d.style='position:fixed;top:90px;left:40px';document.body.prepend(d);});
 await page.waitForFunction(()=>[...document.querySelectorAll('#new,#new *')].every(e=>e.classList.contains('__swarm-drawn')),{},{timeout:15000});
 console.log('PASS inserted popup subtree, all list items complete');
 await page.evaluate(()=>{document.querySelector('#new h2').firstChild.data='更新后的文字';});
 await page.waitForFunction(()=>!document.querySelector('#new h2').classList.contains('__swarm-drawn'));
 await page.waitForFunction(()=>document.querySelector('#new h2').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS changed text invalidates old completion');
 await page.evaluate(()=>scrollTo(0,1800));
 await page.waitForFunction(()=>document.querySelector('#below').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS scrolling discovers and draws below-fold content');
 await page.evaluate(()=>{const host=document.createElement('aside');host.id='shadow';host.attachShadow({mode:'open'}).innerHTML='<span>Shadow 新内容</span>';document.body.append(host);host.scrollIntoView();});
 await page.waitForFunction(()=>document.querySelector('#shadow').shadowRoot.querySelector('span').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS open shadow root');
 await page.evaluate(()=>{
   const panel=document.createElement('div');panel.id='nested';panel.style='position:fixed;top:200px;left:20px;height:60px;width:200px;overflow:auto;background:white';
   panel.innerHTML=Array.from({length:20},(_,i)=>`<div style="height:30px" id="nested-${i}">滚动列表 ${i}</div>`).join('');document.body.append(panel);
 });
 await page.waitForFunction(()=>document.querySelector('#nested-0').classList.contains('__swarm-drawn'),{},{timeout:15000});
 assert.equal(await page.evaluate(()=>document.querySelector('#nested-19').classList.contains('__swarm-drawn')),false);
 await page.evaluate(()=>document.querySelector('#nested').scrollTop=1000);
 await page.waitForFunction(()=>document.querySelector('#nested-19').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS nested overflow scroller: clipped rows wait for scrolling');
 await page.evaluate(()=>{
   const input=document.createElement('input');input.id='field';input.value='旧值';input.style='position:fixed;top:300px';document.body.append(input);
 });
 await page.waitForFunction(()=>document.querySelector('#field').classList.contains('__swarm-drawn'),{},{timeout:15000});
 const commitsBefore=await page.evaluate(()=>__commits.filter(c=>c.value==='旧值').length);
 await page.evaluate(()=>document.querySelector('#field').value='程序更新的新值');
 await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(()=>document.querySelector('#field').classList.contains('__swarm-drawn')),true);
 assert.equal(await page.evaluate(()=>__commits.filter(c=>c.value==='程序更新的新值').length),0);
 console.log('PASS input value changes stay native without replaying appearance');
 await page.evaluate(()=>{
   const img=document.createElement('img');img.id='late-image';img.style='position:fixed;top:350px;width:50px;height:50px';document.body.append(img);
 });
 await page.waitForTimeout(800);
 assert.equal(await page.evaluate(()=>document.querySelector('#late-image').classList.contains('__swarm-drawn')),false);
 await page.evaluate(()=>document.querySelector('#late-image').src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="red"/></svg>');
 await page.waitForFunction(()=>document.querySelector('#late-image').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS image layout placeholder waits for decoded image');
 await page.evaluate(()=>{
   __listeners.forEach(f=>f({type:'SWARM_CONFIG_UPDATE',payload:{agents:6,autoAgents:false,speed:3}}));
   const panel=document.createElement('div');panel.id='burst';panel.style='position:fixed;top:430px;left:20px';
   panel.innerHTML=Array.from({length:50},(_,i)=>`<span style="display:inline-block">连续新增 ${i}</span>`).join('');document.body.append(panel);
 });
 await page.waitForFunction(()=>window.__swarmRebuild.app.engine.cursors.length===6,{},{timeout:20000});
 await page.waitForFunction(()=>[...document.querySelectorAll('#burst span')].every(el=>el.classList.contains('__swarm-drawn')),{},{timeout:30000});
 console.log('PASS 50 queued items with 6 workers, no dropped busy work');
 await page.evaluate(()=>{
   const el=document.createElement('div');el.id='contents';el.style='display:contents';el.textContent='无实体框的文字';
   const wrap=document.createElement('div');wrap.style='position:fixed;top:100px;left:20px';wrap.append(el);document.body.append(wrap);
 });
 await page.waitForFunction(()=>document.querySelector('#contents').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS display:contents text has a Range-based drawing job');
 await page.evaluate(()=>{
   const E=window.__swarmRebuild.app.engine;window.__savedStep=E.step;E.step=()=>{};
   const el=document.createElement('div');el.id='frozen';el.style='position:fixed;top:30px;left:20px';el.textContent='必须等游标完成';document.body.append(el);
 });
 await page.waitForTimeout(2800);
 assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('#frozen')).maskImage),/gradient/);
 await page.evaluate(()=>window.__swarmRebuild.app.engine.step=window.__savedStep);
 await page.waitForFunction(()=>document.querySelector('#frozen').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS no timed release while all cursor work is paused');
 const result=await page.evaluate(()=>({violations:__violations,workers:new Set(__commits.map(c=>c.cursor)).size,commits:__commits.length}));
 assert.deepEqual(result.violations,[]); assert.equal(result.workers,100,JSON.stringify(result));
 await page.evaluate(()=>__listeners.forEach(f=>f({type:'swarm:enabled',enabled:false})));
 assert.equal(await page.evaluate(()=>window.__swarmRebuild.app),null);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('__swarm-hiding')),false);
 await page.evaluate(()=>__listeners.forEach(f=>f({type:'swarm:enabled',enabled:true})));
 await page.waitForFunction(()=>window.__swarmRebuild.app?.engine?.started);
 await page.waitForFunction(()=>document.querySelector('#field').classList.contains('__swarm-drawn'),{},{timeout:15000});
 await page.keyboard.press('Escape');
 assert(await page.evaluate(()=>!!window.__swarmRebuild.app));
 await page.goto('data:text/html,<meta name="viewport" content="width=device-width,initial-scale=1"><h1>短页面</h1>');
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'swarm.js'),'utf8')});
 await page.waitForFunction(()=>document.querySelector('h1').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS Escape passthrough and no-scroll page startup');
 assert.deepEqual(errors,[]);
 console.log('PASS toolbar OFF/ON; every commit owned by active cursor',JSON.stringify(result));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
