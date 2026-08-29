/*
 * QUADLUD — Mosaïque / Nonogram Web renderer/input adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const logic=(typeof module==='object'&&module.exports)?require('./nonogram-logic.js'):(root&&root.NonogramLogic);
  const sessions=(typeof module==='object'&&module.exports)?require('./game-session-adapters.js'):(root&&root.QuadludGameSessionAdapters);
  const api=factory(logic,sessions);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludNonogramUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Logic,SessionAdapters){
'use strict';
if(!Logic||typeof Logic.cellId!=='function')throw new Error('NonogramUI requires NonogramLogic');
if(!SessionAdapters?.nonogram||typeof SessionAdapters.nonogram.createCellMove!=='function')throw new Error('NonogramUI requires Nonogram session adapter');

const VERSION=1;
const PRODUCT_SIZES=Object.freeze([5,10]);
const MODES=Object.freeze({FILL:'fill',CROSS:'cross',ERASE:'erase'});
const FOCUS_CLASSES=Object.freeze(['ng-focus-premise','ng-focus-context','ng-focus-target','ng-focus-contradiction']);
const DEFAULT_LABELS=Object.freeze({
  name:'Mosaïque',fill:'Remplir',cross:'Croix',erase:'Effacer',unknown:'Inconnu',filled:'Remplie',empty:'Croix',
  row:'Ligne',column:'Colonne',rowClue:'Indice de ligne',columnClue:'Indice de colonne',noBlock:'Aucun bloc',board:'Grille Mosaïque',tools:'Outils Mosaïque'
});

function escapeCss(value){return String(value).replace(/(["\\])/g,'\\$1')}
function translatedLabels(tr){
  if(typeof tr!=='function')return {};
  const get=(key,fallback)=>{const value=tr(key);return typeof value==='string'&&value&&value!==key?value:fallback};
  return {
    name:get('gameNonogram',DEFAULT_LABELS.name),fill:get('ngFill',DEFAULT_LABELS.fill),cross:get('ngCross',DEFAULT_LABELS.cross),erase:get('ngErase',DEFAULT_LABELS.erase),
    unknown:get('ngUnknown',DEFAULT_LABELS.unknown),filled:get('ngFilled',DEFAULT_LABELS.filled),empty:get('ngEmpty',DEFAULT_LABELS.empty),
    row:get('rowLabel',DEFAULT_LABELS.row),column:get('columnLabel',DEFAULT_LABELS.column),rowClue:get('ngRowClue',DEFAULT_LABELS.rowClue),columnClue:get('ngColumnClue',DEFAULT_LABELS.columnClue),
    noBlock:get('ngNoBlock',DEFAULT_LABELS.noBlock),board:get('ngBoard',DEFAULT_LABELS.board),tools:get('ngTools',DEFAULT_LABELS.tools)
  }
}
function labelSet(custom,tr){return Object.freeze({...DEFAULT_LABELS,...translatedLabels(tr),...(custom||{})})}
function stateLabel(state,labels){return state===Logic.FILLED?labels.filled:state===Logic.EMPTY?labels.empty:labels.unknown}
function displayClue(clues){return clues.length?clues.join(' '):'0'}
function isProductSizeEnabled(size){return PRODUCT_SIZES.includes(Number(size))}
function parseCellEntity(entity){if(entity?.kind!=='cell')return null;const m=/^r(\d+)c(\d+)$/.exec(String(entity.id||''));return m?[Number(m[1]),Number(m[2])]:null}
function entitySelector(entity){if(!entity||typeof entity.kind!=='string'||typeof entity.id!=='string')return null;return `[data-entity-kind="${escapeCss(entity.kind)}"][data-entity-id="${escapeCss(entity.id)}"]`}

function createAdapter(deps){
  if(!deps||typeof deps!=='object')throw new Error('QUADLUD Nonogram UI dependencies unavailable');
  const required=['document','query','shell','getCurrent','isPaused','a11ySetupGrid','a11yAnnounce','a11yCoord','a11ySetCell','applyLogicalMove'];
  for(const name of required)if(deps[name]==null)throw new Error(`QUADLUD Nonogram UI dependency unavailable: ${name}`);
  const {document,query,shell,getCurrent,isPaused,a11ySetupGrid,a11yAnnounce,a11yCoord,a11ySetCell,applyLogicalMove}=deps;
  const maybeAutoFinish=typeof deps.maybeAutoFinish==='function'?deps.maybeAutoFinish:()=>false;
  const haptic=typeof deps.haptic==='function'?deps.haptic:()=>{};
  const recordDiagnostic=typeof deps.recordDiagnostic==='function'?deps.recordDiagnostic:()=>{};
  const labels=labelSet(deps.labels,deps.tr);
  let mode=MODES.FILL;

  function currentSession(){const s=getCurrent();return s?.game==='nonogram'?s:null}
  function clueDomId(axis,index){return `ng-${axis}-clue-${index}`}
  function cellElement(r,c){return query(`#ngboard .cell[data-r="${r}"][data-c="${c}"]`)}
  function setMode(next){if(!Object.values(MODES).includes(next))throw new Error(`Invalid Nonogram UI mode ${next}`);let changed=mode!==next;mode=next;syncModeButtons();if(changed)recordDiagnostic('ui.tool-change',{game:'nonogram',tool:mode});a11yAnnounce(`${labels.tools}: ${next===MODES.FILL?labels.fill:next===MODES.CROSS?labels.cross:labels.erase}`);return mode}
  function syncModeButtons(){for(const [id,m] of [['#ngFillMode',MODES.FILL],['#ngCrossMode',MODES.CROSS],['#ngEraseMode',MODES.ERASE]]){const el=query(id);if(el)el.setAttribute('aria-pressed',String(mode===m))}}
  function desiredState(current){if(mode===MODES.ERASE)return Logic.UNKNOWN;const target=mode===MODES.FILL?Logic.FILLED:Logic.EMPTY;return current===target?Logic.UNKNOWN:target}
  function applyAt(r,c){
    const s=currentSession();if(!s||isPaused())return false;
    const before=s.state[r]?.[c];if(before==null)return false;const next=desiredState(before);if(next===before)return false;
    const move=SessionAdapters.nonogram.createCellMove(r,c,next);applyLogicalMove(move);draw();haptic(4);a11yAnnounce(`${a11yCoord(r,c)}, ${stateLabel(next,labels)}`);maybeAutoFinish();return true
  }
  function clueTokens(axis,lineIndex,clues){
    if(!clues.length)return `<span class="ng-clue-token" data-entity-kind="clue" data-entity-id="${Logic.clueId(axis,lineIndex,0)}" aria-label="${labels.noBlock}">0</span>`;
    return clues.map((v,i)=>`<span class="ng-clue-token" data-entity-kind="clue" data-entity-id="${Logic.clueId(axis,lineIndex,i)}">${v}</span>`).join('')
  }
  function content(session){
    const p=session.puzzle,rows=p.rows,cols=p.cols;
    const colClues=p.colClues.map((clues,c)=>`<div class="ng-col-clue" id="${clueDomId('col',c)}" role="columnheader" aria-label="${labels.columnClue} ${c+1}: ${displayClue(clues)}" data-entity-kind="column" data-entity-id="${Logic.columnId(c)}">${clueTokens('column',c,clues)}</div>`).join('');
    const rowClues=p.rowClues.map((clues,r)=>`<div class="ng-row-clue" id="${clueDomId('row',r)}" role="rowheader" aria-label="${labels.rowClue} ${r+1}: ${displayClue(clues)}" data-entity-kind="row" data-entity-id="${Logic.rowId(r)}">${clueTokens('row',r,clues)}</div>`).join('');
    return `<div class="nonogram-game" data-ng-size="${rows}x${cols}" data-product-size-enabled="${isProductSizeEnabled(rows)&&rows===cols?'true':'false'}">
      <div class="nonogram-tools" role="toolbar" aria-label="${labels.tools}">
        <button class="btn ng-tool" id="ngFillMode" type="button" aria-pressed="true" aria-keyshortcuts="F 1">■ ${labels.fill}</button>
        <button class="btn ng-tool" id="ngCrossMode" type="button" aria-pressed="false" aria-keyshortcuts="X 2">× ${labels.cross}</button>
        <button class="btn ng-tool" id="ngEraseMode" type="button" aria-pressed="false" aria-keyshortcuts="E Delete Backspace 0">⌫ ${labels.erase}</button>
      </div>
      <div class="nonogram-layout" style="--ng-cols:${cols};--ng-rows:${rows}">
        <div class="ng-corner" aria-hidden="true"></div>
        <div class="ng-col-clues">${colClues}</div>
        <div class="ng-row-clues">${rowClues}</div>
        <div class="board nonogram-board" id="ngboard"></div>
      </div>
    </div>`
  }
  function syncAccessibility(){
    const s=currentSession(),board=query('#ngboard');if(!s||!board)return false;
    [...board.children].forEach((cell,i)=>{const r=Math.floor(i/s.puzzle.cols),c=i%s.puzzle.cols,state=s.state[r][c];a11ySetCell(cell,r,c,`${a11yCoord(r,c)}, ${stateLabel(state,labels)}`);cell.setAttribute('aria-describedby',`${clueDomId('row',r)} ${clueDomId('col',c)}`)});return true
  }
  function draw(){
    const s=currentSession(),board=query('#ngboard');if(!s||!board)return false;const cols=s.puzzle.cols;
    [...board.children].forEach((cell,i)=>{const r=Math.floor(i/cols),c=i%cols,v=s.state[r][c];cell.classList.toggle('ng-filled',v===Logic.FILLED);cell.classList.toggle('ng-empty',v===Logic.EMPTY);cell.classList.toggle('ng-unknown',v===Logic.UNKNOWN);cell.textContent=v===Logic.EMPTY?'×':'';cell.setAttribute('data-state',Logic.STATE_NAMES[v]);});syncAccessibility();syncModeButtons();return true
  }
  function reset(session=currentSession()){if(!session||session.game!=='nonogram')return false;clearEntityFocus();return draw()}
  function buildCells(session){
    const board=query('#ngboard'),rows=session.puzzle.rows,cols=session.puzzle.cols;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const cell=document.createElement('div');cell.className='cell ng-cell ng-unknown';cell.dataset.r=String(r);cell.dataset.c=String(c);cell.dataset.entityKind='cell';cell.dataset.entityId=Logic.cellId(r,c);if((c+1)%5===0&&c<cols-1)cell.classList.add('ng-group-right');if((r+1)%5===0&&r<rows-1)cell.classList.add('ng-group-bottom');cell.addEventListener('click',()=>applyAt(r,c));board.appendChild(cell)}
    a11ySetupGrid(board,rows,cols,{label:labels.board,keyshortcuts:'ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F X E 1 2 0 Delete Backspace',activate:cell=>applyAt(+cell.dataset.r,+cell.dataset.c),onKey:(event,cell)=>{
      const key=String(event.key||'').toLowerCase();if(key==='f'||key==='1'){setMode(MODES.FILL);return true}if(key==='x'||key==='2'){setMode(MODES.CROSS);return true}if(key==='e'||key==='0'){setMode(MODES.ERASE);return true}if(key==='delete'||key==='backspace'){const prior=mode;mode=MODES.ERASE;applyAt(+cell.dataset.r,+cell.dataset.c);mode=prior;syncModeButtons();return true}return false
    }});
  }
  function render(session){
    if(!session||session.game!=='nonogram')return false;const p=Logic.validatePuzzle(session.puzzle);if(p.rows!==session.state.length)throw new Error('Nonogram UI session state mismatch');
    const name=typeof deps.gameLabel==='function'?deps.gameLabel('nonogram'):labels.name;const diff=typeof deps.difficultyLabel==='function'?deps.difficultyLabel(session.diff):String(session.diff||'');const rules=typeof deps.gameRules==='function'?deps.gameRules('nonogram'):'';
    shell(name,`${p.rows}×${p.cols}${diff?` · ${diff}`:''}`,session.diff,content(session),rules);
    buildCells(session);query('#ngFillMode').onclick=()=>setMode(MODES.FILL);query('#ngCrossMode').onclick=()=>setMode(MODES.CROSS);query('#ngEraseMode').onclick=()=>setMode(MODES.ERASE);draw();return query('#ngboard')
  }
  function resolveEntity(entity){const selector=entitySelector(entity);return selector?query(selector):null}
  function clearEntityFocus(){const scope=query('.nonogram-game');if(!scope)return;for(const cls of FOCUS_CLASSES)scope.querySelectorAll?.(`.${cls}`)?.forEach(el=>el.classList.remove(cls))}
  function focusEntities(focus){
    if(!Array.isArray(focus))throw new TypeError('Nonogram UI focus must be an array');clearEntityFocus();const out=[];
    for(const item of focus){const el=resolveEntity(item?.entity);if(!el)continue;const role=String(item.role||'context').toLowerCase();const cls=FOCUS_CLASSES.includes(`ng-focus-${role}`)?`ng-focus-${role}`:'ng-focus-context';el.classList.add(cls);out.push(el)}
    out[0]?.scrollIntoView?.({block:'nearest',inline:'nearest'});return out
  }
  function keyboardInput(event){const cell=document.activeElement?.closest?.('#ngboard .cell');if(!cell)return false;const key=String(event.key||'').toLowerCase();if(key==='f'||key==='1'){setMode(MODES.FILL);return true}if(key==='x'||key==='2'){setMode(MODES.CROSS);return true}if(key==='e'||key==='0'){setMode(MODES.ERASE);return true}return false}

  return Object.freeze({render,draw,reset,syncAccessibility,resolveEntity,focusEntities,keyboardInput,setMode,getMode:()=>mode,applyAt,isProductSizeEnabled})
}

return Object.freeze({VERSION,PRODUCT_SIZES,MODES,DEFAULT_LABELS,isProductSizeEnabled,parseCellEntity,entitySelector,createAdapter});
});
