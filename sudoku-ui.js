/*
 * QUADLUD — Grille 6 Web renderer/input adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludSudokuUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const REQUIRED=[
    'document','query','shell','gameLabel','tr','gameRules','getCurrent','isPaused','touchSave',
    'markBacktrack','haptic','updateScoreFlags','maybeAutoFinish','a11ySetupGrid','a11yCoord','a11ySetCell',
    'applyConfiguredIllegalClasses','applyUnjustifiedHighlights','checkVictory','hint','finish',
    'historySnapshotKey','closeHintNotice','clearHintFocus','historyRecord','saveCurrent'
  ];

  function createAdapter(deps){
    if(!deps||typeof deps!=='object')throw new Error('QUADLUD Grille 6 UI dependencies unavailable');
    for(const name of REQUIRED)if(deps[name]==null)throw new Error(`QUADLUD Grille 6 UI dependency unavailable: ${name}`);

    const {
      document,query,shell,gameLabel,tr,gameRules,getCurrent,isPaused,touchSave,markBacktrack,haptic,
      updateScoreFlags,maybeAutoFinish,a11ySetupGrid,a11yCoord,a11ySetCell,applyConfiguredIllegalClasses,
      applyUnjustifiedHighlights,checkVictory,hint,finish,historySnapshotKey,
      closeHintNotice,clearHintFocus,historyRecord,saveCurrent
    }=deps;
    const sudokuIllegalCells=deps.sudokuIllegalCells||root?.sudokuIllegalCells;if(typeof sudokuIllegalCells!=='function')throw new Error('QUADLUD Grille 6 UI dependency unavailable: sudokuIllegalCells');

    function syncAccessibility(){
      const current=getCurrent(),board=query('#sboard');
      if(!current||current.game!=='sudoku'||!board)return false;
      const selected=current.sel;
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,value=current.state[r][c],parts=[a11yCoord(r,c)];
        if(value)parts.push(String(value));
        a11ySetCell(cell,r,c,parts.join(', '),{readonly:!current.empty.has(i),selected:!!selected&&selected[0]===r&&selected[1]===c})
      });
      return true
    }

    function draw(){
      const current=getCurrent(),board=query('#sboard');
      if(!current||current.game!=='sudoku'||!board)return false;
      const sel=current.sel,selectedValue=sel?current.state[sel[0]][sel[1]]:0;
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,v=current.state[r][c];
        cell.textContent=v||'';
        const sameUnit=!!sel&&(r===sel[0]||c===sel[1]||(Math.floor(r/2)===Math.floor(sel[0]/2)&&Math.floor(c/3)===Math.floor(sel[1]/3)));
        cell.classList.toggle('peer',sameUnit&&!(r===sel[0]&&c===sel[1]));
        cell.classList.toggle('same-value',!!selectedValue&&v===selectedValue&&!(r===sel[0]&&c===sel[1]));
        cell.classList.toggle('selected',!!sel&&sel[0]===r&&sel[1]===c);
        cell.classList.remove('error')
      });
      applyConfiguredIllegalClasses(board,sudokuIllegalCells(),6);
      applyUnjustifiedHighlights();
      syncAccessibility();
      updateScoreFlags();
      return true
    }

    function setSelectedDigit(next,{input='numpad',hapticMs=8,recordHistory=false,skipIfSame=false}={}){
      const current=getCurrent();
      if(!current?.sel)return false;
      const [r,c]=current.sel,prev=current.state[r][c];
      if(skipIfSame&&prev===next)return false;
      const before=recordHistory?historySnapshotKey():null;
      if(recordHistory){closeHintNotice();current.hintFlow=null;clearHintFocus()}
      if(prev!==0&&prev!==next)markBacktrack();
      current.state[r][c]=next;
      haptic(hapticMs);
      draw();
      if(recordHistory){historyRecord({type:'SET_DIGIT',primaryTarget:[r,c],input},before);saveCurrent()}
      updateScoreFlags();
      maybeAutoFinish();
      return true
    }

    function reset(session=getCurrent()){if(!session||session.game!=='sudoku')return false;session.sel=null;return draw()}

    function revealSolution(){
      if(isPaused())return;
      const current=getCurrent();
      current.state=current.sol.map(row=>[...row]);draw();finish(tr('solutionShown'),'revealed')
    }

    function render(session){
      shell(gameLabel('sudoku'),`6×6 · 1–6 · ${tr('generated')}`,session.diff,`<div class="board-wrap"><div class="board sudoku" id="sboard" style="grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr))"></div></div><div class="numpad" id="numpad" role="group" aria-label="${tr('placeDigit')}">${[1,2,3,4,5,6].map(n=>`<button data-n="${n}">${n}</button>`).join('')}<button data-n="0" aria-label="${tr('erase')}">⌫</button></div>`,gameRules('sudoku'));
      const board=query('#sboard');
      for(let r=0;r<6;r++)for(let c=0;c<6;c++){
        const fixed=!session.empty.has(r*6+c),cell=document.createElement('div');
        cell.className='cell '+(fixed?'fixed ':'')+((c===2)?'boxR ':'')+((r===1||r===3)?'boxB ':'');
        if(!fixed)cell.onclick=touchSave(()=>{getCurrent().sel=[r,c];draw()});
        board.appendChild(cell)
      }
      a11ySetupGrid(board,6,6,{
        initialIndex:session.sel?session.sel[0]*6+session.sel[1]:0,
        activate:cell=>{const current=getCurrent(),r=+cell.dataset.r,c=+cell.dataset.c;current.sel=[r,c];draw()},
        onFocus:cell=>{const current=getCurrent(),r=+cell.dataset.r,c=+cell.dataset.c;if(!current.sel||current.sel[0]!==r||current.sel[1]!==c){current.sel=[r,c];draw()}}
      });
      query('#numpad').querySelectorAll('button').forEach(button=>button.onclick=touchSave(()=>setSelectedDigit(+button.dataset.n)));
      draw();
      {const check=query('#checkBtn');if(check)check.onclick=checkVictory;}query('#hintBtn').onclick=hint;query('#solutionBtn').onclick=revealSolution;
      return board
    }

    function keyboardInput(event){
      const current=getCurrent();
      if(!current||isPaused()||current.completed||current.game!=='sudoku'||!current.sel)return false;
      let next=null,n=Number(event.key);
      if(n>=1&&n<=6)next=n;else if(event.key==='Backspace'||event.key==='Delete'||event.key==='0')next=0;
      if(next==null)return false;
      const [r,c]=current.sel;
      if(!current.empty.has(r*6+c))return false;
      event.preventDefault();
      const prev=current.state[r][c];
      if(prev===next)return true;
      setSelectedDigit(next,{input:'keyboard',hapticMs:next?6:5,recordHistory:true,skipIfSame:true});
      return true
    }

    return Object.freeze({render,draw,reset,keyboardInput,syncAccessibility})
  }

  return Object.freeze({createAdapter})
});
