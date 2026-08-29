/*
 * QUADLUD — Patches specialized Web runtime
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 * REF-2: game-specific Web/pedagogy helpers extracted from app.js without behavioral change.
 */
'use strict';

function patchVisibleIssueForId(id){
  let n=current.n,cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.paint[r][c]===id)cells.push([r,c]);if(!cells.length)return null;
  let cl=current.clues[id],own=cl.pos,foreign=[];for(const other of current.ids){let p=current.clues[other].pos;if(other!==id&&cells.some(([r,c])=>r===p[0]&&c===p[1]))foreign.push(p)}
  if(foreign.length)return {rule:'P_TWO_CLUES',cells:[...cells,own,...foreign],target:foreign[0],region:id};
  let rs=cells.map(x=>x[0]),cs=cells.map(x=>x[1]),h=Math.max(...rs)-Math.min(...rs)+1,w=Math.max(...cs)-Math.min(...cs)+1,selected=current.patchSelectedRects?.[id];
  if((cl.mode==='size'||cl.mode==='both')&&(cells.length>cl.size||h*w>cl.size||(selected&&h*w!==cl.size)))return {rule:'P_SIZE',cells:[...cells,own],target:cells[cells.length-1],region:id};
  if(selected&&(cl.mode==='shape'||cl.mode==='both')){let sh=h===w?'carré':h>w?'vertical':'horizontal';if(sh!==cl.shape)return {rule:'P_SHAPE',cells:[...cells,own],target:cells[cells.length-1],region:id}}
  return null
}

function patchLogicVisibleContradiction(){if(!patchesLogicAvailable())return null;let w;try{w=patchesLogicSession().diagnoseBasic()}catch(_){return null}if(!w)return null;if(w.kind==='NO_COVER_FOR_CELL')return {rule:'P_NO_COVER',cells:[w.cell],target:w.cell,logicContradiction:w};if(w.kind==='NO_CANDIDATE_FOR_CLUE'||w.kind==='SHAPE_IMPOSSIBLE')return {rule:'P_NO_CANDIDATE',cells:[current.clues[w.clue].pos],target:current.clues[w.clue].pos,region:w.clue,logicContradiction:w};if(w.kind==='AREA_OVERFLOW')return {rule:'P_SIZE',cells:w.cells||[current.clues[w.clue].pos],target:current.clues[w.clue].pos,region:w.clue,logicContradiction:w};if(w.kind==='OWNER_CONFLICT')return {rule:'P_OWNER_CONFLICT',cells:w.cell?[w.cell]:[],target:w.cell||null,logicContradiction:w};if(w.kind==='SELECTED_OVERLAP')return {rule:'P_OVERLAP',cells:(w.rectangles||[]).flatMap(x=>PatchesLogic.helpers.rectCells(x)),target:null,logicContradiction:w};if(w.kind==='COVERAGE_DEFICIT'||w.kind==='NO_LOCAL_COMPLETION')return {rule:'P_LOGIC_CONTRADICTION',cells:w.cells||[],target:w.cell||null,logicContradiction:w};return null}

function patchIllegalCells(){
  let bad=new Set();for(const id of current.ids){let e=patchVisibleIssueForId(id);for(const [r,c] of e?.cells||[])bad.add(keyCell(r,c))}return bad
}

function patchErrorFromAction(action){
  let ids=new Set();if(action?.region!=null)ids.add(Number(action.region));for(const ch of changedTargets(action))if(ch.to!=null)ids.add(Number(ch.to));
  for(const id of ids){if(!current.ids.includes(id))continue;let e=patchVisibleIssueForId(id);if(e)return e}
  let logic=patchLogicVisibleContradiction();return logic||null
}

function patchVisibleErrors(){
  let out=[];for(const id of current.ids){let e=patchVisibleIssueForId(id);if(e)out.push(normalizeVisibleError(e))}
  if(!out.length){let e=patchLogicVisibleContradiction();if(e)out.push(normalizeVisibleError(e))}
  return out
}

function captureRejectedPatchError(info){
  if(!current||current.game!=='patches'||!info)return null;
  let rule=info.reason==='MULTIPLE_CLUES'?'P_TWO_CLUES':info.reason==='OVERLAP'?'P_OVERLAP':'P_CLUE';
  let e={schema:1,source:'visible-state',game:'patches',rule,at:WebPlatform.clock.nowMs(),canReturn:false,cells:info.rect?.cells||[],target:info.rect?.cells?.[0]||null,region:info.id};
  current.lastError=e;errorUsage('rejected');clearErrorFocus();refreshErrorCoach();return e
}

function trainingSetPatchBase(g,diff){const pal=['#f3c6a8','#b9d9c1','#c6d4ed','#e2c3df','#f0dc9d','#c7e0e3','#d5ceb8','#d4e3b4','#edbfc1','#c8c4e8','#e5d0a4','#b7d7d1'];current={game:'patches',diff,n:g.n,reg:g.reg,ids:g.ids,cellsBy:g.cellsBy,clues:g.clues,difficultyProfile:g.difficultyProfile,generationStats:g.generationStats,pal,active:g.ids[0],paint:Array.from({length:g.n},()=>Array(g.n).fill(null)),patchSelectedRects:{},patchLogicEvidence:patchEmptyEvidence(),generated:true,unique:true,completed:false,training:true}}

function trainingBuildPatchDirect(id,deadline){
  for(let a=0;a<8&&WebPlatform.clock.nowMs()<deadline;a++){
    let g=patchesCandidate(id==='P_SINGLE_RECTANGLE'?'easy':'medium');trainingSetPatchBase(g,id==='P_SINGLE_RECTANGLE'?'easy':'medium');
    for(let k=0;k<100&&WebPlatform.clock.nowMs()<deadline;k++){
      current.paint=Array.from({length:g.n},()=>Array(g.n).fill(null));let p=id==='P_MANDATORY_CELL'?Math.random()*.42:Math.random()*.18;for(let r=0;r<g.n;r++)for(let c=0;c<g.n;c++)if(Math.random()<p)current.paint[r][c]=g.reg[r][c];let h=trainingHintForId(id,deadline);if(h)return h
    }
  }
  return null
}

function patchesReasoningPresenter(){return reasoningPresenter(globalThis.QuadludPatchesReasoningPresenter.GAME)}

function patchesLogicAvailable(){return typeof globalThis!=='undefined'&&globalThis.PatchesLogic&&typeof globalThis.PatchesLogic.createSession==='function'}

function patchEmptyEvidence(){return {schema:1,owners:[],notOwners:[],selected:[],eliminated:[]}}

function patchesLogicSession(c=current,paint=null,selectedRects=null,logicEvidence=null){if(!patchesLogicAvailable()||!c||c.game!=='patches')throw new Error('Rectangles logic engine unavailable');return PatchesLogic.createSession({n:c.n,ids:[...(c.ids||[])],clues:JSON.parse(JSON.stringify(c.clues||{})),paint:cloneGrid(paint||c.paint),selectedRects:JSON.parse(JSON.stringify(selectedRects||c.patchSelectedRects||{})),logicEvidence:JSON.parse(JSON.stringify(logicEvidence||c.patchLogicEvidence||patchEmptyEvidence()))})}

function patchFormat(k,vars={}){return String(tr(k)).replace(/\{(\w+)\}/g,(_,x)=>vars[x]??'')}

function patchZoneName(id){return `${tr('zone')} ${Number(id)+1}`}

function patchZonesName(ids){return (ids||[]).map(patchZoneName).join(lang()==='fr'?' et ':' and ')}

function patchVisibleActionForDeduction(d,c=current){if(!d||!c)return null;let owner=(d.conclusions||[]).find(x=>x.type==='OWNER'&&c.paint?.[x.cell?.[0]]?.[x.cell?.[1]]!==x.clue);if(owner)return {r:owner.cell[0],c:owner.cell[1],id:owner.clue};let selected=(d.conclusions||[]).find(x=>x.type==='SELECTED_RECT');if(!selected)return null;let id=selected.clue,cells=selected.rectangle?.cells||PatchesLogic.helpers.rectCells(selected.rectangle||{}),cell=cells.find(x=>c.paint?.[x[0]]?.[x[1]]!==id)||cells[0];return cell?{r:cell[0],c:cell[1],id}:null}

function patchVisibleHintFromEngine(expectedTechnique=null){if(!current||current.game!=='patches'||!patchesLogicAvailable())return null;let engine,result;try{engine=patchesLogicSession();result=engine.nextDeduction()}catch(_){return null}let d=result?.deduction;if(!d)return null;let presenter=patchesReasoningPresenter(),technique=presenter.techniqueForDeduction(d);if(!technique||(expectedTechnique&&technique!==expectedTechnique))return null;let target=patchVisibleActionForDeduction(d,current);if(!target)return null;return {...target,rank:d.rank,technique,why:presenter.explanation(d),structuredDeduction:JSON.parse(JSON.stringify(d)),reasoning:presenter.legacyReasoning(d)}}

function patchTrainingHintFromEngine(expectedTechnique=null){
  let direct=patchVisibleHintFromEngine(expectedTechnique);if(direct)return direct;
  if(expectedTechnique!=='P_CONTRADICTION_R1'||!current||!patchesLogicAvailable())return null;
  let engine;try{engine=patchesLogicSession(current,current.paint,current.patchSelectedRects,patchEmptyEvidence())}catch(_){return null}
  let presenter=patchesReasoningPresenter(),proofChain=[],first=null,actionDeduction=null,target=null;
  for(let guard=0;guard<12&&!target;guard++){
    let result;try{result=engine.nextDeduction()}catch(_){return null}let d=result?.deduction;if(!d)return null;let technique=presenter.techniqueForDeduction(d);
    if(!first){if(technique!==expectedTechnique)return null;first=JSON.parse(JSON.stringify(d))}
    let snapshot=JSON.parse(JSON.stringify(d));proofChain.push(snapshot);target=patchVisibleActionForDeduction(d,current);if(target){actionDeduction=snapshot;break}
    if(technique!==expectedTechnique)return null;
    let applied;try{applied=engine.applyDeduction(d)}catch(_){return null}if(!applied?.deduction||applied.contradiction)return null;
    for(const automatic of applied.automatic||[]){let a=JSON.parse(JSON.stringify(automatic));proofChain.push(a);let action=patchVisibleActionForDeduction(automatic,current);if(action){target=action;actionDeduction=a;break}}
  }
  if(!first||!target||!actionDeduction)return null;
  let why=proofChain.map(d=>presenter.explanation(d)).filter(Boolean).map(x=>`<span class="reason-step">${x}</span>`).join('');
  return {r:target.r,c:target.c,id:target.id,rank:first.rank,technique:expectedTechnique,why,structuredDeduction:first,finalStructuredDeduction:actionDeduction,proofChain,reasoning:presenter.legacyReasoning(first)}
}

function patchRectHuman(r){if(!r)return '';let h=r.r1-r.r0+1,w=r.c1-r.c0+1;return `${h}×${w} · ${cellName(r.r0,r.c0)}–${cellName(r.r1,r.c1)}`}

function patchFocusDeduction(d,reveal=false){clearHintFocus();let board=$('#pboard')||document.querySelector('.board');if(!board||!current||!d)return;let focus=[...(d.focusCells||[])],targets=[];for(const c of d.conclusions||[]){if(c.type==='OWNER')targets.push(c.cell);else if(c.type==='SELECTED_RECT')targets.push(...(c.rectangle.cells||[]));else if(c.type==='ELIMINATED_CANDIDATE'){let rr=(d.focusRectangles||[]).find(x=>(x.key||PatchesLogic.helpers.rectKey(x))===c.rectangleKey);if(rr)targets.push(...(rr.cells||PatchesLogic.helpers.rectCells(rr)))}}let targetKeys=new Set(targets.map(x=>x.join(','))),seen=new Set();for(const cell of focus.concat(reveal?targets:[])){let k=cell.join(',');if(seen.has(k))continue;seen.add(k);let el=board.children[cell[0]*current.n+cell[1]];if(el)el.classList.add(reveal&&targetKeys.has(k)?'hint-focus':'hint-context')}}

function patchSyncEngineToVisible(c,engine){c.patchLogicEvidence=engine.exportEvidence();c.patchSelectedRects=c.patchSelectedRects||{};for(const f of c.patchLogicEvidence.owners||[])c.paint[f.cell[0]][f.cell[1]]=f.clue;for(const f of c.patchLogicEvidence.selected||[]){let cand=engine.candidate(Number(f.clue),f.rectangleKey);if(!cand)continue;c.patchSelectedRects[f.clue]={r0:cand.r0,r1:cand.r1,c0:cand.c0,c1:cand.c1};for(const [r,col] of cand.cells)c.paint[r][col]=Number(f.clue)}}

function patchSyncEngineEvidence(c,engine){c.patchLogicEvidence=engine.exportEvidence()}

function patchApplyDeductionToState(c,d,engine=null){engine=engine||patchesLogicSession(c);let applied=engine.applyDeduction(d);if(!applied?.deduction)return null;patchSyncEngineToVisible(c,engine);return {...applied,engine}}

function patchApplyDeductionToCurrent(d){if(!current||current.game!=='patches')return null;return patchApplyDeductionToState(current,d)}

function patchCurrentLogicResult(){let engine=patchesLogicSession(),result=engine.nextDeduction();return {...result,engine}}

function patchCoachHandleDeduction(d){
  let presenter=patchesReasoningPresenter(),boardKey=historySnapshotKey(),sig=d.signature||d.id,flow=current.hintFlow,isSame=flow?.kind==='patches-proof'&&flow.boardKey===boardKey&&flow.signature===sig,view=presenter.presentation(d);
  if(!isSame){current.hintFlow={kind:'patches-proof',boardKey,signature:sig,stage:1,deduction:JSON.parse(JSON.stringify(d))};coachUsage(1,view.technique);patchFocusDeduction(d,false);showHintNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${view.explanation.where}`);saveCurrent();return}
  let proof=flow.deduction||d,before=historySnapshotKey();coachUsage(2,view.technique);coachUsage(3,view.technique);markHintUsed();updateScoreFlags();patchFocusDeduction(proof,true);let application=patchApplyDeductionToCurrent(proof);if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}drawGameUi();let appliedView=presenter.presentation(application.deduction,application.automatic);historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:4},before);current.hintFlow=null;showHintNotice(`<span class="coach-progress">2/2</span><b>${appliedView.explanation.title}</b><br>${appliedView.explanation.why}`);maybeAutoFinish();saveCurrent();haptic(12)
}

function justifyPatchCellAt(r,c,id){
  if(!patchesLogicAvailable())return proofResult('unknown',null,null,[r,c],'engine-unavailable');
  let p=patchesLogicSession().proveOwner([r,c],Number(id));
  if(p.status==='proven'){let d=p.deduction||null,presenter=patchesReasoningPresenter(),view=d?presenter.presentation(d):null,x=proofResult('justified',view?.technique??null,view?.rank??p.fact?.rank??0,[r,c],{logicalStatus:'proven',deduction:d?presenter.legacyReasoning(d):null});x.logicalStatus='proven';return x}
  let x=proofResult('unjustified',null,null,[r,c],{logicalStatus:p.status,contradiction:p.contradiction||null});x.logicalStatus=p.status;return x
}

function patchRectangleJustification(action){
  if(action.type!=='PATCH_RECTANGLE'||action.region==null||!action.rectangle)return null;
  if(!patchesLogicAvailable())return proofResult('unknown',null,null,null,'engine-unavailable');
  let id=Number(action.region),p=patchesLogicSession().proveRectangle(id,action.rectangle),target=PatchesLogic.helpers.rectCells(action.rectangle);
  if(p.status==='proven'){let d=p.deduction||null,presenter=patchesReasoningPresenter(),view=d?presenter.presentation(d):null,x=proofResult('justified',view?.technique??null,view?.rank??p.fact?.rank??0,target,{logicalStatus:'proven',deduction:d?presenter.legacyReasoning(d):null});x.logicalStatus='proven';return x}
  let x=proofResult('unjustified',null,null,target,{logicalStatus:p.status,contradiction:p.contradiction||null});x.logicalStatus=p.status;return x
}

function patchTutorSelectedIds(engine,ids){return new Set((ids||[]).filter(id=>engine.selectedRect(id)!=null))}

function patchTutorQueueSelections(s,beforeSelected,primary,automatic){let sequence=[primary,...(automatic||[])].filter(Boolean),afterSelected=patchTutorSelectedIds(s.patchLogic,s.base.ids),pending=new Set([...afterSelected].filter(id=>!beforeSelected.has(id)));s.patchRevealQueue=s.patchRevealQueue||[];let enqueue=(id,deduction)=>{id=Number(id);if(!pending.has(id))return;let rect=s.patchLogic.selectedRect(id)?.rect;if(!rect)return;s.patchRevealQueue.push({clue:id,rectangle:JSON.parse(JSON.stringify(rect)),deduction:JSON.parse(JSON.stringify(deduction||primary)),batchPrimaryId:primary?.id||null});pending.delete(id)};for(const d of sequence)for(const c of d?.conclusions||[])if(c.type==='SELECTED_RECT')enqueue(c.clue,d);for(const id of s.base.ids)if(pending.has(Number(id)))enqueue(id,primary)}

function patchTutorRevealNext(s){let item=s.patchRevealQueue?.shift();if(!item)return false;let id=item.clue,rect=item.rectangle,d=item.deduction,beforeSnapshot=walkthroughSnapshot(s.work);s.work.patchSelectedRects=s.work.patchSelectedRects||{};s.work.patchSelectedRects[id]={r0:rect.r0,r1:rect.r1,c0:rect.c0,c1:rect.c1};for(const [r,col] of rect.cells||PatchesLogic.helpers.rectCells(rect))s.work.paint[r][col]=id;let presenter=patchesReasoningPresenter(),presentation=presenter.presentation(d,[]),reasoning=presenter.legacyReasoning(d,[]),info={
    rule:presentation.rule,technique:presentation.technique,rank:presentation.rank,techniqueLevel:presentation.techniqueLevel,target:presenter.primaryCell(d),presentation,deduction:reasoning,
    where:presentation.explanation.where,why:presentation.explanation.why,move:presentation.explanation.move,automatic:[],metrics:s.patchLogic.metrics(),beforeSnapshot,revealedClue:id,revealedRectangle:{r0:rect.r0,r1:rect.r1,c0:rect.c0,c1:rect.c1}
  };info.snapshot=walkthroughSnapshot(s.work);info.after=info.snapshot;s.moves.push(info);if(walkthroughComplete()&&!s.patchRevealQueue.length){s.done=true;s.total=s.moves.length;s.metrics=s.patchLogic.metrics()}return true}

function walkthroughGeneratePatchesNext(){
  let s=walkthroughSession;if(!s||s.base.game!=='patches'||s.done||s.stalled)return false;
  if(!s.patchLogic)s.patchLogic=patchesLogicSession(s.work,s.work.paint,s.work.patchSelectedRects,s.work.patchLogicEvidence);
  if(s.patchRevealQueue?.length)return patchTutorRevealNext(s);
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;return false}
  let guard=0,maxGuard=Math.max(20,(s.base.ids?.length||1)*20);
  while(!s.patchRevealQueue?.length&&guard++<maxGuard){
    let result=s.patchLogic.nextDeduction();
    if(result.contradiction){s.stalled=true;s.logicContradiction=result.contradiction;return false}
    if(!result.deduction){s.stalled=true;return false}
    let beforeSelected=patchTutorSelectedIds(s.patchLogic,s.base.ids),applied=s.patchLogic.applyDeduction(result.deduction),d=applied.deduction;if(!d){s.stalled=true;return false}
    if(applied.contradiction){s.stalled=true;s.logicContradiction=applied.contradiction;return false}
    patchSyncEngineEvidence(s.work,s.patchLogic);
    patchTutorQueueSelections(s,beforeSelected,d,applied.automatic);
  }
  if(!s.patchRevealQueue?.length){s.stalled=true;return false}
  return patchTutorRevealNext(s)
}

function patchReason(r,c,id,cl){
  let piece=lang()==='fr'?`zone ${id+1}`:`region ${id+1}`,shape=cl.shape==='carré'?(lang()==='fr'?'carrée':'square'):cl.shape==='vertical'?(lang()==='fr'?'verticale':'vertical'):cl.shape==='horizontal'?(lang()==='fr'?'horizontale':'horizontal'):(lang()==='fr'?'rectangulaire':'rectangular');
  if(cl.mode==='both')return lang()==='fr'?`l’indice impose une zone ${shape} de ${cl.size} cases ; cette case appartient au rectangle compatible avec cet indice.`:`the clue requires a ${shape} region of ${cl.size} cells; this cell belongs to the rectangle compatible with that clue.`;
  if(cl.mode==='size')return lang()==='fr'?`l’indice impose ${cl.size} cases ; cette case est nécessaire pour compléter un rectangle de cette surface.`:`the clue requires ${cl.size} cells; this cell is needed to complete a rectangle of that area.`;
  if(cl.mode==='shape')return lang()==='fr'?`l’indice impose une forme ${shape} ; cette case prolonge la zone sans recouvrir un autre indice.`:`the clue requires a ${shape} shape; this cell extends the region without covering another clue.`;
  return lang()==='fr'?`cette case appartient à ${piece} dans l’unique découpage valide et n’introduit ni chevauchement ni second indice.`:`this cell belongs to ${piece} in the unique valid partition and creates neither overlap nor a second clue.`
}

function hintP(){
  if(current?.training)return trainingCoach();if(paused)return;if(showVisibleErrorsBeforeHint())return;if(showExplorationContradictionBeforeHint())return;
  if(!patchesLogicAvailable()){showHintNotice(tr('hintError'));return}
  let result;try{result=patchCurrentLogicResult()}catch(_){showHintNotice(tr('hintError'));return}
  if(result.contradiction){current.hintFlow=null;clearHintFocus();showHintNotice(`<b>⚠ ${tr('errorDetected')}</b><br>${patchesReasoningPresenter().contradictionText(result.contradiction)}`);return}
  if(!result.deduction){current.hintFlow=null;clearHintFocus();showHintNotice(tr('plNoDeduction'));return}
  patchCoachHandleDeduction(result.deduction)
}
