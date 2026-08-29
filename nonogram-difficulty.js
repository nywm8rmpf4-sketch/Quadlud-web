/*
 * QUADLUD — Mosaïque / Nonogram logical difficulty adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const DR=(typeof module==='object'&&module.exports)?require('./difficulty-rating.js'):root.DifficultyRating;
  const Logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):root.NonogramLogic;
  const api=factory(DR,Logic);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NonogramDifficulty=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(DR,Logic){
'use strict';
if(!DR||typeof DR.runMinimumRequiredTier!=='function'||typeof DR.createDifficultyProfileFromCanonical!=='function')throw new Error('NonogramDifficulty requires DifficultyRating canonical-profile support');
if(!Logic||typeof Logic.analyzeGridLine!=='function')throw new Error('NonogramDifficulty requires NonogramLogic');

const VERSION=1;
const RULE_TIER=Object.freeze({
  N_EMPTY_LINE:0,
  N_EXACT_FIT:0,
  N_OVERLAP:1,
  N_BLOCK_EXTENSION:2,
  N_BLOCK_BOUNDARY:2,
  N_FORCED_EMPTY:3
});
const TIER_POLICY=Object.freeze(DR.TIER_DEFINITIONS.map(t=>Object.freeze({
  tier:t.key,
  maxTechniqueLevel:t.index,
  allowedRules:Object.freeze(Object.keys(RULE_TIER).filter(rule=>RULE_TIER[rule]<=t.index))
})));

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function canonicalizePublicPuzzle(puzzle){return Logic.validatePuzzle(puzzle)}
function policyTierForRule(rule){const n=RULE_TIER[rule];return Number.isInteger(n)?n:null}
function structuralMetrics(puzzle){
  const p=canonicalizePublicPuzzle(puzzle),all=p.rowClues.concat(p.colClues),blocks=all.flat();
  const filled=p.rowClues.flat().reduce((a,b)=>a+b,0),cells=p.rows*p.cols;
  return {rows:p.rows,cols:p.cols,cells,clueLines:all.length,blockCount:blocks.length,emptyClueLines:all.filter(x=>x.length===0).length,maxBlock:blocks.length?Math.max(...blocks):0,filledCells:filled,density:cells?filled/cells:0};
}
function availableDeductions(puzzle,state,tierIndex){
  const p=canonicalizePublicPuzzle(puzzle),out=[];
  for(let r=0;r<p.rows;r++){const a=Logic.analyzeGridLine(p,state,'row',r);if(a.deduction&&policyTierForRule(a.deduction.techniqueId)<=tierIndex)out.push(a.deduction)}
  for(let c=0;c<p.cols;c++){const a=Logic.analyzeGridLine(p,state,'column',c);if(a.deduction&&policyTierForRule(a.deduction.techniqueId)<=tierIndex)out.push(a.deduction)}
  return out;
}
function metricsFromTrace(trace,tierIndex,availability){
  const byRule={};let maxTier=0,limitingTierStepCount=0,maxProofDepth=0,rowSteps=0,columnSteps=0,axisSwitches=0,lastAxis=null;
  for(const d of trace){
    const rule=d.techniqueId,t=policyTierForRule(rule);byRule[rule]=(byRule[rule]||0)+1;if(t>maxTier)maxTier=t;
    if(t===tierIndex)limitingTierStepCount++;
    const depth=1;maxProofDepth=Math.max(maxProofDepth,depth);
    const axis=d.line?.axis;if(axis==='row')rowSteps++;else if(axis==='column')columnSteps++;if(lastAxis&&axis&&axis!==lastAxis)axisSwitches++;if(axis)lastAxis=axis;
  }
  const limitingRules=Object.keys(byRule).filter(rule=>policyTierForRule(rule)===maxTier).sort();
  return {totalLogicalSteps:trace.length,deductionsByRule:byRule,limitingTechniqueLevel:maxTier,limitingRules,limitingTierStepCount,maxProofDepth,...DR.availabilityMetrics(availability),structure:{rowSteps,columnSteps,axisSwitches}};
}
function solveTier({puzzle,tierIndex},options={}){
  if(!Number.isInteger(tierIndex)||tierIndex<0||tierIndex>=TIER_POLICY.length)throw new Error('Invalid Nonogram tier');
  const p=canonicalizePublicPuzzle(puzzle),maxSteps=Number.isInteger(options.maxSteps)&&options.maxSteps>=0?options.maxSteps:p.rows*p.cols*4;
  let state=Logic.createState(p),trace=[],availability=DR.createAvailabilityTracker();
  for(let step=0;step<=maxSteps;step++){
    const contradiction=Logic.findContradiction(p,state);
    if(contradiction)return {status:'contradictory',budgetHit:false,...metricsFromTrace(trace,tierIndex,availability),contradiction};
    if(Logic.isSolved(p,state))return {status:'solved',budgetHit:false,...metricsFromTrace(trace,tierIndex,availability)};
    if(step===maxSteps)return {status:'budget-exhausted',budgetHit:true,...metricsFromTrace(trace,tierIndex,availability)};
    const available=availableDeductions(p,state,tierIndex);DR.recordAvailableMoves(availability,available.length);
    if(!available.length)return {status:'blocked',budgetHit:false,...metricsFromTrace(trace,tierIndex,availability)};
    const deduction=available[0];state=Logic.applyLogicalMove(p,state,deduction.move);trace.push(deduction);
  }
  return {status:'budget-exhausted',budgetHit:true,...metricsFromTrace(trace,tierIndex,availability)};
}
function createAdapter(options={}){return {solveTier:input=>solveTier(input,options)}}
function ratePuzzle(puzzle,options={}){
  const p=canonicalizePublicPuzzle(puzzle);
  const run=DR.runMinimumRequiredTier({puzzle:p,canonicalizePublicPuzzle,adapter:createAdapter(options)});
  const metrics=run.winningAttempt?.result||run.attempts?.at(-1)?.result||{};
  const profile=DR.createDifficultyProfileFromCanonical({
    puzzle:p,status:run.status,difficulty:run.difficulty,minimumRequiredTier:run.minimumRequiredTier,
    limitingTechniqueLevel:run.status==='solved'?metrics.limitingTechniqueLevel:null,
    limitingRules:run.status==='solved'?metrics.limitingRules:[],totalLogicalSteps:metrics.totalLogicalSteps||0,
    deductionsByRule:metrics.deductionsByRule||{},limitingTierStepCount:metrics.limitingTierStepCount||0,
    initialAvailableMoves:metrics.initialAvailableMoves??null,minAvailableMoves:metrics.minAvailableMoves??null,bottleneckCount:metrics.bottleneckCount??0,
    maxProofDepth:metrics.maxProofDepth||0,budgetHit:run.status==='budget-exhausted'||!!metrics.budgetHit,
    structure:{...structuralMetrics(p),...(metrics.structure||{})}
  });
  return {...run,profile};
}

return Object.freeze({VERSION,RULE_TIER,TIER_POLICY,canonicalizePublicPuzzle,policyTierForRule,availableDeductions,solveTier,createAdapter,ratePuzzle,_test:Object.freeze({structuralMetrics,metricsFromTrace})});
});
