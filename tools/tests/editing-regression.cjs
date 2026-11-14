const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const p=await browser.newPage(process.env.MOBILE ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {viewport:{width:1000,height:800}});
 const errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.addInitScript(()=>{
   window.browser={
     runtime:{sendMessage:(m,cb)=>{const s={agents:6,autoAgents:false,speed:3,sound:false,enabled:true};cb?.(s);return Promise.resolve(s)},onMessage:{addListener(){}}},
     storage:{local:{get:async()=>({swarmEnabled:true})}}
   };
 });
 await p.goto('data:text/html,'+encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>li{height:20px}#suggestions{position:absolute;top:70px}</style><input id="search" value="初始值"><ul id="suggestions" role="listbox"></ul><div id="editor" contenteditable="true" style="position:absolute;top:600px">编辑内容</div>'));
 const root=path.resolve(__dirname,'../../web-extension/content');
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'mask.js'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'swarm.js'),'utf8')});
 await p.waitForFunction(()=>document.querySelector('#search').classList.contains('__swarm-drawn') && document.querySelector('#editor').classList.contains('__swarm-drawn'),{},{timeout:15000});
 await p.evaluate(()=>{
   const input=document.querySelector('#search');input.focus();input.setSelectionRange(2,2);
   window.__blurs=0;input.addEventListener('blur',()=>__blurs++);
   const commit=__swarmMask.commit;window.__editorCommits=0;
   __swarmMask.commit=function(t){if(__swarmMask.editorRoot(t.record.el))__editorCommits++;return commit(t)};
   input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
   window.__hiddenDuringComposition=0;
   const check=()=>{if(getComputedStyle(input).visibility!=='visible' || !input.classList.contains('__swarm-drawn'))__hiddenDuringComposition++};
   window.__checkComposition=setInterval(check,5);
 });
 // Both text-node mutation and whole-list replacement paths, faster than one
 // cursor gesture. Deliberately never move the mouse or send pointer events.
 for(let i=0;i<35;i++){
   await p.evaluate(i=>{
     const input=document.querySelector('#search');input.value='pinyin'+i;input.setSelectionRange(input.value.length,input.value.length);
     input.dispatchEvent(new InputEvent('input',{bubbles:true,data:String(i),inputType:'insertCompositionText',isComposing:true}));
     const list=document.querySelector('#suggestions');
     if(i%2===0)list.innerHTML=Array.from({length:16},(_,n)=>`<li role="option"><span>猜你想搜 ${i} 项 ${n}</span></li>`).join('');
     else for(const span of list.querySelectorAll('span'))span.firstChild.data=`猜你想搜 ${i} 最新`;
   },i);
   await p.waitForTimeout(25);
 }
 await p.evaluate(()=>{
   const input=document.querySelector('#search');input.value='拼音输入完成';input.setSelectionRange(3,3);
   input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:input.value}));
 });
 await p.waitForFunction(()=>[...document.querySelectorAll('#suggestions li,#suggestions span')].every(el=>el.classList.contains('__swarm-drawn')),{},{timeout:12000});
 await p.waitForTimeout(1700);
 const state=await p.evaluate(()=>{
   clearInterval(__checkComposition);const input=document.querySelector('#search');
   return {blurs:__blurs,hidden:__hiddenDuringComposition,editorCommits:__editorCommits,active:document.activeElement===input,value:input.value,start:input.selectionStart,end:input.selectionEnd};
 });
 assert.deepEqual(state,{blurs:0,hidden:0,editorCommits:0,active:true,value:'拼音输入完成',start:3,end:3});
 console.log('PASS rapid live suggestions settle without hover; composition events preserve focus, selection and visibility');
 await p.evaluate(()=>{
   for(const el of document.querySelectorAll('#suggestions span'))el.className='site-updated-row';
   const input=document.querySelector('#search');input.className='site-updated-input';
   window.__synchronousEditorVisible=getComputedStyle(input).visibility==='visible' && document.activeElement===input;
 });
 await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#suggestions span')].every(el=>getComputedStyle(el).visibility==='visible')),true);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'search');
 assert.equal(await p.evaluate(()=>__synchronousEditorVisible),true);
 console.log('PASS framework className replacement keeps completed rows visible and never hides a focused editor');
 await p.evaluate(()=>{
   const el=document.querySelector('#editor');el.focus();const span=document.createElement('span');span.textContent='组合输入新文字';el.append(span);
   el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));
 });
 await p.waitForTimeout(1800);
 assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#editor span')).visibility),'visible');
 assert.equal(await p.evaluate(()=>document.activeElement.id),'editor');
 assert.equal(await p.evaluate(()=>__editorCommits),0);
 console.log('PASS drawn contenteditable accepts new text nodes without cursor jobs');
 await p.evaluate(()=>{
   const E=__swarmRebuild.app.engine;window.__step=E.step;E.step=()=>{};
   const el=document.createElement('input');el.id='new-input';el.value='预填内容';document.body.append(el);
 });
 await p.waitForTimeout(400);
 assert.match(await p.evaluate(()=>getComputedStyle(document.querySelector('#new-input')).maskImage),/gradient/);
 await p.evaluate(()=>__swarmRebuild.app.engine.step=__step);
 await p.waitForFunction(()=>document.querySelector('#new-input').classList.contains('__swarm-drawn'),{},{timeout:12000});
 assert.equal(await p.evaluate(()=>__editorCommits),1);
 console.log('PASS a newly appearing input still requires its cursor appearance task');
 assert.deepEqual(errors,[]);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
