/*
 * QUADLUD — Mosaïque / Nonogram specialized Web runtime marker
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.QuadludNonogramRuntime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';return Object.freeze({VERSION:1,GAME:'nonogram'})});
