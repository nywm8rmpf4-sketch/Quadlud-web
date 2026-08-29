/*
 * QUADLUD — internal Web UI adapter collection
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludGameUiAdapters=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=3;
  const REQUIRED_METHODS=Object.freeze(['render','draw','reset']);
  const ENTITY_METHODS=Object.freeze(['resolveEntity','focusEntities']);

  function normalizeId(id){
    if(typeof id!=='string'||!id.trim())throw new TypeError('QUADLUD Web UI adapter id must be a non-empty string');
    return id.trim()
  }
  function validateAdapter(id,adapter){
    if(!adapter||(typeof adapter!=='object'&&typeof adapter!=='function'))throw new TypeError(`QUADLUD Web UI adapter unavailable: ${id}`);
    for(const method of REQUIRED_METHODS)if(typeof adapter[method]!=='function')throw new TypeError(`QUADLUD Web UI adapter "${id}" must expose ${method}()`);
    for(const method of ENTITY_METHODS)if(Object.prototype.hasOwnProperty.call(adapter,method)&&typeof adapter[method]!=='function')throw new TypeError(`QUADLUD Web UI adapter "${id}" optional ${method} must be a function`);
    return adapter
  }
  function createCollection(ids,resolver){
    if(!Array.isArray(ids))throw new TypeError('QUADLUD Web UI adapter ids must be an array');
    if(typeof resolver!=='function')throw new TypeError('QUADLUD Web UI adapter resolver must be a function');
    const normalized=[],known=new Set();
    for(const raw of ids){
      const id=normalizeId(raw);
      if(known.has(id))throw new TypeError(`Duplicate QUADLUD Web UI adapter id: ${id}`);
      known.add(id);normalized.push(id)
    }
    const frozenIds=Object.freeze(normalized.slice()),cache=new Map();
    function has(id){return known.has(String(id||''))}
    function requireAdapter(id){
      const key=String(id||'');
      if(!known.has(key))throw new Error(`Unknown QUADLUD Web UI adapter: ${id}`);
      if(cache.has(key))return cache.get(key);
      const adapter=validateAdapter(key,resolver(key));
      cache.set(key,adapter);return adapter
    }
    function resolveEntity(id,entity){const adapter=requireAdapter(id);if(typeof adapter.resolveEntity!=='function')throw new Error(`QUADLUD Web UI adapter "${id}" does not support EntityRef resolution`);return adapter.resolveEntity(entity)}
    function focusEntities(id,focus){const adapter=requireAdapter(id);if(typeof adapter.focusEntities!=='function')throw new Error(`QUADLUD Web UI adapter "${id}" does not support EntityRef focus`);return adapter.focusEntities(focus)}
    return Object.freeze({ids:frozenIds,has,require:requireAdapter,resolveEntity,focusEntities})
  }

  return Object.freeze({VERSION,REQUIRED_METHODS,ENTITY_METHODS,createCollection})
});
