/*
 * QUADLUD — serializable generic session/history core
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludSessionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=2;
  const HISTORY_SCHEMA=1;
  const LIFECYCLE_METHODS=Object.freeze(['snapshot','applySnapshot','hasProgress','resetState','historyChanges','normalizeHistoryAction']);

  function cloneGrid(value){return Array.isArray(value)?value.map(row=>Array.isArray(row)?[...row]:row):value}
  function cloneJson(value){return value==null?value:JSON.parse(JSON.stringify(value))}
  function snapshotKey(snapshot){return JSON.stringify(snapshot)}

  function requireResolver(resolveLifecycle){
    if(typeof resolveLifecycle!=='function')throw new TypeError('QUADLUD SessionCore requires a sessionLifecycle resolver');
    return resolveLifecycle
  }
  function requireLifecycle(resolveLifecycle,current){
    if(!current?.game)throw new Error('QUADLUD session requires a game id');
    const lifecycle=resolveLifecycle(current.game);
    if(!lifecycle||typeof lifecycle!=='object')throw new Error(`QUADLUD sessionLifecycle unavailable for ${current.game}`);
    for(const method of LIFECYCLE_METHODS)if(typeof lifecycle[method]!=='function')throw new Error(`QUADLUD sessionLifecycle for ${current.game} must expose ${method}()`);
    return lifecycle
  }
  function assertSnapshot(current,snapshot){
    if(!snapshot||typeof snapshot!=='object'||snapshot.game!==current?.game)throw new Error('Invalid QUADLUD session snapshot');
    return snapshot
  }

  function createHistoryController(resolveLifecycle){
    const resolve=requireResolver(resolveLifecycle);

    function puzzleSnapshot(current){
      if(!current)return null;
      const lifecycle=requireLifecycle(resolve,current);
      return assertSnapshot(current,lifecycle.snapshot(current))
    }
    function applyPuzzleSnapshot(current,snapshot){
      if(!current||!snapshot||snapshot.game!==current.game)return false;
      const lifecycle=requireLifecycle(resolve,current);
      return lifecycle.applySnapshot(current,snapshot)!==false
    }
    function hasPuzzleProgress(current){
      if(!current)return false;
      return !!requireLifecycle(resolve,current).hasProgress(current)
    }
    function resetPuzzleState(current){
      if(!current)return false;
      return requireLifecycle(resolve,current).resetState(current)!==false
    }
    function historyChanges(current,beforeKey,after){
      if(!current||!beforeKey||!after)return [];
      let before;try{before=JSON.parse(beforeKey)}catch(_){return []}
      if(!before||before.game!==current.game||after.game!==current.game)return [];
      const changes=requireLifecycle(resolve,current).historyChanges(before,after,current);
      return Array.isArray(changes)?cloneJson(changes):[]
    }
    function normalizeHistoryAction(current,action,beforeKey=null,after=null,now=Date.now){
      const base=typeof action==='string'?{type:action}:(action&&typeof action==='object'?{...action}:{type:'MOVE'});
      const changes=historyChanges(current,beforeKey,after);
      base.type=base.type||'MOVE';base.game=current?.game||base.game||null;base.at=now();base.changes=changes;
      if(!current)return base;
      const normalized=requireLifecycle(resolve,current).normalizeHistoryAction(current,base,changes);
      if(!normalized||typeof normalized!=='object')throw new Error(`Invalid normalized history action for ${current.game}`);
      return {...normalized,type:normalized.type||base.type,game:current.game,at:base.at,changes}
    }
    function ensureHistory(current,force=false,now=Date.now){
      if(!current)return null;
      const h=current.moveHistory;
      if(!force&&h&&h.schema===HISTORY_SCHEMA&&h.nodes&&h.cursor&&h.nodes[h.cursor])return h;
      const rootNode={id:'h0',parent:null,children:[],preferred:null,action:{type:'START',game:current.game,at:now()},snapshot:puzzleSnapshot(current)};
      current.moveHistory={schema:HISTORY_SCHEMA,nextId:1,cursor:'h0',nodes:{h0:rootNode},stats:{undos:0,redos:0,branches:0}};
      return current.moveHistory
    }
    function historyNode(current,id=null){const h=current?.moveHistory,key=id??h?.cursor;return key?h?.nodes?.[key]||null:null}
    function canUndo(current){const node=historyNode(current);return !!(current&&!current.completed&&node?.parent&&current.moveHistory.nodes[node.parent])}
    function redoTarget(current){
      const h=current?.moveHistory,node=h?.nodes?.[h?.cursor];if(!node||!node.children?.length)return null;
      const id=node.preferred&&node.children.includes(node.preferred)?node.preferred:node.children[node.children.length-1];
      return h.nodes[id]||null
    }
    function canRedo(current){return !!(current&&!current.completed&&redoTarget(current))}
    function recordHistory(current,action='MOVE',beforeKey=null,now=Date.now){
      if(!current)return {changed:false,reason:'no-session'};
      const h=ensureHistory(current,false,now),snapshot=puzzleSnapshot(current),key=snapshotKey(snapshot);
      if(beforeKey!=null&&beforeKey===key)return {changed:false,reason:'same-snapshot',history:h,snapshot};
      const parent=h.nodes[h.cursor];if(!parent)return {changed:false,reason:'invalid-cursor',history:h,snapshot};
      const normalized=normalizeHistoryAction(current,action,beforeKey,snapshot,now);
      const existing=(parent.children||[]).map(id=>h.nodes[id]).find(node=>node&&snapshotKey(node.snapshot)===key);
      if(existing){parent.preferred=existing.id;h.cursor=existing.id;existing.action=normalized;return {changed:true,existing:true,hadAlternative:false,history:h,parent,node:existing,normalized,snapshot}}
      const id=`h${h.nextId++}`,hadAlternative=(parent.children||[]).length>0,node={id,parent:parent.id,children:[],preferred:null,action:normalized,snapshot};
      parent.children=parent.children||[];parent.children.push(id);parent.preferred=id;h.nodes[id]=node;h.cursor=id;
      if(hadAlternative)h.stats.branches=(h.stats.branches||0)+1;
      return {changed:true,existing:false,hadAlternative,history:h,parent,node,normalized,snapshot}
    }
    function undoHistory(current,count=1){
      const h=ensureHistory(current),countN=Math.max(1,Math.floor(Number(count)||1));let moved=0;
      while(moved<countN){const node=h.nodes[h.cursor];if(!node?.parent)break;const parent=h.nodes[node.parent];if(!parent)break;parent.preferred=node.id;h.cursor=parent.id;moved++}
      if(moved)h.stats.undos=(h.stats.undos||0)+moved;
      return {moved,history:h,node:h.nodes[h.cursor]||null,snapshot:h.nodes[h.cursor]?.snapshot||null}
    }
    function redoHistory(current,count=1){
      const h=ensureHistory(current),countN=Math.max(1,Math.floor(Number(count)||1));let moved=0;
      while(moved<countN){const node=h.nodes[h.cursor];if(!node?.children?.length)break;const id=node.preferred&&node.children.includes(node.preferred)?node.preferred:node.children[node.children.length-1],next=h.nodes[id];if(!next)break;h.cursor=id;moved++}
      if(moved)h.stats.redos=(h.stats.redos||0)+moved;
      return {moved,history:h,node:h.nodes[h.cursor]||null,snapshot:h.nodes[h.cursor]?.snapshot||null}
    }
    function nodeDepth(current,id){let h=current?.moveHistory,d=0,node=h?.nodes?.[id],guard=0;while(node?.parent&&guard++<10000){d++;node=h.nodes[node.parent]}return d}
    function isDescendant(current,id,ancestor){let h=current?.moveHistory,node=h?.nodes?.[id],guard=0;while(node&&guard++<10000){if(node.id===ancestor)return true;node=node.parent?h.nodes[node.parent]:null}return false}
    function pathFrom(current,ancestor,id){if(!isDescendant(current,id,ancestor))return [];const h=current.moveHistory,out=[];let node=h.nodes[id],guard=0;while(node&&node.id!==ancestor&&guard++<10000){out.push(node.id);node=h.nodes[node.parent]}return out.reverse()}
    function summary(current){const h=current?.moveHistory;if(!h)return {nodes:0,branches:0,undos:0,redos:0};return {nodes:Object.keys(h.nodes||{}).length,branches:h.stats?.branches||0,undos:h.stats?.undos||0,redos:h.stats?.redos||0}}
    function historyValid(current){const h=current?.moveHistory,node=h?.nodes?.[h.cursor],rootNode=h?.nodes?.h0;if(!h||h.schema!==HISTORY_SCHEMA||!node||!rootNode||rootNode.parent!==null)return false;try{return snapshotKey(node.snapshot)===snapshotKey(puzzleSnapshot(current))}catch(_){return false}}

    return Object.freeze({
      puzzleSnapshot,applyPuzzleSnapshot,hasPuzzleProgress,resetPuzzleState,ensureHistory,historyNode,canUndo,redoTarget,canRedo,
      historyChanges,normalizeHistoryAction,recordHistory,undoHistory,redoHistory,nodeDepth,isDescendant,pathFrom,summary,historyValid
    })
  }

  return Object.freeze({VERSION,HISTORY_SCHEMA,LIFECYCLE_METHODS,cloneGrid,cloneJson,snapshotKey,createHistoryController});
});
