/*
 * QUADLUD — static game registry
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const isNode=typeof module!=='undefined'&&module.exports;
  const contract=isNode?require('./game-contract.js'):root.QuadludGameContract;
  const manifest=isNode?require('./game-manifest.js'):root.QuadludGameManifest;
  const api=factory(root,contract,manifest,isNode?require:null);
  if(isNode)module.exports=api;
  if(root)root.QuadludGameRegistry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,contract,manifest,nodeRequire){
  'use strict';

  if(!contract)throw new Error('QUADLUD game contract unavailable');
  if(!manifest)throw new Error('QUADLUD game manifest unavailable');

  const VERSION=7;
  function moduleCapability(globalName,nodePath,property=null){
    return ()=>{let module=resolveModule(globalName,nodePath);return property==null?module:module[property]};
  }
  function lazyModuleObjectCapability(globalName,nodePath,methods){
    const proxy={};
    for(const method of methods)proxy[method]=(...args)=>{
      const module=resolveModule(globalName,nodePath),fn=module?.[method];
      if(typeof fn!=='function')throw new Error(`QUADLUD game capability dependency unavailable: ${globalName}.${method}`);
      return fn(...args)
    };
    const frozen=Object.freeze(proxy);return ()=>frozen
  }
  const BINDINGS=Object.freeze({
    queens:Object.freeze({logic:'QueensLogic',difficulty:'QueensDifficulty',generator:'QuadludQueensGenerator',generate:'generateQueensPuzzle',ui:'QuadludQueensUI',pedagogy:'QuadludQueensPedagogy',reasoning:'QuadludQueensReasoningPresenter',i18n:'QuadludQueensI18n',generationIdentity:'generationIdentity',challengeGeneratorVersion:'challengeGeneratorVersion'}),
    tango:Object.freeze({logic:'TangoLogic',difficulty:'TangoDifficulty',generator:'QuadludTangoGenerator',generate:'generateTangoPuzzle',ui:'QuadludTangoUI',pedagogy:'QuadludTangoPedagogy',reasoning:'QuadludTangoReasoningPresenter',i18n:'QuadludTangoI18n'}),
    sudoku:Object.freeze({logic:'SudokuLogic',difficulty:'SudokuDifficulty',generator:'QuadludSudokuGenerator',generate:'generateSudokuPuzzle',ui:'QuadludSudokuUI',pedagogy:'QuadludSudokuPedagogy',reasoning:'QuadludSudokuReasoningPresenter',i18n:'QuadludSudokuI18n'}),
    patches:Object.freeze({logic:'PatchesLogic',difficulty:'PatchesDifficulty',generator:'QuadludPatchesGenerator',generate:'generatePatchesPuzzle',ui:'QuadludPatchesUI',pedagogy:'QuadludPatchesPedagogy',reasoning:'QuadludPatchesReasoningPresenter',i18n:'QuadludPatchesI18n'}),
    nonogram:Object.freeze({logic:'NonogramLogic',difficulty:'NonogramDifficulty',generator:'NonogramGenerator',generate:'generateProductPuzzle',ui:'QuadludNonogramUI',pedagogy:'QuadludNonogramPedagogy',reasoning:'QuadludNonogramReasoningPresenter',i18n:'QuadludNonogramI18n',generationIdentity:'generationIdentity'})
  });
  function gameModulePath(id,role){return `./${manifest.modulePath(id,role)}`}
  function manifestEntryToCatalog(game){
    const id=game.id,b=BINDINGS[id];if(!b)throw new Error(`QUADLUD game registry binding missing for manifest entry: ${id}`);
    const capabilities={
      logic:moduleCapability(b.logic,gameModulePath(id,'logic')),
      difficulty:moduleCapability(b.difficulty,gameModulePath(id,'difficulty')),
      generatePuzzle:moduleCapability(b.generator,gameModulePath(id,'generator'),b.generate),
      canonicalizePublicPuzzle:moduleCapability(b.difficulty,gameModulePath(id,'difficulty'),'canonicalizePublicPuzzle'),
      publicPuzzleFromCandidate:moduleCapability(b.generator,gameModulePath(id,'generator'),'publicPuzzleFromCandidate'),
      publicPuzzleFromSession:moduleCapability(b.generator,gameModulePath(id,'generator'),'publicPuzzleFromSession'),
      sessionLifecycle:moduleCapability('QuadludGameSessionAdapters',gameModulePath(id,'session'),id),
      uiLifecycle:lazyModuleObjectCapability(b.ui,gameModulePath(id,'ui'),['createAdapter']),
      pedagogyLifecycle:lazyModuleObjectCapability(b.pedagogy,gameModulePath(id,'pedagogy'),['createAdapter','dependencyNames','trainingFixture']),
      reasoningLifecycle:lazyModuleObjectCapability(b.reasoning,gameModulePath(id,'reasoning'),['createPresenter']),
      i18n:moduleCapability(b.i18n,gameModulePath(id,'i18n'))
    };
    if(b.generationIdentity)capabilities.generationIdentity=moduleCapability(b.generator,gameModulePath(id,'generator'),b.generationIdentity);
    if(b.challengeGeneratorVersion)capabilities.challengeGeneratorVersion=moduleCapability(b.generator,gameModulePath(id,'generator'),b.challengeGeneratorVersion);
    return Object.freeze({id,metadata:game.metadata,capabilities:Object.freeze(capabilities)})
  }
  const CATALOG=Object.freeze(manifest.listGames().map(manifestEntryToCatalog));
  const IDS=Object.freeze(CATALOG.map(entry=>entry.id));
  const CATALOG_BY_ID=new Map(CATALOG.map(entry=>[entry.id,entry]));

  function resolveModule(globalName,nodePath){
    const value=nodeRequire?nodeRequire(nodePath):root?.[globalName];
    if(!value)throw new Error(`QUADLUD game capability dependency unavailable: ${globalName}`);
    return value;
  }
  function assertCapabilityName(name){if(!Object.prototype.hasOwnProperty.call(contract.CAPABILITY_FIELDS,name))throw new Error(`Unknown QUADLUD game capability: ${name}`)}
  function catalogEntry(id){return CATALOG_BY_ID.get(String(id||''))||null}
  function hasGame(id){return CATALOG_BY_ID.has(String(id||''))}
  function getMetadata(id){return catalogEntry(id)?.metadata||null}
  function requireCatalogEntry(id){
    const entry=catalogEntry(id);
    if(!entry)throw new Error(`Unknown QUADLUD game: ${id}`);
    return entry;
  }
  function resolveCapability(entry,name){
    assertCapabilityName(name);
    const resolver=entry.capabilities[name];
    if(typeof resolver!=='function')throw new Error(`QUADLUD game "${entry.id}" does not provide capability "${name}"`);
    const value=resolver();
    if(typeof contract.validateCapability==='function')contract.validateCapability(name,value);
    return value;
  }
  function materialize(entry){
    const capabilities={};for(const name of Object.keys(entry.capabilities))capabilities[name]=resolveCapability(entry,name);
    return contract.defineGameDefinition({id:entry.id,metadata:entry.metadata,capabilities});
  }
  function listGames(){return contract.defineGameDefinitions(CATALOG.map(materialize))}
  function getGame(id){const entry=catalogEntry(id);return entry?materialize(entry):null}
  function requireGame(id){return materialize(requireCatalogEntry(id))}
  function hasCapability(id,name){assertCapabilityName(name);const entry=catalogEntry(id);return !!entry&&typeof entry.capabilities[name]==='function'}
  function requireCapability(id,name){return resolveCapability(requireCatalogEntry(id),name)}

  return Object.freeze({VERSION,MANIFEST_VERSION:manifest.VERSION,IDS,listGames,getGame,requireGame,hasGame,getMetadata,hasCapability,requireCapability});
});
