/*
 * QUADLUD — Mosaïque / Nonogram validation-only exhaustive solver
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):(root&&root.NonogramLogic);
  const api=factory(logic);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NonogramValidationSolver=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Logic){
  'use strict';

  if(!Logic||typeof Logic.validatePuzzle!=='function'||typeof Logic.compatiblePlacements!=='function')throw new Error('NonogramValidationSolver requires NonogramLogic');

  const VERSION=1;
  const RESULT_SCHEMA=1;
  const CLASSES=Object.freeze({NONE:'none',UNIQUE:'unique',MULTIPLE:'multiple',UNDETERMINED:'undetermined'});
  const DEFAULT_LIMIT=2;
  const DEFAULT_MAX_NODES=250000;

  function fail(message){throw new TypeError(`Invalid Nonogram validation request: ${message}`)}
  function isInt(value){return Number.isInteger(value)}
  function cloneGrid(grid){return grid.map(row=>row.slice())}
  function cloneDomains(domains){return domains.map(line=>line.map(bits=>bits.slice()))}
  function freezeDeep(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))freezeDeep(child);return value}
  function bitMatchesState(bit,state){return state===Logic.UNKNOWN||(state===Logic.FILLED&&bit===1)||(state===Logic.EMPTY&&bit===0)}
  function lineState(grid,axis,index){return axis==='row'?grid[index].slice():Array.from({length:grid.length},(_,r)=>grid[r][index])}
  function lineDomainCompatible(bits,state){for(let i=0;i<bits.length;i++)if(!bitMatchesState(bits[i],state[i]))return false;return true}
  function setCell(grid,row,col,bit){const next=bit===1?Logic.FILLED:Logic.EMPTY,old=grid[row][col];if(old!==Logic.UNKNOWN&&old!==next)return false;grid[row][col]=next;return true}

  function createDomains(puzzle,state){
    const rowDomains=puzzle.rowClues.map((clues,r)=>Logic.compatiblePlacements(puzzle.cols,clues,state[r]));
    const colDomains=puzzle.colClues.map((clues,c)=>Logic.compatiblePlacements(puzzle.rows,clues,Array.from({length:puzzle.rows},(_,r)=>state[r][c])));
    return {rowDomains,colDomains};
  }

  function filterAndForceLine(puzzle,grid,domains,axis,index,metrics){
    const state=lineState(grid,axis,index);
    const filtered=domains[index].filter(bits=>lineDomainCompatible(bits,state));
    domains[index]=filtered;
    metrics.domainFilters++;
    if(!filtered.length)return {ok:false,changed:false};
    let changed=false;
    const length=axis==='row'?puzzle.cols:puzzle.rows;
    for(let pos=0;pos<length;pos++){
      const bit=filtered[0][pos];
      if(!filtered.every(candidate=>candidate[pos]===bit))continue;
      const row=axis==='row'?index:pos,col=axis==='row'?pos:index;
      if(grid[row][col]===Logic.UNKNOWN){if(!setCell(grid,row,col,bit))return {ok:false,changed};changed=true;metrics.forcedAssignments++}
      else if(!bitMatchesState(bit,grid[row][col]))return {ok:false,changed};
    }
    return {ok:true,changed};
  }

  function propagate(puzzle,grid,rowDomains,colDomains,metrics){
    let changed=true;
    while(changed){
      changed=false;metrics.propagationRounds++;
      for(let r=0;r<puzzle.rows;r++){const result=filterAndForceLine(puzzle,grid,rowDomains,'row',r,metrics);if(!result.ok)return false;if(result.changed)changed=true}
      for(let c=0;c<puzzle.cols;c++){const result=filterAndForceLine(puzzle,grid,colDomains,'column',c,metrics);if(!result.ok)return false;if(result.changed)changed=true}
    }
    return true;
  }

  function chooseBranch(rowDomains,colDomains){
    let best=null;
    for(let i=0;i<rowDomains.length;i++){const size=rowDomains[i].length;if(size>1&&(!best||size<best.size))best={axis:'row',index:i,size}}
    for(let i=0;i<colDomains.length;i++){const size=colDomains[i].length;if(size>1&&(!best||size<best.size))best={axis:'column',index:i,size}}
    return best;
  }

  function hasUnknown(grid){for(const row of grid)for(const cell of row)if(cell===Logic.UNKNOWN)return true;return false}

  function normalizeOptions(options){
    options=options||{};
    const limit=options.limit==null?DEFAULT_LIMIT:Number(options.limit);
    const maxNodes=options.maxNodes==null?DEFAULT_MAX_NODES:Number(options.maxNodes);
    if(!isInt(limit)||limit<2)fail('limit must be an integer >= 2 so 0/1/>1 classification is reliable');
    if(!isInt(maxNodes)||maxNodes<0)fail('maxNodes must be a non-negative integer');
    return {limit,maxNodes};
  }

  function classifySolutions(puzzle,initialState=null,options=null){
    const pub=Logic.validatePuzzle(puzzle),grid=Logic.createState(pub,initialState),cfg=normalizeOptions(options);
    const initial=createDomains(pub,grid);
    const metrics={nodes:0,branchAttempts:0,propagationRounds:0,domainFilters:0,forcedAssignments:0,maxDepth:0};
    let count=0,budgetExhausted=false;

    function visit(state,rowDomains,colDomains,depth){
      if(count>=cfg.limit)return
      if(metrics.nodes>=cfg.maxNodes){budgetExhausted=true;return}
      metrics.nodes++;if(depth>metrics.maxDepth)metrics.maxDepth=depth;
      if(!propagate(pub,state,rowDomains,colDomains,metrics))return;
      if(!hasUnknown(state)){
        if(Logic.isSolved(pub,state))count++;
        return;
      }
      const branch=chooseBranch(rowDomains,colDomains);
      if(!branch)return;
      const domain=branch.axis==='row'?rowDomains[branch.index]:colDomains[branch.index];
      for(const candidate of domain){
        if(count>=cfg.limit)return
        if(metrics.nodes>=cfg.maxNodes){budgetExhausted=true;return}
        metrics.branchAttempts++;
        const nextGrid=cloneGrid(state),nextRows=cloneDomains(rowDomains),nextCols=cloneDomains(colDomains);
        if(branch.axis==='row')nextRows[branch.index]=[candidate.slice()];else nextCols[branch.index]=[candidate.slice()];
        visit(nextGrid,nextRows,nextCols,depth+1);
        if(budgetExhausted&&count<cfg.limit)return;
      }
    }

    visit(cloneGrid(grid),cloneDomains(initial.rowDomains),cloneDomains(initial.colDomains),0);

    let classification,classificationProven=true;
    if(count>=2)classification=CLASSES.MULTIPLE;
    else if(budgetExhausted){classification=CLASSES.UNDETERMINED;classificationProven=false}
    else if(count===1)classification=CLASSES.UNIQUE;
    else classification=CLASSES.NONE;

    const exactCount=!budgetExhausted&&count<cfg.limit;
    return freezeDeep({
      schema:RESULT_SCHEMA,
      kind:'nonogram-validation-summary',
      classification,
      classificationProven,
      cappedCount:count,
      countLimit:cfg.limit,
      exactCount,
      budgetExhausted,
      metrics:{...metrics}
    });
  }

  function hasAnyCompletion(puzzle,initialState=null,options=null){
    const result=classifySolutions(puzzle,initialState,options);
    if(!result.classificationProven)return null;
    return result.classification!==CLASSES.NONE;
  }
  function isUnique(puzzle,initialState=null,options=null){
    const result=classifySolutions(puzzle,initialState,options);
    if(!result.classificationProven)return null;
    return result.classification===CLASSES.UNIQUE;
  }

  return Object.freeze({
    VERSION,RESULT_SCHEMA,CLASSES,DEFAULT_LIMIT,DEFAULT_MAX_NODES,
    classifySolutions,hasAnyCompletion,isUnique
  });
});
