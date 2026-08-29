/*
 * QUADLUD — manual diagnostic visual attachments
 * Copyright © 2026 Serge Benoliel. All rights reserved.
 * Proprietary software. Copying, modification, redistribution or exploitation
 * without prior written authorization is prohibited.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QuadludDiagnosticAttachments=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(defaultScope){
  'use strict';

  const VERSION=1;
  const KIND='screenshot';
  const SOURCE='manual';
  const MEDIA_TYPE='image/png';
  const ATTACHMENT_KEYS=Object.freeze(['id','kind','source','mediaType','width','height','bytes','sha256','dataBase64']);
  const DEFAULT_MAX_INPUT_BYTES=16*1024*1024;
  const DEFAULT_MAX_SOURCE_PIXELS=16*1024*1024;
  const DEFAULT_MAX_DIMENSION=1280;
  const DEFAULT_MAX_OUTPUT_BYTES=4*1024*1024;
  const SHA256_RE=/^[0-9a-f]{64}$/;

  function fail(message){throw new TypeError(`Invalid QUADLUD diagnostic attachment: ${message}`)}
  function isPlainObject(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null}
  function exactKeys(obj,allowed,path){if(!isPlainObject(obj))fail(`${path} must be a plain object`);for(const key of Object.keys(obj))if(!allowed.includes(key))fail(`${path}.${key} is not allowed`)}
  function positiveInteger(value,path){if(!Number.isInteger(value)||value<1)fail(`${path} must be a positive integer`);return value}
  function nonEmpty(value,path){if(typeof value!=='string'||!value)fail(`${path} must be a non-empty string`);return value}
  function bytesFromBase64(text,scope=defaultScope){
    if(typeof text!=='string'||!text.length||text.length%4!==0)fail('dataBase64 is invalid');
    let padding=0;if(text.endsWith('=='))padding=2;else if(text.endsWith('='))padding=1;const end=text.length-padding;
    for(let i=0;i<end;i++){const c=text.charCodeAt(i),ok=(c>=65&&c<=90)||(c>=97&&c<=122)||(c>=48&&c<=57)||c===43||c===47;if(!ok)fail('dataBase64 is invalid')}
    for(let i=end;i<text.length;i++)if(text.charCodeAt(i)!==61)fail('dataBase64 is invalid');
    try{
      if(scope&&typeof scope.atob==='function'){
        const binary=scope.atob(text),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out
      }
      if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(text,'base64'));
    }catch(_){fail('dataBase64 cannot be decoded')}
    fail('base64 decoder unavailable')
  }
  function base64FromBytes(bytes,scope=defaultScope){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(scope&&typeof scope.btoa==='function'){
      let out='',chunk=0x8000;for(let i=0;i<data.length;i+=chunk)out+=String.fromCharCode(...data.subarray(i,i+chunk));return scope.btoa(out)
    }
    if(typeof Buffer!=='undefined')return Buffer.from(data).toString('base64');
    fail('base64 encoder unavailable')
  }
  function validateAttachment(value,scope=defaultScope){
    exactKeys(value,ATTACHMENT_KEYS,'attachment');
    nonEmpty(value.id,'attachment.id');
    if(value.kind!==KIND)fail(`attachment.kind must be ${KIND}`);
    if(value.source!==SOURCE)fail(`attachment.source must be ${SOURCE}`);
    if(value.mediaType!==MEDIA_TYPE)fail(`attachment.mediaType must be ${MEDIA_TYPE}`);
    positiveInteger(value.width,'attachment.width');positiveInteger(value.height,'attachment.height');positiveInteger(value.bytes,'attachment.bytes');if(value.width>DEFAULT_MAX_DIMENSION||value.height>DEFAULT_MAX_DIMENSION)fail('attachment dimensions exceed D1 limit');if(value.bytes>DEFAULT_MAX_OUTPUT_BYTES)fail('attachment bytes exceed D1 limit');
    if(typeof value.sha256!=='string'||!SHA256_RE.test(value.sha256))fail('attachment.sha256 must be lowercase SHA-256');
    const decoded=bytesFromBase64(value.dataBase64,scope);if(decoded.byteLength!==value.bytes)fail('attachment.bytes does not match dataBase64');const sig=[137,80,78,71,13,10,26,10];if(decoded.length<sig.length||sig.some((b,i)=>decoded[i]!==b))fail('attachment data must be PNG');
    return true
  }
  async function sha256Hex(bytes,scope=defaultScope){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const cryptoObj=scope&&scope.crypto;
    if(cryptoObj&&cryptoObj.subtle&&typeof cryptoObj.subtle.digest==='function'){
      const digest=await cryptoObj.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
    }
    if(typeof require==='function'){
      try{return require('crypto').createHash('sha256').update(Buffer.from(data)).digest('hex')}catch(_){}
    }
    throw new Error('sha256-unavailable')
  }
  async function verifyAttachment(value,scope=defaultScope){validateAttachment(value,scope);const bytes=bytesFromBase64(value.dataBase64,scope),hash=await sha256Hex(bytes,scope);if(hash!==value.sha256)throw new Error('attachment-sha256-mismatch');return true}
  async function blobBytes(blob,scope=defaultScope){
    if(blob&&typeof blob.arrayBuffer==='function')return new Uint8Array(await blob.arrayBuffer());
    const Reader=scope&&(scope.FileReader||scope.window?.FileReader);if(typeof Reader!=='function')throw new Error('attachment-read-failed');
    return new Promise((resolve,reject)=>{try{const r=new Reader();r.onload=()=>resolve(new Uint8Array(r.result));r.onerror=()=>reject(r.error||new Error('attachment-read-failed'));r.readAsArrayBuffer(blob)}catch(error){reject(error)}})
  }
  async function decodeImage(file,scope){
    if(typeof scope.createImageBitmap==='function'){
      const bitmap=await scope.createImageBitmap(file);return {width:bitmap.width,height:bitmap.height,draw:(ctx,w,h)=>ctx.drawImage(bitmap,0,0,w,h),close:()=>{try{bitmap.close()}catch(_){}}}
    }
    const ImageCtor=scope.Image||scope.window?.Image,urlApi=scope.URL||scope.window?.URL;if(typeof ImageCtor!=='function'||!urlApi||typeof urlApi.createObjectURL!=='function')throw new Error('image-decode-unavailable');
    const url=urlApi.createObjectURL(file);try{const image=await new Promise((resolve,reject)=>{const img=new ImageCtor();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('image-decode-failed'));img.src=url});return {width:image.naturalWidth||image.width,height:image.naturalHeight||image.height,draw:(ctx,w,h)=>ctx.drawImage(image,0,0,w,h),close:()=>{}}}finally{try{urlApi.revokeObjectURL(url)}catch(_){}}
  }
  function canvasFor(scope,width,height){
    if(typeof scope.OffscreenCanvas==='function')return new scope.OffscreenCanvas(width,height);
    const d=scope.document||scope.window?.document;if(!d||typeof d.createElement!=='function')throw new Error('canvas-unavailable');const c=d.createElement('canvas');c.width=width;c.height=height;return c
  }
  async function canvasPng(canvas){
    if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type:MEDIA_TYPE});
    if(typeof canvas.toBlob==='function')return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('png-encode-failed')),MEDIA_TYPE));
    throw new Error('png-encode-unavailable')
  }
  function targetSize(width,height,maxDimension){
    if(maxDimension==null)return {width,height};positiveInteger(maxDimension,'maxDimension');const largest=Math.max(width,height);if(largest<=maxDimension)return {width,height};const scale=maxDimension/largest;return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}
  }
  async function normalizeImageFile(file,options={}){
    const scope=options.scope||defaultScope;if(!scope)throw new Error('attachment-scope-unavailable');
    if(!file||typeof file!=='object')throw new Error('attachment-file-required');
    const type=String(file.type||'').toLowerCase();if(!type.startsWith('image/'))throw new Error('attachment-file-not-image');
    const maxInputBytes=options.maxInputBytes??DEFAULT_MAX_INPUT_BYTES,maxSourcePixels=options.maxSourcePixels??DEFAULT_MAX_SOURCE_PIXELS,maxDimension=options.maxDimension??DEFAULT_MAX_DIMENSION,maxOutputBytes=options.maxOutputBytes??DEFAULT_MAX_OUTPUT_BYTES;
    positiveInteger(maxInputBytes,'maxInputBytes');positiveInteger(maxSourcePixels,'maxSourcePixels');positiveInteger(maxDimension,'maxDimension');positiveInteger(maxOutputBytes,'maxOutputBytes');
    if(Number.isFinite(file.size)&&file.size>maxInputBytes)throw new Error('attachment-input-too-large');
    const decoded=await decodeImage(file,scope);try{
      positiveInteger(decoded.width,'decoded.width');positiveInteger(decoded.height,'decoded.height');if(decoded.width*decoded.height>maxSourcePixels)throw new Error('attachment-source-too-large');const size=targetSize(decoded.width,decoded.height,maxDimension),canvas=canvasFor(scope,size.width,size.height),ctx=canvas.getContext&&canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('canvas-2d-unavailable');decoded.draw(ctx,size.width,size.height);const png=await canvasPng(canvas),bytes=await blobBytes(png,scope);if(bytes.byteLength>maxOutputBytes)throw new Error('attachment-output-too-large');const sha256=await sha256Hex(bytes,scope),attachment={id:String(options.id||'visual-1'),kind:KIND,source:SOURCE,mediaType:MEDIA_TYPE,width:size.width,height:size.height,bytes:bytes.byteLength,sha256,dataBase64:base64FromBytes(bytes,scope)};validateAttachment(attachment,scope);return Object.freeze(attachment)
    }finally{decoded.close()}
  }

  return Object.freeze({VERSION,KIND,SOURCE,MEDIA_TYPE,ATTACHMENT_KEYS,DEFAULT_MAX_INPUT_BYTES,DEFAULT_MAX_SOURCE_PIXELS,DEFAULT_MAX_DIMENSION,DEFAULT_MAX_OUTPUT_BYTES,base64FromBytes,bytesFromBase64,validateAttachment,sha256Hex,verifyAttachment,normalizeImageFile})
});
