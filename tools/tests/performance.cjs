const fs=require('fs'),path=require('path');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const p=await browser.newPage({viewport:{width:1000,height:800}});
 await p.addInitScript(()=>{window.browser={runtime:{sendMessage:(m,cb)=>{const s={agents:100,autoAgents:false,speed:3,sound:false,enabled:true};cb?.(s);return Promise.resolve(s)},onMessage:{addListener(){}}},storage:{local:{get:async()=>({swarmEnabled:true})}}};window.__styleReads=0;const original=getComputedStyle;window.getComputedStyle=(...a)=>{__styleReads++;return original(...a)}});
 await p.goto('data:text/html,'+encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>p{margin:0;height:8px;font-size:7px}</style>'+Array.from({length:Number(process.env.NODES)||3000},(_,i)=>`<p>文字 ${i}</p>`).join('')));
 const root=path.resolve(__dirname,'../../web-extension/content');
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'mask.js'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'swarm.js'),'utf8')});
 await p.waitForFunction(()=>window.__swarmRebuild?.app?.engine?.started);
 await p.evaluate(()=>{const E=__swarmRebuild.app.engine,step=E.step;window.__steps=[];window.__collects=[];const collect=__swarmMask.collect;__swarmMask.collect=function(){const t=performance.now();try{return collect()}finally{__collects.push(performance.now()-t)}};window.__styleReads=0;E.step=function(dt){const t=performance.now();try{return step.call(this,dt)}finally{__steps.push(performance.now()-t)}}});
 await p.waitForTimeout(4000);
 console.log(JSON.stringify(await p.evaluate(()=>{const s=__steps.sort((a,b)=>a-b);return {nodes:document.querySelectorAll('p').length,workers:__swarmRebuild.app.engine.cursors.length,frames:s.length,stepP95Ms:s[Math.floor(s.length*.95)],stepMaxMs:s.at(-1),styleReads:__styleReads,collectMs:__collects}})));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
