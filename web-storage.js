/*
 * QUADLUD — Web storage adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludWebStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  function assertBackend(storage){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function')throw new Error('QUADLUD storage backend unavailable');
    return storage
  }

  function createStorageAdapter(storage){
    const backend=assertBackend(storage);
    return Object.freeze({
      readText(key){return backend.getItem(String(key))},
      writeText(key,value){backend.setItem(String(key),String(value))},
      remove(key){backend.removeItem(String(key))}
    })
  }

  function localStorageBackend(){
    if(!root)throw new Error('QUADLUD Web storage scope unavailable');
    // This is the only product access to the Web localStorage platform API.
    return assertBackend(root.localStorage)
  }

  let defaultLocalStorageAdapter=null;
  function getLocalStorageAdapter(){
    if(defaultLocalStorageAdapter)return defaultLocalStorageAdapter;
    // Resolve the platform backend lazily on each operation so an unavailable
    // localStorage preserves the historical fail-soft behavior of callers.
    defaultLocalStorageAdapter=Object.freeze({
      readText(key){return localStorageBackend().getItem(String(key))},
      writeText(key,value){localStorageBackend().setItem(String(key),String(value))},
      remove(key){localStorageBackend().removeItem(String(key))}
    });
    return defaultLocalStorageAdapter
  }

  return Object.freeze({createStorageAdapter,getLocalStorageAdapter})
});
