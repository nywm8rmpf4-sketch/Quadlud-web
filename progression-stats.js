/*
 * QUADLUD — progression and statistics service
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludProgressionStats=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const DEFAULT_HISTORY_LIMIT=200;
  const DEFAULT_DIFFICULTIES=Object.freeze(['easy','medium','hard','expert']);

  function requireFunction(value,name){if(typeof value!=='function')throw new TypeError(`QUADLUD progression stats requires ${name}()`);return value}
  function createStatsService(options={}){
    const persistentData=options.persistentData;
    const gameRegistry=options.gameRegistry;
    const gameIds=Array.isArray(options.gameIds)?[...options.gameIds]:[];
    const clock=options.clock;
    const persistenceBaseline=options.persistenceBaseline??persistentData?.baseline;
    const cloneMasterySession=requireFunction(options.cloneMasterySession,'cloneMasterySession');
    const mergeMasteryIntoStats=requireFunction(options.mergeMasteryIntoStats,'mergeMasteryIntoStats');
    const random=requireFunction(options.random||Math.random,'random');
    const historyLimit=Number.isInteger(options.historyLimit)&&options.historyLimit>0?options.historyLimit:DEFAULT_HISTORY_LIMIT;
    const validDifficulties=Array.isArray(options.validDifficulties)&&options.validDifficulties.length?[...options.validDifficulties]:[...DEFAULT_DIFFICULTIES];
    if(!persistentData?.stats||typeof persistentData.stats.read!=='function'||typeof persistentData.stats.write!=='function')throw new Error('QUADLUD progression stats persistentData.stats unavailable');
    if(!persistentData.schemas||!Number.isInteger(persistentData.schemas.stats))throw new Error('QUADLUD progression stats schema unavailable');
    if(!gameRegistry||typeof gameRegistry.hasGame!=='function')throw new Error('QUADLUD progression stats GameRegistry unavailable');
    if(!clock||typeof clock.nowMs!=='function'||typeof clock.nowDate!=='function')throw new Error('QUADLUD progression stats clock unavailable');
    if(typeof persistenceBaseline!=='string'||!persistenceBaseline)throw new Error('QUADLUD progression stats persistence baseline unavailable');
    const statsSchema=persistentData.schemas.stats;

    function blankStats(){return {schema:statsSchema,baseline:persistenceBaseline,started:0,solved:0,revealed:0,totalSolvedSeconds:0,byGame:{},history:[],mastery:{schema:1,byTechnique:{},updatedAt:null},training:{schema:1,byTechnique:{}},learning:{schema:1,byTechnique:{}}}}
    function safeStats(){return persistentData.stats.read(blankStats(),{schema:statsSchema,baseline:persistenceBaseline,historyLimit,validGames:gameIds,validDifficulties})}
    function writeStats(s){persistentData.stats.write(s)}
    function statBucket(s,g,d){
      if(!gameRegistry.hasGame(g))throw new Error(`Unknown QUADLUD stats game: ${g}`);
      if(!s.byGame||typeof s.byGame!=='object')s.byGame={};
      if(!s.byGame[g]||typeof s.byGame[g]!=='object')s.byGame[g]={};
      if(!s.byGame[g][d]||typeof s.byGame[g][d]!=='object')s.byGame[g][d]={started:0,solved:0,revealed:0,totalSeconds:0,best:null};
      let b=s.byGame[g][d];b.started=Math.max(0,Number(b.started)||0);b.solved=Math.max(0,Number(b.solved)||0);b.revealed=Math.max(0,Number(b.revealed)||0);b.totalSeconds=Math.max(0,Number(b.totalSeconds)||0);b.best=b.best==null?null:Math.max(0,Number(b.best)||0);return b
    }
    function localDay(ts=clock.nowMs()){let d=new Date(ts),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
    function statsStart(c,hooks={}){
      if(!c||c.attemptId)return;
      const readStats=typeof hooks.safeStats==='function'?hooks.safeStats:safeStats,saveStats=typeof hooks.writeStats==='function'?hooks.writeStats:writeStats;
      c.attemptId=`${clock.nowMs()}-${random().toString(36).slice(2,9)}`;c.startedAt=clock.nowMs();c.statsClosed=false;
      let s=readStats(),b=statBucket(s,c.game,c.diff);s.started++;b.started++;saveStats(s)
    }
    function statsFinish(c,seconds,outcome,hooks={}){
      if(!c||c.statsClosed)return;c.statsClosed=true;
      const readStats=typeof hooks.safeStats==='function'?hooks.safeStats:safeStats,saveStats=typeof hooks.writeStats==='function'?hooks.writeStats:writeStats;
      let profile=c.difficultyProfile&&typeof c.difficultyProfile==='object'?JSON.parse(JSON.stringify(c.difficultyProfile)):null,fingerprint=profile?.fingerprint||c.challengeFingerprint||c.dailyFingerprint||null;
      let s=readStats(),b=statBucket(s,c.game,c.diff),rec={id:c.attemptId||`${clock.nowMs()}`,ts:clock.nowMs(),day:localDay(),game:c.game,diff:c.diff,seconds:Math.max(0,Math.round(seconds)),outcome,puzzleFingerprint:fingerprint,minimumRequiredTier:profile?.minimumRequiredTier??null,difficultyProfile:profile,backtrackUsed:!!c.backtrackUsed,hintUsed:!!c.hintUsed,walkthroughUsed:!!c.walkthroughUsed,coachUsage:c.coachUsage?{...c.coachUsage}:null,errorCoachUsage:c.errorCoachUsage?{...c.errorCoachUsage}:null,reasoningAudit:c.reasoningAudit?{...c.reasoningAudit}:null,exploration:c.exploration?{...c.exploration}:null,challengeCode:c.challengeCode||null,challengeGenerator:c.challengeGenerator||null,challengeFingerprint:c.challengeFingerprint||null,dailyDay:c.dailyDay||null,dailyGenerator:c.dailyGenerator||null,dailyFingerprint:c.dailyFingerprint||null,masterySession:cloneMasterySession(c.masterySession),masteryMerged:true};
      if(outcome==='solved'){s.solved++;s.totalSolvedSeconds+=rec.seconds;b.solved++;b.totalSeconds+=rec.seconds;b.best=b.best==null?rec.seconds:Math.min(b.best,rec.seconds)}
      if(outcome==='revealed'){s.revealed++;b.revealed++}
      mergeMasteryIntoStats(s,c.masterySession);
      s.history.unshift(rec);s.history=s.history.slice(0,historyLimit);saveStats(s)
    }
    function statsSummary(hooks={}){
      const readStats=typeof hooks.safeStats==='function'?hooks.safeStats:safeStats;
      let s=readStats(),success=s.started?Math.round(100*s.solved/s.started):0,avg=s.solved?Math.round(s.totalSolvedSeconds/s.solved):0;
      let days=[...new Set(s.history.filter(x=>x.outcome==='solved').map(x=>x.day))].sort().reverse(),streak=0;
      if(days.length){
        let cur=clock.nowDate();cur.setHours(0,0,0,0);let yday=new Date(cur);yday.setDate(yday.getDate()-1);
        if(days[0]===localDay(cur.getTime())||days[0]===localDay(yday.getTime())){
          let d=new Date(days[0]+'T12:00:00');for(let day of days){if(day!==localDay(d.getTime()))break;streak++;d.setDate(d.getDate()-1)}
        }
      }
      return {s,success,avg,streak}
    }

    return Object.freeze({version:VERSION,statsSchema,historyLimit,blankStats,safeStats,writeStats,statBucket,localDay,statsStart,statsFinish,statsSummary})
  }

  return Object.freeze({VERSION,DEFAULT_HISTORY_LIMIT,createStatsService})
});
