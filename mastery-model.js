/*
 * QUADLUD — Logical mastery pure model
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludMasteryModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const KINDS=Object.freeze(['encountered','solo','where','rule','why','reveal','where3','why3','reveal3','errors']);

  function emptyCounts(){return {encountered:0,solo:0,where:0,rule:0,why:0,reveal:0,where3:0,why3:0,reveal3:0,errors:0}}
  function normalizeCounts(x={}){
    const out=emptyCounts();for(const key of KINDS)out[key]=Math.max(0,Number(x?.[key])||0);return out
  }
  function cloneSession(session){return session?JSON.parse(JSON.stringify(session)):null}
  function mergeCounts(dst,src){
    dst=normalizeCounts(dst);src=normalizeCounts(src);for(const key of KINDS)dst[key]+=src[key];return dst
  }
  function legacyFromHistory(history=[],catalog={}){
    const out={};
    for(const rec of history){
      if(rec?.masteryMerged)continue;
      for(const [id,usage] of Object.entries(rec?.coachUsage?.techniques||{})){
        if(!catalog?.[id])continue;
        const bucket=out[id]||(out[id]=emptyCounts()),where=Math.max(0,Number(usage.where)||0);
        if(rec?.coachUsage?.flowVersion===2){bucket.encountered+=where;bucket.where3+=where;bucket.why3+=Math.max(0,Number(usage.why)||0);bucket.reveal3+=Math.max(0,Number(usage.reveal)||0)}
        else{bucket.encountered+=where;bucket.where+=where;bucket.rule+=Math.max(0,Number(usage.rule)||0);bucket.why+=Math.max(0,Number(usage.why)||0);bucket.reveal+=Math.max(0,Number(usage.reveal)||0)}
      }
    }
    return out
  }
  function metrics(counts){
    const c=normalizeCounts(counts);
    const legacyWhere=Math.max(0,c.where-c.rule),ruleOnly=Math.max(0,c.rule-c.why),legacyWhy=Math.max(0,c.why-c.reveal),legacyReveal=c.reveal;
    const newWhere=Math.max(0,c.where3-c.why3),newWhy=Math.max(0,c.why3-c.reveal3),newReveal=c.reveal3;
    const whereOnly=legacyWhere+newWhere,whyOnly=legacyWhy+newWhy,revealed=legacyReveal+newReveal;
    const assisted=whereOnly+ruleOnly+whyOnly+revealed,samples=c.solo+assisted+c.errors;
    const weighted=c.solo+whereOnly*.82+ruleOnly*.65+whyOnly*.45+revealed*.20;
    const score=samples?Math.max(0,Math.min(100,Math.round(weighted/samples*100))):null;
    const confidence=Math.min(100,Math.round(samples/12*100));
    return {...c,whereOnly,ruleOnly,whyOnly,revealed,assisted,samples,score,confidence}
  }
  function level(m){
    if(!m||m.samples<3)return {key:'masteryInsufficient',level:0};
    if(m.score>=90)return {key:'masteryExcellent',level:4};
    if(m.score>=75)return {key:'masteryStrong',level:3};
    if(m.score>=55)return {key:'masteryAcquired',level:2};
    return {key:'masteryDeveloping',level:1}
  }

  return Object.freeze({VERSION,KINDS,emptyCounts,normalizeCounts,cloneSession,mergeCounts,legacyFromHistory,metrics,level})
});
