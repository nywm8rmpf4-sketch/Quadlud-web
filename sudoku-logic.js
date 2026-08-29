/*
 * QUADLUD — Grille 6 inference engine
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const SIZE=6;
const BOX_ROWS=2;
const BOX_COLS=3;
const DIGITS=Object.freeze([1,2,3,4,5,6]);
const FAMILY_ORDER=Object.freeze(['row','column','box']);
const CONTRADICTION_ORDER=Object.freeze({C1:1,C2:2,C3:3,C4:4});
const RULE_COST=Object.freeze({
  NAKED_SINGLE:1,HIDDEN_SINGLE_ROW:1,HIDDEN_SINGLE_COLUMN:1,HIDDEN_SINGLE_BOX:1,
  LOCKED_CANDIDATE:1,NAKED_SUBSET_2:1,HIDDEN_SUBSET_2:1,NAKED_SUBSET_3:1,HIDDEN_SUBSET_3:1,
  CONTRADICTION_L1:1,COMMON_BRANCH_CONSEQUENCE:1,CONTRADICTION_L2:1
});
const RULE_LEVEL=Object.freeze({
  NAKED_SINGLE:1,HIDDEN_SINGLE_ROW:2,HIDDEN_SINGLE_COLUMN:2,HIDDEN_SINGLE_BOX:2,
  LOCKED_CANDIDATE:3,NAKED_SUBSET_2:4,HIDDEN_SUBSET_2:4,NAKED_SUBSET_3:5,HIDDEN_SUBSET_3:5,
  CONTRADICTION_L1:6,COMMON_BRANCH_CONSEQUENCE:7,CONTRADICTION_L2:8
});
const RULE_PRIORITY=Object.freeze({
  NAKED_SINGLE:10,HIDDEN_SINGLE_ROW:20,HIDDEN_SINGLE_COLUMN:30,HIDDEN_SINGLE_BOX:40,
  LOCKED_CANDIDATE:50,NAKED_SUBSET_2:60,HIDDEN_SUBSET_2:61,NAKED_SUBSET_3:70,HIDDEN_SUBSET_3:71,
  CONTRADICTION_L1:80,COMMON_BRANCH_CONSEQUENCE:90,CONTRADICTION_L2:100
});
const ADVANCED_LIMITS=Object.freeze({
  deterministicClosureSteps:32,
  level1Hypotheses:72,
  commonBranchCells:12,
  commonBranchCandidates:6,
  level2PrimaryHypotheses:24,
  level2SecondaryCells:12,
  level2SecondaryCandidates:3,
  level2BranchEvaluations:240,
  valueStepLogicalDeductions:64
});

function cloneGrid(grid){return grid.map(row=>row.slice())}
function cloneCell(cell){return [cell[0],cell[1]]}
function cellKey(cell){return cell[0]+','+cell[1]}
function candidateKey(cell,value){return cellKey(cell)+'='+value}
function unitRef(family,id){return {family,id,key:family+':'+id}}
function compareCells(a,b){return a[0]-b[0]||a[1]-b[1]}
function uniqStrings(items){return [...new Set((items||[]).filter(Boolean))]}
function combinations(items,k){let out=[];function rec(start,pick){if(pick.length===k){out.push(pick.slice());return}for(let i=start;i<=items.length-(k-pick.length);i++){pick.push(items[i]);rec(i+1,pick);pick.pop()}}rec(0,[]);return out}
function uniqCells(items){let seen=new Set(),out=[];for(const cell of items||[]){if(!Array.isArray(cell)||cell.length!==2)continue;let k=cellKey(cell);if(seen.has(k))continue;seen.add(k);out.push(cloneCell(cell))}return out.sort(compareCells)}
function deepCopy(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function maxRank(items){return Math.max(0,...(items||[]).map(x=>Number(x?.rank)||0))}
function deductionComparator(a,b){
  let ac=a?.conclusions?.[0]||{},bc=b?.conclusions?.[0]||{};
  return (Number(a?.priority)||99)-(Number(b?.priority)||99)
    ||(Number(a?.rank)||0)-(Number(b?.rank)||0)
    ||(a?.premises?.length||0)-(b?.premises?.length||0)
    ||(a?.focusCells?.length||0)-(b?.focusCells?.length||0)
    ||compareCells(ac.cell||[99,99],bc.cell||[99,99])
    ||(Number(ac.value)||0)-(Number(bc.value)||0)
    ||String(a?.signature||'').localeCompare(String(b?.signature||''));
}


function semanticFactKey(type,cell,value){return type+':'+cellKey(cell)+'='+value}
function semanticConclusionComparator(a,b){
  return compareCells(a.cell,b.cell)||(a.type==='VALUE'?0:1)-(b.type==='VALUE'?0:1)||(Number(a.value)||0)-(Number(b.value)||0);
}
function branchCellComparator(session,a,b){
  return session.candidates(a).length-session.candidates(b).length||compareCells(a,b);
}

function validateCell(cell){
  if(!Array.isArray(cell)||cell.length!==2||!Number.isInteger(cell[0])||!Number.isInteger(cell[1])||cell[0]<0||cell[0]>=SIZE||cell[1]<0||cell[1]>=SIZE)throw new Error('Invalid Sudoku cell');
}
function validateDigit(value){if(!Number.isInteger(value)||value<1||value>SIZE)throw new Error('Invalid Sudoku digit')}
function normalizeBoard(board){
  if(!board||!Array.isArray(board.state))throw new Error('Invalid Sudoku board');
  let state=cloneGrid(board.state);
  if(state.length!==SIZE||state.some(row=>!Array.isArray(row)||row.length!==SIZE))throw new Error('Invalid Sudoku dimensions');
  for(const row of state)for(const value of row)if(!Number.isInteger(value)||value<0||value>SIZE)throw new Error('Invalid Sudoku value');
  return {state};
}
function boxIdAt(r,c){return Math.floor(r/BOX_ROWS)*(SIZE/BOX_COLS)+Math.floor(c/BOX_COLS)}
function peerRelations(a,b){
  if(a[0]===b[0]&&a[1]===b[1])return [];
  let out=[];
  if(a[0]===b[0])out.push('ROW');
  if(a[1]===b[1])out.push('COLUMN');
  if(boxIdAt(a[0],a[1])===boxIdAt(b[0],b[1]))out.push('BOX');
  return out;
}
function contradictionComparator(a,b){
  return (CONTRADICTION_ORDER[a.code]||99)-(CONTRADICTION_ORDER[b.code]||99)
    || String(a.unit?.key||'').localeCompare(String(b.unit?.key||''))
    || (Number(a.value)||0)-(Number(b.value)||0)
    || compareCells(a.cells?.[0]||a.cell||[99,99],b.cells?.[0]||b.cell||[99,99]);
}

class Session{
  constructor(board,options={}){
    let normalized=normalizeBoard(board);
    this.state=normalized.state;
    this.options={...options};
    this.factSeq=0;
    this.valueFacts=Array.from({length:SIZE},()=>Array(SIZE).fill(null));
    this.eliminationFacts=Array.from({length:SIZE},()=>Array.from({length:SIZE},()=>new Map()));
    this.factMap=new Map();
    this.dedSeq=0;
    this.appliedDeductions=[];
    this.metricsState={hypothesesTested:0,maxHypothesisDepth:0,closureSteps:0,advancedBudgetHits:0};
    this.unitsByFamily={row:[],column:[],box:[]};
    this.unitMap=new Map();
    this.buildUnits();
    this.seedValueFacts();
    this.propagateVisibleValues();
  }

  buildUnits(){
    for(let r=0;r<SIZE;r++)this.addUnit('row',r,Array.from({length:SIZE},(_,c)=>[r,c]));
    for(let c=0;c<SIZE;c++)this.addUnit('column',c,Array.from({length:SIZE},(_,r)=>[r,c]));
    for(let br=0;br<SIZE;br+=BOX_ROWS)for(let bc=0;bc<SIZE;bc+=BOX_COLS){
      let cells=[];
      for(let r=br;r<br+BOX_ROWS;r++)for(let c=bc;c<bc+BOX_COLS;c++)cells.push([r,c]);
      this.addUnit('box',boxIdAt(br,bc),cells);
    }
  }
  addUnit(family,id,cells){
    let unit={family,id,key:family+':'+id,cells:cells.map(cloneCell)};
    this.unitsByFamily[family].push(unit);
    this.unitMap.set(unit.key,unit);
  }
  unit(family,id){return this.unitMap.get(family+':'+id)||null}
  unitAt(family,cell){
    validateCell(cell);
    let id=family==='row'?cell[0]:family==='column'?cell[1]:family==='box'?boxIdAt(cell[0],cell[1]):null;
    return id==null?null:this.unit(family,id);
  }
  unitsAt(cell){return FAMILY_ORDER.map(family=>this.unitAt(family,cell))}

  registerFact(fact){this.factMap.set(fact.id,fact);return fact}
  seedValueFacts(){
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      let value=this.state[r][c];
      if(!value)continue;
      let fact={id:'F'+(++this.factSeq),type:'VALUE',cell:[r,c],value,source:'board',rank:0,premises:[],dependencies:[],proof:{rule:'VISIBLE_VALUE',premises:[]}};
      this.valueFacts[r][c]=this.registerFact(fact);
    }
  }
  valueFact(cell){validateCell(cell);return this.valueFacts[cell[0]][cell[1]]}
  notCandidateFact(cell,value){validateCell(cell);validateDigit(value);return this.eliminationFacts[cell[0]][cell[1]].get(value)||null}
  fact(id){return this.factMap.get(id)||null}
  factPremise(fact){
    if(!fact)return null;
    return {kind:'FACT',factId:fact.id,type:fact.type,cell:cloneCell(fact.cell),value:fact.value,rank:Number(fact.rank)||0,dependencies:(fact.dependencies||[]).slice()};
  }

  eliminateCandidate(cell,value,meta={}){
    validateCell(cell);validateDigit(value);
    let map=this.eliminationFacts[cell[0]][cell[1]],existing=map.get(value),premises=(meta.premises||[]).filter(Boolean).map(p=>deepCopy(p));
    let dependencies=uniqStrings((meta.dependencies||[]).concat(premises.flatMap(p=>p.dependencies||[]),premises.map(p=>p.factId).filter(Boolean)));
    let causes=(meta.causes||[]).map(deepCopy);
    if(existing){
      existing.dependencies=uniqStrings(existing.dependencies.concat(dependencies));
      let known=new Set(existing.causes.map(x=>JSON.stringify(x)));
      for(const cause of causes){let key=JSON.stringify(cause);if(!known.has(key)){existing.causes.push(cause);known.add(key)}}
      let knownPremises=new Set(existing.premises.map(x=>JSON.stringify(x)));
      for(const premise of premises){let key=JSON.stringify(premise);if(!knownPremises.has(key)){existing.premises.push(premise);knownPremises.add(key)}}
      existing.rank=Math.max(existing.rank||0,Number(meta.rank)||0,...premises.map(p=>Number(p.rank)||0));
      existing.proof={rule:meta.rule||existing.proof?.rule||'CANDIDATE_ELIMINATION',premises:existing.premises.map(deepCopy),causes:existing.causes.map(deepCopy)};
      return existing;
    }
    let fact={
      id:'F'+(++this.factSeq),type:'NOT_CANDIDATE',cell:cloneCell(cell),value,source:meta.source||'deduction',rank:Math.max(Number(meta.rank)||0,...premises.map(p=>Number(p.rank)||0)),
      premises,dependencies,causes,
      proof:{rule:meta.rule||'CANDIDATE_ELIMINATION',premises:premises.map(deepCopy),causes:causes.map(deepCopy)}
    };
    map.set(value,fact);
    return this.registerFact(fact);
  }

  setValue(cell,value,meta={}){
    validateCell(cell);validateDigit(value);
    let [r,c]=cell,existing=this.valueFacts[r][c];
    if(existing){if(existing.value!==value)throw new Error('Sudoku cell already has another value');return existing}
    if(this.state[r][c]!==0&&this.state[r][c]!==value)throw new Error('Sudoku cell already has another value');
    this.state[r][c]=value;
    let premises=(meta.premises||[]).filter(Boolean).map(deepCopy),dependencies=uniqStrings((meta.dependencies||[]).concat(premises.flatMap(p=>p.dependencies||[]),premises.map(p=>p.factId).filter(Boolean)));
    let fact={id:'F'+(++this.factSeq),type:'VALUE',cell:cloneCell(cell),value,source:meta.source||'deduction',rank:Math.max(Number(meta.rank)||0,...premises.map(p=>Number(p.rank)||0)),premises,dependencies,proof:{rule:meta.rule||'VALUE_ASSERTION',premises:premises.map(deepCopy)}};
    this.valueFacts[r][c]=this.registerFact(fact);
    this.propagateValueFact(fact);
    return fact;
  }

  propagateVisibleValues(){
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(this.valueFacts[r][c])this.propagateValueFact(this.valueFacts[r][c]);
  }
  propagateValueFact(valueFact){
    let source=valueFact.cell,value=valueFact.value,premise=this.factPremise(valueFact),created=[];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      let target=[r,c],relations=peerRelations(source,target);
      if(!relations.length)continue;
      let units=relations.map(relation=>relation==='ROW'?unitRef('row',source[0]):relation==='COLUMN'?unitRef('column',source[1]):unitRef('box',boxIdAt(source[0],source[1])));
      let fact=this.eliminateCandidate(target,value,{source:'propagation',rule:'VALUE_PROPAGATION',premises:[premise],dependencies:[valueFact.id],causes:[{kind:'PEER_VALUE',sourceCell:cloneCell(source),value,relations:relations.slice(),units}]});
      created.push(fact);
    }
    return created;
  }

  candidates(cell){
    validateCell(cell);
    let value=this.state[cell[0]][cell[1]];
    if(value)return [value];
    let eliminated=this.eliminationFacts[cell[0]][cell[1]];
    return DIGITS.filter(v=>!eliminated.has(v));
  }
  domain(cell){return this.candidates(cell)}
  emptyCells(){
    let out=[];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(this.state[r][c]===0)out.push([r,c]);
    return out;
  }


  candidateSetPremise(cell){
    validateCell(cell);
    let candidates=this.candidates(cell),excluded=[];
    if(this.state[cell[0]][cell[1]]!==0){
      let fact=this.valueFact(cell);
      return {kind:'CELL_DOMAIN',cell:cloneCell(cell),candidates:candidates.slice(),excluded:[],rank:Number(fact?.rank)||0,dependencies:fact?uniqStrings([fact.id].concat(fact.dependencies||[])):[]};
    }
    for(const value of DIGITS){
      if(candidates.includes(value))continue;
      let fact=this.notCandidateFact(cell,value),premise=this.factPremise(fact);
      if(premise)excluded.push(premise);
    }
    return {kind:'CELL_DOMAIN',cell:cloneCell(cell),candidates:candidates.slice(),excluded,rank:maxRank(excluded),dependencies:uniqStrings(excluded.flatMap(p=>[p.factId].concat(p.dependencies||[])))};
  }
  unitCandidatePremise(unit,value){
    validateDigit(value);
    if(!unit||!this.unitMap.has(unit.key))throw new Error('Invalid Sudoku unit');
    let candidates=[],excluded=[];
    for(const cell of unit.cells){
      let [r,c]=cell,cellValue=this.state[r][c];
      if(cellValue===0&&this.candidates(cell).includes(value)){candidates.push(cloneCell(cell));continue}
      if(cellValue!==0){
        let fact=this.valueFact(cell),premise=this.factPremise(fact);
        if(premise)excluded.push({...premise,reason:'OCCUPIED'});
      }else{
        let fact=this.notCandidateFact(cell,value),premise=this.factPremise(fact);
        if(premise)excluded.push({...premise,reason:'ELIMINATED'});
      }
    }
    return {kind:'UNIT_CANDIDATE_SET',unit:unitRef(unit.family,unit.id),value,candidates:candidates.sort(compareCells),excluded,rank:maxRank(excluded),dependencies:uniqStrings(excluded.flatMap(p=>[p.factId].concat(p.dependencies||[])))};
  }
  makeDeduction(rule,premises,focusCells,focusUnits,conclusions,explanationData={}){
    premises=(premises||[]).filter(Boolean).map(deepCopy);
    let cost=RULE_COST[rule]??1,rank=maxRank(premises)+cost,level=RULE_LEVEL[rule]??1;
    let cs=(conclusions||[]).map(c=>({type:c.type||'VALUE',cell:cloneCell(c.cell),value:c.value,rank}));
    let dependencies=uniqStrings(premises.flatMap(p=>p.dependencies||[]));
    let normalizedUnits=(focusUnits||[]).map(u=>u.key?unitRef(u.family,u.id):deepCopy(u));
    let signature=rule+'|'+normalizedUnits.map(u=>u.key||'').join(',')+'|'+cs.map(c=>c.type+':'+cellKey(c.cell)+'='+c.value).join(';');
    let deduction={schema:1,id:'candidate:'+signature,signature,rule,ruleCost:cost,rank,techniqueLevel:level,techniqueKey:'T'+level,premises,dependencies,focusCells:uniqCells(focusCells),focusUnits:normalizedUnits,conclusions:cs,explanationData:deepCopy(explanationData||{}),priority:RULE_PRIORITY[rule]??50};
    deduction.proof={rule,premises:deepCopy(premises),dependencies:dependencies.slice(),conclusions:deepCopy(cs)};
    return deduction;
  }
  nakedSingleDeductions(){
    let out=[];
    for(const cell of this.emptyCells()){
      let candidates=this.candidates(cell);
      if(candidates.length!==1)continue;
      let value=candidates[0],domain=this.candidateSetPremise(cell);
      out.push(this.makeDeduction('NAKED_SINGLE',[domain],[cell],this.unitsAt(cell),[{type:'VALUE',cell,value}],{cell:cloneCell(cell),candidate:value,candidates:candidates.slice(),eliminated:domain.excluded.map(p=>({value:p.value,factId:p.factId,dependencies:(p.dependencies||[]).slice()}))}));
    }
    return out.sort(deductionComparator);
  }
  hiddenSingleDeductions(family){
    if(!FAMILY_ORDER.includes(family))throw new Error('Invalid Sudoku unit family');
    let rule=family==='row'?'HIDDEN_SINGLE_ROW':family==='column'?'HIDDEN_SINGLE_COLUMN':'HIDDEN_SINGLE_BOX',out=[];
    for(const unit of this.unitsByFamily[family]){
      let present=new Set(unit.cells.map(([r,c])=>this.state[r][c]).filter(Boolean));
      for(const value of DIGITS){
        if(present.has(value))continue;
        let positions=unit.cells.filter(([r,c])=>this.state[r][c]===0&&this.candidates([r,c]).includes(value)).sort(compareCells);
        if(positions.length!==1)continue;
        let cell=positions[0],domain=this.unitCandidatePremise(unit,value);
        out.push(this.makeDeduction(rule,[domain],unit.cells,[unit],[{type:'VALUE',cell,value}],{unit:unitRef(unit.family,unit.id),value,cell:cloneCell(cell),candidateCells:positions.map(cloneCell),excludedCells:domain.excluded.map(p=>({cell:cloneCell(p.cell),reason:p.reason,type:p.type,value:p.value,factId:p.factId,dependencies:(p.dependencies||[]).slice()}))}));
      }
    }
    return out.sort(deductionComparator);
  }
  directDeductions(){
    return [].concat(this.nakedSingleDeductions(),this.hiddenSingleDeductions('row'),this.hiddenSingleDeductions('column'),this.hiddenSingleDeductions('box')).sort(deductionComparator);
  }
  lockedCandidateDeductions(){
    let out=[];
    // R3 — box -> row/column (pointing). A hidden single is deliberately left to R2.
    for(const box of this.unitsByFamily.box){
      let present=new Set(box.cells.map(([r,c])=>this.state[r][c]).filter(Boolean));
      for(const value of DIGITS){
        if(present.has(value))continue;
        let positions=box.cells.filter(([r,c])=>this.state[r][c]===0&&this.candidates([r,c]).includes(value)).sort(compareCells);
        if(positions.length<2)continue;
        for(const family of ['row','column']){
          let ids=[...new Set(positions.map(cell=>family==='row'?cell[0]:cell[1]))];
          if(ids.length!==1)continue;
          let targetUnit=this.unit(family,ids[0]);
          let targets=targetUnit.cells.filter(cell=>boxIdAt(cell[0],cell[1])!==box.id&&this.state[cell[0]][cell[1]]===0&&this.candidates(cell).includes(value)).sort(compareCells);
          if(!targets.length)continue;
          let premise=this.unitCandidatePremise(box,value);
          let conclusions=targets.map(cell=>({type:'NOT_CANDIDATE',cell,value}));
          out.push(this.makeDeduction('LOCKED_CANDIDATE',[premise],box.cells.concat(targets),[box,targetUnit],conclusions,{direction:'BOX_TO_LINE',sourceUnit:unitRef('box',box.id),targetUnit:unitRef(family,targetUnit.id),value,sourceCells:positions.map(cloneCell),eliminatedCells:targets.map(cloneCell)}));
        }
      }
    }
    // R3 — row/column -> box (claiming).
    for(const family of ['row','column'])for(const sourceUnit of this.unitsByFamily[family]){
      let present=new Set(sourceUnit.cells.map(([r,c])=>this.state[r][c]).filter(Boolean));
      for(const value of DIGITS){
        if(present.has(value))continue;
        let positions=sourceUnit.cells.filter(([r,c])=>this.state[r][c]===0&&this.candidates([r,c]).includes(value)).sort(compareCells);
        if(positions.length<2)continue;
        let boxes=[...new Set(positions.map(cell=>boxIdAt(cell[0],cell[1])))];
        if(boxes.length!==1)continue;
        let box=this.unit('box',boxes[0]);
        let targets=box.cells.filter(cell=>(family==='row'?cell[0]!==sourceUnit.id:cell[1]!==sourceUnit.id)&&this.state[cell[0]][cell[1]]===0&&this.candidates(cell).includes(value)).sort(compareCells);
        if(!targets.length)continue;
        let premise=this.unitCandidatePremise(sourceUnit,value);
        let conclusions=targets.map(cell=>({type:'NOT_CANDIDATE',cell,value}));
        out.push(this.makeDeduction('LOCKED_CANDIDATE',[premise],sourceUnit.cells.concat(targets),[sourceUnit,box],conclusions,{direction:'LINE_TO_BOX',sourceUnit:unitRef(family,sourceUnit.id),targetUnit:unitRef('box',box.id),value,sourceCells:positions.map(cloneCell),eliminatedCells:targets.map(cloneCell)}));
      }
    }
    return out.sort(deductionComparator);
  }
  nakedSubsetDeductions(size){
    if(size!==2&&size!==3)throw new Error('Unsupported Sudoku naked subset size');
    let rule=size===2?'NAKED_SUBSET_2':'NAKED_SUBSET_3',out=[];
    for(const family of FAMILY_ORDER)for(const unit of this.unitsByFamily[family]){
      let eligible=unit.cells.filter(cell=>this.state[cell[0]][cell[1]]===0).filter(cell=>{let n=this.candidates(cell).length;return n>=2&&n<=size});
      for(const group of combinations(eligible,size)){
        let candidateSets=group.map(cell=>this.candidates(cell));
        let values=[...new Set(candidateSets.flat())].sort((a,b)=>a-b);
        if(values.length!==size)continue;
        let groupKeys=new Set(group.map(cellKey)),targets=[];
        for(const cell of unit.cells){
          if(groupKeys.has(cellKey(cell))||this.state[cell[0]][cell[1]]!==0)continue;
          for(const value of values)if(this.candidates(cell).includes(value))targets.push({cell:cloneCell(cell),value});
        }
        if(!targets.length)continue;
        let premises=group.map(cell=>this.candidateSetPremise(cell));
        let conclusions=targets.sort((a,b)=>compareCells(a.cell,b.cell)||a.value-b.value).map(x=>({type:'NOT_CANDIDATE',cell:x.cell,value:x.value}));
        out.push(this.makeDeduction(rule,premises,unit.cells,[unit],conclusions,{kind:'NAKED_SUBSET',size,unit:unitRef(unit.family,unit.id),cells:group.map(cloneCell).sort(compareCells),values:values.slice(),domains:group.map((cell,i)=>({cell:cloneCell(cell),candidates:candidateSets[i].slice()})),eliminations:targets.map(x=>({cell:cloneCell(x.cell),value:x.value}))}));
      }
    }
    return out.sort(deductionComparator);
  }
  hiddenSubsetDeductions(size){
    if(size!==2&&size!==3)throw new Error('Unsupported Sudoku hidden subset size');
    let rule=size===2?'HIDDEN_SUBSET_2':'HIDDEN_SUBSET_3',out=[];
    for(const family of FAMILY_ORDER)for(const unit of this.unitsByFamily[family]){
      let present=new Set(unit.cells.map(([r,c])=>this.state[r][c]).filter(Boolean));
      let missing=DIGITS.filter(value=>!present.has(value));
      for(const values of combinations(missing,size)){
        let positionSets=values.map(value=>unit.cells.filter(([r,c])=>this.state[r][c]===0&&this.candidates([r,c]).includes(value)).sort(compareCells));
        // If one selected value already has one position, R2 is the simpler proof.
        if(positionSets.some(cells=>cells.length<2))continue;
        let cells=uniqCells(positionSets.flat());
        if(cells.length!==size)continue;
        let allowed=new Set(values),targets=[];
        for(const cell of cells)for(const value of this.candidates(cell))if(!allowed.has(value))targets.push({cell:cloneCell(cell),value});
        if(!targets.length)continue;
        let premises=values.map(value=>this.unitCandidatePremise(unit,value));
        let conclusions=targets.sort((a,b)=>compareCells(a.cell,b.cell)||a.value-b.value).map(x=>({type:'NOT_CANDIDATE',cell:x.cell,value:x.value}));
        out.push(this.makeDeduction(rule,premises,unit.cells,[unit],conclusions,{kind:'HIDDEN_SUBSET',size,unit:unitRef(unit.family,unit.id),cells:cells.map(cloneCell),values:values.slice(),positions:values.map((value,i)=>({value,cells:positionSets[i].map(cloneCell)})),eliminations:targets.map(x=>({cell:cloneCell(x.cell),value:x.value}))}));
      }
    }
    return out.sort(deductionComparator);
  }
  intermediateDeductions(){
    return [].concat(this.lockedCandidateDeductions(),this.nakedSubsetDeductions(2),this.hiddenSubsetDeductions(2),this.nakedSubsetDeductions(3),this.hiddenSubsetDeductions(3)).sort(deductionComparator);
  }
  deterministicDeductions(){return [].concat(this.directDeductions(),this.intermediateDeductions()).sort(deductionComparator)}
  firstDeterministicDeduction(){
    const groups=[
      ()=>this.nakedSingleDeductions(),
      ()=>this.hiddenSingleDeductions('row'),
      ()=>this.hiddenSingleDeductions('column'),
      ()=>this.hiddenSingleDeductions('box'),
      ()=>this.lockedCandidateDeductions(),
      ()=>this.nakedSubsetDeductions(2),
      ()=>this.hiddenSubsetDeductions(2),
      ()=>this.nakedSubsetDeductions(3),
      ()=>this.hiddenSubsetDeductions(3),
    ];
    for(const build of groups){const ds=build();if(ds.length)return ds[0]}
    return null;
  }
  runDeterministicClosure(options={}){
    const maxSteps=Math.max(0,Number.isInteger(options.maxSteps)?options.maxSteps:ADVANCED_LIMITS.deterministicClosureSteps),steps=[];
    for(let index=0;index<maxSteps;index++){
      const contradiction=this.diagnose();
      if(contradiction)return {status:'contradiction',steps,contradiction,stepCount:steps.length};
      if(!this.emptyCells().length)return {status:'solved',steps,contradiction:null,stepCount:steps.length};
      const deduction=this.firstDeterministicDeduction();
      if(!deduction)return {status:'blocked',steps,contradiction:null,stepCount:steps.length};
      const applied=this.applyDeduction(deduction).deduction;
      if(!applied)return {status:'blocked',steps,contradiction:null,stepCount:steps.length};
      steps.push(deepCopy(applied));
    }
    const contradiction=this.diagnose();
    if(contradiction)return {status:'contradiction',steps,contradiction,stepCount:steps.length};
    if(!this.emptyCells().length)return {status:'solved',steps,contradiction:null,stepCount:steps.length};
    if(this.firstDeterministicDeduction())return {status:'budget-exhausted',steps,contradiction:null,stepCount:steps.length};
    return {status:'blocked',steps,contradiction:null,stepCount:steps.length};
  }
  hypothesisPremise(cell,value,depth,parentAssumptionId=null){
    validateCell(cell);validateDigit(value);
    const id='H'+depth+':'+cellKey(cell)+'='+value+(parentAssumptionId?'@'+parentAssumptionId:'');
    return {kind:'ASSUMPTION',assumptionId:id,cell:cloneCell(cell),value,depth,rank:0,parentAssumptionId:parentAssumptionId||null,dependencies:uniqStrings(parentAssumptionId?[parentAssumptionId]:[])};
  }
  branchFromAssumption(cell,value,depth=1,parentAssumptionId=null,options={}){
    validateCell(cell);validateDigit(value);
    const branch=this.clone(),hypothesis=this.hypothesisPremise(cell,value,depth,parentAssumptionId);
    branch.setValue(cell,value,{source:'hypothesis',rule:'ASSUMPTION',rank:0,premises:[hypothesis],dependencies:uniqStrings([hypothesis.assumptionId].concat(parentAssumptionId||[]))});
    const closure=branch.runDeterministicClosure({maxSteps:options.maxSteps});
    return {session:branch,hypothesis,closure};
  }
  branchProof(run,extra={}){
    const steps=deepCopy(run.closure.steps||[]),contradiction=deepCopy(run.closure.contradiction||null);
    const rank=Math.max(1,...steps.map(d=>Number(d.rank)||0),...((contradiction?.premises)||[]).map(p=>Number(p.rank)||0));
    const dependencies=uniqStrings([run.hypothesis.assumptionId]
      .concat(run.hypothesis.dependencies||[])
      .concat(steps.flatMap(d=>d.dependencies||[]))
      .concat(contradiction?.dependencies||[]));
    return {kind:'HYPOTHESIS_BRANCH',assumption:deepCopy(run.hypothesis),status:run.closure.status,steps,contradiction,rank,dependencies,...deepCopy(extra)};
  }
  branchCells(maxCandidates=SIZE){
    return this.emptyCells().filter(cell=>{const n=this.candidates(cell).length;return n>=2&&n<=maxCandidates}).sort((a,b)=>branchCellComparator(this,a,b));
  }
  contradictionLevel1Deductions(options={}){
    const hypothesisLimit=Math.max(1,Number.isInteger(options.hypothesisLimit)?options.hypothesisLimit:ADVANCED_LIMITS.level1Hypotheses),out=[];
    let tested=0;
    for(const cell of this.branchCells()){
      const values=this.candidates(cell),runs=[];
      for(const value of values){
        if(tested>=hypothesisLimit)break;
        tested++;this.metricsState.hypothesesTested++;this.metricsState.maxHypothesisDepth=Math.max(this.metricsState.maxHypothesisDepth,1);
        const run=this.branchFromAssumption(cell,value,1,null,options);
        this.metricsState.closureSteps+=run.closure.stepCount||0;
        if(run.closure.status==='budget-exhausted')this.metricsState.advancedBudgetHits++;
        runs.push(run);
      }
      const bad=runs.filter(run=>run.closure.status==='contradiction'),survivors=runs.filter(run=>run.closure.status!=='contradiction');
      if(bad.length){
        const testedAll=runs.length===values.length;
        if(testedAll&&survivors.length===1){
          const survivor=survivors[0].hypothesis.value,premises=bad.map(run=>this.branchProof(run));
          out.push(this.makeDeduction('CONTRADICTION_L1',premises,[cell],this.unitsAt(cell),[{type:'VALUE',cell,value:survivor}],{
            cell:cloneCell(cell),candidates:values.slice(),rejected:bad.map(run=>run.hypothesis.value),survivor,branches:premises.map(deepCopy)
          }));
        }else{
          for(const run of bad){
            const premise=this.branchProof(run),value=run.hypothesis.value;
            out.push(this.makeDeduction('CONTRADICTION_L1',[premise],[cell],this.unitsAt(cell),[{type:'NOT_CANDIDATE',cell,value}],{
              cell:cloneCell(cell),candidates:values.slice(),rejected:[value],survivor:null,branches:[deepCopy(premise)]
            }));
          }
        }
      }
      if(out.length&&options.stopAfterFirst)break;
      if(tested>=hypothesisLimit){this.metricsState.advancedBudgetHits++;break}
    }
    return out.sort(deductionComparator);
  }
  newBranchFacts(branchRun){
    const branch=branchRun.session,hypothesisId=branchRun.hypothesis.assumptionId,out=new Map();
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const cell=[r,c],parentValue=this.state[r][c],branchValue=branch.state[r][c];
      if(parentValue===0&&branchValue!==0&&!(r===branchRun.hypothesis.cell[0]&&c===branchRun.hypothesis.cell[1])){
        const fact=branch.valueFact(cell);
        if(fact&&(fact.dependencies||[]).includes(hypothesisId))out.set(semanticFactKey('VALUE',cell,branchValue),{type:'VALUE',cell,value:branchValue,fact:deepCopy(fact)});
      }
      for(const value of DIGITS){
        if(parentValue!==0||!this.candidates(cell).includes(value)||this.notCandidateFact(cell,value))continue;
        const fact=branch.notCandidateFact(cell,value);
        if(fact&&(fact.dependencies||[]).includes(hypothesisId))out.set(semanticFactKey('NOT_CANDIDATE',cell,value),{type:'NOT_CANDIDATE',cell,value,fact:deepCopy(fact)});
      }
    }
    return out;
  }
  commonConsequenceDeductions(options={}){
    const cellLimit=Math.max(1,Number.isInteger(options.cellLimit)?options.cellLimit:ADVANCED_LIMITS.commonBranchCells),candidateLimit=Math.max(2,Number.isInteger(options.candidateLimit)?options.candidateLimit:ADVANCED_LIMITS.commonBranchCandidates),out=[];
    let checkedCells=0;
    for(const cell of this.branchCells(candidateLimit)){
      if(checkedCells++>=cellLimit){this.metricsState.advancedBudgetHits++;break}
      const values=this.candidates(cell),runs=[];
      for(const value of values){
        this.metricsState.hypothesesTested++;this.metricsState.maxHypothesisDepth=Math.max(this.metricsState.maxHypothesisDepth,1);
        const run=this.branchFromAssumption(cell,value,1,null,options);
        this.metricsState.closureSteps+=run.closure.stepCount||0;
        if(run.closure.status==='budget-exhausted')this.metricsState.advancedBudgetHits++;
        if(run.closure.status==='contradiction'){runs.length=0;break}
        runs.push(run);
      }
      if(runs.length!==values.length)continue;
      const maps=runs.map(run=>this.newBranchFacts(run));
      if(!maps.length)continue;
      const common=[...maps[0].keys()].filter(key=>maps.every(map=>map.has(key)));
      const facts=common.map(key=>maps[0].get(key)).sort(semanticConclusionComparator);
      for(const commonFact of facts){
        const branchEvidence=runs.map((run,index)=>this.branchProof(run,{commonFact:deepCopy(maps[index].get(semanticFactKey(commonFact.type,commonFact.cell,commonFact.value))) }));
        const premise={kind:'COMMON_BRANCHES',branchCell:cloneCell(cell),candidateValues:values.slice(),branches:branchEvidence,rank:maxRank(branchEvidence),dependencies:uniqStrings(branchEvidence.flatMap(b=>b.dependencies||[]))};
        out.push(this.makeDeduction('COMMON_BRANCH_CONSEQUENCE',[premise],[cell,commonFact.cell],this.unitsAt(commonFact.cell),[{type:commonFact.type,cell:commonFact.cell,value:commonFact.value}],{
          branchCell:cloneCell(cell),candidateValues:values.slice(),commonFact:{type:commonFact.type,cell:cloneCell(commonFact.cell),value:commonFact.value},branches:branchEvidence.map(deepCopy)
        }));
      }
      if(out.length)break;
    }
    return out.sort(deductionComparator);
  }
  nestedContradictionWitness(primaryRun,context={},options={}){
    if(primaryRun.closure.status==='contradiction'||primaryRun.closure.status==='budget-exhausted')return null;
    const branch=primaryRun.session,candidateLimit=Math.max(2,Number.isInteger(options.secondaryCandidateLimit)?options.secondaryCandidateLimit:ADVANCED_LIMITS.level2SecondaryCandidates),cellLimit=Math.max(1,Number.isInteger(options.secondaryCellLimit)?options.secondaryCellLimit:ADVANCED_LIMITS.level2SecondaryCells);
    const cells=branch.branchCells(candidateLimit).slice(0,cellLimit);
    let checked=0;
    for(const cell of cells){
      if(context.remainingBranches!=null&&context.remainingBranches<=0)return null;
      checked++;
      const values=branch.candidates(cell),runs=[];
      for(const value of values){
        if(context.remainingBranches!=null&&context.remainingBranches<=0)return null;
        if(context.remainingBranches!=null)context.remainingBranches--;
        this.metricsState.hypothesesTested++;this.metricsState.maxHypothesisDepth=Math.max(this.metricsState.maxHypothesisDepth,2);
        const run=branch.branchFromAssumption(cell,value,2,primaryRun.hypothesis.assumptionId,options);
        this.metricsState.closureSteps+=run.closure.stepCount||0;
        if(run.closure.status==='budget-exhausted')this.metricsState.advancedBudgetHits++;
        runs.push(run);
        if(run.closure.status!=='contradiction')break;
      }
      if(runs.length===values.length&&runs.every(run=>run.closure.status==='contradiction')){
        const proofs=runs.map(run=>this.branchProof(run));
        return {kind:'NESTED_CONTRADICTION_WITNESS',cell:cloneCell(cell),candidateValues:values.slice(),branches:proofs,rank:maxRank(proofs),dependencies:uniqStrings(proofs.flatMap(p=>p.dependencies||[])),checkedCells:checked};
      }
    }
    return null;
  }
  contradictionLevel2Deductions(options={}){
    const primaryLimit=Math.max(1,Number.isInteger(options.primaryHypothesisLimit)?options.primaryHypothesisLimit:ADVANCED_LIMITS.level2PrimaryHypotheses),context={remainingBranches:Number.isInteger(options.branchEvaluationLimit)?options.branchEvaluationLimit:ADVANCED_LIMITS.level2BranchEvaluations},out=[];
    let tested=0;
    for(const cell of this.branchCells()){
      const values=this.candidates(cell),records=[];
      for(const value of values){
        if(tested>=primaryLimit||context.remainingBranches<=0)break;
        tested++;this.metricsState.hypothesesTested++;this.metricsState.maxHypothesisDepth=Math.max(this.metricsState.maxHypothesisDepth,1);
        const primaryRun=this.branchFromAssumption(cell,value,1,null,options);
        this.metricsState.closureSteps+=primaryRun.closure.stepCount||0;
        if(primaryRun.closure.status==='budget-exhausted'){this.metricsState.advancedBudgetHits++;records.push({run:primaryRun,witness:null});continue}
        if(primaryRun.closure.status==='contradiction'){records.push({run:primaryRun,witness:null,level1:true});continue}
        const witness=this.nestedContradictionWitness(primaryRun,context,options);
        records.push({run:primaryRun,witness});
      }
      if(records.some(record=>record.level1)){
        if(tested>=primaryLimit||context.remainingBranches<=0){this.metricsState.advancedBudgetHits++;break}
        continue;
      }
      const bad=records.filter(record=>record.witness),survivors=records.filter(record=>!record.witness);
      if(bad.length){
        const testedAll=records.length===values.length;
        const makePremise=record=>{
          const primary=this.branchProof(record.run,{nestedWitness:deepCopy(record.witness)});
          primary.rank=Math.max(primary.rank||0,Number(record.witness.rank)||0);
          primary.dependencies=uniqStrings((primary.dependencies||[]).concat(record.witness.dependencies||[]));
          return primary;
        };
        if(testedAll&&survivors.length===1){
          const survivor=survivors[0].run.hypothesis.value,premises=bad.map(makePremise);
          out.push(this.makeDeduction('CONTRADICTION_L2',premises,[cell].concat(bad.map(record=>record.witness.cell)),this.unitsAt(cell),[{type:'VALUE',cell,value:survivor}],{
            cell:cloneCell(cell),candidates:values.slice(),rejected:bad.map(record=>record.run.hypothesis.value),survivor,branches:premises.map(deepCopy)
          }));
        }else{
          for(const record of bad){
            const premise=makePremise(record),value=record.run.hypothesis.value;
            out.push(this.makeDeduction('CONTRADICTION_L2',[premise],[cell,record.witness.cell],this.unitsAt(cell),[{type:'NOT_CANDIDATE',cell,value}],{
              cell:cloneCell(cell),candidates:values.slice(),rejected:[value],survivor:null,branches:[deepCopy(premise)]
            }));
          }
        }
      }
      if(out.length)break;
      if(tested>=primaryLimit||context.remainingBranches<=0){this.metricsState.advancedBudgetHits++;break}
    }
    return out.sort(deductionComparator);
  }
  advancedDeductions(options={}){
    const level1=this.contradictionLevel1Deductions({...options,stopAfterFirst:true});if(level1.length)return level1;
    const common=this.commonConsequenceDeductions(options);if(common.length)return common;
    return this.contradictionLevel2Deductions(options);
  }
  nextDeduction(options={}){
    const contradiction=this.diagnose();
    if(contradiction)return {contradiction,deduction:null};
    const deterministic=this.firstDeterministicDeduction();
    if(deterministic)return {contradiction:null,deduction:deterministic};
    const advanced=this.advancedDeductions(options);
    return {contradiction:null,deduction:advanced[0]||null};
  }
  nextValueStep(options={}){
    const work=this.clone(),supporting=[];
    const maxLogicalDeductions=Math.max(1,Number.isInteger(options.valueStepLogicalDeductions)?options.valueStepLogicalDeductions:ADVANCED_LIMITS.valueStepLogicalDeductions);
    for(let i=0;i<maxLogicalDeductions;i++){
      const result=work.nextDeduction(options);
      if(result.contradiction)return {status:'contradiction',contradiction:deepCopy(result.contradiction),deduction:null,primaryDeduction:supporting.length?deepCopy(supporting[0]):null,supportingDeductions:deepCopy(supporting),logicalSteps:i,metrics:work.metrics()};
      const deduction=result.deduction;
      if(!deduction)return {status:'blocked',contradiction:null,deduction:null,primaryDeduction:supporting.length?deepCopy(supporting[0]):null,supportingDeductions:deepCopy(supporting),logicalSteps:i,metrics:work.metrics()};
      const valueConclusions=(deduction.conclusions||[]).filter(c=>c.type==='VALUE');
      if(valueConclusions.length){
        if(valueConclusions.length!==1)throw new Error('Sudoku value step must conclude at most one value');
        return {status:'value',contradiction:null,deduction:deepCopy(deduction),primaryDeduction:deepCopy(supporting[0]||deduction),supportingDeductions:deepCopy(supporting),logicalSteps:i+1,metrics:work.metrics()};
      }
      const applied=work.applyDeduction(deduction);
      if(!applied?.deduction)return {status:'blocked',contradiction:null,deduction:null,primaryDeduction:supporting.length?deepCopy(supporting[0]):null,supportingDeductions:deepCopy(supporting),logicalSteps:i,metrics:work.metrics()};
      supporting.push(deepCopy(applied.deduction));
    }
    return {status:'budget-exhausted',contradiction:null,deduction:null,primaryDeduction:supporting.length?deepCopy(supporting[0]):null,supportingDeductions:deepCopy(supporting),logicalSteps:maxLogicalDeductions,metrics:work.metrics()};
  }
  proveValue(cell,value,options={}){
    validateCell(cell);validateDigit(value);
    const [r,c]=cell,parentContradiction=this.diagnose();
    if(parentContradiction)return {status:'contradictory',cell:cloneCell(cell),value,contradiction:deepCopy(parentContradiction),deduction:null,supportingDeductions:[],metrics:this.metrics()};
    const existing=this.state[r][c];
    if(existing){
      const fact=this.valueFact(cell);
      return existing===value
        ?{status:'proven',cell:cloneCell(cell),value,fact:fact?deepCopy(fact):null,deduction:null,supportingDeductions:[],metrics:this.metrics()}
        :{status:'incorrect',cell:cloneCell(cell),value,reason:'different-visible-value',provenValue:existing,fact:fact?deepCopy(fact):null,deduction:null,supportingDeductions:[],metrics:this.metrics()};
    }
    const parentElimination=this.notCandidateFact(cell,value);
    if(parentElimination)return {status:'incorrect',cell:cloneCell(cell),value,reason:'candidate-eliminated',fact:deepCopy(parentElimination),deduction:null,supportingDeductions:[],metrics:this.metrics()};

    const work=this.clone(),supporting=[];
    const maxLogicalDeductions=Math.max(1,Number.isInteger(options.valueStepLogicalDeductions)?options.valueStepLogicalDeductions:ADVANCED_LIMITS.valueStepLogicalDeductions);
    const resultBase=(status,extra={})=>({status,cell:cloneCell(cell),value,supportingDeductions:deepCopy(supporting),metrics:work.metrics(),...extra});
    for(let i=0;i<maxLogicalDeductions;i++){
      const contradiction=work.diagnose();
      if(contradiction)return resultBase('contradictory',{contradiction:deepCopy(contradiction),deduction:null,logicalSteps:i});
      const knownValue=work.state[r][c];
      if(knownValue){
        const fact=work.valueFact(cell);
        return knownValue===value
          ?resultBase('proven',{fact:fact?deepCopy(fact):null,deduction:supporting.length?deepCopy(supporting[supporting.length-1]):null,logicalSteps:i})
          :resultBase('incorrect',{reason:'different-value-proven',provenValue:knownValue,fact:fact?deepCopy(fact):null,deduction:supporting.length?deepCopy(supporting[supporting.length-1]):null,logicalSteps:i});
      }
      const eliminated=work.notCandidateFact(cell,value);
      if(eliminated)return resultBase('incorrect',{reason:'candidate-eliminated',fact:deepCopy(eliminated),deduction:supporting.length?deepCopy(supporting[supporting.length-1]):null,logicalSteps:i});

      const next=work.nextDeduction(options);
      if(next.contradiction)return resultBase('contradictory',{contradiction:deepCopy(next.contradiction),deduction:null,logicalSteps:i});
      const deduction=next.deduction;
      if(!deduction)return resultBase('not-yet-proven',{reason:'blocked',deduction:null,logicalSteps:i});
      const conclusions=deduction.conclusions||[];
      const exact=conclusions.find(x=>x.type==='VALUE'&&compareCells(x.cell,cell)===0&&x.value===value);
      if(exact)return resultBase('proven',{deduction:deepCopy(deduction),logicalSteps:i+1});
      const other=conclusions.find(x=>x.type==='VALUE'&&compareCells(x.cell,cell)===0&&x.value!==value);
      if(other)return resultBase('incorrect',{reason:'different-value-proven',provenValue:other.value,deduction:deepCopy(deduction),logicalSteps:i+1});
      const rejected=conclusions.find(x=>x.type==='NOT_CANDIDATE'&&compareCells(x.cell,cell)===0&&x.value===value);
      if(rejected)return resultBase('incorrect',{reason:'candidate-eliminated',deduction:deepCopy(deduction),logicalSteps:i+1});
      const applied=work.applyDeduction(deduction);
      if(!applied?.deduction)return resultBase('not-yet-proven',{reason:'blocked',deduction:null,logicalSteps:i});
      supporting.push(deepCopy(applied.deduction));
    }
    return resultBase('not-yet-proven',{reason:'budget-exhausted',deduction:null,logicalSteps:maxLogicalDeductions});
  }
  solveLogically(options={}){
    let state=cloneGrid(this.state),steps=[],maxPlacements=Math.max(0,Number.isInteger(options.maxPlacements)?options.maxPlacements:SIZE*SIZE);
    let aggregate={deductionsByRule:{},maxTechniqueLevel:0,maxRank:0,hypothesesTested:0,maxHypothesisDepth:0,closureSteps:0,advancedBudgetHits:0,candidatesEliminated:0,valuesProven:0};
    const countDeduction=d=>{
      if(!d)return;let rule=String(d.rule||'UNKNOWN');aggregate.deductionsByRule[rule]=(aggregate.deductionsByRule[rule]||0)+1;aggregate.maxTechniqueLevel=Math.max(aggregate.maxTechniqueLevel,Number(d.techniqueLevel)||0);aggregate.maxRank=Math.max(aggregate.maxRank,Number(d.rank)||0);
      for(const conclusion of d.conclusions||[]){if(conclusion.type==='NOT_CANDIDATE')aggregate.candidatesEliminated++;if(conclusion.type==='VALUE')aggregate.valuesProven++;}
    };
    const absorbMetrics=m=>{if(!m)return;aggregate.hypothesesTested+=Number(m.hypothesesTested)||0;aggregate.maxHypothesisDepth=Math.max(aggregate.maxHypothesisDepth,Number(m.maxHypothesisDepth)||0);aggregate.closureSteps+=Number(m.closureSteps)||0;aggregate.advancedBudgetHits+=Number(m.advancedBudgetHits)||0};
    for(let placement=0;placement<=maxPlacements;placement++){
      let session=new Session({state},this.options),contradiction=session.diagnose();
      if(contradiction)return {status:'contradictory',solved:false,state:cloneGrid(state),steps:deepCopy(steps),contradiction:deepCopy(contradiction),metrics:{...deepCopy(aggregate),status:'contradictory',steps:steps.length,limits:deepCopy(ADVANCED_LIMITS)}};
      if(!state.flat().includes(0))return {status:'solved',solved:true,state:cloneGrid(state),steps:deepCopy(steps),contradiction:null,metrics:{...deepCopy(aggregate),status:'solved',steps:steps.length,limits:deepCopy(ADVANCED_LIMITS)}};
      if(placement===maxPlacements)return {status:'budget-exhausted',solved:false,state:cloneGrid(state),steps:deepCopy(steps),contradiction:null,metrics:{...deepCopy(aggregate),status:'budget-exhausted',steps:steps.length,limits:deepCopy(ADVANCED_LIMITS)}};
      let result=session.nextValueStep(options);absorbMetrics(result.metrics);
      if(result.status!=='value'||!result.deduction){
        let status=result.status==='contradiction'?'contradictory':result.status||'blocked';
        return {status,solved:false,state:cloneGrid(state),steps:deepCopy(steps),contradiction:result.contradiction?deepCopy(result.contradiction):null,metrics:{...deepCopy(aggregate),status,steps:steps.length,limits:deepCopy(ADVANCED_LIMITS)}};
      }
      let values=(result.deduction.conclusions||[]).filter(c=>c.type==='VALUE');
      if(values.length!==1)throw new Error('Sudoku logical solve step must conclude exactly one value');
      for(const d of result.supportingDeductions||[])countDeduction(d);countDeduction(result.deduction);
      let conclusion=values[0],[r,c]=conclusion.cell;if(state[r][c]!==0)throw new Error('Sudoku logical solve targets a non-empty cell');state[r][c]=conclusion.value;
      steps.push({index:steps.length+1,cell:cloneCell(conclusion.cell),value:conclusion.value,rule:result.deduction.rule,techniqueLevel:result.deduction.techniqueLevel,rank:result.deduction.rank,primaryDeduction:deepCopy(result.primaryDeduction),supportingDeductions:deepCopy(result.supportingDeductions||[]),deduction:deepCopy(result.deduction),logicalSteps:result.logicalSteps,metrics:deepCopy(result.metrics||{})});
    }
    throw new Error('Unreachable Sudoku logical solve state');
  }
  metrics(){
    let deductionsByRule={},maxTechniqueLevel=0,maxRank=0,valuesProven=0,candidatesEliminatedByDeduction=0;
    for(const d of this.appliedDeductions){let rule=String(d.rule||'UNKNOWN');deductionsByRule[rule]=(deductionsByRule[rule]||0)+1;maxTechniqueLevel=Math.max(maxTechniqueLevel,Number(d.techniqueLevel)||0);maxRank=Math.max(maxRank,Number(d.rank)||0);for(const c of d.conclusions||[]){if(c.type==='VALUE')valuesProven++;if(c.type==='NOT_CANDIDATE')candidatesEliminatedByDeduction++;}}
    let contradiction=this.diagnose(),filledValues=this.state.flat().filter(Boolean).length;
    return {...deepCopy(this.metricsState),limits:deepCopy(ADVANCED_LIMITS),appliedDeductions:this.appliedDeductions.length,filledValues,eliminatedCandidates:this.eliminationFacts.flat().reduce((sum,map)=>sum+map.size,0),deductionsByRule,maxTechniqueLevel,maxRank,valuesProven,candidatesEliminatedByDeduction,stateStatus:contradiction?'contradictory':filledValues===SIZE*SIZE?'solved':'in-progress'};
  }
  applyDeduction(deduction){
    if(!deduction||!Array.isArray(deduction.conclusions)||!deduction.conclusions.length)return {deduction:null,automatic:[]};
    let applied=deepCopy(deduction);applied.id='D'+(++this.dedSeq);
    for(const conclusion of applied.conclusions){
      if(conclusion.type==='VALUE'){
        let [r,c]=conclusion.cell;
        if(this.state[r][c]===conclusion.value)continue;
        if(this.state[r][c]!==0)throw new Error('Sudoku deduction conflicts with board state');
        this.setValue(conclusion.cell,conclusion.value,{source:'deduction',rule:applied.rule,rank:applied.rank,premises:applied.premises,dependencies:uniqStrings((applied.dependencies||[]).concat(applied.id))});
      }else if(conclusion.type==='NOT_CANDIDATE'){
        this.eliminateCandidate(conclusion.cell,conclusion.value,{source:'deduction',rule:applied.rule,rank:applied.rank,premises:applied.premises,dependencies:uniqStrings((applied.dependencies||[]).concat(applied.id)),causes:[{kind:'LOGICAL_DEDUCTION',deductionId:applied.id,rule:applied.rule}]});
      }else throw new Error('Unsupported Sudoku conclusion');
    }
    this.appliedDeductions.push(applied);
    return {deduction:applied,automatic:[]};
  }

  duplicateContradictions(){
    let out=[];
    for(const family of FAMILY_ORDER)for(const unit of this.unitsByFamily[family]){
      for(const value of DIGITS){
        let cells=unit.cells.filter(([r,c])=>this.state[r][c]===value).sort(compareCells);
        if(cells.length<2)continue;
        let premises=cells.map(cell=>this.factPremise(this.valueFact(cell))).filter(Boolean);
        out.push({schema:1,code:'C1',kind:'DUPLICATE_VALUE',unit:unitRef(unit.family,unit.id),value,cells:cells.map(cloneCell),premises,dependencies:uniqStrings(premises.flatMap(p=>[p.factId].concat(p.dependencies||[]))),proof:{rule:'DUPLICATE_VALUE',premises:premises.map(deepCopy)}});
      }
    }
    return out;
  }
  zeroCandidateContradictions(){
    let out=[];
    for(const cell of this.emptyCells()){
      let candidates=this.candidates(cell);
      if(candidates.length)continue;
      let premises=DIGITS.map(v=>this.factPremise(this.notCandidateFact(cell,v))).filter(Boolean);
      out.push({schema:1,code:'C2',kind:'NO_CANDIDATE',cell:cloneCell(cell),cells:[cloneCell(cell)],premises,dependencies:uniqStrings(premises.flatMap(p=>[p.factId].concat(p.dependencies||[]))),proof:{rule:'NO_CANDIDATE',premises:premises.map(deepCopy)}});
    }
    return out;
  }
  noPositionContradictions(){
    let out=[];
    for(const family of FAMILY_ORDER)for(const unit of this.unitsByFamily[family]){
      let present=new Set(unit.cells.map(([r,c])=>this.state[r][c]).filter(Boolean));
      for(const value of DIGITS){
        if(present.has(value))continue;
        let empty=unit.cells.filter(([r,c])=>this.state[r][c]===0);
        let possible=empty.filter(cell=>this.candidates(cell).includes(value));
        if(possible.length)continue;
        let premises=empty.map(cell=>this.factPremise(this.notCandidateFact(cell,value))).filter(Boolean);
        out.push({schema:1,code:'C3',kind:'NO_POSITION_FOR_VALUE',unit:unitRef(unit.family,unit.id),value,cells:empty.map(cloneCell),premises,dependencies:uniqStrings(premises.flatMap(p=>[p.factId].concat(p.dependencies||[]))),proof:{rule:'NO_POSITION_FOR_VALUE',premises:premises.map(deepCopy)}});
      }
    }
    return out;
  }
  incompatibleValueContradictions(){
    let out=[];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      let valueFact=this.valueFacts[r][c];if(!valueFact)continue;
      let eliminated=this.notCandidateFact([r,c],valueFact.value);if(!eliminated)continue;
      let premises=[this.factPremise(valueFact),this.factPremise(eliminated)];
      out.push({schema:1,code:'C4',kind:'INCOMPATIBLE_VALUE',cell:[r,c],cells:[[r,c]],value:valueFact.value,premises,dependencies:uniqStrings(premises.flatMap(p=>[p.factId].concat(p.dependencies||[]))),proof:{rule:'INCOMPATIBLE_VALUE',premises:premises.map(deepCopy)}});
    }
    return out;
  }
  contradictions(){return [].concat(this.duplicateContradictions(),this.zeroCandidateContradictions(),this.noPositionContradictions(),this.incompatibleValueContradictions()).sort(contradictionComparator)}
  diagnose(){return this.contradictions()[0]||null}

  clone(){
    let copy=Object.create(Session.prototype);
    copy.state=cloneGrid(this.state);
    copy.options={...this.options};
    copy.factSeq=this.factSeq;
    copy.valueFacts=this.valueFacts.map(row=>row.map(f=>f?deepCopy(f):null));
    copy.eliminationFacts=this.eliminationFacts.map(row=>row.map(map=>{let m=new Map();for(const [value,fact] of map)m.set(value,deepCopy(fact));return m}));
    copy.dedSeq=this.dedSeq;
    copy.appliedDeductions=deepCopy(this.appliedDeductions);
    copy.metricsState=deepCopy(this.metricsState);
    copy.factMap=new Map();
    for(const row of copy.valueFacts)for(const fact of row)if(fact)copy.factMap.set(fact.id,fact);
    for(const row of copy.eliminationFacts)for(const map of row)for(const fact of map.values())copy.factMap.set(fact.id,fact);
    copy.unitsByFamily={row:[],column:[],box:[]};copy.unitMap=new Map();copy.buildUnits();
    return copy;
  }
  snapshot(){
    let values=[],eliminations=[];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      let valueFact=this.valueFacts[r][c];if(valueFact)values.push(deepCopy(valueFact));
      for(const fact of this.eliminationFacts[r][c].values())eliminations.push(deepCopy(fact));
    }
    values.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    eliminations.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    return {schema:1,state:cloneGrid(this.state),facts:{values,eliminations},deductions:{sequence:this.dedSeq,applied:deepCopy(this.appliedDeductions)}};
  }
}

function createSession(board,options){return new Session(board,options)}

root.SudokuLogic={
  VERSION:5,SIZE,BOX_ROWS,BOX_COLS,DIGITS,FAMILY_ORDER,RULE_COST,RULE_LEVEL,RULE_PRIORITY,ADVANCED_LIMITS,createSession,Session,
  helpers:{boxIdAt,peerRelations,unitRef,candidateKey,combinations,contradictionComparator,deductionComparator}
};
if(typeof module!=='undefined'&&module.exports)module.exports=root.SudokuLogic;
})(typeof globalThis!=='undefined'?globalThis:this);
