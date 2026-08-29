/*
 * QUADLUD — Rectangles logical difficulty adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const DR=(typeof module!=='undefined'&&module.exports)?require('./difficulty-rating.js'):root.DifficultyRating;
const PL=(typeof module!=='undefined'&&module.exports)?require('./patches-logic.js'):root.PatchesLogic;
if(!DR||!PL)throw new Error('Rectangles difficulty dependencies unavailable');

const RULE_TIER=Object.freeze({
  RECTANGLE_DOMAIN:0,CLUE_SINGLETON:0,CELL_SINGLETON:0,RECTANGLE_PROPAGATION:0,
  OWNERSHIP_PROPAGATION:0,RECTANGULAR_CLOSURE:0,AREA_COMPLETION:0,
  COMMON_COVERAGE:1,CELL_LOCKED_TO_CLUE:1,
  COVERAGE_LOCKED_SET:2,NO_SUPPORT_CLUE:2,NO_SUPPORT_CELL:2,LOCAL_DOMAIN_SUPPORT:2,
  ASSUMPTION_CONTRADICTION:3,COMMON_CONSEQUENCE:3
});
const TIER_POLICY=Object.freeze([
  Object.freeze({tier:'easy',maxTechniqueLevel:0,rules:Object.freeze(Object.keys(RULE_TIER).filter(r=>RULE_TIER[r]<=0))}),
  Object.freeze({tier:'medium',maxTechniqueLevel:1,rules:Object.freeze(Object.keys(RULE_TIER).filter(r=>RULE_TIER[r]<=1))}),
  Object.freeze({tier:'hard',maxTechniqueLevel:2,rules:Object.freeze(Object.keys(RULE_TIER).filter(r=>RULE_TIER[r]<=2))}),
  Object.freeze({tier:'expert',maxTechniqueLevel:3,rules:Object.freeze(Object.keys(RULE_TIER).filter(r=>RULE_TIER[r]<=3))})
]);

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function assertObject(value,message){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(message)}
function assertCell(cell,n,message){if(!Array.isArray(cell)||cell.length!==2||!cell.every(Number.isInteger)||cell[0]<0||cell[0]>=n||cell[1]<0||cell[1]>=n)throw new Error(message)}
function compareScalar(a,b){return typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b))}
function normalizeShape(shape){
  if(shape==null)return null;
  if(shape==='square'||shape==='carré'||shape==='□')return 'square';
  if(shape==='vertical'||shape==='▯')return 'vertical';
  if(shape==='horizontal'||shape==='▭')return 'horizontal';
  throw new Error('Invalid Rectangles public clue shape');
}
function canonicalizePatchesPublicPuzzle(puzzle){
  let n=Number(puzzle?.n);if(!Number.isInteger(n)||n<5||n>10)throw new Error('Invalid Rectangles public puzzle size');
  if(Array.isArray(puzzle?.clues)){let clues={};puzzle.clues.forEach((clue,id)=>{clues[id]=copy(clue)});return canonicalizePatchesPublicPuzzle({n,ids:puzzle.clues.map((_,id)=>id),clues})}
  assertObject(puzzle?.clues,'Rectangles public clues are required');
  let ids=Array.isArray(puzzle.ids)?puzzle.ids.slice():Object.keys(puzzle.clues).map(x=>Number.isNaN(Number(x))?x:Number(x));
  if(!ids.length)throw new Error('Rectangles public clues are required');
  ids.sort(compareScalar);
  let seen=new Set(),clues=ids.map(id=>{
    let raw=puzzle.clues[id];assertObject(raw,'Invalid Rectangles public clue');assertCell(raw.pos,n,'Invalid Rectangles public clue position');
    let cell=raw.pos[0]+','+raw.pos[1];if(seen.has(cell))throw new Error('Two Rectangles public clues cannot share a cell');seen.add(cell);
    let mode=raw.mode??'both';if(!['both','size','shape','none'].includes(mode))throw new Error('Invalid Rectangles public clue mode');
    let out={pos:raw.pos.slice(),mode};
    if(mode==='both'||mode==='size'){let size=Number(raw.size??raw.area);if(!Number.isInteger(size)||size<1||size>n*n)throw new Error('Invalid Rectangles public clue size');out.size=size}
    if(mode==='both'||mode==='shape'){let shape=normalizeShape(raw.shape);if(!shape)throw new Error('Invalid Rectangles public clue shape');out.shape=shape}
    return out;
  });
  clues.sort((a,b)=>a.pos[0]-b.pos[0]||a.pos[1]-b.pos[1]||a.mode.localeCompare(b.mode));
  return {schema:DR.SCHEMA_VERSION,game:'patches',n,clues};
}
function canonicalPatches(puzzle){return canonicalizePatchesPublicPuzzle(puzzle)}
function initialBoard(puzzle){
  let p=canonicalPatches(puzzle),ids=p.clues.map((_,i)=>i),clues={};
  p.clues.forEach((clue,id)=>{clues[id]={pos:clue.pos.slice(),mode:clue.mode};if(clue.size!=null)clues[id].size=clue.size;if(clue.shape!=null)clues[id].shape=clue.shape});
  return {n:p.n,ids,clues,paint:Array.from({length:p.n},()=>Array(p.n).fill(null))};
}
function solved(session){
  if(session.diagnoseBasic())return false;
  let covered=new Set();
  for(const id of session.ids){let selected=session.selectedRect(id);if(!selected)return false;for(const cell of selected.rect.cells||PL.helpers.rectCells(selected.rect)){let key=cell[0]+','+cell[1];if(covered.has(key))return false;covered.add(key)}}
  return covered.size===session.n*session.n;
}
function uniqDeductions(list){let seen=new Set(),out=[];for(const d of list||[]){if(!d)continue;let key=d.id||d.signature||JSON.stringify([d.rule,d.conclusions]);if(seen.has(key))continue;seen.add(key);out.push(d)}return out}
function directCandidates(session,tierIndex){return uniqDeductions(session.directDeductions()).filter(d=>(d.techniqueLevel??RULE_TIER[d.rule]??0)<=tierIndex&&(RULE_TIER[d.rule]??d.techniqueLevel??0)<=tierIndex).sort(PL.deductionComparator)}
function nextAllowedDeduction(session,tierIndex,includeAvailability=false){
  let direct=directCandidates(session,tierIndex),best=direct[0]||null;if(best||tierIndex<3)return {deduction:best,budgetHit:false,...(includeAvailability?{availableMoves:direct.length}:{})};
  let hypothesis=session.assumptionContradictionsDetailed(),h=hypothesis.deductions.filter(d=>(d.techniqueLevel??3)<=tierIndex);
  if(h.length)return {deduction:h.sort(PL.deductionComparator)[0],budgetHit:false,...(includeAvailability?{availableMoves:uniqDeductions(h).length}:{})};
  let common=session.commonConsequencesDetailed(),c=common.deductions.filter(d=>(d.techniqueLevel??3)<=tierIndex);
  if(c.length)return {deduction:c.sort(PL.deductionComparator)[0],budgetHit:false,...(includeAvailability?{availableMoves:uniqDeductions(c).length}:{})};
  return {deduction:null,budgetHit:!!(hypothesis.budgetHit||common.budgetHit),...(includeAvailability?{availableMoves:0}:{})};
}
function sessionMetrics(session,tierIndex,availability){
  let logical=(session.appliedDeductions||[]).filter(Boolean),byRule={},maxTechniqueLevel=0,maxProofDepth=0;
  for(const d of logical){byRule[d.rule]=(byRule[d.rule]||0)+1;maxTechniqueLevel=Math.max(maxTechniqueLevel,Number(d.techniqueLevel)||0);maxProofDepth=Math.max(maxProofDepth,Number(d.rank)||0)}
  let limitingRules=[...new Set(logical.filter(d=>(Number(d.techniqueLevel)||0)===maxTechniqueLevel).map(d=>d.rule))].sort();
  return {totalLogicalSteps:logical.length,deductionsByRule:byRule,limitingTechniqueLevel:maxTechniqueLevel,limitingRules,limitingTierStepCount:logical.filter(d=>(Number(d.techniqueLevel)||0)===tierIndex).length,maxProofDepth,...DR.availabilityMetrics(availability)};
}
function solvePatchesTier({puzzle,tierIndex},options={}){
  if(!Number.isInteger(tierIndex)||tierIndex<0||tierIndex>=TIER_POLICY.length)throw new Error('Invalid Rectangles tier');
  let publicPuzzle;try{publicPuzzle=canonicalPatches(puzzle)}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let sessionOptions={};for(const key of ['maxLockedSetSize','maxLockedSetClues','maxLocalGroupSize','maxLocalCandidates','maxHypothesisCandidates','maxHypothesisSteps','maxCommonSteps'])if(options[key]!=null)sessionOptions[key]=options[key];
  let session;try{session=PL.createSession(initialBoard(publicPuzzle),sessionOptions)}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let maxLogicalSteps=Number.isInteger(options.maxLogicalSteps)&&options.maxLogicalSteps>0?options.maxLogicalSteps:publicPuzzle.n*publicPuzzle.n*Math.max(1,publicPuzzle.clues.length)*4,trace=[],availability=options.collectSecondaryMetrics===false?null:DR.createAvailabilityTracker();
  for(let step=0;step<maxLogicalSteps;step++){
    let bad=session.diagnoseBasic();if(bad)return {status:'contradictory',budgetHit:false,contradiction:copy(bad),...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let next=nextAllowedDeduction(session,tierIndex,!!availability),deduction=next.deduction;
    if(availability)DR.recordAvailableMoves(availability,next.availableMoves);
    if(!deduction)return {status:next.budgetHit?'budget-exhausted':'blocked',budgetHit:!!next.budgetHit,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let applied=session.applyDeduction(deduction);if(!applied?.deduction)return {status:'invalid',budgetHit:false,error:'Rectangles deduction could not be applied',...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    trace.push({rule:applied.deduction.rule,policyTier:RULE_TIER[applied.deduction.rule]??applied.deduction.techniqueLevel,engineTechniqueLevel:applied.deduction.techniqueLevel,rank:applied.deduction.rank,conclusions:copy(applied.deduction.conclusions)});
    if(applied.contradiction)return {status:'contradictory',budgetHit:false,contradiction:copy(applied.contradiction),...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
  }
  if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
  return {status:'budget-exhausted',budgetHit:true,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
}
function createAdapter(options={}){return {solveTier(args){return solvePatchesTier(args,options)}}}
function structureOf(puzzle){let p=canonicalPatches(puzzle),modes={both:0,size:0,shape:0,none:0};for(const clue of p.clues)modes[clue.mode]++;return {n:p.n,clueCount:p.clues.length,clueModes:modes}}
function ratePuzzle(puzzle,options={}){
  let publicPuzzle=canonicalPatches(puzzle),run=DR.runMinimumRequiredTier({puzzle,adapter:createAdapter(options)}),metrics=run.winningAttempt?.result||{};
  let profile=DR.createDifficultyProfile({
    puzzle:publicPuzzle,status:run.status,difficulty:run.difficulty,minimumRequiredTier:run.minimumRequiredTier,
    limitingTechniqueLevel:run.status==='solved'?metrics.limitingTechniqueLevel:null,limitingRules:run.status==='solved'?metrics.limitingRules:[],
    totalLogicalSteps:metrics.totalLogicalSteps||0,deductionsByRule:metrics.deductionsByRule||{},limitingTierStepCount:metrics.limitingTierStepCount||0,
    initialAvailableMoves:metrics.initialAvailableMoves??null,minAvailableMoves:metrics.minAvailableMoves??null,bottleneckCount:metrics.bottleneckCount??0,
    maxProofDepth:metrics.maxProofDepth||0,budgetHit:run.status==='budget-exhausted'||!!metrics.budgetHit,structure:structureOf(publicPuzzle)
  });
  return {...run,profile};
}

root.PatchesDifficulty={VERSION:1,RULE_TIER,TIER_POLICY,canonicalizePublicPuzzle:canonicalizePatchesPublicPuzzle,solveTier:solvePatchesTier,createAdapter,ratePuzzle,_test:{canonicalPatches,initialBoard,solved,directCandidates,nextAllowedDeduction,sessionMetrics}};
if(typeof module!=='undefined'&&module.exports)module.exports=root.PatchesDifficulty;
})(typeof globalThis!=='undefined'?globalThis:this);
