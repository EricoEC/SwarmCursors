/*
 * Safari Web Extension — runtime config + localization table.
 *
 * Runs before the engine body. background.js pre-injects:
 *   window.__SWARM_CFG
 *   window.__SWARM_LANG
 *   window.__swarmSpeed
 *   window.__swarmSound
 */
(() => {
  "use strict";

  const EN = {
    scanning: "Scanning page…",
    tour: "Tour",
    touring: "Touring",
    tourTitle: "Scroll automatically during animation",
    speedTitle: "Animation speed",
    soundTitle: "Sound (M)",
    soundOn: "Sound on (M)",
    soundOff: "Sound off (M)",
    soundTap: "Enable sound",
    live: "View page",
    liveTitle: "Restore normal page display",
    replay: "Replay",
    replayTitle: "Replay the page animation",
    closeTitle: "Exit (Esc)",
    agentsReady: "cursors ready",
    agents: "cursors",
    layers: "{0} layers",
    scrollHint: "Scroll to continue",
    rebuilt: "Complete · {0} cursors · {1}s"
  };

  const ZH = {
    scanning: "正在分析页面…",
    tour: "自动漫游",
    touring: "漫游中",
    tourTitle: "播放动画时自动滚动页面",
    speedTitle: "动画速度",
    soundTitle: "声音 (M)",
    soundOn: "声音已开 (M)",
    soundOff: "声音已关 (M)",
    soundTap: "启用音效",
    live: "回到网页",
    liveTitle: "恢复网页正常显示",
    replay: "重播",
    replayTitle: "重新播放网页动画",
    closeTitle: "退出 (Esc)",
    agentsReady: "个光标就绪",
    agents: "个光标",
    layers: "{0} 层",
    scrollHint: "滚动以继续播放",
    rebuilt: "绘制完成 · {0} 个光标 · {1} 秒"
  };

  const tag = String(window.__SWARM_LANG || navigator.language || "en").toLowerCase();
  window.__SWARM_L10N = tag.indexOf("zh") === 0 ? ZH : EN;

  /* Touch devices may reduce capture budgets, never the selected worker count. */
  const TOUCH =
    (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
    "ontouchstart" in window;

  window.__applyParsedConfig = function(payload) {
    if (!payload) return false;
    if(Number.isFinite(payload.settingsUpdatedAt)) {
      if(payload.settingsUpdatedAt < (window.__swarmConfigRevision || 0))return false;
      window.__swarmConfigRevision=payload.settingsUpdatedAt;
    }
    if (!payload.cfg && typeof payload.agents === "number") {
      const count = Math.min(100, Math.max(6, Math.round(payload.agents)));
      payload = {...payload, cfg: payload.autoAgents === false
        ? {minAgents:count, maxAgents:count, flockAgents:count, introAgents:count}
        : {minAgents:2, maxAgents:16, flockAgents:4, introAgents:4}};
    }
    if (payload.cfg) {
      const cfg = Object.assign({}, payload.cfg);
      if (TOUCH) {
        cfg.maxItems = Math.min(cfg.maxItems || 1600, 1600);
        cfg.maxScanNodes = Math.min(cfg.maxScanNodes || 8000, 8000);
      }
      window.__SWARM_CFG = Object.assign(window.__SWARM_CFG || {}, cfg);
    }
    if (typeof payload.speed === "number") window.__swarmSpeed = payload.speed;
    if (typeof payload.sound === "boolean") window.__swarmSound = payload.sound;
    if (typeof payload.lang === "string" && payload.lang) {
      window.__SWARM_LANG = payload.lang;
      window.__SWARM_L10N = payload.lang.toLowerCase().indexOf("zh") === 0 ? ZH : EN;
    }
    return true;
  };

  window.__syncSwarmSettings = async function syncSwarmSettings() {
    try {
      const api = globalThis.browser || globalThis.chrome;
      if (api && api.runtime && api.runtime.sendMessage) {
        const res = await new Promise((resolve) => {
          const pending = api.runtime.sendMessage({ type: "getSettings" }, (r) => {
            resolve(api.runtime.lastError ? null : r);
          });
          if (pending && typeof pending.then === "function") pending.then(resolve).catch(() => resolve(null));
          setTimeout(() => resolve(null), 900);
        });
        if (res) {
          if (typeof res.enabled === 'boolean') window.__swarmReceiveState?.(res.enabled, res.enabledUpdatedAt);
          window.__applyParsedConfig(res);
          return;
        }
      }
      if (api && api.storage && api.storage.local) {
        const got = await api.storage.local.get("swarmSettings");
        const s = got && got.swarmSettings;
        if (s) {
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
          window.__applyParsedConfig({
            cfg: { minAgents, maxAgents, flockAgents, introAgents, maxItems: 4000, maxScanNodes: 20000 },
            speed: Number(s.speed) || 1,
            sound: s.sound !== false,
            lang: s.lang || ""
          });
        }
      }
    } catch (_) {}
  };

  const base = {
    minAgents: 2,
    maxAgents: 16,
    flockAgents: 4,
    introAgents: 4,
    maxItems: 4000,
    maxScanNodes: 20000
  };
  window.__SWARM_CFG = Object.assign(base, window.__SWARM_CFG || {});
})();
