const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const b=await webkit.launch();try{
 const p=await b.newPage();
 await p.addInitScript(()=>{
  window.__cfg={cfg:{minAgents:6,maxAgents:6,flockAgents:6,introAgents:6},speed:1,sound:false,enabled:true,enabledUpdatedAt:10,settingsUpdatedAt:10};
  window.browser={runtime:{sendMessage:(m,cb)=>{const c={...__cfg};cb?.(c);return Promise.resolve(c)},onMessage:{addListener(){}}},storage:{local:{get:async()=>({})}}};
 });
 await p.goto('data:text/html,'+encodeURIComponent('<style>.pane{transition:opacity .05s,visibility .05s}</style><div class="pane">'+Array.from({length:12},(_,i)=>`<p>建议 ${i}</p>`).join('')+'</div>'));
 const r=path.resolve(__dirname,'../../web-extension/content');
 await p.addScriptTag({content:fs.readFileSync(path.join(r,'mask.js'),'utf8')});await p.addScriptTag({content:fs.readFileSync(path.join(r,'swarm.js'),'utf8')});
 await p.waitForFunction(()=>__swarmRebuild.app?.complete,{},{timeout:15000});
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('p')].every(e=>getComputedStyle(e).visibility==='visible')),true);
 console.log('PASS visibility-transition container fully drawn without hover');
 await p.evaluate(()=>__cfg={cfg:{minAgents:9,maxAgents:9,flockAgents:9,introAgents:9},speed:3,sound:false,enabled:false,enabledUpdatedAt:20,settingsUpdatedAt:20});
 await p.waitForFunction(()=>!__swarmRebuild.app,{},{timeout:5000});
 assert.equal(await p.evaluate(()=>__swarmMask.alive),false);
 await p.evaluate(()=>__cfg={...__cfg,enabled:true,enabledUpdatedAt:30});
 await p.waitForFunction(()=>__swarmRebuild.app?.engine?.started,{},{timeout:5000});
 assert.equal(await p.evaluate(()=>__swarmRebuild.app.engine.speed),3);
 assert.equal(await p.evaluate(()=>__swarmRebuild.app.engine.cursors.length),9);
 console.log('PASS polled native settings apply OFF/ON, speed 3 and manual 9 to the running page');
 await p.evaluate(()=>__cfg={...__cfg,cfg:{minAgents:2,maxAgents:16,flockAgents:4,introAgents:4},speed:2,settingsUpdatedAt:40});
 await p.waitForFunction(()=>__swarmRebuild.app.engine.speed===2&&__swarmRebuild.app.engine.cursors.length<=16,{},{timeout:8000});
 await p.waitForFunction(()=>__swarmRebuild.app.complete&&__swarmRebuild.app.engine.cursors.length===4,{},{timeout:12000});
 console.log('PASS manual-to-auto uses adaptive <=16 ceiling and 4 idle cursors');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
