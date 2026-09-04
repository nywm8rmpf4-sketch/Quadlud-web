/*
 * QUADLUD — Soleil/Lune played-move planner
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludTangoPlayedMovePlanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

const TL=(typeof module!=='undefined'&&module.exports)?require('./tango-logic.js'):root.TangoLogic;
const TD=(typeof module!=='undefined'&&module.exports)?require('./tango-difficulty.js'):root.TangoDifficulty;
if(!TL||!TD||typeof TD.nextAllowedDeduction!=='function')throw new Error('Soleil/Lune played-move planner dependencies unavailable');

const VALUE_EMPTY=TL.constants.VALUE_EMPTY;
const DIFF_TO_TIER=Object.freeze({easy:0,medium:1,hard:2,expert:3,facile:0,moyen:1,difficile:2});

function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function tierIndexForDifficulty(diff){
  if(Number.isInteger(diff)&&diff>=0&&diff<=3)return diff;
  const key=String(diff||'').trim().toLowerCase();
  if(!Object.prototype.hasOwnProperty.call(DIFF_TO_TIER,key))throw new Error(`Unknown Soleil/Lune difficulty: ${diff}`);
  return DIFF_TO_TIER[key];
}
function stateDiff(before,after){
  const out=[];
  if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)return out;
  for(let r=0;r<before.length;r++){
    if(!Array.isArray(before[r])||!Array.isArray(after[r])||before[r].length!==after[r].length)continue;
    for(let c=0;c<before[r].length;c++)if(before[r][c]!==after[r][c])out.push({cell:[r,c],from:before[r][c],to:after[r][c]});
  }
  return out;
}
function isVisiblePlacement(change){return change&&change.from===VALUE_EMPTY&&(change.to===0||change.to===1)}
function traceEntries(applied){return [applied?.deduction,...(applied?.automatic||[])].filter(Boolean)}
function dependencyIds(deduction){
  return [...new Set([...(deduction?.dependencies||[]),...(deduction?.premises||[]).flatMap(p=>p?.dependencies||[])].filter(Boolean))];
}
function causalProofForTarget(trace,target,value){
  const byId=new Map((trace||[]).filter(d=>d?.id).map(d=>[d.id,d]));
  const sources=(trace||[]).filter(d=>(d?.conclusions||[]).some(c=>c?.type==='VALUE'&&Array.isArray(c.cell)&&c.cell[0]===target[0]&&c.cell[1]===target[1]&&c.value===value));
  if(!sources.length)return {source:null,proofChain:copy(trace||[])};
  const source=sources[0],needed=new Set(source.id?[source.id]:[]),stack=[...needed];
  while(stack.length){
    const current=byId.get(stack.pop());if(!current)continue;
    for(const id of dependencyIds(current))if(byId.has(id)&&!needed.has(id)){needed.add(id);stack.push(id)}
  }
  const chain=(trace||[]).filter(d=>!d?.id||needed.has(d.id));
  return {source:copy(source),proofChain:copy(chain.length?chain:[source])};
}
function firstPlacementFromApplied(before,after,trace,proofPrefix=[]){
  const changes=stateDiff(before,after).filter(isVisiblePlacement);
  if(!changes.length)return null;
  const target=changes[0],fullTrace=[...(proofPrefix||[]),...(trace||[])],causal=causalProofForTarget(fullTrace,target.cell,target.to);
  return {
    target:target.cell.slice(),
    value:target.to,
    deduction:causal.source||copy(trace?.[trace.length-1]||null),
    proofChain:causal.proofChain,
    engineVisiblePlacementCount:changes.length,
    engineVisiblePlacements:copy(changes)
  };
}
function nextPlayedMove(session,diff,{maxEngineSteps}={}){
  if(!session||typeof session.clone!=='function')throw new TypeError('Soleil/Lune planner requires a clonable logic session');
  const fork=session.clone(),tierIndex=tierIndexForDifficulty(diff),limit=Number.isInteger(maxEngineSteps)&&maxEngineSteps>0?maxEngineSteps:Math.max(24,fork.n*fork.n*2),proof=[];
  for(let step=0;step<limit;step++){
    const contradiction=fork.diagnose();
    if(contradiction)return {status:'contradictory',contradiction:copy(contradiction),tierIndex,proofChain:copy(proof)};
    if(!fork.state.some(row=>row.includes(VALUE_EMPTY)))return {status:'solved',tierIndex,proofChain:copy(proof)};
    const next=TD.nextAllowedDeduction(fork,tierIndex,false),deduction=next?.deduction||null;
    if(!deduction)return {status:next?.budgetHit?'budget-exhausted':'blocked',budgetHit:!!next?.budgetHit,tierIndex,proofChain:copy(proof)};
    const before=copy(fork.state),applied=fork.applyDeduction(deduction);
    if(!applied?.deduction)return {status:'invalid',tierIndex,error:'Soleil/Lune deduction could not be applied',proofChain:copy(proof)};
    const trace=traceEntries(applied),placement=firstPlacementFromApplied(before,fork.state,trace,proof);
    proof.push(...copy(trace));
    if(placement)return {status:'move',tierIndex,...placement};
  }
  return {status:'budget-exhausted',budgetHit:true,tierIndex,proofChain:copy(proof)};
}
function publicBoard(puzzle,stateOverride=null){
  const canonical=TD.canonicalizePublicPuzzle(puzzle),state=stateOverride?copy(stateOverride):copy(canonical.state);
  return {n:canonical.n,state,edges:copy(canonical.edges)};
}
function sessionFromPublicBoard(puzzle,stateOverride=null,options={}){
  return TL.createSession(publicBoard(puzzle,stateOverride),{maxHypothesisSteps:options.maxHypothesisSteps??18,maxCommonSteps:options.maxCommonSteps??10});
}
function applyPlayedMoveToState(state,plan){
  if(!Array.isArray(state)||!plan||plan.status!=='move'||!Array.isArray(plan.target))return false;
  const [r,c]=plan.target,value=plan.value;
  if(state?.[r]?.[c]!==VALUE_EMPTY)return state?.[r]?.[c]===value;
  state[r][c]=value;return true;
}
function solveByPlayedMoves(puzzle,diff,options={}){
  const canonical=TD.canonicalizePublicPuzzle(puzzle),state=copy(canonical.state),limit=Number.isInteger(options.maxMoves)&&options.maxMoves>0?options.maxMoves:Math.max(24,canonical.n*canonical.n*2),moves=[];
  for(let i=0;i<limit;i++){
    const session=sessionFromPublicBoard(canonical,state,options),bad=session.diagnose();
    if(bad)return {status:'contradictory',moves,contradiction:copy(bad),state:copy(state)};
    if(!state.some(row=>row.includes(VALUE_EMPTY)))return {status:'solved',moves,state:copy(state)};
    const plan=nextPlayedMove(session,diff,options);
    if(plan.status!=='move')return {...plan,moves,state:copy(state)};
    if(!applyPlayedMoveToState(state,plan))return {status:'invalid',moves,state:copy(state),error:'Soleil/Lune planned move could not be applied'};
    moves.push(copy(plan));
  }
  return {status:'budget-exhausted',budgetHit:true,moves,state:copy(state)};
}

return Object.freeze({
  VERSION:2,
  tierIndexForDifficulty,
  stateDiff,
  publicBoard,
  sessionFromPublicBoard,
  nextPlayedMove,
  applyPlayedMoveToState,
  solveByPlayedMoves,
  _test:Object.freeze({firstPlacementFromApplied,traceEntries,dependencyIds,causalProofForTarget})
});
});
