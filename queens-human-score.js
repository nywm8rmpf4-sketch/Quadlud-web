/*
 * QUADLUD — Couronnes human difficulty score (HUMDIFF E4)
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QueensHumanDifficulty=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const MODEL_SCHEMA=1;
  const MODEL_VERSION='E4-v1';
  const MODEL_FAMILY='E4_STRUCTURAL_NO_STEPS_RIDGE';
  const MODEL_SHA256='55d644c18b85db877532d273c4563235782407efebc048b17a39bef988da001a';
  const RIDGE_ALPHA=10.0;
  const FEATURE_ORDER=Object.freeze(['logicalTier','graphDepth','meanCandidateCardinality','ruleEntropy']);
  const INTERCEPT=3.6974789915966384;
  const COEFFICIENTS=Object.freeze({
    logicalTier:0.2589438255994834,
    graphDepth:0.2503773656241066,
    meanCandidateCardinality:0.15098895518209232,
    ruleEntropy:0.3723193737023269
  });
  const SCALER_MEAN=Object.freeze({
    logicalTier:1.1680672268907564,
    graphDepth:16.067226890756302,
    meanCandidateCardinality:2.1356827395117026,
    ruleEntropy:1.4613689592014796
  });
  const SCALER_SCALE=Object.freeze({
    logicalTier:0.4361660259617136,
    graphDepth:2.59518329670152,
    meanCandidateCardinality:0.49080554880632743,
    ruleEntropy:0.4042977280320534
  });
  const MODEL=Object.freeze({
    schema:MODEL_SCHEMA,
    version:MODEL_VERSION,
    family:MODEL_FAMILY,
    sha256:MODEL_SHA256,
    ridgeAlpha:RIDGE_ALPHA,
    featureOrder:FEATURE_ORDER,
    intercept:INTERCEPT,
    coefficientsStandardized:COEFFICIENTS,
    scalerMean:SCALER_MEAN,
    scalerScale:SCALER_SCALE,
    standardization:'StandardScaler fit on all 119 WEB_DEVELOPMENT rows',
    usageRestriction:'RESEARCH_OFFLINE_CONFIRMATORY_VALIDATION_ONLY_NOT_PRODUCT'
  });

  function finite(value,name){
    const n=Number(value);
    if(!Number.isFinite(n))throw new Error('Invalid human difficulty metric: '+name);
    return n;
  }
  function normalizeMetrics(metrics){
    if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw new Error('Human difficulty metrics are required');
    const out={};
    for(const feature of FEATURE_ORDER)out[feature]=finite(metrics[feature],feature);
    return out;
  }
  function scoreMetrics(metrics){
    const values=normalizeMetrics(metrics);
    let score=INTERCEPT;
    for(const feature of FEATURE_ORDER){
      const standardized=(values[feature]-SCALER_MEAN[feature])/SCALER_SCALE[feature];
      score+=COEFFICIENTS[feature]*standardized;
    }
    return Object.freeze({
      humanDifficultyScore:score,
      humanDifficultyModelVersion:MODEL_VERSION,
      humanDifficultyModelFamily:MODEL_FAMILY,
      humanDifficultyModelSha256:MODEL_SHA256,
      metrics:Object.freeze({...values})
    });
  }

  return Object.freeze({VERSION,MODEL_SCHEMA,MODEL_VERSION,MODEL_FAMILY,MODEL_SHA256,RIDGE_ALPHA,FEATURE_ORDER,MODEL,scoreMetrics});
});
