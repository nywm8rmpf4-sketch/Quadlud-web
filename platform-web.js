/*
 * QUADLUD — minimal Web platform adapter
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludWebPlatform=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function createPlatform(env){
    if(!env)throw new Error('QUADLUD Web platform scope unavailable');
    const win=()=>env.window||env;
    const doc=()=>env.document||null;
    const nav=()=>env.navigator||{};
    const DateCtor=env.Date||Date;
    const timeout=(fn,ms)=>(env.setTimeout||setTimeout)(fn,ms);

    const clock=Object.freeze({
      nowMs(){return DateCtor.now()},
      nowDate(){return new DateCtor()},
      nowIso(){return new DateCtor().toISOString()}
    });

    const locale=Object.freeze({
      languages(){
        const n=nav(),out=[];
        if(Array.isArray(n.languages))out.push(...n.languages);
        if(n.language)out.push(n.language);
        return out.filter(Boolean).map(String)
      }
    });

    const haptics=Object.freeze({
      vibrate(ms=12){
        try{const n=nav();if(typeof n.vibrate!=='function')return false;n.vibrate(ms);return true}catch(_){return false}
      }
    });

    const sharing=Object.freeze({
      canShare(payload){
        try{const n=nav();if(typeof n.share!=='function')return false;return typeof n.canShare!=='function'||n.canShare(payload)}catch(_){return false}
      },
      async share(payload){
        const n=nav();if(typeof n.share!=='function')return false;await n.share(payload);return true
      },
      async copyText(text){
        const n=nav();if(typeof n.clipboard?.writeText!=='function')return false;await n.clipboard.writeText(String(text));return true
      }
    });

    const files=Object.freeze({
      createTextFile(text,filename,type='text/plain'){
        const BlobCtor=env.Blob||win().Blob,FileCtor=env.File||win().File;
        if(typeof BlobCtor!=='function'||typeof FileCtor!=='function')return null;
        const blob=new BlobCtor([String(text)],{type});
        return new FileCtor([blob],String(filename),{type})
      },
      async readText(file){
        if(file&&typeof file.text==='function')return String(await file.text());
        const Reader=env.FileReader||win().FileReader;
        if(typeof Reader!=='function')throw new Error('read-failed');
        return new Promise((resolve,reject)=>{try{const r=new Reader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('read-failed'));r.readAsText(file)}catch(err){reject(err)}})
      },
      downloadText(text,{filename,type='text/plain'}={}){
        const BlobCtor=env.Blob||win().Blob,urlApi=env.URL||win().URL,d=doc();
        if(typeof BlobCtor!=='function'||!urlApi||typeof urlApi.createObjectURL!=='function'||typeof urlApi.revokeObjectURL!=='function'||!d||typeof d.createElement!=='function'||!d.body)return false;
        const blob=new BlobCtor([String(text)],{type}),url=urlApi.createObjectURL(blob),a=d.createElement('a');
        a.href=url;a.download=String(filename||'download.txt');a.style.display='none';d.body.appendChild(a);a.click();a.remove();timeout(()=>urlApi.revokeObjectURL(url),0);return true
      }
    });

    const lifecycle=Object.freeze({
      isHidden(){try{return !!doc()?.hidden}catch(_){return false}},
      onVisibilityChange(handler){const d=doc();if(!d||typeof d.addEventListener!=='function')return ()=>{};d.addEventListener('visibilitychange',handler);return ()=>{try{d.removeEventListener('visibilitychange',handler)}catch(_){}}},
      onPageHide(handler){const w=win();if(!w||typeof w.addEventListener!=='function')return ()=>{};w.addEventListener('pagehide',handler);return ()=>{try{w.removeEventListener('pagehide',handler)}catch(_){}}},
      onLoad(handler){const w=win();if(!w||typeof w.addEventListener!=='function')return ()=>{};w.addEventListener('load',handler);return ()=>{try{w.removeEventListener('load',handler)}catch(_){}}}
    });

    const workers=Object.freeze({
      supported(){return typeof (env.Worker||win().Worker)==='function'},
      create(url){const WorkerCtor=env.Worker||win().Worker;if(typeof WorkerCtor!=='function')return null;return new WorkerCtor(url)}
    });

    const serviceWorker=Object.freeze({
      supported(){return !!nav().serviceWorker&&typeof nav().serviceWorker.register==='function'},
      async register(url){const sw=nav().serviceWorker;if(!sw||typeof sw.register!=='function')return false;await sw.register(url);return true}
    });

    return Object.freeze({clock,locale,haptics,sharing,files,lifecycle,workers,serviceWorker})
  }

  let defaultPlatform=null;
  function getWebPlatform(){
    if(defaultPlatform)return defaultPlatform;
    if(typeof globalThis==='undefined')throw new Error('QUADLUD Web platform scope unavailable');
    defaultPlatform=createPlatform(globalThis);return defaultPlatform
  }

  return Object.freeze({createPlatform,getWebPlatform})
});
