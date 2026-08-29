/*
 * QUADLUD — portable data serialization
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludDataSerialization=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const EXPORT_FORMAT='quadlud-user-data';
  const EXPORT_SCHEMA=1;
  const EXPORT_SECTION_SCHEMAS=Object.freeze({save:1,stats:1,daily:1,preferences:1});

  function isRecord(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof Set)}

  function toPortable(value){
    if(value instanceof Set)return [...value].map(toPortable);
    if(Array.isArray(value))return value.map(toPortable);
    if(value&&typeof value==='object'){
      const out={};
      for(const key of Object.keys(value)){
        const item=value[key];
        if(typeof item==='undefined'||typeof item==='function'||typeof item==='symbol')continue;
        out[key]=toPortable(item)
      }
      return out
    }
    return value
  }

  function clonePortable(value){return toPortable(value)}

  function serializeCurrentState(current){return current==null?null:toPortable(current)}

  function deserializeCurrentState(serialized){
    if(serialized==null)return null;
    const current=toPortable(serialized);
    for(const key of ['givens','empty'])if(Array.isArray(current[key]))current[key]=new Set(current[key]);
    return current
  }

  function normalizePreferences(raw,{defaultLang='en',supportedLangs=[]}={}){
    const p=isRecord(raw)?raw:{};
    return {
      theme:['auto','light','dark'].includes(p.theme)?p.theme:'auto',
      sound:p.sound!==false,
      queenAutoCross:p.queenAutoCross===true,
      lang:supportedLangs.includes(p.lang)?p.lang:defaultLang,
      coachMode:['minimal','normal','pedagogical'].includes(p.coachMode)?p.coachMode:'normal',
      notifyIllegal:p.notifyIllegal!==false,
      notifyUnjustified:p.notifyUnjustified!==false
    }
  }

  function serializePreferences(preferences){return toPortable(preferences||{})}

  function normalizeStats(raw,blank,{schema,baseline,historyLimit=200,validGames=[],validDifficulties=[]}={}){
    const s=toPortable(blank||{});
    if(!isRecord(raw)||raw.schema!==schema||raw.baseline!==baseline)return s;
    s.started=Math.max(0,Number(raw.started)||0);
    s.solved=Math.max(0,Number(raw.solved)||0);
    s.revealed=Math.max(0,Number(raw.revealed)||0);
    s.totalSolvedSeconds=Math.max(0,Number(raw.totalSolvedSeconds)||0);
    s.byGame=isRecord(raw.byGame)?toPortable(raw.byGame):{};
    s.history=Array.isArray(raw.history)?raw.history.filter(x=>x&&validGames.includes(x.game)&&validDifficulties.includes(x.diff)).slice(0,historyLimit).map(toPortable):[];
    if(isRecord(raw.mastery))s.mastery={schema:1,byTechnique:isRecord(raw.mastery.byTechnique)?toPortable(raw.mastery.byTechnique):{},updatedAt:raw.mastery.updatedAt||null};
    if(isRecord(raw.training))s.training={schema:1,byTechnique:isRecord(raw.training.byTechnique)?toPortable(raw.training.byTechnique):{}};
    if(isRecord(raw.learning))s.learning={schema:1,byTechnique:isRecord(raw.learning.byTechnique)?toPortable(raw.learning.byTechnique):{}};
    return s
  }

  function serializeStats(stats){return toPortable(stats||{})}

  function normalizeDailyState(raw){return isRecord(raw)?toPortable(raw):{}}
  function serializeDailyState(daily){return toPortable(daily||{})}

  function createSaveEnvelope({schema,baseline,version,contract,puzzleFingerprint,current,elapsed,paused,savedAt}){
    return {
      schema,
      baseline,
      version,
      contract:toPortable(contract||{}),
      puzzleFingerprint:puzzleFingerprint??null,
      current:serializeCurrentState(current),
      elapsed:Number(elapsed),
      paused:!!paused,
      savedAt:Number(savedAt)
    }
  }

  function serializeSaveEnvelope(save){return save==null?null:toPortable(save)}
  function deserializeSaveEnvelope(save){return save==null?null:toPortable(save)}

  function createUserDataPackage({sourceVersion,persistenceBaseline,exportedAt,save=null,stats=null,daily=null,preferences=null}={}){
    return {
      format:EXPORT_FORMAT,
      schema:EXPORT_SCHEMA,
      source:{product:'QUADLUD',version:String(sourceVersion||''),persistenceBaseline:String(persistenceBaseline||'')},
      exportedAt:exportedAt==null?null:String(exportedAt),
      sections:{
        save:{schema:EXPORT_SECTION_SCHEMAS.save,data:serializeSaveEnvelope(save)},
        stats:{schema:EXPORT_SECTION_SCHEMAS.stats,data:stats==null?null:serializeStats(stats)},
        daily:{schema:EXPORT_SECTION_SCHEMAS.daily,data:daily==null?null:serializeDailyState(daily)},
        preferences:{schema:EXPORT_SECTION_SCHEMAS.preferences,data:preferences==null?null:serializePreferences(preferences)}
      }
    }
  }

  function unpackUserDataPackage(pkg){
    if(!isRecord(pkg)||pkg.format!==EXPORT_FORMAT||pkg.schema!==EXPORT_SCHEMA||!isRecord(pkg.source)||pkg.source.product!=='QUADLUD'||!isRecord(pkg.sections))throw new Error('Unsupported QUADLUD user data package');
    const names=Object.keys(EXPORT_SECTION_SCHEMAS),out={source:toPortable(pkg.source),exportedAt:pkg.exportedAt??null};
    for(const name of names){
      const section=pkg.sections[name];
      if(!isRecord(section)||section.schema!==EXPORT_SECTION_SCHEMAS[name])throw new Error(`Unsupported QUADLUD ${name} section`);
      out[name]=section.data==null?null:toPortable(section.data)
    }
    return out
  }

  function stringify(value){return JSON.stringify(toPortable(value))}
  function parse(text){return toPortable(JSON.parse(String(text)))}

  return Object.freeze({
    EXPORT_FORMAT,EXPORT_SCHEMA,EXPORT_SECTION_SCHEMAS,
    toPortable,clonePortable,serializeCurrentState,deserializeCurrentState,
    normalizePreferences,serializePreferences,
    normalizeStats,serializeStats,normalizeDailyState,serializeDailyState,
    createSaveEnvelope,serializeSaveEnvelope,deserializeSaveEnvelope,
    createUserDataPackage,unpackUserDataPackage,stringify,parse
  })
});
