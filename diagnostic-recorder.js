/*
 * QUADLUD — diagnostic qbug schema/projection core
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  let structural=root&&root.QuadludDiagnosticUiStructural,attachments=root&&root.QuadludDiagnosticAttachments;
  if(typeof module==='object'&&module.exports){try{if(!structural)structural=require('./diagnostic-ui-structural.js')}catch(_){};try{if(!attachments)attachments=require('./diagnostic-attachments.js')}catch(_){}}
  const api=factory(structural,attachments);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludDiagnosticRecorder=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(UiStructural,Attachments){
  'use strict';

  const VERSION=1;
  const FORMAT='quadlud-qbug';
  const SCHEMA_VERSION=1;
  const QVIS_PREFIX='qvis1-';
  const ROOT_KEYS=Object.freeze(['format','schemaVersion','createdAt','app','environment','game','initialVisibleState','events','errors','uiSnapshots','attachments','finalVisibleStateDigest','buffer']);
  const UI_SNAPSHOT_ENTRY_KEYS=Object.freeze(['seq','atMs','eventSeq','reason','snapshot']);
  const HIDDEN_KEYS=Object.freeze(new Set([
    'sol','solution','hiddensolution','solutiongrid','answergrid','hiddenstate','validationstate',
    'solvertrace','validationtrace','backtracking','backtracktrace','searchbranches','solverbranches',
    'internalbranches','searchtree'
  ]));
  const EVENT_PAYLOAD_FIELDS=Object.freeze({
    'session.start':['context','resumed','previousGame','previousDifficulty'],
    'action.applied':['action','historyNode','parentNode','branchCreated','existingNode'],
    'action.not-applied':['action','reason'],
    'history.undo':['requested','moved','cursor'],
    'history.redo':['requested','moved','cursor'],
    'history.branch':['parentNode','historyNode'],
    'session.reset':['hadProgress'],
    'coach.request':['game'],
    'coach.stage':['stage','technique'],
    'tutor.open':['index','moves'],
    'tutor.next':['index','moves'],
    'tutor.previous':['index','moves'],
    'tutor.restart':['index','moves'],
    'tutor.close':['index','moves'],
    'pedagogy.event':['domain','action','technique'],
    'ui.tool-change':['game','tool'],
    'viewport.resize':['viewport','dpr'],
    'viewport.orientation':['orientation'],
    'lifecycle.visibility':['hidden'],
    'runtime.error':['errorId','kind']
  });
  const EVENT_TYPES=Object.freeze(Object.keys(EVENT_PAYLOAD_FIELDS));
  const ACTION_FIELDS=Object.freeze(['type','target','primaryTarget','input','region','rectangle','cell','changes','reasoning','coachStage','coachFlowVersion','adaptivePlan']);
  const ERROR_FIELDS=Object.freeze(['id','atMs','kind','name','message','stack','source','line','column']);
  const SENSITIVE_TEXT_RE=/(solutionGrid|hiddenSolution|validationState|answerGrid|hiddenState|solverTrace|validationTrace|backtrack(?:ing|Trace)?|solverBranches|internalBranches|searchBranches|searchTree|\bsol\b|\bsolution\b)/i;

  function fail(message){throw new TypeError(`Invalid QUADLUD diagnostic data: ${message}`)}
  function isPlainObject(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null}
  function normalizedKey(key){return String(key).replace(/[-_\s]/g,'').toLowerCase()}
  function isHiddenKey(key){return HIDDEN_KEYS.has(normalizedKey(key))}
  function assertJsonSafe(value,path='value',seen=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){if(!Number.isFinite(value))fail(`${path} must contain only finite numbers`);return}
    if(['undefined','function','symbol','bigint'].includes(typeof value))fail(`${path} must be JSON-safe`);
    if(typeof value!=='object')fail(`${path} must be JSON-safe`);
    if(seen.has(value))fail(`${path} must not contain cycles`);seen.add(value);
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)assertJsonSafe(value[i],`${path}[${i}]`,seen)}
    else{
      if(!isPlainObject(value))fail(`${path} must contain only plain objects and arrays`);
      for(const [key,item] of Object.entries(value)){
        if(isHiddenKey(key))fail(`${path}.${key} is hidden state`);
        assertJsonSafe(item,`${path}.${key}`,seen)
      }
    }
    seen.delete(value)
  }
  function clonePublic(value,path='value'){assertJsonSafe(value,path);return JSON.parse(JSON.stringify(value))}
  function exactKeys(obj,allowed,path){if(!isPlainObject(obj))fail(`${path} must be a plain object`);for(const key of Object.keys(obj))if(!allowed.includes(key))fail(`${path}.${key} is not allowed`)}
  function copyAllowed(source,fields,path){
    if(!isPlainObject(source))fail(`${path} must be a plain object`);
    // Scan the complete source before projection so hidden data cannot hide inside an ignored field.
    assertJsonSafe(source,path);
    const out={};for(const key of fields)if(Object.prototype.hasOwnProperty.call(source,key))out[key]=clonePublic(source[key],`${path}.${key}`);return out
  }
  function nonEmpty(value,path){if(typeof value!=='string'||!value.trim())fail(`${path} must be a non-empty string`);return value.trim()}
  function finiteNumber(value,path,{integer=false,min=null}={}){if(typeof value!=='number'||!Number.isFinite(value)||(integer&&!Number.isInteger(value))||(min!=null&&value<min))fail(`${path} must be a valid number`);return value}
  function nullableString(value,path){if(value===null)return null;if(typeof value!=='string')fail(`${path} must be a string or null`);return value}
  function redactSensitiveText(value){if(value==null)return value;const text=String(value);return SENSITIVE_TEXT_RE.test(text)?'[redacted-sensitive-diagnostic-text]':text}

  function projectReasoningView(view){
    if(!isPlainObject(view))fail('reasoningView must be a plain object');
    assertJsonSafe(view,'reasoningView');
    if(!isPlainObject(view.publicPuzzle)||!isPlainObject(view.visibleState))fail('reasoningView requires publicPuzzle and visibleState');
    return Object.freeze({
      game:nonEmpty(view.game,'reasoningView.game'),
      publicPuzzle:clonePublic(view.publicPuzzle,'reasoningView.publicPuzzle'),
      visibleState:clonePublic(view.visibleState,'reasoningView.visibleState')
    })
  }
  function projectAction(action){return copyAllowed(action,ACTION_FIELDS,'action')}
  function projectPayload(type,payload={}){
    if(!Object.prototype.hasOwnProperty.call(EVENT_PAYLOAD_FIELDS,type))fail(`unsupported event type ${type}`);
    const projected=copyAllowed(payload,EVENT_PAYLOAD_FIELDS[type],`payload(${type})`);
    if(Object.prototype.hasOwnProperty.call(projected,'action')&&projected.action!=null)projected.action=projectAction(projected.action);
    return projected
  }
  function projectError(error={}){
    if(!isPlainObject(error))fail('error must be a plain object');
    // Do not serialize arbitrary rejection/error objects. Only allow the named scalar fields below.
    const out={};
    for(const key of ERROR_FIELDS){
      if(!Object.prototype.hasOwnProperty.call(error,key))continue;
      let value=error[key];
      if(['name','message','stack','source'].includes(key))value=redactSensitiveText(value);
      else if(key==='id'||key==='kind')value=value==null?value:String(value);
      else if(key==='atMs'||key==='line'||key==='column'){if(value!=null)finiteNumber(value,`error.${key}`,{min:0})}
      if(value!==undefined)out[key]=value
    }
    assertJsonSafe(out,'projectedError');return out
  }
  function validateEnvironment(env){
    exactKeys(env,['lang','theme','viewport','dpr','orientation','userAgent'],'environment');
    if(typeof env.lang!=='string'||typeof env.theme!=='string'||typeof env.orientation!=='string'||typeof env.userAgent!=='string')fail('environment string fields are required');
    exactKeys(env.viewport,['width','height'],'environment.viewport');finiteNumber(env.viewport.width,'environment.viewport.width',{min:0});finiteNumber(env.viewport.height,'environment.viewport.height',{min:0});finiteNumber(env.dpr,'environment.dpr',{min:0})
  }
  function validateQbug(doc){
    exactKeys(doc,ROOT_KEYS,'qbug');assertJsonSafe(doc,'qbug');
    if(doc.format!==FORMAT)fail(`format must be ${FORMAT}`);if(doc.schemaVersion!==SCHEMA_VERSION)fail(`schemaVersion must be ${SCHEMA_VERSION}`);
    if(typeof doc.createdAt!=='string'||Number.isNaN(Date.parse(doc.createdAt)))fail('createdAt must be an ISO-compatible date');
    exactKeys(doc.app,['name','version','build'],'app');nonEmpty(doc.app.name,'app.name');nonEmpty(doc.app.version,'app.version');nonEmpty(doc.app.build,'app.build');
    validateEnvironment(doc.environment);
    exactKeys(doc.game,['id','difficulty','fingerprint','publicPuzzle'],'game');nonEmpty(doc.game.id,'game.id');nonEmpty(doc.game.difficulty,'game.difficulty');nullableString(doc.game.fingerprint,'game.fingerprint');if(!isPlainObject(doc.game.publicPuzzle))fail('game.publicPuzzle must be a plain object');
    if(!isPlainObject(doc.initialVisibleState))fail('initialVisibleState must be a plain object');
    if(!Array.isArray(doc.events))fail('events must be an array');let previousAt=-Infinity;
    doc.events.forEach((event,index)=>{
      exactKeys(event,['seq','atMs','type','payload','stateDigest'],`events[${index}]`);
      if(event.seq!==index+1)fail(`events[${index}].seq must equal ${index+1}`);finiteNumber(event.atMs,`events[${index}].atMs`,{min:0});if(event.atMs<previousAt)fail('event timestamps must not decrease');previousAt=event.atMs;
      nonEmpty(event.type,`events[${index}].type`);if(!EVENT_TYPES.includes(event.type))fail(`events[${index}].type is unsupported`);
      const projected=projectPayload(event.type,event.payload);if(JSON.stringify(projected)!==JSON.stringify(event.payload))fail(`events[${index}].payload contains non-schema fields`);
      if(event.stateDigest!==null&&(typeof event.stateDigest!=='string'||!event.stateDigest.startsWith(QVIS_PREFIX)))fail(`events[${index}].stateDigest is invalid`)
    });
    if(!Array.isArray(doc.errors))fail('errors must be an array');doc.errors.forEach((error,index)=>{exactKeys(error,ERROR_FIELDS,`errors[${index}]`);const projected=projectError(error);if(JSON.stringify(projected)!==JSON.stringify(error))fail(`errors[${index}] is not safely projected`)});
    if(doc.uiSnapshots!==undefined){if(!Array.isArray(doc.uiSnapshots))fail('uiSnapshots must be an array');doc.uiSnapshots.forEach((entry,index)=>{exactKeys(entry,UI_SNAPSHOT_ENTRY_KEYS,`uiSnapshots[${index}]`);if(entry.seq!==index+1)fail(`uiSnapshots[${index}].seq must equal ${index+1}`);finiteNumber(entry.seq,`uiSnapshots[${index}].seq`,{integer:true,min:1});finiteNumber(entry.atMs,`uiSnapshots[${index}].atMs`,{min:0});if(entry.eventSeq!==null)finiteNumber(entry.eventSeq,`uiSnapshots[${index}].eventSeq`,{integer:true,min:1});nonEmpty(entry.reason,`uiSnapshots[${index}].reason`);assertJsonSafe(entry.snapshot,`uiSnapshots[${index}].snapshot`);if(!UiStructural||typeof UiStructural.validate!=='function')fail('structural snapshot validator unavailable');UiStructural.validate(entry.snapshot)});}
    if(doc.attachments!==undefined){if(!Array.isArray(doc.attachments))fail('attachments must be an array');if(doc.attachments.length>1)fail('attachments supports at most one item in DBG-4 D1');if(doc.attachments.length&&!Attachments?.validateAttachment)fail('attachment validator unavailable');doc.attachments.forEach((entry,index)=>Attachments.validateAttachment(entry));}
    if(doc.finalVisibleStateDigest!==null&&(typeof doc.finalVisibleStateDigest!=='string'||!doc.finalVisibleStateDigest.startsWith(QVIS_PREFIX)))fail('finalVisibleStateDigest is invalid');
    exactKeys(doc.buffer,['capacity','droppedEvents','uiCapacity','droppedUiSnapshots'],'buffer');finiteNumber(doc.buffer.capacity,'buffer.capacity',{integer:true,min:1});finiteNumber(doc.buffer.droppedEvents,'buffer.droppedEvents',{integer:true,min:0});if(doc.buffer.uiCapacity!==undefined)finiteNumber(doc.buffer.uiCapacity,'buffer.uiCapacity',{integer:true,min:1});if(doc.buffer.droppedUiSnapshots!==undefined)finiteNumber(doc.buffer.droppedUiSnapshots,'buffer.droppedUiSnapshots',{integer:true,min:0});
    return true
  }


  function canonical(value){
    if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
    if(value&&typeof value==='object'){const keys=Object.keys(value).sort();return `{${keys.map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`}
    return JSON.stringify(value)
  }
  function visibleDigest(value){
    assertJsonSafe(value,'visibleState');let text=canonical(value),h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
    return `${QVIS_PREFIX}${h.toString(16).padStart(8,'0')}`
  }
  function createRecorder(options={}){
    if(!isPlainObject(options))fail('recorder options must be a plain object');
    const capacity=options.capacity==null?256:finiteNumber(options.capacity,'capacity',{integer:true,min:1});
    const maxErrors=options.maxErrors==null?32:finiteNumber(options.maxErrors,'maxErrors',{integer:true,min:1});
    const uiCapacity=options.uiCapacity==null?64:finiteNumber(options.uiCapacity,'uiCapacity',{integer:true,min:1});
    const nowMs=typeof options.nowMs==='function'?options.nowMs:()=>Date.now();
    const nowIso=typeof options.nowIso==='function'?options.nowIso:()=>new Date().toISOString();
    let enabled=options.enabled!==false,startedAt=0,events=[],errors=[],uiSnapshots=[],attachments=[],droppedEvents=0,droppedUiSnapshots=0,initialVisibleState={},lastVisibleState={},session=null,errorSeq=0;
    function reset(){startedAt=Number(nowMs())||0;events=[];errors=[];uiSnapshots=[];attachments=[];droppedEvents=0;droppedUiSnapshots=0;initialVisibleState={};lastVisibleState={};session=null;errorSeq=0;return true}
    function stateFrom(view){if(view==null)return null;const p=projectReasoningView(view);return p.visibleState}
    function append(type,payload={},view=null){
      if(!enabled)return {recorded:false,reason:'disabled'};
      try{
        const projectedPayload=projectPayload(type,payload),state=stateFrom(view),at=Math.max(0,(Number(nowMs())||0)-startedAt);
        const internal={atMs:at,type,payload:projectedPayload,stateDigest:state?visibleDigest(state):null,_visibleState:state?clonePublic(state):null};
        events.push(internal);if(state)lastVisibleState=clonePublic(state);
        if(events.length>capacity){const dropped=events.shift();droppedEvents++;if(dropped._visibleState)initialVisibleState=clonePublic(dropped._visibleState);for(const ui of uiSnapshots)if(ui.eventSeq!==null)ui.eventSeq=ui.eventSeq<=1?null:ui.eventSeq-1}
        return {recorded:true,type,stateDigest:internal.stateDigest}
      }catch(error){return {recorded:false,reason:'diagnostic-rejected',error:String(error?.message||error)}}
    }
    function start(input={}){
      if(!enabled)return {recorded:false,reason:'disabled'};
      try{
        if(!isPlainObject(input))fail('start input must be a plain object');
        const view=projectReasoningView(input.reasoningView),app=copyAllowed(input.app||{},['name','version','build'],'start.app'),environment=copyAllowed(input.environment||{},['lang','theme','viewport','dpr','orientation','userAgent'],'start.environment');
        validateEnvironment(environment);nonEmpty(app.name,'start.app.name');nonEmpty(app.version,'start.app.version');nonEmpty(app.build,'start.app.build');
        reset();initialVisibleState=clonePublic(view.visibleState);lastVisibleState=clonePublic(view.visibleState);
        session={app,environment,game:{id:view.game,difficulty:nonEmpty(input.difficulty,'start.difficulty'),fingerprint:input.fingerprint==null?null:String(input.fingerprint),publicPuzzle:clonePublic(view.publicPuzzle)}};
        return append('session.start',{context:input.context||'normal',resumed:!!input.resumed,previousGame:input.previousGame??null,previousDifficulty:input.previousDifficulty??null},input.reasoningView)
      }catch(error){reset();return {recorded:false,reason:'diagnostic-rejected',error:String(error?.message||error)}}
    }
    function record(type,payload={},input={}){return append(type,payload,input?.reasoningView||null)}
    function recordError(kind,errorLike={},input={}){
      if(!enabled)return {recorded:false,reason:'disabled'};
      try{
        const k=kind==='unhandledrejection'?'unhandledrejection':'error',id=`e${++errorSeq}`,at=Math.max(0,(Number(nowMs())||0)-startedAt),base={id,atMs:at,kind:k};
        if(errorLike&&typeof errorLike==='object'){
          const err=errorLike.error&&typeof errorLike.error==='object'?errorLike.error:errorLike;
          base.name=err.name||errorLike.name||'Error';base.message=err.message||errorLike.message||String(errorLike.reason?.message||errorLike.reason||'');base.stack=err.stack||null;base.source=errorLike.filename||errorLike.source||null;base.line=errorLike.lineno??errorLike.line??null;base.column=errorLike.colno??errorLike.column??null
        }else{base.name='Error';base.message=String(errorLike)}
        const projected=projectError(base);errors.push(projected);if(errors.length>maxErrors)errors.shift();append('runtime.error',{errorId:id,kind:k},input?.reasoningView||null);return {recorded:true,id}
      }catch(error){return {recorded:false,reason:'diagnostic-rejected',error:String(error?.message||error)}}
    }
    function attachGlobalErrors(scope,inputProvider=()=>({})){
      if(!scope||typeof scope.addEventListener!=='function')return ()=>{};
      const onError=e=>{try{recordError('error',e,inputProvider()||{})}catch(_){}};
      const onRejection=e=>{try{recordError('unhandledrejection',e,inputProvider()||{})}catch(_){}};
      scope.addEventListener('error',onError);scope.addEventListener('unhandledrejection',onRejection);
      return ()=>{try{scope.removeEventListener('error',onError);scope.removeEventListener('unhandledrejection',onRejection)}catch(_){}}
    }
    function recordUiSnapshot(snapshot,reason='diagnostic'){
      if(!enabled)return {recorded:false,reason:'disabled'};if(!session)return {recorded:false,reason:'inactive'};
      try{if(!UiStructural||typeof UiStructural.validate!=='function')fail('structural snapshot validator unavailable');UiStructural.validate(snapshot);assertJsonSafe(snapshot,'uiSnapshot');const entry={seq:uiSnapshots.length+1,atMs:Math.max(0,(Number(nowMs())||0)-startedAt),eventSeq:events.length||null,reason:nonEmpty(String(reason||'diagnostic'),'uiSnapshot.reason'),snapshot:clonePublic(snapshot,'uiSnapshot')};uiSnapshots.push(entry);if(uiSnapshots.length>uiCapacity){uiSnapshots.shift();droppedUiSnapshots++;uiSnapshots.forEach((x,i)=>x.seq=i+1)}return {recorded:true,seq:entry.seq,eventSeq:entry.eventSeq}}catch(error){return {recorded:false,reason:'diagnostic-rejected',error:String(error?.message||error)}}
    }
    function setAttachment(attachment){
      if(!enabled)return {recorded:false,reason:'disabled'};if(!session)return {recorded:false,reason:'inactive'};
      try{if(!Attachments||typeof Attachments.validateAttachment!=='function')fail('attachment validator unavailable');Attachments.validateAttachment(attachment);attachments=[clonePublic(attachment,'attachment')];return {recorded:true,id:attachments[0].id,bytes:attachments[0].bytes}}catch(error){return {recorded:false,reason:'diagnostic-rejected',error:String(error?.message||error)}}
    }
    function clearAttachments(){attachments=[];return true}
    function buildQbug(){
      if(!session)fail('recorder has no active diagnostic session');
      const out={format:FORMAT,schemaVersion:SCHEMA_VERSION,createdAt:String(nowIso()),app:clonePublic(session.app),environment:clonePublic(session.environment),game:clonePublic(session.game),initialVisibleState:clonePublic(initialVisibleState),events:events.map((e,i)=>({seq:i+1,atMs:e.atMs,type:e.type,payload:clonePublic(e.payload),stateDigest:e.stateDigest})),errors:errors.map(e=>clonePublic(e)),uiSnapshots:uiSnapshots.map(e=>clonePublic(e)),...(attachments.length?{attachments:attachments.map(e=>clonePublic(e))}:{}),finalVisibleStateDigest:visibleDigest(lastVisibleState),buffer:{capacity,droppedEvents,uiCapacity,droppedUiSnapshots}};
      validateQbug(out);return out
    }
    function toJson(space=0){return JSON.stringify(buildQbug(),null,space)}
    function setEnabled(value){enabled=!!value;return enabled}
    function stats(){return Object.freeze({enabled,capacity,eventCount:events.length,errorCount:errors.length,uiCapacity,uiSnapshotCount:uiSnapshots.length,droppedEvents,droppedUiSnapshots,active:!!session})}
    reset();return Object.freeze({start,record,recordError,recordUiSnapshot,setAttachment,clearAttachments,attachGlobalErrors,buildQbug,toJson,reset,setEnabled,stats})
  }

  return Object.freeze({VERSION,FORMAT,SCHEMA_VERSION,QVIS_PREFIX,HIDDEN_KEYS,EVENT_TYPES,EVENT_PAYLOAD_FIELDS,ACTION_FIELDS,redactSensitiveText,projectReasoningView,projectAction,projectPayload,projectError,visibleDigest,createRecorder,validateQbug})
});
