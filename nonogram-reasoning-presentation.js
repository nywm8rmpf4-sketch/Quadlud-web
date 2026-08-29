/*
 * QUADLUD — Mosaïque / Nonogram reasoning presentation
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const contract=(typeof module==='object'&&module.exports)?require('./reasoning-presentation.js'):root?.QuadludReasoningPresentation;
  const logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):root?.NonogramLogic;
  const difficulty=(typeof module==='object'&&module.exports)?require('./nonogram-difficulty.js'):root?.NonogramDifficulty;
  const api=factory(contract,logic,difficulty);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludNonogramReasoningPresenter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(ReasoningPresentation,Logic,Difficulty){
'use strict';
if(!ReasoningPresentation||typeof ReasoningPresentation.captureEngineEvidence!=='function')throw new Error('NonogramReasoningPresenter requires QuadludReasoningPresentation');
if(!Logic||typeof Logic.analyzeLine!=='function')throw new Error('NonogramReasoningPresenter requires NonogramLogic');

const VERSION=2,GAME='nonogram',SOURCE='nonogram-logic-engine',PLACEMENT_DETAIL_LIMIT=6;
const TECHNIQUE_TITLES=Object.freeze({
  N_EMPTY_LINE:'Empty line',N_EXACT_FIT:'Exact fit',N_OVERLAP:'Overlap',N_FORCED_EMPTY:'Forced empty cells',N_BLOCK_EXTENSION:'Block extension',N_BLOCK_BOUNDARY:'Block boundary',N_CONTRADICTION:'Visible contradiction'
});
const FALLBACK_TEXT=Object.freeze({
  rowLabel:'Row',columnLabel:'Column',ngClue:'clue',
  ngWhyEmptyLine:'The clue contains no block, so every cell in the line must be empty.',
  ngWhyExactFit:'The blocks and mandatory separators occupy the whole line exactly, so the highlighted cells are forced.',
  ngWhyCompatible:'The visible marks leave {count} placements compatible with the clue. Every one agrees on the highlighted cells.',
  ngMoveFill:'Fill {cells}.',ngMoveCross:'Mark {cells} with X.',ngMoveBoth:'Fill {filled}; mark {empty} with X.',
  ngContradictionWhy:'No placement remains compatible with {line} and clue {clue}. Before visible marks, the clue has {count} possible placements; every one conflicts with at least one visible cell.',
  ngNoVisibleContradiction:'No visible contradiction.',ngLogicalMoveApplied:'Logical move applied.'
});
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function freezeDeep(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))freezeDeep(x);return v}
function entityKey(ref){return `${ref?.kind||''}:${ref?.id||''}`}
function tierFor(rule){const n=Difficulty&&typeof Difficulty.policyTierForRule==='function'?Difficulty.policyTierForRule(rule):null;return Number.isInteger(n)?n:0}
function clueText(clues){return Array.isArray(clues)&&clues.length?clues.join(' · '):'0'}
function targetGroups(d){const filled=[],empty=[];for(const c of d?.conclusions||[])(c.state===Logic.FILLED?filled:empty).push(c.cell);return {filled,empty}}
function placementBits(bits){const raw=bits&&typeof bits==='object'&&Object.prototype.hasOwnProperty.call(bits,'bits')?bits.bits:bits;return Array.from(raw||[]).map(v=>Number(v)===1?'■':'·').join('')}
function placementDetailEligible(d){const n=Number(d?.compatibleCount)||0;return !['N_EMPTY_LINE','N_EXACT_FIT'].includes(d?.techniqueId)&&n>1&&n<=PLACEMENT_DETAIL_LIMIT&&Array.isArray(d?.compatiblePlacements)&&d.compatiblePlacements.length===n}
function placementDetailHtml(d){if(!placementDetailEligible(d))return '';return (d.compatiblePlacements||[]).map((bits,i)=>`${i+1}. ${placementBits(bits)}`).join(' · ')}
function focusForDeduction(d){
  const raw=[];
  if(d?.line?.entity)raw.push({entity:clone(d.line.entity),role:'context'});
  for(const p of d?.premises?.clues||[])if(p.entity)raw.push({entity:clone(p.entity),role:'premise'});
  for(const p of d?.premises?.visible||[])if(p.cell)raw.push({entity:clone(p.cell),role:'premise'});
  for(const c of d?.conclusions||[])if(c.cell)raw.push({entity:clone(c.cell),role:'target'});
  const order={context:0,premise:1,target:2,contradiction:3},map=new Map();
  for(const item of raw){const k=entityKey(item.entity),prior=map.get(k);if(!prior||order[item.role]>order[prior.role])map.set(k,item)}
  return freezeDeep([...map.values()])
}
function normalizedPremises(d){
  const out=[];
  for(const p of d?.premises?.clues||[])out.push({kind:'CLUE',index:p.index,value:p.value,entity:clone(p.entity)});
  for(const p of d?.premises?.visible||[])out.push({kind:'VISIBLE_CELL',index:p.index,state:p.state,stateName:p.stateName,cell:clone(p.cell)});
  return out
}
function signature(d){return [d?.techniqueId,d?.line?.axis,d?.line?.index,(d?.visibleState||[]).join(''),(d?.conclusions||[]).map(c=>`${c.cell?.id}:${c.state}`).join(',')].join('|')}
function engineDeduction(d){
  if(!d||d.kind!=='deduction'||!d.techniqueId||!d.line||!Array.isArray(d.conclusions)||!d.move)throw new TypeError('Invalid Nonogram deduction proof');
  const tier=tierFor(d.techniqueId);
  return freezeDeep({
    id:signature(d),signature:signature(d),rule:d.techniqueId,rank:tier,techniqueLevel:tier,
    line:clone(d.line),clues:clone(d.clues||[]),visibleState:clone(d.visibleState||[]),premises:normalizedPremises(d),
    compatiblePlacements:clone(d.compatiblePlacements||[]),compatibleCount:Number(d.compatibleCount)||0,forced:clone(d.forced||{filled:[],empty:[]}),
    conclusions:clone(d.conclusions),focus:focusForDeduction(d),move:clone(d.move)
  })
}
function contradictionFocus(w){
  if(!w)return freezeDeep([]);const raw=[];if(w.line?.entity)raw.push({entity:clone(w.line.entity),role:'contradiction'});
  for(const p of w.premises?.clues||[])if(p.entity)raw.push({entity:clone(p.entity),role:'premise'});
  for(const p of w.premises?.visible||[])if(p.cell)raw.push({entity:clone(p.cell),role:'contradiction'});
  const map=new Map();for(const item of raw){const k=entityKey(item.entity),prior=map.get(k);if(!prior||item.role==='contradiction')map.set(k,item)}return freezeDeep([...map.values()])
}
function contradictionAnalysis(w){
  if(!w||w.kind!=='contradiction')return null;const length=Array.isArray(w.visibleState)?w.visibleState.length:0,unknown=Array(length).fill(Logic.UNKNOWN),placements=Logic.compatiblePlacements(length,w.clues||[],unknown),rejected=[];
  for(const bits of placements){const conflicts=[];for(let i=0;i<length;i++){const v=w.visibleState[i];if(v===Logic.UNKNOWN)continue;const expected=bits[i]===1?Logic.FILLED:Logic.EMPTY;if(v!==expected){const row=w.line.axis==='row'?w.line.index:i,col=w.line.axis==='row'?i:w.line.index;conflicts.push({index:i,cell:{kind:'cell',id:Logic.cellId(row,col)},visibleState:v,visibleStateName:Logic.STATE_NAMES[v],placementState:expected,placementStateName:Logic.STATE_NAMES[expected]})}}rejected.push({bits:bits.join(''),conflicts})}
  return freezeDeep({rule:'N_CONTRADICTION',line:clone(w.line),clues:clone(w.clues||[]),visibleState:clone(w.visibleState||[]),cluePlacementCount:placements.length,rejectedPlacements:rejected,focus:contradictionFocus(w)})
}
function formatTemplate(text,vars={}){return String(text??'').replace(/\{([A-Za-z0-9_]+)\}/g,(_,k)=>vars[k]??'')}
function createPresenter(options={}){
  const rawTr=typeof options.tr==='function'?options.tr:null;
  const text=(key,vars={})=>{
    let value=rawTr?rawTr(key):null;
    if(typeof value!=='string'||!value||value===key)value=FALLBACK_TEXT[key]??TECHNIQUE_TITLES[key]??key;
    return formatTemplate(value,vars)
  };
  const lineLabel=line=>`${text(line?.axis==='column'?'columnLabel':'rowLabel')} ${Number(line?.index)+1}`;
  const cellLabel=ref=>ref?.id||'cell';
  const techniqueTitle=rule=>text(rule)||String(rule||'Logical deduction');
  const whereText=d=>`${lineLabel(d.line)} — ${text('ngClue')} ${clueText(d.clues)}.`;
  function whyText(d){
    const groups=targetGroups(d),count=Number(d.compatibleCount)||0;
    if(!rawTr){
      const parts=[];if(groups.filled.length)parts.push(`every compatible placement fills ${groups.filled.map(cellLabel).join(', ')}`);if(groups.empty.length)parts.push(`every compatible placement leaves ${groups.empty.map(cellLabel).join(', ')} empty`);const shared=parts.length?parts.join(' and '):'the compatible placements force the target cells';
      if(d.techniqueId==='N_EMPTY_LINE')return 'The clue contains no block, so every cell in the line must be empty.';
      if(d.techniqueId==='N_EXACT_FIT')return `The clue and mandatory separators occupy the whole line exactly; ${shared}.`;
      if(d.techniqueId==='N_OVERLAP'){const base=`Among the ${count} placements compatible with the clue and visible marks, ${shared}.`,detail=placementDetailHtml(d);return detail?`${base}<br>${detail}`:base}
      if(d.techniqueId==='N_FORCED_EMPTY'){const base=`Among the ${count} placements compatible with the clue and visible marks, ${shared}.`,detail=placementDetailHtml(d);return detail?`${base}<br>${detail}`:base}
      if(d.techniqueId==='N_BLOCK_EXTENSION'){const base=`The visible filled cells constrain the block placements; among the ${count} compatible placements, ${shared}.`,detail=placementDetailHtml(d);return detail?`${base}<br>${detail}`:base}
      if(d.techniqueId==='N_BLOCK_BOUNDARY'){const base=`The visible completed block fixes its boundary; among the ${count} compatible placements, ${shared}.`,detail=placementDetailHtml(d);return detail?`${base}<br>${detail}`:base}
      return `The ${count} compatible placements agree on the target cells.`
    }
    if(d.techniqueId==='N_EMPTY_LINE')return text('ngWhyEmptyLine');
    if(d.techniqueId==='N_EXACT_FIT')return text('ngWhyExactFit');
    const base=text('ngWhyCompatible',{count}),detail=placementDetailHtml(d);
    return detail?`${base}<br>${detail}`:base
  }
  function moveText(d){
    const groups=targetGroups(d);
    if(!rawTr){const parts=[];if(groups.filled.length)parts.push(`Fill ${groups.filled.map(cellLabel).join(', ')}`);if(groups.empty.length)parts.push(`Cross ${groups.empty.map(cellLabel).join(', ')}`);return parts.join(' · ')+'.'}
    const filled=groups.filled.map(cellLabel).join(', '),empty=groups.empty.map(cellLabel).join(', ');
    if(filled&&empty)return text('ngMoveBoth',{filled,empty});
    if(filled)return text('ngMoveFill',{cells:filled});
    if(empty)return text('ngMoveCross',{cells:empty});
    return ''
  }
  const explanation=d=>freezeDeep({where:whereText(d),technique:techniqueTitle(d.techniqueId),why:whyText(d),move:moveText(d)});
  const legacyReasoning=d=>{const p=engineDeduction(d);return freezeDeep({schema:2,source:SOURCE,game:GAME,id:p.id,signature:p.signature,rule:p.rule,technique:p.rule,rank:p.rank,techniqueLevel:p.techniqueLevel,premises:clone(p.premises),focus:clone(p.focus),conclusions:clone(p.conclusions),move:clone(p.move)})};
  function presentation(d){
    if(!d)return null;const primary=engineDeduction(d),evidence=ReasoningPresentation.captureEngineEvidence({game:GAME,source:SOURCE,primary,supports:[],final:primary,metadata:{proofSchema:d.schema||1,visibleOnly:true}});
    const view=explanation(d),action={type:'APPLY_LOGICAL_MOVE',move:clone(primary.move),conclusions:clone(primary.conclusions)},detailed=placementDetailEligible(d);
    const proofNarrative=!['N_EMPTY_LINE','N_EXACT_FIT'].includes(d.techniqueId)?ReasoningPresentation.defineProofNarrative(evidence,{steps:[{id:'compatible-placement-analysis',evidenceRefs:['primary']}],conclusion:{id:'forced-cells',evidenceRefs:['primary.conclusions']},action:{id:'logical-move',evidenceRefs:['primary.move']},metadata:{family:d.techniqueId,compatibleCount:primary.compatibleCount,placementDetailShown:detailed}}):null;
    return ReasoningPresentation.defineReasoningPresentation({
      evidence,technique:d.techniqueId,focus:clone(primary.focus),explanation:view,action,
      derivation:{technique:['primary.rule'],focus:['primary.line','primary.premises','primary.conclusions'],explanation:['primary.rule','primary.clues','primary.visibleState','primary.compatiblePlacements','primary.conclusions'],action:['primary.move','primary.conclusions']},
      ...(proofNarrative?{proofNarrative}:{}),metadata:{coachLevels:4,visibleOnly:true,proofSchema:d.schema||1,deductionSignature:primary.signature,showTutorMove:true,proofNarrative:!!proofNarrative,placementDetailShown:detailed}
    })
  }
  function contradictionText(w){if(!w)return '';const a=contradictionAnalysis(w),count=a?.cluePlacementCount??0;if(!rawTr)return `${lineLabel(w.line)} has no placement compatible with clue ${clueText(w.clues)} and the visible marks. The clue permits ${count} placement${count===1?'':'s'} before visible marks; every one conflicts with at least one visible cell.`;return text('ngContradictionWhy',{line:lineLabel(w.line),clue:clueText(w.clues),count})}
  function contradictionDetailHtml(a){if(!a||a.cluePlacementCount<1||a.cluePlacementCount>PLACEMENT_DETAIL_LIMIT)return '';return a.rejectedPlacements.map((item,i)=>`${i+1}. ${placementBits(String(item.bits).split('').map(Number))} × ${item.conflicts.map(c=>c.cell?.id||c.index).join(', ')}`).join(' · ')}
  function contradictionExplanation(w){const a=contradictionAnalysis(w);if(!a)return null;const base=contradictionText(w),detail=contradictionDetailHtml(a);return freezeDeep({title:techniqueTitle('N_CONTRADICTION'),where:`${lineLabel(w.line)} — ${text('ngClue')} ${clueText(w.clues)}.`,why:detail?`${base}<br>${detail}`:base,focus:clone(a.focus),analysis:clone(a),placementDetailShown:!!detail})}
  return Object.freeze({GAME,SOURCE,VERSION,techniqueTitle,focusForDeduction,engineDeduction,signature,whereText,whyText,moveText,explanation,legacyReasoning,presentation,contradictionFocus,contradictionAnalysis,contradictionExplanation,contradictionText,text})
}
return Object.freeze({VERSION,GAME,SOURCE,PLACEMENT_DETAIL_LIMIT,TECHNIQUE_TITLES,createPresenter,focusForDeduction,engineDeduction,signature,placementDetailEligible,placementDetailHtml,contradictionFocus,contradictionAnalysis});
});
