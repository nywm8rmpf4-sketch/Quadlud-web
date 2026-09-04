/*
 * QUADLUD — Mosaïque atomic Tutor action projection
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const isNode=typeof module==='object'&&module.exports;
  const base=isNode?require('./nonogram-pedagogy.js'):root?.QuadludNonogramPedagogy;
  const logicalMove=isNode?require('./logical-move.js'):root?.QuadludLogicalMove;
  const logic=isNode?require('./nonogram-logic.js'):root?.NonogramLogic;
  const api=factory(base,logicalMove,logic);
  if(isNode)module.exports=api;
  if(root)root.QuadludNonogramPedagogy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(BasePedagogy,LogicalMove,Logic){
'use strict';
if(!BasePedagogy||typeof BasePedagogy.createTutor!=='function'||typeof BasePedagogy.createAdapter!=='function')throw new Error('Nonogram atomic Tutor requires base Nonogram pedagogy');
if(!LogicalMove||typeof LogicalMove.defineLogicalMove!=='function')throw new Error('Nonogram atomic Tutor requires QuadludLogicalMove');
if(!Logic||!Number.isInteger(Logic.UNKNOWN))throw new Error('Nonogram atomic Tutor requires NonogramLogic');

const VERSION=1;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function freezeDeep(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))freezeDeep(x);return v}
function sameEntity(a,b){return !!a&&!!b&&a.kind===b.kind&&a.id===b.id}
function atomicFocus(focus,target){return (focus||[]).filter(item=>item?.role!=='target'||sameEntity(item.entity,target)).map(clone)}
function visibleStateFromResult(result){return result?.view?.visibleState?.state}
function unresolvedConclusion(result){
  const state=visibleStateFromResult(result);
  for(const conclusion of result?.deduction?.conclusions||[]){
    const m=/^r(\d+)c(\d+)$/.exec(String(conclusion?.cell?.id||''));
    if(!m)return conclusion;
    const r=Number(m[1]),c=Number(m[2]);
    if(state?.[r]?.[c]===Logic.UNKNOWN)return conclusion
  }
  return result?.deduction?.conclusions?.[0]||null
}
function atomicProjection(result,presenter){
  if(result?.status!=='deduction'||!result.presentation?.action?.move)return result;
  const conclusion=unresolvedConclusion(result),fullMove=result.presentation.action.move;
  if(!conclusion?.cell)return result;
  const effect=(fullMove.effects||[]).find(item=>item?.type==='SET_CELL'&&sameEntity(item.target,conclusion.cell)&&item.state===conclusion.state);
  if(!effect)throw new Error(`Nonogram Tutor cannot isolate visible conclusion ${conclusion.cell.id}`);
  const move=LogicalMove.defineLogicalMove({
    techniqueId:fullMove.techniqueId,
    rank:fullMove.rank,
    targets:[clone(conclusion.cell)],
    effects:[clone(effect)],
    focus:atomicFocus(fullMove.focus||result.presentation.focus,conclusion.cell),
    evidence:clone(fullMove.evidence||{})
  });
  const atomicDeduction={...clone(result.deduction),conclusions:[clone(conclusion)],move:clone(move)};
  const presentation=clone(result.presentation);
  presentation.focus=atomicFocus(presentation.focus,conclusion.cell);
  presentation.action={...(presentation.action||{}),move:clone(move),conclusions:[clone(conclusion)]};
  presentation.explanation={...(presentation.explanation||{}),move:presenter.moveText(atomicDeduction)};
  if(presentation.derivation)presentation.derivation.action=['primary.conclusions'];
  if(presentation.proofNarrative?.action)presentation.proofNarrative.action.evidenceRefs=['primary.conclusions'];
  presentation.metadata={...(presentation.metadata||{}),atomicTutorAction:true,engineConclusionCount:(result.deduction.conclusions||[]).length,playedConclusion:clone(conclusion.cell)};
  const levels=clone(result.levels||[]);
  if(levels[3])levels[3]={...levels[3],text:presentation.explanation?.move||'',focus:clone(presentation.focus.filter(x=>x.role==='target')),action:clone(presentation.action)};
  const out={...clone(result),presentation,levels,deduction:clone(result.deduction)};
  return freezeDeep(out)
}
function tutorCoach(baseCoach){
  if(!baseCoach||typeof baseCoach.next!=='function'||!baseCoach.presenter)throw new TypeError('Nonogram atomic Tutor requires a Coach');
  const next=source=>atomicProjection(baseCoach.next(source),baseCoach.presenter);
  return Object.freeze({...baseCoach,next,level:(source,n)=>{const result=next(source);return result.status==='deduction'?result.levels?.[Number(n)-1]||null:null}})
}
function createTutor(options={}){
  const baseCoach=options.coach||BasePedagogy.createCoach(options.coachOptions||{}),coach=tutorCoach(baseCoach);
  return BasePedagogy.createTutor({...options,coach})
}
function localizedCoach(d={}){
  const common=d.common||{},commonTr=typeof common.tr==='function'?common.tr:null,commonLang=typeof common.lang==='function'?common.lang:null,coachOptions={...(d.coachOptions||{})};
  if(!coachOptions.presenter){const presenterOptions={...(coachOptions.presenterOptions||{})};if(commonTr)presenterOptions.tr=commonTr;if(commonLang)presenterOptions.lang=commonLang;coachOptions.presenterOptions=presenterOptions}
  return BasePedagogy.createCoach(coachOptions)
}
function createAdapter(d={}){
  const base=BasePedagogy.createAdapter(d),tutor=createTutor({coach:localizedCoach(d),...(d.tutorOptions||{})});
  return Object.freeze({...base,walkthrough:Object.freeze({...base.walkthrough,generateNext:walk=>!!tutor.next(walk),initialize:walk=>tutor.initialize(walk)})})
}

return Object.freeze({...BasePedagogy,ATOMIC_TUTOR_VERSION:VERSION,createTutor,createAdapter,_atomic:Object.freeze({atomicProjection,tutorCoach,unresolvedConclusion})});
});
