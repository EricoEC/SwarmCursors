const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const p=await browser.newPage({viewport:{width:1000,height:800}});
 await p.addInitScript(()=>{
   window.browser={runtime:{sendMessage:(m,cb)=>{const s={agents:6,autoAgents:false,speed:1,sound:false,enabled:true};cb?.(s);return Promise.resolve(s)},onMessage:{addListener(){}}},storage:{local:{get:async()=>({swarmEnabled:true})}}};
 });
 await p.goto('data:text/html,'+encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{height:4000px}#panel{position:fixed;top:80px;left:100px;width:700px;height:600px;overflow:auto}#pad{height:150px}#target{height:60px;font-size:24px}#tail{height:1500px}</style><section id="panel"><div id="pad"></div><p id="target">滚动时这行文字和正在工作的游标必须同步移动</p><div id="tail"></div></section>'));
 const root=path.resolve(__dirname,'../../web-extension/content');
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'mask.js'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'swarm.js'),'utf8')});
 await p.waitForFunction(()=>__swarmRebuild.app?.engine?.cursors.some(c=>c.task?.spec.it?.nativeSource?.id==='target' && c.shape==='ibeam'),{},{timeout:15000});
 const check=await p.evaluate(()=>{
   const E=__swarmRebuild.app.engine,el=document.querySelector('#target');
   const c=E.cursors.find(c=>c.task?.spec.it?.nativeSource===el),step=E.step;
   // Keep generator progress at zero: isolate attachment from authored motion.
   const offset=()=>{const b=el.getBoundingClientRect(),s=E.scr(c);return{x:s.x-b.left,y:s.y-b.top}};
   const ob=c.ov()[0].b, rb=el.getBoundingClientRect();const overlayBefore={x:ob.x+(c.sticky?0:-E.vp.sx+E.vp.ox)-rb.left,y:ob.y+(c.sticky?0:-E.vp.sy+E.vp.oy)-rb.top};
   const before=offset();document.querySelector('#panel').scrollTop+=55;
   __swarmMask.beginFrame(-1);step.call(E,0);const after=offset();
   const nestedError=Math.hypot(before.x-after.x,before.y-after.y);
   const fixedBefore=offset();window.scrollTo(0,100);
   __swarmMask.beginFrame(-2);step.call(E,0);const fixedAfter=offset();
   const fixedError=Math.hypot(fixedBefore.x-fixedAfter.x,fixedBefore.y-fixedAfter.y);
   const transformBefore=offset();document.querySelector('#panel').style.transform='translate(35px,25px)';
   __swarmMask.beginFrame(-3);step.call(E,0);const transformAfter=offset();
   const transformError=Math.hypot(transformBefore.x-transformAfter.x,transformBefore.y-transformAfter.y);
   const box=c.ov()[0].b,r=el.getBoundingClientRect();
   const overlayError=Math.hypot(box.x+(c.sticky?0:-E.vp.sx+E.vp.ox)-r.left-overlayBefore.x,box.y+(c.sticky?0:-E.vp.sy+E.vp.oy)-r.top-overlayBefore.y);
   return {nestedError,fixedError,transformError,overlayError};
 });
 for(const [name,error] of Object.entries(check))assert(error<.1,`${name}: ${error}`);
 console.log('PASS active text cursor and box track inner scroll, fixed panel page scroll, and panel movement without drift');
 await p.waitForFunction(()=>document.querySelector('#target').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS anchored gesture still completes its original task');
 await p.evaluate(()=>{const el=document.createElement('input');el.id='field';el.style='position:absolute;top:280px;left:10px;width:500px;height:50px';document.querySelector('#panel').append(el)});
 await p.waitForFunction(()=>__swarmRebuild.app.engine.cursors.some(c=>c.task?.spec.it?.nativeSource?.id==='field' && c.shape==='cross'),{},{timeout:15000});
 const inputError=await p.evaluate(()=>{
   const E=__swarmRebuild.app.engine,el=document.querySelector('#field'),c=E.cursors.find(c=>c.task?.spec.it?.nativeSource===el);
   const offset=()=>{const b=el.getBoundingClientRect(),s=E.scr(c);return {x:s.x-b.left,y:s.y-b.top}};
   const a=offset();document.querySelector('#panel').scrollTop+=30;
   __swarmMask.beginFrame(-4);E.step(0);const b=offset();return Math.hypot(a.x-b.x,a.y-b.y);
 });
 assert(inputError<.1,`input drift: ${inputError}`);
 await p.waitForFunction(()=>document.querySelector('#field').classList.contains('__swarm-drawn'),{},{timeout:15000});
 console.log('PASS input appearance cursor stays attached during nested scroll');

}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
