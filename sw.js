/*
 * QUADLUD
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 */
const CACHE='quadlud-v3.1.6';
const ASSETS=['./','./index.html','./styles-core.css?v=3.1.6','./styles-patches.css?v=3.1.6','./styles-i18n.css?v=3.1.6','./styles-pedagogy.css?v=3.1.6','./styles-patches-direct.css?v=3.1.6','./styles-accessibility.css?v=3.1.6','./styles-sudoku-proof.css?v=3.1.6','./styles-data.css?v=3.1.6','./styles-nonogram.css?v=3.1.6','./styles-mobile.css?v=3.1.6','./queens-logic.js?v=3.1.6','./difficulty-rating.js?v=3.1.6','./queens-difficulty.js?v=3.1.6','./tango-logic.js?v=3.1.6','./tango-difficulty.js?v=3.1.6','./patches-logic.js?v=3.1.6','./patches-difficulty.js?v=3.1.6','./sudoku-logic.js?v=3.1.6','./sudoku-difficulty.js?v=3.1.6','./platform-web.js?v=3.1.6','./web-storage.js?v=3.1.6','./data-serialization.js?v=3.1.6','./persistence-services.js?v=3.1.6','./generation-common.js?v=3.1.6','./queens-qpool4.js?v=3.1.6','./queens-generator.js?v=3.1.6','./tango-generator.js?v=3.1.6','./sudoku-generator.js?v=3.1.6','./patches-generator.js?v=3.1.6','./session-core.js?v=3.1.6','./logical-move.js?v=3.1.6','./game-session-adapters.js?v=3.1.6','./reasoning-view.js?v=3.1.6','./game-ui-adapters.js?v=3.1.6','./game-contract.js?v=3.1.6','./game-manifest.js?v=3.1.6','./game-registry.js?v=3.1.6','./queens-ui.js?v=3.1.6','./tango-ui.js?v=3.1.6','./sudoku-ui.js?v=3.1.6','./patches-ui.js?v=3.1.6','./queens-runtime.js?v=3.1.6',
  './tango-runtime.js?v=3.1.6',
  './sudoku-runtime.js?v=3.1.6',
  './patches-runtime.js?v=3.1.6',
  './game-pedagogy-adapters.js?v=3.1.6','./queens-pedagogy.js?v=3.1.6','./tango-pedagogy.js?v=3.1.6','./sudoku-pedagogy.js?v=3.1.6','./patches-pedagogy.js?v=3.1.6','./pedagogy-metadata.js?v=3.1.6','./reasoning-presentation.js?v=3.1.6','./queens-reasoning-presentation.js?v=3.1.6','./tango-reasoning-presentation.js?v=3.1.6','./sudoku-reasoning-presentation.js?v=3.1.6','./patches-reasoning-presentation.js?v=3.1.6','./i18n-catalog.js?v=3.1.6',
  './queens-i18n.js?v=3.1.6',
  './tango-i18n.js?v=3.1.6',
  './sudoku-i18n.js?v=3.1.6',
  './patches-i18n.js?v=3.1.6','./nonogram-logic.js?v=3.1.6','./nonogram-validation-solver.js?v=3.1.6','./nonogram-difficulty.js?v=3.1.6','./nonogram-generator.js?v=3.1.6','./nonogram-ui.js?v=3.1.6','./nonogram-runtime.js?v=3.1.6','./nonogram-pedagogy.js?v=3.1.6','./nonogram-reasoning-presentation.js?v=3.1.6','./nonogram-i18n.js?v=3.1.6','./mastery-model.js?v=3.1.6','./progression-stats.js?v=3.1.6','./challenge-protocol.js?v=3.1.6','./daily-model.js?v=3.1.6','./diagnostic-ui-structural.js?v=3.1.6','./diagnostic-attachments.js?v=3.1.6','./diagnostic-recorder.js?v=3.1.6','./app-precompute.js?v=3.1.6','./app.js?v=3.1.6','./precompute-worker.js?v=3.1.6','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./build-info.json','./LICENSE'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{let x=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',x));return r}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    let network=fetch(e.request).then(r=>{if(r&&r.ok){let x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x))}return r}).catch(()=>cached);
    return cached||network
  }))
});
