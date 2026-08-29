/*
 * QUADLUD — shared reasoning presentation contract
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludReasoningPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=2;
  const EVIDENCE_SCHEMA=1;
  const PRESENTATION_SCHEMA=1;
  const EVIDENCE_KIND='engine-deduction';
  const PROOF_NARRATIVE_SCHEMA=1;
  const PROOF_NARRATIVE_KIND='proof-narrative';
  const PROOF_REPLAY_SCHEMA=1;
  const PROOF_REPLAY_KIND='proof-replay';
  const DERIVED_FIELDS=Object.freeze(['technique','focus','explanation','action']);
  const FORBIDDEN_EVIDENCE_KEYS=Object.freeze(new Set(['sol','solution','hiddenSolution','solutionGrid','answerGrid','hiddenState','validationState']));

  function fail(message){throw new TypeError(`Invalid QUADLUD reasoning presentation: ${message}`)}
  function isPlainObject(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const proto=Object.getPrototypeOf(value);
    return proto===Object.prototype||proto===null;
  }
  function assertNonEmptyString(value,path){if(typeof value!=='string'||!value.trim())fail(`${path} must be a non-empty string`)}
  function assertSafeJson(value,path='value',seen=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){
      if(!Number.isFinite(value))fail(`${path} must contain only finite numbers`);
      return;
    }
    if(typeof value==='undefined'||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')fail(`${path} must be JSON-serializable`);
    if(typeof value!=='object')fail(`${path} must be JSON-serializable`);
    if(seen.has(value))fail(`${path} must not contain cycles`);
    seen.add(value);
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++)assertSafeJson(value[i],`${path}[${i}]`,seen);
    }else{
      if(!isPlainObject(value))fail(`${path} must contain only plain objects and arrays`);
      for(const [key,item] of Object.entries(value)){
        if(FORBIDDEN_EVIDENCE_KEYS.has(key))fail(`${path}.${key} is forbidden in visible-state evidence`);
        assertSafeJson(item,`${path}.${key}`,seen);
      }
    }
    seen.delete(value);
  }
  function cloneJson(value){
    assertSafeJson(value);
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }
  function frozenClone(value){return deepFreeze(cloneJson(value))}

  function normalizeDeduction(source,path){
    if(!isPlainObject(source))fail(`${path} must be a plain engine deduction object`);
    assertSafeJson(source,path);
    assertNonEmptyString(source.rule,`${path}.rule`);
    if(Object.prototype.hasOwnProperty.call(source,'premises')&&!Array.isArray(source.premises))fail(`${path}.premises must be an array when present`);
    if(Object.prototype.hasOwnProperty.call(source,'conclusions')&&!Array.isArray(source.conclusions))fail(`${path}.conclusions must be an array when present`);
    return frozenClone(source);
  }
  function normalizeEntityRef(source,path){
    if(!isPlainObject(source))fail(`${path} must be an EntityRef object`);
    const keys=Object.keys(source);if(keys.some(key=>key!=='kind'&&key!=='id'))fail(`${path} may contain only kind and id`);
    assertNonEmptyString(source.kind,`${path}.kind`);assertNonEmptyString(source.id,`${path}.id`);
    return deepFreeze({kind:source.kind.trim(),id:source.id.trim()})
  }
  function normalizeGenericFocus(source,path='focus'){
    if(!Array.isArray(source))fail(`${path} must be an array`);
    return deepFreeze(source.map((item,index)=>{
      if(!isPlainObject(item))fail(`${path}[${index}] must be a plain object`);
      const keys=Object.keys(item);if(keys.some(key=>key!=='entity'&&key!=='role'))fail(`${path}[${index}] may contain only entity and role`);
      assertNonEmptyString(item.role,`${path}[${index}].role`);
      return deepFreeze({entity:normalizeEntityRef(item.entity,`${path}[${index}].entity`),role:item.role.trim()})
    }))
  }
  function normalizedFocus(primary){
    if(Object.prototype.hasOwnProperty.call(primary,'focus'))return normalizeGenericFocus(primary.focus,'primary.focus');
    const out={};
    for(const field of ['focusCells','focusUnits','focusRelations','focusClues','focusRectangles']){
      if(Object.prototype.hasOwnProperty.call(primary,field))out[field]=primary[field];
    }
    return deepFreeze(out);
  }
  function captureEngineEvidence(source){
    if(!isPlainObject(source))fail('engine evidence input must be a plain object');
    const allowed=new Set(['game','source','primary','supports','final','automatic','metadata']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown engine evidence field "${key}"`);
    assertNonEmptyString(source.game,'game');
    assertNonEmptyString(source.source,'source');
    const primary=normalizeDeduction(source.primary,'primary');
    const supports=source.supports==null?[]:source.supports;
    if(!Array.isArray(supports))fail('supports must be an array');
    const normalizedSupports=supports.map((item,index)=>normalizeDeduction(item,`supports[${index}]`));
    const final=source.final==null?primary:normalizeDeduction(source.final,'final');
    const automatic=source.automatic==null?[]:source.automatic;
    if(!Array.isArray(automatic))fail('automatic must be an array');
    assertSafeJson(automatic,'automatic');
    const metadata=source.metadata==null?{}:source.metadata;
    if(!isPlainObject(metadata))fail('metadata must be a plain object');
    assertSafeJson(metadata,'metadata');
    const evidence={
      schema:EVIDENCE_SCHEMA,
      kind:EVIDENCE_KIND,
      game:source.game.trim(),
      source:source.source.trim(),
      primary,
      supports:deepFreeze(normalizedSupports),
      final,
      automatic:frozenClone(automatic),
      metadata:frozenClone(metadata)
    };
    return deepFreeze(evidence);
  }

  function splitPath(path){
    assertNonEmptyString(path,'derivation path');
    const parts=path.split('.');
    if(parts.some(part=>!part||!/^([A-Za-z_$][A-Za-z0-9_$]*|\d+)$/.test(part)))fail(`invalid derivation path "${path}"`);
    return parts;
  }
  function evidencePathValue(evidence,path){
    let value=evidence;
    for(const part of splitPath(path)){
      if(value==null||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,part))return {exists:false,value:undefined};
      value=value[part];
    }
    return {exists:true,value};
  }
  function normalizeDerivation(evidence,field,refs){
    if(!Array.isArray(refs)||refs.length===0)fail(`derivation.${field} must contain at least one evidence path`);
    const out=[];
    for(const ref of refs){
      const path=String(ref);
      const resolved=evidencePathValue(evidence,path);
      if(!resolved.exists)fail(`derivation.${field} references missing evidence path "${path}"`);
      out.push(path);
    }
    return deepFreeze([...new Set(out)]);
  }
  function defaultFocusDerivation(primary){
    const refs=[];
    if(Object.prototype.hasOwnProperty.call(primary,'focus'))refs.push('primary.focus');
    else for(const field of ['focusCells','focusUnits','focusRelations','focusClues','focusRectangles'])if(Object.prototype.hasOwnProperty.call(primary,field))refs.push(`primary.${field}`);
    return refs.length?refs:['primary.rule'];
  }

  function assertCapturedEvidence(evidence,path='evidence'){
    if(!isPlainObject(evidence)||evidence.schema!==EVIDENCE_SCHEMA||evidence.kind!==EVIDENCE_KIND)fail(`${path} must come from captureEngineEvidence()`);
    assertNonEmptyString(evidence.game,`${path}.game`);
    assertNonEmptyString(evidence.source,`${path}.source`);
    assertNonEmptyString(evidence.primary?.rule,`${path}.primary.rule`);
    assertSafeJson(evidence,path);
    return evidence
  }
  function normalizeProofEvidenceRefs(evidence,refs,path,{deduction=false}={}){
    if(!Array.isArray(refs)||refs.length===0)fail(`${path} must contain at least one evidence path`);
    const out=[];
    for(let i=0;i<refs.length;i++){
      const ref=String(refs[i]);
      const resolved=evidencePathValue(evidence,ref);
      if(!resolved.exists)fail(`${path}[${i}] references missing evidence path "${ref}"`);
      out.push(ref)
    }
    const unique=[...new Set(out)];
    if(deduction){
      if(unique.length!==1)fail(`${path} for a deduction step must contain exactly one engine deduction path`);
      const resolved=evidencePathValue(evidence,unique[0]).value;
      if(!isPlainObject(resolved)||typeof resolved.rule!=='string'||!resolved.rule.trim())fail(`${path}[0] must reference a complete engine deduction`)
    }
    return deepFreeze(unique)
  }
  function normalizeProofNode(evidence,source,path,{deduction=false}={}){
    if(!isPlainObject(source))fail(`${path} must be a plain proof node`);
    const allowed=new Set(['id','evidenceRefs']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`${path} contains unknown field "${key}"`);
    assertNonEmptyString(source.id,`${path}.id`);
    return deepFreeze({id:source.id.trim(),evidenceRefs:normalizeProofEvidenceRefs(evidence,source.evidenceRefs,`${path}.evidenceRefs`,{deduction})})
  }
  function defineProofNarrative(evidence,source){
    assertCapturedEvidence(evidence);
    if(!isPlainObject(source))fail('proof narrative input must be a plain object');
    const allowed=new Set(['hypothesis','steps','contradiction','conclusion','action','metadata']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown proof narrative field "${key}"`);
    const steps=source.steps==null?[]:source.steps;
    if(!Array.isArray(steps))fail('proof narrative steps must be an array');
    if(source.conclusion==null)fail('proof narrative conclusion is required');
    const metadata=source.metadata==null?{}:source.metadata;
    if(!isPlainObject(metadata))fail('proof narrative metadata must be a plain object');
    assertSafeJson(metadata,'proof narrative metadata');
    return deepFreeze({
      schema:PROOF_NARRATIVE_SCHEMA,
      kind:PROOF_NARRATIVE_KIND,
      game:evidence.game,
      source:evidence.source,
      hypothesis:source.hypothesis==null?null:normalizeProofNode(evidence,source.hypothesis,'proofNarrative.hypothesis'),
      steps:deepFreeze(steps.map((step,index)=>normalizeProofNode(evidence,step,`proofNarrative.steps[${index}]`,{deduction:true}))),
      contradiction:source.contradiction==null?null:normalizeProofNode(evidence,source.contradiction,'proofNarrative.contradiction'),
      conclusion:normalizeProofNode(evidence,source.conclusion,'proofNarrative.conclusion'),
      action:source.action==null?null:normalizeProofNode(evidence,source.action,'proofNarrative.action'),
      provenance:deepFreeze({kind:EVIDENCE_KIND,source:evidence.source,evidenceSchema:EVIDENCE_SCHEMA}),
      metadata:frozenClone(metadata)
    })
  }
  function proofNarrativeSource(value){
    return {
      hypothesis:value.hypothesis&&{id:value.hypothesis.id,evidenceRefs:value.hypothesis.evidenceRefs},
      steps:(value.steps||[]).map(step=>({id:step.id,evidenceRefs:step.evidenceRefs})),
      contradiction:value.contradiction&&{id:value.contradiction.id,evidenceRefs:value.contradiction.evidenceRefs},
      conclusion:value.conclusion&&{id:value.conclusion.id,evidenceRefs:value.conclusion.evidenceRefs},
      action:value.action&&{id:value.action.id,evidenceRefs:value.action.evidenceRefs},
      metadata:value.metadata||{}
    }
  }
  function validateProofNarrativeAgainstEvidence(evidence,value){
    assertCapturedEvidence(evidence);
    if(!isPlainObject(value)||value.schema!==PROOF_NARRATIVE_SCHEMA||value.kind!==PROOF_NARRATIVE_KIND)fail('proofNarrative must come from defineProofNarrative()');
    if(value.game!==evidence.game||value.source!==evidence.source)fail('proofNarrative must reference the same engine evidence');
    assertSafeJson(value,'proofNarrative');
    const normalized=defineProofNarrative(evidence,proofNarrativeSource(value));
    if(JSON.stringify(normalized)!==JSON.stringify(value))fail('proofNarrative contains non-canonical or ungrounded fields');
    return normalized
  }
  function isProofNarrative(value){
    try{
      if(!isPlainObject(value)||value.schema!==PROOF_NARRATIVE_SCHEMA||value.kind!==PROOF_NARRATIVE_KIND)return false;
      assertSafeJson(value,'proofNarrative');
      if(typeof value.game!=='string'||!value.game||typeof value.source!=='string'||!value.source)return false;
      if(!Array.isArray(value.steps)||!isPlainObject(value.conclusion)||!isPlainObject(value.provenance))return false;
      return value.provenance.kind===EVIDENCE_KIND
    }catch(_){return false}
  }
  function normalizeReplayCallbackResult(result,path){
    if(typeof result==='boolean')return {ok:result,details:null};
    if(!isPlainObject(result)||typeof result.ok!=='boolean')fail(`${path} must return a boolean or {ok:boolean, details?}`);
    const allowed=new Set(['ok','details']);for(const key of Object.keys(result))if(!allowed.has(key))fail(`${path} returned unknown field "${key}"`);
    if(Object.prototype.hasOwnProperty.call(result,'details'))assertSafeJson(result.details,`${path}.details`);
    return {ok:result.ok,details:Object.prototype.hasOwnProperty.call(result,'details')?frozenClone(result.details):null}
  }
  function replayProofNarrative(source){
    if(!isPlainObject(source))fail('proof replay input must be a plain object');
    const allowed=new Set(['evidence','narrative','visibleState','adapter']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown proof replay field "${key}"`);
    const evidence=assertCapturedEvidence(source.evidence),narrative=validateProofNarrativeAgainstEvidence(evidence,source.narrative),adapter=source.adapter;
    if(!isPlainObject(source.visibleState))fail('proof replay visibleState must be a plain visible-state object');
    assertSafeJson(source.visibleState,'proof replay visibleState');
    if(!isPlainObject(adapter))fail('proof replay adapter must be a plain object');
    const state=cloneJson(source.visibleState),initialState=frozenClone(source.visibleState),events=[];
    const phases=[];
    if(narrative.hypothesis)phases.push(['hypothesis',narrative.hypothesis,null]);
    narrative.steps.forEach((node,index)=>phases.push(['step',node,index]));
    if(narrative.contradiction)phases.push(['contradiction',narrative.contradiction,null]);
    phases.push(['conclusion',narrative.conclusion,null]);
    if(narrative.action)phases.push(['action',narrative.action,null]);
    for(const [phase,node,index] of phases){
      const callback=adapter[phase];
      if(typeof callback!=='function')fail(`proof replay adapter.${phase} is required`);
      const resolved=node.evidenceRefs.map(ref=>evidencePathValue(evidence,ref).value);
      const raw=callback(state,deepFreeze({phase,index,node,evidence,narrative,resolved:deepFreeze(resolved)}));
      const checked=normalizeReplayCallbackResult(raw,`proof replay adapter.${phase}`);
      assertSafeJson(state,`proof replay state after ${phase}`);
      events.push(deepFreeze({phase,index,id:node.id,evidenceRefs:node.evidenceRefs,ok:checked.ok,details:checked.details,state:frozenClone(state)}));
      if(!checked.ok)return deepFreeze({schema:PROOF_REPLAY_SCHEMA,kind:PROOF_REPLAY_KIND,status:'FAIL',game:evidence.game,source:evidence.source,initialState,events:deepFreeze(events),failedAt:deepFreeze({phase,index,id:node.id}),finalState:frozenClone(state)})
    }
    return deepFreeze({schema:PROOF_REPLAY_SCHEMA,kind:PROOF_REPLAY_KIND,status:'PASS',game:evidence.game,source:evidence.source,initialState,events:deepFreeze(events),failedAt:null,finalState:frozenClone(state)})
  }
  function defineReasoningPresentation(source){
    if(!isPlainObject(source))fail('presentation input must be a plain object');
    const allowed=new Set(['evidence','technique','focus','explanation','action','derivation','metadata','proofNarrative']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown presentation field "${key}"`);
    const evidence=assertCapturedEvidence(source.evidence);
    const derivation=source.derivation==null?{}:source.derivation;
    if(!isPlainObject(derivation))fail('derivation must be a plain object');
    for(const key of Object.keys(derivation))if(!DERIVED_FIELDS.includes(key))fail(`unknown derivation field "${key}"`);

    const supplied={
      technique:Object.prototype.hasOwnProperty.call(source,'technique')?source.technique:null,
      focus:Object.prototype.hasOwnProperty.call(source,'focus')?source.focus:normalizedFocus(evidence.primary),
      explanation:Object.prototype.hasOwnProperty.call(source,'explanation')?source.explanation:null,
      action:Object.prototype.hasOwnProperty.call(source,'action')?source.action:null
    };
    for(const field of DERIVED_FIELDS){
      assertSafeJson(supplied[field],field);
      if(field==='focus'&&Array.isArray(supplied[field]))supplied.focus=normalizeGenericFocus(supplied.focus,'focus');
      const explicitlySupplied=Object.prototype.hasOwnProperty.call(source,field);
      if(explicitlySupplied&&supplied[field]!==null&&!Object.prototype.hasOwnProperty.call(derivation,field))fail(`${field} requires explicit evidence derivation paths`);
    }
    const normalizedDerivation={};
    for(const field of DERIVED_FIELDS){
      if(Object.prototype.hasOwnProperty.call(derivation,field))normalizedDerivation[field]=normalizeDerivation(evidence,field,derivation[field]);
      else if(field==='focus')normalizedDerivation.focus=deepFreeze(defaultFocusDerivation(evidence.primary));
      else normalizedDerivation[field]=deepFreeze([]);
    }
    const metadata=source.metadata==null?{}:source.metadata;
    if(!isPlainObject(metadata))fail('presentation metadata must be a plain object');
    assertSafeJson(metadata,'presentation metadata');
    const proofNarrative=source.proofNarrative==null?null:validateProofNarrativeAgainstEvidence(evidence,source.proofNarrative);

    const output={
      schema:PRESENTATION_SCHEMA,
      game:evidence.game,
      rule:evidence.primary.rule,
      technique:frozenClone(supplied.technique),
      focus:frozenClone(supplied.focus),
      premises:frozenClone(evidence.primary.premises||[]),
      explanation:frozenClone(supplied.explanation),
      action:frozenClone(supplied.action),
      proofDetails:deepFreeze({
        source:evidence.source,
        primary:evidence.primary,
        supports:evidence.supports,
        final:evidence.final,
        automatic:evidence.automatic,
        evidenceMetadata:evidence.metadata
      }),
      rank:Number.isFinite(Number(evidence.primary.rank))?Number(evidence.primary.rank):0,
      techniqueLevel:Number.isFinite(Number(evidence.primary.techniqueLevel))?Number(evidence.primary.techniqueLevel):0,
      provenance:deepFreeze({kind:EVIDENCE_KIND,source:evidence.source,derivation:deepFreeze(normalizedDerivation)}),
      metadata:frozenClone(metadata)
    };
    if(proofNarrative)output.proofNarrative=proofNarrative;
    return deepFreeze(output);
  }

  function isReasoningPresentation(value){
    try{
      if(!isPlainObject(value)||value.schema!==PRESENTATION_SCHEMA||typeof value.game!=='string'||typeof value.rule!=='string')return false;
      assertSafeJson(value,'presentation');
      if(!isPlainObject(value.proofDetails)||!isPlainObject(value.provenance)||value.provenance.kind!==EVIDENCE_KIND)return false;
      if(Object.prototype.hasOwnProperty.call(value,'proofNarrative')){
        const evidence=captureEngineEvidence({game:value.game,source:value.proofDetails.source,primary:value.proofDetails.primary,supports:value.proofDetails.supports,final:value.proofDetails.final,automatic:value.proofDetails.automatic,metadata:value.proofDetails.evidenceMetadata});
        validateProofNarrativeAgainstEvidence(evidence,value.proofNarrative)
      }
      return true
    }catch(_){return false}
  }

  return Object.freeze({
    VERSION,EVIDENCE_SCHEMA,PRESENTATION_SCHEMA,EVIDENCE_KIND,DERIVED_FIELDS,
    PROOF_NARRATIVE_SCHEMA,PROOF_NARRATIVE_KIND,PROOF_REPLAY_SCHEMA,PROOF_REPLAY_KIND,
    captureEngineEvidence,defineReasoningPresentation,evidencePathValue,isReasoningPresentation,
    defineProofNarrative,isProofNarrative,replayProofNarrative
  });
});
