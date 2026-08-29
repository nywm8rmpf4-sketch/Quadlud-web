/*
 * QUADLUD — persistent data services
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludPersistenceServices=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const BASELINE='v2.23';
  const KEYS=Object.freeze({
    save:'logic4-save-v2',
    stats:'logic4-stats-v2',
    daily:'logic4-daily-v2',
    preferences:'logic4-prefs-v1'
  });
  const SCHEMAS=Object.freeze({save:2,stats:5});
  const LEGACY_KEYS=Object.freeze(['logic4-save-v1','logic4-stats-v1','logic4-daily-v1']);

  function assertDependencies(storage,serialization){
    if(!storage||typeof storage.readText!=='function'||typeof storage.writeText!=='function'||typeof storage.remove!=='function')throw new Error('QUADLUD persistence storage adapter unavailable');
    if(!serialization||typeof serialization.parse!=='function'||typeof serialization.stringify!=='function')throw new Error('QUADLUD persistence serialization unavailable');
  }

  function createServices({storage,serialization}){
    assertDependencies(storage,serialization);

    function removeQuietly(key){try{storage.remove(key);return true}catch(_){return false}}
    function writeQuietly(key,value){try{storage.writeText(key,serialization.stringify(value));return true}catch(_){return false}}

    function readPreferencesRaw({throwOnError=false}={}){
      try{return serialization.parse(storage.readText(KEYS.preferences)||'{}')}
      catch(err){if(throwOnError)throw err;return {}}
    }
    const preferences=Object.freeze({
      readRaw:readPreferencesRaw,
      read(options={}){return serialization.normalizePreferences(readPreferencesRaw(),options)},
      write(value){return writeQuietly(KEYS.preferences,serialization.serializePreferences(value))},
      clear(){return removeQuietly(KEYS.preferences)}
    });

    const stats=Object.freeze({
      read(blank,options={}){
        try{return serialization.normalizeStats(serialization.parse(storage.readText(KEYS.stats)||'null'),blank,options)}
        catch(_){return serialization.normalizeStats(null,blank,options)}
      },
      write(value){return writeQuietly(KEYS.stats,serialization.serializeStats(value))},
      clear(){return removeQuietly(KEYS.stats)}
    });

    const daily=Object.freeze({
      read(){
        try{return serialization.normalizeDailyState(serialization.parse(storage.readText(KEYS.daily)||'{}'))}
        catch(_){return {}}
      },
      write(value){return writeQuietly(KEYS.daily,serialization.serializeDailyState(value))},
      clear(){return removeQuietly(KEYS.daily)}
    });

    function discardLegacy(){let ok=true;for(const key of LEGACY_KEYS)if(!removeQuietly(key))ok=false;return ok}
    const save=Object.freeze({
      discardLegacy,
      read({validate}={}){
        discardLegacy();
        try{
          const raw=storage.readText(KEYS.save);if(!raw)return null;
          const value=serialization.deserializeSaveEnvelope(serialization.parse(raw));
          if(typeof validate==='function'&&!validate(value)){removeQuietly(KEYS.save);return null}
          return value
        }catch(_){removeQuietly(KEYS.save);return null}
      },
      write(value){return writeQuietly(KEYS.save,serialization.serializeSaveEnvelope(value))},
      clear(){return removeQuietly(KEYS.save)}
    });

    return Object.freeze({baseline:BASELINE,keys:KEYS,schemas:SCHEMAS,legacyKeys:LEGACY_KEYS,preferences,stats,daily,save})
  }

  return Object.freeze({BASELINE,KEYS,SCHEMAS,LEGACY_KEYS,createServices})
});
