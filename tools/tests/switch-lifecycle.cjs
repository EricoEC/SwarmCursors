const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const p=await browser.newPage();
 await p.goto('data:text/html,<p>开关初始化竞态</p>');
 await p.evaluate(()=>{
   window.__listeners=[];
   window.browser={
     runtime:{sendMessage:()=>new Promise(resolve=>window.__resolveSettings=resolve),onMessage:{addListener:f=>__listeners.push(f)}},
     storage:{local:{get:()=>new Promise(()=>{})}}
   };
 });
 await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../web-extension/content/mask.js'),'utf8')});
 await p.evaluate(()=>{for(const f of __listeners)f({type:'swarm:enabled',enabled:false,revision:20});for(const f of __listeners)f({type:'swarm:enabled',enabled:true,revision:30});__resolveSettings({enabled:false,enabledUpdatedAt:10});});
 await p.waitForTimeout(30);assert.equal(await p.evaluate(()=>__swarmMask.alive),true);
 await p.evaluate(()=>{for(const f of __listeners)f({type:'swarm:enabled',enabled:false,revision:20})});
 assert.equal(await p.evaluate(()=>__swarmMask.alive),true);
 await p.evaluate(()=>{for(const f of __listeners)f({type:'swarm:enabled',enabled:false,revision:40});document.body.innerHTML='<section><p>关闭时不扫描、不遮罩</p></section>';});
 assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('__swarm-hiding')),false);
 assert.equal(await p.evaluate(()=>__swarmMask.collect().length),0);
 await p.evaluate(()=>{for(const f of __listeners)f({type:'swarm:enabled',enabled:true,revision:50})});
 assert(await p.evaluate(()=>__swarmMask.collect().length>0));
 console.log('PASS stale startup/read/broadcast cannot undo latest switch; OFF stops collection, ON reattaches');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
