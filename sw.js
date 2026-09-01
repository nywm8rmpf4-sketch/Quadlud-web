/*
 * QUADLUD
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 */
const CACHE='quadlud-v3.1.7';
const ASSETS=['./','./index.html','./styles-core.css?v=3.1.7','./styles-patches.css?v=3.1.7','./styles-i18n.css?v=3.1.7','./styles-pedagogy.css?v=3.1.7','./styles-patches-direct.css?v=3.1.7','./styles-accessibility.css?v=3.1.7','./styles-sudoku-proof.css?v=3.1.7','./styles-data.css?v=3.1.7','./styles-nonogram.css?v=3.1.7','./styles-mobile.css?v=3.1.7','./queens-logic.js?v=3.1.7','./difficulty-rating.js?v=3.1.7','./queens-difficulty.js?v=3.1.7','./tango-logic.js?v=3.1.7','./tango-difficulty.js?v=3.1.7','./patches-logic.js?v=3.1.7','./patches-difficulty.js?v=3.1.7','./sudoku-logic.js?v=3.1.7','./sudoku-difficulty.js?v=3.1.7','./platform-web.js?v=3.1.7','./web-storage.js?v=3.1.7','./data-serialization.js?v=3.1.7','./persistence-services.js?v=3.1.7','./generation-common.js?v=3.1.7','./queens-qpool4.js?v=3.1.7','./queens-generator.js?v=3.1.7','./tango-generator.js?v=3.1.7','./sudoku-generator.js?v=3.1.7','./patches-generator.js?v=3.1.7','./session-core.js?v=3.1.7','./logical-move.js?v=3.1.7','./game-session-adapters.js?v=3.1.7','./reasoning-view.js?v=3.1.7','./game-ui-adapters.js?v=3.1.7','./game-contract.js?v=3.1.7','./game-manifest.js?v=3.1.7','./game-registry.js?v=3.1.7','./queens-ui.js?v=3.1.7','./tango-ui.js?v=3.1.7','./sudoku-ui.js?v=3.1.7','./patches-ui.js?v=3.1.7','./queens-runtime.js?v=3.1.7',
  './tango-runtime.js?v=3.1.7',
  './sudoku-runtime.js?v=3.1.7',
  './patches-runtime.js?v=3.1.7',
  './game-pedagogy-adapters.js?v=3.1.7','./queens-pedagogy.js?v=3.1.7','./tango-pedagogy.js?v=3.1.7','./sudoku-pedagogy.js?v=3.1.7','./patches-pedagogy.js?v=3.1.7','./pedagogy-metadata.js?v=3.1.7','./reasoning-presentation.js?v=3.1.7','./queens-reasoning-presentation.js?v=3.1.7','./tango-reasoning-presentation.js?v=3.1.7','./sudoku-reasoning-presentation.js?v=3.1.7','./patches-reasoning-presentation.js?v=3.1.7','./i18n-catalog.js?v=3.1.7',
  './queens-i18n.js?v=3.1.7',
  './tango-i18n.js?v=3.1.7',
  './sudoku-i18n.js?v=3.1.7',
  './patches-i18n.js?v=3.1.7','./nonogram-logic.js?v=3.1.7','./nonogram-validation-solver.js?v=3.1.7','./nonogram-difficulty.js?v=3.1.7','./nonogram-generator.js?v=3.1.7','./nonogram-ui.js?v=3.1.7','./nonogram-runtime.js?v=3.1.7','./nonogram-pedagogy.js?v=3.1.7','./nonogram-reasoning-presentation.js?v=3.1.7','./nonogram-i18n.js?v=3.1.7','./mastery-model.js?v=3.1.7','./progression-stats.js?v=3.1.7','./challenge-protocol.js?v=3.1.7','./daily-model.js?v=3.1.7','./diagnostic-ui-structural.js?v=3.1.7','./diagnostic-attachments.js?v=3.1.7','./diagnostic-recorder.js?v=3.1.7','./app-precompute.js?v=3.1.7','./victory-presentation.js?v=3.1.7','./app.js?v=3.1.7','./move-trust.js?v=3.1.7','./coach-presentation-bridge.js?v=3.1.7','./precompute-worker.js?v=3.1.7','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./build-info.json','./LICENSE'];
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
