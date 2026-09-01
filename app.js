/*
 * QUADLUD
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 */
'use strict';
const $=s=>document.querySelector(s), app=$('#app'), toast=$('#toast'), timerEl=$('#timer');
const VERSION='3.1.7';
const UI_FEATURES=Object.freeze({inlineRules:false,exploration:false,pause:false,liveTimer:false,unjustifiedHighlights:false,verifyAction:false});
const WebPlatform=QuadludWebPlatform.getWebPlatform();
const VictoryPresentation=QuadludVictoryPresentation.createController({document,window,random:()=>Math.random(),setTimer:(cb,ms)=>setTimeout(cb,ms),clearTimer:id=>clearTimeout(id)});
let victoryOverlayTimer=null,victoryAnimationFrame=null;
const DiagnosticRecorder=QuadludDiagnosticRecorder;
const DiagnosticUiStructural=QuadludDiagnosticUiStructural;
const DiagnosticAttachments=QuadludDiagnosticAttachments;
const Diagnostic=DiagnosticRecorder.createRecorder({capacity:256,maxErrors:32,uiCapacity:64,nowMs:()=>WebPlatform.clock.nowMs(),nowIso:()=>WebPlatform.clock.nowIso()});
const DIAGNOSTIC_BUILD='v3.1.7-two-level-pedagogy-navigation';
const DIAGNOSTIC_UI_EVENT_TYPES=new Set(['action.applied','action.not-applied','history.undo','history.redo','history.branch','session.reset','coach.stage','tutor.open','tutor.next','tutor.previous','tutor.restart','tutor.close','ui.tool-change','viewport.resize','viewport.orientation']);
function diagnosticOrientation(){try{return String(screen?.orientation?.type||((innerWidth||0)>=(innerHeight||0)?'landscape':'portrait'))}catch(_){return 'unknown'}}
function diagnosticEnvironment(){return {lang:lang(),theme:resolvedTheme(),viewport:{width:Math.max(0,Number(innerWidth)||0),height:Math.max(0,Number(innerHeight)||0)},dpr:Math.max(0,Number(devicePixelRatio)||1),orientation:diagnosticOrientation(),userAgent:String(navigator?.userAgent||'')}}
function diagnosticActive(){try{return !!Diagnostic.stats().active}catch(_){return false}}
function diagnosticView(session=current){try{return reasoningViewForSession(session)}catch(_){return null}}
function diagnosticSurfaceDescriptors(){const out=[];const add=(id,element,cssVars=[])=>{if(element)out.push({id,element,cssVars})};add('game.panel',$('.panel'));add('game.toolbar',$('.toolbar'));add('game.board',$('.panel .board'),['--ng-cols','--ng-rows','--patch-cell-size']);add('control.undo',$('#undoBtn'));add('control.redo',$('#redoBtn'));add('control.coach',$('#hintBtn'));add('control.tutor',$('#walkthroughBtn'));add('game.status',$('#status'));add('nonogram.tools',$('.nonogram-tools'));return out}
function diagnosticCaptureUi(reason='manual'){if(!diagnosticActive())return {recorded:false,reason:'inactive'};try{const snapshot=DiagnosticUiStructural.capture({window,document,surfaces:diagnosticSurfaceDescriptors()});return Diagnostic.recordUiSnapshot(snapshot,String(reason||'manual'))}catch(_){return {recorded:false,reason:'failed'}}}
function diagnosticRecord(type,payload={},session=current){if(!diagnosticActive())return {recorded:false,reason:'inactive'};try{let result=Diagnostic.record(type,payload,{reasoningView:diagnosticView(session)});if(result?.recorded&&DIAGNOSTIC_UI_EVENT_TYPES.has(type))diagnosticCaptureUi(type);return result}catch(_){return {recorded:false,reason:'failed'}}}
function diagnosticAction(action){return action&&typeof action==='object'?action:{type:String(action||'MOVE')}}
function diagnosticRecordedHistory(rec){if(!rec?.changed)return false;let {node,parent,normalized,existing,hadAlternative}=rec;if(!node||!parent||!normalized)return false;diagnosticRecord('action.applied',{action:normalized,historyNode:node.id,parentNode:parent.id,branchCreated:!!hadAlternative,existingNode:!!existing});if(hadAlternative)diagnosticRecord('history.branch',{parentNode:parent.id,historyNode:node.id});return true}
function diagnosticStart(context='normal',{resumed=false,previousGame=null,previousDifficulty=null}={}){let view=diagnosticView(current);if(!view)return false;let fingerprint=null;try{fingerprint=persistenceFingerprint(current)}catch(_){};let result=Diagnostic.start({app:{name:'QUADLUD',version:VERSION,build:DIAGNOSTIC_BUILD},environment:diagnosticEnvironment(),reasoningView:view,difficulty:String(current?.diff||''),fingerprint,context,resumed,previousGame,previousDifficulty});if(result?.recorded)diagnosticCaptureUi('session.start');return !!result?.recorded}
function diagnosticPedagogy(domain,action,technique=null){return diagnosticRecord('pedagogy.event',{domain:String(domain),action:String(action),technique:technique==null?null:String(technique)})}
function diagnosticFilename(){let iso=WebPlatform.clock.nowIso().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');let m=/^(\d{8})T(\d{6})Z$/.exec(iso);return `QUADLUD-diagnostic-${m?`${m[1]}-${m[2]}`:Math.floor(WebPlatform.clock.nowMs())}.qbug.json`}
function diagnosticAttachmentSummary(){try{let a=Diagnostic.buildQbug().attachments?.[0];return a?`PNG · ${a.width}×${a.height} · ${Math.ceil(a.bytes/1024)} KB`:''}catch(_){return ''}}
async function handleDiagnosticImageFile(file){if(!file||!diagnosticActive())return false;try{let attachment=await DiagnosticAttachments.normalizeImageFile(file,{scope:window}),result=Diagnostic.setAttachment(attachment);if(!result?.recorded)throw new Error(result?.reason||'attachment-rejected');settingsView();return true}catch(_){showToast(`${tr('importFailed')} · PNG`);let input=$('#diagnosticImageFile');if(input)input.value='';return false}}
async function downloadDiagnostic(){try{if(!diagnosticActive()){showToast(tr('exportFailed'));return false}diagnosticCaptureUi('export');let qbug=Diagnostic.buildQbug();if(qbug.attachments?.length)await DiagnosticAttachments.verifyAttachment(qbug.attachments[0],window);let ok=WebPlatform.files.downloadText(JSON.stringify(qbug,null,2),{filename:diagnosticFilename(),type:'application/json'});showToast(tr(ok?'exportDone':'exportFailed'));return ok}catch(_){showToast(tr('exportFailed'));return false}}
const DataSerialization=QuadludDataSerialization;
const SessionCore=QuadludSessionCore;
const GameRegistry=QuadludGameRegistry;
const SessionHistory=SessionCore.createHistoryController(game=>gameSessionLifecycle(game));
const LogicalTransactions=QuadludLogicalMove.createTransactionController({history:SessionHistory,resolveLifecycle:game=>gameSessionLifecycle(game)});
const PedagogyMetadata=QuadludPedagogyMetadata;
const MasteryModel=QuadludMasteryModel;
const GAME_IDS=GameRegistry.IDS;
const PersistentData=globalThis.QuadludPersistentDataServices||QuadludPersistenceServices.createServices({storage:QuadludWebStorage.getLocalStorageAdapter(),serialization:DataSerialization});
const PERSISTENCE_BASELINE=PersistentData.baseline, SAVE_SCHEMA=PersistentData.schemas.save, SAVE_KEY=PersistentData.keys.save;
const LEGACY_PERSISTENCE_KEYS=PersistentData.legacyKeys;
const I18nCatalog=QuadludI18nCatalog,{I18N,SUPPORTED_LANGS,RTL_LANGS,LANGUAGE_OPTIONS,A11Y_SKIP_LABELS,GAME_RULES,TECHNIQUE_TERMS}=I18nCatalog;
const ProgressionStats=QuadludProgressionStats.createStatsService({persistentData:PersistentData,gameRegistry:GameRegistry,gameIds:GAME_IDS,persistenceBaseline:PERSISTENCE_BASELINE,clock:WebPlatform.clock,cloneMasterySession,mergeMasteryIntoStats:masteryMergeIntoStats});
const ChallengeProtocol=QuadludChallengeProtocol.create({gameIds:GAME_IDS,gameRegistry:GameRegistry,generation:QuadludGenerationCommon,cryptoProvider:globalThis.crypto,random:()=>Math.random()});
const DailyModel=QuadludDailyModel.create({gameIds:GAME_IDS,gameManifest:QuadludGameManifest,persistentData:PersistentData,generation:QuadludGenerationCommon,clock:WebPlatform.clock,localDay});
const {statsSchema:STATS_SCHEMA,historyLimit:HISTORY_LIMIT}=ProgressionStats,STATS_KEY=PersistentData.keys.stats;
function blankStats(){return ProgressionStats.blankStats()}
function safeStats(){return ProgressionStats.safeStats()}
function writeStats(s){return ProgressionStats.writeStats(s)}
function statBucket(s,g,d){return ProgressionStats.statBucket(s,g,d)}
function localDay(ts){return arguments.length?ProgressionStats.localDay(ts):ProgressionStats.localDay()}
function statsStart(c){return ProgressionStats.statsStart(c,{safeStats,writeStats})}
function statsFinish(c,seconds,outcome){return ProgressionStats.statsFinish(c,seconds,outcome,{safeStats,writeStats})}
function statsSummary(){return ProgressionStats.statsSummary({safeStats})}
let current=null, tick=null, startedAt=0, elapsedBase=0, paused=false;
let DIFF={};
function lang(){let l=prefs().lang;return SUPPORTED_LANGS.includes(l)?l:'fr'}
function dateLocale(){return {"en":"en-US","zh":"zh-CN","hi":"hi-IN","es":"es-ES","ar":"ar","fr":"fr-FR","bn":"bn-BD","pt":"pt-PT","id":"id-ID","ur":"ur-PK","bg":"bg-BG","hr":"hr-HR","cs":"cs-CZ","da":"da-DK","nl":"nl-NL","et":"et-EE","fi":"fi-FI","de":"de-DE","el":"el-GR","hu":"hu-HU","ga":"ga-IE","it":"it-IT","lv":"lv-LV","lt":"lt-LT","mt":"mt-MT","pl":"pl-PL","ro":"ro-RO","sk":"sk-SK","sl":"sl-SI","sv":"sv-SE"}[lang()]||'en-US'}
function tr(k){return I18N[lang()]?.[k]??I18N.en[k]??I18N.fr[k]??k}
function updateI18n(){
  Object.assign(DIFF,{easy:tr('easy'),medium:tr('medium'),hard:tr('hard'),expert:tr('expert')});
  let l=lang(),rtl=RTL_LANGS.has(l);document.documentElement.lang=l==='zh'?'zh-Hans':l;document.documentElement.dir=rtl?'rtl':'ltr';
  document.body?.classList?.toggle('rtl',rtl);
  let hb=$('#homeBtn');if(hb)hb.setAttribute('aria-label',tr('homeAria'));
  let tb=$('#themeBtn');if(tb)tb.setAttribute('aria-label',tr('changeTheme'));
  let busy=$('#busyOverlay span');if(busy)busy.textContent=tr('generating');
  let skip=$('#skipLink');if(skip)skip.textContent=a11ySkipLabel();
}

function a11ySkipLabel(){return A11Y_SKIP_LABELS[lang()]||A11Y_SKIP_LABELS.en}
function a11yAttr(x){return String(x??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function a11yCoord(r,c){return `${tr('rowLabel')} ${r+1}, ${tr('columnLabel')} ${c+1}`}
function a11yAnnounce(text){let live=$('#a11yLive');if(!live||!text)return;live.textContent='';requestAnimationFrame(()=>{live.textContent=String(text)})}
function a11yRestoreFocus(preferred,fallback=null){
  requestAnimationFrame(()=>{let pick=s=>typeof s==='string'?$(s):s,first=pick(preferred),second=pick(fallback),target=first&&!first.disabled?first:second&&!second.disabled?second:null;if(!target)return;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'})})
}
function a11yCellFlags(el){
  if(!el)return;
  let invalid=el.classList.contains('illegal')||el.classList.contains('error')||el.classList.contains('error-focus');
  if(invalid)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid');
  if(el.classList.contains('unjustified-piece'))el.setAttribute('aria-description',tr('moveUnjustified'));else el.removeAttribute('aria-description')
}
function a11ySetCell(el,r,c,label,{readonly=false,selected=false}={}){
  if(!el)return;el.setAttribute('role','gridcell');el.setAttribute('aria-rowindex',String(r+1));el.setAttribute('aria-colindex',String(c+1));el.setAttribute('aria-label',label);
  if(readonly)el.setAttribute('aria-readonly','true');else el.removeAttribute('aria-readonly');
  if(selected)el.setAttribute('aria-selected','true');else el.removeAttribute('aria-selected');a11yCellFlags(el)
}
function a11ySetupGrid(board,rows,cols,opts={}){
  if(!board)return;board.setAttribute('role','grid');board.setAttribute('aria-rowcount',String(rows));board.setAttribute('aria-colcount',String(cols));board.setAttribute('aria-label',opts.label||gameLabel(current?.game));
  board.setAttribute('aria-keyshortcuts',opts.keyshortcuts||'ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space');
  let cells=[...board.children],initial=Number.isInteger(opts.initialIndex)?opts.initialIndex:0;if(initial<0||initial>=cells.length)initial=0;
  cells.forEach((cell,i)=>{cell.tabIndex=i===initial?0:-1;if(!cell.dataset.r)cell.dataset.r=String(Math.floor(i/cols));if(!cell.dataset.c)cell.dataset.c=String(i%cols)});
  const focusIndex=(index,notify=true)=>{index=Math.max(0,Math.min(cells.length-1,index));cells.forEach((x,i)=>x.tabIndex=i===index?0:-1);let el=cells[index];if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});if(notify&&opts.onFocus)opts.onFocus(el,index)}return el};
  board.addEventListener('focusin',e=>{let cell=e.target.closest?.('.cell');if(!cell||cell.parentElement!==board)return;let i=cells.indexOf(cell);if(i>=0)cells.forEach((x,j)=>x.tabIndex=j===i?0:-1)});
  board.addEventListener('keydown',e=>{let cell=e.target.closest?.('.cell');if(!cell||cell.parentElement!==board)return;let i=cells.indexOf(cell),r=Math.floor(i/cols),c=i%cols,next=null;
    if(opts.onKey&&opts.onKey(e,cell,i)===true){e.preventDefault();return}
    if(e.key==='ArrowLeft')next=r*cols+Math.max(0,c-1);else if(e.key==='ArrowRight')next=r*cols+Math.min(cols-1,c+1);else if(e.key==='ArrowUp')next=Math.max(0,r-1)*cols+c;else if(e.key==='ArrowDown')next=Math.min(rows-1,r+1)*cols+c;else if(e.key==='Home')next=e.ctrlKey?0:r*cols;else if(e.key==='End')next=e.ctrlKey?cells.length-1:r*cols+(cols-1);
    if(next!=null){e.preventDefault();focusIndex(next,true);return}
    if((e.key==='Enter'||e.key===' ')&&opts.activate){e.preventDefault();opts.activate(cell,i)}
  });
  board._a11yFocusIndex=()=>{let i=cells.indexOf(document.activeElement);return i>=0?i:cells.findIndex(x=>x.tabIndex===0)}
}
let a11yDialogCounter=0;
function a11yFocusable(root){return [...root.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden&&x.getClientRects().length)}
function a11yOpenDialog(root,initial=null){if(!root)return;let panel=root.querySelector('.sheet,.victory-card')||root,title=panel.querySelector('h1,h2');if(title&&!title.id)title.id=`a11y-dialog-title-${++a11yDialogCounter}`;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');if(title)root.setAttribute('aria-labelledby',title.id);panel.tabIndex=-1;root._a11yReturn=document.activeElement;root._a11yInert=[...document.body.children].filter(x=>x!==root&&x.tagName!=='SCRIPT');for(const x of root._a11yInert)x.inert=true;
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();a11yCloseDialog(root);return}if(e.key!=='Tab')return;let xs=a11yFocusable(root);if(!xs.length){e.preventDefault();panel.focus();return}let first=xs[0],last=xs[xs.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
  requestAnimationFrame(()=>{let target=initial?root.querySelector(initial):null;(target||a11yFocusable(root)[0]||panel).focus()})
}
function a11yCloseDialog(root,restore=true){if(!root)return;let ret=root._a11yReturn,inert=root._a11yInert||[];for(const x of inert)x.inert=false;root.remove();if(restore&&ret?.isConnected)requestAnimationFrame(()=>ret.focus())}
function gameRules(g){return GAME_RULES[g]?.[lang()]||GAME_RULES[g]?.en||''}

const PREF_KEY=PersistentData.keys.preferences;
function detectedLang(){try{for(let x of WebPlatform.locale.languages()){let c=String(x).toLowerCase().split('-')[0];if(c==='zh')return 'zh';if(SUPPORTED_LANGS.includes(c))return c}}catch(_){}return 'fr'}
function prefs(){return PersistentData.preferences.read({defaultLang:detectedLang(),supportedLangs:SUPPORTED_LANGS})}
function languageOptionsHtml(selected){return LANGUAGE_OPTIONS.map(([code,name])=>`<option value="${code}" ${selected===code?'selected':''}>${name}</option>`).join('')}
function savePrefs(p){PersistentData.preferences.write(p);applyPrefs()}
function resolvedTheme(){let p=prefs();return p.theme==='auto'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):p.theme}
function applyPrefs(){let p=prefs(),theme=resolvedTheme();document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeMode=p.theme;let meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#171916':'#f4f1e9';let b=$('#themeBtn');if(b){b.textContent=theme==='dark'?'☾':'☀︎';b.setAttribute('aria-label',`${tr('themeLabel')} : ${p.theme}`)}}
function cycleTheme(){let p=prefs(),m={auto:'light',light:'dark',dark:'auto'};p.theme=m[p.theme];savePrefs(p);showToast(`${tr('themeLabel')} : ${{auto:tr('auto'),light:tr('light'),dark:tr('dark')}[p.theme]}`)}
function toggleSound(){let p=prefs();p.sound=!p.sound;savePrefs(p);showToast(p.sound?tr('soundsOn'):tr('soundsOff'));return p.sound}
function playTone(kind='tap'){if(!prefs().sound)return;try{let A=window.AudioContext||window.webkitAudioContext;if(!A)return;let c=new A(),o=c.createOscillator(),g=c.createGain(),now=c.currentTime;o.type='sine';o.frequency.value=kind==='win'?659:kind==='error'?180:420;g.gain.setValueAtTime(kind==='win'?.06:.025,now);g.gain.exponentialRampToValueAtTime(.001,now+(kind==='win'?.38:.12));o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+(kind==='win'?.4:.13));setTimeout(()=>c.close().catch(()=>{}),600)}catch(_){}}
function postVictoryReviewState(c=current){let r=c?.postVictoryReview;return r&&r.schema===1&&r.outcome==='solved'&&Number.isFinite(Number(r.officialSeconds))?r:null}
function postVictoryReviewActive(c=current){let r=postVictoryReviewState(c);return !!(r?.active&&c?.statsClosed&&!c?.completed)}
function postVictoryReviewCanUndo(c=current){let r=postVictoryReviewState(c),h=c?.moveHistory,n=h?.nodes?.[h?.cursor];return !!(c?.completed&&c?.statsClosed&&r&&!r.active&&n?.parent&&h.nodes?.[n.parent])}
function dismissVictoryOverlay(restore=false){let root=$('#victory');if(root)a11yCloseDialog(root,restore)}
function cancelVictoryPresentation(removeFinal=true){if(victoryAnimationFrame!=null){try{cancelAnimationFrame(victoryAnimationFrame)}catch(_){}victoryAnimationFrame=null}if(victoryOverlayTimer!=null){try{clearTimeout(victoryOverlayTimer)}catch(_){}victoryOverlayTimer=null}dismissVictoryOverlay(false);let board=document.querySelector('.board'),victoryClass=gameVictoryClass(current?.game);VictoryPresentation.cancel({removeFinal,board,victoryClass})}
function freezePostVictoryReviewTimer(seconds=elapsedBase){stopTimer(false);elapsedBase=Math.max(0,Number(seconds)||0);startedAt=0;paused=false;renderTimer(false)}
function settingsView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;let p=prefs();
  app.innerHTML=`<section class="panel settings-panel"><div class="stats-head"><div><h1>${tr('prefs')}</h1><p>${tr('settingsSaved')}</p></div><button class="btn" id="settingsBack">${tr('back')}</button></div>
  <div class="setting-row"><span><b>${tr('language')}</b><small>${tr('languageSub')}</small></span><select id="langSelect" class="difficulty" aria-label="${tr('language')}">${languageOptionsHtml(p.lang)}</select></div>
  <div class="setting-row"><span><b>${tr('theme')}</b><small>${tr('themeSub')}</small></span><select id="themeSelect" class="difficulty" aria-label="${tr('theme')}"><option value="auto" ${p.theme==='auto'?'selected':''}>${tr('auto')}</option><option value="light" ${p.theme==='light'?'selected':''}>${tr('light')}</option><option value="dark" ${p.theme==='dark'?'selected':''}>${tr('dark')}</option></select></div>
  <div class="setting-row"><span><b>${tr('sounds')}</b><small>${tr('soundsSub')}</small></span><button class="btn" id="soundToggle" aria-pressed="${p.sound?'true':'false'}">${p.sound?tr('on'):tr('off')}</button></div>
  <div class="setting-row"><span><b>${tr('coachMode')}</b><small>${tr('coachModeSub')}</small></span><select id="coachModeSelect" class="difficulty" aria-label="${tr('coachMode')}"><option value="minimal" ${p.coachMode==='minimal'?'selected':''}>${tr('coachMinimal')}</option><option value="normal" ${p.coachMode==='normal'?'selected':''}>${tr('coachNormal')} · ${tr('recommended')}</option><option value="pedagogical" ${p.coachMode==='pedagogical'?'selected':''}>${tr('coachPedagogical')}</option></select></div>
  <div class="setting-row"><span><b>${tr('illegalAlerts')}</b><small>${tr('illegalAlertsSub')}</small></span><button class="btn" id="illegalAlertsToggle" aria-pressed="${p.notifyIllegal?'true':'false'}">${p.notifyIllegal?tr('on'):tr('off')}</button></div>
  ${UI_FEATURES.unjustifiedHighlights?`<div class="setting-row"><span><b>${tr('unjustifiedAlerts')}</b><small>${tr('unjustifiedAlertsSub')}</small></span><button class="btn" id="unjustifiedAlertsToggle" aria-pressed="${p.notifyUnjustified?'true':'false'}">${p.notifyUnjustified?tr('on'):tr('off')}</button></div>`:''}
  <div class="setting-row data-setting-row"><span><b>${tr('dataManage')}</b><small>${tr('dataManageSub')}</small></span><div class="data-actions"><button class="btn" id="storageInfo">${tr('privacy')}</button><button class="btn" id="dataExportBtn">${tr('exportData')}</button><button class="btn" id="dataImportBtn">${tr('importData')}</button><button class="btn danger" id="dataEraseBtn">${tr('eraseData')}</button></div><input class="sr-only" id="dataImportFile" type="file" accept="application/json,.json" /></div>
  <div class="setting-row data-setting-row"><span><b>QBUG · PNG</b><small>${tr('visibleOnly')} ${tr('challengeNoAccount')}${diagnosticAttachmentSummary()?`<br>${diagnosticAttachmentSummary()}`:''}</small></span><div class="data-actions"><button class="btn" id="diagnosticImageBtn" ${diagnosticActive()?'':'disabled'}>${tr('importData')} PNG</button>${diagnosticAttachmentSummary()?`<button class="btn" id="diagnosticImageClear">${tr('erase')}</button>`:''}<button class="btn" id="diagnosticExportBtn" ${diagnosticActive()?'':'disabled'}>${tr('exportData')}</button></div><input class="sr-only" id="diagnosticImageFile" type="file" accept="image/*" /></div></section>`;
  $('#settingsBack').onclick=home;$('#langSelect').onchange=e=>{let q=prefs();q.lang=e.target.value;savePrefs(q);updateI18n();settingsView()};$('#themeSelect').onchange=e=>{let q=prefs();q.theme=e.target.value;savePrefs(q)};$('#soundToggle').onclick=()=>{let on=toggleSound(),b=$('#soundToggle');b.textContent=on?tr('on'):tr('off');b.setAttribute('aria-pressed',String(on))};$('#coachModeSelect').onchange=e=>{let q=prefs();q.coachMode=e.target.value;savePrefs(q)};$('#illegalAlertsToggle').onclick=()=>{let q=prefs();q.notifyIllegal=!q.notifyIllegal;savePrefs(q);let b=$('#illegalAlertsToggle');b.textContent=q.notifyIllegal?tr('on'):tr('off');b.setAttribute('aria-pressed',String(q.notifyIllegal))};let unjustifiedToggle=$('#unjustifiedAlertsToggle');if(unjustifiedToggle)unjustifiedToggle.onclick=()=>{let q=prefs();q.notifyUnjustified=!q.notifyUnjustified;savePrefs(q);unjustifiedToggle.textContent=q.notifyUnjustified?tr('on'):tr('off');unjustifiedToggle.setAttribute('aria-pressed',String(q.notifyUnjustified))};$('#storageInfo').onclick=privacyInfoModal;$('#diagnosticImageBtn').onclick=()=>$('#diagnosticImageFile').click();$('#diagnosticImageFile').onchange=e=>handleDiagnosticImageFile(e.target.files?.[0]);let clear=$('#diagnosticImageClear');if(clear)clear.onclick=()=>{Diagnostic.clearAttachments();settingsView()};$('#diagnosticExportBtn').onclick=downloadDiagnostic;$('#dataExportBtn').onclick=downloadUserDataExport;$('#dataImportBtn').onclick=()=>$('#dataImportFile').click();$('#dataImportFile').onchange=handleUserDataFileImport;$('#dataEraseBtn').onclick=confirmEraseUserData;app.querySelectorAll('button').forEach(pressFeedback)
}
function aboutView(){
 if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;
 app.innerHTML=`<section class="panel about-panel"><div class="stats-head"><div><h1>${tr('aboutTitle')}</h1><p>QUADLUD</p></div><button class="btn" id="aboutBack">${tr('back')}</button></div>
 <div class="about-grid"><div><span>${tr('version')}</span><b>${VERSION}</b></div><div><span>${tr('copyright')}</span><b>© 2026 Serge Benoliel</b></div><div><span>${tr('license')}</span><b>${tr('proprietary')}</b></div></div>
 <p class="legal-text">${tr('legal')}</p></section>`;
 $('#aboutBack').onclick=home;app.querySelectorAll('button').forEach(pressFeedback)
}
function resultText(c,seconds){let daily=c?.daily?` · ${tr('dailyLabel')}`:'',challenge=c?.challengeCode?`\n${tr('challengeCode')}: ${c.challengeCode}\n${challengeLink(c.challengeCode)}`:'';return `QUADLUD — ${gameLabel(c.game)}${daily}\n${DIFF[c.diff]} · ${fmt(seconds)}\n✓ ${tr('finishedShare')}${challenge}`}
function resultSvg(c,seconds){
  let bg=resolvedTheme()==='dark'?'#171916':'#f4f1e9',ink=resolvedTheme()==='dark'?'#f2efe7':'#22231f',muted=resolvedTheme()==='dark'?'#b8b5ad':'#6b6a64',accent='#397466',title=gameLabel(c.game).replace(/&/g,'&amp;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" rx="80" fill="${bg}"/><circle cx="110" cy="112" r="22" fill="${accent}"/><text x="155" y="130" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="54" font-weight="700" fill="${ink}">QUADLUD</text><text x="90" y="410" font-family="Georgia,serif" font-size="112" font-weight="700" fill="${ink}">${title}</text><text x="90" y="520" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="48" fill="${muted}">${DIFF[c.diff]}${c.daily?` · ${tr('dailyLabel')}`:''}</text><text x="90" y="720" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="132" font-weight="800" fill="${ink}">${fmt(seconds)}</text><text x="90" y="820" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="42" fill="${accent}">✓ ${tr('finishedShare')}</text><text x="90" y="965" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="32" fill="${muted}">QUADLUD · v${VERSION}</text></svg>`
}
async function shareResult(c,seconds){
  let text=resultText(c,seconds);
  try{
    let file=WebPlatform.files.createTextFile(resultSvg(c,seconds),`quadlud-${c.game}-${localDay()}.svg`,'image/svg+xml');
    if(file&&WebPlatform.sharing.canShare({files:[file]})&&await WebPlatform.sharing.share({title:'QUADLUD',text,files:[file]}))return;
    if(await WebPlatform.sharing.share({title:'QUADLUD',text}))return;
    if(await WebPlatform.sharing.copyText(text)){showToast(tr('resultCopied'));return}
  }catch(e){
    if(e?.name==='AbortError')return;
    try{if(await WebPlatform.sharing.copyText(text)){showToast(tr('resultCopied'));return}}catch(_){}
  }
  showToast(tr('shareUnavailable'))
}
function victoryOverlay(c,seconds){
  let old=$('#victory');if(old)a11yCloseDialog(old,false);let dailyRec=c.daily?dailyRecord(c.dailyDay,c.game):null,next=c.daily?dailyNextGame(c.dailyDay):null;
  let dailyScore=c.daily?`<div class="victory-daily-score"><span>${tr('dailyLogicScore')}</span><strong>${dailyRec?.logicScore??'—'}/100</strong><small>${dailyRec?.logicScore!=null?dailyHelpLabel(dailyRec.helpStage):tr('dailyUnscoredLegacy')}</small></div>`:'';
  let dailyAction=c.daily?`<button class="btn primary" id="dailyVictoryNext">${next?tr('dailyNextGame'):tr('dailyReport')}</button>`:'',challengeAction=c.challengeCode?`<button class="btn primary" id="victoryShareChallenge">↗ ${tr('shareChallenge')}</button>`:'';
  document.body.insertAdjacentHTML('beforeend',`<div class="victory" id="victory"><div class="victory-card"><div class="victory-burst" aria-hidden="true">✦</div><small>${tr('victoryKicker')}</small><h2>${gameLabel(c.game)}</h2><div class="victory-time">${fmt(seconds)}</div>${dailyScore}<p>${DIFF[c.diff]}${c.daily?` · ${tr('dailyLabel')}`:''}</p><div class="victory-actions">${dailyAction}${challengeAction}<button class="btn" id="shareResult">${tr('share')}</button><button class="btn" id="closeVictory">${tr('continue')}</button></div></div></div>`);
  let root=$('#victory');$('#shareResult').onclick=()=>shareResult(c,seconds);$('#closeVictory').onclick=()=>a11yCloseDialog(root);
  let dn=$('#dailyVictoryNext');if(dn)dn.onclick=()=>{let d=c.dailyDay;a11yCloseDialog(root,false);next?launchDailyCircuit(d):dailyView()};let vc=$('#victoryShareChallenge');if(vc)vc.onclick=()=>shareChallenge(challengeParse(c.challengeCode));
  root.onclick=e=>{if(e.target===root)a11yCloseDialog(root)};a11yOpenDialog(root,'#closeVictory');playTone('win');haptic(28)
}

function markBacktrack(){if(current&&!current.completed)current.backtrackUsed=true}
function markHintUsed(){if(current&&!current.completed)current.hintUsed=true}
function aidBadges(c,compact=false){let a=[];if(c?.backtrackUsed)a.push(`<span class="aid-badge backtrack" title="${tr('backtrackFlag')}">↶${compact?'':` ${tr('backtrackFlag')}`}</span>`);if(c?.hintUsed)a.push(`<span class="aid-badge hint-used" title="${tr('hintFlag')}">💡${compact?'':` ${tr('hintFlag')}`}</span>`);return a.join(' ')}
function updateScoreFlags(){let m=document.querySelector('.difficulty-meter');if(!m||!current)return;let old=m.querySelector('.live-aids');if(old)old.remove();let h=document.createElement('span');h.className='live-aids';h.innerHTML=aidBadges(current,true);m.appendChild(h)}
function keyCell(r,c){return r+','+c}






function applyIllegalClasses(board,bad,n){if(!board)return;[...board.children].forEach((d,i)=>d.classList.toggle('illegal',bad.has(keyCell(Math.floor(i/n),i%n))))}
function illegalAlertsEnabled(){return prefs().notifyIllegal!==false}
function unjustifiedAlertsEnabled(){return UI_FEATURES.unjustifiedHighlights&&prefs().notifyUnjustified!==false}
function applyConfiguredIllegalClasses(board,bad,n){
  if(!board)return;
  if(!illegalAlertsEnabled()){[...board.children].forEach(d=>d.classList.remove('illegal'));return}
  applyIllegalClasses(board,bad,n)
}

// ===== v2.14.0 — explain visible rule violations and return before the error =====
function changedTargets(action){
  return (action?.changes||[]).filter(x=>x&&Number.isInteger(x.row)&&Number.isInteger(x.column))
}
function errorUsage(kind,technique=null){
  if(!current)return;
  let u=current.errorCoachUsage||(current.errorCoachUsage={detected:0,explained:0,returned:0,rejected:0});
  u[kind]=(u[kind]||0)+1;
  if(kind==='detected'&&technique&&PEDAGOGY_TECHNIQUES[technique])masteryRecord(technique,'errors')
}





// 29.5B / REF-1 — registry-driven pedagogy/audit lifecycle + reasoning-visible boundary.
let gamePedagogyAdapterCollection=null,sessionReasoningViewResolver=null;
function reasoningViewForSession(session=current){
  if(!session?.game)return null;
  if(typeof QuadludReasoningView==='undefined')throw new Error('QUADLUD reasoning-view contract unavailable');
  if(!sessionReasoningViewResolver)sessionReasoningViewResolver=QuadludReasoningView.createResolver({
    resolveSessionLifecycle:game=>GameRegistry.requireCapability(game,'sessionLifecycle'),
    resolvePublicPuzzleFromSession:game=>GameRegistry.requireCapability(game,'publicPuzzleFromSession')
  });
  return sessionReasoningViewResolver(session)
}
const PEDAGOGY_COMMON_SERVICES=Object.freeze({
  getCurrent:()=>current,
  reasoningView:()=>reasoningViewForSession(current),
  applyLogicalMove:move=>{
    if(!current?.game)return false;
    const lifecycle=GameRegistry.requireCapability(current.game,'sessionLifecycle');
    if(typeof lifecycle.applyLogicalMove!=='function')return false;
    lifecycle.applyLogicalMove(current,move);return true
  },
  cloneGrid,
  drawGameUi,
  lang:()=>lang,
  tr,
  cellName
});
function bindPedagogyRuntimeDependencies(names=[]){
  let out={};
  for(const name of names){
    let fn=typeof globalThis!=='undefined'?globalThis?.[name]:null;
    if(typeof fn!=='function')throw new Error(`QUADLUD pedagogy runtime dependency unavailable: ${name}`);
    out[name]=fn
  }
  return Object.freeze(out)
}
function gamePedagogyDependencies(game,lifecycle){
  const sessionLifecycle=GameRegistry.requireCapability(game,'sessionLifecycle'),common={...PEDAGOGY_COMMON_SERVICES};
  if(typeof sessionLifecycle.reasoningView==='function')delete common.getCurrent;
  return {
    common:Object.freeze(common),
    gameUi:()=>gameWebUi(game),
    runtime:bindPedagogyRuntimeDependencies(typeof lifecycle?.dependencyNames==='function'?lifecycle.dependencyNames():[])
  }
}
function createGamePedagogyAdapter(game){
  const lifecycle=GameRegistry.requireCapability(game,'pedagogyLifecycle');
  return lifecycle.createAdapter(gamePedagogyDependencies(game,lifecycle))
}
function gamePedagogyAdapters(){
  if(gamePedagogyAdapterCollection)return gamePedagogyAdapterCollection;
  if(typeof QuadludGamePedagogyAdapters==='undefined')throw new Error('QUADLUD pedagogy adapter collection unavailable');
  gamePedagogyAdapterCollection=QuadludGamePedagogyAdapters.createCollection(Array.from(GameRegistry.IDS),createGamePedagogyAdapter);
  return gamePedagogyAdapterCollection
}
function gamePedagogy(game=current?.game){return gamePedagogyAdapters().require(game)}

// ===== v2.18.1 — Logic Coach always explains visible errors before suggesting a move =====
function errorSignature(e){
  let cells=(e?.cells||[]).map(([r,c])=>`${r},${c}`).sort().join('|');
  return `${e?.rule||''}:${cells}`
}
function normalizeVisibleError(e){
  return e?{...e,schema:1,source:'visible-state',game:current?.game||e.game,at:WebPlatform.clock.nowMs(),canReturn:false}:null
}




function currentVisibleErrors(){
  if(!current||current.completed)return [];
  let list=gamePedagogy().audit.visibleErrors();
  let seen=new Set(),out=[];for(let e of list){let k=errorSignature(e);if(!seen.has(k)){seen.add(k);out.push(e)}}
  if(!out.length&&current.lastError?.source==='visible-state'&&current.lastError.canReturn===false)out.push({...current.lastError,transient:true});
  return out
}
function focusVisibleErrors(errors){
  clearErrorFocus();let board=document.querySelector('.board'),n=current?.n||6;if(!board)return;
  let seen=new Set();for(let e of errors)for(let [r,c] of e.cells||[]){let k=keyCell(r,c);if(seen.has(k))continue;seen.add(k);let d=board.children[r*n+c];if(d)d.classList.add('error-focus')}
}
function showVisibleErrorsBeforeHint(){
  let errors=currentVisibleErrors();if(!errors.length)return false;
  current.hintFlow=null;clearHintFocus();focusVisibleErrors(errors);
  let html=`<b>⚠ ${tr('errorDetected')}</b>`;
  for(let e of errors)html+=`<div class="coach-error-item"><b>${tr('errorRule')} :</b> ${errorRuleTitle(e)}<br><span>${errorDetailedMessage(e)}</span></div>`;
  if(current?.lastError?.canReturn)html+=`<button class="btn error-return-btn" onclick="returnBeforeLastError()">↶ ${tr('returnBeforeError')}</button>`;
  showHintNotice(html);errorUsage('explained');
  if(errors.every(e=>e.transient))current.lastError=null;
  saveCurrent();return true
}

function analyzeCurrentError(action){
  if(!current||current.completed||action?.type==='COACH_APPLY')return null;
  let e=gamePedagogy().audit.errorFromAction(action);
  if(!e)return null;
  return {...e,schema:1,source:'visible-state',game:current.game,at:WebPlatform.clock.nowMs(),canReturn:true}
}
function errorRuleTitle(e){
  if(!e)return '';
  if(e.technique&&PEDAGOGY_TECHNIQUES[e.technique])return techniqueTitle(e.technique);
  return gamePedagogy(e.game||current?.game).audit.errorRuleTitle(e)
}
function errorDetailedMessage(e){return e?gamePedagogy(e.game||current?.game).audit.errorDetailedMessage(e):''}
function clearErrorFocus(){document.querySelectorAll('.error-focus').forEach(x=>x.classList.remove('error-focus'))}
function focusErrorCells(e){
  clearErrorFocus();let board=document.querySelector('.board'),n=current?.n||6;if(!board||!e?.cells)return;
  for(let [r,c] of e.cells){let d=board.children[r*n+c];if(d)d.classList.add('error-focus')}
}
function refreshErrorCoach(){
  let box=$('#errorCoach');if(!box)return;
  let e=current?.lastError;
  if(!illegalAlertsEnabled()||!e){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.innerHTML=`<span class="error-coach-label">⚠ ${tr('errorDetected')}</span><button class="btn error-explain-btn" id="explainErrorBtn">${tr('explainError')}</button>`;
  let b=$('#explainErrorBtn');if(b)b.onclick=explainLastError
}
function explainLastError(){
  let e=current?.lastError;if(!e)return false;
  errorUsage('explained');focusErrorCells(e);
  let back=e.canReturn?`<button class="btn error-return-btn" onclick="returnBeforeLastError()">↶ ${tr('returnBeforeError')}</button>`:'';
  showHintNotice(`<b>${tr('errorRule')} :</b> ${errorRuleTitle(e)}<br><span class="error-explanation">${errorDetailedMessage(e)}</span>${back}`);
  saveCurrent();return true
}
function syncErrorFromHistory(){
  if(!current)return;
  let n=historyNode();current.lastError=n?.error?{...n.error}:null;clearErrorFocus();refreshErrorCoach()
}
function returnBeforeLastError(){
  let e=current?.lastError,h=current?.moveHistory;if(!e?.canReturn||!h||!e.historyNode||!e.parentNode)return false;
  let node=h.nodes[e.historyNode],parent=h.nodes[e.parentNode];if(!node||!parent)return false;
  parent.preferred=node.id;h.cursor=parent.id;h.stats.undos=(h.stats.undos||0)+1;markBacktrack();errorUsage('returned');
  restorePuzzleSnapshot(parent.snapshot);syncErrorFromHistory();updateHistoryButtons();diagnosticRecord('history.undo',{requested:1,moved:1,cursor:h.cursor});diagnosticPedagogy('audit','return-before-error',e.technique||null);saveCurrent();showToast(tr('errorReturned'));haptic(7);return true
}


function closePreviousAttempt(){
  let c=current&&current.attemptId&&!current.completed?current:null,saved=!c?getSaved():null;
  if(!c&&saved?.current?.attemptId&&!saved.current.completed)c=saved.current;
  if(c&&!c.statsClosed)statsFinish(c,c===current?timerSeconds():(saved?.elapsed||0),'abandoned')
}

// ===== v2.23 — reproducible certified friend challenges =====
// Protocol/deterministic responsibilities live in challenge-protocol.js; Web/session orchestration stays here.
const CHALLENGE_SCHEMA=ChallengeProtocol.schema,CHALLENGE_GENERATOR=ChallengeProtocol.generator,CHALLENGE_NAMESPACE=ChallengeProtocol.namespace,CHALLENGE_VERSION_LABEL=ChallengeProtocol.versionLabel;
const CHALLENGE_ALPHABET=ChallengeProtocol.alphabet;
const CHALLENGE_GAME_TO_CODE=ChallengeProtocol.gameToCode,CHALLENGE_CODE_TO_GAME=ChallengeProtocol.codeToGame;
const CHALLENGE_DIFF_TO_CODE=ChallengeProtocol.diffToCode,CHALLENGE_CODE_TO_DIFF=ChallengeProtocol.codeToDiff;
function challengeExpectedGenerator(game,diff){return ChallengeProtocol.expectedGenerator(game,diff)}
function challengeNormalizeCode(raw=''){return ChallengeProtocol.normalizeCode(raw)}
function challengeChecksum(payload){return ChallengeProtocol.checksum(payload)}
function challengeRandomSeed(len=8){return ChallengeProtocol.randomSeed(len)}
function challengeMake(game,diff,seed=challengeRandomSeed(),generator=null){return ChallengeProtocol.make(game,diff,seed,generator)}
function challengeParse(raw){return ChallengeProtocol.parse(raw)}
function challengeSeedString(ch){return ChallengeProtocol.seedString(ch)}
function challengePublicPuzzleFromCandidate(ch,g){return ChallengeProtocol.publicPuzzleFromCandidate(ch,g)}
function challengeFingerprintFromCandidate(ch,g){return ChallengeProtocol.fingerprintFromCandidate(ch,g)}
function challengeCandidateProfile(g){return ChallengeProtocol.candidateProfile(g)}
function challengeCandidateCertified(ch,g){return ChallengeProtocol.candidateCertified(ch,g)}
function gameSessionLifecycle(game){return GameRegistry.requireCapability(game,'sessionLifecycle')}
function createRegisteredGeneratedSession(game,diff,candidate,options={}){return gameSessionLifecycle(game).createGeneratedSession(diff,candidate,options)}
// Rendering is delegated through the registered UI lifecycle; session creation remains registry-driven and separate from UI.
function renderInstalledSession(c){return renderGameUi(c)}
function installGeneratedSession(game,diff,candidate,{context='normal',metadata=null}={}){
  current=createRegisteredGeneratedSession(game,diff,candidate,{context});
  if(metadata&&typeof metadata==='object')Object.assign(current,metadata);
  renderInstalledSession(current);return current
}
function validateRegisteredVictory(session=current,options={}){
  if(!session?.game||!GameRegistry.hasCapability(session.game,'sessionLifecycle'))return {solved:false,reasonKey:'gridIncomplete'};
  return gameSessionLifecycle(session.game).validateVictory(session,options)
}
function checkRegisteredVictory(){let result=validateRegisteredVictory(current);if(result.solved)finish(`${tr('congrats')} ${gameLabel(current.game)}`);else status(tr(result.reasonKey||'gridIncomplete'),false);return result.solved}
function challengeBuildCandidate(ch){return ChallengeProtocol.buildCandidate(ch)}
function challengePublicFingerprint(ch){return ChallengeProtocol.publicFingerprint(ch)}
function challengeInstall(ch,g){
  return installGeneratedSession(ch.game,ch.diff,g,{context:'challenge',metadata:{challenge:true,challengeCode:ch.code,challengeSeed:ch.seed,challengeGenerator:ch.generator,challengeFingerprint:challengeFingerprintFromCandidate(ch,g)}})
}
function launchChallenge(value){
  let ch=typeof value==='string'?challengeParse(value):value;if(!ch){showToast(tr('invalidChallengeCode'));return false}
  closePreviousAttempt();clearSaved();stopTimer();paused=false;setBusy(true);
  requestAnimationFrame(()=>{try{
    let g=challengeBuildCandidate(ch);if(!g)throw new Error('challenge generation failed');challengeInstall(ch,g);
    historyInit(true);diagnosticStart('challenge');updateHistoryButtons();statsStart(current);startTimer(true,0,false);saveCurrent();haptic(8)
  }catch(_){showToast(tr('invalidChallengeCode'));home()}finally{setBusy(false);startBackgroundPrecompute(ch.game,ch.diff)}});return true
}
function challengeDiffOptions(game,selected='medium'){
  let ds=['easy','medium','hard','expert'];
  return ds.map(d=>`<option value="${d}" ${d===selected?'selected':''}>${DIFF[d]}</option>`).join('')
}
function challengeLink(code){
  try{if(typeof location!=='undefined'&&location.href){let base=location.href.split('#')[0].split('?')[0];return `${base}#challenge=${encodeURIComponent(code)}`}}catch(_){}
  return `#challenge=${encodeURIComponent(code)}`
}
function challengeShareText(ch){
  return `QUADLUD — ${tr('challenge')}\n${gameLabel(ch.game)} · ${DIFF[ch.diff]}\n${tr('challengeCode')}: ${ch.code}\n${challengeLink(ch.code)}`
}
async function copyChallengeCode(code){
  try{if(await WebPlatform.sharing.copyText(code)){showToast(tr('codeCopied'));return true}}catch(_){}
  showToast(tr('shareUnavailable'));return false
}
async function shareChallenge(ch){
  let text=challengeShareText(ch),url=challengeLink(ch.code);
  try{
    if(await WebPlatform.sharing.share({title:`QUADLUD — ${tr('challenge')}`,text,url}))return true;
    if(await WebPlatform.sharing.copyText(text)){showToast(tr('codeCopied'));return true}
  }catch(e){if(e?.name==='AbortError')return false;try{if(await WebPlatform.sharing.copyText(text)){showToast(tr('codeCopied'));return true}}catch(_){}}
  showToast(tr('shareUnavailable'));return false
}
function challengeReadyHtml(ch,fromLink=false){
  return `<div class="challenge-ready"><small>${fromLink?tr('challengeFromLink'):tr('challengeReady')}</small><div class="challenge-code">${ch.code}</div><div class="challenge-meta"><b>${gameLabel(ch.game)}</b><span>${DIFF[ch.diff]}</span><span>${tr('challengeGenerator')} ${CHALLENGE_VERSION_LABEL}</span></div><p>${tr('challengeSamePuzzle')} ${tr('challengeNoAccount')}</p><div class="challenge-actions"><button class="btn primary" id="challengePlay">${tr('playChallenge')}</button><button class="btn" id="challengeShare">${tr('shareChallenge')}</button><button class="btn" id="challengeCopy">${tr('copyCode')}</button></div></div>`
}
function challengeView(prefill=null,fromLink=false){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let challengeGames=Object.keys(CHALLENGE_GAME_TO_CODE),ch=typeof prefill==='string'?challengeParse(prefill):prefill,game=ch?.game||challengeGames[0],diff=ch?.diff||'medium';
  app.innerHTML=`<section class="panel challenge-panel"><div class="stats-head"><div><h1>${tr('challenge')}</h1><p>${tr('challengeSub')}</p></div><button class="btn" id="challengeBack">${tr('back')}</button></div>
    <div class="challenge-columns">
      <section class="challenge-box"><h2>${tr('createChallenge')}</h2><label>${tr('game')}<select class="difficulty" id="challengeGame">${challengeGames.map(g=>`<option value="${g}" ${g===game?'selected':''}>${gameLabel(g)}</option>`).join('')}</select></label><label>${tr('difficulty')}<select class="difficulty" id="challengeDiff">${challengeDiffOptions(game,diff)}</select></label><button class="btn primary" id="challengeGenerate">${tr('generateChallenge')}</button></section>
      <section class="challenge-box"><h2>${tr('joinChallenge')}</h2><label>${tr('challengeCode')}<input id="challengeInput" class="challenge-input" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QL21-QM-XXXXXXXX-XX" value="${ch?.code||''}"></label><button class="btn" id="challengeJoin">${tr('joinChallenge')}</button></section>
    </div>
    <div id="challengeReady">${ch?challengeReadyHtml(ch,fromLink):`<p class="challenge-note">${tr('challengeNoAccount')}</p>`}</div></section>`;
  $('#challengeBack').onclick=home;
  $('#challengeGame').onchange=e=>{let d=$('#challengeDiff');d.innerHTML=challengeDiffOptions(e.target.value,d.value)};
  $('#challengeGenerate').onclick=()=>challengeView(challengeMake($('#challengeGame').value,$('#challengeDiff').value),false);
  $('#challengeJoin').onclick=()=>{let parsed=challengeParse($('#challengeInput').value);if(!parsed)return showToast(tr('invalidChallengeCode'));challengeView(parsed,false)};
  if(ch){$('#challengePlay').onclick=()=>launchChallenge(ch);$('#challengeShare').onclick=()=>shareChallenge(ch);$('#challengeCopy').onclick=()=>copyChallengeCode(ch.code)}
  app.querySelectorAll('button').forEach(pressFeedback)
}
function challengeFromHash(){
  try{if(typeof location==='undefined')return null;let m=String(location.hash||'').match(/^#challenge=([^&]+)/i);return m?challengeParse(decodeURIComponent(m[1])):null}catch(_){return null}
}
function initialView(){let ch=challengeFromHash();if(ch)return challengeView(ch,true);home()}

const DAILY_KEY=PersistentData.keys.daily;
// Deterministic Daily state/scoring lives in daily-model.js; rendering/session orchestration stays here.
const DAILY_SCHEMA=DailyModel.schema,DAILY_GENERATOR=DailyModel.generator,DAILY_NAMESPACE=DailyModel.namespace,DAILY_DIFFICULTY=DailyModel.difficulty;
const DAILY_GAMES=DailyModel.games,DAILY_LOGIC_POINTS=DailyModel.logicPoints;
function dailyState(){return DailyModel.state()}
function saveDailyState(x){return DailyModel.saveState(x)}
function dailyKey(day,game){return DailyModel.key(day,game)}
function dailyRecord(day,game,state=dailyState()){return DailyModel.record(day,game,state)}
function dailySeedString(day,game){return DailyModel.seedString(day,game)}
function dailyBuildCandidate(day,game){return DailyModel.buildCandidate(day,game)}
function dailyFingerprintFromCandidate(game,g){return DailyModel.fingerprintFromCandidate(game,g)}
function dailyPublicFingerprint(day,game){return DailyModel.publicFingerprint(day,game)}
function dailyInstallCandidate(game,g,day){
  rememberGeneratedCandidateThisSession(game,g,day);
  return installGeneratedSession(game,DAILY_DIFFICULTY,g,{context:'daily',metadata:{daily:true,dailyDay:day,dailyCircuit:true,dailySchema:DAILY_SCHEMA,dailyGenerator:DAILY_GENERATOR,dailyFingerprint:dailyFingerprintFromCandidate(game,g)}})
}
function dailyHelpStage(c){return DailyModel.helpStage(c)}
function dailyHelpLabel(stage){
  return [tr('dailyNoHelp'),tr('dailyOrientation'),tr('dailyRuleHelp'),tr('dailyExplanationHelp'),tr('dailyRevealHelp')][Math.max(0,Math.min(4,Number(stage)||0))]
}
function dailyLogicScore(c){return DailyModel.logicScore(c)}
function dailyErrorCount(c){return DailyModel.errorCount(c)}
function dailyBacktrackCount(c){return DailyModel.backtrackCount(c)}
function markDaily(c,outcome,seconds){return DailyModel.mark(c,outcome,seconds)}
function dailyProgress(day=localDay()){return DailyModel.progress(day)}
function dailyHomeLine(day=localDay()){let s=dailyCircuitSummary(day);return `${s.completed}/${DAILY_GAMES.length} · ${s.scoreKnown?`${s.totalScore}/${DAILY_GAMES.length*100}`:tr('dailyLogicScore')}`}
function dailyCircuitSummary(day=localDay(),state=dailyState()){return DailyModel.circuitSummary(day,state)}
function dailyNextGame(day=localDay(),state=dailyState()){return DailyModel.nextGame(day,state)}
function dailyCalendar(days=28){return DailyModel.calendar(days)}
function dailyCardHtml(g,r){
  let done=r?.outcome==='solved',score=done&&Number.isFinite(Number(r.logicScore))?`${r.logicScore}/100`:done?'—/100':'',help=done&&r.logicScore!=null?dailyHelpLabel(r.helpStage):done?tr('dailyUnscoredLegacy'):'';
  return `<button class="daily-game ${done?'done':''}" data-daily="${g}"><span aria-hidden="true">${gameIcon(g)}</span><b>${gameLabel(g)}</b><small>${done?`✓ ${score} · ${help} · ${fmt(r.best??r.seconds)}`:tr('play')}</small></button>`
}
function dailyReportHtml(day,state=dailyState()){
  let sum=dailyCircuitSummary(day,state),rows=sum.rows.map(({game,record:r})=>{
    let done=r?.outcome==='solved',score=done&&r.logicScore!=null?`${r.logicScore}/100`:'—',help=done&&r.logicScore!=null?dailyHelpLabel(r.helpStage):done?tr('dailyUnscoredLegacy'):'—';
    return `<div class="daily-report-row ${done?'done':''}"><span>${gameIcon(game)}</span><b>${gameLabel(game)}</b><strong>${score}</strong><small>${help}</small><small>${tr('dailyErrorsCount')} ${r?.errors??0} · ${tr('dailyBacktracksCount')} ${r?.backtracks??0}</small></div>`
  }).join('');
  let maxScore=DAILY_GAMES.length*100,score=sum.scoreKnown?`${sum.totalScore}/${maxScore}`:`${sum.totalScore}/${maxScore}*`;
  return `<section class="daily-report"><div class="daily-report-score"><span>${tr('dailyLogicScore')}</span><strong>${score}</strong><small>${sum.complete?tr('dailyCompleteReport'):`${sum.completed}/${DAILY_GAMES.length} ${tr('finished')}`}</small></div>${rows}<p>${tr('dailyScoreNote')}</p><p><small>${tr('dailyScoreLocked')}</small></p></section>`
}
function dailyView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let day=localDay(),s=dailyState(),sum=dailyCircuitSummary(day,s),cards=DAILY_GAMES.map(g=>dailyCardHtml(g,dailyRecord(day,g,s))).join('');
  let cal=dailyCalendar().reverse().map(x=>`<div class="day-dot level-${x.n}" title="${x.day} · ${x.n}/${DAILY_GAMES.length}${x.score==null?'':` · ${x.score}/${DAILY_GAMES.length*100}`}"><span>${new Date(x.day+'T12:00:00').getDate()}</span></div>`).join('');
  let circuitLabel=sum.complete?tr('dailyReport'):(sum.completed?tr('dailyResumeCircuit'):tr('dailyStartCircuit'));
  app.innerHTML=`<section class="panel daily-panel"><div class="stats-head"><div><h1>${tr('dailyCircuit')}</h1><p>${new Date(day+'T12:00:00').toLocaleDateString(dateLocale(),{weekday:'long',day:'numeric',month:'long'})} · ${tr('dailyCircuitSub')}</p></div><button class="btn" id="dailyBack">${tr('back')}</button></div>
    <button class="btn primary daily-circuit-cta" id="dailyCircuitBtn">${sum.complete?`✓ ${circuitLabel}`:`◆ ${circuitLabel} · ${sum.completed}/${DAILY_GAMES.length}`}</button>
    ${dailyReportHtml(day,s)}
    <div class="daily-games">${cards}</div><h2>${tr('dailyLast')}</h2><div class="daily-calendar">${cal}</div><p class="daily-note">${tr('dailyNote')}</p></section>`;
  $('#dailyBack').onclick=home;$('#dailyCircuitBtn').onclick=()=>sum.complete?dailyView():launchDailyCircuit(day);
  app.querySelectorAll('[data-daily]').forEach(b=>b.onclick=()=>launchDaily(b.dataset.daily,day));app.querySelectorAll('button').forEach(pressFeedback)
}
function launchDailyCircuit(day=localDay()){let next=dailyNextGame(day);if(!next)return dailyView();launchDaily(next,day)}
function launchDaily(game,day=localDay()){
  if(!DAILY_GAMES.includes(game)||!dailySeedString(day,game))return false;
  closePreviousAttempt();clearSaved();stopTimer();paused=false;setBusy(true);current={game,diff:DAILY_DIFFICULTY,daily:true,dailyDay:day};
  requestAnimationFrame(()=>{try{
    let g=dailyBuildCandidate(day,game);if(!g)throw new Error('Daily generation failed');dailyInstallCandidate(game,g,day);
    historyInit(true);diagnosticStart('daily');updateHistoryButtons();statsStart(current);startTimer(true,0,false);saveCurrent();haptic(8)
  }finally{setBusy(false);startBackgroundPrecompute(game,DAILY_DIFFICULTY)}});return true
}
const coarsePointer=()=>window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
function haptic(ms=12){WebPlatform.haptics.vibrate(ms)}
function setBusy(on,label=null){label=label||tr('generating');document.body.classList.toggle('busy',!!on);document.body.setAttribute('aria-busy',String(!!on));let x=$('#busyOverlay');if(x){x.hidden=!on;x.setAttribute('aria-busy',String(!!on));let s=x.querySelector('span');if(s)s.textContent=label}}
function pressFeedback(el){if(!el)return;el.addEventListener('pointerdown',()=>el.classList.add('pressed'),{passive:true});for(let ev of ['pointerup','pointercancel','pointerleave'])el.addEventListener(ev,()=>el.classList.remove('pressed'),{passive:true})}

function showToast(t){toast.textContent=t;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1400)}

function closeHintNotice(){let n=$('#hintNotice');if(n)n.remove()}
function clampHintPosition(n,left,top){
  let w=n.offsetWidth||Math.min((window.innerWidth||390)*.92,520),h=n.offsetHeight||130,pad=8,W=window.innerWidth||390,H=window.innerHeight||844;
  return [Math.max(pad,Math.min(left,W-w-pad)),Math.max(pad,Math.min(top,H-h-pad))]
}
function makeHintDraggable(n){
  let h=n?.querySelector('.hint-drag-handle');if(!h)return;
  h.onpointerdown=e=>{
    if(e.button!=null&&e.button!==0)return;e.preventDefault();
    let rect=n.getBoundingClientRect(),dx=e.clientX-rect.left,dy=e.clientY-rect.top;
    n.style.left=rect.left+'px';n.style.top=rect.top+'px';n.style.bottom='auto';n.style.transform='none';
    try{h.setPointerCapture(e.pointerId)}catch(_){}
    h.onpointermove=ev=>{if(ev.pointerId!==e.pointerId)return;ev.preventDefault();let [x,y]=clampHintPosition(n,ev.clientX-dx,ev.clientY-dy);n.style.left=x+'px';n.style.top=y+'px'};
    let done=ev=>{if(ev.pointerId!==e.pointerId)return;try{h.releasePointerCapture(ev.pointerId)}catch(_){};h.onpointermove=null;h.onpointerup=null;h.onpointercancel=null};
    h.onpointerup=done;h.onpointercancel=done
  }
}
function showHintNotice(text){
  closeHintNotice();
  document.body.insertAdjacentHTML('beforeend',`<div class="hint-notice" id="hintNotice" role="status"><div class="hint-drag-handle" title="${tr('dragHint')}" aria-label="${tr('dragHint')}"><span>⋮⋮</span> ${tr('dragHint')}</div><div class="hint-notice-text">${text}</div><button class="btn primary hint-close" id="hintClose">${tr('closeHint')}</button></div>`);
  let n=$('#hintNotice');$('#hintClose').onclick=closeHintNotice;makeHintDraggable(n)
}
function timerSeconds(){return elapsedBase+(!paused&&startedAt?Math.floor((WebPlatform.clock.nowMs()-startedAt)/1000):0)}
function renderTimer(final=false){timerEl.textContent=fmt(timerSeconds());timerEl.hidden=!UI_FEATURES.liveTimer&&!final}
function resetTimerDisplay(){timerEl.textContent='00:00';timerEl.hidden=!UI_FEATURES.liveTimer}
function startTimer(reset=true,initial=0,isPaused=false){stopTimer(false);elapsedBase=reset?initial:timerSeconds();paused=isPaused;startedAt=paused?0:WebPlatform.clock.nowMs();renderTimer(false);if(!paused)tick=setInterval(()=>{renderTimer(false);if(current)saveCurrent()},1000)}
function stopTimer(commit=true){if(commit&&!paused&&startedAt){elapsedBase=timerSeconds();startedAt=0}if(tick)clearInterval(tick);tick=null}
function togglePause(){if(!current||current.completed)return;if(paused){paused=false;startedAt=WebPlatform.clock.nowMs();tick=setInterval(()=>{renderTimer();if(current)saveCurrent()},1000);showToast('Chrono repris')}else{elapsedBase=timerSeconds();startedAt=0;paused=true;if(tick)clearInterval(tick);tick=null;showToast('Chrono en pause')}updatePauseButton();saveCurrent()}
function updatePauseButton(){let b=$('#pauseBtn');if(b)b.textContent=paused?tr('resume'):tr('pause');updateHistoryButtons()}
function fmt(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function modal(title,html){let old=$('#modal');if(old)a11yCloseDialog(old,false);document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><h2>${title}</h2>${html}<button class="btn primary" id="modalClose">${tr('closeHint')}</button></div></div>`);let root=$('#modal');$('#modalClose').onclick=()=>a11yCloseDialog(root);root.onclick=e=>{if(e.target===root)a11yCloseDialog(root)};a11yOpenDialog(root,'#modalClose')}
function confirmActionModal(title,html,confirmLabel,onConfirm){let old=$('#modal');if(old)a11yCloseDialog(old,false);document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><h2>${title}</h2>${html}<div class="modal-actions"><button class="btn" id="modalCancel">${tr('cancel')}</button><button class="btn danger" id="modalConfirm">${confirmLabel}</button></div></div></div>`);let root=$('#modal');$('#modalCancel').onclick=()=>a11yCloseDialog(root);$('#modalConfirm').onclick=()=>{a11yCloseDialog(root,false);onConfirm?.()};root.onclick=e=>{if(e.target===root)a11yCloseDialog(root)};a11yOpenDialog(root,'#modalCancel')}

// ===== v2.11.0 — structured Logic Coach reasoning + branching move history =====

// ===== v2.13.0 — pedagogical technique library =====
const PEDAGOGY_TECHNIQUES=PedagogyMetadata.CATALOG;
function techniqueTerm(k){let t=TECHNIQUE_TERMS[lang()]||TECHNIQUE_TERMS.en;return t[k]||TECHNIQUE_TERMS.en[k]||k}
function techniqueScope(scope){
  if(scope==='row')return tr('rowLabel');
  if(scope==='column')return tr('columnLabel');
  if(scope==='region')return tr('zone');
  if(scope==='box')return '2×3';
  return ''
}
function techniqueTitle(id){
  let x=PEDAGOGY_TECHNIQUES[id];if(!x)return id||techniqueTerm('technique');
  let direct=tr(id),title=direct!==id?direct:techniqueTerm(x.kind);
  if(x.scope)title+=` · ${techniqueScope(x.scope)}`;
  if(x.symbol)title+=` ${x.symbol}`;
  if(x.kind==='balance')title+=' 3/3';
  if(x.kind==='contradiction')title+=` · R${x.rank}`;
  return title
}
function techniqueSummary(id){
  let x=PEDAGOGY_TECHNIQUES[id];if(!x)return tr('directReason');
  if(x.rank===1)return tr('rank1Reason');
  if(x.rank===2)return tr('rank2Reason');
  if(x.rank===3)return tr('rank3Reason');
  return tr('directReason')
}
function techniqueIdsForGame(game){return PedagogyMetadata.catalogIdsForGame(game)}
function activeTechniqueIds(){return GAME_IDS.flatMap(techniqueIdsForGame)}
function techniqueLibraryHtml(game){
  let ids=techniqueIdsForGame(game);
  return `<div class="technique-library">${ids.map(id=>{let x=PEDAGOGY_TECHNIQUES[id];return `<article class="technique-card"><div class="technique-card-head"><b>${techniqueTitle(id)}</b><code>${id}</code></div><small>R${x.rank}</small><p>${techniqueSummary(id)}</p></article>`}).join('')}</div>`
}


// ===== v2.15.0 — logical mastery profile =====
const MASTERY_KINDS=MasteryModel.KINDS;
function emptyMasteryCounts(){return MasteryModel.emptyCounts()}
function normalizeMasteryCounts(x={}){return MasteryModel.normalizeCounts(x)}
function masterySessionBucket(id){
  if(!current||!PEDAGOGY_TECHNIQUES[id])return null;
  let s=current.masterySession||(current.masterySession={schema:1,techniques:{}});
  if(!s.techniques)s.techniques={};
  if(!s.techniques[id])s.techniques[id]=emptyMasteryCounts();
  return s.techniques[id]
}
function masteryRecord(id,kind){
  let b=masterySessionBucket(id);if(!b||!MASTERY_KINDS.includes(kind))return false;
  if(kind==='solo'||kind==='where'||kind==='where3'||kind==='errors')b.encountered++;
  b[kind]++;return true
}
function cloneMasterySession(s){return MasteryModel.cloneSession(s)}
function masteryMergeCounts(dst,src){return MasteryModel.mergeCounts(dst,src)}
function masteryMergeIntoStats(stats,session){
  if(!stats.mastery||typeof stats.mastery!=='object')stats.mastery={schema:1,byTechnique:{},updatedAt:null};
  if(!stats.mastery.byTechnique)stats.mastery.byTechnique={};
  for(let [id,c] of Object.entries(session?.techniques||{})){
    if(!PEDAGOGY_TECHNIQUES[id])continue;
    stats.mastery.byTechnique[id]=masteryMergeCounts(stats.mastery.byTechnique[id],c)
  }
  if(session?.techniques&&Object.keys(session.techniques).length)stats.mastery.updatedAt=WebPlatform.clock.nowMs()
}
function masteryLegacyFromHistory(history=[]){return MasteryModel.legacyFromHistory(history,PEDAGOGY_TECHNIQUES)}
function effectiveMasteryByTechnique(stats=safeStats()){
  let out={};
  for(let id of Object.keys(PEDAGOGY_TECHNIQUES))out[id]=normalizeMasteryCounts(stats?.mastery?.byTechnique?.[id]);
  let legacy=masteryLegacyFromHistory(stats?.history||[]);
  for(let [id,c] of Object.entries(legacy))out[id]=masteryMergeCounts(out[id],c);
  return out
}
function masteryMetrics(c){return MasteryModel.metrics(c)}
function masteryLevel(m){return MasteryModel.level(m)}

function currentTechniqueMastery(id){
  if(!PEDAGOGY_TECHNIQUES[id])return masteryMetrics(emptyMasteryCounts());
  let all=effectiveMasteryByTechnique(safeStats()),base=normalizeMasteryCounts(all[id]),session=current?.masterySession?.techniques?.[id];
  return masteryMetrics(session?masteryMergeCounts(base,session):base)
}
function adaptiveCoachPlan(technique,mode=null){mode=current?.coachModeOverride||mode||prefs().coachMode;
  let m=currentTechniqueMastery(technique),lv=masteryLevel(m),entryStage=1,reason='light';
  if(mode==='minimal'){entryStage=1;reason='light'}
  else if(mode==='normal'){
    if(m.samples<3){entryStage=2;reason='learning'}
    else if(m.score>=75){entryStage=1;reason='light'}
    else{entryStage=2;reason='reinforced'}
  }else{
    if(m.score!=null&&m.score>=90){entryStage=1;reason='light'}
    else{entryStage=2;reason=m.samples<3?'learning':'reinforced'}
  }
  return {mode,entryStage,reason,technique,score:m.score,samples:m.samples,confidence:m.confidence,levelKey:lv.key,flowVersion:2}
}
function adaptiveCoachNote(plan){
  if(!plan||plan.mode==='minimal')return '';
  let label=plan.reason==='light'?tr('adaptiveLight'):plan.reason==='reinforced'?tr('adaptiveReinforced'):tr('adaptiveLearning');
  let detail=plan.samples<3?tr('masteryInsufficient'):`${tr(plan.levelKey)}${plan.score==null?'':` · ${plan.score}%`}`;
  return `<span class="coach-adaptive-note"><b>${tr('adaptiveHelp')} :</b> ${label} · ${detail}</span>`
}
function coachStageBlock(stage,kind,target,message){
  if(stage===1)return `<b>${tr('where')} :</b> ${message.look||coachLookText(kind,target,message)}`;
  if(stage===2)return `<b>${tr('hintWhy')} :</b> ${message.why}`;
  return `<b>${tr('hintMove')} :</b> ${message.move}<br><span class="hint-applied">${message.reveal}</span>`
}

function masteryStars(m){
  if(!m||m.samples<3||m.score==null)return '☆☆☆☆☆';
  let n=Math.max(1,Math.min(5,Math.round(m.score/20)));return '★★★★★'.slice(0,n)+'☆☆☆☆☆'.slice(n)
}
function masteryGameMetrics(game,all){
  let total=emptyMasteryCounts();for(let id of techniqueIdsForGame(game))total=masteryMergeCounts(total,all[id]);
  return masteryMetrics(total)
}
function masteryDirectHintFromSnapshot(beforeKey){
  if(!current||!beforeKey)return null;
  let s;try{s=JSON.parse(beforeKey)}catch(_){return null}
  if(!s||s.game!==current.game)return null;
  let snap=current,clone=DataSerialization.deserializeCurrentState(DataSerialization.serializeCurrentState(current));
  if(!SessionHistory.applyPuzzleSnapshot(clone,s))return null;
  current=clone;
  try{
    let h=gamePedagogy(clone.game).learning.masteryDirectHint();
    return h&&h.technique&&PEDAGOGY_TECHNIQUES[h.technique]?h:null
  }catch(_){return null}finally{current=snap}
}
function masteryActionMatchesHint(h,action){
  if(!h||!action)return false;
  if(action.type==='COACH_APPLY'||!gamePedagogy(current?.game).audit.masteryActionEligible(action))return false;
  let target=action.primaryTarget||action.target||null,expected=h.id!=null?h.id:h.v;
  if(target&&Array.isArray(target)){
    let [r,c]=target,ch=(action.changes||[]).find(x=>x.row===r&&x.column===c);
    return r===h.r&&c===h.c&&!!ch&&ch.to===expected
  }
  if(target&&Number.isInteger(target.row)){
    let ch=(action.changes||[]).find(x=>x.row===target.row&&x.column===target.column);
    return target.row===h.r&&target.column===h.c&&!!ch&&ch.to===expected
  }
  return (action.changes||[]).some(ch=>ch.row===h.r&&ch.column===h.c&&ch.to===expected)
}
function masteryRecognizePlayerMove(beforeKey,action,error=null,audit=null){
  if(!current||current.training||error||!action||action.type==='COACH_APPLY')return false;
  if(audit?.status==='justified'&&audit.technique){
    let p=current.masteryPendingAid,t=Array.isArray(audit.target?.[0])?audit.target[0]:audit.target;
    if(p&&p.technique===audit.technique&&t&&p.target?.[0]===t[0]&&p.target?.[1]===t[1]){current.masteryPendingAid=null;return false}
    current.masteryPendingAid=null;return masteryRecord(audit.technique,'solo')
  }
  let h=masteryDirectHintFromSnapshot(beforeKey);if(!h||!masteryActionMatchesHint(h,action))return false;
  let p=current.masteryPendingAid;
  if(p&&p.technique===h.technique&&p.target?.[0]===h.r&&p.target?.[1]===h.c){current.masteryPendingAid=null;return false}
  current.masteryPendingAid=null;return masteryRecord(h.technique,'solo')
}
function masteryTechniqueCard(id,counts){
  let m=masteryMetrics(counts),lv=masteryLevel(m),pct=m.score==null?'—':`${m.score}%`;
  let aids=`<span title="${tr('where')}">🧭 ${m.whereOnly}</span><span title="${tr('rulesTitle')}">📘 ${m.ruleOnly}</span><span title="${tr('hintWhy')}">💡 ${m.whyOnly}</span><span title="${tr('solution')}">👁 ${m.revealed}</span>`;
  return `<article class="mastery-technique level-${lv.level}">
    <div class="mastery-technique-head"><div><b>${techniqueTitle(id)}</b><code>${id}</code></div><strong>${pct}</strong></div>
    <div class="mastery-stars" aria-label="${tr(lv.key)}">${masteryStars(m)} <small>${tr(lv.key)}</small></div>
    <div class="mastery-bar"><i style="width:${m.score??0}%"></i></div>
    <div class="mastery-detail"><span>${tr('masteryObserved')} <b>${m.encountered}</b></span><span>${tr('masterySolo')} <b>${m.solo}</b></span><span>${tr('masteryErrors')} <b>${m.errors}</b></span><span>${tr('masteryConfidence')} <b>${m.confidence}%</b></span></div>
    <div class="mastery-aids">${aids}</div><div class="mastery-card-actions"><button class="btn" data-learn-tech="${id}">${tr('learn')}</button><button class="btn mastery-train-btn" data-train-tech="${id}">${tr('train')}</button></div>
  </article>`
}
function masteryView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let s=safeStats(),all=effectiveMasteryByTechnique(s),games=GAME_IDS;
  let gm=games.map(g=>[g,masteryGameMetrics(g,all)]),globalCounts=emptyMasteryCounts();
  for(let [,m] of gm)globalCounts=masteryMergeCounts(globalCounts,m);
  let global=masteryMetrics(globalCounts),globalLv=masteryLevel(global),overall=global.score==null?'—':`${global.score}%`;
  let gameNav=gm.map(([g,m])=>{let lv=masteryLevel(m),score=m.score==null?'—':`${m.score}%`;return `<a class="mastery-game-summary level-${lv.level}" href="#mastery-${g}"><span aria-hidden="true">${gameIcon(g)}</span><b>${gameLabel(g)}</b><strong>${score}</strong><small>${tr(lv.key)} · ${m.samples} ${tr('masteryObserved').toLowerCase()}</small></a>`}).join('');
  let sections=games.map(g=>`<section class="mastery-game" id="mastery-${g}"><h2>${gameLabel(g)}</h2><div class="mastery-techniques">${techniqueIdsForGame(g).map(id=>masteryTechniqueCard(id,all[id])).join('')}</div></section>`).join('');
  app.innerHTML=`<section class="panel mastery-panel"><div class="stats-head"><div><h1>${tr('mastery')}</h1><p>${tr('masterySub')}</p></div><button class="btn" id="masteryBack">${tr('back')}</button></div>
  <div class="mastery-overall"><div><span>${tr('masteryOverall')}</span><strong>${overall}</strong><small>${tr(globalLv.key)}</small></div><div class="mastery-bar"><i style="width:${global.score??0}%"></i></div><p>${tr('masteryObserved')} : <b>${global.encountered}</b> · ${tr('masterySolo')} : <b>${global.solo}</b> · ${tr('masteryConfidence')} : <b>${global.confidence}%</b></p></div>
  <div class="mastery-games">${gameNav}</div>${sections}</section>`;
  $('#masteryBack').onclick=home;app.querySelectorAll('[data-learn-tech]').forEach(b=>b.onclick=()=>lessonView(b.dataset.learnTech));app.querySelectorAll('[data-train-tech]').forEach(b=>b.onclick=()=>launchTraining(b.dataset.trainTech));app.querySelectorAll('button').forEach(pressFeedback)
}



// ===== v2.18.0 — interactive Learn path =====
function learningBucket(stats,id){
  if(!stats.learning||typeof stats.learning!=='object')stats.learning={schema:1,byTechnique:{}};
  if(!stats.learning.byTechnique)stats.learning.byTechnique={};
  let b=stats.learning.byTechnique[id]||(stats.learning.byTechnique[id]={explanation:0,guided:0,assisted:0,independent:0,completed:0,attempts:0,bestIndependent:null});
  for(let k of ['explanation','guided','assisted','independent','completed','attempts'])b[k]=Math.max(0,Number(b[k])||0);
  b.bestIndependent=b.bestIndependent==null?null:Math.max(0,Number(b.bestIndependent)||0);return b
}
function learningProgressValue(b){
  b=b||{};if(b.completed>0||b.independent>0)return 4;if(b.assisted>0)return 3;if(b.guided>0)return 2;if(b.explanation>0)return 1;return 0
}
function learningStatsMark(id,field,seconds=null){
  let s=safeStats(),b=learningBucket(s,id);if(field==='attempts')b.attempts++;else if(field in b)b[field]++;
  if(field==='independent'&&seconds!=null)b.bestIndependent=b.bestIndependent==null?seconds:Math.min(b.bestIndependent,seconds);
  if(field==='independent')b.completed=Math.max(1,b.completed);writeStats(s);return b
}
function learningCompletedCount(stats=safeStats()){
  return activeTechniqueIds().filter(id=>learningBucket(stats,id).completed>0).length
}
function lessonMethodText(id){
  let x=PEDAGOGY_TECHNIQUES[id];return x?.kind==='contradiction'?tr('lessonContradictionMethod'):tr('lessonDirectMethod')
}
function lessonExplanationHtml(id){
  let x=PEDAGOGY_TECHNIQUES[id];if(!x)return '';
  let scope=x.scope?` · ${techniqueScope(x.scope)}`:'',rank=`R${x.rank}`;
  return `<div class="lesson-explanation">
    <div class="lesson-technique-head"><span>${gameLabel(x.game)}</span><code>${id}</code><b>${rank}${scope}</b></div>
    <h2>${techniqueTitle(id)}</h2>
    <p><b>${tr('lessonObserve')} :</b> ${techniqueTitle(id)}</p>
    <p><b>${tr('lessonGoal')} :</b> ${techniqueSummary(id)}</p>
    <p>${lessonMethodText(id)}</p>
  </div>`
}
function lessonStepsHtml(id,b){
  let p=learningProgressValue(b),items=[
    [1,tr('lessonExplanation')],[2,tr('lessonGuided')],[3,tr('lessonAssisted')],[4,tr('lessonIndependent')]
  ];
  return `<div class="lesson-steps">${items.map(([n,t])=>`<div class="lesson-step ${p>=n?'done':''} ${p+1===n?'current':''}"><span>${p>=n?'✓':n}</span><b>${t}</b></div>`).join('')}</div>`
}
function learningCard(id,stats){
  let b=learningBucket(stats,id),p=learningProgressValue(b),x=PEDAGOGY_TECHNIQUES[id];
  return `<article class="learning-card ${b.completed?'completed':''}">
    <div class="learning-card-head"><div><b>${techniqueTitle(id)}</b><code>${id}</code></div><strong>${p}/4</strong></div>
    <small>${gameLabel(x.game)} · R${x.rank}</small>
    <div class="learning-mini-bar"><i style="width:${p*25}%"></i></div>
    <button class="btn ${b.completed?'':'primary'}" data-lesson="${id}">${b.completed?tr('lessonComplete'):tr('lesson')}</button>
  </article>`
}
function learningView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let s=safeStats(),games=GAME_IDS,done=learningCompletedCount(s),total=activeTechniqueIds().length;
  let sections=games.map(g=>`<section class="learning-game"><h2>${gameLabel(g)}</h2><div class="learning-grid">${techniqueIdsForGame(g).map(id=>learningCard(id,s)).join('')}</div></section>`).join('');
  app.innerHTML=`<section class="panel learning-panel"><div class="stats-head"><div><h1>${tr('learn')}</h1><p>${tr('learnSub')}</p></div><button class="btn" id="learningBack">${tr('back')}</button></div>
    <div class="learning-overall"><b>${done}/${total}</b><span>${tr('lessonCompletedCount')}</span><div class="learning-mini-bar"><i style="width:${total?done/total*100:0}%"></i></div></div>${sections}</section>`;
  $('#learningBack').onclick=home;app.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>lessonView(b.dataset.lesson));app.querySelectorAll('button').forEach(pressFeedback)
}
function lessonView(id){
  if(!PEDAGOGY_TECHNIQUES[id])return learningView();if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let s=safeStats(),b=learningBucket(s,id),p=learningProgressValue(b);
  app.innerHTML=`<section class="panel lesson-panel"><div class="stats-head"><div><h1>${tr('lesson')} — ${techniqueTitle(id)}</h1><p>${gameLabel(PEDAGOGY_TECHNIQUES[id].game)}</p></div><button class="btn" id="lessonBack">${tr('back')}</button></div>
    ${lessonStepsHtml(id,b)}${lessonExplanationHtml(id)}
    <div class="lesson-actions">
      <button class="btn primary" id="lessonGuidedBtn">${tr('lessonStartGuided')}</button>
      <button class="btn" id="lessonAssistedBtn" ${b.guided>0?'':'disabled'}>${tr('lessonStartAssisted')}</button>
      <button class="btn" id="lessonIndependentBtn" ${b.assisted>0?'':'disabled'}>${tr('lessonStartIndependent')}</button>
    </div>
    ${b.completed?`<div class="lesson-complete-banner">✓ ${tr('lessonComplete')}</div>`:''}
  </section>`;
  $('#lessonBack').onclick=learningView;
  $('#lessonGuidedBtn').onclick=()=>{if(!b.explanation)learningStatsMark(id,'explanation');launchLessonPhase(id,2)};
  $('#lessonAssistedBtn').onclick=()=>launchLessonPhase(id,3);
  $('#lessonIndependentBtn').onclick=()=>launchLessonPhase(id,4);
  app.querySelectorAll('button').forEach(pressFeedback)
}
function learningPhaseTitle(phase){
  return phase===2?tr('lessonGuided'):phase===3?tr('lessonAssisted'):tr('lessonIndependent')
}
function learningStatsStart(id,phase){let s=safeStats(),b=learningBucket(s,id);b.attempts++;writeStats(s)}
function learningStatsFinish(c,seconds,withCoach){
  if(!c?.learning||c.learningStatsClosed)return false;let s=safeStats(),b=learningBucket(s,c.learningTechnique);
  if(c.learningPhase===2)b.guided++;
  else if(c.learningPhase===3)b.assisted++;
  else if(c.learningPhase===4&&!withCoach){b.independent++;b.completed=Math.max(1,b.completed);b.bestIndependent=b.bestIndependent==null?seconds:Math.min(b.bestIndependent,seconds)}
  if(c.masterySession&&!c.learningMasteryMerged){masteryMergeIntoStats(s,c.masterySession);c.learningMasteryMerged=true}
  c.learningStatsClosed=true;writeStats(s);return c.learningPhase!==4||!withCoach
}
function launchLessonPhase(id,phase){
  if(!PEDAGOGY_TECHNIQUES[id]||![2,3,4].includes(phase))return lessonView(id);
  let s=safeStats(),b=learningBucket(s,id);if(phase===3&&!b.guided)return lessonView(id);if(phase===4&&!b.assisted)return lessonView(id);
  if(current&&!current.completed)clearSaved();stopTimer();paused=false;setBusy(true);
  requestAnimationFrame(()=>{try{
    if(!buildTrainingExercise(id,{context:'learning',phase})){showToast(tr('trainingUnavailable'));lessonView(id);return}
    current.learning=true;current.learningTechnique=id;current.learningPhase=phase;current.learningStatsClosed=false;current.learningMasteryMerged=false;
    current.coachModeOverride=phase===4?'minimal':'pedagogical';learningStatsStart(id,phase);
    trainingRender();historyInit(true);diagnosticStart('learning');diagnosticPedagogy('learning','start',id);updateHistoryButtons();startTimer(true,0,false);saveCurrent();haptic(8)
  }finally{setBusy(false)}})
}
function learningHintWhy(h){return h?.why!=null?h.why:h.rank===3?rank3Why(h):h.rank===2?rank2Why(h):h.rank===1?rank1Why(h):h.why}
function learningMoveText(h){return gamePedagogy().learning.moveText(h)}
function learningApplyExpectedMove(actionType='LEARNING_GUIDED'){
  if(!current?.learning||!current.trainingTargetHint)return false;let h=current.trainingTargetHint,before=historySnapshotKey(),g=current.game;
  gamePedagogy(g).learning.applyMove(h);historyRecord({type:actionType,reasoning:structuredReasoning(g,h),primaryTarget:[h.r,h.c]},before);saveCurrent();return true
}
function learningRevealGuidedMove(){return learningApplyExpectedMove('LEARNING_GUIDED')}
function decorateLearningShell(){
  if(!current?.learning)return;let box=$('#learningGuide');if(!box)return;let h=current.trainingTargetHint,phase=current.learningPhase;
  box.hidden=false;
  if(phase===2){
    box.innerHTML=`<div class="learning-guide-head"><span>2/4</span><b>${tr('lessonGuided')} — ${techniqueTitle(current.learningTechnique)}</b></div>
      <p><b>${tr('lessonObserve')} :</b> ${coachLookText(current.game,[h.r,h.c],{reasoning:structuredReasoning(current.game,h)})}</p>
      <p><b>${tr('rulesTitle')} :</b> ${techniqueTitle(current.learningTechnique)}</p>
      <p><b>${tr('hintWhy')} :</b> ${learningHintWhy(h)}</p>
      <button class="btn primary" id="learningRevealBtn">${tr('lessonShowMove')}</button>`;
    let rb=$('#learningRevealBtn');if(rb)rb.onclick=learningRevealGuidedMove;clearHintFocus();focusHintContext(current.game,[h.r,h.c],{reasoning:structuredReasoning(current.game,h)})
  }else if(phase===3){
    box.innerHTML=`<div class="learning-guide-head"><span>3/4</span><b>${tr('lessonAssisted')} — ${techniqueTitle(current.learningTechnique)}</b></div>
      <p>${tr('lessonGoal')} : ${techniqueSummary(current.learningTechnique)}</p><p>${lessonMethodText(current.learningTechnique)}</p>`;
  }else{
    box.innerHTML=`<div class="learning-guide-head"><span>4/4</span><b>${tr('lessonIndependent')} — ${techniqueTitle(current.learningTechnique)}</b></div>
      <p>${tr('lessonGoal')} : ${techniqueSummary(current.learningTechnique)}</p><p>${lessonMethodText(current.learningTechnique)}</p>`;
  }
}
function finishLearningExercise(){
  if(!current?.learning||current.trainingCompleted)return false;current.trainingCompleted=true;
  let used=current.coachUsage?.techniques?.[current.learningTechnique],withCoach=!!(used&&(used.where||used.rule||used.why||used.reveal)),seconds=timerSeconds(),phase=current.learningPhase;
  if(phase===4&&!withCoach)masteryRecord(current.learningTechnique,'solo');
  stopTimer(false);elapsedBase=seconds;startedAt=0;paused=true;let valid=learningStatsFinish(current,seconds,withCoach);clearSaved();updatePauseButton();updateHistoryButtons();
  if(phase===4&&!valid){
    status(tr('lessonIndependentRetry'),false);
    showHintNotice(`<b>${tr('lessonIndependentRetry')}</b><div class="training-complete-actions"><button class="btn primary" onclick="launchLessonPhase('${current.learningTechnique}',4)">${tr('lessonStartIndependent')}</button><button class="btn" onclick="lessonView('${current.learningTechnique}')">${tr('lesson')}</button></div>`);
  }else{
    let complete=phase===4?tr('lessonComplete'):learningPhaseTitle(phase);
    status(`${complete} — ${fmt(seconds)}`,true);
    let next=phase===2?`<button class="btn primary" onclick="launchLessonPhase('${current.learningTechnique}',3)">${tr('lessonStartAssisted')}</button>`:
             phase===3?`<button class="btn primary" onclick="launchLessonPhase('${current.learningTechnique}',4)">${tr('lessonStartIndependent')}</button>`:
             `<button class="btn primary" onclick="learningView()">${tr('learn')}</button>`;
    showHintNotice(`<b>${complete}</b><br>${techniqueTitle(current.learningTechnique)}<div class="training-complete-actions">${next}<button class="btn" onclick="lessonView('${current.learningTechnique}')">${tr('lesson')}</button></div>`);haptic(18)
  }
  return true
}

// ===== v2.17.0 — targeted technique training =====
function trainingBucket(stats,id){
  if(!stats.training||typeof stats.training!=='object')stats.training={schema:1,byTechnique:{}};
  if(!stats.training.byTechnique)stats.training.byTechnique={};
  let b=stats.training.byTechnique[id]||(stats.training.byTechnique[id]={attempts:0,completed:0,withCoach:0,best:null});
  b.attempts=Math.max(0,Number(b.attempts)||0);b.completed=Math.max(0,Number(b.completed)||0);b.withCoach=Math.max(0,Number(b.withCoach)||0);b.best=b.best==null?null:Math.max(0,Number(b.best)||0);return b
}
function trainingStatsStart(id){if(current?.learning)return;let s=safeStats(),b=trainingBucket(s,id);b.attempts++;writeStats(s)}
function trainingStatsFinish(c,seconds){
  if(!c?.training||c.learning||c.trainingStatsClosed)return;
  let s=safeStats(),b=trainingBucket(s,c.trainingTechnique),used=c.coachUsage?.techniques?.[c.trainingTechnique],withCoach=!!(used&&(used.where||used.rule||used.why||used.reveal));
  b.completed++;if(withCoach)b.withCoach++;b.best=b.best==null?seconds:Math.min(b.best,seconds);
  if(c.masterySession&&!c.trainingMasteryMerged){masteryMergeIntoStats(s,c.masterySession);c.trainingMasteryMerged=true}
  c.trainingStatsClosed=true;writeStats(s)
}
function trainingRecommendedId(all=effectiveMasteryByTechnique(safeStats())){
  let ids=activeTechniqueIds(),best=null,bestKey=Infinity;
  for(let id of ids){let m=masteryMetrics(all[id]),rank=PEDAGOGY_TECHNIQUES[id].rank,key=(m.samples<3?35:(m.score??50))-Math.min(5,m.errors)*4+rank*2;if(key<bestKey){bestKey=key;best=id}}
  return best||ids[0]
}
function trainingCard(id,all,stats,recommended){
  let x=PEDAGOGY_TECHNIQUES[id],m=masteryMetrics(all[id]),b=trainingBucket(stats,id),score=m.score==null?'—':`${m.score}%`,rec=id===recommended?`<span class="training-rec">★ ${tr('trainingRecommended')}</span>`:'';
  return `<article class="training-card ${id===recommended?'recommended':''}"><div class="training-card-head"><div><b>${techniqueTitle(id)}</b><code>${id}</code></div><strong>${score}</strong></div><small>R${x.rank} · ${tr(masteryLevel(m).key)}</small>${rec}<div class="training-card-stats"><span>${tr('trainingCompleted')} <b>${b.completed}</b></span><span>${tr('trainingAttempts')} <b>${b.attempts}</b></span></div><div class="training-card-actions"><button class="btn" data-learn-from-training="${id}">${tr('learn')}</button><button class="btn primary training-start" data-tech="${id}">${tr('trainTechnique')}</button></div></article>`
}
function trainingView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let s=safeStats(),all=effectiveMasteryByTechnique(s),recommended=trainingRecommendedId(all),games=GAME_IDS;
  let sections=games.map(g=>`<section class="training-game"><h2>${gameLabel(g)}</h2><div class="training-grid">${techniqueIdsForGame(g).map(id=>trainingCard(id,all,s,recommended)).join('')}</div></section>`).join('');
  app.innerHTML=`<section class="panel training-panel"><div class="stats-head"><div><h1>${tr('training')}</h1><p>${tr('trainingSub')}</p></div><button class="btn" id="trainingBack">${tr('back')}</button></div>${sections}</section>`;
  $('#trainingBack').onclick=home;app.querySelectorAll('[data-learn-from-training]').forEach(b=>b.onclick=()=>lessonView(b.dataset.learnFromTraining));app.querySelectorAll('[data-tech]').forEach(b=>b.onclick=()=>launchTraining(b.dataset.tech));app.querySelectorAll('button').forEach(pressFeedback)
}
function trainingDifficulty(id){let x=PEDAGOGY_TECHNIQUES[id];if(!x)return 'easy';return x.rank>=2?'hard':x.rank===1?'medium':'easy'}





function trainingHintForId(id,deadline=WebPlatform.clock.nowMs()+1800){
  let x=PEDAGOGY_TECHNIQUES[id];if(!x||!current||current.game!==x.game)return null;let h=gamePedagogy(x.game).training.hintForTechnique({id,rank:x.rank,deadline});
  if(!h||h.timeout||coachTechniqueId(x.game,h)!==id)return null;h.technique=id;return h
}




function trainingRandomProgress(game,base,p){return gamePedagogy(game).training.randomProgress({base,p})}
function trainingAdvancedFixture(id){let x=PEDAGOGY_TECHNIQUES[id],lifecycle=x?GameRegistry.requireCapability(x.game,'pedagogyLifecycle'):null;return typeof lifecycle?.trainingFixture==='function'?lifecycle.trainingFixture(id):null}
function trainingLoadAdvancedFixture(id,deadline){
  let raw=trainingAdvancedFixture(id);if(!raw)return null;let c=JSON.parse(JSON.stringify(raw));if(Array.isArray(c.givens))c.givens=new Set(c.givens);if(Array.isArray(c.empty))c.empty=new Set(c.empty);current=c;current.training=true;let h=trainingHintForId(id,deadline);if(!h){current=null;return null}return h
}
function trainingBuildAdvanced(id,deadline){
  let fixture=trainingLoadAdvancedFixture(id,deadline);if(fixture)return fixture;let x=PEDAGOGY_TECHNIQUES[id],diff=trainingDifficulty(id);
  for(let b=0;b<4&&WebPlatform.clock.nowMs()<deadline;b++){
    gamePedagogy(x.game).training.prepareBase(diff);
    let base=current;
    for(let k=0;k<90&&WebPlatform.clock.nowMs()<deadline;k++){
      let p=.12+Math.random()*.72;trainingRandomProgress(x.game,base,p);let h=trainingHintForId(id,deadline);if(h)return h
    }
  }
  return null
}
function buildTrainingExercise(id,{context='training',phase=null}={}){
  let x=PEDAGOGY_TECHNIQUES[id];if(!x)return null;let deadline=WebPlatform.clock.nowMs()+5500,p=gamePedagogy(x.game),h=null;
  let generatedDifficulty=typeof p.training.exerciseDifficulty==='function'?p.training.exerciseDifficulty({id,context,phase}):null;
  if(generatedDifficulty){
    let generated=p.training.buildGenerated({id,difficulty:generatedDifficulty,context,phase,deadline});if(generated?.status!=='found'||!generated.hint)return null;h=generated.hint;
  }else{
    h=trainingLoadAdvancedFixture(id,deadline);
    if(!h&&x.rank===0)h=p.training.buildDirect(id,deadline);
    else if(!h&&x.rank>0)h=trainingBuildAdvanced(id,deadline);
  }
  if(!h)return null;
  current.training=true;current.trainingTechnique=id;current.trainingTargetHint={...h,technique:id};current.trainingCompleted=false;current.trainingOffPath=false;current.trainingStatsClosed=false;current.trainingMasteryMerged=false;current.coachUsage=null;current.masterySession=null;current.errorCoachUsage=null;current.lastError=null;current.hintFlow=null;current.lastReasoning=null;
  current.trainingStartSnapshot=puzzleSnapshot();return current
}
function trainingHintExpectedValue(h){return h?.id!=null?h.id:h?.v}
function trainingActionMatchesHint(h,action){if(!h||!action)return false;let expected=trainingHintExpectedValue(h);return (action.changes||[]).some(ch=>ch.row===h.r&&ch.column===h.c&&ch.to===expected)}
function trainingRender(){
  if(!current?.training)return;
  renderGameUi(current);
  decorateTrainingShell()
}
function decorateTrainingShell(){
  if(!current?.training)return;let d=$('#difficulty');if(d)d.disabled=true;let n=$('#newBtn');
  if(current.learning){
    if(n){n.textContent=tr('lesson');n.onclick=()=>lessonView(current.learningTechnique)}
  }else if(n){n.textContent=tr('newExercise');n.onclick=()=>launchTraining(current.trainingTechnique)}
  let r=$('#resetBtn');if(r)r.onclick=resetTrainingExercise;let c=$('#checkBtn');if(c)c.onclick=checkTrainingTarget;let sol=$('#solutionBtn');if(sol)sol.style.display='none';
  let hb=$('#hintBtn');if(hb&&current.learningPhase===2)hb.style.display='none';let eb=$('#exploreBtn');if(eb)eb.style.display='none';let wb=$('#walkthroughBtn');if(wb)wb.style.display='none';
  if(current.learning)decorateLearningShell()
}
function launchTraining(id){
  if(!PEDAGOGY_TECHNIQUES[id])return trainingView();if(current&&!current.completed)clearSaved();stopTimer();paused=false;setBusy(true);requestAnimationFrame(()=>{let ok=false;try{ok=!!buildTrainingExercise(id,{context:'training'});if(!ok){showToast(tr('trainingUnavailable'));trainingView();return}trainingStatsStart(id);trainingRender();historyInit(true);diagnosticStart('training');diagnosticPedagogy('training','start',id);updateHistoryButtons();startTimer(true,0,false);saveCurrent();haptic(8)}finally{setBusy(false)}})
}
function resetTrainingExercise(){
  if(!current?.training||!current.trainingStartSnapshot)return;paused=false;current.trainingCompleted=false;current.trainingOffPath=false;current.hintFlow=null;current.lastError=null;current.masteryPendingAid=null;restorePuzzleSnapshot(current.trainingStartSnapshot);historyInit(true);updateHistoryButtons();stopTimer(false);elapsedBase=0;startedAt=0;startTimer(true,0,false);decorateTrainingShell();saveCurrent();status('',true)
}
function trainingTargetStillCorrect(){let h=current?.trainingTargetHint;if(!h)return false;return gamePedagogy().training.targetStillCorrect(h)}
function checkTrainingTarget(){if(!current?.training)return;if(trainingTargetStillCorrect())return finishTrainingExercise();status(tr('trainingTryAgain'),false)}
function trainingMoveCompleted(action){
  if(!current?.training||current.trainingCompleted)return false;let h=current.trainingTargetHint;if(trainingActionMatchesHint(h,action)){if(action.type==='COACH_APPLY')current.trainingPendingComplete=true;else finishTrainingExercise();return true}current.trainingOffPath=true;status(tr('trainingTryAgain'),false);return false
}
function trainingSyncPath(){if(current?.training&&!current.trainingCompleted)current.trainingOffPath=current.moveHistory?.cursor!=='h0'}
function finishTrainingExercise(){
  if(current?.learning)return finishLearningExercise();
  if(!current?.training||current.trainingCompleted)return false;current.trainingCompleted=true;let used=current.coachUsage?.techniques?.[current.trainingTechnique],withCoach=!!(used&&(used.where||used.rule||used.why||used.reveal));if(!withCoach)masteryRecord(current.trainingTechnique,'solo');let seconds=timerSeconds();stopTimer(false);elapsedBase=seconds;startedAt=0;paused=true;trainingStatsFinish(current,seconds);clearSaved();updatePauseButton();updateHistoryButtons();status(`${tr('trainingComplete')} — ${fmt(seconds)}`,true);showHintNotice(`<b>${tr('trainingComplete')}</b><br>${techniqueTitle(current.trainingTechnique)}<div class="training-complete-actions"><button class="btn primary" onclick="launchTraining('${current.trainingTechnique}')">${tr('newExercise')}</button><button class="btn" onclick="trainingView()">${tr('training')}</button></div>`);haptic(18);return true
}
function trainingCoach(){
  if(!current?.training||paused&&current.trainingCompleted)return;if(showVisibleErrorsBeforeHint())return;if(current.trainingOffPath)return showToast(tr('trainingTryAgain'));let h=current.trainingTargetHint;if(!h)return showToast(tr('trainingUnavailable'));let g=current.game,p=gamePedagogy(g),move=p.training.coachText(h);
  let why=h.why!=null?h.why:h.rank===3?rank3Why(h):h.rank===2?rank2Why(h):h.rank===1?rank1Why(h):h.why,reasoning=structuredReasoning(g,h),reveal=p.training.revealLabel();
  hintStage(g,[h.r,h.c],{move,where:tr('trainingTarget')+` : ${techniqueTitle(current.trainingTechnique)}`,why,reveal,rank:h.rank||0,value:trainingHintExpectedValue(h),reasoning},()=>p.training.applyMove(h))
}

function coachActionFor(game,h){return gamePedagogy(game).coach.action(h)}
function coachTechniqueId(game,h){return PedagogyMetadata.techniqueIdForHint(game,h)}
function structuredReasoning(game,h){
  if(!h)return null;
  return {
    schema:1,
    source:'visible-state',
    game,
    technique:coachTechniqueId(game,h),
    rank:Math.max(0,Number(h.rank)||0),
    target:{row:h.r,column:h.c},
    action:coachActionFor(game,h),
    proof:{
      direct:h.why??null,
      hypothesis:h.hypothesis??null,
      consequence:h.consequence??null,
      secondStep:h.secondStep??null,
      deadend:h.deadend??null,
      conclusion:h.conclusion??null
    }
  }
}

// ===== v2.28 / REF-2 — registry-driven specialized reasoning presenters =====
const reasoningPresenterCache=new Map();
function reasoningPresenter(game){
  if(reasoningPresenterCache.has(game))return reasoningPresenterCache.get(game);
  const lifecycle=GameRegistry.requireCapability(game,'reasoningLifecycle');
  const presenter=lifecycle.createPresenter({tr,lang,cellName,genericLocalizedHint,pieceName,isDetailedLanguage:code=>DETAILED_HINT_LANGS.has(code)});
  reasoningPresenterCache.set(game,presenter);return presenter
}

// ===== v2.21.18 — Grille 6 explicit proof engine adapter =====
























// ===== v2.21.11 — Soleil/Lune explicit proof engine adapter =====












// ===== v2.21.12 — Rectangles explicit proof engine adapter =====


















function cloneGrid(x){return SessionCore.cloneGrid(x)}
function puzzleSnapshot(){return SessionHistory.puzzleSnapshot(current)}
function historySnapshotKey(s=puzzleSnapshot()){return SessionCore.snapshotKey(s)}
function historyInit(force=false){return SessionHistory.ensureHistory(current,force)}
function historyNode(){return SessionHistory.historyNode(current)}
function historyCanUndo(){if(!current)return false;if(postVictoryReviewCanUndo(current))return true;return !current.completed&&!paused&&SessionHistory.canUndo(current)}
function historyRedoTarget(){return SessionHistory.redoTarget(current)}
function historyCanRedo(){return !!current&&!current.completed&&!paused&&SessionHistory.canRedo(current)}

// ===== v2.19.1 — classify legal moves as justified deductions or hypotheses =====
function reasoningAuditBucket(){
  if(!current)return null;
  return current.reasoningAudit||(current.reasoningAudit={justified:0,unjustified:0,hypotheses:0,unknown:0})
}
function auditPrimaryChange(action){
  if(!action||!Array.isArray(action.changes))return null;
  let t=action.primaryTarget||action.target;
  if(Array.isArray(t))return action.changes.find(x=>x.row===t[0]&&x.column===t[1])||null;
  if(t&&Number.isInteger(t.row))return action.changes.find(x=>x.row===t.row&&x.column===t.column)||null;
  return action.changes.length===1?action.changes[0]:null
}
function auditNeutralValue(game){return gamePedagogy(game).audit.neutralValue()}
function auditConstructiveChange(action){
  let ch=auditPrimaryChange(action),neutral=auditNeutralValue(current?.game);
  if(!ch||ch.from!==neutral)return null;
  if(!gamePedagogy().audit.constructiveValue(ch.to))return null;
  return ch
}
function withAuditSnapshot(beforeKey,fn){
  if(!current||!beforeKey)return null;let s;try{s=JSON.parse(beforeKey)}catch(_){return null}
  if(!s||s.game!==current.game)return null;
  let snap=current,clone=DataSerialization.deserializeCurrentState(DataSerialization.serializeCurrentState(current));
  if(!SessionHistory.applyPuzzleSnapshot(clone,s))return null;
  current=clone;try{return fn(clone)}finally{current=snap}
}
function proofResult(status,technique=null,rank=null,target=null,detail=null){
  return {schema:1,status,source:'visible-state',technique,rank,target,detail,at:WebPlatform.clock.nowMs()}
}









function firstKnownLogicalMoveFromSnapshot(beforeKey,deadline=WebPlatform.clock.nowMs()+250){
  return withAuditSnapshot(beforeKey,()=>gamePedagogy().audit.firstKnownLogicalMove({deadline}))
}
function evaluateMoveJustification(beforeKey,action,error=null){
  if(!current||current.training||error||!action||['COACH_APPLY','LEARNING_GUIDED'].includes(action.type)||!gamePedagogy().audit.actionEligible(action))return null;
  let ch=auditConstructiveChange(action);if(!ch&&!gamePedagogy().audit.allowsNoPrimaryChange(action))return null;let deadline=WebPlatform.clock.nowMs()+350;
  let result=withAuditSnapshot(beforeKey,()=>gamePedagogy().audit.justifyMove({change:ch,action,beforeKey,deadline}));
  if(result?.status==='unjustified')result={...result,knownMove:firstKnownLogicalMoveFromSnapshot(beforeKey,deadline)};
  return result
}
function auditMoveText(reasoning){
  if(!reasoning?.target)return '';
  let r=reasoning.target.row,c=reasoning.target.column,v=reasoning.action?.value,g=reasoning.game;
  return gamePedagogy(g).audit.moveText(reasoning)||cellName(r,c)
}
function applyAuditResult(node,result){
  if(!current||!node)return;
  node.justification=result?{...result}:null;current.lastMoveAudit=node.justification?{...node.justification,historyNode:node.id,parentNode:node.parent}:null;
  let b=reasoningAuditBucket();if(result?.status==='justified')b.justified++;else if(result?.status==='unjustified')b.unjustified++;else if(result?.status==='unknown')b.unknown++;
  refreshReasoningAudit()
}
function syncReasoningAuditFromHistory(){
  let n=historyNode();current.lastMoveAudit=n?.justification?{...n.justification,historyNode:n.id,parentNode:n.parent}:null;refreshReasoningAudit()
}
function auditTargetCells(node){
  let t=node?.justification?.target;
  if(Array.isArray(t)&&Number.isInteger(t[0])&&Number.isInteger(t[1]))return [[t[0],t[1]]];
  if(Array.isArray(t)&&Array.isArray(t[0]))return t.filter(x=>Array.isArray(x)&&Number.isInteger(x[0])&&Number.isInteger(x[1]));
  let a=node?.action||{},p=a.primaryTarget||a.target;
  if(Array.isArray(p)&&Number.isInteger(p[0])&&Number.isInteger(p[1]))return [[p[0],p[1]]];
  if(p&&Number.isInteger(p.row)&&Number.isInteger(p.column))return [[p.row,p.column]];
  return []
}
function unjustifiedCellsOnCurrentPath(){
  let h=current?.moveHistory,n=h?.nodes?.[h?.cursor],seen=new Set(),out=[],guard=0;
  while(n&&guard++<10000){
    let status=n.justification?.status,targets=auditTargetCells(n);
    if(['unjustified','hypothesis'].includes(status))for(let [r,c] of targets){let k=keyCell(r,c);if(!seen.has(k))out.push([r,c])}
    for(let ch of n.action?.changes||[])if(Number.isInteger(ch.row)&&Number.isInteger(ch.column))seen.add(keyCell(ch.row,ch.column));
    n=n.parent?h.nodes[n.parent]:null
  }
  return out
}
function applyUnjustifiedHighlights(){
  let board=document.querySelector('.board');if(!board||!current)return;
  [...board.children].forEach(d=>d.classList.remove('unjustified-piece'));
  // A completed Rectangles board must remain visually clean: move-audit warnings
  // are useful while solving, but must not leave orange/red cell outlines after victory.
  if(gamePedagogy().audit.suppressUnjustifiedAfterComplete(current))return;
  if(!unjustifiedAlertsEnabled())return;
  let n=current.n||6;for(let [r,c] of unjustifiedCellsOnCurrentPath()){let d=board.children[r*n+c];if(d)d.classList.add('unjustified-piece')}
}
function refreshReasoningAudit(){
  let box=$('#reasoningAudit');if(box){box.hidden=true;box.innerHTML=''}
  applyUnjustifiedHighlights()
}
function acceptLastMoveAsHypothesis(){
  let h=current?.moveHistory,a=current?.lastMoveAudit;if(!h||!a?.historyNode)return false;let n=h.nodes[a.historyNode];if(!n?.justification||n.justification.status!=='unjustified')return false;if(!gamePedagogy().exploration.canAcceptHypothesis(n.justification))return false;
  n.justification.status='hypothesis';n.justification.acceptedAt=WebPlatform.clock.nowMs();let b=reasoningAuditBucket();b.hypotheses++;current.lastMoveAudit={...n.justification,historyNode:n.id,parentNode:n.parent};refreshReasoningAudit();saveCurrent();showToast(tr('hypothesisAccepted'));return true
}


// ===== v2.20.0 — visual Exploration mode on top of branching history =====
function explorationState(){
  if(!current)return null;
  let e=current.exploration;
  if(!e||typeof e!=='object')return null;
  return e
}
function historyNodeDepth(id){return SessionHistory.nodeDepth(current,id)}
function historyIsDescendant(id,ancestor){return SessionHistory.isDescendant(current,id,ancestor)}
function historyPathFrom(ancestor,id){return SessionHistory.pathFrom(current,ancestor,id)}
function historyActionShort(node){
  if(!node)return tr('branchStart');
  let a=node.action||{};if(a.type==='START')return tr('branchStart');let j=node.justification,e=node.error,ch=(a.changes||[])[0];
  if(e)return `⚠ ${errorRuleTitle(e)}`;
  if(ch){
    let cell=cellName(ch.row,ch.column),val=ch.to;
    return gamePedagogy(a.game).audit.historyChangeText(ch)||cell;
  }
  let specialized=gamePedagogy(a.game||current?.game).audit.historyActionText(a);if(specialized)return specialized;
  if(a.type==='COACH_APPLY')return `Logic Coach`;
  if(j?.status==='hypothesis')return tr('moveHypothesis');
  return a.type||tr('branchStart')
}
function explorationNodeStatus(node){
  if(!node)return '';
  if(node.error)return 'error';
  let s=node.justification?.status;
  if(s==='hypothesis')return 'hypothesis';
  if(s==='unjustified')return 'unjustified';
  if(s==='justified')return 'justified';
  return 'neutral'
}
function explorationStatusIcon(node){
  return {error:'⚠',hypothesis:'◇',unjustified:'?',justified:'✓',neutral:'•'}[explorationNodeStatus(node)]||'•'
}
function explorationBranchRoots(){
  let e=explorationState(),h=current?.moveHistory;if(!e||!h?.nodes?.[e.branchPoint])return [];
  return (h.nodes[e.branchPoint].children||[]).map(id=>h.nodes[id]).filter(Boolean)
}
function explorationCurrentRoot(){
  let e=explorationState();if(!e)return null;
  let path=historyPathFrom(e.branchPoint,current.moveHistory.cursor);return path[0]||null
}
function explorationBranchRepresentative(root){
  let h=current?.moveHistory,n=root,guard=0,best=root;
  while(n&&guard++<10000){
    if(['error','hypothesis','unjustified'].includes(explorationNodeStatus(n)))best=n;
    if(!n.preferred||!n.children?.includes(n.preferred))break;n=h.nodes[n.preferred]
  }
  return best
}
function explorationTreeHtml(){
  let e=explorationState(),h=current?.moveHistory;if(!e||!h)return '';
  let bp=h.nodes[e.branchPoint],roots=explorationBranchRoots(),cursor=h.cursor;
  let rows=roots.map((root,i)=>{
    let active=historyIsDescendant(cursor,root.id),pref=bp.preferred===root.id,path=active?historyPathFrom(root.id,cursor):[],leaf=active&&path.length?h.nodes[path[path.length-1]]:root;
    let representative=explorationBranchRepresentative(root),status=explorationNodeStatus(representative),depth=active?historyNodeDepth(cursor)-historyNodeDepth(e.branchPoint):1;
    return `<button class="exploration-branch ${active?'active':''} status-${status}" data-explore-node="${root.id}">
      <span class="exploration-branch-icon">${explorationStatusIcon(representative)}</span>
      <span><b>${historyActionShort(root)}</b><small>${pref?'★ ':''}${tr('currentBranch')}: ${active?'✓ ':''}${depth}</small></span>
      <em>${i+1}</em>
    </button>`
  }).join('');
  if(!rows)rows=`<div class="exploration-empty">${tr('testHypothesis')}</div>`;
  return `<div class="exploration-tree"><b>${tr('branchTree')}</b>${rows}</div>`
}
function refreshExplorationPanel(){
  let box=$('#explorationPanel'),btn=$('#exploreBtn');if(!box)return;
  let e=explorationState();
  if(btn){btn.textContent=e?.active?`◇ ${tr('explorationActive')}`:`◇ ${tr('exploration')}`;btn.classList.toggle('exploration-active',!!e?.active)}
  if(!e?.active){box.hidden=true;box.innerHTML='';return}
  let h=current.moveHistory,bp=h.nodes[e.branchPoint],root=explorationCurrentRoot(),path=historyPathFrom(e.branchPoint,h.cursor);
  box.hidden=false;box.innerHTML=`<div class="exploration-head"><div><span>◇</span><b>${tr('explorationActive')}</b><small>${tr('branchPoint')}: ${historyActionShort(bp)} · ${path.length}</small></div><button class="btn" id="closeExploreBtn">${tr('closeExploration')}</button></div>
    ${explorationTreeHtml()}
    <div class="exploration-actions">
      <button class="btn primary" id="analyzeExploreBtn">${tr('analyzeBranch')}</button>
      <button class="btn" id="returnExploreBtn" ${h.cursor===e.branchPoint?'disabled':''}>↶ ${tr('returnBranchPoint')}</button>
      <button class="btn" id="keepExploreBtn" ${root?'':'disabled'}>✓ ${tr('keepBranch')}</button>
    </div><div id="explorationAnalysis" class="exploration-analysis" hidden></div>`;
  $('#closeExploreBtn').onclick=closeExploration;
  $('#analyzeExploreBtn').onclick=analyzeExplorationBranch;
  $('#returnExploreBtn').onclick=returnToExplorationBranchPoint;
  $('#keepExploreBtn').onclick=keepExplorationBranch;
  app.querySelectorAll('[data-explore-node]').forEach(b=>b.onclick=()=>goToExplorationNode(b.dataset.exploreNode))
}
function startExploration(){
  if(!current||current.completed||paused||current.training)return false;
  let h=historyInit(),cursor=h.cursor;
  current.exploration={schema:1,active:true,branchPoint:cursor,startedAt:WebPlatform.clock.nowMs(),returns:0,analyses:0,kept:0};
  closeHintNotice();refreshExplorationPanel();diagnosticPedagogy('exploration','start');saveCurrent();showToast(tr('testHypothesis'));return true
}
function closeExploration(){
  let e=explorationState();if(!e)return false;e.active=false;e.closedAt=WebPlatform.clock.nowMs();refreshExplorationPanel();diagnosticPedagogy('exploration','close');saveCurrent();return true
}
function setHistoryCursor(id){
  let h=current?.moveHistory,n=h?.nodes?.[id];if(!n||current.completed||paused)return false;
  h.cursor=id;restorePuzzleSnapshot(n.snapshot);syncErrorFromHistory();syncReasoningAuditFromHistory();trainingSyncPath();updateHistoryButtons();refreshExplorationPanel();diagnosticPedagogy('exploration','branch-change');saveCurrent();haptic(7);return true
}
function goToExplorationNode(rootId){
  let e=explorationState(),h=current?.moveHistory;if(!e?.active||!h?.nodes?.[rootId]||!h.nodes[e.branchPoint]?.children?.includes(rootId))return false;
  let id=rootId,n=h.nodes[id],guard=0;while(n?.preferred&&n.children?.includes(n.preferred)&&guard++<10000){id=n.preferred;n=h.nodes[id]}
  return setHistoryCursor(id)
}
function returnToExplorationBranchPoint(){
  let e=explorationState();if(!e?.active)return false;e.returns=(e.returns||0)+1;let ok=setHistoryCursor(e.branchPoint);if(ok)showToast(tr('branchReturned'));return ok
}
function keepExplorationBranch(){
  let e=explorationState(),h=current?.moveHistory;if(!e?.active||h.cursor===e.branchPoint)return false;
  let path=historyPathFrom(e.branchPoint,h.cursor),parent=e.branchPoint;
  for(let id of path){let p=h.nodes[parent];if(p?.children?.includes(id))p.preferred=id;parent=id}
  e.kept=(e.kept||0)+1;e.keptNode=h.cursor;e.active=false;e.closedAt=WebPlatform.clock.nowMs();refreshExplorationPanel();diagnosticPedagogy('exploration','keep-branch');saveCurrent();showToast(tr('branchKept'));return true
}
function explorationContradiction(){
  let errors=currentVisibleErrors();if(errors.length)return {bad:true,kind:'rules',html:errors.map(e=>`<b>${errorRuleTitle(e)}</b><br>${errorDetailedMessage(e)}`).join('<hr>')};
  let result=gamePedagogy().exploration.contradiction({deadline:WebPlatform.clock.nowMs()+700});
  return result||{bad:false,kind:'none',html:tr('noContradiction')}
}
function analyzeExplorationBranch(){
  let e=explorationState();if(!e?.active)return false;e.analyses=(e.analyses||0)+1;
  let result=explorationContradiction(),box=$('#explorationAnalysis');if(box){box.hidden=false;box.classList.toggle('bad',result.bad);box.innerHTML=`<b>${result.bad?'⚠ '+tr('contradictionFound'):'✓ '+tr('analyzeBranch')}</b><div>${result.html}</div>`}
  diagnosticPedagogy('exploration','analyze');saveCurrent();return result
}
function showExplorationContradictionBeforeHint(){
  let e=explorationState();if(!e?.active||current?.moveHistory?.cursor===e.branchPoint)return false;
  let result=explorationContradiction();if(!result.bad)return false;
  e.analyses=(e.analyses||0)+1;
  showHintNotice(`<b>◇ ${tr('exploration')} · ⚠ ${tr('contradictionFound')}</b><div class="coach-error-item">${result.html}</div><button class="btn error-return-btn" onclick="returnToExplorationBranchPoint()">↶ ${tr('returnBranchPoint')}</button>`);
  let box=$('#explorationAnalysis');if(box){box.hidden=false;box.classList.add('bad');box.innerHTML=`<b>⚠ ${tr('contradictionFound')}</b><div>${result.html}</div>`}
  saveCurrent();return true
}
function explorationOnRecordedNode(node){
  let e=explorationState();if(!e?.active||!node||!historyIsDescendant(node.id,e.branchPoint)||node.id===e.branchPoint)return;
  // In Exploration, a legal but unproved first move is explicitly a hypothesis.
  let path=historyPathFrom(e.branchPoint,node.id),h=current.moveHistory,priorHypothesis=path.slice(0,-1).some(id=>h.nodes[id]?.justification?.status==='hypothesis');
  if(!priorHypothesis&&node.justification?.status==='unjustified'&&gamePedagogy().exploration.canAcceptHypothesis(node.justification)){
    node.justification.status='hypothesis';node.justification.acceptedAt=WebPlatform.clock.nowMs();node.justification.exploration=true;
    let b=reasoningAuditBucket();b.hypotheses++;current.lastMoveAudit={...node.justification,historyNode:node.id,parentNode:node.parent};showToast(tr('branchHypothesisAuto'))
  }
  refreshReasoningAudit();refreshExplorationPanel()
}

function historyChanges(beforeKey,after){return SessionHistory.historyChanges(current,beforeKey,after)}
function normalizeHistoryAction(action,beforeKey=null,after=null){return SessionHistory.normalizeHistoryAction(current,action,beforeKey,after)}
function historyRecord(action='MOVE',beforeKey=null){
  if(!current)return false;
  let rec=SessionHistory.recordHistory(current,action,beforeKey);if(!rec.changed){diagnosticRecord('action.not-applied',{action:diagnosticAction(action),reason:rec.reason||'not-applied'});updateHistoryButtons();return false}
  let {node,parent,normalized,existing,hadAlternative}=rec;
  let err=analyzeCurrentError(normalized);node.error=err?{...err,historyNode:node.id,parentNode:parent.id}:null;
  current.lastError=node.error?{...node.error}:null;if(node.error)errorUsage('detected',node.error.technique||null);
  let audit=evaluateMoveJustification(beforeKey,normalized,node.error);applyAuditResult(node,audit);explorationOnRecordedNode(node);
  masteryRecognizePlayerMove(beforeKey,normalized,node.error,audit);if(current.training&&!node.error)trainingMoveCompleted(normalized);refreshErrorCoach();updateHistoryButtons();
  diagnosticRecordedHistory(rec);return true
}
function restorePuzzleSnapshot(s){
  if(!current||!s||s.game!==current.game)return false;
  current.hintFlow=null;current.walkthroughResume=null;current.lastReasoning=null;current.lastError=null;current.lastMoveAudit=null;current.masteryPendingAid=null;clearHintFocus();clearErrorFocus();closeHintNotice();cancelVictoryPresentation(true);
  if(!SessionHistory.applyPuzzleSnapshot(current,s))return false;
  drawGameUi(current);
  status('',true);updateScoreFlags();return true
}
function undoMoves(count=1){
  if(!current)return 0;let fromVictory=postVictoryReviewCanUndo(current);if(!fromVictory&&!historyCanUndo())return 0;
  let step=SessionHistory.undoHistory(current,count),moved=step.moved;if(!moved){updateHistoryButtons();return 0}
  if(fromVictory){let review=postVictoryReviewState(current);current.completed=false;review.active=true;review.lastReviewAt=WebPlatform.clock.nowMs();freezePostVictoryReviewTimer(review.officialSeconds)}
  markBacktrack();restorePuzzleSnapshot(step.snapshot);syncErrorFromHistory();syncReasoningAuditFromHistory();trainingSyncPath();updateHistoryButtons();refreshExplorationPanel();diagnosticRecord('history.undo',{requested:count,moved,cursor:step.history.cursor,postVictoryReview:fromVictory});saveCurrent();haptic(7);return moved
}
function redoMoves(count=1){
  if(!historyCanRedo())return 0;let reviewActive=postVictoryReviewActive(current);
  let step=SessionHistory.redoHistory(current,count),moved=step.moved;if(!moved){updateHistoryButtons();return 0}
  restorePuzzleSnapshot(step.snapshot);syncErrorFromHistory();syncReasoningAuditFromHistory();trainingSyncPath();updateHistoryButtons();refreshExplorationPanel();diagnosticRecord('history.redo',{requested:count,moved,cursor:step.history.cursor,postVictoryReview:reviewActive});let refinished=reviewActive&&maybeAutoFinish();if(!refinished)saveCurrent();haptic(7);return moved
}
function updateHistoryButtons(){let u=$('#undoBtn'),r=$('#redoBtn');if(u)u.disabled=!historyCanUndo();if(r)r.disabled=!historyCanRedo()}
function historySummary(){return SessionHistory.summary(current)}
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||String(e.key).toLowerCase()!=='z')return;
  if(e.shiftKey){if(!historyCanRedo())return}else if(!historyCanUndo())return;e.preventDefault();
  if(e.shiftKey)redoMoves(1);else undoMoves(1)
});

function plainCurrent(){return DataSerialization.serializeCurrentState(current)}
function discardLegacyPersistence(){PersistentData.save.discardLegacy()}
function persistenceContract(){let d=typeof DifficultyRating!=='undefined'?DifficultyRating:null;return {difficultySchema:d?.SCHEMA_VERSION??1,ratingVersion:d?.RATING_VERSION??1,fingerprintVersion:d?.FINGERPRINT_VERSION??1,generatorVersion:d?.GENERATOR_VERSION??1}}
function persistenceSnapshot(c){return SessionHistory.puzzleSnapshot(c)}
function persistenceHistoryValid(c){return SessionHistory.historyValid(c)}
function persistencePublicPuzzle(c){
  let root=c?.moveHistory?.nodes?.h0?.snapshot;if(!c||!root||!GameRegistry.hasGame(c.game))return null;
  try{return GameRegistry.requireCapability(c.game,'publicPuzzleFromSession')(c,root)}catch(_){return null}
}
function persistenceFingerprint(c){try{return typeof DifficultyRating!=='undefined'?DifficultyRating.fingerprintPublicPuzzle(persistencePublicPuzzle(c)):null}catch(_){return null}}
function persistenceNeedsCertifiedProfile(c){return !!(c?.generated&&!c.training&&!c.learning)}
function runtimeCandidateCertified(game,diff,candidate){
  if(generatedCandidateCertified(game,diff,candidate))return true;
  try{
    let difficulty=GameRegistry.requireCapability(game,'difficulty');
    return typeof difficulty?.candidateCertified==='function'&&difficulty.candidateCertified(diff,candidate)&&generatedCandidateFingerprint(game,candidate)===candidate?.difficultyProfile?.fingerprint
  }catch(_){return false}
}
function persistenceDifficultyCertified(c,p,d){
  let tier;try{tier=d.tierIndex(c.diff)}catch(_){return false}
  if(p.difficulty===c.diff&&p.minimumRequiredTier===tier)return true;
  try{
    let difficulty=GameRegistry.requireCapability(c.game,'difficulty');
    return typeof difficulty?.candidateCertified==='function'&&difficulty.candidateCertified(c.diff,c)
  }catch(_){return false}
}
function persistenceCertifiedProfileValid(c,fingerprint){
  if(!persistenceNeedsCertifiedProfile(c))return true;
  let d=typeof DifficultyRating!=='undefined'?DifficultyRating:null,p=c?.difficultyProfile;if(!d||!p||typeof p!=='object'||!fingerprint)return false;
  if(p.schema!==d.SCHEMA_VERSION||p.ratingVersion!==d.RATING_VERSION||p.game!==c.game||p.status!=='solved'||p.budgetHit||p.fingerprint!==fingerprint)return false;
  if(!persistenceDifficultyCertified(c,p,d))return false;
  if(c.generationStats?.fingerprint&&c.generationStats.fingerprint!==fingerprint)return false;
  if(c.challenge&&c.challengeFingerprint!==fingerprint)return false;
  if(c.daily&&c.dailyFingerprint!==fingerprint)return false;
  return true
}
function persistencePostVictoryReviewValid(c,elapsed,isPaused){
  let r=c?.postVictoryReview;if(r==null)return true;
  if(!r||r.schema!==1||r.outcome!=='solved'||r.active!==true||c.completed||c.statsClosed!==true)return false;
  if(!Number.isFinite(Number(r.officialSeconds))||Number(r.officialSeconds)<0||!Number.isFinite(Number(r.closedAt)))return false;
  if(!Number.isInteger(Number(r.replayCount))||Number(r.replayCount)<0)return false;
  return Number(elapsed)===Number(r.officialSeconds)&&isPaused===false
}
function persistencePayloadValid(x){
  if(!x||typeof x!=='object'||x.schema!==SAVE_SCHEMA||x.baseline!==PERSISTENCE_BASELINE||!x.current||typeof x.current!=='object')return false;
  let expected=persistenceContract(),contract=x.contract;if(!contract||contract.difficultySchema!==expected.difficultySchema||contract.ratingVersion!==expected.ratingVersion||contract.fingerprintVersion!==expected.fingerprintVersion)return false;
  let c=x.current;if(!GAME_IDS.includes(c.game)||!['easy','medium','hard','expert'].includes(c.diff)||c.completed||!persistenceHistoryValid(c))return false;
  let fingerprint=persistenceFingerprint(c);if((x.puzzleFingerprint||null)!==(fingerprint||null)||!persistenceCertifiedProfileValid(c,fingerprint))return false;
  return Number.isFinite(Number(x.elapsed))&&Number(x.elapsed)>=0&&typeof x.paused==='boolean'&&persistencePostVictoryReviewValid(c,x.elapsed,x.paused)
}
function saveCurrent(){if(!current||current.completed||current.trainingCompleted)return;try{walkthroughSanitizeResumeForCurrent();let c=plainCurrent();if(!persistenceHistoryValid(c))return;let fingerprint=persistenceFingerprint(c);if(!persistenceCertifiedProfileValid(c,fingerprint))return;let payload=DataSerialization.createSaveEnvelope({schema:SAVE_SCHEMA,baseline:PERSISTENCE_BASELINE,version:VERSION,contract:persistenceContract(),puzzleFingerprint:fingerprint,current:c,elapsed:timerSeconds(),paused:!!paused,savedAt:WebPlatform.clock.nowMs()});PersistentData.save.write(payload)}catch(_){}}
function getSaved(){return PersistentData.save.read({validate:persistencePayloadValid})}
function clearSaved(){PersistentData.save.clear()}


const PORTABLE_GAMES=GAME_IDS,PORTABLE_DIFFS=['easy','medium','hard','expert'],USER_DATA_MAX_BYTES=5*1024*1024,USER_DATA_MAX_DAILY_RECORDS=5000;
function portableJsonEqual(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(_){return false}}
function portableFiniteNonNegative(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0}
function portablePreferencesValid(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;let n=DataSerialization.normalizePreferences(raw,{defaultLang:'en',supportedLangs:SUPPORTED_LANGS});return portableJsonEqual(n,raw)}
function portableStatsValid(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!==STATS_SCHEMA||raw.baseline!==PERSISTENCE_BASELINE)return false;
  let n=DataSerialization.normalizeStats(raw,blankStats(),{schema:STATS_SCHEMA,baseline:PERSISTENCE_BASELINE,historyLimit:HISTORY_LIMIT,validGames:PORTABLE_GAMES,validDifficulties:PORTABLE_DIFFS});
  if(!portableJsonEqual(n,raw))return false;
  for(const key of ['started','solved','revealed','totalSolvedSeconds'])if(!portableFiniteNonNegative(raw[key]))return false;
  if(!raw.byGame||typeof raw.byGame!=='object'||Array.isArray(raw.byGame))return false;
  for(const [game,diffs] of Object.entries(raw.byGame)){
    if(!PORTABLE_GAMES.includes(game)||!diffs||typeof diffs!=='object'||Array.isArray(diffs))return false;
    for(const [diff,b] of Object.entries(diffs)){
      if(!PORTABLE_DIFFS.includes(diff)||!b||typeof b!=='object'||Array.isArray(b))return false;
      for(const key of ['started','solved','revealed','totalSeconds'])if(!portableFiniteNonNegative(b[key]))return false;
      if(b.best!=null&&!portableFiniteNonNegative(b.best))return false
    }
  }
  if(!Array.isArray(raw.history)||raw.history.length>HISTORY_LIMIT)return false;
  for(const h of raw.history){if(!h||typeof h!=='object'||!PORTABLE_GAMES.includes(h.game)||!PORTABLE_DIFFS.includes(h.diff)||!portableFiniteNonNegative(h.seconds)||!portableFiniteNonNegative(h.ts)||!['solved','revealed','abandoned','finished'].includes(h.outcome))return false}
  for(const name of ['mastery','training','learning']){let x=raw[name];if(!x||typeof x!=='object'||x.schema!==1||!x.byTechnique||typeof x.byTechnique!=='object'||Array.isArray(x.byTechnique))return false}
  return true
}
function portableDailyValid(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;let entries=Object.entries(raw);if(entries.length>USER_DATA_MAX_DAILY_RECORDS)return false;
  for(const [key,r] of entries){
    if(!r||typeof r!=='object'||Array.isArray(r)||!/^\d{4}-\d{2}-\d{2}:[a-z][a-z0-9-]*$/.test(key))return false;
    let split=key.lastIndexOf(':'),day=key.slice(0,split),game=key.slice(split+1);if(!GameRegistry.hasGame(game)||r.day!==day||r.game!==game||r.dailySchema!==DAILY_SCHEMA||r.dailyGenerator!==DAILY_GENERATOR||!['solved','revealed','abandoned'].includes(r.outcome))return false;
    if(!portableFiniteNonNegative(r.seconds)||!portableFiniteNonNegative(r.completedAt)||r.best!=null&&!portableFiniteNonNegative(r.best))return false;
    if(r.fingerprint!=null&&(typeof r.fingerprint!=='string'||!/^qfp1-[0-9a-f]{32}$/.test(r.fingerprint)))return false;
    if(r.outcome==='solved'&&r.official===true){if(!portableFiniteNonNegative(r.logicScore)||r.logicScore>100||!Number.isInteger(r.helpStage)||r.helpStage<0||r.helpStage>4)return false}
    for(const key2 of ['lastSeconds','lastCompletedAt'])if(r[key2]!=null&&!portableFiniteNonNegative(r[key2]))return false
  }
  return true
}
function portableImportBundle(pkg){
  let u=DataSerialization.unpackUserDataPackage(pkg);
  if(u.source?.persistenceBaseline!==PERSISTENCE_BASELINE||typeof u.source?.version!=='string'||!u.source.version)throw new Error('Unsupported QUADLUD persistence baseline');
  if(u.save!=null&&!persistencePayloadValid(u.save))throw new Error('Invalid QUADLUD save section');
  if(u.stats!=null&&!portableStatsValid(u.stats))throw new Error('Invalid QUADLUD stats section');
  if(u.daily!=null&&!portableDailyValid(u.daily))throw new Error('Invalid QUADLUD Daily section');
  if(u.preferences!=null&&!portablePreferencesValid(u.preferences))throw new Error('Invalid QUADLUD preferences section');
  return u
}
function userDataSnapshot(){return {save:getSaved(),stats:safeStats(),daily:dailyState(),preferences:prefs()}}
function writePortableSection(service,value){return value==null?service.clear():service.write(value)}
function replacePortableData(bundle){
  let old=userDataSnapshot(),ok=false;
  try{
    ok=writePortableSection(PersistentData.save,bundle.save)&&writePortableSection(PersistentData.stats,bundle.stats)&&writePortableSection(PersistentData.daily,bundle.daily)&&writePortableSection(PersistentData.preferences,bundle.preferences);
    if(!ok)throw new Error('Persistent write failed');discardLegacyPersistence();return true
  }catch(err){
    try{writePortableSection(PersistentData.save,old.save);writePortableSection(PersistentData.stats,old.stats);writePortableSection(PersistentData.daily,old.daily);writePortableSection(PersistentData.preferences,old.preferences)}catch(_){}
    throw err
  }
}
function createUserDataExport(){
  if(current&&!current.completed)saveCurrent();let data=userDataSnapshot();
  return DataSerialization.createUserDataPackage({sourceVersion:VERSION,persistenceBaseline:PERSISTENCE_BASELINE,exportedAt:WebPlatform.clock.nowIso(),...data})
}
function importUserDataPackage(pkg){let bundle=portableImportBundle(pkg);replacePortableData(bundle);stopTimer();resetTimerDisplay();current=null;paused=false;elapsedBase=0;startedAt=0;applyPrefs();updateI18n();return bundle}
function eraseAllUserData(){let results=[PersistentData.save.clear(),PersistentData.stats.clear(),PersistentData.daily.clear(),PersistentData.preferences.clear()];discardLegacyPersistence();stopTimer();resetTimerDisplay();current=null;paused=false;elapsedBase=0;startedAt=0;applyPrefs();updateI18n();return results.every(Boolean)}
function privacyInfoModal(){modal(tr('privacyTitle'),`<p>${tr('privacyText')}</p><p><b>${tr('privateExportNote')}</b> ${tr('privacyPrivateExport')}</p><p>${tr('privacyEraseScope')}</p>`)}
function downloadUserDataExport(){
  try{let pkg=createUserDataExport(),text=DataSerialization.stringify(pkg),day=WebPlatform.clock.nowIso().slice(0,10);if(!WebPlatform.files.downloadText(text,{filename:`QUADLUD-user-data-${day}.json`,type:'application/json'}))throw new Error('download-unavailable');showToast(tr('exportDone'));return pkg}catch(_){showToast(tr('exportFailed'));return null}
}
function readPortableFileText(file){return WebPlatform.files.readText(file)}
async function handleUserDataFileImport(e){let input=e?.target||$('#dataImportFile'),file=input?.files?.[0];if(!file)return;try{if(file.size>USER_DATA_MAX_BYTES)throw new Error('too-large');let text=await readPortableFileText(file);if(text.length>USER_DATA_MAX_BYTES)throw new Error('too-large');let pkg=DataSerialization.parse(text);importUserDataPackage(pkg);settingsView();showToast(tr('importDone'))}catch(err){showToast(err?.message==='too-large'?tr('importTooLarge'):err?.message==='Persistent write failed'?tr('importFailed'):tr('importInvalid'))}finally{if(input)input.value=''}}
function confirmEraseUserData(){confirmActionModal(tr('eraseTitle'),`<p>${tr('eraseConfirm')}</p>`,tr('eraseConfirmButton'),()=>{let ok=eraseAllUserData();settingsView();showToast(ok?tr('eraseDone'):tr('eraseFailed'))})}
globalThis.QuadludUserData=Object.freeze({createExport:createUserDataExport,validateImport:portableImportBundle,importPackage:importUserDataPackage,erase:eraseAllUserData});
$('#homeBtn').onclick=home;$('#themeBtn').onclick=cycleTheme;

function statsView(){
  if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();
  let {s,success,avg,streak}=statsSummary(),games=GAME_IDS;
  let rows=games.map(g=>{let bs=['easy','medium','hard','expert'].map(d=>s.byGame?.[g]?.[d]).filter(Boolean),started=bs.reduce((a,b)=>a+(b.started||0),0),solved=bs.reduce((a,b)=>a+(b.solved||0),0),total=bs.reduce((a,b)=>a+(b.totalSeconds||0),0),best=bs.map(b=>b.best).filter(v=>v!=null);return `<div class="stat-game"><b>${gameLabel(g)}</b><span>${solved}/${started} ${tr('solved')}</span><span>${solved?fmt(Math.round(total/solved)):'—'} ${tr('average')}</span><span>${best.length?fmt(Math.min(...best)):'—'} ${tr('record')}</span></div>`}).join('');
  let hist=s.history.slice(0,20).map(x=>`<div class="history-row"><span><b>${gameLabel(x.game)}</b> · ${DIFF[x.diff]}</span><span>${x.outcome==='solved'?tr('solvedStatus'):x.outcome==='revealed'?tr('revealedStatus'):x.outcome==='abandoned'?tr('abandonedStatus'):tr('finishedStatus')} · ${fmt(x.seconds)} ${aidBadges(x,true)}</span><small>${new Date(x.ts).toLocaleDateString(dateLocale())}</small></div>`).join('')||`<p class="empty-state">${tr('none')}</p>`;
  app.innerHTML=`<section class="panel stats-panel"><div class="stats-head"><div><h1>${tr('stats')}</h1><p>${tr('statsLocal')}</p></div><button class="btn" id="statsBack">${tr('back')}</button></div>
  <div class="stat-kpis"><div><strong>${s.solved}</strong><span>${tr('solved')}</span></div><div><strong>${success}%</strong><span>${tr('success')}</span></div><div><strong>${avg?fmt(avg):'—'}</strong><span>${tr('avgTime')}</span></div><div><strong>${streak}</strong><span>${tr('streak')}</span></div></div>
  <h2>${tr('byGame')}</h2><div class="stat-games">${rows}</div><h2>${tr('history')}</h2><div class="history-list">${hist}</div></section>`;
  $('#statsBack').onclick=home;app.querySelectorAll('button').forEach(pressFeedback)
}
function home(){if(current&&!current.completed)saveCurrent();stopTimer();resetTimerDisplay();current=null;updateI18n();let saved=getSaved();app.innerHTML=`<section class="hero"><h1>${tr('homeTitle')}</h1><p>${tr('homeSub')}</p></section>${saved?`<button class="resume-card" id="resumeBtn"><b>${tr('resume')} ${gameLabel(saved.current.game)}</b><span>${DIFF[saved.current.diff]} · ${fmt(saved.elapsed||0)}</span></button>`:''}<section class="cards">${GAME_IDS.map(g=>`<button class="game-card" data-g="${g}"><span class="game-icon" aria-hidden="true">${gameIcon(g)}</span><span><h2>${gameLabel(g)}</h2><p>${gameDescription(g)}</p></span></button>`).join('')}</section><button class="daily-card" id="dailyBtn"><span>◆</span><b>${tr('daily')}</b><small>${dailyHomeLine()}</small></button><button class="stats-card challenge-home-card" id="challengeBtn"><span>↗</span><b>${tr('challenge')}</b><small>${tr('challengeSub')}</small></button><button class="stats-card" id="statsBtn"><span>▥</span><b>${tr('stats')}</b><small>${tr('statsSub')}</small></button><button class="stats-card mastery-home-card" id="masteryBtn"><span>◎</span><b>${tr('mastery')}</b><small>${tr('masterySub')}</small></button><button class="stats-card learning-home-card" id="learnBtn"><span>◉</span><b>${tr('learn')}</b><small>${tr('learnSub')}</small></button><button class="stats-card training-home-card" id="trainingBtn"><span>◇</span><b>${tr('training')}</b><small>${tr('trainingSub')}</small></button><button class="settings-card" id="settingsBtn"><span>⚙︎</span><b>${tr('prefs')}</b><small>${tr('prefsSub')}</small></button><button class="settings-card" id="aboutBtn"><span>ⓘ</span><b>${tr('about')}</b><small>${tr('aboutSub')}</small></button><div class="footer-note">QUADLUD v${VERSION} · © 2026 Serge Benoliel</div>`;
if(saved)$('#resumeBtn').onclick=resumeSaved;$('#dailyBtn').onclick=dailyView;$('#challengeBtn').onclick=()=>challengeView();$('#statsBtn').onclick=statsView;$('#masteryBtn').onclick=masteryView;$('#learnBtn').onclick=learningView;$('#trainingBtn').onclick=trainingView;$('#settingsBtn').onclick=settingsView;$('#aboutBtn').onclick=aboutView;app.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>launch(b.dataset.g,'easy'));app.querySelectorAll('button').forEach(pressFeedback)}
function gameLabel(g){let metadata=GameRegistry.getMetadata(g);return metadata?tr(metadata.labelKey):g}
function gameDescription(g){let metadata=GameRegistry.getMetadata(g);return metadata?.descriptionKey?tr(metadata.descriptionKey):''}
function gameIcon(g){return GameRegistry.getMetadata(g)?.icon||''}
function gameVictoryClass(g){return GameRegistry.getMetadata(g)?.victoryClass||''}

// ===== v2.21.4 — non-destructive logical walkthrough =====
let walkthroughSession=null;
function walkthroughRootSnapshot(){
  let h=current?.moveHistory,root=h?.nodes?.h0?.snapshot,historyRoot=root?JSON.parse(JSON.stringify(root)):null;
  return gamePedagogy().walkthrough.rootSnapshot({historyRoot,puzzleSnapshot})
}
function walkthroughVisibleClone(c,root){return c&&root?gamePedagogy(c.game).walkthrough.visibleClone(c,root):null}
function walkthroughSnapshot(c){return gamePedagogy(c.game).walkthrough.snapshot(c)}
function withWalkthroughCurrent(fn){let saved=current;current=walkthroughSession?.work||saved;try{return fn(current)}finally{current=saved}}
function walkthroughComplete(){return withWalkthroughCurrent(c=>!!c&&gamePedagogy(c.game).walkthrough.complete(c))}







// v3.1.7-D1 — persistent Tutor cursor, anchored to the exact visible/history state.
function walkthroughNavigationApi(){return globalThis.QuadludReasoningPresentation}
function walkthroughResumeAnchor(){
  if(!current)return null;try{return `${String(current.moveHistory?.cursor||'')}|${historySnapshotKey()}`}catch(_){return null}
}
function walkthroughStoredResume(){
  let r=current?.walkthroughResume,api=walkthroughNavigationApi(),anchor=walkthroughResumeAnchor();
  if(!r||r.schema!==1||r.game!==current?.game||r.anchor!==anchor||typeof r.atStart!=='boolean'||!api?.isPedagogyNavigation?.(r.navigation))return null;
  return {schema:1,game:r.game,anchor:r.anchor,atStart:r.atStart,navigation:JSON.parse(JSON.stringify(r.navigation))}
}
function walkthroughSanitizeResumeForCurrent(){
  if(!current?.walkthroughResume)return false;let r=current.walkthroughResume,api=walkthroughNavigationApi(),anchor=walkthroughResumeAnchor();
  if(r.schema!==1||r.game!==current.game||r.anchor!==anchor||typeof r.atStart!=='boolean'||!api?.isPedagogyNavigation?.(r.navigation)){current.walkthroughResume=null;return true}return false
}
function walkthroughPersistResume(){
  let s=walkthroughSession,api=walkthroughNavigationApi(),anchor=walkthroughResumeAnchor();if(!current||!s||!anchor)return false;
  let atStart=!!s.atStart||s.index===0,nav=atStart?api.definePedagogyNavigation({logicalMoveIndex:0,proofStepIndex:0}):s.navigation;
  if(!api?.isPedagogyNavigation?.(nav))return false;
  current.walkthroughResume={schema:1,game:current.game,anchor,atStart,navigation:JSON.parse(JSON.stringify(nav))};saveCurrent();return true
}
function walkthroughRestoreResume(resume){
  let s=walkthroughSession,api=walkthroughNavigationApi();if(!s||!resume||!api?.isPedagogyNavigation?.(resume.navigation))return false;if(resume.atStart)return walkthroughSetStart();
  let logical=resume.navigation.logicalMoveIndex,guard=0;
  while(!walkthroughGroups(s).some(x=>x.logicalMoveIndex===logical)&&!s.done&&!s.stalled&&guard++<512){if(!walkthroughGenerateNext())break}
  return walkthroughSetPosition(logical,resume.navigation.proofStepIndex)
}
function walkthroughGroups(session=walkthroughSession){
  let s=session;if(!s)return [];let groups=[],navigation=Array.isArray(s.pedagogyNavigationByMove)?s.pedagogyNavigationByMove:[];
  for(let flat=0;flat<s.moves.length;flat++){
    let move=s.moves[flat],nav=navigation[flat],logical=Number.isInteger(nav?.logicalMoveIndex)?nav.logicalMoveIndex:flat,group=groups.find(x=>x.logicalMoveIndex===logical);
    if(!group){group={logicalMoveIndex:logical,entries:[]};groups.push(group)}group.entries.push({flat,move,navigation:nav||null})
  }
  groups.sort((a,b)=>a.logicalMoveIndex-b.logicalMoveIndex);return groups
}
function walkthroughAnnotateNewMoves(s,start){
  let added=s.moves.slice(start);if(!added.length)return false;let api=walkthroughNavigationApi();if(!Array.isArray(s.pedagogyNavigationByMove))s.pedagogyNavigationByMove=[];
  let existing=s.pedagogyNavigationByMove.slice(0,start).map(nav=>nav?.logicalMoveIndex).filter(Number.isInteger),logicalIndex=existing.length?Math.max(...existing)+1:0;
  added.forEach((_move,proofStepIndex)=>{s.pedagogyNavigationByMove[start+proofStepIndex]=api.definePedagogyNavigation({logicalMoveIndex:logicalIndex,proofStepIndex})});return true
}
function walkthroughGenerateNext(){
  let s=walkthroughSession;if(!s||s.done||s.stalled)return false;let start=s.moves.length,ok=gamePedagogy(s.base.game).walkthrough.generateNext(s);if(ok)walkthroughAnnotateNewMoves(s,start);return ok
}
function walkthroughSetStart(){
  let s=walkthroughSession,api=walkthroughNavigationApi();if(!s)return false;s.atStart=true;s.index=0;s.navigation=api.definePedagogyNavigation({logicalMoveIndex:0,proofStepIndex:0});return true
}
function walkthroughSetPosition(logicalMoveIndex,proofStepIndex=0){
  let s=walkthroughSession,api=walkthroughNavigationApi(),group=walkthroughGroups(s).find(x=>x.logicalMoveIndex===logicalMoveIndex);if(!s||!group||!group.entries.length)return false;
  let proof=Math.max(0,Math.min(group.entries.length-1,Number(proofStepIndex)||0)),entry=group.entries[proof];s.navigation=api.definePedagogyNavigation({logicalMoveIndex,proofStepIndex:proof});s.atStart=false;s.index=entry.flat+1;return true
}
function walkthroughCurrentGroup(){let s=walkthroughSession;if(!s||s.atStart||s.index===0)return null;let nav=s.navigation||s.pedagogyNavigationByMove?.[s.index-1];if(!nav)return null;return walkthroughGroups(s).find(x=>x.logicalMoveIndex===nav.logicalMoveIndex)||null}
function walkthroughProofControls(){
  let s=walkthroughSession,group=walkthroughCurrentGroup(),nav=s?.navigation;if(!s||!group||group.entries.length<=1||!nav)return '';
  let level=tr('walkthroughWhy'),previous=tr('walkthroughPrevious'),next=tr('walkthroughNext'),i=nav.proofStepIndex,scope=a11yAttr(`${tr('walkthrough')} · ${level}`);
  return `<div class="walkthrough-proof-navigation" role="group" aria-label="${scope}"><button class="btn walkthrough-proof-arrow" id="walkthroughProofPrev" aria-label="${a11yAttr(`${level} · ${previous}`)}" title="${a11yAttr(`${level} · ${previous}`)}" ${i===0?'disabled':''}>‹</button><span class="walkthrough-proof-counter">${i+1}/${group.entries.length}</span><button class="btn walkthrough-proof-arrow" id="walkthroughProofNext" aria-label="${a11yAttr(`${level} · ${next}`)}" title="${a11yAttr(`${level} · ${next}`)}" ${i===group.entries.length-1?'disabled':''}>›</button></div>`
}
function walkthroughA11yAnnouncement(level='logical'){
  let s=walkthroughSession;if(!s)return '';let nav=s.navigation,group=walkthroughCurrentGroup(),groups=walkthroughGroups(s);
  if(level==='proof'&&group&&nav)return `${tr('walkthrough')} · ${tr('walkthroughWhy')} · ${nav.proofStepIndex+1}/${group.entries.length}`;
  let position=s.atStart||s.index===0?0:(nav?.logicalMoveIndex??0)+1,total=s.done?groups.length:'…';return `${tr('walkthrough')} · ${tr('hintMove')} · ${position}/${total}`
}
function walkthroughNavigateProof(delta){
  let s=walkthroughSession,group=walkthroughCurrentGroup(),nav=s?.navigation;if(!s||!group||!nav)return false;let logical=nav.logicalMoveIndex,next=Math.max(0,Math.min(group.entries.length-1,nav.proofStepIndex+Number(delta||0)));if(next===nav.proofStepIndex)return true;
  if(!walkthroughSetPosition(logical,next))return false;diagnosticRecord(delta<0?'tutor.previous':'tutor.next',{index:s.index,moves:s.moves.length});renderWalkthrough({animatePlacement:delta>0,focusSelector:delta<0?'#walkthroughProofPrev':'#walkthroughProofNext',focusFallback:delta<0?'#walkthroughProofNext':'#walkthroughProofPrev',announceNavigation:'proof'});return true
}
function walkthroughTarget(index){return index>0?walkthroughSession?.moves?.[index-1]?.target:null}
function walkthroughBoardHtml(snapshot,target=null,deduction=null,options={}){
  let s=walkthroughSession,c=s.base,n=c.n||6,view=gamePedagogy(c.game).walkthrough.board({base:c,initial:s.initial,snapshot,target,deduction,previousSnapshot:options.previousSnapshot||null,animatePlacement:options.animatePlacement===true})||{},boardClass=view.boardClass?`${view.boardClass} `:'';
  if(view.html)return view.html;
  return `<div class="walkthrough-board-wrap"><div class="board ${boardClass}walkthrough-board" style="grid-template-columns:repeat(${n},minmax(0,1fr));grid-template-rows:repeat(${n},minmax(0,1fr))">${view.cellsHtml||''}</div></div>`
}
function walkthroughExplanationHtml(index){
  let s=walkthroughSession;if(index===0)return `<div class="walkthrough-explanation start"><b>${tr('walkthroughStart')}</b><p>${tr('walkthroughSub')}</p></div>`;
  let m=s.moves[index-1],p=m?.presentation;
  if(p){let move=p.metadata?.showTutorMove?(m.move||p.explanation?.move):null;return `<div class="walkthrough-explanation"><div class="walkthrough-tech"><b>${p.explanation?.title||tr('logic')}</b><span>${p.metadata?.walkthroughBadge||`R${p.rank}`}</span></div><p><b>${tr('where')} :</b> ${m.where||p.explanation?.where||''}</p><p><b>${tr('walkthroughWhy')}</b><br>${m.why||p.explanation?.why||''}</p>${move?`<p class="walkthrough-move"><b>${tr('hintMove')} :</b> ${move}</p>`:''}</div>`}
  let tech=m.technique?techniqueTitle(m.technique):techniqueTerm('contradiction'),rank=m.exhaustive?'R+':`R${m.rank}`;
  return `<div class="walkthrough-explanation"><div class="walkthrough-tech"><b>${tech}</b><span>${rank}</span></div><p><b>${tr('where')} :</b> ${m.where}</p><p><b>${tr('walkthroughWhy')}</b><br>${m.why||''}</p><p class="walkthrough-move"><b>${tr('hintMove')} :</b> ${m.move}</p></div>`
}
function a11ySyncWalkthroughBoard(){
  let b=document.querySelector('.walkthrough-board'),s=walkthroughSession;if(!b||!s)return;let n=s.base?.n||6,cells=[...b.children];
  b.setAttribute('role','grid');b.setAttribute('aria-rowcount',String(n));b.setAttribute('aria-colcount',String(n));b.setAttribute('aria-label',`${tr('walkthrough')} · ${gameLabel(s.base.game)}`);
  cells.forEach((d,i)=>{let r=Math.floor(i/n),c=i%n,parts=[a11yCoord(r,c)],txt=(d.textContent||'').trim();if(txt)parts.push(txt);a11ySetCell(d,r,c,parts.join(', '),{readonly:true})});
}
function renderWalkthrough(options={}){
  let s=walkthroughSession;if(!s)return;let atStart=!!s.atStart||s.index===0,i=atStart?0:s.index,snap=atStart?s.initial:s.moves[i-1].snapshot,target=walkthroughTarget(i),deduction=i>0?s.moves[i-1]?.deduction:null,previousSnapshot=i>0?(i===1?s.initial:s.moves[i-2]?.snapshot||null):null,animatePlacement=options.animatePlacement===true;
  let groups=walkthroughGroups(s),group=walkthroughCurrentGroup(),nav=s.navigation||walkthroughNavigationApi().definePedagogyNavigation({logicalMoveIndex:0,proofStepIndex:0}),logicalIndex=atStart?-1:nav.logicalMoveIndex,proofIndex=atStart?0:nav.proofStepIndex,lastLogical=groups.length?groups.at(-1).logicalMoveIndex:-1,lastProof=group?group.entries.length-1:0;
  let contradiction=s.logicContradiction?(gamePedagogy(s.base.game).walkthrough.contradictionText(s.logicContradiction)||tr('walkthroughStalled')):tr('walkthroughStalled'),atLastStage=!atStart&&logicalIndex===lastLogical&&proofIndex===lastProof,stateNote=s.done&&atLastStage?`<div class="walkthrough-complete">✓ ${tr('walkthroughComplete')}</div>`:s.stalled&&atLastStage?`<div class="walkthrough-stalled">⚠ ${contradiction}</div>`:'';
  let total=s.done?groups.length:'…',progress=`${atStart?0:logicalIndex+1}/${total}`,nextDisabled=!atStart&&(s.done||s.stalled)&&logicalIndex===lastLogical;document.body.classList.add('tutor-active');
  app.innerHTML=`<section class="panel walkthrough-panel"><div class="stats-head walkthrough-head"><div><h1>${tr('walkthrough')}</h1><p>${gameLabel(s.base.game)} · ${DIFF[s.base.diff]}</p></div><button class="btn" id="walkthroughClose">${tr('walkthroughClose')}</button></div>${walkthroughBoardHtml(snap,target,deduction,{previousSnapshot,animatePlacement})}<div class="walkthrough-actions walkthrough-actions-top" role="group" aria-label="${a11yAttr(`${tr('walkthrough')} · ${tr('hintMove')}`)}"><button class="btn" id="walkthroughPrev" aria-label="${a11yAttr(`${tr('hintMove')} · ${tr('walkthroughPrevious')}`)}" ${atStart?'disabled':''}>← ${tr('walkthroughPrevious')}</button><button class="btn walkthrough-step-counter" id="walkthroughRestart" aria-label="${a11yAttr(`${tr('hintMove')} · ${tr('walkthroughRestart')}`)}" ${atStart?'disabled':''} title="${tr('walkthroughRestart')}">${tr('walkthroughStep')} ${progress} · ↺</button><button class="btn primary" id="walkthroughNext" aria-label="${a11yAttr(`${tr('hintMove')} · ${tr('walkthroughNext')}`)}" ${nextDisabled?'disabled':''}>${tr('walkthroughNext')} →</button></div><div class="walkthrough-scroll" aria-live="polite" aria-atomic="false"><p class="walkthrough-help-note">💡 ${tr('walkthroughCountsAsHelp')}</p>${walkthroughProofControls()}${walkthroughExplanationHtml(i)}${stateNote}</div></section>`;
  a11ySyncWalkthroughBoard();gamePedagogy(s.base.game).walkthrough.afterRender(app.querySelector('.walkthrough-board'),s.base);
  $('#walkthroughClose').onclick=closeWalkthrough;
  $('#walkthroughPrev').onclick=()=>{let nav=s.navigation;if(s.atStart||s.index===0)return;if(nav?.logicalMoveIndex>0)walkthroughSetPosition(nav.logicalMoveIndex-1,0);else walkthroughSetStart();diagnosticRecord('tutor.previous',{index:s.index,moves:s.moves.length});renderWalkthrough({focusSelector:'#walkthroughPrev',focusFallback:'#walkthroughNext',announceNavigation:'logical'})};
  $('#walkthroughRestart').onclick=()=>{walkthroughSetStart();diagnosticRecord('tutor.restart',{index:s.index,moves:s.moves.length});renderWalkthrough({focusSelector:'#walkthroughNext',focusFallback:'#walkthroughClose',announceNavigation:'logical'})};
  $('#walkthroughNext').onclick=()=>{let groups=walkthroughGroups(s),targetLogical=s.atStart||s.index===0?0:(s.navigation?.logicalMoveIndex??0)+1;if(targetLogical>=groups.length){if(!walkthroughGenerateNext()){diagnosticRecord('tutor.next',{index:s.index,moves:s.moves.length});renderWalkthrough({focusSelector:'#walkthroughNext',focusFallback:'#walkthroughPrev',announceNavigation:'logical'});return}groups=walkthroughGroups(s)}if(targetLogical<groups.length)walkthroughSetPosition(targetLogical,0);diagnosticRecord('tutor.next',{index:s.index,moves:s.moves.length});renderWalkthrough({animatePlacement:true,focusSelector:'#walkthroughNext',focusFallback:'#walkthroughPrev',announceNavigation:'logical'})};
  let pp=$('#walkthroughProofPrev'),pn=$('#walkthroughProofNext');if(pp)pp.onclick=()=>walkthroughNavigateProof(-1);if(pn)pn.onclick=()=>walkthroughNavigateProof(1);app.querySelectorAll('button').forEach(pressFeedback);walkthroughPersistResume();if(options.focusSelector)a11yRestoreFocus(options.focusSelector,options.focusFallback);if(options.announceNavigation)a11yAnnounce(walkthroughA11yAnnouncement(options.announceNavigation))
}

function openWalkthrough(){
  if(!current||current.training)return false;let resume=walkthroughStoredResume(),root=walkthroughRootSnapshot(),work=walkthroughVisibleClone(current,root);if(!work)return false;
  let elapsed=timerSeconds(),wasPaused=paused;stopTimer(true);current.walkthroughUsed=true;markHintUsed();updateScoreFlags();saveCurrent();
  walkthroughSession={schema:3,base:work,work,initial:walkthroughSnapshot(work),moves:[],pedagogyNavigationByMove:[],index:0,atStart:true,navigation:walkthroughNavigationApi().definePedagogyNavigation({logicalMoveIndex:0,proofStepIndex:0}),done:false,stalled:false,elapsed,wasPaused};
  gamePedagogy(work.game).walkthrough.initialize(walkthroughSession);
  if(resume&&!walkthroughRestoreResume(resume)){current.walkthroughResume=null;walkthroughSetStart()}
  diagnosticRecord('tutor.open',{index:walkthroughSession.index,moves:walkthroughSession.moves.length,navigation:walkthroughSession.navigation});renderWalkthrough();return true
}
function closeWalkthrough(){
  let s=walkthroughSession;if(!s||!current)return false;walkthroughPersistResume();let elapsed=s.elapsed,wasPaused=s.wasPaused;walkthroughSession=null;document.body.classList.remove('tutor-active');
  renderGameUi(current);
  diagnosticRecord('tutor.close',{index:s.index,moves:s.moves.length,navigation:s.navigation});if(postVictoryReviewActive(current))freezePostVictoryReviewTimer(current.postVictoryReview.officialSeconds);else startTimer(true,elapsed,wasPaused);updatePauseButton();saveCurrent();return true
}

function shell(name,subtitle,diff,content,rules){let challengeTag=current?.challenge?` · <span class="challenge-shell-tag">↗ <b>${current.challengeCode}</b></span>`:'';let trainingTag=current?.learning?` · <span class="training-shell-tag">${tr('lesson')} ${current.learningPhase}/4 : <b>${techniqueTitle(current.learningTechnique)}</b></span>`:current?.training?` · <span class="training-shell-tag">${tr('trainingTarget')} : <b>${techniqueTitle(current.trainingTechnique)}</b></span>`:'';app.innerHTML=`<section class="panel"><div class="game-head"><div><h1>${name}</h1><p>${subtitle}${trainingTag}${challengeTag}${current?` · <span class="live-aids">${aidBadges(current,true)}</span>`:''}</p></div><select class="difficulty" id="difficulty" aria-label="${tr('difficulty')}">${Object.entries(DIFF).map(([k,v])=>`<option value="${k}" ${k===diff?'selected':''}>${v}</option>`).join('')}</select></div><div class="toolbar" role="group" aria-label="${tr('actions')}"><button class="btn primary" id="newBtn">${tr('newGame')}</button><button class="btn" id="resetBtn">${tr('reset')}</button><button class="btn history-action" id="undoBtn" title="${tr('undo')}" aria-label="${tr('undo')}">↶ ${tr('undo')}</button><button class="btn history-action" id="redoBtn" title="${tr('redo')}" aria-label="${tr('redo')}">↷ ${tr('redo')}</button>${UI_FEATURES.pause?`<button class="btn" id="pauseBtn">${tr('pause')}</button>`:''}${(UI_FEATURES.verifyAction||current?.training||current?.learning)?`<button class="btn" id="checkBtn">${tr('check')}</button>`:''}<button class="btn" id="hintBtn">${tr('logicCoach')}</button>${UI_FEATURES.exploration?`<button class="btn" id="exploreBtn">◇ ${tr('exploration')}</button>`:''}<button class="btn secondary-action" id="shareChallengeBtn" style="${current?.challenge?'':'display:none'}">↗ ${tr('shareChallenge')}</button><button class="btn tutor-action" id="walkthroughBtn">▹ ${tr('walkthrough')}</button><button class="btn secondary-action" id="solutionBtn">${tr('solution')}</button><button class="btn secondary-action" id="rulesBtn">${tr('rules')}</button><button class="btn secondary-action" id="techniquesBtn">${tr('techniques')}</button></div><div id="status" class="status" aria-live="polite"></div><div id="errorCoach" class="error-coach" hidden aria-live="polite"></div><div id="reasoningAudit" class="reasoning-audit" hidden aria-live="polite"></div>${UI_FEATURES.exploration?`<div id="explorationPanel" class="exploration-panel" hidden aria-live="polite"></div>`:''}<div id="learningGuide" class="learning-guide" hidden aria-live="polite"></div>${content}${UI_FEATURES.inlineRules?`<div class="rules">${rules}</div>`:''}</section>`;
let coachDiag=$('#hintBtn');if(coachDiag)coachDiag.addEventListener('click',()=>current?.game&&diagnosticRecord('coach.request',{game:current.game}),{capture:true});$('#difficulty').onchange=e=>launch(current.game,e.target.value);$('#newBtn').onclick=()=>current?.challengeCode?launchChallenge(current.challengeCode):launch(current.game,current.diff);if(current?.challenge){$('#difficulty').disabled=true}$('#resetBtn').onclick=resetCurrent;$('#undoBtn').onclick=()=>undoMoves(1);$('#redoBtn').onclick=()=>redoMoves(1);let pauseBtn=$('#pauseBtn');if(pauseBtn)pauseBtn.onclick=togglePause;let exploreBtn=$('#exploreBtn');if(exploreBtn)exploreBtn.onclick=()=>explorationState()?.active?refreshExplorationPanel():startExploration();let scb=$('#shareChallengeBtn');if(scb&&current?.challenge)scb.onclick=()=>shareChallenge(challengeParse(current.challengeCode));let wb=$('#walkthroughBtn');if(wb)wb.onclick=openWalkthrough;$('#rulesBtn').onclick=()=>modal(`${tr('rules')} — ${name}`,rules);$('#techniquesBtn').onclick=()=>modal(`${tr('techniques')} — ${name}`,techniqueLibraryHtml(current.game));app.querySelectorAll('button').forEach(pressFeedback);updatePauseButton();updateHistoryButtons();refreshErrorCoach();refreshReasoningAudit();refreshExplorationPanel();if(current?.training)decorateTrainingShell()}

function resetCurrent(){
  if(!current)return;
  if(current.training)return resetTrainingExercise();
  let hadProgress=SessionHistory.hasPuzzleProgress(current);if(hadProgress)markBacktrack();
  cancelVictoryPresentation(true);closeHintNotice();clearHintFocus();current.hintFlow=null;current.walkthroughResume=null;current.lastError=null;current.lastMoveAudit=null;current.exploration=null;clearErrorFocus();
  if(!SessionHistory.resetPuzzleState(current))return;
  if(!resetGameUi(current))return;
  let wasCompleted=!!current.completed;
  current.completed=false;delete current.postVictoryReview;
  if(wasCompleted||current.statsClosed){current.backtrackUsed=false;current.hintUsed=false;current.attemptId=null;current.statsClosed=false;statsStart(current)}
  stopTimer(false);elapsedBase=0;startedAt=0;paused=false;startTimer(true,0,false);historyInit(true);updateHistoryButtons();
  diagnosticRecord('session.reset',{hadProgress});saveCurrent();updatePauseButton();status('',true);showToast(tr('resetDone'));haptic(8)
}

// ===== v2.7.0 — background precomputation =====
const WebPrecompute=QuadludWebPrecompute.create({gameIds:GAME_IDS,gameRegistry:GameRegistry,webPlatform:WebPlatform,localDay,generationSessionSet,rememberGeneratedCandidateThisSession,generatedCandidateCertified:runtimeCandidateCertified,generatedCandidateIdentity,workerUrl:`./precompute-worker.js?v=${VERSION}`,schedule:(fn,ms)=>setTimeout(fn,ms)});
const PRECOMPUTE_TARGET=WebPrecompute.target,PRECOMPUTE_COMBOS=WebPrecompute.combos;
function precomputeKey(game,diff){return WebPrecompute.key(game,diff)}
function precomputeBucket(game,diff){return WebPrecompute.bucket(game,diff)}
function resetPrecomputeDay(day=localDay()){return WebPrecompute.resetDay(day)}
function precomputeForbiddenKeys(game,day=localDay()){return WebPrecompute.forbiddenKeys(game,day)}
function ensurePrecomputeWorker(){return WebPrecompute.ensureWorker()}
function precomputeComboSupported(game,diff){return WebPrecompute.comboSupported(game,diff)}
function precomputeCandidateCertified(game,diff,candidate){return WebPrecompute.certified(game,diff,candidate)}
function precomputeOrder(){return WebPrecompute.order()}
function schedulePrecompute(game=null,diff=null){return WebPrecompute.schedule(game,diff)}
function startBackgroundPrecompute(game=current?.game,diff=current?.diff){return WebPrecompute.start(game,diff)}
function takePrecomputed(game,diff,day=localDay()){return WebPrecompute.take(game,diff,day)}
function precomputeStatus(){return WebPrecompute.status()}

function launch(game,diff){if(!GameRegistry.hasGame(game))throw new Error(`Unknown QUADLUD game: ${game}`);let previousGame=current?.game||null,previousDifficulty=current?.diff||null;closePreviousAttempt();clearSaved();stopTimer();paused=false;setBusy(true);current={game,diff};requestAnimationFrame(()=>{try{let candidate=normalLaunchCandidate(game,diff);installGeneratedSession(game,diff,candidate,{context:'normal'});historyInit(true);diagnosticStart('normal',{previousGame,previousDifficulty});updateHistoryButtons();statsStart(current);startTimer(true,0,false);saveCurrent();haptic(8)}finally{setBusy(false);startBackgroundPrecompute(game,diff)}})}
function resumeSaved(){let s=getSaved();if(!s)return home();stopTimer();let c=DataSerialization.deserializeCurrentState(s.current);current=c;historyInit(false);renderGameUi(c);if(postVictoryReviewActive(c))freezePostVictoryReviewTimer(c.postVictoryReview.officialSeconds);else startTimer(true,s.elapsed||0,false);diagnosticStart('resume',{resumed:true});updatePauseButton();refreshExplorationPanel();showToast(tr('restored'));if(!c.training)startBackgroundPrecompute(c.game,c.diff)}







function showNoLogicalHint(){showHintNotice(tr('noLogicalHint'));saveCurrent()}
const DETAILED_HINT_LANGS=new Set(['fr','en']);
function genericLocalizedHint(kind,target,rank,value){return gamePedagogy(kind).coach.localizedHint({target,rank,value})}












// ===== Rank-1 inference: simulate one candidate, then reject it if the
// resulting visible state already contains a contradiction or leaves any
// required next placement with no legal candidate. No hidden solution is used.

function withTempCurrent(mutator,fn){
  let snap=current,clone=DataSerialization.deserializeCurrentState(DataSerialization.serializeCurrentState(current));
  current=clone;try{mutator(clone);return fn(clone)}finally{current=snap}
}


function hintBudgetExpired(deadline){return Number.isFinite(deadline)&&WebPlatform.clock.nowMs()>=deadline}













// ===== Rank-2 inference =====
// A candidate that survived direct rules and rank 1 is simulated. The engine
// then looks one level deeper: if some required next decision has no
// rank-1-viable reply, the initial candidate is impossible.
// Functions return a witness so the hint can explain the chain:
// hypothesis -> consequence -> dead end -> conclusion.

function cellName(r,c){return lang()==='fr'?`L${r+1}C${c+1}`:`R${r+1}C${c+1}`}
function pieceName(kind,v){return gamePedagogy(kind).coach.pieceName(v)}
function rank1Why(h){
  return `<span class="reason-step"><b>1. ${lang()==='fr'?'Essai':'Try'} :</b> ${h.hypothesis}</span>`+
         `<span class="reason-step"><b>2. ${lang()==='fr'?'Ce que cela provoque':'What happens'} :</b> ${h.consequence}</span>`+
         `<span class="reason-step dead"><b>3. ${lang()==='fr'?'Pourquoi ça bloque':'Why it fails'} :</b> ${h.deadend}</span>`+
         `<span class="reason-step conclusion"><b>4. ${tr('conclusion')} :</b> ${h.conclusion}</span>`
}
function rank2Why(h){
  return `<span class="reason-step"><b>1. ${tr('hypothesis')} :</b> ${h.hypothesis}</span>`+
         `<span class="reason-step"><b>2. ${tr('consequence')} :</b> ${h.consequence}</span>`+
         `<span class="reason-step dead"><b>3. ${tr('deadend')} :</b> ${h.deadend}</span>`+
         `<span class="reason-step conclusion"><b>4. ${tr('conclusion')} :</b> ${h.conclusion}</span>`
}
function rank3Why(h){
  return `<span class="reason-step"><b>1. ${tr('hypothesis')} :</b> ${h.hypothesis}</span>`+
         `<span class="reason-step"><b>2. ${lang()==='fr'?'Première conséquence':'First consequence'} :</b> ${h.consequence}</span>`+
         `<span class="reason-step"><b>3. ${lang()==='fr'?'Deuxième vérification':'Second check'} :</b> ${h.secondStep}</span>`+
         `<span class="reason-step dead"><b>4. ${tr('deadend')} :</b> ${h.deadend}</span>`+
         `<span class="reason-step conclusion"><b>5. ${tr('conclusion')} :</b> ${h.conclusion}</span>`
}

























function coachLookText(kind,target,message={}){return gamePedagogy(kind).coach.lookText({target,message,current})}
function coachRuleText(message={}){
  let id=message?.reasoning?.technique;
  if(id&&PEDAGOGY_TECHNIQUES[id])return `<span class="coach-technique-title">${techniqueTitle(id)}</span><code class="coach-technique-id">${id}</code><span class="coach-technique-summary">${techniqueSummary(id)}</span>`;
  let rank=Math.max(0,Math.min(3,Number(message.rank)||0));
  return rank===0?tr('directReason'):tr(`rank${rank}`)
}
function coachUsage(stage,technique=null){
  if(!current)return;
  let u=current.coachUsage||(current.coachUsage={where:0,rule:0,why:0,reveal:0,maxStage:0,techniques:{},flowVersion:2});
  if(!u.techniques)u.techniques={};u.flowVersion=2;
  let k=['','where','why','reveal'][stage];if(k)u[k]=(u[k]||0)+1;
  u.maxStage=Math.max(u.maxStage||0,stage);
  if(technique&&PEDAGOGY_TECHNIQUES[technique]){
    let t=u.techniques[technique]||(u.techniques[technique]={where:0,rule:0,why:0,reveal:0});
    if(k)t[k]=(t[k]||0)+1;
    if(k)masteryRecord(technique,{where:'where3',why:'why3',reveal:'reveal3'}[k]||k)
  }
}
function hintStage(kind,target,message,apply){
  if(!DETAILED_HINT_LANGS.has(lang())&&message.rank!=null&&gamePedagogy(kind).coach.genericHintFallbackAllowed(message)){let g=genericLocalizedHint(kind,target,message.rank,message.value);message={...message,...g}}
  if(message.reasoning)current.lastReasoning=message.reasoning;
  let technique=message?.reasoning?.technique||null,isNew=!current.hintFlow||current.hintFlow.kind!==kind||current.hintFlow.key!==target.join(',')||current.hintFlow.plan?.flowVersion!==2;
  if(isNew){
    let plan=adaptiveCoachPlan(technique);
    current.hintFlow={kind,key:target.join(','),stage:0,plan};
  }
  let h=current.hintFlow,previous=h.stage||0,next=isNew?Math.max(1,Math.min(2,h.plan?.entryStage||1)):Math.min(3,previous+1);
  h.stage=next;
  diagnosticRecord('coach.stage',{stage:h.stage,technique:technique||null});for(let s=previous+1;s<=next;s++)coachUsage(s,technique);
  if(technique)current.masteryPendingAid={technique,stage:h.stage,target:[...target]};
  clearHintFocus();
  if(h.stage===1)focusHintContext(kind,target,message);else focusHint(target);
  let progress=`<span class="coach-progress">${h.stage}/3</span>`,note=adaptiveCoachNote(h.plan),blocks=[];
  // If adaptation jumps on the first request, show every level actually delivered.
  for(let s=(isNew?1:h.stage);s<=h.stage;s++)blocks.push(coachStageBlock(s,kind,target,message));
  if(h.stage<3){
    showHintNotice(`${progress}${blocks.join('<br>')}${note}`)
  }else{
    let before=historySnapshotKey();markHintUsed();updateScoreFlags();apply();
    historyRecord({type:'COACH_APPLY',reasoning:message.reasoning||null,coachStage:3,coachFlowVersion:2,adaptivePlan:h.plan||null},before);
    current.hintFlow=null;
    showHintNotice(`${progress}${coachStageBlock(3,kind,target,message)}${note}`);
    haptic(12)
  }
  saveCurrent();if(current?.trainingPendingComplete){current.trainingPendingComplete=false;finishTrainingExercise()}
}
function focusHint([r,c]){let board=document.querySelector('.board');if(!board)return;let n=current.n||6,d=board.children[r*n+c];if(d)d.classList.add('hint-focus')}
function focusHintContext(kind,[r,c],message={}){
  let board=document.querySelector('.board');if(!board)return;let n=current.n||6,cells=[...board.children],add=(rr,cc)=>{let d=cells[rr*n+cc];if(d)d.classList.add('hint-context')};
  for(let i=0;i<n;i++){add(r,i);add(i,c)}
  for(let cell of gamePedagogy(kind).coach.contextCells({target:[r,c],message,current})||[])add(cell[0],cell[1])
}
function clearHintFocus(){document.querySelectorAll('.hint-focus,.hint-context').forEach(x=>{x.classList.remove('hint-focus');x.classList.remove('hint-context')});document.querySelectorAll('.queen-region-focus').forEach(x=>{x.classList.remove('queen-region-focus','queen-region-focus-top','queen-region-focus-right','queen-region-focus-bottom','queen-region-focus-left');x.removeAttribute('data-region-focus-badge')});document.querySelectorAll('.queen-line-focus').forEach(x=>x.classList.remove('queen-line-focus','queen-line-focus-row','queen-line-focus-column'));document.querySelectorAll('.queen-unit-focus-label').forEach(x=>x.classList.remove('queen-unit-focus-label','queen-unit-focus-row-label','queen-unit-focus-column-label'))}
function touchSave(fn,action='MOVE'){return()=>{if(paused)return;let before=historySnapshotKey();closeHintNotice();current.hintFlow=null;clearHintFocus();fn();historyRecord(action,before);saveCurrent()}}


function maybeAutoFinish(){
  if(!current||current.completed||paused||current.training)return false;
  let result=validateRegisteredVictory(current,{strictGeneratedSolution:true});
  if(result.solved){finish(`${tr('congrats')} ${gameLabel(current.game)}`);return true}
  return false
}
function celebrateBoard(game=current?.game){let board=document.querySelector('.board');return VictoryPresentation.celebrate({gameId:game,board,victoryClass:gameVictoryClass(game)})}
// 27.3 — registry-driven Web UI lifecycle. Game-specific renderer factories are resolved lazily through GameRegistry.
let webGameUiAdapterCollection=null;
function pedagogicalHintForGame(game){return gamePedagogy(game).coach.runHint()}
function webGameUiDependencies(game){
  return {
    document,window:typeof window!=='undefined'?window:{addEventListener(){},matchMedia:null},query:$,getApp:()=>app,shell,gameLabel,
    difficultyLabel:diff=>DIFF[diff],tr,gameRules,getCurrent:()=>current,getWalkthroughSession:()=>walkthroughSession,
    isPaused:()=>paused,getPrefs:prefs,savePrefs,touchSave,historySnapshotKey,historyRecord,saveCurrent,closeHintNotice,clearHintFocus,
    markBacktrack,haptic,maybeAutoFinish,a11ySetupGrid,a11yAnnounce,a11yCoord,a11ySetCell,keyCell,
    applyLogicalMove:move=>{const applied=LogicalTransactions.apply(current,move);diagnosticRecordedHistory(applied.recorded);updateHistoryButtons();saveCurrent();return applied},
    applyIllegalClasses,applyConfiguredIllegalClasses,applyUnjustifiedHighlights,updateScoreFlags,coarsePointer,checkVictory:checkRegisteredVictory,
    hint:()=>pedagogicalHintForGame(game),finish,showToast,requestFrame:cb=>requestAnimationFrame(cb),cancelFrame:id=>cancelAnimationFrame(id),
    setTimer:(cb,ms)=>setTimeout(cb,ms),recordDiagnostic:(type,payload)=>diagnosticRecord(type,payload),getResizeObserver:()=>typeof ResizeObserver==='function'?ResizeObserver:null
  }
}
function createWebGameUiAdapter(game){
  const lifecycle=GameRegistry.requireCapability(game,'uiLifecycle');
  return lifecycle.createAdapter(webGameUiDependencies(game))
}
function webGameUiAdapters(){
  if(webGameUiAdapterCollection)return webGameUiAdapterCollection;
  if(typeof QuadludGameUiAdapters==='undefined')throw new Error('QUADLUD Web UI adapter collection unavailable');
  webGameUiAdapterCollection=QuadludGameUiAdapters.createCollection(GameRegistry.IDS,createWebGameUiAdapter);
  return webGameUiAdapterCollection
}
function gameWebUi(game=current?.game){
  if(!game)throw new Error('QUADLUD Web UI game unavailable');
  return webGameUiAdapters().require(game)
}
function renderGameUi(session=current){if(!session?.game)return false;return gameWebUi(session.game).render(session)}
function drawGameUi(session=current){if(!session?.game)return false;return gameWebUi(session.game).draw()}
function resetGameUi(session=current){if(!session?.game)return false;return gameWebUi(session.game).reset(session)}














function keyboardInput(e){if(!current?.game)return false;let handler=gameWebUi(current.game).keyboardInput;return typeof handler==='function'?handler(e):false}
document.addEventListener('keydown',keyboardInput);
function status(t,ok){let s=$('#status');if(!s)return;s.textContent=t;s.className='status '+(ok?'ok':'bad');if(!ok)playTone('error')}
function finish(t,outcome='solved'){
  let measured=timerSeconds(),review=postVictoryReviewState(current),reviewClosed=!!review&&current?.statsClosed===true,total=reviewClosed?review.officialSeconds:measured;
  stopTimer(false);elapsedBase=total;startedAt=0;paused=true;
  if(current){
    if(!reviewClosed){statsFinish(current,measured,outcome);markDaily(current,outcome,measured)}
    if(outcome==='solved'){
      if(reviewClosed){review.active=false;review.replayCount=(review.replayCount||0)+1;review.lastReplayAt=WebPlatform.clock.nowMs()}
      else current.postVictoryReview={schema:1,active:false,outcome:'solved',officialSeconds:measured,closedAt:WebPlatform.clock.nowMs(),replayCount:0}
    }else if(reviewClosed){review.active=false;review.lastReviewAt=WebPlatform.clock.nowMs();review.lastReviewFinishOutcome=String(outcome||'')}
    else delete current.postVictoryReview;
    current.completed=true;gamePedagogy(current.game).lifecycle.afterFinish({current})
  }
  let snapshot=current?{...current}:null;clearSaved();renderTimer(true);status(`${t} — ${fmt(elapsedBase)}`,true);updatePauseButton();
  if(outcome==='solved'&&snapshot){VictoryPresentation.playApplause({enabled:prefs().sound});victoryAnimationFrame=requestAnimationFrame(()=>{victoryAnimationFrame=null;celebrateBoard(snapshot.game);victoryOverlayTimer=setTimeout(()=>{victoryOverlayTimer=null;victoryOverlay(snapshot,total)},2100)})}
}
WebPlatform.lifecycle.onVisibilityChange(()=>{diagnosticRecord('lifecycle.visibility',{hidden:WebPlatform.lifecycle.isHidden()});if(WebPlatform.lifecycle.isHidden()&&current&&!current.completed)saveCurrent()});WebPlatform.lifecycle.onPageHide(()=>{if(current&&!current.completed)saveCurrent()});Diagnostic.attachGlobalErrors(window,()=>({reasoningView:diagnosticView(current)}));window.addEventListener('resize',()=>diagnosticRecord('viewport.resize',{viewport:{width:Math.max(0,Number(innerWidth)||0),height:Math.max(0,Number(innerHeight)||0)},dpr:Math.max(0,Number(devicePixelRatio)||1)}));window.addEventListener('orientationchange',()=>diagnosticRecord('viewport.orientation',{orientation:diagnosticOrientation()}));if(WebPlatform.serviceWorker.supported())WebPlatform.lifecycle.onLoad(()=>WebPlatform.serviceWorker.register('./sw.js').catch(()=>{}));
discardLegacyPersistence();applyPrefs();try{window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(prefs().theme==='auto')applyPrefs()})}catch(_){}initialView();


// ===== v2.23 — shared helpers still used by current logic/generation =====


// v2.6.2 — generation identity session anti-repeat.
// Only games declaring the optional generationIdentity capability participate.
// Kept deliberately in memory only: restarting/reloading the application clears it.
const generatedIdentitySessionByDay=new Map();

function generationSessionSet(game,day=localDay()){
  for(let d of [...generatedIdentitySessionByDay.keys()])if(d!==day)generatedIdentitySessionByDay.delete(d);
  if(!generatedIdentitySessionByDay.has(day))generatedIdentitySessionByDay.set(day,new Map());
  let perGame=generatedIdentitySessionByDay.get(day);
  if(!perGame.has(game))perGame.set(game,new Set());
  return perGame.get(game)
}
function rememberGeneratedCandidateThisSession(game,candidate,day=localDay()){
  let identity=generatedCandidateIdentity(game,candidate);if(identity!=null)generationSessionSet(game,day).add(identity);return identity
}
function normalLaunchCandidate(game,diff,day=localDay()){
  let candidate=takePrecomputed(game,diff,day);if(candidate)return candidate;
  if(!GameRegistry.hasCapability(game,'generationIdentity'))return generateRegisteredCandidate(game,diff);
  let seen=generationSessionSet(game,day);
  for(let tries=0;tries<40;tries++){
    let next=generateRegisteredCandidate(game,diff),identity=generatedCandidateIdentity(game,next);
    if(seen.has(identity))continue;rememberGeneratedCandidateThisSession(game,next,day);return next
  }
  throw new Error(lang()==='fr'?'Aucune nouvelle grille Couronnes conforme au profil logique n’a pu être générée.':'No fresh Crowns grid matching the logical profile could be generated.')
}
