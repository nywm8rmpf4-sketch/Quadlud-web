/*
 * QUADLUD
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation without prior written authorization is prohibited.
 */
const CACHE='quadlud-v3.1.8-u14r2-manifest';
const ASSETS=['./','./index.html','./styles-core.css?v=3.1.8','./styles-patches.css?v=3.1.8','./styles-i18n.css?v=3.1.8','./styles-pedagogy.css?v=3.1.8','./styles-patches-direct.css?v=3.1.8','./styles-accessibility.css?v=3.1.8','./styles-sudoku-proof.css?v=3.1.8','./styles-data.css?v=3.1.8','./styles-nonogram.css?v=3.1.8-u13-nonogram','./styles-mobile.css?v=3.1.8-u12-ipad-balance','./ui-mobile-coach-fixes.css?v=3.1.8-u13-nonogram','./tutor-action-first-navigation.css?v=3.1.8','./ui-consistency-v318.css?v=3.1.8-u14r1-coach-stability','./queens-logic.js?v=3.1.8','./difficulty-rating.js?v=3.1.8','./queens-difficulty.js?v=3.1.8','./tango-logic.js?v=3.1.8','./tango-difficulty.js?v=3.1.8','./tango-played-move-planner.js?v=3.1.8','./patches-logic.js?v=3.1.8','./patches-difficulty.js?v=3.1.8','./sudoku-logic.js?v=3.1.8','./sudoku-difficulty.js?v=3.1.8','./platform-web.js?v=3.1.8','./web-storage.js?v=3.1.8','./data-serialization.js?v=3.1.8','./persistence-services.js?v=3.1.8','./generation-common.js?v=3.1.8','./queens-qpool4.js?v=3.1.8','./queens-generator.js?v=3.1.8','./tango-generator.js?v=3.1.8','./sudoku-generator.js?v=3.1.8','./patches-generator.js?v=3.1.8','./session-core.js?v=3.1.8','./logical-move.js?v=3.1.8','./game-session-adapters.js?v=3.1.8','./reasoning-view.js?v=3.1.8','./game-ui-adapters.js?v=3.1.8','./game-contract.js?v=3.1.8','./game-manifest.js?v=3.1.8-u14r2-manifest','./game-registry.js?v=3.1.8','./queens-ui.js?v=3.1.8','./tango-ui.js?v=3.1.8','./sudoku-ui.js?v=3.1.8','./patches-ui.js?v=3.1.8','./queens-runtime.js?v=3.1.8',
  './tango-runtime.js?v=3.1.8',
  './tango-played-move-runtime.js?v=3.1.8',
  './sudoku-runtime.js?v=3.1.8',
  './patches-runtime.js?v=3.1.8',
  './game-pedagogy-adapters.js?v=3.1.8','./queens-pedagogy.js?v=3.1.8','./tango-pedagogy.js?v=3.1.8','./sudoku-pedagogy.js?v=3.1.8','./patches-pedagogy.js?v=3.1.8','./pedagogy-metadata.js?v=3.1.8','./reasoning-presentation.js?v=3.1.8','./queens-reasoning-presentation.js?v=3.1.8','./tango-reasoning-presentation.js?v=3.1.8','./sudoku-reasoning-presentation.js?v=3.1.8','./patches-reasoning-presentation.js?v=3.1.8','./i18n-catalog.js?v=3.1.8',
  './queens-i18n.js?v=3.1.8',
  './tango-i18n.js?v=3.1.8',
  './sudoku-i18n.js?v=3.1.8',
  './patches-i18n.js?v=3.1.8','./nonogram-logic.js?v=3.1.8','./nonogram-validation-solver.js?v=3.1.8','./nonogram-difficulty.js?v=3.1.8','./nonogram-generator.js?v=3.1.8','./nonogram-ui.js?v=3.1.8-u13-nonogram','./nonogram-runtime.js?v=3.1.8','./nonogram-pedagogy.js?v=3.1.8-u13-nonogram','./nonogram-pedagogy-atomic.js?v=3.1.8-u13-nonogram','./nonogram-reasoning-presentation.js?v=3.1.8','./nonogram-i18n.js?v=3.1.8','./mastery-model.js?v=3.1.8','./progression-stats.js?v=3.1.8','./challenge-protocol.js?v=3.1.8','./daily-model.js?v=3.1.8','./diagnostic-ui-structural.js?v=3.1.8','./diagnostic-attachments.js?v=3.1.8','./diagnostic-recorder.js?v=3.1.8','./app-precompute.js?v=3.1.8','./victory-presentation.js?v=3.1.8','./app.js?v=3.1.8','./move-trust.js?v=3.1.8','./coach-presentation-bridge.js?v=3.1.8-u14r1-coach-stability','./ui-mobile-coach-fixes.js?v=3.1.8','./tutor-action-first-navigation.js?v=3.1.8','./ui-consistency-v318.js?v=3.1.8-u14r1-coach-stability','./precompute-worker.js?v=3.1.8','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./build-info.json','./LICENSE'];
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
