/*
 * QUADLUD — Tutor action-first logical move navigation
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludTutorActionFirstNavigation=api;
  if(typeof document!=='undefined')api.install();
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  let installed=false,proofNavigationActive=false;
  let previousBoardHtml=null,previousRender=null,previousProofNavigate=null;

  function session(){try{return typeof walkthroughSession!=='undefined'?walkthroughSession:null}catch(_){return null}}
  function groups(){try{return typeof walkthroughGroups==='function'?walkthroughGroups(session()):[]}catch(_){return []}}
  function currentGroup(){try{return typeof walkthroughCurrentGroup==='function'?walkthroughCurrentGroup():null}catch(_){return null}}
  function isActionMove(move){
    if(!move)return false;
    if(move.proofStage?.kind==='action'||move.proofStage?.apply===true)return true;
    if(move.presentation?.metadata?.showTutorMove===true)return true;
    return false
  }
  function actionEntry(group){
    const entries=Array.isArray(group?.entries)?group.entries:[];
    for(let i=entries.length-1;i>=0;i--)if(isActionMove(entries[i]?.move))return entries[i];
    return entries.length?entries[entries.length-1]:null
  }
  function groupIndex(group,list=groups()){return !group?-1:list.findIndex(x=>x===group||x.logicalMoveIndex===group.logicalMoveIndex)}
  function previousActionSnapshot(group){
    const list=groups(),i=groupIndex(group,list);if(i<=0)return session()?.initial||null;
    return actionEntry(list[i-1])?.move?.snapshot||session()?.initial||null
  }
  function projectedAction(group){
    const entry=actionEntry(group),move=entry?.move;
    return move?{entry,move,snapshot:move.snapshot||null,target:move.target??null}:null
  }

  function keyCoord(r,c){return `${Number(r)},${Number(c)}`}
  function collectCoords(value,out,depth=0){
    if(value==null||depth>6)return;
    if(Array.isArray(value)){
      if(value.length>=2&&Number.isInteger(Number(value[0]))&&Number.isInteger(Number(value[1]))&&Number(value[0])>=0&&Number(value[1])>=0){out.add(keyCoord(value[0],value[1]));return}
      for(const item of value)collectCoords(item,out,depth+1);return
    }
    if(typeof value!=='object')return;
    if(Number.isInteger(Number(value.row))&&Number.isInteger(Number(value.column)))out.add(keyCoord(value.row,value.column));
    if(Number.isInteger(Number(value.r))&&Number.isInteger(Number(value.c)))out.add(keyCoord(value.r,value.c));
    if(Array.isArray(value.cell))collectCoords(value.cell,out,depth+1);
    for(const key of ['target','targets','cells','changes','conclusions','action','actions','focusCells'])if(value[key]!=null)collectCoords(value[key],out,depth+1)
  }
  function actionCoords(entry){
    const out=new Set(),move=entry?.move||{};
    collectCoords(move.target,out);
    collectCoords(move.deduction?.conclusions,out);
    collectCoords(move.presentation?.action?.target,out);
    collectCoords(move.presentation?.action,out);
    return [...out].map(key=>key.split(',').map(Number))
  }
  function findActionElements(entry){
    const doc=root?.document,board=doc?.querySelector?.('.walkthrough-board');if(!board)return [];
    const coords=actionCoords(entry),elements=[];
    for(const [r,c] of coords){
      const selector=`[data-r="${r}"][data-c="${c}"]`,el=board.querySelector(selector);if(el&&!elements.includes(el))elements.push(el)
    }
    if(!elements.length)for(const el of board.querySelectorAll('.walkthrough-target'))if(!elements.includes(el))elements.push(el);
    return elements
  }
  function decorateCurrentAction(){
    const group=currentGroup(),doc=root?.document;if(!group||!doc)return false;
    const chain=(group.entries?.length||0)>1,entry=actionEntry(group),board=doc.querySelector('.walkthrough-board');if(!board||!entry)return false;
    board.classList.toggle('walkthrough-proof-chain-active',chain);
    board.dataset.proofSteps=String(group.entries?.length||1);
    for(const el of findActionElements(entry)){
      el.classList.add('walkthrough-current-action');
      if(chain){
        el.classList.add('walkthrough-current-action-chain');
        if(!el.querySelector(':scope > .walkthrough-chain-badge')){
          const badge=doc.createElement('span');badge.className='walkthrough-chain-badge';badge.setAttribute('aria-hidden','true');badge.textContent='⋯';el.appendChild(badge)
        }
      }
    }
    return true
  }

  function installBoardProjection(){
    if(typeof walkthroughBoardHtml!=='function'||walkthroughBoardHtml.__quadludActionFirst)return false;
    previousBoardHtml=walkthroughBoardHtml;
    const wrapped=function(snapshot,target,deduction,options={}){
      const s=session(),group=currentGroup(),projection=projectedAction(group);
      if(!s||s.atStart||!projection?.snapshot)return previousBoardHtml(snapshot,target,deduction,options);
      const nextOptions={...options,previousSnapshot:previousActionSnapshot(group)};
      if(proofNavigationActive)nextOptions.animatePlacement=false;
      return previousBoardHtml(projection.snapshot,projection.target??target,deduction,nextOptions)
    };
    wrapped.__quadludActionFirst=true;walkthroughBoardHtml=wrapped;return true
  }
  function installRenderProjection(){
    if(typeof renderWalkthrough!=='function'||renderWalkthrough.__quadludActionFirst)return false;
    previousRender=renderWalkthrough;
    const wrapped=function(options={}){
      const next=proofNavigationActive?{...options,animatePlacement:false}:options,result=previousRender(next);
      decorateCurrentAction();return result
    };
    wrapped.__quadludActionFirst=true;renderWalkthrough=wrapped;return true
  }
  function installProofNavigationProjection(){
    if(typeof walkthroughNavigateProof!=='function'||walkthroughNavigateProof.__quadludActionFirst)return false;
    previousProofNavigate=walkthroughNavigateProof;
    const wrapped=function(delta){proofNavigationActive=true;try{return previousProofNavigate(delta)}finally{proofNavigationActive=false}};
    wrapped.__quadludActionFirst=true;walkthroughNavigateProof=wrapped;return true
  }
  function install(){
    if(installed)return true;
    const ok=installBoardProjection()&&installRenderProjection()&&installProofNavigationProjection();
    installed=ok;if(ok)decorateCurrentAction();return ok
  }

  return Object.freeze({install,actionEntry,actionCoords,decorateCurrentAction,_test:Object.freeze({isActionMove,collectCoords,projectedAction})})
});
