/*
 * QUADLUD — Sudoku specialized Web runtime
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 * REF-2: game-specific Web/pedagogy helpers extracted from app.js without behavioral change.
 */
'use strict';

function sudokuIllegalCells(){
  let bad=new Set(),s=current.state;
  function dup(cells){let by={};for(let [r,c] of cells){let v=s[r][c];if(!v)continue;(by[v]??=[]).push([r,c])}for(let a of Object.values(by))if(a.length>1)a.forEach(x=>bad.add(keyCell(...x)))}
  for(let r=0;r<6;r++)dup(Array.from({length:6},(_,c)=>[r,c]));for(let c=0;c<6;c++)dup(Array.from({length:6},(_,r)=>[r,c]));
  for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let a=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)a.push([r,c]);dup(a)}
  return bad
}

function sudokuErrorFromAction(action){
  let bad=sudokuIllegalCells();
  for(let ch of changedTargets(action)){
    let r=ch.row,c=ch.column,v=current.state[r]?.[c];if(!v||!bad.has(keyCell(r,c)))continue;
    for(let cc=0;cc<6;cc++)if(cc!==c&&current.state[r][cc]===v)return {rule:'S_ROW_DUPLICATE',cells:[[r,c],[r,cc]],target:[r,c],other:[r,cc],value:v};
    for(let rr=0;rr<6;rr++)if(rr!==r&&current.state[rr][c]===v)return {rule:'S_COLUMN_DUPLICATE',cells:[[r,c],[rr,c]],target:[r,c],other:[rr,c],value:v};
    let br=Math.floor(r/2)*2,bc=Math.floor(c/3)*3;
    for(let rr=br;rr<br+2;rr++)for(let cc=bc;cc<bc+3;cc++)if((rr!==r||cc!==c)&&current.state[rr][cc]===v)return {rule:'S_BOX_DUPLICATE',cells:[[r,c],[rr,cc]],target:[r,c],other:[rr,cc],value:v}
  }
  return null
}

function sudokuVisibleErrors(){
  let out=[],s=current.state;
  function duplicateErrors(cells,rule){
    let by={};for(let [r,c] of cells){let v=s[r][c];if(!v)continue;(by[v]??=[]).push([r,c])}
    for(let [v,a] of Object.entries(by))if(a.length>1)for(let i=1;i<a.length;i++)out.push(normalizeVisibleError({rule,cells:[a[0],a[i]],target:a[i],other:a[0],value:Number(v)}))
  }
  for(let r=0;r<6;r++)duplicateErrors(Array.from({length:6},(_,c)=>[r,c]),'S_ROW_DUPLICATE');
  for(let c=0;c<6;c++)duplicateErrors(Array.from({length:6},(_,r)=>[r,c]),'S_COLUMN_DUPLICATE');
  for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let cells=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)cells.push([r,c]);duplicateErrors(cells,'S_BOX_DUPLICATE')}
  return out
}

function trainingSetSudokuBase(g,diff){current={game:'sudoku',diff,n:6,sol:g.sol,empty:new Set(Array.from({length:36},(_,i)=>i)),difficultyProfile:g.difficultyProfile,generationStats:g.generationStats,state:Array.from({length:6},()=>Array(6).fill(0)),sel:null,generated:true,unique:true,completed:false,training:true}}

function trainingSudokuDirectHint(id){
  if(!current||current.game!=='sudoku')return null;
  if(id==='S_NAKED_SINGLE'){
    for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.empty.has(r*6+c)&&current.state[r][c]===0){let cand=sudokuCandidatesAt(r,c);if(cand.length===1)return {r,c,v:cand[0],rank:0,technique:id,why:lang()==='fr'?`après élimination par la ligne, la colonne et le bloc 2×3, seul ${cand[0]} reste possible.`:`after elimination by the row, column and 2×3 box, only ${cand[0]} remains possible.`}}
    return null
  }
  let units=[];
  if(id==='S_HIDDEN_ROW')for(let r=0;r<6;r++)units.push({cells:Array.from({length:6},(_,c)=>[r,c]),nameFr:`la ligne ${r+1}`,nameEn:`row ${r+1}`});
  else if(id==='S_HIDDEN_COLUMN')for(let c=0;c<6;c++)units.push({cells:Array.from({length:6},(_,r)=>[r,c]),nameFr:`la colonne ${c+1}`,nameEn:`column ${c+1}`});
  else if(id==='S_HIDDEN_BOX')for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let cells=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)cells.push([r,c]);units.push({cells,nameFr:`le bloc ${Math.floor(br/2)+1}-${Math.floor(bc/3)+1}`,nameEn:`the 2×3 box at rows ${br+1}-${br+2}, columns ${bc+1}-${bc+3}`})}
  for(let u of units)for(let v=1;v<=6;v++){let places=u.cells.filter(([r,c])=>current.state[r][c]===0&&sudokuCandidatesAt(r,c).includes(v));if(places.length===1){let [r,c]=places[0],cand=sudokuCandidatesAt(r,c);if(cand.length>1)return {r,c,v,rank:0,technique:id,why:lang()==='fr'?`${v} n’a qu’une seule position possible dans ${u.nameFr}.`:`${v} has only one possible position in ${u.nameEn}.`}}}
  return null
}

function trainingBuildSudokuDirect(id,deadline){
  for(let a=0;a<4&&WebPlatform.clock.nowMs()<deadline;a++){
    let g=sudokuCandidate('medium');
    if(id==='S_NAKED_SINGLE'){
      for(let r=0;r<6;r++)for(let target=0;target<6;target++){trainingSetSudokuBase(g,'medium');current.empty=new Set();for(let rr=0;rr<6;rr++)for(let c=0;c<6;c++)if(rr!==r||c===target)current.empty.add(rr*6+c);current.state=Array.from({length:6},()=>Array(6).fill(0));for(let c=0;c<6;c++)if(c!==target)current.state[r][c]=g.sol[r][c];let h=trainingHintForId(id,deadline);if(h)return h}
    }else{
      for(let k=0;k<500&&WebPlatform.clock.nowMs()<deadline;k++){
        trainingSetSudokuBase(g,'medium');let holes=12+Math.floor(Math.random()*16),idx=shuffle(Array.from({length:36},(_,i)=>i)).slice(0,holes);current.empty=new Set(idx);current.state=g.sol.map((row,r)=>row.map((v,c)=>current.empty.has(r*6+c)?0:v));let h=trainingHintForId(id,deadline);if(h)return h
      }
    }
  }
  return null
}

function sudokuReasoningPresenter(){return reasoningPresenter(globalThis.QuadludSudokuReasoningPresenter.GAME)}

function sudokuLogicAvailable(){return typeof SudokuLogic!=='undefined'&&SudokuLogic?.createSession}

function sudokuLogicBoard(c=current,state=null){return {state:cloneGrid(state||c.state)}}

function sudokuLogicSession(c=current,state=null){if(!sudokuLogicAvailable())throw new Error('Grille 6 inference engine unavailable');return SudokuLogic.createSession(sudokuLogicBoard(c,state))}

function sudokuFormat(key,vars={}){return String(tr(key)||key).replace(/\{([A-Za-z0-9_]+)\}/g,(_,k)=>vars[k]??'')}

function sudokuUnitHuman(ref){if(!ref)return '';let name=ref.family==='row'?`${tr('rowLabel')} ${Number(ref.id)+1}`:ref.family==='column'?`${tr('columnLabel')} ${Number(ref.id)+1}`:`${tr('slgBox')} ${Number(ref.id)+1}`;if(lang()!=='fr')return name;return ref.family==='row'?`la ${name}`:ref.family==='column'?`la ${name}`:`le ${name}`}

function sudokuUnitCells(ref){if(!ref)return [];if(ref.family==='row')return Array.from({length:6},(_,c)=>[Number(ref.id),c]);if(ref.family==='column')return Array.from({length:6},(_,r)=>[r,Number(ref.id)]);let br=Math.floor(Number(ref.id)/2)*2,bc=(Number(ref.id)%2)*3,out=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)out.push([r,c]);return out}

function sudokuCellListHuman(cells,limit=8){let names=(cells||[]).map(c=>cellName(...c));return names.length<=limit?names.join(', '):names.slice(0,limit).join(', ')+` (+${names.length-limit})`}

function sudokuCurrentValueStep(){let session=sudokuLogicSession();return {session,...session.nextValueStep()}}

function sudokuShowLogicalContradiction(w){current.hintFlow=null;clearHintFocus();let b=$('#sboard');if(b)for(let cell of w?.cells||[]){let el=b.children[cell[0]*6+cell[1]];if(el)el.classList.add('error-focus')}showHintNotice(`<b>⚠ ${tr('contradictionFound')}</b><br>${sudokuReasoningPresenter().contradictionText(w)}`);return true}

function sudokuDirectTechniqueAt(r,c,v){
  let cand=sudokuCandidatesAt(r,c);if(cand.length===1&&cand[0]===v)return 'S_NAKED_SINGLE';
  let units=[
    ['S_HIDDEN_ROW',Array.from({length:6},(_,cc)=>[r,cc])],
    ['S_HIDDEN_COLUMN',Array.from({length:6},(_,rr)=>[rr,c])]
  ],br=Math.floor(r/2)*2,bc=Math.floor(c/3)*3,box=[];for(let rr=br;rr<br+2;rr++)for(let cc=bc;cc<bc+3;cc++)box.push([rr,cc]);units.push(['S_HIDDEN_BOX',box]);
  for(let [id,cells] of units){let places=cells.filter(([rr,cc])=>current.state[rr][cc]===0&&current.empty.has(rr*6+cc)&&sudokuCandidatesAt(rr,cc).includes(v));if(places.length===1&&places[0][0]===r&&places[0][1]===c)return id}
  return null
}

function justifySudokuAt(r,c,v){
  if(!sudokuLogicAvailable())return proofResult('unknown',null,null,[r,c],{logicalStatus:'engine-unavailable'});
  let p=sudokuLogicSession().proveValue([r,c],v),d=p.deduction||null,presenter=sudokuReasoningPresenter(),view=p.status==='proven'&&d?presenter.presentProof(p,current.state):null,reasoning=d?presenter.legacyProofReasoning(p):null,detail={logicalStatus:p.status,reason:p.reason||null,provenValue:p.provenValue??null,fact:p.fact?JSON.parse(JSON.stringify(p.fact)):null,contradiction:p.contradiction?JSON.parse(JSON.stringify(p.contradiction)):null,deduction:reasoning,metrics:p.metrics?JSON.parse(JSON.stringify(p.metrics)):null};
  if(p.status==='proven'){let x=proofResult('justified',view?.technique??null,view?.metadata?.coachRank??0,[r,c],detail);x.logicalStatus='proven';return x}
  let outer=p.status==='contradictory'?'unknown':'unjustified',x=proofResult(outer,d?presenter.techniqueForDeduction(d):null,d?presenter.coachRank(d):null,[r,c],detail);x.logicalStatus=p.status;return x
}

function walkthroughGenerateSudokuNext(){
  let s=walkthroughSession;if(!s||s.base.game!=='sudoku'||s.done||s.stalled)return false;
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;return false}
  let session=sudokuLogicSession(s.work,s.work.state),result=session.nextValueStep();
  if(result.contradiction){s.stalled=true;s.logicContradiction=result.contradiction;s.sudokuStatus='contradiction';s.metrics=result.metrics;return false}
  let value=sudokuReasoningPresenter().valueStepConclusion(result);
  if(!value){s.stalled=true;s.sudokuStatus=result.status||'blocked';s.metrics=result.metrics;return false}
  let [r,c]=value.cell;if(s.work.state[r][c]!==0){s.stalled=true;s.sudokuStatus='invalid-value-target';return false}
  let beforeSnapshot=walkthroughSnapshot(s.work),primary=result.primaryDeduction||result.deduction,presenter=sudokuReasoningPresenter(),presentation=presenter.presentValueStep(result,beforeSnapshot.state),reasoning=presenter.legacyValueStepReasoning(result),valueStep={status:result.status,contradiction:null,deduction:JSON.parse(JSON.stringify(result.deduction)),primaryDeduction:JSON.parse(JSON.stringify(primary)),supportingDeductions:JSON.parse(JSON.stringify(result.supportingDeductions||[])),logicalSteps:result.logicalSteps,metrics:JSON.parse(JSON.stringify(result.metrics||{}))};
  s.work.state[r][c]=value.value;
  let info={
    rule:presentation.rule,technique:presentation.technique,rank:presentation.metadata.coachRank,techniqueLevel:presentation.techniqueLevel,target:[r,c],
    presentation,deduction:reasoning,logicDeduction:JSON.parse(JSON.stringify(primary)),finalDeduction:JSON.parse(JSON.stringify(result.deduction)),supportingDeductions:JSON.parse(JSON.stringify(result.supportingDeductions||[])),valueStep,
    where:presentation.explanation.where,why:presentation.explanation.why,move:`${value.value} · ${cellName(r,c)}`,automatic:[],metrics:JSON.parse(JSON.stringify(result.metrics||{})),beforeSnapshot
  };
  info.snapshot=walkthroughSnapshot(s.work);s.moves.push(info);s.sudokuStatus='value';s.metrics=info.metrics;
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length}
  return true
}

function sudokuCandidatesAt(r,c){
  let s=new Set([1,2,3,4,5,6]);for(let i=0;i<6;i++){s.delete(current.state[r][i]);s.delete(current.state[i][c])}
  let br=Math.floor(r/2)*2,bc=Math.floor(c/3)*3;for(let rr=br;rr<br+2;rr++)for(let cc=bc;cc<bc+3;cc++)s.delete(current.state[rr][cc]);return [...s]
}

function findSudokuLogicalHint(){
  let empties=[];for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.empty.has(r*6+c)&&current.state[r][c]===0)empties.push([r,c]);
  for(let [r,c] of empties){let cand=sudokuCandidatesAt(r,c);if(cand.length===1)return {r,c,v:cand[0],technique:'S_NAKED_SINGLE',why:lang()==='fr'?`après élimination par la ligne, la colonne et le bloc 2×3, seul ${cand[0]} reste possible.`:`after elimination by the row, column and 2×3 box, only ${cand[0]} remains possible.`}}
  let units=[];for(let r=0;r<6;r++)units.push({cells:Array.from({length:6},(_,c)=>[r,c]),nameFr:`la ligne ${r+1}`,nameEn:`row ${r+1}`,technique:'S_HIDDEN_ROW'});for(let c=0;c<6;c++)units.push({cells:Array.from({length:6},(_,r)=>[r,c]),nameFr:`la colonne ${c+1}`,nameEn:`column ${c+1}`,technique:'S_HIDDEN_COLUMN'});
  for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let cells=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)cells.push([r,c]);units.push({cells,nameFr:`le bloc ${Math.floor(br/2)+1}-${Math.floor(bc/3)+1}`,nameEn:`the 2×3 box at rows ${br+1}-${br+2}, columns ${bc+1}-${bc+3}`,technique:'S_HIDDEN_BOX'})}
  for(let u of units)for(let v=1;v<=6;v++){let places=u.cells.filter(([r,c])=>current.state[r][c]===0&&sudokuCandidatesAt(r,c).includes(v));if(places.length===1){let [r,c]=places[0];return {r,c,v,technique:u.technique,why:lang()==='fr'?`${v} n’a qu’une seule position possible dans ${u.nameFr}.`:`${v} has only one possible position in ${u.nameEn}.`}}}
  return null
}

function sudokuImmediateContradiction(){
  if(sudokuIllegalCells().size)return true;
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===0&&sudokuCandidatesAt(r,c).length===0)return true;
  // Every missing digit in every unit must still have a possible position.
  let units=[];for(let r=0;r<6;r++)units.push(Array.from({length:6},(_,c)=>[r,c]));for(let c=0;c<6;c++)units.push(Array.from({length:6},(_,r)=>[r,c]));
  for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let a=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)a.push([r,c]);units.push(a)}
  for(let u of units)for(let v=1;v<=6;v++){
    if(u.some(([r,c])=>current.state[r][c]===v))continue;
    if(!u.some(([r,c])=>current.state[r][c]===0&&sudokuCandidatesAt(r,c).includes(v)))return true
  }
  return false
}

function sudokuContradictionDetail(){
  if(sudokuIllegalCells().size)return lang()==='fr'?'un chiffre est en conflit direct avec sa ligne, sa colonne ou son bloc.':'a digit directly conflicts with its row, column, or box.';
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===0&&sudokuCandidatesAt(r,c).length===0)return lang()==='fr'?`${cellName(r,c)} n'aurait plus aucun chiffre possible.`:`${cellName(r,c)} would have no possible digit left.`;
  let units=[];for(let r=0;r<6;r++)units.push({name:lang()==='fr'?`la ligne ${r+1}`:`row ${r+1}`,cells:Array.from({length:6},(_,c)=>[r,c])});
  for(let c=0;c<6;c++)units.push({name:lang()==='fr'?`la colonne ${c+1}`:`column ${c+1}`,cells:Array.from({length:6},(_,r)=>[r,c])});
  for(let br=0;br<6;br+=2)for(let bc=0;bc<6;bc+=3){let a=[];for(let r=br;r<br+2;r++)for(let c=bc;c<bc+3;c++)a.push([r,c]);units.push({name:lang()==='fr'?`le bloc L${br+1}-${br+2}/C${bc+1}-${bc+3}`:`box R${br+1}-${br+2}/C${bc+1}-${bc+3}`,cells:a})}
  for(let u of units)for(let v=1;v<=6;v++)if(!u.cells.some(([r,c])=>current.state[r][c]===v)&&!u.cells.some(([r,c])=>current.state[r][c]===0&&sudokuCandidatesAt(r,c).includes(v)))return lang()==='fr'?`le chiffre ${v} n'aurait plus aucun emplacement possible dans ${u.name}.`:`digit ${v} would have no possible place in ${u.name}.`;
  return lang()==='fr'?'les contraintes du Sudoku deviendraient impossibles.':'the Sudoku constraints would become impossible.';
}

function findSudokuRank1Hint(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===0&&current.empty.has(r*6+c)){
    let cand=sudokuCandidatesAt(r,c);if(cand.length<2)continue;
    let good=[],bad=[],details={};
    for(let v of cand){let contradiction=withTempCurrent(x=>{x.state[r][c]=v},()=>sudokuImmediateContradiction());(contradiction?bad:good).push(v);if(contradiction)details[v]=withTempCurrent(x=>{x.state[r][c]=v},()=>sudokuContradictionDetail())}
    if(good.length===1&&bad.length){
      let lines=bad.map(v=>`• ${v} : ${details[v]}`).join('<br>');
      return {r,c,v:good[0],rank:1,
        hypothesis:lang()==='fr'?`${cellName(r,c)} accepte d'abord les candidats ${cand.join(', ')}. Testons les autres possibilités.`:`${cellName(r,c)} initially allows candidates ${cand.join(', ')}. Test the alternatives.`,
        consequence:lines,
        deadend:lang()==='fr'?`tous les candidats sauf ${good[0]} créent immédiatement une impossibilité.`:`every candidate except ${good[0]} immediately creates an impossibility.`,
        conclusion:lang()==='fr'?`${cellName(r,c)} doit donc contenir ${good[0]}.`:`${cellName(r,c)} must therefore contain ${good[0]}.`,
        why:null}
    }
  }return null
}

function sudokuRank2WitnessAfterAssumption(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===0){
    let cand=sudokuCandidatesAt(r,c),viable=[];
    for(let v of cand){
      let bad=withTempCurrent(x=>{x.state[r][c]=v},()=>sudokuImmediateContradiction());
      if(!bad)viable.push(v)
    }
    if(!viable.length)return {r,c,detail:lang()==='fr'
      ?`${cellName(r,c)} n'a plus aucun chiffre possible.`
      :`${cellName(r,c)} has no possible digit left.`}
  }
  return null
}

function findSudokuRank2Hint(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===0&&current.empty.has(r*6+c)){
    let cand=sudokuCandidatesAt(r,c);if(cand.length<2)continue;
    let surviving=cand.filter(v=>!withTempCurrent(x=>{x.state[r][c]=v},()=>sudokuImmediateContradiction()));
    if(surviving.length<2)continue;
    let bad=[],witness={};
    for(let v of surviving){
      let w=withTempCurrent(x=>{x.state[r][c]=v},()=>sudokuRank2WitnessAfterAssumption());
      if(w){bad.push(v);witness[v]=w}
    }
    let good=surviving.filter(v=>!bad.includes(v));
    if(good.length===1&&bad.length){
      let v=good[0],rej=bad[0],w=witness[rej];
      return {r,c,v,rank:2,
        hypothesis:lang()==='fr'?`supposons ${cellName(r,c)} = ${rej}.`:`suppose ${cellName(r,c)} = ${rej}.`,
        consequence:lang()==='fr'?`on recalcule les candidats des cases voisines et des unités concernées.`:`we recompute candidates in the affected cells and units.`,
        deadend:w.detail,
        conclusion:lang()==='fr'?`${rej} est impossible en ${cellName(r,c)} ; le chiffre ${v} est imposé.`:`${rej} is impossible at ${cellName(r,c)}; digit ${v} is forced.`,
        why:null}
    }
  }
  return null
}

function hintS(){if(current?.training)return trainingCoach();if(paused)return;if(showVisibleErrorsBeforeHint())return;if(showExplorationContradictionBeforeHint())return;try{let result=sudokuCurrentValueStep();if(result.contradiction)return sudokuShowLogicalContradiction(result.contradiction);let presenter=sudokuReasoningPresenter(),view=presenter.presentValueStep(result,current.state);if(!view)return showHintNotice(`<b>${tr('noLogicalHint')}</b><br>${tr('slgNoDeduction')}`);let target=view.action.target,[r,c]=[target.row,target.column],reasoning=presenter.legacyValueStepReasoning(result);hintStage('sudoku',[r,c],{move:view.explanation.move,look:view.explanation.where,why:view.explanation.why,reveal:tr('digitRevealed'),rank:view.metadata.coachRank,value:view.action.value,reasoning},()=>{current.state[r][c]=view.action.value;current.sel=[r,c];drawGameUi();maybeAutoFinish()})}catch(err){console.error('Grille 6 proof engine failed',err);showHintNotice(`<b>${tr('hintError')}</b>`)}}
