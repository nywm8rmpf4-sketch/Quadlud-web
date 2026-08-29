/*
 * QUADLUD — Web background precompute orchestration
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludWebPrecompute=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const DEFAULT_TARGET=2;
  const DEFAULT_DIFFICULTIES=Object.freeze(['easy','medium','hard','expert']);

  function fn(value,name){if(typeof value!=='function')throw new TypeError(`QUADLUD Web precompute requires ${name}()`);return value}
  function create(options={}){
    const gameIds=Array.isArray(options.gameIds)?[...options.gameIds]:[];
    const difficulties=Array.isArray(options.difficulties)&&options.difficulties.length?[...options.difficulties]:[...DEFAULT_DIFFICULTIES];
    const registry=options.gameRegistry;
    const platform=options.webPlatform;
    const localDay=fn(options.localDay,'localDay');
    const sessionSet=fn(options.generationSessionSet,'generationSessionSet');
    const remember=fn(options.rememberGeneratedCandidateThisSession,'rememberGeneratedCandidateThisSession');
    const candidateCertified=fn(options.generatedCandidateCertified,'generatedCandidateCertified');
    const candidateIdentity=fn(options.generatedCandidateIdentity,'generatedCandidateIdentity');
    const scheduleFn=fn(options.schedule||((cb,ms)=>setTimeout(cb,ms)),'schedule');
    const workerUrl=String(options.workerUrl||'./precompute-worker.js');
    const target=Number.isInteger(options.target)&&options.target>0?options.target:DEFAULT_TARGET;
    if(!registry||typeof registry.hasCapability!=='function')throw new Error('QUADLUD Web precompute GameRegistry unavailable');
    if(!platform?.workers||!platform?.lifecycle)throw new Error('QUADLUD Web precompute platform unavailable');

    const combos=Object.freeze(gameIds.flatMap(game=>difficulties.map(diff=>Object.freeze([game,diff]))));
    const cache=new Map();
    const reservedIdentities=new Map();
    let worker=null,busy=false,requestId=0,day=null,preferred=null,started=false;

    function key(game,diff){return `${game}:${diff}`}
    function bucket(game,diff){let k=key(game,diff);if(!cache.has(k))cache.set(k,[]);return cache.get(k)}
    function reservedSet(game){if(!reservedIdentities.has(game))reservedIdentities.set(game,new Set());return reservedIdentities.get(game)}
    function resetDay(nextDay=localDay()){if(day===nextDay)return false;day=nextDay;cache.clear();reservedIdentities.clear();return true}
    function forbiddenKeys(game,nextDay=localDay()){
      resetDay(nextDay);
      try{
        if(!registry.hasCapability(game,'generationIdentity'))return [];
        let out=new Set(reservedSet(game));for(let identity of sessionSet(game,nextDay))out.add(identity);return [...out]
      }catch(_){return []}
    }
    function comboSupported(game,diff){return combos.some(([g,d])=>g===game&&d===diff)}
    function certified(game,diff,candidate){try{return comboSupported(game,diff)&&candidateCertified(game,diff,candidate)}catch(_){return false}}
    function setPreferred(game,diff){preferred=game&&diff?{game,diff}:null;return preferred}
    function order(){
      let all=combos.map(x=>[...x]);
      if(!preferred)return all.filter(x=>x[1]!=='expert').concat(all.filter(x=>x[1]==='expert'));
      let exact=[],same=[],medium=[],rest=[],deferredExpert=[];
      for(let x of all){
        if(x[0]===preferred.game&&x[1]===preferred.diff)exact.push(x);
        else if(x[1]==='expert')deferredExpert.push(x);
        else if(x[0]===preferred.game)same.push(x);
        else if(x[1]==='medium')medium.push(x);
        else rest.push(x)
      }
      return exact.concat(same,medium,rest,deferredExpert)
    }
    function ensureWorker(){
      if(worker)return worker;if(!platform.workers.supported())return null;
      try{
        let w=platform.workers.create(workerUrl);if(!w)return null;
        w.onmessage=e=>{
          let m=e.data||{};busy=false;
          if(m.ok&&m.day===day&&m.candidate&&certified(m.game,m.diff,m.candidate)){
            let b=bucket(m.game,m.diff);
            if(b.length<target){
              let identity=candidateIdentity(m.game,m.candidate);
              if(identity==null)b.push(m.candidate);
              else{
                let displayed=false;try{displayed=sessionSet(m.game,m.day).has(identity)}catch(_){}
                let reserved=reservedSet(m.game);
                if(!displayed&&!reserved.has(identity)){m.candidate.__generationIdentity=identity;reserved.add(identity);b.push(m.candidate)}
              }
            }
          }
          scheduleFn(()=>schedule(),80)
        };
        w.onerror=()=>{busy=false;try{w.terminate()}catch(_){};worker=null};worker=w;return w
      }catch(_){return null}
    }
    function schedule(game=null,diff=null){
      if(game&&diff)setPreferred(game,diff);
      if(!started||platform.lifecycle.isHidden()||busy)return false;
      let nextDay=localDay();resetDay(nextDay);let w=ensureWorker();if(!w)return false;
      for(let [g,d] of order()){
        if(bucket(g,d).length>=target)continue;
        busy=true;let id=++requestId;w.postMessage({cmd:'generate',id,game:g,diff:d,day:nextDay,forbiddenKeys:forbiddenKeys(g,nextDay)});return true
      }
      return false
    }
    function start(game=null,diff=null){started=true;if(game&&diff)setPreferred(game,diff);resetDay(localDay());scheduleFn(()=>schedule(),120);return true}
    function take(game,diff,nextDay=localDay()){
      resetDay(nextDay);let b=bucket(game,diff);
      while(b.length){
        let candidate=b.shift(),identity=candidateIdentity(game,candidate);
        if(identity!=null){
          reservedSet(game).delete(identity);let already=false;try{already=sessionSet(game,nextDay).has(identity)}catch(_){}
          if(already)continue;remember(game,candidate,nextDay)
        }
        return candidate
      }
      return null
    }
    function status(){let out={};for(let [g,d] of combos)out[key(g,d)]=bucket(g,d).length;return out}
    function snapshot(){return {day,started,busy,preferred:preferred?{...preferred}:null,requestId,status:status()}}

    platform.lifecycle.onVisibilityChange(()=>{if(!platform.lifecycle.isHidden()&&started)scheduleFn(()=>schedule(),150)});
    return Object.freeze({version:VERSION,target,combos,key,bucket,resetDay,forbiddenKeys,comboSupported,certified,setPreferred,order,ensureWorker,schedule,start,take,status,snapshot})
  }

  return Object.freeze({VERSION,DEFAULT_TARGET,DEFAULT_DIFFICULTIES,create})
});
