const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require('/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
const code=n=>fs.readFileSync(path.resolve(__dirname,'../../web-extension/content/'+n+'.js'),'utf8');
(async()=>{const b=await webkit.launch();try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{window.__listeners=[];window.browser={runtime:{sendMessage:(m,cb)=>new Promise(resolve=>setTimeout(()=>{const s={enabled:false,enabledUpdatedAt:10,sound:false};cb?.(s);resolve(s)},350)),onMessage:{addListener:f=>__listeners.push(f)}},storage:{local:{get:async k=>({[k]:k==='swarmEnabled'?false:10})}}};});
 await p.addInitScript({content:code('mask')});
 await p.goto('data:text/html,<h1>Normal page</h1>');
 for(let i=0;i<3;i++){
  if(i)await p.reload();
  await p.addScriptTag({content:code('swarm')});
  for(const delay of [20,600,1500]){await p.waitForTimeout(delay);const s=await p.evaluate(()=>({host:document.querySelectorAll('swarm-rebuild,[data-swarm-host]').length,app:!!__swarmRebuild.app,hidden:document.documentElement.classList.contains('__swarm-hiding'),mask:getComputedStyle(document.body).maskImage}));assert.deepEqual(s,{host:0,app:false,hidden:false,mask:'none'});}
 }
 console.log('PASS OFF cold load and 3 refreshes: no cursor host, app, page mask or delayed resurrection');
 const q=await b.newPage();q.on('pageerror',e=>errors.push(String(e)));
 await q.addInitScript(()=>{window.__listeners=[];window.__calls=0;window.__revision=10;window.browser={runtime:{sendMessage:(m,cb)=>{__calls++;if(__calls===2)return new Promise(resolve=>{window.__release=()=>{const s={enabled:true,enabledUpdatedAt:10,sound:false};cb?.(s);resolve(s)}});const s={enabled:true,enabledUpdatedAt:__revision,sound:false};cb?.(s);return Promise.resolve(s)},onMessage:{addListener:f=>__listeners.push(f)}},storage:{local:{get:async()=>({})}}};});
 await q.addInitScript({content:code('mask')});await q.goto('data:text/html,<h1>Lifecycle test</h1>');await q.addScriptTag({content:code('swarm')});
 await q.waitForFunction(()=>__calls===2 && __swarmRebuild.app && !__swarmRebuild.app.view);
 await q.evaluate(()=>{__listeners.forEach(f=>f({type:'swarm:enabled',enabled:false,revision:20}));__release();});
 await q.waitForTimeout(1700);assert.equal(await q.evaluate(()=>document.querySelectorAll('swarm-rebuild').length),0);assert.equal(await q.evaluate(()=>!!__swarmRebuild.app),false);
 console.log('PASS OFF during async startup cancels safely; stale ON response cannot create cursors');
 await q.evaluate(()=>{__revision=30;__listeners.forEach(f=>f({type:'swarm:enabled',enabled:true,revision:30}));});
 await q.waitForFunction(()=>__swarmRebuild.app?.engine.started,{},{timeout:10000});
 await q.waitForFunction(()=>document.querySelector('h1').classList.contains('__swarm-drawn'),{},{timeout:15000});
 await q.evaluate(()=>__listeners.forEach(f=>f({type:'swarm:enabled',enabled:false,revision:40})));
 assert.equal(await q.evaluate(()=>document.querySelectorAll('swarm-rebuild').length),0);
 assert.deepEqual(errors,[]);console.log('PASS ON still animates; OFF immediately removes the active cursor layer');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
