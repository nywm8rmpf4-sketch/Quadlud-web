/*
 * QUADLUD — Couronnes logical difficulty adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const DR=(typeof module!=='undefined'&&module.exports)?require('./difficulty-rating.js'):root.DifficultyRating;
const QL=(typeof module!=='undefined'&&module.exports)?require('./queens-logic.js'):root.QueensLogic;
if(!DR||!QL)throw new Error('Queens difficulty dependencies unavailable');

const VALUE_EMPTY=QL.VALUE_EMPTY, VALUE_QUEEN=QL.VALUE_QUEEN;
const TIER_POLICY=Object.freeze([
  Object.freeze({tier:'easy',maxTechniqueLevel:0}),
  Object.freeze({tier:'medium',maxTechniqueLevel:1}),
  Object.freeze({tier:'hard',maxTechniqueLevel:2}),
  Object.freeze({tier:'expert',maxTechniqueLevel:3})
]);

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function compareScalar(a,b){if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b))}
function assertGrid(grid,n,valid,message){
  if(!Array.isArray(grid)||grid.length!==n||grid.some(row=>!Array.isArray(row)||row.length!==n))throw new Error(message);
  for(const row of grid)for(const value of row)if(!valid(value))throw new Error(message);
}
function normalizeRegionLabels(reg){
  let labels=new Map(),next=0;
  return reg.map(row=>row.map(value=>{let key=typeof value+':'+String(value);if(!labels.has(key))labels.set(key,next++);return labels.get(key)}));
}
function canonicalizeQueensPublicPuzzle(puzzle){
  let n=Number(puzzle?.n);
  if(!Number.isInteger(n)||n<2)throw new Error('Invalid Queens public puzzle size');
  let reg=puzzle.reg??puzzle.regions;
  assertGrid(reg,n,value=>Number.isInteger(value)||typeof value==='string','Invalid Queens public regions');
  return {schema:DR.SCHEMA_VERSION,game:'queens',n,reg:normalizeRegionLabels(reg)};
}
function canonicalQueens(puzzle){
  let publicPuzzle=canonicalizeQueensPublicPuzzle(puzzle);
  let ids=[...new Set(publicPuzzle.reg.flat())].sort(compareScalar);
  if(ids.length!==publicPuzzle.n)throw new Error('Couronnes puzzle must contain exactly n regions');
  return publicPuzzle;
}
function initialBoard(puzzle){let p=canonicalQueens(puzzle);return {n:p.n,reg:p.reg.map(r=>r.slice()),state:Array.from({length:p.n},()=>Array(p.n).fill(VALUE_EMPTY))}}
function solved(session){
  let queens=[];for(let r=0;r<session.n;r++)for(let c=0;c<session.n;c++)if(session.state[r][c]===VALUE_QUEEN)queens.push([r,c]);
  if(queens.length!==session.n)return false;
  if(new Set(queens.map(x=>x[0])).size!==session.n||new Set(queens.map(x=>x[1])).size!==session.n)return false;
  if(new Set(queens.map(([r,c])=>session.reg[r][c])).size!==session.n)return false;
  return !session.diagnoseLogical();
}
function uniqDeductions(list){let seen=new Set(),out=[];for(const d of list||[]){if(!d)continue;let key=d.id||JSON.stringify([d.rule,d.conclusions]);if(seen.has(key))continue;seen.add(key);out.push(d)}return out}
function directCandidates(session,tierIndex){
  let pool=[];
  pool.push(...session.findSingletons());
  if(tierIndex>=1){
    pool.push(...session.findLockedUnits());
    pool.push(...session.commonConflictDeductions(session.n,'COMMON_CONFLICT',null,30));
    pool.push(...session.hallDeductions([2]));
    pool.push(...session.findLocalCapacity(2));
  }
  if(tierIndex>=2){
    pool.push(...session.hallDeductions([3,4]));
    pool.push(...session.findLocalCapacity(3));
    pool.push(...session.findNoSupport());
  }
  if(tierIndex>=3){
    let large=[];for(let n=5;n<=session.n;n++)large.push(n);
    if(large.length)pool.push(...session.hallDeductions(large));
    pool.push(...session.findMixedHall());
  }
  return uniqDeductions(pool).filter(d=>(d.techniqueLevel??0)<=tierIndex).sort(QL.deductionComparator);
}
function nextAllowedDeduction(session,tierIndex,includeAvailability=false){
  let direct=directCandidates(session,tierIndex),best=direct[0]||null;
  if(tierIndex<3)return {deduction:best,budgetHit:false,...(includeAvailability?{availableMoves:direct.length}:{})};
  let detailed=session.findContradictionsDetailed(),hypotheses=detailed.deductions.filter(Boolean);
  let allowed=uniqDeductions(direct.concat(hypotheses)).filter(d=>(d.techniqueLevel??0)<=tierIndex);
  let deduction=uniqDeductions(best?[best].concat(hypotheses):hypotheses).filter(d=>(d.techniqueLevel??0)<=tierIndex).sort(QL.deductionComparator)[0]||null;
  return {deduction,budgetHit:!deduction&&detailed.budgetHit,...(includeAvailability?{availableMoves:allowed.length}:{})};
}
function sessionMetrics(session,tierIndex,availability){
  let logical=(session.appliedDeductions||[]).filter(d=>d&&!d.automatic),byRule={},maxTechniqueLevel=0,maxProofDepth=0;
  for(const d of logical){byRule[d.rule]=(byRule[d.rule]||0)+1;maxTechniqueLevel=Math.max(maxTechniqueLevel,Number(d.techniqueLevel)||0);maxProofDepth=Math.max(maxProofDepth,Number(d.rank)||0)}
  let limitingRules=[...new Set(logical.filter(d=>(Number(d.techniqueLevel)||0)===maxTechniqueLevel).map(d=>d.rule))].sort();
  return {
    totalLogicalSteps:logical.length,
    deductionsByRule:byRule,
    limitingTechniqueLevel:maxTechniqueLevel,
    limitingRules,
    limitingTierStepCount:logical.filter(d=>(Number(d.techniqueLevel)||0)===tierIndex).length,
    maxProofDepth,
    ...DR.availabilityMetrics(availability)
  };
}
function solveQueensTier({puzzle,tierIndex},options={}){
  if(!Number.isInteger(tierIndex)||tierIndex<0||tierIndex>=TIER_POLICY.length)throw new Error('Invalid Couronnes tier');
  let publicPuzzle;
  try{publicPuzzle=canonicalQueens(puzzle)}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let session;
  try{session=QL.createSession(initialBoard(publicPuzzle),{maxHypothesisSteps:options.maxHypothesisSteps??12})}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let maxLogicalSteps=Number.isInteger(options.maxLogicalSteps)&&options.maxLogicalSteps>0?options.maxLogicalSteps:publicPuzzle.n*publicPuzzle.n*8;
  let trace=[],availability=options.collectSecondaryMetrics===false?null:DR.createAvailabilityTracker();
  for(let step=0;step<maxLogicalSteps;step++){
    let bad=session.diagnoseLogical();if(bad)return {status:'contradictory',budgetHit:false,contradiction:copy(bad),...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let next=nextAllowedDeduction(session,tierIndex,!!availability),deduction=next.deduction;
    if(availability)DR.recordAvailableMoves(availability,next.availableMoves);
    if(!deduction)return {status:next.budgetHit?'budget-exhausted':'blocked',budgetHit:!!next.budgetHit,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let applied=session.applyDeduction(deduction);if(!applied?.deduction)return {status:'invalid',budgetHit:false,error:'Couronnes deduction could not be applied',...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    trace.push({rule:applied.deduction.rule,techniqueLevel:applied.deduction.techniqueLevel,rank:applied.deduction.rank,conclusions:copy(applied.deduction.conclusions)});
  }
  if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
  return {status:'budget-exhausted',budgetHit:true,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
}
function createAdapter(options={}){return {solveTier(args){return solveQueensTier(args,options)}}}
function humanBandCandidateCertified(requestedDifficulty,candidate){
  const generator=root?.QuadludQueensGenerator;
  return !!generator&&typeof generator.queenHumanBandCandidateCertified==='function'&&generator.queenHumanBandCandidateCertified(requestedDifficulty,candidate)
}
function structureOf(puzzle){let p=canonicalQueens(puzzle),sizes={};for(const id of p.reg.flat())sizes[id]=(sizes[id]||0)+1;let values=Object.values(sizes);return {n:p.n,regionCount:values.length,regionSizes:values.slice().sort((a,b)=>a-b),singletonRegions:values.filter(x=>x===1).length,twoCellRegions:values.filter(x=>x===2).length}}
function ratePuzzle(puzzle,options={}){
  let publicPuzzle=canonicalQueens(puzzle),run=DR.runMinimumRequiredTier({puzzle:publicPuzzle,adapter:createAdapter(options)}),metrics=run.winningAttempt?.result||{};
  let profile=DR.createDifficultyProfile({
    puzzle:publicPuzzle,status:run.status,difficulty:run.difficulty,minimumRequiredTier:run.minimumRequiredTier,
    limitingTechniqueLevel:run.status==='solved'?metrics.limitingTechniqueLevel:null,
    limitingRules:run.status==='solved'?metrics.limitingRules:[],
    totalLogicalSteps:metrics.totalLogicalSteps||0,deductionsByRule:metrics.deductionsByRule||{},
    limitingTierStepCount:metrics.limitingTierStepCount||0,
    initialAvailableMoves:metrics.initialAvailableMoves??null,minAvailableMoves:metrics.minAvailableMoves??null,bottleneckCount:metrics.bottleneckCount??0,
    maxProofDepth:metrics.maxProofDepth||0,budgetHit:run.status==='budget-exhausted'||!!metrics.budgetHit,structure:structureOf(publicPuzzle)
  });
  return {...run,profile};
}

root.QueensDifficulty={VERSION:2,TIER_POLICY,canonicalizePublicPuzzle:canonicalizeQueensPublicPuzzle,nextAllowedDeduction,solveTier:solveQueensTier,createAdapter,ratePuzzle,candidateCertified:humanBandCandidateCertified,_test:{canonicalQueens,initialBoard,solved,directCandidates,nextAllowedDeduction,sessionMetrics}};
if(typeof module!=='undefined'&&module.exports)module.exports=root.QueensDifficulty;
})(typeof globalThis!=='undefined'?globalThis:this);
