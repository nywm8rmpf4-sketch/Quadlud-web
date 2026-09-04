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
    const GridCoordinates=deps.gridCoordinates||root?.QuadludGridCoordinates;
    if(!GridCoordinates||typeof GridCoordinates.markup!=='function'||typeof GridCoordinates.coordinateLabel!=='function')throw new Error('QUADLUD Soleil-Lune UI dependency unavailable: gridCoordinates');
    const tangoIllegalCells=deps.tangoIllegalCells||root?.tangoIllegalCells;if(typeof tangoIllegalCells!=='function')throw new Error('QUADLUD Soleil-Lune UI dependency unavailable: tangoIllegalCells');

    function escapeHtml(value){
      return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
    }
    function valueHtml(value){
      return value===0?'<span class="tango-symbol" aria-hidden="true">☾</span>':value===1?'<span class="tango-symbol" aria-hidden="true">☀</span>':''
    }
    function relationIndex(edges){
      const relations=new Map();
      for(const [r,c,dir,symbol] of edges||[]){
        const key=`${r},${c}`,items=relations.get(key)||[];
        items.push({dir:dir==='d'?'d':'r',symbol:String(symbol??'')});
        relations.set(key,items)
      }
      return relations
    }
    function relationHtml(items){
      return (items||[]).map(({dir,symbol})=>`<span class="relation ${dir}" aria-hidden="true">${escapeHtml(symbol)}</span>`).join('')
    }
    function businessCellHtml(value,relations){
      return valueHtml(value)+relationHtml(relations)
    }

    function a11yRelations(current,r,c){
      const out=[];
      for(const [rr,cc,dir,symbol] of current.edges||[]){
        const a=[rr,cc],b=dir==='r'?[rr,cc+1]:[rr+1,cc];let other=null;
        if(a[0]===r&&a[1]===c)other=b;else if(b[0]===r&&b[1]===c)other=a;
        if(other)out.push(`${symbol} ${GridCoordinates.coordinateLabel(other[0],other[1])}`)
      }
      return out
    }

    function syncAccessibility(){
      const current=getCurrent(),board=query('#tboard');
      if(!current||current.game!=='tango'||!board)return false;
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,value=current.state[r][c],parts=[GridCoordinates.coordinateLabel(r,c)];
        if(value===0)parts.push('☾');else if(value===1)parts.push('☀');
        parts.push(...a11yRelations(current,r,c));
        a11ySetCell(cell,r,c,parts.join(', '),{readonly:current.givens.has(i)})
      });
      return true
    }

    function draw(){
      const current=getCurrent(),board=query('#tboard');
      if(!current||current.game!=='tango'||!board)return false;
      const relations=relationIndex(current.edges);
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/6),c=i%6,v=current.state[r][c];
        cell.innerHTML=businessCellHtml(v,relations.get(`${r},${c}`))
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

    function walkthroughBoard({base,initial,snapshot,deduction}={}){
      if(!base||!snapshot?.state)return null;
      const relations=relationIndex(base.edges);
      const context=new Set((deduction?.focusCells||[]).map(cell=>cell.join(','))),conclusions=new Set();
      for(const relation of deduction?.focusRelations||[]){context.add(relation.a.join(','));context.add(relation.b.join(','))}
      for(const conclusion of deduction?.conclusions||[]){if(conclusion.type==='VALUE')conclusions.add(conclusion.cell.join(','));else{if(conclusion.a)conclusions.add(conclusion.a.join(','));if(conclusion.b)conclusions.add(conclusion.b.join(','))}}
      const cells=[];
      for(let r=0;r<6;r++)for(let c=0;c<6;c++){
        const key=`${r},${c}`,value=snapshot.state[r][c],fixed=initial?.state?.[r]?.[c]!==-1,classes=['cell','walkthrough-cell'];
        if(fixed)classes.push('fixed');if(context.has(key))classes.push('walkthrough-context');if(conclusions.has(key))classes.push('walkthrough-target');
        const body=businessCellHtml(value,relations.get(key));
        cells.push(`<div class="${classes.join(' ')}" data-r="${r}" data-c="${c}" data-coordinate="${GridCoordinates.coordinateLabel(r,c)}">${body}</div>`)
      }
      const boardHtml=`<div class="board walkthrough-board" data-tango-tutor="readonly" style="grid-column:2;grid-row:2;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr))">${cells.join('')}</div>`;
      return {html:GridCoordinates.markup(6,6,{className:'walkthrough-board-wrap board-wrap grid-coordinate-wrap tango-coordinate-wrap',columnClass:'tango-column-coordinates',rowClass:'tango-row-coordinates',boardHtml})}
    }

    function revealSolution(){
      if(isPaused())return;
      const current=getCurrent();
      current.tangoPendingCell=null;current.state=current.sol.map(row=>[...row]);draw();finish(tr('solutionShown'),'revealed')
    }

    function render(session){
      const boardHtml='<div class="board" id="tboard" style="grid-column:2;grid-row:2;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr))"></div>';
      const coordinateBoard=GridCoordinates.markup(6,6,{className:'board-wrap grid-coordinate-wrap tango-coordinate-wrap',columnClass:'tango-column-coordinates',rowClass:'tango-row-coordinates',boardHtml});
      shell(gameLabel('tango'),`6×6 · ${tr('generated')}`,session.diff,coordinateBoard,gameRules('tango'));
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

    return Object.freeze({render,draw,reset,walkthroughBoard,syncAccessibility})
  }

  return Object.freeze({createAdapter})
});
