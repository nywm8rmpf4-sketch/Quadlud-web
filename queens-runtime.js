/*
 * QUADLUD — Queens specialized Web runtime
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 * REF-2: game-specific Web/pedagogy helpers extracted from app.js without behavioral change.
 */
'use strict';

const QUEEN_REGION_COLORS=['#F2D27E','#C9B5E4','#A9D6B2','#EFAFC0','#A6CDEA','#F0B78D','#91CCC5','#C8D99E','#B6BDE5'];

function queenIllegalCells(){
  let bad=new Set(),q=[];for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.state[r][c]===2)q.push([r,c]);
  for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++){let [r,c]=q[i],[r2,c2]=q[j];if(r===r2||c===c2||current.reg[r][c]===current.reg[r2][c2]||(Math.abs(r-r2)<=1&&Math.abs(c-c2)<=1)){bad.add(keyCell(r,c));bad.add(keyCell(r2,c2))}}
  return bad
}

function queenErrorFromAction(action){
  for(let ch of changedTargets(action).filter(x=>x.to===2)){
    let {row:r,column:c}=ch;
    for(let rr=0;rr<current.n;rr++)for(let cc=0;cc<current.n;cc++)if((rr!==r||cc!==c)&&current.state[rr][cc]===2){
      if(rr===r)return {rule:'Q_ROW',technique:'Q_EXCLUSION_ROW',cells:[[r,c],[rr,cc]],target:[r,c],other:[rr,cc]};
      if(cc===c)return {rule:'Q_COLUMN',technique:'Q_EXCLUSION_COLUMN',cells:[[r,c],[rr,cc]],target:[r,c],other:[rr,cc]};
      if(current.reg[rr][cc]===current.reg[r][c])return {rule:'Q_REGION',technique:'Q_EXCLUSION_REGION',cells:[[r,c],[rr,cc]],target:[r,c],other:[rr,cc],region:current.reg[r][c]};
      if(Math.abs(rr-r)<=1&&Math.abs(cc-c)<=1)return {rule:'Q_ADJACENCY',technique:'Q_EXCLUSION_ADJACENCY',cells:[[r,c],[rr,cc]],target:[r,c],other:[rr,cc]}
    }
  }
  return null
}

function queenVisibleErrors(){
  let out=[],q=[];for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.state[r][c]===2)q.push([r,c]);
  for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++){
    let [r,c]=q[i],[r2,c2]=q[j],e=null;
    if(r===r2)e={rule:'Q_ROW',technique:'Q_EXCLUSION_ROW',cells:[[r,c],[r2,c2]],target:[r2,c2],other:[r,c]};
    else if(c===c2)e={rule:'Q_COLUMN',technique:'Q_EXCLUSION_COLUMN',cells:[[r,c],[r2,c2]],target:[r2,c2],other:[r,c]};
    else if(current.reg[r][c]===current.reg[r2][c2])e={rule:'Q_REGION',technique:'Q_EXCLUSION_REGION',cells:[[r,c],[r2,c2]],target:[r2,c2],other:[r,c],region:current.reg[r][c]};
    else if(Math.abs(r-r2)<=1&&Math.abs(c-c2)<=1)e={rule:'Q_ADJACENCY',technique:'Q_EXCLUSION_ADJACENCY',cells:[[r,c],[r2,c2]],target:[r2,c2],other:[r,c]};
    if(e)out.push(normalizeVisibleError(e))
  }
  return out
}

const QUEEN_PEDAGOGICAL_RANK0_TECHNIQUES=Object.freeze(new Set([
  'Q_EXCLUSION_ROW','Q_EXCLUSION_COLUMN','Q_EXCLUSION_REGION','Q_EXCLUSION_ADJACENCY',
  'Q_UNIQUE_ROW','Q_UNIQUE_COLUMN','Q_UNIQUE_REGION'
]));
const QUEEN_PEDAGOGICAL_ADVANCED_RANK=Object.freeze({Q_CONTRADICTION_R1:1,Q_CONTRADICTION_R2:2,Q_CONTRADICTION_R3:3});
const QUEEN_PEDAGOGICAL_DIFFICULTY_INDEX=Object.freeze({medium:1,hard:2,expert:3});
const QUEEN_PEDAGOGICAL_CONTEXTS=Object.freeze(new Set(['learning','training']));

function queenPedagogicalNow(){return WebPlatform?.clock?.nowMs?WebPlatform.clock.nowMs():(typeof performance!=='undefined'&&performance.now?performance.now():Date.now())}
function queenPedagogicalClone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function queenPedagogicalEmptyState(n){return Array.from({length:n},()=>Array(n).fill(0))}
function queenPedagogicalPublicCurrent(puzzle,difficulty,state){return {game:'queens',diff:difficulty,n:puzzle.n,reg:cloneGrid(puzzle.reg),state:cloneGrid(state),generated:true,unique:true,completed:false,training:true}}
function queenPedagogicalWithCurrent(puzzle,difficulty,state,fn){let previous=current;current=queenPedagogicalPublicCurrent(puzzle,difficulty,state);try{return fn(current)}finally{current=previous}}
function queenPedagogicalHintForTechnique(techniqueId,deadline){
  if(QUEEN_PEDAGOGICAL_RANK0_TECHNIQUES.has(techniqueId))return findQueenLogicalHint();
  let rank=QUEEN_PEDAGOGICAL_ADVANCED_RANK[techniqueId];
  return rank===1?findQueenRank1Hint(deadline):rank===2?findQueenRank2Hint(deadline):rank===3?findQueenRank3Hint(deadline):null
}
function queenPedagogicalTechniqueRank(techniqueId){return QUEEN_PEDAGOGICAL_RANK0_TECHNIQUES.has(techniqueId)?0:(QUEEN_PEDAGOGICAL_ADVANCED_RANK[techniqueId]??null)}
function queenPedagogicalCanonicalTechnique(d){
  if(!d)return null;
  if(d.rule==='ASSUMPTION_CONTRADICTION')return 'Q_CONTRADICTION_R2';
  if(d.rule!=='SINGLETON')return null;
  let family=d.explanationData?.unit?.family||d.premises?.find?.(p=>p?.unit?.family)?.unit?.family;
  return family==='row'?'Q_UNIQUE_ROW':family==='column'?'Q_UNIQUE_COLUMN':family==='region'?'Q_UNIQUE_REGION':null
}
function queenPedagogicalCanonicalDescriptor(puzzle,difficulty,state,techniqueId,hint){
  let out={available:false,techniqueId:null,rule:null,target:null,value:null,sameMove:false,sameTechnique:false,canonicalPriority:false};
  try{
    if(typeof QueensLogic==='undefined'||!QueensLogic?.createSession||typeof QueensDifficulty==='undefined'||typeof QueensDifficulty?.nextAllowedDeduction!=='function')return out;
    let session=QueensLogic.createSession({n:puzzle.n,reg:cloneGrid(puzzle.reg),state:cloneGrid(state)}),tier=QUEEN_PEDAGOGICAL_DIFFICULTY_INDEX[difficulty],next=QueensDifficulty.nextAllowedDeduction(session,tier,false),d=next?.deduction;
    if(!d)return out;
    let c=(d.conclusions||[])[0]||null,canonicalTechnique=queenPedagogicalCanonicalTechnique(d),sameMove=!!c&&c.cell?.[0]===hint?.r&&c.cell?.[1]===hint?.c&&c.value===hint?.v,sameTechnique=canonicalTechnique===techniqueId;
    return {available:true,techniqueId:canonicalTechnique,rule:d.rule,target:c?.cell?[...c.cell]:null,value:c?.value??null,sameMove,sameTechnique,canonicalPriority:sameMove&&sameTechnique}
  }catch(_error){return out}
}
function queenPedagogicalSanitizeGeneration(candidate,difficulty){
  let profile=candidate?.difficultyProfile||{},stats=candidate?.generationStats||{};
  return {
    difficulty,
    fingerprint:profile.fingerprint||stats.fingerprint||null,
    minimumRequiredTier:profile.minimumRequiredTier??stats.minimumRequiredTier??null,
    strategy:stats.strategy||null,
    generatorVersion:stats.generatorVersion??null,
    poolVersion:stats.poolVersion??null,
    poolEntryId:stats.poolEntryId??null,
    poolIndex:stats.poolIndex??null
  }
}
function queenPedagogicalNormalizeBudget(budget){
  if(!budget||typeof budget!=='object')throw new TypeError('Queens pedagogical extraction requires an explicit budget');
  let totalMs=Number(budget.totalMs),maxAttempts=Number(budget.maxAttempts),maxStates=Number(budget.maxStates),maxMicroSteps=Number(budget.maxMicroSteps??64);
  if(!Number.isFinite(totalMs)||totalMs<=0)throw new TypeError('Queens pedagogical extraction budget.totalMs must be > 0');
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw new TypeError('Queens pedagogical extraction budget.maxAttempts must be >= 1');
  if(!Number.isInteger(maxStates)||maxStates<1)throw new TypeError('Queens pedagogical extraction budget.maxStates must be >= 1');
  if(!Number.isInteger(maxMicroSteps)||maxMicroSteps<1)throw new TypeError('Queens pedagogical extraction budget.maxMicroSteps must be >= 1');
  return {totalMs,maxAttempts,maxStates,maxMicroSteps}
}
function queenPedagogicalFoundResult(base,puzzle,state,hint,source,canonical,search={}){
  return Object.freeze({...base,status:'found',puzzle:Object.freeze({game:'queens',n:puzzle.n,reg:cloneGrid(puzzle.reg)}),visibleState:cloneGrid(state),hint:queenPedagogicalClone(hint),proof:Object.freeze({source,canonicalPriority:!!canonical?.canonicalPriority,canonical:queenPedagogicalClone(canonical),canonicalStateIndex:Number.isInteger(search.stateIndex)?search.stateIndex:null,priorHintSequence:Object.freeze([...(search.sequence||[])])})})
}
function queenPedagogicalRank0Search(puzzle,difficulty,techniqueId,state,deadline,maxMicroSteps){
  let work=cloneGrid(state),sequence=[];
  for(let step=0;step<maxMicroSteps;step++){
    if(queenPedagogicalNow()>=deadline)return {status:'budget_exhausted',budgetKind:'time'};
    let h=queenPedagogicalWithCurrent(puzzle,difficulty,work,()=>findQueenLogicalHint());
    if(!h)return {status:'not_found',sequence};
    if(h.technique===techniqueId)return {status:'found',hint:h,state:cloneGrid(work),sequence};
    sequence.push(h.technique||null);
    if(!Number.isInteger(h.r)||!Number.isInteger(h.c)||![1,2].includes(h.v)||work[h.r]?.[h.c]!==0)return {status:'not_found',sequence};
    work[h.r][h.c]=h.v
  }
  return {status:'budget_exhausted',budgetKind:'micro_steps',sequence}
}
function queenPedagogicalAdvancedSearch(puzzle,difficulty,techniqueId,state,deadline){
  let h=queenPedagogicalWithCurrent(puzzle,difficulty,state,()=>queenPedagogicalHintForTechnique(techniqueId,deadline));
  if(h?.timeout)return {status:'budget_exhausted',budgetKind:'time'};
  if(!h)return {status:'not_found'};
  let expected=QUEEN_PEDAGOGICAL_ADVANCED_RANK[techniqueId];
  if(h.rank!==expected)return {status:'not_found'};
  return {status:'found',hint:h,state:cloneGrid(state)}
}
function queenPedagogicalSearchCandidate(candidate,techniqueId,difficulty,deadline,budget){
  if(typeof QueensDifficulty==='undefined'||typeof QueensDifficulty?.canonicalizePublicPuzzle!=='function'||typeof QueensDifficulty?.nextAllowedDeduction!=='function')throw new Error('Queens difficulty service unavailable');
  if(typeof QueensLogic==='undefined'||!QueensLogic?.createSession)throw new Error('Queens inference engine unavailable');
  let publicPuzzle=QueensDifficulty.canonicalizePublicPuzzle({n:candidate.n,reg:candidate.reg}),tier=QUEEN_PEDAGOGICAL_DIFFICULTY_INDEX[difficulty],session=QueensLogic.createSession({n:publicPuzzle.n,reg:cloneGrid(publicPuzzle.reg),state:queenPedagogicalEmptyState(publicPuzzle.n)}),rank=queenPedagogicalTechniqueRank(techniqueId);
  for(let stateIndex=0;stateIndex<budget.maxStates;stateIndex++){
    if(queenPedagogicalNow()>=deadline)return {status:'budget_exhausted',budgetKind:'time'};
    let state=cloneGrid(session.state),searched=rank===0?queenPedagogicalRank0Search(publicPuzzle,difficulty,techniqueId,state,deadline,budget.maxMicroSteps):queenPedagogicalAdvancedSearch(publicPuzzle,difficulty,techniqueId,state,deadline);
    if(searched.status==='budget_exhausted')return searched;
    if(searched.status==='found')return {...searched,publicPuzzle,stateIndex,source:rank===0?'rank0-next-hint':'targeted-rank-analyzer'};
    let next=QueensDifficulty.nextAllowedDeduction(session,tier,false),d=next?.deduction;
    if(!d)return {status:next?.budgetHit?'budget_exhausted':'not_found',budgetKind:next?.budgetHit?'logic_budget':null};
    if(rank===0){
      for(let c of (d.conclusions||[]).filter(x=>x?.value===2&&Array.isArray(x.cell))){
        let micro=cloneGrid(state),[r,col]=c.cell;if(micro[r]?.[col]!==0)continue;micro[r][col]=2;
        let direct=queenPedagogicalRank0Search(publicPuzzle,difficulty,techniqueId,micro,deadline,budget.maxMicroSteps);
        if(direct.status==='budget_exhausted')return direct;
        if(direct.status==='found')return {...direct,publicPuzzle,stateIndex,source:'proven-queen-rank0-next-hint'}
      }
    }
    let applied=session.applyDeduction(d);if(!applied?.deduction)return {status:'not_found'}
  }
  return {status:'budget_exhausted',budgetKind:'state_steps'}
}
function extractQueenPedagogicalExercise(options={}){
  let techniqueId=String(options.techniqueId||''),difficulty=String(options.difficulty||'').toLowerCase(),context=String(options.context||'').toLowerCase(),rank=queenPedagogicalTechniqueRank(techniqueId);
  if(rank==null)throw new Error(`Unsupported Queens pedagogical technique: ${techniqueId}`);
  if(!Object.prototype.hasOwnProperty.call(QUEEN_PEDAGOGICAL_DIFFICULTY_INDEX,difficulty))throw new Error('Queens pedagogical extraction supports Medium/Hard/Expert only; Easy remains unchanged');
  if(!QUEEN_PEDAGOGICAL_CONTEXTS.has(context))throw new Error('Queens pedagogical extraction context must be learning or training');
  let budget=queenPedagogicalNormalizeBudget(options.budget),forbidden=new Set(Array.from(options.forbiddenFingerprints||[],String)),seenFingerprints=new Set(),started=queenPedagogicalNow(),deadline=started+budget.totalMs,attempts=0,rejectedForbidden=0,rejectedRepeat=0,lastGeneration=null;
  while(attempts<budget.maxAttempts){
    if(queenPedagogicalNow()>=deadline)return Object.freeze({schema:1,game:'queens',techniqueId,difficulty,context,status:'budget_exhausted',budgetKind:'time',attempts,rejectedForbidden,rejectedRepeat,elapsedMs:queenPedagogicalNow()-started,generation:lastGeneration});
    attempts++;
    let candidate=queenCandidate(difficulty,{context}),generation=queenPedagogicalSanitizeGeneration(candidate,difficulty),fingerprint=generation.fingerprint;
    lastGeneration=generation;
    if(fingerprint&&forbidden.has(fingerprint)){rejectedForbidden++;continue}
    if(fingerprint&&seenFingerprints.has(fingerprint)){rejectedRepeat++;continue}
    if(fingerprint)seenFingerprints.add(fingerprint);
    let searched=queenPedagogicalSearchCandidate(candidate,techniqueId,difficulty,deadline,budget),base={schema:1,game:'queens',techniqueId,difficulty,context,attempts,rejectedForbidden,rejectedRepeat,elapsedMs:queenPedagogicalNow()-started,generation};
    if(searched.status==='found'){
      let canonical=queenPedagogicalCanonicalDescriptor(searched.publicPuzzle,difficulty,searched.state,techniqueId,searched.hint);
      return queenPedagogicalFoundResult(base,searched.publicPuzzle,searched.state,searched.hint,searched.source,canonical,searched)
    }
    if(searched.status==='budget_exhausted')return Object.freeze({...base,status:'budget_exhausted',budgetKind:searched.budgetKind||'time'})
  }
  return Object.freeze({schema:1,game:'queens',techniqueId,difficulty,context,status:'not_found',attempts,rejectedForbidden,rejectedRepeat,elapsedMs:queenPedagogicalNow()-started,generation:lastGeneration})
}

function trainingBuildQueensGenerated({id,difficulty,context,deadline}={}){
  let end=Number(deadline),remaining=Number.isFinite(end)?Math.max(1,end-queenPedagogicalNow()):5500;
  let result=extractQueenPedagogicalExercise({techniqueId:id,difficulty,context,budget:{totalMs:remaining,maxAttempts:6,maxStates:96,maxMicroSteps:64}});
  if(result?.status!=='found')return Object.freeze({status:result?.status||'not_found',budgetKind:result?.budgetKind||null,hint:null,extraction:result||null});
  current={
    game:'queens',diff:difficulty,n:result.puzzle.n,reg:cloneGrid(result.puzzle.reg),state:cloneGrid(result.visibleState),
    generated:true,unique:true,completed:false,training:true,
    pedagogicalGeneration:queenPedagogicalClone(result.generation),
    pedagogicalExtraction:Object.freeze({schema:1,source:'visible-state',context,techniqueId:id,canonicalPriority:!!result.proof?.canonicalPriority})
  };
  return Object.freeze({status:'found',hint:queenPedagogicalClone(result.hint),extraction:result});
}

function queenReasoningPresenter(){return reasoningPresenter(globalThis.QuadludQueensReasoningPresenter.GAME)}

function queenLogicAvailable(){return typeof QueensLogic!=='undefined'&&QueensLogic?.createSession}

function queenLogicBoard(c=current,state=null){return {n:c.n,reg:cloneGrid(c.reg),state:cloneGrid(state||c.state)}}

function queenLogicSession(c=current,state=null){if(!queenLogicAvailable())throw new Error('Queens inference engine unavailable');return QueensLogic.createSession(queenLogicBoard(c,state))}

function queenUnitCells(ref,c=current){
  if(!ref||!c)return [];
  if(ref.family==='row')return Array.from({length:c.n},(_,col)=>[Number(ref.id),col]);
  if(ref.family==='column')return Array.from({length:c.n},(_,row)=>[row,Number(ref.id)]);
  let out=[];for(let r=0;r<c.n;r++)for(let col=0;col<c.n;col++)if(c.reg[r][col]===ref.id)out.push([r,col]);return out
}

function queenUnitHuman(ref){
  if(!ref)return '';
  if(ref.family==='row')return `${tr('rowLabel')} ${Number(ref.id)+1}`;
  if(ref.family==='column')return `${tr('columnLabel')} ${Number(ref.id)+1}`;
  return queenZoneBadge(Number(ref.id))
}

function queenFormat(key,vars={}){let text=String(tr(key)||key);return text.replace(/\{([A-Za-z0-9_]+)\}/g,(_,k)=>vars[k]??'')}

function queenUnitListHuman(units){return (units||[]).map(queenUnitHuman).join(tr('qlAnd'))}

function queenCellCoordinate(r,c){let p=globalThis?.QuadludQueensReasoningPresenter;if(p&&typeof p.cellCoordinate==='function')return p.cellCoordinate(r,c);return typeof cellName==='function'?cellName(r,c):`${r},${c}`}

function queenCellListHuman(cells,limit=8){let a=(cells||[]).map(x=>queenCellCoordinate(x[0],x[1]));if(a.length<=limit)return a.join(', ');return a.slice(0,limit).join(', ')+queenFormat('qlMore',{count:a.length-limit})}

function queenPedagogyUnitRefs(d){
  if(!d)return [];
  let x=d.explanationData||{},out=[],seen=new Set(),addRef=ref=>{let family=ref?.family,id=Number(ref?.id);if(!['row','column','region'].includes(family)||!Number.isInteger(id))return;let key=`${family}:${id}`;if(!seen.has(key)){seen.add(key);out.push({family,id})}};
  for(let ref of d.focusUnits||[])addRef(ref);
  for(let ref of [x.unit,x.sourceUnit,x.targetUnit,x.supportUnit,x.witness?.unit])addRef(ref);
  for(let refs of [x.sourceUnits,x.targetUnits])for(let ref of refs||[])addRef(ref);
  return out
}

function queenLinearFocusPlan(d,context=current){
  let n=Number(context?.n)||Number(context?.reg?.length)||0,rows=new Set(),columns=new Set();if(!d||!n)return {rows:[],columns:[]};
  for(let ref of queenPedagogyUnitRefs(d)){
    if(ref.family==='row'&&ref.id>=0&&ref.id<n)rows.add(ref.id);
    else if(ref.family==='column'&&ref.id>=0&&ref.id<n)columns.add(ref.id)
  }
  return {rows:[...rows].sort((a,b)=>a-b),columns:[...columns].sort((a,b)=>a-b)}
}

function queenRegionFocusPlan(d,context=current){
  let reg=context?.reg,n=Number(context?.n)||reg?.length||0;if(!d||!Array.isArray(reg)||!n)return [];
  let ids=new Set();for(let ref of queenPedagogyUnitRefs(d))if(ref.family==='region')ids.add(ref.id);
  let out=[];
  for(let id of [...ids].sort((a,b)=>a-b)){
    let cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(reg[r]?.[c]===id)cells.push([r,c]);if(!cells.length)continue;
    let edges={};for(let [r,c] of cells){let e=[];if(r===0||reg[r-1]?.[c]!==id)e.push('top');if(c===n-1||reg[r]?.[c+1]!==id)e.push('right');if(r===n-1||reg[r+1]?.[c]!==id)e.push('bottom');if(c===0||reg[r]?.[c-1]!==id)e.push('left');edges[`${r},${c}`]=e}
    out.push({id,label:`Z${id+1}`,cells,edges,badge:cells[0].slice()})
  }
  return out
}

function queenConflictReasonHuman(reasons){let r=reasons?.[0],key=r==='ROW'?'qlConflictRow':r==='COLUMN'?'qlConflictColumn':r==='REGION'?'qlConflictRegion':r==='ADJACENCY'?'qlConflictAdjacency':'qlConflictRule';return tr(key)}

function queenCoordinateFocusRoot(board){return board?.closest?.('.queens-coordinate-wrap,.walkthrough-queens-coordinate-wrap')||board?.parentElement||null}

function queenApplyLinearFocus(board,plan,n){
  let focused=new Set(),rows=new Set(plan?.rows||[]),columns=new Set(plan?.columns||[]),markCell=(r,c,cls)=>{let el=board.children[r*n+c];if(el)el.classList.add(cls)};
  for(let r of rows)for(let c=0;c<n;c++){focused.add(`${r},${c}`);markCell(r,c,'queen-line-focus');markCell(r,c,'queen-line-focus-row')}
  for(let c of columns)for(let r=0;r<n;r++){focused.add(`${r},${c}`);markCell(r,c,'queen-line-focus');markCell(r,c,'queen-line-focus-column')}
  let root=queenCoordinateFocusRoot(board),rowLabels=root?.querySelectorAll?.('.queens-row-coordinates span')||[],columnLabels=root?.querySelectorAll?.('.queens-column-coordinates span')||[];
  for(let r of rows){let el=rowLabels[r];if(el)el.classList.add('queen-unit-focus-label','queen-unit-focus-row-label')}
  for(let c of columns){let el=columnLabels[c];if(el)el.classList.add('queen-unit-focus-label','queen-unit-focus-column-label')}
  return focused
}

function queenApplyRegionFocus(board,regions,n){
  let regionCells=new Set();for(let z of regions||[])for(let cell of z.cells||[]){let [r,c]=cell,k=`${r},${c}`,el=board.children[r*n+c];if(!el)continue;regionCells.add(k);el.classList.add('queen-region-focus');for(let edge of z.edges?.[k]||[])el.classList.add(`queen-region-focus-${edge}`);if(z.badge?.[0]===r&&z.badge?.[1]===c)el.setAttribute('data-region-focus-badge',z.label)}return regionCells
}

function queenFocusDeduction(d,reveal=false){
  clearHintFocus();let board=$('#qboard')||document.querySelector('.board');if(!board||!current||!d)return;let n=current.n,ctx=queenReasoningPresenter().premiseCells(d,current),conclusions=(d.conclusions||[]).map(x=>x.cell),lineCells=queenApplyLinearFocus(board,queenLinearFocusPlan(d,current),n),regionCells=queenApplyRegionFocus(board,queenRegionFocusPlan(d,current),n),mark=(cell,cls)=>{let x=board.children[cell[0]*n+cell[1]];if(x)x.classList.add(cls)};
  for(let cell of ctx){let key=cell.join(',');if(!regionCells.has(key)&&!lineCells.has(key))mark(cell,'hint-context')}if(reveal)for(let cell of conclusions)mark(cell,'hint-focus')
}

function queenApplyDeductionToCurrent(d){
  if(!d||!current||current.game!=='queens')return null;
  let engine=queenLogicSession(),applied=engine.applyDeduction(d);if(!applied?.deduction)return null;
  let changes=[...(applied.deduction.conclusions||[])];for(let a of applied.automatic||[])changes.push(...(a.conclusions||[]));
  for(let c of changes){let [r,col]=c.cell;if(current.state[r][col]===0)current.state[r][col]=c.value}
  return applied
}

function queenCurrentLogicResult(){let session=queenLogicSession();return {session,...session.nextDeduction()}}

function queenShowLogicalContradiction(w){
  current.hintFlow=null;clearHintFocus();let cells=w?.cells||w?.premises?.flatMap?.(p=>p.cell?[p.cell]:[])||[];let board=$('#qboard');if(board)for(let [r,c] of cells){let d=board.children[r*current.n+c];if(d)d.classList.add('error-focus')}
  showHintNotice(`<b>⚠ ${tr('contradictionFound')}</b><br>${queenReasoningPresenter().contradictionText(w)}`);return true
}

function queenCoachHandleDeduction(d){
  let presenter=queenReasoningPresenter(),boardKey=historySnapshotKey(),sig=d.id+'|'+d.rank,flow=current.hintFlow,isSame=flow?.kind==='queens-proof'&&flow.boardKey===boardKey&&flow.signature===sig,view=presenter.presentation(d),sequence=presenter.coachSequence?.(d,view);
  if(Array.isArray(sequence)&&sequence.length>=4){
    if(!isSame||flow?.flowVersion!==4){
      current.hintFlow={kind:'queens-proof',boardKey,signature:sig,stage:1,total:sequence.length,flowVersion:4,whyRecorded:false,revealRecorded:false,deduction:JSON.parse(JSON.stringify(d))};
      coachUsage(1,view.technique);queenFocusDeduction(d,false);showHintNotice(`<span class="coach-progress">1/${sequence.length}</span>${sequence[0].html}`);saveCurrent();return
    }
    let proof=flow.deduction||d,proofView=presenter.presentation(proof),proofSequence=presenter.coachSequence?.(proof,proofView);
    if(!Array.isArray(proofSequence)||proofSequence.length!==flow.total){current.hintFlow=null;showHintNotice(tr('hintError'));return}
    let next=Math.min((flow.stage||1)+1,proofSequence.length);flow.stage=next;
    if(next>=2&&!flow.whyRecorded){coachUsage(2,proofView.technique);flow.whyRecorded=true}
    if(next===proofSequence.length-1&&!flow.revealRecorded){coachUsage(3,proofView.technique);markHintUsed();updateScoreFlags();flow.revealRecorded=true}
    if(next<proofSequence.length){queenFocusDeduction(proof,false);showHintNotice(`<span class="coach-progress">${next}/${proofSequence.length}</span>${proofSequence[next-1].html}`);saveCurrent();return}
    let before=historySnapshotKey();if(!flow.revealRecorded){coachUsage(3,proofView.technique);markHintUsed();updateScoreFlags();flow.revealRecorded=true}queenFocusDeduction(proof,true);let application=queenApplyDeductionToCurrent(proof);if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}drawGameUi();historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:proofSequence.length,coachFlowVersion:4,proofNarrativeSteps:proofView.proofNarrative?.steps?.length||0},before);current.hintFlow=null;
    showHintNotice(`<span class="coach-progress">${proofSequence.length}/${proofSequence.length}</span>${proofSequence[proofSequence.length-1].html}`);maybeAutoFinish();saveCurrent();haptic(12);return
  }
  if(!isSame||flow?.flowVersion===4){current.hintFlow={kind:'queens-proof',boardKey,signature:sig,stage:1,flowVersion:3,deduction:JSON.parse(JSON.stringify(d))};coachUsage(1,view.technique);queenFocusDeduction(d,false);showHintNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${view.explanation.where}`);saveCurrent();return}
  let proof=flow.deduction||d,before=historySnapshotKey();coachUsage(2,view.technique);coachUsage(3,view.technique);markHintUsed();updateScoreFlags();queenFocusDeduction(proof,true);let application=queenApplyDeductionToCurrent(proof);if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}drawGameUi();let appliedView=presenter.presentation(application.deduction,application.automatic);historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:3},before);current.hintFlow=null;
  showHintNotice(`<span class="coach-progress">2/2</span><b>${appliedView.explanation.title}</b><br>${appliedView.explanation.why}`);maybeAutoFinish();saveCurrent();haptic(12)
}

function queenDirectPlacementAt(r,c){
  if(current.state[r][c]!==0||!queenCellAllowed(r,c))return null;let n=current.n;
  if(!current.state[r].some(v=>v===2)){let a=[];for(let cc=0;cc<n;cc++)if(current.state[r][cc]===0&&queenCellAllowed(r,cc))a.push([r,cc]);if(a.length===1&&a[0][1]===c)return 'Q_UNIQUE_ROW'}
  let has=false,a=[];for(let rr=0;rr<n;rr++){if(current.state[rr][c]===2)has=true;else if(current.state[rr][c]===0&&queenCellAllowed(rr,c))a.push([rr,c])}
  if(!has&&a.length===1&&a[0][0]===r)return 'Q_UNIQUE_COLUMN';
  let id=current.reg[r][c];has=false;a=[];for(let rr=0;rr<n;rr++)for(let cc=0;cc<n;cc++)if(current.reg[rr][cc]===id){if(current.state[rr][cc]===2)has=true;else if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))a.push([rr,cc])}
  if(!has&&a.length===1&&a[0][0]===r&&a[0][1]===c)return 'Q_UNIQUE_REGION';
  return null
}

function justifyQueenAt(r,c,v,deadline){
  if(v===1){let q=queenDirectExclusionReason(r,c);if(q)return proofResult('justified',q.technique,0,[r,c],q.text)}
  if(v===2){let t=queenDirectPlacementAt(r,c);if(t)return proofResult('justified',t,0,[r,c],techniqueTitle(t))}
  let opp=v===2?1:2;
  let chosenBad=withTempCurrent(x=>{x.state[r][c]=v},()=>queenStateContradiction()),oppBad=withTempCurrent(x=>{x.state[r][c]=opp},()=>queenStateContradiction());
  if(!chosenBad&&oppBad)return proofResult('justified','Q_CONTRADICTION_R1',1,[r,c],null);
  if(WebPlatform.clock.nowMs()>=deadline)return proofResult('unknown',null,null,[r,c],'timeout');
  let opp2=withTempCurrent(x=>{x.state[r][c]=opp},()=>queenBoundedContradiction(1,deadline));if(opp2?.timeout)return proofResult('unknown',null,null,[r,c],'timeout');
  let chosen2=withTempCurrent(x=>{x.state[r][c]=v},()=>queenBoundedContradiction(1,deadline));if(chosen2?.timeout)return proofResult('unknown',null,null,[r,c],'timeout');
  if(opp2?.bad&&!chosen2?.bad)return proofResult('justified','Q_CONTRADICTION_R2',2,[r,c],null);
  if(WebPlatform.clock.nowMs()>=deadline)return proofResult('unknown',null,null,[r,c],'timeout');
  let opp3=withTempCurrent(x=>{x.state[r][c]=opp},()=>queenBoundedContradiction(2,deadline));if(opp3?.timeout)return proofResult('unknown',null,null,[r,c],'timeout');
  let chosen3=withTempCurrent(x=>{x.state[r][c]=v},()=>queenBoundedContradiction(2,deadline));if(chosen3?.timeout)return proofResult('unknown',null,null,[r,c],'timeout');
  if(opp3?.bad&&!chosen3?.bad)return proofResult('justified','Q_CONTRADICTION_R3',3,[r,c],null);
  return proofResult('unjustified',null,null,[r,c],null)
}

function queenWalkthroughApplyChanges(state,changes){
  for(let ch of changes||[]){let cell=ch?.cell;if(!Array.isArray(cell)||cell.length<2)continue;let r=Number(cell[0]),c=Number(cell[1]),value=Number(ch.value);if(Number.isInteger(r)&&Number.isInteger(c)&&state?.[r]&&Number.isInteger(value))state[r][c]=value}
  return state
}
function queenWalkthroughTemporaryCells(baseState,state){
  let out=[],n=Math.max(baseState?.length||0,state?.length||0);for(let r=0;r<n;r++)for(let c=0;c<Math.max(baseState?.[r]?.length||0,state?.[r]?.length||0);c++)if(baseState?.[r]?.[c]!==state?.[r]?.[c])out.push([r,c]);return out
}
function queenWalkthroughStageDeduction(stage,beforeState,stageState,assumptionCell){
  let focus=JSON.parse(JSON.stringify(stage?.focusDeduction||{}));focus.walkthroughStageKind=stage?.kind||null;focus.walkthroughTemporary=stage?.temporary===true;focus.walkthroughTemporaryCells=stage?.temporary?queenWalkthroughTemporaryCells(beforeState,stageState):[];focus.walkthroughHypothesisCell=stage?.temporary&&Array.isArray(assumptionCell)?[...assumptionCell]:null;return focus
}
function queenWalkthroughStagePresentation(presentation,stage){
  let out=JSON.parse(JSON.stringify(presentation));out.metadata={...(out.metadata||{}),showTutorMove:stage?.kind==='action'};return out
}
function walkthroughGenerateQueensNext(){
  let s=walkthroughSession;if(!s||s.base.game!=='queens'||s.done||s.stalled)return false;
  if(!s.queenLogic)s.queenLogic=queenLogicSession(s.work,s.work.state);
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;return false}
  let result=s.queenLogic.nextDeduction();
  if(result.contradiction){s.stalled=true;s.logicContradiction=result.contradiction;return false}
  if(!result.deduction){s.stalled=true;return false}
  let beforeSnapshot=walkthroughSnapshot(s.work),applied=s.queenLogic.applyDeduction(result.deduction),d=applied.deduction;if(!d){s.stalled=true;return false}
  s.work.state=cloneGrid(s.queenLogic.state);
  let finalSnapshot=walkthroughSnapshot(s.work),presenter=queenReasoningPresenter(),presentation=presenter.presentation(d,applied.automatic),reasoning=presenter.legacyReasoning(d,applied.automatic),tutorSequence=presenter.tutorSequence?.(d,presentation),baseInfo={
    rule:presentation.rule,technique:presentation.technique,rank:presentation.rank,techniqueLevel:presentation.techniqueLevel,target:d.conclusions?.[0]?.cell?[...d.conclusions[0].cell]:null,
    automatic:JSON.parse(JSON.stringify(applied.automatic||[])),metrics:s.queenLogic.metrics(),beforeSnapshot,logicalDeduction:reasoning
  };
  if(Array.isArray(tutorSequence)&&tutorSequence.length>=5){
    let visibleState=cloneGrid(beforeSnapshot.state),stageState=cloneGrid(beforeSnapshot.state),assumptionCell=d.explanationData?.assumption?.cell||null;
    for(let stage of tutorSequence){
      if(stage.resetToVisible===true)stageState=cloneGrid(visibleState);
      if(stage.kind!=='action')queenWalkthroughApplyChanges(stageState,stage.stateChanges);
      let snapshot=stage.kind==='action'?finalSnapshot:{state:cloneGrid(stageState)},focus=queenWalkthroughStageDeduction(stage,visibleState,snapshot.state,assumptionCell),info={...baseInfo,
        presentation:queenWalkthroughStagePresentation(presentation,stage),deduction:focus,where:stage.where||presentation.explanation.where,why:stage.why||'',move:stage.move||'',snapshot,
        proofStage:{kind:stage.kind,id:stage.id,evidenceRefs:[...(stage.evidenceRefs||[])],temporary:stage.temporary===true,apply:stage.apply===true}
      };
      s.moves.push(info)
    }
  }else{
    let info={...baseInfo,presentation,deduction:reasoning,where:presentation.explanation.where,why:presentation.explanation.why,move:presentation.explanation.move,snapshot:finalSnapshot};s.moves.push(info)
  }
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;s.metrics=s.queenLogic.metrics()}
  return true
}

function queenReason(r,c){
  let z=current.reg[r][c],sameRegion=[],sameRow=[],sameCol=[];for(let rr=0;rr<current.n;rr++)for(let cc=0;cc<current.n;cc++)if(current.state[rr][cc]!==1){if(current.reg[rr][cc]===z)sameRegion.push([rr,cc]);if(rr===r)sameRow.push([rr,cc]);if(cc===c)sameCol.push([rr,cc])}
  let txt=lang()==='fr'?`cette case respecte la ligne ${r+1}, la colonne ${c+1}, la zone ${z+1} et la règle de non-adjacence.`:`this cell satisfies row ${r+1}, column ${c+1}, region ${z+1}, and the non-adjacency rule.`;
  if(sameRegion.length===1)txt+=(lang()==='fr'?' C’est la dernière case non barrée de sa zone.':' It is the last unmarked cell in its region.');
  return txt
}

function queenWalkthroughRegionColor(i){return QUEEN_REGION_COLORS[i%QUEEN_REGION_COLORS.length]}

function queenZoneBadge(id){
  let color=QUEEN_REGION_COLORS[id%QUEEN_REGION_COLORS.length],label=tr('zone');
  return `<span class="queen-zone-ref"><span class="queen-zone-swatch" style="background:${color}" aria-hidden="true"></span>${label} ${id+1}</span>`
}

function queenCellAllowed(r,c){
  if(current.state[r][c]===1)return false;
  for(let rr=0;rr<current.n;rr++)for(let cc=0;cc<current.n;cc++)if(current.state[rr][cc]===2){
    if(rr===r||cc===c||current.reg[rr][cc]===current.reg[r][c]||(Math.abs(rr-r)<=1&&Math.abs(cc-c)<=1))return rr===r&&cc===c
  }
  return true
}

function queenDirectExclusionReason(r,c){
  for(let rr=0;rr<current.n;rr++)for(let cc=0;cc<current.n;cc++)if(current.state[rr][cc]===2){
    if(rr===r)return {technique:'Q_EXCLUSION_ROW',text:lang()==='fr'?`la ligne ${r+1} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`row ${r+1} already contains a queen at ${queenCellCoordinate(rr,cc)}.`};
    if(cc===c)return {technique:'Q_EXCLUSION_COLUMN',text:lang()==='fr'?`la colonne ${c+1} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`column ${c+1} already contains a queen at ${queenCellCoordinate(rr,cc)}.`};
    if(current.reg[rr][cc]===current.reg[r][c])return {technique:'Q_EXCLUSION_REGION',text:lang()==='fr'?`${queenZoneBadge(current.reg[r][c])} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`${queenZoneBadge(current.reg[r][c])} already contains a queen at ${queenCellCoordinate(rr,cc)}.`};
    if(Math.abs(rr-r)<=1&&Math.abs(cc-c)<=1)return {technique:'Q_EXCLUSION_ADJACENCY',text:lang()==='fr'?`${queenCellCoordinate(r,c)} est adjacente à la reine de ${queenCellCoordinate(rr,cc)}.`:`${queenCellCoordinate(r,c)} is adjacent to the queen at ${queenCellCoordinate(rr,cc)}.`};
  }
  return null
}

function findQueenLogicalHint(){
  let n=current.n,cands=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>queenCellAllowed(r,c)));
  // First expose direct X deductions if auto-cross is disabled or some X is missing.
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.state[r][c]===0&&!cands[r][c]){
    let reason=queenDirectExclusionReason(r,c);if(reason)return {r,c,v:1,rank:0,why:reason.text,technique:reason.technique}
  }
  function forcedFrom(cells,reasonFr,reasonEn,technique){
    let open=cells.filter(([r,c])=>cands[r][c]&&current.state[r][c]!==2),q=cells.filter(([r,c])=>current.state[r][c]===2);
    if(!q.length&&open.length===1)return {r:open[0][0],c:open[0][1],v:2,rank:0,why:lang()==='fr'?reasonFr:reasonEn,technique}
    return null
  }
  for(let r=0;r<n;r++){let h=forcedFrom(Array.from({length:n},(_,c)=>[r,c]),`toutes les autres cases de la ligne ${r+1} sont exclues`,`all other cells in row ${r+1} are excluded; only one queen position remains.`,'Q_UNIQUE_ROW');if(h)return h}
  for(let c=0;c<n;c++){let h=forcedFrom(Array.from({length:n},(_,r)=>[r,c]),`toutes les autres cases de la colonne ${c+1} sont exclues.`,`all other cells in column ${c+1} are excluded.`,'Q_UNIQUE_COLUMN');if(h)return h}
  let ids=[...new Set(current.reg.flat())];
  for(let id of ids){let cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.reg[r][c]===id)cells.push([r,c]);let h=forcedFrom(cells,`toutes les autres cases de ${queenZoneBadge(id)} sont exclues : cette zone n’a plus qu’une seule place possible pour sa reine.`,`all other cells in ${queenZoneBadge(id)} are excluded; only one queen position remains.`,'Q_UNIQUE_REGION');if(h)return h}
  return null
}

function queenStateContradiction(){
  if(queenIllegalCells().size)return true;
  let n=current.n;
  // Every row, column and region still needing a queen must retain >=1 legal cell.
  for(let r=0;r<n;r++){
    let q=false,open=false;for(let c=0;c<n;c++){if(current.state[r][c]===2)q=true;else if(queenCellAllowed(r,c))open=true}
    if(!q&&!open)return true
  }
  for(let c=0;c<n;c++){
    let q=false,open=false;for(let r=0;r<n;r++){if(current.state[r][c]===2)q=true;else if(queenCellAllowed(r,c))open=true}
    if(!q&&!open)return true
  }
  for(let id of [...new Set(current.reg.flat())]){
    let q=false,open=false;for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.reg[r][c]===id){if(current.state[r][c]===2)q=true;else if(queenCellAllowed(r,c))open=true}
    if(!q&&!open)return true
  }
  return false
}

function queenHintTimeout(){return {timeout:true}}

function findQueenRank1Hint(deadline=Infinity){
  let n=current.n;
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(hintBudgetExpired(deadline))return queenHintTimeout();else if(current.state[r][c]===0&&queenCellAllowed(r,c)){
    let queenBad=withTempCurrent(x=>{x.state[r][c]=2},()=>queenStateContradiction());
    let xBad=withTempCurrent(x=>{x.state[r][c]=1},()=>queenStateContradiction());
    if(hintBudgetExpired(deadline))return queenHintTimeout();
    if(queenBad!==xBad){
      let v=queenBad?1:2,rej=v===2?1:2,w;
      if(rej===2)w=queenRank1PlacementFailure(r,c);
      else w=withTempCurrent(x=>{x.state[r][c]=1},()=>{
        let n=current.n;
        for(let rr=0;rr<n;rr++){let q=current.state[rr].some(z=>z===2),open=[];for(let cc=0;cc<n;cc++)if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))open.push([rr,cc]);if(!q&&!open.length)return {text:lang()==='fr'?`la ligne ${rr+1} n'aurait plus aucune case disponible pour sa reine.`:`row ${rr+1} would have no cell left for its queen.`}}
        for(let cc=0;cc<n;cc++){let q=false,open=[];for(let rr=0;rr<n;rr++){if(current.state[rr][cc]===2)q=true;else if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))open.push([rr,cc])}if(!q&&!open.length)return {text:lang()==='fr'?`la colonne ${cc+1} n'aurait plus aucune case disponible pour sa reine.`:`column ${cc+1} would have no cell left for its queen.`}}
        for(let id of [...new Set(current.reg.flat())]){let q=false,open=[];for(let rr=0;rr<n;rr++)for(let cc=0;cc<n;cc++)if(current.reg[rr][cc]===id){if(current.state[rr][cc]===2)q=true;else if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))open.push([rr,cc])}if(!q&&!open.length)return {text:lang()==='fr'?`${queenZoneBadge(id)} n'aurait plus aucune case disponible pour sa reine.`:`${queenZoneBadge(id)} would have no cell left for its queen.`}}
        return null
      });
      let badText=w&&w.text?w.text:(lang()==='fr'?'une ligne, une colonne ou une zone deviendrait impossible.':'a row, column, or region would become impossible.');
      return {r,c,v,rank:1,
        hypothesis:lang()==='fr'?`essayons ${rej===2?'une reine ♛':'un X'} en ${queenCellCoordinate(r,c)}.`:`try ${rej===2?'a queen ♛':'an X'} at ${queenCellCoordinate(r,c)}.`,
        consequence:badText,
        deadend:lang()==='fr'?`ce choix ne permet donc pas de terminer la grille en respectant une reine par ligne, colonne et zone.`:`this choice cannot lead to a completed grid with one queen per row, column, and region.`,
        conclusion:lang()==='fr'?`${queenCellCoordinate(r,c)} doit donc contenir ${v===2?'une reine ♛':'un X'}.`:`${queenCellCoordinate(r,c)} must therefore contain ${v===2?'a queen ♛':'an X'}.`,
        why:null}
    }
  }
  return null
}

function queenPlacementRejectReason(r,c){
  if(current.state[r][c]===1)return lang()==='fr'?`${queenCellCoordinate(r,c)} est déjà barrée par X.`:`${queenCellCoordinate(r,c)} is already marked X.`;
  for(let rr=0;rr<current.n;rr++)for(let cc=0;cc<current.n;cc++)if(current.state[rr][cc]===2){
    if(rr===r)return lang()==='fr'?`la ligne ${r+1} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`row ${r+1} already contains a queen at ${queenCellCoordinate(rr,cc)}.`;
    if(cc===c)return lang()==='fr'?`la colonne ${c+1} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`column ${c+1} already contains a queen at ${queenCellCoordinate(rr,cc)}.`;
    if(current.reg[rr][cc]===current.reg[r][c])return lang()==='fr'?`${queenZoneBadge(current.reg[r][c])} contient déjà une reine en ${queenCellCoordinate(rr,cc)}.`:`${queenZoneBadge(current.reg[r][c])} already contains a queen at ${queenCellCoordinate(rr,cc)}.`;
    if(Math.abs(rr-r)<=1&&Math.abs(cc-c)<=1)return lang()==='fr'?`${queenCellCoordinate(r,c)} touche diagonalement la reine de ${queenCellCoordinate(rr,cc)}.`:`${queenCellCoordinate(r,c)} touches the queen at ${queenCellCoordinate(rr,cc)} diagonally.`;
  }
  return null
}

function queenRank1PlacementFailure(r,c){
  // Called while testing a queen in r,c. Explain the first unit that becomes impossible.
  return withTempCurrent(x=>{x.state[r][c]=2},()=>{
    if(queenIllegalCells().size)return {text:queenPlacementRejectReason(r,c)|| (lang()==='fr'?'ce placement crée un conflit de reines.':'this placement creates a queen conflict.')};
    let n=current.n;
    for(let rr=0;rr<n;rr++){
      if(current.state[rr].some(v=>v===2))continue;
      let possible=[];
      for(let cc=0;cc<n;cc++)if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))possible.push([rr,cc]);
      if(!possible.length)return {type:'row',i:rr,text:lang()==='fr'?`la ligne ${rr+1} n'aurait alors plus aucune case où placer sa reine.`:`row ${rr+1} would then have no cell left for its queen.`}
    }
    for(let cc=0;cc<n;cc++){
      let has=false;for(let rr=0;rr<n;rr++)if(current.state[rr][cc]===2)has=true;if(has)continue;
      let possible=[];for(let rr=0;rr<n;rr++)if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))possible.push([rr,cc]);
      if(!possible.length)return {type:'col',i:cc,text:lang()==='fr'?`la colonne ${cc+1} n'aurait alors plus aucune case où placer sa reine.`:`column ${cc+1} would then have no cell left for its queen.`}
    }
    for(let id of [...new Set(current.reg.flat())]){
      let has=false,cells=[];for(let rr=0;rr<n;rr++)for(let cc=0;cc<n;cc++)if(current.reg[rr][cc]===id){if(current.state[rr][cc]===2)has=true;else if(current.state[rr][cc]===0&&queenCellAllowed(rr,cc))cells.push([rr,cc])}
      if(!has&&!cells.length)return {type:'region',i:id,text:lang()==='fr'?`${queenZoneBadge(id)} n'aurait alors plus aucune case où placer sa reine.`:`${queenZoneBadge(id)} would then have no cell left for its queen.`}
    }
    return null
  })
}

function queenUnitViableWithRank1(){
  let n=current.n;
  function inspect(cells,type,i){
    let candidates=cells.filter(([r,c])=>current.state[r][c]===0&&queenCellAllowed(r,c));
    let failures=[];
    for(let [r,c] of candidates){
      let failure=queenRank1PlacementFailure(r,c);
      if(!failure)return null; // at least one continuation survives
      failures.push({r,c,text:failure.text});
    }
    if(!candidates.length||failures.length===candidates.length)return {type,i,candidates,failures}
    return null
  }
  for(let r=0;r<n;r++){
    if(current.state[r].some(v=>v===2))continue;
    let w=inspect(Array.from({length:n},(_,c)=>[r,c]),'row',r);if(w)return w
  }
  for(let c=0;c<n;c++){
    let has=false;for(let r=0;r<n;r++)if(current.state[r][c]===2)has=true;if(has)continue;
    let w=inspect(Array.from({length:n},(_,r)=>[r,c]),'col',c);if(w)return w
  }
  for(let id of [...new Set(current.reg.flat())]){
    let cells=[],has=false;for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.reg[r][c]===id){cells.push([r,c]);if(current.state[r][c]===2)has=true}
    if(has)continue;let w=inspect(cells,'region',id);if(w)return w
  }
  return null
}

function queenUnitName(u){
  return lang()==='fr'
    ?(u.type==='row'?`la ligne ${u.i+1}`:u.type==='col'?`la colonne ${u.i+1}`:`la ${queenZoneBadge(u.i)}`)
    :(u.type==='row'?`row ${u.i+1}`:u.type==='col'?`column ${u.i+1}`:`the ${queenZoneBadge(u.i)}`)
}

function queenUnresolvedUnits(){
  let n=current.n,out=[];
  for(let r=0;r<n;r++)if(!current.state[r].some(v=>v===2)){let cells=[];for(let c=0;c<n;c++)if(current.state[r][c]===0&&queenCellAllowed(r,c))cells.push([r,c]);out.push({type:'row',i:r,cells})}
  for(let c=0;c<n;c++){let has=false,cells=[];for(let r=0;r<n;r++){if(current.state[r][c]===2)has=true;else if(current.state[r][c]===0&&queenCellAllowed(r,c))cells.push([r,c])}if(!has)out.push({type:'col',i:c,cells})}
  for(let id of [...new Set(current.reg.flat())]){let has=false,cells=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.reg[r][c]===id){if(current.state[r][c]===2)has=true;else if(current.state[r][c]===0&&queenCellAllowed(r,c))cells.push([r,c])}if(!has)out.push({type:'region',i:id,cells})}
  out.sort((a,b)=>a.cells.length-b.cells.length);return out
}

function queenImmediateContradictionDetail(){
  if(queenIllegalCells().size)return lang()==='fr'?'deux reines entrent immédiatement en conflit.':'two queens immediately conflict.';
  for(let u of queenUnresolvedUnits())if(!u.cells.length)return lang()==='fr'?`${queenUnitName(u)} n’a plus aucune case disponible pour sa reine.`:`${queenUnitName(u)} has no cell left for its queen.`;
  return lang()==='fr'?'les contraintes deviennent immédiatement impossibles.':'the constraints immediately become impossible.';
}

function queenBoundedContradiction(depth,deadline){
  if(hintBudgetExpired(deadline))return queenHintTimeout();
  if(queenStateContradiction())return {bad:true,reason:queenImmediateContradictionDetail()};
  if(depth<=0)return null;
  let units=queenUnresolvedUnits().filter(u=>u.cells.length);
  // Most-constrained units first. Testing at most the first 4 keeps the proof bounded and responsive.
  for(let u of units.slice(0,4)){
    if(hintBudgetExpired(deadline))return queenHintTimeout();
    let failures=[],allBad=true;
    for(let [r,c] of u.cells){
      if(hintBudgetExpired(deadline))return queenHintTimeout();
      let child=withTempCurrent(x=>{x.state[r][c]=2},()=>queenBoundedContradiction(depth-1,deadline));
      if(child?.timeout)return child;
      if(!child?.bad){allBad=false;break}
      failures.push({r,c,child})
    }
    if(allBad&&failures.length===u.cells.length)return {bad:true,unit:u,failures}
  }
  return null
}

function queenRank3BranchSummary(w){
  if(!w)return '';
  if(w.reason)return w.reason;
  let unit=queenUnitName(w.unit),items=(w.failures||[]).slice(0,5).map(f=>{
    let child=f.child,why=child?.reason||(child?.unit?(lang()==='fr'?`${queenUnitName(child.unit)} devient à son tour impossible.`:`${queenUnitName(child.unit)} then becomes impossible.`):(lang()==='fr'?'la branche conduit à une impasse.':'the branch reaches a dead end.'));
    return `• ${queenCellCoordinate(f.r,f.c)} : ${why}`
  });
  return (lang()==='fr'?`${unit} doit recevoir une reine. Testons ses positions possibles :`:`${unit} must receive a queen. Test its possible positions:`)+`<br>${items.join('<br>')}`
}

function findQueenRank3Hint(deadline=Infinity){
  let n=current.n;
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    if(hintBudgetExpired(deadline))return queenHintTimeout();
    if(current.state[r][c]!==0||!queenCellAllowed(r,c))continue;
    let candidates=[1,2],results={};
    for(let v of candidates){
      if(hintBudgetExpired(deadline))return queenHintTimeout();
      let w=withTempCurrent(x=>{x.state[r][c]=v},()=>queenBoundedContradiction(2,deadline));
      if(w?.timeout)return w;results[v]=w
    }
    let bad=candidates.filter(v=>results[v]?.bad),good=candidates.filter(v=>!results[v]?.bad);
    if(good.length===1&&bad.length===1){
      let v=good[0],rej=bad[0],w=results[rej],first=w.unit?queenUnitName(w.unit):(lang()==='fr'?'une contrainte obligatoire':'a required constraint');
      return {r,c,v,rank:3,
        hypothesis:lang()==='fr'?`essayons ${rej===2?'une reine ♛':'un X'} en ${queenCellCoordinate(r,c)}.`:`try ${rej===2?'a queen ♛':'an X'} at ${queenCellCoordinate(r,c)}.`,
        consequence:lang()==='fr'?`cette hypothèse oblige ensuite à résoudre ${first}.`:`this assumption then forces us to resolve ${first}.`,
        secondStep:queenRank3BranchSummary(w),
        deadend:lang()==='fr'?`toutes les continuations testées à ce niveau conduisent à une impasse. L’hypothèse de départ est donc impossible.`:`every continuation tested at this level reaches a dead end. The initial assumption is impossible.`,
        conclusion:lang()==='fr'?`${queenCellCoordinate(r,c)} doit donc contenir ${v===2?'une reine ♛':'un X'}.`:`${queenCellCoordinate(r,c)} must therefore contain ${v===2?'a queen ♛':'an X'}.`,
        why:null}
    }
  }
  return null
}

function findQueenRank2Hint(deadline=Infinity){
  let n=current.n;
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(hintBudgetExpired(deadline))return queenHintTimeout();else if(current.state[r][c]===0&&queenCellAllowed(r,c)){
    let opts=[1,2],surviving=opts.filter(v=>!withTempCurrent(x=>{x.state[r][c]=v},()=>queenStateContradiction()));
    if(surviving.length<2)continue;
    let bad=[],witness={};
    for(let v of surviving){
      let w=withTempCurrent(x=>{x.state[r][c]=v},()=>queenUnitViableWithRank1());
      if(hintBudgetExpired(deadline))return queenHintTimeout();
      if(w){bad.push(v);witness[v]=w}
    }
    let good=surviving.filter(v=>!bad.includes(v));
    if(good.length===1&&bad.length){
      let v=good[0],rej=bad[0],w=witness[rej],unit=queenUnitName(w);
      let details=(w.failures||[]).map(f=>`• ${queenCellCoordinate(f.r,f.c)} : ${f.text}`).join('<br>');
      if(!details)details=lang()==='fr'?`aucune case n'y reste disponible pour une reine.`:`no cell remains available there for a queen.`;
      return {r,c,v,rank:2,
        hypothesis:lang()==='fr'?`essayons ${rej===2?'une reine ♛':'un X'} en ${queenCellCoordinate(r,c)}.`:`try ${rej===2?'a queen ♛':'an X'} at ${queenCellCoordinate(r,c)}.`,
        consequence:lang()==='fr'?`avec cette hypothèse, regardons ${unit}. Les emplacements de reine qui restent apparemment possibles sont testés un par un :<br>${details}`:`with that assumption, look at ${unit}. Each apparently possible queen position is tested:<br>${details}`,
        deadend:lang()==='fr'?`aucun de ces emplacements ne permet de continuer. ${unit} finirait donc sans aucune position possible pour sa reine.`:`none of these positions allows the puzzle to continue. ${unit} would therefore be left with no possible queen position.`,
        conclusion:lang()==='fr'?`${pieceName('queens',rej)} est impossible en ${queenCellCoordinate(r,c)} ; il faut ${v===2?'y placer une reine ♛':'barrer cette case par X'}.`:`${pieceName('queens',rej)} is impossible at ${queenCellCoordinate(r,c)}; ${v===2?'place a queen ♛ there':'mark that cell X'}.`,
        why:null}
    }
  }
  return null
}

function queenHintNoResultMessage(elapsedMs){
  if(!DETAILED_HINT_LANGS.has(lang()))return `<b>${tr('noLogicalHint')}</b><br>${tr('hintNoR0')}<br>${tr('hintNoR1')}<br>${tr('hintNoR2')}<br>${tr('hintNoR3')}`;
  let e=(elapsedMs/1000).toFixed(2).replace('.',lang()==='fr'?',':'.');
  return lang()==='fr'
    ?`<b>Aucun indice trouvé jusqu’au rang 3.</b><br>${tr('hintNoR0')}<br>${tr('hintNoR1')}<br>${tr('hintNoR2')}<br>${tr('hintNoR3')}<br><small>Recherche terminée en ${e} s. Cela ne signifie pas que la grille est bloquée : seulement qu’aucun coup n’est forcé à cette profondeur.</small>`
    :`<b>No hint found through rank 3.</b><br>${tr('hintNoR0')}<br>${tr('hintNoR1')}<br>${tr('hintNoR2')}<br>${tr('hintNoR3')}<br><small>Search completed in ${e} s. This does not mean the puzzle is stuck; only that no move is forced at this depth.</small>`
}

function queenHintTimeoutMessage(stage,elapsedMs){
  if(!DETAILED_HINT_LANGS.has(lang()))return `<b>${tr('hintTimeout')}</b>`;
  let e=(elapsedMs/1000).toFixed(2).replace('.',lang()==='fr'?',':'.');
  return lang()==='fr'
    ?`<b>Recherche arrêtée après ${e} s.</b><br>Les rangs précédents ont été testés sans trouver d’indice. La limite de 5 secondes a été atteinte pendant le <b>rang ${stage}</b> ; ce niveau n’a donc pas été exploré complètement. Aucun indice non démontré n’est affiché.`
    :`<b>Search stopped after ${e} s.</b><br>Earlier ranks were tested without finding a hint. The 5-second limit was reached during <b>rank ${stage}</b>, so that level was not fully explored. No unproved hint is shown.`
}

let queenHintSearchToken=0;

function hintQ(){
  if(current?.training)return trainingCoach();
  if(paused){showHintNotice(tr('hintPaused'));return}
  if(!current||current.game!=='queens'){showHintNotice(tr('noLogicalHint'));return}
  if(showVisibleErrorsBeforeHint())return;
  if(showExplorationContradictionBeforeHint())return;
  let token=++queenHintSearchToken;showHintNotice(tr('hintSearching'));
  setTimeout(()=>{
    if(token!==queenHintSearchToken||!current||current.game!=='queens')return;
    try{
      let result=queenCurrentLogicResult();
      if(result.contradiction){queenShowLogicalContradiction(result.contradiction);return}
      if(!result.deduction){showHintNotice(`<b>${tr('noLogicalHint')}</b><br>${tr('qlNoDeduction')}`);return}
      queenCoachHandleDeduction(result.deduction)
    }catch(err){console.error('Queens proof engine failed',err);showHintNotice(`<b>${tr('hintError')}</b>`)}
  },0)
}

function queenLogicalComplete(){
  if(!current||current.game!=='queens')return false;
  let n=current.n,queens=[];
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(current.state[r][c]===2)queens.push([r,c]);
  if(queens.length!==n)return false;
  if(new Set(queens.map(x=>x[0])).size!==n||new Set(queens.map(x=>x[1])).size!==n)return false;
  if(new Set(queens.map(([r,c])=>current.reg[r][c])).size!==n)return false;
  return !queenStateContradiction()
}

if(typeof globalThis!=='undefined')globalThis.QuadludQueensRuntime=Object.freeze({VERSION:2,regionColors:Object.freeze([...QUEEN_REGION_COLORS]),extractPedagogicalExercise:extractQueenPedagogicalExercise});
