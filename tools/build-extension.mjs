#!/usr/bin/env node
/* Build the native DOM task runtime with the upstream cursor renderer,
 * movement primitives, sounds, flocking, and work scheduler.
 * Task completion is the only normal path that reveals native content. */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const UPSTREAM = join(root, "..", "..", "源项目", "swarm-rebuild", "swarm.js");
const OUT_DIR = join(root, "web-extension", "content");
const OUT = join(OUT_DIR, "swarm.js");
const ICON_SRC = join(root, "..", "..", "源项目", "swarm-rebuild", "icons");
const ICON_DST = join(root, "web-extension", "icons");

const PATCHES = [
  ["engine: bound concurrent work without retiring the planned crew", "        if (c.task || c.leaving || c.follow) continue;", "        if (c.task || c.leaving || c.follow || !window.__swarmNative.canPick(this)) continue;"],
  ["capture: skip subtrees without visible native candidates", "    function walk(el, ctx, parent) {\n      if (items.length", "    function walk(el, ctx, parent) {\n      if (window.__swarmMask && !window.__swarmMask.shouldCapture(el)) return;\n      if (items.length"],
  ["capture: preserve gradient glyph paint", "      let s = styleString(cs, TEXT_PROPS);", "      let s = styleString(cs, TEXT_PROPS);\n      if ((cs.backgroundClip || cs.webkitBackgroundClip || '').includes('text')) s += styleString(cs, ['background-image','background-size','background-position','background-repeat','background-origin','background-clip','-webkit-background-clip']);"],
  ["capture: text-clipped gradients are not standalone rectangles", "      const bgi = cs.backgroundImage;", "      const bgi = (cs.backgroundClip || cs.webkitBackgroundClip || '').includes('text') ? 'none' : cs.backgroundImage;"],
  ["engine: automatic growth follows executable work", "      const want = clamp(MIN_AGENTS + Math.floor(this.vel / 40) + Math.floor(avail.length / 2), MIN_AGENTS, MAX_AGENTS);", "      const want = window.__swarmNative.workerTarget(this, avail.length);"],
  ["engine: stagger automatic arrivals", "        this.spawnCooldown = 0.035;", "        this.spawnCooldown = (window.__SWARM_CFG || {}).minAgents === (window.__SWARM_CFG || {}).maxAgents ? 0.035 : 0.18;"],
  ["engine: standby respects adaptive budget", "      if (this.cursors.length < FLOCK_AGENTS && this.spawnCooldown <= 0 && !this.releasing) {", "      if (this.cursors.length < window.__swarmNative.idleTarget(this) && this.spawnCooldown <= 0 && !this.releasing) {"],
  ["performance: measure extension frame work", "        this.engine.step(dt);", "        const nativeFrameStart = performance.now();\n        this.engine.step(dt);"],
  ["performance: feedback after original rendering", "        this.view.render(this.engine);", "        this.view.render(this.engine);\n        window.__swarmNative.frameCost(this.engine, performance.now() - nativeFrameStart);"],

  ["lifecycle: reject starts while disabled", "  function start() {\n    if (app) return;", "  function start() {\n    if (app || window.__swarmEnabled === false) return;"],
  ["lifecycle: safe cancellation before view initialization", "    destroy(reveal) {\n      unhidePage();", "    destroy(reveal) {\n      if (!this.view) { this.dead = true; cancelAnimationFrame(this.raf); return; }\n      unhidePage();"],

  ["capture: associate original visual items with source nodes", "    const roots = [];\n    let order = 0;", "    const roots = [];\n    let captureSource = null, captureNodes = [];\n    let order = 0;"],
  ["capture: retain source provenance", "    function add(it) {\n      it.id", "    function add(it) {\n      const nativeBox = it.tb || it;\n      const nx = nativeBox.x + (it.layer === 'world' ? ox - sx : 0), ny = nativeBox.y + (it.layer === 'world' ? oy - sy : 0);\n      if (nx + nativeBox.w <= 0 || ny + nativeBox.h <= 0 || nx >= innerWidth || ny >= innerHeight) return null;\n      if (captureSource?.tagName === 'IMG' && (!captureSource.complete || !captureSource.naturalWidth)) return null;\n      it.nativeSource = captureSource; it.nativeCovers = captureNodes.slice();\n      if (it.kind === 'image' && it.media) {\n        const nativeMedia = it.media.cloneNode(true);\n        for (const el of [nativeMedia, ...nativeMedia.querySelectorAll('*')]) {\n          el.classList.remove('__swarm-drawn');\n          if (!el.getAttribute('class')) el.removeAttribute('class');\n          el.removeAttribute('data-swarm-pending'); el.removeAttribute('data-swarm-editor-ready');\n        }\n        it.sig = nativeMedia.outerHTML;\n      }\n      it.id"],
  ...["emitLeaf", "emitRun", "emitBox", "emitMedia", "emitForm", "emitPseudoBox"].map(name => {
    const signature = ({emitLeaf:"el, cs, r, ctx, key", emitRun:"el, cs, run, ctx", emitBox:"el, cs, r, ctx, key, forceRect", emitMedia:"el, cs, r, ctx, key", emitForm:"el, cs, r, ctx, key", emitPseudoBox:"el, cs, r, ctx, which, empty"})[name];
    const from = `    function ${name}(${signature}) {`;
    const covers = name === "emitRun" ? "run.slice()" : ["emitLeaf","emitMedia"].includes(name) ? "[el]" : "[]";
    return [`capture: ${name} provenance`, from, from + `\n      if (el.nodeType === 1) { captureSource = el; captureNodes = ${covers}; }`];
  }),
  ["capture: ignore extension classes in component signatures", 'cls: (el.getAttribute && el.getAttribute("class")) || "", layer,', 'cls: ((el.getAttribute && el.getAttribute("class")) || "").split(/\\s+/).filter(c => c !== "__swarm-drawn").join(" "), layer,'],
  ["capture: only paint visual objects in the live viewport", 'const emit = visible && sized && !!intersect(ltrb(r), clip) && inDoc(box, layer);', 'const emit = visible && sized && !!intersect(ltrb(r), clip) && !!intersect(ltrb(r), viewClip) && inDoc(box, layer);'],
  ["capture: reject offscreen text runs before cloning", '      if (!intersect(ltrb(r), ctx.clip)) return;\n      const root', '      if (!intersect(ltrb(r), ctx.clip) || !intersect(ltrb(r), viewClip)) return;\n      const root'],
  ["render: only active original visual objects are overlaid", "    renderItem(it) {\n      const tw", "    renderItem(it) {\n      if (it.nativeSkip) { if(it.node)it.node.style.display='none'; return; }\n      const tw"],

  ["native: batch completed reveals after all geometry reads", "        this.engine.step(dt);\n        if (this.tour)", "        this.engine.step(dt);\n        window.__swarmMask?.flush();\n        if (this.tour)"],
  ["native: host pages own Escape and typing shortcuts", "      on(window, \"keydown\", (e) => {\n        if (e.key === \"Escape\") {\n          e.stopPropagation();\n          stop(false);\n        } else if ((e.key === \"m\" || e.key === \"M\") && !e.metaKey && !e.ctrlKey && !e.altKey) {\n          this.sfx.setOn(!this.sfx.on);\n          this.renderSoundBtn();\n        }\n        this.unlockSound();\n      }, true);", "      // The toolbar/app owns the master switch; page keyboard input passes through."],
  ["native: an engine exception stops the effect and restores the page", "        console.error(\"[swarm-rebuild]\", err);\n      }\n      this.raf = requestAnimationFrame((t) => this.frame(t));", "        console.error(\"[swarm-rebuild]\", err);\n        window.__swarmMask?.finish();\n      }\n      this.raf = requestAnimationFrame((t) => this.frame(t));"],
  ["native: one real-content model", "        model = captureModel(this.env, shot);", "        model = window.__swarmNative.prepare(this);"],
  ["native: no programmatic page scrolling", "      await this.scan();", "      // Native tasks discover content when it actually enters the viewport."],
  ["native: discover before scheduling, not after completion", "      const avail = this.started ? this.available() : [];", "      refreshConfigConstants();\n      window.__swarmNative.beforeStep(this);\n      const avail = this.started ? this.available() : [];"],
  ["native: completion keeps the renderer and scheduler alive", "      this.engine.onComplete = () => this.onComplete();", "      this.engine.onComplete = () => { this.complete = true; this.tour = false; };"],
  [
    "config + i18n: engine reads runtime budget and the HUD dictionary",
    `  const MIN_AGENTS = 8;
  const MAX_AGENTS = 48;
  const FLOCK_AGENTS = 36;
  const INTRO_AGENTS = 18;
  const MAX_ITEMS = 4000;`,
    `  const L10N = window.__SWARM_L10N || {};
  const T = (k, ...a) => {
    let s = L10N[k] != null ? L10N[k] : k;
    for (let i = 0; i < a.length; i++) s = s.split("{" + i + "}").join(a[i]);
    return s;
  };
  let MIN_AGENTS = 8;
  let MAX_AGENTS = 48;
  let FLOCK_AGENTS = 36;
  let INTRO_AGENTS = 18;
  let MAX_ITEMS = 4000;
  function refreshConfigConstants() {
    const CFG = window.__SWARM_CFG || {};
    MIN_AGENTS = CFG.minAgents || 8;
    MAX_AGENTS = CFG.maxAgents || 48;
    FLOCK_AGENTS = CFG.flockAgents || 36;
    INTRO_AGENTS = CFG.introAgents || 18;
    MAX_ITEMS = CFG.maxItems || 4000;
  }
  refreshConfigConstants();`,
  ],
  [
    "env: root viewport from visualViewport (iOS address bar, pinch)",
    `        if (isRoot) {
          return {
            ox: 0,
            oy: 0,
            sx: window.scrollX,
            sy: window.scrollY,
            vw: document.documentElement.clientWidth,
            vh: window.innerHeight,
          };
        }`,
    `        if (isRoot) {
          const vv = window.visualViewport;
          return {
            ox: vv ? vv.offsetLeft : 0,
            oy: vv ? vv.offsetTop : 0,
            sx: window.scrollX,
            sy: window.scrollY,
            vw: vv ? vv.width : document.documentElement.clientWidth,
            vh: vv ? vv.height : window.innerHeight,
          };
        }`,
  ],
  [
    "env: cap the scroller-detection walk on mobile",
    `      for (let i = 0; i < all.length && i < 20000; i++) {`,
    `      const scanCap = (window.__SWARM_CFG || {}).maxScanNodes || 20000;
      for (let i = 0; i < all.length && i < scanCap; i++) {`,
  ],
  [
    "view: overlay tracks the visual viewport",
    `    measure() {
      this.W = innerWidth;
      this.H = innerHeight;`,
    `    measure() {
      const vv = window.visualViewport;
      this.W = vv ? vv.width : innerWidth;
      this.H = vv ? vv.height : innerHeight;`,
  ],
  [
    "capture: clip rect matches the geometry viewport",
    `    const viewClip = { l: 0, t: 0, r: innerWidth, b: innerHeight };`,
    `    const vv0 = window.visualViewport;
    const viewClip = vv0
      ? { l: 0, t: 0, r: vv0.width, b: vv0.height }
      : { l: 0, t: 0, r: innerWidth, b: innerHeight };`,
  ],
  [
    "wheel: passthrough on host, never preventDefault",
    `      if (!this.env.isRoot) {
        on(this.view.host, "wheel", (e) => {
          e.preventDefault();
          this.env.scroller.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "instant" });
        }, { passive: false });
      }`,
    `      /* wheel passthrough: never block scrolling */`,
  ],
  [
    'scroll: behavior:"instant" -> "auto" (late enum value, old WebKit throws)',
    `behavior: "instant"`,
    `behavior: "auto"`,
    3,
  ],
  [
    "host: non-intrusive ambient overlay (pointer-events: none)",
    `host.style.cssText =
        "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;pointer-events:auto !important;contain:strict !important;opacity:1;transition:opacity .6s ease;";`,
    `host.style.cssText =
        "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;pointer-events:none !important;contain:strict !important;opacity:1;transition:opacity .6s ease;";`,
  ],
  [
    "style: retire the blank sheet entirely",
    `.bg{position:absolute;inset:0;opacity:0;transition:opacity .5s ease}`,
    `.bg{display:none!important}`,
  ],
  [
    "style: hide intro logo overlay",
    `.intro{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1);pointer-events:none}`,
    `.intro{display:none!important}`,
  ],
  [
    "style: completely remove bottom hud control bar via CSS without breaking DOM references",
    `.hud{position:absolute;left:50%;bottom:20px;transform:translate(-50%,18px);`,
    `.hud{display:none!important;pointer-events:none!important;visibility:hidden!important;opacity:0!important;position:absolute;left:50%;bottom:20px;transform:translate(-50%,18px);`,
  ],
  [
    "style: keep hud hidden when activated",
    `.hud.on{opacity:1;transform:translate(-50%,0)}`,
    `.hud.on{display:none!important;pointer-events:none!important;visibility:hidden!important;opacity:0!important}`,
  ],
  [
    "engine: manual count stays exact; automatic mode retains upstream retirement",
    `          if (!c.leaving && c.idleFor > 2.5 && this.cursors.filter((m) => !m.leaving).length > MIN_AGENTS && !c.home) {`,
    `          if (false && !c.leaving && c.idleFor > 2.5 && this.cursors.filter((m) => !m.leaving).length > MIN_AGENTS && !c.home) {`,
  ],
  [
    "run: dynamic settings sync before engine creation",
    `    async run() {
      this.env = detectEnv();`,
    `    async run() {
      if (window.__syncSwarmSettings) await window.__syncSwarmSettings();
      if (this.dead || window.__swarmEnabled === false) return;
      if (typeof refreshConfigConstants === "function") refreshConfigConstants();
      this.env = detectEnv();`,
  ],












  [
    "settings: sound constructor reads the synchronized preference",
    `      this.on = soundPref;`,
    `      this.on = soundPref = window.__swarmSound !== false;`,
  ],
  [
    "settings: initial build speed exactly as the app sets it (original pacing)",
    `      this.speed = 1;`,
    `      // Original pacing, untouched: 1x is the authored 2.1-4.5x tempo, 2x and
      // 3x multiply it. This is what the reference build feels like.
      this.speed = [1, 2, 3].includes(Number(window.__swarmSpeed)) ? Number(window.__swarmSpeed) : 1;`,
  ],
  [
    "settings: speed button index matches the injected speed",
    `      this.speedIx = 0;`,
    `      this.speedIx = Math.max(0, this.speeds.indexOf(window.__swarmSpeed || 1));`,
  ],
  [
    "start: obey the master switch before touching the page",
    `  start();
})();`,
    `  // The toolbar button / app switch may already be off. Starting the engine
  // anyway would spray cursors over a page the user asked us to leave alone.
  if (window.__swarmEnabled === false) {
    window.__swarmDormant = true;
  } else {
    start();
  }
})();`,
  ],
  [
    "start: a failed build must never leave the page covered",
    `    app.run().catch((err) => console.error("[swarm-rebuild]", err));`,
    `    app.run().catch((err) => {
      console.error("[swarm-rebuild]", err);
      // The host (white sheet + cursor layer) is already in the DOM by the time
      // most failures happen. Take it away so a crashed run is invisible
      // instead of leaving a blank page with no cursors on it.
      try {
        const host = document.querySelector("[data-swarm-host]");
        if (host) host.remove();
      } catch (_) {}
      if (app) {
        app.dead = true;
        cancelAnimationFrame(app.raf);
        for (const unbind of app.unbinds || []) unbind();
        if (app.sfx) app.sfx.close();
        if (app.view) app.view.host.remove();
      }
      app = null;
      window.__swarmMask?.finish();
    });`,
  ],
  [
    "overlay: pen paths never stretch across the page",
    `      for (const it of E.editLines) {
        const st = it.layer !== "world";
        const pts = it.pts.slice(0, it.placed).map((p) => [X(p.x + it.dx, st), Y(p.y + it.dy, st)]);
        const o = it.owner;
        const all = o ? [...pts, [X(o.x, o.sticky), Y(o.y, o.sticky)]] : pts;
        s += \`<polyline points="\${all.map((p) => p.join(",")).join(" ")}\${it.shut && pts[0] ? " " + pts[0].join(",") : ""}" fill="none" stroke="\${BLUE}" stroke-width="1.5"/>\`;
        for (const p of pts) s += \`<circle cx="\${p[0]}" cy="\${p[1]}" r="3.6" fill="#fff" stroke="\${BLUE}" stroke-width="1.5"/>\`;
      }`,
    `      for (const it of E.editLines) {
        const st = it.layer !== "world";
        const raw = it.pts.slice(0, it.placed).map((p) => [X(p.x + it.dx, st), Y(p.y + it.dy, st)]);
        const pts = raw.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        // A pen path is a chain of short steps. A jump several screens long means
        // the geometry went stale (fast scroll, re-anchored item) and drawing it
        // leaves a line dragged across the whole page.
        const limit = Math.max(W, H) * 1.2;
        const runs = [];
        let cur = [];
        for (const p of pts) {
          if (cur.length && Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]) > limit) {
            if (cur.length > 1) runs.push(cur);
            cur = [];
          }
          cur.push(p);
        }
        if (cur.length > 1) runs.push(cur);
        const o = it.owner;
        if (o) {
          const jx = X(o.x, o.sticky), jy = Y(o.y, o.sticky);
          const tip = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null;
          if (tip && Number.isFinite(jx) && Number.isFinite(jy) && Math.hypot(jx - tip[0], jy - tip[1]) <= limit)
            runs[runs.length - 1].push([jx, jy]);
        }
        for (const run of runs)
          s += \`<polyline points="\${run.map((p) => p.join(",")).join(" ")}\${it.shut && run[0] ? " " + run[0].join(",") : ""}" fill="none" stroke="\${BLUE}" stroke-width="1.5"/>\`;
        for (const p of pts) if (p[0] > -200 && p[0] < W + 200 && p[1] > -200 && p[1] < H + 200)
          s += \`<circle cx="\${p[0]}" cy="\${p[1]}" r="3.6" fill="#fff" stroke="\${BLUE}" stroke-width="1.5"/>\`;
      }`,
  ],
  [
    "overlay: selection boxes with impossible geometry are not stroked",
    `            const w = f1(v.b.w);
            const h = f1(v.b.h);
            const col = v.color === "red" ? RED : BLUE;
            s += \`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" fill="none" stroke="\${col}" stroke-width="1"/>\`;`,
    `            const w = f1(v.b.w);
            const h = f1(v.b.h);
            const col = v.color === "red" ? RED : BLUE;
            // A box is a frame around something on screen. If it is not finite or
            // it is several screens wide, the anchor is stale: skip the stroke
            // instead of drawing four lines across the page.
            if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0) || w > W * 3 || h > H * 3) continue;
            s += \`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" fill="none" stroke="\${col}" stroke-width="1"/>\`;`,
  ],
  [
    "overlay: ruler connectors stay short instead of rubber-banding",
    `            if (v.rulerLines && rt > 0.05)
              s += \`<g stroke="\${BLUE}" stroke-width="1" stroke-dasharray="2 2" opacity="\${f1(rt)}"><line x1="\${RULER}" x2="\${x}" y1="\${f1(y + h / 2)}" y2="\${f1(y + h / 2)}"/><line x1="\${f1(x + w / 2)}" x2="\${f1(x + w / 2)}" y1="\${RULER}" y2="\${y}"/></g>\`;`,
    `            // A ruler connector is a short pointer, not a rubber band. When the
            // box is far from the ruler (fast scroll, off-screen anchor) the two
            // lines used to stretch across the whole page and look like a
            // rendering fault dragged along by the cursor.
            if (v.rulerLines && rt > 0.05) {
              const cx = f1(x + w / 2), cy = f1(y + h / 2);
              const nearX = Math.abs(x - RULER) < 150;
              const nearY = Math.abs(y - RULER) < 150;
              let seg = "";
              if (nearX) seg += \`<line x1="\${RULER}" x2="\${f1(x)}" y1="\${cy}" y2="\${cy}"/>\`;
              if (nearY) seg += \`<line x1="\${cx}" x2="\${cx}" y1="\${RULER}" y2="\${f1(y)}"/>\`;
              if (seg) s += \`<g stroke="\${BLUE}" stroke-width="1" stroke-dasharray="2 2" opacity="\${f1(rt)}">\${seg}</g>\`;
            }`,
  ],
  [
    "api: expose restart so SPA route changes can rebuild the view",
    `    toggle() {\n      if (app) stop(false);\n      else start();\n    },`,
    `    restart,\n    toggle() {\n      if (app) stop(false);\n      else start();\n    },`,
  ],
];

function apply(src) {
  let out = src;
  PATCHES.forEach(([why, find, rep, count], i) => {
    const n = out.split(find).length - 1;
    const want = count == null ? 1 : count;
    if (n !== want) throw new Error(`patch #${i + 1} expected ${want} hit(s), found ${n}: ${why}`);
    out = out.split(find).join(rep);
    console.log(`  ok  #${String(i + 1).padStart(2)}${count ? ` (${n}x)` : ""} ${why}`);
  });
  if (!/window\.__swarmDormant = true;/.test(out) || !/^\s{4}start\(\);$/m.test(out))
    throw new Error("auto-start missing - extension would never run");
  return out;
}

const upstream = await readFile(UPSTREAM, "utf8");
console.log(`upstream ${upstream.length} bytes, ${upstream.split("\n").length} lines`);
console.log("applying patches:");

const head = await readFile(join(here, "src", "head.js"), "utf8");
const boot = await readFile(join(here, "src", "boot.js"), "utf8");
const mask = await readFile(join(here, "src", "mask.js"), "utf8");
const body = apply(upstream);

await mkdir(OUT_DIR, { recursive: true });
await mkdir(ICON_DST, { recursive: true });

const banner = `/* Swarm Cursors - Safari Web Extension content script.
 * Native DOM tasks with the original cursor engine and renderer.
 * Generated by tools/build-extension.mjs - do not edit by hand.
 */`;

await writeFile(OUT, `${banner}\n${head}\n${boot}\n${body}`, "utf8");
await writeFile(join(OUT_DIR, "mask.js"), `/* Swarm Cursors - element mask. Generated - do not edit. */\n${mask}`, "utf8");

for (const f of ["icon16.png", "icon32.png", "icon48.png", "icon128.png"]) {
  await copyFile(join(ICON_SRC, f), join(ICON_DST, f));
}

console.log(`\nwrote ${OUT}`);
console.log(`wrote ${join(OUT_DIR, "mask.js")}`);
console.log(`copied 4 icons -> ${ICON_DST}`);
