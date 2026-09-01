/*
 * QUADLUD — internal Web UI adapter collection
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root){root.QuadludGameUiAdapters=api;root.QuadludGridCoordinates=api.GridCoordinates}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=3;
  const REQUIRED_METHODS=Object.freeze(['render','draw','reset']);
  const ENTITY_METHODS=Object.freeze(['resolveEntity','focusEntities']);

  function gridRowLabel(index){
    let n=Number(index);
    if(!Number.isInteger(n)||n<0)throw new TypeError('QUADLUD grid row index must be a non-negative integer');
    let out='';
    do{out=String.fromCharCode(65+(n%26))+out;n=Math.floor(n/26)-1}while(n>=0);
    return out
  }
  function gridColumnLabel(index){
    const n=Number(index);
    if(!Number.isInteger(n)||n<0)throw new TypeError('QUADLUD grid column index must be a non-negative integer');
    return String(n+1)
  }
  function gridCoordinateLabel(row,column){return `${gridRowLabel(row)}${gridColumnLabel(column)}`}
  function gridSafeClass(value){return String(value||'').trim().replace(/[^A-Za-z0-9_-]+/g,' ')}
  function gridCoordinateMarkup(rows,columns,{className='grid-coordinate-wrap',boardHtml='',cornerHtml='',columnClass='',rowClass=''}={}){
    rows=Number(rows);columns=Number(columns);
    if(!Number.isInteger(rows)||rows<1||!Number.isInteger(columns)||columns<1)throw new TypeError('QUADLUD grid dimensions must be positive integers');
    const cols=Array.from({length:columns},(_,i)=>`<span>${gridColumnLabel(i)}</span>`).join('');
    const rowLabels=Array.from({length:rows},(_,i)=>`<span>${gridRowLabel(i)}</span>`).join('');
    const colClass=`grid-column-coordinates${columnClass?` ${gridSafeClass(columnClass)}`:''}`,rowsClass=`grid-row-coordinates${rowClass?` ${gridSafeClass(rowClass)}`:''}`;
    return `<div class="${gridSafeClass(className)}" style="--grid-coordinate-cols:${columns};--grid-coordinate-rows:${rows}">${cornerHtml}<div class="${colClass}" aria-hidden="true">${cols}</div><div class="${rowsClass}" aria-hidden="true">${rowLabels}</div>${boardHtml}</div>`
  }
  const GridCoordinates=Object.freeze({VERSION:1,rowLabel:gridRowLabel,columnLabel:gridColumnLabel,coordinateLabel:gridCoordinateLabel,markup:gridCoordinateMarkup});

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

  return Object.freeze({VERSION,REQUIRED_METHODS,ENTITY_METHODS,GridCoordinates,createCollection})
});
