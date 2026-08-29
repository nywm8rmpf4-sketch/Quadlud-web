/*
 * QUADLUD — generic pedagogy domain adapter collection
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludGamePedagogyAdapters=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=3;
  const DOMAIN_METHODS=Object.freeze({
    coach:Object.freeze(['genericHintFallbackAllowed','localizedHint','pieceName','lookText','contextCells','runHint','action']),
    audit:Object.freeze(['visibleErrors','errorFromAction','errorRuleTitle','errorDetailedMessage','masteryActionEligible','actionEligible','allowsNoPrimaryChange','historyActionText','neutralValue','constructiveValue','moveText','firstKnownLogicalMove','justifyMove','suppressUnjustifiedAfterComplete','historyChangeText']),
    exploration:Object.freeze(['canAcceptHypothesis','contradiction']),
    learning:Object.freeze(['masteryDirectHint','moveText','applyMove']),
    training:Object.freeze(['hintForTechnique','randomProgress','prepareBase','buildDirect','exerciseDifficulty','buildGenerated','targetStillCorrect','coachText','revealLabel','applyMove']),
    walkthrough:Object.freeze(['rootSnapshot','visibleClone','snapshot','complete','generateNext','board','contradictionText','afterRender','initialize']),
    lifecycle:Object.freeze(['afterFinish'])
  });
  const REQUIRED_DOMAIN_METHODS=Object.freeze({
    coach:Object.freeze(['runHint']),
    audit:Object.freeze(['justifyMove']),
    exploration:Object.freeze(['contradiction']),
    learning:Object.freeze(['applyMove']),
    training:Object.freeze(['hintForTechnique','applyMove']),
    walkthrough:Object.freeze(['snapshot','generateNext']),
    lifecycle:Object.freeze([])
  });
  const LEGACY_METHOD_MAP=Object.freeze({
    visibleErrors:['audit','visibleErrors'],errorFromAction:['audit','errorFromAction'],errorRuleTitle:['audit','errorRuleTitle'],errorDetailedMessage:['audit','errorDetailedMessage'],masteryActionEligible:['audit','masteryActionEligible'],auditActionEligible:['audit','actionEligible'],auditAllowsNoPrimaryChange:['audit','allowsNoPrimaryChange'],historyActionText:['audit','historyActionText'],auditNeutralValue:['audit','neutralValue'],auditConstructiveValue:['audit','constructiveValue'],auditMoveText:['audit','moveText'],firstKnownLogicalMove:['audit','firstKnownLogicalMove'],justifyMove:['audit','justifyMove'],suppressUnjustifiedAfterComplete:['audit','suppressUnjustifiedAfterComplete'],historyChangeText:['audit','historyChangeText'],
    canAcceptHypothesis:['exploration','canAcceptHypothesis'],explorationContradiction:['exploration','contradiction'],
    masteryDirectHint:['learning','masteryDirectHint'],learningMoveText:['learning','moveText'],applyLearningMove:['learning','applyMove'],
    trainingHintForTechnique:['training','hintForTechnique'],trainingRandomProgress:['training','randomProgress'],prepareTrainingBase:['training','prepareBase'],buildDirectTraining:['training','buildDirect'],trainingTargetStillCorrect:['training','targetStillCorrect'],trainingCoachText:['training','coachText'],trainingRevealLabel:['training','revealLabel'],applyTrainingMove:['training','applyMove'],
    genericHintFallbackAllowed:['coach','genericHintFallbackAllowed'],localizedHint:['coach','localizedHint'],pieceName:['coach','pieceName'],coachLookText:['coach','lookText'],coachContextCells:['coach','contextCells'],runCoachHint:['coach','runHint'],coachAction:['coach','action'],
    walkthroughRootSnapshot:['walkthrough','rootSnapshot'],walkthroughVisibleClone:['walkthrough','visibleClone'],walkthroughSnapshot:['walkthrough','snapshot'],walkthroughComplete:['walkthrough','complete'],walkthroughGenerateNext:['walkthrough','generateNext'],walkthroughBoard:['walkthrough','board'],walkthroughContradictionText:['walkthrough','contradictionText'],walkthroughAfterRender:['walkthrough','afterRender'],walkthroughInitialize:['walkthrough','initialize'],
    afterFinish:['lifecycle','afterFinish']
  });
  const LEGACY_METHODS=Object.freeze(Object.keys(LEGACY_METHOD_MAP));
  // Compatibility export for QA/tools that need to reason about the historical surface.
  const REQUIRED_METHODS=LEGACY_METHODS;

  const DEFAULTS=Object.freeze({
    coach:Object.freeze({
      genericHintFallbackAllowed:()=>true,localizedHint:()=>Object.freeze({}),pieceName:value=>String(value??''),lookText:()=>'',contextCells:()=>Object.freeze([]),action:()=>null
    }),
    audit:Object.freeze({
      visibleErrors:()=>Object.freeze([]),errorFromAction:()=>null,errorRuleTitle:()=>'',errorDetailedMessage:()=>'',masteryActionEligible:()=>true,actionEligible:()=>true,allowsNoPrimaryChange:()=>false,historyActionText:()=>'',neutralValue:()=>null,constructiveValue:value=>value!=null,moveText:()=>'',firstKnownLogicalMove:()=>null,suppressUnjustifiedAfterComplete:()=>false,historyChangeText:()=>''
    }),
    exploration:Object.freeze({canAcceptHypothesis:()=>false}),
    learning:Object.freeze({masteryDirectHint:()=>null,moveText:()=>''}),
    training:Object.freeze({randomProgress:()=>false,prepareBase:()=>false,buildDirect:()=>null,exerciseDifficulty:()=>null,buildGenerated:()=>null,targetStillCorrect:()=>false,coachText:()=>'',revealLabel:()=>''}),
    walkthrough:Object.freeze({rootSnapshot:({historyRoot,puzzleSnapshot}={})=>historyRoot||(typeof puzzleSnapshot==='function'?puzzleSnapshot():null),visibleClone:()=>null,complete:()=>false,board:()=>Object.freeze({boardClass:'',cellsHtml:''}),contradictionText:()=>'',afterRender:()=>undefined,initialize:session=>session}),
    lifecycle:Object.freeze({afterFinish:()=>undefined})
  });

  function normalizeId(id){if(typeof id!=='string'||!id.trim())throw new TypeError('QUADLUD pedagogy adapter id must be a non-empty string');return id.trim()}
  function isObject(value){return !!value&&(typeof value==='object'||typeof value==='function')}
  function cloneDomains(){const out={};for(const domain of Object.keys(DOMAIN_METHODS))out[domain]={};return out}
  function collectSource(adapter){
    if(!isObject(adapter))throw new TypeError('QUADLUD pedagogy adapter must be an object');
    const out=cloneDomains();
    // Historical flat adapters remain accepted during the incremental migration.
    for(const [legacy,[domain,name]] of Object.entries(LEGACY_METHOD_MAP))if(typeof adapter[legacy]==='function')out[domain][name]=adapter[legacy];
    // Grouped REF-3 domains override the compatibility projection.
    for(const domain of Object.keys(DOMAIN_METHODS)){
      const source=adapter[domain];if(source==null)continue;if(!isObject(source))throw new TypeError(`QUADLUD pedagogy domain "${domain}" must be an object`);
      for(const name of DOMAIN_METHODS[domain])if(typeof source[name]==='function')out[domain][name]=source[name];
      for(const name of Object.keys(source))if(!DOMAIN_METHODS[domain].includes(name))throw new TypeError(`Unknown QUADLUD pedagogy method ${domain}.${name}()`);
    }
    return out
  }
  function defineAdapter(source,id='anonymous'){
    const raw=collectSource(source),normalized={};
    for(const [domain,methods] of Object.entries(DOMAIN_METHODS)){
      const group={};
      for(const name of methods){
        const fn=raw[domain][name]||DEFAULTS[domain]?.[name];
        if(typeof fn==='function')group[name]=fn;
      }
      for(const name of REQUIRED_DOMAIN_METHODS[domain])if(typeof group[name]!=='function')throw new TypeError(`QUADLUD pedagogy adapter "${id}" must expose ${domain}.${name}()`);
      normalized[domain]=Object.freeze(group)
    }
    return Object.freeze(normalized)
  }
  function validateAdapter(id,adapter){return defineAdapter(adapter,id)}
  function createCollection(ids,resolver){
    if(!Array.isArray(ids))throw new TypeError('QUADLUD pedagogy adapter ids must be an array');
    if(typeof resolver!=='function')throw new TypeError('QUADLUD pedagogy adapter resolver must be a function');
    const normalized=[],known=new Set();
    for(const raw of ids){const id=normalizeId(raw);if(known.has(id))throw new TypeError(`Duplicate QUADLUD pedagogy adapter id: ${id}`);known.add(id);normalized.push(id)}
    const frozenIds=Object.freeze(normalized.slice()),cache=new Map();
    function has(id){return known.has(String(id||''))}
    function requireAdapter(id){const key=String(id||'');if(!known.has(key))throw new Error(`Unknown QUADLUD pedagogy adapter: ${id}`);if(cache.has(key))return cache.get(key);const adapter=validateAdapter(key,resolver(key));cache.set(key,adapter);return adapter}
    return Object.freeze({ids:frozenIds,has,require:requireAdapter})
  }
  return Object.freeze({VERSION,DOMAIN_METHODS,REQUIRED_DOMAIN_METHODS,LEGACY_METHOD_MAP,LEGACY_METHODS,REQUIRED_METHODS,defineAdapter,createCollection})
});
