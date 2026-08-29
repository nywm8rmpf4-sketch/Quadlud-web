/*
 * QUADLUD — Grille 6 logical difficulty adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const DR=(typeof module!=='undefined'&&module.exports)?require('./difficulty-rating.js'):root.DifficultyRating;
const SL=(typeof module!=='undefined'&&module.exports)?require('./sudoku-logic.js'):root.SudokuLogic;
if(!DR||!SL)throw new Error('Grille 6 difficulty dependencies unavailable');

const RULE_TIER=Object.freeze({
  NAKED_SINGLE:0,
  HIDDEN_SINGLE_ROW:1,
  HIDDEN_SINGLE_COLUMN:1,
  HIDDEN_SINGLE_BOX:1,
  LOCKED_CANDIDATE:2,
  NAKED_SUBSET_2:2,
  HIDDEN_SUBSET_2:2,
  NAKED_SUBSET_3:2,
  HIDDEN_SUBSET_3:2,
  CONTRADICTION_L1:3,
  COMMON_BRANCH_CONSEQUENCE:3,
  CONTRADICTION_L2:3
});
const TIER_POLICY=Object.freeze([
  Object.freeze({tier:'easy',allowedRules:Object.freeze(['NAKED_SINGLE'])}),
  Object.freeze({tier:'medium',allowedRules:Object.freeze(['NAKED_SINGLE','HIDDEN_SINGLE_ROW','HIDDEN_SINGLE_COLUMN','HIDDEN_SINGLE_BOX'])}),
  Object.freeze({tier:'hard',allowedRules:Object.freeze(['NAKED_SINGLE','HIDDEN_SINGLE_ROW','HIDDEN_SINGLE_COLUMN','HIDDEN_SINGLE_BOX','LOCKED_CANDIDATE','NAKED_SUBSET_2','HIDDEN_SUBSET_2','NAKED_SUBSET_3','HIDDEN_SUBSET_3'])}),
  Object.freeze({tier:'expert',allowedRules:Object.freeze(['NAKED_SINGLE','HIDDEN_SINGLE_ROW','HIDDEN_SINGLE_COLUMN','HIDDEN_SINGLE_BOX','LOCKED_CANDIDATE','NAKED_SUBSET_2','HIDDEN_SUBSET_2','NAKED_SUBSET_3','HIDDEN_SUBSET_3','CONTRADICTION_L1','COMMON_BRANCH_CONSEQUENCE','CONTRADICTION_L2'])})
]);

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function assertGrid(grid,n,valid,message){
  if(!Array.isArray(grid)||grid.length!==n||grid.some(row=>!Array.isArray(row)||row.length!==n))throw new Error(message);
  for(const row of grid)for(const value of row)if(!valid(value))throw new Error(message);
}
function canonicalizeSudokuPublicPuzzle(puzzle){
  let state=puzzle?.initialState??puzzle?.state,n=Number(puzzle?.n??state?.length);
  if(n!==6)throw new Error('Invalid Grille 6 public puzzle size');
  assertGrid(state,n,value=>Number.isInteger(value)&&value>=0&&value<=6,'Invalid Grille 6 public state');
  return {schema:DR.SCHEMA_VERSION,game:'sudoku',n,state:state.map(row=>row.slice())};
}
function canonicalSudoku(puzzle){return canonicalizeSudokuPublicPuzzle(puzzle)}
function initialBoard(puzzle){let p=canonicalSudoku(puzzle);return {state:p.state.map(row=>row.slice())}}
function solved(session){return !session.state.flat().includes(0)&&!session.diagnose()}
function policyTierForRule(rule){let tier=RULE_TIER[rule];return Number.isInteger(tier)?tier:null}
function uniqDeductions(list){let seen=new Set(),out=[];for(const d of list||[]){if(!d)continue;let key=d.signature||d.id||JSON.stringify([d.rule,d.conclusions]);if(seen.has(key))continue;seen.add(key);out.push(d)}return out}
function directCandidates(session,tierIndex){
  let pool=[];
  pool.push(...session.nakedSingleDeductions());
  if(tierIndex>=1){
    pool.push(...session.hiddenSingleDeductions('row'));
    pool.push(...session.hiddenSingleDeductions('column'));
    pool.push(...session.hiddenSingleDeductions('box'));
  }
  if(tierIndex>=2){
    pool.push(...session.lockedCandidateDeductions());
    pool.push(...session.nakedSubsetDeductions(2));
    pool.push(...session.hiddenSubsetDeductions(2));
    pool.push(...session.nakedSubsetDeductions(3));
    pool.push(...session.hiddenSubsetDeductions(3));
  }
  return uniqDeductions(pool).filter(d=>{let tier=policyTierForRule(d.rule);return tier!=null&&tier<=tierIndex}).sort(SL.helpers.deductionComparator);
}
function nextAllowedDeduction(session,tierIndex,options={},includeAvailability=false){
  let direct=directCandidates(session,tierIndex),best=direct[0]||null;
  if(best||tierIndex<3)return {deduction:best,budgetHit:false,...(includeAvailability?{availableMoves:direct.length}:{})};
  let before=Number(session.metrics().advancedBudgetHits)||0;
  let advanced=session.advancedDeductions(options).filter(d=>policyTierForRule(d.rule)===3).sort(SL.helpers.deductionComparator);
  let after=Number(session.metrics().advancedBudgetHits)||0;
  return {deduction:advanced[0]||null,budgetHit:!advanced.length&&after>before,...(includeAvailability?{availableMoves:advanced.length}:{})};
}
function sessionMetrics(session,tierIndex,availability){
  let logical=session.appliedDeductions||[],byRule={},maxPolicyTier=0,maxEngineTechniqueLevel=0,maxProofDepth=0;
  for(const d of logical){
    let rule=String(d.rule||'UNKNOWN'),policyTier=policyTierForRule(rule);
    byRule[rule]=(byRule[rule]||0)+1;
    if(policyTier!=null)maxPolicyTier=Math.max(maxPolicyTier,policyTier);
    maxEngineTechniqueLevel=Math.max(maxEngineTechniqueLevel,Number(d.techniqueLevel)||0);
    maxProofDepth=Math.max(maxProofDepth,Number(d.rank)||0);
  }
  let limitingRules=[...new Set(logical.filter(d=>policyTierForRule(d.rule)===maxPolicyTier).map(d=>d.rule))].sort();
  return {
    totalLogicalSteps:logical.length,
    deductionsByRule:byRule,
    limitingTechniqueLevel:maxPolicyTier,
    limitingRules,
    limitingTierStepCount:logical.filter(d=>policyTierForRule(d.rule)===tierIndex).length,
    maxProofDepth,
    maxEngineTechniqueLevel,
    hypothesesTested:Number(session.metrics().hypothesesTested)||0,
    maxHypothesisDepth:Number(session.metrics().maxHypothesisDepth)||0,
    advancedBudgetHits:Number(session.metrics().advancedBudgetHits)||0,
    ...DR.availabilityMetrics(availability)
  };
}
function solveSudokuTier({puzzle,tierIndex},options={}){
  if(!Number.isInteger(tierIndex)||tierIndex<0||tierIndex>=TIER_POLICY.length)throw new Error('Invalid Grille 6 tier');
  let publicPuzzle;
  try{publicPuzzle=canonicalSudoku(puzzle)}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let session;
  try{session=SL.createSession(initialBoard(publicPuzzle))}catch(error){return {status:'invalid',budgetHit:false,error:String(error&&error.message||error)}}
  let maxLogicalSteps=Number.isInteger(options.maxLogicalSteps)&&options.maxLogicalSteps>0?options.maxLogicalSteps:SL.SIZE*SL.SIZE*12;
  let trace=[],availability=options.collectSecondaryMetrics===false?null:DR.createAvailabilityTracker();
  for(let step=0;step<maxLogicalSteps;step++){
    let contradiction=session.diagnose();
    if(contradiction)return {status:'contradictory',budgetHit:false,contradiction:copy(contradiction),...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let next=nextAllowedDeduction(session,tierIndex,options,!!availability),deduction=next.deduction;
    if(availability)DR.recordAvailableMoves(availability,next.availableMoves);
    if(!deduction)return {status:next.budgetHit?'budget-exhausted':'blocked',budgetHit:!!next.budgetHit,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let ruleTier=policyTierForRule(deduction.rule);
    if(ruleTier==null||ruleTier>tierIndex)return {status:'invalid',budgetHit:false,error:'Grille 6 adapter received a disallowed rule',...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    let applied=session.applyDeduction(deduction);
    if(!applied?.deduction)return {status:'invalid',budgetHit:false,error:'Grille 6 deduction could not be applied',...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
    trace.push({rule:applied.deduction.rule,policyTier:ruleTier,engineTechniqueLevel:applied.deduction.techniqueLevel,rank:applied.deduction.rank,conclusions:copy(applied.deduction.conclusions)});
  }
  if(solved(session))return {status:'solved',budgetHit:false,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
  return {status:'budget-exhausted',budgetHit:true,...sessionMetrics(session,tierIndex,availability),trace:copy(trace)};
}
function createAdapter(options={}){return {solveTier(args){return solveSudokuTier(args,options)}}}
function structureOf(puzzle){let p=canonicalSudoku(puzzle),givenCount=p.state.flat().filter(Boolean).length;return {n:p.n,givenCount,emptyCount:p.n*p.n-givenCount}}
function ratePuzzle(puzzle,options={}){
  let publicPuzzle=canonicalSudoku(puzzle),run=DR.runMinimumRequiredTier({puzzle:publicPuzzle,adapter:createAdapter(options)}),metrics=run.winningAttempt?.result||{};
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

root.SudokuDifficulty={VERSION:1,RULE_TIER,TIER_POLICY,canonicalizePublicPuzzle:canonicalizeSudokuPublicPuzzle,solveTier:solveSudokuTier,createAdapter,ratePuzzle,_test:{canonicalSudoku,initialBoard,solved,directCandidates,nextAllowedDeduction,policyTierForRule,sessionMetrics}};
if(typeof module!=='undefined'&&module.exports)module.exports=root.SudokuDifficulty;
})(typeof globalThis!=='undefined'?globalThis:this);
