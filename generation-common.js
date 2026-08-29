/*
 * QUADLUD — shared generation helpers
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
'use strict';

const QuadludGenerationRegistry=(typeof module!=='undefined'&&module.exports)?require('./game-registry.js'):(typeof globalThis!=='undefined'?globalThis.QuadludGameRegistry:null);

function generationRegistry(){if(!QuadludGenerationRegistry)throw new Error('QUADLUD game registry unavailable for generation');return QuadludGenerationRegistry}
function hash32(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
function withSeed(seed,fn){let old=Math.random;Math.random=mulberry32(hash32(seed));try{return fn()}finally{Math.random=old}}

function shuffle(a){a=[...a];for(let i=a.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function rotGrid(grid){const n=grid.length;return Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>grid[n-1-c][r]))}
function flipGrid(grid){return grid.map(r=>[...r].reverse())}
function transformGrid(grid,k){let g=grid.map(r=>[...r]);for(let i=0;i<k%4;i++)g=rotGrid(g);if(k>=4)g=flipGrid(g);return g}

function generateRegisteredCandidate(game,diff,options){return generationRegistry().requireCapability(game,'generatePuzzle')(diff,options)}
function generatedPublicPuzzleFromCandidate(game,g){
  if(!game||!g)return null;
  return generationRegistry().requireCapability(game,'publicPuzzleFromCandidate')(g)
}
function generatedCandidateIdentity(game,g){
  if(!game||!g)return null;
  let registry=generationRegistry();
  return registry.hasCapability(game,'generationIdentity')?registry.requireCapability(game,'generationIdentity')(g):null
}
function generatedCandidateFingerprint(game,g){
  let pub=generatedPublicPuzzleFromCandidate(game,g);if(!pub||typeof DifficultyRating==='undefined')return null;
  return DifficultyRating.fingerprintPublicPuzzle(pub)
}

function generatedCandidateProfile(g){return g?.difficultyProfile||null}
function generatedCandidateCertified(game,diff,g){
  let profile=generatedCandidateProfile(g),tier=typeof DifficultyRating!=='undefined'?DifficultyRating.tierIndex(diff):null,fingerprint=generatedCandidateFingerprint(game,g);
  return !!profile&&profile.status==='solved'&&profile.difficulty===diff&&profile.minimumRequiredTier===tier&&!profile.budgetHit&&profile.fingerprint===fingerprint
}

const QuadludGenerationCommon=Object.freeze({hash32,mulberry32,withSeed,shuffle,rotGrid,flipGrid,transformGrid,generateRegisteredCandidate,generatedPublicPuzzleFromCandidate,generatedCandidateIdentity,generatedCandidateFingerprint,generatedCandidateProfile,generatedCandidateCertified});
if(typeof globalThis!=='undefined')globalThis.QuadludGenerationCommon=QuadludGenerationCommon;
if(typeof module!=='undefined'&&module.exports)module.exports=QuadludGenerationCommon;
