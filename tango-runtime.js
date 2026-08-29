/*
 * QUADLUD — Tango specialized Web runtime
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 * REF-2: game-specific Web/pedagogy helpers extracted from app.js without behavioral change.
 */
'use strict';

function tangoIllegalCells(ignoreKey=null){
  let bad=new Set(),n=6,s=current.state,hasIgnore=cells=>ignoreKey&&cells.some(x=>keyCell(...x)===ignoreKey);
  for(let r=0;r<n;r++){
    for(let v=0;v<=1;v++){let cells=[];for(let c=0;c<n;c++)if(s[r][c]===v)cells.push([r,c]);if(cells.length>3&&!hasIgnore(cells))cells.forEach(x=>bad.add(keyCell(...x)))}
    for(let c=0;c<n-2;c++)if(s[r][c]!==-1&&s[r][c]===s[r][c+1]&&s[r][c]===s[r][c+2]){let cells=[[r,c],[r,c+1],[r,c+2]];if(!hasIgnore(cells))cells.forEach(x=>bad.add(keyCell(...x)))}
  }
  for(let c=0;c<n;c++){
    for(let v=0;v<=1;v++){let cells=[];for(let r=0;r<n;r++)if(s[r][c]===v)cells.push([r,c]);if(cells.length>3&&!hasIgnore(cells))cells.forEach(x=>bad.add(keyCell(...x)))}
    for(let r=0;r<n-2;r++)if(s[r][c]!==-1&&s[r][c]===s[r+1][c]&&s[r][c]===s[r+2][c]){let cells=[[r,c],[r+1,c],[r+2,c]];if(!hasIgnore(cells))cells.forEach(x=>bad.add(keyCell(...x)))}
  }
  for(let [r,c,d,rel] of current.edges){
    let r2=d==='r'?r:r+1,c2=d==='r'?c+1:c,a=s[r][c],b=s[r2][c2],cells=[[r,c],[r2,c2]];
    if(a!==-1&&b!==-1&&!hasIgnore(cells)&&((rel==='='&&a!==b)||(rel==='×'&&a===b)))cells.forEach(x=>bad.add(keyCell(...x)))
  }
  return bad
}

function tangoErrorFromAction(action){
  let ignore=current.tangoPendingCell?keyCell(...current.tangoPendingCell):null,bad=tangoIllegalCells(ignore);
  for(let ch of changedTargets(action)){
    let r=ch.row,c=ch.column,v=current.state[r]?.[c];if(v==null||v===-1||!bad.has(keyCell(r,c)))continue;
    let rowSame=[];for(let cc=0;cc<6;cc++)if(current.state[r][cc]===v)rowSame.push([r,cc]);
    if(rowSame.length>3)return {rule:'T_BALANCE_ROW',technique:'T_BALANCE_ROW',cells:rowSame,target:[r,c],value:v};
    let colSame=[];for(let rr=0;rr<6;rr++)if(current.state[rr][c]===v)colSame.push([rr,c]);
    if(colSame.length>3)return {rule:'T_BALANCE_COLUMN',technique:'T_BALANCE_COLUMN',cells:colSame,target:[r,c],value:v};
    for(let cc=Math.max(0,c-2);cc<=Math.min(c,3);cc++){
      let cells=[[r,cc],[r,cc+1],[r,cc+2]],vals=cells.map(([rr,ccc])=>current.state[rr][ccc]);
      if(vals[0]!==-1&&vals[0]===vals[1]&&vals[1]===vals[2])return {rule:'T_NO_THREE',technique:'T_NO_THREE',cells,target:[r,c],value:v}
    }
    for(let rr=Math.max(0,r-2);rr<=Math.min(r,3);rr++){
      let cells=[[rr,c],[rr+1,c],[rr+2,c]],vals=cells.map(([rrr,cc])=>current.state[rrr][cc]);
      if(vals[0]!==-1&&vals[0]===vals[1]&&vals[1]===vals[2])return {rule:'T_NO_THREE',technique:'T_NO_THREE',cells,target:[r,c],value:v}
    }
    for(let [er,ec,d,rel] of current.edges){
      let r2=d==='r'?er:er+1,c2=d==='r'?ec+1:ec;
      if(!((er===r&&ec===c)||(r2===r&&c2===c)))continue;
      let a=current.state[er][ec],b=current.state[r2][c2];
      if(a!==-1&&b!==-1&&((rel==='='&&a!==b)||(rel==='×'&&a===b))){
        return {rule:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',technique:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',cells:[[er,ec],[r2,c2]],target:[r,c],relation:rel}
      }
    }
  }
  return null
}

function tangoVisibleErrors(){
  let out=[],s=current.state,n=6,ignore=current.tangoPendingCell?keyCell(...current.tangoPendingCell):null,hasIgnore=cells=>ignore&&cells.some(x=>keyCell(...x)===ignore);
  for(let r=0;r<n;r++){
    for(let v=0;v<=1;v++){let cells=[];for(let c=0;c<n;c++)if(s[r][c]===v)cells.push([r,c]);if(cells.length>3&&!hasIgnore(cells))out.push(normalizeVisibleError({rule:'T_BALANCE_ROW',technique:'T_BALANCE_ROW',cells,target:cells[cells.length-1],value:v}))}
    for(let c=0;c<n-2;c++){let cells=[[r,c],[r,c+1],[r,c+2]];if(!hasIgnore(cells)&&s[r][c]!==-1&&s[r][c]===s[r][c+1]&&s[r][c]===s[r][c+2])out.push(normalizeVisibleError({rule:'T_NO_THREE',technique:'T_NO_THREE',cells,target:cells[2],value:s[r][c]}))}
  }
  for(let c=0;c<n;c++){
    for(let v=0;v<=1;v++){let cells=[];for(let r=0;r<n;r++)if(s[r][c]===v)cells.push([r,c]);if(cells.length>3&&!hasIgnore(cells))out.push(normalizeVisibleError({rule:'T_BALANCE_COLUMN',technique:'T_BALANCE_COLUMN',cells,target:cells[cells.length-1],value:v}))}
    for(let r=0;r<n-2;r++){let cells=[[r,c],[r+1,c],[r+2,c]];if(!hasIgnore(cells)&&s[r][c]!==-1&&s[r][c]===s[r+1][c]&&s[r][c]===s[r+2][c])out.push(normalizeVisibleError({rule:'T_NO_THREE',technique:'T_NO_THREE',cells,target:cells[2],value:s[r][c]}))}
  }
  for(let [r,c,d,rel] of current.edges){
    let r2=d==='r'?r:r+1,c2=d==='r'?c+1:c,cells=[[r,c],[r2,c2]],a=s[r][c],b=s[r2][c2];
    if(!hasIgnore(cells)&&a!==-1&&b!==-1&&((rel==='='&&a!==b)||(rel==='×'&&a===b)))out.push(normalizeVisibleError({rule:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',technique:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',cells,target:[r2,c2],other:[r,c],relation:rel}))
  }
  return out
}

function trainingSetTangoBase(g,diff,blank=true){let state=Array.from({length:6},()=>Array(6).fill(-1));if(!blank)for(let i of g.givens)state[Math.floor(i/6)][i%6]=g.sol[Math.floor(i/6)][i%6];current={game:'tango',diff,n:6,sol:g.sol,givens:new Set(blank?[]:g.givens),edges:blank?[]:g.edges,difficultyProfile:g.difficultyProfile,generationStats:g.generationStats,state,generated:true,unique:true,completed:false,training:true,tangoPendingCell:null}}

function trainingBuildTangoDirect(id,deadline){
  for(let a=0;a<4&&WebPlatform.clock.nowMs()<deadline;a++){
    let g=tangoCandidate('easy');trainingSetTangoBase(g,'easy',true);
    if(id==='T_BALANCE_ROW'){
      for(let r=0;r<6;r++)for(let v=0;v<2;v++){let cells=[];for(let c=0;c<6;c++)if(g.sol[r][c]===v)cells.push(c);if(cells.length===3){current.state=Array.from({length:6},()=>Array(6).fill(-1));current.givens=new Set();for(let c of cells){current.state[r][c]=v;current.givens.add(r*6+c)}let h=trainingHintForId(id,deadline);if(h)return h}}
    }else if(id==='T_BALANCE_COLUMN'){
      for(let c=0;c<6;c++)for(let v=0;v<2;v++){let cells=[];for(let r=0;r<6;r++)if(g.sol[r][c]===v)cells.push(r);if(cells.length===3){current.state=Array.from({length:6},()=>Array(6).fill(-1));current.givens=new Set();for(let r of cells){current.state[r][c]=v;current.givens.add(r*6+c)}let h=trainingHintForId(id,deadline);if(h)return h}}
    }else if(id==='T_NO_THREE'){
      for(let r=0;r<6;r++)for(let c=0;c<4;c++){let v=[g.sol[r][c],g.sol[r][c+1],g.sol[r][c+2]];for(let k=0;k<3;k++){let others=[0,1,2].filter(x=>x!==k);if(v[others[0]]===v[others[1]]&&v[k]!==v[others[0]]){current.state=Array.from({length:6},()=>Array(6).fill(-1));current.givens=new Set();for(let j of others){current.state[r][c+j]=v[j];current.givens.add(r*6+c+j)}let h=trainingHintForId(id,deadline);if(h)return h}}}
    }else if(id==='T_RELATION_EQUAL'||id==='T_RELATION_OPPOSITE'){
      let rel=id==='T_RELATION_EQUAL'?'=':'×';
      for(let r=0;r<6;r++)for(let c=0;c<5;c++)if((g.sol[r][c]===g.sol[r][c+1])===(rel==='=')){current.state=Array.from({length:6},()=>Array(6).fill(-1));current.givens=new Set([r*6+c]);current.state[r][c]=g.sol[r][c];current.edges=[[r,c,'r',rel]];let h=trainingHintForId(id,deadline);if(h)return h}
    }
  }
  return null
}

function tangoReasoningPresenter(){return reasoningPresenter(globalThis.QuadludTangoReasoningPresenter.GAME)}

function tangoLogicAvailable(){return typeof TangoLogic!=='undefined'&&TangoLogic?.createSession}

function tangoLogicBoard(c=current,state=null,derived=null){return {n:c.n||6,state:cloneGrid(state||c.state),edges:JSON.parse(JSON.stringify(c.edges||[])),givens:c.givens||[],derivedRelations:JSON.parse(JSON.stringify(derived??c.tangoDerivedRelations??[]))}}

function tangoLogicSession(c=current,state=null,derived=null){if(!tangoLogicAvailable())throw new Error('Soleil/Lune inference engine unavailable');return TangoLogic.createSession(tangoLogicBoard(c,state,derived))}

function tangoUnitHuman(ref){if(!ref)return '';return `${tr(ref.family==='row'?'rowLabel':'columnLabel')} ${Number(ref.id)+1}`}

function tangoFormat(key,vars={}){return String(tr(key)||key).replace(/\{([A-Za-z0-9_]+)\}/g,(_,k)=>vars[k]??'')}

function tangoValueHuman(v){return pieceName('tango',Number(v))}

function tangoRelationHuman(p){return tr(Number(p)===0?'tlgSame':'tlgOpposite')}

function tangoFocusDeduction(d,reveal=false){clearHintFocus();let board=$('#tboard')||document.querySelector('.board');if(!board||!current||!d)return;let cells=[...(d.focusCells||[])];for(const r of d.focusRelations||[])cells.push(r.a,r.b);if(reveal)for(const c of d.conclusions||[])cells.push(...(c.type==='VALUE'?[c.cell]:[c.a,c.b]));let seen=new Set();for(const cell of cells){let k=cell.join(',');if(seen.has(k))continue;seen.add(k);let el=board.children[cell[0]*(current.n||6)+cell[1]];if(el)el.classList.add(reveal&&(d.conclusions||[]).some(c=>c.type==='VALUE'?c.cell[0]===cell[0]&&c.cell[1]===cell[1]:(c.a[0]===cell[0]&&c.a[1]===cell[1])||(c.b[0]===cell[0]&&c.b[1]===cell[1]))?'hint-focus':'hint-context')}}

function tangoApplyDeductionToCurrent(d){if(!d||!current||current.game!=='tango')return null;let engine=tangoLogicSession(),applied=engine.applyDeduction(d);if(!applied?.deduction)return null;current.state=cloneGrid(engine.state);current.tangoDerivedRelations=engine.exportDerivedRelations();return applied}

function tangoCurrentLogicResult(){let engine=tangoLogicSession(),result=engine.nextDeduction();return {...result,engine}}

function tangoCoachHandleDeduction(d){
  let presenter=tangoReasoningPresenter(),boardKey=historySnapshotKey(),sig=d.signature||d.id,flow=current.hintFlow,isSame=flow?.kind==='tango-proof'&&flow.boardKey===boardKey&&flow.signature===sig,view=presenter.presentation(d);
  if(!isSame){current.hintFlow={kind:'tango-proof',boardKey,signature:sig,stage:1,deduction:JSON.parse(JSON.stringify(d))};coachUsage(1,view.technique);tangoFocusDeduction(d,false);showHintNotice(`<span class="coach-progress">1/2</span><b>${tr('where')} :</b> ${view.explanation.where}`);saveCurrent();return}
  let proof=flow.deduction||d,before=historySnapshotKey();coachUsage(2,view.technique);coachUsage(3,view.technique);markHintUsed();updateScoreFlags();tangoFocusDeduction(proof,true);let application=tangoApplyDeductionToCurrent(proof);if(!application){current.hintFlow=null;showHintNotice(tr('hintError'));return}drawGameUi();let appliedView=presenter.presentation(application.deduction,application.automatic);historyRecord({type:'COACH_APPLY',reasoning:presenter.legacyReasoning(application.deduction,application.automatic),coachStage:2,coachFlowVersion:3},before);current.hintFlow=null;showHintNotice(`<span class="coach-progress">2/2</span><b>${appliedView.explanation.title}</b><br>${appliedView.explanation.why}`);maybeAutoFinish();saveCurrent();haptic(12)
}

function tangoDirectTechniqueAt(r,c,v){
  let s=current.state,n=6;
  let rowOpp=s[r].filter(x=>x===1-v).length;if(rowOpp===3)return 'T_BALANCE_ROW';
  let colOpp=0;for(let rr=0;rr<n;rr++)if(s[rr][c]===1-v)colOpp++;if(colOpp===3)return 'T_BALANCE_COLUMN';
  for(let i=Math.max(0,c-2);i<=Math.min(c,3);i++){let vals=[i,i+1,i+2].filter(cc=>cc!==c).map(cc=>s[r][cc]);if(vals.length===2&&vals[0]===1-v&&vals[1]===1-v)return 'T_NO_THREE'}
  for(let i=Math.max(0,r-2);i<=Math.min(r,3);i++){let vals=[i,i+1,i+2].filter(rr=>rr!==r).map(rr=>s[rr][c]);if(vals.length===2&&vals[0]===1-v&&vals[1]===1-v)return 'T_NO_THREE'}
  for(let [er,ec,d,rel] of current.edges){let r2=d==='r'?er:er+1,c2=d==='r'?ec+1:ec;if(!((er===r&&ec===c)||(r2===r&&c2===c)))continue;let or=er===r&&ec===c?r2:er,oc=er===r&&ec===c?c2:ec,other=s[or][oc];if(other===-1)continue;let need=rel==='='?other:1-other;if(v===need)return rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE'}
  return null
}

function justifyTangoAt(r,c,v){
  let t=tangoDirectTechniqueAt(r,c,v);if(t)return proofResult('justified',t,0,[r,c],techniqueTitle(t));
  let opp=1-v,chosenBad=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoStateContradiction()),oppBad=withTempCurrent(x=>{x.state[r][c]=opp},()=>tangoStateContradiction());
  if(!chosenBad&&oppBad)return proofResult('justified','T_CONTRADICTION_R1',1,[r,c],null);
  let opp2=withTempCurrent(x=>{x.state[r][c]=opp},()=>tangoRank2WitnessAfterAssumption()),chosen2=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoRank2WitnessAfterAssumption());
  if(opp2&&!chosen2)return proofResult('justified','T_CONTRADICTION_R2',2,[r,c],null);
  return proofResult('unjustified',null,null,[r,c],null)
}

function walkthroughGenerateTangoNext(){
  let s=walkthroughSession;if(!s||s.base.game!=='tango'||s.done||s.stalled)return false;
  if(!s.tangoLogic)s.tangoLogic=tangoLogicSession(s.work,s.work.state,s.work.tangoDerivedRelations||[]);
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;return false}
  let result=s.tangoLogic.nextDeduction();
  if(result.contradiction){s.stalled=true;s.logicContradiction=result.contradiction;return false}
  if(!result.deduction){s.stalled=true;return false}
  let beforeSnapshot=walkthroughSnapshot(s.work),applied=s.tangoLogic.applyDeduction(result.deduction),d=applied.deduction;if(!d){s.stalled=true;return false}
  s.work.state=cloneGrid(s.tangoLogic.state);s.work.tangoDerivedRelations=s.tangoLogic.exportDerivedRelations();
  let presenter=tangoReasoningPresenter(),presentation=presenter.presentation(d,applied.automatic),reasoning=presenter.legacyReasoning(d,applied.automatic),firstValue=(d.conclusions||[]).find(c=>c.type==='VALUE'),info={
    rule:presentation.rule,technique:presentation.technique,rank:presentation.rank,techniqueLevel:presentation.techniqueLevel,target:firstValue?firstValue.cell.slice():null,
    presentation,deduction:reasoning,where:presentation.explanation.where,why:presentation.explanation.why,move:presentation.explanation.move,automatic:JSON.parse(JSON.stringify(applied.automatic||[])),metrics:s.tangoLogic.metrics(),beforeSnapshot
  };
  info.snapshot=walkthroughSnapshot(s.work);s.moves.push(info);
  if(walkthroughComplete()){s.done=true;s.total=s.moves.length;s.metrics=s.tangoLogic.metrics()}
  return true
}

function tangoReason(r,c,v){
  let sym=v===1?(lang()==='fr'?'soleil ☀':'sun ☀'):(lang()==='fr'?'lune ☾':'moon ☾'),opp=1-v,s=current.state,reasons=[];
  let rowOpp=s[r].filter(x=>x===opp).length,rowSame=s[r].filter(x=>x===v).length,colOpp=0,colSame=0;for(let rr=0;rr<6;rr++){if(s[rr][c]===opp)colOpp++;if(s[rr][c]===v)colSame++}
  if(rowOpp===3)reasons.push(lang()==='fr'?`la ligne contient déjà 3 ${opp===1?'soleils':'lunes'}`:`the row already contains 3 ${opp===1?'suns':'moons'}`);
  if(colOpp===3)reasons.push(lang()==='fr'?`la colonne contient déjà 3 ${opp===1?'soleils':'lunes'}`:`the column already contains 3 ${opp===1?'suns':'moons'}`);
  for(let [rr,cc,d,rel] of current.edges){let r2=d==='r'?rr:rr+1,c2=d==='r'?cc+1:cc;if(!((rr===r&&cc===c)||(r2===r&&c2===c)))continue;let or=rr===r&&cc===c?r2:rr,oc=rr===r&&cc===c?c2:cc,ov=s[or][oc];if(ov===-1)continue;let forced=rel==='='?ov:1-ov;if(forced===v)reasons.push(lang()==='fr'?`la relation ${rel} avec la case voisine impose ce symbole`:`the ${rel} relation with the adjacent cell forces this symbol`)}
  let triples=[[[r,c-2],[r,c-1]],[[r,c-1],[r,c+1]],[[r,c+1],[r,c+2]],[[r-2,c],[r-1,c]],[[r-1,c],[r+1,c]],[[r+1,c],[r+2,c]]];
  for(let pair of triples){let vals=pair.map(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<6?s[rr][cc]:-9);if(vals[0]===opp&&vals[1]===opp){reasons.push(lang()==='fr'?`deux ${opp===1?'soleils':'lunes'} voisins interdisent un troisième symbole identique`:`two adjacent ${opp===1?'suns':'moons'} prevent a third identical symbol`);break}}
  if(!reasons.length)reasons.push(lang()==='fr'?`ce ${sym} est compatible avec l’équilibre 3/3, les relations et la règle des trois`:`this ${sym} is compatible with the 3/3 balance, relations and no-three rule`);
  return reasons.join(lang()==='fr'?' ; ': '; ')
}

function findTangoLogicalHint(){
  let s=current.state,n=6;
  function out(r,c,v,whyFr,whyEn,technique){if(r>=0&&r<n&&c>=0&&c<n&&s[r][c]===-1)return {r,c,v,why:lang()==='fr'?whyFr:whyEn,technique};return null}
  // 3/3 balance
  for(let r=0;r<n;r++){for(let v=0;v<=1;v++){let count=s[r].filter(x=>x===v).length;if(count===3)for(let c=0;c<n;c++){let h=out(r,c,1-v,`la ligne contient déjà 3 ${v===1?'soleils':'lunes'} ; les cases restantes doivent être des ${v===1?'lunes':'soleils'}.`,`the row already has 3 ${v===1?'suns':'moons'}; remaining cells must be ${v===1?'moons':'suns'}.`,'T_BALANCE_ROW');if(h)return h}}}
  for(let c=0;c<n;c++){for(let v=0;v<=1;v++){let count=0;for(let r=0;r<n;r++)if(s[r][c]===v)count++;if(count===3)for(let r=0;r<n;r++){let h=out(r,c,1-v,`la colonne contient déjà 3 ${v===1?'soleils':'lunes'} ; les cases restantes doivent être des ${v===1?'lunes':'soleils'}.`,`the column already has 3 ${v===1?'suns':'moons'}; remaining cells must be ${v===1?'moons':'suns'}.`,'T_BALANCE_COLUMN');if(h)return h}}}
  // no three: XX_ _XX X_X
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(s[r][c]===-1){
    let pairs=[[[r,c-2],[r,c-1]],[[r,c-1],[r,c+1]],[[r,c+1],[r,c+2]],[[r-2,c],[r-1,c]],[[r-1,c],[r+1,c]],[[r+1,c],[r+2,c]]];
    for(let pair of pairs){let a=pair[0],b=pair[1];if(a[0]>=0&&a[0]<n&&a[1]>=0&&a[1]<n&&b[0]>=0&&b[0]<n&&b[1]>=0&&b[1]<n){let va=s[a[0]][a[1]],vb=s[b[0]][b[1]];if(va!==-1&&va===vb)return {r,c,v:1-va,technique:'T_NO_THREE',why:lang()==='fr'?`deux symboles identiques encadrent ou précèdent cette case ; un troisième identique est interdit.`:`two identical symbols surround or precede this cell; a third identical symbol is forbidden.`}}}
  }
  // relation with known neighbor
  for(let [r,c,d,rel] of current.edges){let r2=d==='r'?r:r+1,c2=d==='r'?c+1:c,a=s[r][c],b=s[r2][c2];
    if(a===-1&&b!==-1)return {r,c,v:rel==='='?b:1-b,technique:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',why:lang()==='fr'?`la relation ${rel} avec la case voisine impose ce symbole.`:`the ${rel} relation with the adjacent cell forces this symbol.`};
    if(b===-1&&a!==-1)return {r:r2,c:c2,v:rel==='='?a:1-a,technique:rel==='='?'T_RELATION_EQUAL':'T_RELATION_OPPOSITE',why:lang()==='fr'?`la relation ${rel} avec la case voisine impose ce symbole.`:`the ${rel} relation with the adjacent cell forces this symbol.`}
  }
  return null
}

function tangoImmediateContradiction(){
  let s=current.state,n=6;
  if(tangoIllegalCells().size)return true;
  for(let r=0;r<n;r++)for(let v=0;v<=1;v++){let count=s[r].filter(x=>x===v).length,empty=s[r].filter(x=>x===-1).length;if(count>3||count+empty<3)return true}
  for(let c=0;c<n;c++)for(let v=0;v<=1;v++){let count=0,empty=0;for(let r=0;r<n;r++){if(s[r][c]===v)count++;if(s[r][c]===-1)empty++}if(count>3||count+empty<3)return true}
  return false
}

function tangoCandidateLocallyLegal(r,c,v){
  if(current.state[r][c]!==-1)return false;
  return withTempCurrent(x=>{x.state[r][c]=v},()=>!tangoImmediateContradiction())
}

function tangoStateContradiction(){
  if(tangoImmediateContradiction())return true;
  // Rank-1 consistency: every unresolved cell must retain at least one legal symbol.
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===-1){
    let ok0=tangoCandidateLocallyLegal(r,c,0),ok1=tangoCandidateLocallyLegal(r,c,1);
    if(!ok0&&!ok1)return true
  }
  return false
}

function findTangoRank1Hint(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===-1){
    let direct0=tangoCandidateLocallyLegal(r,c,0),direct1=tangoCandidateLocallyLegal(r,c,1);
    if(!direct0||!direct1)continue;
    let bad=[];for(let v=0;v<=1;v++)bad[v]=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoStateContradiction());
    if(bad[0]!==bad[1]){
      let v=bad[0]?1:0,rejected=1-v;
      let d=withTempCurrent(x=>{x.state[r][c]=rejected},()=>tangoRank1ContradictionDetail());
      let detail=d&&d.text?d.text:(lang()==='fr'?'une case suivante ne conserverait plus aucun symbole possible.':'a following cell would have no possible symbol left.');
      return {r,c,v,rank:1,
        hypothesis:lang()==='fr'?`essayons ${pieceName('tango',rejected)} en ${cellName(r,c)}.`:`try ${pieceName('tango',rejected)} at ${cellName(r,c)}.`,
        consequence:detail,
        deadend:lang()==='fr'?`ce choix conduit donc à une situation impossible dès le coup suivant.`:`this choice therefore creates an impossible situation on the next move.`,
        conclusion:lang()==='fr'?`${cellName(r,c)} doit contenir ${pieceName('tango',v)}.`:`${cellName(r,c)} must contain ${pieceName('tango',v)}.`,
        why:null}
    }
  }
  return null
}

function tangoRejectReason(r,c,v){
  let s=current.state,n=6,name=pieceName('tango',v),opp=pieceName('tango',1-v);
  // three consecutive
  let line=s[r].slice();line[c]=v;
  for(let i=Math.max(0,c-2);i<=Math.min(c,3);i++)if(line[i]===v&&line[i+1]===v&&line[i+2]===v)
    return lang()==='fr'?`${name} formerait trois ${v===1?'soleils':'lunes'} consécutifs sur la ligne ${r+1}.`:`${name} would create three consecutive ${v===1?'suns':'moons'} in row ${r+1}.`;
  let col=Array.from({length:n},(_,rr)=>rr===r?v:s[rr][c]);
  for(let i=Math.max(0,r-2);i<=Math.min(r,3);i++)if(col[i]===v&&col[i+1]===v&&col[i+2]===v)
    return lang()==='fr'?`${name} formerait trois ${v===1?'soleils':'lunes'} consécutifs dans la colonne ${c+1}.`:`${name} would create three consecutive ${v===1?'suns':'moons'} in column ${c+1}.`;
  // balance
  if(line.filter(x=>x===v).length>3)return lang()==='fr'?`il y aurait plus de 3 ${v===1?'soleils':'lunes'} sur la ligne ${r+1}.`:`row ${r+1} would contain more than 3 ${v===1?'suns':'moons'}.`;
  if(col.filter(x=>x===v).length>3)return lang()==='fr'?`il y aurait plus de 3 ${v===1?'soleils':'lunes'} dans la colonne ${c+1}.`:`column ${c+1} would contain more than 3 ${v===1?'suns':'moons'}.`;
  // equality / opposite relation
  for(let [er,ec,d,rel] of current.edges){
    let r2=d==='r'?er:er+1,c2=d==='r'?ec+1:ec;
    if(!((er===r&&ec===c)||(r2===r&&c2===c)))continue;
    let or=er===r&&ec===c?r2:er,oc=er===r&&ec===c?c2:ec,ov=s[or][oc];
    if(ov===-1)continue;
    let ok=rel==='='?v===ov:v!==ov;
    if(!ok)return lang()==='fr'
      ?`${name} ne respecterait pas la relation « ${rel} » avec ${cellName(or,oc)} (${pieceName('tango',ov)}).`
      :`${name} would violate the “${rel}” relation with ${cellName(or,oc)} (${pieceName('tango',ov)}).`;
  }
  return lang()==='fr'?`${name} rendrait immédiatement les contraintes de cette ligne ou colonne impossibles.`:`${name} would immediately make the row or column constraints impossible.`
}

function tangoRank1ContradictionDetail(){
  if(tangoImmediateContradiction())return {text:lang()==='fr'?'les règles sont déjà violées immédiatement.':'the rules are already violated immediately.'};
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===-1){
    let ok0=tangoCandidateLocallyLegal(r,c,0),ok1=tangoCandidateLocallyLegal(r,c,1);
    if(!ok0&&!ok1)return {r,c,text:lang()==='fr'
      ?`${cellName(r,c)} devient impossible :<br>&nbsp;&nbsp;– lune ☾ : ${tangoRejectReason(r,c,0)}<br>&nbsp;&nbsp;– soleil ☀ : ${tangoRejectReason(r,c,1)}`
      :`${cellName(r,c)} becomes impossible:<br>&nbsp;&nbsp;– moon ☾: ${tangoRejectReason(r,c,0)}<br>&nbsp;&nbsp;– sun ☀: ${tangoRejectReason(r,c,1)}`}
  }
  return null
}

function tangoRank2WitnessAfterAssumption(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===-1){
    let viable=[],reasons={};
    for(let v=0;v<=1;v++){
      if(!tangoCandidateLocallyLegal(r,c,v)){reasons[v]=tangoRejectReason(r,c,v);continue}
      let bad=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoStateContradiction());
      if(!bad)viable.push(v);else{
        let d=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoRank1ContradictionDetail());
        reasons[v]=d&&d.text?d.text:(lang()==='fr'?`${pieceName('tango',v)} conduit à une contradiction.`:`${pieceName('tango',v)} leads to a contradiction.`)
      }
    }
    if(!viable.length)return {r,c,reasons,detail:lang()==='fr'
      ?`${cellName(r,c)} ne peut plus recevoir aucun symbole.`
      :`${cellName(r,c)} can no longer take either symbol.`}
  }
  return null
}

function findTangoRank2Hint(){
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(current.state[r][c]===-1){
    let surviving=[];
    for(let v=0;v<=1;v++){
      if(!tangoCandidateLocallyLegal(r,c,v))continue;
      let rank1Bad=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoStateContradiction());
      if(!rank1Bad)surviving.push(v)
    }
    if(surviving.length<2)continue;
    let bad=[],witness={};
    for(let v of surviving){
      let w=withTempCurrent(x=>{x.state[r][c]=v},()=>tangoRank2WitnessAfterAssumption());
      if(w){bad.push(v);witness[v]=w}
    }
    let good=surviving.filter(v=>!bad.includes(v));
    if(good.length===1&&bad.length){
      let v=good[0],rej=bad[0],w=witness[rej];
      return {r,c,v,rank:2,
        hypothesis:lang()==='fr'?`supposons ${cellName(r,c)} = ${pieceName('tango',rej)}.`:`suppose ${cellName(r,c)} = ${pieceName('tango',rej)}.`,
        consequence:lang()==='fr'
          ?`regardons alors ${cellName(w.r,w.c)} :<br>• si on y place une lune ☾ : ${w.reasons[0]||'ce choix conduit à une contradiction.'}<br>• si on y place un soleil ☀ : ${w.reasons[1]||'ce choix conduit à une contradiction.'}`
          :`now look at ${cellName(w.r,w.c)}:<br>• if we place a moon ☾: ${w.reasons[0]||'this choice leads to a contradiction.'}<br>• if we place a sun ☀: ${w.reasons[1]||'this choice leads to a contradiction.'}`,
        deadend:lang()==='fr'?`${cellName(w.r,w.c)} n'a donc plus aucune valeur possible. Notre hypothèse de départ est impossible.`:`${cellName(w.r,w.c)} therefore has no possible value. Our initial assumption is impossible.`,
        conclusion:lang()==='fr'?`${pieceName('tango',rej)} est donc impossible en ${cellName(r,c)} ; il faut placer ${pieceName('tango',v)}.`:`${pieceName('tango',rej)} is therefore impossible at ${cellName(r,c)}; place ${pieceName('tango',v)}.`,
        why:null}
    }
  }
  return null
}

function hintT(){if(current?.training)return trainingCoach();if(paused)return;if(showVisibleErrorsBeforeHint())return;if(showExplorationContradictionBeforeHint())return;current.tangoPendingCell=null;try{let result=tangoCurrentLogicResult();if(result.contradiction){current.hintFlow=null;clearHintFocus();let cells=result.contradiction.cells||[];let b=$('#tboard');if(b)for(let [r,c] of cells){let el=b.children[r*6+c];if(el)el.classList.add('error-focus')}showHintNotice(`<b>⚠ ${tr('contradictionFound')}</b><br>${tangoReasoningPresenter().contradictionText(result.contradiction)}`);return}if(!result.deduction)return showHintNotice(`<b>${tr('noLogicalHint')}</b><br>${tr('tlgNoDeduction')}`);tangoCoachHandleDeduction(result.deduction)}catch(err){console.error('Soleil/Lune proof engine failed',err);showHintNotice(`<b>${tr('hintError')}</b>`)}}
