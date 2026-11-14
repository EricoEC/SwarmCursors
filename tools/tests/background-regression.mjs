// Executes the real background.js against a faithful mock of the Safari
// WebExtension APIs, then drives the toolbar click path end to end.
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const BG = new URL("../../web-extension/background.js", import.meta.url);
const src = await readFile(BG, "utf8");

const store = {};
const badge = { text: "", color: "" };
const sent = [];
const onClicked = [];
const onUpdated = [];
const onMessage = [];

// The app writes the App Group before it pushes, so a settings read after a push
// must already see the new value. This mirrors SwarmSettings.persist().
let appEnabled = true;
let appAgents = 24, appAuto = true;

const api = {
  storage: { local: {
    get: async (k) => (k == null ? { ...store } : { [k]: store[k] }),
    set: async (o) => { Object.assign(store, o); }
  } },
  action: {
    onClicked: { addListener: (f) => onClicked.push(f) },
    setBadgeText: async (o) => { badge.text = o.text; },
    setBadgeBackgroundColor: async (o) => { badge.color = o.color; },
    setTitle: async () => {},
    setBadgeBackgroundColor_: null
  },
  tabs: {
    query: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
    sendMessage: async (tabId, msg) => { sent.push({ tabId, msg }); },
    onUpdated: { addListener: (f) => onUpdated.push(f) }
  },
  runtime: {
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener: (f) => onMessage.push(f) },
    onMessageExternal: { addListener() {} },
    sendNativeMessage: (id, msg, cb) => { cb && cb({ speed: 1, agents: appAgents, autoAgents: appAuto, sound: true, lang: "zh", enabled: appEnabled }); },
    lastError: null, getURL: (p) => p
  }
};

const ctx = vm.createContext({ globalThis: null, console, setTimeout, clearTimeout, Promise });
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.browser = api;
ctx.chrome = api;
vm.runInContext(src, ctx, { filename: "background.js" });
await new Promise((r) => setTimeout(r, 250));

const marks = {};
const snap = (label) => {
  marks[label] = { stored: store.swarmEnabled, badge: badge.text, last: sent.slice(-3).map((s) => s.msg.enabled) };
  console.log(label, JSON.stringify(marks[label]));
};

snap("initial");

// 1. one toolbar click -> OFF
onClicked[0]();
await new Promise((r) => setTimeout(r, 300));
snap("after click #1");

// 2. a new tab finishing load while OFF must be told "false"
onUpdated[0](9, { status: "complete" });
await new Promise((r) => setTimeout(r, 300));
snap("new tab while OFF");

// 3. second click -> ON
onClicked[0]();
await new Promise((r) => setTimeout(r, 300));
snap("after click #2");

// 4. a new tab finishing load while ON
onUpdated[0](10, { status: "complete" });
await new Promise((r) => setTimeout(r, 300));
snap("new tab while ON");

// 5. content script asking for state
let answer = null;
onMessage[0]({ type: "swarm:getEnabled" }, {}, (r) => { answer = r; });
await new Promise((r) => setTimeout(r, 150));
console.log("content script getEnabled →", JSON.stringify(answer));

// 6. app pushes enabled:false through the settings bridge (group already written)
let ok = null;
appEnabled = false;
onMessage[0]({ speed: 1, agents: 24, sound: true, lang: "zh", enabled: false, enabledUpdatedAt: Date.now() + 1000 }, {}, (r) => { ok = r; });
await new Promise((r) => setTimeout(r, 300));
snap("after app pushed enabled:false");

const checks = [
  ["first click turns storage OFF", marks["after click #1"].stored === false],
  ["badge shows OFF", marks["after click #1"].badge === "OFF"],
  ["broadcast reached all 3 tabs", JSON.stringify(marks["after click #1"].last) === JSON.stringify([false, false, false])],
  ["new tab while OFF is told false", marks["new tab while OFF"].last.slice(-1)[0] === false],
  ["second click turns it ON", marks["after click #2"].stored === true && marks["after click #2"].badge === "ON"],
  ["new tab while ON is told true", marks["new tab while ON"].last.slice(-1)[0] === true],
  ["getEnabled answers true", answer && answer.enabled === true],
  ["app push sets OFF again", marks["after app pushed enabled:false"].stored === false && marks["after app pushed enabled:false"].badge === "OFF"]
];
let pass = 0;
for (const [name, okk] of checks) { console.log((okk ? "PASS " : "FAIL ") + name); if (okk) pass++; }
console.log(`${pass}/${checks.length} toolbar-chain checks passed`);
if (pass !== checks.length) throw new Error("toolbar regression");

appAgents = 100; appAuto = false;
const cfg = await new Promise(resolve => onMessage[0]({type:"getSettings"}, {}, resolve));
for (const key of ["minAgents", "maxAgents", "flockAgents", "introAgents"]) {
  if (cfg.cfg[key] !== 100) throw new Error(`getSettings ${key}: ${cfg.cfg[key]}`);
}
console.log("PASS real background getSettings maps manual 100 to all four worker counts");
