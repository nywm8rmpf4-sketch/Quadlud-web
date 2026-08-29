/*
 * QUADLUD — Soleil/Lune logical difficulty adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const DR=(typeof module!=='undefined'&&module.exports)?require('./difficulty-rating.js'):root.DifficultyRating;
const TL=(typeof module!=='undefined'&&module.exports)?require('./tango-logic.js'):root.TangoLogic;
if(!DR||!TL)throw new Error('Soleil/Lune difficulty dependencies unavailable');

const VALUE_EMPTY=TL.constants.VALUE_EMPTY;
const RULE_TIER=Object.freeze({
  RELATION_PROPAGATION:0,
  RELATION_CLOSURE:0,
  TRIPLE_CONSTRAINT:0,
  BALANCE_QUOTA:0,
  BALANCE_RELATION:1,
  RELATION_BALANCE:1,
  RELATION_BALANCE_COMPONENT:2,
  LINE_DOMAIN_SUPPORT:2,
  ASSUMPTION_CONTRADICTION:3,
  COMMON_CONSEQUENCE:3
});
const TIER_POLICY=Object.freeze([
  Object.freeze({tier:'easy',allowedRules:Object.freeze(['RELATION_PROPAGATION','RELATION_CLOSURE','TRIPLE_CONSTRAINT','BALANCE_QUOTA'])}),
  Object.freeze({tier:'medium',allowedRules:Object.freeze(['RELATION_PROPAGATION','RELATION_CLOSURE','TRIPLE_CONSTRAINT','BALANCE_QUOTA','BALANCE_RELATION','RELATION_BALANCE'])}),
  Object.freeze({tier:'hard',allowedRules:Object.freeze(['RELATION_PROPAGATION','RELATION_CLOSURE','TRIPLE_CONSTRAINT','BALANCE_QUOTA','BALANCE_RELATION','RELATION_BALANCE','RELATION_BALANCE_COMPONENT','LINE_DOMAIN_SUPPORT'])}),
  Object.freeze({tier:'expert',allowedRules:Object.freeze(['RELATION_PROPAGATION','RELATION_CLOSURE','TRIPLE_CONSTRAINT','BALANCE_QUOTA','BALANCE_RELATION','RELATION_BALANCE','RELATION_BALANCE_COMPONENT','LINE_DOMAIN_SUPPORT','ASSUMPTION_CONTRADICTION','COMMON_CONSEQUENCE'])})
]);

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function assertGrid(grid,n,valid,message){
  if(!Array.isArray(grid)||grid.length!==n||grid.some(row=>!Array.isArray(row)||row.length!==n))throw new Error(message);
  for(const row of grid)for(const value of row)if(!valid(value))throw new Error(message);
}
function assertCell(cell,n,message){if(!Array.isArray(cell)||cell.length!==2||!cell.every(Number.isInteger)||cell[0]<0||cell[0]>=n||cell[1]<0||cell[1]>=n)throw new Error(message)}
function canonicalizeTangoPublicPuzzle(puzzle){
  let state=puzzle?.initialState??puzzle?.state,n=Number(puzzle?.n??state?.length);
  if(!Number.isInteger(n)||n<2||n%2)throw new Error('Invalid Soleil/Lune public puzzle size');
  assertGrid(state,n,value=>value===-1||value===0||value===1,'Invalid Soleil/Lune public state');
  let edges=Array.isArray(puzzle?.edges)?puzzle.edges.map(edge=>{
    if(!Array.isArray(edge)||edge.length!==4)throw new Error('Invalid Soleil/Lune public relation');
    let [r,c,dir,rel]=edge;if(!Number.isInteger(r)||!Number.isInteger(c)||(dir!=='r'&&dir!=='d')||(rel!=='='&&rel!=='×'))throw new Error('Invalid Soleil/Lune public relation');
    let other=dir==='r'?[r,c+1]:[r+1,c];assertCell([r,c],n,'Invalid Soleil/Lune public relation');assertCell(other,n,'Invalid Soleil/Lune public relation');
    return [r,c,dir,rel];
  }):[];
  edges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2])||a[3].localeCompare(b[3]));
  return {schema:DR.SCHEMA_VERSION,game:'tango',n,state:state.map(row=>row.slice()),edges};
}
function canonicalTango(puzzle){return canonicalizeTangoPublicPuzzle(puzzle)}
function initialBoard(puzzle){let p=canonicalTango(puzzle);return {n:p.n,state:p.state.map(r=>r.slice()),edges:copy(p.edges)}}
function solved(session){return !session.state.some(row=>row.includes(VALUE_EMPTY))&&!session.diagnose()}
function allowedSet(tierIndex){return new Set(TIER_POLICY[tierIndex].allowedRules)}
function uniqDeductions(list){let seen=new Set(),out=[];for(const d of list||[]){if(!d)continue;let key=d.id||d.signature||JSON.stringify([d.rule,d.conclusions]);if(seen.has(key))continue;seen.add(key);out.push(d)}return out}
function directCandidates(session,tierIndex){
  let allowed=allowedSet(tierIndex);
  return session.directDeductions().filter(d=>allowed.has(d.rule)).sort(TL.deductionComparator);
}
function nextAllowedDeduction(session,tierIndex,includeAvailability=false){
  let direct=directCandidates(session,tierIndex),best=direct[0]||null;
  if(best||tierIndex<3)return {deduction:best,budgetHit:false,...(includeAvailability?{availableMoves:direct.length}:{})};
  let hypo=session.findAssumptionContradictionsDetailed(),hypotheses=uniqDeductions(hypo.deductions||[]);
  if(hypotheses.length)return {deduction:hypotheses[0],budgetHit:false,...(includeAvailability?{availableMoves:hypotheses.length}:{})};
  let common=session.findCommonConsequencesDetailed(),consequences=uniqDeductions(common.deductions||[]);
  return {deduction:consequences[0]||null,budgetHit:!consequences.length&&!!(hypo.budgetHit||common.budgetHit),...(includeAvailability?{availableMoves:consequences.length}:{})};
}
function policyTierForRule(rule){let tier=RULE_TIER[rule];return Number.isInteger(tier)?tier:0}
function sessionMetrics(session,tierIndex,availability){
  let logical=(session.appliedDeductions||[]).filter(Boolean),byRule={},maxTier=0,maxProofDepth=0;
  for(const d of logical){byRule[d.rule]=(byRule[d.rule]||0)+1;maxTier=Math.max(maxTier,policyTierForRule(d.rule));maxProofDepth=Math.max(maxProofDepth,Number(d.rank)||0)}
  let limitingRules=[...new Set(logical.filter(d=>policyTierForRule(d.rule)===maxTier).map(d=>d.rule))].sort();
  return {
    totalLogicalSteps:logical.length,
    deductionsByRule:byRule,
    limitingTechniqueLevel:maxTier,
    limitingRules,
    limitingTierStepCount:logical.filter(d=>policyTierForRule(d.rule)===tierIndex).length,
    maxProofDepth,
    ...DR.availabilityMetrics(availability)
  };
}
function solveTangoTier({puzzle,tierIndex},options={}){
  if(!Number.isInteger(tierIndex)||tierIndex<0||tierIndex>=TIER_POLICY.length)throw new Error('Invalid Soleil/Lune tier');
  let publicPuzzle;
  try{publicPuzzle=canonicalTango(puzzle)}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let session;
  try{session=TL.createSession(initialBoard(publicPuzzle),{maxHypothesisSteps:options.maxHypothesisSteps??18,maxCommonSteps:options.maxCommonSteps??10})}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let maxLogicalSteps=Number.isInteger(options.maxLogicalSteps)&&options.maxLogicalSteps>0?options.maxLogicalSteps:publicPuzzle.n*publicPuzzle.n*12;
  let trace=[],availability=options.collectSecondaryMetrics===false?null:DR.createAvailabilityTracker();
  for(let step=0;step<maxLogicalSteps;step++){
    let bad=session.diagnose();if(bad)return {status:'contradictory',budgetHit:false,contradiction:copy(bad),...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let next=nextAllowedDeduction(session,tierIndex,!!availability),deduction=next.deduction;
    if(availability)DR.recordAvailableMoves(availability,next.availableMoves);
    if(!deduction)return {status:next.budgetHit?'budget-exhausted':'blocked',budgetHit:!!next.budgetHit,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let applied=session.applyDeduction(deduction);if(!applied?.deduction)return {status:'invalid',budgetHit:false,error:'Soleil/Lune deduction could not be applied',...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    for(const d of [applied.deduction,...(applied.automatic||[])])trace.push({rule:d.rule,policyTier:policyTierForRule(d.rule),engineTechniqueLevel:Number(d.techniqueLevel)||0,rank:Number(d.rank)||0,conclusions:copy(d.conclusions||[])});
  }
  if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
  return {status:'budget-exhausted',budgetHit:true,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
}
function createAdapter(options={}){return {solveTier(args){return solveTangoTier(args,options)}}}
function structureOf(puzzle){
  let p=canonicalTango(puzzle),givenCount=p.state.flat().filter(v=>v!==VALUE_EMPTY).length;
  let sameRelations=p.edges.filter(e=>e[3]==='=').length,oppositeRelations=p.edges.length-sameRelations;
  return {n:p.n,givenCount,relationCount:p.edges.length,sameRelations,oppositeRelations};
}
function ratePuzzle(puzzle,options={}){
  let publicPuzzle=canonicalTango(puzzle),run=DR.runMinimumRequiredTier({puzzle:publicPuzzle,adapter:createAdapter(options)}),metrics=run.winningAttempt?.result||{};
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

root.TangoDifficulty={VERSION:1,RULE_TIER,TIER_POLICY,canonicalizePublicPuzzle:canonicalizeTangoPublicPuzzle,solveTier:solveTangoTier,createAdapter,ratePuzzle,_test:{canonicalTango,initialBoard,solved,directCandidates,nextAllowedDeduction,policyTierForRule,sessionMetrics}};
if(typeof module!=='undefined'&&module.exports)module.exports=root.TangoDifficulty;
})(typeof globalThis!=='undefined'?globalThis:this);
