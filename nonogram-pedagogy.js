/*
 * QUADLUD — Mosaïque / Nonogram pedagogy — Coach + Tutor/Walkthrough
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const reasoningView=(typeof module==='object'&&module.exports)?require('./reasoning-view.js'):root?.QuadludReasoningView;
  const logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):root?.NonogramLogic;
  const presenterModule=(typeof module==='object'&&module.exports)?require('./nonogram-reasoning-presentation.js'):root?.QuadludNonogramReasoningPresenter;
  const logicalMove=(typeof module==='object'&&module.exports)?require('./logical-move.js'):root?.QuadludLogicalMove;
  const sessionCore=(typeof module==='object'&&module.exports)?require('./session-core.js'):root?.QuadludSessionCore;
  const sessionAdapters=(typeof module==='object'&&module.exports)?require('./game-session-adapters.js'):root?.QuadludGameSessionAdapters;
  const pedagogyMetadata=(typeof module==='object'&&module.exports)?require('./pedagogy-metadata.js'):root?.QuadludPedagogyMetadata;
  const api=factory(reasoningView,logic,presenterModule,logicalMove,sessionCore,sessionAdapters,pedagogyMetadata);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludNonogramPedagogy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(ReasoningView,Logic,PresenterModule,LogicalMove,SessionCore,SessionAdapters,PedagogyMetadata){
'use strict';
if(!ReasoningView||typeof ReasoningView.defineReasoningView!=='function')throw new Error('NonogramPedagogy requires QuadludReasoningView');
if(!Logic||typeof Logic.nextDeduction!=='function')throw new Error('NonogramPedagogy requires NonogramLogic');
if(!PresenterModule||typeof PresenterModule.createPresenter!=='function')throw new Error('NonogramPedagogy requires Nonogram reasoning presenter');
if(!LogicalMove||typeof LogicalMove.createTransactionController!=='function')throw new Error('NonogramPedagogy requires QuadludLogicalMove');
if(!SessionCore||typeof SessionCore.createHistoryController!=='function')throw new Error('NonogramPedagogy requires QuadludSessionCore');
if(!SessionAdapters?.nonogram||typeof SessionAdapters.nonogram.reasoningView!=='function')throw new Error('NonogramPedagogy requires Nonogram session adapter');
if(!PedagogyMetadata||typeof PedagogyMetadata.catalogTechnique!=='function')throw new Error('NonogramPedagogy requires PedagogyMetadata');

const VERSION=4,GAME='nonogram',COACH_LEVELS=Object.freeze(['where','technique','why','move']),TUTOR_SCHEMA=1,AUDIT_SCHEMA=1,EXPLORATION_SCHEMA=1,CURRICULUM_SCHEMA=1;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}

const CURRICULUM=freezeDeep({"N_EMPTY_LINE":{"rank":0,"definition":"A line with no blocks makes every cell empty.","source":"easy-horizontal-bands","difficulty":"easy","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[5],[],[5],[],[5]],"colClues":[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]]},"state":[[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]},"N_EXACT_FIT":{"rank":0,"definition":"When blocks plus mandatory separators exactly fill a line, every cell is determined.","source":"easy-horizontal-bands","difficulty":"easy","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[5],[],[5],[],[5]],"colClues":[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]]},"state":[[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]},"N_OVERLAP":{"rank":1,"definition":"Cells shared by every compatible placement of a block must be filled.","source":"medium-overlap","difficulty":"medium","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[5],[3,1],[1,1,1],[1,1,1],[4]],"colClues":[[4],[2,1],[5],[1,1],[5]]},"state":[[1,1,1,1,1],[1,1,1,2,1],[1,2,1,2,1],[1,2,1,2,1],[0,0,0,0,0]]},"N_BLOCK_EXTENSION":{"rank":2,"definition":"Visible filled cells restrict a block so that it must extend into additional cells.","source":"hard-block-propagation","difficulty":"hard","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[1,1],[2,1],[1,1],[2],[3]],"colClues":[[4],[1,2],[1,1],[],[3]]},"state":[[0,0,0,0,0],[1,1,2,0,0],[1,2,0,0,0],[1,0,0,0,0],[0,0,1,0,0]]},"N_BLOCK_BOUNDARY":{"rank":2,"definition":"A completed visible block fixes neighboring cells as empty.","source":"hard-block-propagation","difficulty":"hard","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[1,1],[2,1],[1,1],[2],[3]],"colClues":[[4],[1,2],[1,1],[],[3]]},"state":[[0,0,0,0,0],[1,1,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[0,0,1,0,0]]},"N_FORCED_EMPTY":{"rank":3,"definition":"Cells excluded by every remaining compatible placement must be empty.","source":"expert-forced-empty","difficulty":"expert","puzzle":{"game":"nonogram","rows":5,"cols":5,"rowClues":[[1,1],[4],[2,2],[2],[1,2]],"colClues":[[3],[4],[1,1],[3,1],[2]]},"state":[[0,0,0,0,0],[0,1,1,1,0],[1,1,2,1,1],[0,1,0,0,0],[0,0,0,1,0]]}});
const CURRICULUM_IDS=Object.freeze(Object.keys(CURRICULUM));
for(const id of CURRICULUM_IDS){const meta=PedagogyMetadata.catalogTechnique(id);if(!meta||meta.game!==GAME||meta.rank!==CURRICULUM[id].rank)throw new Error(`Nonogram curriculum metadata mismatch for ${id}`)}
function curriculumEntry(id){const value=CURRICULUM[String(id||'')];return value?clone({schema:CURRICULUM_SCHEMA,id:String(id),...value}):null}
function trainingFixture(id){const entry=curriculumEntry(id);if(!entry)return null;return {game:GAME,diff:entry.difficulty,puzzle:clone(entry.puzzle),state:clone(entry.state),generated:true,unique:true,completed:false,trainingFixture:true,trainingTechnique:entry.id}}
function hintFromReasoningView(source,expectedTechnique=null,presenter=PresenterModule.createPresenter()){
  const {puzzle,state}=normalizedView(source),result=Logic.nextDeduction(puzzle,state),d=result.deduction;if(!d||expectedTechnique&&d.techniqueId!==expectedTechnique)return null;
  const p=presenter.presentation(d),first=d.conclusions?.[0],rc=parseCellId(first?.cell?.id);if(!first||!rc)return null;
  return freezeDeep({r:rc[0],c:rc[1],v:first.state,technique:d.techniqueId,rank:p.rank,why:p.explanation?.why||'',move:clone(d.move),presentation:p,deduction:clone(d),allTargets:clone(d.conclusions||[])})
}
function freezeDeep(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))freezeDeep(x);return v}
function normalizedView(source){const input=source?.schema===ReasoningView.SCHEMA?{game:source.game,publicPuzzle:source.publicPuzzle,visibleState:source.visibleState,metadata:source.metadata}:source;const view=ReasoningView.defineReasoningView(input);if(view.game!==GAME)throw new TypeError(`Nonogram Coach requires game "${GAME}"`);const puzzle=Logic.validatePuzzle(view.publicPuzzle),state=Logic.validateState(puzzle,view.visibleState?.state);return {view,puzzle,state}}
function targetFocus(presentation){return (presentation?.focus||[]).filter(x=>x.role==='target')}
function contextFocus(presentation){return (presentation?.focus||[]).filter(x=>x.role!=='target')}
function levelFromPresentation(presentation,level){
  const n=Number(level);if(!Number.isInteger(n)||n<1||n>4)throw new RangeError('Nonogram Coach level must be 1..4');const id=COACH_LEVELS[n-1],e=presentation.explanation||{};
  if(n===1)return freezeDeep({level:n,id,text:e.where||'',focus:clone(contextFocus(presentation))});
  if(n===2)return freezeDeep({level:n,id,text:e.technique||String(presentation.technique||''),technique:presentation.technique,focus:clone(contextFocus(presentation))});
  if(n===3)return freezeDeep({level:n,id,text:e.why||'',technique:presentation.technique,focus:clone(presentation.focus||[])});
  return freezeDeep({level:n,id,text:e.move||'',technique:presentation.technique,focus:clone(targetFocus(presentation)),action:clone(presentation.action)})
}
function createCoach(options={}){
  const presenter=options.presenter||PresenterModule.createPresenter(options.presenterOptions||{});
  function next(source){
    const {view,puzzle,state}=normalizedView(source),contradiction=Logic.findContradiction(puzzle,state);
    if(contradiction)return freezeDeep({status:'contradictory',view,contradiction:clone(contradiction),presentation:null,levels:[]});
    if(Logic.isSolved(puzzle,state))return freezeDeep({status:'solved',view,contradiction:null,presentation:null,levels:[]});
    const result=Logic.nextDeduction(puzzle,state);if(!result.deduction)return freezeDeep({status:'stuck',view,contradiction:null,presentation:null,levels:[]});
    const presentation=presenter.presentation(result.deduction),levels=COACH_LEVELS.map((_,i)=>levelFromPresentation(presentation,i+1));
    return freezeDeep({status:'deduction',view,deduction:clone(result.deduction),presentation,levels,deductionSignature:presentation.metadata.deductionSignature})
  }
  function level(source,n){const result=next(source);return result.status==='deduction'?result.levels[Number(n)-1]||levelFromPresentation(result.presentation,n):null}
  return Object.freeze({next,level,levelIds:COACH_LEVELS,presenter})
}
function sourceReasoningView(source,stateOverride=null){
  if(source?.schema===ReasoningView.SCHEMA&&!stateOverride)return normalizedView(source).view;
  if(!source||source.game!==GAME||!source.puzzle)throw new TypeError('Nonogram Tutor requires a Nonogram session or ReasoningView');
  const state=stateOverride||source.state;
  return ReasoningView.defineReasoningView({game:GAME,publicPuzzle:Logic.validatePuzzle(source.puzzle),visibleState:{game:GAME,state:Logic.validateState(source.puzzle,state)},metadata:{visibleOnly:true,tutor:true}})
}
function visibleSessionClone(source,{fromRoot=true,stateOverride=null}={}){
  let view;
  if(source?.schema===ReasoningView.SCHEMA&&!stateOverride)view=sourceReasoningView(source);
  else{
    let rootState=stateOverride;
    if(!rootState&&fromRoot){const snap=source?.moveHistory?.nodes?.h0?.snapshot;if(snap?.game===GAME&&Array.isArray(snap.state))rootState=snap.state}
    view=sourceReasoningView(source,rootState||source.state)
  }
  const p=Logic.validatePuzzle(view.publicPuzzle),state=Logic.validateState(p,view.visibleState.state);
  return {
    game:GAME,diff:source?.diff||'easy',n:p.rows,puzzle:clone(p),state:clone(state),completed:false,
    seed:source?.seed??null,fingerprint:source?.fingerprint??null,difficultyProfile:clone(source?.difficultyProfile||null)
  }
}
function createTutor(options={}){
  const coach=options.coach||createCoach(options.coachOptions||{}),lifecycle=options.lifecycle||SessionAdapters.nonogram;
  const resolveLifecycle=game=>{if(game!==GAME)throw new Error(`Nonogram Tutor cannot resolve ${game}`);return lifecycle};
  const history=SessionCore.createHistoryController(resolveLifecycle),transactions=LogicalMove.createTransactionController({history,resolveLifecycle});
  const now=typeof options.now==='function'?options.now:Date.now;
  function initialize(walk){
    if(!walk||walk.work?.game!==GAME)throw new TypeError('Invalid Nonogram Tutor session');
    if(!Array.isArray(walk.moves))walk.moves=[];if(!Number.isInteger(walk.index))walk.index=0;
    walk.done=!!walk.done;walk.stalled=!!walk.stalled;history.ensureHistory(walk.work,!(walk.work.moveHistory?.schema===SessionCore.HISTORY_SCHEMA),now);if(!walk.initial)walk.initial=lifecycle.snapshot(walk.work);walk.tutorSchema=TUTOR_SCHEMA;walk.tutorVersion=VERSION;return walk
  }
  function start(source,startOptions={}){
    const work=visibleSessionClone(source,startOptions),walk={schema:TUTOR_SCHEMA,game:GAME,base:clone(work),work,initial:null,moves:[],index:0,done:false,stalled:false,logicContradiction:null};
    initialize(walk);return walk
  }
  function preview(walk){
    initialize(walk);if(walk.done)return freezeDeep({status:'solved',presentation:null});if(walk.stalled)return freezeDeep({status:'stalled',presentation:null,contradiction:clone(walk.logicContradiction)});
    return coach.next(lifecycle.reasoningView(walk.work))
  }
  function applyPreview(walk,previewResult){
    initialize(walk);if(!previewResult||previewResult.status!=='deduction'||!previewResult.presentation?.action?.move)return false;
    // Refuse stale previews: the same visible state must still produce the same engine deduction.
    const currentHint=coach.next(lifecycle.reasoningView(walk.work));
    if(currentHint.status!=='deduction'||currentHint.deductionSignature!==previewResult.deductionSignature)throw new Error('Nonogram Tutor preview is stale for the current visible state');
    const beforeNodes=Object.keys(walk.work.moveHistory.nodes).length,move=previewResult.presentation.action.move;
    const applied=transactions.apply(walk.work,move,{now});
    if(Object.keys(walk.work.moveHistory.nodes).length!==beforeNodes+1)throw new Error('Nonogram Tutor step must create exactly one history node');
    if(!history.historyValid(walk.work))throw new Error('Nonogram Tutor history became inconsistent');
    const p=previewResult.presentation,e=p.explanation||{},node=walk.work.moveHistory.nodes[walk.work.moveHistory.cursor];
    const step=freezeDeep({
      index:walk.moves.length+1,rule:p.rule,technique:p.technique,rank:p.rank,where:e.where||'',why:e.why||'',move:e.move||'',
      presentation:clone(p),deduction:clone(previewResult.deduction),logicalMove:clone(move),transaction:clone(applied.transaction),historyNode:node.id,snapshot:lifecycle.snapshot(walk.work),deductionSignature:previewResult.deductionSignature
    });
    walk.moves.push(step);walk.done=Logic.isSolved(walk.work.puzzle,walk.work.state);walk.stalled=false;walk.logicContradiction=null;return step
  }
  function next(walk){
    const hint=preview(walk);
    if(hint.status==='solved'){walk.done=true;return false}
    if(hint.status==='contradictory'){walk.stalled=true;walk.logicContradiction=clone(hint.contradiction);return false}
    if(hint.status!=='deduction'){walk.stalled=true;walk.logicContradiction=null;return false}
    return applyPreview(walk,hint)
  }
  function runToEnd(source,runOptions={}){
    const walk=start(source,runOptions),limit=Number.isInteger(runOptions.maxSteps)&&runOptions.maxSteps>0?runOptions.maxSteps:walk.work.puzzle.rows*walk.work.puzzle.cols*4;
    for(let i=0;i<limit&&!walk.done&&!walk.stalled;i++)next(walk);
    if(!walk.done&&!walk.stalled)throw new Error(`Nonogram Tutor exceeded ${limit} logical steps`);
    return walk
  }
  return Object.freeze({coach,history,transactions,start,initialize,preview,applyPreview,next,runToEnd,visibleSessionClone})
}

function parseCellId(id){const m=/^r(\d+)c(\d+)$/.exec(String(id||''));return m?[Number(m[1]),Number(m[2])]:null}
function allContradictions(puzzle,state){
  const p=Logic.validatePuzzle(puzzle),grid=Logic.validateState(p,state),out=[];
  for(let r=0;r<p.rows;r++){const a=Logic.analyzeGridLine(p,grid,'row',r);if(a.contradiction)out.push(a.contradiction)}
  for(let c=0;c<p.cols;c++){const a=Logic.analyzeGridLine(p,grid,'column',c);if(a.contradiction)out.push(a.contradiction)}
  return out
}
function targetFromChange(change){if(!change||!Number.isInteger(change.row)||!Number.isInteger(change.column))return null;return {row:change.row,column:change.column,id:Logic.cellId(change.row,change.column)}}
function actionPrimaryChange(action){
  const changes=Array.isArray(action?.changes)?action.changes:[];if(changes.length===1)return changes[0];
  const t=action?.target||action?.primaryTarget;if(t&&Number.isInteger(t.row)&&Number.isInteger(t.column))return {row:t.row,column:t.column,from:action.from,to:action.state??action.value};return null
}
function contradictionCells(w){const out=[];for(const p of w?.premises?.visible||[]){const rc=parseCellId(p.cell?.id);if(rc)out.push(rc)}return out}
function errorFromContradiction(w,presenter,target=null){
  const x=presenter.contradictionExplanation(w),cells=contradictionCells(w);if(target&&!cells.some(([r,c])=>r===target.row&&c===target.column))cells.unshift([target.row,target.column]);
  return freezeDeep({schema:AUDIT_SCHEMA,source:'visible-state',game:GAME,rule:'N_CONTRADICTION',technique:'N_CONTRADICTION',line:clone(w.line),clues:clone(w.clues||[]),cells,focus:clone(x?.focus||[]),explanation:clone(x),contradiction:clone(w)})
}
function auditResult(status,target,detail={}){return freezeDeep({schema:AUDIT_SCHEMA,status,source:'visible-state',game:GAME,technique:detail.technique??null,rank:detail.rank??null,target:target?[target.row,target.column]:null,logicalStatus:detail.logicalStatus||null,detail:clone(detail)})}
function deductionForTarget(puzzle,state,row,column){
  const out=[];for(const [axis,index] of [['row',row],['column',column]]){const a=Logic.analyzeGridLine(puzzle,state,axis,index);if(a.deduction){const c=(a.deduction.conclusions||[]).find(x=>x.cell?.id===Logic.cellId(row,column));if(c)out.push({deduction:a.deduction,conclusion:c})}}return out
}
function createAudit(options={}){
  const presenter=options.presenter||PresenterModule.createPresenter(),reasoningView=options.reasoningView,tr=typeof options.tr==='function'?options.tr:(k=>({ngFill:'fill',ngCross:'cross',ngErase:'erase'}[k]||k));if(typeof reasoningView!=='function')throw new TypeError('Nonogram Audit requires reasoningView');
  function current(){return normalizedView(reasoningView())}
  function visibleErrors(){const {puzzle,state}=current();return freezeDeep(allContradictions(puzzle,state).map(w=>errorFromContradiction(w,presenter)))}
  function errorFromAction(action){
    const change=actionPrimaryChange(action),target=targetFromChange(change),{puzzle,state}=current(),after=allContradictions(puzzle,state);if(!after.length)return null;
    if(change&&target&&[Logic.UNKNOWN,Logic.FILLED,Logic.EMPTY].includes(Number(change.from))){const prior=clone(state);prior[target.row][target.column]=Number(change.from);if(allContradictions(puzzle,prior).length)return null}
    let w=after[0];if(target){const hit=after.find(x=>(x.line.axis==='row'&&x.line.index===target.row)||(x.line.axis==='column'&&x.line.index===target.column));if(hit)w=hit}return errorFromContradiction(w,presenter,target)
  }
  function justifyMove({change}={}){
    const target=targetFromChange(change);if(!target)return auditResult('unknown',null,{logicalStatus:'not-applicable',reason:'no-primary-change'});const wanted=Number(change.to),{puzzle,state}=current();
    const priorContradiction=Logic.findContradiction(puzzle,state);if(priorContradiction)return auditResult('unknown',target,{logicalStatus:'contradictory',reason:'pre-existing-visible-contradiction',contradiction:priorContradiction,explanation:presenter.contradictionExplanation(priorContradiction)});
    if(wanted!==Logic.FILLED&&wanted!==Logic.EMPTY)return auditResult('unknown',target,{logicalStatus:'not-applicable',reason:'non-constructive-state'});
    const targetProofs=deductionForTarget(puzzle,state,target.row,target.column),same=targetProofs.find(x=>x.conclusion.state===wanted),opposite=targetProofs.find(x=>x.conclusion.state!==wanted);
    if(same){const p=presenter.presentation(same.deduction);return auditResult('justified',target,{logicalStatus:'proven',reason:'target-forced',technique:p.technique,rank:p.rank,deduction:same.deduction,presentation:p})}
    if(opposite){const p=presenter.presentation(opposite.deduction);return auditResult('unjustified',target,{logicalStatus:'incorrect',reason:'opposite-state-proven',provenState:opposite.conclusion.state,provenStateName:Logic.STATE_NAMES[opposite.conclusion.state],technique:p.technique,rank:p.rank,deduction:opposite.deduction,presentation:p})}
    const proposed=clone(state);proposed[target.row][target.column]=wanted;const contradiction=Logic.findContradiction(puzzle,proposed);
    if(contradiction)return auditResult('unjustified',target,{logicalStatus:'incorrect',reason:'visible-contradiction',contradiction,explanation:presenter.contradictionExplanation(contradiction)});
    return auditResult('unjustified',target,{logicalStatus:'not-yet-proven',reason:'not-forced-by-visible-line-logic'})
  }
  function firstKnownLogicalMove(){const {view}=current(),hint=createCoach({presenter}).next(view);if(hint.status!=='deduction')return null;const c=hint.deduction.conclusions?.[0],rc=parseCellId(c?.cell?.id);return freezeDeep({schema:2,source:PresenterModule.SOURCE,game:GAME,rule:hint.presentation.rule,technique:hint.presentation.technique,rank:hint.presentation.rank,target:rc?{row:rc[0],column:rc[1]}:null,action:c?{type:'SET_NONOGRAM_CELL',state:c.state}:null,presentation:hint.presentation})}
  return Object.freeze({visibleErrors,errorFromAction,justifyMove,firstKnownLogicalMove,errorRuleTitle:()=>presenter.techniqueTitle('N_CONTRADICTION'),errorDetailedMessage:e=>e?.explanation?.why||e?.explanation?.text||presenter.contradictionText(e?.contradiction),actionEligible:a=>!['COACH_APPLY','LEARNING_GUIDED'].includes(a?.type),allowsNoPrimaryChange:()=>false,neutralValue:()=>Logic.UNKNOWN,constructiveValue:v=>v===Logic.FILLED||v===Logic.EMPTY,moveText:r=>{const t=r?.target;if(!t)return '';const s=r?.action?.state??r?.action?.value;return `${tr(s===Logic.FILLED?'ngFill':'ngCross')} · ${Logic.cellId(t.row,t.column)}`},historyChangeText:ch=>`${tr(ch.to===Logic.FILLED?'ngFill':ch.to===Logic.EMPTY?'ngCross':'ngErase')} · ${Logic.cellId(ch.row,ch.column)}`,masteryActionEligible:()=>true,suppressUnjustifiedAfterComplete:()=>false})
}
function createExploration(options={}){
  const lifecycle=options.lifecycle||SessionAdapters.nonogram,presenter=options.presenter||PresenterModule.createPresenter(),tr=typeof options.tr==='function'?options.tr:(k=>k==='ngNoVisibleContradiction'?'No visible contradiction.':k),resolveLifecycle=game=>{if(game!==GAME)throw new Error(`Nonogram Exploration cannot resolve ${game}`);return lifecycle},history=SessionCore.createHistoryController(resolveLifecycle),transactions=LogicalMove.createTransactionController({history,resolveLifecycle}),now=typeof options.now==='function'?options.now:Date.now;
  function start(source){const work=visibleSessionClone(source,{fromRoot:false}),branch={schema:EXPLORATION_SCHEMA,game:GAME,work,sourceSnapshot:lifecycle.snapshot(source?.game===GAME?source:work),hypotheses:[]};history.ensureHistory(work,true,now);branch.initial=lifecycle.snapshot(work);return branch}
  function view(branch){if(!branch?.work||branch.work.game!==GAME)throw new TypeError('Invalid Nonogram Exploration branch');return lifecycle.reasoningView(branch.work)}
  function auditFor(branch){return createAudit({presenter,tr,reasoningView:()=>view(branch)})}
  function analyze(branch){const {puzzle,state}=normalizedView(view(branch)),w=Logic.findContradiction(puzzle,state);return w?freezeDeep({bad:true,kind:'logic',contradiction:clone(w),explanation:presenter.contradictionExplanation(w),html:presenter.contradictionText(w)}):freezeDeep({bad:false,kind:'none',contradiction:null,explanation:null,html:tr('ngNoVisibleContradiction')})}
  function mark(branch,row,column,state,{hypothesis=true}={}){
    const before=lifecycle.snapshot(branch.work),a=auditFor(branch),justification=a.justifyMove({change:{row,column,from:branch.work.state[row][column],to:state}});
    const move=lifecycle.createCellMove(row,column,state),applied=transactions.apply(branch.work,move,{now}),node=branch.work.moveHistory.nodes[branch.work.moveHistory.cursor];node.justification=clone(justification);
    if(hypothesis&&justification.status==='unjustified'&&justification.logicalStatus==='not-yet-proven'){node.justification.status='hypothesis';branch.hypotheses.push(node.id)}
    if(!history.historyValid(branch.work))throw new Error('Nonogram Exploration history became inconsistent');return freezeDeep({applied:true,before,after:lifecycle.snapshot(branch.work),historyNode:node.id,justification:node.justification,analysis:analyze(branch),transaction:applied.transaction})
  }
  function undo(branch,steps=1){const r=history.undoHistory(branch.work,steps);if(r.moved&&r.snapshot)history.applyPuzzleSnapshot(branch.work,r.snapshot);if(!history.historyValid(branch.work))throw new Error('Nonogram Exploration history invalid after Undo');return r}
  function redo(branch,steps=1){const r=history.redoHistory(branch.work,steps);if(r.moved&&r.snapshot)history.applyPuzzleSnapshot(branch.work,r.snapshot);if(!history.historyValid(branch.work))throw new Error('Nonogram Exploration history invalid after Redo');return r}
  return Object.freeze({history,transactions,start,view,analyze,mark,undo,redo,canAcceptHypothesis:j=>j?.logicalStatus==='not-yet-proven'})
}

function focusSet(deduction){return Array.isArray(deduction?.move?.focus)?deduction.move.focus:[]}
function walkthroughBoard({base,snapshot,deduction}){
  const p=Logic.validatePuzzle(base.puzzle),state=Logic.validateState(p,snapshot.state),focus=focusSet(deduction),roles=new Map();
  for(const item of focus){
    const e=item?.entity;if(e?.kind==='cell')roles.set(e.id,item.role);
    else if(e?.kind==='row'){const m=/^r(\d+)$/.exec(e.id);if(m)for(let c=0;c<p.cols;c++)if(!roles.has(Logic.cellId(Number(m[1]),c)))roles.set(Logic.cellId(Number(m[1]),c),'context')}
    else if(e?.kind==='column'){const m=/^c(\d+)$/.exec(e.id);if(m)for(let r=0;r<p.rows;r++)if(!roles.has(Logic.cellId(r,Number(m[1]))))roles.set(Logic.cellId(r,Number(m[1])),'context')}
  }
  const cells=[];for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
    const id=Logic.cellId(r,c),v=state[r][c],role=roles.get(id),cls=['cell','walkthrough-cell','ng-cell'];if(role==='target')cls.push('walkthrough-target');else if(role)cls.push('walkthrough-context');if(v===Logic.FILLED)cls.push('ng-filled');else if(v===Logic.EMPTY)cls.push('ng-empty');else cls.push('ng-unknown');
    cells.push(`<div class="${cls.join(' ')}" data-entity-kind="cell" data-entity-id="${id}">${v===Logic.EMPTY?'×':''}</div>`)
  }
  return Object.freeze({boardClass:'nonogram-board',cellsHtml:cells.join('')})
}
function dependencyNames(){return Object.freeze([])}
function createAdapter(d={}){
  const common=d.common||{},reasoningView=typeof common.reasoningView==='function'?common.reasoningView:null,applyLogicalMove=typeof common.applyLogicalMove==='function'?common.applyLogicalMove:null,drawGameUi=typeof common.drawGameUi==='function'?common.drawGameUi:()=>undefined,commonTr=typeof common.tr==='function'?common.tr:null,commonLang=typeof common.lang==='function'?common.lang:null,tr=commonTr||(k=>k),lang=commonLang||(()=> 'en');
  const coachOptions={...(d.coachOptions||{})};if(!coachOptions.presenter){const presenterOptions={...(coachOptions.presenterOptions||{})};if(commonTr)presenterOptions.tr=commonTr;if(commonLang)presenterOptions.lang=commonLang;coachOptions.presenterOptions=presenterOptions}const coach=createCoach(coachOptions),tutor=createTutor({coach,...(d.tutorOptions||{})});
  if(!reasoningView)throw new TypeError('Nonogram pedagogy dependency missing: reasoningView');const audit=createAudit({reasoningView,presenter:coach.presenter,tr}),exploration=createExploration({presenter:coach.presenter,tr,...(d.explorationOptions||{})});
  const currentHint=id=>hintFromReasoningView(reasoningView(),id||null,coach.presenter),applyHint=h=>{if(!h?.move||!applyLogicalMove)return false;const ok=applyLogicalMove(h.move);if(ok!==false)drawGameUi();return ok!==false},targetStillCorrect=h=>{if(!h||!Number.isInteger(h.r)||!Number.isInteger(h.c))return false;const {state}=normalizedView(reasoningView());return state[h.r]?.[h.c]===h.v};
  return Object.freeze({
    coach:Object.freeze({genericHintFallbackAllowed:()=>false,runHint:()=>coach.next(reasoningView()),action:h=>h?.move?{type:'APPLY_LOGICAL_MOVE',move:clone(h.move)}:null}),
    audit:Object.freeze({visibleErrors:audit.visibleErrors,errorFromAction:audit.errorFromAction,errorRuleTitle:audit.errorRuleTitle,errorDetailedMessage:audit.errorDetailedMessage,masteryActionEligible:audit.masteryActionEligible,actionEligible:audit.actionEligible,allowsNoPrimaryChange:audit.allowsNoPrimaryChange,historyActionText:()=>'',neutralValue:audit.neutralValue,constructiveValue:audit.constructiveValue,moveText:audit.moveText,firstKnownLogicalMove:audit.firstKnownLogicalMove,justifyMove:audit.justifyMove,suppressUnjustifiedAfterComplete:audit.suppressUnjustifiedAfterComplete,historyChangeText:audit.historyChangeText}),
    exploration:Object.freeze({canAcceptHypothesis:j=>j?.logicalStatus==='not-yet-proven',contradiction:()=>{const {puzzle,state}=normalizedView(reasoningView()),w=Logic.findContradiction(puzzle,state);return w?{bad:true,kind:'logic',html:coach.presenter.contradictionText(w),detail:coach.presenter.contradictionExplanation(w)}:null}}),
    learning:Object.freeze({masteryDirectHint:()=>currentHint(null),moveText:h=>h?.presentation?.explanation?.move||coach.presenter.moveText(h?.deduction),applyMove:applyHint}),
    training:Object.freeze({hintForTechnique:({id})=>currentHint(id),randomProgress:()=>false,prepareBase:()=>false,buildDirect:()=>null,targetStillCorrect,coachText:h=>h?.presentation?.explanation?.move||coach.presenter.moveText(h?.deduction),revealLabel:()=>{const x=tr('ngLogicalMoveApplied');return x==='ngLogicalMoveApplied'?'Logical move applied':x},applyMove:applyHint}),
    walkthrough:Object.freeze({
      rootSnapshot:({historyRoot,puzzleSnapshot}={})=>historyRoot||(typeof puzzleSnapshot==='function'?puzzleSnapshot():null),
      visibleClone:(session,root)=>visibleSessionClone(session,{fromRoot:false,stateOverride:root?.state||null}),
      snapshot:session=>SessionAdapters.nonogram.snapshot(session),complete:session=>Logic.isSolved(session.puzzle,session.state),
      generateNext:walk=>!!tutor.next(walk),board:walkthroughBoard,
      contradictionText:x=>coach.presenter.contradictionText(x),afterRender:(board,base)=>{if(!board)return;const puzzle=Logic.validatePuzzle(base?.puzzle);board.style.setProperty('--ng-rows',String(puzzle.rows));board.style.setProperty('--ng-cols',String(puzzle.cols))},initialize:walk=>tutor.initialize(walk)
    })
  })
}
return Object.freeze({VERSION,GAME,TUTOR_SCHEMA,AUDIT_SCHEMA,EXPLORATION_SCHEMA,CURRICULUM_SCHEMA,COACH_LEVELS,CURRICULUM,CURRICULUM_IDS,curriculumEntry,createCoach,createTutor,createAudit,createExploration,createAdapter,dependencyNames,trainingFixture,_test:Object.freeze({normalizedView,levelFromPresentation,sourceReasoningView,visibleSessionClone,walkthroughBoard,allContradictions,deductionForTarget,errorFromContradiction,hintFromReasoningView})});
});
