import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('web-extension/manifest.json',root),'utf8'));
assert(manifest.permissions.includes('nativeMessaging'));
const store={}, ports=[], sent=[], timers=[];
const api={
 storage:{local:{get:async k=>({[k]:store[k]}),set:async x=>Object.assign(store,x)}},
 action:{onClicked:{addListener(){}},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
 tabs:{query:async()=>[{id:1}],sendMessage:async(id,msg)=>{sent.push(msg)},onUpdated:{addListener(){}}},
 runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}},onMessageExternal:{addListener(){}},
  sendNativeMessage:(id,msg,cb)=>{cb?.({});return Promise.resolve({})},
  connectNative:()=>{const p={onMessage:{addListener:f=>p.receive=f},onDisconnect:{addListener:f=>p.disconnect=f}};ports.push(p);return p;}
 }
};
const source=await readFile(new URL('web-extension/background.js',root),'utf8');
vm.runInNewContext(source,{browser:api,console,Promise,setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout(){}});
const settle=async()=>{for(let n=0;n<50;n++)await Promise.resolve()};
await settle();assert.equal(ports.length,1);
ports[0].receive({name:'swarm:settings',userInfo:{speed:3,agents:9,autoAgents:false,sound:false,enabled:false,settingsUpdatedAt:100,enabledUpdatedAt:100}});
await settle();
assert.equal(store.swarmEnabled,false);
assert.equal(store.swarmSettings.speed,3);
assert.equal(store.swarmSettings.sound,false);
const config=sent.findLast(m=>m.type==='SWARM_CONFIG_UPDATE').payload;
for(const k of ['minAgents','maxAgents','flockAgents','introAgents'])assert.equal(config.cfg[k],9);
ports[0].receive({name:'swarm:settings',userInfo:{speed:1,agents:24,autoAgents:true,sound:true,enabled:true,settingsUpdatedAt:50,enabledUpdatedAt:50}});
await settle();assert.equal(store.swarmSettings.speed,3);assert.equal(store.swarmEnabled,false);
ports[0].disconnect();timers.findLast(t=>t.ms===2000).f();assert.equal(ports.length,2);
console.log('PASS manifest nativeMessaging; actual native port message entry; OFF/full config; stale push rejected; reconnect');
