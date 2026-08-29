/*
 * QUADLUD — executable game integration contract
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludGameContract=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=8;
  const ID_PATTERN=/^[a-z][a-z0-9-]*$/;
  const METADATA_FIELDS=Object.freeze({
    labelKey:Object.freeze({required:true,type:'string'}),
    descriptionKey:Object.freeze({required:false,type:'string'}),
    challengeCode:Object.freeze({required:false,type:'string',pattern:/^[A-Z]$/}),
    icon:Object.freeze({required:false,type:'string'}),
    victoryClass:Object.freeze({required:false,type:'string'})
  });
  const CAPABILITY_FIELDS=Object.freeze({
    logic:Object.freeze({required:true,type:'object',methods:Object.freeze(['createSession'])}),
    difficulty:Object.freeze({required:true,type:'object',methods:Object.freeze(['ratePuzzle'])}),
    generatePuzzle:Object.freeze({required:true,type:'function'}),
    canonicalizePublicPuzzle:Object.freeze({required:false,type:'function'}),
    publicPuzzleFromCandidate:Object.freeze({required:false,type:'function'}),
    generationIdentity:Object.freeze({required:false,type:'function'}),
    challengeGeneratorVersion:Object.freeze({required:false,type:'function'}),
    publicPuzzleFromSession:Object.freeze({required:false,type:'function'}),
    sessionLifecycle:Object.freeze({required:false,type:'object',methods:Object.freeze(['createGeneratedSession','snapshot','applySnapshot','hasProgress','resetState','historyChanges','normalizeHistoryAction','validateVictory']),optionalMethods:Object.freeze(['reasoningView','applyLogicalMove'])}),
    uiLifecycle:Object.freeze({required:false,type:'object',methods:Object.freeze(['createAdapter'])}),
    pedagogyLifecycle:Object.freeze({required:false,type:'object',methods:Object.freeze(['createAdapter'])}),
    reasoningLifecycle:Object.freeze({required:false,type:'object',methods:Object.freeze(['createPresenter'])}),
    i18n:Object.freeze({required:false,type:'object',methods:Object.freeze([])})
  });
  const REQUIRED_CAPABILITIES=Object.freeze(Object.keys(CAPABILITY_FIELDS).filter(name=>CAPABILITY_FIELDS[name].required));
  const OPTIONAL_CAPABILITIES=Object.freeze(Object.keys(CAPABILITY_FIELDS).filter(name=>!CAPABILITY_FIELDS[name].required));

  function isPlainObject(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const proto=Object.getPrototypeOf(value);
    return proto===Object.prototype||proto===null;
  }
  function fail(message){throw new TypeError(`Invalid QUADLUD game definition: ${message}`)}
  function assertKnownFields(source,schema,scope){
    for(const key of Object.keys(source))if(!Object.prototype.hasOwnProperty.call(schema,key))fail(`unknown ${scope} field "${key}"`);
  }
  function assertString(value,path){if(typeof value!=='string'||!value.trim())fail(`${path} must be a non-empty string`)}
  function assertCapability(name,value,spec){
    if(spec.type==='function'){
      if(typeof value!=='function')fail(`capability "${name}" must be a function`);
      return;
    }
    if(spec.type==='object'){
      if(!value||typeof value!=='object'&&typeof value!=='function')fail(`capability "${name}" must be an object`);
      for(const method of spec.methods||[])if(typeof value[method]!=='function')fail(`capability "${name}" must expose ${method}()`);
      for(const method of spec.optionalMethods||[])if(Object.prototype.hasOwnProperty.call(value,method)&&typeof value[method]!=='function')fail(`capability "${name}" optional method ${method} must be a function`);
      return;
    }
    fail(`unsupported capability contract for "${name}"`);
  }
  function normalizeMetadata(metadata){
    if(!isPlainObject(metadata))fail('metadata must be a plain object');
    assertKnownFields(metadata,METADATA_FIELDS,'metadata');
    const out={};
    for(const [name,spec] of Object.entries(METADATA_FIELDS)){
      const present=Object.prototype.hasOwnProperty.call(metadata,name);
      if(spec.required&&!present)fail(`metadata.${name} is required`);
      if(!present)continue;
      if(spec.type==='string'){
        assertString(metadata[name],`metadata.${name}`);
        const value=metadata[name].trim();
        if(spec.pattern&&!spec.pattern.test(value))fail(`metadata.${name} has an invalid format`);
        out[name]=value;continue
      }
      out[name]=metadata[name];
    }
    return Object.freeze(out);
  }
  function validateCapability(name,value){
    if(!Object.prototype.hasOwnProperty.call(CAPABILITY_FIELDS,name))throw new Error(`Unknown QUADLUD game capability: ${name}`);
    assertCapability(name,value,CAPABILITY_FIELDS[name]);
    return value;
  }
  function normalizeCapabilities(capabilities){
    if(!isPlainObject(capabilities))fail('capabilities must be a plain object');
    assertKnownFields(capabilities,CAPABILITY_FIELDS,'capability');
    const out={};
    for(const [name,spec] of Object.entries(CAPABILITY_FIELDS)){
      const present=Object.prototype.hasOwnProperty.call(capabilities,name);
      if(spec.required&&!present)fail(`capability "${name}" is required`);
      if(!present)continue;
      assertCapability(name,capabilities[name],spec);
      out[name]=capabilities[name];
    }
    return Object.freeze(out);
  }
  function defineGameDefinition(source){
    if(!isPlainObject(source))fail('definition must be a plain object');
    const allowed=new Set(['id','metadata','capabilities']);
    for(const key of Object.keys(source))if(!allowed.has(key))fail(`unknown definition field "${key}"`);
    if(typeof source.id!=='string'||!ID_PATTERN.test(source.id))fail('id must match /^[a-z][a-z0-9-]*$/');
    const normalized={
      id:source.id,
      metadata:normalizeMetadata(source.metadata),
      capabilities:normalizeCapabilities(source.capabilities)
    };
    return Object.freeze(normalized);
  }
  function defineGameDefinitions(sources){
    if(!Array.isArray(sources))fail('definitions collection must be an array');
    const ids=new Set(),out=[];
    for(const source of sources){
      const definition=defineGameDefinition(source);
      if(ids.has(definition.id))fail(`duplicate id "${definition.id}"`);
      ids.add(definition.id);out.push(definition);
    }
    return Object.freeze(out);
  }
  function capabilityAvailable(definition,name){
    if(!Object.prototype.hasOwnProperty.call(CAPABILITY_FIELDS,name))throw new Error(`Unknown QUADLUD game capability: ${name}`);
    const normalized=defineGameDefinition(definition);
    return Object.prototype.hasOwnProperty.call(normalized.capabilities,name);
  }
  function requireCapability(definition,name){
    if(!Object.prototype.hasOwnProperty.call(CAPABILITY_FIELDS,name))throw new Error(`Unknown QUADLUD game capability: ${name}`);
    const normalized=defineGameDefinition(definition);
    if(!Object.prototype.hasOwnProperty.call(normalized.capabilities,name))throw new Error(`QUADLUD game "${normalized.id}" does not provide capability "${name}"`);
    return normalized.capabilities[name];
  }

  return Object.freeze({
    VERSION,ID_PATTERN,METADATA_FIELDS,CAPABILITY_FIELDS,REQUIRED_CAPABILITIES,OPTIONAL_CAPABILITIES,
    defineGameDefinition,defineGameDefinitions,validateCapability,capabilityAvailable,requireCapability
  });
});
