/*
 * QUADLUD — Queens inference engine
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const VALUE_EMPTY=0, VALUE_X=1, VALUE_QUEEN=2;
const FAMILY_ORDER=['region','row','column'];
const FAMILY_LABEL={region:'region',row:'row',column:'column'};
const RULE_COST={
  SINGLETON:0, QUEEN_PROPAGATION:0,
  LOCKED_UNIT:1, COMMON_CONFLICT:1, HALL_SET:1, LOCAL_CAPACITY:1, NO_SUPPORT:1, MIXED_HALL:1,
  ASSUMPTION_CONTRADICTION:2
};
const TECHNIQUE_LEVEL={T0:0,T1:1,T2:2,T3:3};

function cloneGrid(g){return g.map(row=>row.slice())}
function cellKey(cell){return cell[0]+','+cell[1]}
function uniqCells(cells){let seen=new Set(),out=[];for(const c of cells||[]){let k=cellKey(c);if(!seen.has(k)){seen.add(k);out.push([c[0],c[1]])}}return out}
function uniqStrings(a){return [...new Set((a||[]).filter(Boolean))]}
function max0(a){return a.length?Math.max(...a):0}
function combinations(items,k){let out=[];function go(start,p){if(p.length===k){out.push(p.slice());return}for(let i=start;i<=items.length-(k-p.length);i++){p.push(items[i]);go(i+1,p);p.pop()}}go(0,[]);return out}
function plainUnit(u){return {family:u.family,id:u.id,key:u.key,cells:u.cells.map(c=>c.slice())}}
function unitRef(family,id){return {family,id,key:family+':'+id}}
function compareCells(a,b){return a[0]-b[0]||a[1]-b[1]}

function conflictReasons(reg,a,b){
  if(a[0]===b[0]&&a[1]===b[1])return [];
  let out=[],dr=Math.abs(a[0]-b[0]),dc=Math.abs(a[1]-b[1]);
  if(a[0]===b[0])out.push('ROW');
  if(a[1]===b[1])out.push('COLUMN');
  if(reg[a[0]][a[1]]===reg[b[0]][b[1]])out.push('REGION');
  if(dr===1&&dc===1)out.push('ADJACENCY');
  return out
}
function cellsConflict(reg,a,b){return conflictReasons(reg,a,b).length>0}

class Session{
  constructor(board,options={}){
    if(!board||!Number.isInteger(board.n)||!Array.isArray(board.reg)||!Array.isArray(board.state))throw new Error('Invalid Queens board');
    this.n=board.n;this.reg=cloneGrid(board.reg);this.state=cloneGrid(board.state);
    if(this.reg.length!==this.n||this.state.length!==this.n||this.reg.some(r=>r.length!==this.n)||this.state.some(r=>r.length!==this.n))throw new Error('Invalid Queens dimensions');
    this.options={maxHallSize:this.n,maxMixedHallSize:4,maxHypothesisSteps:12,...options};
    this.factSeq=0;this.dedSeq=0;this.facts=Array.from({length:this.n},()=>Array(this.n).fill(null));this.appliedDeductions=[];this.candidatesCache=new Map();this.candidatePremiseCache=new Map();this.unresolvedUnitsCache=new Map();this.candidateCellsCache=null;this.diagnoseCacheValid=false;this.diagnoseCache=null;
    this.regionIds=[...new Set(this.reg.flat())].sort((a,b)=>a-b);
    this.unitsByFamily={row:[],column:[],region:[]};this.unitMap=new Map();
    this.buildUnits();this.seedFacts();this.propagateAllQueens();
  }
  buildUnits(){
    for(let r=0;r<this.n;r++)this.addUnit('row',r,Array.from({length:this.n},(_,c)=>[r,c]));
    for(let c=0;c<this.n;c++)this.addUnit('column',c,Array.from({length:this.n},(_,r)=>[r,c]));
    for(const id of this.regionIds){let cells=[];for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.reg[r][c]===id)cells.push([r,c]);this.addUnit('region',id,cells)}
  }
  addUnit(family,id,cells){let u={family,id,key:family+':'+id,cells};this.unitsByFamily[family].push(u);this.unitMap.set(u.key,u)}
  unit(family,id){return this.unitMap.get(family+':'+id)||null}
  unitIdAt(family,r,c){if(family==='row')return r;if(family==='column')return c;return this.reg[r][c]}
  unitAt(family,r,c){return this.unit(family,this.unitIdAt(family,r,c))}
  seedFacts(){
    for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++){
      let v=this.state[r][c];if(v!==VALUE_X&&v!==VALUE_QUEEN)continue;
      this.facts[r][c]={id:'F'+(++this.factSeq),cell:[r,c],value:v,rank:0,source:'board',deductionId:null,hypothesis:false}
    }
  }
  clone(){
    let x=Object.create(Session.prototype);x.n=this.n;x.reg=cloneGrid(this.reg);x.state=cloneGrid(this.state);x.options={...this.options};x.factSeq=this.factSeq;x.dedSeq=this.dedSeq;
    x.facts=this.facts.map(row=>row.map(f=>f?{...f,cell:f.cell.slice()}:null));x.appliedDeductions=this.appliedDeductions.map(d=>JSON.parse(JSON.stringify(d)));x.candidatesCache=new Map();x.candidatePremiseCache=new Map();x.unresolvedUnitsCache=new Map();x.candidateCellsCache=null;x.diagnoseCacheValid=false;x.diagnoseCache=null;
    x.regionIds=this.regionIds.slice();x.unitsByFamily={row:[],column:[],region:[]};x.unitMap=new Map();x.buildUnits();return x
  }
  snapshot(){return {state:cloneGrid(this.state)}}
  factAt(cell){return this.facts[cell[0]][cell[1]]}
  addFact(cell,value,meta={}){
    let [r,c]=cell,existing=this.facts[r][c];
    if(existing){return existing.value===value?existing:null}
    if(this.state[r][c]!==VALUE_EMPTY&&this.state[r][c]!==value)return null;
    this.state[r][c]=value;this.candidatesCache.clear();this.candidatePremiseCache.clear();this.unresolvedUnitsCache.clear();this.candidateCellsCache=null;this.diagnoseCacheValid=false;this.diagnoseCache=null;let f={id:'F'+(++this.factSeq),cell:[r,c],value,rank:Math.max(0,Number(meta.rank)||0),source:meta.source||'deduction',deductionId:meta.deductionId||null,hypothesis:!!meta.hypothesis};this.facts[r][c]=f;return f
  }
  hasQueen(unit){return unit.cells.some(([r,c])=>this.state[r][c]===VALUE_QUEEN)}
  queens(unit){return unit.cells.filter(([r,c])=>this.state[r][c]===VALUE_QUEEN)}
  candidates(unit){let cached=this.candidatesCache.get(unit.key);if(cached)return cached;if(this.hasQueen(unit)){this.candidatesCache.set(unit.key,[]);return []}let out=unit.cells.filter(([r,c])=>this.state[r][c]===VALUE_EMPTY);this.candidatesCache.set(unit.key,out);return out}
  candidateCells(){if(this.candidateCellsCache)return this.candidateCellsCache;let out=[];for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.state[r][c]===VALUE_EMPTY)out.push([r,c]);this.candidateCellsCache=out;return out}
  unresolvedUnits(family){let cached=this.unresolvedUnitsCache.get(family);if(cached)return cached;let out=this.unitsByFamily[family].filter(u=>!this.hasQueen(u));this.unresolvedUnitsCache.set(family,out);return out}
  factPremise(f,kind='fact'){
    if(!f)return null;return {kind,factId:f.id,cell:f.cell.slice(),value:f.value,rank:f.hypothesis?0:f.rank,hypothesis:!!f.hypothesis,dependencies:f.hypothesis?[]:(f.deductionId?[f.deductionId]:[])}
  }
  candidateSetPremise(unit){
    let cached=this.candidatePremiseCache.get(unit.key);if(cached)return cached;
    let candidates=this.candidates(unit).slice().sort(compareCells),excluded=[],deps=[],ranks=[];
    for(const cell of unit.cells){if(candidates.some(x=>x[0]===cell[0]&&x[1]===cell[1]))continue;let f=this.factAt(cell);if(f&&f.value===VALUE_X){excluded.push(this.factPremise(f));if(!f.hypothesis){ranks.push(f.rank);if(f.deductionId)deps.push(f.deductionId)}}}
    let premise={kind:'candidate_set',unit:unitRef(unit.family,unit.id),candidates:candidates.map(c=>c.slice()),excluded,rank:max0(ranks),dependencies:uniqStrings(deps)};this.candidatePremiseCache.set(unit.key,premise);return premise
  }
  queenPremise(cell){let f=this.factAt(cell);return f?this.factPremise(f,'queen'):null}
  makeDeduction(rule,techniqueLevel,premises,focusCells,focusUnits,conclusions,explanationData={},priority=50,clarity=50,automatic=false){
    premises=(premises||[]).filter(Boolean);let cost=RULE_COST[rule]??1,rank=max0(premises.map(p=>Number(p.rank)||0))+cost,deps=[];
    for(const p of premises)deps.push(...(p.dependencies||[]));
    let cs=(conclusions||[]).filter(c=>Number.isInteger(c.cell?.[0])&&Number.isInteger(c.cell?.[1])).map(c=>({cell:[c.cell[0],c.cell[1]],value:c.value,rank}));
    return {schema:1,id:'candidate:'+rule+':'+cs.map(c=>cellKey(c.cell)+'='+c.value).join('|'),rule,ruleCost:cost,rank,techniqueLevel,techniqueKey:'T'+techniqueLevel,premises,dependencies:uniqStrings(deps),focusCells:uniqCells(focusCells),focusUnits:(focusUnits||[]).map(u=>u.key?unitRef(u.family,u.id):{...u}),conclusions:cs,explanationData:JSON.parse(JSON.stringify(explanationData||{})),priority,clarity,automatic:!!automatic}
  }
  applyDeduction(d){
    if(!d||!d.conclusions?.length)return {deduction:null,automatic:[]};
    let applied={...JSON.parse(JSON.stringify(d)),id:'D'+(++this.dedSeq)},autoConclusions=[];let queens=[];
    for(const c of applied.conclusions){let [r,col]=c.cell;if(this.state[r][col]===c.value)continue;if(this.state[r][col]!==VALUE_EMPTY)continue;let f=this.addFact(c.cell,c.value,{rank:applied.rank,deductionId:applied.id});if(f&&c.value===VALUE_QUEEN)queens.push(f)}
    this.appliedDeductions.push(applied);
    for(const q of queens){let auto=this.propagateQueen(q.cell,q);if(auto)autoConclusions.push(auto)}
    return {deduction:applied,automatic:autoConclusions}
  }
  propagateAllQueens(){
    let autos=[];for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.state[r][c]===VALUE_QUEEN){let f=this.facts[r][c],d=this.propagateQueen([r,c],f);if(d)autos.push(d)}return autos
  }
  propagateQueen(cell,queenFact){
    if(!queenFact)return null;let conclusions=[];
    for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++){
      if(r===cell[0]&&c===cell[1])continue;if(this.state[r][c]!==VALUE_EMPTY)continue;if(cellsConflict(this.reg,cell,[r,c]))conclusions.push({cell:[r,c],value:VALUE_X})
    }
    if(!conclusions.length)return null;
    let p=this.factPremise(queenFact,'queen'),d=this.makeDeduction('QUEEN_PROPAGATION',0,[p],conclusions.map(x=>x.cell),FAMILY_ORDER.map(f=>this.unitAt(f,cell[0],cell[1])),conclusions,{queen:cell.slice()},0,0,true);
    d={...d,id:'D'+(++this.dedSeq),rank:queenFact.hypothesis?0:queenFact.rank};for(const c of d.conclusions)c.rank=d.rank;
    for(const c of d.conclusions)this.addFact(c.cell,VALUE_X,{rank:d.rank,deductionId:d.id,hypothesis:!!queenFact.hypothesis});this.appliedDeductions.push(d);return d
  }
  assume(cell,value){
    if(this.state[cell[0]][cell[1]]!==VALUE_EMPTY)return false;let f=this.addFact(cell,value,{rank:0,source:'assumption',hypothesis:true});if(!f)return false;if(value===VALUE_QUEEN)this.propagateQueen(cell,f);return true
  }
  directViolations(){
    let qs=[];for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.state[r][c]===VALUE_QUEEN)qs.push([r,c]);let out=[];
    for(let i=0;i<qs.length;i++)for(let j=i+1;j<qs.length;j++){let reasons=conflictReasons(this.reg,qs[i],qs[j]);if(reasons.length){let ps=[this.queenPremise(qs[i]),this.queenPremise(qs[j])].filter(Boolean);out.push({kind:'rule_violation',rule:reasons[0],cells:[qs[i],qs[j]],reasons,premises:ps,rank:max0(ps.map(p=>p.rank))})}}
    return out
  }
  unitContradictions(){
    let out=[];for(const fam of FAMILY_ORDER)for(const u of this.unresolvedUnits(fam)){let c=this.candidates(u);if(!c.length){let p=this.candidateSetPremise(u);out.push({kind:'no_candidate',rule:'NO_CANDIDATE',unit:unitRef(u.family,u.id),cells:u.cells.map(x=>x.slice()),premises:[p],rank:p.rank})}}return out
  }
  hallDeficiencies(maxSize=this.n){
    let out=[];for(const sourceFamily of FAMILY_ORDER)for(const targetFamily of FAMILY_ORDER){if(sourceFamily===targetFamily)continue;let units=this.unresolvedUnits(sourceFamily),top=Math.min(maxSize,units.length);
      for(let N=2;N<=top;N++)for(const group of combinations(units,N)){
        let targets=new Set(),valid=true,ps=[];for(const u of group){let cs=this.candidates(u);if(!cs.length){valid=false;break}ps.push(this.candidateSetPremise(u));for(const [r,c] of cs)targets.add(this.unitIdAt(targetFamily,r,c))}
        if(valid&&targets.size<N){out.push({kind:'hall_contradiction',rule:'HALL_CONTRADICTION',sourceFamily,targetFamily,sourceUnits:group.map(u=>unitRef(u.family,u.id)),targetUnits:[...targets].map(id=>unitRef(targetFamily,id)),premises:ps,rank:max0(ps.map(p=>p.rank))});return out}
      }
    }return out
  }
  capacityWitnesses(overloadOnly=false){
    let out=[];for(const size of [2,3]){let cap=size===2?1:2;if(this.n<size)continue;for(let r0=0;r0<=this.n-size;r0++)for(let c0=0;c0<=this.n-size;c0++){
      let block=[];for(let r=r0;r<r0+size;r++)for(let c=c0;c<c0+size;c++)block.push([r,c]);let set=new Set(block.map(cellKey));
      for(const family of FAMILY_ORDER){let mandatory=[],premises=[];
        for(const u of this.unitsByFamily[family]){
          let q=this.queens(u);if(q.length){let inside=q.find(c=>set.has(cellKey(c)));if(inside){mandatory.push(u);premises.push(this.queenPremise(inside))}continue}
          let cs=this.candidates(u);if(cs.length&&cs.every(c=>set.has(cellKey(c)))){mandatory.push(u);premises.push(this.candidateSetPremise(u))}
        }
        if(overloadOnly&&mandatory.length>cap){out.push({kind:'capacity_contradiction',rule:'CAPACITY_CONTRADICTION',size,capacity:cap,block,sourceFamily:family,sourceUnits:mandatory.map(u=>unitRef(u.family,u.id)),premises:premises.filter(Boolean),rank:max0(premises.filter(Boolean).map(p=>p.rank))});return out}
        if(!overloadOnly&&mandatory.length===cap)out.push({size,capacity:cap,block,sourceFamily:family,sourceUnits:mandatory,premises:premises.filter(Boolean),set})
      }
    }}return out
  }
  diagnoseLogical(){if(this.diagnoseCacheValid)return this.diagnoseCache;let result=this.directViolations()[0]||this.unitContradictions()[0]||this.hallDeficiencies(this.n)[0]||this.capacityWitnesses(true)[0]||null;this.diagnoseCache=result;this.diagnoseCacheValid=true;return result}
  findSingletons(){
    let out=[];for(const family of FAMILY_ORDER)for(const u of this.unresolvedUnits(family)){let cs=this.candidates(u);if(cs.length!==1)continue;let p=this.candidateSetPremise(u),cell=cs[0];out.push(this.makeDeduction('SINGLETON',0,[p],u.cells,[u],[{cell,value:VALUE_QUEEN}],{unit:unitRef(family,u.id),candidate:cell.slice(),candidateSet:cs},10,10))}return out
  }
  findLockedUnits(){
    let out=[],pairs=[['region','row'],['region','column'],['row','region'],['column','region']];
    for(const [sourceFamily,targetFamily] of pairs)for(const u of this.unresolvedUnits(sourceFamily)){let cs=this.candidates(u);if(cs.length<2)continue;let ids=[...new Set(cs.map(([r,c])=>this.unitIdAt(targetFamily,r,c)))];if(ids.length!==1)continue;let tu=this.unit(targetFamily,ids[0]),conclusions=[];
      for(const cell of this.candidates(tu)){if(this.unitIdAt(sourceFamily,cell[0],cell[1])!==u.id)conclusions.push({cell,value:VALUE_X})}
      if(!conclusions.length)continue;let p=this.candidateSetPremise(u);out.push(this.makeDeduction('LOCKED_UNIT',1,[p],cs.concat(conclusions.map(x=>x.cell)),[u,tu],conclusions,{sourceUnit:unitRef(u.family,u.id),targetUnit:unitRef(tu.family,tu.id),sourceCandidates:cs,eliminated:conclusions.map(x=>x.cell)},20,10))
    }return out
  }
  commonConflictDeductions(maxSourceCandidates=this.n,rule='COMMON_CONFLICT',techniqueLevel=null,priority=30){
    let out=[],all=this.candidateCells();for(const family of FAMILY_ORDER)for(const u of this.unresolvedUnits(family)){let cs=this.candidates(u);if(cs.length<2||cs.length>maxSourceCandidates)continue;let p=this.candidateSetPremise(u),level=techniqueLevel==null?(cs.length<=3?1:2):techniqueLevel;
      for(const target of all){if(cs.some(c=>cellKey(c)===cellKey(target)))continue;let conflicts=cs.map(c=>({candidate:c.slice(),reasons:conflictReasons(this.reg,c,target)}));if(conflicts.every(x=>x.reasons.length)){out.push(this.makeDeduction(rule,level,[p],cs.concat([target]),[u],[{cell:target,value:VALUE_X}],{sourceUnit:unitRef(u.family,u.id),sourceCandidates:cs,target:target.slice(),conflicts},priority+(level-1)*8,20+(level-1)*5))}
    }}return out
  }
  findNoSupport(){
    let out=[],all=this.candidateCells();for(const family of FAMILY_ORDER)for(const u of this.unresolvedUnits(family)){let cs=this.candidates(u);if(cs.length<2)continue;let p=this.candidateSetPremise(u);
      for(const target of all){if(cs.some(c=>cellKey(c)===cellKey(target)))continue;let conflicts=cs.map(c=>({candidate:c.slice(),reasons:conflictReasons(this.reg,c,target)}));if(conflicts.every(x=>x.reasons.length)){out.push(this.makeDeduction('NO_SUPPORT',2,[p],cs.concat([target]),[u,this.unitAt('row',target[0],target[1]),this.unitAt('column',target[0],target[1]),this.unitAt('region',target[0],target[1])],[{cell:target,value:VALUE_X}],{supportUnit:unitRef(u.family,u.id),supportCandidates:cs,target:target.slice(),conflicts},70,40))}
    }}return out
  }
  hallDeductions(sizes=null){
    let out=[],wanted=sizes?new Set(sizes):null;for(const sourceFamily of FAMILY_ORDER)for(const targetFamily of FAMILY_ORDER){if(sourceFamily===targetFamily)continue;let units=this.unresolvedUnits(sourceFamily),top=Math.min(this.options.maxHallSize,units.length);
      for(let N=2;N<=top;N++){if(wanted&&!wanted.has(N))continue;for(const group of combinations(units,N)){
        let targets=new Set(),ps=[],valid=true;for(const u of group){let cs=this.candidates(u);if(!cs.length){valid=false;break}ps.push(this.candidateSetPremise(u));for(const [r,c] of cs)targets.add(this.unitIdAt(targetFamily,r,c))}if(!valid||targets.size!==N)continue;
        let sourceIds=new Set(group.map(u=>u.id)),conclusions=[];for(const tid of targets){let tu=this.unit(targetFamily,tid);for(const cell of this.candidates(tu))if(!sourceIds.has(this.unitIdAt(sourceFamily,cell[0],cell[1])))conclusions.push({cell,value:VALUE_X})}
        conclusions=dedupeConclusions(conclusions);if(!conclusions.length)continue;let level=N===2?1:N<=4?2:3,priority=N===2?40:N===3?50:80;
        out.push(this.makeDeduction('HALL_SET',level,ps,group.flatMap(u=>this.candidates(u)).concat(conclusions.map(x=>x.cell)),group.concat([...targets].map(id=>this.unit(targetFamily,id))),conclusions,{size:N,sourceFamily,targetFamily,sourceUnits:group.map(u=>unitRef(u.family,u.id)),targetUnits:[...targets].map(id=>unitRef(targetFamily,id)),sourceCandidates:Object.fromEntries(group.map(u=>[u.key,this.candidates(u)])),eliminated:conclusions.map(x=>x.cell)},priority,25))
      }}
    }return out
  }
  findLocalCapacity(size){
    let out=[];for(const w of this.capacityWitnesses(false)){if(w.size!==size)continue;let sourceIds=new Set(w.sourceUnits.map(u=>u.id)),conclusions=[];
      for(const cell of w.block)if(this.state[cell[0]][cell[1]]===VALUE_EMPTY&&!sourceIds.has(this.unitIdAt(w.sourceFamily,cell[0],cell[1])))conclusions.push({cell,value:VALUE_X});
      conclusions=dedupeConclusions(conclusions);if(!conclusions.length)continue;let level=size===2?1:2;out.push(this.makeDeduction('LOCAL_CAPACITY',level,w.premises,w.block.concat(conclusions.map(x=>x.cell)),w.sourceUnits,conclusions,{size,capacity:w.capacity,block:w.block,sourceFamily:w.sourceFamily,sourceUnits:w.sourceUnits.map(u=>unitRef(u.family,u.id)),eliminated:conclusions.map(x=>x.cell)},size===2?45:60,30))
    }return out
  }
  findMixedHall(){
    let out=[],zones=this.unresolvedUnits('region'),maxN=Math.min(this.options.maxMixedHallSize,zones.length);
    for(let N=3;N<=maxN;N++)for(const group of combinations(zones,N)){
      let allCandidates=group.flatMap(u=>this.candidates(u));if(group.some(u=>!this.candidates(u).length))continue;let rows=[...new Set(allCandidates.map(c=>c[0]))],cols=[...new Set(allCandidates.map(c=>c[1]))],found=null;
      for(let kr=1;kr<N&&!found;kr++){let kc=N-kr;if(rows.length<kr||cols.length<kc)continue;for(const rs of combinations(rows,kr)){let rset=new Set(rs);for(const cs of combinations(cols,kc)){let cset=new Set(cs);if(allCandidates.every(([r,c])=>rset.has(r)||cset.has(c))){found={rows:rs,columns:cs};break}}if(found)break}}
      if(!found)continue;let sourceIds=new Set(group.map(u=>u.id)),conclusions=[];for(const cell of this.candidateCells())if(!sourceIds.has(this.reg[cell[0]][cell[1]])&&(found.rows.includes(cell[0])||found.columns.includes(cell[1])))conclusions.push({cell,value:VALUE_X});conclusions=dedupeConclusions(conclusions);if(!conclusions.length)continue;
      let ps=group.map(u=>this.candidateSetPremise(u));out.push(this.makeDeduction('MIXED_HALL',3,ps,allCandidates.concat(conclusions.map(x=>x.cell)),group,conclusions,{size:N,sourceUnits:group.map(u=>unitRef('region',u.id)),rows:found.rows,columns:found.columns,sourceCandidates:Object.fromEntries(group.map(u=>[u.key,this.candidates(u)])),eliminated:conclusions.map(x=>x.cell)},90,45))
    }return out
  }
  enumerateDirect(){
    return [].concat(this.findSingletons(),this.findLockedUnits(),this.commonConflictDeductions(this.n,'COMMON_CONFLICT',null,30),this.hallDeductions([2]),this.findLocalCapacity(2),this.hallDeductions([3]),this.findLocalCapacity(3),this.findNoSupport(),this.hallDeductions(Array.from({length:Math.max(0,this.n-3)},(_,i)=>i+4)),this.findMixedHall())
  }
  closeSingletons(limit=this.n*this.n){let trace=[];for(let i=0;i<limit;i++){let bad=this.diagnoseLogical();if(bad)return {bad,trace};let d=this.findSingletons().sort(deductionComparator)[0];if(!d)return {bad:null,trace};let a=this.applyDeduction(d);trace.push(a.deduction,...a.automatic)}return {bad:this.diagnoseLogical(),trace}}
  bestDirect(){
    // Lazy selection preserves rank-first semantics while avoiding expensive Hall searches
    // whenever a strictly unbeatable lower-rank/lower-technique proof is already available.
    let pool=this.findSingletons(),best=pool.sort(deductionComparator)[0]||null;if(best?.rank===0)return best;
    pool=pool.concat(this.findLockedUnits(),this.commonConflictDeductions(this.n,'COMMON_CONFLICT',null,30),this.hallDeductions([2]),this.findLocalCapacity(2));
    best=pool.sort(deductionComparator)[0]||null;if(best?.rank===1&&best.techniqueLevel<=1)return best;
    pool=pool.concat(this.hallDeductions([3]),this.findLocalCapacity(3),this.findNoSupport());best=pool.sort(deductionComparator)[0]||null;
    if(best?.rank===1&&best.techniqueLevel<=2)return best;
    for(let N=4;N<=this.n;N++){let hs=this.hallDeductions([N]);if(hs.length){pool=pool.concat(hs);best=pool.sort(deductionComparator)[0]||best;if(best?.rank===1&&best.techniqueLevel<=2)return best}}
    pool=pool.concat(this.findMixedHall());return pool.sort(deductionComparator)[0]||null
  }
  hypothesisDirect(){
    // Hypothetical branches deliberately use explainable bounded families; they never
    // invoke any hidden answer lookup. This is enough to expose Hall/capacity/no-candidate
    // contradictions while keeping Tutor latency predictable.
    let pool=[].concat(this.findSingletons(),this.findLockedUnits(),this.commonConflictDeductions(Math.min(this.n,4),'COMMON_CONFLICT',null,20),this.hallDeductions([2]),this.findLocalCapacity(2),this.hallDeductions([3]),this.findLocalCapacity(3),this.findNoSupport());
    return pool.sort(deductionComparator)[0]||null
  }
  directProofFor(cell,value){
    let matches=[],add=ds=>{for(const d of ds||[])if(d.conclusions?.some(x=>x.cell[0]===cell[0]&&x.cell[1]===cell[1]&&x.value===value))matches.push(d)},best=()=>matches.sort(deductionComparator)[0]||null;
    add(this.findSingletons());let b=best();if(b?.rank===0)return b;
    add(this.findLockedUnits());add(this.commonConflictDeductions(this.n,'COMMON_CONFLICT',null,30));add(this.hallDeductions([2]));add(this.findLocalCapacity(2));b=best();if(b?.rank===1&&b.techniqueLevel<=1)return b;
    add(this.hallDeductions([3]));add(this.findLocalCapacity(3));add(this.findNoSupport());b=best();if(b?.rank===1&&b.techniqueLevel<=2)return b;
    for(let N=4;N<=this.n;N++){add(this.hallDeductions([N]));b=best();if(b?.rank===1&&b.techniqueLevel<=2)return b}
    add(this.findMixedHall());return best()
  }
  hypothesisEvaluation(cell,value,reportBudget=true){
    let fork=this.clone(),branchStart=fork.appliedDeductions.length;if(!fork.assume(cell,value))return {status:'blocked',trace:[]};
    // Preserve the immediate visible-only consequences of the hypothesis itself.
    // In particular, assuming a lighthouse may create a QUEEN_PROPAGATION deduction
    // before the first explicit branch search step. This deduction is part of the proof.
    let trace=fork.appliedDeductions.slice(branchStart).map(cloneBranchDeduction),close=fork.closeSingletons();trace.push(...close.trace);if(close.bad)return {status:'contradictory',witness:close.bad,trace};
    let limit=Math.min(Math.max(0,Number(this.options.maxHypothesisSteps)||0),this.n*this.n),guard=0;
    for(;guard<limit;guard++){
      let bad=fork.diagnoseLogical();if(bad)return {status:'contradictory',witness:bad,trace};let d=fork.hypothesisDirect();if(!d)return {status:'blocked',trace};let a=fork.applyDeduction(d);trace.push(a.deduction,...a.automatic);close=fork.closeSingletons();trace.push(...close.trace);if(close.bad)return {status:'contradictory',witness:close.bad,trace}
    }
    let bad=fork.diagnoseLogical();if(bad)return {status:'contradictory',witness:bad,trace};
    if(!reportBudget)return {status:'blocked',trace};
    return fork.hypothesisDirect()?{status:'budget-exhausted',trace}:{status:'blocked',trace}
  }
  hypothesisContradiction(cell,value){let result=this.hypothesisEvaluation(cell,value,false);return result.status==='contradictory'?{witness:result.witness,trace:result.trace}:null}
  contradictionDeduction(cell,assumption,result){
    if(!result)return null;let witness=result.witness,conclusion=assumption===VALUE_QUEEN?VALUE_X:VALUE_QUEEN;
    let ps=[{kind:'assumption',cell:cell.slice(),value:assumption,rank:0,hypothesis:true,dependencies:[]}].concat((witness.premises||[]).filter(Boolean));
    let subtype=witness.rule==='HALL_CONTRADICTION'?'HALL_CONTRADICTION':witness.rule==='CAPACITY_CONTRADICTION'?'CAPACITY_CONTRADICTION':'ASSUMPTION_CONTRADICTION';
    let d=this.makeDeduction('ASSUMPTION_CONTRADICTION',3,ps,[cell].concat(witness.cells||[]),witness.unit?[this.unit(witness.unit.family,witness.unit.id)]:[],[{cell,value:conclusion}],{assumption:{cell:cell.slice(),value:assumption},contradictionType:subtype,witness:stripWitness(witness),trace:(result.trace||[]).filter(Boolean).map(cloneBranchDeduction)},100,55);
    // A hypothetical branch has its own temporary deduction ids. They belong in
    // explanationData.trace, never in the public dependency graph of the real session.
    let realIds=new Set(this.appliedDeductions.map(x=>x.id));
    for(const p of d.premises||[])p.dependencies=(p.dependencies||[]).filter(id=>realIds.has(id));
    d.dependencies=uniqStrings((d.premises||[]).flatMap(p=>p.dependencies||[]));return d
  }
  findContradictionsDetailed(limit=2){
    let deductions=[],budgetHit=false;for(const cell of this.candidateCells())for(const assumption of [VALUE_QUEEN,VALUE_X]){let evaluation=this.hypothesisEvaluation(cell,assumption);if(evaluation.status==='budget-exhausted'){budgetHit=true;continue}if(evaluation.status!=='contradictory')continue;deductions.push(this.contradictionDeduction(cell,assumption,{witness:evaluation.witness,trace:evaluation.trace}));if(deductions.length>=limit)return {deductions,budgetHit}}return {deductions,budgetHit}
  }
  findContradictions(limit=2){return this.findContradictionsDetailed(limit).deductions}
  nextDeduction(){
    let contradiction=this.diagnoseLogical();if(contradiction)return {contradiction};
    let best=this.bestDirect();if(best&&best.rank<=2)return {deduction:best};
    let hypo=this.findContradictions().sort(deductionComparator),all=best?[best].concat(hypo):hypo;all.sort(deductionComparator);return {deduction:all[0]||null}
  }
  proveAction(cell,value){
    let direct=this.directViolations();if(direct.length)return {status:'contradictory',contradiction:stripWitness(direct[0])};
    let [r,c]=cell;if(this.state[r][c]!==VALUE_EMPTY)return {status:this.state[r][c]===value?'proven':'incorrect'};
    if(value===VALUE_QUEEN){for(let rr=0;rr<this.n;rr++)for(let cc=0;cc<this.n;cc++)if(this.state[rr][cc]===VALUE_QUEEN&&cellsConflict(this.reg,[r,c],[rr,cc]))return {status:'incorrect',contradiction:{kind:'rule_violation',cells:[[r,c],[rr,cc]],reasons:conflictReasons(this.reg,[r,c],[rr,cc])}}}
    let currentBad=this.diagnoseLogical();if(currentBad)return {status:'contradictory',contradiction:stripWitness(currentBad)};
    // Close all cost-0 consequences on a clone before certifying a local proof.
    // This catches states whose contradiction is revealed only by a forced singleton.
    let closureCheck=this.clone(),closure=closureCheck.closeSingletons(),closureBad=closure.bad||closureCheck.diagnoseLogical();
    if(closureBad)return {status:'contradictory',contradiction:stripWitness(closureBad)};
    let directProof=this.directProofFor([r,c],value);if(directProof)return {status:'proven',deduction:directProof};
    // For a non-direct action, test the requested value before using failure of its
    // opposite as a proof. This prevents the "both assumptions fail" false-positive.
    let chosen=this.hypothesisContradiction([r,c],value);if(chosen)return {status:'contradictory',contradiction:stripWitness(chosen.witness)};
    let opposite=value===VALUE_QUEEN?VALUE_X:VALUE_QUEEN,result=this.hypothesisContradiction([r,c],opposite);if(result)return {status:'proven',deduction:this.contradictionDeduction([r,c],opposite,result)};
    return {status:'not-yet-proven'}
  }
  metrics(){
    let byRule={},maxRank=0,maxTechniqueLevel=0,contradictions=0;for(const d of this.appliedDeductions){if(d.automatic)continue;byRule[d.rule]=(byRule[d.rule]||0)+1;maxRank=Math.max(maxRank,d.rank||0);maxTechniqueLevel=Math.max(maxTechniqueLevel,d.techniqueLevel||0);if(d.rule==='ASSUMPTION_CONTRADICTION')contradictions++}
    return {maxRank,maxTechniqueLevel,deductionsByRule:byRule,contradictions}
  }
}

function dedupeConclusions(cs){let m=new Map();for(const c of cs||[])m.set(cellKey(c.cell)+'='+c.value,{cell:c.cell.slice(),value:c.value});return [...m.values()]}
function cloneBranchDeduction(d){return d?JSON.parse(JSON.stringify(d)):null}
function stripWitness(w){if(!w)return null;let out={...w};if(out.premises)out.premises=out.premises.map(p=>JSON.parse(JSON.stringify(p)));return JSON.parse(JSON.stringify(out))}
function deductionComparator(a,b){return (a.rank-b.rank)||(a.techniqueLevel-b.techniqueLevel)||(a.priority-b.priority)||(a.clarity-b.clarity)||(a.focusCells.length-b.focusCells.length)||a.rule.localeCompare(b.rule)}

function createSession(board,options){return new Session(board,options)}
function analyze(board,options){let s=createSession(board,options),n=s.nextDeduction();return {session:s,...n,metrics:s.metrics()}}

root.QueensLogic={
  VERSION:1,VALUE_EMPTY,VALUE_X,VALUE_QUEEN,RULE_COST,TECHNIQUE_LEVEL,
  createSession,analyze,cellsConflict:(reg,a,b)=>cellsConflict(reg,a,b),conflictReasons:(reg,a,b)=>conflictReasons(reg,a,b),
  deductionComparator,
  _test:{Session,combinations}
};
if(typeof module!=='undefined'&&module.exports)module.exports=root.QueensLogic;
})(typeof globalThis!=='undefined'?globalThis:this);
