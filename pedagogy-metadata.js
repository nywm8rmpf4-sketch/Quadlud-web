/*
 * QUADLUD — Pedagogical technique metadata
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludPedagogyMetadata=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=2,CATALOG_SCHEMA=1,RULE_METADATA_SCHEMA=1;
  const freeze=v=>{if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const x of Object.values(v))freeze(x);return Object.freeze(v)};
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  // Stable curriculum/statistics catalog inherited from the v2.13+ pedagogy layer.
  // Its IDs are intentionally preserved so mastery, learning and training data remain compatible.
  const CATALOG=freeze({
    Q_EXCLUSION_ROW:{game:'queens',rank:0,kind:'exclusion',scope:'row'},
    Q_EXCLUSION_COLUMN:{game:'queens',rank:0,kind:'exclusion',scope:'column'},
    Q_EXCLUSION_REGION:{game:'queens',rank:0,kind:'exclusion',scope:'region'},
    Q_EXCLUSION_ADJACENCY:{game:'queens',rank:0,kind:'adjacency'},
    Q_UNIQUE_ROW:{game:'queens',rank:0,kind:'uniquePosition',scope:'row'},
    Q_UNIQUE_COLUMN:{game:'queens',rank:0,kind:'uniquePosition',scope:'column'},
    Q_UNIQUE_REGION:{game:'queens',rank:0,kind:'uniquePosition',scope:'region'},
    Q_CONTRADICTION_R1:{game:'queens',rank:1,kind:'contradiction'},
    Q_CONTRADICTION_R2:{game:'queens',rank:2,kind:'contradiction'},
    Q_CONTRADICTION_R3:{game:'queens',rank:3,kind:'contradiction'},

    T_BALANCE_ROW:{game:'tango',rank:0,kind:'balance',scope:'row'},
    T_BALANCE_COLUMN:{game:'tango',rank:0,kind:'balance',scope:'column'},
    T_NO_THREE:{game:'tango',rank:0,kind:'noThree'},
    T_RELATION_EQUAL:{game:'tango',rank:0,kind:'relation',symbol:'='},
    T_RELATION_OPPOSITE:{game:'tango',rank:0,kind:'relation',symbol:'×'},
    T_CONTRADICTION_R1:{game:'tango',rank:1,kind:'contradiction'},
    T_CONTRADICTION_R2:{game:'tango',rank:2,kind:'contradiction'},

    S_NAKED_SINGLE:{game:'sudoku',rank:0,kind:'singleCandidate'},
    S_HIDDEN_ROW:{game:'sudoku',rank:0,kind:'hiddenSingle',scope:'row'},
    S_HIDDEN_COLUMN:{game:'sudoku',rank:0,kind:'hiddenSingle',scope:'column'},
    S_HIDDEN_BOX:{game:'sudoku',rank:0,kind:'hiddenSingle',scope:'box'},
    S_CONTRADICTION_R1:{game:'sudoku',rank:1,kind:'contradiction'},
    S_CONTRADICTION_R2:{game:'sudoku',rank:2,kind:'contradiction'},

    P_MANDATORY_CELL:{game:'patches',rank:0,kind:'mandatoryCell'},
    P_SINGLE_RECTANGLE:{game:'patches',rank:0,kind:'singleRectangle'},
    P_CONTRADICTION_R1:{game:'patches',rank:1,kind:'contradiction'},
    P_CONTRADICTION_R2:{game:'patches',rank:2,kind:'contradiction'},

    N_EMPTY_LINE:{game:'nonogram',rank:0,kind:'emptyLine'},
    N_EXACT_FIT:{game:'nonogram',rank:0,kind:'exactFit'},
    N_OVERLAP:{game:'nonogram',rank:1,kind:'overlap'},
    N_BLOCK_EXTENSION:{game:'nonogram',rank:2,kind:'blockExtension'},
    N_BLOCK_BOUNDARY:{game:'nonogram',rank:2,kind:'blockBoundary'},
    N_FORCED_EMPTY:{game:'nonogram',rank:3,kind:'forcedEmpty'}
  });

  // Engine-facing IDs that existed in the v2.27 presenter mapping but were not curriculum cards.
  // They are now explicit metadata, while staying unlisted/untracked to preserve existing stats/UI.
  const UNTRACKED=freeze({
    S_LOCKED_CANDIDATE:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    S_NAKED_PAIR:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    S_HIDDEN_PAIR:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    S_NAKED_TRIPLE:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    S_HIDDEN_TRIPLE:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    S_COMMON_CONSEQUENCE:{game:'sudoku',listed:false,tracked:false,statsKey:null},
    N_CONTRADICTION:{game:'nonogram',listed:false,tracked:false,statsKey:null}
  });

  const TECHNIQUES=freeze(Object.fromEntries([
    ...Object.entries(CATALOG).map(([id,m])=>[id,{id,...clone(m),listed:true,tracked:true,statsKey:id}]),
    ...Object.entries(UNTRACKED).map(([id,m])=>[id,{id,...clone(m)}])
  ]));

  // Declarative rule → pedagogical-technique bindings. Null is explicit: the engine rule has
  // no curriculum technique ID and must not be fabricated by a presenter.
  const HINT_FALLBACKS=freeze({
    queens:{direct:'Q_UNIQUE_REGION',contradiction:{1:'Q_CONTRADICTION_R1',2:'Q_CONTRADICTION_R2',3:'Q_CONTRADICTION_R3'}},
    tango:{direct:'T_NO_THREE',contradiction:{1:'T_CONTRADICTION_R1',2:'T_CONTRADICTION_R2'}},
    sudoku:{direct:'S_NAKED_SINGLE',contradiction:{1:'S_CONTRADICTION_R1',2:'S_CONTRADICTION_R2'}},
    patches:{direct:'P_MANDATORY_CELL',contradiction:{1:'P_CONTRADICTION_R1',2:'P_CONTRADICTION_R2'}},
    nonogram:{direct:'N_EXACT_FIT',contradiction:{}}
  });

  const RULES=freeze({
    queens:{
      SINGLETON:{selector:{path:'explanationData.unit.family',values:{row:'Q_UNIQUE_ROW',column:'Q_UNIQUE_COLUMN'},default:'Q_UNIQUE_REGION'}},
      LOCKED_UNIT:{techniqueId:null},
      COMMON_CONFLICT:{techniqueId:null},
      HALL_SET:{techniqueId:null},
      LOCAL_CAPACITY:{techniqueId:null},
      NO_SUPPORT:{techniqueId:null},
      MIXED_HALL:{techniqueId:null},
      ASSUMPTION_CONTRADICTION:{techniqueId:'Q_CONTRADICTION_R2'}
    },
    tango:{
      RELATION_PROPAGATION:{selector:{path:'explanationData.parity',values:{'0':'T_RELATION_EQUAL'},default:'T_RELATION_OPPOSITE'}},
      RELATION_CLOSURE:{techniqueId:null},
      TRIPLE_CONSTRAINT:{techniqueId:'T_NO_THREE'},
      BALANCE_QUOTA:{selector:{path:'explanationData.family',values:{column:'T_BALANCE_COLUMN'},default:'T_BALANCE_ROW'}},
      BALANCE_RELATION:{techniqueId:null},
      RELATION_BALANCE:{techniqueId:null},
      RELATION_BALANCE_COMPONENT:{techniqueId:null},
      LINE_DOMAIN_SUPPORT:{techniqueId:null},
      ASSUMPTION_CONTRADICTION:{techniqueId:'T_CONTRADICTION_R2'},
      COMMON_CONSEQUENCE:{techniqueId:null}
    },
    sudoku:{
      NAKED_SINGLE:{techniqueId:'S_NAKED_SINGLE'},
      HIDDEN_SINGLE_ROW:{techniqueId:'S_HIDDEN_ROW'},
      HIDDEN_SINGLE_COLUMN:{techniqueId:'S_HIDDEN_COLUMN'},
      HIDDEN_SINGLE_BOX:{techniqueId:'S_HIDDEN_BOX'},
      LOCKED_CANDIDATE:{techniqueId:'S_LOCKED_CANDIDATE'},
      NAKED_SUBSET_2:{techniqueId:'S_NAKED_PAIR'},
      HIDDEN_SUBSET_2:{techniqueId:'S_HIDDEN_PAIR'},
      NAKED_SUBSET_3:{techniqueId:'S_NAKED_TRIPLE'},
      HIDDEN_SUBSET_3:{techniqueId:'S_HIDDEN_TRIPLE'},
      CONTRADICTION_L1:{techniqueId:'S_CONTRADICTION_R1'},
      COMMON_BRANCH_CONSEQUENCE:{techniqueId:'S_COMMON_CONSEQUENCE'},
      CONTRADICTION_L2:{techniqueId:'S_CONTRADICTION_R2'}
    },
    patches:{
      CLUE_SINGLETON:{techniqueId:'P_SINGLE_RECTANGLE'},
      CELL_SINGLETON:{techniqueId:'P_SINGLE_RECTANGLE'},
      RECTANGULAR_CLOSURE:{techniqueId:'P_MANDATORY_CELL'},
      AREA_COMPLETION:{techniqueId:'P_SINGLE_RECTANGLE'},
      COMMON_COVERAGE:{techniqueId:'P_MANDATORY_CELL'},
      CELL_LOCKED_TO_CLUE:{techniqueId:'P_MANDATORY_CELL'},
      COVERAGE_LOCKED_SET:{techniqueId:'P_CONTRADICTION_R1'},
      NO_SUPPORT_CLUE:{techniqueId:'P_CONTRADICTION_R1'},
      NO_SUPPORT_CELL:{techniqueId:'P_CONTRADICTION_R1'},
      LOCAL_DOMAIN_SUPPORT:{techniqueId:'P_CONTRADICTION_R1'},
      ASSUMPTION_CONTRADICTION:{techniqueId:'P_CONTRADICTION_R2'},
      COMMON_CONSEQUENCE:{techniqueId:'P_CONTRADICTION_R2'}
    },
    nonogram:{
      N_EMPTY_LINE:{techniqueId:'N_EMPTY_LINE'},
      N_EXACT_FIT:{techniqueId:'N_EXACT_FIT'},
      N_OVERLAP:{techniqueId:'N_OVERLAP'},
      N_BLOCK_EXTENSION:{techniqueId:'N_BLOCK_EXTENSION'},
      N_BLOCK_BOUNDARY:{techniqueId:'N_BLOCK_BOUNDARY'},
      N_FORCED_EMPTY:{techniqueId:'N_FORCED_EMPTY'},
      N_CONTRADICTION:{techniqueId:null}
    }
  });

  function pathValue(obj,path){let cur=obj;for(const key of String(path||'').split('.')){if(!key)continue;if(cur==null||typeof cur!=='object'||!(key in cur))return undefined;cur=cur[key]}return cur}
  function bindingFor(game,rule){return RULES?.[game]?.[rule]||null}
  function techniqueIdForDeduction(game,deduction){
    if(!deduction||typeof deduction.rule!=='string')return null;
    const binding=bindingFor(game,deduction.rule);if(!binding)return null;
    if(Object.prototype.hasOwnProperty.call(binding,'techniqueId'))return binding.techniqueId;
    const selector=binding.selector,value=pathValue(deduction,selector?.path),key=String(value);
    return Object.prototype.hasOwnProperty.call(selector?.values||{},key)?selector.values[key]:(selector?.default??null)
  }
  function techniqueIdForHint(game,hint){
    const explicit=hint?.technique;if(explicit&&catalogTechnique(explicit)?.game===game)return explicit;
    const fallback=HINT_FALLBACKS[game];if(!fallback)return null;
    const rank=Math.max(0,Number(hint?.rank)||0),contradiction=rank>0?fallback.contradiction?.[rank]:null;
    return contradiction||fallback.direct||null
  }
  function technique(id){return typeof id==='string'?(TECHNIQUES[id]||null):null}
  function catalogTechnique(id){return typeof id==='string'?(CATALOG[id]||null):null}
  function isCatalogTechnique(id){return !!catalogTechnique(id)}
  function catalogIdsForGame(game){return Object.keys(CATALOG).filter(id=>CATALOG[id].game===game).sort((a,b)=>CATALOG[a].rank-CATALOG[b].rank||a.localeCompare(b))}
  function ruleMetadata(game,deduction){
    const rule=deduction?.rule;if(typeof rule!=='string'||!rule)return null;
    const binding=bindingFor(game,rule);if(!binding)return freeze({schema:RULE_METADATA_SCHEMA,game,rule,known:false,techniqueId:null,technique:null,tracked:false});
    const techniqueId=techniqueIdForDeduction(game,deduction),meta=technique(techniqueId);
    return freeze({schema:RULE_METADATA_SCHEMA,game,rule,known:true,techniqueId,technique:meta?clone(meta):null,tracked:!!meta?.tracked})
  }

  return freeze({VERSION,CATALOG_SCHEMA,RULE_METADATA_SCHEMA,CATALOG,TECHNIQUES,HINT_FALLBACKS,RULES,technique,catalogTechnique,isCatalogTechnique,catalogIdsForGame,bindingFor,techniqueIdForDeduction,techniqueIdForHint,ruleMetadata});
});
