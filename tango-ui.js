/*
 * QUADLUD — Tango Web renderer/input adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludTangoUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const REQUIRED=[
    'document','query','shell','gameLabel','tr','gameRules','getCurrent','isPaused','touchSave',
    'markBacktrack','haptic','updateScoreFlags','maybeAutoFinish','a11ySetupGrid','a11yCoord','a11ySetCell','keyCell',
    'applyConfiguredIllegalClasses','applyUnjustifiedHighlights',
    'checkVictory','hint','finish'
  ];

  function createAdapter(deps){
    if(!deps||typeof deps!=='object')throw new Error('QUADLUD Tango UI dependencies unavailable');
    for(const name of REQUIRED)if(deps[name]==null)throw new Error(`QUADLUD Tango UI dependency unavailable: ${name}`);

    const {
      document,query,shell,gameLabel,tr,gameRules,getCurrent,isPaused,touchSave,markBacktrack,
      haptic,updateScoreFlags,maybeAutoFinish,a11ySetupGrid,a11yCoord,a11ySetCell,keyCell,
      applyConfiguredIllegalClasses,applyUnjustifiedHighlights,checkVictory,hint,finish
    }=deps;
    const tangoIllegalCells=deps.tangoIllegalCells||root?.tangoIllegalCells;if(typeof tangoIllegalCells!=='function')throw new Error('QUADLUD Soleil-Lune UI dependency unavailable: tangoIllegalCells');

    function a11yRelations(current,r,c){
      const out=[];
      for(const [rr,cc,dir,symbol] of current.edges||[]){
        const a=[rr,cc],b=dir==='r'?[rr,cc+1]:[rr+1,cc];let other=null;
        if(a[0]===r&&a[1]===c)other=b;else if(b[0]===r&&b[1]===c)other=a;
        if(other)out.push(`${symbol} ${a11yCoord(other[0],other[1])}`)
      }
      return out
    }

    function syncAccessibility(){
      const current=getCurrent(),board=query('#tboard');
      if(!current||current.game!=='tango'||!board)return false;
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,value=current.state[r][c],parts=[a11yCoord(r,c)];
        if(value===0)parts.push('☾');else if(value===1)parts.push('☀');
        parts.push(...a11yRelations(current,r,c));
        a11ySetCell(cell,r,c,parts.join(', '),{readonly:current.givens.has(i)})
      });
      return true
    }

    function draw(){
      const current=getCurrent(),board=query('#tboard');
      if(!current||current.game!=='tango'||!board)return false;
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,v=current.state[r][c];
        cell.innerHTML=v===0?'<span class="tango-symbol" aria-hidden="true">☾</span>':v===1?'<span class="tango-symbol" aria-hidden="true">☀</span>':''
      });
      current.edges.forEach(([r,c,dir,symbol])=>{
        const cell=board.children[r*6+c],relation=document.createElement('span');
        relation.className='relation '+dir;relation.textContent=symbol;relation.setAttribute('aria-hidden','true');cell.appendChild(relation)
      });
      const ignore=current.tangoPendingCell?keyCell(...current.tangoPendingCell):null;
      applyConfiguredIllegalClasses(board,tangoIllegalCells(ignore),6);
      applyUnjustifiedHighlights();
      syncAccessibility();
      updateScoreFlags();
      return true
    }

    function cycleCell(r,c){
      const current=getCurrent(),prev=current.state[r][c],next=(prev+2)%3-1;
      current.tangoPendingCell=null;current.tangoDerivedRelations=[];
      if(prev===1&&next===-1)markBacktrack();
      current.state[r][c]=next;
      if(next===0)current.tangoPendingCell=[r,c];
      haptic(8);draw();updateScoreFlags();maybeAutoFinish()
    }

    function reset(session=getCurrent()){if(!session||session.game!=='tango')return false;return draw()}

    function revealSolution(){
      if(isPaused())return;
      const current=getCurrent();
      current.tangoPendingCell=null;current.state=current.sol.map(row=>[...row]);draw();finish(tr('solutionShown'),'revealed')
    }

    function render(session){
      shell(gameLabel('tango'),`6×6 · ${tr('generated')}`,session.diff,`<div class="board-wrap"><div class="board" id="tboard" style="grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr))"></div></div>`,gameRules('tango'));
      const board=query('#tboard');
      for(let r=0;r<6;r++)for(let c=0;c<6;c++){
        const cell=document.createElement('div');
        cell.className='cell'+(session.givens.has(r*6+c)?' fixed':'');cell.dataset.r=r;cell.dataset.c=c;
        if(!session.givens.has(r*6+c))cell.onclick=touchSave(()=>cycleCell(r,c));
        board.appendChild(cell)
      }
      a11ySetupGrid(board,6,6,{activate:cell=>{if(!cell.classList.contains('fixed'))cell.click()}});
      draw();
      {const check=query('#checkBtn');if(check)check.onclick=checkVictory;}query('#hintBtn').onclick=hint;query('#solutionBtn').onclick=revealSolution;
      return board
    }

    return Object.freeze({render,draw,reset,syncAccessibility})
  }

  return Object.freeze({createAdapter})
});
