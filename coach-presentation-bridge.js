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

  function proofChainSignature(chain,finalDeduction){return [...(chain||[]),finalDeduction].filter(Boolean).map(d=>d.signature||d.id||JSON.stringify(d.conclusions||[])).join('>')}
  function proofChainHtml(presenter,chain,finalPresentation=null){
    const parts=[];
    for(const d of chain||[]){
      let p;try{p=presenter.presentation(d)}catch(_){p=null}
      const title=p?.explanation?.title||p?.technique||d?.rule||tr('logic'),why=p?.explanation?.why||'';
      parts.push(`<span class="reason-step"><b>${parts.length+1}.</b> ${title}${why?` — ${why}`:''}</span>`)
    }
    if(finalPresentation&&parts.length){
      const title=finalPresentation.explanation?.title||finalPresentation.technique||tr('logic'),why=finalPresentation.explanation?.why||'';
      parts.push(`<span class="reason-step"><b>${parts.length+1}.</b> ${title}${why?` — ${why}`:''}</span>`)
    }
    return parts.join('')
  }
  function planReasoning(presenter,plan,application){
    const reasoning=presenter.legacyReasoning(application.deduction,application.automatic);
    return {...reasoning,proofChain:(plan?.proofChain||[]).map(d=>{try{return presenter.legacyReasoning(d,[])}catch(_){return {rule:d?.rule||null,rank:d?.rank??null}}})}
  }
  function tangoCoachPlan(){
    let engine;try{engine=tangoLogicSession()}catch(error){return {status:'error',error}}
    const proofChain=[],guardMax=Math.max(24,Number(current?.n||6)*Number(current?.n||6)*2);
    for(let guard=0;guard<guardMax;guard++){
      const result=engine.nextDeduction();
      if(result?.contradiction)return {status:'contradiction',contradiction:result.contradiction};
      const d=result?.deduction;if(!d)return {status:'stuck',proofChain};
      const values=(d.conclusions||[]).filter(c=>c.type==='VALUE'&&Array.isArray(c.cell)&&current?.state?.[c.cell[0]]?.[c.cell[1]]===-1);
      if(values.length===1)return {status:'action',deduction:JSON.parse(JSON.stringify(d)),proofChain:JSON.parse(JSON.stringify(proofChain)),action:{kind:'value',cell:values[0].cell.slice(),value:values[0].value},signature:proofChainSignature(proofChain,d)};
      if(values.length>1)return {status:'error',reason:'multiple-visible-actions'};
      const applied=engine.applyDeduction(d,{close:false});
      if(!applied?.deduction)return {status:'error',reason:'unapplied-proof-deduction'};
      proofChain.push(JSON.parse(JSON.stringify(applied.deduction)));
      for(const automatic of applied.automatic||[]){
        if((automatic.conclusions||[]).some(c=>c.type==='VALUE'))return {status:'error',reason:'automatic-visible-action-before-plan'};
        proofChain.push(JSON.parse(JSON.stringify(automatic)))
      }
    }
    return {status:'error',reason:'proof-chain-without-action'}
  }
  function tangoApplyCoachPlan(plan){
    if(!plan||plan.status!=='action')return null;
    let engine;try{engine=tangoLogicSession()}catch(_){return null}
    for(const d of plan.proofChain||[]){let a=engine.applyDeduction(d,{close:false});if(!a?.deduction)return null;if((a.automatic||[]).some(x=>(x.conclusions||[]).some(c=>c.type==='VALUE')))return null}
    const before=cloneGrid(current.state),application=engine.applyDeduction(plan.deduction,{close:false});if(!application?.deduction)return null;
    let changed=0;for(let r=0;r<before.length;r++)for(let c=0;c<before[r].length;c++)if(before[r][c]!==engine.state[r][c])changed++;
    if(changed!==1)return null;
    current.state=cloneGrid(engine.state);current.tangoDerivedRelations=engine.exportDerivedRelations();
    return application
  }
  function patchDeductionAction(d){
    if(!d)return null;
    const selected=(d.conclusions||[]).find(c=>c.type==='SELECTED_RECT'&&c.rectangle),owner=(d.conclusions||[]).find(c=>c.type==='OWNER'&&Array.isArray(c.cell)&&current?.paint?.[c.cell[0]]?.[c.cell[1]]!==c.clue);
    if(selected)return {kind:'rectangle',clue:Number(selected.clue),rectangle:JSON.parse(JSON.stringify(selected.rectangle))};
    if(owner)return {kind:'owner',clue:Number(owner.clue),cell:owner.cell.slice()};
    return null
  }
  function patchCoachPlan(){
    let engine;try{engine=patchesLogicSession()}catch(error){return {status:'error',error}}
    if(typeof engine._applyDeduction!=='function')return {status:'error',reason:'missing-bounded-apply'};
    const proofChain=[],guardMax=Math.max(20,(current?.ids?.length||1)*24);
    for(let guard=0;guard<guardMax;guard++){
      const result=engine.nextDeduction();
      if(result?.contradiction)return {status:'contradiction',contradiction:result.contradiction};
      const d=result?.deduction;if(!d)return {status:'stuck',proofChain};
      const action=patchDeductionAction(d);
      if(action)return {status:'action',deduction:JSON.parse(JSON.stringify(d)),proofChain:JSON.parse(JSON.stringify(proofChain)),action,signature:proofChainSignature(proofChain,d)};
      const applied=engine._applyDeduction(d,false);if(!applied?.deduction)return {status:'error',reason:'unapplied-proof-deduction'};
      proofChain.push(JSON.parse(JSON.stringify(applied.deduction)));
      for(const automatic of applied.automatic||[]){
        const automaticAction=patchDeductionAction(automatic);
        if(automaticAction)return {status:'action',deduction:JSON.parse(JSON.stringify(automatic)),proofChain:JSON.parse(JSON.stringify(proofChain)),action:automaticAction,signature:proofChainSignature(proofChain,automatic)};
        proofChain.push(JSON.parse(JSON.stringify(automatic)))
      }
    }
    return {status:'error',reason:'proof-chain-without-action'}
  }
  function patchApplyCoachPlan(plan){
    if(!plan||plan.status!=='action')return null;
    let engine;try{engine=patchesLogicSession()}catch(_){return null}
    if(typeof engine._applyDeduction!=='function')return null;
    for(const d of plan.proofChain||[]){let a=engine._applyDeduction(d,false);if(!a?.deduction)return null}
    const application=engine._applyDeduction(plan.deduction,false);if(!application?.deduction)return null;
    const beforePaint=JSON.stringify(current.paint),beforeSelected=JSON.stringify(current.patchSelectedRects||{});
    patchSyncEngineToVisible(current,engine);
    if(plan.action.kind==='owner'){
      const [r,c]=plan.action.cell;if(current.paint?.[r]?.[c]!==plan.action.clue)return null
    }else if(plan.action.kind==='rectangle'){
      const got=current.patchSelectedRects?.[plan.action.clue],want=plan.action.rectangle;
      if(!got||got.r0!==want.r0||got.r1!==want.r1||got.c0!==want.c0||got.c1!==want.c1)return null
    }
    if(beforePaint===JSON.stringify(current.paint)&&beforeSelected===JSON.stringify(current.patchSelectedRects||{}))return null;
    return application
  }
  function showPlanFailure(game,plan,presenter){
    current.hintFlow=null;clearHintFocus();
    if(plan?.status==='contradiction')return showCoachNotice(`<b>⚠ ${tr('contradictionFound')}</b><br>${presenter?.contradictionText?.(plan.contradiction)||tr('errorDetected')}`,game);
    if(plan?.status==='stuck')return showCoachNotice(`<b>${tr('noLogicalHint')}</b>`,game);
    console.error(`${game} Coach next-action planning failed`,plan?.reason||plan?.error||plan);return showCoachNotice(`<b>${tr('hintError')}</b>`,game)
  }

  function installTangoBridge(){
    if(typeof tangoCoachHandleDeduction!=='function')return false;
    if(tangoCoachHandleDeduction.__quadludD2Bridge===true)return true;
    const bridgedTangoCoachHandleDeduction=function(_rawDeduction){
      const presenter=tangoReasoningPresenter(),plan=tangoCoachPlan();if(plan.status!=='action')return showPlanFailure('tango',plan,presenter);
      const d=plan.deduction,boardKey=historySnapshotKey(),sig=plan.signature,flow=current.hintFlow,isSame=flow?.kind==='tango-proof'&&flow.boardKey===boardKey&&flow.signature===sig,presentation=presenter.presentation(d),projection=coachProjection(presentation),by=sectionMap(projection.sections);
      if(!isSame){
        current.hintFlow={kind:'tango-proof',boardKey,signature:sig,stage:1,flowVersion:4,deduction:JSON.parse(JSON.stringify(d)),proofChain:JSON.parse(JSON.stringify(plan.proofChain||[])),action:JSON.parse(JSON.stringify(plan.action)),pedagogyView:projection.view,coachSections:projection.sections};
        coachUsage(1,presentation.technique);tangoFocusDeduction(d,false);showCoachNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${by.where?.text||''}`,'tango');saveCurrent();return
      }
      const activePlan={status:'action',deduction:flow.deduction||d,proofChain:flow.proofChain||[],action:flow.action,signature:flow.signature},before=historySnapshotKey();
      coachUsage(2,presentation.technique);coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();tangoFocusDeduction(activePlan.deduction,true);
      const application=tangoApplyCoachPlan(activePlan);
      if(!application){current.hintFlow=null;showCoachNotice(`<b>${tr('hintError')}</b>`,'tango');return}
      drawGameUi();
      const appliedPresentation=presenter.presentation(application.deduction,application.automatic),appliedProjection=coachProjection(appliedPresentation),appliedBy=sectionMap(appliedProjection.sections),chain=proofChainHtml(presenter,activePlan.proofChain,appliedPresentation);
      historyRecord({type:'COACH_APPLY',reasoning:planReasoning(presenter,activePlan,application),coachStage:2,coachFlowVersion:4},before);
      current.hintFlow=null;
      const rule=appliedBy.rule?.text||appliedPresentation.explanation?.title||'',why=chain||appliedBy.why?.text||appliedPresentation.explanation?.why||'',action=appliedBy.action?.text||appliedPresentation.explanation?.move||'';
      showCoachNotice(`<span class="coach-progress">2/2</span>${rule?`<b>${tr('rulesTitle')} :</b> ${rule}`:''}${rule&&why?'<br>':''}${why?`<b>${tr('hintWhy')} :</b> ${why}`:''}${(rule||why)&&action?'<br>':''}${action?`<b>${tr('hintMove')} :</b> ${action}`:''}`,'tango');
      maybeAutoFinish();saveCurrent();haptic(12)
    };
    bridgedTangoCoachHandleDeduction.__quadludD2Bridge=true;
    tangoCoachHandleDeduction=bridgedTangoCoachHandleDeduction;
    return true
  }
  function installPatchesBridge(){
    if(typeof patchCoachHandleDeduction!=='function')return false;
    if(patchCoachHandleDeduction.__quadludD2Bridge===true)return true;
    const bridgedPatchCoachHandleDeduction=function(_rawDeduction){
      const presenter=patchesReasoningPresenter(),plan=patchCoachPlan();if(plan.status!=='action')return showPlanFailure('patches',plan,presenter);
      const d=plan.deduction,boardKey=historySnapshotKey(),sig=plan.signature,flow=current.hintFlow,isSame=flow?.kind==='patches-proof'&&flow.boardKey===boardKey&&flow.signature===sig,presentation=presenter.presentation(d),projection=coachProjection(presentation),by=sectionMap(projection.sections);
      if(!isSame){
        current.hintFlow={kind:'patches-proof',boardKey,signature:sig,stage:1,flowVersion:6,deduction:JSON.parse(JSON.stringify(d)),proofChain:JSON.parse(JSON.stringify(plan.proofChain||[])),action:JSON.parse(JSON.stringify(plan.action)),pedagogyView:projection.view,coachSections:projection.sections};
        coachUsage(1,presentation.technique);patchFocusDeduction(d,false);showCoachNotice(`<span class="coach-progress">1/4</span><b>${tr('where')} :</b> ${by.where?.text||''}`,'patches');saveCurrent();return
      }
      if(flow.stage===1){
        flow.stage=2;
        let usage=current.coachUsage||(current.coachUsage={where:0,rule:0,why:0,reveal:0,maxStage:0,techniques:{},flowVersion:2});usage.rule=(usage.rule||0)+1;usage.maxStage=Math.max(usage.maxStage||0,2);
        if(presentation.technique){let techniques=usage.techniques||(usage.techniques={}),t=techniques[presentation.technique]||(techniques[presentation.technique]={where:0,rule:0,why:0,reveal:0});t.rule=(t.rule||0)+1}
        showCoachNotice(`<span class="coach-progress">2/4</span><b>${tr('rulesTitle')} :</b> ${by.rule?.text||presentation.explanation?.title||''}`,'patches');saveCurrent();return
      }
      if(flow.stage===2){
        flow.stage=3;coachUsage(2,presentation.technique);
        const chain=proofChainHtml(presenter,flow.proofChain||[],presentation),why=chain||by.why?.text||presentation.explanation?.why||'';
        showCoachNotice(`<span class="coach-progress">3/4</span><b>${tr('hintWhy')} :</b> ${why}`,'patches');saveCurrent();return
      }
      const activePlan={status:'action',deduction:flow.deduction||d,proofChain:flow.proofChain||[],action:flow.action,signature:flow.signature},before=historySnapshotKey();
      coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();patchFocusDeduction(activePlan.deduction,true);
      const application=patchApplyCoachPlan(activePlan);
      if(!application){current.hintFlow=null;showCoachNotice(`<b>${tr('hintError')}</b>`,'patches');return}
      drawGameUi();
      const appliedPresentation=presenter.presentation(application.deduction,application.automatic),appliedProjection=coachProjection(appliedPresentation),appliedBy=sectionMap(appliedProjection.sections);
      historyRecord({type:'COACH_APPLY',reasoning:planReasoning(presenter,activePlan,application),coachStage:4,coachFlowVersion:6},before);
      current.hintFlow=null;
      const action=appliedBy.action?.text||appliedPresentation.explanation?.move||presentation.explanation?.move||'';
      showCoachNotice(`<span class="coach-progress">4/4</span><b>${tr('actions')} :</b>${action?` ${action}`:''}`,'patches');
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
  function nonogramCoachFocus(result,stage){
    try{const ui=gameWebUi('nonogram'),level=result?.levels?.[Math.max(0,Math.min(3,stage-1))];return ui?.focusEntities?.(level?.focus||result?.presentation?.focus||[])||[]}catch(_){return []}
  }
  function nonogramReasoning(result){
    const p=result?.presentation,d=result?.deduction,first=d?.conclusions?.[0],m=/^r(\d+)c(\d+)$/.exec(String(first?.cell?.id||''));
    return {schema:2,source:'nonogram-logic-engine',game:'nonogram',technique:p?.technique||d?.techniqueId||null,rank:Number(p?.rank)||0,target:m?{row:Number(m[1]),column:Number(m[2])}:null,action:{type:'APPLY_LOGICAL_MOVE',move:p?.action?.move||d?.move||null},proof:{direct:p?.explanation?.why||null}}
  }
  function installNonogramBridge(){
    const original=root?.QuadludNonogramPedagogy;
    if(!original||typeof original.createAdapter!=='function')return false;
    if(original.__quadludD2Bridge===true)return true;
    const wrappedCreateAdapter=(...args)=>{
      const adapter=original.createAdapter(...args),coach=adapter?.coach;
      if(!coach||typeof coach.runHint!=='function')return adapter;
      const wrappedCoach=Object.freeze({...coach,runHint:(...coachArgs)=>{
        const result=projectNonogramCoachResult(coach.runHint(...coachArgs));
        if(result?.status!=='deduction'){
          current.hintFlow=null;
          if(result?.status==='contradictory')showCoachNotice(`<b>${coach.presenter?.contradictionText?.(result.contradiction)||tr('errorDetected')}</b>`,'nonogram');
          else if(result?.status==='stuck')showCoachNotice(`<b>${tr('noLogicalHint')}</b>`,'nonogram');
          else if(result?.status==='solved')showCoachNotice(`<b>${tr('congrats')}</b>`,'nonogram');
          return result
        }
        const presentation=result.presentation,projection={view:result.pedagogyView,sections:result.coachSections},by=sectionMap(projection.sections),sig=result.deductionSignature||presentation?.metadata?.deductionSignature||'',flow=current.hintFlow,isSame=flow?.kind==='nonogram-proof'&&flow.signature===sig;
        if(!isSame){
          current.hintFlow={kind:'nonogram-proof',signature:sig,stage:1,flowVersion:1,pedagogyView:projection.view,coachSections:projection.sections};
          coachUsage(1,presentation.technique);nonogramCoachFocus(result,1);
          showCoachNotice(`<span class="coach-progress">1/4</span><b>${tr('where')} :</b> ${by.where?.text||presentation.explanation?.where||''}`,'nonogram');saveCurrent();return result
        }
        if(flow.stage===1){
          flow.stage=2;
          let usage=current.coachUsage||(current.coachUsage={where:0,rule:0,why:0,reveal:0,maxStage:0,techniques:{},flowVersion:2});usage.rule=(usage.rule||0)+1;usage.maxStage=Math.max(usage.maxStage||0,2);
          if(presentation.technique){let techniques=usage.techniques||(usage.techniques={}),t=techniques[presentation.technique]||(techniques[presentation.technique]={where:0,rule:0,why:0,reveal:0});t.rule=(t.rule||0)+1}
          nonogramCoachFocus(result,2);showCoachNotice(`<span class="coach-progress">2/4</span><b>${tr('rulesTitle')} :</b> ${by.rule?.text||presentation.explanation?.technique||presentation.technique||''}`,'nonogram');saveCurrent();return result
        }
        if(flow.stage===2){
          flow.stage=3;coachUsage(2,presentation.technique);nonogramCoachFocus(result,3);
          showCoachNotice(`<span class="coach-progress">3/4</span><b>${tr('hintWhy')} :</b> ${by.why?.text||presentation.explanation?.why||''}`,'nonogram');saveCurrent();return result
        }
        const move=presentation?.action?.move||result.deduction?.move,before=historySnapshotKey();
        coachUsage(3,presentation.technique);markHintUsed();updateScoreFlags();nonogramCoachFocus(result,4);
        let applied=false;try{applied=adapter.learning?.applyMove?.({move})!==false}catch(err){console.error('Mosaïque Coach apply failed',err)}
        if(!applied){current.hintFlow=null;showCoachNotice(`<b>${tr('hintError')}</b>`,'nonogram');return result}
        historyRecord({type:'COACH_APPLY',reasoning:nonogramReasoning(result),coachStage:4,coachFlowVersion:1},before);
        current.hintFlow=null;
        const action=by.action?.text||presentation.explanation?.move||'';
        showCoachNotice(`<span class="coach-progress">4/4</span><b>${tr('actions')} :</b>${action?` ${action}`:''}`,'nonogram');
        maybeAutoFinish();saveCurrent();haptic(12);return result
      }});
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
