const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require('/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const b=await webkit.launch();try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{window.browser={runtime:{sendMessage:(m,cb)=>{const s={autoAgents:true,agents:24,speed:1,sound:false,enabled:true};cb?.(s);return Promise.resolve(s)},onMessage:{addListener(){}}},storage:{local:{get:async()=>({})}}};});
 await p.goto('data:text/html,'+encodeURIComponent('<meta charset="utf-8"><style>.field{position:relative;width:600px;height:44px;border:2px solid gold}input{width:100%;height:100%;border:0;background:transparent}input::placeholder{color:transparent}.placeholder{position:absolute;top:10px;left:8px;pointer-events:none}.gradient{display:block;background:linear-gradient(90deg,#f70,#73f);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}.mirror{visibility:hidden;position:absolute}</style><div class="field"><input id="search" role="combobox" placeholder="Search with Yandex AI"><div class="placeholder" aria-hidden="true"><label class="gradient">Search with Yandex AI</label></div><div class="mirror"><span></span></div></div>'));
 const root=path.resolve(__dirname,'../../web-extension/content');for(const n of ['mask','swarm'])await p.addScriptTag({content:fs.readFileSync(path.join(root,n+'.js'),'utf8')});
 await p.waitForFunction(()=>__swarmRebuild.app?.engine.items?.some(it=>it.nativeSource?.classList.contains('gradient')),{},{timeout:6000});
 const appearance=await p.evaluate(()=>__swarmRebuild.app.engine.items.filter(it=>it.nativeSource.classList.contains('gradient')).map(it=>({kind:it.kind,bg:it.full?.style.backgroundImage,clip:it.full?.style.backgroundClip})));
 assert.deepEqual(appearance.map(x=>x.kind),['text']);assert.match(appearance[0].bg,/gradient/);assert.equal(appearance[0].clip,'text');
 await p.waitForFunction(()=>__swarmRebuild.app.complete,{},{timeout:15000});
 console.log('PASS gradient placeholder paints as text, not a solid rectangle or invisible glyphs');
 await p.evaluate(()=>{window.__editorCommits=0;const commit=__swarmMask.commit;__swarmMask.commit=t=>{if(t.record.el.id==='search')__editorCommits++;return commit(t)};const input=document.querySelector('#search');input.focus();input.addEventListener('input',()=>{document.querySelector('.placeholder').style.display=input.value?'none':'';document.querySelector('.mirror span').textContent=input.value});});
 await p.locator('#search').fill('native input');await p.waitForTimeout(400);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'search');assert.equal(await p.locator('#search').inputValue(),'native input');assert.equal(await p.evaluate(()=>document.querySelector('#search').hasAttribute('data-swarm-pending')),false);assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('.placeholder')).display),'none');
 await p.locator('#search').fill('');await p.waitForFunction(()=>!document.querySelector('.gradient').hasAttribute('data-swarm-pending'),{},{timeout:12000});
 assert.equal(await p.evaluate(()=>__editorCommits),0);assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('.mirror')).visibility),'hidden');assert.deepEqual(errors,[]);
 console.log('PASS typing and clearing preserve focus, native values, placeholder state and hidden mirrors');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
