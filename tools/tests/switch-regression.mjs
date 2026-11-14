import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../../web-extension/background.js',import.meta.url),'utf8');
const store={},sent=[],clicks=[],updates=[],messages=[];let badge='', forced=null;
let native={speed:1,agents:100,autoAgents:false,sound:false,lang:'zh',enabled:true,enabledUpdatedAt:10};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const api={storage:{local:{get:async k=>({[k]:store[k]}),set:async x=>Object.assign(store,x)}},
 action:{onClicked:{addListener:f=>clicks.push(f)},setBadgeText:async x=>{badge=x.text},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
 tabs:{query:async()=>[{id:1},{id:2},{id:3}],sendMessage:(id,msg)=>{sent.push({id,msg});return id===3?new Promise(()=>{}):Promise.resolve()},onUpdated:{addListener:f=>updates.push(f)}},
 runtime:{lastError:null,onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener:f=>messages.push(f)},onMessageExternal:{addListener(){}},
 sendNativeMessage:(id,msg,cb)=>{
   if(msg.type==='setEnabled'&&msg.enabledUpdatedAt>=native.enabledUpdatedAt)native={...native,enabled:msg.enabled,enabledUpdatedAt:msg.enabledUpdatedAt};
   const result=msg.type==='settings'&&forced?{...forced}:{...native};cb?.(result);return Promise.resolve(result);
 }}};
const load=()=>{const ctx=vm.createContext({browser:api,console,setTimeout,clearTimeout,Promise});vm.runInContext(source,ctx);return ctx};
const ask=req=>new Promise(resolve=>messages.at(-1)(req,{},resolve));
load();await pause(30);
assert.equal(badge,'ON');
clicks.at(-1)();await pause(30);
assert.equal(store.swarmEnabled,false);assert.equal(native.enabled,false);assert.equal(badge,'OFF');
console.log('PASS toolbar OFF persists to native state');
forced={enabled:true,enabledUpdatedAt:10};
const cfg=await ask({type:'getSettings'});assert.equal(cfg.enabled,false);assert.equal(badge,'OFF');
console.log('PASS stale native settings cannot undo toolbar click');
await updates.at(-1)(4,{status:'complete'});assert.equal(sent.at(-1).msg.enabled,false);
clicks.at(-1)();await pause(30);assert.equal(store.swarmEnabled,true);
clicks.at(-1)();clicks.at(-1)();await pause(50);assert.equal(store.swarmEnabled,true);
console.log('PASS rapid single clicks serialize despite an unresponsive tab');
const revision=store.swarmEnabledUpdatedAt+100;
await ask({type:'swarm:settings',userInfo:{speed:2,agents:100,autoAgents:false,enabled:false,enabledUpdatedAt:revision}});
assert.equal(store.swarmEnabled,false);assert.equal(native.enabled,false);assert.equal(badge,'OFF');
await ask({type:'swarm:settings',settings:{speed:3,agents:100,autoAgents:false,enabled:true,enabledUpdatedAt:0}});
assert.equal(store.swarmEnabled,false);assert.equal(store.swarmSettings.speed,3);
console.log('PASS typed App pushes synchronize; stale app launch cannot restore ON');
forced={};const finalCfg=await ask({type:'getSettings'});
assert.equal(finalCfg.enabled,false);assert.equal(finalCfg.speed,3);
for(const k of ['minAgents','maxAgents','flockAgents','introAgents'])assert.equal(finalCfg.cfg[k],100);
console.log('PASS native unavailable preserves cached config and manual 100 workers');
load();await pause(30);assert.equal(badge,'OFF');assert.equal(store.swarmEnabled,false);
console.log('PASS service-worker restart retains OFF');
