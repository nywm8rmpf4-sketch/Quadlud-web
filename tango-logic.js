/*
 * QUADLUD — Soleil/Lune inference engine
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root){
'use strict';

const VALUE_EMPTY=-1, VALUE_MOON=0, VALUE_SUN=1;
const REL_SAME=0, REL_OPPOSITE=1;
const RULE_COST={
  GIVEN_VALUE:0,EXPLICIT_RELATION:0,RELATION_PROPAGATION:0,RELATION_CLOSURE:0,
  TRIPLE_CONSTRAINT:1,BALANCE_QUOTA:1,BALANCE_RELATION:1,RELATION_BALANCE:1,
  RELATION_BALANCE_COMPONENT:1,LINE_DOMAIN_SUPPORT:1,
  ASSUMPTION_CONTRADICTION:2,COMMON_CONSEQUENCE:2
};
const RULE_PRIORITY={
  RELATION_PROPAGATION:0,TRIPLE_CONSTRAINT:10,BALANCE_QUOTA:20,BALANCE_RELATION:30,
  RELATION_BALANCE:40,RELATION_BALANCE_COMPONENT:50,LINE_DOMAIN_SUPPORT:60,
  ASSUMPTION_CONTRADICTION:90,COMMON_CONSEQUENCE:100
};

function cloneGrid(g){return g.map(r=>r.slice())}
function cellKey(c){return c[0]+','+c[1]}
function cellFromIndex(i,n){return [Math.floor(i/n),i%n]}
function indexOfCell(c,n){return c[0]*n+c[1]}
function canonicalPair(a,b,n){let ia=indexOfCell(a,n),ib=indexOfCell(b,n);return ia<ib?[a.slice(),b.slice()]:[b.slice(),a.slice()]}
function pairKey(a,b,n){let [x,y]=canonicalPair(a,b,n);return cellKey(x)+'|'+cellKey(y)}
function uniq(a){return [...new Set((a||[]).filter(x=>x!=null))]}
function uniqCells(a){let s=new Set(),o=[];for(const c of a||[]){if(!Array.isArray(c))continue;let k=cellKey(c);if(!s.has(k)){s.add(k);o.push(c.slice())}}return o}
function maxRank(ps){let a=(ps||[]).map(p=>Number(p?.rank)||0);return a.length?Math.max(...a):0}
function compareCells(a,b){return a[0]-b[0]||a[1]-b[1]}
function sameCell(a,b){return a&&b&&a[0]===b[0]&&a[1]===b[1]}
function copy(x){return JSON.parse(JSON.stringify(x))}
function relationName(parity){return parity===REL_SAME?'SAME':'OPPOSITE'}
function relationParity(rel){return rel==='='||rel==='SAME'||rel===0?REL_SAME:REL_OPPOSITE}
function unitRef(family,id){return {family,id,key:family+':'+id}}
function combinations(items,k){let out=[];function go(i,p){if(p.length===k){out.push(p.slice());return}for(let j=i;j<=items.length-(k-p.length);j++){p.push(items[j]);go(j+1,p);p.pop()}}go(0,[]);return out}
function deductionComparator(a,b){return (a.rank-b.rank)||(a.techniqueLevel-b.techniqueLevel)||((a.priority??50)-(b.priority??50))||((a.clarity??50)-(b.clarity??50))||String(a.signature||a.id).localeCompare(String(b.signature||b.id))}
function traceDependencyIds(d){return uniq([...(d?.dependencies||[]),...(d?.premises||[]).flatMap(p=>p?.dependencies||[])])}
function causalTraceFromIds(trace,seedIds){let list=trace||[],byId=new Map(list.map(d=>[d.id,d])),need=new Set((seedIds||[]).filter(id=>byId.has(id))),stack=[...need];while(stack.length){let d=byId.get(stack.pop());if(!d)continue;for(const id of traceDependencyIds(d))if(byId.has(id)&&!need.has(id)){need.add(id);stack.push(id)}}return list.filter(d=>need.has(d.id)).map(copy)}
function sameConclusion(a,b,n){if(!a||!b||a.type!==b.type)return false;if(a.type==='VALUE')return sameCell(a.cell,b.cell)&&Number(a.value)===Number(b.value);if(a.type==='RELATION')return pairKey(a.a,a.b,n)===pairKey(b.a,b.b,n)&&Number(a.parity)===Number(b.parity);return false}
function causalTraceForConclusion(trace,conclusion,n){let seeds=(trace||[]).filter(d=>(d.conclusions||[]).some(c=>sameConclusion(c,conclusion,n))).map(d=>d.id);return seeds.length?causalTraceFromIds(trace,seeds):(trace||[]).map(copy)}
function causalTraceForWitness(trace,witness){let seeds=(witness?.premises||[]).flatMap(p=>p?.dependencies||[]);return seeds.length?causalTraceFromIds(trace,seeds):(trace||[]).map(copy)}

class Session{
  constructor(board,options={}){
    if(!board||!Number.isInteger(board.n)||board.n<2||board.n%2||!Array.isArray(board.state)||!Array.isArray(board.edges))throw new Error('Invalid Soleil/Lune board');
    this.n=board.n;this.quota=this.n/2;this.state=cloneGrid(board.state);this.edges=copy(board.edges);
    if(this.state.length!==this.n||this.state.some(r=>r.length!==this.n))throw new Error('Invalid Soleil/Lune dimensions');
    this.options={maxHypothesisSteps:18,maxCommonSteps:10,...options};
    let persistedRelations=board.derivedRelations||board.virtualRelations||[],persistedIds=[];for(const x of persistedRelations){if(x?.deductionId)persistedIds.push(x.deductionId);persistedIds.push(...(x?.dependencies||[]))}
    this.factSeq=0;this.dedSeq=persistedIds.reduce((m,id)=>{let q=/^D(\d+)$/.exec(String(id));return q?Math.max(m,Number(q[1])):m},0);this.valueFacts=Array.from({length:this.n},()=>Array(this.n).fill(null));
    this.relationFacts=new Map();this.relationClosure=new Map();this.relationConflict=null;this.appliedDeductions=[];this.unitDomainsCache=new Map();
    this.seedValues(board.givens);this.seedExplicitRelations();this.seedVirtualRelations(persistedRelations);this.rebuildRelationClosure();
  }
  seedValues(givens){
    for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++){let v=this.state[r][c];if(v!==VALUE_MOON&&v!==VALUE_SUN)continue;let source=givens&&((givens instanceof Set&&givens.has(r*this.n+c))||(Array.isArray(givens)&&givens.includes(r*this.n+c)))?'given':'board';this.valueFacts[r][c]={id:'F'+(++this.factSeq),kind:'VALUE',cell:[r,c],value:v,rank:0,source,deductionId:null,hypothesis:false}}
  }
  seedExplicitRelations(){for(let [r,c,d,rel] of this.edges){let b=d==='r'?[r,c+1]:[r+1,c],a=[r,c];this.addBaseRelation(a,b,relationParity(rel),{rank:0,source:'explicit',explicit:true})}}
  seedVirtualRelations(list){for(const x of list||[]){let a=x.a||x.cells?.[0],b=x.b||x.cells?.[1],p=x.parity!=null?Number(x.parity):relationParity(x.relation||x.kind);if(!a||!b||sameCell(a,b))continue;this.addBaseRelation(a,b,p,{rank:Number(x.rank)||0,source:'derived',deductionId:x.deductionId||null,dependencies:x.dependencies||[],explicit:false})}}
  clone(){let x=Object.create(Session.prototype);x.n=this.n;x.quota=this.quota;x.state=cloneGrid(this.state);x.edges=copy(this.edges);x.options={...this.options};x.factSeq=this.factSeq;x.dedSeq=this.dedSeq;x.valueFacts=this.valueFacts.map(row=>row.map(f=>f?copy(f):null));x.relationFacts=new Map([...this.relationFacts].map(([k,v])=>[k,copy(v)]));x.relationClosure=new Map([...this.relationClosure].map(([k,v])=>[k,copy(v)]));x.relationConflict=this.relationConflict?copy(this.relationConflict):null;x.appliedDeductions=this.appliedDeductions.map(copy);x.unitDomainsCache=new Map();return x}
  snapshot(){return {state:cloneGrid(this.state),derivedRelations:this.exportDerivedRelations()}}
  exportDerivedRelations(){return [...this.relationFacts.values()].filter(x=>!x.explicit).map(x=>({a:x.a.slice(),b:x.b.slice(),parity:x.parity,relation:relationName(x.parity),rank:x.rank,deductionId:x.deductionId||null,dependencies:[...(x.dependencies||[])]}))}
  valueFact(cell){return this.valueFacts[cell[0]][cell[1]]}
  valueAt(cell){return this.state[cell[0]][cell[1]]}
  factPremise(f){return f?{kind:'VALUE',factId:f.id,cell:f.cell.slice(),value:f.value,rank:Number(f.rank)||0,source:f.source||null,hypothesis:!!f.hypothesis,dependencies:f.deductionId?[f.deductionId]:[]} : null}
  relationPremise(f){return f?{kind:'RELATION',relation:f.parity===REL_SAME?'SAME':'OPPOSITE',a:f.a.slice(),b:f.b.slice(),rank:Number(f.rank)||0,source:f.source||null,hypothesis:!!f.hypothesis,explicit:!!f.explicit,dependencies:[...(f.dependencies||[])]}:null}
  addValue(cell,value,meta={}){let [r,c]=cell,old=this.valueFacts[r][c];if(old)return old.value===value?old:null;if(this.state[r][c]!==VALUE_EMPTY&&this.state[r][c]!==value)return null;this.state[r][c]=value;this.unitDomainsCache.clear();let f={id:'F'+(++this.factSeq),kind:'VALUE',cell:cell.slice(),value,rank:Number(meta.rank)||0,source:meta.source||'deduction',deductionId:meta.deductionId||null,hypothesis:!!meta.hypothesis};this.valueFacts[r][c]=f;return f}
  addBaseRelation(a,b,parity,meta={}){if(sameCell(a,b)){if(parity===REL_OPPOSITE)this.relationConflict={kind:'RELATION_CONFLICT',cells:[a.slice(),b.slice()],rank:Number(meta.rank)||0};return null}let [x,y]=canonicalPair(a,b,this.n),k=pairKey(x,y,this.n),old=this.relationFacts.get(k),fact={id:'R'+(++this.factSeq),kind:'RELATION',a:x,b:y,parity:Number(parity),rank:Number(meta.rank)||0,source:meta.source||'deduction',deductionId:meta.deductionId||null,dependencies:uniq((meta.dependencies||[]).concat(meta.deductionId?[meta.deductionId]:[])),explicit:!!meta.explicit,hypothesis:!!meta.hypothesis};if(old){if(old.parity!==fact.parity){this.relationConflict={kind:'RELATION_CONFLICT',cells:[x,y],relations:[copy(old),copy(fact)],rank:Math.max(old.rank,fact.rank)};return null}if(old.rank<=fact.rank)return old}this.relationFacts.set(k,fact);return fact}
  rebuildRelationClosure(){
    this.unitDomainsCache.clear();this.relationClosure=new Map();if(this.relationConflict)return;
    let total=this.n*this.n,adj=Array.from({length:total},()=>[]);for(const f of this.relationFacts.values()){let ia=indexOfCell(f.a,this.n),ib=indexOfCell(f.b,this.n);adj[ia].push({to:ib,parity:f.parity,fact:f});adj[ib].push({to:ia,parity:f.parity,fact:f})}
    for(let start=0;start<total;start++){
      let best=Array(total).fill(null),q=[{node:start,parity:0,rank:0,deps:[],path:[]}];best[start]={parity:0,rank:0,deps:[],path:[]};
      for(let qi=0;qi<q.length;qi++){let cur=q[qi];for(const e of adj[cur.node]){let parity=cur.parity^e.parity,rank=Math.max(cur.rank,Number(e.fact.rank)||0),deps=uniq(cur.deps.concat(e.fact.dependencies||[])),path=cur.path.concat([{a:e.fact.a.slice(),b:e.fact.b.slice(),parity:e.fact.parity,explicit:!!e.fact.explicit}]),old=best[e.to];if(old&&old.parity!==parity){this.relationConflict={kind:'RELATION_CONFLICT',cells:[cellFromIndex(start,this.n),cellFromIndex(e.to,this.n)],rank:Math.max(old.rank,rank),paths:[old.path,path]};return}if(!old||rank<old.rank||(rank===old.rank&&path.length<old.path.length)){best[e.to]={parity,rank,deps,path};q.push({node:e.to,parity,rank,deps,path})}}
      }
      for(let end=start+1;end<total;end++){let b=best[end];if(!b)continue;let a=cellFromIndex(start,this.n),c=cellFromIndex(end,this.n),k=pairKey(a,c,this.n),base=this.relationFacts.get(k);this.relationClosure.set(k,{kind:'RELATION',a,b:c,parity:b.parity,rank:b.rank,dependencies:b.deps,path:b.path,explicit:!!base?.explicit,baseId:base?.id||null})}
    }
  }
  relationBetween(a,b){if(sameCell(a,b))return {kind:'RELATION',a:a.slice(),b:b.slice(),parity:REL_SAME,rank:0,dependencies:[],path:[]};return this.relationClosure.get(pairKey(a,b,this.n))||null}
  makeDeduction(rule,techniqueLevel,premises,focusCells,focusRelations,focusUnits,conclusions,explanationData={},priority=null,clarity=50,automatic=false){premises=(premises||[]).filter(Boolean);let cost=RULE_COST[rule]??1,rank=maxRank(premises)+cost,cs=(conclusions||[]).map(c=>c.type==='RELATION'?{type:'RELATION',a:c.a.slice(),b:c.b.slice(),parity:c.parity,relation:relationName(c.parity),rank}:{type:'VALUE',cell:c.cell.slice(),value:c.value,rank}),deps=uniq(premises.flatMap(p=>p.dependencies||[]));let sig=rule+'|'+cs.map(c=>c.type==='VALUE'?cellKey(c.cell)+'='+c.value:pairKey(c.a,c.b,this.n)+'='+c.parity).join(';');return {schema:1,id:'candidate:'+sig,signature:sig,rule,ruleCost:cost,rank,techniqueLevel,techniqueKey:'T'+techniqueLevel,premises:copy(premises),dependencies:deps,focusCells:uniqCells(focusCells),focusRelations:copy(focusRelations||[]),focusUnits:copy(focusUnits||[]),conclusions:cs,explanationData:copy(explanationData||{}),priority:priority==null?(RULE_PRIORITY[rule]??50):priority,clarity,automatic:!!automatic}}
  unitValuePremises(family,id){return this.unitCells(family,id).map(c=>this.factPremise(this.valueFact(c))).filter(Boolean)}
  findTripleConstraint(){
    let out=[];for(const family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id);for(let i=0;i<=this.n-3;i++){let tri=cells.slice(i,i+3),known=tri.map((c,j)=>({j,cell:c,value:this.valueAt(c),fact:this.valueFact(c)})).filter(x=>x.value!==VALUE_EMPTY);
      if(known.length>=2){for(const pair of combinations(known,2)){if(pair[0].value!==pair[1].value)continue;let k=[0,1,2].find(x=>x!==pair[0].j&&x!==pair[1].j),target=tri[k];if(this.valueAt(target)!==VALUE_EMPTY)continue;let ps=pair.map(x=>this.factPremise(x.fact)),value=1-pair[0].value;out.push(this.makeDeduction('TRIPLE_CONSTRAINT',1,ps,tri,[],[unitRef(family,id)],[{type:'VALUE',cell:target,value}],{family,id,window:tri,pair:pair.map(x=>x.cell),target,value,mode:'VALUE'},10,5))}}
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){let rel=this.relationBetween(tri[a],tri[b]);if(!rel||rel.parity!==REL_SAME)continue;let k=[0,1,2].find(x=>x!==a&&x!==b),target=tri[k],ps=[this.relationPremise(rel)],conclusions=[];for(const source of [tri[a],tri[b]]){let existing=this.relationBetween(target,source);if(!existing)conclusions.push({type:'RELATION',a:target,b:source,parity:REL_OPPOSITE})}if(!conclusions.length)continue;out.push(this.makeDeduction('TRIPLE_CONSTRAINT',1,ps,tri,[{a:tri[a],b:tri[b],parity:REL_SAME,relation:'SAME'}],[unitRef(family,id)],conclusions,{family,id,window:tri,pair:[tri[a],tri[b]],target,mode:'RELATION'},10,8))}
    }}return out.sort(deductionComparator)
  }
  findBalanceQuota(){
    let out=[];for(const family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id),sun=cells.filter(c=>this.valueAt(c)===VALUE_SUN),moon=cells.filter(c=>this.valueAt(c)===VALUE_MOON),empty=cells.filter(c=>this.valueAt(c)===VALUE_EMPTY);if(!empty.length)continue;
      let value=null,reason=null,ps=[];if(sun.length===this.quota){value=VALUE_MOON;reason='QUOTA_REACHED';ps=sun.map(c=>this.factPremise(this.valueFact(c)))}else if(moon.length===this.quota){value=VALUE_SUN;reason='QUOTA_REACHED';ps=moon.map(c=>this.factPremise(this.valueFact(c)))}else if(sun.length+empty.length===this.quota){value=VALUE_SUN;reason='QUOTA_NEEDED';ps=moon.map(c=>this.factPremise(this.valueFact(c)))}else if(moon.length+empty.length===this.quota){value=VALUE_MOON;reason='QUOTA_NEEDED';ps=sun.map(c=>this.factPremise(this.valueFact(c)))}if(value==null)continue;let conclusions=empty.map(cell=>({type:'VALUE',cell,value}));out.push(this.makeDeduction('BALANCE_QUOTA',1,ps,cells,[],[unitRef(family,id)],conclusions,{family,id,quota:this.quota,sunCount:sun.length,moonCount:moon.length,remaining:empty,forcedValue:value,reason},20,8))}return out.sort(deductionComparator)
  }
  findBalanceRelation(){
    let out=[];for(const family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id),empty=cells.filter(c=>this.valueAt(c)===VALUE_EMPTY);if(empty.length!==2)continue;let sun=cells.filter(c=>this.valueAt(c)===VALUE_SUN).length,moon=cells.filter(c=>this.valueAt(c)===VALUE_MOON).length;if(this.quota-sun!==1||this.quota-moon!==1)continue;let old=this.relationBetween(empty[0],empty[1]);if(old)continue;let ps=this.unitValuePremises(family,id);out.push(this.makeDeduction('BALANCE_RELATION',1,ps,cells,[{a:empty[0],b:empty[1],parity:REL_OPPOSITE,relation:'OPPOSITE'}],[unitRef(family,id)],[{type:'RELATION',a:empty[0],b:empty[1],parity:REL_OPPOSITE}],{family,id,quota:this.quota,remaining:empty,sunNeeded:1,moonNeeded:1},30,10))}return out.sort(deductionComparator)
  }
  relationComponents(){
    let total=this.n*this.n,adj=Array.from({length:total},()=>[]);for(const f of this.relationFacts.values()){let a=indexOfCell(f.a,this.n),b=indexOfCell(f.b,this.n);adj[a].push(b);adj[b].push(a)}let seen=new Set(),out=[];
    for(let i=0;i<total;i++){if(seen.has(i)||!adj[i].length)continue;let stack=[i],ids=[];seen.add(i);while(stack.length){let x=stack.pop();ids.push(x);for(const y of adj[x])if(!seen.has(y)){seen.add(y);stack.push(y)}}let cells=ids.map(x=>cellFromIndex(x,this.n)).sort(compareCells),root=cells[0],members=cells.map(cell=>{let rel=this.relationBetween(root,cell);return {cell,parity:rel?rel.parity:0,rank:rel?rel.rank:0,dependencies:rel?[...(rel.dependencies||[])]:[]}});out.push({root,members,cells})}return out
  }
  componentPremises(comp){let ps=[],seen=new Set();for(const m of comp.members.slice(1)){let rel=this.relationBetween(comp.root,m.cell);if(!rel)continue;for(const step of rel.path||[]){let k=pairKey(step.a,step.b,this.n),f=this.relationFacts.get(k);if(f&&!seen.has(k)){seen.add(k);ps.push(this.relationPremise(f))}}}return ps}
  componentOrientation(comp,rootValue){return comp.members.map(m=>({cell:m.cell.slice(),value:rootValue^m.parity}))}
  orientationWitness(assignments){
    let grid=cloneGrid(this.state);for(const a of assignments){let old=grid[a.cell[0]][a.cell[1]];if(old!==VALUE_EMPTY&&old!==a.value)return {kind:'VALUE_CONFLICT',cells:[a.cell]};grid[a.cell[0]][a.cell[1]]=a.value}
    let affectedRows=uniq(assignments.map(a=>a.cell[0])),affectedCols=uniq(assignments.map(a=>a.cell[1]));
    for(const [family,ids] of [['row',affectedRows],['column',affectedCols]])for(const id of ids){let cells=this.unitCells(family,id),vals=cells.map(c=>grid[c[0]][c[1]]),sun=vals.filter(v=>v===VALUE_SUN).length,moon=vals.filter(v=>v===VALUE_MOON).length,empty=vals.filter(v=>v===VALUE_EMPTY).length;if(sun>this.quota||moon>this.quota)return {kind:'BALANCE_OVERFLOW',family,id,cells,value:sun>this.quota?VALUE_SUN:VALUE_MOON};if(sun+empty<this.quota||moon+empty<this.quota)return {kind:'BALANCE_DEFICIT',family,id,cells,value:sun+empty<this.quota?VALUE_SUN:VALUE_MOON};for(let i=0;i<=this.n-3;i++)if(vals[i]!==VALUE_EMPTY&&vals[i]===vals[i+1]&&vals[i]===vals[i+2])return {kind:'TRIPLE_OVERFLOW',family,id,cells:cells.slice(i,i+3),value:vals[i]}}
    return null
  }
  findRelationBalance(){
    let out=[];
    // A two-cell SAME component can be oriented when one orientation immediately breaks a quota/triple.
    for(const comp of this.relationComponents().filter(c=>c.cells.length===2&&c.members[1].parity===REL_SAME)){
      if(comp.cells.some(c=>this.valueAt(c)!==VALUE_EMPTY))continue;let w0=this.orientationWitness(this.componentOrientation(comp,VALUE_MOON)),w1=this.orientationWitness(this.componentOrientation(comp,VALUE_SUN));if(!!w0===!!w1)continue;let rootValue=w0?VALUE_SUN:VALUE_MOON,assign=this.componentOrientation(comp,rootValue),ps=this.componentPremises(comp);for(const fam of ['row','column'])for(const id of uniq(comp.cells.map(c=>fam==='row'?c[0]:c[1])))ps.push(...this.unitValuePremises(fam,id));out.push(this.makeDeduction('RELATION_BALANCE',1,ps,comp.cells,[{a:comp.cells[0],b:comp.cells[1],parity:REL_SAME,relation:'SAME'}],[],assign.map(a=>({type:'VALUE',cell:a.cell,value:a.value})),{mode:'SAME_ORIENTATION',component:copy(comp),forcedRootValue:rootValue,rejected:w0||w1},40,12))}
    // An isolated OPPOSITE pair contributes exactly one sun and one moon to a shared row/column.
    for(const family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id),knownSun=cells.filter(c=>this.valueAt(c)===VALUE_SUN).length,knownMoon=cells.filter(c=>this.valueAt(c)===VALUE_MOON).length,covered=new Set(),pairPremises=[],fixedSun=0,fixedMoon=0;
      for(const [a,b] of combinations(cells,2)){if(covered.has(cellKey(a))||covered.has(cellKey(b))||this.valueAt(a)!==VALUE_EMPTY||this.valueAt(b)!==VALUE_EMPTY)continue;let rel=this.relationBetween(a,b);if(!rel||rel.parity!==REL_OPPOSITE)continue;let comp=this.relationComponents().find(x=>x.cells.some(c=>sameCell(c,a)));if(!comp||comp.cells.length!==2)continue;covered.add(cellKey(a));covered.add(cellKey(b));fixedSun++;fixedMoon++;pairPremises.push(this.relationPremise(rel))}
      if(!pairPremises.length)continue;let free=cells.filter(c=>this.valueAt(c)===VALUE_EMPTY&&!covered.has(cellKey(c)));if(!free.length)continue;let needSun=this.quota-knownSun-fixedSun,needMoon=this.quota-knownMoon-fixedMoon,value=null;if(needSun===0)value=VALUE_MOON;else if(needMoon===0)value=VALUE_SUN;else if(needSun===free.length)value=VALUE_SUN;else if(needMoon===free.length)value=VALUE_MOON;if(value==null)continue;let ps=pairPremises.concat(this.unitValuePremises(family,id));out.push(this.makeDeduction('RELATION_BALANCE',1,ps,cells,pairPremises.map(p=>({a:p.a,b:p.b,parity:REL_OPPOSITE,relation:'OPPOSITE'})),[unitRef(family,id)],free.map(cell=>({type:'VALUE',cell,value})),{mode:'OPPOSITE_CONTRIBUTION',family,id,quota:this.quota,fixedOppositePairs:pairPremises.length,knownSun,knownMoon,forcedValue:value,targets:free},40,15))}
    return out.sort(deductionComparator)
  }
  findRelationBalanceComponent(){
    let out=[];for(const comp of this.relationComponents().filter(c=>c.cells.length>=3)){if(comp.cells.some(c=>this.valueAt(c)!==VALUE_EMPTY))continue;let a0=this.componentOrientation(comp,VALUE_MOON),a1=this.componentOrientation(comp,VALUE_SUN),w0=this.orientationWitness(a0),w1=this.orientationWitness(a1);if(!!w0===!!w1)continue;let assign=w0?a1:a0,rootValue=w0?VALUE_SUN:VALUE_MOON,ps=this.componentPremises(comp);for(const fam of ['row','column'])for(const id of uniq(comp.cells.map(c=>fam==='row'?c[0]:c[1])))ps.push(...this.unitValuePremises(fam,id));out.push(this.makeDeduction('RELATION_BALANCE_COMPONENT',2,ps,comp.cells,comp.members.slice(1).map(m=>({a:comp.root,b:m.cell,parity:m.parity,relation:relationName(m.parity)})),[],assign.map(a=>({type:'VALUE',cell:a.cell,value:a.value})),{component:copy(comp),forcedRootValue:rootValue,rejected:w0||w1},50,20))}return out.sort(deductionComparator)
  }
  findLineDomainSupport(){
    let out=[];for(const family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id),domains=this.unitDomains(family,id);if(!domains.length)continue;let ps=this.unitValuePremises(family,id);for(const [a,b] of combinations(cells,2)){let rel=this.relationBetween(a,b);if(rel)ps.push(this.relationPremise(rel))}let conclusions=[];
      for(let i=0;i<this.n;i++)if(this.valueAt(cells[i])===VALUE_EMPTY){let vals=new Set(domains.map(d=>d[i]));if(vals.size===1)conclusions.push({type:'VALUE',cell:cells[i],value:[...vals][0]})}
      for(let i=0;i<this.n;i++)for(let j=i+1;j<this.n;j++){if(this.relationBetween(cells[i],cells[j]))continue;let pars=new Set(domains.map(d=>d[i]^d[j]));if(pars.size===1)conclusions.push({type:'RELATION',a:cells[i],b:cells[j],parity:[...pars][0]})}
      if(!conclusions.length)continue;let focusRelations=conclusions.filter(c=>c.type==='RELATION').map(c=>({a:c.a,b:c.b,parity:c.parity,relation:relationName(c.parity)}));out.push(this.makeDeduction('LINE_DOMAIN_SUPPORT',2,ps,cells,focusRelations,[unitRef(family,id)],conclusions,{family,id,quota:this.quota,domainCount:domains.length,domains:domains.slice(0,12)},60,28))}return out.sort(deductionComparator)
  }
  relationPropagationDeductions(){
    let out=[];for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++){let source=[r,c],vf=this.valueFact(source);if(!vf)continue;for(let rr=0;rr<this.n;rr++)for(let cc=0;cc<this.n;cc++){let target=[rr,cc];if(this.valueAt(target)!==VALUE_EMPTY||sameCell(source,target))continue;let rel=this.relationBetween(source,target);if(!rel)continue;let value=vf.value^rel.parity,ps=[this.factPremise(vf),this.relationPremise(rel)],focusRelations=[{a:source.slice(),b:target.slice(),parity:rel.parity,relation:relationName(rel.parity)}];out.push(this.makeDeduction('RELATION_PROPAGATION',0,ps,[source,target],focusRelations,[],[{type:'VALUE',cell:target,value}],{source:source.slice(),target:target.slice(),sourceValue:vf.value,parity:rel.parity,relation:relationName(rel.parity)},0,5,true))}}
    return out.sort(deductionComparator)
  }
  closureRelationDeductions(before){
    let out=[];for(const [k,rel] of this.relationClosure){if(before.has(k))continue;let ps=[];for(const step of rel.path||[]){let f=this.relationFacts.get(pairKey(step.a,step.b,this.n));if(f)ps.push(this.relationPremise(f))}if(ps.length<2)continue;out.push(this.makeDeduction('RELATION_CLOSURE',0,ps,[rel.a,rel.b],[{a:rel.a,b:rel.b,parity:rel.parity,relation:relationName(rel.parity)}],[],[{type:'RELATION',a:rel.a,b:rel.b,parity:rel.parity}],{path:copy(rel.path||[])},0,0,true))}return out
  }
  applyDeduction(d,options={}){
    if(!d||!Array.isArray(d.conclusions)||!d.conclusions.length)return {deduction:null,automatic:[]};
    let applied=copy(d);applied.id='D'+(++this.dedSeq);let changed=false,relationChanged=false,beforeRelations=new Set(this.relationClosure.keys());
    for(const c of applied.conclusions){
      if(c.type==='VALUE'){if(this.valueAt(c.cell)===c.value)continue;if(this.valueAt(c.cell)!==VALUE_EMPTY)continue;let f=this.addValue(c.cell,c.value,{rank:applied.rank,deductionId:applied.id,source:'deduction'});if(f)changed=true}
      else if(c.type==='RELATION'){let old=this.relationBetween(c.a,c.b);if(old&&old.parity===c.parity&&old.rank<=applied.rank)continue;let f=this.addBaseRelation(c.a,c.b,c.parity,{rank:applied.rank,deductionId:applied.id,dependencies:[applied.id],source:'derived'});if(f){changed=true;relationChanged=true}}
    }
    if(!changed)return {deduction:null,automatic:[]};this.appliedDeductions.push(applied);let automatic=[];if(relationChanged){this.rebuildRelationClosure();automatic=this.closureRelationDeductions(beforeRelations).map(d=>{let a=copy(d);a.id='D'+(++this.dedSeq);this.appliedDeductions.push(a);return a})}
    if(options.close!==false){let guard=0;while(guard++<this.n*this.n*2){let bad=this.diagnose();if(bad)break;let next=this.relationPropagationDeductions().find(x=>x.conclusions.some(c=>c.type==='VALUE'&&this.valueAt(c.cell)===VALUE_EMPTY));if(!next)break;let a=copy(next);a.id='D'+(++this.dedSeq);a.rank=next.rank;for(const c of a.conclusions)c.rank=a.rank;let c=a.conclusions[0],f=this.addValue(c.cell,c.value,{rank:a.rank,deductionId:a.id,source:'relation-propagation'});if(!f)break;this.appliedDeductions.push(a);automatic.push(a)}}
    return {deduction:applied,automatic}
  }
  assume(cell,value){if(this.valueAt(cell)!==VALUE_EMPTY)return false;let f=this.addValue(cell,value,{rank:0,source:'assumption',hypothesis:true});return !!f}
  directViolations(){
    let out=[];if(this.relationConflict)out.push(copy(this.relationConflict));
    for(let family of ['row','column'])for(let id=0;id<this.n;id++){let cells=this.unitCells(family,id),vals=cells.map(c=>this.valueAt(c));for(let i=0;i<=this.n-3;i++){let a=vals[i];if(a!==VALUE_EMPTY&&a===vals[i+1]&&a===vals[i+2]){let cc=cells.slice(i,i+3),ps=cc.map(c=>this.factPremise(this.valueFact(c))).filter(Boolean);out.push({kind:'TRIPLE_OVERFLOW',family,id,cells:cc,value:a,premises:ps,rank:maxRank(ps)})}}for(let v of [VALUE_MOON,VALUE_SUN]){let known=cells.filter(c=>this.valueAt(c)===v);if(known.length>this.quota){let ps=known.map(c=>this.factPremise(this.valueFact(c))).filter(Boolean);out.push({kind:'BALANCE_OVERFLOW',family,id,cells:known,value:v,quota:this.quota,premises:ps,rank:maxRank(ps)})}let empty=cells.filter(c=>this.valueAt(c)===VALUE_EMPTY);if(known.length+empty.length<this.quota){let ps=cells.filter(c=>this.valueAt(c)===1-v).map(c=>this.factPremise(this.valueFact(c))).filter(Boolean);out.push({kind:'BALANCE_DEFICIT',family,id,cells,value:v,quota:this.quota,premises:ps,rank:maxRank(ps)})}}}
    for(const rel of this.relationClosure.values()){let va=this.valueAt(rel.a),vb=this.valueAt(rel.b);if(va===VALUE_EMPTY||vb===VALUE_EMPTY)continue;if((va^vb)!==rel.parity){let ps=[this.factPremise(this.valueFact(rel.a)),this.factPremise(this.valueFact(rel.b)),this.relationPremise(rel)].filter(Boolean);out.push({kind:'VALUE_CONFLICT',cells:[rel.a.slice(),rel.b.slice()],relation:relationName(rel.parity),premises:ps,rank:maxRank(ps)})}}
    return out
  }
  unitCells(family,id){return family==='row'?Array.from({length:this.n},(_,c)=>[id,c]):Array.from({length:this.n},(_,r)=>[r,id])}
  unitDomains(family,id){
    let cacheKey=family+':'+id,cached=this.unitDomainsCache.get(cacheKey);if(cached)return cached;
    let cells=this.unitCells(family,id),domains=[],total=1<<this.n;
    for(let mask=0;mask<total;mask++){let vals=Array.from({length:this.n},(_,i)=>(mask>>i)&1);if(vals.reduce((a,b)=>a+b,0)!==this.quota)continue;let ok=true;for(let i=0;i<this.n;i++){let v=this.valueAt(cells[i]);if(v!==VALUE_EMPTY&&v!==vals[i]){ok=false;break}}if(!ok)continue;for(let i=0;i<=this.n-3;i++)if(vals[i]===vals[i+1]&&vals[i]===vals[i+2]){ok=false;break}if(!ok)continue;for(let i=0;i<this.n&&ok;i++)for(let j=i+1;j<this.n;j++){let rel=this.relationBetween(cells[i],cells[j]);if(rel&&((vals[i]^vals[j])!==rel.parity)){ok=false;break}}if(ok)domains.push(vals)}this.unitDomainsCache.set(cacheKey,domains);return domains
  }
  diagnose(){let d=this.directViolations();if(d.length)return d[0];for(let family of ['row','column'])for(let id=0;id<this.n;id++)if(!this.unitDomains(family,id).length){let cells=this.unitCells(family,id),ps=[];for(const c of cells){let f=this.valueFact(c);if(f)ps.push(this.factPremise(f))}return {kind:'NO_LINE_COMPLETION',family,id,cells,premises:ps,rank:maxRank(ps)}}return null}
  directDeductions(){return [].concat(this.relationPropagationDeductions(),this.findTripleConstraint(),this.findBalanceQuota(),this.findBalanceRelation(),this.findRelationBalance(),this.findRelationBalanceComponent(),this.findLineDomainSupport()).sort(deductionComparator)}
  bestDirect(){return this.directDeductions()[0]||null}
  directProofFor(cell,value){let matches=[];for(const d of this.directDeductions())for(const c of d.conclusions||[])if(c.type==='VALUE'&&sameCell(c.cell,cell)&&c.value===value)matches.push(d);return matches.sort(deductionComparator)[0]||null}
  closeCost0(trace=[]){let guard=0;while(guard++<this.n*this.n*2){let bad=this.diagnose();if(bad)return bad;let d=this.relationPropagationDeductions()[0];if(!d)return null;let a=this.applyDeduction(d);if(!a.deduction)break;trace.push(a.deduction,...a.automatic)}return this.diagnose()}
  hypothesisResult(cell,value,maxSteps=this.options.maxHypothesisSteps){
    let fork=this.clone();if(!fork.assume(cell,value))return {contradiction:{kind:'VALUE_CONFLICT',cells:[cell.slice()]},trace:[],session:fork,budgetHit:false};let trace=[],bad=fork.closeCost0(trace);if(bad)return {contradiction:bad,trace,session:fork,budgetHit:false};
    let exhausted=true;
    for(let i=0;i<maxSteps;i++){bad=fork.diagnose();if(bad)return {contradiction:bad,trace,session:fork,budgetHit:false};let d=fork.bestDirect();if(!d){exhausted=false;break}let a=fork.applyDeduction(d);if(!a.deduction){exhausted=false;break}trace.push(a.deduction,...a.automatic);bad=fork.closeCost0(trace);if(bad)return {contradiction:bad,trace,session:fork,budgetHit:false}}
    bad=fork.diagnose();if(bad)return {contradiction:bad,trace,session:fork,budgetHit:false};let budgetHit=exhausted&&!!fork.bestDirect();return {contradiction:null,trace,session:fork,budgetHit}
  }
  realTracePremises(results){let realIds=new Set(this.appliedDeductions.map(d=>d.id)),out=[],seen=new Set();for(const result of results||[])for(const d of result?.trace||[])for(const p of d.premises||[]){if(p.hypothesis||p.source==='assumption')continue;let deps=(p.dependencies||[]).filter(id=>realIds.has(id)),rank=deps.length?(Number(p.rank)||0):((p.dependencies||[]).length?0:(Number(p.rank)||0));if(!deps.length&&rank>0)continue;let key=JSON.stringify([p.kind,p.cell,p.a,p.b,p.value,p.relation,rank,deps]);if(!seen.has(key)){seen.add(key);out.push({...copy(p),rank,dependencies:deps})}}return out}
  contradictionDeduction(cell,rejected,result){let chosen=1-rejected,ps=this.realTracePremises([result]);ps.unshift({kind:'ASSUMPTION',cell:cell.slice(),value:rejected,rank:0,dependencies:[],hypothesis:true});let witness=copy(result.contradiction),focus=uniqCells([cell].concat(witness?.cells||[]));return this.makeDeduction('ASSUMPTION_CONTRADICTION',3,ps,focus,[],witness?.family!=null?[unitRef(witness.family,witness.id)]:[],[{type:'VALUE',cell,value:chosen}],{assumption:{cell:cell.slice(),value:rejected},contradictionType:witness?.kind||'UNKNOWN',witness,trace:(result.trace||[]).map(copy),causalTrace:causalTraceForWitness(result.trace||[],witness)},90,45)}
  findAssumptionContradictionsDetailed(limit=4){let out=[],budgetHit=false;for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.valueAt([r,c])===VALUE_EMPTY){let a=[this.hypothesisResult([r,c],VALUE_MOON),this.hypothesisResult([r,c],VALUE_SUN)];if(a.some(x=>x.budgetHit)){budgetHit=true;continue}if(!!a[0].contradiction===!!a[1].contradiction)continue;let rejected=a[0].contradiction?VALUE_MOON:VALUE_SUN;out.push(this.contradictionDeduction([r,c],rejected,a[rejected]));if(out.length>=limit)return {deductions:out.sort(deductionComparator),budgetHit}}return {deductions:out.sort(deductionComparator),budgetHit}}
  findAssumptionContradictions(limit=4){return this.findAssumptionContradictionsDetailed(limit).deductions}
  commonFacts(result){let values=new Map(),relations=new Map();for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++){let v=result.session.valueAt([r,c]);if(v!==VALUE_EMPTY&&this.valueAt([r,c])===VALUE_EMPTY)values.set(cellKey([r,c]),{type:'VALUE',cell:[r,c],value:v})}for(const [k,rel] of result.session.relationClosure){if(this.relationClosure.has(k))continue;relations.set(k,{type:'RELATION',a:rel.a.slice(),b:rel.b.slice(),parity:rel.parity})}return {values,relations}}
  findCommonConsequencesDetailed(limit=2){let out=[],budgetHit=false;for(let r=0;r<this.n;r++)for(let c=0;c<this.n;c++)if(this.valueAt([r,c])===VALUE_EMPTY){let a=this.hypothesisResult([r,c],VALUE_MOON,this.options.maxCommonSteps),b=this.hypothesisResult([r,c],VALUE_SUN,this.options.maxCommonSteps);if(a.budgetHit||b.budgetHit){budgetHit=true;continue}if(a.contradiction||b.contradiction)continue;let fa=this.commonFacts(a),fb=this.commonFacts(b),conclusion=null;for(const [k,x] of fa.values){let y=fb.values.get(k);if(y&&y.value===x.value&&!sameCell(x.cell,[r,c])){conclusion=x;break}}if(!conclusion)for(const [k,x] of fa.relations){let y=fb.relations.get(k);if(y&&y.parity===x.parity&&!sameCell(x.a,[r,c])&&!sameCell(x.b,[r,c])){conclusion=x;break}}if(!conclusion)continue;let ps=this.realTracePremises([a,b]);ps.unshift({kind:'ASSUMPTION_SPLIT',cell:[r,c],rank:0,dependencies:[]});out.push(this.makeDeduction('COMMON_CONSEQUENCE',3,ps,uniqCells([[r,c]].concat(conclusion.type==='VALUE'?[conclusion.cell]:[conclusion.a,conclusion.b])),conclusion.type==='RELATION'?[{a:conclusion.a,b:conclusion.b,parity:conclusion.parity,relation:relationName(conclusion.parity)}]:[],[],[conclusion],{branchCell:[r,c],moonTrace:a.trace.map(copy),sunTrace:b.trace.map(copy),moonCausalTrace:causalTraceForConclusion(a.trace,conclusion,this.n),sunCausalTrace:causalTraceForConclusion(b.trace,conclusion,this.n)},100,55));if(out.length>=limit)return {deductions:out.sort(deductionComparator),budgetHit}}return {deductions:out.sort(deductionComparator),budgetHit}}
  findCommonConsequences(limit=2){return this.findCommonConsequencesDetailed(limit).deductions}
  nextDeductionDetailed(){let contradiction=this.diagnose();if(contradiction)return {contradiction,budgetHit:false};let direct=this.bestDirect();if(direct)return {deduction:direct,budgetHit:false};let hypo=this.findAssumptionContradictionsDetailed();if(hypo.deductions.length)return {deduction:hypo.deductions[0],budgetHit:false};let common=this.findCommonConsequencesDetailed();if(common.deductions.length)return {deduction:common.deductions[0],budgetHit:false};return {deduction:null,budgetHit:!!(hypo.budgetHit||common.budgetHit)}}
  nextDeduction(){let x=this.nextDeductionDetailed();return x.contradiction?{contradiction:x.contradiction}:{deduction:x.deduction||null}}
  proveAction(cell,value){
    let existing=this.valueAt(cell);if(existing!==VALUE_EMPTY)return {status:existing===value?'proven':'incorrect'};let bad=this.diagnose();if(bad)return {status:'contradictory',contradiction:copy(bad)};let direct=this.directProofFor(cell,value);if(direct)return {status:'proven',deduction:direct};
    let chosen=this.hypothesisResult(cell,value),opp=this.hypothesisResult(cell,1-value);if(chosen.contradiction){let immediate=chosen.trace.length===0&&['TRIPLE_OVERFLOW','BALANCE_OVERFLOW','RELATION_CONFLICT','VALUE_CONFLICT'].includes(chosen.contradiction.kind);return {status:immediate?'incorrect':'contradictory',contradiction:copy(chosen.contradiction)}}if(opp.contradiction)return {status:'proven',deduction:this.contradictionDeduction(cell,1-value,opp)};return {status:'not-yet-proven'}
  }
  metrics(){let counts={};for(const d of this.appliedDeductions)counts[d.rule]=(counts[d.rule]||0)+1;return {maxRank:this.appliedDeductions.reduce((m,d)=>Math.max(m,d.rank||0),0),maxTechniqueLevel:this.appliedDeductions.reduce((m,d)=>Math.max(m,d.techniqueLevel||0),0),deductionsByRule:counts,countTriple:counts.TRIPLE_CONSTRAINT||0,countBalance:(counts.BALANCE_QUOTA||0)+(counts.BALANCE_RELATION||0),countRelationBalance:(counts.RELATION_BALANCE||0)+(counts.RELATION_BALANCE_COMPONENT||0),countDomainSupport:counts.LINE_DOMAIN_SUPPORT||0,countContradictions:counts.ASSUMPTION_CONTRADICTION||0,countCommonConsequences:counts.COMMON_CONSEQUENCE||0}}
}

function createSession(board,options){return new Session(board,options)}
root.TangoLogic={createSession,Session,constants:{VALUE_EMPTY,VALUE_MOON,VALUE_SUN,REL_SAME,REL_OPPOSITE},deductionComparator};
if(typeof module!=='undefined'&&module.exports)module.exports=root.TangoLogic;
})(typeof globalThis!=='undefined'?globalThis:this);
