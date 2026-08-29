/*
 * QUADLUD — static game module manifest
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludGameManifest=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=2;
  const MODULE_ROLES=Object.freeze(['logic','difficulty','generator','session','ui','runtime','pedagogy','reasoning','i18n']);
  const WORKER_ROLES=Object.freeze(['logic','difficulty','generator']);
  const BROWSER_ROLES=MODULE_ROLES;

  const GAMES=Object.freeze([
    Object.freeze({
      id:'queens',
      metadata:Object.freeze({labelKey:'gameQueens',descriptionKey:'queensSub',challengeCode:'Q',icon:'♛',victoryClass:'queens-win'}),
      modules:Object.freeze({logic:'queens-logic.js',difficulty:'queens-difficulty.js',generator:'queens-generator.js',session:'game-session-adapters.js',ui:'queens-ui.js',runtime:'queens-runtime.js',pedagogy:'queens-pedagogy.js',reasoning:'queens-reasoning-presentation.js',i18n:'queens-i18n.js'}),
      worker:true,offline:true
    }),
    Object.freeze({
      id:'tango',
      metadata:Object.freeze({labelKey:'gameTango',descriptionKey:'tangoSub',challengeCode:'T',icon:'☀︎'}),
      modules:Object.freeze({logic:'tango-logic.js',difficulty:'tango-difficulty.js',generator:'tango-generator.js',session:'game-session-adapters.js',ui:'tango-ui.js',runtime:'tango-runtime.js',pedagogy:'tango-pedagogy.js',reasoning:'tango-reasoning-presentation.js',i18n:'tango-i18n.js'}),
      worker:true,offline:true
    }),
    Object.freeze({
      id:'sudoku',
      metadata:Object.freeze({labelKey:'gameSudoku',descriptionKey:'sudokuSub',challengeCode:'S',icon:'✎'}),
      modules:Object.freeze({logic:'sudoku-logic.js',difficulty:'sudoku-difficulty.js',generator:'sudoku-generator.js',session:'game-session-adapters.js',ui:'sudoku-ui.js',runtime:'sudoku-runtime.js',pedagogy:'sudoku-pedagogy.js',reasoning:'sudoku-reasoning-presentation.js',i18n:'sudoku-i18n.js'}),
      worker:true,offline:true
    }),
    Object.freeze({
      id:'patches',
      metadata:Object.freeze({labelKey:'gamePatches',descriptionKey:'patchesSub',challengeCode:'P',icon:'▦'}),
      modules:Object.freeze({logic:'patches-logic.js',difficulty:'patches-difficulty.js',generator:'patches-generator.js',session:'game-session-adapters.js',ui:'patches-ui.js',runtime:'patches-runtime.js',pedagogy:'patches-pedagogy.js',reasoning:'patches-reasoning-presentation.js',i18n:'patches-i18n.js'}),
      worker:true,offline:true
    }),
    Object.freeze({
      id:'nonogram',
      metadata:Object.freeze({labelKey:'gameNonogram',descriptionKey:'nonogramSub',challengeCode:'N',icon:'▦'}),
      modules:Object.freeze({logic:'nonogram-logic.js',difficulty:'nonogram-difficulty.js',generator:'nonogram-generator.js',session:'game-session-adapters.js',ui:'nonogram-ui.js',runtime:'nonogram-runtime.js',pedagogy:'nonogram-pedagogy.js',reasoning:'nonogram-reasoning-presentation.js',i18n:'nonogram-i18n.js'}),
      supportModules:Object.freeze(['nonogram-validation-solver.js']),workerSupportModules:Object.freeze(['logical-move.js','nonogram-validation-solver.js']),
      worker:true,offline:true,daily:true
    })
  ]);
  const IDS=Object.freeze(GAMES.map(game=>game.id));
  const BY_ID=new Map(GAMES.map(game=>[game.id,game]));

  function getGame(id){return BY_ID.get(String(id||''))||null}
  function requireGame(id){const game=getGame(id);if(!game)throw new Error(`Unknown QUADLUD game manifest entry: ${id}`);return game}
  function listGames(){return GAMES}
  function modulePath(id,role){
    if(!MODULE_ROLES.includes(role))throw new Error(`Unknown QUADLUD game module role: ${role}`);
    const path=requireGame(id).modules[role];if(typeof path!=='string'||!path)throw new Error(`Missing QUADLUD game module: ${id}.${role}`);return path
  }
  function uniqueModules(roles,predicate=()=>true){
    const out=[],seen=new Set();
    for(const game of GAMES){if(!predicate(game))continue;for(const role of roles){const path=modulePath(game.id,role);if(!seen.has(path)){seen.add(path);out.push(path)}}}
    return Object.freeze(out)
  }
  function supportModulesFor(game,field='supportModules'){return Array.isArray(game?.[field])?game[field]:[]}
  function appendUnique(base,extra){const out=[...base],seen=new Set(out);for(const path of extra)if(typeof path==='string'&&path&&!seen.has(path)){seen.add(path);out.push(path)}return Object.freeze(out)}
  function browserModules(){return appendUnique(uniqueModules(BROWSER_ROLES),GAMES.flatMap(game=>supportModulesFor(game)))}
  function workerModules(){return appendUnique(uniqueModules(WORKER_ROLES,game=>game.worker===true),GAMES.filter(game=>game.worker===true).flatMap(game=>supportModulesFor(game,'workerSupportModules')))}
  function offlineModules(){return appendUnique(uniqueModules(BROWSER_ROLES,game=>game.offline===true),GAMES.filter(game=>game.offline===true).flatMap(game=>supportModulesFor(game)))}

  return Object.freeze({VERSION,MODULE_ROLES,WORKER_ROLES,BROWSER_ROLES,GAMES,IDS,listGames,getGame,requireGame,modulePath,browserModules,workerModules,offlineModules});
});
