/*
 * QUADLUD — canonical move qualification and trust-boundary bridge
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludMoveTrust=api;
  if(typeof document!=='undefined')api.installBrowserBridge();
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSION=4,SCHEMA=1;
  const STATUS=Object.freeze({PROVED_LOGICAL:'PROVED_LOGICAL',LEGAL_UNPROVED:'LEGAL_UNPROVED',CONTRADICTORY:'CONTRADICTORY',INVALID:'INVALID'});
  const GUIDED_ACTION_TYPES=Object.freeze(['COACH_APPLY','LEARNING_GUIDED']);
  const CANONICAL_NODE_STATUSES=Object.freeze([STATUS.PROVED_LOGICAL,STATUS.LEGAL_UNPROVED,STATUS.CONTRADICTORY]);
  function guidedAction(action){return GUIDED_ACTION_TYPES.includes(String(action?.type||''))}
  function logicalStatus(justification){return justification?.logicalStatus??justification?.detail?.logicalStatus??null}
  function contradictionEvidence(justification){return justification?.contradiction??justification?.detail?.contradiction??null}
  function isCanonicalQualification(value){return !!value&&value.schema===SCHEMA&&CANONICAL_NODE_STATUSES.includes(value.status)&&value.source==='visible-state'&&['player','guided'].includes(value.origin)}
  function qualificationForNode(node,justification=node?.justification){
    if(!node||node.id==='h0'||node.action?.type==='START')return null;
    if(isCanonicalQualification(node.qualification))return {...node.qualification};
    if(node.error)return {schema:SCHEMA,status:STATUS.CONTRADICTORY,source:'visible-state',origin:'player'};
    if(guidedAction(node.action))return {schema:SCHEMA,status:STATUS.PROVED_LOGICAL,source:'visible-state',origin:'guided'};
    const j=justification||null,logical=String(logicalStatus(j)||'');
    if(j?.status==='justified'&&j?.source==='visible-state')return {schema:SCHEMA,status:STATUS.PROVED_LOGICAL,source:'visible-state',origin:'player'};
    if(logical==='incorrect'||logical==='contradictory'||!!contradictionEvidence(j))return {schema:SCHEMA,status:STATUS.CONTRADICTORY,source:'visible-state',origin:'player'};
    return {schema:SCHEMA,status:STATUS.LEGAL_UNPROVED,source:'visible-state',origin:'player'}
  }
  function classifyAttempt({changed,node}={}){if(changed===false)return STATUS.INVALID;return qualificationForNode(node)?.status||STATUS.LEGAL_UNPROVED}
  function invalidBoundary(cursorNodeId=null){return Object.freeze({schema:SCHEMA,valid:false,boundaryNodeId:null,cursorNodeId:cursorNodeId||null,undoCount:0,untrustedPlayerCount:0,unprovedPlayerCount:0,contradictoryPlayerCount:0,firstBreakNodeId:null,firstBreakReason:'invalid-history'})}
  function trustBoundary(history){
    const cursorNodeId=history?.cursor||null,nodes=history?.nodes;
    if(!cursorNodeId||!nodes||typeof nodes!=='object'||!nodes.h0||!nodes[cursorNodeId])return invalidBoundary(cursorNodeId);
    const reverse=[],seen=new Set();let node=nodes[cursorNodeId],guard=0;
    while(node&&guard++<10000){if(seen.has(node.id))return invalidBoundary(cursorNodeId);seen.add(node.id);reverse.push(node);if(node.id==='h0')break;node=node.parent?nodes[node.parent]:null}
    if(reverse.at(-1)?.id!=='h0')return invalidBoundary(cursorNodeId);
    const path=reverse.reverse();let boundaryIndex=0,broken=false,firstBreakNodeId=null,firstBreakReason=null,untrustedPlayerCount=0,unprovedPlayerCount=0,contradictoryPlayerCount=0;
    for(let i=1;i<path.length;i++){
      const item=path[i],q=qualificationForNode(item),safe=!!q&&q.status===STATUS.PROVED_LOGICAL;
      if(!broken&&safe){boundaryIndex=i;continue}
      if(!broken){broken=true;firstBreakNodeId=item.id;firstBreakReason=q?.status||STATUS.LEGAL_UNPROVED}
      if(q?.origin!=='guided'&&q?.status!==STATUS.PROVED_LOGICAL){
        untrustedPlayerCount++;
        if(q?.status===STATUS.CONTRADICTORY)contradictoryPlayerCount++;else unprovedPlayerCount++
      }
    }
    return Object.freeze({schema:SCHEMA,valid:true,boundaryNodeId:path[boundaryIndex].id,cursorNodeId,undoCount:path.length-1-boundaryIndex,untrustedPlayerCount,unprovedPlayerCount,contradictoryPlayerCount,firstBreakNodeId,firstBreakReason})
  }
  function neutralizedEvidenceKey(beforeKey,action){
    if(!beforeKey||!action||guidedAction(action)||typeof root?.auditPrimaryChange!=='function'||typeof root?.gamePedagogy!=='function')return beforeKey;
    let change,audit;try{change=root.auditPrimaryChange(action);audit=root.gamePedagogy()?.audit}catch(_){return beforeKey}
    if(!change||!audit||typeof audit.constructiveValue!=='function'||typeof audit.neutralValue!=='function'||!audit.constructiveValue(change.to))return beforeKey;
    const neutral=audit.neutralValue();if(change.from===neutral)return beforeKey;
    let snapshot;try{snapshot=JSON.parse(beforeKey)}catch(_){return beforeKey}
    const matrix=Array.isArray(snapshot?.state)?snapshot.state:Array.isArray(snapshot?.paint)?snapshot.paint:null,row=matrix?.[change.row];
    if(!Array.isArray(row)||change.column<0||change.column>=row.length||row[change.column]!==change.from)return beforeKey;
    row[change.column]=neutral;try{return JSON.stringify(snapshot)}catch(_){return beforeKey}
  }
  function attachQualification(node,justification=node?.justification){const q=qualificationForNode(node,justification);if(q)node.qualification={...q};return q}
  function currentBoundary(){try{return trustBoundary(typeof current==='undefined'?null:current?.moveHistory||null)}catch(_){return invalidBoundary(null)}}
  function translate(key){try{return typeof root?.tr==='function'?String(root.tr(key)):String(key)}catch(_){return String(key)}}
  function trustReturnMessage(boundary){
    const parts=[translate('reasoningAudit'),`${translate('undo')} × ${boundary?.undoCount||0}`];
    if(boundary?.unprovedPlayerCount)parts.push(`${translate('moveUnjustified')} × ${boundary.unprovedPlayerCount}`);
    if(boundary?.contradictoryPlayerCount)parts.push(`${translate('errorDetected')} × ${boundary.contradictoryPlayerCount}`);
    return parts.join(' · ')
  }
  function announce(message){
    if(!message)return;
    try{if(typeof root?.showToast==='function')root.showToast(message)}catch(_){}
    try{if(typeof root?.a11yAnnounce==='function')root.a11yAnnounce(message)}catch(_){}
  }
  function visibleErrorContext(session,boundary){
    if(!session||!boundary?.contradictoryPlayerCount||!session.lastError)return null;
    const error=session.lastError;if(error.source&&error.source!=='visible-state')return null;
    let title='',detail='';
    try{if(typeof root?.errorRuleTitle==='function')title=String(root.errorRuleTitle(error)||'')}catch(_){}
    try{if(typeof root?.errorDetailedMessage==='function')detail=String(root.errorDetailedMessage(error)||'')}catch(_){}
    return title||detail?Object.freeze({title,detail}):null
  }
  function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function decorateTrustReturnContext(returned){
    if(!returned?.message)return false;
    let target=null;try{target=root?.document?.querySelector?.('#hintNotice .hint-notice-text')||null}catch(_){}
    if(!target||target.querySelector?.('.trust-return-context'))return false;
    const reason=returned.errorContext?.title||returned.errorContext?.detail||'',html=`<span class="trust-return-context"><b>${escapeHtml(returned.message)}</b>${reason?`<br>${escapeHtml(reason)}`:''}</span><br>`;
    try{target.insertAdjacentHTML('afterbegin',html);return true}catch(_){return false}
  }
  function restoreCurrentTrustBoundary(surface='coach'){
    let session=null;try{session=typeof current==='undefined'?null:current}catch(_){}
    const before=currentBoundary(),errorContext=visibleErrorContext(session,before),base={schema:SCHEMA,surface:String(surface||'coach'),before,errorContext};
    if(!session||session.training)return Object.freeze({...base,ok:true,skipped:true,moved:0,after:before,message:null});
    if(!before.valid)return Object.freeze({...base,ok:false,skipped:false,moved:0,after:before,message:null,reason:'invalid-history'});
    if(before.undoCount<=0)return Object.freeze({...base,ok:true,skipped:false,moved:0,after:before,message:null});
    let moved=0;try{if(typeof root?.undoMoves==='function')moved=Number(root.undoMoves(before.undoCount))||0}catch(_){}
    const after=currentBoundary(),ok=moved===before.undoCount&&after.valid&&after.undoCount===0&&after.cursorNodeId===before.boundaryNodeId;
    if(!ok)return Object.freeze({...base,ok:false,skipped:false,moved,after,message:null,reason:'trust-return-incomplete'});
    const message=trustReturnMessage(before);announce(message);
    return Object.freeze({...base,ok:true,skipped:false,moved,after,message})
  }
  function notifyTrustFailure(){const message=translate('hintError');announce(message);return message}
  function installBrowserBridge(){
    if(!root)return false;let installed=false;
    if(typeof root.auditConstructiveChange==='function'&&root.auditConstructiveChange.__quadludE1MoveTrust!==true){
      const previous=root.auditConstructiveChange;
      const wrapped=function(action){
        try{const change=typeof root.auditPrimaryChange==='function'?root.auditPrimaryChange(action):null,audit=root.gamePedagogy?.()?.audit;if(change&&audit?.constructiveValue?.(change.to))return change}catch(_){}
        return previous(action)
      };
      wrapped.__quadludE1MoveTrust=true;root.auditConstructiveChange=wrapped;installed=true
    }
    if(typeof root.evaluateMoveJustification==='function'&&root.evaluateMoveJustification.__quadludE1MoveTrust!==true){
      const previous=root.evaluateMoveJustification;
      const wrapped=function(beforeKey,action,error=null){return previous(error?beforeKey:neutralizedEvidenceKey(beforeKey,action),action,error)};
      wrapped.__quadludE1MoveTrust=true;root.evaluateMoveJustification=wrapped;installed=true
    }
    if(typeof root.applyAuditResult==='function'&&root.applyAuditResult.__quadludE1MoveTrust!==true){
      const previous=root.applyAuditResult;
      const wrapped=function(node,result){const returned=previous(node,result);attachQualification(node,node?.justification??result);return returned};
      wrapped.__quadludE1MoveTrust=true;root.applyAuditResult=wrapped;installed=true
    }
    if(typeof root.currentTrustBoundary!=='function'||root.currentTrustBoundary.__quadludE1MoveTrust!==true){currentBoundary.__quadludE1MoveTrust=true;root.currentTrustBoundary=currentBoundary;installed=true}
    if(typeof root.installGeneratedSession==='function'&&root.installGeneratedSession.__quadludE2MoveTrust!==true){
      const previous=root.installGeneratedSession;
      const wrapped=function(...args){
        const session=previous.apply(this,args);
        try{if(session&&typeof current!=='undefined'&&current===session&&!session.moveHistory&&typeof root.historyInit==='function')root.historyInit(false)}catch(_){}
        return session
      };
      wrapped.__quadludE2MoveTrust=true;root.installGeneratedSession=wrapped;installed=true
    }
    if(typeof root.launch==='function'&&root.launch.__quadludE2MoveTrust!==true){
      const previous=root.launch;
      const wrapped=function(...args){try{root.closeHintNotice?.()}catch(_){}return previous.apply(this,args)};
      wrapped.__quadludE2MoveTrust=true;root.launch=wrapped;installed=true
    }
    if(typeof root.pedagogicalHintForGame==='function'&&root.pedagogicalHintForGame.__quadludE2MoveTrust!==true){
      const previous=root.pedagogicalHintForGame;
      const wrapped=function(...args){
        const returned=restoreCurrentTrustBoundary('coach');if(!returned.ok){notifyTrustFailure();return false}
        const result=previous.apply(this,args);
        if(result&&typeof result.then==='function')return result.then(value=>{decorateTrustReturnContext(returned);return value});
        decorateTrustReturnContext(returned);return result
      };
      wrapped.__quadludE2MoveTrust=true;root.pedagogicalHintForGame=wrapped;installed=true
    }
    if(typeof root.openWalkthrough==='function'&&root.openWalkthrough.__quadludE2MoveTrust!==true){
      const previous=root.openWalkthrough;
      const wrapped=function(...args){const returned=restoreCurrentTrustBoundary('tutor');if(!returned.ok){notifyTrustFailure();return false}return previous.apply(this,args)};
      wrapped.__quadludE2MoveTrust=true;root.openWalkthrough=wrapped;installed=true
    }
    return installed||root.applyAuditResult?.__quadludE1MoveTrust===true
  }
  return Object.freeze({VERSION,SCHEMA,STATUS,GUIDED_ACTION_TYPES,isCanonicalQualification,qualificationForNode,classifyAttempt,trustBoundary,currentBoundary,trustReturnMessage,restoreCurrentTrustBoundary,installBrowserBridge})
});
