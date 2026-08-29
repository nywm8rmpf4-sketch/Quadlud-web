/*
 * QUADLUD — Couronnes generator
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
'use strict';

const QuadludQueensQpool4=(typeof module!=='undefined'&&module.exports)?require('./queens-qpool4.js'):(typeof globalThis!=='undefined'?globalThis.QuadludQueensQpool4:null);

function queenRegionSizeCount(reg,size){
  let sizes={};for(let id of reg.flat())sizes[id]=(sizes[id]||0)+1;
  return Object.values(sizes).filter(x=>x===size).length
}
function queenSingletonRegions(reg){return queenRegionSizeCount(reg,1)}
function queenTwoCellRegions(reg){return queenRegionSizeCount(reg,2)}

// Queens generator primitives restored from the last known complete baseline (v2.21.11).
// They are shared by the current certified generator and QA uniqueness checks.
function countQueensGenerated(reg,limit=2){const n=reg.length;let count=0,usedC=new Set(),usedR=new Set();function bt(r,prev){if(count>=limit)return;if(r===n){count++;return}for(let c=0;c<n;c++){let z=reg[r][c];if(usedC.has(c)||usedR.has(z))continue;if(r>0&&Math.abs(c-prev)===1)continue;usedC.add(c);usedR.add(z);bt(r+1,c);usedC.delete(c);usedR.delete(z);if(count>=limit)return}}bt(0,-99);return count}
function randomQueenSolution(n){for(let t=0;t<3000;t++){let p=shuffle(Array.from({length:n},(_,i)=>i));if(p.every((c,r)=>r===0||Math.abs(c-p[r-1])!==1))return p}return null}
function queenRegionsFromSolution(sol,singleCount){const n=sol.length,singleRows=new Set(shuffle(Array.from({length:n},(_,i)=>i)).slice(0,singleCount)),reg=Array.from({length:n},()=>Array(n).fill(-1));for(let r=0;r<n;r++)reg[r][sol[r]]=r;let left=n*n-n;while(left){let options=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(reg[r][c]===-1){let ids=[];for(let [rr,cc] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]])if(rr>=0&&rr<n&&cc>=0&&cc<n&&reg[rr][cc]>=0&&!singleRows.has(reg[rr][cc])&&!ids.includes(reg[rr][cc]))ids.push(reg[rr][cc]);if(ids.length)options.push([r,c,ids])}if(!options.length)return null;let [r,c,ids]=options[Math.floor(Math.random()*options.length)],sizes=Array(n).fill(0);for(let row of reg)for(let x of row)if(x>=0)sizes[x]++;ids.sort((a,b)=>sizes[a]-sizes[b]);let pool=ids.slice(0,Math.min(2,ids.length)),id=pool[Math.floor(Math.random()*pool.length)];reg[r][c]=id;left--}return reg}

function queenRegionConnectedAfterMove(reg,id,rr,cc){
  let cells=[];for(let r=0;r<reg.length;r++)for(let c=0;c<reg.length;c++)if(reg[r][c]===id&&!(r===rr&&c===cc))cells.push([r,c]);
  if(!cells.length)return false;
  let set=new Set(cells.map(x=>x.join(','))),seen=new Set([cells[0].join(',')]),q=[cells[0]];
  while(q.length){let [r,c]=q.pop();for(let [r2,c2] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]]){let k=r2+','+c2;if(set.has(k)&&!seen.has(k)){seen.add(k);q.push([r2,c2])}}}
  return seen.size===cells.length
}
function reduceQueenSingletons(reg,sol,maxSingles){
  reg=reg.map(r=>[...r]);let n=reg.length;
  for(let pass=0;pass<n*3;pass++){
    let sizes=Array(n).fill(0);for(let row of reg)for(let id of row)sizes[id]++;
    let singles=[];for(let id=0;id<n;id++)if(sizes[id]===1)singles.push(id);
    if(singles.length<=maxSingles)return reg;
    let changed=false;
    for(let id of shuffle(singles.slice(maxSingles))){
      let qr=id,qc=sol[id],cands=[];
      for(let [rr,cc] of shuffle([[qr+1,qc],[qr-1,qc],[qr,qc+1],[qr,qc-1]])){
        if(rr<0||rr>=n||cc<0||cc>=n)continue;
        let donor=reg[rr][cc];
        if(donor===id||sizes[donor]<3)continue;
        if(rr===donor&&cc===sol[donor])continue; // never steal donor queen
        if(!queenRegionConnectedAfterMove(reg,donor,rr,cc))continue;
        cands.push([rr,cc,donor])
      }
      if(cands.length){
        let [rr,cc,donor]=cands[Math.floor(Math.random()*cands.length)];
        reg[rr][cc]=id;sizes[id]++;sizes[donor]--;changed=true
      }
    }
    if(!changed)break
  }
  let sizes=Array(n).fill(0);for(let row of reg)for(let id of row)sizes[id]++;
  return sizes.filter(x=>x===1).length<=maxSingles?reg:null
}



function growQueenTwoCellRegions(reg,sol,maxTwos=3){
  reg=reg.map(row=>[...row]);let n=reg.length,guard=0;
  while(queenTwoCellRegions(reg)>maxTwos&&guard++<n*n*4){
    let sizes=Array(n).fill(0);for(let row of reg)for(let id of row)sizes[id]++;
    let targets=shuffle(Array.from({length:n},(_,id)=>id).filter(id=>sizes[id]===2)),changed=false;
    for(let id of targets){
      let candidates=[];
      for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(reg[r][c]===id){
        for(let [rr,cc] of shuffle([[r+1,c],[r-1,c],[r,c+1],[r,c-1]])){
          if(rr<0||rr>=n||cc<0||cc>=n)continue;
          let donor=reg[rr][cc];
          if(donor===id||sizes[donor]<=3)continue;
          if(rr===donor&&cc===sol[donor])continue;
          if(!queenRegionConnectedAfterMove(reg,donor,rr,cc))continue;
          candidates.push([rr,cc,donor])
        }
      }
      if(candidates.length){
        let [rr,cc,donor]=candidates[Math.floor(Math.random()*candidates.length)];
        reg[rr][cc]=id;sizes[id]++;sizes[donor]--;changed=true;
        if(queenTwoCellRegions(reg)<=maxTwos)return reg
      }
    }
    if(!changed)break
  }
  return queenTwoCellRegions(reg)<=maxTwos?reg:null
}

// v2.23 — Queens generation certified by the shared logical rating.
// Structural parameters remain heuristics only; acceptance is always an exact logical tier match.
const queenCertifiedTemplatesV223=Object.freeze({"easy":{"n":7,"sol":[5,3,1,4,2,6,0],"reg":[[0,0,0,0,0,1,0],[0,0,0,0,0,0,0],[0,2,0,0,0,3,0],[3,3,3,3,4,3,3],[3,3,3,3,3,3,3],[5,5,3,3,3,3,6],[5,5,3,3,3,3,3]]},"medium":{"n":8,"sol":[7,0,3,1,6,4,2,5],"reg":[[0,0,0,0,0,0,0,1],[0,0,0,2,2,0,0,2],[0,0,0,2,2,2,2,2],[0,3,3,3,2,2,2,4],[3,3,3,3,5,2,6,4],[3,3,3,5,5,4,4,4],[3,3,7,5,5,4,4,4],[3,3,5,5,5,4,4,4]]},"hard":{"n":9,"sol":[3,7,4,0,5,1,8,6,2],"reg":[[5,5,5,8,8,8,8,8,7],[5,6,5,6,6,6,8,7,7],[5,6,5,5,6,6,7,7,7],[5,6,5,5,6,6,6,6,7],[5,6,6,6,6,4,6,7,7],[5,3,4,4,4,4,6,6,7],[5,3,4,0,4,4,2,2,2],[5,3,3,0,4,1,1,1,2],[5,3,0,0,0,0,1,1,1]]},"expert":{"n":9,"sol":[2,8,1,4,6,3,5,0,7],"reg":[[0,0,0,3,3,3,4,4,1],[0,2,5,5,3,4,4,1,1],[0,2,5,5,3,4,4,1,1],[0,5,5,5,3,4,4,6,6],[5,5,5,5,3,3,4,6,6],[5,5,5,5,3,6,6,6,6],[5,5,5,5,6,6,6,6,6],[7,5,5,6,6,6,6,6,6],[7,5,5,6,6,6,8,8,6]]}});
const queenCertifiedGenerationConfigV223=Object.freeze({
  easy:Object.freeze({n:7,single:4,maxSingles:99,maxTwos:99,attempts:320,strategy:'random'}),
  medium:Object.freeze({n:8,single:3,maxSingles:99,maxTwos:99,attempts:620,strategy:'random'}),
  hard:Object.freeze({n:9,single:3,maxSingles:0,maxTwos:3,attempts:32,strategy:'template-mutation'}),
  expert:Object.freeze({n:9,single:3,maxSingles:0,maxTwos:3,attempts:16,strategy:'template-mutation'})
});
function queenGenerationStatsV223(diff,cfg){return {generatorVersion:typeof DifficultyRating!=='undefined'?DifficultyRating.GENERATOR_VERSION:1,targetDifficulty:diff,strategy:cfg.strategy,attempts:0,rejected:{structure:0,uniqueness:0,ratingMismatch:0,budgetExhausted:0,invalid:0},fallbackUsed:false}}
function queenRateGeneratedV223(reg){
  if(typeof DifficultyRating==='undefined')throw new Error('Queens certified rating dependencies unavailable');
  return DifficultyRating.ratePuzzle({game:'queens',n:reg.length,reg})
}
function queenExactDifficultyMatchV223(rate,diff){return !!rate&&rate.profile?.status==='solved'&&rate.profile?.difficulty===diff&&rate.profile?.minimumRequiredTier===DifficultyRating.tierIndex(diff)&&!rate.profile?.budgetHit}
function queenCertifiedResultV223(candidate,rate,stats){
  let profile=JSON.parse(JSON.stringify(rate.profile));
  stats.fingerprint=profile.fingerprint;stats.minimumRequiredTier=profile.minimumRequiredTier;stats.totalLogicalSteps=profile.totalLogicalSteps;
  return {n:candidate.n,sol:[...candidate.sol],reg:candidate.reg.map(r=>[...r]),difficultyProfile:profile,generationStats:JSON.parse(JSON.stringify(stats))}
}
function queenRecordRatingRejectionV223(stats,rate){
  if(rate?.profile?.status==='budget-exhausted'||rate?.profile?.budgetHit)stats.rejected.budgetExhausted++;
  else if(rate?.profile?.status==='invalid'||rate?.profile?.status==='contradictory')stats.rejected.invalid++;
  else stats.rejected.ratingMismatch++
}
function queenTransformCertifiedTemplateV223(base){
  let k=Math.floor(Math.random()*8),reg=transformGrid(base.reg,k),n=reg.length,mask=base.sol.map((c,r)=>Array.from({length:n},(_,j)=>j===c?1:0));
  mask=transformGrid(mask,k);let sol=Array(n).fill(-1);for(let r=0;r<n;r++)sol[r]=mask[r].indexOf(1);
  return {n,sol,reg}
}
function queenTemplateBoundaryMovesV223(reg,sol){
  let n=reg.length,protectedCells=new Set(sol.map((c,r)=>`${r}:${c}`)),moves=[],seen=new Set();
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    if(protectedCells.has(`${r}:${c}`))continue;
    let donor=reg[r][c];
    for(let [rr,cc] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]]){
      if(rr<0||rr>=n||cc<0||cc>=n)continue;let receiver=reg[rr][cc];if(receiver===donor)continue;
      let key=`${r},${c}>${receiver}`;if(seen.has(key))continue;
      if(!queenRegionConnectedAfterMove(reg,donor,r,c))continue;seen.add(key);moves.push([r,c,receiver])
    }
  }
  return moves
}
function queenMutatedTemplateCandidateV223(base){
  let candidate={n:base.n,sol:[...base.sol],reg:base.reg.map(r=>[...r])},moveCount=1+(Math.random()<0.22?1:0);
  for(let i=0;i<moveCount;i++){let moves=queenTemplateBoundaryMovesV223(candidate.reg,candidate.sol);if(!moves.length)return null;let [r,c,receiver]=moves[Math.floor(Math.random()*moves.length)];candidate.reg[r][c]=receiver}
  return candidate
}
function queenRandomStructuralCandidateV223(cfg){
  let sol=randomQueenSolution(cfg.n);if(!sol)return null;
  let reg=queenRegionsFromSolution(sol,cfg.single);if(!reg)return null;
  if(cfg.maxSingles<99){reg=reduceQueenSingletons(reg,sol,cfg.maxSingles);if(!reg)return null}
  if(cfg.maxTwos<99){reg=growQueenTwoCellRegions(reg,sol,cfg.maxTwos);if(!reg)return null}
  return {n:cfg.n,sol,reg}
}
function queenCertifiedStructureMatchesV223(reg,cfg){
  return reg.length===cfg.n&&(cfg.maxSingles>=99||queenSingletonRegions(reg)<=cfg.maxSingles)&&(cfg.maxTwos>=99||queenTwoCellRegions(reg)<=cfg.maxTwos)
}
function generateQueensPuzzleHistoricalV223(diff){
  const cfg=queenCertifiedGenerationConfigV223[diff];if(!cfg)throw new Error('Unknown Queens difficulty');
  let stats=queenGenerationStatsV223(diff,cfg),base=queenCertifiedTemplatesV223[diff];
  for(let t=0;t<cfg.attempts;t++){
    stats.attempts++;
    let candidate=cfg.strategy==='random'?queenRandomStructuralCandidateV223(cfg):queenMutatedTemplateCandidateV223(base);
    if(!candidate||!queenCertifiedStructureMatchesV223(candidate.reg,cfg)){stats.rejected.structure++;continue}
    if(countQueensGenerated(candidate.reg,2)!==1){stats.rejected.uniqueness++;continue}
    let rate=queenRateGeneratedV223(candidate.reg);
    if(!queenExactDifficultyMatchV223(rate,diff)){queenRecordRatingRejectionV223(stats,rate);continue}
    return queenCertifiedResultV223(candidate,rate,stats)
  }
  // Deterministic safety net: use the certified template itself, transformed only by a board symmetry.
  stats.fallbackUsed=true;stats.attempts++;
  let fallback=queenTransformCertifiedTemplateV223(base);
  if(!queenCertifiedStructureMatchesV223(fallback.reg,cfg))throw new Error(`Queens certified fallback structure mismatch (${diff})`);
  if(countQueensGenerated(fallback.reg,2)!==1)throw new Error(`Queens certified fallback uniqueness mismatch (${diff})`);
  let rate=queenRateGeneratedV223(fallback.reg);
  if(!queenExactDifficultyMatchV223(rate,diff))throw new Error(`Queens certified generation failed exact difficulty match (${diff})`);
  return queenCertifiedResultV223(fallback,rate,stats)
}

const QUEEN_QPOOL4_TIERS=Object.freeze(new Set(['medium','hard','expert']));
const QUEEN_HUMAN_BAND_INDEX_VERSION='HUMDIFF-INT3-nearest-v1';
const QUEEN_HUMAN_BAND_MODEL_SHA256='55d644c18b85db877532d273c4563235782407efebc048b17a39bef988da001a';
const QUEEN_HUMAN_BAND_CALIBRATION_SHA256='7bae112898af0bbf46236db4051d271cd44224452eead910d5289b5ba5a0d5e7';
const QUEEN_HUMAN_BAND_EXPECTED_COUNTS=Object.freeze({medium:192,hard:159,expert:104});
const QUEEN_HUMAN_BAND_OVERRIDES=Object.freeze({
  'medium:128':'hard','medium:136':'hard','medium:146':'hard','medium:155':'hard','medium:162':'hard','medium:168':'hard','medium:172':'hard','medium:191':'hard','medium:195':'hard','medium:197':'hard','medium:199':'hard',
  'hard:13':'medium','hard:15':'medium','hard:32':'expert','hard:33':'expert','hard:34':'expert','hard:36':'expert','hard:43':'expert','hard:50':'expert','hard:51':'expert','hard:53':'expert','hard:54':'expert','hard:55':'expert','hard:57':'expert','hard:77':'medium','hard:95':'expert','hard:97':'expert','hard:108':'expert',
  'expert:1':'hard','expert:5':'hard','expert:9':'hard','expert:10':'hard','expert:16':'hard','expert:17':'hard','expert:18':'hard','expert:20':'hard','expert:48':'hard','expert:70':'hard','expert:76':'hard'
});
const QUEEN_HUMAN_BAND_LOGICAL_TIER=Object.freeze({easy:0,medium:1,hard:2,expert:3});
let queenHumanBandIndexCache=null;
function queenHumanBandForRef(tier,index){return QUEEN_HUMAN_BAND_OVERRIDES[`${tier}:${index}`]||tier}
function queenHumanBandIndex(){
  if(queenHumanBandIndexCache)return queenHumanBandIndexCache;
  if(!queenQpool4Available())throw new Error('Queens qpool4 runtime data unavailable for human bands');
  const byBand={medium:[],hard:[],expert:[]};
  for(const tier of QUEEN_QPOOL4_TIERS)for(let index=0;index<QuadludQueensQpool4.size(tier);index++)byBand[queenHumanBandForRef(tier,index)].push(Object.freeze({tier,index}));
  for(const band of QUEEN_QPOOL4_TIERS){if(byBand[band].length!==QUEEN_HUMAN_BAND_EXPECTED_COUNTS[band])throw new Error(`Queens human-band count mismatch (${band})`);Object.freeze(byBand[band])}
  queenHumanBandIndexCache=Object.freeze(byBand);return queenHumanBandIndexCache
}
function queenHumanBandSize(band){const refs=queenHumanBandIndex()[band];if(!refs)throw new Error('Unknown Queens human difficulty band');return refs.length}
function queenHumanBandSnapshot(){
  const byBand=queenHumanBandIndex(),bands={};for(const band of QUEEN_QPOOL4_TIERS)bands[band]=byBand[band].map(ref=>({tier:ref.tier,index:ref.index,humanDifficultyBand:band}));
  return {schema:1,indexVersion:QUEEN_HUMAN_BAND_INDEX_VERSION,modelSha256:QUEEN_HUMAN_BAND_MODEL_SHA256,calibrationSha256:QUEEN_HUMAN_BAND_CALIBRATION_SHA256,counts:{...QUEEN_HUMAN_BAND_EXPECTED_COUNTS},overrides:{...QUEEN_HUMAN_BAND_OVERRIDES},bands}
}
function queenHumanBandRefAt(band,index){const refs=queenHumanBandIndex()[band],i=Number(index);if(!refs||!Number.isInteger(i)||i<0||i>=refs.length)throw new RangeError('Invalid Queens human difficulty band index');return refs[i]}
function queenHumanBandCandidateCertified(requestedBand,candidate){
  const profile=candidate?.difficultyProfile,stats=candidate?.generationStats;
  if(!QUEEN_QPOOL4_TIERS.has(requestedBand)||!profile||profile.status!=='solved'||profile.budgetHit||!stats)return false;
  if(stats.difficultyAxis!=='human'||stats.targetDifficulty!==requestedBand||stats.humanDifficultyBand!==requestedBand||stats.humanDifficultyIndexVersion!==QUEEN_HUMAN_BAND_INDEX_VERSION||stats.humanDifficultyCalibrationSha256!==QUEEN_HUMAN_BAND_CALIBRATION_SHA256||stats.humanDifficultyModelSha256!==QUEEN_HUMAN_BAND_MODEL_SHA256)return false;
  const sourceTier=stats.poolTier,poolIndex=Number(stats.poolIndex),humanBandIndex=Number(stats.humanBandIndex);
  if(!QUEEN_QPOOL4_TIERS.has(sourceTier)||!Number.isInteger(poolIndex)||!Number.isInteger(humanBandIndex))return false;
  let ref;try{ref=queenHumanBandRefAt(requestedBand,humanBandIndex)}catch(_){return false}
  if(ref.tier!==sourceTier||ref.index!==poolIndex||profile.difficulty!==sourceTier||stats.logicalDifficulty!==profile.difficulty||profile.minimumRequiredTier!==QUEEN_HUMAN_BAND_LOGICAL_TIER[profile.difficulty]||stats.logicalMinimumRequiredTier!==profile.minimumRequiredTier)return false;
  const expected=QuadludQueensQpool4.entryAt(sourceTier,poolIndex);
  return !!expected?.difficultyProfile&&expected.difficultyProfile.fingerprint===profile.fingerprint&&stats.fingerprint===profile.fingerprint
}
const QUEEN_PEDAGOGICAL_GENERATION_CONTEXTS=Object.freeze(new Set(['learning','training']));
function queenQpool4Available(){return !!QuadludQueensQpool4&&typeof QuadludQueensQpool4.size==='function'&&typeof QuadludQueensQpool4.entryAt==='function'}
function queenQpool4Result(requestedDifficulty,sourceTier,index,entry,strategy,extraStats={}){
  if(!entry||!Array.isArray(entry.reg)||!Array.isArray(entry.sol)||!entry.difficultyProfile)throw new Error(`Queens qpool4 entry unavailable: ${sourceTier}/${index}`);
  const profile=JSON.parse(JSON.stringify(entry.difficultyProfile));
  const stats={generatorVersion:typeof DifficultyRating!=='undefined'?DifficultyRating.GENERATOR_VERSION:1,targetDifficulty:requestedDifficulty,strategy,attempts:1,rejected:{structure:0,uniqueness:0,ratingMismatch:0,budgetExhausted:0,invalid:0},fallbackUsed:false,fingerprint:profile.fingerprint,minimumRequiredTier:profile.minimumRequiredTier,totalLogicalSteps:profile.totalLogicalSteps,poolVersion:QuadludQueensQpool4.POOL_VERSION,poolTier:sourceTier,poolEntryId:entry.id,poolIndex:index,...extraStats};
  return {n:entry.n,sol:[...entry.sol],reg:entry.reg.map(r=>[...r]),difficultyProfile:profile,generationStats:stats}
}
function queenQpool4Candidate(diff){
  if(!QUEEN_QPOOL4_TIERS.has(diff))throw new Error(`Queens qpool4 does not support difficulty: ${diff}`);
  if(!queenQpool4Available())throw new Error('Queens qpool4 runtime data unavailable');
  const size=QuadludQueensQpool4.size(diff);if(!Number.isInteger(size)||size<1)throw new Error(`Queens qpool4 is empty for difficulty: ${diff}`);
  const index=Math.floor(Math.random()*size),entry=QuadludQueensQpool4.entryAt(diff,index);
  return queenQpool4Result(diff,diff,index,entry,'qpool4')
}
function queenHumanBandCandidate(diff){
  if(!QUEEN_QPOOL4_TIERS.has(diff))throw new Error(`Queens human bands do not support difficulty: ${diff}`);
  const size=queenHumanBandSize(diff);if(!Number.isInteger(size)||size<1)throw new Error(`Queens human difficulty band is empty: ${diff}`);
  const humanBandIndex=Math.floor(Math.random()*size),ref=queenHumanBandRefAt(diff,humanBandIndex),entry=QuadludQueensQpool4.entryAt(ref.tier,ref.index);
  const profile=entry?.difficultyProfile;if(!profile)throw new Error(`Queens human difficulty entry unavailable: ${diff}/${humanBandIndex}`);
  return queenQpool4Result(diff,ref.tier,ref.index,entry,'qpool4-human-band',{
    difficultyAxis:'human',humanDifficultyBand:diff,humanDifficultyIndexVersion:QUEEN_HUMAN_BAND_INDEX_VERSION,
    humanDifficultyCalibrationSha256:QUEEN_HUMAN_BAND_CALIBRATION_SHA256,humanDifficultyModelSha256:QUEEN_HUMAN_BAND_MODEL_SHA256,
    humanBandIndex,logicalDifficulty:profile.difficulty,logicalMinimumRequiredTier:profile.minimumRequiredTier
  })
}
const QUEENS_CHALLENGE_GENERATOR_LEGACY=1,QUEENS_CHALLENGE_GENERATOR_QPOOL4=2;
function queenChallengeGeneratorVersion(diff){
  if(diff==='easy')return QUEENS_CHALLENGE_GENERATOR_LEGACY;
  if(QUEEN_QPOOL4_TIERS.has(diff))return QUEENS_CHALLENGE_GENERATOR_QPOOL4;
  return null
}
function generateQueensPuzzle(diff,options){
  const protocolGeneration=options?.protocolGeneration==null?null:Number(options.protocolGeneration);
  if(protocolGeneration===QUEENS_CHALLENGE_GENERATOR_LEGACY)return generateQueensPuzzleHistoricalV223(diff);
  if(protocolGeneration===QUEENS_CHALLENGE_GENERATOR_QPOOL4){
    if(!QUEEN_QPOOL4_TIERS.has(diff))throw new Error(`Queens protocol generation ${protocolGeneration} does not support difficulty: ${diff}`);
    return queenQpool4Candidate(diff)
  }
  if(protocolGeneration!=null)throw new Error(`Unsupported Queens protocol generation: ${protocolGeneration}`);
  if(diff==='easy')return generateQueensPuzzleHistoricalV223(diff);
  if(QUEEN_QPOOL4_TIERS.has(diff)){
    const context=String(options?.context||'').toLowerCase();
    if(QUEEN_PEDAGOGICAL_GENERATION_CONTEXTS.has(context))return queenQpool4Candidate(diff);
    return queenHumanBandCandidate(diff)
  }
  throw new Error('Unknown Queens difficulty')
}


function normalizeQueenRegionIds(reg){
  let ids=new Map(),next=0;
  return reg.map(row=>row.map(id=>{
    if(!ids.has(id))ids.set(id,next++);
    return ids.get(id)
  }))
}
function queenRegionSignature(reg){
  let g=normalizeQueenRegionIds(reg);
  return `${g.length}|${g.map(row=>row.join(',')).join(';')}`
}
function queenCanonicalSignature(reg){
  let signatures=[];
  for(let k=0;k<8;k++)signatures.push(queenRegionSignature(transformGrid(reg,k)));
  signatures.sort();
  return signatures[0]
}

function queenCandidate(diff,options){return generateQueensPuzzle(diff,options)}

function queenPublicPuzzleFromCandidate(candidate){return {game:'queens',n:candidate.n,reg:candidate.reg}}
function queenPublicPuzzleFromSession(session){return {game:'queens',n:session.n,reg:session.reg}}
function queenGenerationIdentity(candidate){return queenCanonicalSignature(candidate.reg)}

const QuadludQueensGenerator=Object.freeze({generateQueensPuzzle,generateQueensPuzzleHistoricalV223,queenQpool4Candidate,queenHumanBandCandidate,queenHumanBandCandidateCertified,queenHumanBandSize,queenHumanBandRefAt,queenHumanBandSnapshot,QUEEN_HUMAN_BAND_INDEX_VERSION,QUEEN_HUMAN_BAND_MODEL_SHA256,QUEEN_HUMAN_BAND_CALIBRATION_SHA256,QUEEN_HUMAN_BAND_EXPECTED_COUNTS,QUEEN_HUMAN_BAND_OVERRIDES,queenChallengeGeneratorVersion,challengeGeneratorVersion:queenChallengeGeneratorVersion,queenCandidate,countQueensGenerated,randomQueenSolution,queenRegionsFromSolution,queenRegionConnectedAfterMove,queenSingletonRegions,queenTwoCellRegions,normalizeQueenRegionIds,queenRegionSignature,queenCanonicalSignature,publicPuzzleFromCandidate:queenPublicPuzzleFromCandidate,publicPuzzleFromSession:queenPublicPuzzleFromSession,generationIdentity:queenGenerationIdentity});
if(typeof globalThis!=='undefined')globalThis.QuadludQueensGenerator=QuadludQueensGenerator;
if(typeof module!=='undefined'&&module.exports)module.exports=QuadludQueensGenerator;
