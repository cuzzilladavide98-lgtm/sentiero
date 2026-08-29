/* Sentiero Sync v2 — local-first, per-field operations, encrypted transport.
   No Gemini key, audio blob or whole-state payload is ever sent to the server. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SentieroSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const DB_NAME='sentiero-data-v2', DB_VERSION=1;
  const CFG_KEY='sentiero-sync-config-v2', SCHEMA_KEY='sentiero-schema-version';
  const PRE_MIGRATION_KEY='sentiero-pre-migration-v2';
  const PRE_PAIR_KEY='sentiero-pre-pair-v2';
  const SYNC_SCHEMA=2, MAX_BATCH=100, MAX_SYNC_BODY=1500000, MAX_CIPHER_CHARS=800000;
  const REQUEST_TIMEOUT=20000, CRYPTO_CONCURRENCY=8;
  const ARRAY_COLLECTIONS=['quests','scheduled','diary','observerNotes','obsLines','capitoli','semi','frutti','banco','unlockRules','desideri','questLog'];
  const MAP_COLLECTIONS=['checks','patti','sfide','foto','riposi','ferie','unlockDone','promVisti','paroleGiorno'];
  const SINGLE_COLLECTIONS=['settings','mastery','desiderio'];
  const ROOT_FIELDS=['streak','lastSealed','lastFullSealed','lastDayInit','essentials','patto','vistoVersione','obsFamiglie','obsForme','obsDetti','obsZitto','baseLing','baseLingQuando','votoId'];
  const LOCAL_ONLY=new Set(['registro','schemaVersion']);
  const SECRET_FIELDS=new Set(['apikey','geminikey','sentierogeminikey','aikey','providerkey','devicetoken','rootkey']);
  const enc=new TextEncoder(),dec=new TextDecoder();
  let db=null,dbOpen=null,booted=false,currentState=null,onRemote=null,lastEntities=new Map(),serial=Promise.resolve(),syncTimer=null,syncInFlight=null,listeners=[];
  let captureQueued=false,retryMs=2000;
  let config=readConfig();
  const aesKeyCache=new Map(),hmacKeyCache=new Map();

  function clone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }
  function syncSafe(v,depth){
    if(depth>12)return null;
    if(Array.isArray(v))return v.map(x=>syncSafe(x,(depth||0)+1));
    if(v&&typeof v==='object'){
      const out={}; for(const k of Object.keys(v)){ const n=k.toLowerCase().replace(/[^a-z]/g,''); if(SECRET_FIELDS.has(n)||k==='registro')continue; out[k]=syncSafe(v[k],(depth||0)+1); } return out;
    }
    return v;
  }
  function uid(){
    try{ if(root.crypto&&root.crypto.randomUUID) return root.crypto.randomUUID(); }catch(_){}
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }
  function base64(bytes){
    let s=''; const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));
    return typeof btoa==='function'?btoa(s):Buffer.from(a).toString('base64');
  }
  function unbase64(s){
    const raw=typeof atob==='function'?atob(String(s||'')):Buffer.from(String(s||''),'base64').toString('binary');
    const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out;
  }
  function safeJson(v){ try{return JSON.stringify(v);}catch(_){return '';} }
  function same(a,b){ return safeJson(a)===safeJson(b); }
  function cleanEndpoint(v){
    const raw=String(v||'').trim().replace(/\/+$/,'').slice(0,500); if(!raw)return '';
    try{
      const u=new URL(raw),local=/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
      if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))return '';
      u.username='';u.password='';u.hash='';u.search='';
      return u.toString().replace(/\/+$/,'');
    }catch(_){return '';}
  }
  function readConfig(){
    try{ const x=JSON.parse(root.localStorage&&root.localStorage.getItem(CFG_KEY)||'null'); return x&&typeof x==='object'?x:{}; }catch(_){ return {}; }
  }
  function persistConfig(){ try{ root.localStorage.setItem(CFG_KEY,JSON.stringify(config)); }catch(_){} }
  function writeConfig(next){
    config=Object.assign({},config,next||{});
    persistConfig();
    emit(); return clone(config);
  }
  function publicInfo(){
    return {enabled:!!(config.endpoint&&config.spaceId&&config.deviceToken&&config.rootKey),endpoint:config.endpoint||'',
      spaceId:config.spaceId||'',deviceId:config.deviceId||'',deviceName:config.deviceName||deviceLabel(),
      cursor:Number(config.cursor)||0,lastSync:Number(config.lastSync)||0,status:config.status||'solo su questo dispositivo',
      revoked:config.revoked===true,pending:config.pending|0,schema:SYNC_SCHEMA};
  }
  function emit(){ const x=publicInfo(); for(const fn of listeners.slice()) try{fn(x);}catch(_){} }
  function subscribe(fn){ if(typeof fn==='function') listeners.push(fn); return ()=>{listeners=listeners.filter(x=>x!==fn);}; }
  function deviceLabel(){
    try{ const ua=String(root.navigator&&root.navigator.userAgent||''); if(/iPhone/i.test(ua)) return 'iPhone'; if(/iPad/i.test(ua)) return 'iPad'; if(/Android/i.test(ua)) return 'Android'; if(/Windows/i.test(ua)) return 'PC Windows'; if(/Mac/i.test(ua)) return 'Mac'; }catch(_){}
    return 'Questo dispositivo';
  }
  function ensureDevice(){
    if(!config.deviceId) writeConfig({deviceId:uid(),deviceName:deviceLabel()});
    return config.deviceId;
  }
  function ensureEntityIds(state){
    if(!state||typeof state!=='object') return state;
    for(const name of ARRAY_COLLECTIONS){
      const arr=Array.isArray(state[name])?state[name]:[];
      const seen=new Set();
      for(const item of arr){
        if(!item||typeof item!=='object') continue;
        let id=String(item.id||item._syncId||'').slice(0,80);
        if(!id||seen.has(id)) id=uid();
        seen.add(id);
        if(!item.id) item._syncId=id;
      }
    }
    state.schemaVersion=SYNC_SCHEMA;
    return state;
  }
  function itemId(item,index){ return String(item&&item.id||item&&item._syncId||('legacy-'+index)); }
  function toEntities(state){
    const map=new Map(); state=ensureEntityIds(syncSafe(state||{},0));
    for(const name of ARRAY_COLLECTIONS){
      const arr=Array.isArray(state[name])?state[name]:[];
      arr.forEach((item,i)=>{ if(item&&typeof item==='object') map.set(name+':'+itemId(item,i),clone(item)); });
    }
    for(const name of MAP_COLLECTIONS){
      const obj=state[name]&&typeof state[name]==='object'&&!Array.isArray(state[name])?state[name]:{};
      for(const key of Object.keys(obj)){const value=clone(obj[key]);map.set(name+':'+key,value&&typeof value==='object'&&!Array.isArray(value)?value:{$value:value});}
    }
    for(const name of SINGLE_COLLECTIONS) if(state[name]!=null){const value=clone(state[name]);map.set(name+':main',value&&typeof value==='object'&&!Array.isArray(value)?value:{$value:value});}
    const rootValue={}; for(const k of ROOT_FIELDS) if(k in state&&!LOCAL_ONLY.has(k)) rootValue[k]=clone(state[k]);
    map.set('root:main',rootValue);
    return map;
  }
  function splitEntity(entity){ const i=String(entity||'').indexOf(':'); return i<0?['',entity]:[entity.slice(0,i),entity.slice(i+1)]; }
  function entityOrder(name,item){
    const id=String(item&&item.id||item&&item._syncId||'');
    if(name==='quests')return (item&&item.fatto?'1':'0')+String(item&&item.prio||3)+(item&&item.quando||'9999-99-99')+' '+(item&&item.ora||'99:99')+' '+id;
    if(name==='diary')return String(item&&item.iso||item&&item.data||'')+' '+id;
    if(name==='scheduled')return String(item&&item.nata||item&&item.date||'')+' '+String(item&&item.time||'')+' '+id;
    if(name==='observerNotes')return String(item&&item.createdAt||'')+' '+id;
    if(name==='obsLines'||name==='semi'||name==='banco')return String(item&&item.iso||item&&item.tk||'')+' '+id;
    if(name==='capitoli')return String(item&&item.mese||'')+' '+id;
    if(name==='frutti')return String(item&&item.tk||'')+' '+id;
    if(name==='unlockRules')return String(item&&item.nata||'')+' '+id;
    if(name==='desideri')return String(item&&item.chiusa||item&&item.nata||'')+' '+id;
    if(name==='questLog')return String(item&&item.day||'')+' '+id;
    return id;
  }
  function sortEntityArrays(state){
    for(const name of ARRAY_COLLECTIONS){
      const dir=name==='diary'?-1:1;
      state[name].sort((a,b)=>{const x=entityOrder(name,a),y=entityOrder(name,b);return x<y?-dir:x>y?dir:0;});
    }
    return state;
  }
  function unboxRecord(value){
    if(!value||typeof value!=='object')return value;
    if(!Object.prototype.hasOwnProperty.call(value,'$value'))return value;
    const legacy=value.$value,rest=clone(value);delete rest.$value;
    return legacy&&typeof legacy==='object'&&!Array.isArray(legacy)?Object.assign({},legacy,rest):legacy;
  }
  function fromEntities(base,map){
    const out=ensureEntityIds(clone(base||{}));
    for(const name of ARRAY_COLLECTIONS) out[name]=[];
    for(const name of MAP_COLLECTIONS) out[name]={};
    for(const [entity,record] of map){
      if(!record||record.deleted) continue;
      const [name,id]=splitEntity(entity), value=clone(record.value);
      if(ARRAY_COLLECTIONS.includes(name)){
        if(value&&typeof value==='object'){ if(!value.id&&!value._syncId) value._syncId=id; out[name].push(value); }
      } else if(MAP_COLLECTIONS.includes(name)){
        if(value&&typeof value==='object') out[name][id]=unboxRecord(value);
      } else if(SINGLE_COLLECTIONS.includes(name)){
        if(value&&typeof value==='object') out[name]=unboxRecord(value);
      } else if(name==='root'&&value&&typeof value==='object') Object.assign(out,value);
    }
    out.schemaVersion=SYNC_SCHEMA;
    return sortEntityArrays(out);
  }

  function clockFactory(deviceId,start){
    let lastMs=Math.max(0,Number(config.hlcMs)||0),counter=Math.max(0,Number(config.hlcCounter)||Number(start)||0);
    return function(){
      const wall=Date.now();
      if(wall>lastMs){ lastMs=wall; counter=0; } else counter++;
      config.hlcMs=lastMs; config.hlcCounter=counter;
      return String(lastMs).padStart(13,'0')+':'+String(counter).padStart(6,'0')+':'+deviceId;
    };
  }
  function observeClock(op){
    let best=String(op&&op.tombstone||'');
    for(const f of Object.values(op&&op.fields||{})) if(f&&String(f.hlc||'')>best) best=String(f.hlc||'');
    const m=best.match(/^(\d{13}):(\d{6}):/); if(!m)return;
    const ms=Number(m[1]),count=Number(m[2]);
    if(ms>Number(config.hlcMs||0)){ config.hlcMs=ms;config.hlcCounter=count; }
    else if(ms===Number(config.hlcMs||0)) config.hlcCounter=Math.max(Number(config.hlcCounter)||0,count);
  }
  function newer(a,b){ return String(a||'')>String(b||''); }
  function normalizeObjectRegister(reg){
    const name=splitEntity(reg&&reg.entity)[0],boxed=reg&&reg.fields&&reg.fields.$value;
    if(!boxed||boxed.unset||!boxed.value||typeof boxed.value!=='object'||Array.isArray(boxed.value)||(!MAP_COLLECTIONS.includes(name)&&!SINGLE_COLLECTIONS.includes(name)))return false;
    for(const [field,value] of Object.entries(boxed.value)) if(!reg.fields[field]||newer(boxed.hlc,reg.fields[field].hlc)) reg.fields[field]={value:clone(value),hlc:boxed.hlc,unset:false};
    delete reg.fields.$value;return true;
  }
  function diffEntities(before,after,nextClock,deviceId,nextSeq){
    const ops=[],keys=new Set([...before.keys(),...after.keys()]);
    for(const entity of keys){
      const a=before.get(entity),b=after.get(entity);
      if(a&&!b){ const hlc=nextClock(); ops.push({opId:uid(),deviceId,seq:nextSeq(),entity,tombstone:hlc,fields:{}}); continue; }
      if(!b) continue;
      const fields={}; const names=new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
      for(const field of names){ if(!same(a&&a[field],b[field])) fields[field]={value:clone(b[field]),hlc:nextClock(),unset:!(field in b)}; }
      if(Object.keys(fields).length) ops.push({opId:uid(),deviceId,seq:nextSeq(),entity,fields});
    }
    return ops;
  }
  function applyOperation(registers,op){
    if(!op||!op.entity||!op.opId) return false;
    let reg=registers.get(op.entity); if(!reg) reg={entity:op.entity,fields:{},tombstone:''};
    let changed=false;
    if(op.tombstone&&newer(op.tombstone,reg.tombstone)){ reg.tombstone=op.tombstone; changed=true; }
    for(const field of Object.keys(op.fields||{})){
      const incoming=op.fields[field],current=reg.fields[field];
      if(!incoming||!incoming.hlc||current&&!newer(incoming.hlc,current.hlc)) continue;
      reg.fields[field]=clone(incoming); changed=true;
      if(reg.tombstone&&newer(incoming.hlc,reg.tombstone)) reg.tombstone='';
    }
    changed=normalizeObjectRegister(reg)||changed;
    registers.set(op.entity,reg); return changed;
  }
  function registersToEntities(registers){
    const out=new Map();
    for(const [entity,reg] of registers){
      const value={},deleted=!!reg.tombstone;
      for(const field of Object.keys(reg.fields||{})){
        const f=reg.fields[field];
        if(deleted&&!newer(f.hlc,reg.tombstone)) continue;
        if(!f.unset) value[field]=clone(f.value);
      }
      out.set(entity,{value,deleted:deleted&&!Object.keys(value).length});
    }
    return out;
  }

  function openDb(){
    if(db) return Promise.resolve(db);
    if(!root.indexedDB) return Promise.resolve(null);
    if(dbOpen)return dbOpen;
    dbOpen=new Promise((resolve,reject)=>{ const q=root.indexedDB.open(DB_NAME,DB_VERSION);
      q.onupgradeneeded=()=>{ const d=q.result;
        if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
        if(!d.objectStoreNames.contains('ops')){ const s=d.createObjectStore('ops',{keyPath:'opId'}); s.createIndex('sent','sent',{unique:false}); }
        if(!d.objectStoreNames.contains('registers')) d.createObjectStore('registers',{keyPath:'entity'});
      };
      q.onsuccess=()=>{db=q.result;db.onversionchange=()=>{try{db.close();}catch(_){}db=null;dbOpen=null;};resolve(db);};
      q.onerror=()=>reject(q.error||new Error('IDB'));
      q.onblocked=()=>reject(new Error('IDB_BLOCKED'));
    }).catch(error=>{dbOpen=null;throw error;});
    return dbOpen;
  }
  function req(q){ return new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}); }
  async function getAll(store,index,key){ if(!db)return[]; const tx=db.transaction(store,'readonly'),s=tx.objectStore(store); return req(index?s.index(index).getAll(key):s.getAll()); }
  async function put(store,value){ if(!db)return; const tx=db.transaction(store,'readwrite'); await req(tx.objectStore(store).put(value)); }
  async function putMany(store,values){ if(!db||!values.length)return; await new Promise((resolve,reject)=>{ const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store); values.forEach(v=>s.put(v)); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error); }); }
  async function deleteMany(store,keys){ if(!db||!keys.length)return; await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);keys.forEach(k=>s.delete(k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  async function clearStores(names){ if(!db)return;for(const name of names){await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});} }
  async function readMeta(key){ if(!db)return null; return req(db.transaction('meta','readonly').objectStore('meta').get(key)); }

  async function reseedCurrentState(){
    if(syncInFlight)await syncInFlight;
    await serial;await clearStores(['ops','registers','meta']);
    const entities=toEntities(currentState||{}),clock=clockFactory(config.deviceId),ops=diffEntities(new Map(),entities,clock,config.deviceId,()=>nextSequence()),regs=new Map();
    for(const op of ops)applyOperation(regs,op);
    await putMany('registers',[...regs.values()]);await putMany('ops',ops.map(o=>Object.assign({sent:0,created:Date.now()},o)));
    await put('meta',{key:'checkpoint',value:clone(currentState||{}),at:Date.now()});lastEntities=entities;persistConfig();
  }

  async function migrate(state){
    const old=Number(root.localStorage&&root.localStorage.getItem(SCHEMA_KEY)||0);
    if(old<SYNC_SCHEMA){
      try{ if(!root.localStorage.getItem(PRE_MIGRATION_KEY)) root.localStorage.setItem(PRE_MIGRATION_KEY,JSON.stringify({schema:old,at:new Date().toISOString(),state:state})); }catch(_){}
      ensureEntityIds(state);
      try{ root.localStorage.setItem(SCHEMA_KEY,String(SYNC_SCHEMA)); }catch(_){}
    }
    return state;
  }
  async function bootstrap(state,opt){
    if(booted){ currentState=state; return publicInfo(); }
    ensureDevice(); currentState=await migrate(state); onRemote=opt&&opt.onRemote;
    try{ await openDb(); }catch(_){db=null;}
    const regs=new Map();
    try{ for(const r of await getAll('registers')) regs.set(r.entity,r); }catch(_){}
    if(regs.size){ const entities=registersToEntities(regs); currentState=fromEntities(currentState,entities); if(onRemote) onRemote(clone(currentState),{source:'recovery'}); lastEntities=toEntities(currentState); }
    else if(config.joining){
      /* Prima riceve il journal remoto: i valori predefiniti locali non sono
         modifiche dell'utente e non devono vincere per timestamp. */
      lastEntities=new Map();
    }else{
      lastEntities=toEntities(currentState);
      const nextClock=clockFactory(config.deviceId);
      const ops=diffEntities(new Map(),lastEntities,nextClock,config.deviceId,()=>nextSequence());
      const fresh=new Map(); for(const op of ops) applyOperation(fresh,op);
      await putMany('registers',[...fresh.values()]);
      await putMany('ops',ops.map(o=>Object.assign({sent:0,created:Date.now()},o)));
      persistConfig();
    }
    await put('meta',{key:'checkpoint',value:clone(currentState),at:Date.now()});
    booted=true; emit();
    try{ root.addEventListener('online',()=>scheduleSync(500)); }catch(_){}
    if(publicInfo().enabled) scheduleSync(800);
    return publicInfo();
  }
  function nextSequence(){ const n=(Number(config.seq)||0)+1; config.seq=n; return n; }
  function capture(state){
    currentState=state;
    if(captureQueued)return serial;
    captureQueued=true;
    serial=serial.then(async()=>{
      captureQueued=false;
      if(!booted||config.joining) return;
      ensureEntityIds(currentState);
      const after=toEntities(currentState),clock=clockFactory(config.deviceId,config.seq);
      const ops=diffEntities(lastEntities,after,clock,config.deviceId,()=>nextSequence());
      if(!ops.length) return;
      const regs=new Map(); for(const r of await getAll('registers')) regs.set(r.entity,r);
      for(const op of ops) applyOperation(regs,op);
      await putMany('registers',[...new Set(ops.map(o=>o.entity))].map(k=>regs.get(k)));
      await putMany('ops',ops.map(o=>Object.assign({sent:0,created:Date.now()},o)));
      await put('meta',{key:'checkpoint',value:clone(currentState),at:Date.now()});
      lastEntities=after; writeConfig({pending:(config.pending|0)+ops.length});
      if(publicInfo().enabled) scheduleSync(900);
    }).catch(()=>{});
    return serial;
  }

  async function sha256(bytes){ return new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)); }
  function cachedKey(cache,keyB64,algorithm,usages){
    let promise=cache.get(keyB64);
    if(!promise){
      if(cache.size>=4)cache.clear();
      promise=root.crypto.subtle.importKey('raw',unbase64(keyB64),algorithm,false,usages).catch(e=>{cache.delete(keyB64);throw e;});
      cache.set(keyB64,promise);
    }
    return promise;
  }
  function importAes(keyB64){ return cachedKey(aesKeyCache,keyB64,{name:'AES-GCM'},['encrypt','decrypt']); }
  function importHmac(keyB64){ return cachedKey(hmacKeyCache,keyB64,{name:'HMAC',hash:'SHA-256'},['sign']); }
  async function encryptJson(value,keyB64,aad){
    const iv=root.crypto.getRandomValues(new Uint8Array(12)),key=await importAes(keyB64);
    const data=await root.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(String(aad||''))},key,enc.encode(JSON.stringify(value)));
    return {iv:base64(iv),data:base64(data)};
  }
  async function decryptJson(box,keyB64,aad){
    const key=await importAes(keyB64);
    const data=await root.crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(box.iv),additionalData:enc.encode(String(aad||''))},key,unbase64(box.data));
    return JSON.parse(dec.decode(data));
  }
  async function protectDeviceName(name,key,id){const box=await encryptJson({name:String(name||deviceLabel()).slice(0,60)},key,'device-name:'+id);return 'v2.'+box.iv+'.'+box.data;}
  async function revealDeviceName(value,id){
    const raw=String(value||'');if(!raw.startsWith('v2.'))return raw.slice(0,60)||'Dispositivo';
    try{const p=raw.split('.'),x=await decryptJson({iv:p[1],data:p.slice(2).join('.')},config.rootKey,'device-name:'+id);return String(x.name||'Dispositivo').slice(0,60);}catch(_){return 'Dispositivo';}
  }
  async function entityHash(entity,keyB64){ const k=await importHmac(keyB64),s=await root.crypto.subtle.sign('HMAC',k,enc.encode(entity)); return base64(new Uint8Array(s)).replace(/[+/=]/g,'').slice(0,32); }
  function authHeaders(extra){ return Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+config.deviceToken,'X-Sentiero-Space':config.spaceId,'X-Sentiero-Device':config.deviceId},extra||{}); }
  async function api(path,init,auth){
    const endpoint=cleanEndpoint(config.endpoint); if(!endpoint) throw new Error('ENDPOINT');
    const opts=Object.assign({},init||{}); opts.headers=auth===false?Object.assign({'Content-Type':'application/json'},opts.headers||{}):authHeaders(opts.headers||{});
    let timer=null;
    if(!opts.signal&&root.AbortController){ const controller=new root.AbortController();opts.signal=controller.signal;timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT); }
    try{
      const r=await fetch(endpoint+path,opts),text=await r.text(); let data={}; try{data=text?JSON.parse(text):{};}catch(_){data={error:'response'};}
      if(!r.ok){ const e=new Error(data.error||('HTTP_'+r.status)); e.status=r.status; e.data=data; throw e; } return data;
    }catch(e){ if(e&&e.name==='AbortError'){const timeout=new Error('timeout');timeout.status=0;throw timeout;}throw e; }
    finally{ if(timer)clearTimeout(timer); }
  }
  async function mapConcurrent(items,limit,fn){
    const out=new Array(items.length);let cursor=0;
    async function worker(){while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i],i);}}
    await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
  }
  function scheduleSync(ms){ if(syncTimer)clearTimeout(syncTimer); syncTimer=setTimeout(()=>{syncTimer=null;syncNow().catch(()=>{});},Math.max(100,ms||800)); }
  function scheduleRetry(){const wait=retryMs+Math.floor(Math.random()*Math.min(1000,retryMs/2));retryMs=Math.min(60000,retryMs*2);scheduleSync(wait);}
  function syncNow(){
    if(syncInFlight)return syncInFlight;
    syncInFlight=runSync().finally(()=>{syncInFlight=null;});
    return syncInFlight;
  }
  async function runSync(){
    await serial; if(!publicInfo().enabled||config.revoked) return publicInfo();
    if(root.navigator&&'onLine' in root.navigator&&root.navigator.onLine===false){ writeConfig({status:'offline · modifiche in coda'}); return publicInfo(); }
    writeConfig({status:'sincronizzazione…'});
    try{
      const queued=(await getAll('ops','sent',0)).slice(0,MAX_BATCH);
      const prepared=await mapConcurrent(queued,CRYPTO_CONCURRENCY,async op=>{const box=await encryptJson(op,config.rootKey,op.opId);return {op,envelope:{opId:op.opId,entity:await entityHash(op.entity,config.rootKey),deviceId:op.deviceId,seq:op.seq,iv:box.iv,data:box.data}};});
      const pending=[],envelopes=[];let bodySize=40;
      for(const item of prepared){
        const bytes=JSON.stringify(item.envelope).length+1;
        if(item.envelope.data.length>MAX_CIPHER_CHARS)throw Object.assign(new Error('op_too_large'),{permanent:true});
        if(envelopes.length&&bodySize+bytes>MAX_SYNC_BODY)break;
        if(!envelopes.length&&bodySize+bytes>MAX_SYNC_BODY)throw Object.assign(new Error('op_too_large'),{permanent:true});
        pending.push(item.op);envelopes.push(item.envelope);bodySize+=bytes;
      }
      const res=await api('/v1/sync',{method:'POST',body:JSON.stringify({protocol:3,cursor:Number(config.cursor)||0,ops:envelopes})});
      const acked=new Set(Array.isArray(res.acked)?res.acked:[]);
      if(pending.some(op=>!acked.has(op.opId)))throw Object.assign(new Error('ack_missing'),{permanent:true});
      const regs=new Map(); for(const r of await getAll('registers')) regs.set(r.entity,r);
      let changed=false;
      const remote=await mapConcurrent(Array.isArray(res.ops)?res.ops:[],CRYPTO_CONCURRENCY,async env=>{
        try{
          const op=await decryptJson(env,config.rootKey,env.opId);
          if(!op||op.opId!==env.opId||op.deviceId!==env.deviceId||Number(op.seq)!==Number(env.seq))throw new Error('remote_integrity');
          return op;
        }catch(_){throw Object.assign(new Error('remote_integrity'),{permanent:true});}
      });
      for(const op of remote){
        observeClock(op);changed=applyOperation(regs,op)||changed;
      }
      if(changed){ await putMany('registers',[...regs.values()]); const next=fromEntities(currentState,registersToEntities(regs)); currentState=next; lastEntities=toEntities(next); if(onRemote) onRemote(clone(next),{source:'sync'}); }
      /* Il server ha risposto dopo INSERT OR IGNORE: le operazioni sono ormai
         recuperabili dal journal remoto e non devono crescere per sempre in IDB. */
      if(pending.length) await deleteMany('ops',pending.map(o=>o.opId));
      const left=(await getAll('ops','sent',0)).length;
      const moreRemote=res.hasMore===true;
      writeConfig({cursor:Number(res.cursor)||Number(config.cursor)||0,lastSync:Date.now(),pending:left,
        status:moreRemote?'recupero dello spazio…':(left?'altre modifiche in coda':'aggiornato'),revoked:false,joining:moreRemote});
      retryMs=2000;
      if(left||moreRemote) scheduleSync(300);
    }catch(e){
      if(e&&e.status===403&&e.data&&e.data.error==='device_revoked') writeConfig({status:'dispositivo revocato',revoked:true});
      else if(e&&e.status===403)writeConfig({status:'origine non autorizzata · dati locali al sicuro'});
      else if(e&&e.status===426)writeConfig({status:'aggiornamento richiesto · dati locali al sicuro'});
      else if(e&&e.message==='op_too_large')writeConfig({status:'modifica troppo grande · dati locali al sicuro'});
      else if(e&&(e.permanent||e.status===400||e.status===401||e.status===413))writeConfig({status:'errore sync · dati locali al sicuro'});
      else{writeConfig({status:'non raggiungibile · modifiche in coda'});scheduleRetry();}
    }
    return publicInfo();
  }

  async function createSpace(endpoint,name){
    const clean=cleanEndpoint(endpoint);if(!clean)throw new Error('ENDPOINT');
    ensureDevice(); writeConfig({endpoint:clean,deviceName:String(name||deviceLabel()).slice(0,60),revoked:false});
    await reseedCurrentState();
    const rootKey=base64(root.crypto.getRandomValues(new Uint8Array(32)));
    const protectedName=await protectDeviceName(config.deviceName,rootKey,config.deviceId);
    const res=await api('/v1/spaces',{method:'POST',body:JSON.stringify({deviceId:config.deviceId,name:protectedName})},false);
    writeConfig({spaceId:res.spaceId,deviceToken:res.deviceToken,rootKey,cursor:0,status:'pronto a sincronizzare',joining:false});
    await syncNow(); return publicInfo();
  }
  function disable(){ if(syncTimer){clearTimeout(syncTimer);syncTimer=null;}aesKeyCache.clear();hmacKeyCache.clear();writeConfig({spaceId:'',deviceToken:'',rootKey:'',cursor:0,status:'solo su questo dispositivo',revoked:false,joining:false}); return publicInfo(); }
  async function listDevices(){ const r=await api('/v1/devices',{method:'GET'}),list=Array.isArray(r.devices)?r.devices:[];return Promise.all(list.map(async d=>Object.assign({},d,{name:await revealDeviceName(d.name,d.id)}))); }
  async function renameDevice(id,name){const plain=String(name||'').trim().slice(0,60);if(!plain)throw new Error('NAME');const protectedName=await protectDeviceName(plain,config.rootKey,id),r=await api('/v1/devices/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({name:protectedName})});if(id===config.deviceId)writeConfig({deviceName:plain});return r;}
  async function revokeDevice(id){ const r=await api('/v1/devices/'+encodeURIComponent(id),{method:'DELETE'}); if(id===config.deviceId) writeConfig({revoked:true,status:'dispositivo revocato'}); return r; }
  async function deleteSpace(){ const r=await api('/v1/spaces/current',{method:'DELETE'}); disable(); return r; }

  const pairPrivate=new Map();
  async function newEcdh(){
    const keys=await root.crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey','deriveBits']);
    return {keys,pub:await root.crypto.subtle.exportKey('jwk',keys.publicKey),priv:await root.crypto.subtle.exportKey('jwk',keys.privateKey)};
  }
  async function derivePair(privJwk,pubJwk){
    const priv=await root.crypto.subtle.importKey('jwk',privJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    const pub=await root.crypto.subtle.importKey('jwk',pubJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const bits=new Uint8Array(await root.crypto.subtle.deriveBits({name:'ECDH',public:pub},priv,256));
    const key=await sha256(bits),code=((new DataView(key.buffer).getUint32(0)%1000000)+'').padStart(6,'0'); return {key:base64(key),code};
  }
  async function createPairing(){
    if(!publicInfo().enabled) throw new Error('SYNC_OFF');
    const e=await newEcdh(),r=await api('/v1/pairs',{method:'POST',body:JSON.stringify({publicKey:e.pub})});
    pairPrivate.set(r.token,{priv:e.priv,pub:e.pub});
    const payload={v:2,endpoint:config.endpoint,token:r.token,publicKey:e.pub,expiresAt:r.expiresAt};
    return {token:r.token,expiresAt:r.expiresAt,payload:JSON.stringify(payload),code:r.code};
  }
  async function pairingStatus(token){
    const r=await api('/v1/pairs/'+encodeURIComponent(token),{method:'GET'}),local=pairPrivate.get(token);
    if(r.status==='pending-confirmation'&&local&&r.publicKey){ const shared=await derivePair(local.priv,r.publicKey); r.confirmationCode=shared.code; }
    return r;
  }
  async function approvePairing(token){
    const local=pairPrivate.get(token),status=await pairingStatus(token); if(!local||!status.publicKey) throw new Error('PAIR_STATE');
    const shared=await derivePair(local.priv,status.publicKey);
    const box=await encryptJson({spaceId:config.spaceId,rootKey:config.rootKey},shared.key,token);
    const r=await api('/v1/pairs/'+encodeURIComponent(token)+'/approve',{method:'POST',body:JSON.stringify({iv:box.iv,data:box.data})});
    pairPrivate.delete(token); return Object.assign(r,{confirmationCode:shared.code});
  }
  async function redeemPairing(payload,name){
    const p=typeof payload==='string'?JSON.parse(payload):payload; if(!p||p.v!==2||!p.token||!p.endpoint||!p.publicKey) throw new Error('PAIR_CODE');
    if(p.expiresAt&&Number(p.expiresAt)<Date.now())throw new Error('PAIR_EXPIRED');
    const endpoint=cleanEndpoint(p.endpoint);if(!endpoint)throw new Error('PAIR_ENDPOINT');
    ensureDevice(); writeConfig({endpoint:endpoint,deviceName:String(name||deviceLabel()).slice(0,60)});
    const e=await newEcdh(),shared=await derivePair(e.priv,p.publicKey);
    const r=await api('/v1/pairs/redeem',{method:'POST',body:JSON.stringify({token:p.token,deviceId:config.deviceId,name:'Dispositivo in attesa',publicKey:e.pub})},false);
    try{ root.sessionStorage.setItem('sentiero-pair-pending',JSON.stringify({token:p.token,claim:r.claim,deviceToken:r.deviceToken,sharedKey:shared.key,confirmationCode:shared.code,endpoint:config.endpoint})); }catch(_){}
    return {token:p.token,claim:r.claim,confirmationCode:shared.code,expiresAt:p.expiresAt};
  }
  async function finishPairing(){
    let p=null; try{p=JSON.parse(root.sessionStorage.getItem('sentiero-pair-pending')||'null');}catch(_){} if(!p)throw new Error('PAIR_STATE');
    let backed=false;try{root.localStorage.setItem(PRE_PAIR_KEY,JSON.stringify({at:new Date().toISOString(),state:currentState}));backed=!!root.localStorage.getItem(PRE_PAIR_KEY);}catch(_){}
    if(!backed)throw new Error('PAIR_BACKUP');
    const r=await api('/v1/pairs/'+encodeURIComponent(p.token)+'/claim',{method:'POST',body:JSON.stringify({claim:p.claim})},false);
    if(r.status!=='approved') return r;
    const secret=await decryptJson(r,p.sharedKey,p.token);
    writeConfig({spaceId:secret.spaceId,rootKey:secret.rootKey,deviceToken:p.deviceToken,cursor:0,status:'recupero dello spazio…',revoked:false,joining:true});
    await serial;
    await clearStores(['ops','registers','meta']);lastEntities=new Map();
    try{root.sessionStorage.removeItem('sentiero-pair-pending');}catch(_){}
    await syncNow();try{await renameDevice(config.deviceId,config.deviceName||deviceLabel());}catch(_){} return publicInfo();
  }

  return {SCHEMA_VERSION:SYNC_SCHEMA,ARRAY_COLLECTIONS,MAP_COLLECTIONS,ensureEntityIds,toEntities,fromEntities,diffEntities,applyOperation,registersToEntities,
    bootstrap,capture,syncNow,createSpace,disable,deleteSpace,info:publicInfo,subscribe,listDevices,renameDevice,revokeDevice,
    createPairing,pairingStatus,approvePairing,redeemPairing,finishPairing,_derivePair:derivePair,_encryptJson:encryptJson,_decryptJson:decryptJson};
});
