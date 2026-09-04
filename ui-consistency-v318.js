/*
 * QUADLUD — v3.1.8-U14 cross-device Coach placement
 * Copyright © 2026 Serge Benoliel
 * All rights reserved.
 */
(function(root){
  'use strict';
  let installed=false,raf=0,settleFrames=0,settleTimer=0;
  const CLASS='coach-docked-wide',STABILIZE_FRAMES=4,STABILIZE_DELAY_MS=80;

  function doc(){return root?.document||null}
  function wideLandscape(){
    const w=Number(root?.innerWidth)||0,h=Number(root?.innerHeight)||0;
    return w>=700&&h>=521&&w>h
  }
  function panel(){return doc()?.querySelector?.('#app>.panel')||null}
  function gameSurface(p){
    if(!p)return null;
    return p.querySelector(':scope > .board-wrap')||p.querySelector(':scope > .nonogram-game')||p.querySelector('.board-wrap')||p.querySelector('.nonogram-game')
  }
  function clearInlineDock(n){
    if(!n)return false;
    const was=n.classList.contains(CLASS);n.classList.remove(CLASS);
    for(const prop of ['left','right','top','bottom','width','max-width','max-height','transform'])n.style.removeProperty(prop);
    if(was){try{root?.QuadludMobileCoachUi?.restorePosition?.(n)}catch(_){}}
    return was
  }
  function controlsBottom(p){
    const items=['.game-head','.toolbar','#status'].map(s=>p?.querySelector?.(s)).filter(Boolean);
    return items.reduce((m,el)=>Math.max(m,el.getBoundingClientRect().bottom),p?.getBoundingClientRect?.().top||0)
  }
  function dock(n){
    if(!n)return false;
    if(!wideLandscape())return clearInlineDock(n);
    const p=panel(),surface=gameSurface(p);if(!p||!surface)return clearInlineDock(n);
    const pr=p.getBoundingClientRect(),sr=surface.getBoundingClientRect();
    const inset=16,gap=16,left=pr.left+inset,right=sr.left-gap,available=right-left;
    if(available<280)return clearInlineDock(n);
    const top=Math.max(pr.top+inset,controlsBottom(p)+12),bottom=pr.bottom-inset,maxHeight=bottom-top;
    if(maxHeight<130)return clearInlineDock(n);
    const width=Math.min(520,available);
    n.classList.add(CLASS);
    n.style.left=Math.round(left)+'px';
    n.style.right='auto';
    n.style.top=Math.round(top)+'px';
    n.style.bottom='auto';
    n.style.width=Math.round(width)+'px';
    n.style.maxWidth=Math.round(available)+'px';
    n.style.maxHeight=Math.round(maxHeight)+'px';
    n.style.transform='none';
    return true
  }
  function queueFrame(){
    if(raf)return;
    raf=root.requestAnimationFrame?root.requestAnimationFrame(sync):root.setTimeout(sync,0)
  }
  function sync(){
    raf=0;
    const n=doc()?.getElementById?.('hintNotice');if(n)dock(n);
    if(settleFrames>0){settleFrames--;queueFrame()}
  }
  function schedule(frames=STABILIZE_FRAMES){
    settleFrames=Math.max(settleFrames,Math.max(0,Number(frames)||0));queueFrame();
    if(settleTimer)root.clearTimeout?.(settleTimer);
    settleTimer=root.setTimeout?.(()=>{settleTimer=0;settleFrames=Math.max(settleFrames,1);queueFrame()},STABILIZE_DELAY_MS)||0
  }
  function install(){
    if(installed||!doc())return false;installed=true;
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes||[]){
        if(node?.id==='hintNotice'||node?.querySelector?.('#hintNotice')){schedule();return}
      }
    });
    observer.observe(doc().body,{childList:true,subtree:true});
    doc().addEventListener('click',e=>{if(e.target?.closest?.('#hintBtn'))schedule()},true);
    root.addEventListener?.('resize',()=>schedule(2),{passive:true});
    root.addEventListener?.('orientationchange',()=>schedule(2),{passive:true});
    schedule();return true
  }
  install();
  root.QuadludUiConsistencyV318=Object.freeze({install,dock,wideLandscape,_test:Object.freeze({gameSurface,controlsBottom,schedule})});
})(typeof globalThis!=='undefined'?globalThis:this);
