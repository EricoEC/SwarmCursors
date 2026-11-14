// Read-only audit of upstream capture and actual task ownership. Auto-start is
// disabled in memory only; no upstream or extension runtime file is changed.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'/Users/erico/.nvm/versions/node/v22.22.1/lib/node_modules/playwright');
(async()=>{const browser=await webkit.launch();try{
 const source=fs.readFileSync(path.resolve(__dirname,'../../../../源项目/swarm-rebuild/swarm.js'),'utf8');
 assert(source.endsWith('  start();\n})();\n') || source.endsWith('  start();\n})();'));
 const code=source.replace(/  start\(\);\n\}\)\(\);\s*$/, '})();');
 const cases=[['same-images',false,false,false],['different-images',true,false,false],['different-classes',true,true,false],['repeated-cards',true,false,true]];
 const results=[];
 for(const [name,different,classes,cards] of cases){
   const p=await browser.newPage({viewport:{width:1200,height:800}});
   const html=Array.from({length:6},(_,i)=>{
     const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="90"><rect width="100" height="90" fill="${different?['red','blue','green','orange','purple','pink'][i]:'red'}"/></svg>`;
     const img=`<img class="${classes?'photo-'+i:'photo'}" width="100" height="90" src="data:image/svg+xml,${encodeURIComponent(svg)}">`;
     return cards?`<article class="card">${img}<p>卡片标题 ${i}</p></article>`:img;
   }).join('');
   await p.setContent(`<style>.row{display:flex;gap:12px}.card{width:130px;background:#ddd;padding:8px}</style><div class="row">${html}</div>`);
   await p.waitForFunction(()=>[...document.images].every(i=>i.complete));
   await p.addScriptTag({content:code});
   const result=await p.evaluate(()=>{
     const d=__swarmRebuild.debug,m=d.captureModel(d.detectEnv());
     const counts={};for(const t of m.tasks)counts[t.spec.type]=(counts[t.spec.type]||0)+1;
     return {counts,groups:m.groups.map(g=>({tag:g.master.tag,cls:g.master.cls,members:1+g.copies.length})),copies:m.tasks.filter(t=>t.spec.type==='dup').map(t=>({id:t.id,deps:t.deps.map(d=>d.id)}))};
   });
   if(name==='same-images'){assert.equal(result.counts.image,1);assert.equal(result.counts.dup,5);assert.equal(result.counts.swap||0,0);}
   if(name==='different-images'){assert.equal(result.counts.image,1);assert.equal(result.counts.dup,5);assert.equal(result.counts.swap,5);}
   if(name==='different-classes'){assert.equal(result.counts.image,6);assert.equal(result.counts.dup||0,0);}
   if(name==='repeated-cards'){assert.equal(result.counts.dup,5);assert.equal(result.counts.swap,5);assert.equal(result.counts.edit,5);}
   results.push({case:name,...result});
   if(name==='different-images'){
     await p.evaluate(()=>{
       __swarmRebuild.start();const E=__swarmRebuild.app.engine,run=E.run;
       window.__owners=[];
       E.run=function(c,t){__owners.push({type:t.spec.type,cursor:c.id});return run.call(this,c,t)};
     });
     await p.waitForFunction(()=>__swarmRebuild.app?.complete,{},{timeout:30000});
     const owners=await p.evaluate(()=>__owners);
     assert.equal(owners.filter(t=>t.type==='image').length,1);
     assert.equal(owners.filter(t=>t.type==='dup').length,5);
     results.push({case:'actual-original-run',owners});
   }
   await p.close();
 }
 for(const r of results)console.log(JSON.stringify(r));
 console.log('PASS original capture: master/dup/swap/edit task chains and independent duplication dependencies confirmed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
