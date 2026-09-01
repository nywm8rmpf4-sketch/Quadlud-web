/*
 * QUADLUD — victory presentation
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludVictoryPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=2;
  const GENERIC_PROFILE=Object.freeze({id:'generic',confettiCount:22,cleanupMs:1700});
  const LIGHTHOUSES_PROFILE=Object.freeze({id:'lighthouses',confettiCount:0,cleanupMs:1650,reducedCleanupMs:900,beamRangeCells:3});
  const PROFILE_BY_GAME=Object.freeze({queens:LIGHTHOUSES_PROFILE});

  function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  function profileForGame(gameId){return PROFILE_BY_GAME[String(gameId||'')]||GENERIC_PROFILE}
  function reducedMotionRequested(scope){try{return !!scope?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches}catch(_){return false}}

  function buildApplausePlan(random=Math.random){
    const rand=typeof random==='function'?random:Math.random;
    const base=[0,.07,.15,.25,.34,.43,.55,.64,.73,.86,.96,1.06,1.18,1.29,1.40,1.50];
    return base.map((at,index)=>Object.freeze({
      at:clamp(at+(rand()-.5)*.026,0,1.56),
      duration:clamp(.046+rand()*.025,.04,.075),
      gain:clamp(.072+rand()*.038,.065,.115),
      pan:clamp((rand()-.5)*.8,-.4,.4),
      frequency:clamp(1050+rand()*850,1000,1950),
      index
    })).sort((a,b)=>a.at-b.at)
  }

  function playApplause({scope=typeof globalThis!=='undefined'?globalThis:null,enabled=true,random=Math.random,setTimer=(fn,ms)=>setTimeout(fn,ms)}={}){
    if(!enabled)return {played:false,reason:'disabled'};
    const AudioContext=scope?.AudioContext||scope?.webkitAudioContext;
    if(typeof AudioContext!=='function')return {played:false,reason:'unavailable'};
    let context=null;
    try{
      context=new AudioContext();
      const now=finite(context.currentTime,0),sampleRate=Math.max(8000,finite(context.sampleRate,44100));
      const master=context.createGain();
      master.gain.setValueAtTime?.(.18,now);
      if(master.gain&&!master.gain.setValueAtTime)master.gain.value=.18;
      master.connect(context.destination);
      const length=Math.max(1,Math.floor(sampleRate*.075)),buffer=context.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0),rand=typeof random==='function'?random:Math.random;
      for(let i=0;i<data.length;i++){const envelope=Math.pow(1-i/data.length,2.2);data[i]=(rand()*2-1)*envelope}
      const plan=buildApplausePlan(rand);
      for(const clap of plan){
        const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),start=now+clap.at;
        source.buffer=buffer;filter.type='bandpass';filter.frequency.value=clap.frequency;filter.Q.value=.8;
        gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(clap.gain,start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+clap.duration);
        source.connect(filter);filter.connect(gain);
        if(typeof context.createStereoPanner==='function'){
          const pan=context.createStereoPanner();pan.pan.value=clap.pan;gain.connect(pan);pan.connect(master)
        }else gain.connect(master);
        source.start(start);source.stop(start+clap.duration+.01)
      }
      try{if(context.state==='suspended')context.resume()?.catch?.(()=>{})}catch(_){}
      setTimer(()=>{try{context.close()?.catch?.(()=>{})}catch(_){}},1900);
      return {played:true,claps:plan.length,durationSeconds:Math.max(...plan.map(x=>x.at+x.duration))}
    }catch(_){
      try{context?.close?.()?.catch?.(()=>{})}catch(__){}
      return {played:false,reason:'failed'}
    }
  }

  function createController({document=null,window=null,random=Math.random,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
    let active=null,cleanupTimer=null;

    function cleanupTransient(){
      if(cleanupTimer!=null){try{clearTimer(cleanupTimer)}catch(_){}cleanupTimer=null}
      if(!active)return false;
      const {board,layer}=active;
      try{layer?.remove?.()}catch(_){}
      try{board?.classList?.remove('board-complete','lighthouses-victory-active','lighthouses-victory-reduced')}catch(_){}
      try{board?.querySelectorAll?.('.lighthouses-victory-halo')?.forEach?.(halo=>halo.classList.remove('lighthouses-victory-halo'))}catch(_){}
      try{board?.querySelectorAll?.('.win-pop')?.forEach?.(cell=>{cell.classList.remove('win-pop');cell.style?.removeProperty?.('--win-delay')})}catch(_){}
      active=null;return true
    }

    function cancel({removeFinal=false,board=null,victoryClass=''}={}){
      const activeBoard=active?.board||board,activeVictoryClass=active?.victoryClass||victoryClass;
      cleanupTransient();
      const target=board||activeBoard,finalClass=victoryClass||activeVictoryClass;
      if(removeFinal&&target&&finalClass)try{target.classList.remove(finalClass)}catch(_){}
      return true
    }

    function celebrateGeneric({board,victoryClass,profile}){
      board.classList.add('board-complete');
      if(victoryClass)board.classList.add(victoryClass);
      [...(board.children||[])].forEach((cell,index)=>{cell.style?.setProperty?.('--win-delay',`${Math.min(index,80)*16}ms`);cell.classList?.add?.('win-pop')});
      const layer=document.createElement('div');layer.className='celebration-layer';layer.setAttribute?.('aria-hidden','true');
      for(let i=0;i<profile.confettiCount;i++){
        const particle=document.createElement('i');
        particle.style?.setProperty?.('--x',`${8+random()*84}%`);
        particle.style?.setProperty?.('--dx',`${-55+random()*110}px`);
        particle.style?.setProperty?.('--delay',`${random()*220}ms`);
        particle.style?.setProperty?.('--rot',`${random()*500-250}deg`);
        layer.appendChild(particle)
      }
      document.body.appendChild(layer);active={board,layer,victoryClass,profile};
      cleanupTimer=setTimer(()=>cleanupTransient(),profile.cleanupMs);
      return {started:true,profile:profile.id,confettiCount:profile.confettiCount,cleanupMs:profile.cleanupMs}
    }

    function lighthouseGeometry(board,profile){
      const boardRect=board.getBoundingClientRect?.(),pieces=[...(board.querySelectorAll?.('.lighthouse-piece')||[])];
      const layer=document.createElement('div');layer.className='lighthouses-victory-layer';layer.setAttribute?.('aria-hidden','true');
      layer.style?.setProperty?.('--lh-board-left',`${finite(boardRect?.left,0)}px`);
      layer.style?.setProperty?.('--lh-board-top',`${finite(boardRect?.top,0)}px`);
      layer.style?.setProperty?.('--lh-board-width',`${Math.max(0,finite(boardRect?.width,0))}px`);
      layer.style?.setProperty?.('--lh-board-height',`${Math.max(0,finite(boardRect?.height,0))}px`);
      layer.style?.setProperty?.('pointer-events','none');
      let beamCount=0;
      for(const piece of pieces){
        const rect=piece.getBoundingClientRect?.();
        if(!boardRect||!rect)continue;
        const cell=piece.closest?.('.cell')||piece.parentElement,cellRect=cell?.getBoundingClientRect?.();
        const fallbackWidth=Math.max(1,finite(rect.width,1)/.68),fallbackHeight=Math.max(1,finite(rect.height,1)/.68);
        const cellSize=Math.max(1,Math.min(finite(cellRect?.width,fallbackWidth),finite(cellRect?.height,fallbackHeight)));
        const range=cellSize*profile.beamRangeCells;
        const origin=document.createElement('span');origin.className='lighthouses-victory-origin';
        origin.style?.setProperty?.('--lh-x',`${rect.left-boardRect.left+rect.width/2}px`);
        origin.style?.setProperty?.('--lh-y',`${rect.top-boardRect.top+rect.height/2}px`);
        origin.style?.setProperty?.('--lh-range',`${range}px`);
        for(const angle of [0,90,180,270]){
          const beam=document.createElement('i');beam.className='lighthouses-victory-beam';beam.style?.setProperty?.('--lh-angle',`${angle}deg`);origin.appendChild(beam);beamCount++
        }
        layer.appendChild(origin)
      }
      return {layer,lighthouseCount:layer.children?.length||0,beamCount}
    }

    function celebrateLighthouses({board,victoryClass,profile}){
      board.classList.add('board-complete');
      if(victoryClass)board.classList.add(victoryClass);
      const reduced=reducedMotionRequested(window),cleanupMs=reduced?profile.reducedCleanupMs:profile.cleanupMs;
      let layer=null,lighthouseCount=0,beamCount=0;
      if(reduced){
        board.classList.add('lighthouses-victory-reduced');
        const halos=[...(board.querySelectorAll?.('.lighthouse-halo')||[])];halos.forEach(halo=>halo.classList?.add?.('lighthouses-victory-halo'));lighthouseCount=halos.length
      }else{
        board.classList.add('lighthouses-victory-active');
        const built=lighthouseGeometry(board,profile);layer=built.layer;lighthouseCount=built.lighthouseCount;beamCount=built.beamCount;document.body.appendChild?.(layer)
      }
      active={board,layer,victoryClass,profile};cleanupTimer=setTimer(()=>cleanupTransient(),cleanupMs);
      return {started:true,profile:profile.id,confettiCount:0,cleanupMs,lighthouseCount,beamCount,reducedMotion:reduced}
    }

    function celebrate({gameId='',board=null,victoryClass=''}={}){
      if(!board||!document?.body)return {started:false,reason:'board-unavailable'};
      cleanupTransient();
      const profile=profileForGame(gameId);
      return profile.id==='lighthouses'?celebrateLighthouses({board,victoryClass,profile}):celebrateGeneric({board,victoryClass,profile})
    }

    return Object.freeze({
      VERSION,
      profileForGame,
      celebrate,
      cancel,
      playApplause:options=>playApplause({scope:window,random,setTimer,...options})
    })
  }

  return Object.freeze({VERSION,GENERIC_PROFILE,LIGHTHOUSES_PROFILE,profileForGame,buildApplausePlan,playApplause,createController})
});
