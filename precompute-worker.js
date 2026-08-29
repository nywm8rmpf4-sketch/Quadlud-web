/*
 * QUADLUD — background puzzle precomputation worker
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
'use strict';

/* v2.25/25.2: pure shared worker path.
   Load only the authoritative logic, rating and generation modules required to
   produce certified candidates. Application orchestration stays on the main thread. */
importScripts('./game-contract.js?v=3.1.6');
importScripts('./game-manifest.js?v=3.1.6');
importScripts('./game-registry.js?v=3.1.6');
importScripts('./logical-move.js?v=3.1.6');
importScripts('./queens-logic.js?v=3.1.6');
importScripts('./difficulty-rating.js?v=3.1.6');
importScripts('./queens-difficulty.js?v=3.1.6');
importScripts('./tango-logic.js?v=3.1.6');
importScripts('./tango-difficulty.js?v=3.1.6');
importScripts('./sudoku-logic.js?v=3.1.6');
importScripts('./sudoku-difficulty.js?v=3.1.6');
importScripts('./patches-logic.js?v=3.1.6');
importScripts('./patches-difficulty.js?v=3.1.6');
importScripts('./nonogram-logic.js?v=3.1.6');
importScripts('./nonogram-validation-solver.js?v=3.1.6');
importScripts('./nonogram-difficulty.js?v=3.1.6');
importScripts('./generation-common.js?v=3.1.6');
importScripts('./queens-qpool4.js?v=3.1.6');
importScripts('./queens-generator.js?v=3.1.6');
importScripts('./tango-generator.js?v=3.1.6');
importScripts('./sudoku-generator.js?v=3.1.6');
importScripts('./patches-generator.js?v=3.1.6');
importScripts('./nonogram-generator.js?v=3.1.6');

function __build(game,diff,forbiddenKeys){
  let registry=self.QuadludGameRegistry;if(!registry)throw new Error('QUADLUD game registry unavailable');
  if(!registry.hasGame(game))throw new Error('Unknown game');
  if(!registry.hasCapability(game,'generationIdentity'))return generateRegisteredCandidate(game,diff);
  let blocked=new Set(forbiddenKeys||[]);
  for(let guard=0;guard<48;guard++){
    let g=generateRegisteredCandidate(game,diff),identity=generatedCandidateIdentity(game,g);
    if(blocked.has(identity))continue;g.__generationIdentity=identity;return g
  }
  throw new Error('No fresh candidate matching logical profile')
}
function __workerCandidateCertified(game,diff,candidate){
  if(generatedCandidateCertified(game,diff,candidate))return true;
  try{
    let difficulty=self.QuadludGameRegistry.requireCapability(game,'difficulty');
    return typeof difficulty?.candidateCertified==='function'&&difficulty.candidateCertified(diff,candidate)&&generatedCandidateFingerprint(game,candidate)===candidate?.difficultyProfile?.fingerprint
  }catch(_){return false}
}
function __buildCertified(game,diff,forbiddenKeys){
  let candidate=__build(game,diff,forbiddenKeys);
  if(!__workerCandidateCertified(game,diff,candidate))throw new Error('Generated candidate failed certified difficulty validation');
  return candidate
}
self.onmessage=e=>{
  let m=e.data||{};
  if(m.cmd!=='generate')return;
  let started=Date.now();
  try{
    let candidate=__buildCertified(m.game,m.diff,m.forbiddenKeys||[]);
    self.postMessage({ok:true,id:m.id,game:m.game,diff:m.diff,day:m.day,candidate,ms:Date.now()-started})
  }catch(err){
    self.postMessage({ok:false,id:m.id,game:m.game,diff:m.diff,day:m.day,error:String(err?.message||err),ms:Date.now()-started})
  }
};
