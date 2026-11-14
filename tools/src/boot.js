/* Original visual model, task generators and renderer; native DOM is the final
 * surface. Only provenance, live geometry and transactional handoff live here. */
(() => {
  'use strict';
  const mask = window.__swarmMask;
  let app = null, lastDiscovery = -Infinity, nextTask = 0;
  const buckets = new Set();
  const emptyModel = () => ({items:[],tasks:[],groups:[],guides:[],docW:0,docH:0});
  const point = (E, el, layer='world') => {
    const b=mask.bounds(el),v=E.vp;
    return {x:b.left+(layer==='world'?v.sx-v.ox:0),y:b.top+(layer==='world'?v.sy-v.oy:0),w:b.width,h:b.height};
  };
  const visible = el => el?.isConnected && mask.isVisible(el);
  function itemsOf(t) { return t.spec.it ? [t.spec.it] : t.spec.type==='dup' ? t.spec.g.dst[t.spec.k].items : []; }
  function tokensOf(t) { return [...new Set(itemsOf(t).flatMap(it=>it.nativeTokens||[]))]; }
  function current(t) {
    return tokensOf(t).every(mask.current) && itemsOf(t).every(it=>it.nativeSource?.isConnected) &&
      (!t.nativeSources || t.nativeSources.every(mask.current));
  }
  function exposed(it) {
    for(let el=it.nativeSource;el;el=el.parentElement||el.getRootNode()?.host) {
      const r=mask.record(el);
      if(el.hasAttribute('data-swarm-pending') && !r?.drawn)return false;
    }
    return true;
  }
  function retire(it) { it.nativeSkip=true;it.node?.remove(); }
  function cancel(t) {
    for(const token of tokensOf(t))mask.retry(token);
    for(const it of itemsOf(t))retire(it);
  }
  function settle() {
    for(const b of buckets) {
      if(!mask.current(b.token) || b.token.record.drawn) { buckets.delete(b);continue; }
      if(b.items.every(it=>it.done || it.twinOf?.done)) {
        if(mask.commit(b.token)){buckets.delete(b);for(const it of b.items)if(it.nativeTokens.every(t=>!mask.current(t)||t.record.drawn)&&exposed(it))retire(it);}
      }
    }
  }
  function* run(E,c,t,original) {
    const list=itemsOf(t),first=list.find(it=>it.nativeTokens?.length)||list[0];
    if(first)c.nativeAnchor={el:first.nativeSource,layer:first.layer,...point(E,first.nativeSource,first.layer)};
    const gen=original();
    try {
      let input;
      for(;;) {
        if(!current(t) || list.some(it=>!visible(it.nativeSource))) {cancel(t);return;}
        const step=gen.next(input);
        if(step.done)break;
        input=yield step.value;
      }
      settle();
    } finally {
      c.nativeAnchor=null;
    }
  }
  function addGeometry(E,it) {
    const p=point(E,it.nativeSource,it.layer);
    it.nativeGeometry={p,x:it.x,y:it.y,tb:it.tb?{...it.tb}:null,pts:it.pts?.map(p=>({...p}))};
  }
  function updateGeometry(E,it) {
    const g=it.nativeGeometry;if(!g || !it.nativeSource.isConnected)return;
    const p=point(E,it.nativeSource,it.layer),dx=p.x-g.p.x,dy=p.y-g.p.y;
    if(it.x!==g.x+dx || it.y!==g.y+dy) {
      it.x=g.x+dx;it.y=g.y+dy;
      if(g.tb){it.tb.x=g.tb.x+dx;it.tb.y=g.tb.y+dy;}
      if(g.pts)it.pts=g.pts.map(q=>({x:q.x+dx,y:q.y+dy}));
      it.v++;
    }
  }
  function discover(E,jobs) {
    if(!jobs.length){mask.ready();return;}
    const model=mask.measure(()=>window.__swarmRebuild.debug.captureModel(app.env,null));
    const byEl=new Map();
    const associate=(el,it)=>{if(!el || el.nodeType!==1)return;if(!byEl.has(el))byEl.set(el,new Set());byEl.get(el).add(it)};
    for(const it of model.items) {
      // Editing values stay native; only the form's appearance is animated.
      if(it.kind==='text' && mask.editorRoot(it.nativeSource))continue;
      associate(it.nativeSource,it);
      for(const node of it.nativeCovers||[])if(node.nodeType===1) {
        associate(node,it);for(const child of node.querySelectorAll('*'))associate(child,it);
      }
      it.nativeTokens=[];
    }
    for(const r of jobs) {
      const owners=[...(byEl.get(r.el)||[])];
      if(!owners.length) {mask.structural(r);continue;}
      const token=mask.claim(r),bucket={token,items:owners};buckets.add(bucket);
      for(const it of owners)it.nativeTokens.push(token);
    }
    const needed=new Set();
    for(const t of model.tasks) {
      if(itemsOf(t).some(it=>it.nativeTokens?.length))needed.add(t);
    }
    for(const g of model.guides)if(g.deps.some(t=>needed.has(t)))needed.add(g.task);
    const prior=E.tasks.filter(t=>t.state!=='done');
    for(const t of model.tasks) {
      if(!needed.has(t)){t.state='done';t.doneAt=E.time;continue;}
      if(t.spec.type==='dup') {
        const source=gTokens(t.spec.g.src.items);
        t.nativeSources=source;
        // A newly inserted copy can depend on a master already being drawn by
        // an earlier incremental batch, without drawing that master twice.
        const src=new Set(t.spec.g.src.items.map(it=>it.nativeSource));
        for(const old of prior)if(itemsOf(old).some(it=>src.has(it.nativeSource)))t.deps.push(old);
      }
      t.id=nextTask++;t.gate=-Infinity;E.tasks.push(t);E.waitCount++;
    }
    const referenced=new Set();
    for(const t of needed) {
      for(const it of itemsOf(t))referenced.add(it);
      if(t.spec.type==='dup')for(const it of t.spec.g.src.items)referenced.add(it);
    }
    for(const it of referenced) {
      it.nativeSkip=!it.nativeTokens?.length;
      const node=app.view.makeNode(it);
      if(!it.nativeSkip){(it.layer==='world'?app.view.world:app.view[it.layer]).append(node);E.items.push(it);}
      addGeometry(E,it);
    }
    for(const g of model.groups) {
      g.src.nativeEl=g.master.el;g.src.nativeLayer=g.master.layer;
      for(let i=0;i<g.dst.length;i++){g.dst[i].nativeEl=g.copies[i].el;g.dst[i].nativeLayer=g.copies[i].layer;}
      E.groups.push(g);
    }
    for(const g of model.guides)if(needed.has(g.task)) {E.guides.push(g);E.guideDeps.set(g,g.deps);}
    mask.ready();
    if(needed.size) {
      E.flocking=false;app.complete=false;
      for(const c of E.cursors)if(!c.task){c.follow=false;c.gen=null;c.leaving=false;}
    }
    // Resolve paintless wrappers immediately, never with a fake cursor box.
    settle();
  }
  function gTokens(items) {
    const out=[];
    for(const it of items){const r=mask.record(it.nativeSource);if(r)out.push(mask.snapshot(r));}
    return out;
  }
  window.__swarmNative={
    canPick(E) {
      const cfg=window.__SWARM_CFG||{};
      return cfg.minAgents===cfg.maxAgents || E.cursors.filter(c=>c.task).length<(E.nativeBudget||cfg.maxAgents);
    },
    idleTarget(E) { return window.__swarmNative.workerTarget(E); },
    workerTarget(E) {
      const cfg=window.__SWARM_CFG||{};
      return cfg.minAgents===cfg.maxAgents ? cfg.maxAgents : (E.nativeCrew||cfg.introAgents);
    },
    frameCost(E, ms) {
      const cfg=window.__SWARM_CFG||{};
      E.nativeFrameCost=(E.nativeFrameCost||0)*.9+ms*.1;
      if(cfg.minAgents===cfg.maxAgents)return;
      E.nativeBudget=Math.min(E.nativeBudget||cfg.maxAgents,cfg.maxAgents);
      E.nativeSlowFrames=ms>6?(E.nativeSlowFrames||0)+1:Math.max(0,(E.nativeSlowFrames||0)-1);
      if(E.nativeSlowFrames>=3){
        E.nativeBudget=Math.max(cfg.minAgents,Math.floor(E.nativeBudget*.75));
        E.nativeBudgetAt=E.time;E.nativeSlowFrames=0;
      }else if(E.nativeFrameCost<2 && E.time-(E.nativeBudgetAt||0)>2){
        E.nativeBudget=Math.min(cfg.maxAgents,E.nativeBudget+1);E.nativeBudgetAt=E.time;
      }
    },
    prepare(a) {
      app=a;lastDiscovery=-Infinity;nextTask=0;buckets.clear();
      const E=a.engine,originalRun=E.run,originalMove=E.moveTo;
      E.run=(c,t)=>run(E,c,t,()=>originalRun.call(E,c,t));
      E.moveTo=function*(c,target,options={}) {
        const anchor=c.nativeAnchor;
        if(!anchor){yield* originalMove.call(E,c,target,options);return;}
        const at=()=>point(E,anchor.el,anchor.layer),p=at();
        const fixed=typeof target==='function'?null:{x:target.x-p.x,y:target.y-p.y};
        const proxy={get x(){return c.x-at().x},set x(x){c.x=x+at().x},get y(){return c.y-at().y},set y(y){c.y=y+at().y}};
        yield* originalMove.call(E,proxy,()=>{if(fixed)return fixed;const p=at(),q=target();return{x:q.x-p.x,y:q.y-p.y}},options);
      };
      return emptyModel();
    },
    beforeStep(E) {
      if(!E.ready || !mask.alive)return;
      mask.beginFrame(E.time);
      for(const c of E.cursors) {
        const a=c.nativeAnchor;
        if(c.task && a && a.el.isConnected){const p=point(E,a.el,a.layer);c.x+=p.x-a.x;c.y+=p.y-a.y;Object.assign(a,p);}
      }
      for(const it of E.items)updateGeometry(E,it);
      E.groups=E.groups.filter(g=>g.dst.some(d=>d.task.state!=='done'));
      for(const g of E.groups)for(const p of [g.src,...g.dst])if(p.nativeEl?.isConnected)Object.assign(p.box,point(E,p.nativeEl,p.nativeLayer));
      for(const t of E.tasks)if(t.state==='wait' && !current(t)){cancel(t);t.state='done';E.waitCount--;}
      settle();
      // Handoff both surfaces in the same tick; the native surface keeps its
      // authored visibility and clipping when our paint mask is removed.
      for(const it of E.items)if(it.nativeTokens?.every(t=>!mask.current(t)||t.record.drawn)&&exposed(it))retire(it);
      E.items=E.items.filter(it=>!it.nativeSkip);
      const cfg=window.__SWARM_CFG||{},manual=cfg.minAgents===cfg.maxAgents;
      if(manual) {
        while(E.cursors.length<cfg.maxAgents){const c=E.makeCursor(E.vp.sx+E.vp.vw/2,E.vp.sy+E.vp.vh/2);c.follow=!E.started||E.flocking;E.cursors.push(c)}
      }
      // Returning from a larger manual count obeys the upstream automatic
      // ceiling; ordinary automatic spawning/retirement is otherwise untouched.
      for(let i=E.cursors.length-1;E.cursors.length>cfg.maxAgents&&i>=0;i--)if(!E.cursors[i].task)E.cursors.splice(i,1);
      if(!manual) {
        const key=[cfg.minAgents,cfg.maxAgents,cfg.introAgents].join(':');
        if(E.nativeCrewKey!==key) {
          E.nativeCrewKey=key;E.nativeCrew=null;
          E.nativeCrew=Math.min(cfg.maxAgents,Math.max(cfg.introAgents,Math.ceil(Math.sqrt(Math.max(1,E.tasks.length))/1.5)));
        }
        // Estimate before work begins; sustained executable backlog may add help.
        if(!E.started && !E.tasks.length && mask.dirty) {
          lastDiscovery=E.time;discover(E,mask.collect());
          E.nativeCrew=Math.min(cfg.maxAgents,Math.max(cfg.introAgents,Math.ceil(Math.sqrt(Math.max(1,E.tasks.length))/1.5)));
        }
        if(E.started && E.time-(E.nativeDemandAt||0)>=.25) {
          E.nativeDemandAt=E.time;
          const busy=E.cursors.filter(c=>c.task).length,ready=E.available().length;
          const capacity=Math.min(cfg.maxAgents,E.nativeBudget||cfg.maxAgents);
          const overloaded=!E.flocking && busy>=E.nativeCrew-1 && ready>=E.nativeCrew && E.nativeCrew<capacity;
          if(!overloaded)E.nativeBacklogAt=null;
          else if(E.nativeBacklogAt==null)E.nativeBacklogAt=E.time;
          else if(E.time-E.nativeBacklogAt>=.8) {
            E.nativeCrew=Math.min(capacity,E.nativeCrew+2);
            E.nativeBacklogAt=null;
          }
        }
        const target=E.nativeCrew;
        while(!E.started&&E.cursors.length<target){const c=E.makeCursor(E.vp.sx+E.vp.vw/2,E.vp.sy+E.vp.vh/2);c.follow=!E.started||E.flocking;E.cursors.push(c)}
        for(let i=E.cursors.length-1;E.cursors.length>target&&i>=0;i--)if(!E.cursors[i].task)E.cursors.splice(i,1);
      } else E.nativeCrewKey=null;
      if(mask.dirty && E.time-lastDiscovery>=.15) {
        lastDiscovery=E.time;discover(E,mask.collect());
      }
      if(E.tasks.length>1000)E.tasks=E.tasks.filter(t=>t.state!=='done');
      if(E.time-(E.nativeSweepAt||0)>1) {
        E.nativeSweepAt=E.time;
        E.guides=E.guides.filter(g=>{
          const expired=g.task.state==='done'&&(!g.vis||g.op<=.001)&&(g.deps||[]).every(t=>t.state==='done');
          if(expired)E.guideDeps.delete(g);return !expired;
        });
      }
      if(E.groups.length>128)E.groups=E.groups.filter(g=>g.dst.some(d=>d.task.state!=='done'));
    }
  };
  window.__swarmApplyConfig=data=>{
    if(!data || window.__applyParsedConfig(data)===false)return;
    window.__swarmConfigStatus={source:data.bridgeSource||'runtime',speed:window.__swarmSpeed,cfg:{...window.__SWARM_CFG},revision:window.__swarmConfigRevision||0};
    if(app?.engine && [1,2,3].includes(data.speed))app.engine.speed=data.speed;
    if(app?.sfx && typeof data.sound==='boolean')app.sfx.setOn(data.sound);
  };
  const api=globalThis.browser||globalThis.chrome;
  api?.runtime?.onMessage?.addListener(msg=>{if(msg?.type==='SWARM_CONFIG_UPDATE')window.__swarmApplyConfig(msg.payload)});
})();
