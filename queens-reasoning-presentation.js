/*
 * QUADLUD — Queens reasoning presenter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const contract=typeof module==='object'&&module.exports?require('./reasoning-presentation.js'):root?.QuadludReasoningPresentation;
  const pedagogy=typeof module==='object'&&module.exports?require('./pedagogy-metadata.js'):root?.QuadludPedagogyMetadata;
  const api=factory(contract,pedagogy);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludQueensReasoningPresenter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(ReasoningPresentation,PedagogyMetadata){
  'use strict';
  if(!ReasoningPresentation)throw new Error('QuadludReasoningPresentation is required');
  if(!PedagogyMetadata)throw new Error('QuadludPedagogyMetadata is required');
  const GAME='queens', SOURCE='queens-inference-engine';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const cellCoordinate=(r,c)=>`${String.fromCharCode(65+Number(r))}${Number(c)+1}`;

  function createPresenter(h={}){
    const tr=h.tr||((k)=>k), lang=h.lang||(()=> 'en'),
      genericLocalizedHint=h.genericLocalizedHint||(()=>({where:tr('visibleOnly'),why:'',move:''})),
      zoneBadge=h.zoneBadge||((id)=>`${tr('zone')} ${Number(id)+1}`), unitCells=h.unitCells||((ref,context)=>{let n=Number(context?.n)||0,out=[];if(!ref||!n)return out;if(ref.family==='row'){for(let c=0;c<n;c++)out.push([Number(ref.id),c])}else if(ref.family==='column'){for(let r=0;r<n;r++)out.push([r,Number(ref.id)])}else if(ref.family==='region'&&Array.isArray(context?.reg)){for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(context.reg[r]?.[c]===Number(ref.id))out.push([r,c])}return out}),
      isDetailedLanguage=h.isDetailedLanguage||(()=>false);
    const format=(key,vars={})=>String(tr(key)||key).replace(/\{([A-Za-z0-9_]+)\}/g,(_,k)=>vars[k]??'');
    const rowHuman=id=>String.fromCharCode(65+Number(id));
    const unitHuman=ref=>{if(!ref)return '';if(ref.family==='row')return `${tr('rowLabel')} ${rowHuman(ref.id)}`;if(ref.family==='column')return `${tr('columnLabel')} ${Number(ref.id)+1}`;return zoneBadge(Number(ref.id))};
    const unitListHuman=units=>(units||[]).map(unitHuman).join(tr('qlAnd'));
    const cellListHuman=(cells,limit=12)=>{let a=(cells||[]).map(x=>cellCoordinate(x[0],x[1]));if(a.length<=limit)return a.join(', ');return a.slice(0,limit).join(', ')+format('qlMore',{count:a.length-limit})};
    const conflictReasonHuman=reasons=>{let r=reasons?.[0],key=r==='ROW'?'qlConflictRow':r==='COLUMN'?'qlConflictColumn':r==='REGION'?'qlConflictRegion':r==='ADJACENCY'?'qlConflictAdjacency':'qlConflictRule';return tr(key)};
    const targetFamilyHuman=f=>tr(f==='row'?'qlRowsPlural':f==='column'?'qlColumnsPlural':'qlRegionsPlural');
    const targetFamilyCountHuman=(f,count)=>`${Number(count)} ${Number(count)===1?tr(f==='row'?'rowLabel':f==='column'?'columnLabel':'zone'):targetFamilyHuman(f)}`;
    const unitKey=ref=>ref?`${ref.family}:${Number(ref.id)}`:'';

    function blockHuman(cells){
      if(!Array.isArray(cells)||!cells.length)return '';
      let rows=cells.map(x=>Number(x[0])),cols=cells.map(x=>Number(x[1])),r0=Math.min(...rows),r1=Math.max(...rows),c0=Math.min(...cols),c1=Math.max(...cols),rect=(r1-r0+1)*(c1-c0+1)===cells.length;
      return rect?`${cellCoordinate(r0,c0)}–${cellCoordinate(r1,c1)}`:cellListHuman(cells)
    }
    function sourceCandidateEntries(x){
      let source=x?.sourceCandidates,out=[];
      for(const ref of x?.sourceUnits||[]){
        let candidates=[];
        if(Array.isArray(source))candidates=source;
        else if(source&&typeof source==='object')candidates=source[unitKey(ref)]||[];
        out.push({unit:ref,candidates})
      }
      return out
    }
    function candidateEntryHuman(ref,candidates){return `${unitHuman(ref)} → ${cellListHuman(candidates)}`}
    function sourceCandidatesHuman(x){return sourceCandidateEntries(x).map(z=>candidateEntryHuman(z.unit,z.candidates)).join('; ')}
    function mandatoryPremisesHuman(units,premises){
      let out=[];
      for(let i=0;i<(units||[]).length;i++){
        let ref=units[i],p=(premises||[]).find(q=>q?.unit?.family===ref.family&&Number(q?.unit?.id)===Number(ref.id))||(premises||[])[i];
        if(p?.kind==='candidate_set')out.push(candidateEntryHuman(ref,p.candidates||[]));
        else if(p?.kind==='queen'&&Array.isArray(p.cell))out.push(`${unitHuman(ref)} → ${cellCoordinate(...p.cell)}`);
        else out.push(unitHuman(ref))
      }
      return out.join('; ')
    }
    function conflictListHuman(conflicts){return (conflicts||[]).map(z=>`${cellCoordinate(...z.candidate)} → ${conflictReasonHuman(z.reasons)}`).join('; ')}

    function ruleTitle(d){
      let N=d?.explanationData?.size,key=d?.rule==='SINGLETON'?'qlSingleton':d?.rule==='LOCKED_UNIT'?'qlLocked':d?.rule==='COMMON_CONFLICT'?'qlCommonConflict':d?.rule==='HALL_SET'?(N===2?'qlHallPair':N===3?'qlHallTriple':'qlHallGroup'):d?.rule==='LOCAL_CAPACITY'?'qlCapacity':d?.rule==='NO_SUPPORT'?'qlNoSupport':d?.rule==='MIXED_HALL'?'qlMixedHall':d?.rule==='ASSUMPTION_CONTRADICTION'?'qlContradiction':d?.rule==='QUEEN_PROPAGATION'?'qlPropagation':null;
      return key?tr(key):tr('qlLogicalDeduction')
    }

    function premiseCells(d,context=null){
      if(!d)return [];
      let x=d.explanationData||{},cells=[];
      if(Array.isArray(x.sourceCandidates))cells.push(...x.sourceCandidates);
      if(Array.isArray(x.supportCandidates))cells.push(...x.supportCandidates);
      if(Array.isArray(x.target))cells.push(x.target);
      if(x.block)cells.push(...x.block);
      if(x.sourceCandidates&&typeof x.sourceCandidates==='object'&&!Array.isArray(x.sourceCandidates))for(let a of Object.values(x.sourceCandidates))cells.push(...a);
      for(let u of d.focusUnits||[])cells.push(...unitCells(u,context));
      if(x.assumption?.cell)cells.push(x.assumption.cell);
      if(x.witness?.cells)cells.push(...x.witness.cells);
      if(x.witness?.block)cells.push(...x.witness.block);
      for(let step of x.trace||[]){for(let c of step.focusCells||[])cells.push(c);for(let c of step.conclusions||[])if(c.cell)cells.push(c.cell)}
      let seen=new Set(),out=[];for(let cell of cells){if(!Array.isArray(cell))continue;let k=cell.join(',');if(!seen.has(k)){seen.add(k);out.push(cell)}}return out
    }

    function orientation(d){
      let x=d.explanationData||{};
      if(!isDetailedLanguage(lang())){let c=d.conclusions?.[0],g=c?genericLocalizedHint(GAME,c.cell,d.rank,c.value):{where:tr('visibleOnly')};return `${ruleTitle(d)} · ${g.where}`}
      if(d.rule==='SINGLETON')return format('qlOrientSingleton',{unit:unitHuman(x.unit)});
      if(d.rule==='LOCKED_UNIT')return format('qlOrientLocked',{source:unitHuman(x.sourceUnit),target:unitHuman(x.targetUnit)});
      if(d.rule==='COMMON_CONFLICT')return format('qlOrientCommon',{source:unitHuman(x.sourceUnit),target:cellCoordinate(...x.target)});
      if(d.rule==='HALL_SET')return format('qlOrientHall',{sources:unitListHuman(x.sourceUnits),targetFamily:targetFamilyHuman(x.targetFamily)});
      if(d.rule==='LOCAL_CAPACITY')return format('qlOrientCapacity',{size:x.size});
      if(d.rule==='NO_SUPPORT')return format('qlOrientNoSupport',{target:cellCoordinate(...x.target),support:unitHuman(x.supportUnit)});
      if(d.rule==='MIXED_HALL')return format('qlOrientMixed',{sources:unitListHuman(x.sourceUnits),rows:x.rows.length,columns:x.columns.length});
      if(d.rule==='ASSUMPTION_CONTRADICTION')return format('qlOrientContradiction',{cell:cellCoordinate(...x.assumption.cell)});
      if(d.rule==='QUEEN_PROPAGATION')return format('qlOrientPropagation',{cell:cellCoordinate(...x.queen)});
      return tr('visibleOnly')
    }

    function conclusionText(d){
      let cs=d?.conclusions||[],queens=cs.filter(x=>x.value===2).map(x=>x.cell),xs=cs.filter(x=>x.value===1).map(x=>x.cell),parts=[];
      if(queens.length)parts.push(format('qlConclusionQueen',{cells:cellListHuman(queens)}));
      if(xs.length===1&&isDetailedLanguage(lang()))parts.push(format('qlConclusionX',{cell:cellCoordinate(...xs[0])}));else if(xs.length)parts.push(format('qlConclusionXs',{cells:cellListHuman(xs)}));
      return parts.join(' ')
    }

    function directExplanation(d){
      let x=d?.explanationData||{},conclusion=conclusionText(d);
      if(d.rule==='QUEEN_PROPAGATION')return format('qlExplainPropagation',{cell:cellCoordinate(...x.queen),cells:cellListHuman((d.conclusions||[]).filter(c=>c.value===1).map(c=>c.cell)),conclusion});
      if(d.rule==='SINGLETON')return format('qlExplainSingleton',{unit:unitHuman(x.unit),conclusion});
      if(d.rule==='LOCKED_UNIT')return format('qlExplainLockedDetailed',{source:unitHuman(x.sourceUnit),candidates:cellListHuman(x.sourceCandidates),target:unitHuman(x.targetUnit),eliminated:cellListHuman(x.eliminated),conclusion});
      if(d.rule==='COMMON_CONFLICT')return format('qlExplainCommon',{source:unitHuman(x.sourceUnit),candidates:cellListHuman(x.sourceCandidates),target:cellCoordinate(...x.target),conflicts:conflictListHuman(x.conflicts),conclusion});
      if(d.rule==='HALL_SET')return format('qlExplainHallDetailed',{size:x.size,sources:sourceCandidatesHuman(x),targets:unitListHuman(x.targetUnits),targetFamily:targetFamilyHuman(x.targetFamily),eliminated:cellListHuman(x.eliminated),conclusion});
      if(d.rule==='LOCAL_CAPACITY')return format('qlExplainCapacityDetailed',{block:blockHuman(x.block),size:x.size,capacity:x.capacity,sources:mandatoryPremisesHuman(x.sourceUnits,d.premises),sourcesCount:(x.sourceUnits||[]).length,eliminated:cellListHuman(x.eliminated),conclusion});
      if(d.rule==='NO_SUPPORT')return format('qlExplainNoSupportDetailed',{target:cellCoordinate(...x.target),support:unitHuman(x.supportUnit),candidates:cellListHuman(x.supportCandidates),conflicts:conflictListHuman(x.conflicts),conclusion});
      if(d.rule==='MIXED_HALL')return format('qlExplainMixedDetailed',{size:x.size,sources:sourceCandidatesHuman(x),rows:(x.rows||[]).map(id=>unitHuman({family:'row',id})).join(', '),columns:(x.columns||[]).map(id=>unitHuman({family:'column',id})).join(', '),eliminated:cellListHuman(x.eliminated),conclusion});
      return conclusion
    }

    function witnessDetailedText(w){
      if(!w)return tr('qlCurrentGeneric');
      if(w.kind==='no_candidate'){
        let p=(w.premises||[]).find(x=>x?.kind==='candidate_set'),excluded=(p?.excluded||[]).map(x=>x.cell).filter(Array.isArray);
        return format('qlWitnessNoCandidateDetailed',{unit:unitHuman(w.unit),cells:cellListHuman(excluded.length?excluded:w.cells||[])})
      }
      if(w.kind==='hall_contradiction')return format('qlWitnessHallDetailed',{sources:mandatoryPremisesHuman(w.sourceUnits,w.premises),sourceCount:(w.sourceUnits||[]).length,targets:unitListHuman(w.targetUnits),targetCount:(w.targetUnits||[]).length,targetCountLabel:targetFamilyCountHuman(w.targetFamily,(w.targetUnits||[]).length)});
      if(w.kind==='capacity_contradiction')return format('qlWitnessCapacityDetailed',{block:blockHuman(w.block),size:w.size,capacity:w.capacity,sources:mandatoryPremisesHuman(w.sourceUnits,w.premises),sourceCount:(w.sourceUnits||[]).length});
      if(w.kind==='rule_violation')return format('qlWitnessRuleDetailed',{cells:cellListHuman(w.cells||[]),reason:conflictReasonHuman(w.reasons)});
      return contradictionText(w)
    }

    function proofExplanationParts(d){
      let x=d?.explanationData||{},a=x.assumption,w=x.witness||{},trace=Array.isArray(x.trace)?x.trace:[];
      if(!a?.cell)return null;
      return Object.freeze({
        hypothesis:`<b>${tr('qlProofHypothesisLabel')}</b> ${format('qlProofTry',{assumed:tr(a.value===2?'qlAssumeQueen':'qlAssumeX'),cell:cellCoordinate(...a.cell)})}`,
        steps:Object.freeze(trace.map((step,i)=>`<b>${format('qlProofConsequenceLabel',{index:i+1})}</b> ${directExplanation(step)}`)),
        contradiction:`<b>${tr('qlProofContradictionLabel')}</b> ${witnessDetailedText(w)}`,
        conclusion:`<b>${tr('qlProofConclusionLabel')}</b> ${format('qlProofReject',{cell:cellCoordinate(...a.cell),conclusion:conclusionText(d)})}`
      })
    }

    function proofExplanation(d){
      let parts=proofExplanationParts(d);
      if(!parts)return conclusionText(d);
      return [parts.hypothesis,...parts.steps,parts.contradiction,parts.conclusion].join('<br>')
    }

    function explanation(d){
      let conclusion=conclusionText(d);
      if(!isDetailedLanguage(lang())){let c=d?.conclusions?.[0];if(!c)return ruleTitle(d);let g=genericLocalizedHint(GAME,c.cell,d.rank,c.value);return `${ruleTitle(d)}. ${g.why} ${g.move}`}
      if(d.rule==='ASSUMPTION_CONTRADICTION')return proofExplanation(d);
      return directExplanation(d)||conclusion
    }

    function contradictionText(w){
      if(!w)return '';
      if(w.kind==='no_candidate')return format('qlCurrentNoCandidate',{unit:unitHuman(w.unit)});
      if(w.kind==='hall_contradiction')return format('qlCurrentHall',{targetFamily:targetFamilyHuman(w.targetFamily)});
      if(w.kind==='capacity_contradiction')return format('qlCurrentCapacity',{size:w.size,capacity:w.capacity});
      if(w.kind==='rule_violation')return format('qlCurrentRule',{reason:conflictReasonHuman(w.reasons)});
      return tr('qlCurrentGeneric')
    }

    function techniqueForDeduction(d){return PedagogyMetadata.techniqueIdForDeduction(GAME,d)}
    function legacyReasoning(d,automatic=[]){return {schema:2,source:SOURCE,game:GAME,rule:d.rule,technique:techniqueForDeduction(d),rank:d.rank,techniqueLevel:d.techniqueLevel,premises:clone(d.premises||[]),dependencies:[...(d.dependencies||[])],focusCells:(d.focusCells||[]).map(x=>[...x]),focusUnits:clone(d.focusUnits||[]),conclusions:clone(d.conclusions||[]),automatic:clone(automatic||[]),explanationData:clone(d.explanationData||{})}}

    function proofNarrativeFor(d,evidence){
      if(d?.rule!=='ASSUMPTION_CONTRADICTION')return null;
      let x=d.explanationData||{},trace=Array.isArray(x.trace)?x.trace:[];
      if(!x.assumption||!x.witness||!(d.conclusions||[]).length)return null;
      return ReasoningPresentation.defineProofNarrative(evidence,{
        hypothesis:{id:'hypothesis',evidenceRefs:['primary.explanationData.assumption']},
        steps:trace.map((_,i)=>({id:`branch-${i+1}`,evidenceRefs:[`supports.${i}`]})),
        contradiction:{id:'contradiction-witness',evidenceRefs:['primary.explanationData.witness']},
        conclusion:{id:'reject-hypothesis',evidenceRefs:['primary.conclusions.0']},
        action:{id:'apply-opposite',evidenceRefs:['primary.conclusions.0']},
        metadata:{proofFamily:'ASSUMPTION_CONTRADICTION',contradictionType:x.contradictionType||x.witness.rule||x.witness.kind||null}
      })
    }

    function presentation(d,automatic=[]){
      if(!d)return null;
      const supports=d.rule==='ASSUMPTION_CONTRADICTION'&&Array.isArray(d.explanationData?.trace)?d.explanationData.trace:[];
      const evidence=ReasoningPresentation.captureEngineEvidence({game:GAME,source:SOURCE,primary:d,supports,final:d,automatic});
      const technique=techniqueForDeduction(d),action={type:'APPLY_DEDUCTION',conclusions:clone(d.conclusions||[])},view={title:ruleTitle(d),where:orientation(d),why:explanation(d),move:conclusionText(d)};
      const derivation={explanation:['primary.rule'],action:['final.conclusions']};
      if(Object.prototype.hasOwnProperty.call(d,'explanationData'))derivation.explanation.push('primary.explanationData');
      if(Object.prototype.hasOwnProperty.call(d,'conclusions'))derivation.explanation.push('primary.conclusions');
      if(supports.length)derivation.explanation.push('supports');
      if(technique!==null)derivation.technique=['primary.rule'];
      const proofNarrative=proofNarrativeFor(d,evidence);
      return ReasoningPresentation.defineReasoningPresentation({evidence,...(technique!==null?{technique}:{}),explanation:view,action,derivation,...(proofNarrative?{proofNarrative}:{}),metadata:{compatibilityReasoningSchema:2,walkthroughBadge:`R${Number(d.rank)||0}`,showTutorMove:false,fullProofNarrative:!!proofNarrative}})
    }

    function coachSequence(d,preparedView=null){
      if(!isDetailedLanguage(lang()))return null;
      const view=preparedView||presentation(d),narrative=view?.proofNarrative,parts=proofExplanationParts(d);
      if(!narrative||!parts||parts.steps.length!==narrative.steps.length||!narrative.hypothesis||!narrative.contradiction||!narrative.action)return null;
      const freezeStage=stage=>Object.freeze({...stage,evidenceRefs:Object.freeze([...(stage.evidenceRefs||[])])}),stages=[];
      stages.push(freezeStage({kind:'where',id:'where',evidenceRefs:view.provenance?.derivation?.focus||['primary.rule'],html:`<b>${tr('where')} :</b> ${view.explanation.where}`}));
      stages.push(freezeStage({kind:'hypothesis',id:narrative.hypothesis.id,evidenceRefs:narrative.hypothesis.evidenceRefs,html:`<b>${view.explanation.title}</b><br>${parts.hypothesis}`}));
      narrative.steps.forEach((node,i)=>stages.push(freezeStage({kind:'consequence',id:node.id,evidenceRefs:node.evidenceRefs,html:parts.steps[i]})));
      stages.push(freezeStage({kind:'contradiction-conclusion',id:`${narrative.contradiction.id}+${narrative.conclusion.id}`,evidenceRefs:[...narrative.contradiction.evidenceRefs,...narrative.conclusion.evidenceRefs],html:`${parts.contradiction}<br>${parts.conclusion}`}));
      stages.push(freezeStage({kind:'action',id:narrative.action.id,evidenceRefs:narrative.action.evidenceRefs,html:`<b>${tr('hintMove')} :</b> ${view.explanation.move}`,apply:true}));
      return Object.freeze(stages)
    }

    function tutorFocusDeduction(d,{id,focusCells=[],focusUnits=[],conclusions=[],premises=[],explanationData={}}={}){
      return Object.freeze({
        schema:1,id:id||`tutor:${d?.id||d?.rule||'proof'}`,rule:d?.rule||'ASSUMPTION_CONTRADICTION',rank:Number(d?.rank)||0,techniqueLevel:Number(d?.techniqueLevel)||0,
        premises:clone(premises||[]),dependencies:[],focusCells:clone(focusCells||[]),focusUnits:clone(focusUnits||[]),conclusions:clone(conclusions||[]),explanationData:clone(explanationData||{}),priority:0,clarity:0,automatic:false
      })
    }
    function witnessOrientation(w){
      if(!w)return tr('visibleOnly');
      if(w.kind==='capacity_contradiction')return [blockHuman(w.block),unitListHuman(w.sourceUnits)].filter(Boolean).join(' · ');
      if(w.kind==='hall_contradiction')return [unitListHuman(w.sourceUnits),unitListHuman(w.targetUnits)].filter(Boolean).join(' · ');
      if(w.kind==='no_candidate')return unitHuman(w.unit)||cellListHuman(w.cells||[]);
      if(w.kind==='rule_violation')return cellListHuman(w.cells||[]);
      return tr('visibleOnly')
    }
    function tutorSequence(d,preparedView=null){
      if(!isDetailedLanguage(lang()))return null;
      const view=preparedView||presentation(d),narrative=view?.proofNarrative,parts=proofExplanationParts(d),a=d?.explanationData?.assumption,w=d?.explanationData?.witness;
      if(!narrative||!parts||!a?.cell||!w||parts.steps.length!==narrative.steps.length||!narrative.hypothesis||!narrative.contradiction||!narrative.conclusion||!narrative.action)return null;
      const supports=view.proofDetails?.supports||[],freezeStage=stage=>Object.freeze({...stage,evidenceRefs:Object.freeze([...(stage.evidenceRefs||[])]),stateChanges:Object.freeze(clone(stage.stateChanges||[])),focusDeduction:stage.focusDeduction||null}),stages=[];
      const assumptionFocus=tutorFocusDeduction(d,{id:'tutor-hypothesis-focus',focusCells:[a.cell],conclusions:[{cell:a.cell,value:a.value,rank:0}],premises:[{kind:'assumption',cell:a.cell,value:a.value,hypothesis:true}],explanationData:{assumption:a}});
      const conclusionFocus=tutorFocusDeduction(d,{id:'tutor-conclusion-focus',focusCells:[a.cell],conclusions:d.conclusions||[],explanationData:{assumption:a}});
      const witnessUnits=[...(w.sourceUnits||[]),...(w.targetUnits||[]),...(w.unit?[w.unit]:[])],witnessFocus=tutorFocusDeduction(d,{id:'tutor-contradiction-focus',focusCells:[...(w.cells||[]),...(w.block||[])],focusUnits:witnessUnits,premises:w.premises||[],explanationData:{witness:w,block:w.block||[],sourceUnits:w.sourceUnits||[],targetUnits:w.targetUnits||[],unit:w.unit||null}});
      stages.push(freezeStage({kind:'where',id:'where',evidenceRefs:view.provenance?.derivation?.focus||['primary.rule'],title:view.explanation.title,where:view.explanation.where,why:tr('visibleOnly'),move:'',temporary:false,resetToVisible:true,focusDeduction:tutorFocusDeduction(d,{id:'tutor-where-focus',focusCells:[a.cell],explanationData:{assumption:a}})}));
      stages.push(freezeStage({kind:'hypothesis',id:narrative.hypothesis.id,evidenceRefs:narrative.hypothesis.evidenceRefs,title:view.explanation.title,where:cellCoordinate(...a.cell),why:parts.hypothesis,move:'',temporary:true,resetToVisible:false,stateChanges:[{cell:a.cell,value:a.value,rank:0}],focusDeduction:assumptionFocus}));
      narrative.steps.forEach((node,i)=>{const step=supports[i];stages.push(freezeStage({kind:'consequence',id:node.id,evidenceRefs:node.evidenceRefs,title:ruleTitle(step),where:orientation(step),why:parts.steps[i],move:'',temporary:true,resetToVisible:false,stateChanges:clone(step?.conclusions||[]),focusDeduction:clone(step)}))});
      stages.push(freezeStage({kind:'contradiction',id:narrative.contradiction.id,evidenceRefs:narrative.contradiction.evidenceRefs,title:view.explanation.title,where:witnessOrientation(w),why:parts.contradiction,move:'',temporary:true,resetToVisible:false,focusDeduction:witnessFocus}));
      stages.push(freezeStage({kind:'conclusion',id:narrative.conclusion.id,evidenceRefs:narrative.conclusion.evidenceRefs,title:view.explanation.title,where:cellCoordinate(...a.cell),why:parts.conclusion,move:'',temporary:false,resetToVisible:true,focusDeduction:conclusionFocus}));
      stages.push(freezeStage({kind:'action',id:narrative.action.id,evidenceRefs:narrative.action.evidenceRefs,title:view.explanation.title,where:cellCoordinate(...((d.conclusions||[])[0]?.cell||a.cell)),why:parts.conclusion,move:view.explanation.move,temporary:false,resetToVisible:true,stateChanges:clone(d.conclusions||[]),focusDeduction:conclusionFocus,apply:true}));
      return Object.freeze(stages)
    }

    return Object.freeze({GAME,SOURCE,cellCoordinate,ruleTitle,premiseCells,orientation,conclusionText,explanation,contradictionText,techniqueForDeduction,legacyReasoning,presentation,coachSequence,tutorSequence});
  }
  return Object.freeze({GAME,SOURCE,cellCoordinate,createPresenter});
});
