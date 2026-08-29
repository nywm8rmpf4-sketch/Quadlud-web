/*
 * QUADLUD — Rectangles Web renderer/input adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludPatchesUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const REQUIRED=[
    'document','window','query','getApp','shell','gameLabel','tr','gameRules','getCurrent','getWalkthroughSession','isPaused',
    'historySnapshotKey','historyRecord','saveCurrent','markBacktrack','haptic',
    'updateScoreFlags','maybeAutoFinish','applyIllegalClasses','applyConfiguredIllegalClasses','applyUnjustifiedHighlights',
    'a11ySetupGrid','a11yAnnounce','a11yCoord','a11ySetCell','coarsePointer','checkVictory','hint','finish','requestFrame','cancelFrame',
    'setTimer','getResizeObserver'
  ];

  function createAdapter(deps){
    if(!deps||typeof deps!=='object')throw new Error('QUADLUD Rectangles UI dependencies unavailable');
    for(const name of REQUIRED)if(deps[name]==null)throw new Error(`QUADLUD Rectangles UI dependency unavailable: ${name}`);

    const {
      document,window,query,getApp,shell,gameLabel,tr,gameRules,getCurrent,getWalkthroughSession,isPaused,
      historySnapshotKey,historyRecord,saveCurrent,markBacktrack,haptic,updateScoreFlags,maybeAutoFinish,
      applyIllegalClasses,applyConfiguredIllegalClasses,applyUnjustifiedHighlights,a11ySetupGrid,
      a11yAnnounce,a11yCoord,a11ySetCell,coarsePointer,checkVictory,hint,finish,requestFrame,cancelFrame,setTimer,getResizeObserver
    }=deps;
    const patchEmptyEvidence=deps.patchEmptyEvidence||root?.patchEmptyEvidence,captureRejectedPatchError=deps.captureRejectedPatchError||root?.captureRejectedPatchError,patchIllegalCells=deps.patchIllegalCells||root?.patchIllegalCells;
    for(const [name,fn] of [['patchEmptyEvidence',patchEmptyEvidence],['captureRejectedPatchError',captureRejectedPatchError],['patchIllegalCells',patchIllegalCells]])if(typeof fn!=='function')throw new Error(`QUADLUD Rectangles UI dependency unavailable: ${name}`);

    let patchPaintFrame=0,patchDragFrame=0,patchDragPending=null,patchClueResizeObserver=null;
    const PATCH_DRAG_THRESHOLD_FINE=5,PATCH_DRAG_THRESHOLD_COARSE=9,PATCH_HYSTERESIS=.18;

    function updateResponsiveClues(board,n){
      if(!board||!n)return;
      const q=board.getBoundingClientRect(),cell=Math.min(q.width,q.height)/Number(n);
      if(Number.isFinite(cell)&&cell>0)board.style.setProperty('--patch-cell-size',`${cell.toFixed(2)}px`)
    }

    function observeResponsiveClues(board,n){
      if(patchClueResizeObserver){try{patchClueResizeObserver.disconnect()}catch(_){};patchClueResizeObserver=null}
      if(!board||!n)return;
      board.dataset.patchN=String(n);board.classList.add('patch-responsive-clues');updateResponsiveClues(board,n);
      const ResizeObserverClass=getResizeObserver();
      if(typeof ResizeObserverClass==='function'){
        patchClueResizeObserver=new ResizeObserverClass(entries=>{for(const entry of entries){const target=entry.target,nn=Number(target.dataset.patchN)||n;if(target.isConnected)updateResponsiveClues(target,nn)}});
        patchClueResizeObserver.observe(board)
      }
    }

    function refreshResponsiveClues(){
      const current=getCurrent(),walkthroughSession=getWalkthroughSession();
      if(current?.game!=='patches'&&walkthroughSession?.base?.game!=='patches')return;
      const app=getApp(),board=query('#pboard')||app?.querySelector?.('.walkthrough-board.patch-responsive-clues');
      if(board)updateResponsiveClues(board,Number(board.dataset.patchN)||current?.n||walkthroughSession?.base?.n)
    }
    window.addEventListener?.('resize',refreshResponsiveClues,{passive:true});

    function clueIdAt(r,c){
      const current=getCurrent();
      if(!current?.clues||!current?.ids)return null;
      for(const id of current.ids){const pos=current.clues[id]?.pos;if(pos&&pos[0]===r&&pos[1]===c)return id}
      return null
    }

    function cellEl(r,c){
      const current=getCurrent(),board=query('#pboard');
      return current?board?.children?.[r*current.n+c]||null:null
    }

    function rect(a,b){
      const r0=Math.min(a[0],b[0]),r1=Math.max(a[0],b[0]),c0=Math.min(a[1],b[1]),c1=Math.max(a[1],b[1]),cells=[];
      for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)cells.push([r,c]);
      return {r0,r1,c0,c1,h:r1-r0+1,w:c1-c0+1,area:(r1-r0+1)*(c1-c0+1),cells}
    }

    function rectClues(box){
      const current=getCurrent(),out=[];
      for(const id of current.ids){const [r,c]=current.clues[id].pos;if(r>=box.r0&&r<=box.r1&&c>=box.c0&&c<=box.c1)out.push(id)}
      return out
    }

    function rectOverlapsOther(box,id){
      const current=getCurrent();
      return box.cells.some(([r,c])=>current.paint[r][c]!=null&&current.paint[r][c]!==id)
    }

    function pointToCell(x,y,board=query('#pboard')){
      const current=getCurrent();
      if(!board||!current)return null;
      const q=board.getBoundingClientRect(),n=current.n;
      if(!q.width||!q.height)return null;
      const xx=Math.max(q.left,Math.min(x,q.right-0.01)),yy=Math.max(q.top,Math.min(y,q.bottom-0.01));
      const c=Math.max(0,Math.min(n-1,Math.floor((xx-q.left)/q.width*n)));
      const r=Math.max(0,Math.min(n-1,Math.floor((yy-q.top)/q.height*n)));
      return [r,c]
    }

    function pointToCellHysteresis(x,y,previous,board=query('#pboard'),margin=PATCH_HYSTERESIS){
      const current=getCurrent(),raw=pointToCell(x,y,board);if(!raw||!previous||!board||!current)return raw;
      const q=board.getBoundingClientRect(),n=current.n,cw=q.width/n,ch=q.height/n;
      const ux=(Math.max(q.left,Math.min(x,q.right-0.01))-q.left)/cw,uy=(Math.max(q.top,Math.min(y,q.bottom-0.01))-q.top)/ch;
      let r=raw[0],c=raw[1];const pr=previous[0],pc=previous[1];
      if(Math.abs(c-pc)===1){if(c>pc&&ux<pc+1+margin)c=pc;else if(c<pc&&ux>pc-margin)c=pc}
      if(Math.abs(r-pr)===1){if(r>pr&&uy<pr+1+margin)r=pr;else if(r<pr&&uy>pr-margin)r=pr}
      return [Math.max(0,Math.min(n-1,r)),Math.max(0,Math.min(n-1,c))]
    }

    function updateCellVisual(r,c){
      const current=getCurrent();
      if(!current||current.game!=='patches'||r<0||c<0||r>=current.n||c>=current.n)return;
      const cell=cellEl(r,c);if(!cell)return;
      const id=current.paint[r][c],fill=id==null?'#fff':current.pal[id%current.pal.length];
      cell.style.setProperty('--patch-fill',fill);cell.classList.toggle('paint',id!=null);
      cell.classList.remove('patch-edge-t','patch-edge-r','patch-edge-b','patch-edge-l');
      if(id!=null){
        if(r===0||current.paint[r-1][c]!==id)cell.classList.add('patch-edge-t');
        if(c===current.n-1||current.paint[r][c+1]!==id)cell.classList.add('patch-edge-r');
        if(r===current.n-1||current.paint[r+1][c]!==id)cell.classList.add('patch-edge-b');
        if(c===0||current.paint[r][c-1]!==id)cell.classList.add('patch-edge-l')
      }
    }

    function rectForRegion(id){
      const current=getCurrent(),known=current.patchSelectedRects?.[id];
      if(known)return {r0:known.r0,r1:known.r1,c0:known.c0,c1:known.c1};
      const cells=[];for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.paint[r][c]===id)cells.push([r,c]);
      if(!cells.length)return null;const rs=cells.map(x=>x[0]),cs=cells.map(x=>x[1]);
      return {r0:Math.min(...rs),r1:Math.max(...rs),c0:Math.min(...cs),c1:Math.max(...cs)}
    }

    function resizeStart(id,x,y,board=query('#pboard')){
      const current=getCurrent(),box=rectForRegion(id);if(!box||!board)return null;
      const q=board.getBoundingClientRect(),cw=q.width/current.n,ch=q.height/current.n;
      const corners=[
        {end:[box.r0,box.c0],anchor:[box.r1,box.c1]},
        {end:[box.r0,box.c1],anchor:[box.r1,box.c0]},
        {end:[box.r1,box.c0],anchor:[box.r0,box.c1]},
        {end:[box.r1,box.c1],anchor:[box.r0,box.c0]}
      ];
      for(const k of corners){k.x=q.left+(k.end[1]+.5)*cw;k.y=q.top+(k.end[0]+.5)*ch;k.d=(k.x-x)**2+(k.y-y)**2}
      const moving=corners.sort((a,b)=>a.d-b.d)[0];
      return {anchor:moving.anchor,end:moving.end,offsetX:moving.x-x,offsetY:moving.y-y}
    }

    function shapeForRect(box){return box.h===box.w?'carré':box.h>box.w?'vertical':'horizontal'}

    function previewInfo(anchor,end,lockedId=null){
      const current=getCurrent(),box=rect(anchor,end),clues=rectClues(box),id=lockedId!=null?lockedId:(clues.length===1?clues[0]:null);
      const clueOK=clues.length===1&&(lockedId==null||clues[0]===lockedId);
      const overlap=clueOK&&rectOverlapsOther(box,id),cl=id!=null?current.clues[id]:null;
      let areaOK=true,shapeOK=true;
      if(clueOK&&cl){
        if(cl.mode==='both'||cl.mode==='size')areaOK=box.area===cl.size;
        if(cl.mode==='both'||cl.mode==='shape')shapeOK=shapeForRect(box)===cl.shape
      }
      const reason=clues.length===0?'NO_CLUE':clues.length>1?'MULTIPLE_CLUES':lockedId!=null&&clues[0]!==lockedId?'WRONG_CLUE':overlap?'OVERLAP':!areaOK?'WRONG_AREA':!shapeOK?'WRONG_SHAPE':'VALID';
      const commitAllowed=clueOK&&!overlap,valid=commitAllowed&&areaOK&&shapeOK,warning=commitAllowed&&!valid;
      return {rect:box,clues,id,cl,clueOK,overlap,areaOK,shapeOK,commitAllowed,valid,warning,reason,lockedId}
    }

    function dragBadge(info){
      const current=getCurrent(),badge=query('#patchDragBadge');if(!badge||!info)return;
      const n=current.n,r=info.rect,above=r.r0>0;
      badge.textContent=`${r.h} × ${r.w} · ${r.area}${!info.areaOK&&info.cl?.size!=null?` / ${info.cl.size}`:''} ${info.valid?'✓':info.warning?'!':'×'}`;
      badge.className='patch-drag-badge '+(info.valid?'valid':info.warning?'warning':'invalid')+(above?' above':' below');
      badge.style.left=`${((r.c0+r.c1+1)/(2*n))*100}%`;badge.style.top=above?`${(r.r0/n)*100}%`:`${((r.r1+1)/n)*100}%`;badge.hidden=false
    }

    function clearPreview(){
      const board=query('#pboard');if(!board)return;
      board.classList.remove('patch-rect-dragging','patch-preview-invalid','patch-preview-warning','patch-preview-overlap-mode');
      for(const cell of board.querySelectorAll('.patch-cell')){
        cell.classList.remove('patch-preview','patch-preview-t','patch-preview-r','patch-preview-b','patch-preview-l','patch-preview-invalid-cell','patch-preview-overlap','patch-preview-clue-active','patch-preview-clue-conflict','patch-resize-source');
        cell.style.removeProperty('--patch-preview-fill')
      }
      const badge=query('#patchDragBadge');if(badge)badge.hidden=true
    }

    function renderPreview(anchor,end,lockedId=null){
      const current=getCurrent(),board=query('#pboard');if(!board)return null;
      clearPreview();
      const info=previewInfo(anchor,end,lockedId),color=info.id==null?'#d7d7d2':current.pal[info.id%current.pal.length];
      board.classList.add('patch-rect-dragging');if(info.warning)board.classList.add('patch-preview-warning');if(!info.commitAllowed)board.classList.add('patch-preview-invalid');if(info.reason==='OVERLAP')board.classList.add('patch-preview-overlap-mode');
      if(lockedId!=null)for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.paint[r][c]===lockedId)cellEl(r,c)?.classList.add('patch-resize-source');
      for(const [r,c] of info.rect.cells){
        const cell=cellEl(r,c);if(!cell)continue;cell.classList.add('patch-preview');cell.style.setProperty('--patch-preview-fill',color);
        if(r===info.rect.r0)cell.classList.add('patch-preview-t');if(r===info.rect.r1)cell.classList.add('patch-preview-b');if(c===info.rect.c0)cell.classList.add('patch-preview-l');if(c===info.rect.c1)cell.classList.add('patch-preview-r');
        if(!info.commitAllowed)cell.classList.add('patch-preview-invalid-cell');if(info.reason==='OVERLAP'&&current.paint[r][c]!=null&&current.paint[r][c]!==info.id)cell.classList.add('patch-preview-overlap')
      }
      for(const clueId of info.clues){const pos=current.clues[clueId]?.pos,cell=pos?cellEl(pos[0],pos[1]):null;if(cell)cell.classList.add(info.clues.length===1&&clueId===info.id?'patch-preview-clue-active':'patch-preview-clue-conflict')}
      dragBadge(info);return info
    }

    function scheduleDragPreview(anchor,end,lockedId=null){
      patchDragPending={anchor:[...anchor],end:[...end],lockedId};if(patchDragFrame)return;
      patchDragFrame=requestFrame(()=>{patchDragFrame=0;const pending=patchDragPending;patchDragPending=null;if(pending)renderPreview(pending.anchor,pending.end,pending.lockedId)})
    }

    function commitRectangle(anchor,end,legacyId=null,lockedId=null){
      const current=getCurrent();
      // legacyId is intentionally accepted for compatibility with existing tests/callers;
      // ownership is always inferred from the single clue, or locked while resizing.
      if(lockedId==null&&legacyId!=null&&clueIdAt(anchor[0],anchor[1])===legacyId)lockedId=null;
      const before=historySnapshotKey(),info=previewInfo(anchor,end,lockedId);clearPreview();
      if(!info.commitAllowed){captureRejectedPatchError(info);haptic(18);return false}
      const id=info.id,hadOld=current.paint.some(row=>row.some(v=>v===id)),rectKeys=new Set(info.rect.cells.map(([r,c])=>r+','+c));
      const overwrite=info.rect.cells.some(([r,c])=>current.paint[r][c]!=null&&current.paint[r][c]!==id);if(hadOld||overwrite)markBacktrack();
      current.patchLogicEvidence=patchEmptyEvidence();current.patchSelectedRects=current.patchSelectedRects||{};
      for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.paint[r][c]===id&&!rectKeys.has(r+','+c))current.paint[r][c]=null;
      for(const [r,c] of info.rect.cells)current.paint[r][c]=id;
      current.patchSelectedRects[id]={r0:info.rect.r0,r1:info.rect.r1,c0:info.rect.c0,c1:info.rect.c1};current.active=id;
      draw();historyRecord({type:'PATCH_RECTANGLE',region:id,rectangle:{r0:info.rect.r0,r1:info.rect.r1,c0:info.rect.c0,c1:info.rect.c1}},before);saveCurrent();updateScoreFlags();maybeAutoFinish();haptic(info.warning?12:8);
      const board=query('#pboard');if(board&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        for(const [r,c] of info.rect.cells)cellEl(r,c)?.classList.add('patch-commit');
        setTimer(()=>{for(const [r,c] of info.rect.cells)cellEl(r,c)?.classList.remove('patch-commit')},180)
      }
      return true
    }

    function seedClueCell(id,r,c){
      const current=getCurrent();if(id==null||current.paint[r][c]!=null)return false;
      const before=historySnapshotKey();current.patchLogicEvidence=patchEmptyEvidence();current.patchSelectedRects=current.patchSelectedRects||{};delete current.patchSelectedRects[id];
      current.paint[r][c]=id;current.active=id;draw();historyRecord({type:'PATCH_SEED',region:id,cell:[r,c]},before);saveCurrent();updateScoreFlags();maybeAutoFinish();haptic(6);return true
    }

    function removeRectangle(id){
      const current=getCurrent(),before=historySnapshotKey();let changed=false;
      for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)if(current.paint[r][c]===id){current.paint[r][c]=null;changed=true}
      if(!changed)return false;
      current.patchLogicEvidence=patchEmptyEvidence();current.patchSelectedRects=current.patchSelectedRects||{};delete current.patchSelectedRects[id];
      markBacktrack();current.active=id;draw();historyRecord({type:'PATCH_REMOVE',region:id},before);saveCurrent();updateScoreFlags();haptic(7);return true
    }

    function scheduleAfterPaint(){
      if(patchPaintFrame)return;
      patchPaintFrame=requestFrame(()=>{patchPaintFrame=0;const board=query('#pboard'),current=getCurrent();if(!board||!current||current.game!=='patches')return;applyConfiguredIllegalClasses(board,patchIllegalCells(),current.n);updateScoreFlags();saveCurrent();maybeAutoFinish()})
    }

    function clueHTML(cl){
      const parts=[];
      if(cl.mode==='both'||cl.mode==='size')parts.push(`<b>${cl.size}</b>`);
      if(cl.mode==='both'||cl.mode==='shape')parts.push(`<span class="patch-shape-icon ${cl.shape==='carré'?'square':cl.shape==='vertical'?'vertical':'horizontal'}" aria-hidden="true"></span>`);
      if(cl.mode==='none')parts.push('<b class="patch-question">?</b>');
      return `<span class="patch-clue${parts.length>1?' combined':''}">${parts.join('')}</span>`
    }

    function clueA11y(clue){
      if(!clue)return '';
      const parts=[];
      if(clue.mode==='both'||clue.mode==='size')parts.push(String(clue.size));
      if(clue.mode==='both'||clue.mode==='shape')parts.push(clue.shape==='carré'?'□':clue.shape==='vertical'?'▯':'▭');
      if(clue.mode==='none')parts.push('?');
      return parts.join(' ')
    }

    function syncAccessibility(){
      const current=getCurrent(),board=query('#pboard');
      if(!current||current.game!=='patches'||!board)return false;
      const clueAt=new Map(current.ids.map(id=>[current.clues[id].pos.join(','),id]));
      [...board.children].forEach((cell,i)=>{
        const r=Math.floor(i/current.n),c=i%current.n,id=current.paint[r][c],clueId=clueAt.get(`${r},${c}`),parts=[a11yCoord(r,c)];
        if(clueId!=null)parts.push(`#${clueId+1} ${clueA11y(current.clues[clueId])}`);
        if(id!=null)parts.push(`${tr('zone')} ${id+1}`);
        a11ySetCell(cell,r,c,parts.join(', '))
      });
      return true
    }

    function draw(){
      const current=getCurrent(),board=query('#pboard');if(!board||!current||current.game!=='patches')return false;
      for(let r=0;r<current.n;r++)for(let c=0;c<current.n;c++)updateCellVisual(r,c);
      applyIllegalClasses(board,patchIllegalCells(),current.n);applyUnjustifiedHighlights();syncAccessibility();updateScoreFlags();return true
    }

    function reset(session=getCurrent()){if(!session||session.game!=='patches')return false;session.active=session.ids?.[0]??0;return draw()}

    function revealSolution(){
      if(isPaused())return;
      const current=getCurrent();clearPreview();current.paint=current.reg.map(r=>[...r]);current.patchSelectedRects={};
      for(const id of current.ids){const cells=current.cellsBy?.[id]||[],rs=cells.map(x=>x[0]),cs=cells.map(x=>x[1]);if(cells.length)current.patchSelectedRects[id]={r0:Math.min(...rs),r1:Math.max(...rs),c0:Math.min(...cs),c1:Math.max(...cs)}}
      current.patchLogicEvidence=patchEmptyEvidence();draw();finish(tr('solutionShown'),'revealed')
    }

    function render(session){
      session.patchSelectedRects=session.patchSelectedRects||{};session.patchLogicEvidence=session.patchLogicEvidence||patchEmptyEvidence();
      shell(gameLabel('patches'),`${session.n}×${session.n} · ${tr('generated')}`,session.diff,
        `<div class="board-wrap patch-board-wrap"><div class="board" id="pboard" style="grid-template-columns:repeat(${session.n},minmax(0,1fr));grid-template-rows:repeat(${session.n},minmax(0,1fr))"></div><div class="patch-drag-badge" id="patchDragBadge" hidden aria-live="polite"></div></div>`,
        gameRules('patches'));
      getApp()?.querySelector('.panel')?.classList.add('patch-game-panel');
      const clueAt=new Map(session.ids.map(id=>[session.clues[id].pos.join(','),id])),board=query('#pboard');
      let drag=null,cornerMode=false,cornerAnchor=null,cornerLockedId=null;
      const clearCorner=()=>{cornerAnchor=null;cornerLockedId=null;clearPreview();board.querySelectorAll('.patch-corner-anchor').forEach(x=>x.classList.remove('patch-corner-anchor'))};
      const cornerStart=(r,col)=>{const current=getCurrent(),existing=current.paint[r][col];cornerLockedId=existing;let anchor=[r,col];if(existing!=null){const box=rectForRegion(existing);if(box){const corners=[[box.r0,box.c0],[box.r0,box.c1],[box.r1,box.c0],[box.r1,box.c1]];anchor=corners.sort((a,b)=>((b[0]-r)**2+(b[1]-col)**2)-((a[0]-r)**2+(a[1]-col)**2))[0]}}cornerAnchor=anchor;cellEl(anchor[0],anchor[1])?.classList.add('patch-corner-anchor');renderPreview(anchor,[r,col],cornerLockedId);a11yAnnounce(`${tr('regionSelection')} · ${a11yCoord(r,col)}`)};
      const cornerActivate=(r,col)=>{if(cornerAnchor){const anchor=[...cornerAnchor],locked=cornerLockedId;clearCorner();const ok=commitRectangle(anchor,[r,col],null,locked);if(ok)a11yAnnounce(cellEl(r,col)?.getAttribute('aria-label')||a11yCoord(r,col));return ok}cornerStart(r,col);return true};
      const cornerRemove=(r,col)=>{const current=getCurrent(),id=current.paint[r][col];if(id==null)return false;clearCorner();const ok=removeRectangle(id);if(ok)a11yAnnounce(a11yCoord(r,col));return ok};

      for(let r=0;r<session.n;r++)for(let col=0;col<session.n;col++){
        const cell=document.createElement('div');cell.className='cell patch-cell';cell.dataset.r=r;cell.dataset.c=col;const clueId=clueAt.get(r+','+col);
        if(clueId!=null){cell.classList.add('clue');cell.dataset.clueId=clueId;cell.innerHTML=clueHTML(session.clues[clueId])}else cell.dataset.clueId='';board.appendChild(cell)
      }
      a11ySetupGrid(board,session.n,session.n,{keyshortcuts:'ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space Delete Backspace Escape',activate:cell=>cornerActivate(+cell.dataset.r,+cell.dataset.c),onFocus:cell=>{if(cornerAnchor)renderPreview(cornerAnchor,[+cell.dataset.r,+cell.dataset.c],cornerLockedId)},onKey:(event,cell)=>{const current=getCurrent();if(event.key==='Escape'&&cornerAnchor){clearCorner();a11yAnnounce(tr('regionSelection'));return true}if((event.key==='Delete'||event.key==='Backspace')&&current.paint[+cell.dataset.r][+cell.dataset.c]!=null){cornerRemove(+cell.dataset.r,+cell.dataset.c);return true}return false}});
      observeResponsiveClues(board,session.n);

      board.onpointerdown=event=>{
        if(isPaused()||drag)return;event.preventDefault();const start=pointToCell(event.clientX,event.clientY,board);if(cornerMode){if(start)cornerActivate(start[0],start[1]);return}if(!start)return;
        const current=getCurrent(),r=start[0],col=start[1],existing=current.paint[r][col],resize=existing!=null?resizeStart(existing,event.clientX,event.clientY,board):null;
        drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,threshold:coarsePointer()?PATCH_DRAG_THRESHOLD_COARSE:PATCH_DRAG_THRESHOLD_FINE,startExisting:existing,lockedId:existing,moved:false,offsetX:resize?.offsetX||0,offsetY:resize?.offsetY||0,anchor:resize?.anchor||start,end:resize?.end||start};
        try{board.setPointerCapture(event.pointerId)}catch(_){}haptic(4)
      };
      board.onpointermove=event=>{
        if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();drag.lastX=event.clientX;drag.lastY=event.clientY;if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<drag.threshold)return;drag.moved=true;
        const px=event.clientX+drag.offsetX,py=event.clientY+drag.offsetY,cell=pointToCellHysteresis(px,py,drag.end,board);if(!cell)return;if(cell[0]===drag.end[0]&&cell[1]===drag.end[1]&&query('#patchDragBadge')&&!query('#patchDragBadge').hidden)return;drag.end=cell;scheduleDragPreview(drag.anchor,drag.end,drag.lockedId)
      };
      const finishDrag=(event,cancel=false)=>{
        if(!drag||event.pointerId!==drag.pointerId)return;try{board.releasePointerCapture(drag.pointerId)}catch(_){}const done=drag;drag=null;if(cancel){clearPreview();return}
        if(!done.moved){clearPreview();if(done.startExisting!=null)removeRectangle(done.startExisting);else {const clueId=clueIdAt(done.anchor[0],done.anchor[1]);if(clueId!=null)seedClueCell(clueId,done.anchor[0],done.anchor[1])}return}
        const finalCell=pointToCellHysteresis(event.clientX+done.offsetX,event.clientY+done.offsetY,done.end,board);if(finalCell)done.end=finalCell;if(patchDragPending)patchDragPending=null;if(patchDragFrame){try{cancelFrame(patchDragFrame)}catch(_){};patchDragFrame=0}commitRectangle(done.anchor,done.end,null,done.lockedId)
      };
      board.onpointerup=event=>finishDrag(event,false);board.onpointercancel=event=>finishDrag(event,true);
      draw();{const check=query('#checkBtn');if(check)check.onclick=checkVictory;}query('#hintBtn').onclick=hint;query('#solutionBtn').onclick=revealSolution;return board
    }

    return Object.freeze({
      render,draw,reset,syncAccessibility,clueHTML,observeResponsiveClues,refreshResponsiveClues,pointToCellHysteresis,resizeStart,commitRectangle,
      seedClueCell,removeRectangle,scheduleAfterPaint,clearPreview
    })
  }

  return Object.freeze({createAdapter})
});
