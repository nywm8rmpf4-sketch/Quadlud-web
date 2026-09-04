/*
 * QUADLUD — mobile immersive game + persistent Logic Coach window
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludMobileCoachUi=api;
  if(typeof document!=='undefined')api.install();
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const STORAGE_KEY='quadlud.ui.coach-position.v1';
  const APPLY_LABELS=Object.freeze({
    en:'Apply',zh:'应用',hi:'लागू करें',es:'Aplicar',ar:'تطبيق',fr:'Appliquer',bn:'প্রয়োগ করুন',pt:'Aplicar',id:'Terapkan',ur:'لاگو کریں',
    bg:'Приложи',hr:'Primijeni',cs:'Použít',da:'Anvend',nl:'Toepassen',et:'Rakenda',fi:'Käytä',de:'Anwenden',el:'Εφαρμογή',hu:'Alkalmaz',
    ga:'Cuir i bhfeidhm',it:'Applica',lv:'Lietot',lt:'Taikyti',mt:'Applika',pl:'Zastosuj',ro:'Aplică',sk:'Použiť',sl:'Uporabi',sv:'Tillämpa'
  });
  const uiStageByFlow=new WeakMap();
  const creditedByFlow=new WeakMap();
  let cachedHtml=null,cachedFlowKey=null,installed=false,originalShow=null,originalHintStage=null,originalCoachUsage=null;

  function doc(){return root?.document||null}
  function currentFlow(){try{return typeof current!=='undefined'&&current?current.hintFlow:null}catch(_){return null}}
  function currentGame(){try{return typeof current!=='undefined'&&current?String(current.game||''):''}catch(_){return ''}}
  function trSafe(key,fallback){try{return typeof tr==='function'?tr(key):fallback}catch(_){return fallback}}
  function orientationKey(){return (Number(root?.innerWidth)||0)>=(Number(root?.innerHeight)||0)?'landscape':'portrait'}
  function flowKey(flow=currentFlow()){
    if(!flow)return null;
    return [currentGame(),flow.kind||'',flow.boardKey||'',flow.signature||'',flow.key||''].join('|')
  }
  function readPositions(){try{const raw=root?.localStorage?.getItem(STORAGE_KEY);const parsed=raw?JSON.parse(raw):{};return parsed&&typeof parsed==='object'?parsed:{}}catch(_){return {}}}
  function writePositions(value){try{root?.localStorage?.setItem(STORAGE_KEY,JSON.stringify(value));return true}catch(_){return false}}
  function clampGeometry(notice,left,top){
    const pad=8,W=Math.max(1,Number(root?.innerWidth)||390),H=Math.max(1,Number(root?.innerHeight)||844),w=notice?.offsetWidth||Math.min(W*.92,520),h=notice?.offsetHeight||130;
    return {pad,W,H,w,h,left:Math.max(pad,Math.min(Number(left)||pad,W-w-pad)),top:Math.max(pad,Math.min(Number(top)||pad,H-h-pad))}
  }
  function savePosition(notice){
    if(!notice)return false;
    const rect=notice.getBoundingClientRect?.();if(!rect)return false;
    const g=clampGeometry(notice,rect.left,rect.top),spanX=Math.max(1,g.W-g.w-g.pad*2),spanY=Math.max(1,g.H-g.h-g.pad*2),all=readPositions();
    all[orientationKey()]={x:Math.max(0,Math.min(1,(g.left-g.pad)/spanX)),y:Math.max(0,Math.min(1,(g.top-g.pad)/spanY))};
    return writePositions(all)
  }
  function restorePosition(notice){
    if(!notice)return false;
    const slot=readPositions()[orientationKey()];if(!slot)return false;
    const g=clampGeometry(notice,0,0),spanX=Math.max(1,g.W-g.w-g.pad*2),spanY=Math.max(1,g.H-g.h-g.pad*2),left=g.pad+Math.max(0,Math.min(1,Number(slot.x)||0))*spanX,top=g.pad+Math.max(0,Math.min(1,Number(slot.y)||0))*spanY,clamped=clampGeometry(notice,left,top);
    notice.style.left=clamped.left+'px';notice.style.top=clamped.top+'px';notice.style.bottom='auto';notice.style.transform='none';return true
  }
  function rememberNotice(notice){
    const text=notice?.querySelector?.('.hint-notice-text');if(!text)return false;
    cachedHtml=text.innerHTML;cachedFlowKey=flowKey();return true
  }
  function hideNotice(){
    const notice=doc()?.getElementById?.('hintNotice');if(!notice)return false;
    savePosition(notice);rememberNotice(notice);notice.remove();return true
  }
  function techniqueFor(flow){return flow?.pedagogyView?.technique||flow?.deduction?.technique||flow?.deduction?.rule||null}
  function markCredited(flow,stage){let set=creditedByFlow.get(flow);if(!set){set=new Set();creditedByFlow.set(flow,set)}set.add(stage)}
  function isCredited(flow,stage){return !!creditedByFlow.get(flow)?.has(stage)}
  function creditStage(flow,stage){
    if(!flow||isCredited(flow,stage)||typeof originalCoachUsage!=='function')return false;
    originalCoachUsage(stage,techniqueFor(flow));markCredited(flow,stage);return true
  }
  function sectionMap(flow){return Object.fromEntries((flow?.coachSections||[]).filter(Boolean).map(section=>[section.id,section]))}
  function stageFor(flow){if(!flow)return 0;return uiStageByFlow.get(flow)||Math.max(1,Math.min(3,Number(flow.stage)||1))}
  function setStage(flow,stage){if(flow)uiStageByFlow.set(flow,Math.max(1,Math.min(3,Number(stage)||1)))}
  function applyLabel(){const lang=(doc()?.documentElement?.lang||'en').toLowerCase().split('-')[0];return APPLY_LABELS[lang]||APPLY_LABELS.en}
  function ensureProgressiveSections(notice){
    const flow=currentFlow(),text=notice?.querySelector?.('.hint-notice-text');if(!flow||!text||!Array.isArray(flow.coachSections)||!flow.coachSections.length)return;
    let box=text.querySelector('.coach-window-progressive');
    if(!box){box=doc().createElement('div');box.className='coach-window-progressive';text.appendChild(box)}
    const by=sectionMap(flow),stage=stageFor(flow),parts=[];
    if(stage>=2){
      if(by.rule?.text)parts.push(`<p><b>${trSafe('rulesTitle','Rule')} :</b> ${by.rule.text}</p>`);
      if(by.why?.text)parts.push(`<p><b>${trSafe('hintWhy','Why')} :</b> ${by.why.text}</p>`)
    }
    if(stage>=3&&by.action?.text)parts.push(`<p class="coach-window-action"><b>${trSafe('hintMove','Suggested move')} :</b> ${by.action.text}</p>`);
    box.innerHTML=parts.join('')
  }
  function nativeHintHandler(){const button=doc()?.getElementById?.('hintBtn');return button&&typeof button.onclick==='function'?()=>button.onclick.call(button):null}
  function snapshotKey(){try{return typeof historySnapshotKey==='function'?historySnapshotKey():null}catch(_){return null}}
  function applyCurrentMove(){
    const handler=nativeHintHandler();if(!handler)return false;
    let guard=0,flow=currentFlow();if(!flow)return false;
    while(currentFlow()&&guard++<6){
      const before=snapshotKey();handler();const after=snapshotKey();
      if(before!=null&&after!=null&&before!==after)break
    }
    const notice=doc()?.getElementById?.('hintNotice');if(notice)enhanceNotice(notice);return true
  }
  function advanceUiStage(){
    const flow=currentFlow();if(!flow)return false;
    const next=Math.min(3,stageFor(flow)+1);setStage(flow,next);if(next===2)creditStage(flow,2);if(next===3)creditStage(flow,3);
    const notice=doc()?.getElementById?.('hintNotice');if(notice)enhanceNotice(notice);return true
  }
  function ensureControls(notice){
    if(!notice)return;
    const flow=currentFlow(),existingProof=notice.querySelector('.coach-proof-apply,#queenCoachProofApply');
    let actions=notice.querySelector('.coach-window-actions');
    if(!flow||existingProof){actions?.remove();return}
    if(!actions){actions=doc().createElement('div');actions.className='coach-window-actions';notice.appendChild(actions)}
    const stage=stageFor(flow),by=sectionMap(flow),buttons=[];
    if(stage<2&&(by.rule?.text||by.why?.text))buttons.push(`<button type="button" class="btn coach-window-more" data-coach-window-next="2">${trSafe('hintWhy','Why')}</button>`);
    else if(stage<3&&by.action?.text)buttons.push(`<button type="button" class="btn coach-window-more" data-coach-window-next="3">${trSafe('lessonShowMove',trSafe('hintMove','Suggested move'))}</button>`);
    else buttons.push(`<button type="button" class="btn primary coach-window-apply" id="coachWindowApply">${applyLabel()}</button>`);
    actions.innerHTML=buttons.join('');
    actions.querySelector('[data-coach-window-next]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();advanceUiStage()});
    actions.querySelector('#coachWindowApply')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();applyCurrentMove()})
  }
  function attachPositionPersistence(notice){
    if(!notice||notice.__quadludPositionBound)return;
    const handle=notice.querySelector('.hint-drag-handle');if(handle){const persist=()=>root.setTimeout?.(()=>savePosition(notice),0);handle.addEventListener('pointerup',persist);handle.addEventListener('pointercancel',persist)}
    notice.__quadludPositionBound=true
  }
  function enhanceNotice(notice){
    if(!notice)return false;
    attachPositionPersistence(notice);ensureProgressiveSections(notice);ensureControls(notice);
    const close=notice.querySelector('#hintClose');if(close&&!close.__quadludHideBound){close.onclick=e=>{e?.preventDefault?.();hideNotice()};close.__quadludHideBound=true}
    restorePosition(notice);rememberNotice(notice);return true
  }
  function restoreCachedNotice(){
    const flow=currentFlow();if(!flow||!cachedHtml||cachedFlowKey!==flowKey(flow)||typeof showHintNotice!=='function')return false;
    showHintNotice(cachedHtml);return true
  }
  function onToolbarCoachClick(event){
    const button=event.target?.closest?.('#hintBtn');if(!button)return;
    const notice=doc()?.getElementById?.('hintNotice');
    if(notice){event.preventDefault();event.stopImmediatePropagation();hideNotice();return}
    if(currentFlow()&&cachedHtml&&cachedFlowKey===flowKey()){
      event.preventDefault();event.stopImmediatePropagation();restoreCachedNotice()
    }
  }
  function installShowWrapper(){
    if(typeof showHintNotice!=='function'||showHintNotice.__quadludCoachWindowUi)return false;
    originalShow=showHintNotice;
    const wrapped=function(text){const result=originalShow(text);enhanceNotice(doc()?.getElementById?.('hintNotice'));return result};
    wrapped.__quadludCoachWindowUi=true;showHintNotice=wrapped;return true
  }
  function installHintStageWrapper(){
    if(typeof hintStage!=='function'||hintStage.__quadludCoachWindowUi)return false;
    originalHintStage=hintStage;
    const wrapped=function(kind,target,message,apply){
      const result=originalHintStage(kind,target,message,apply),flow=currentFlow();
      if(flow&&Array.isArray(message?.coachSections)&&message.coachSections.length)flow.coachSections=message.coachSections;
      enhanceNotice(doc()?.getElementById?.('hintNotice'));return result
    };
    wrapped.__quadludCoachWindowUi=true;hintStage=wrapped;return true
  }
  function installCoachUsageWrapper(){
    if(typeof coachUsage!=='function'||coachUsage.__quadludCoachWindowUi)return false;
    originalCoachUsage=coachUsage;
    const wrapped=function(stage,technique=null){const flow=currentFlow();if(flow&&isCredited(flow,stage))return;const result=originalCoachUsage(stage,technique);if(flow)markCredited(flow,stage);return result};
    wrapped.__quadludCoachWindowUi=true;coachUsage=wrapped;return true
  }
  function onResize(){const notice=doc()?.getElementById?.('hintNotice');if(!notice)return;const r=notice.getBoundingClientRect(),g=clampGeometry(notice,r.left,r.top);notice.style.left=g.left+'px';notice.style.top=g.top+'px';notice.style.bottom='auto';notice.style.transform='none'}
  function install(){
    if(installed||!doc())return false;installed=true;
    installCoachUsageWrapper();installShowWrapper();installHintStageWrapper();
    doc().addEventListener('click',onToolbarCoachClick,true);root.addEventListener?.('resize',onResize,{passive:true});
    enhanceNotice(doc().getElementById('hintNotice'));return true
  }
  return Object.freeze({install,savePosition,restorePosition,hideNotice,restoreCachedNotice,advanceUiStage,applyCurrentMove,applyLabel,_test:Object.freeze({clampGeometry,flowKey,orientationKey})})
});
