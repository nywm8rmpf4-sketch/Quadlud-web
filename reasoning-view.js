/*
 * QUADLUD — reasoning-visible session view boundary
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludReasoningView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const SCHEMA=1;
  const HIDDEN_KEYS=Object.freeze(new Set(['sol','solution','hiddenSolution','solutionGrid','answerGrid','hiddenState','validationState']));

  function fail(message){throw new TypeError(`Invalid QUADLUD reasoning view: ${message}`)}
  function isPlainObject(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null}
  function assertSafe(value,path='value',seen=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){if(!Number.isFinite(value))fail(`${path} must contain only finite numbers`);return}
    if(typeof value==='undefined'||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')fail(`${path} must be JSON-serializable`);
    if(typeof value!=='object')fail(`${path} must be JSON-serializable`);
    if(seen.has(value))fail(`${path} must not contain cycles`);seen.add(value);
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)assertSafe(value[i],`${path}[${i}]`,seen)}
    else{
      if(!isPlainObject(value))fail(`${path} must contain only plain objects and arrays`);
      for(const [key,item] of Object.entries(value)){
        if(HIDDEN_KEYS.has(key))fail(`${path}.${key} is not reasoning-visible`);
        assertSafe(item,`${path}.${key}`,seen)
      }
    }
    seen.delete(value)
  }
  function clone(value){assertSafe(value);return JSON.parse(JSON.stringify(value))}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value}
  function nonEmpty(value,path){if(typeof value!=='string'||!value.trim())fail(`${path} must be a non-empty string`);return value.trim()}
  function defineReasoningView(source){
    if(!isPlainObject(source))fail('input must be a plain object');
    const allowed=new Set(['game','publicPuzzle','visibleState','metadata']);for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown field "${key}"`);
    if(!isPlainObject(source.publicPuzzle))fail('publicPuzzle must be a plain object');
    if(!isPlainObject(source.visibleState))fail('visibleState must be a plain object');
    const metadata=source.metadata==null?{}:source.metadata;if(!isPlainObject(metadata))fail('metadata must be a plain object');
    const out={schema:SCHEMA,game:nonEmpty(source.game,'game'),publicPuzzle:clone(source.publicPuzzle),visibleState:clone(source.visibleState),metadata:clone(metadata)};
    if(out.publicPuzzle.game&&out.publicPuzzle.game!==out.game)fail('publicPuzzle.game must match game');
    if(out.visibleState.game&&out.visibleState.game!==out.game)fail('visibleState.game must match game');
    return deepFreeze(out)
  }
  function createResolver(options){
    if(!isPlainObject(options))fail('resolver options must be a plain object');
    const resolveSessionLifecycle=options.resolveSessionLifecycle,resolvePublicPuzzleFromSession=options.resolvePublicPuzzleFromSession;
    if(typeof resolveSessionLifecycle!=='function')fail('resolveSessionLifecycle must be a function');
    if(typeof resolvePublicPuzzleFromSession!=='function')fail('resolvePublicPuzzleFromSession must be a function');
    function reasoningView(session){
      if(!session?.game)fail('session requires a game id');
      const lifecycle=resolveSessionLifecycle(session.game);if(!lifecycle||typeof lifecycle.snapshot!=='function')fail(`sessionLifecycle for ${session.game} must expose snapshot()`);
      if(typeof lifecycle.reasoningView==='function')return defineReasoningView(lifecycle.reasoningView(session));
      const visibleState=lifecycle.snapshot(session),root=session?.moveHistory?.nodes?.h0?.snapshot||visibleState;
      const provider=resolvePublicPuzzleFromSession(session.game);if(typeof provider!=='function')fail(`publicPuzzleFromSession for ${session.game} must be a function`);
      return defineReasoningView({game:session.game,publicPuzzle:provider(session,root),visibleState,metadata:{source:'session-lifecycle-fallback'}})
    }
    return reasoningView
  }

  return Object.freeze({VERSION,SCHEMA,HIDDEN_KEYS,defineReasoningView,createResolver})
});
