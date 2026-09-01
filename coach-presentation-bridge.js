/*
 * QUADLUD — shared Coach presentation runtime bridge
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(
    root,
    typeof module==='object'&&module.exports?require('./reasoning-presentation.js'):root?.QuadludReasoningPresentation,
    typeof module==='object'&&module.exports?require('./game-pedagogy-adapters.js'):root?.QuadludGamePedagogyAdapters
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludCoachPresentationRuntime=api;
  if(typeof document!=='undefined')api.installBrowserBridge();
})(typeof globalThis!=='undefined'?globalThis:this,function(root,ReasoningPresentation,PedagogyAdapters){
  'use strict';
  if(!ReasoningPresentation)throw new Error('QUADLUD reasoning presentation contract unavailable');
  if(!PedagogyAdapters)throw new Error('QUADLUD pedagogy adapter collection unavailable');
  const VERSION=1;
  function freezeDeep(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))freezeDeep(child);return value}
  const PERSONAS=freezeDeep({default:{id:'guide',glyph:'🧑‍🏫'},queens:{id:'sailor',glyph:'🧑‍✈️'}});
  function personaProfile(game){return String(game||'')==='queens'?PERSONAS.queens:PERSONAS.default}
  function personaMarkup(surface,game){
    const kind=surface==='tutor'?'tutor':'coach',profile=personaProfile(game);
    return `<span class="pedagogy-persona pedagogy-persona-${kind}" data-persona="${profile.id}" aria-hidden="true">${profile.glyph}</span>`
  }
  function browserDocument(){return typeof document!=='undefined'?document:null}
  function bindQueensProofPersona(){
    const doc=browserDocument();if(!doc)return false;let bound=false;
    for(const id of ['queenCoachProofPrev','queenCoachProofNext']){
      const button=doc.getElementById(id);if(!button||button.__quadludD4PersonaBound===true)continue;
      button.addEventListener('click',()=>setTimeout(()=>decorateCoachNotice('queens'),0));button.__quadludD4PersonaBound=true;bound=true
    }
    return bound
  }
  function decorateCoachNotice(game){
    const doc=browserDocument(),target=doc?.querySelector?.('#hintNotice .hint-notice-text');if(!target)return false;
    const profile=personaProfile(game),selector=':scope > .pedagogy-persona-coach',existing=target.querySelector?.(selector);
    if(existing?.dataset?.persona!==profile.id){existing?.remove?.();target.insertAdjacentHTML('afterbegin',personaMarkup('coach',game))}
    if(String(game||'')==='queens')bindQueensProofPersona();
    return true
  }
  function decorateTutorHeader(game){
    const doc=browserDocument(),target=doc?.querySelector?.('.walkthrough-head > div');if(!target)return false;
    const profile=personaProfile(game),selector=':scope > .pedagogy-persona-tutor',existing=target.querySelector?.(selector);
    if(existing?.dataset?.persona!==profile.id){existing?.remove?.();target.insertAdjacentHTML('afterbegin',personaMarkup('tutor',game))}
    return true
  }
  function showCoachNotice(html,game){showHintNotice(html);decorateCoachNotice(game)}

  function coachProjection(presentation,{reveal=''}={}){
    if(!ReasoningPresentation.isReasoningPresentation?.(presentation))throw new TypeError('QUADLUD Coach projection requires a canonical ReasoningPresentation');
    const view=ReasoningPresentation.definePedagogyView(presentation);
    const sections=PedagogyAdapters.coachSections(view,{reveal});
    return Object.freeze({view,sections})
  }
  function sectionMap(sections){return Object.freeze(Object.fromEntries((sections||[]).map(section=>[section.id,section])))}
  function coachMessage(presentation,{reveal='',rank=null,value=null,reasoning=null}={}){
    const projection=coachProjection(presentation,{reveal}),by=sectionMap(projection.sections);
    return Object.freeze({
      look:by.where?.text||'',
      rule:by.rule?.text||'',
      why:by.why?.text||'',
      move:by.action?.text||'',
      reveal:by.action?.reveal||'',
      rank:rank==null?Number(presentation?.rank)||0:Number(rank)||0,
      value,
      reasoning,
      pedagogyView:projection.view,
      coachSections:projection.sections
    })
  }
  function stage2Html(message,{ruleLabel='Rule',whyLabel='Why'}={}){
    const by=sectionMap(message?.coachSections);
    if(!by.rule&&!by.why)return '';
    const rule=by.rule?.text||'',why=by.why?.text||'';
    return `${rule?`<b>${ruleLabel} :</b> ${rule}`:''}${rule&&why?'<br>':''}${why?`<b>${whyLabel} :</b> ${why}`:''}`
  }
  function tutorProjection(presentation,{navigation=null,where=null,rule=null,why=null,action=null}={}){
    if(!ReasoningPresentation.isReasoningPresentation?.(presentation))throw new TypeError('QUADLUD Tutor projection requires a canonical ReasoningPresentation');
    if(navigation!=null&&!ReasoningPresentation.isPedagogyNavigation?.(navigation))throw new TypeError('QUADLUD Tutor projection requires canonical PedagogyNavigation');
    const view=ReasoningPresentation.definePedagogyView(presentation,{navigation});
    const overrides={};
    if(typeof where==='string')overrides.where=where;
    if(typeof rule==='string')overrides.rule=rule;
    if(typeof why==='string')overrides.why=why;
    if(typeof action==='string')overrides.action=action;
    const sections=PedagogyAdapters.coachSections(view,overrides);
    return Object.freeze({view,sections})
  }
  function installTutorBridge(){
    if(typeof walkthroughExplanationHtml!=='function')return false;
    if(walkthroughExplanationHtml.__quadludD3Bridge===true)return true;
    const previousWalkthroughExplanationHtml=walkthroughExplanationHtml;
    const bridgedWalkthroughExplanationHtml=function(index){
      const s=walkthroughSession;
      if(!s||index===0)return previousWalkthroughExplanationHtml(index);
      const m=s.moves?.[index-1],presentation=m?.presentation;
      if(!ReasoningPresentation.isReasoningPresentation?.(presentation))return previousWalkthroughExplanationHtml(index);
      const navigation=s.navigation||s.pedagogyNavigationByMove?.[index-1]||null;
      if(navigation!=null&&!ReasoningPresentation.isPedagogyNavigation?.(navigation))return previousWalkthroughExplanationHtml(index);
      const showMove=!!presentation.metadata?.showTutorMove,
        where=m?.where||presentation.explanation?.where||'',
        rule=presentation.explanation?.title||tr('logic'),
        why=m?.why||presentation.explanation?.why||'',
        action=showMove?(m?.move||presentation.explanation?.move||''):'';
      const projection=tutorProjection(presentation,{navigation,where,rule,why,action}),by=sectionMap(projection.sections),move=showMove?(by.action?.text||''):'';
      return `<div class="walkthrough-explanation"><div class="walkthrough-tech"><b>${by.rule?.text||tr('logic')}</b><span>${presentation.metadata?.walkthroughBadge||`R${presentation.rank}`}</span></div><p><b>${tr('where')} :</b> ${by.where?.text||''}</p><p><b>${tr('walkthroughWhy')}</b><br>${by.why?.text||''}</p>${move?`<p class="walkthrough-move"><b>${tr('hintMove')} :</b> ${move}</p>`:''}</div>`
    };
    bridgedWalkthroughExplanationHtml.__quadludD3Bridge=true;
    walkthroughExplanationHtml=bridgedWalkthroughExplanationHtml;
    return true
  }
  function installTutorPersonaBridge(){
    if(typeof renderWalkthrough!=='function')return false;
    if(renderWalkthrough.__quadludD4PersonaBridge===true)return true;
    const previousRenderWalkthrough=renderWalkthrough;
    const bridgedRenderWalkthrough=function(...args){const result=previousRenderWalkthrough(...args);decorateTutorHeader(walkthroughSession?.base?.game||current?.game);return result};
    bridgedRenderWalkthrough.__quadludD4PersonaBridge=true;renderWalkthrough=bridgedRenderWalkthrough;return true
  }
  function installHintStagePersonaBridge(){
    if(typeof hintStage!=='function')return false;
    if(hintStage.__quadludD4PersonaBridge===true)return true;
    const previousHintStage=hintStage;
    const bridgedHintStage=function(kind,...args){const result=previousHintStage(kind,...args);decorateCoachNotice(kind);return result};
    bridgedHintStage.__quadludD4PersonaBridge=true;hintStage=bridgedHintStage;return true
  }
  function installSharedStageBridge(){
    if(typeof coachStageBlock!=='function')return false;
    if(coachStageBlock.__quadludD2Bridge===true)return true;
    const previousCoachStageBlock=coachStageBlock;
    coachStageBlock=function(stage,kind,target,message){
      if(stage===2&&Array.isArray(message?.coachSections))return stage2Html(message,{ruleLabel:tr('rulesTitle'),whyLabel:tr('hintWhy')});
      return previousCoachStageBlock(stage,kind,target,message)
    };
    coachStageBlock.__quadludD2Bridge=true;
    return true
  }
  function installQueensBridge(){
    if(typeof queenCoachHandleDeduction!=='function')return false;
    if(queenCoachHandleDeduction.__quadludD2Bridge===true)return true;
    const previousQueenCoachHandleDeduction=queenCoachHandleDeduction;
    const bridgedQueenCoachHandleDeduction=function(d){
      const presenter=queenReasoningPresenter(),presentation=presenter.presentation(d),sequence=presenter.coachSequence?.(d,presentation);
      // The existing LIGHTHOUSES Proof Narrative is intentionally richer than the
      // generic four-section projection. Keep that complete flow byte-for-byte in
      // charge of advanced deductions, including its independent proof navigation.
      if(Array.isArray(sequence)&&sequence.length>=4){const result=previousQueenCoachHandleDeduction(d);decorateCoachNotice('queens');return result}
      const boardKey=historySnapshotKey(),sig=d.id+'|'+d.rank,flow=current.hintFlow,isSame=flow?.kind==='queens-proof'&&flow.boardKey===boardKey&&flow.signature===sig,projection=coachProjection(presentation),by=sectionMap(projection.sections);
      if(!isSame||flow?.flowVersion>=4){
        current.hintFlow={kind:'queens-proof',boardKey,signature:sig,stage:1,flowVersion:3,deduction:JSON.parse(JSON.stringify(d)),pedagogyView:projection.view,coachSections:projection.sections};
        coachUsage(1,presentation.technique);queenFocusDeduction(d,false);showCoachNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${by.where?.text||''}`,'queens');saveCurrent();return
      }
      const proof=flow.deduction||d,before=historySnapshotKey();
      coachUsage(2,presentation.technique);coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();queenFocusDeduction(proof,true);
      const application=queenApplyDeductionToCurrent(proof);
      if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}
      drawGameUi();
      const appliedPresentation=presenter.presentation(application.deduction,application.automatic),appliedProjection=coachProjection(appliedPresentation),appliedBy=sectionMap(appliedProjection.sections);
      historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:3},before);
      current.hintFlow=null;
      const ruleWhy=stage2Html({coachSections:appliedProjection.sections},{ruleLabel:tr('rulesTitle'),whyLabel:tr('hintWhy')}),action=appliedBy.action?.text||'';
      showCoachNotice(`<span class="coach-progress">2/2</span>${ruleWhy}${ruleWhy&&action?'<br>':''}${action?`<b>${tr('hintMove')} :</b> ${action}`:''}`,'queens');
      maybeAutoFinish();saveCurrent();haptic(12)
    };
    bridgedQueenCoachHandleDeduction.__quadludD2Bridge=true;
    queenCoachHandleDeduction=bridgedQueenCoachHandleDeduction;
    return true
  }
  function installSudokuBridge(){
    if(typeof hintS!=='function')return false;
    if(hintS.__quadludD2Bridge===true)return true;
    const bridgedHintS=function(){
      if(current?.training)return trainingCoach();
      if(paused)return;
      if(showVisibleErrorsBeforeHint())return;
      if(showExplorationContradictionBeforeHint())return;
      try{
        const result=sudokuCurrentValueStep();
        if(result.contradiction)return sudokuShowLogicalContradiction(result.contradiction);
        const presenter=sudokuReasoningPresenter(),presentation=presenter.presentValueStep(result,current.state);
        if(!presentation)return showHintNotice(`<b>${tr('noLogicalHint')}</b><br>${tr('slgNoDeduction')}`);
        const target=presentation.action.target,[r,c]=[target.row,target.column],reasoning=presenter.legacyValueStepReasoning(result);
        const message=coachMessage(presentation,{reveal:tr('digitRevealed'),rank:presentation.metadata.coachRank,value:presentation.action.value,reasoning});
        hintStage('sudoku',[r,c],message,()=>{current.state[r][c]=presentation.action.value;current.sel=[r,c];drawGameUi();maybeAutoFinish()})
      }catch(err){console.error('Grille 6 proof engine failed',err);showHintNotice(`<b>${tr('hintError')}</b>`)}
    };
    bridgedHintS.__quadludD2Bridge=true;
    hintS=bridgedHintS;
    return true
  }
  function installTangoBridge(){
    if(typeof tangoCoachHandleDeduction!=='function')return false;
    if(tangoCoachHandleDeduction.__quadludD2Bridge===true)return true;
    const bridgedTangoCoachHandleDeduction=function(d){
      const presenter=tangoReasoningPresenter(),boardKey=historySnapshotKey(),sig=d.signature||d.id,flow=current.hintFlow,isSame=flow?.kind==='tango-proof'&&flow.boardKey===boardKey&&flow.signature===sig,presentation=presenter.presentation(d),projection=coachProjection(presentation),by=sectionMap(projection.sections);
      if(!isSame){
        current.hintFlow={kind:'tango-proof',boardKey,signature:sig,stage:1,deduction:JSON.parse(JSON.stringify(d)),pedagogyView:projection.view,coachSections:projection.sections};
        coachUsage(1,presentation.technique);tangoFocusDeduction(d,false);showCoachNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${by.where?.text||''}`,'tango');saveCurrent();return
      }
      const proof=flow.deduction||d,before=historySnapshotKey();
      coachUsage(2,presentation.technique);coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();tangoFocusDeduction(proof,true);
      const application=tangoApplyDeductionToCurrent(proof);
      if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}
      drawGameUi();
      const appliedPresentation=presenter.presentation(application.deduction,application.automatic),appliedProjection=coachProjection(appliedPresentation),appliedBy=sectionMap(appliedProjection.sections);
      historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:3},before);
      current.hintFlow=null;
      const ruleWhy=stage2Html({coachSections:appliedProjection.sections},{ruleLabel:tr('rulesTitle'),whyLabel:tr('hintWhy')}),action=appliedBy.action?.text||'';
      showCoachNotice(`<span class="coach-progress">2/2</span>${ruleWhy}${ruleWhy&&action?'<br>':''}${action?`<b>${tr('hintMove')} :</b> ${action}`:''}`,'tango');
      maybeAutoFinish();saveCurrent();haptic(12)
    };
    bridgedTangoCoachHandleDeduction.__quadludD2Bridge=true;
    tangoCoachHandleDeduction=bridgedTangoCoachHandleDeduction;
    return true
  }
  function installPatchesBridge(){
    if(typeof patchCoachHandleDeduction!=='function')return false;
    if(patchCoachHandleDeduction.__quadludD2Bridge===true)return true;
    const bridgedPatchCoachHandleDeduction=function(d){
      const presenter=patchesReasoningPresenter(),boardKey=historySnapshotKey(),sig=d.signature||d.id,flow=current.hintFlow,isSame=flow?.kind==='patches-proof'&&flow.boardKey===boardKey&&flow.signature===sig,presentation=presenter.presentation(d),projection=coachProjection(presentation),by=sectionMap(projection.sections);
      if(!isSame){
        current.hintFlow={kind:'patches-proof',boardKey,signature:sig,stage:1,deduction:JSON.parse(JSON.stringify(d)),pedagogyView:projection.view,coachSections:projection.sections};
        coachUsage(1,presentation.technique);patchFocusDeduction(d,false);showCoachNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${by.where?.text||''}`,'patches');saveCurrent();return
      }
      const proof=flow.deduction||d,before=historySnapshotKey();
      coachUsage(2,presentation.technique);coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();patchFocusDeduction(proof,true);
      const application=patchApplyDeductionToCurrent(proof);
      if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}
      drawGameUi();
      const appliedPresentation=presenter.presentation(application.deduction,application.automatic),appliedProjection=coachProjection(appliedPresentation),appliedBy=sectionMap(appliedProjection.sections);
      historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:4},before);
      current.hintFlow=null;
      const ruleWhy=stage2Html({coachSections:appliedProjection.sections},{ruleLabel:tr('rulesTitle'),whyLabel:tr('hintWhy')}),action=appliedBy.action?.text||'';
      showCoachNotice(`<span class="coach-progress">2/2</span>${ruleWhy}${ruleWhy&&action?'<br>':''}${action?`<b>${tr('hintMove')} :</b> ${action}`:''}`,'patches');
      maybeAutoFinish();saveCurrent();haptic(12)
    };
    bridgedPatchCoachHandleDeduction.__quadludD2Bridge=true;
    patchCoachHandleDeduction=bridgedPatchCoachHandleDeduction;
    return true
  }
  function projectNonogramCoachResult(result){
    if(!result||result.status!=='deduction'||!ReasoningPresentation.isReasoningPresentation?.(result.presentation))return result;
    const projection=coachProjection(result.presentation),by=sectionMap(projection.sections),source=Array.isArray(result.levels)?result.levels:[],ids=['where','rule','why','action'];
    const levels=source.map((level,index)=>{
      const section=by[ids[index]];if(!section)return level;
      const next={...level,text:section.text,pedagogyView:projection.view,coachSections:projection.sections};
      if(index===3)next.action=section.action;
      return Object.freeze(next)
    });
    return Object.freeze({...result,levels:Object.freeze(levels),pedagogyView:projection.view,coachSections:projection.sections})
  }
  function installNonogramBridge(){
    const original=root?.QuadludNonogramPedagogy;
    if(!original||typeof original.createAdapter!=='function')return false;
    if(original.__quadludD2Bridge===true)return true;
    const wrappedCreateAdapter=(...args)=>{
      const adapter=original.createAdapter(...args),coach=adapter?.coach;
      if(!coach||typeof coach.runHint!=='function')return adapter;
      const wrappedCoach=Object.freeze({...coach,runHint:(...coachArgs)=>{const result=projectNonogramCoachResult(coach.runHint(...coachArgs));if(result?.status==='deduction')setTimeout(()=>decorateCoachNotice('nonogram'),0);return result}});
      return Object.freeze({...adapter,coach:wrappedCoach})
    };
    const wrapped=Object.freeze({...original,createAdapter:wrappedCreateAdapter,__quadludD2Bridge:true});
    root.QuadludNonogramPedagogy=wrapped;
    return true
  }
  function installBrowserBridge(){
    const tutor=installTutorBridge(),tutorPersona=installTutorPersonaBridge(),hintPersona=installHintStagePersonaBridge(),shared=installSharedStageBridge(),queens=installQueensBridge(),sudoku=installSudokuBridge(),tango=installTangoBridge(),patches=installPatchesBridge(),nonogram=installNonogramBridge();
    return tutor||tutorPersona||hintPersona||shared||queens||sudoku||tango||patches||nonogram
  }
  return Object.freeze({VERSION,PERSONAS,personaProfile,personaMarkup,decorateCoachNotice,decorateTutorHeader,coachProjection,coachMessage,stage2Html,tutorProjection,installTutorBridge,installTutorPersonaBridge,installHintStagePersonaBridge,projectNonogramCoachResult,installBrowserBridge});
});
