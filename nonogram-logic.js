/*
 * QUADLUD — Mosaïque / Nonogram pure logic engine
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const logicalMove=(typeof module==='object'&&module.exports)?require('./logical-move.js'):(root&&root.QuadludLogicalMove);
  const api=factory(logicalMove);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NonogramLogic=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(LogicalMove){
  'use strict';

  if(!LogicalMove||typeof LogicalMove.defineLogicalMove!=='function')throw new Error('NonogramLogic requires QuadludLogicalMove');

  const VERSION=1;
  const PROOF_SCHEMA=1;
  const UNKNOWN=0, FILLED=1, EMPTY=2;
  const CELL_STATES=Object.freeze({UNKNOWN,FILLED,EMPTY});
  const STATE_NAMES=Object.freeze({[UNKNOWN]:'UNKNOWN',[FILLED]:'FILLED',[EMPTY]:'EMPTY'});
  const TECHNIQUES=Object.freeze({
    EMPTY_LINE:'N_EMPTY_LINE',
    EXACT_FIT:'N_EXACT_FIT',
    OVERLAP:'N_OVERLAP',
    FORCED_EMPTY:'N_FORCED_EMPTY',
    BLOCK_EXTENSION:'N_BLOCK_EXTENSION',
    BLOCK_BOUNDARY:'N_BLOCK_BOUNDARY',
    CONTRADICTION:'N_CONTRADICTION'
  });
  const TECHNIQUE_IDS=Object.freeze(Object.values(TECHNIQUES));

  function fail(message){throw new TypeError(`Invalid Nonogram data: ${message}`)}
  function isInt(value){return Number.isInteger(value)}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
  function freezeDeep(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);for(const child of Object.values(value))freezeDeep(child);return value
  }
  function frozen(value){return freezeDeep(clone(value))}
  function sameArray(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i])}
  function stateName(value){if(!Object.prototype.hasOwnProperty.call(STATE_NAMES,value))fail(`unknown cell state ${value}`);return STATE_NAMES[value]}
  function cellId(row,col){return `r${row}c${col}`}
  function rowId(index){return `r${index}`}
  function columnId(index){return `c${index}`}
  function clueId(axis,lineIndex,clueIndex){return axis==='row'?`row-r${lineIndex}-${clueIndex}`:`column-c${lineIndex}-${clueIndex}`}
  function cellRef(row,col){return LogicalMove.defineEntityRef({kind:'cell',id:cellId(row,col)})}
  function lineRef(axis,index){return LogicalMove.defineEntityRef({kind:axis==='row'?'row':'column',id:axis==='row'?rowId(index):columnId(index)})}
  function clueRef(axis,lineIndex,clueIndex){return LogicalMove.defineEntityRef({kind:'clue',id:clueId(axis,lineIndex,clueIndex)})}

  function validateClues(length,clues,path='clues'){
    if(!isInt(length)||length<=0)fail('line length must be a positive integer');
    if(!Array.isArray(clues))fail(`${path} must be an array`);
    let sum=0;for(let i=0;i<clues.length;i++){const v=clues[i];if(!isInt(v)||v<=0)fail(`${path}[${i}] must be a positive integer`);sum+=v}
    const minimum=sum+Math.max(0,clues.length-1);if(minimum>length)fail(`${path} cannot fit in line length ${length}`);
    return Object.freeze(clues.slice())
  }
  function validateLineState(length,state,path='state'){
    if(!Array.isArray(state)||state.length!==length)fail(`${path} must contain exactly ${length} cells`);
    for(let i=0;i<state.length;i++)if(state[i]!==UNKNOWN&&state[i]!==FILLED&&state[i]!==EMPTY)fail(`${path}[${i}] has invalid cell state ${state[i]}`);
    return Object.freeze(state.slice())
  }
  function validatePuzzle(puzzle){
    if(!puzzle||typeof puzzle!=='object'||Array.isArray(puzzle))fail('puzzle must be an object');
    if(puzzle.game!=='nonogram')fail('puzzle.game must equal "nonogram"');
    const rows=puzzle.rows,cols=puzzle.cols;if(!isInt(rows)||rows<=0||!isInt(cols)||cols<=0)fail('rows and cols must be positive integers');
    if(!Array.isArray(puzzle.rowClues)||puzzle.rowClues.length!==rows)fail(`rowClues must contain ${rows} entries`);
    if(!Array.isArray(puzzle.colClues)||puzzle.colClues.length!==cols)fail(`colClues must contain ${cols} entries`);
    const rowClues=puzzle.rowClues.map((c,i)=>Array.from(validateClues(cols,c,`rowClues[${i}]`)));
    const colClues=puzzle.colClues.map((c,i)=>Array.from(validateClues(rows,c,`colClues[${i}]`)));
    return freezeDeep({game:'nonogram',rows,cols,rowClues,colClues})
  }
  function createState(puzzle,source=null){
    const pub=validatePuzzle(puzzle);if(source==null)return Array.from({length:pub.rows},()=>Array(pub.cols).fill(UNKNOWN));
    if(!Array.isArray(source)||source.length!==pub.rows)fail(`state must contain ${pub.rows} rows`);
    return source.map((row,r)=>Array.from(validateLineState(pub.cols,row,`state[${r}]`)))
  }
  function validateState(puzzle,state){const out=createState(puzzle,state);return freezeDeep(out)}

  function cluesFromBits(bits){
    const out=[];let run=0;for(const bit of bits){if(bit===1)run++;else if(run){out.push(run);run=0}}if(run)out.push(run);return out
  }
  function visibleRuns(state){return cluesFromBits(state.map(v=>v===FILLED?1:0))}
  function lineMinimumLength(clues){return clues.reduce((a,b)=>a+b,0)+Math.max(0,clues.length-1)}
  function placementCompatible(bits,state){for(let i=0;i<bits.length;i++){if(state[i]===FILLED&&bits[i]!==1)return false;if(state[i]===EMPTY&&bits[i]!==0)return false}return true}
  function enumeratePlacements(length,clues,state){
    clues=Array.from(validateClues(length,clues));state=Array.from(validateLineState(length,state));
    if(!clues.length){const bits=Array(length).fill(0);return placementCompatible(bits,state)?[{bits,starts:[]}]:[]}
    const out=[];
    function place(blockIndex,minStart,starts){
      if(blockIndex===clues.length){
        const bits=Array(length).fill(0);for(let i=0;i<clues.length;i++)for(let p=starts[i];p<starts[i]+clues[i];p++)bits[p]=1;
        if(placementCompatible(bits,state))out.push({bits,starts:starts.slice()});return
      }
      let remaining=0;for(let i=blockIndex;i<clues.length;i++)remaining+=clues[i];remaining+=clues.length-blockIndex-1;
      const maxStart=length-remaining;
      for(let start=minStart;start<=maxStart;start++)place(blockIndex+1,start+clues[blockIndex]+1,starts.concat(start))
    }
    place(0,0,[]);return out
  }
  function compatiblePlacements(length,clues,state){return enumeratePlacements(length,clues,state).map(p=>p.bits.slice())}
  function placementStrings(length,clues,state){return enumeratePlacements(length,clues,state).map(p=>p.bits.join(''))}
  function forcedCells(placements,length){
    if(!placements.length)return {filled:[],empty:[]};const filled=[],empty=[];
    for(let i=0;i<length;i++){if(placements.every(p=>p[i]===1))filled.push(i);if(placements.every(p=>p[i]===0))empty.push(i)}return {filled,empty}
  }
  function cellCoordinates(axis,lineIndex,cellIndex){return axis==='row'?[lineIndex,cellIndex]:[cellIndex,lineIndex]}
  function lineStateFromGrid(puzzle,state,axis,index){
    if(axis==='row')return state[index].slice();return Array.from({length:puzzle.rows},(_,r)=>state[r][index])
  }
  function lineCluesFor(puzzle,axis,index){return (axis==='row'?puzzle.rowClues[index]:puzzle.colClues[index]).slice()}
  function lineLengthFor(puzzle,axis){return axis==='row'?puzzle.cols:puzzle.rows}
  function validAxisIndex(puzzle,axis,index){if(axis!=='row'&&axis!=='column')fail('axis must be "row" or "column"');const max=axis==='row'?puzzle.rows:puzzle.cols;if(!isInt(index)||index<0||index>=max)fail(`${axis} index ${index} is out of range`)}

  function hasCompletedVisibleBlock(state,clues){const runs=visibleRuns(state);return runs.some(run=>clues.includes(run))}
  function chooseTechnique(clues,state,conclusions,length){
    if(!clues.length)return TECHNIQUES.EMPTY_LINE;
    if(lineMinimumLength(clues)===length)return TECHNIQUES.EXACT_FIT;
    const fills=conclusions.filter(c=>c.state===FILLED),empties=conclusions.filter(c=>c.state===EMPTY),hasVisibleFill=state.includes(FILLED);
    if(hasVisibleFill&&fills.length)return TECHNIQUES.BLOCK_EXTENSION;
    if(empties.length&&!fills.length&&hasCompletedVisibleBlock(state,clues))return TECHNIQUES.BLOCK_BOUNDARY;
    if(fills.length)return TECHNIQUES.OVERLAP;
    return TECHNIQUES.FORCED_EMPTY
  }
  function visiblePremises(axis,lineIndex,state){
    const out=[];for(let i=0;i<state.length;i++){if(state[i]===UNKNOWN)continue;const [row,col]=cellCoordinates(axis,lineIndex,i);out.push({index:i,cell:{kind:'cell',id:cellId(row,col)},state:state[i],stateName:stateName(state[i])})}return out
  }
  function cluePremises(axis,lineIndex,clues){return clues.map((value,i)=>({index:i,value,entity:{kind:'clue',id:clueId(axis,lineIndex,i)}}))}
  function makeContradiction(axis,index,clues,state){
    return frozen({
      schema:PROOF_SCHEMA,kind:'contradiction',reason:'NO_COMPATIBLE_PLACEMENT',line:{axis,index,entity:{kind:axis==='row'?'row':'column',id:axis==='row'?rowId(index):columnId(index)}},
      clues:clues.slice(),visibleState:state.slice(),premises:{clues:cluePremises(axis,index,clues),visible:visiblePremises(axis,index,state)},compatiblePlacements:[],compatibleCount:0
    })
  }
  function makeDeduction(axis,index,clues,state,placements,forced){
    const conclusions=[];
    for(const i of forced.filled)if(state[i]===UNKNOWN){const [row,col]=cellCoordinates(axis,index,i);conclusions.push({index:i,cell:{kind:'cell',id:cellId(row,col)},state:FILLED,stateName:'FILLED'})}
    for(const i of forced.empty)if(state[i]===UNKNOWN){const [row,col]=cellCoordinates(axis,index,i);conclusions.push({index:i,cell:{kind:'cell',id:cellId(row,col)},state:EMPTY,stateName:'EMPTY'})}
    conclusions.sort((a,b)=>a.index-b.index||a.state-b.state);
    if(!conclusions.length)return null;
    const techniqueId=chooseTechnique(clues,state,conclusions,state.length);
    const lineEntity={kind:axis==='row'?'row':'column',id:axis==='row'?rowId(index):columnId(index)};
    const placementEvidence=placements.map(p=>({bits:p.bits.join(''),blockStarts:p.starts.slice()}));
    const proof={
      schema:PROOF_SCHEMA,kind:'deduction',techniqueId,line:{axis,index,entity:lineEntity},clues:clues.slice(),visibleState:state.slice(),
      premises:{clues:cluePremises(axis,index,clues),visible:visiblePremises(axis,index,state)},compatiblePlacements:placementEvidence,compatibleCount:placementEvidence.length,
      forced:{filled:forced.filled.slice(),empty:forced.empty.slice()},conclusions:clone(conclusions)
    };
    const targets=conclusions.map(c=>c.cell);
    const focus=[{entity:lineEntity,role:'premise'},...proof.premises.clues.map(c=>({entity:c.entity,role:'premise'})),...targets.map(entity=>({entity,role:'target'}))];
    const effects=conclusions.map(c=>({type:'SET_CELL',target:c.cell,state:c.state,stateName:c.stateName}));
    const move=LogicalMove.defineLogicalMove({techniqueId,rank:0,targets,effects,focus,evidence:proof});
    return freezeDeep({...proof,move})
  }
  function analyzeLine(source){
    if(!source||typeof source!=='object'||Array.isArray(source))fail('line analysis requires an object');
    const axis=source.axis,index=source.index; if(axis!=='row'&&axis!=='column')fail('line axis must be "row" or "column"');if(!isInt(index)||index<0)fail('line index must be a non-negative integer');
    const length=source.length,clues=Array.from(validateClues(length,source.clues)),state=Array.from(validateLineState(length,source.state));
    const placements=enumeratePlacements(length,clues,state);if(!placements.length)return Object.freeze({contradiction:makeContradiction(axis,index,clues,state),deduction:null,placements:Object.freeze([])});
    const bits=placements.map(p=>p.bits),forced=forcedCells(bits,length),deduction=makeDeduction(axis,index,clues,state,placements,forced);
    return freezeDeep({contradiction:null,deduction,placements:placements.map(p=>({bits:p.bits.join(''),blockStarts:p.starts.slice()})),forced})
  }
  function analyzeGridLine(puzzle,state,axis,index){
    const pub=validatePuzzle(puzzle),grid=validateState(pub,state);validAxisIndex(pub,axis,index);
    return analyzeLine({axis,index,length:lineLengthFor(pub,axis),clues:lineCluesFor(pub,axis,index),state:lineStateFromGrid(pub,grid,axis,index)})
  }
  function findContradiction(puzzle,state){
    const pub=validatePuzzle(puzzle),grid=validateState(pub,state);
    for(let r=0;r<pub.rows;r++){const a=analyzeLine({axis:'row',index:r,length:pub.cols,clues:pub.rowClues[r],state:grid[r]});if(a.contradiction)return a.contradiction}
    for(let c=0;c<pub.cols;c++){const line=Array.from({length:pub.rows},(_,r)=>grid[r][c]),a=analyzeLine({axis:'column',index:c,length:pub.rows,clues:pub.colClues[c],state:line});if(a.contradiction)return a.contradiction}
    return null
  }
  function nextDeduction(puzzle,state){
    const pub=validatePuzzle(puzzle),grid=validateState(pub,state),contradiction=findContradiction(pub,grid);if(contradiction)return Object.freeze({contradiction,deduction:null});
    for(let r=0;r<pub.rows;r++){const a=analyzeLine({axis:'row',index:r,length:pub.cols,clues:pub.rowClues[r],state:grid[r]});if(a.deduction)return Object.freeze({contradiction:null,deduction:a.deduction})}
    for(let c=0;c<pub.cols;c++){const line=Array.from({length:pub.rows},(_,r)=>grid[r][c]),a=analyzeLine({axis:'column',index:c,length:pub.rows,clues:pub.colClues[c],state:line});if(a.deduction)return Object.freeze({contradiction:null,deduction:a.deduction})}
    return Object.freeze({contradiction:null,deduction:null})
  }
  function parseCellRef(ref){const entity=LogicalMove.defineEntityRef(ref);if(entity.kind!=='cell')fail(`move target ${entity.kind}:${entity.id} is not a cell`);const m=/^r(\d+)c(\d+)$/.exec(entity.id);if(!m)fail(`invalid Nonogram cell id ${entity.id}`);return [Number(m[1]),Number(m[2])]}
  function applyLogicalMove(puzzle,state,moveSource){
    const pub=validatePuzzle(puzzle),grid=createState(pub,state),move=LogicalMove.defineLogicalMove(moveSource);
    for(const effect of move.effects){if(effect.type!=='SET_CELL')fail(`unsupported LogicalMove effect ${effect.type}`);const [row,col]=parseCellRef(effect.target);if(row<0||row>=pub.rows||col<0||col>=pub.cols)fail(`cell ${effect.target.id} is outside puzzle`);if(effect.state!==FILLED&&effect.state!==EMPTY)fail(`SET_CELL state must be FILLED or EMPTY`);const old=grid[row][col];if(old!==UNKNOWN&&old!==effect.state)fail(`SET_CELL conflicts with visible state at ${effect.target.id}`);grid[row][col]=effect.state}
    return grid
  }
  function lineSatisfied(clues,state){return sameArray(clues,cluesFromBits(state.map(v=>v===FILLED?1:0)))}
  function isSolved(puzzle,state){
    const pub=validatePuzzle(puzzle),grid=validateState(pub,state);
    for(let r=0;r<pub.rows;r++)if(!lineSatisfied(pub.rowClues[r],grid[r]))return false;
    for(let c=0;c<pub.cols;c++){const line=Array.from({length:pub.rows},(_,r)=>grid[r][c]);if(!lineSatisfied(pub.colClues[c],line))return false}return true
  }
  function createSession(puzzle,options={}){const pub=validatePuzzle(puzzle),state=createState(pub,options?.state??null);return {game:'nonogram',puzzle:pub,state,nextDeduction(){return nextDeduction(pub,this.state)},apply(move){this.state=applyLogicalMove(pub,this.state,move);return this.state},isSolved(){return isSolved(pub,this.state)}}}
  function solveDeterministic(puzzle,initialState=null,options={}){
    const pub=validatePuzzle(puzzle);let state=createState(pub,initialState),trace=[];const maxSteps=options.maxSteps==null?pub.rows*pub.cols+pub.rows+pub.cols:Number(options.maxSteps);if(!isInt(maxSteps)||maxSteps<0)fail('maxSteps must be a non-negative integer');
    for(let step=0;step<=maxSteps;step++){
      const contradiction=findContradiction(pub,state);if(contradiction)return freezeDeep({status:'contradictory',state,steps:trace,contradiction});
      if(isSolved(pub,state))return freezeDeep({status:'solved',state,steps:trace,contradiction:null});
      if(step===maxSteps)return freezeDeep({status:'budget-exhausted',state,steps:trace,contradiction:null});
      const next=nextDeduction(pub,state);if(!next.deduction)return freezeDeep({status:'stuck',state,steps:trace,contradiction:null});
      state=applyLogicalMove(pub,state,next.deduction.move);trace.push(next.deduction)
    }
    return freezeDeep({status:'budget-exhausted',state,steps:trace,contradiction:null})
  }

  return Object.freeze({
    VERSION,PROOF_SCHEMA,UNKNOWN,FILLED,EMPTY,CELL_STATES,STATE_NAMES,TECHNIQUES,TECHNIQUE_IDS,
    validatePuzzle,createSession,createState,validateState,cluesFromBits,compatiblePlacements,placementStrings,forcedCells,analyzeLine,analyzeGridLine,
    findContradiction,nextDeduction,applyLogicalMove,isSolved,solveDeterministic,
    cellId,rowId,columnId,clueId,cellRef,lineRef,clueRef,
    _test:Object.freeze({enumeratePlacements,lineMinimumLength,visibleRuns,chooseTechnique,lineSatisfied})
  })
});
