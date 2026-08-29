/*
 * QUADLUD — Mosaïque / Nonogram deterministic generator
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):(root&&root.NonogramLogic);
  const validation=(typeof module==='object'&&module.exports)?require('./nonogram-validation-solver.js'):(root&&root.NonogramValidationSolver);
  const generation=(typeof module==='object'&&module.exports)?require('./generation-common.js'):(root&&root.QuadludGenerationCommon);
  const difficulty=(typeof module==='object'&&module.exports)?require('./difficulty-rating.js'):(root&&root.DifficultyRating);
  const nonogramDifficulty=(typeof module==='object'&&module.exports)?require('./nonogram-difficulty.js'):(root&&root.NonogramDifficulty);
  const api=factory(logic,validation,generation,difficulty,nonogramDifficulty);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NonogramGenerator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Logic,Validation,Generation,DifficultyRating,NonogramDifficulty){
  'use strict';

  if(!Logic||typeof Logic.validatePuzzle!=='function'||typeof Logic.cluesFromBits!=='function')throw new Error('NonogramGenerator requires NonogramLogic');
  if(!Validation||typeof Validation.classifySolutions!=='function')throw new Error('NonogramGenerator requires NonogramValidationSolver');
  if(!Generation||typeof Generation.hash32!=='function'||typeof Generation.mulberry32!=='function')throw new Error('NonogramGenerator requires QuadludGenerationCommon');
  if(!DifficultyRating||typeof DifficultyRating.fingerprintCanonical!=='function')throw new Error('NonogramGenerator requires DifficultyRating.fingerprintCanonical');
  if(!NonogramDifficulty||typeof NonogramDifficulty.ratePuzzle!=='function')throw new Error('NonogramGenerator requires NonogramDifficulty');

  const VERSION=1;
  const GENERATION_SCHEMA=1;
  const DEFAULT_SIZES=Object.freeze([5,10,15]);
  const DEFAULT_MAX_ATTEMPTS=Object.freeze({5:12,10:20,15:12});
  const DEFAULT_VALIDATION_NODES=Object.freeze({5:25000,10:100000,15:250000});
  const MIN_DENSITY=0.40,MAX_DENSITY=0.60;

  function fail(message){throw new TypeError(`Invalid Nonogram generation request: ${message}`)}
  function isInt(value){return Number.isInteger(value)}
  function copy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
  function freezeDeep(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))freezeDeep(child);return value}
  function normalizeSeed(seed){if(seed==null)fail('seed is required');const s=String(seed);if(!s.length)fail('seed must not be empty');return s}
  function normalizeSize(value){const n=Number(value);if(!isInt(n)||!DEFAULT_SIZES.includes(n))fail(`size must be one of ${DEFAULT_SIZES.join(', ')}`);return n}
  function normalizePositiveInt(value,name,defaultValue){if(value==null)return defaultValue;const n=Number(value);if(!isInt(n)||n<=0)fail(`${name} must be a positive integer`);return n}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  function filledCount(grid){let n=0;for(const row of grid)for(const bit of row)n+=bit===1?1:0;return n}

  function canonicalizePublicPuzzle(puzzle){return Logic.validatePuzzle(puzzle)}
  function fingerprintPublicPuzzle(puzzle){return DifficultyRating.fingerprintCanonical(canonicalizePublicPuzzle(puzzle))}
  function publicPuzzleFromGrid(grid){
    if(!Array.isArray(grid)||!grid.length||!Array.isArray(grid[0])||!grid[0].length)fail('solution grid must be a non-empty rectangular grid');
    const rows=grid.length,cols=grid[0].length;
    if(!grid.every(row=>Array.isArray(row)&&row.length===cols&&row.every(bit=>bit===0||bit===1)))fail('solution grid must contain only 0/1 bits');
    const rowClues=grid.map(row=>Logic.cluesFromBits(row));
    const colClues=Array.from({length:cols},(_,c)=>Logic.cluesFromBits(Array.from({length:rows},(_,r)=>grid[r][c])));
    return canonicalizePublicPuzzle({game:'nonogram',rows,cols,rowClues,colClues})
  }

  function randomBitmap(size,rng,attempt){
    // Density changes deterministically per attempt to widen the generated structural family.
    // 15×15 uses a 5×5 macro-grid expanded 3×3: fewer tiny runs, better logical-solver cost and a mosaic-like visual structure.
    const density=MIN_DENSITY+(MAX_DENSITY-MIN_DENSITY)*rng(),scale=size===15?3:1,baseSize=size/scale;
    const base=Array.from({length:baseSize},()=>Array.from({length:baseSize},()=>rng()<density?1:0));
    const baseCount=filledCount(base),baseCells=baseSize*baseSize;
    if(baseCount===0)base[Math.floor(rng()*baseSize)][Math.floor(rng()*baseSize)]=1;
    else if(baseCount===baseCells)base[Math.floor(rng()*baseSize)][Math.floor(rng()*baseSize)]=0;
    const grid=scale===1?base:Array.from({length:size},(_,r)=>Array.from({length:size},(_,c)=>base[Math.floor(r/scale)][Math.floor(c/scale)]));
    return {grid,density,attempt,scale}
  }

  function fallbackBitmap(size,rng){
    // Guaranteed-unique algorithmic safety net: every row or every column is itself fully determined.
    const horizontal=rng()<0.5,mask=Array.from({length:size},()=>rng()<0.5?1:0);
    if(mask.every(v=>v===0))mask[Math.floor(rng()*size)]=1;
    if(mask.every(v=>v===1))mask[Math.floor(rng()*size)]=0;
    const grid=Array.from({length:size},(_,r)=>Array.from({length:size},(_,c)=>horizontal?mask[r]:mask[c]));
    return {grid,orientation:horizontal?'horizontal':'vertical'}
  }

  function logicalSummary(puzzle){
    const result=Logic.solveDeterministic(puzzle,null,{maxSteps:puzzle.rows*puzzle.cols*4});
    return {status:result.status,steps:result.steps.length}
  }
  function validateCandidate(puzzle,maxNodes){
    const validation=Validation.classifySolutions(puzzle,null,{maxNodes,limit:2});
    if(validation.classification!=='unique')return {accepted:false,reason:validation.classification==='undetermined'?'validationBudget':'nonUnique',validation,logical:null};
    const logical=logicalSummary(puzzle);
    if(logical.status!=='solved')return {accepted:false,reason:'logicBlocked',validation,logical};
    return {accepted:true,reason:null,validation,logical}
  }

  function buildResult(seed,size,puzzle,solutionGrid,stats,validation,logical){
    const fingerprint=fingerprintPublicPuzzle(puzzle),count=filledCount(solutionGrid),cells=size*size;
    const result={
      schema:GENERATION_SCHEMA,
      game:'nonogram',
      generatorVersion:VERSION,
      seed,
      size,
      puzzle:copy(puzzle),
      fingerprint,
      unique:true,
      generated:true,
      validationState:{solutionGrid:solutionGrid.map(row=>row.slice())},
      generationStats:{...stats,fingerprint,filledCells:count,density:count/cells,logicalStatus:logical.status,logicalSteps:logical.steps,validationNodes:validation.metrics.nodes,validationBranchAttempts:validation.metrics.branchAttempts}
    };
    return freezeDeep(result)
  }

  function generateNonogramPuzzle(request){
    request=request||{};
    const seed=normalizeSeed(request.seed),size=normalizeSize(request.size),rng=Generation.mulberry32(Generation.hash32(`nonogram:v${VERSION}:${size}:${seed}`));
    const maxAttempts=normalizePositiveInt(request.maxAttempts,'maxAttempts',DEFAULT_MAX_ATTEMPTS[size]);
    const maxValidationNodes=normalizePositiveInt(request.maxValidationNodes,'maxValidationNodes',DEFAULT_VALIDATION_NODES[size]);
    const stats={schema:GENERATION_SCHEMA,generatorVersion:VERSION,strategy:'seeded-random-bitmap+algorithmic-fallback',size,attempts:0,randomAttempts:0,fallbackAttempts:0,rejected:{structure:0,nonUnique:0,validationBudget:0,logicBlocked:0},fallbackUsed:false};

    for(let attempt=1;attempt<=maxAttempts;attempt++){
      stats.attempts++;stats.randomAttempts++;
      const candidate=randomBitmap(size,rng,attempt),count=filledCount(candidate.grid),cells=size*size,density=count/cells;
      if(density<0.20||density>0.80){stats.rejected.structure++;continue}
      let puzzle;try{puzzle=publicPuzzleFromGrid(candidate.grid)}catch(_){stats.rejected.structure++;continue}
      const checked=validateCandidate(puzzle,maxValidationNodes);
      if(!checked.accepted){stats.rejected[checked.reason]++;continue}
      return buildResult(seed,size,puzzle,candidate.grid,stats,checked.validation,checked.logical)
    }

    stats.fallbackUsed=true;stats.attempts++;stats.fallbackAttempts++;
    const fallback=fallbackBitmap(size,rng),puzzle=publicPuzzleFromGrid(fallback.grid),checked=validateCandidate(puzzle,maxValidationNodes);
    if(!checked.accepted)throw new Error(`Nonogram algorithmic fallback failed certification (${checked.reason})`);
    return buildResult(seed,size,puzzle,fallback.grid,stats,checked.validation,checked.logical)
  }

  const PRODUCT_GENERATION_VERSION=2;
  const PRODUCT_DIFFICULTIES=Object.freeze(['easy','medium','hard','expert']);
  const PRODUCT_SIZE_BY_DIFFICULTY=Object.freeze({easy:5,medium:5,hard:10,expert:5});
  const PRODUCT_FALLBACK_PUZZLES=freezeDeep({
    easy:{game:'nonogram',rows:5,cols:5,rowClues:[[5],[],[5],[],[5]],colClues:[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]]},
    medium:{game:'nonogram',rows:5,cols:5,rowClues:[[5],[3,1],[1,1,1],[1,1,1],[4]],colClues:[[4],[2,1],[5],[1,1],[5]]},
    expert:{game:'nonogram',rows:5,cols:5,rowClues:[[1,1],[4],[2,2],[2],[1,2]],colClues:[[3],[4],[1,1],[3,1],[2]]}
  });
  function randomToken(){return Math.floor(Math.random()*0x100000000)>>>0}
  function attachDifficulty(candidate,diff,profile,extraStats={}){
    const generationStats={...(candidate.generationStats||{}),targetDifficulty:diff,productFacade:true,...extraStats};
    return {...copy(candidate),difficultyProfile:copy(profile),generationStats}
  }
  function exactProfile(puzzle,diff){const rated=NonogramDifficulty.ratePuzzle(puzzle);return rated.profile?.status==='solved'&&rated.profile.difficulty===diff?rated.profile:null}
  function transformedFallback(diff,seed){
    const base=PRODUCT_FALLBACK_PUZZLES[diff];if(!base)return null;
    const solved=Logic.solveDeterministic(base,null,{maxSteps:base.rows*base.cols*4});if(solved.status!=='solved')throw new Error(`Nonogram ${diff} fallback is not logically solvable`);
    const grid=solved.state.map(row=>row.map(v=>v===Logic.FILLED?1:0)),offset=randomToken()%8;
    for(let j=0;j<8;j++){
      const k=(offset+j)%8,transformed=Generation.transformGrid(grid,k),puzzle=publicPuzzleFromGrid(transformed),profile=exactProfile(puzzle,diff);if(!profile)continue;
      const checked=validateCandidate(puzzle,DEFAULT_VALIDATION_NODES[puzzle.rows]);if(!checked.accepted)continue;
      const stats={schema:GENERATION_SCHEMA,generatorVersion:VERSION,strategy:'certified-tier-template-transform-fallback',size:puzzle.rows,attempts:1,randomAttempts:0,fallbackAttempts:1,rejected:{structure:0,nonUnique:0,validationBudget:0,logicBlocked:0},fallbackUsed:true,transform:k};
      return attachDifficulty(buildResult(seed,puzzle.rows,puzzle,transformed,stats,checked.validation,checked.logical),diff,profile,{targetedFallback:true})
    }
    throw new Error(`No certified Nonogram ${diff} fallback transform`)
  }
  function localProductRng(diff,seed){return Generation.mulberry32(Generation.hash32(`nonogram:product-diversity:v1:${diff}:${seed}`))}
  const EASY_EXACT_FIT_ROWS=freezeDeep([[0,0,0,0,0],[1,1,1,1,1],[1,0,1,1,1],[1,1,0,1,1],[1,1,1,0,1],[1,0,1,0,1]]);
  function easyDiverseFallback(seed){
    const rng=localProductRng('easy',seed),grid=Array.from({length:5},()=>EASY_EXACT_FIT_ROWS[Math.floor(rng()*EASY_EXACT_FIT_ROWS.length)].slice()),transpose=rng()<0.5,oriented=transpose?Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>grid[c][r])):grid;
    const puzzle=publicPuzzleFromGrid(oriented),profile=exactProfile(puzzle,'easy'),checked=validateCandidate(puzzle,DEFAULT_VALIDATION_NODES[5]);if(!profile||!checked.accepted)throw new Error('Nonogram diversified Easy fallback failed certification');
    const stats={schema:GENERATION_SCHEMA,generatorVersion:VERSION,strategy:'algorithmic-exact-fit-family-fallback',size:5,attempts:1,randomAttempts:0,fallbackAttempts:1,rejected:{structure:0,nonUnique:0,validationBudget:0,logicBlocked:0},fallbackUsed:true,transpose};
    return attachDifficulty(buildResult(seed,5,puzzle,oriented,stats,checked.validation,checked.logical),'easy',profile,{targetedFallback:true,diversifiedFallback:true,productStrategyVersion:PRODUCT_GENERATION_VERSION})
  }
  function mutationRecipes(size){const out=[];for(let i=0;i<size*size;i++)out.push([i]);for(let i=0;i<size*size;i++)for(let j=i+1;j<size*size;j++)out.push([i,j]);return out}
  function mutatedGrid(grid,recipe){const out=grid.map(row=>row.slice()),cols=out[0].length;for(const i of recipe){const r=Math.floor(i/cols),c=i%cols;out[r][c]=out[r][c]?0:1}return out}
  function neighborhoodFallback(diff,seed){
    const base=PRODUCT_FALLBACK_PUZZLES[diff];if(!base)return transformedFallback(diff,seed);const solved=Logic.solveDeterministic(base,null,{maxSteps:base.rows*base.cols*4});if(solved.status!=='solved')throw new Error(`Nonogram ${diff} fallback is not logically solvable`);
    const baseGrid=solved.state.map(row=>row.map(v=>v===Logic.FILLED?1:0)),rng=localProductRng(diff,seed),recipes=mutationRecipes(base.rows);for(let i=recipes.length-1;i;i--){const j=Math.floor(rng()*(i+1));[recipes[i],recipes[j]]=[recipes[j],recipes[i]]}
    for(let i=0;i<recipes.length;i++){
      const k=Math.floor(rng()*8),grid=Generation.transformGrid(mutatedGrid(baseGrid,recipes[i]),k),puzzle=publicPuzzleFromGrid(grid),profile=exactProfile(puzzle,diff);if(!profile)continue;const checked=validateCandidate(puzzle,DEFAULT_VALIDATION_NODES[puzzle.rows]);if(!checked.accepted)continue;
      const stats={schema:GENERATION_SCHEMA,generatorVersion:VERSION,strategy:'seeded-certified-neighborhood-fallback',size:puzzle.rows,attempts:i+1,randomAttempts:0,fallbackAttempts:i+1,rejected:{structure:0,nonUnique:0,validationBudget:0,logicBlocked:0},fallbackUsed:true,transform:k,mutationCount:recipes[i].length};
      return attachDifficulty(buildResult(seed,puzzle.rows,puzzle,grid,stats,checked.validation,checked.logical),diff,profile,{targetedFallback:true,diversifiedFallback:true,productStrategyVersion:PRODUCT_GENERATION_VERSION,neighborhoodAttempt:i+1})
    }
    return transformedFallback(diff,seed)
  }
  function generateProductPuzzle(diff,options={}){
    diff=String(diff||'').toLowerCase();if(!PRODUCT_DIFFICULTIES.includes(diff))fail(`difficulty must be one of ${PRODUCT_DIFFICULTIES.join(', ')}`);
    const size=PRODUCT_SIZE_BY_DIFFICULTY[diff],rootSeed=`product:${diff}:${randomToken().toString(16).padStart(8,'0')}`;
    for(let i=0;i<3;i++){
      const seed=`${rootSeed}:${i}`,candidate=generateNonogramPuzzle({seed,size}),profile=exactProfile(candidate.puzzle,diff);if(profile)return attachDifficulty(candidate,diff,profile,{targetedFallback:false,productAttempt:i+1})
    }
    if(diff==='hard'){
      for(let i=3;i<8;i++){const seed=`${rootSeed}:${i}`,candidate=generateNonogramPuzzle({seed,size}),profile=exactProfile(candidate.puzzle,diff);if(profile)return attachDifficulty(candidate,diff,profile,{targetedFallback:false,productAttempt:i+1})}
      throw new Error('Unable to generate certified Hard Nonogram candidate')
    }
    if(options&&options.protocolGeneration===1)return transformedFallback(diff,rootSeed);
    if(diff==='easy')return easyDiverseFallback(rootSeed);
    return neighborhoodFallback(diff,rootSeed)
  }

  function publicPuzzleFromCandidate(candidate){
    if(!candidate||candidate.game!=='nonogram'||!candidate.puzzle)fail('candidate must be a generated Nonogram result');
    return canonicalizePublicPuzzle(candidate.puzzle)
  }
  function publicPuzzleFromSession(session){
    if(!session||session.game!=='nonogram'||!session.puzzle)fail('session must contain a Nonogram public puzzle');
    return canonicalizePublicPuzzle(session.puzzle)
  }
  function generationIdentity(candidate){return fingerprintPublicPuzzle(publicPuzzleFromCandidate(candidate))}

  return Object.freeze({
    VERSION,GENERATION_SCHEMA,DEFAULT_SIZES,DEFAULT_MAX_ATTEMPTS,DEFAULT_VALIDATION_NODES,MIN_DENSITY,MAX_DENSITY,
    generateNonogramPuzzle,generateProductPuzzle,PRODUCT_GENERATION_VERSION,PRODUCT_DIFFICULTIES,PRODUCT_SIZE_BY_DIFFICULTY,canonicalizePublicPuzzle,fingerprintPublicPuzzle,publicPuzzleFromGrid,publicPuzzleFromCandidate,publicPuzzleFromSession,generationIdentity,
    _test:Object.freeze({randomBitmap,fallbackBitmap,filledCount,logicalSummary,validateCandidate})
  })
});
