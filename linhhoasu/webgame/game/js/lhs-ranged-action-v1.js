/* Map ranged-action lifecycle repair. No RPC, ownership, damage or RNG changes. */
(function (root) {
  'use strict';
  if (root.LhsRangedActionV1) return;
  var api = root.LhsRangedActionV1 = { version:'20260908_ranged_action_v1', installed:false, counts:{} };
  var active = [], warned = {}, serial = 0;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function now() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
  function hidden() { return !!(root.document && root.document.hidden); }
  function note(code) {
    api.counts[code] = (api.counts[code] || 0) + 1;
    var time = now();
    if (warned[code] == null || time - warned[code] >= 5000) {
      warned[code] = time;
      if (root.console) root.console.warn('[LHS ranged] ' + code);
    }
  }
  function visual(code, fn) { try { return fn(); } catch (_) { note(code); return null; } }
  function updateClock(s) {
    var time = now(), paused = hidden();
    s.delta = !paused && !s.paused ? Math.max(0, time - s.last) : 0;
    s.elapsed += s.delta; s.last = time; s.paused = paused;
  }
  function current(s) {
    var m = manager();
    return !!(s && !s.cancelled && s.action._lhsRanged === s && m && m.RaidMgr &&
      m.RaidMgr.mMapRaid === s.raid && !s.raid.mIsExit &&
      (!s.ownerList || s.raid.fightActionList[s.action.atkId]===s.ownerList) &&
      s.raid.GetEntity(s.action.atkId) === s.actor && s.raid.GetEntity(s.action.defId) === s.target);
  }
  function release(s) {
    if (!s || s.cancelled) return;
    s.cancelled = true; s.jobs.length = 0;
    var index = active.indexOf(s); if (index >= 0) active.splice(index, 1);
    s.effects.forEach(function (entry) {
      var list = entry.manager.m_PlayMvList, at = list.indexOf(entry.holder);
      if (at >= 0 && entry.holder._lhsLease === entry.lease && entry.holder.mc === entry.mc) {
        list.splice(at, 1); visual('effect_cancel_failed', function () { entry.manager.CacheData(entry.holder); });
      }
    });
    s.effects.length = 0;
  }
  function job(s, due, fn) { s.jobs.push({ due:due, fn:fn }); }
  function effect(s, code, fn) {
    var m = manager().MapEffMgr, before = m.m_PlayMvList.length;
    var result = visual(code, fn);
    for (var i = before; i < m.m_PlayMvList.length; i++) {
      var holder = m.m_PlayMvList[i];
      s.effects.push({ manager:m, holder:holder, lease:holder._lhsLease, mc:holder.mc });
    }
    return result;
  }
  function impact(s) {
    if (!current(s) || s.flyDone) return;
    s.flyDone = true; s.action.isFlyEnd = true; s.action.damageIndex++;
    var hit = s.config.becastEff || {}, m = manager(), files = hit.files || [];
    var pos = visual('impact_position_failed',function(){return s.target.getBecastPosLocal(root.BattleCtrl.getFlyEffHitType(hit.type));});
    if(!pos)pos={x:0,y:-50};
    var direction = s.actor.x > s.target.x ? 2 : 1;
    var file = files[0];
    if (!root.RES.hasRes(file + '_png')) file = 'sp_skill_hit_normal_1001';
    // Cosmetic failures must never prevent the action's hit/completion state.
    effect(s, 'impact_effect_failed', function () { return m.MapEffMgr.PlayBecastEff(s.action.defId,pos,direction,file,hit.anim); });
    if (files[1]) effect(s, 'impact_bottom_failed', function () {
      var fx = m.MapEffMgr.PlayBecastEff(s.action.defId,pos,direction,files[1],hit.anim);
      if (fx) fx.isTargetBottom = true; return fx;
    });
  }
  function launch(s) {
    if (!current(s)) return;
    var fly = s.config.flyImg || {}, m = manager();
    if (!fly.file) return impact(s);
    var start = visual('projectile_position_failed',function(){return s.actor.getFlyOutGlobalPos(s.actor.parent);})||{x:s.actor.x,y:s.actor.y-50};
    var end = visual('projectile_position_failed',function(){return s.target.getBecastGlobalPos(root.BattleCtrl.getFlyEffHitType(fly.tType));})||{x:s.target.x,y:s.target.y-50};
    var speed=Number(s.actor.m_Info.modeSpeed)||s.speed;
    var duration = Math.hypot(start.x-end.x,start.y-end.y) / 1200 * 1000 / speed;
    // Register the hit before touching the renderer so an FX throw cannot drop it.
    job(s, s.elapsed + duration, function () { impact(s); });
    effect(s, 'projectile_effect_failed', function () {
      return m.MapEffMgr.createMapEff(fly.file,start,end,s.actor.parent,duration,fly.anim,fly.type);
    });
  }
  function hp(s) {
    if (!current(s) || s.hpDone) return;
    s.hpDone = true;
    // Same native presentation HP delta, no server settlement or extra roll.
    var m = manager(), actor = s.actor, target = s.target, info = target.GetInfo();
    if (!info) return;
    var fsm = s.raid.GetEnitytFSM(target.GetHandle()), type = root.VariableType.Hp;
    visual('hurt_animation_failed', function () { if (fsm) fsm.OnHurt(); });
    info.setAtt(type, info.getAtt(type) + s.damage.damage);
    visual('blood_ui_failed', function () { target.mAI.UpdateBlood(); });
    if (s.action.isSelf) visual('damage_text_failed', function () {
      var p = target.getBecastGlobalPos(); p.y -= 20;
      root.AtkAction.showDamageText(p.x,p.y,String(s.damage.damage),s.damage.isCrit);
      if (s.damage.isCrit && root.Util.getCriShakeSetting() > 0) root.DisplayUtils.shakeIt2(root.GameMap.GetMap(),1);
      root.AtkAction.playRoleCritSoundEffect(actor,s.damage.isCrit);
    });
    var actorInfo = actor.GetInfo();
    if (actorInfo && actorInfo.isPlaySoundEff) visual('hit_sound_failed', function () {
      var appearance = s.action.atkData.aprCfg || {}, config = s.config;
      var original = s.damage.isCrit ? appearance.critSoundEff : appearance.soundEff;
      var configured = s.damage.isCrit ? config.critSoundEff : config.soundEff;
      var sound = appearance.wuqiEffectId > 0 ? configured || '' : original || '';
      m.SoundManager.PlayEffect(sound || configured,1);
    });
  }
  function finishAnimation(s, fallback) {
    if (!current(s) || s.animDone) return;
    s.animDone = true; s.action.isEnd = true;
    if (fallback) note('animation_completion_fallback');
    // A load/skin change may have installed another animation; never overwrite it.
    var model = s.actor.m_Model, state = model && model.curAnimState;
    var body=model&&model.mHeroBody;
    if (model === s.model && body && body===s.initialBody && body.tuiModel===s.initialSpine &&
      body._lhsRoleLoadSeq===s.initialLoadSeq && (!state || state.name === s.animName)) {
      visual('stand_animation_failed', function () { s.actor.UpdateActionName('m_stand_1',true); });
    }
  }
  function animationBudget(s) {
    if (s.animDone) return;
    var model = s.actor.m_Model, body = model && model.mHeroBody;
    var spine = body && body.tuiModel, data = spine && spine.skeletonData;
    if (s.animSpine !== spine || s.loadSeq !== (body && body._lhsRoleLoadSeq)) {
      s.animSpine = spine; s.loadSeq = body && body._lhsRoleLoadSeq;
      s.animElapsed = 0; s.animUnits = 0;s.lastTrackTime=0;s.lastTrackProgress=s.elapsed;s.trackEndSeen=null;
    }
    if (!data || body.canPlayAnim === false) { s.loadingElapsed += s.delta; return; }
    var state = model.curAnimState, name = state && state.name === s.animName ? state.name : s.animName;
    var anim = data.findAnimation(name), scale = Number(body._speed) || s.speed;
    // A skin replacement may not have this clip; a ready missing clip cannot emit completion.
    if (!anim) return finishAnimation(s, true);
    // ENTER_FRAME can run slower than the map tick. Do not cut a living
    // animation merely because a wall-clock estimate reached its duration.
    var track=spine.state&&spine.state.getCurrent&&spine.state.getCurrent(0);
    if(track&&track.animation&&track.animation.name===name&&Number.isFinite(track.trackTime)){
      if(track.trackTime>=anim.duration){
        if(s.trackEndSeen==null)s.trackEndSeen=s.elapsed;
        if(s.elapsed-s.trackEndSeen>=150)return finishAnimation(s,true);
        return;
      }
      if(track.trackTime>s.lastTrackTime){s.lastTrackTime=track.trackTime;s.lastTrackProgress=s.elapsed;return;}
      if(s.elapsed-s.lastTrackProgress<Math.max(1000,anim.duration*1000/Math.max(.1,scale)+150))return;
    }
    s.animElapsed += s.delta; s.animUnits += s.delta * Math.max(.1, scale);
    if (s.animUnits >= anim.duration * 1000 + 150 * Math.max(.1, scale)) finishAnimation(s, true);
  }
  function install() {
    if(api.installed)return true;
    var m = manager(), Remote = root.RemoteAtkAction, Map = root.MapEffMgr;
    if (!m || !Remote || !Map || !root.AtkAction || !root.VariableType || !root.BattleCtrl || !root.RES) return false;
    var proto = Remote.prototype, base = Object.getPrototypeOf(proto), map = Map.prototype;
    if (!base || typeof base.Init !== 'function') return false;
    var oldExit = proto.OnExit, oldCreate = map.CreateData, oldCache = map.CacheData;
    // A parent action-list can be replaced without calling its child's OnExit.
    var raidProto=root.CommonMapRaid&&root.CommonMapRaid.prototype;
    ['removeEntityAction','Clear','OnExit'].forEach(function(name){
      if(!raidProto||typeof raidProto[name]!=='function')return;
      var original=raidProto[name];
      raidProto[name]=function(id){
        for(var i=active.length-1;i>=0;i--)if(active[i].raid===this&&
          (name!=='removeEntityAction'||String(active[i].action.atkId)===String(id)))release(active[i]);
        return original.apply(this,arguments);
      };
    });
    map.CreateData = function () {
      var holder = oldCreate.apply(this,arguments);
      holder._lhsLease = ++serial; holder._lhsCached = false;
      return holder;
    };
    map.CacheData = function (holder) {
      if (!holder || holder._lhsCached) return;
      holder._lhsLease = ++serial; holder._lhsCached = true;
      if (holder.mc) return oldCache.call(this,holder);
      this.m_MvList.push(holder);
    };
    function play(holder, loop) {
      var mc = holder.mc, lease = holder._lhsLease;
      try {
        var track = mc.setAnimation(0,holder.animName || 'a_1',loop);
        if (!loop && track && track.waitPlayEnd) track.waitPlayEnd().then(function () {
          if (holder._lhsLease === lease && holder.mc === mc && !holder._lhsCached) {
            visual('effect_remove_failed', function () { if (mc.parent) mc.parent.removeChild(mc); });
          }
        },function () { if (holder._lhsLease === lease && holder.mc === mc) holder.catchTime = 0; note('effect_animation_failed'); });
      } catch (_) { holder.catchTime = 0; holder.ft = null; note('effect_animation_failed'); }
    }
    map.Update = function (time) {
      var delta = Math.max(0,time-this.m_LastTime); this.m_LastTime = time;
      if (hidden()) { this._lhsWasHidden = true; return false; }
      if (this._lhsWasHidden) { delta=0; this._lhsWasHidden=false; }
      var list = this.m_PlayMvList, m = manager();
      for (var i=list.length-1;i>=0;i--) {
        var holder=list[i], mc=holder.mc;
        if (!mc) { list.splice(i,1); this.CacheData(holder); continue; }
        if (holder.delay > 0) { holder.delay-=delta; continue; }
        try {
          if (!holder.isInit) {
            holder.isInit=true;
            if (holder.bindHandle) {
              var target=m.RaidMgr.mMapRaid && m.RaidMgr.mMapRaid.GetEntity(String(holder.bindHandle));
              if (target) { if(holder.isTargetBottom)target.addChildAt(mc,0);else target.addChild(mc);play(holder,holder.isLoop); }
              else holder.catchTime=0;
            } else if(holder.parent) { holder.parent.addChild(mc);play(holder,true); }
            else { root.GameMap.AddBattleEntity(mc,root.BattleViewLayerEnum.TopEffLayer);play(holder,holder.isLoop); }
          }
          if (holder.ft != null) {
            holder.ft+=delta;
            var progress=holder.et>0?Math.min(1,holder.ft/holder.et):1;
            mc.x=holder.sx+(holder.ex-holder.sx)*progress;mc.y=holder.sy+(holder.ey-holder.sy)*progress;
            if(progress>=1){list.splice(i,1);this.CacheData(holder);}
          } else if(holder.catchTime!==-1 && (holder.catchTime-=delta)<=0) {list.splice(i,1);this.CacheData(holder);}
        } catch (_) {
          note('map_effect_update_failed');list.splice(i,1);visual('map_effect_cleanup_failed',this.CacheData.bind(this,holder));
        }
      }
      return false;
    };
    proto.Init = function (context) {
      release(this._lhsRanged); base.Init.call(this,context);
      this.isEnd=false;this.isFlyEnd=false;
      var m=manager(),raid=m.RaidMgr.mMapRaid,actor=raid&&raid.GetEntity(this.atkId),target=raid&&raid.GetEntity(this.defId);
      var config=this.atkData&&this.atkData.effCfg,damage=this.atkData&&this.atkData.stepDamage;
      if (!actor||!target||!config||!damage||!damage.length) {this._lhsRanged=null;this.isEnd=true;this.isFlyEnd=true;note('invalid_action');return;}
      var speed=Number(actor.m_Info.modeSpeed);
      if(!(speed>0))speed=1;
      var s=this._lhsRanged={action:this,raid:raid,actor:actor,target:target,model:actor.m_Model,config:config,speed:speed,
        damage:damage[this.damageIndex]||damage[damage.length-1],last:now(),paused:hidden(),elapsed:0,delta:0,jobs:[],effects:[],
        animName:config.atkAnim,animDone:false,hpDone:false,flyDone:false,loadingElapsed:0,animElapsed:0,animUnits:0};
      s.initialBody=s.model&&s.model.mHeroBody;s.initialSpine=s.initialBody&&s.initialBody.tuiModel;
      s.initialLoadSeq=s.initialBody&&s.initialBody._lhsRoleLoadSeq;
      s.ownerList=raid.fightActionList&&raid.fightActionList[this.atkId];active.push(s);
      var hit=config.becastEff||{},fly=config.flyImg||{},frame=root.Const&&root.Const.SEC_MILLI_PER_FRAME||1000/30;
      var delay=Number(hit.delay)||0,animDelay=hit.animDelay&&Number(hit.animDelay[0])||0;
      var start=visual('projectile_position_failed',function(){return actor.getFlyOutGlobalPos(actor.parent);})||{x:actor.x,y:actor.y-50};
      var end=visual('projectile_position_failed',function(){return target.getBecastGlobalPos(root.BattleCtrl.getFlyEffHitType(fly.tType));})||{x:target.x,y:target.y-50};
      var flight=fly.file?Math.hypot(start.x-end.x,start.y-end.y)/1200*1000:0;
      job(s,delay*frame/speed,function(){launch(s);});
      job(s,((delay+animDelay)*frame+flight)/speed,function(){hp(s);});
      visual('attack_animation_failed',function(){actor.UpdateActionName(config.atkAnim,false,function(){finishAnimation(s,false);});});
      visual('crit_sound_failed',function(){root.AtkAction.playRoleCritSoundEffect(actor,s.damage.isCrit);});
    };
    // Scheduling lives with the action; no actor/static-owned late timers.
    proto.playHitEff = function () {};
    proto.OnUpdate = function () {
      var s=this._lhsRanged;if(!s)return this.isEnd&&this.isFlyEnd?1:0;
      if(!current(s)){release(s);return 1;}
      updateClock(s);if(s.paused)return 0;
      for(var i=0;i<s.jobs.length;){var task=s.jobs[i];if(task.due>s.elapsed){i++;continue;}s.jobs.splice(i,1);task.fn();}
      animationBudget(s);
      // Last-resort load failure only; normal clips use their actual duration.
      if(!s.animDone&&s.loadingElapsed>=15000)finishAnimation(s,true);
      if(s.animDone&&s.flyDone&&s.hpDone){
        if(s.actor.m_Model===s.model&&s.model&&s.model.mHeroBody)s.model.mHeroBody.setHitCallBack(null);
        // Completed impacts may finish visually after the action; pooling owns them now.
        s.effects.length=0;release(s);return 1;
      }
      return 0;
    };
    proto.OnExit = function () {release(this._lhsRanged);if(oldExit)oldExit.apply(this,arguments);};
    proto.__lhsRangedLifecycle=true;
    if(root.document&&root.document.addEventListener)root.document.addEventListener('visibilitychange',function(){active.forEach(updateClock);});
    api.installed=true;return true;
  }
  api.install=install;
  if(!install()&&root.console)root.console.error('[LHS ranged] missing native dependencies; patch not installed');
})(window);
