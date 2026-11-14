/* Native content stays hidden until its owning cursor task commits it.
 * There is no timed sweep, stalled-build release, or end-of-build unmask. */
(() => {
  "use strict";
  if (window.__swarmMask) return;
  const api = globalThis.browser || globalThis.chrome;
  const ROOT = "__swarm-hiding", DRAWN = "__swarm-drawn";
  const PENDING = 'data-swarm-pending';
  const EDITOR_READY = 'data-swarm-editor-ready';
  let enabled = false, active = false, epoch = 0, dirty = true, measuring = 0;
  let heartbeat = 0, stateGeneration = 0, lastRevision = -1;
  const records = new Map(), shadows = new Map();
  let captureNodes = new WeakSet();
  const pendingReveals = new Set();
  const styles = new Set(), motionStyles = new Set();
  const motionVar = "--__swarm-native-transition";
  let styleCache = null, boxCache = null, liveStyles = new WeakMap();
  let frameID = -1;
  const styleOf = el => {
    const cache=styleCache || liveStyles;
    if (!cache.has(el)) cache.set(el, getComputedStyle(el));
    return cache.get(el);
  };
  function bounds(el) {
    if (boxCache?.has(el)) return boxCache.get(el);
    let b = el.getBoundingClientRect();
    if ((!b.width || !b.height) && el.childNodes.length) {
      const rects = [];
      for (const node of el.childNodes) if (node.nodeType === 3 && node.data.trim()) {
        const range = document.createRange(); range.selectNodeContents(node); rects.push(...range.getClientRects());
      }
      if (rects.length) {
        const left = Math.min(...rects.map(r=>r.left)), top = Math.min(...rects.map(r=>r.top));
        const right = Math.max(...rects.map(r=>r.right)), bottom = Math.max(...rects.map(r=>r.bottom));
        b = {left, top, right, bottom, width:right-left, height:bottom-top};
      }
    }
    boxCache?.set(el, b); return b;
  }
  // Mask paint only. Native visibility/opacity and innerText keep their authored
  // semantics, including site scripts that inspect them before filling a popup.
  const paintMask = '-webkit-mask-image:linear-gradient(transparent,transparent)!important;mask-image:linear-gradient(transparent,transparent)!important';
  const css = `html.__swarm-boot body,html.${ROOT} [${PENDING}]{${paintMask}}`;
  const shadowCSS = `[${PENDING}]{${paintMask}}`;
  const stats = window.__swarmStats = { committed: 0, invalidated: 0, queued: 0 };
  const ours = el => !!(el && (el.closest?.('swarm-rebuild,[data-swarm-host]') || (el.id === '__swarm-mask' || el.id === '__swarm-measure')));
  function install(root) {
    if (root !== document && shadows.has(root)) return;
    const style = document.createElement('style');
    style.textContent = root === document ? css : shadowCSS;
    if (root === document) style.id = '__swarm-mask';
    (root === document ? document.head || document.documentElement : root).append(style);
    styles.add(style);
    if (style.sheet) style.sheet.disabled = !active || measuring > 0;
    if (root !== document) shadows.set(root, style);
    if (active) observeRoot(root);
  }
  function observeRoot(root) {
    const target = root === document ? document.documentElement : root;
    if (!target) return;
    observer.observe(target, {
      subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,
      attributeFilter:['class','style','hidden','open','src','value','aria-expanded']
    });
  }
  function startHeartbeat() {
    if (!heartbeat && active) heartbeat = setInterval(() => {
      if (document.hidden) return;
      // Events cover settled pages. Poll only unfinished visible work, rather
      // than rescanning a large, already-complete DOM indefinitely.
      for (const r of records.values()) if (!r.drawn && r.nativeVisible) {
        const b=r.el.getBoundingClientRect();
        if(b.width>0&&b.height>0&&b.bottom>0&&b.top<innerHeight&&b.right>0&&b.left<innerWidth){dirty=true;break;}
      }
    },1500);
  }

  function measure(fn) {
    if (measuring) return fn();
    measuring++;

    const sheets = [...styles].map(s => s.sheet).filter(Boolean);
    for (const s of sheets) s.disabled = true;
    try { return fn(); } finally { measuring--; for (const s of styles) if (s.sheet) s.sheet.disabled = !active || measuring > 0; }
  }
  function editorRoot(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|file|range|color|image|hidden)$/i.test(el.type))) return el;
    if (!el.isContentEditable) return null;
    let root = el;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }
  function invalidate(el, contentOnly = false) {
    const r = records.get(el);
    const editor = contentOnly && editorRoot(el);
    if (editor) {
      // The editor's first appearance is still a cursor job. Once drawn,
      // changing its contents must never hide it and cancel native IME/focus.
      if (!records.get(editor)?.drawn) el.setAttribute(PENDING,'');
      if (records.get(editor)?.drawn) {
        el.removeAttribute(PENDING);el.classList.add(DRAWN);
        if (r && !r.drawn) { r.version++; r.pending = false; r.drawn = true; }
      }
      dirty = true;
      return;
    }
    if (r) { r.version++; r.pending = false; r.drawn = false; stats.invalidated++; }
    el?.classList?.remove(DRAWN);
    if(active && el?.nodeType===1 && !ours(el))el.setAttribute(PENDING,'');
    el?.removeAttribute?.(EDITOR_READY);
    dirty = true;
  }
  function originalVisible(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement || n.getRootNode()?.host) {
      const cs = styleOf(n);
      if (cs.display === 'none' || cs.contentVisibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    return styleOf(el).visibility === 'visible';
  }
  function clippedVisible(el) {
    const r = bounds(el);
    let l = Math.max(0, r.left), t = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
    for (let n = el.parentElement || el.getRootNode()?.host; n && n.nodeType === 1; n = n.parentElement || n.getRootNode()?.host) {
      const s = styleOf(n), b = bounds(n);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { l = Math.max(l, b.left); right = Math.min(right, b.right); }
      if (/(hidden|clip|auto|scroll)/.test(s.overflowY)) { t = Math.max(t, b.top); bottom = Math.min(bottom, b.bottom); }
    }
    return right > l && bottom > t;
  }
  function collect() {
    if (!active || !document.body) return [];
    const out = [];
    captureNodes = new WeakSet();
    styleCache = new WeakMap(); boxCache = new WeakMap();
    try { measure(() => {
      const scan = root => {
        for (const el of [ ...(root === document.body ? [root] : []), ...root.querySelectorAll('*')]) {
          if (ours(el) || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
          if (el.shadowRoot) { install(el.shadowRoot); scan(el.shadowRoot); }
          let r = records.get(el);
          const b = bounds(el);
          if (r?.drawn && (!b.width || !b.height)) invalidate(el);
          if (b.width <= 0 || b.height <= 0 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) continue;
          const sig = (editorRoot(el) ? '' : [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('') + ('value' in el ? el.value : '')) + (el.getAttribute('src') || '');
          if (r && r.signature !== sig) invalidate(el, true);
          if (r) r.signature = sig;
          if (!originalVisible(el)) { if (r?.nativeVisible) invalidate(el); if (r) r.nativeVisible = false; el.removeAttribute(PENDING); continue; }
          if (!clippedVisible(el)) continue;
          if (el.tagName === 'IMG' && (!el.complete || !el.naturalWidth)) continue;
          if (el.tagName === 'VIDEO' && !el.readyState) continue;
          if (!r) { r = { el, version: 0, pending: false, drawn: el.classList.contains(DRAWN), signature: sig }; records.set(el, r); }
          r.nativeVisible = true;
          for(let n=el;n&&!captureNodes.has(n);n=n.parentElement||n.getRootNode()?.host)captureNodes.add(n);
          r.clips = [];
          for (let n = el.parentElement || el.getRootNode()?.host; n && n.nodeType === 1; n = n.parentElement || n.getRootNode()?.host) {
            const cs = styleOf(n);
            const x = /(hidden|clip|auto|scroll)/.test(cs.overflowX), y = /(hidden|clip|auto|scroll)/.test(cs.overflowY);
            if (x || y) r.clips.push({el:n, x, y});
          }
          const cs = styleOf(el);
          r.copyStyleKey=[cs.background,cs.border,cs.borderRadius,cs.boxShadow,cs.color,cs.font].join('|');
          r.visual = cs.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)', 'transparent'].includes(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0 || /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|BUTTON|SELECT)$/.test(el.tagName);
          if (!r.drawn) el.setAttribute(PENDING,'');
          if (!r.drawn && !r.pending) out.push(r);
        }
      };
      scan(document.body);
    }); } finally { styleCache = null; }
    for (const [el] of records) if (!el.isConnected) records.delete(el);
    for (const [sr, style] of shadows) if (!sr.host.isConnected) {
      style.remove(); styles.delete(style); shadows.delete(sr);
      const m=sr.querySelector('#__swarm-measure');if(m){motionStyles.delete(m);m.remove();}
    }
    dirty = false;
    return out;
  }
  function isVisible(el) {
    const r = records.get(el);
    if (!r?.nativeVisible || !el.isConnected || !originalVisible(el)) return false;
    const b = bounds(el);
    let l=Math.max(0,b.left), top=Math.max(0,b.top), right=Math.min(innerWidth,b.right), bottom=Math.min(innerHeight,b.bottom);
    for (const clip of r.clips || []) {
      const q = bounds(clip.el);
      if (clip.x) { l=Math.max(l,q.left); right=Math.min(right,q.right); }
      if (clip.y) { top=Math.max(top,q.top); bottom=Math.min(bottom,q.bottom); }
    }
    return right>l && bottom>top;
  }
  function claim(r) { r.pending = true; stats.queued++; return { record: r, version: r.version, epoch }; }
  function current(token) {
    return !!(token && token.epoch === epoch && token.record.version === token.version && token.record.el.isConnected);
  }
  function retry(token) {
    if (!current(token)) return;
    token.record.version++; token.record.pending = false;
    dirty = true;
  }
  function commit(token) {
    const r = token?.record;
    if (!active || !r || token.epoch !== epoch || r.version !== token.version || !r.el.isConnected) return false;
    // A task that scrolled away must be redrawn at its current screen position.
    const b = bounds(r.el);
    if (b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth || !isVisible(r.el)) { retry(token); return false; }
    pendingReveals.add(token); r.drawn = true; r.pending = false; stats.committed++;
    // A framework can replace className and force layout before our observer
    // runs. Keep an already-drawn editor focusable throughout that transaction.

    return true;
  }
  function flush() {
    for(const token of pendingReveals)if(active && current(token)) {
      const el=token.record.el;el.removeAttribute(PENDING);el.classList.add(DRAWN);
      if(editorRoot(el)===el)el.setAttribute(EDITOR_READY,'');
    }
    pendingReveals.clear();
  }
  const cleanClass = s => (s || '').split(/\s+/).filter(s => s && s !== DRAWN).sort().join(' ');
  const observer = new MutationObserver(ms => {
    if (!active) return;
    for (const m of ms) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!el || el === document.documentElement || ours(el)) continue;
      if (m.type === 'attributes' && m.attributeName === 'class') {
        // Frameworks often replace className while updating suggestion rows.
        // Losing only our marker must not leave already-drawn text hidden.
        if (records.get(el)?.drawn && !el.classList.contains(DRAWN)) el.classList.add(DRAWN);
        if (cleanClass(m.oldValue) === cleanClass(el.getAttribute('class'))) continue;
      }
      if(m.type==='attributes' && m.attributeName==='style') {
        const clean=s=>(s||'').replace(/--__swarm-[\w-]+\s*:[^;]*(?:;|$)/g,'').replace(/\s/g,'');
        if(clean(m.oldValue)===clean(el.getAttribute('style')))continue;
      }
      if (m.type === 'characterData') invalidate(el, true);
      else if (m.type === 'childList') {
        // Own text may change without changing the parent element identity.
        if ([...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 3)) invalidate(el, true);
        for (const n of m.addedNodes) if (n.nodeType === 1 && !ours(n)) {
          invalidate(n, true);
          for (const child of n.querySelectorAll('*')) invalidate(child, true);
        }
      } else if (['src', 'value'].includes(m.attributeName)) {
        invalidate(el, m.attributeName === 'value');
      } else if (m.type === 'attributes' && !records.get(el)?.drawn) {
        // A previously hidden, existing popup needs coverage in the mutation
        // transaction, before the next discovery frame, without changing the
        // site's authored visibility or its input values.
        el.setAttribute(PENDING,'');
      }
      dirty = true;
    }
  });
  function setEnabled(value) {
    enabled = value !== false; window.__swarmEnabled = enabled;
    if (enabled === active) return;
    active = enabled; epoch++;
    observer.disconnect();
    if (heartbeat) { clearInterval(heartbeat); heartbeat = 0; }
    document.documentElement?.classList.toggle(ROOT, active);
    document.documentElement?.classList.toggle('__swarm-boot', active);
    for (const s of [...styles,...motionStyles]) if (s.sheet) s.sheet.disabled = !active;
    for (const [el] of records) { el.classList.remove(DRAWN); el.removeAttribute(PENDING); el.removeAttribute(EDITOR_READY); el.style.removeProperty(motionVar); }
    records.clear(); dirty = true;
    if (active) { observeRoot(document); for(const sr of shadows.keys())observeRoot(sr); startHeartbeat(); }
    const a = window.__swarmRebuild;
    if (!active) { const host=a?.app?.view?.host; a?.stop(false); host?.remove(); } else if (a && !a.app) a.start();
  }
  window.__swarmEnabled = false;
  window.__swarmSetEnabled = setEnabled;
  function receiveState(value, revision) {
    if (Number.isFinite(revision)) {
      if (revision < lastRevision) return;
      lastRevision = revision;
    }
    stateGeneration++;
    setEnabled(value);
  }
  window.__swarmReceiveState = receiveState;
  const initialGeneration = stateGeneration;
  window.__swarmSettingsP = (async () => {
    try {
      const s = await api?.runtime?.sendMessage({type:'getSettings'});
      if (stateGeneration === initialGeneration && typeof s?.enabled === 'boolean') receiveState(s.enabled, s.enabledUpdatedAt);
      return s || null;
    } catch (_) { return null; }
  })();
  (async () => {
    try {
      const [a,b]=await Promise.all([api?.storage?.local?.get('swarmEnabled'),api?.storage?.local?.get('swarmEnabledUpdatedAt')]);
      if (stateGeneration === initialGeneration && typeof a?.swarmEnabled === 'boolean') receiveState(a.swarmEnabled,b?.swarmEnabledUpdatedAt);
    } catch (_) {}
  })();
  api?.runtime?.onMessage?.addListener(m=>{if(m?.type==='swarm:enabled')receiveState(m.enabled,m.revision)});
  api?.storage?.onChanged?.addListener((changes,area)=>{
    if(area==='local' && typeof changes.swarmEnabled?.newValue==='boolean')
      receiveState(changes.swarmEnabled.newValue,changes.swarmEnabledUpdatedAt?.newValue);
  });
  // iOS has no SafariServices app->extension dispatch. One visible top-frame
  // settings heartbeat lets shared-container changes reach the worker; it does
  // no DOM work, including while OFF. Background broadcasts to all frames.
  let settingsPolling = false;
  async function pollSettings() {
    if (window.top !== window || document.hidden || settingsPolling || !api?.runtime?.sendMessage) return;
    settingsPolling = true;
    const generation = stateGeneration;
    try {
      const s = await Promise.race([
        api.runtime.sendMessage({type:'getSettings'}),
        new Promise(resolve=>setTimeout(()=>resolve(null),1200))
      ]);
      if(s?.cfg)window.__swarmApplyConfig?.(s);
      if (generation === stateGeneration && typeof s?.enabled === 'boolean' && Number.isFinite(s.enabledUpdatedAt))
        receiveState(s.enabled,s.enabledUpdatedAt);
    } catch (_) {} finally { settingsPolling = false; }
  }
  if (window.top === window) {
    setInterval(pollSettings,2000);
    document.addEventListener('visibilitychange',pollSettings);
  }
  window.__swarmMask = {
    get alive() { return active; }, get dirty() { return dirty; }, get drawn() { return stats.committed; },
    get queueLength() { return [...records.values()].filter(r => !r.drawn).length; },
    measure, collect, claim, commit, bounds, editorRoot, current, retry, flush,
    shouldCapture(el) { return captureNodes.has(el); },
    ready() { document.documentElement.classList.remove('__swarm-boot'); },
    structural(r) { r.drawn=true; r.pending=false; r.el.removeAttribute(PENDING); r.el.classList.add(DRAWN); },
    record(el) { return records.get(el); },
    snapshot(r) { return {record:r,version:r.version,epoch}; },
    isVisible,
    beginFrame(id) { if (id !== frameID) { frameID = id; boxCache = new WeakMap(); liveStyles = new WeakMap(); } },
    finish() { setEnabled(false); },
    remask() { epoch++; for (const [el] of records) { el.classList.remove(DRAWN); el.removeAttribute(PENDING); el.removeAttribute(EDITOR_READY); el.style.removeProperty(motionVar); } records.clear(); dirty = true; },
    cover() {}, refit() {},
  };
  function boot() { document.documentElement.classList.toggle(ROOT,active); document.documentElement.classList.toggle('__swarm-boot',active); install(document); startHeartbeat(); }
  if (document.documentElement) boot(); else document.addEventListener('readystatechange', boot, {once:true});
  window.addEventListener('scroll', () => { dirty = true; }, {capture:true, passive:true});
  window.addEventListener('resize', () => { dirty = true; }, {passive:true});
  window.addEventListener('pageshow', () => { dirty = true; });
  // CSS animation, delayed visibility, canvas/media readiness, and font changes
  // can produce content without a DOM mutation. Scanning never reveals content.
  for (const name of ['load', 'transitionstart', 'transitionend', 'animationstart', 'animationend', 'pointerover', 'focusin', 'input', 'change'])
    document.addEventListener(name, () => { if (active) dirty = true; }, {capture:true, passive:true});
  startHeartbeat();
})();
