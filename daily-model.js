/*
 * QUADLUD — Daily deterministic model and scoring
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludDailyModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const SCHEMA=2;
  const GENERATOR=1;
  const NAMESPACE='quadlud-daily-v2.23';
  const DIFFICULTY='medium';
  const LOGIC_POINTS=Object.freeze({0:100,1:90,2:75,3:55,4:25});
  const HELP_LABEL_KEYS=Object.freeze(['dailyNoHelp','dailyOrientation','dailyRuleHelp','dailyExplanationHelp','dailyRevealHelp']);

  function fn(value,name){if(typeof value!=='function')throw new TypeError(`QUADLUD Daily model requires ${name}()`);return value}
  function create(options={}){
    const gameIds=Array.isArray(options.gameIds)?[...options.gameIds]:[];
    const manifest=options.gameManifest;
    const persistentData=options.persistentData;
    const generation=options.generation;
    const clock=options.clock;
    const localDay=fn(options.localDay,'localDay');
    if(!manifest||typeof manifest.getGame!=='function')throw new Error('QUADLUD Daily model game manifest unavailable');
    if(!persistentData?.daily||typeof persistentData.daily.read!=='function'||typeof persistentData.daily.write!=='function')throw new Error('QUADLUD Daily model persistence unavailable');
    if(!generation||typeof generation.withSeed!=='function'||typeof generation.generateRegisteredCandidate!=='function'||typeof generation.generatedCandidateFingerprint!=='function'||typeof generation.generatedCandidateCertified!=='function')throw new Error('QUADLUD Daily model generation helpers unavailable');
    if(!clock||typeof clock.nowMs!=='function'||typeof clock.nowDate!=='function')throw new Error('QUADLUD Daily model clock unavailable');

    const games=Object.freeze(gameIds.filter(game=>manifest.getGame(game)?.daily!==false));
    function state(){return persistentData.daily.read()}
    function saveState(value){return persistentData.daily.write(value)}
    function key(day,game){return `${day}:${game}`}
    function record(day,game,currentState=state()){return currentState[key(day,game)]||null}
    function seedString(day,game){
      day=String(day||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!games.includes(game))return null;
      return `${NAMESPACE}:s${SCHEMA}:g${GENERATOR}:${day}:${game}:${DIFFICULTY}`
    }
    function buildCandidate(day,game){
      const seed=seedString(day,game);if(!seed)return null;
      return generation.withSeed(seed,()=>{
        const candidate=generation.generateRegisteredCandidate(game,DIFFICULTY,{protocolGeneration:GENERATOR});
        if(!generation.generatedCandidateCertified(game,DIFFICULTY,candidate))throw new Error(`Daily candidate is not certified Medium (${game})`);
        return candidate
      })
    }
    function fingerprintFromCandidate(game,candidate){return generation.generatedCandidateFingerprint(game,candidate)}
    function publicFingerprint(day,game){const candidate=buildCandidate(day,game);return candidate?fingerprintFromCandidate(game,candidate):null}
    function helpStage(session){
      if(session?.walkthroughUsed)return 4;
      const usage=session?.coachUsage||{};
      if((usage.reveal||0)>0)return 4;
      if((usage.why||0)>0)return 3;
      if((usage.rule||0)>0)return 2;
      if((usage.where||0)>0)return 1;
      return session?.hintUsed?4:0
    }
    function logicScore(session){return LOGIC_POINTS[helpStage(session)]}
    function errorCount(session){const errors=session?.errorCoachUsage||{};return Math.max(0,Number(errors.detected)||0)+Math.max(0,Number(errors.rejected)||0)}
    function backtrackCount(session){return Math.max(0,Number(session?.moveHistory?.stats?.undos)||0)}
    function mark(session,outcome,seconds){
      if(!session?.daily)return false;
      const currentState=state(),recordKey=key(session.dailyDay,session.game),old=currentState[recordKey]||{},solvedBefore=old.outcome==='solved',sec=Math.max(0,Math.round(seconds));
      if(solvedBefore){
        old.best=old.best==null?sec:Math.min(old.best,sec);old.lastSeconds=sec;old.lastOutcome=outcome;old.lastCompletedAt=clock.nowMs();currentState[recordKey]=old;saveState(currentState);return true
      }
      const next={day:session.dailyDay,game:session.game,outcome,seconds:sec,completedAt:clock.nowMs(),best:outcome==='solved'?sec:old.best??null,dailySchema:session.dailySchema??SCHEMA,dailyGenerator:session.dailyGenerator??GENERATOR,fingerprint:session.dailyFingerprint||null};
      if(outcome==='solved'){
        next.logicScore=logicScore(session);next.helpStage=helpStage(session);next.helpLabelKey=HELP_LABEL_KEYS[next.helpStage];next.errors=errorCount(session);next.backtracks=backtrackCount(session);next.official=true
      }
      currentState[recordKey]=next;saveState(currentState);return true
    }
    function progress(day=localDay()){const currentState=state();return games.map(game=>currentState[key(day,game)]).filter(x=>x?.outcome==='solved').length}
    function circuitSummary(day=localDay(),currentState=state()){
      const rows=games.map(game=>({game,record:record(day,game,currentState)})),solved=rows.filter(x=>x.record?.outcome==='solved'),scored=solved.filter(x=>Number.isFinite(Number(x.record.logicScore)));
      return {day,rows,completed:solved.length,totalScore:scored.reduce((sum,x)=>sum+Number(x.record.logicScore),0),scoredGames:scored.length,complete:solved.length===games.length,scoreKnown:solved.length===scored.length}
    }
    function nextGame(day=localDay(),currentState=state()){return games.find(game=>record(day,game,currentState)?.outcome!=='solved')||null}
    function calendar(days=28){
      const currentState=state(),out=[],date=clock.nowDate();date.setHours(12,0,0,0);
      for(let i=0;i<days;i++){const day=localDay(date.getTime()),summary=circuitSummary(day,currentState);out.push({day,n:summary.completed,score:summary.scoreKnown?summary.totalScore:null});date.setDate(date.getDate()-1)}
      return out
    }

    return Object.freeze({version:VERSION,schema:SCHEMA,generator:GENERATOR,namespace:NAMESPACE,difficulty:DIFFICULTY,games,logicPoints:LOGIC_POINTS,helpLabelKeys:HELP_LABEL_KEYS,state,saveState,key,record,seedString,buildCandidate,fingerprintFromCandidate,publicFingerprint,helpStage,logicScore,errorCount,backtrackCount,mark,progress,circuitSummary,nextGame,calendar})
  }

  return Object.freeze({VERSION,SCHEMA,GENERATOR,NAMESPACE,DIFFICULTY,LOGIC_POINTS,HELP_LABEL_KEYS,create})
});
