// Swarm Cursors — Safari Web Extension background service worker.
//
// One global switch drives everything:
//   ON  → every page is drawn by the swarm
//   OFF → the extension does nothing at all, on any site, until switched back
//
// The switch lives in storage.local so it survives restarts. It is toggled by
// the toolbar button (a single click) and by the app (through the settings
// bridge), and every open tab is told about it immediately.

const api = globalThis.browser || globalThis.chrome;

const DEFAULTS = { speed: 1, agents: 24, autoAgents: true, sound: true, lang: "", enabled: true };
const CACHE_KEY = "swarmSettings";
const ENABLED_KEY = "swarmEnabled";

const ACTION_TITLES = {
  en: "Swarm Cursors (⌥⇧S)",
  zh: "Swarm Cursors（⌥⇧S）"
};

function isChinese(lang) {
  return String(lang || "").toLowerCase().indexOf("zh") === 0;
}

function nativeMessage(message, timeoutMs) {
  return new Promise((resolve) => {
    if (!api.runtime || typeof api.runtime.sendNativeMessage !== "function") return resolve(null);
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v && typeof v === "object" && !v.error ? v : null);
    };
    try {
      const p = api.runtime.sendNativeMessage("application.id", message, (res) => {
        done(api.runtime.lastError ? null : res);
      });
      if (p && typeof p.then === "function") p.then(done).catch(() => done(null));
      setTimeout(() => done(null), timeoutMs || 1200);
    } catch (_) {
      done(null);
    }
  });
}

let switchQueue = Promise.resolve();
function serializeSwitch(fn) {
  const work = switchQueue.then(fn, fn);
  switchQueue = work.catch(() => {});
  return work;
}
async function readState() {
  const a = await api.storage.local.get(ENABLED_KEY);
  const b = await api.storage.local.get("swarmEnabledUpdatedAt");
  return { enabled: typeof a[ENABLED_KEY] === "boolean" ? a[ENABLED_KEY] : true,
    exists: typeof a[ENABLED_KEY] === "boolean", revision: Number(b.swarmEnabledUpdatedAt) || 0 };
}
let nativeRead = null;
async function readSettings() {
  if (!nativeRead) nativeRead = nativeMessage({type:"settings"},1200).finally(()=>{nativeRead=null});
  const fresh = await nativeRead;
  const got = await api.storage.local.get(CACHE_KEY).catch(() => ({}));
  // A native handler without shared settings returns an empty object, never
  // defaults that replace the app's pushed values.
  const cached = got[CACHE_KEY] || {};
  const freshRevision=Number(fresh?.settingsUpdatedAt)||0, cachedRevision=Number(cached.settingsUpdatedAt)||0;
  const settings = {...DEFAULTS, ...cached, ...(freshRevision>=cachedRevision?fresh:{})};
  await serializeSwitch(async () => {
    const current = await readState();
    const revision = Number(fresh?.enabledUpdatedAt) || 0;
    if (typeof fresh?.enabled === "boolean" && (!current.exists || revision > current.revision)) {
      await writeState(fresh.enabled, revision);
    }
    const state = await readState();
    settings.enabled = state.enabled; settings.enabledUpdatedAt = state.revision;
    await api.storage.local.set({[CACHE_KEY]:settings});
  });
  return settings;
}

function buildConfig(s) {
  s = s || DEFAULTS;
  const isAuto = s.autoAgents !== false;
  let minAgents, maxAgents, flockAgents, introAgents;

  if (isAuto) {
    minAgents = 2;
    maxAgents = 16;
    flockAgents = 4;
    introAgents = 4;
  } else {
    const count = Math.min(100, Math.max(6, Math.round(Number(s.agents) || 24)));
    minAgents = count;
    maxAgents = count;
    flockAgents = count;
    introAgents = count;
  }

  const speed = Number(s.speed);

  return {
    settingsUpdatedAt:Number(s.settingsUpdatedAt)||0,
    bridgeSource:s.bridgeSource||"cache",
    cfg: {
      minAgents,
      maxAgents,
      flockAgents,
      introAgents,
      maxItems: 4000,
      maxScanNodes: 20000
    },
    speed: speed === 1 || speed === 2 || speed === 3 ? speed : 1,
    sound: s.sound !== false,
    lang: typeof s.lang === "string" ? s.lang : ""
  };
}

// ---------------------------------------------------------------- the switch

async function getEnabled() { return (await readState()).enabled; }
async function paintBadge(enabled) {
  await Promise.allSettled([
    api.action.setBadgeBackgroundColor({color:enabled?"#0D99FF":"#8E8E93"}),
    api.action.setBadgeText({text:enabled?"ON":"OFF"})
  ]);
}
async function broadcastEnabled(enabled, revision) {
  const tabs = await api.tabs.query({}).catch(() => []);
  await Promise.allSettled(tabs.filter(t=>t.id!=null).map(t=>Promise.race([
    api.tabs.sendMessage(t.id,{type:"swarm:enabled",enabled,revision}),
    new Promise(resolve=>setTimeout(resolve,500))
  ])));
}
async function writeState(enabled, revision) {
  const got = await api.storage.local.get(CACHE_KEY).catch(() => ({}));
  await api.storage.local.set({[ENABLED_KEY]:enabled, swarmEnabledUpdatedAt:revision,
    [CACHE_KEY]:{...got[CACHE_KEY],enabled,enabledUpdatedAt:revision}});
  await paintBadge(enabled);
  // A slow or suspended webpage never blocks the next click.
  broadcastEnabled(enabled,revision).catch(()=>{});
  nativeMessage({type:"setEnabled",enabled,enabledUpdatedAt:revision},1200).catch(()=>{});
  return enabled;
}
function setEnabled(enabled, opts = {}) {
  return serializeSwitch(async () => {
    const state=await readState();
    const revision=opts.revision ?? Math.max(Date.now(),state.revision+1);
    if (revision < state.revision) return state.enabled;
    return writeState(!!enabled,revision);
  });
}

async function syncActionTitle() {
  const s = await readSettings();
  const title = isChinese(s.lang) ? ACTION_TITLES.zh : ACTION_TITLES.en;
  try {
    await api.action.setTitle({ title });
  } catch (_) {}
}

api.runtime.onInstalled.addListener(async () => {
  await paintBadge(await getEnabled());
  syncActionTitle();
});

api.runtime.onStartup.addListener(async () => {
  await paintBadge(await getEnabled());
});

(async () => {
  await paintBadge(await getEnabled());
  syncActionTitle();
})();

// ------------------------------------------------------------ toolbar click

function toggleSwarm() {
  return serializeSwitch(async () => {
    const state=await readState();
    return writeState(!state.enabled,Math.max(Date.now(),state.revision+1));
  });
}

if (api.action && api.action.onClicked) {
  api.action.onClicked.addListener(() => {
    toggleSwarm();
  });
}

// A tab that loads while ON should be told, so it starts drawing; while OFF it
// must not start at all. The badge is global, so it is repainted on click only.
if (api.tabs && api.tabs.onUpdated) {
  api.tabs.onUpdated.addListener(async (tabId, info) => {
    if (!info || info.status !== "complete") return;
    const state = await readState();
    try {
      await api.tabs.sendMessage(tabId, { type: "swarm:enabled", enabled:state.enabled, revision:state.revision });
    } catch (_) {}
  });
}

// ------------------------------------------------- settings pushed from app

// Safari delivers containing-app dispatchMessage calls through a native port.
// Recreate it when the worker restarts or Safari disconnects it.
let nativePort = null, nativeReconnect = null;
function connectApp() {
  if (nativePort || typeof api.runtime.connectNative !== "function") return;
  try {
    const port = api.runtime.connectNative("application.id");
    nativePort = port;
    port.onMessage.addListener(message => {
      acceptPushedSettings(message).catch(error => console.error("swarm: native settings rejected", String(error)));
    });
    port.onDisconnect.addListener(() => {
      if (nativePort !== port) return;
      nativePort = null;
      clearTimeout(nativeReconnect);
      nativeReconnect = setTimeout(connectApp, 2000);
    });
  } catch (error) {
    console.error("swarm: native port unavailable", String(error));
    clearTimeout(nativeReconnect);
    nativeReconnect = setTimeout(connectApp, 2000);
  }
}
connectApp();

async function acceptPushedSettings(raw) {
  if (!raw || typeof raw !== "object") return false;
  const s = raw.settings || raw.userInfo || (typeof raw.message === "object" && raw.message) || raw;
  if (!["speed","agents","sound","enabled"].some(k=>k in s)) return false;
  await serializeSwitch(async () => {
    const state=await readState();
    const got=await api.storage.local.get(CACHE_KEY);
    const cached=got[CACHE_KEY] || {};
    const freshConfig=(Number(s.settingsUpdatedAt)||0)>=(Number(cached.settingsUpdatedAt)||0);
    const revision=Number(s.enabledUpdatedAt) || 0;
    // Opening the app or changing speed must not replay its old enabled bit.
    const apply=typeof s.enabled === "boolean" && (!state.exists || revision > state.revision);
    const enabled=apply?s.enabled:state.enabled, stamp=apply?revision:state.revision;
    const merged={...cached,...(freshConfig?s:{}),enabled,enabledUpdatedAt:stamp};
    await api.storage.local.set({[CACHE_KEY]:merged});
    if (apply) await writeState(enabled,stamp);
    else nativeMessage({type:"setEnabled",enabled,enabledUpdatedAt:stamp},1200).catch(()=>{});
    const cfg=buildConfig(merged);
    console.info("swarm: app settings applied", {revision:cfg.settingsUpdatedAt, enabled, speed:cfg.speed, sound:cfg.sound, agents:cfg.cfg.maxAgents});
    const tabs=await api.tabs.query({}).catch(()=>[]);
    for (const t of tabs) if(t.id!=null) api.tabs.sendMessage(t.id,{type:"SWARM_CONFIG_UPDATE",payload:cfg}).catch(()=>{});
  });
  return true;
}

if (api.runtime.onMessageExternal) {
  api.runtime.onMessageExternal.addListener((msg, _sender, respond) => {
    acceptPushedSettings(msg).then(ok=>{if(typeof respond === "function")respond({ok});});
    return true;
  });
}

if (api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req) return;

    if (req.type === "getSettings") {
      connectApp();
      (async () => {
        const raw = await readSettings();
        const cfg = buildConfig(raw);
        const state = await readState();
        cfg.enabled = state.enabled; cfg.enabledUpdatedAt = state.revision;
        sendResponse(cfg);
      })();
      return true;
    }

    if (req.type === "swarm:getEnabled") {
      getEnabled().then((v) => sendResponse({ enabled: v }));
      return true;
    }

    if (req.type === "swarm:setEnabled") {
      setEnabled(req.enabled, { broadcast: true }).then((v) => sendResponse({ enabled: v }));
      return true;
    }

    if (req.type === "swarm:toggleEnabled") {
      toggleSwarm().then((v) => sendResponse({ enabled: v }));
      return true;
    }

    if (!req.type || req.type === "swarm:settings" || req.settings || req.userInfo) {
      acceptPushedSettings(req).then(ok=>sendResponse({ok}));
      return true;
    }
  });
}
