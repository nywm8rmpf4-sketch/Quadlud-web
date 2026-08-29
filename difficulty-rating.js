/*
 * QUADLUD — Shared logical difficulty rating contract
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const VERSION=1;
const SCHEMA_VERSION=1;
const RATING_VERSION=1;
const FINGERPRINT_VERSION=1;
const GENERATOR_VERSION=1;

const TIER_DEFINITIONS=Object.freeze([
  Object.freeze({index:0,key:'easy',name:'Easy'}),
  Object.freeze({index:1,key:'medium',name:'Medium'}),
  Object.freeze({index:2,key:'hard',name:'Hard'}),
  Object.freeze({index:3,key:'expert',name:'Expert'})
]);
const TIER_KEYS=Object.freeze(TIER_DEFINITIONS.map(x=>x.key));
const STATUSES=Object.freeze(['solved','blocked','contradictory','budget-exhausted','invalid']);
const GAME_REGISTRY=(typeof module!=='undefined'&&module.exports)?require('./game-registry.js'):root.QuadludGameRegistry;
if(!GAME_REGISTRY)throw new Error('QUADLUD game registry unavailable');
const GAMES=GAME_REGISTRY.IDS;

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function assertObject(value,message){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(message)}
function assertGame(game){if(!GAMES.includes(game))throw new Error('Unknown difficulty-rating game')}
function canonicalizePublicPuzzle(puzzle){
  assertObject(puzzle,'Public puzzle is required');
  let game=String(puzzle.game||'');assertGame(game);
  return GAME_REGISTRY.requireCapability(game,'canonicalizePublicPuzzle')(puzzle);
}
function ratePuzzle(puzzle,options={}){
  assertObject(puzzle,'Public puzzle is required');
  let game=String(puzzle.game||'');assertGame(game);
  return GAME_REGISTRY.requireCapability(game,'difficulty').ratePuzzle(puzzle,options);
}
function canonicalString(puzzle){return JSON.stringify(canonicalizePublicPuzzle(puzzle))}
function fnv1a128(text){
  let hash=0x6c62272e07bb014262b821756295c58dn,prime=0x0000000001000000000000000000013bn,mask=(1n<<128n)-1n;
  for(let i=0;i<text.length;i++){let code=text.charCodeAt(i);hash^=BigInt(code&0xff);hash=(hash*prime)&mask;hash^=BigInt(code>>>8);hash=(hash*prime)&mask}
  return hash.toString(16).padStart(32,'0');
}
function fingerprintCanonical(canonical){return 'qfp'+FINGERPRINT_VERSION+'-'+fnv1a128(JSON.stringify(canonical))}
function fingerprintPublicPuzzle(puzzle){return fingerprintCanonical(canonicalizePublicPuzzle(puzzle))}
function tierIndex(tier){
  if(tier==null)return null;
  if(Number.isInteger(tier)&&tier>=0&&tier<TIER_DEFINITIONS.length)return tier;
  let key=String(tier).toLowerCase(),found=TIER_DEFINITIONS.find(x=>x.key===key);if(!found)throw new Error('Invalid difficulty tier');return found.index;
}
function tierKey(tier){let index=tierIndex(tier);return index==null?null:TIER_DEFINITIONS[index].key}
function normalizeCountMap(value){
  if(value==null)return {};
  assertObject(value,'deductionsByRule must be an object');let out={};for(const key of Object.keys(value).sort()){let count=Number(value[key]);if(!Number.isInteger(count)||count<0)throw new Error('Invalid deduction count');if(count)out[key]=count}return out;
}
function createAvailabilityTracker(){return {samples:0,initialAvailableMoves:null,minAvailableMoves:null,bottleneckCount:0}}
function recordAvailableMoves(tracker,count){
  assertObject(tracker,'Availability tracker is required');let n=Number(count);if(!Number.isInteger(n)||n<0)throw new Error('Invalid available move count');
  if(!Number.isInteger(tracker.samples)||tracker.samples<0)throw new Error('Invalid availability tracker');
  if(tracker.samples===0){tracker.initialAvailableMoves=n;tracker.minAvailableMoves=n;tracker.bottleneckCount=1}
  else if(n<tracker.minAvailableMoves){tracker.minAvailableMoves=n;tracker.bottleneckCount=1}
  else if(n===tracker.minAvailableMoves)tracker.bottleneckCount++;
  tracker.samples++;return tracker;
}
function availabilityMetrics(tracker){
  if(tracker==null)return {initialAvailableMoves:null,minAvailableMoves:null,bottleneckCount:0};
  assertObject(tracker,'Availability tracker is required');
  if(!Number.isInteger(tracker.samples)||tracker.samples<0)throw new Error('Invalid availability tracker');
  if(!tracker.samples)return {initialAvailableMoves:null,minAvailableMoves:null,bottleneckCount:0};
  return {initialAvailableMoves:Number(tracker.initialAvailableMoves),minAvailableMoves:Number(tracker.minAvailableMoves),bottleneckCount:Number(tracker.bottleneckCount)};
}
function normalizeTierAttemptResult(result,tier){
  assertObject(result,'Difficulty tier adapter must return an object');
  let status=String(result.status||'');
  if(!STATUSES.includes(status))throw new Error('Invalid difficulty tier adapter status');
  if(status==='blocked'&&result.budgetHit)throw new Error('Blocked difficulty tier result cannot report budgetHit; use budget-exhausted');
  return {
    tierIndex:tier.index,
    tier:tier.key,
    status,
    budgetHit:status==='budget-exhausted'||!!result.budgetHit,
    result:copy(result)
  };
}
function profileMetricsFromResult(result){
  let value=result&&typeof result==='object'?result:{};
  return {
    limitingTechniqueLevel:value.limitingTechniqueLevel??null,
    limitingRules:value.limitingRules??[],
    totalLogicalSteps:value.totalLogicalSteps??0,
    deductionsByRule:value.deductionsByRule??{},
    limitingTierStepCount:value.limitingTierStepCount??0,
    initialAvailableMoves:value.initialAvailableMoves??null,
    minAvailableMoves:value.minAvailableMoves??null,
    bottleneckCount:value.bottleneckCount??0,
    maxProofDepth:value.maxProofDepth??0,
    structure:value.structure??{}
  };
}
function runMinimumRequiredTier(options){
  assertObject(options,'Minimum-tier runner options are required');
  assertObject(options.adapter,'Difficulty tier adapter is required');
  if(typeof options.adapter.solveTier!=='function')throw new Error('Difficulty tier adapter must expose solveTier()');
  let canonicalizer=typeof options.canonicalizePublicPuzzle==='function'?options.canonicalizePublicPuzzle:canonicalizePublicPuzzle;
  let initialPuzzle=canonicalizer(options.puzzle),attempts=[];
  for(const tier of TIER_DEFINITIONS){
    let attemptPuzzle=copy(initialPuzzle);
    let raw=options.adapter.solveTier({puzzle:attemptPuzzle,tier:tier.key,tierIndex:tier.index});
    if(raw&&typeof raw.then==='function')throw new Error('Async difficulty tier adapters are not supported');
    let attempt=normalizeTierAttemptResult(raw,tier);attempts.push(attempt);
    if(attempt.status==='solved'){
      return {
        status:'solved',
        difficulty:tier.key,
        minimumRequiredTier:tier.index,
        attempts:copy(attempts),
        winningAttempt:copy(attempt),
        profile:createDifficultyProfileFromCanonical({puzzle:initialPuzzle,status:'solved',difficulty:tier.key,minimumRequiredTier:tier.index,budgetHit:attempt.budgetHit,...profileMetricsFromResult(attempt.result)})
      };
    }
    if(attempt.status==='blocked')continue;
    return {
      status:attempt.status,
      difficulty:null,
      minimumRequiredTier:null,
      attempts:copy(attempts),
      winningAttempt:null,
      profile:createDifficultyProfileFromCanonical({puzzle:initialPuzzle,status:attempt.status,budgetHit:attempt.budgetHit,...profileMetricsFromResult(attempt.result)})
    };
  }
  return {
    status:'blocked',
    difficulty:null,
    minimumRequiredTier:null,
    attempts:copy(attempts),
    winningAttempt:null,
    profile:createDifficultyProfileFromCanonical({puzzle:initialPuzzle,status:'blocked',...profileMetricsFromResult(attempts[attempts.length-1]?.result)})
  };
}

function createDifficultyProfileFromCanonical(options){
  assertObject(options,'DifficultyProfile options are required');
  let publicPuzzle=copy(options.puzzle);assertObject(publicPuzzle,'Canonical public puzzle is required');if(!String(publicPuzzle.game||''))throw new Error('Canonical public puzzle game is required');
  let status=options.status??'blocked';if(!STATUSES.includes(status))throw new Error('Invalid difficulty status');
  let minimumRequiredTier=tierIndex(options.minimumRequiredTier),difficulty=options.difficulty==null?tierKey(minimumRequiredTier):tierKey(options.difficulty);
  if(minimumRequiredTier!=null&&difficulty!=null&&tierKey(minimumRequiredTier)!==difficulty)throw new Error('Difficulty and minimumRequiredTier disagree');
  let limitingTechniqueLevel=options.limitingTechniqueLevel==null?null:Number(options.limitingTechniqueLevel);if(limitingTechniqueLevel!=null&&(!Number.isInteger(limitingTechniqueLevel)||limitingTechniqueLevel<0))throw new Error('Invalid limiting technique level');
  let limitingRules=Array.isArray(options.limitingRules)?[...new Set(options.limitingRules.map(String))].sort():[];
  let nonNegativeInteger=(value,name,defaultValue=0)=>{if(value==null)return defaultValue;let n=Number(value);if(!Number.isInteger(n)||n<0)throw new Error('Invalid '+name);return n};
  return {
    schema:SCHEMA_VERSION,
    ratingVersion:RATING_VERSION,
    game:publicPuzzle.game,
    status,
    difficulty,
    minimumRequiredTier,
    limitingTechniqueLevel,
    limitingRules,
    totalLogicalSteps:nonNegativeInteger(options.totalLogicalSteps,'totalLogicalSteps'),
    deductionsByRule:normalizeCountMap(options.deductionsByRule),
    limitingTierStepCount:nonNegativeInteger(options.limitingTierStepCount,'limitingTierStepCount'),
    initialAvailableMoves:options.initialAvailableMoves==null?null:nonNegativeInteger(options.initialAvailableMoves,'initialAvailableMoves'),
    minAvailableMoves:options.minAvailableMoves==null?null:nonNegativeInteger(options.minAvailableMoves,'minAvailableMoves'),
    bottleneckCount:nonNegativeInteger(options.bottleneckCount,'bottleneckCount'),
    maxProofDepth:nonNegativeInteger(options.maxProofDepth,'maxProofDepth'),
    budgetHit:!!options.budgetHit,
    structure:options.structure==null?{}:copy(options.structure),
    fingerprint:fingerprintCanonical(publicPuzzle)
  };
}
function createDifficultyProfile(options){
  assertObject(options,'DifficultyProfile options are required');
  return createDifficultyProfileFromCanonical({...options,puzzle:canonicalizePublicPuzzle(options.puzzle)});
}

root.DifficultyRating={
  VERSION,SCHEMA_VERSION,RATING_VERSION,FINGERPRINT_VERSION,GENERATOR_VERSION,
  TIER_DEFINITIONS,TIER_KEYS,STATUSES,GAMES,
  canonicalizePublicPuzzle,canonicalString,fingerprintCanonical,fingerprintPublicPuzzle,ratePuzzle,createDifficultyProfile,createDifficultyProfileFromCanonical,runMinimumRequiredTier,tierIndex,tierKey,
  createAvailabilityTracker,recordAvailableMoves,availabilityMetrics
};
if(typeof module!=='undefined'&&module.exports)module.exports=root.DifficultyRating;
})(typeof globalThis!=='undefined'?globalThis:this);
