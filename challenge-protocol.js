/*
 * QUADLUD — reproducible Challenge protocol/model
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludChallengeProtocol=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const SCHEMA=2;
  const GENERATOR=1;
  const NAMESPACE='quadlud-challenge-v2.23';
  const VERSION_LABEL='v2.23';
  const ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DIFF_TO_CODE=Object.freeze({easy:'E',medium:'M',hard:'H',expert:'X'});
  const CODE_TO_DIFF=Object.freeze({E:'easy',M:'medium',H:'hard',X:'expert'});

  function fn(value,name){if(typeof value!=='function')throw new TypeError(`QUADLUD Challenge protocol requires ${name}()`);return value}
  function create(options={}){
    const gameIds=Array.isArray(options.gameIds)?[...options.gameIds]:[];
    const registry=options.gameRegistry;
    const generation=options.generation;
    const random=fn(options.random||(()=>Math.random()),'random');
    const cryptoProvider=options.cryptoProvider||null;
    if(!registry||typeof registry.getMetadata!=='function'||typeof registry.hasCapability!=='function'||typeof registry.requireCapability!=='function')throw new Error('QUADLUD Challenge protocol GameRegistry unavailable');
    if(!generation||typeof generation.hash32!=='function'||typeof generation.withSeed!=='function'||typeof generation.generateRegisteredCandidate!=='function'||typeof generation.generatedPublicPuzzleFromCandidate!=='function'||typeof generation.generatedCandidateFingerprint!=='function'||typeof generation.generatedCandidateProfile!=='function'||typeof generation.generatedCandidateCertified!=='function')throw new Error('QUADLUD Challenge protocol generation helpers unavailable');

    const gameToCode=Object.freeze(Object.fromEntries(gameIds.map(game=>[game,registry.getMetadata(game)?.challengeCode]).filter(([,code])=>typeof code==='string'&&/^[A-Z]$/.test(code))));
    const codeToGame=Object.freeze(Object.fromEntries(Object.entries(gameToCode).map(([game,code])=>[code,game])));

    function expectedGenerator(game,diff){
      if(!gameToCode[game]||!DIFF_TO_CODE[diff])return null;
      if(!registry.hasCapability(game,'challengeGeneratorVersion'))return GENERATOR;
      const version=Number(registry.requireCapability(game,'challengeGeneratorVersion')(diff));
      return Number.isInteger(version)&&version>=1&&version<=9?version:null
    }
    function normalizeCode(raw=''){return String(raw).toUpperCase().replace(/[^A-Z0-9]/g,'')}
    function checksum(payload){const h=generation.hash32(`quadlud-challenge-check:${payload}`),a=ALPHABET;return a[Math.floor(h/a.length)%a.length]+a[h%a.length]}
    function randomSeed(len=8){
      const a=ALPHABET;let out='',bytes=null;
      try{if(cryptoProvider?.getRandomValues){bytes=new Uint32Array(len);cryptoProvider.getRandomValues(bytes)}}catch(_){}
      for(let i=0;i<len;i++){const n=bytes?bytes[i]:Math.floor(random()*0x100000000);out+=a[n%a.length]}
      return out
    }
    function make(game,diff,seed=randomSeed(),generator=null){
      const expected=expectedGenerator(game,diff);if(expected==null)return null;
      generator=generator==null?expected:Number(generator);if(generator!==expected)return null;
      seed=normalizeCode(seed).slice(0,8);if(seed.length!==8||[...seed].some(c=>!ALPHABET.includes(c)))return null;
      const payload=`QL${SCHEMA}${generator}${gameToCode[game]}${DIFF_TO_CODE[diff]}${seed}`,check=checksum(payload);
      return {schema:SCHEMA,generator,game,diff,seed,code:`QL${SCHEMA}${generator}-${gameToCode[game]}${DIFF_TO_CODE[diff]}-${seed}-${check}`}
    }
    function parse(raw){
      const n=normalizeCode(raw);
      if(n.length!==16||n.slice(0,2)!=='QL')return null;
      const schema=Number(n[2]),generator=Number(n[3]),game=codeToGame[n[4]],diff=CODE_TO_DIFF[n[5]],seed=n.slice(6,14),check=n.slice(14);
      if(schema!==SCHEMA||!game||!diff||generator!==expectedGenerator(game,diff))return null;
      if([...seed].some(c=>!ALPHABET.includes(c)))return null;
      const payload=n.slice(0,14);if(checksum(payload)!==check)return null;
      return make(game,diff,seed,generator)
    }
    function seedString(ch){return `${NAMESPACE}:s${ch.schema}:g${ch.generator}:${ch.game}:${ch.diff}:${ch.seed}`}
    function publicPuzzleFromCandidate(ch,g){return generation.generatedPublicPuzzleFromCandidate(ch?.game,g)}
    function fingerprintFromCandidate(ch,g){return generation.generatedCandidateFingerprint(ch?.game,g)}
    function candidateProfile(g){return generation.generatedCandidateProfile(g)}
    function candidateCertified(ch,g){return !!ch&&generation.generatedCandidateCertified(ch.game,ch.diff,g)}
    function buildCandidate(ch){
      if(!ch||ch.schema!==SCHEMA||ch.generator!==expectedGenerator(ch.game,ch.diff)||!gameToCode[ch.game]||!DIFF_TO_CODE[ch.diff])return null;
      return generation.withSeed(seedString(ch),()=>{
        const g=generation.generateRegisteredCandidate(ch.game,ch.diff,{protocolGeneration:ch.generator,context:'challenge'});
        if(!candidateCertified(ch,g))throw new Error('Challenge candidate is not certified at the requested difficulty');
        return g
      })
    }
    function publicFingerprint(ch){return fingerprintFromCandidate(ch,buildCandidate(ch))}

    return Object.freeze({version:VERSION,schema:SCHEMA,generator:GENERATOR,namespace:NAMESPACE,versionLabel:VERSION_LABEL,alphabet:ALPHABET,gameToCode,codeToGame,diffToCode:DIFF_TO_CODE,codeToDiff:CODE_TO_DIFF,expectedGenerator,normalizeCode,checksum,randomSeed,make,parse,seedString,publicPuzzleFromCandidate,fingerprintFromCandidate,candidateProfile,candidateCertified,buildCandidate,publicFingerprint})
  }

  return Object.freeze({VERSION,SCHEMA,GENERATOR,NAMESPACE,VERSION_LABEL,ALPHABET,DIFF_TO_CODE,CODE_TO_DIFF,create})
});
