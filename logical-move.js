/*
 * QUADLUD — generic EntityRef / LogicalMove / LogicalTransaction contract
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludLogicalMove=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const MOVE_SCHEMA=1;
  const TRANSACTION_SCHEMA=1;
  const TRANSACTION_KIND='logical-transaction';
  const STANDARD_FOCUS_ROLES=Object.freeze(['premise','context','target','contradiction']);
  const HIDDEN_KEYS=Object.freeze(new Set(['sol','solution','hiddenSolution','solutionGrid','answerGrid','hiddenState','validationState']));

  function fail(message){throw new TypeError(`Invalid QUADLUD logical move: ${message}`)}
  function isPlainObject(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null
  }
  function nonEmpty(value,path){if(typeof value!=='string'||!value.trim())fail(`${path} must be a non-empty string`);return value.trim()}
  function assertSafeJson(value,path='value',seen=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'){if(!Number.isFinite(value))fail(`${path} must contain only finite numbers`);return}
    if(typeof value==='undefined'||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')fail(`${path} must be JSON-serializable`);
    if(typeof value!=='object')fail(`${path} must be JSON-serializable`);
    if(seen.has(value))fail(`${path} must not contain cycles`);seen.add(value);
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)assertSafeJson(value[i],`${path}[${i}]`,seen)}
    else{
      if(!isPlainObject(value))fail(`${path} must contain only plain objects and arrays`);
      for(const [key,item] of Object.entries(value)){
        if(HIDDEN_KEYS.has(key))fail(`${path}.${key} is forbidden in reasoning-visible logical data`);
        assertSafeJson(item,`${path}.${key}`,seen)
      }
    }
    seen.delete(value)
  }
  function clone(value){assertSafeJson(value);return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value}
  function frozenClone(value){return deepFreeze(clone(value))}

  function defineEntityRef(source){
    if(!isPlainObject(source))fail('EntityRef must be a plain object');
    const keys=Object.keys(source);if(keys.some(key=>key!=='kind'&&key!=='id'))fail('EntityRef may contain only kind and id');
    const ref={kind:nonEmpty(source.kind,'EntityRef.kind'),id:nonEmpty(source.id,'EntityRef.id')};
    return Object.freeze(ref)
  }
  function isEntityRef(value){try{defineEntityRef(value);return true}catch(_){return false}}
  function defineFocusItem(source){
    if(!isPlainObject(source))fail('focus item must be a plain object');
    const keys=Object.keys(source);if(keys.some(key=>key!=='entity'&&key!=='role'))fail('focus item may contain only entity and role');
    return Object.freeze({entity:defineEntityRef(source.entity),role:nonEmpty(source.role,'focus.role')})
  }
  function defineFocus(source){if(!Array.isArray(source))fail('focus must be an array');return deepFreeze(source.map(defineFocusItem))}
  function defineTargets(source){if(!Array.isArray(source))fail('targets must be an array');return deepFreeze(source.map(defineEntityRef))}
  function defineEffect(source,index){
    if(!isPlainObject(source))fail(`effects[${index}] must be a plain object`);
    assertSafeJson(source,`effects[${index}]`);
    const out=clone(source);
    if(Object.prototype.hasOwnProperty.call(out,'target'))out.target=defineEntityRef(out.target);
    if(Object.prototype.hasOwnProperty.call(out,'targets'))out.targets=defineTargets(out.targets);
    return deepFreeze(out)
  }
  function defineLogicalMove(source){
    if(!isPlainObject(source))fail('LogicalMove must be a plain object');
    const allowed=new Set(['schema','techniqueId','rank','targets','effects','focus','evidence']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown LogicalMove field "${key}"`);
    if(Object.prototype.hasOwnProperty.call(source,'schema')&&source.schema!==MOVE_SCHEMA)fail(`schema must equal ${MOVE_SCHEMA}`);
    const rank=source.rank==null?0:Number(source.rank);if(!Number.isFinite(rank)||rank<0)fail('rank must be a finite non-negative number');
    const techniqueId=source.techniqueId==null?null:nonEmpty(source.techniqueId,'techniqueId');
    const targets=defineTargets(source.targets==null?[]:source.targets);
    const effects=source.effects==null?[]:source.effects;if(!Array.isArray(effects))fail('effects must be an array');
    const focus=defineFocus(source.focus==null?[]:source.focus);
    const evidence=source.evidence==null?{}:source.evidence;if(!isPlainObject(evidence))fail('evidence must be a plain object');assertSafeJson(evidence,'evidence');
    return deepFreeze({schema:MOVE_SCHEMA,techniqueId,rank,targets,effects:effects.map(defineEffect),focus,evidence:frozenClone(evidence)})
  }
  function isLogicalMove(value){try{return defineLogicalMove(value).schema===MOVE_SCHEMA}catch(_){return false}}
  function defineLogicalTransaction(source){
    if(!isPlainObject(source))fail('LogicalTransaction must be a plain object');
    const allowed=new Set(['game','move']);for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown LogicalTransaction field "${key}"`);
    return deepFreeze({schema:TRANSACTION_SCHEMA,kind:TRANSACTION_KIND,game:nonEmpty(source.game,'transaction.game'),move:defineLogicalMove(source.move)})
  }

  function createTransactionController(options){
    if(!isPlainObject(options))fail('transaction controller options must be a plain object');
    const history=options.history,resolveLifecycle=options.resolveLifecycle;
    for(const method of ['puzzleSnapshot','applyPuzzleSnapshot','ensureHistory','recordHistory'])if(typeof history?.[method]!=='function')fail(`history must expose ${method}()`);
    if(typeof resolveLifecycle!=='function')fail('resolveLifecycle must be a function');
    function apply(current,moveSource,applyOptions={}){
      if(!current?.game)fail('transaction session requires a game id');
      const lifecycle=resolveLifecycle(current.game);
      if(!lifecycle||typeof lifecycle.applyLogicalMove!=='function')fail(`sessionLifecycle for ${current.game} must expose applyLogicalMove()`);
      const transaction=defineLogicalTransaction({game:current.game,move:moveSource});
      const now=typeof applyOptions.now==='function'?applyOptions.now:Date.now;
      history.ensureHistory(current,false,now);
      const before=history.puzzleSnapshot(current),beforeKey=JSON.stringify(before),historyBefore=clone(current.moveHistory);
      try{
        const result=lifecycle.applyLogicalMove(current,transaction.move);
        const after=history.puzzleSnapshot(current);
        if(JSON.stringify(after)===beforeKey)throw new Error('LogicalTransaction produced no visible state change');
        const recorded=history.recordHistory(current,{type:'LOGICAL_TRANSACTION',transaction},beforeKey,now);
        if(!recorded?.changed)throw new Error('LogicalTransaction did not create one history entry');
        return Object.freeze({transaction,recorded,result})
      }catch(error){
        try{history.applyPuzzleSnapshot(current,before)}catch(_){/* keep original error */}
        current.moveHistory=historyBefore;
        throw error
      }
    }
    return Object.freeze({apply})
  }

  return Object.freeze({
    VERSION,MOVE_SCHEMA,TRANSACTION_SCHEMA,TRANSACTION_KIND,STANDARD_FOCUS_ROLES,HIDDEN_KEYS,
    defineEntityRef,isEntityRef,defineFocusItem,defineFocus,defineLogicalMove,isLogicalMove,defineLogicalTransaction,createTransactionController
  })
});
