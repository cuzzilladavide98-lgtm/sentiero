/* ======================================================================
   NUCLEO PURO — nessun DOM, nessun side effect: tutto testabile.
   ====================================================================== */
/*CORE-START*/
const LIMITS={TITLE:200,NOTE:300,DIARY:4000,RAW:4000,QMAX:100,DMAX:1000,DOM:200,SMAX:60,PKG:12,PKGB:9000};   /* v151: quanti pacchetti restano attaccati alle righe, e quanto grandi */
function clampStr(v,max){ return (typeof v==='string'?v:'').slice(0,max); }
const ALBA_MS=15600000;   /* 4h20m: il giorno di Sentiero riparte alle 4:20, non a mezzanotte */
function localDayKey(d){
  d=new Date((d?d.getTime():Date.now())-ALBA_MS);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dowOf(d){ return ((d||new Date(Date.now()-ALBA_MS)).getDay()+6)%7; } /* lun=0; senza argomento: il giorno LOGICO */
function coreUid(){ return Math.random().toString(36).slice(2,9); }

function sanitizeQuests(arr){
  if(!Array.isArray(arr)) return [];
  const out=[],seen=new Set();
  for(const q of arr){
    if(!q||typeof q!=='object') continue;
    const titolo=clampStr(q.titolo,LIMITS.TITLE).trim();
    if(!titolo) continue;
    let id=clampStr(q.id,24)||coreUid();
    while(seen.has(id)) id=coreUid();
    seen.add(id);
    const quando=(typeof q.quando==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(q.quando))?q.quando:'';
    const ora=(typeof q.ora==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(q.ora))?q.ora:'';
    const prio=([1,2,3].includes(Number(q.prio)))?Number(q.prio):3;
    const nata=(typeof q.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(q.nata))?q.nata:'';
    const monte=clampStr(q.monte,24);
    out.push({id,titolo,note:clampStr(q.note,LIMITS.NOTE),quando,ora,prio,fatto:q.fatto===true,nata,monte});
    if(out.length>=LIMITS.QMAX) break;
  }
  return out;
}
/* v273 — modifica in posto: l'identita della Quest non cambia. Date e ore sono
   stringhe civili locali, mai Date ISO, quindi 07:00 resta 07:00 su ogni fuso. */
function aggiornaQuestInPlace(q,patch){
  if(!q||typeof q!=='object'||!patch||typeof patch!=='object') return false;
  const titolo=clampStr(patch.titolo,LIMITS.TITLE).trim(); if(!titolo) return false;
  const quando=String(patch.quando||''),ora=String(patch.ora||'');
  if(quando&&!/^\d{4}-\d{2}-\d{2}$/.test(quando)) return false;
  if(ora&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) return false;
  q.titolo=titolo; q.note=clampStr(patch.note,LIMITS.NOTE); q.quando=quando; q.ora=ora;
  q.prio=[1,2,3].includes(Number(patch.prio))?Number(patch.prio):3;
  return true;
}
function questSortKey(q){ return (q.fatto?'1':'0')+String(q.prio||3)+(q.quando||'9999-99-99')+' '+(q.ora||'99:99'); }
function sortQuests(qs){ return [...qs].sort((a,b)=>{const x=questSortKey(a),y=questSortKey(b);return x<y?-1:x>y?1:0;}); }
function activeQuests(state,tk){ return state.quests.filter(q=>!q.quando||q.quando<=tk); }
function futureQuests(state,tk){ return state.quests.filter(q=>q.quando&&q.quando>tk); }
/* ══ v271 — LE REGOLE DELLE QUEST SBLOCCABILI ══════════════════════════════
   Una regola dice: quando QUESTI prerequisiti sono soddisfatti, nasce QUELLA
   quest. I prerequisiti sono RIFERIMENTI - tipo + id - non copie: se domani
   cambi il titolo del rituale, la regola continua a parlare della stessa cosa.
   E se il rituale viene cancellato, il riferimento resta e diventa visibilmente
   mancante, invece di sbloccare per sbaglio qualcosa. */
function sanitizeUnlockRules(arr){
  if(!Array.isArray(arr)) return [];
  const out=[],seen=new Set();
  for(const r of arr){
    if(!r||typeof r!=='object') continue;
    const titolo=clampStr(r.titolo,LIMITS.TITLE).trim();
    if(!titolo) continue;
    let id=clampStr(r.id,24)||coreUid();
    while(seen.has(id)) id=coreUid();
    seen.add(id);
    const req=(Array.isArray(r.req)?r.req:[])
      .filter(x=>x&&typeof x==='object'&&(x.tipo==='task'||x.tipo==='quest')&&typeof x.id==='string'&&x.id)
      .map(x=>({tipo:x.tipo,id:clampStr(x.id,24)}))
      .slice(0,3);
    if(!req.length) continue;                       /* una regola senza requisiti sbloccherebbe sempre */
    const modo=(r.modo==='ogni-giorno')?'ogni-giorno':'una-volta';
    const note=clampStr(r.note,LIMITS.NOTE);
    const prio=([1,2,3].includes(Number(r.prio)))?Number(r.prio):2;
    out.push({id,titolo,req,modo,note,prio,nata:(typeof r.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.nata))?r.nata:''});
    if(out.length>=40) break;
  }
  return out;
}
/* IL REGISTRO DELLE OCCORRENZE GIA NATE. Non e un dettaglio di comodo: e cio
   che rende impossibile il duplicato. La chiave e «idRegola» per le regole una
   volta, «idRegola|giorno» per quelle giornaliere - quindi due valutazioni
   della stessa regola nello stesso giorno logico trovano la stessa chiave e la
   seconda non fa niente. Render ripetuti, riaperture, doppi tocchi, reload e
   save() non possono generare una seconda quest, perche non e la fortuna a
   impedirlo: e la chiave. */
function sanitizeUnlockDone(o){
  const out={};
  if(!o||typeof o!=='object'||Array.isArray(o)) return out;
  Object.keys(o).slice(0,4000).forEach(k=>{
    const kk=clampStr(k,60); const v=clampStr(o[k],10);
    if(kk&&/^\d{4}-\d{2}-\d{2}$/.test(v)) out[kk]=v;
  });
  return out;
}
/* I PROMEMORIA GIA VISTI. Chiave «idEvento|AAAA-MM-GG dell'occorrenza»: chiuso
   il richiamo del compleanno di quest'anno, quello dell'anno prossimo ha una
   chiave diversa e torna da solo. Senza toccare una riga. */
function sanitizePromVisti(o){
  const out={};
  if(!o||typeof o!=='object'||Array.isArray(o)) return out;
  Object.keys(o).slice(0,2000).forEach(k=>{
    const kk=clampStr(k,60);
    if(kk&&o[k]===true) out[kk]=true;
  });
  return out;
}

function sanitizeScheduled(arr){
  if(!Array.isArray(arr)) return [];
  const out=[],seen=new Set();
  for(const t of arr){
    if(!t||typeof t!=='object') continue;
    const titolo=clampStr(t.titolo,LIMITS.TITLE).trim();
    if(!titolo) continue;
    let id=clampStr(t.id,24)||coreUid();
    while(seen.has(id)) id=coreUid();
    seen.add(id);
    const time=(typeof t.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))?t.time:'';
    /* una task può essere ricorrente (days) OPPURE legata a una data esatta (date, tipo compleanno) */
    const date=(typeof t.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.date))?t.date:'';
    let days=Array.isArray(t.days)?t.days.filter(x=>Number.isInteger(x)&&x>=0&&x<=6):[];
    days=[...new Set(days)].sort((a,b)=>a-b);
    if(!days.length&&!date) continue;   /* serve almeno uno dei due */
    /* v200: stessa malattia di sanitizeDiary, stesso giorno. La v199 aveva dato ai
       rituali una data di nascita perche' Sentiero accusava un'abitudine creata ieri
       di aver saltato ventotto giorni; scrittoNelDiario la scrive, e qui veniva
       buttata a ogni avvio. Nel backup dell'8 agosto: 14 rituali, nessuno con "nata"
       (le quest ce l'hanno tutte, perche' sanitizeQuests la conserva).
       Il guasto era mezzo nascosto: _nascitaRituale sa dedurre la nascita dal primo
       giorno spuntato, quindi per i rituali vecchi il conto tornava lo stesso. Non
       tornava proprio nel caso che la v199 voleva correggere - il rituale nato oggi
       e mai ancora spuntato - dove non c'e' niente da dedurre. */
    const nata=(typeof t.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.nata))?t.nata:'';
    /* v271 — LA RICORRENZA ANNUALE.
       «date» resta una data esatta e non viene MAI riscritta: e la data di
       origine dell'evento, il 17 marzo in cui Marco e nato. Cio che cambia ogni
       anno e la PROSSIMA OCCORRENZA, che si calcola quando serve. Riscrivere
       «date» ogni anno vorrebbe dire perdere l'origine e far crescere lo stato
       a ogni apertura: due difetti in una riga.
       Un evento vecchio non ha «repeat»: arriva undefined e diventa 'none', che
       e esattamente «una volta». La migrazione non ha bisogno di codice. */
    const repeat=(t.repeat==='yearly'&&date)?'yearly':'none';
    out.push({id,titolo,days,time,date,nata,repeat});
    if(out.length>=LIMITS.SMAX) break;
  }
  return out;
}
function sanitizeDiary(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  const lst=a=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.trim()).slice(0,20).map(x=>x.slice(0,200)):[];
  const posOf=p=>{
    if(!p||typeof p!=='object') return null;
    const lat=Number(p.lat),lon=Number(p.lon);
    if(!isFinite(lat)||!isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180) return null;
    return {lat:Math.round(lat*1e5)/1e5,lon:Math.round(lon*1e5)/1e5};
  };
  for(const e of arr){
    if(!e||typeof e!=='object') continue;
    const testo=clampStr(e.testo,LIMITS.DIARY);
    if(!testo) continue;
    const iso=(typeof e.iso==='string'&&!isNaN(Date.parse(e.iso)))?e.iso:new Date().toISOString();
    const v={id:clampStr(e.id,40)||clampStr(e._syncId,40)||coreUid(),data:clampStr(e.data,10),iso,testo,raw:clampStr(e.raw,LIMITS.RAW),born:lst(e.born),done:lst(e.done),pos:posOf(e.pos),seme:clampStr(e.seme||'',40)};
    /* v200: qui mancava "dom", e questo gira a OGNI avvio. La v197 aveva insegnato
       all'app a salvare la domanda della Chiamata a terra accanto alla risposta;
       il sanitizzatore la ributtava via al riavvio successivo, e poi save() riscriveva
       lo stato potato. Nel backup dell'8 agosto: 139 voci, zero con la domanda.
       Non era "quel dato non fu salvato": era salvato e poi mangiato.
       La lezione non e su "dom": e che un sanitizzatore che ricostruisce con una lista
       fissa e' un buco silenzioso, perche' il campo nuovo non da' nessun errore -
       sparisce e basta. Ogni campo che addDiary sa scrivere va aggiunto QUI SOTTO. */
    if(e.dom) v.dom=clampStr(e.dom,LIMITS.DOM);
    /* e "lascito" e il segno della distillazione del periodo (v195): non l'hai
       scritta tu, l'ha scritta l'osservatrice, e renderDiary la veste diversa
       guardando questo campo. Perso il segno, al riavvio la distillazione tornava
       una voce di diario qualunque - con tutto il suo CSS (.entry.lascito,
       .lasc-txt, .lasc-dona, e il bottone «dona») che non compariva piu.
       Nel documento risultava «non ancora usata»: era usata e si spegneva da sola. */
    if(e.lascito===true) v.lascito=true;
    if(e.peso===true) v.peso=true;                    /* v201: il marchio del peso, che deve durare */
    /* v271: da dove viene la voce. Serve al Diario per vestirla e a chi la
       rilegge per sapere che quel testo l'ha letto una macchina da una sua
       pagina. Vale solo 'ocr': qualunque altra cosa non entra. */
    if(e.fonte==='ocr') v.fonte='ocr';
    out.push(v);
    if(out.length>=LIMITS.DMAX) break;
  }
  return out;
}
function sanitizeQuestLog(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const e of arr){
    if(!e||typeof e!=='object') continue;
    const titolo=clampStr(e.titolo,200).trim(); if(!titolo) continue;
    const day=(typeof e.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.day))?e.day:'';
    if(!day) continue;
    const nata=(typeof e.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.nata))?e.nata:'';
    const v={_syncId:clampStr(e._syncId,40)||coreUid(),titolo:titolo,day:day,nata:nata};
    if(e.lasciata===1) v.lasciata=1;                                  /* v148: lasciata andare, non compiuta */
    out.push(v);
  }
  return out.slice(-300); /* conserva gli ultimi 300 completamenti */
}
function closeJsonFragment(text){
  let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  if(!s) return '';
  if(!/^[\[{]/.test(s)&&/^\s*"(summary|detectedPatterns|note)"\s*:/.test(s)) s='{'+s;
  const stack=[]; let inStr=false,esc=false;
  for(const ch of s){
    if(inStr){ if(esc) esc=false; else if(ch==='\\') esc=true; else if(ch==='"') inStr=false; continue; }
    if(ch==='"'){ inStr=true; continue; }
    if(ch==='{'||ch==='[') stack.push(ch);
    else if(ch==='}'&&stack[stack.length-1]==='{') stack.pop();
    else if(ch===']'&&stack[stack.length-1]==='[') stack.pop();
  }
  while(stack.length&&stack.length<8){ const ch=stack.pop(); s+=ch==='{'?'}':']'; }
  return s;
}
function parseLooseJson(text){
  const raw=String(text||'').trim();
  const candidates=[raw,raw.startsWith('{')?raw:'{'+raw,closeJsonFragment(raw),closeJsonFragment(raw.startsWith('{')?raw:'{'+raw)];
  for(const c of candidates){
    if(!c) continue;
    try{ return JSON.parse(c); }catch(_){}
  }
  return null;
}
function observerPayloadFromText(text){
  const p=parseLooseJson(text);
  if(!p||typeof p!=='object'||Array.isArray(p)) return null;
  const summary=clampStr(p.summary,300).trim();
  const detectedPatterns=Array.isArray(p.detectedPatterns)?p.detectedPatterns.slice(0,8).map(x=>clampStr(x,80).trim()).filter(Boolean):[];
  const note=clampStr((typeof p.note==='string'&&p.note.trim())?p.note:summary,600).trim();
  return note?{summary,detectedPatterns,note}:null;
}
function observerLooksJsonish(text){
  return /^\s*[\{"]/.test(String(text||''))&&/"(summary|detectedPatterns|note)"\s*:/.test(String(text||''));
}
function sanitizeObserverNotes(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const n of arr){
    if(!n||typeof n!=='object') continue;
    const payload=observerPayloadFromText(n.note);
    const note=clampStr(payload?payload.note:n.note,600).trim();
    if(!note) continue;
    const savedPatterns=Array.isArray(n.detectedPatterns)?n.detectedPatterns.slice(0,8).map(p=>clampStr(p,80).trim()).filter(Boolean):[];
    const patterns=savedPatterns.length?savedPatterns:(payload?payload.detectedPatterns:[]);
    out.push({
      id:clampStr(n.id,40)||('o'+Math.random().toString(36).slice(2,9)),
      createdAt:(typeof n.createdAt==='string')?n.createdAt.slice(0,40):new Date().toISOString(),
      vista:!!n.vista,   /* v268.3: cosi non si ripresenta ogni apertura */
      sourceRange:{
        from:(n.sourceRange&&typeof n.sourceRange.from==='string')?n.sourceRange.from.slice(0,40):null,
        to:(n.sourceRange&&typeof n.sourceRange.to==='string')?n.sourceRange.to.slice(0,40):null
      },
      summary:clampStr(n.summary||(payload&&payload.summary)||'',300).trim(),
      detectedPatterns:patterns,
      note:note
    });
  }
  return out.slice(-50); /* conserva al massimo gli ultimi 50 commenti */
}
function sanitizeObsLines(arr){   /* memoria del sussurro: le ultime righe dette, perche l'osservatrice non si ripeta */
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const n of arr){
    if(!n||typeof n!=='object') continue;
    const riga=clampStr(n.riga,400).trim(); if(!riga) continue;
    const v={_syncId:clampStr(n._syncId,40)||coreUid(),iso:(typeof n.iso==='string')?n.iso.slice(0,40):new Date().toISOString(),task:clampStr(n.task,120).trim(),riga:riga};
    if(n.verdetto===1||n.verdetto===0) v.verdetto=n.verdetto;         /* v147 */
    out.push(v);
  }
  return out.slice(-12); /* memoria di lavoro, non archivio: le ultime 12 bastano */
}
function anzianita(state){   /* l'app impara a tacere: 0 novizio, 1 pratico (7 gg attivi), 2 veterano (21) */
  const giorni=new Set();
  try{
    Object.keys(state.foto||{}).forEach(k=>{ const f=state.foto[k]; if(f&&(f.done|0)>0) giorni.add(k); });
    Object.keys(state.checks||{}).forEach(k=>{ const d=state.checks[k]; if(d&&Object.values(d).some(v=>v===true)) giorni.add(k); });
  }catch(_){}
  const n=giorni.size;
  return n>=21?2:(n>=7?1:0);
}
function micLabelDefault(){   /* il cerchio, imparato, non ha bisogno di didascalia */
  try{ return anzianita(S)>=1?'':'Tocca il cerchio per parlare'; }catch(_){ return 'Tocca il cerchio per parlare'; }
}
function sanitizeFerie(raw){   /* le ferie: il rituale riposa fino a una data, poi torna da solo */
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  Object.keys(raw).slice(0,80).forEach(k=>{
    const v=raw[k];
    if(typeof k==='string'&&k.length<=24&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k]=v;
  });
  return out;
}
function sanitizeRiposi(raw){   /* il riposo di oggi: il rituale non conta, domani torna */
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  Object.keys(raw).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-7).forEach(k=>{
    const v=raw[k];
    if(Array.isArray(v)){ const a=v.filter(x=>typeof x==='string').slice(0,40).map(x=>clampStr(x,24)); if(a.length) out[k]=a; }
  });
  return out;
}
function sanitizeFoto(raw){   /* la fotografia del giorno: done/tot congelati, ultimi sessanta */
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  Object.keys(raw).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-60).forEach(k=>{
    const v=raw[k]; if(!v||typeof v!=='object') return;
    const done=v.done|0, tot=v.tot|0;
    if(tot<0||done<0||done>99||tot>99) return;
    out[k]={done:done,tot:tot};
  });
  return out;
}
function fotoDi(state,tk,dow){   /* la memoria vera del giorno se c'e; altrimenti il ricalcolo col piano di oggi */
  const f=(state.foto||{})[tk];
  if(f&&Number.isFinite(f.done)&&Number.isFinite(f.tot)) return {done:f.done,tot:f.tot,p:f.tot?f.done/f.tot:0,fonte:'foto'};
  try{ const r=computeProgress(state,tk,dow); return {done:r.done||0,tot:r.total||0,p:r.p||0,fonte:'calc'}; }catch(_){ return {done:0,tot:0,p:0,fonte:'calc'}; }
}
function sanitizeSfide(raw){   /* la sfida che cresce: proposta, assaggi, esito */
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return out;
  Object.keys(raw).slice(0,60).forEach(id=>{
    const e=raw[id]; if(!e||typeof e!=='object') return;
    const day=s=>(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s))?s:'';
    out[clampStr(id,24)]={prop:day(e.prop),taciFino:day(e.taciFino),forma:clampStr(e.forma,80).trim(),
      giorni:Array.isArray(e.giorni)?e.giorni.filter(g=>typeof g==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(g)).slice(-8):[],
      stabile:day(e.stabile)};
  });
  return out;
}
function sanitizeSemi(arr){   /* la memoria dei semi: cosa e stato chiesto, cosa e stato raccolto */
  if(!Array.isArray(arr)) return [];
  const out=[];
  const ASSI=['pattern','senso','corpo','rientro','germoglio'];
  const GESTI=['inizia','smetti','proteggi',''];
  const STATI=['esalato','piantato','risposto'];
  for(const s of arr){
    if(!s||typeof s!=='object') continue;
    const testo=clampStr(s.testo,200).trim(); if(!testo) continue;
    out.push({
      id:clampStr(s.id,40)||('sm'+Math.random().toString(36).slice(2,9)),
      iso:(typeof s.iso==='string')?s.iso.slice(0,40):new Date().toISOString(),
      tk:(typeof s.tk==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.tk))?s.tk:'',
      asse:ASSI.includes(s.asse)?s.asse:'pattern',
      gesto:GESTI.includes(s.gesto)?(s.gesto||''):'',
      testo:testo,
      stato:STATI.includes(s.stato)?s.stato:'esalato',
      fonte:(s.fonte==='ai')?'ai':'locale',
      rif:clampStr(s.rif,40)
    });
  }
  return out.slice(-40);
}
function sanitizeCapitoli(arr){   /* i capitoli: un mese rilegato non si riscrive, al massimo si ripulisce */
  if(!Array.isArray(arr)) return [];
  const out=[]; const visti=new Set();
  for(const c of arr){
    if(!c||typeof c!=='object') continue;
    const mese=(typeof c.mese==='string'&&/^\d{4}-\d{2}$/.test(c.mese))?c.mese:null;
    if(!mese||visti.has(mese)) continue; visti.add(mese);
    /* v238 — IL CAPITOLO TAGLIATO A META PAROLA.
       Era clampStr(...,300): il capitolo di luglio finiva con «la fiamma dur».
       E peggio di un taglio brutto: sanitizeCapitoli gira a OGNI avvio e
       RISCRIVE, quindi la coda non era nascosta - era persa per sempre al primo
       caricamento dopo la scrittura. E' il difetto numero uno di casa applicato
       a un testo intero invece che a un campo.
       Adesso il tetto e largo, e se proprio si deve tagliare si taglia
       all'ultimo confine di frase, o almeno di parola: un capitolo puo essere
       corto, non puo finire a meta di «durare». I capitoli gia rilegati sono
       persi: questo salva i prossimi. */
    let riga=clampStr(c.riga,1200).trim();
    if(riga.length>1180){
      const p=Math.max(riga.lastIndexOf('. '),riga.lastIndexOf('? '),riga.lastIndexOf('! '));
      riga=(p>600?riga.slice(0,p+1):riga.slice(0,riga.lastIndexOf(' '))).trim();
    }
    if(!riga) continue;
    const pietre=Array.isArray(c.pietre)?c.pietre.slice(0,31).map(pt=>({
      g:(pt&&Number.isInteger(pt.g)&&pt.g>=1&&pt.g<=31)?pt.g:0,
      p:(pt&&typeof pt.p==='number'&&pt.p>=0&&pt.p<=1)?pt.p:0,
      pieno:(pt&&pt.pieno===1)?1:0,
      oro:(pt&&(pt.oro===1||pt.oro===2))?pt.oro:0
    })).filter(pt=>pt.g>0):[];
    const st=(c.stats&&typeof c.stats==='object')?c.stats:{};
    out.push({id:clampStr(c.id,40)||('c'+Math.random().toString(36).slice(2,9)),mese:mese,pietre:pietre,
      stats:{giorni:st.giorni|0,attivi:st.attivi|0,pieni:st.pieni|0,oro:st.oro|0},
      riga:riga,fonte:(c.fonte==='ai')?'ai':'locale',
      createdAt:(typeof c.createdAt==='string')?c.createdAt.slice(0,40):new Date().toISOString()});
  }
  return out.sort((a,b)=>a.mese<b.mese?-1:1).slice(-24); /* due anni di capitoli bastano */
}
/* v157: IL BANCO. Rigioca i pacchetti gia salvati (v151) contro il contratto di adesso, a vuoto:
   niente sussurri, niente registro dei battiti, niente diario. Serve a una cosa sola e importante:
   provare una modifica del contratto sul materiale VERO prima di metterla addosso alla giornata di
   qualcuno. Gli esiti restano nel backup, cosi in laboratorio si confrontano prima/dopo sullo
   stesso identico pacchetto - che e l'unico confronto onesto che esista. */
function sanitizeFrutti(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const e of arr.slice(-40)){
    if(!e||typeof e!=='object') continue;
    const tk=clampStr(e.tk,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(tk)) continue;
    out.push({_syncId:clampStr(e._syncId,40)||('frutto-'+tk),tk:tk,lettura:clampStr(e.lettura,400),albero:clampStr(e.albero,240),
      alberoId:clampStr(e.alberoId,60),mossa:clampStr(e.mossa,240),chiuso:e.chiuso===true,visto:e.visto===true,silenzio:e.silenzio===true});
  }
  return out;
}
function sanitizeBanco(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const e of arr.slice(-24)){
    if(!e||typeof e!=='object') continue;
    const v={_syncId:clampStr(e._syncId,40)||coreUid(),iso:clampStr(e.iso,24),ver:clampStr(e.ver,24),task:clampStr(e.task,120),
             prima:clampStr(e.prima,300),dopo:clampStr(e.dopo,300)};
    if(!v.iso) continue;
    if(e.model) v.model=clampStr(e.model,40);
    if(e.profile) v.profile=clampStr(e.profile,12);
    if(Number.isFinite(e.ms)) v.ms=Math.round(e.ms);
    if(Number.isFinite(e.tin)) v.tin=Math.round(e.tin);
    if(Number.isFinite(e.tout)) v.tout=Math.round(e.tout);
    if(Number.isFinite(e.think)) v.think=Math.round(e.think);
    if(e.pkg&&typeof e.pkg==='object'&&!Array.isArray(e.pkg)){
      try{ const j=JSON.stringify(e.pkg); if(j.length<=LIMITS.PKGB) v.pkg=JSON.parse(j); }catch(_){}
    }
    out.push(v);
  }
  return out;
}
/* v159: L'ARCHIVIO DEI DESIDERI. Fino alla v158 chiudere un desiderio faceva S.desiderio=null e
   basta: cresta, pietre, date, tutto cancellato, e nel registro restava una riga di testo.
   La v148 aveva gia risolto lo stesso problema per le quest (una quest lasciata resta agli atti
   nel questLog): il desiderio non aveva mai ricevuto lo stesso rispetto. Le pietre che hai
   spostato sono cose che hai fatto davvero: non si buttano perche la montagna e cambiata. */
function sanitizeDesideri(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const d of arr.slice(-12)){
    if(!d||typeof d!=='object') continue;
    const t=clampStr(d.testo,240).trim(); if(!t) continue;
    out.push({id:clampStr(d.id,24)||coreUid(),testo:t,ostacolo:clampStr(d.ostacolo,240),
      nata:clampStr(d.nata,10),chiusa:clampStr(d.chiusa,10),
      esito:(['compiuto','lasciato','cambiato'].includes(d.esito)?d.esito:'lasciato'),
      cresta:Array.isArray(d.cresta)?d.cresta.map(x=>clampStr(String(x),120)).filter(Boolean).slice(0,4):[],
      pietre:Array.isArray(d.pietre)?d.pietre.filter(x=>x&&x.titolo).map(x=>({titolo:clampStr(x.titolo,160),giorno:clampStr(x.giorno,10)})).slice(0,200):[]});
  }
  return out;
}
/* chiude il desiderio in corso mettendolo agli atti. Restituisce il numero di pietre salvate. */
function archiviaDesiderio(esito){
  const d=S.desiderio; if(!d) return 0;
  S.desideri=(S.desideri||[]).concat([{id:d.id,testo:d.testo,ostacolo:d.ostacolo,nata:d.nata,
    chiusa:todayKey(),esito:esito,cresta:(d.cresta||[]).slice(),pietre:(d.pietre||[]).slice()}]).slice(-12);
  const n=(d.pietre||[]).length;
  regCantiere('desiderio',{msg:esito+': '+clampStr(d.testo,90)+' \u00b7 '+n+' pietre agli atti'});
  S.desiderio=null; save();
  return n;
}
function sanitizeRegistro(arr){
  if(!Array.isArray(arr)) return [];
  const out=[];
  for(const e of arr.slice(-250)){
    if(!e||typeof e!=='object') continue;
    const v={t:clampStr(e.t,24),tipo:clampStr(e.tipo,16),ver:clampStr(e.ver,24)};
    if(!v.tipo) continue;
    if(e.task) v.task=clampStr(e.task,120);
    if(e.riga) v.riga=clampStr(e.riga,300);
    if(e.msg) v.msg=clampStr(e.msg,220);
    if(Number.isFinite(e.ms)&&e.ms>=0&&e.ms<600000) v.ms=Math.round(e.ms);
    if(e.model) v.model=clampStr(e.model,40);
    if(e.effort) v.effort=clampStr(e.effort,10);                       /* v155: la leva viaggia nei backup */
    if(e.stop) v.stop=clampStr(e.stop,20);                             /* v149: lo stop viaggia nei backup */
    if(e.pkg&&typeof e.pkg==='object'&&!Array.isArray(e.pkg)){
      try{ const j=JSON.stringify(e.pkg); if(j.length<=LIMITS.PKGB) v.pkg=JSON.parse(j); }catch(_){}   /* v151: il pacchetto viaggia nei backup */
    }
    if(e.salti) v.salti=clampStr(e.salti,80);                          /* v143: i costi del battito sopravvivono al riavvio */
    if(Number.isFinite(e.tin)) v.tin=Math.round(e.tin);
    if(Number.isFinite(e.tout)) v.tout=Math.round(e.tout);
    if(Number.isFinite(e.api)&&e.api>=0&&e.api<20) v.api=Math.round(e.api);
    if(e.verdetto===1||e.verdetto===0) v.verdetto=e.verdetto;         /* v147: il verdetto dell'amico viaggia nei backup */
    out.push(v);
  }
  return potaPacchetti(out);
}
function sanitizeState(raw,def){
  raw=(raw&&typeof raw==='object'&&!Array.isArray(raw))?raw:{};
  const st={
    quests:sanitizeQuests(raw.quests),
    diary:sanitizeDiary(raw.diary),
    scheduled:('scheduled' in raw)?sanitizeScheduled(raw.scheduled):JSON.parse(JSON.stringify(def.scheduled)),
    observerNotes:sanitizeObserverNotes(raw.observerNotes),
    mastery:sanitizeMastery(raw.mastery),
    obsLines:sanitizeObsLines(raw.obsLines),
    banco:sanitizeBanco(raw.banco),
    frutti:sanitizeFrutti(raw.frutti),                               /* v162: i frutti gia raccolti, per non ripetere l'albero */                                  /* v157: gli esiti del banco viaggiano nei backup: e li che si confrontano due contratti sullo STESSO materiale */
    registro:sanitizeRegistro(raw.registro),
    capitoli:sanitizeCapitoli(raw.capitoli),
    semi:sanitizeSemi(raw.semi),
    sfide:sanitizeSfide(raw.sfide),
    votoId:clampStr(raw.votoId,40),
    foto:sanitizeFoto(raw.foto),
    riposi:sanitizeRiposi(raw.riposi),
    ferie:sanitizeFerie(raw.ferie),
    questLog:sanitizeQuestLog(raw.questLog),
    desiderio:(function(d){ if(!d||typeof d!=='object') return null;
      const t=clampStr(d.testo,240).trim(); if(!t) return null;
      return {id:clampStr(d.id,24)||coreUid(),testo:t,ostacolo:clampStr(d.ostacolo,240),
        nata:(typeof d.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.nata))?d.nata:'',
        cresta:Array.isArray(d.cresta)?d.cresta.map(x=>clampStr(String(x),120)).filter(Boolean).slice(0,4):[],
        pietre:Array.isArray(d.pietre)?d.pietre.filter(x=>x&&x.titolo).map(x=>({titolo:clampStr(x.titolo,160),giorno:clampStr(x.giorno,10)})).slice(0,200):[]}; })(raw.desiderio),
    desideri:sanitizeDesideri(raw.desideri),                          /* v159: i desideri chiusi restano agli atti, con le loro pietre */
    checks:{},
    streak:(Number.isInteger(raw.streak)&&raw.streak>=0&&raw.streak<100000)?raw.streak:0,
    lastSealed:(typeof raw.lastSealed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.lastSealed))?raw.lastSealed:'',
    lastFullSealed:(typeof raw.lastFullSealed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.lastFullSealed))?raw.lastFullSealed:'',
    essentials:Array.isArray(raw.essentials)?raw.essentials.filter(x=>typeof x==='string').slice(0,40):[],
    patto:(raw.patto&&typeof raw.patto.tk==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.patto.tk)&&typeof raw.patto.id==='string')?{tk:raw.patto.tk,id:raw.patto.id,audace:raw.patto.audace===true}:null,
    patti:(function(p){ const out={}; if(!p||typeof p!=='object') return out;
      Object.keys(p).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-90).forEach(k=>{
        const v=p[k]|0; if(v===1||v===2) out[k]=v; }); return out; })(raw.patti),
    lastDayInit:(typeof raw.lastDayInit==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.lastDayInit))?raw.lastDayInit:'',
    /* v242: senza questa riga sanitizeState butta vistoVersione a ogni avvio, e
       il foglietto di cosa e cambiato ricomparirebbe per sempre. */
    vistoVersione:(typeof raw.vistoVersione==='string')?raw.vistoVersione.slice(0,40):'',
    /* v254: le famiglie che hanno gia parlato. Senza questa riga sanitizeState
       le butta a ogni avvio e il turno riparte sempre da capo. */
    obsFamiglie:Array.isArray(raw.obsFamiglie)?raw.obsFamiglie.filter(x=>typeof x==='string').slice(-8):[],
    /* v263: e le costruzioni gia uscite, per la stessa ragione. Sopravvivere a
       sanitizeState non e un dettaglio: senza, il turno riparte a ogni avvio e
       la prima forma di ogni famiglia torna a vincere sempre. */
    obsForme:Array.isArray(raw.obsForme)?raw.obsForme.filter(x=>typeof x==='string').slice(-24):[],
    /* v267: la base linguistica scaricata vive nello stato, quindi entra nei
       backup: cambiando telefono non si riparte da zero. Si tiene solo se e
       ancora valida: una base rotta non e meglio di nessuna base. */
    baseLing:(raw.baseLing&&typeof raw.baseLing==='object')?raw.baseLing:null,
    /* Lab 24: un backup storico puo avere l'ora dell'ultimo tentativo ma nessuna
       base (per esempio perche la generazione era stata scartata). In quel caso
       l'orologio non deve impedire alla nuova build di cercare la propria base. */
    baseLingQuando:(raw.baseLing&&typeof raw.baseLing==='object')?((+raw.baseLingQuando)||0):0,
    /* v268: la memoria del contenuto. Vive nello stato e nei backup: cambiando
       telefono, Sentiero non ricomincia a raccontare le stesse cose da capo. */
    obsDetti:Array.isArray(raw.obsDetti)?raw.obsDetti.filter(x=>x&&typeof x==='object'&&typeof x.cosa==='string').slice(-24):[],
    obsZitto:typeof raw.obsZitto==='string'?raw.obsZitto:'',   /* v268.2: il giorno in cui si e scelto di tacere */
    /* ══ v271 — TRE CAMPI NUOVI, E LA LEZIONE GIA IMPARATA TRE VOLTE ═════════
       «dom» (v197), «nata» dei rituali (v199), «vistoVersione» (v242): tutti e
       tre erano salvati correttamente e tutti e tre sparivano al riavvio, perche
       sanitizeState ricostruisce lo stato con una LISTA FISSA e un campo che non
       e in lista non da errore - sparisce e basta.
       Un backup della v270.2 non ha nessuno di questi tre: arriva undefined, e
       il ripiego e il vuoto giusto. La migrazione e quindi implicita e non
       distruttiva, ed e il banco a provarlo. */
    unlockRules:sanitizeUnlockRules(raw.unlockRules),
    unlockDone:sanitizeUnlockDone(raw.unlockDone),
    promVisti:sanitizePromVisti(raw.promVisti),
    paroleGiorno:(function(source){ const out={}; if(!source||typeof source!=='object'||Array.isArray(source)) return out;
      Object.keys(source).filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-5000).forEach(key=>{
        const value=source[key]; if(!value||typeof value!=='object') return;
        const id=clampStr(value.id,80),w=clampStr(value.w,80),n=clampStr(value.n,90),l=clampStr(value.l,50);
        if(id&&w) out[key]={id:id,w:w,n:n,l:l,p:clampStr(value.p,60),d:clampStr(value.d,360),i:clampStr(value.i,90),e:clampStr(value.e,320)}; }); return out; })(raw.paroleGiorno),
    schemaVersion:2,
    settings:{
      sound:false,   /* AUDIO SPENTO: rinascera in un cantiere dedicato */
      voice:!!(raw.settings&&raw.settings.voice===true),
      obsLine:!(raw.settings&&raw.settings.obsLine===false),
      notif:!!(raw.settings&&raw.settings.notif===true),
      geo:!!(raw.settings&&raw.settings.geo===true),
      /* v215: la lingua scelta a mano; vuota = come il telefono */
      lingua:(raw.settings&&LINGUE_NOTE[raw.settings.lingua])?raw.settings.lingua:'',
      music:false,   /* AUDIO SPENTO */
      aiModel:(raw.settings&&['max','balanced','fast'].includes(raw.settings.aiModel))?raw.settings.aiModel:'balanced',
      theme:(raw.settings&&raw.settings.theme==='zen')?'zen':'arcade',
      /* v232 - DUE ASPETTI, NON TRE, E SI CHIAMANO COME I PANNELLI.
   «Attuale» e «Carta» non dicevano niente a nessuno; OLED e LCD dicono la
   cosa vera: il primo e' fatto per uno schermo che spegne il nero, il
   secondo per uno che lo illumina da dietro. Inchiostro era un terzo tema
   rimasto dal mockup e il suo tasto non c'e piu: chi ci era dentro viene
   riportato a OLED, perche un tema senza tasto per uscirne e' una gabbia
   come le altre. Le sue regole CSS restano nel file, spente: si tolgono in
   un giro dedicato, che togliere CSS a mano e' il modo in cui questa app e
   gia morta una volta. */
      uiTheme:(raw.settings&&raw.settings.uiTheme==='carta')?'carta':'classico',
      anim:(raw.settings&&raw.settings.anim==='sempre')?'sempre':'auto',
      inkMondo:!!(raw.settings&&raw.settings.inkMondo),      /* prova: cielo e microfono a inchiostro */
      inkGiardino:!!(raw.settings&&raw.settings.inkGiardino),/* prova: giardino a inchiostro */
      genere:(raw.settings&&['m','f'].includes(raw.settings.genere))?raw.settings.genere:''   /* v150: vuoto = non detto, e l'amico evita il genere */
    }
  };
  if(raw.checks&&typeof raw.checks==='object'&&!Array.isArray(raw.checks)){
    for(const k of Object.keys(raw.checks)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const day=raw.checks[k];
      if(!day||typeof day!=='object') continue;
      const clean={};
      for(const id of Object.keys(day)) if(day[id]===true) clean[clampStr(id,24)]=true;
      st.checks[k]=clean;
    }
  }
  /* le spunte di più di 60 giorni fa non servono al loop: si potano da sole */
  const keys=Object.keys(st.checks).sort();
  while(keys.length>60) delete st.checks[keys.shift()];
  return st;
}
/* ══ v271 — LE OCCORRENZE DI UN EVENTO A DATA PRECISA ══════════════════════
   «date» e l'ORIGINE e non si riscrive mai: il 17 marzo in cui Marco e nato
   resta il 17 marzo in cui Marco e nato. Cio che cambia ogni anno e la prossima
   occorrenza, che si CALCOLA quando serve. Riscrivere «date» ogni anno
   costerebbe due cose insieme: l'origine, e la garanzia che lo stato non
   cresca a ogni apertura.

   Il 29 febbraio. Un compleanno del 29 febbraio non ha una data in tre anni su
   quattro, e ogni scelta e arbitraria: qui si sceglie il 28 febbraio, dichiarato
   una volta e sempre uguale. Deterministico e non sorprendente: chi e nato il
   29 lo festeggia il 28, non il primo marzo, perche il mese e quello. */
function _dataOk(t){ return typeof t==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t); }
function _chiaveData(y,m,d){
  const p=n=>String(n).padStart(2,'0');
  if(m===2&&d===29){ const bis=(y%4===0&&y%100!==0)||y%400===0; if(!bis) d=28; }
  return y+'-'+p(m)+'-'+p(d);
}
/* la prossima occorrenza a partire da un giorno (compreso). Per un evento «una
   volta» e la sua data, se non e passata; per uno annuale e il suo mese/giorno
   in questo anno, o nel prossimo se questo e gia passato. */
function prossimaOccorrenza(t,daTk){
  if(!t||!_dataOk(t.date)) return '';
  const da=_dataOk(daTk)?daTk:todayKey();
  if(t.repeat!=='yearly') return (t.date>=da)?t.date:'';
  const m=+t.date.slice(5,7), d=+t.date.slice(8,10);
  const y=+da.slice(0,4);
  const q=_chiaveData(y,m,d);
  return (q>=da)?q:_chiaveData(y+1,m,d);
}
/* cade oggi? Per l'annuale si confrontano mese e giorno, non la data intera:
   e la sola domanda che l'anno non deve poter cambiare. */
function cadeOggi(t,tk){
  if(!t||!_dataOk(t.date)) return false;
  tk=_dataOk(tk)?tk:todayKey();
  if(t.repeat!=='yearly') return t.date===tk;
  return prossimaOccorrenza(t,tk)===tk;
}
/* ══ v271 — LE QUEST SBLOCCABILI ═══════════════════════════════════════════
   Una regola dice: quando questi prerequisiti sono soddisfatti, nasce quella
   quest. Niente modello, niente punteggi, niente livelli: una condizione e una
   cosa che compare.

   TRE PROMESSE, e ognuna e scritta nel codice invece che sperata:

   1. PRIMA DELLO SBLOCCO LA QUEST NON ESISTE. Non e nascosta con un flag: non
      e nell'array. Quindi non puo pesare sul cerchio, sul progresso, sui conti
      della giornata o sull'osservatrice, perche non c'e niente da contare.
   2. DOPO LO SBLOCCO E UNA QUEST NORMALE. Nasce con la stessa forma di tutte,
      passa dallo stesso sanitizzatore, dallo stesso ordinamento, dallo stesso
      salvataggio e dallo stesso rendering. Nessuna seconda classe di oggetti.
      E se domani annulli per sbaglio uno dei prerequisiti, lei resta: lo sblocco
      e un fatto avvenuto, non uno stato da mantenere. Monotono, per occorrenza.
   3. IL DUPLICATO E IMPOSSIBILE, non improbabile. Ogni occorrenza ha una CHIAVE
      - «idRegola» se la regola vale una volta, «idRegola|giorno» se vale ogni
      giorno - e la chiave sta in S.unlockDone. Due valutazioni nello stesso
      giorno logico calcolano la stessa chiave, e la seconda non fa niente.
      Render ripetuti, riaperture, doppi tocchi, reload e save() non possono
      generarne una seconda. */
function _reqFatto(state,r,tk){
  if(!r||!r.id) return false;
  if(r.tipo==='task'){
    /* per una ricorrente vale la spunta del GIORNO LOGICO corrente: e la sola
       lettura che abbia senso per una cosa che si rifa ogni giorno. */
    if(!((state.scheduled||[]).some(t=>t&&t.id===r.id))) return false;   /* prerequisito sparito */
    return !!(state.checks&&state.checks[tk]&&state.checks[tk][r.id]===true);
  }
  if(r.tipo==='quest'){
    const q=(state.quests||[]).find(x=>x&&x.id===r.id);
    if(!q) return false;                                                  /* prerequisito sparito */
    return q.fatto===true;
  }
  return false;
}
/* un prerequisito che non esiste piu non e «non fatto»: e MANCANTE, e la
   differenza conta - una regola con un requisito mancante non deve sbloccare
   niente, ma deve restare modificabile e dirlo. */
function reqMancante(state,r){
  if(!r||!r.id) return true;
  if(r.tipo==='task') return !((state.scheduled||[]).some(t=>t&&t.id===r.id));
  if(r.tipo==='quest') return !((state.quests||[]).some(q=>q&&q.id===r.id));
  return true;
}
function reqNome(state,r){
  if(!r||!r.id) return '(tolto)';
  const l=(r.tipo==='task')?(state.scheduled||[]):(state.quests||[]);
  const o=l.find(x=>x&&x.id===r.id);
  return o?String(o.titolo||''):'(tolto)';
}
function chiaveSblocco(rule,tk){
  return (rule.modo==='ogni-giorno')?(rule.id+'|'+tk):rule.id;
}
/* IL CUORE. Restituisce i titoli nati, cosi chi chiama puo dirlo alla persona.
   Non salva e non ridisegna: quello lo fa il chiamante, una volta sola, cosi
   questa funzione resta chiamabile ovunque senza effetti a sorpresa. */
function valutaSblocchi(state,tk){
  tk=_dataOk(tk)?tk:todayKey();
  const nati=[];
  if(!Array.isArray(state.unlockRules)||!state.unlockRules.length) return nati;
  if(!state.unlockDone||typeof state.unlockDone!=='object') state.unlockDone={};
  if(!Array.isArray(state.quests)) state.quests=[];
  state.unlockRules.forEach(rule=>{
    if(!rule||!Array.isArray(rule.req)||!rule.req.length) return;
    const k=chiaveSblocco(rule,tk);
    if(state.unlockDone[k]) return;                       /* gia nata: la chiave e la garanzia */
    if(rule.req.some(r=>reqMancante(state,r))) return;    /* un requisito tolto non sblocca niente */
    if(!rule.req.every(r=>_reqFatto(state,r,tk))) return; /* TUTTI, sempre: 1, 2 o 3 */
    state.unlockDone[k]=tk;
    state.quests.push({id:coreUid(),titolo:clampStr(rule.titolo,LIMITS.TITLE),
      note:clampStr(rule.note||'',LIMITS.NOTE),quando:tk,ora:'',
      prio:([1,2,3].includes(Number(rule.prio)))?Number(rule.prio):2,
      fatto:false,nata:tk,monte:''});
    nati.push(rule.titolo);
  });
  if(nati.length){
    try{ state.quests=sortQuests(state.quests); }catch(_){}
    /* la memoria delle occorrenze non cresce all'infinito */
    try{ const ks=Object.keys(state.unlockDone);
      if(ks.length>3000){ ks.sort((a,b)=>String(state.unlockDone[a]).localeCompare(String(state.unlockDone[b])));
        ks.slice(0,ks.length-3000).forEach(k=>delete state.unlockDone[k]); } }catch(_){}
  }
  return nati;
}
/* L'AGGANCIO UNICO. Chiamata dopo una spunta, dopo il completamento di una
   quest, dopo il caricamento dello stato e all'inizio di un giorno nuovo.
   Nessun polling: si guarda solo quando qualcosa e cambiato davvero. */
function sbloccaOra(perche){
  try{
    const nati=valutaSblocchi(S,todayKey());
    if(!nati.length) return 0;
    save();
    try{ render(); }catch(_){}
    try{ updateRing(); }catch(_){}
    try{ regCantiere('sblocco',{msg:clampStr(nati.join(' · '),160)+' ('+(perche||'')+')'}); }catch(_){}
    try{ haptic(); }catch(_){}
    try{ toast(nati.length===1?('E comparsa: '+nati[0]):(nati.length+' cose sono comparse')); }catch(_){}
    return nati.length;
  }catch(_){ return 0; }
}

function scheduledFor(state,dow,tk){ const rip=(state.riposi&&state.riposi[tk])||[]; const fer=state.ferie||{}; /* v271: «t.date===tk» diceva soltanto «e proprio oggi». Per un evento annuale
     la domanda giusta e «cade oggi», che confronta mese e giorno. cadeOggi
     risponde a tutti e due i casi, quindi qui non c'e piu un ramo speciale. */
  return state.scheduled.filter(t=>(((t.days&&t.days.includes(dow))||cadeOggi(t,tk))&&rip.indexOf(t.id)<0&&!(fer[t.id]&&tk<fer[t.id]))); }   /* in ferie: sparisce e non conta, torna da solo il giorno scelto */
function computeProgress(state,tk,dow){
  const sched=scheduledFor(state,dow,tk);
  const checks=state.checks[tk]||{};
  const act=activeQuests(state,tk); /* le quest future non pesano sul cerchio di oggi */
  const total=sched.length+act.length;
  const done=sched.filter(t=>checks[t.id]===true).length+act.filter(q=>q.fatto).length;
  return {done,total,p:total?done/total:0};
}
function dayGap(a,b){ /* giorni interi tra due chiavi YYYY-MM-DD (b-a) */
  return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
}
function rolloverDay(state,tk){
  if(state.lastDayInit===tk) return false;
  state.quests=state.quests.filter(q=>!q.fatto); /* le compiute si archiviano */
  state.lastDayInit=tk;
  return true;
}
function essentialStatus(state,tk,dow){
  const sched=scheduledFor(state,dow,tk);
  const checks=state.checks[tk]||{};
  const ess=sched.filter(t=>(state.essentials||[]).includes(t.id));
  return {total:ess.length, done:ess.filter(t=>checks[t.id]===true).length};
}
function closeDay(state,tk){               /* chiude il giorno una volta sola e aggiorna lo streak (consecutività via lastSealed) */
  if(state.lastSealed===tk) return;
  if(state.lastSealed && dayGap(state.lastSealed,tk)===1) state.streak=(state.streak||0)+1;
  else state.streak=1;
  state.lastSealed=tk;
}
function sealIfComplete(state,tk,dow){
  const r=computeProgress(state,tk,dow);
  const es=essentialStatus(state,tk,dow);
  const full = r.total>0 && r.p===1;
  /* soft = essenziali fatti; se non ne hai segnati, ripiego su una soglia raggiungibile (≥2/3) così il cerchio si chiude comunque */
  const soft = (es.total>0) ? (es.done===es.total) : (r.total>=2 && r.p>=0.667);
  if(full && state.lastFullSealed!==tk){ state.lastFullSealed=tk; closeDay(state,tk); return 'full'; }   /* jackpot: anche dopo un soft già fatto */
  if(soft && state.lastSealed!==tk){ closeDay(state,tk); return 'soft'; }
  if(state.lastSealed===tk) return 'already';
  return 'open';
}
function accumFromResults(results){
  /* iOS può rispedire gli stessi finali in più eventi: si ricostruisce, mai si accumula */
  /* Chrome/Android consegna finali CUMULATIVI (ogni finale contiene l'intera frase fin li,
     e i precedenti restano in lista); iOS li consegna incrementali. Questa fusione regge entrambi:
     se il nuovo finale inizia con l'accumulato lo sostituisce, se e un'eco identica si ignora,
     altrimenti si accoda. Difetto visto in prova su un Android di fascia media. */
  let fin='', interim='';
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  for(const r of results){
    if(!r.final){ interim+=r.text; continue; }
    const t=norm(r.text), f=norm(fin);
    if(!t) continue;
    if(!f){ fin=t; continue; }
    if(t.toLowerCase().indexOf(f.toLowerCase())===0) fin=t;
    else if(f.toLowerCase().endsWith(t.toLowerCase())){ /* eco: gia dentro */ }
    else fin=f+' '+t;
  }
  return {sessionFinal:fin?fin+' ':'',interim};
}
/* ══ v268.2 — LA STACCIONATA, E IL PROTOCOLLO CHE ARRIVAVA ALLA PERSONA ═════
   Sulla v268 Generativa il Frutto e uscito cosi, sullo schermo di chi la usa:
       ```json {"frutto":"la meditazione e tornata ieri..."} ```
   Il contenuto era buono. Ad arrivare e stato il protocollo.

   La causa: le risposte dei modelli spesso arrivano dentro una staccionata di
   Markdown. Il codice provava a leggerle con «testo.startsWith('{')?testo:'{'+testo»,
   che su una risposta recintata costruisce una graffa in piu e rompe il parsing;
   e il ripiego successivo toglieva solo la coppia di virgolette del campo, non
   la staccionata. Cosi la stringa grezza finiva in scena.

   Qui si chiude la CLASSE, non quel caso: qualunque risposta strutturata viene
   prima ripulita, poi letta; e qualunque cosa stia per essere mostrata passa da
   un ultimo controllo che riconosce il protocollo e lo ferma. */
/* GLI APICI INVERSI NON SI SCRIVONO, SI CODIFICANO. \x60 e l'apice inverso.
   Scritti per esteso dentro un'espressione regolare, tre apici di fila fanno
   credere agli strumenti che li dentro cominci un template literal: lo
   spogliatoio del setaccio mangiava tutto fino all'apice successivo e la
   funzione qui sotto spariva dalla sua vista, che poi gridava «fantasma» su una
   funzione che c'era. E la stessa cosa che era gia costata mezz'ora a
   closeJsonFragment, ed e scritta nel montaggio: la ripeto perche l'ho appena
   rifatta. */
function scrostaProtocollo(t){
  const TRE_APICI='\x60\x60\x60';   /* dentro, non fuori: una funzione che si porta
     dietro una costante sciolta non si puo montare da sola in un banco, e ogni
     banco che la usa si rompe. E gia successo tre volte in questa versione. */
  let s=String(t||'').trim();
  /* la staccionata, con o senza etichetta di linguaggio, aperta o chiusa */
  s=s.replace(new RegExp('^\\s*'+TRE_APICI+'[a-zA-Z0-9_-]*\\s*'),'')
     .replace(new RegExp('\\s*'+TRE_APICI+'\\s*$'),'').trim();
  s=s.replace(new RegExp(TRE_APICI+'[a-zA-Z0-9_-]*','g'),' ').trim();
  return s;
}
/* riconosce cio che NON deve mai comparire davanti a una persona: staccioni,
   graffe di oggetto, nomi di campo col due punti, chiavi note del protocollo. */
function haProtocollo(t){
  const TRE_APICI='\x60\x60\x60';
  const s=String(t||'');
  if(s.indexOf(TRE_APICI)>=0) return 'staccionata markdown';
  if(/^\s*[\{\[]/.test(s.trim())) return 'comincia con una graffa';
  if(/"\s*(frutto|note|summary|detectedPatterns|riga|testo)\s*"\s*:/.test(s)) return 'nome di campo del protocollo';
  if(/\{\s*"[a-z_]+"\s*:/i.test(s)) return 'oggetto json dentro il testo';
  return '';
}
function extractJson(text){
  if(typeof text!=='string') return null;
  const a=text.indexOf('{'),b=text.lastIndexOf('}');
  if(a<0||b<=a) return null;
  try{ return JSON.parse(text.slice(a,b+1)); }catch(_){ return null; }
}
function recoveryStats(S,tk,giorni){  /* asse 3: non lo streak, la velocita di rientro dopo un buco */
  giorni=giorni||60;
  const today=new Date(tk+'T12:00:00');
  const stati=[];
  for(let d=giorni-1;d>=0;d--){
    const dt=new Date(today); dt.setDate(dt.getDate()-d);
    const k=dt.toISOString().slice(0,10);
    const dw=dowOf(dt);
    const plan=scheduledFor(S,dw,k).length;
    let done=0; const ck=S.checks&&S.checks[k];
    if(ck) Object.keys(ck).forEach(id=>{ if(ck[id]===true) done++; });
    stati.push(plan===0?'vuoto':(done>0?'attivo':'buco'));
  }
  const rientri=[]; let run=0;
  stati.forEach(s=>{
    if(s==='buco') run++;
    else if(s==='attivo'){ if(run>0) rientri.push(run); run=0; }
  });
  const media=rientri.length?rientri.reduce((a,b)=>a+b,0)/rientri.length:0;
  return {buchi:rientri.length+(run>0?1:0), rientri, rientroMedio:Math.round(media*10)/10,
          bucoAperto:run, giorniAttivi:stati.filter(s=>s==='attivo').length};
}
function lascitoCandidate(S,tk){  /* fase 2: il client decide quando le prove sono mature */
  const m=S.mastery; if(!m||!m.quest) return null;
  let best=null,score=-1;
  Object.keys(m.quest).forEach(id=>{
    const q=m.quest[id];
    const vive=(S.scheduled||[]).some(t=>t.id===id)||(S.quests||[]).some(t=>t.id===id&&!t.fatto);
    if(!vive) return;
    if(q.taciFino&&q.taciFino>=tk) return;
    const matura=q.assenze>=12||q.attriti>=3;
    if(!matura) return;
    const s=q.assenze+q.attriti*4;
    if(s>score){ score=s; best={id,assenze:q.assenze,attriti:q.attriti,frase:q.fraseAttrito||'',
      motivo:q.attriti>=3?'attrito':'assenza'}; }
  });
  return best;
}
const RIV={A1_GG_MIN:6,A1_ORA:0.85,A1_PRIMA:0.55,A2_MIN:8,A2_SOGLIA_PRIMA:0.34,A2_SOGLIA_ORA:0.6,
  A3_RIENTRI_MIN:2,A3_PRIMA_MEDIA:3,A3_ORA_MAX:1,COOL_GLOBALE:7,COOL_ASSE:30};
function _rivCool(S,tk,asse){  /* scarsita dura: mai piu di ~3 al mese */
  const riv=(S.mastery&&S.mastery.riv)||[];
  for(const r of riv){
    const gg=Math.round((new Date(tk+'T12:00:00')-new Date(r.iso.slice(0,10)+'T12:00:00'))/86400000);
    if(gg<RIV.COOL_GLOBALE) return true;
    if(r.asse===asse&&gg<RIV.COOL_ASSE) return true;
  }
  return false;
}
function _mediaFinestra(giorni,keys){
  let p=0,f=0,n=0;
  keys.forEach(k=>{ const g=giorni[k]; if(g&&g.pianificate>0){ p+=g.pianificate; f+=Math.min(g.fatte,g.pianificate); n++; } });
  return n?{p:p/n,f:f/n,prec:f/p,n}:{p:0,f:0,prec:0,n:0};
}
function rivelazioneCandidate(S,tk){
  const m=S.mastery; if(!m) return null;
  const today=new Date(tk+'T12:00:00');
  const gg=d=>{ const x=new Date(today); x.setDate(x.getDate()-d); return x.toISOString().slice(0,10); };
  /* ASSE 1: precisione dell'intenzione — ultime 2 settimane vs le 2-4 prima */
  if(!_rivCool(S,tk,1)&&m.giorni){
    const ora=[],prima=[];
    Object.keys(m.giorni).forEach(k=>{
      const d=Math.round((today-new Date(k+'T12:00:00'))/86400000);
      if(d>=0&&d<=13) ora.push(k); else if(d>=14&&d<=41) prima.push(k);
    });
    const A=_mediaFinestra(m.giorni,ora),B=_mediaFinestra(m.giorni,prima);
    if(A.n>=RIV.A1_GG_MIN&&B.n>=RIV.A1_GG_MIN&&A.prec>=RIV.A1_ORA&&B.prec<=RIV.A1_PRIMA&&A.p<=B.p)
      return {asse:1,dati:{p1:Math.round(B.p*10)/10,f1:Math.round(B.f*10)/10,p2:Math.round(A.p*10)/10,f2:Math.round(A.f*10)/10}};
  }
  /* ASSE 2: profondita dello sguardo — ultimi 10 racconti vs i 10 prima */
  if(!_rivCool(S,tk,2)&&Array.isArray(m.sguardo)&&m.sguardo.length>=RIV.A2_MIN*2){
    const sg=m.sguardo;
    const ora=sg.slice(-10),prima=sg.slice(-20,-10);
    const q=a=>a.filter(e=>e.livello>=2).length/a.length;
    const q1=q(prima),q2=q(ora);
    if(prima.length>=RIV.A2_MIN&&ora.length>=RIV.A2_MIN&&q1<=RIV.A2_SOGLIA_PRIMA&&q2>=RIV.A2_SOGLIA_ORA)
      return {asse:2,dati:{n1:prima.length,q1:Math.round(q1*100),n2:ora.length,q2:Math.round(q2*100)}};
  }
  /* ASSE 3: recupero — i rientri di prima vs l'ultimo */
  if(!_rivCool(S,tk,3)){
    const rs=recoveryStats(S,tk,60);
    if(rs.rientri.length>=RIV.A3_RIENTRI_MIN+1){
      const ultimo=rs.rientri[rs.rientri.length-1];
      const primaArr=rs.rientri.slice(0,-1);
      const mPrima=primaArr.reduce((a,b)=>a+b,0)/primaArr.length;
      if(primaArr.length>=RIV.A3_RIENTRI_MIN&&mPrima>=RIV.A3_PRIMA_MEDIA&&ultimo<=RIV.A3_ORA_MAX&&rs.bucoAperto===0)
        return {asse:3,dati:{m1:Math.round(mPrima*10)/10,m2:ultimo}};
    }
  }
  return null;
}
function rivTesto(c){
  if(!c) return '';
  if(c.asse===1) return 'Un mese fa pianificavi in media '+c.dati.p1+' cose al giorno e ne facevi '+c.dati.f1+'. Nelle ultime due settimane: '+c.dati.p2+' pianificate, '+c.dati.f2+' fatte. Hai smesso di chiederti piu tempo di quanto ne hai.';
  if(c.asse===2) return 'Nei tuoi primi '+c.dati.n1+' racconti, il '+c.dati.q1+'% delle voci andava oltre la cronaca. Negli ultimi '+c.dati.n2+': il '+c.dati.q2+'%. Stai iniziando a vederti mentre agisci, non solo dopo.';
  return 'Prima, dopo un buco, restavi fermo in media '+c.dati.m1+' giorni. Dall\'ultimo sei rientrato in '+c.dati.m2+'. I vuoti non ti trattengono piu.';
}
function sanitizeMotore(p){
  const out={letture:[],menzioni:[],attriti:[],sguardo:null};
  if(!p||typeof p!=='object') return out;
  (Array.isArray(p.letture)?p.letture:[]).slice(0,10).forEach(l=>{
    if(!l||typeof l.id!=='string') return;
    const stato=(l.stato==='trasformata')?'trasformata':(l.stato==='completata'?'completata':null);
    if(!stato) return;
    out.letture.push({id:clampStr(l.id,40),stato,prova:clampStr(l.prova||'',120),
      variante:l.variante?clampStr(l.variante,120):null,
      nuovo_titolo:(stato==='trasformata'&&typeof l.nuovo_titolo==='string'&&l.nuovo_titolo.trim())?clampStr(l.nuovo_titolo,80):null});
  });
  out.menzioni=(Array.isArray(p.menzioni)?p.menzioni:[]).filter(x=>typeof x==='string').slice(0,24).map(x=>clampStr(x,40));
  (Array.isArray(p.attriti)?p.attriti:[]).slice(0,6).forEach(a=>{
    if(a&&typeof a.id==='string'&&typeof a.frase==='string') out.attriti.push({id:clampStr(a.id,40),frase:clampStr(a.frase,140)});
  });
  if(p.sguardo&&Number.isInteger(p.sguardo.livello)&&p.sguardo.livello>=1&&p.sguardo.livello<=3)
    out.sguardo={livello:p.sguardo.livello,segnale:clampStr((p.sguardo.segnale||''),140)};
  return out;
}
function sanitizeMastery(raw){
  const m={quest:{},giorni:{},sguardo:[],riv:[]};
  if(!raw||typeof raw!=='object') return m;
  if(raw.quest&&typeof raw.quest==='object') Object.keys(raw.quest).slice(0,220).forEach(id=>{
    const q=raw.quest[id]; if(!q||typeof q!=='object') return;
    const v={assenze:Math.max(0,Math.min(999,q.assenze|0)),attriti:Math.max(0,Math.min(99,q.attriti|0)),
      fraseAttrito:clampStr(q.fraseAttrito||'',140),taciFino:clampStr(q.taciFino||'',12)};
    /* v268.4: senza queste due righe la fotografia di fine ieri veniva buttata a
       ogni avvio, e la finestra tornava a dipendere dall'ora. */
    if(q.tocco) v.tocco=clampStr(q.tocco,12);
    if(q.prima&&typeof q.prima==='object') v.prima={assenze:Math.max(0,Math.min(999,q.prima.assenze|0)),
      attriti:Math.max(0,Math.min(99,q.prima.attriti|0)),fraseAttrito:clampStr(q.prima.fraseAttrito||'',140)};
    m.quest[clampStr(id,40)]=v;
  });
  if(raw.giorni&&typeof raw.giorni==='object') Object.keys(raw.giorni).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).slice(-120).forEach(k=>{
    const g=raw.giorni[k]; if(g&&typeof g==='object') m.giorni[k]={pianificate:Math.max(0,g.pianificate|0),fatte:Math.max(0,g.fatte|0)};
  });
  if(Array.isArray(raw.sguardo)) m.sguardo=raw.sguardo.filter(e=>e&&typeof e.iso==='string'&&Number.isInteger(e.livello))
    .slice(-180).map(e=>({iso:clampStr(e.iso,20),livello:Math.max(1,Math.min(3,e.livello))}));
  if(Array.isArray(raw.riv)) m.riv=raw.riv.filter(e=>e&&typeof e.iso==='string'&&Number.isInteger(e.asse))
    .slice(-24).map(e=>({iso:clampStr(e.iso,20),asse:Math.max(1,Math.min(3,e.asse))})); else m.riv=[];
  m.detti=Array.isArray(raw.detti)?raw.detti.filter(x=>typeof x==='string').map(x=>clampStr(x,48)).slice(-40):[];
  return m;
}
/* ══ LA PRESENZA — puro: quale soglia dell'accumulo merita una voce, oggi ══ */
function presenzaCandidate(m){
  if(!m) return null;
  const detti=Array.isArray(m.detti)?m.detti:[];
  const ha=k=>detti.includes(k);
  /* prima le soglie specifiche delle quest (a meta strada verso un lascito) */
  const ids=Object.keys(m.quest||{});
  for(const id of ids){ const q=m.quest[id]||{};
    if((q.attriti|0)>=2&&!ha('f2:'+id)) return {key:'f2:'+id,tipo:'f2',id:id};
  }
  for(const id of ids){ const q=m.quest[id]||{};
    if((q.assenze|0)>=6&&!ha('a6:'+id)) return {key:'a6:'+id,tipo:'a6',id:id};
  }
  if((m.sguardo||[]).length>=10&&!ha('sg10')) return {key:'sg10',tipo:'sg10'};
  if(Object.keys(m.giorni||{}).length>=7&&!ha('g7')) return {key:'g7',tipo:'g7'};
  return null;
}
function presenzaTesto(tipo,titolo){
  if(tipo==='f2') return '\u00ab'+titolo+'\u00bb torna con fatica, nelle tue parole. lo sto annotando.';
  if(tipo==='a6') return 'tengo d\u2019occhio \u00ab'+titolo+'\u00bb da un po\u2019. anche il silenzio dice qualcosa.';
  if(tipo==='sg10') return 'dieci sguardi su te stesso. comincio a vedere come guardi.';
  if(tipo==='g7') return 'sette giorni di passi. sto imparando il tuo.';
  return '';
}
function aiOutputToState(parsed){
  if(!parsed||typeof parsed!=='object') return null;
  if(!Array.isArray(parsed.quests)) return null;
  /* rituali dettati a voce: stessa validazione di quelli creati a mano (id, days 0-6, orario) */
  const rituali=sanitizeScheduled(Array.isArray(parsed.rituali)?parsed.rituali.map(r=>({titolo:r&&r.titolo,days:r&&r.days,time:r&&r.time})):[]);
  /* v201: "peso" passa di qui o non arriva da nessuna parte. Questa e la stessa
     lista fissa che nella v200 mangiava dom, nata e lascito, solo un piano piu
     in alto: qui non si perde un campo salvato, si perde un campo appena letto. */
  return {quests:sanitizeQuests(parsed.quests),diario:clampStr(parsed.diario,LIMITS.DIARY).trim(),
    rituali:rituali,peso:parsed.peso===true,non_eseguibile:clampStr(parsed.non_eseguibile,160).trim()};
}
function nextReminderDelays(state,now){
  const dow=dowOf(now),out=[];
  const tk=localDayKey(now);
  for(const t of scheduledFor(state,dow,tk)){
    if(!t.time) continue;
    const parts=t.time.split(':');
    const when=new Date(now); when.setHours(+parts[0],+parts[1],0,0);
    const ms=when-now;
    if(ms>0&&ms<22*3600*1000) out.push({id:t.id,titolo:t.titolo,ms});
  }
  return out;
}
function pruneForSpace(state){
  /* spazio quasi pieno: i trascritti grezzi più vecchi di 30 giorni lasciano il posto */
  const cutoff=Date.now()-30*86400000;
  let pruned=false;
  for(const e of state.diary){
    if(e.raw&&Date.parse(e.iso)<cutoff){ e.raw=''; pruned=true; }
  }
  if(!pruned&&state.diary.length>50){ state.diary.length=Math.floor(state.diary.length*0.8); pruned=true; }
  return pruned;
}
/*CORE-END*/

/* ======================================================================
   STATO E UTILITÀ
   ====================================================================== */
const APP_VERSION='v60S.274.2 · 2026-08-29';

/* v272.7 — STABILITY FIRST. Questa release nasce FISICAMENTE dalla v272.3,
   non dalla catena 272.4/5/6. Frutto, Gemini, microfono, Ensō, stato del Cerchio,
   avvio e Service Worker conservano il contratto dimostrato sul telefono.
   L'unico nuovo sottosistema runtime e QUEST_MOTION, che esiste soltanto dopo
   un gesto di completamento e non programma nulla durante il boot. */

/* ══ COSA E CAMBIATO ══════════════════════════════════════════════════════
   Si scrive QUI, a ogni versione, e si scrive per chi usa l'app - non per chi
   la fa. Niente numeri di versione, niente nomi di funzioni, niente «ottimizzato»
   o «migliorato»: cosa vedra di diverso, detto come lo direbbe un amico.
   Chi aggiunge una versione aggiunge una voce in cima. Se non c'e niente che
   una persona possa notare, non si scrive niente: una lista che dice «piccole
   correzioni» insegna a non leggerla. */
/* ══ v269.1 — QUESTO ELENCO VIAGGIA CON L'APP, ANCHE QUELLO CHE NON SI VEDE ══
   Si mostra solo NOVITA[0], ma tutte queste stringhe finiscono nel file che va
   sul telefono di chiunque. Fino alla v269 tre voci portavano MISURE FATTE
   SULL'ARCHIVIO DI UNA PERSONA VERA e le raccontavano a chi legge come se
   fossero le sue: «sul tuo archivio erano trentacinque righe su cento», «sui
   tuoi ultimi trenta giorni: prima quattordici frasi diverse». Due difetti in
   uno: un dato privato distribuito, e una frase falsa detta a tutti gli altri.
   REGOLA: qui dentro si parla di cosa fa l'app, mai di cosa ha fatto una
   persona. Nessun numero che venga da un archivio reale. Nessun titolo scritto
   da qualcuno. Gli esempi, se servono, si inventano. */
const NOVITA=[
 {titolo:'Le tue cose, anche sull’altro dispositivo',righe:[
   'Altro adesso è diviso in pagine brevi: Dispositivi, Esperienza, Versione Generativa, Pianificazione, Lingua, Dati e Guida. Non c’è più una pagina larga da inseguire di lato.',
   'Una Quest si può cambiare senza cancellarla: titolo, nota, giorno, ora e priorità restano legati alla stessa Quest e agli stessi prerequisiti.',
   'La sincronizzazione è facoltativa e resta local-first: lavori offline, le modifiche aspettano in coda e poi si uniscono campo per campo. Il server riceve operazioni cifrate, mai la chiave Gemini.',
   'Per collegare un dispositivo usi un invito temporaneo, confronti un codice sui due schermi e approvi da quello già collegato.'
 ]},
 {titolo:'La spunta ha un nuovo movimento · senza rallentare il resto',righe:[
   'Quando completi una cosa, il movimento resta nella sua riga: non parte più una stella e non compare più una parola-premio al centro dello schermo.',
   'La prima parte della giornata reagisce in blu, poi il gesto acquista forza in rosso e nei passi più avanzati arriva al viola. Conta quante cose risultano davvero fatte oggi, non quanto velocemente le hai spuntate.',
   'Se togli una spunta fatta per errore, il conto torna indietro: quando rifarai davvero quel passo, tornerà anche la sua stessa intensità.',
   'Il Frutto, la Distillazione Gemini, il microfono e il Cerchio continuano a usare il percorso stabile della versione precedente.'
 ]},
 {titolo:'Correzioni importanti · Cosa è cambiato',righe:[
   'La Distillazione usa adesso una strada Gemini separata e pensata proprio per l’estrazione strutturata: non aspetta più l’endpoint usato da Frutto e Osservatrice.',
   'In Prova connessione Sentiero verifica la stessa strada usata davvero dalla Distillazione, compreso il JSON strutturato: se il test è verde, il percorso è pronto.',
   'Quando tocchi Tieni, la nota resta salvata sul telefono prima della rete. Se entrambi i modelli rapidi non rispondono, Sentiero te lo dice e solo allora passa al motore locale.',
   'La base italiana completa è incorporata nell’app: anche se GitHub o la cache non consegnano il file esterno, Sentiero non ricade più sulla base minima.',
   'Microfono, ensō e satelliti continuano a condividere lo stesso centro; Backup completo può ripristinare anche la chiave Gemini.'
 ]},
 /* v245 — IL CAMPO «da» E STATO TOLTO, e per una ragione che vale come lezione:
    conteneva un numero di versione, e il comando che alza la versione a ogni
    consegna riscriveva anche QUESTI, mescolando le etichette delle voci. Un dato
    che nessuno legge ma che qualcosa riscrive e una trappola che aspetta.
    Le voci stanno in ordine: la prima e la piu recente. Basta quello.
    Chi aggiunge una versione aggiunge un blocco IN CIMA. */
 {righe:[
   'Sentiero ha quattro luoghi, in fondo allo schermo: Parla, Oggi, Diario, Altro. Tocchi dove vuoi andare e ci sei. Il cassetto che si tirava su e gi\u00f9 non c\u2019\u00e8 pi\u00f9: si richiudeva da solo e ti toglieva met\u00e0 dell\u2019app.',
   'Ogni luogo si ricorda dove eri: torni al Diario e ritrovi la riga che stavi leggendo. E adesso puoi ingrandire il testo, cosa che prima l\u2019app ti impediva.'
 ]},
 {righe:[
   'Un dito, una cosa sola \u2014 e adesso davvero: chi comincia un gesto lo finisce sempre lui, e un secondo dito non pu\u00f2 avviare niente n\u00e9 chiudere quello che stavi facendo.'
 ]},
 {righe:[
   'Un dito, una cosa sola. Prima il foglio e il microfono ascoltavano tutti e due lo stesso dito e nessuno dei due sapeva dell\u2019altro: adesso chi tocca per primo comanda, e un secondo dito non gli toglie il gesto di mano.',
   'E se il microfono si interrompe, adesso si spegne davvero: prima restava acceso in silenzio.'
 ]},
 {righe:[
   'Adesso puoi mandare a chi ripara una \u00abdiagnostica\u00bb: dice che telefono hai, che versione stai usando e cosa \u00e8 successo all\u2019app, e non contiene nessuna delle tue parole. Il backup resta un\u2019altra cosa: quello \u00e8 la tua vita e tienilo per te.',
   'E la pagina \u00abI tuoi dati\u00bb adesso distingue due cose diverse: quello che scrivi tu, che esce solo se metti la chiave, e i programmi che l\u2019app scarica per funzionare, che sono file che arrivano \u2014 non tuoi che partono.'
 ]},
 {righe:[
   'Se il microfono si interrompe mentre parli, quello che avevi gi\u00e0 detto non sparisce pi\u00f9: lo ritrovi dove lo ritrovi sempre, con i soliti due tasti. E dopo un errore Sentiero torna davvero a riposo, invece di restare mezzo acceso.',
   'La domanda \u00abquesta cosa \u00e8 ancora tua?\u00bb non si considera pi\u00f9 fatta se non hai potuto vederla. E quando il foglio \u00e8 gi\u00f9, il mondo torna vivo: la Chiamata a terra c\u2019\u00e8.'
 ]},
 {righe:[
   'Dentro l\u2019app non c\u2019\u00e8 pi\u00f9 niente della vita di chi l\u2019ha scritta: gli esempi sono inventati e il cielo, se non gli dai la posizione, non \u00e8 pi\u00f9 quello sopra casa sua ma una decorazione.'
 ]},
 {righe:[
   'Sentiero ha smesso di fingere di scegliere le parole con sei criteri: tre erano soglie da passare, non voti, e uno premiava soltanto le frasi che avevamo scritto per prime. Adesso pesa quanto una riga chiede a chi legge e quanto \u00e8 facile da leggere \u2014 con l\u2019indice Gulpease, che \u00e8 aritmetica, non un nostro elenco di parole.'
 ]},
 {righe:[
   'Se rispondi che una cosa \u00e8 ancora tua, Sentiero smette di trattarla come abbandonata \u2014 ma non cancella pi\u00f9 le parole con cui ne avevi parlato. Restano tue. Semplicemente non te le rinfaccia pi\u00f9 come se valessero ancora oggi.'
 ]},
 {righe:[
   'Sentiero guarda i giorni finiti. Oggi non \u00e8 ancora un giorno: contarlo voleva dire, alle otto del mattino, chiamare \u00abvuoto\u00bb un giorno che non era nemmeno cominciato. Adesso quello che ti dice \u00e8 lo stesso che tu apra l\u2019app alle 8, alle 14 o alle 20.',
   'E una riga che non hai fatto in tempo a leggere non va persa: resta l\u00ec e te la ritrovi alla prossima apertura.'
 ]},
 {righe:[
   'Adesso Sentiero decide prima COSA vale la pena dirti, e solo dopo come dirlo. E se nessuna cosa merita davvero di arrivarti, sta zitto: non riempie uno spazio perch\u00e9 lo spazio esiste.',
   'E si ricorda di che cosa ti ha gi\u00e0 parlato, quando e in che senso. Cambiare le parole non rende nuova una cosa gi\u00e0 detta.'
 ]},
 {righe:[
   'Adesso Sentiero non prende la prima frase buona che trova: le costruisce tutte, le mette in gara e sceglie la migliore. Prima ne aveva decine fra cui scegliere, ogni volta, e ne prendeva una a caso.',
   'E quando c\u2019\u00e8 rete impara: aggiorna la sua base di parole leggendo un file pubblicato con l\u2019app. Legge e basta \u2014 di te non esce niente. Senza rete usa quella che ha gi\u00e0.'
 ]},
 {righe:[
   'Le scritte non si scrivono pi\u00f9 addosso. Sugli schermi corti «Vai al punto» finiva stampato sopra la domanda e i due tasti della risposta restavano sotto il foglio: non erano premibili.',
   'E la domanda della chiamata a terra adesso si vede sempre. Prima nasceva invisibile e a farla comparire era solo un\u2019animazione: se quella non partiva, restava li senza che nessuno potesse leggerla.'
 ]},
 {righe:[
   'Quando ti dice che una cosa \u00e8 ferma e un\u2019altra va, adesso cambia le parole ogni volta: al palo e in movimento, a terra e in piedi, in stallo e in corsa, nel dimenticatoio e a galla.',
   'Sono modi di dire che capisce chiunque, ed \u00e8 una regola: quello che l\u2019app dice deve arrivare a tutti, se no non serve a niente dirlo bene.'
 ]},
 {righe:[
   'Sentiero ha imparato a tenere insieme due cose invece di dirne una. Se una cosa \u00e8 ferma e un\u2019altra va avanti, adesso te le dice nella stessa riga, e chiude su quella che si \u00e8 mossa.',
   'E quando qualcosa passa proprio nel giorno che dava meno, te lo nomina. Non \u00e8 un complimento: \u00e8 la cosa precisa che hai fatto, e il merito resta tuo.'
 ]},
 {righe:[
   'La voce della sera ha imparato a non ripetersi. Le costruzioni sono passate da ventisei a ottanta, e soprattutto adesso fanno a turno: prima si leggeva sempre dalla prima riga dell\u2019elenco e le altre non uscivano mai.',
   'Adesso si ripete molto meno, e non tace pi\u00f9 nessuna sera senza una ragione.'
 ]},
 {righe:[
   'Le cose che hai chiamato con un numero dentro \u2014 «10 000 passi», «Niente schermi dopo le 22:00» \u2014 tornano a farsi nominare. L\u2019app evitava i numeri per non fartene mai pesare uno, e finiva per censurare i nomi che gli avevi dato tu.',
   'Era una riga su tre a morire cos\u00ec, in silenzio, e tre delle otto voci della sera erano mute.'
 ]},
 {righe:[
   'La chiamata a terra torna a fare domande. Se hai «Riduci movimento» acceso sul telefono, la domanda c\u2019era ma restava invisibile: adesso si vede.',
   'E qualunque cosa succeda, quella porta chiede sempre qualcosa: non si apre piu su un foglio bianco.'
 ]},
 {righe:[
   'Adesso scorre. Mentre trascini o scorri, i disegni di sfondo si mettono in pausa e riprendono da soli: il dito ha la precedenza su tutto.',
   'E il diario non calcola piu le voci lontane dallo schermo: con centocinquanta note si sente.'
 ]},
 {righe:[
   'L\u2019app e diventata molto piu leggera: ogni volta che spunti qualcosa non ridisegna piu tutto il diario, ma solo quello che e cambiato davvero.',
   'E quando lo schermo e coperto smette di lavorare: meno batteria, stessa app quando torni a guardarla.'
 ]},
 {righe:[
   'Nelle impostazioni le cose ricorrenti si possono finalmente togliere: la \u00d7 si vede. E toccandone una la puoi cambiare, senza perdere da quando la stai facendo.',
   'Tenendo premuto l\u00ed non si apre pi\u00f9 il giardino per sbaglio: il giardino si apre dal mondo, tenendo premuto il cielo.',
   'Dopo che hai parlato, Butta e Tieni restano davanti a te: niente gesti nascosti per decidere cosa conservare.'
 ]},
 {righe:[
   'Il microfono resta aperto dopo il primo tocco e si chiude con il tocco successivo. Il dito non deve restare sullo schermo.',
   'I vecchi gesti di blocco e trascinamento non servono piu: parlare e fermare sono due tocchi dello stesso controllo.'
 ]},
 {righe:[
   'Sull\u2019aspetto chiaro il mondo attorno al microfono e diventato un filo solo, che si allunga col giorno e chiude il cerchio quando il giorno si chiude.',
   'Non tremola piu: quello che hai gia percorso sta fermo, si muove solo la punta.'
 ]},
 {righe:[
   'Aprendo l\u2019app con l\u2019aspetto chiaro, il mondo partiva scuro e diventava chiaro solo entrando nelle impostazioni. Adesso parte giusto.'
 ]},
 {righe:[
   'La riga della sera non si ripete piu come prima: se ieri ti ha parlato di una cosa, stasera guarda altrove.'
 ]},
 {righe:[
   'Toccando una cosa l\u2019app rifa solo quello che e cambiato, invece di ridisegnare tutto: risponde prima e scalda meno.'
 ]},
 {righe:[
   'L\u2019app e piu leggera e piu stabile: quando spunti qualcosa o cambi un\u2019impostazione scrive molto meno, e quello che scrivi non aspetta.',
   'Capisce anche le frasi in cui la cosa da fare e detta come un nome: «segna il rispondere alla mail».'
 ]},
 {righe:[
   'Quando parli a lungo e ti fermi a pensare, il diario va a capo dove ti sei fermato: rileggendolo ritrovi il tuo ritmo invece di un blocco unico.'
 ]},
 {righe:[
   'Per parlare a lungo non serve piu tenere il dito premuto: alzalo senza staccarlo e il microfono resta aperto. Tocchi per chiudere.'
 ]},
 {righe:[
   'Registrare e piu stabile: mentre parli il telefono smette di ridisegnare, e girarlo non interrompe piu quello che stai dicendo.',
   'La voce della sera non usa piu parole nostre che sullo schermo non compaiono da nessuna parte.'
 ]},
 {righe:[
   'Sull\u2019aspetto chiaro lo schermo non tremola piu: il microfono si disegnava in due modi diversi a fotogrammi alterni.'
 ]},
 {righe:[
   'La luce viola della sera adesso e fatta di due forze che si incontrano: un anello freddo e uno caldo che girano in senso opposto, e il viola e quello che si vede dove si sovrappongono.'
 ]},
 {righe:[
   'La luce viola della sera e piu grande e piu profonda: ha una corona attorno e un anello suo, e respira con due tempi diversi che non tornano mai uguali.'
 ]},
 {righe:[
   'Sull\u2019aspetto chiaro il sussurro della sera adesso e chiaro anche lui: prima restava una bolla scura in mezzo al foglio.',
   'Spuntando una cosa non le sparisce piu la prima lettera.',
   'L\u2019aspetto chiaro consuma molto meno di prima: poteva far chiudere l\u2019app.'
 ]},
 {righe:[
   'Sentiero capisce qualche frase in piu di quelle che dici a voce: prima alcune sparivano senza lasciare traccia.',
   'Le righe della sera arrivano anche quando prima restava zitto.'
 ]},
 {righe:[
   'Sull\u2019aspetto chiaro si vede il giro del giorno: un tratto che cresce attorno al microfono e, quando il cerchio si chiude, si chiude anche lui.',
   'Questo foglietto, prima, non compariva a nessuno.'
 ]},
 {righe:[
   'Puoi far scrivere le righe della sera a una voce che vive dentro il telefono: gratis, senza chiave, e funziona anche senza rete.',
   'C\u2019e anche una seconda intelligenza, piu piccola, che capisce quando una giornata pesa davvero.'
 ]},
 {righe:[
   'Un secondo aspetto, pensato per gli schermi LCD: fondo chiaro, testi piu leggibili al sole, e i colori restano quelli.',
   'Sui telefoni con lo schermo corto il foglio parte piu in alto: si vede una riga in piu.',
   'Il primo giorno adesso si puo scorrere: prima, se il testo non ci stava, il tasto per andare avanti restava irraggiungibile.'
 ]}
];

function mostraNovita(){
  try{
    const el=document.getElementById('novita'); if(!el) return;
    const visto=S.vistoVersione||'';
    if(visto===APP_VERSION) return;
    /* al primo giorno di chi non sa niente non si racconta cosa e cambiato:
       per lui non e cambiato niente, e' tutto nuovo. */
    const ob=document.getElementById('onboard');
    if(ob&&!ob.classList.contains('hidden')) return;
    /* v243 — QUI C'ERA IL DIFETTO CHE LO RENDEVA MUTO PER TUTTI.
       «segno vuoto» non vuol dire «prima installazione»: vuol dire anche «questa
       cosa e nuova, e chi usa l'app da mesi non l'ha mai vista». Con la riga di
       prima il foglietto veniva marcato come letto e non compariva a nessuno -
       cioe non compariva proprio mai, che e il difetto peggiore per una cosa che
       serve a dire quello che e cambiato.
       Il primo giorno vero si riconosce dai DATI, non dal segno: chi non ha
       ancora scritto niente non ha niente da confrontare. */
    if(!visto){
      const nuovo=!(S.diary&&S.diary.length)&&!(S.quests&&S.quests.length)&&!(S.scheduled&&S.scheduled.length);
      if(nuovo){ S.vistoVersione=APP_VERSION; save(); return; }
    }
    const blocco=NOVITA[0]; if(!blocco) return;
    const testa=el.querySelector('.nov-testa');
    if(testa) testa.textContent=blocco.titolo||'Cosa è cambiato';
    const ul=document.getElementById('nov-righe'); if(!ul) return;
    ul.innerHTML=blocco.righe.map(r=>'<li>'+escapeHtml(r)+'</li>').join('');
    el.classList.remove('hidden');
  }catch(_){}
}

/* ══ LE TRE MAI DICHIARATE (v199) ══════════════════════════════════════════
   Dal registro del cantiere: «Can't find variable: _lastNextMoveKey».
   Cercandola ho scoperto che era usata due volte e dichiarata zero. Il lint dei
   muri, con la famiglia O scritta per l'occasione, ne ha trovate TRE - e la terza,
   _laterOpen, e anche lei LETTA al primo uso: un secondo errore vivo che nessuno
   aveva mai visto.

   Giravano per caso. In JavaScript non stretto ASSEGNARE un nome non dichiarato
   lo crea come globale, quindi «_whisperTimer=setTimeout(...)» funziona. Ma
   LEGGERLO prima di averlo mai assegnato e ReferenceError, ed e esattamente cio
   che faceva renderFlow con «if(_k!==_lastNextMoveKey)»: ogni giro moriva li, e
   tutto cio che veniva dopo in quella funzione non girava.

   Si dichiarano con var e non con let: le funzioni si sollevano e possono essere
   chiamate prima che questa riga venga eseguita. Con let sarebbe zona morta
   temporale, cioe lo stesso errore con un nome piu elegante. */
var _lastNextMoveKey='', _lastUserAct=0, _laterOpen=false;
/* e _lastUserAct qualcuno deve pure aggiornarla, o il suono della prossima mossa
   non parte mai: era letta e mai scritta. */
try{ ['pointerdown','keydown'].forEach(function(ev){
  addEventListener(ev,function(){ _lastUserAct=Date.now(); },{passive:true,capture:true}); }); }catch(_){}
/* ── rete di sicurezza: un errore isolato non deve abbattere l'app o sporcare la console ── */
try{
  window.addEventListener('error',function(e){ try{ if(e&&e.message&&/ResizeObserver/.test(e.message)) return; }catch(_){} });
  window.addEventListener('unhandledrejection',function(e){
    /* le promesse async (IA, condivisione, audio) hanno già i loro try/catch:
       qui assorbiamo solo eventuali sfuggite, senza bloccare l'interfaccia */
    try{ if(e&&e.preventDefault) e.preventDefault(); }catch(_){}
  });
}catch(_){}

/* ══ LA LINGUA COME DATO (v215) ═════════════════════════════════════════════
   Primo passo verso la globalizzazione, e non e tradurre le scritte: e smettere
   di scrivere «it-IT» dentro il codice. Finche la lingua e una costante, ogni
   traduzione e una modifica al motore; quando e un dato, aggiungere una lingua
   diventa aggiungere una riga a una tabella.

   QUELLO CHE QUESTO PASSO GIA RISOLVE DA SOLO, prima di qualunque traduzione:
   chi non parla italiano dettava dentro un riconoscitore impostato su it-IT, e
   quello gli trascriveva l'inglese in fonetica italiana - cioe spazzatura nel
   diario. E le date gli uscivano in italiano. Adesso la dettatura e le date
   seguono il telefono, o quello che sceglie lui.

   QUELLO CHE NON RISOLVE, e va detto: l'interfaccia resta in italiano, e resta
   italiano tutto il motore locale - l'estrattore del microfono, il vivaio delle
   domande, le forme dell'osservatrice, le soglie del giudice prese su Pavese,
   London e Pratchett. Una versione inglese non e una traduzione: e un secondo
   motore. Questo passo e il telaio su cui montarlo. */
const LINGUE_NOTE={
  it:{tag:'it',locale:'it-IT',nome:'Italiano'},
  en:{tag:'en',locale:'en-US',nome:'English'}
};
function linguaApp(){
  try{
    const scelta=S&&S.settings&&S.settings.lingua;
    if(scelta&&LINGUE_NOTE[scelta]) return scelta;
  }catch(_){}
  try{
    const dal=(navigator.language||navigator.userLanguage||'it').slice(0,2).toLowerCase();
    if(LINGUE_NOTE[dal]) return dal;
  }catch(_){}
  return 'it';                       /* la casa di partenza, finche non ce n'e un'altra completa */
}
function locale(){ return (LINGUE_NOTE[linguaApp()]||LINGUE_NOTE.it).locale; }
/* v220 — LA RIPARAZIONE.
   La v216 aveva spezzato questa funzione a meta: uno script di innesto cercava
   «la prima graffa chiusa dopo l'apertura» per trovarne la fine, e trovava
   quella del try. «}catch(_){}» si e spaccato in «}c» + «atch(_){}», con
   ottomila righe infilate in mezzo. Da li in poi il file non compilava piu, e
   l'app non partiva: schermata bianca, nessun messaggio, niente.
   Quattro versioni consegnate cosi - v216, v217, v218, v219 - con trentatre
   banchi verdi ogni volta, perche i banchi provano FRAMMENTI e nessuno leggeva
   il file come lo legge un browser. Adesso c'e provaSintassi, ed e il primo. */
function applicaLingua(){
  try{ document.documentElement.setAttribute('lang',linguaApp()); }catch(_){}
}

/*SCRITTE-INIZIO*/
/* ══ LE LINGUE SONO PACCHETTI (v218) ════════════════════════════════════════
   Fino alla v217 la seconda lingua stava DENTRO l'app: dizionario e schemi
   dell'estrattore, tutti inline. Con dieci lingue sarebbero stati tre megabyte
   da scaricare anche a chi ne usa una.

   Adesso ogni lingua che non sia l'italiano e un file: lingue/en.json, accanto
   all'app nello stesso repo. L'app lo chiede una volta, il service worker lo
   mette in cache come tutto il resto, e da li in poi funziona offline per
   sempre - come la calcolatrice. Aggiungere una lingua vuol dire aggiungere un
   file, senza toccare una riga di codice.

   L'ITALIANO RESTA DENTRO, e non e un privilegio: e la garanzia che l'app
   funzioni al primo avvio senza chiedere niente a nessuno, anche se la rete non
   c'e e il pacchetto non e ancora arrivato. Chi apre Sentiero e in italiano non
   scarica niente, mai.

   E se il pacchetto non arriva? Le scritte restano in italiano e l'estrattore
   tace. Mai un buco, mai una chiave nuda: la stessa regola di sempre. */
let PACCHETTO=null;                       /* la lingua caricata, o niente */
const _PACK_LS='sentiero-lingua-';        /* copia di scorta, per quando il service worker non c'e ancora */

function _packLeggiCache(l){
  try{ const t=localStorage.getItem(_PACK_LS+l); if(t) return JSON.parse(t); }catch(_){}
  return null;
}
function _packScriviCache(l,d){
  try{ localStorage.setItem(_PACK_LS+l,JSON.stringify(d)); }catch(_){}
}
async function caricaLingua(l){
  if(l==='it'){ PACCHETTO=null; return true; }               /* l'italiano e in casa */
  if(PACCHETTO&&PACCHETTO.lingua===l) return true;
  const salvato=_packLeggiCache(l);
  if(salvato&&salvato.lingua===l){ PACCHETTO=salvato; return true; }
  try{
    const r=await fetch('./lingue/'+l+'.json',{cache:'force-cache'});
    if(!r.ok) return false;
    const d=await r.json();
    if(!d||d.lingua!==l) return false;
    PACCHETTO=d; _packScriviCache(l,d);
    return true;
  }catch(_){ return false; }
}
function _tNorm(s){ return String(s).trim().replace(/[’ʼ‘]/g,"'").replace(/\s+/g,' '); }
let _tIndice=null;
function _tCostruisci(){
  const d=(PACCHETTO&&PACCHETTO.scritte)||{}, out={};
  for(const k in d) out[_tNorm(k)]=d[k];
  return out;
}
/* T(testo) — la traduzione se c'e, l'italiano se manca. Mai un buco. */
function T(t){
  const l=linguaApp();
  if(l==='it'||!PACCHETTO||PACCHETTO.lingua!==l) return t;
  if(!_tIndice||_tIndice._l!==l){ _tIndice=_tCostruisci(); _tIndice._l=l; }
  return _tIndice[_tNorm(t)]||t;
}
let _tradOrig=[];
function traduciPagina(){
  try{
    _tradOrig.forEach(o=>{ try{ if(o.attr) o.el.setAttribute(o.attr,o.testo); else o.nodo.textContent=o.testo; }catch(_){} });
    _tradOrig=[];
    if(linguaApp()==='it'||!PACCHETTO) return;
    const salta={SCRIPT:1,STYLE:1,NOSCRIPT:1};
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodi=[];
    let n; while((n=w.nextNode())){
      if(n.parentNode&&salta[n.parentNode.nodeName]) continue;
      const t=n.textContent, s=t.trim();
      if(s.length<2) continue;
      const tr=T(s);
      if(tr!==s) nodi.push({nodo:n,testo:t,nuovo:t.replace(s,tr)});
    }
    nodi.forEach(x=>{ _tradOrig.push({nodo:x.nodo,testo:x.testo}); x.nodo.textContent=x.nuovo; });
    ['placeholder','aria-label','title'].forEach(a=>{
      document.querySelectorAll('['+a+']').forEach(el=>{
        const v=el.getAttribute(a); if(!v) return;
        const tr=T(v.trim());
        if(tr!==v.trim()){ _tradOrig.push({el:el,attr:a,testo:v}); el.setAttribute(a,tr); }
      });
    });
  }catch(_){}
}
/* la lingua si accende in due tempi: subito quello che si puo fare a secco,
   poi il pacchetto quando arriva. */
async function accendiLingua(){
  try{ applicaLingua(); }catch(_){}
  const ok=await caricaLingua(linguaApp());
  try{ traduciPagina(); }catch(_){}
  try{ renderLingua(); }catch(_){}
  return ok;
}
/*SCRITTE-FINE*/

/* ══ v259 — MENTRE IL DITO SI MUOVE, I PENNELLI SI FERMANO ══════════════════
   L'app non si bloccava: non «scorreva». E' una cosa diversa e si sente lo
   stesso. Sedici millesimi per fotogramma: se dentro ci finiscono anche il filo
   del microfono e i due satelliti mentre il dito trascina il foglio, il
   fotogramma salta - e un fotogramma saltato non si vede, si sente.

   Qui non si toglie niente a nessuno: si sposta. Finche il dito e in movimento
   i disegni di sfondo tacciono, e centoquaranta millesimi dopo l'ultimo
   movimento ripartono da soli. Nessun timer da spegnere: un orario, e ogni
   ciclo guarda l'orologio. Costa una sottrazione per fotogramma.

   Il tempo dei disegni resta quello vero (si calcola da ts, non dai giri), cosi
   al ritorno niente scatta in avanti: riprendono da dove sarebbero stati. */
let _manoFino=0;
function manoAlLavoro(){ try{ _manoFino=performance.now()+140; }catch(_){ _manoFino=Date.now()+140; } }
function ditoInMovimento(){ try{ return performance.now()<_manoFino; }catch(_){ return false; } }
window.manoAlLavoro=manoAlLavoro;

/* ══ IL CONFINE FRA UNA PERSONA E UN'ALTRA — DETTO CON PRECISIONE ═══════════
   Sentiero NON ha account, NON ha profili, NON ha un identificatore di persona
   e non ha un server. Quindi non isola gli utenti: NON LI DISTINGUE AFFATTO.
   E una scelta, non una mancanza, e va detta com'e invece che lasciata credere.

   COSA C'E, tutto qui:
     · localStorage['sentiero-v1']  lo stato: diario, cose da fare e impostazioni.
       La chiave Gemini NON sta qui.
     · localStorage['sentiero-gemini-key']  la chiave Gemini BYOK, separata
       dallo stato per non mescolarla ai dati del diario. Entra soltanto nel Backup completo quando lo scegli esplicitamente. Resta comunque
       in chiaro nello storage del browser: separata non significa cifrata.
     · dodici chiavi 'sentiero-*'   roba di interfaccia: se l'accoglienza e gia
       stata vista, l'ultima posizione del cielo, il meteo in cache, i flag.
     · indexedDB (suoni)            i campioni audio generati.
     · cache del service worker     i file dell'app, per funzionare offline.

   COSA VUOL DIRE, in pratica:
     · l'isolamento e quello del browser: origine + profilo del browser + utente
       del sistema. Non e nostro, e non lo controlliamo noi.
     · DUE PERSONE SULLO STESSO PROFILO DELLO STESSO BROWSER CONDIVIDONO LO
       STESSO SENTIERO. Non c'e niente qui dentro che lo impedisca o lo avvisi.
     · due profili, due dispositivi o due domini diversi restano separati per
       impostazione predefinita. Possono parlarsi soltanto se la persona attiva
       esplicitamente Dispositivi e completa il pairing cifrato.
     · in incognito lo stato esiste finche la finestra e aperta, poi sparisce.
     · lo storage locale non e cifrato: chi ha accesso al profilo del browser o a
       un backup completo del dispositivo puo leggere anche la chiave Gemini nello
       storage del browser. Il journal remoto opzionale e invece cifrato end-to-end;
       il Backup senza chiave esclude Gemini, quello completo la include soltanto
       dopo conferma esplicita.
     · cancellare i dati del sito cancella tutto, e l'unico recupero e l'export
       che la persona si e fatta da sola.

   COSA NON SI FA, e perche:
     non si aggiungono account personali o profili multipli. La sincronizzazione
     opzionale usa identificatori casuali e token per dispositivo, senza email o
     password; non prova quindi a distinguere persone diverse sullo stesso profilo.
   Difeso da provaChiunque, sezione D2. */
const LS='sentiero-v1';
const LS_PRE_IMPORT='sentiero-pre-import';
const GEMINI_KEY_LS='sentiero-gemini-key';
let GEMINI_KEY='';
try{ GEMINI_KEY=String(localStorage.getItem(GEMINI_KEY_LS)||'').trim(); }catch(_){}
function setGeminiKey(v){
  const voluta=String(v||'').trim().slice(0,500);
  try{
    if(voluta) localStorage.setItem(GEMINI_KEY_LS,voluta); else localStorage.removeItem(GEMINI_KEY_LS);
    const letta=String(localStorage.getItem(GEMINI_KEY_LS)||'').trim();
    GEMINI_KEY=letta;
    return letta===voluta;
  }catch(_){
    try{ GEMINI_KEY=String(localStorage.getItem(GEMINI_KEY_LS)||'').trim(); }catch(__){ GEMINI_KEY=''; }
    return false;
  }
}
/* Gemini — EXPORT SENZA SEGRETI, DI DEFAULT.
   La chiave vive gia fuori da S, quindi esportare o importare dati sullo stesso
   dispositivo NON la tocca. Questo filtro e una seconda cintura di sicurezza:
   se un vecchio backup o una futura migrazione reintroducesse per errore un campo
   chiave nello stato, qualunque JSON di backup che passa da qui lo salta. */
const EXPORT_SECRET_FIELDS=new Set(['apikey','geminikey','sentierochiavegemini','anthropickey','aikey','providerkey']);
function jsonExportSenzaSegreti(value,spazi){
  return JSON.stringify(value,function(k,v){
    const n=String(k||'').toLowerCase().replace(/[^a-z]/g,'');
    return EXPORT_SECRET_FIELDS.has(n)?undefined:v;
  },spazi==null?2:spazi);
}

const DAYS_IT=['L','M','M','G','V','S','D'];
const todayKey=()=>localDayKey(new Date());
/* v272.2 — UNA SOLA GEOMETRIA DELLA VOCE. */
function geometriaVoce(){
  try{ const m=document.getElementById('mic'); if(m){ const r=m.getBoundingClientRect();
    if(r.width>0&&r.height>0) return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,R:r.width/2,ringR:(79/200)*r.width}; } }catch(_){}
  const w=innerWidth||375,h=innerHeight||647,d=Math.min(310,w*.83);
  return {x:w/2,y:h*.30,w:d,h:d,R:d/2,ringR:(79/200)*d};
}
window._geometriaVoce=geometriaVoce;
/* ══ GLI ESEMPI IN QUESTO FILE SONO INVENTATI ════════════════════════════════
   L'ELENCO DICHIARATO, e provaChiunque non ne ammette altri con dentro un numero:
     «10 000 passi» · «Niente schermi dopo le 22:00» · «Fare 300 €»
     «Devo essere in via Roma 1» · «Chiamare il commercialista»
     («—are 300 €» e lo stesso esempio rotto apposta, per mostrare un difetto)
   Nessuno di questi e stato scritto da una persona che usa Sentiero. Servono a spiegare una regola, e vanno tenuti finti.
   La vita vera di chi sviluppa sta nel laboratorio, che non viene distribuito;
   qui dentro non entra - ne come stato di partenza, ne come esempio, ne come
   commento, ne come statistica, ne come coordinata geografica.
   Il banco che difende questo confine e provaChiunque, e dalla v269.1 non cerca
   piu un nome: cerca la vita. */
const defaultState={
  quests:[],diary:[],
  /* v224 — QUI DENTRO C'ERANO LE ABITUDINI DI UNA PERSONA VERA.
     Due voci ricorrenti, sue, finite nello stato di partenza. Chiunque
     installasse Sentiero se le trovava addosso il primo giorno, senza sapere da
     dove venissero ne come toglierle - la × sta nelle impostazioni, in fondo a
     una sezione che al primo giorno non si sa che esiste.
     L'ha scoperto una persona che provava l'app senza nessuno accanto. E
     provaChiunque era verde, perche cercava un NOME, non una VITA: un banco puo
     difendere solo la cosa a cui e stato puntato. Alla v269.1 e stato ripuntato
     sulla vita, e questo file e stato ripulito di conseguenza.
     Adesso si parte vuoti, e la prima domanda la fa l'app. */
  scheduled:[],
  /* v271 — I TRE CAMPI NUOVI. Stanno QUI e nel sanitizzatore: in questo
     progetto e gia successo tre volte che un campo venisse scritto bene e poi
     mangiato al riavvio, e ogni volta la causa era la stessa - il campo c'era
     dappertutto tranne che nel sanitizzatore. */
  unlockRules:[],      /* le regole delle quest sbloccabili */
  unlockDone:{},       /* le occorrenze gia sbloccate: chiave -> giorno */
  promVisti:{},        /* i promemoria a 14 giorni gia visti, per occorrenza */
  paroleGiorno:{},     /* scelta lessicografica di ogni giorno: backup + sync */
  checks:{},streak:0,lastSealed:'',lastDayInit:'',observerNotes:[],obsLines:[],capitoli:[],semi:[],sfide:{},foto:{},riposi:{},votoId:'',questLog:[],desiderio:null,desideri:[],banco:[],frutti:[],mastery:{quest:{},giorni:{},sguardo:[],riv:[]},
  schemaVersion:2,settings:{sound:true,voice:false,notif:false,uiTheme:'classico'}
};
let S=load();
function safeGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function load(){
  const txt=safeGet(LS);
  let raw=null, fromBak=false;
  if(txt!=null){
    try{ raw=JSON.parse(txt); }
    catch(_){ try{ localStorage.setItem(LS+'-corrupt-'+Date.now(), txt.slice(0,400000)); }catch(__){} raw=null; }   /* illeggibile: conserva una copia, non perderlo in silenzio */
  }
  if(raw===null){                                            /* principale assente o rotto → prova il backup */
    const bak=safeGet(LS+'-bak');
    if(bak!=null){ try{ raw=JSON.parse(bak); fromBak=true; }catch(_){ raw=null; } }
  }
  /* Gemini — terza rete: prima di ogni import conserviamo lo stato
     precedente. Se sia il principale sia il backup automatico sono illeggibili,
     questa fotografia e l'ultimo posto sensato da cui ripartire. */
  if(raw===null){
    const pre=safeGet(LS_PRE_IMPORT);
    if(pre!=null){ try{ raw=JSON.parse(pre); fromBak=true; }catch(_){ raw=null; } }
  }
  /* v252: il registro adesso vive per conto suo. Chi aggiorna da una versione
     vecchia ce l'ha ancora dentro lo stato: lo si prende di li quella volta, e
     da allora in poi sta nella sua chiave. Nessuno perde niente. */
  try{
    const rt=safeGet(LS_REG);
    if(rt!=null){ const ra=JSON.parse(rt); if(Array.isArray(ra)) (raw||(raw={})).registro=ra; }
  }catch(_){}
  /* v273 — migrazione prima del sanitizzatore: la fotografia conserva il JSON
     originale e gli identificatori stabili nascono prima che lo stato venga
     ricostruito. La migrazione e idempotente e la chiave Gemini resta fuori. */
  try{
    if(raw){
      if(Number(raw.schemaVersion||0)<2&&!safeGet('sentiero-pre-migration-v2'))
        localStorage.setItem('sentiero-pre-migration-v2',JSON.stringify({schema:Number(raw.schemaVersion)||0,at:new Date().toISOString(),state:raw}));
      if(window.SentieroSync) window.SentieroSync.ensureEntityIds(raw);
    }
  }catch(_){}
  const st=sanitizeState(raw||{},defaultState);
  if(txt!=null&&raw!=null&&!fromBak){ try{ localStorage.setItem(LS+'-bak',txt); }catch(_){} }   /* avvio pulito: backup = ultimo stato buono */
  if(fromBak) setTimeout(()=>{ try{ toast('Dati ripristinati da un backup recente'); }catch(_){} },900);
  else if(txt!=null&&raw===null) setTimeout(()=>{ try{ toast('Salvataggio illeggibile: ripartito pulito, copia di emergenza conservata'); }catch(_){} },900);
  return st;
}
/* ══════════════════════════════════════════════════════════════════════════
   IL SALVATAGGIO (v252) — misurato prima di toccarlo.

   Uno stato pieno, serializzato, pesa piu di duecentomila byte. save() lo riscriveva
   TUTTO, e nel file ci sono novantasette punti che lo chiamano: spuntare una
   cosa, cambiare un'impostazione, ogni riga che nasce. Ogni chiamata e una
   serializzazione sincrona di duecentomila caratteri piu una scrittura su disco,
   sul filo principale, cioe mentre il dito e sullo schermo e il microfono e
   aperto. Non e un difetto che si vede: e un'app che «va a scatti».

   Due correzioni, e la prima vale piu della seconda.

   1 · IL REGISTRO SE NE VA PER CONTO SUO. Il registro del cantiere - la
   diagnostica, quella che serve a chi ripara - e il 39% di quel peso: 81.000
   byte su 204.000. Non e roba di chi usa l'app, e non ha nessun motivo di
   essere riscritto insieme al diario ogni volta che si spunta qualcosa. Adesso
   vive in una chiave sua e si posa con calma. Il diario, da solo, pesa il 40%
   in meno: ogni salvataggio costa quasi la meta.

   2 · CENTO SALVATAGGI DI FILA DIVENTANO UNO. Chi chiama save() dice «questo va
   salvato», non «scrivi adesso sul disco». Si segna che c'e da salvare e si
   scrive una volta sola, poco dopo. Chi chiama non cambia di una riga.

   E LA COSA CHE NON SI PUO SBAGLIARE: niente di tutto questo puo costare un
   dato. Prima di sparire - schermo spento, app messa via, scheda chiusa - si
   scrive SUBITO e in modo sincrono. E i momenti che contano davvero - una voce
   che entra nel diario - chiamano salvaSubito() e non aspettano nessuno. */
const LS_REG='sentiero-registro-v1';
let _daSalvare=false,_salvaT=null;

function _scriviStato(){
  /* il registro non entra qui: ha la sua chiave e il suo tempo */
  const reg=S.registro; let ok=false;
  try{ S.registro=undefined; localStorage.setItem(LS,JSON.stringify(S)); ok=true; }
  catch(_){
    try{
      if(pruneForSpace(S)){ localStorage.setItem(LS,JSON.stringify(S)); ok=true;
        toast('Spazio recuperato: vecchi trascritti alleggeriti'); }
    }catch(__){}
    if(!ok) toast('Memoria piena o navigazione privata: dati non salvati');
  }
  finally{ S.registro=reg; }
  if(ok){ try{ if(window.SentieroSync) window.SentieroSync.capture(S); }catch(_){} }
  return ok;
}

function _scriviRegistro(){
  try{ localStorage.setItem(LS_REG,JSON.stringify(S.registro||[])); }catch(_){}
}

function salvaSubito(){
  if(_salvaT){ clearTimeout(_salvaT); _salvaT=null; }
  _daSalvare=false;
  const ok=_scriviStato();
  _scriviRegistro();
  return ok;
}

function save(){
  _daSalvare=true;
  if(_salvaT) return;
  _salvaT=setTimeout(function(){
    _salvaT=null;
    if(!_daSalvare) return;
    _daSalvare=false;
    _scriviStato();
  },140);
}

/* il registro si posa da solo, molto piu di rado: e diagnostica, non memoria */
setInterval(function(){ try{ if(!document.hidden) _scriviRegistro(); }catch(_){} },30000);

/* PRIMA DI SPARIRE, SEMPRE E SUBITO. Sono i tre modi in cui iOS porta via
   un'app: lo swipe, lo schermo che si spegne, la scheda che si chiude. */
try{
  window.addEventListener('pagehide',function(){ try{ salvaSubito(); }catch(_){} try{ if(window._settleTodayMotion) window._settleTodayMotion('pagehide'); }catch(_){} });
  window.addEventListener('beforeunload',function(){ try{ salvaSubito(); }catch(_){} });
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ try{ salvaSubito(); }catch(_){} }
  });
}catch(_){}
const uid=coreUid;
/* La ceralacca vive nel CSS, ma una tela non legge le variabili CSS: gliela si
   passa a mano. Letta UNA volta sola - a ogni frame sarebbe un getComputedStyle
   per frame - e con la sua stessa scorta, nel caso la variabile sparisca. */
const CERALACCA=(function(){ try{
  return (getComputedStyle(document.documentElement).getPropertyValue('--ceralacca')||'').trim()||'#B9402E';
}catch(_){ return '#B9402E'; } })();
const $=s=>document.querySelector(s);
function toast(m){ const t=$('#toast');
  clearTimeout(toast._t); clearTimeout(toast._t2);
  t.classList.remove('via'); t.classList.remove('show');
  t.innerHTML='';
  String(m).split(' ').forEach((w,i)=>{ const s=document.createElement('span'); s.className='tw';
    s.textContent=w; s.style.animationDelay=(70+i*32)+'ms'; t.appendChild(s);
    t.appendChild(document.createTextNode(' ')); });
  void t.offsetWidth;   /* riavvia la coreografia anche su toast consecutivi */
  t.classList.add('show');
  toast._t=setTimeout(()=>{ t.classList.remove('show'); t.classList.add('via'); },2600);
  toast._t2=setTimeout(()=>{ t.classList.remove('via'); },2950);
}
/* v176 (Fase 7): un'azione distruttiva non puo essere immediata e silenziosa.
   Il toast puo portare con se un annullamento, e dura il doppio: il tempo di accorgersene. */
function toastAnnulla(m,eti,fn){
  toast(m);
  const t=$('#toast'); if(!t) return;
  const b=document.createElement('button');
  b.className='toast-annulla'; b.textContent=eti||'Annulla';
  b.onclick=(e)=>{ e.stopPropagation();
    clearTimeout(toast._t); clearTimeout(toast._t2);
    t.classList.remove('show'); t.classList.add('via');
    setTimeout(()=>{ try{ t.classList.remove('via'); }catch(_){} },340);
    try{ fn(); }catch(_){}
  };
  t.appendChild(b);
  clearTimeout(toast._t); clearTimeout(toast._t2);
  toast._t=setTimeout(()=>{ t.classList.remove('show'); t.classList.add('via'); },5200);
  toast._t2=setTimeout(()=>{ t.classList.remove('via'); },5550);
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ======================================================================
   AUDIO — mai un crash per un suono: ogni via è protetta
   ====================================================================== */
let AC=null,BUS=null,NOISEBUF=null;
function sharedAC(){   /* UN solo AudioContext per tutti i motori: iOS ne tollera pochissimi, più contesti = silenzi intermittenti */
  try{
    if(!AC){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; AC=new C(); }
    if(AC.state==='suspended') AC.resume();
    return AC;
  }catch(_){ return null; }
}
function ac(){
  if(!S.settings.sound && !S.settings.music) return null;
  try{
    if(!sharedAC()) return null;
    if(AC.state==='suspended') AC.resume();
    if(!BUS){
      /* compressore master: le combo accavallano molti suoni, qui non distorcono mai */
      BUS=AC.createDynamicsCompressor();
      BUS.threshold.value=-18; BUS.knee.value=12; BUS.ratio.value=6;
      BUS.attack.value=0.002; BUS.release.value=0.12;
      const out=AC.createGain(); out.gain.value=0.9;
      BUS.connect(out); out.connect(AC.destination);
    }
    return AC;
  }catch(_){ return null; }
}
function tone(f,t0,dur,type,g,slide,vib){
  try{
    const a=ac(); if(!a) return;
    type=type||'sine'; g=g||0.16;
    const o=a.createOscillator(),v=a.createGain(),T=a.currentTime+t0;
    o.type=type; o.frequency.setValueAtTime(f,T);
    if(slide) o.frequency.exponentialRampToValueAtTime(slide,T+dur);
    if(vib){ /* vibrato per le note tenute della fanfara */
      const l=a.createOscillator(),lg=a.createGain();
      l.frequency.value=6; lg.gain.value=f*0.012;
      l.connect(lg); lg.connect(o.frequency);
      l.start(T); l.stop(T+dur+0.05);
    }
    v.gain.setValueAtTime(0.0001,T);
    v.gain.exponentialRampToValueAtTime(g,T+0.012);
    v.gain.exponentialRampToValueAtTime(0.0001,T+dur);
    o.connect(v); v.connect(BUS);
    o.start(T); o.stop(T+dur+0.05);
  }catch(_){}
}
function noiseHit(t0,dur,g,freq,q){
  /* percussioni e scintille: rumore bianco filtrato, da sala giochi */
  try{
    const a=ac(); if(!a) return;
    if(!NOISEBUF){
      NOISEBUF=a.createBuffer(1,a.sampleRate*0.5,a.sampleRate);
      const d=NOISEBUF.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    }
    const T=a.currentTime+t0;
    const src=a.createBufferSource(); src.buffer=NOISEBUF;
    const f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq||1800; f.Q.value=q||1.2;
    const v=a.createGain();
    v.gain.setValueAtTime(0.0001,T);
    v.gain.exponentialRampToValueAtTime(g||0.18,T+0.005);
    v.gain.exponentialRampToValueAtTime(0.0001,T+dur);
    src.connect(f); f.connect(v); v.connect(BUS);
    src.start(T); src.stop(T+dur+0.05);
  }catch(_){}
}

/* ---------- due temi sonori: arcade (default) e zen ---------- */
const PENTA=[293.66,329.63,369.99,440,493.88,587.33,659.25,739.99];
/* scala maggiore di Sol, la scala delle sale giochi felici */
const LADDER=[392,493.88,587.33,659.25,783.99,987.77,1174.66,1567.98];
const SEMI=s=>Math.pow(2,s/12);

const THEMES={
  arcade:{
    micOn(){ /* power-up: arpeggio quadro che sale */
      [261.63,329.63,392,523.25].forEach((f,i)=>tone(f,i*0.055,0.09,'square',0.10));
      noiseHit(0.22,0.06,0.07,5000,2);
    },
    micOff(){ /* pausa: due blip discendenti */
      tone(523.25,0,0.07,'square',0.10);
      tone(392,0.08,0.12,'square',0.09);
    },
    appear(i){ /* coin: ogni quest nasce con la sua monetina, intonata diversa */
      const k=SEMI((i%4)*2);
      tone(987.77*k,0,0.07,'square',0.11);
      tone(1318.51*k,0.07,0.22,'square',0.11);
    },
    check(combo){ /* pop + arpeggio che cresce col combo */
      const n=Math.min(combo,6);
      noiseHit(0,0.045,0.16,1900,1.5); /* pop secco */
      for(let i=0;i<n;i++) tone(LADDER[Math.min(i,7)],0.03+i*0.06,0.14,'square',0.11);
      if(n>=3) tone(LADDER[Math.min(n,7)]*2,0.03+n*0.06,0.2,'square',0.09); /* ottava finale */
      if(n>=4){ noiseHit(0.05+n*0.06,0.10,0.07,6500,3); noiseHit(0.12+n*0.06,0.10,0.05,8000,3); } /* scintille */
      if(n>=6){ [1567.98,1975.53].forEach((f,i)=>tone(f,0.1+n*0.06+i*0.05,0.16,'triangle',0.08)); }
    },
    undo(){ tone(329.63,0,0.12,'square',0.07,220); },
    seal(){ /* fanfara di fine livello: ta ta ta taa-TAA */
      const mel=[[523.25,0,0.10],[523.25,0.12,0.10],[523.25,0.24,0.10],[659.25,0.36,0.16],[783.99,0.54,0.16],[1046.5,0.72,0.7]];
      mel.forEach(([f,t,d],i)=>{
        const last=i===mel.length-1;
        tone(f,t,d,'square',0.12,0,last);
        tone(f*0.5,t,d,'triangle',0.08); /* corpo sotto */
        tone(f*SEMI(0.08),t,d,'square',0.05); /* detune: spessore */
      });
      noiseHit(0.72,0.45,0.12,7000,0.8); /* crash finale */
    }
  },
  zen:{
    micOn(){ tone(196,0,0.6,'sine',0.12,392); },
    micOff(){ tone(392,0,0.18,'sine',0.12); tone(294,0.13,0.32,'sine',0.10); },
    appear(i){ tone(PENTA[i%5+2],0,0.22,'triangle',0.14); },
    check(combo){ const n=Math.min(combo,6); for(let i=0;i<n;i++) tone(PENTA[Math.min(i+1,7)],i*0.07,0.2,'triangle',0.15); },
    undo(){ tone(330,0,0.15,'sine',0.08,260); },
    seal(){ tone(98,0,2.6,'sine',0.3); tone(147,0.02,2.3,'sine',0.14); tone(196,0.04,2.0,'sine',0.08); tone(294,0.06,1.4,'sine',0.05); }
  }
};
function sfx(name,arg){ if(S.settings.music) return; try{ (THEMES[S.settings.theme]||THEMES.arcade)[name](arg); }catch(_){} }
const sMicOn =()=>sfx('micOn');
const sMicOff=()=>sfx('micOff');
const sAppear=i=>sfx('appear',i);
const sCheck =c=>sfx('check',c);
const sUndo  =()=>sfx('undo');
const sGong  =()=>sfx('seal');

/* ======================================================================
   COLONNA SONORA ADATTIVA — musica generativa originale.
   Ispirazione: l'intensità musicale sale col numero di sfide (stile Budokai).
   Più quest restano → più strati, tempo e brillantezza. A zero → silenzio.
   Un solo brano flessibile, sintetizzato in tempo reale: nessun file, nessun copyright.
   ====================================================================== */
const MUSIC=(()=>{
  /* ====================================================================
     Motore orchestrale generativo. Timbri caldi (onde su misura, inviluppi
     ADSR morbidi, vibrato), armonia ricca, melodia composta. La minore.
     Ispirazione: l'opera sinfonica dei JRPG fatta al computer.
     ==================================================================== */
  const NOTE={C:0,'C#':1,'Db':1,D:2,'D#':3,'Eb':3,E:4,F:5,'F#':6,'Gb':6,G:7,'G#':8,'Ab':8,A:9,'A#':10,'Bb':10,B:11};
  function f(name,oct){ const semi=NOTE[name]; return 440*Math.pow(2,(semi+(oct-4)*12-9)/12); }
  /* DNA: Sol minore/dorico, 128 BPM. Progressione Active a 16 battute (loop di lavoro).
     L'Idle la voce in modo rarefatto; stessa tonalità → moduli compatibili e sovrapponibili. */
  const CHORDS=[
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['A',4]]},   /*  1 Gm(add9) */
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['G',4]]},   /*  2 Gm */
    {root:'F', oct:2, pad:[['F',3],['A',3],['C',4],['D',4]]},    /*  3 F(add9) */
    {root:'F', oct:2, pad:[['F',3],['A',3],['C',4],['G',4]]},    /*  4 F */
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['A',4]]},   /*  5 Gm */
    {root:'F', oct:2, pad:[['F',3],['A',3],['C',4],['D',4]]},    /*  6 F */
    {root:'Eb',oct:2, pad:[['Eb',3],['G',3],['Bb',3],['D',4]]},  /*  7 Ebmaj7 */
    {root:'D', oct:2, pad:[['D',3],['A',3],['D',4],['F#',4]]},   /*  8 D */
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['A',4]]},   /*  9 Gm */
    {root:'F', oct:2, pad:[['F',3],['A',3],['C',4],['D',4]]},    /* 10 F */
    {root:'D', oct:2, pad:[['D',3],['F',3],['A',3],['D',4]]},    /* 11 Dm */
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['G',4]]},   /* 12 Gm */
    {root:'F', oct:2, pad:[['F',3],['A',3],['C',4],['D',4]]},    /* 13 F */
    {root:'Eb',oct:2, pad:[['Eb',3],['G',3],['Bb',3],['D',4]]},  /* 14 Ebmaj7 */
    {root:'D', oct:2, pad:[['D',3],['A',3],['D',4],['F#',4]]},   /* 15 Dsus-D */
    {root:'G', oct:2, pad:[['G',3],['Bb',3],['D',4],['A',4]]}    /* 16 Gm (→ loop) */
  ];
  const NBARS=16, NSTEP=NBARS*16;
  /* TEMA MADRE (approvato): G–Bb–D–Eb–D–C–G. Versione Active ritmica (hook ogni 4 battute) */
  const MOTHER=[
    [0,'G',4,2],[2,'Bb',4,2],[4,'D',5,4],[8,'Eb',5,4],
    [16,'D',5,2],[18,'C',5,2],[20,'G',4,4]
  ];
  /* Idle: rarefatto, note lunghe e distanziate */
  const MOTHER_IDLE=[
    [0,'G',4,16],[32,'Bb',4,8],[40,'D',5,8],[64,'Eb',5,16],[96,'D',5,8],[104,'C',5,8],
    [128,'G',4,16],[192,'Eb',5,16]
  ];
  /* pluck Idle: una nota ogni 4 battute (notifica lontana) */
  const PLUCK_IDLE=[[16,'G',5],[80,'D',5],[144,'Bb',4],[208,'G',5]];
  /* BASSO OSTINATO Active: 8 ottavi per battuta, nota per nota (da blueprint) */
  const BASS_OST=[
    ['G2','G2','G2','G2','G2','G2','G2','G2'],
    ['G2','G2','G2','G2','Bb2','Bb2','A2','A2'],
    ['F2','F2','F2','F2','F2','F2','F2','F2'],
    ['F2','F2','A2','A2','C3','C3','A2','A2'],
    ['G2','G2','G2','G2','D3','D3','Bb2','Bb2'],
    ['F2','F2','F2','F2','C3','C3','A2','A2'],
    ['Eb2','Eb2','Eb2','Eb2','Bb2','Bb2','G2','G2'],
    ['D2','D2','D2','D2','A2','A2','D3','D3'],
    ['G2','G2','G2','G2','G2','G2','G2','G2'],
    ['F2','F2','F2','F2','C3','C3','A2','A2'],
    ['D2','D2','D2','D2','F2','F2','A2','A2'],
    ['G2','G2','G2','G2','D3','D3','Bb2','Bb2'],
    ['F2','F2','F2','F2','C3','C3','A2','A2'],
    ['Eb2','Eb2','Eb2','Eb2','Bb2','Bb2','G2','G2'],
    ['D2','D2','D2','D2','A2','A2','D3','D3'],
    ['G2','G2','G2','G2','G2','G2','G2','G2']
  ];
  /* batteria Active: kick O----O-O----O- · snare ----O-------O--- · HH ottavi */
  const KICKP =[1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0];
  const SNAREP=[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
  const noteName=(nm)=>{ const m=nm.match(/^([A-G][#b]?)(\d)$/); return f(m[1],parseInt(m[2])); };

  let running=false,timer=null,step=0,nextT=0,cycle=0;
  let gain=null,filter=null,reactGain=null,percBus=null,master=null,reverb=null,duckGain=null,pump=null;
  let gtrBus=null,gtrDist=null; /* bus chitarra distorta */
  let intensity=0,target=0,over=0,targetOver=0;
  let unlocked=false, recDuckOn=false;
  let W_STR=null,W_FLUTE=null,W_HORN=null;
  const LOOK=0.14,TICK=25;
  function bpm(){ return 128; }   /* 128 fisso: l'Idle pare half-time per la rarefazione, non per il tempo */
  function stepDur(){ return 60/bpm()/4; }

  function mkWave(a,amps){
    const n=amps.length+1, real=new Float32Array(n), imag=new Float32Array(n);
    for(let i=1;i<n;i++) imag[i]=amps[i-1];
    return a.createPeriodicWave(real,imag,{disableNormalization:false});
  }
  function setup(){
    const a=ac(); if(!a) return null;
    if(!NOISEBUF){ try{ NOISEBUF=a.createBuffer(1,Math.floor(a.sampleRate*0.5),a.sampleRate); const d=NOISEBUF.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }catch(_){} }
    if(!gain){
      /* onde su misura: spettri caldi e controllati invece di saw/square grezzi */
      try{
        W_STR=mkWave(a,[1,0.6,0.42,0.3,0.22,0.16,0.12,0.09,0.06,0.04]);   /* archi/ensemble caldo */
        W_FLUTE=mkWave(a,[1,0.16,0.06,0.02]);                              /* flauto/voce, dolce */
        W_HORN=mkWave(a,[1,0.5,0.3,0.16,0.09,0.05]);                      /* corno morbido */
      }catch(_){ W_STR=W_FLUTE=W_HORN=null; }
      /* duck finale (per la registrazione) → BUS */
      duckGain=a.createGain(); duckGain.gain.value=1; duckGain.connect(BUS||a.destination);
      /* master con saturazione gentile */
      master=a.createGain();
      try{ const sh=a.createWaveShaper(); const n=1024,c=new Float32Array(n); for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(x*1.1);} sh.curve=c; sh.oversample='2x'; master.connect(sh); sh.connect(duckGain); }
      catch(_){ master.connect(duckGain); }
      /* riverbero lungo e caldo */
      try{
        reverb=a.createConvolver();
        const len=Math.floor(a.sampleRate*2.6); const ir=a.createBuffer(2,len,a.sampleRate);
        for(let ch=0;ch<2;ch++){ const d=ir.getChannelData(ch); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2); }
        reverb.buffer=ir; const vr=a.createGain(); vr.gain.value=0.62; reverb.connect(vr); vr.connect(master);
      }catch(_){ reverb=null; }
      /* catena melodica: filtro caldo → intensità → pompaggio leggero → master */
      filter=a.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=900; filter.Q.value=0.4;
      gain=a.createGain(); gain.gain.value=0;
      pump=a.createGain(); pump.gain.value=1;
      filter.connect(gain); gain.connect(pump); pump.connect(master);
      if(reverb){ const bs=a.createGain(); bs.gain.value=0.34; gain.connect(bs); bs.connect(reverb); }
      percBus=a.createGain(); percBus.gain.value=0.9; percBus.connect(master);
      if(reverb){ const ps=a.createGain(); ps.gain.value=0.16; percBus.connect(ps); ps.connect(reverb); }
      reactGain=a.createGain(); reactGain.gain.value=1; reactGain.connect(master);
      if(reverb){ const rs=a.createGain(); rs.gain.value=0.4; reactGain.connect(rs); rs.connect(reverb); }
      /* BUS CHITARRA DISTORTA: distorsione dura + filtro "cassa" → power chord ringhianti (anima Budokai) */
      gtrBus=a.createGain(); gtrBus.gain.value=0.9;
      try{
        gtrDist=a.createWaveShaper();
        const n=2048,c=new Float32Array(n),k=14; /* curva di distorsione dura */
        for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=(1+k)*x/(1+k*Math.abs(x)); }
        gtrDist.curve=c; gtrDist.oversample='4x';
        const cab=a.createBiquadFilter(); cab.type='lowpass'; cab.frequency.value=3000; cab.Q.value=0.7; /* simulazione cassa */
        const hp=a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=90;
        gtrBus.connect(gtrDist); gtrDist.connect(cab); cab.connect(hp); hp.connect(master);
      }catch(_){ gtrDist=null; gtrBus.connect(master); }
    }
    return a;
  }
  /* CHITARRA ELETTRICA: saw nel bus distorto. Power chord = fondamentale + quinta + ottava. */
  function gtr(freq,t,dur,vol){
    const a=ac(); if(!a||!gtrBus) return;
    const o=a.createOscillator(),g=a.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(Math.max(0.001,vol),t+0.005);
    g.gain.setValueAtTime(Math.max(0.001,vol),t+dur*0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(gtrBus); o.start(t); o.stop(t+dur+0.02);
  }
  function powerChord(root,t,dur,vol){ gtr(root,t,dur,vol); gtr(root*1.4983,t,dur,vol*0.85); gtr(root*2,t,dur,vol*0.6); } /* root + quinta + ottava */
  /* RULLANTE rock sul battere 2 e 4 */
  function snare(t,vol){
    const a=ac(); if(!a) return;
    if(NOISEBUF){ const s=a.createBufferSource(); s.buffer=NOISEBUF; const hp=a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800; const g=a.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.13); s.connect(hp); hp.connect(g); g.connect(percBus); s.start(t); s.stop(t+0.15); }
    const o=a.createOscillator(),g2=a.createGain(); o.type='triangle'; o.frequency.setValueAtTime(220,t); g2.gain.setValueAtTime(vol*0.5,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.09); o.connect(g2); g2.connect(percBus); o.start(t); o.stop(t+0.1);
  }

  /* voce con inviluppo ADSR morbido, vibrato e filtro opzionali — il cuore del calore */
  function note(wave,freq,t,dur,vol,o){
    o=o||{}; const a=ac(); if(!a) return;
    const osc=a.createOscillator();
    if(wave&&typeof wave==='object'){ try{osc.setPeriodicWave(wave);}catch(_){osc.type='triangle';} } else osc.type=wave||'triangle';
    osc.frequency.setValueAtTime(freq,t);
    const g=a.createGain();
    const A=o.a!=null?o.a:0.05, D=o.d!=null?o.d:0.12, S=o.s!=null?o.s:0.72, R=o.r!=null?o.r:0.28;
    const peak=Math.max(0.0008,vol), sus=Math.max(0.0006,vol*S);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(peak,t+A);
    g.gain.exponentialRampToValueAtTime(sus,t+A+D);
    const rel=t+Math.max(A+D,dur);
    g.gain.setValueAtTime(sus,rel);
    g.gain.exponentialRampToValueAtTime(0.0001,rel+R);
    osc.connect(g);
    if(o.vib){ try{ const lfo=a.createOscillator(),lg=a.createGain(); lfo.frequency.value=o.vibRate||5; lg.gain.value=o.vib; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(rel+R+0.05);}catch(_){} }
    let out=g;
    if(o.lp){ const fl=a.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=o.lp; fl.Q.value=o.q||0.4; g.connect(fl); out=fl; }
    out.connect(o.dest||filter);
    osc.start(t); osc.stop(rel+R+0.06);
  }
  /* campana/arpa via FM — luccichio caldo (celesta) per arpeggi e reazioni */
  function bell(freq,t,dur,vol,dest){
    const a=ac(); if(!a) return;
    const car=a.createOscillator(),mod=a.createOscillator(),mg=a.createGain(),g=a.createGain();
    car.type='sine'; mod.type='sine'; mod.frequency.setValueAtTime(freq*3.01,t);
    mg.gain.setValueAtTime(freq*1.6,t); mg.gain.exponentialRampToValueAtTime(0.001,t+dur*0.7);
    mod.connect(mg); mg.connect(car.frequency); car.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(Math.max(0.001,vol),t+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    car.connect(g); g.connect(dest||filter);
    car.start(t); mod.start(t); car.stop(t+dur+0.05); mod.stop(t+dur+0.05);
  }
  function strings(freq,t,dur,vol){ note(W_STR||'sawtooth',freq,t,dur,vol,{a:0.22,d:0.2,s:0.85,r:0.7,vib:2.6,vibRate:4,lp:2100}); }
  /* ARCHI CINEMATOGRAFICI in tremolo: re-articolati veloci → tensione drammatica che cresce */
  
  
  /* OTTONI: corno pieno + ottava di rinforzo per gli stab eroici */
  function horn(freq,t,dur,vol){ note(W_HORN||'sawtooth',freq,t,dur,vol,{a:0.06,d:0.12,s:0.82,r:0.28,vib:2,vibRate:4.5,lp:2600}); }
  function brassStab(freq,t,dur,vol){ horn(freq,t,dur,vol); note(W_HORN||'sawtooth',freq*2,t,dur,vol*0.4,{a:0.04,d:0.1,s:0.7,r:0.2,lp:3000}); }
  /* SYNTH ATMOSFERICO: pad largo e detunato, lento, evolve — il respiro sotto a tutto */
  function synthPad(freq,t,dur,vol){ note(W_STR||'sawtooth',freq,t,dur,vol,{a:0.6,d:0.4,s:0.9,r:1.0,lp:1400}); note(W_STR||'sawtooth',freq*1.005,t,dur,vol*0.7,{a:0.7,d:0.4,s:0.9,r:1.0,lp:1200}); }
  function bassNote(freq,t,dur,vol){ note('sine',freq,t,dur,vol,{a:0.02,d:0.14,s:0.7,r:0.2,lp:520}); note(W_STR||'triangle',freq,t,dur,vol*0.3,{a:0.03,d:0.12,s:0.6,r:0.18,lp:380}); }
  /* RULLO DI TIMPANI (percussione orchestrale): crescendo che sfocia in un colpo — il dramma che monta */
  function timpaniRoll(t,dur,freq,vol){ const a=ac(); if(!a) return; const n=Math.max(3,Math.floor(dur/0.06)); for(let i=0;i<n;i++){ taiko(t+i*0.06, freq, vol*(0.3+i/n*0.7)); } }
  /* PLUCK digitale leggero (Idle): attacco rapido, decadimento corto, filtrato — una notifica lontana */
  

  function kick(t){
    const a=ac(); if(!a) return;
    try{ pump.gain.cancelScheduledValues(t); pump.gain.setValueAtTime(0.7,t); pump.gain.linearRampToValueAtTime(1,t+0.18); }catch(_){}
    const o=a.createOscillator(),g=a.createGain();
    o.type='sine'; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(46,t+0.13);
    g.gain.setValueAtTime(0.85,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    o.connect(g); g.connect(percBus); o.start(t); o.stop(t+0.2);
  }
  function taiko(t,freq,vol){
    const a=ac(); if(!a) return;
    const o=a.createOscillator(),g=a.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(freq*2.2,t); o.frequency.exponentialRampToValueAtTime(freq,t+0.07);
    g.gain.setValueAtTime(Math.max(0.001,vol),t); g.gain.exponentialRampToValueAtTime(0.001,t+0.42);
    o.connect(g); g.connect(percBus); o.start(t); o.stop(t+0.46);
    if(NOISEBUF){ const s=a.createBufferSource(); s.buffer=NOISEBUF; const fl=a.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=380; const g2=a.createGain(); g2.gain.setValueAtTime(vol*0.4,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.13); s.connect(fl); fl.connect(g2); g2.connect(percBus); s.start(t); s.stop(t+0.15); }
  }
  function cymbalSwell(t,dur,vol){
    const a=ac(); if(!a||!NOISEBUF) return;
    const s=a.createBufferSource(); s.buffer=NOISEBUF; s.loop=true;
    const fl=a.createBiquadFilter(); fl.type='highpass'; fl.frequency.value=5000;
    const g=a.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+dur*0.8); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.connect(fl); fl.connect(g); g.connect(percBus); s.start(t); s.stop(t+dur+0.05);
  }
  function hat(t,vol){ const a=ac(); if(!a||!NOISEBUF) return; const s=a.createBufferSource(); s.buffer=NOISEBUF; const fl=a.createBiquadFilter(); fl.type='highpass'; fl.frequency.value=8500; const g=a.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.025); s.connect(fl); fl.connect(g); g.connect(percBus); s.start(t); s.stop(t+0.04); }

  /* ── RIFF MADRE pesante (stile Sabbath, originale): incede greve, non corre.
        Pedale su Sol; lo stab-risposta scende G→F→Eb→D. ── */
  const RIFF_HITS=[0,4,7,10,12,15];                    /* step in cui la chitarra MORDE (power chord) */
  const RIFF_RESP=[0,0,0,5, 0,5,3,2, 0,0,3,2, 5,3,2,0];/* per battuta: 0=G,5=F,3=Eb,2=D (semitoni sotto G) sullo stab */
  const RESP_STEP=10;                                  /* lo stab-risposta cade qui */
  function schedStep(s,t){
    const bar=Math.floor(s/16)%NBARS, b=s%16, I=intensity, O=over;
    const G=f('G',1);                                  /* pedale grave: il passo che pesa */
    const respDeg=RIFF_RESP[bar];
    const respHz=f('G',1)*Math.pow(2,respDeg/12);
    try{ filter.frequency.setTargetAtTime(900+I*2600+O*1000,t,0.05); }catch(_){}

    /* ════ Idle minimale finché non ci sono quest (sotto 0.3): solo un alone, niente fantasy ════ */
    if(I<0.3){
      if(b===0){ synthPad(f('G',3),t,stepDur()*16,0.03); note('sine',G,t,stepDur()*15,0.1,{a:0.05,d:0.3,s:0.6,r:0.4,lp:300}); }
      if(I<0.28 && (b===0||b===8)){ note('sine',G,t,0.5,0.05,{a:0.04,d:0.2,s:0.3,r:0.2,lp:280}); }
      return;
    }

    /* ════ ACTIVE: drums + bass + guitar che stanno in piedi da soli ════ */
    /* BATTERIA secca: cassa incollata agli stab, rullante sul 2 e 4, hi-hat in ottavi */
    if(b===0||b===4||b===7||b===10||b===12||b===15) kick(t);   /* aggancia il riff */
    if(b===4||b===12) snare(t,0.26+I*0.12);                     /* backbeat aggressivo */
    if(b%2===0) hat(t,0.02+I*0.025);                            /* ottavi */
    if(bar>=8 && b%2===1) hat(t,0.012);                         /* sezione B: sedicesimi */
    if(b===0 && bar%4===0) cymbalSwell(t,stepDur()*1.5,0.05);   /* crash a inizio frase */

    /* BASSO ostinato saturo, raddoppia il riff sul pedale, segue la risposta */
    const bassHits=[0,2,3,4,7,10,12,14,15];
    if(bassHits.indexOf(b)>=0){
      const hz = (b===RESP_STEP)? respHz/2 : G;                 /* sullo stab-risposta scende */
      bassNote(hz, t, stepDur()*1.6, 0.18+I*0.05);
    }

    /* CHITARRA palm-muted + power chord: il riff madre.
       MORDE (power chord lasciato suonare) sugli accenti; chug corti tra gli accenti. */
    const isHit = (b===0||b===4||b===12||b===RESP_STEP||b===15);
    if(isHit){
      const hz = (b===RESP_STEP)? respHz : G;                   /* lo stab-risposta scende G→F→Eb→D */
      powerChord(hz, t, stepDur()*(b===RESP_STEP?2.2:1.6), 0.09+I*0.05);   /* morde */
    } else if(b%1===0 && (b===1||b===2||b===5||b===6||b===8||b===13||b===14)){
      gtr(G, t, stepDur()*0.5, 0.06+I*0.04);                    /* chug palm-muted strettissimo su G */
      gtr(G*1.4983, t, stepDur()*0.5, 0.04+I*0.03);
    }

    /* ARP synth filtrato, SOLO supporto, basso nel mix */
    if(I>0.4 && b%2===1){ note(W_STR||'sawtooth', f('G',4)*Math.pow(2,([0,3,7,10][(s/2|0)%4])/12), t, stepDur()*0.9, 0.014+I*0.02, {a:0.004,d:0.05,s:0.25,r:0.06,lp:1400+I*2200,dest:filter}); }

    /* LEAD HOOK aggressivo (2 battute, ogni 4): entra nella pausa, distorto. D–Eb–D · Bb–G–D */
    if(I>0.5){
      const ph=s%64;
      const hook=[[8,'D',5,2],[11,'Eb',5,1],[12,'D',5,3],[24,'Bb',4,2],[28,'D',5,3]];
      for(const [st,nm,oc,du] of hook){ if(st===ph){ const lf=f(nm,oc); gtr(lf,t,stepDur()*du*0.9,0.07+I*0.04); gtr(lf*2,t,stepDur()*du*0.85,0.03); } }
    }

    /* OVERDRIVE: doppia cassa, più furia (resta pesante) */
    if(O>0.05){
      if(b%2===1) kick(t);
      if(O>0.4&&(b===4||b===12)) snare(t,0.28+O*0.12);
    }
  }

  function scheduler(){
    const a=ac(); if(!a){ running=false; return; }
    if(!running){ return; }
    intensity+=(target-intensity)*0.035; over+=(targetOver-over)*0.035;
    while(nextT < a.currentTime+LOOK){
      schedStep(step,nextT); nextT+=stepDur();
      const prev=step; step=(step+1)%NSTEP; if(step===0&&prev!==0) cycle++;
    }
    try{ const vol=target<=0.001?0:(0.2+intensity*0.18+over*0.05); gain.gain.setTargetAtTime(vol,a.currentTime,0.5); }catch(_){}
    if(target<=0.001 && intensity<0.02){ stop(); return; }
    timer=setTimeout(scheduler,TICK);
  }
  function start(){ if(running) return; const a=setup(); if(!a) return; running=true; step=0; nextT=a.currentTime+0.08; scheduler(); }
  function stop(){ running=false; if(timer){ clearTimeout(timer); timer=null; } try{ if(gain) gain.gain.setTargetAtTime(0,ac().currentTime,0.4); }catch(_){} }

  /* sblocco audio: SOLO da un gesto utente (iOS lo esige). Senza questo non parte mai. */
  function unlock(){
    if(!S.settings.music) return;
    const a=setup(); if(!a) return;
    try{ if(a.state==='suspended') a.resume(); }catch(_){}
    /* trucco iOS: un buffer muto suonato NEL gesto sblocca davvero il contesto (senza, resta muto finché non si forza un suono) */
    try{ const sb=a.createBuffer(1,1,a.sampleRate); const ss=a.createBufferSource(); ss.buffer=sb; ss.connect(a.destination); ss.start(0); }catch(_){}
    unlocked=true;
    try{ const r=computeProgress(S,todayKey(),dowOf()); update(Math.max(0,r.total-r.done)); }catch(_){}
  }
  function update(remaining){
    if(!S.settings.music){ if(running) stop(); return; }
    target=remaining<=0?0:Math.min(1,remaining/7);
    targetOver=remaining<=7?0:Math.min(1,(remaining-7)/7);
    if(remaining>0 && unlocked && !running) start();   /* parte solo se l'audio è stato sbloccato da un gesto */
  }
  /* abbassa la musica quasi a zero mentre registri, così non copre la voce */
  function recDuck(on){
    recDuckOn=!!on; const a=ac(); if(!a||!duckGain) return;
    try{ duckGain.gain.setTargetAtTime(on?0.0:1.0, a.currentTime, on?0.08:0.5); }catch(_){}
  }

  /* REAZIONE al completamento: "got item!" — arpeggio di arpa/celesta + accordo caldo che sboccia */
  /* REAZIONE al completamento: "got item!" — breve, brillante, GRATIFICANTE e variata a ogni volta */
  /* ── QUEST COMPLETED: stinger luminoso ~1.5s. D5-E5-F5-G5-Bb5-G5, accordo finale G-D-A-Bb ── */
  /* ════ MODULO 3 — COMPLETED: jingle ~1.8s, tema madre compresso, risolve su Gm(add9) ════ */
  function flourish(lvl){
    const a=setup(); if(!a) return; const t=a.currentTime+0.02;
    /* reverse swell brevissimo prima del colpo */
    try{ const s=a.createBufferSource(); s.buffer=NOISEBUF; const fl=a.createBiquadFilter(); fl.type='bandpass'; fl.frequency.value=2400; const g=a.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.05,t+0.16); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22); s.connect(fl); fl.connect(g); g.connect(reactGain); s.start(t); s.stop(t+0.24); }catch(_){}
    const T=t+0.18;
    /* sub hit morbido (poi il low-end sparisce) */
    note('sine',f('G',2),T,0.3,0.12,{a:0.004,d:0.1,s:0.3,r:0.12,lp:300,dest:reactGain});
    /* tema madre COMPRESSO su bell brillante: G5 Bb5 D6 Eb6 D6 */
    const jingle=[['G',5,0.0],['Bb',5,0.07],['D',6,0.14],['Eb',6,0.24],['D',6,0.32]];
    jingle.forEach(([nm,oc,dt])=> bell(f(nm,oc),T+dt,0.6,0.1,reactGain));
    /* chord stab finale Gm(add9): G-Bb-D-A + shimmer */
    const Tc=T+0.44;
    [['G',3],['Bb',3],['D',4],['A',4]].forEach(nn=> note(W_STR||'sawtooth',f(nn[0],nn[1]),Tc,0.85,0.05,{a:0.008,d:0.14,s:0.6,r:0.5,lp:2800,dest:reactGain}));
    bell(f('D',6),Tc+0.03,0.9,0.055,reactGain);   /* shimmer +ottava */
  }
  /* ════ MODULO 4 — VICTORY: il cielo si apre. Gm-F-Eb-D → G-C-D-G, salto Bb→Si naturale ════ */
  function seal(){
    const a=setup(); if(!a) return; const t=a.currentTime+0.02;
    /* reverse crash + cymbal swell + timpani d'ingresso */
    try{ const s=a.createBufferSource(); s.buffer=NOISEBUF; s.loop=true; const fl=a.createBiquadFilter(); fl.type='highpass'; fl.frequency.value=4500; const g=a.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.09,t+0.5); g.gain.exponentialRampToValueAtTime(0.0001,t+0.95); s.connect(fl); fl.connect(g); g.connect(reactGain); s.start(t); s.stop(t+1.0); }catch(_){}
    timpaniRoll(t,0.5,66,0.22);
    const T=t+0.5, beat=0.42;  /* 8 accordi */
    /* tappeto di archi alti sostenuto per tutta la fanfara: luminosità continua */
    [['D',5],['G',5]].forEach(nn=> strings(f(nn[0],nn[1]),T,beat*8,0.045));
    /* progressione: Gm F Eb Dsus-D | G C D G. Il 5° è SOL MAGGIORE (Bb→B): la luce. */
    const prog=[
      {root:['G',2],oct2:['G',3], ch:[['G',3],['Bb',3],['D',4]], mel:['Bb',4], maj:false},
      {root:['F',2],oct2:['F',3], ch:[['F',3],['A',3],['C',4]],  mel:['A',4],  maj:false},
      {root:['Eb',2],oct2:['Eb',3],ch:[['Eb',3],['G',3],['Bb',3]],mel:['G',4], maj:false},
      {root:['D',2],oct2:['D',3], ch:[['D',3],['F#',3],['A',3]], mel:['F#',4], maj:false},
      {root:['G',2],oct2:['G',3], ch:[['G',3],['B',3],['D',4]],  mel:['B',4],  maj:true},   /* SOL MAGGIORE */
      {root:['C',3],oct2:['C',4], ch:[['C',4],['E',4],['G',4]],  mel:['E',5],  maj:true},
      {root:['D',3],oct2:['D',4], ch:[['D',4],['F#',4],['A',4]], mel:['F#',5], maj:true},
      {root:['G',3],oct2:['G',4], ch:[['G',4],['B',4],['D',5]],  mel:['G',5],  maj:true}
    ];
    prog.forEach((p,i)=>{
      const tt=T+i*beat;
      kick(tt); snare(tt+beat*0.5,0.18); if(i%2===1) snare(tt,0.24); hat(tt,0.035); hat(tt+beat*0.5,0.03);  /* batteria piena + ride continuo */
      note('sine',f(p.root[0],p.root[1]),tt,beat*1.05,0.14,{a:0.01,d:0.1,s:0.7,r:0.2,lp:520,dest:reactGain});  /* basso */
      note('sine',f(p.oct2[0],p.oct2[1]),tt,beat*1.0,0.07,{a:0.01,d:0.1,s:0.7,r:0.2,lp:600,dest:reactGain});   /* ottava */
      p.ch.forEach(nn=> strings(f(nn[0],nn[1]),tt,beat*1.3,0.065));                           /* archi */
      brassStab(f(p.mel[0],p.mel[1]),tt,beat*1.15,0.095);                                      /* ottoni: tema (forte) */
      strings(f(p.mel[0],p.mel[1]+1),tt,beat*1.2,0.06);                                        /* archi alti in ottava */
      bell(f(p.mel[0],p.mel[1]+1),tt,beat,0.055,reactGain);                                    /* celesta */
      if(i>=4){ powerChord(f(p.root[0],p.root[1]+1),tt,beat*1.1,0.045); }                       /* chitarre aperte nella seconda metà */
      if(p.maj){ note(W_STR||'sawtooth',f('G',4),tt,beat*1.3,0.028,{a:0.2,d:0.2,s:0.7,r:0.4,lp:1600,dest:reactGain}); } /* choir pad */
    });
    /* finale: grande SOL MAGGIORE lungo + crash + cymbal swell, il cielo resta aperto */
    const Tf=T+prog.length*beat;
    [['G',2],['D',3],['G',3],['B',3],['D',4],['G',4]].forEach(nn=> strings(f(nn[0],nn[1]),Tf,3.2,0.06));
    [['G',3],['B',3],['D',4],['G',4]].forEach(nn=> brassStab(f(nn[0],nn[1]),Tf,2.2,0.05));
    note('sine',f('G',1),Tf,3.4,0.12,{a:0.02,d:0.3,s:0.6,r:1.0,lp:440,dest:reactGain});
    kick(Tf); snare(Tf,0.25); cymbalSwell(Tf,1.2,0.08); timpaniRoll(Tf,0.5,56,0.2);
    [['G',6],['D',6],['B',5],['G',5]].forEach((nn,i)=> bell(f(nn[0],nn[1]),Tf+0.12+i*0.11,1.7,0.065,reactGain));
  }

  return {update,flourish,seal,start,stop,unlock,recDuck};
})();

/* ── ATHEME: Active Quest Theme provvisorio (campione v6, loop seamless via Web Audio).
      Parte solo con quest attive; fade out quando non ce ne sono; precaricato; volume da codice. ── */
const ATHEME=(()=>{
  const URL='active_quest_v6_bandcore.wav';
  let VOL=0.40;                       /* volume gestibile da codice (0.35–0.45) */
  let ctx=null,buf=null,src=null,gain=null;
  let loaded=false,loading=false,playing=false,unlocked=false,wantActive=false,failed=false;
  function ac(){ if(!ctx) ctx=sharedAC(); return ctx; }
  function decode(a,b){
    try{
      const out=a.decodeAudioData(b);
      if(out&&typeof out.then==='function') return out;
    }catch(_){}
    return new Promise((resolve,reject)=>{ try{ a.decodeAudioData(b,resolve,reject); }catch(e){ reject(e); } });
  }
  function preload(){
    if(loaded||loading||failed) return; const a=ac(); if(!a) return; loading=true;
    fetch(URL).then(r=>{ if(!r.ok) throw new Error('audio '+r.status); return r.arrayBuffer(); }).then(b=>decode(a,b)).then(b=>{
      buf=b; loaded=true; loading=false; failed=false; if(wantActive&&unlocked) play();
    }).catch(()=>{ loading=false; failed=true; try{ if(S.settings.music) MUSIC.update(remainingWork()); }catch(_){} });
  }
  function play(){
    const a=ac(); if(!a||!loaded||playing) return;
    if(!S.settings || !S.settings.music) return;       /* rispetta l'impostazione audio */
    try{
      try{ MUSIC.stop(); }catch(_){}                    /* il campione è la via primaria; il generativo resta fallback */
      src=a.createBufferSource(); src.buffer=buf; src.loop=true;   /* loop gapless */
      gain=a.createGain(); gain.gain.setValueAtTime(0.0001,a.currentTime);
      src.connect(gain); gain.connect(a.destination);
      src.start(0);
      gain.gain.linearRampToValueAtTime(VOL,a.currentTime+0.4);    /* fade in */
      playing=true;
    }catch(_){ playing=false; }
  }
  function stop(fade){
    if(!playing){ try{ if(src) src.stop(); }catch(_){} src=null; gain=null; return; }
    const a=ac(); const s=src,g=gain; playing=false; src=null; gain=null;
    try{
      if(fade&&g&&a){ g.gain.cancelScheduledValues(a.currentTime); g.gain.setValueAtTime(g.gain.value,a.currentTime); g.gain.linearRampToValueAtTime(0.0001,a.currentTime+0.6); setTimeout(()=>{try{s.stop();}catch(_){}} ,750); }
      else if(s){ try{s.stop();}catch(_){} }
    }catch(_){}
  }
  function unlock(){
    unlocked=true; const a=ac(); if(!a) return;
    try{ if(a.state==='suspended') a.resume().catch(()=>{}); }catch(_){}
    try{ const b=a.createBuffer(1,1,a.sampleRate); const t=a.createBufferSource(); t.buffer=b; t.connect(a.destination); t.start(0); }catch(_){}  /* sblocco iOS */
    if(!loaded) preload(); else if(wantActive) play();
  }
  function setActive(active){
    wantActive=!!active;
    if(wantActive){
      if(unlocked){ if(loaded) play(); else preload(); }
      if(failed){ try{ MUSIC.update(remainingWork()); }catch(_){} }
    } else { stop(true); try{ MUSIC.update(0); }catch(_){} }
  }
  function setVolume(v){ VOL=Math.max(0,Math.min(1,v)); const a=ac(); if(gain&&a) gain.gain.setTargetAtTime(VOL,a.currentTime,0.1); }
  function pause(){ stop(false); }
  function duck(on){ setVolume(on?0.045:0.40); }
  return { unlock, setActive, pause, stop, setVolume, preload, duck, isPlaying:()=>playing, hasFailed:()=>failed };
})();

/* BOOTBED: attacco mobile-first.
   Parte nel gesto utente con un vero file audio locale, cosi iOS/Safari non
   resta muto mentre l'orchestra Web Audio carica e decodifica i campioni. */
const BOOTBED=(()=>{
  const URL='tribal-drive.mp3';
  let el=null,fade=null,failed=false,want=false;
  function ensure(){
    if(el) return el;
    try{
      el=new Audio(URL);
      el.preload='auto'; el.loop=true; el.volume=0.0001;
      try{ el.playsInline=true; el.setAttribute('playsinline',''); }catch(_){}
      el.addEventListener('error',()=>{ failed=true; }, {passive:true});
    }catch(_){ el=null; failed=true; }
    return el;
  }
  function fadeTo(v,ms,done){
    const e=ensure(); if(!e) return;
    if(fade){ clearInterval(fade); fade=null; }
    const start=e.volume, target=Math.max(0,Math.min(1,v)), t0=performance.now();
    fade=setInterval(()=>{
      const p=Math.min(1,(performance.now()-t0)/Math.max(1,ms||1));
      try{ e.volume=start+(target-start)*p; }catch(_){}
      if(p>=1){ clearInterval(fade); fade=null; if(done) done(); }
    },40);
  }
  function start(remaining){
    if(!S.settings.music||remaining<=0) return;
    const e=ensure(); if(!e) return;
    want=true; failed=false;
    try{
      e.muted=false;
      if(e.paused){ try{ e.currentTime=0; }catch(_){} }
      e.volume=Math.max(e.volume||0,0.0001);
      const p=e.play();
      if(p&&p.catch) p.catch(()=>{ failed=true; });
      fadeTo(0.13,360);
    }catch(_){ failed=true; }
  }
  function stop(smooth){
    want=false; const e=el; if(!e) return;
    const pause=()=>{ try{ e.pause(); e.currentTime=0; }catch(_){} };
    if(smooth) fadeTo(0.0001,650,pause); else { if(fade){ clearInterval(fade); fade=null; } pause(); }
  }
  function duck(on){ const e=el; if(!e||e.paused) return; fadeTo(on?0.025:0.13,on?160:360); }
  function isPlaying(){ return !!(el&&want&&!el.paused&&!el.ended); }
  return {start,stop,duck,isPlaying,hasFailed:()=>failed};
})();

/* ORCH v54: motore a SCENE musicali (non più stratificazione di loop a volume).
   Il CORE è il campione band reale (chitarra palm-mute + batteria vera, Sol minore);
   attorno, atmosfera e colore armonico reali, e ora una VOCE MELODICA reale (chitarra
   in Fa = bVII di Gm): la "risposta" che canta quando il lavoro si scioglie — forte nel
   respiro, presente nel movimento, sottile nella spinta, assente nella desperation.
   Le scene cambiano con remainingWork con crossfade veri, pulsazione a tempo e un
   accento breve al completamento. Nessun oscillatore, nessun MIDI finto: solo audio reale. */
const ORCH=(()=>{
  const BASE='';
  const CORE_URL='audio/active_quest_v6_bandcore.wav';
  // base gain di ogni strato (timbro), poi modulato dalle scene
  const L=[
    {id:'core', url:CORE_URL,            base:0.52, bus:'main'},
    {id:'atmos',url:BASE+'atomic-tension.mp3', base:0.22, bus:'bed'},
    {id:'tex',  url:BASE+'sewer-tension.mp3',  base:0.14, bus:'bed'},
    {id:'colD', url:BASE+'d-major.mp3',  base:0.12, bus:'main'},  // dominante in Gm
    {id:'colF', url:BASE+'f-major.mp3',  base:0.11, bus:'main'},  // bVII in Gm
    {id:'lead', url:BASE+'lead-guitar.mp3', base:0.17, bus:'main'} // voce melodica reale (chitarra, Fa = bVII): la RISPOSTA
  ];
  const BPM=128, BEAT=60/BPM, BAR=BEAT*4;
  let unlocked=false,ready=false,loading=false,failed=false,playing=false,ducked=false;
  let targetRemaining=0,lastRemaining=0,accentUntil=0;
  let buffers={},nodes={},master=null,bed=null,timer=null,startedAt=0;
  const cur={core:0,atmos:0,tex:0,colD:0,colF:0,lead:0,cut:240}; // livelli scena smussati in JS
  function audio(){ return ac(); }
  function decode(a,b){
    try{ const out=a.decodeAudioData(b); if(out&&typeof out.then==='function') return out; }catch(_){}
    return new Promise((res,rej)=>{ try{ a.decodeAudioData(b,res,rej); }catch(e){ rej(e); } });
  }
  function preload(){
    if(ready||loading||failed) return; const a=audio(); if(!a) return; loading=true;
    Promise.all(L.map(l=>fetch(l.url).then(r=>{ if(!r.ok) throw new Error(l.id); return r.arrayBuffer(); }).then(b=>decode(a,b)).then(buf=>{ buffers[l.id]=buf; })))
      .then(()=>{ ready=true; loading=false; failed=false; if(unlocked&&targetRemaining>0) start(); })
      .catch(()=>{ loading=false; failed=true; });
  }
  function ensureMaster(a){
    if(master) return master;
    master=a.createGain(); master.gain.value=0.0001; master.connect(BUS||a.destination);
    bed=a.createBiquadFilter(); bed.type='lowpass'; bed.frequency.value=240; bed.Q.value=0.4; bed.connect(master);
    return master;
  }
  function mkLayer(a,l,when){
    if(!buffers[l.id]) return;
    const src=a.createBufferSource(),g=a.createGain();
    src.buffer=buffers[l.id]; src.loop=true; g.gain.value=0.0001;
    src.connect(g); g.connect(l.bus==='bed'?bed:master);
    try{ src.start(when,0); }catch(_){}
    nodes[l.id]={src,g,l};
  }
  function start(){
    const a=audio(); if(!a||!S.settings.music||playing) return;
    if(!ready){ preload(); return; }
    ensureMaster(a);
    const when=a.currentTime+0.04; startedAt=a.currentTime;
    L.forEach(l=>mkLayer(a,l,when));
    playing=true;
    try{ master.gain.cancelScheduledValues(a.currentTime); master.gain.setValueAtTime(0.0001,a.currentTime);
         master.gain.linearRampToValueAtTime(0.9,a.currentTime+0.5); }catch(_){}
    // il CORE è udibile: lascio il BOOTBED solo come ponte, poi lo spengo
    setTimeout(()=>{ try{ BOOTBED.stop(true); }catch(_){} },480);
    if(timer) clearInterval(timer);
    timer=setInterval(tick,140); tick();
  }
  function stop(fade){
    const a=audio(); const old=nodes; nodes={}; playing=false;
    if(timer){ clearInterval(timer); timer=null; }
    try{ if(master&&a){ master.gain.cancelScheduledValues(a.currentTime); master.gain.setValueAtTime(master.gain.value,a.currentTime); master.gain.linearRampToValueAtTime(0.0001,a.currentTime+(fade?0.7:0.02)); } }catch(_){}
    for(const k in cur){ if(k!=='cut') cur[k]=0; }
    setTimeout(()=>{ Object.keys(old).forEach(k=>{ try{ old[k].src.stop(); }catch(_){} }); }, fade?780:40);
  }
  // ── definizione delle SCENE: cosa suona, non solo quanto forte ──
  function scene(r){
    if(r<=0)  return {core:0,   atmos:0,   tex:0,   colD:0,   colF:0,   lead:0,   cut:240,  pulse:0,   beat:0};
    if(r===1) return {core:0,   atmos:0.64,tex:0.30,colD:0.34,colF:0,   lead:0.92,cut:900,  pulse:0.10,beat:0};   // respiro
    if(r<=3)  return {core:0.66,atmos:0.50,tex:0.34,colD:0.30,colF:0.30,lead:0.72,cut:1500, pulse:0.10,beat:0};   // movimento
    if(r<=6)  return {core:0.98,atmos:0.56,tex:0.46,colD:0.40,colF:0.56,lead:0.34,cut:2600, pulse:0.12,beat:0.16};// spinta/ostinato
    return        {core:1.16,atmos:0.72,tex:0.60,colD:0.62,colF:0.70,lead:0,   cut:4200, pulse:0.14,beat:0.22};  // desperation
  }
  function tick(){
    const a=audio(); if(!a) return;
    if(!S.settings.music||targetRemaining<=0){ stop(true); return; }
    if(unlocked&&!playing){ start(); return; }
    const sc=scene(targetRemaining);
    // accento musicale breve al completamento (remaining sceso)
    if(targetRemaining<lastRemaining && targetRemaining>0) accentUntil=a.currentTime+0.85;
    lastRemaining=targetRemaining;
    const accent=a.currentTime<accentUntil;
    const accK=accent?Math.max(0,(accentUntil-a.currentTime)/0.85):0; // 1→0
    // crossfade di scena: lerp lento in JS (≈2s) = cambio scena, non scatto di volume
    const k=0.07;
    cur.core+=(sc.core-cur.core)*k; cur.atmos+=(sc.atmos-cur.atmos)*k; cur.tex+=(sc.tex-cur.tex)*k;
    cur.colD+=(sc.colD-cur.colD)*k; cur.colF+=(sc.colF-cur.colF)*k;
    cur.lead+=(sc.lead-cur.lead)*(k*0.6); // melodia: entra/esce piu' dolce dei pad
    const cutTarget=sc.cut+(accent?2200*accK:0);
    cur.cut+=(cutTarget-cur.cut)*0.12;
    const t=startedAt?a.currentTime-startedAt:0;
    const barSwell=1+sc.pulse*Math.sin(2*Math.PI*(t/BAR));                         // respiro a battuta
    const beatHit =1+sc.beat*Math.pow(Math.max(0,Math.sin(Math.PI*t/BEAT)),6);     // accento a battito
    const dk=ducked?0.12:1;
    const set=(id,val,tc)=>{ const n=nodes[id]; if(n){ try{ n.g.gain.setTargetAtTime(Math.max(0.0001,val),a.currentTime,tc); }catch(_){} } };
    set('core', L[0].base*cur.core*beatHit*(1+0.18*accK)*dk, 0.10);
    set('atmos',L[1].base*cur.atmos*barSwell*dk, 0.20);
    set('tex',  L[2].base*cur.tex*barSwell*(1+0.5*accK)*dk, 0.18);
    set('colD', L[3].base*cur.colD*dk, 0.30);
    set('colF', L[4].base*cur.colF*dk, 0.30);
    set('lead', L[5].base*cur.lead*barSwell*(1+0.12*accK)*dk, 0.25);
    try{ if(bed) bed.frequency.setTargetAtTime(cur.cut,a.currentTime,0.20); }catch(_){}
    try{ if(master) master.gain.setTargetAtTime(0.78+Math.min(0.18,targetRemaining*0.015),a.currentTime,0.25); }catch(_){}
  }
  function unlock(){
    if(!S.settings.music) return; const a=audio(); if(!a) return;
    try{ if(a.state==='suspended') a.resume().catch(()=>{}); }catch(_){}
    try{ const b=a.createBuffer(1,1,a.sampleRate),s=a.createBufferSource(); s.buffer=b; s.connect(a.destination); s.start(0); }catch(_){}
    unlocked=true; preload(); if(targetRemaining>0) start();
  }
  function setActive(active,remaining){
    targetRemaining=active?Math.max(1,remaining||remainingWork()):0;
    if(!active){ stop(true); return; }
    if(unlocked){ if(ready) start(); else preload(); }
    tick();
  }
  function duck(on){ ducked=!!on; if(playing) tick(); }
  return {unlock,setActive,stop,pause:()=>stop(false),duck,preload,isPlaying:()=>playing,hasFailed:()=>failed};
})();

function remainingWork(){
  try{ const r=computeProgress(S,todayKey(),dowOf()); return Math.max(0,r.total-r.done); }catch(_){ return 0; }
}
function syncAdaptiveMusic(fromGesture){
  const remaining=remainingWork();
  if(!S.settings.music){
    try{ ORCH.stop(false); }catch(_){}
    try{ BOOTBED.stop(false); }catch(_){}
    try{ ATHEME.stop(false); }catch(_){}
    try{ MUSIC.stop(); }catch(_){}
    return remaining;
  }
  if(fromGesture){
    try{ BOOTBED.start(remaining); }catch(_){}
    try{ ORCH.unlock(); }catch(_){}
    try{ ATHEME.unlock(); }catch(_){}
    try{ MUSIC.unlock(); }catch(_){}
  }
  try{ ORCH.setActive(remaining>0,remaining); }catch(_){}
  try{
    if(remaining>0){
      if(ORCH.isPlaying()){ try{ BOOTBED.stop(true); }catch(_){} try{ ATHEME.stop(false); }catch(_){} try{ MUSIC.stop(); }catch(_){} }
      else if(ORCH.hasFailed()){
        if(!BOOTBED.isPlaying()){ try{ ATHEME.setActive(true); }catch(_){} try{ MUSIC.update(remaining); }catch(_){} }
      }
    } else { try{ BOOTBED.stop(true); }catch(_){} try{ ATHEME.setActive(false); }catch(_){} MUSIC.update(0); }
  }catch(_){}
  return remaining;
}

function kickAdaptiveMusicFromGesture(){
  try{
    if(!S.settings.music) return;
    const remaining=remainingWork();
    if(remaining<=0) return;
    if(ORCH.isPlaying()||BOOTBED.isPlaying()) return;
    syncAdaptiveMusic(true);
  }catch(_){}
}
['pointerdown','touchstart','click','keydown'].forEach(ev=>{
  try{ window.addEventListener(ev,kickAdaptiveMusicFromGesture,{capture:true,passive:true}); }catch(_){}
});

let itVoice=null;
function pickVoice(){
  try{
    const vs=speechSynthesis.getVoices();
    itVoice=vs.find(v=>v.lang&&v.lang.toLowerCase().startsWith(linguaApp()))||null;
  }catch(_){}
}
if('speechSynthesis' in window){ pickVoice(); try{speechSynthesis.onvoiceschanged=pickVoice;}catch(_){} }
function say(word,lvl){
  if(S.settings.music) return;
  if(!S.settings.voice||!('speechSynthesis' in window)) return;
  try{
    if(speechSynthesis.speaking||speechSynthesis.pending) speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(word);
    u.lang=locale(); if(itVoice) u.voice=itVoice;
    /* l'annunciatore si esalta col combo, stile Candy Crush */
    const L=Math.max(1,Math.min(lvl||1,6));
    if(S.settings.theme==='arcade'){ u.pitch=Math.min(2,1+(L-1)*0.14); u.rate=1+(L-1)*0.05; }
    else { u.pitch=1; u.rate=1; }
    u.volume=1;
    speechSynthesis.speak(u);
  }catch(_){}
}
function shake(strong){
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.remove('shake','shake-big');
    void document.body.offsetWidth; /* riavvia l'animazione */
    document.body.classList.add(strong?'shake-big':'shake');
    setTimeout(()=>document.body.classList.remove('shake','shake-big'),450);
  }catch(_){}
}

/* ======================================================================
   FX — motore particellare su canvas: gira SOLO quando ci sono particelle,
   DPR limitato a 2, tutto in try/catch: mai un crash per un effetto.
   ====================================================================== */
const FX=(()=>{
  let cv=null,ctx=null,parts=[],raf=0,last=0;
  const REDUCED=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function init(){
    try{
      cv=document.querySelector('#fx');
      ctx=cv.getContext('2d');
      resize();
      window.addEventListener('resize',resize);
    }catch(_){ ctx=null; }
  }
  function resize(){
    try{
      const dpr=Math.min(window.devicePixelRatio||1,2);
      cv.width=innerWidth*dpr; cv.height=innerHeight*dpr;
      cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }catch(_){}
  }
  function loop(t){
    raf=0;
    if(!ctx) return;
    const dt=Math.min((t-last)/1000,0.05); last=t;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i];
      p.life-=dt;
      if(p.life<=0){ parts.splice(i,1); continue; }
      p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt;
      if(p.sway) p.x+=Math.sin((p.life0-p.life)*p.sway)*p.swayAmp*dt;
      const a=Math.min(1,p.life/p.fade)*p.alpha;
      ctx.globalAlpha=a;
      if(p.shape==='ring'){
        ctx.strokeStyle=p.color; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(1+(1-p.life/p.life0)*3.2),0,Math.PI*2); ctx.stroke();
      } else if(p.shape==='petal'){
        ctx.fillStyle=p.color;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0,0,p.size,p.size*0.45,0,0,Math.PI*2); ctx.fill(); ctx.restore();
      } else {
        ctx.fillStyle=p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha=1;
    if(parts.length) raf=requestAnimationFrame(loop);
    else ctx.clearRect(0,0,innerWidth,innerHeight);
  }
  function kick(){ if(!raf&&parts.length){ last=performance.now(); raf=requestAnimationFrame(loop); } }
  function add(p){
    if(REDUCED||!ctx) return;
    if(parts.length>400) parts.splice(0,parts.length-400); /* tetto rigido: la batteria ringrazia */
    p.life0=p.life; parts.push(p); kick();
  }
  /* esplosione d'inchiostro alla spunta: cresce col combo */
  function burst(x,y,lvl){
    const colors=lvl>=6?['#B8372E','#C4673A','#F0E9DB']:lvl>=4?['#C4673A','#E8A84C','#F0E9DB']:['#E8A84C','#F0D9A8'];
    const n=10+lvl*5;
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, s=70+Math.random()*150*(0.6+lvl*0.13);
      add({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-50,g:360,vr:0,rot:0,sway:0,swayAmp:0,
        size:1.4+Math.random()*2.6,life:0.5+Math.random()*0.5,fade:0.4,alpha:0.95,
        color:colors[i%colors.length],shape:'dot'});
    }
    add({x,y,vx:0,vy:0,g:0,vr:0,rot:0,sway:0,swayAmp:0,size:9,life:0.45,fade:0.45,alpha:0.55,
      color:lvl>=6?'#B8372E':'#E8A84C',shape:'ring'});
  }
  /* scintille alla nascita di una quest */
  function sparkle(x,y){
    for(let i=0;i<9;i++){
      const a=Math.random()*Math.PI*2,s=30+Math.random()*70;
      add({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,g:60,vr:0,rot:0,sway:0,swayAmp:0,
        size:1+Math.random()*1.6,life:0.4+Math.random()*0.3,fade:0.3,alpha:0.9,color:'#E8A84C',shape:'dot'});
    }
  }
  /* evaporazione delle parole durante la distillazione */
  function wisp(x,y){
    add({x:x+(Math.random()-0.5)*26,y,vx:(Math.random()-0.5)*12,vy:-44-Math.random()*44,g:-22,vr:0,rot:0,
      sway:6,swayAmp:20,size:1.2+Math.random()*2,life:1+Math.random()*0.8,fade:0.8,alpha:0.5,
      color:'#E8A84C',shape:'dot'});
  }
  /* fioritura di petali al sigillo */
  function bloom(){
    const cols=['#E8A84C','#C4673A','#B8372E','#F0E9DB'];
    for(let i=0;i<60;i++){
      add({x:Math.random()*innerWidth,y:-20-Math.random()*innerHeight*0.3,
        vx:(Math.random()-0.5)*40,vy:60+Math.random()*90,g:12,vr:(Math.random()-0.5)*4,rot:Math.random()*Math.PI,
        sway:2,swayAmp:32,size:3+Math.random()*4,life:2.2+Math.random()*1.4,fade:0.9,alpha:0.9,
        color:cols[i%4],shape:'petal'});
    }
  }
  function pause(){ if(raf){ cancelAnimationFrame(raf); raf=0; } }
  function resume(){ kick(); }
  return {init,burst,sparkle,wisp,bloom,pause,resume};
})();
const FW_HOLD=[1.05,1.1,1.25,1.4,1.55,1.9]; /* permanenza a schermo per livello */
function floatWord(word,lvl){
  const L=Math.max(1,Math.min(lvl||1,6));
  const w=document.createElement('div');
  w.className='float-word lv'+L;
  w.style.setProperty('--dur',FW_HOLD[L-1]+'s');
  let inner='';
  if(L>=3) inner+='<span class="fw-ghost" aria-hidden="true">'+escapeHtml(word)+'</span>';
  if(L>=4) inner+='<span class="fw-ring"></span>';
  if(L>=6) inner+='<span class="fw-ring fw-ring2"></span>';
  inner+='<span class="fw-word">';
  /* il passo per lettera si adatta: "Tao" slamma lento, "Cerchio chiuso" resta leggibile */
  const step=L>=6?Math.min(0.11,0.55/Math.max(word.length,1)):0.04;
  Array.from(word).forEach((ch,i)=>{
    inner+='<span class="fw-l" style="animation-delay:'+(i*step).toFixed(3)+'s">'+(ch===' '?'&nbsp;':escapeHtml(ch))+'</span>';
  });
  inner+='</span>';
  w.innerHTML=inner;
  $('#word-stage').appendChild(w);
  if(L>=5){ try{ FX.burst(innerWidth/2,innerHeight/2,L); }catch(_){} }
  setTimeout(()=>w.remove(),FW_HOLD[L-1]*1000+260);
}

/* ======================================================================
   INTEGRAZIONI NATIVE iOS (feature detection, mai assunte)
   ====================================================================== */
/* APTICA: l'unica via su iOS è un <input type=checkbox switch> su cui Safari (18+)
   emette il feedback tattile al click. La Vibration API è bloccata da WebKit. */
let hapticEl=null;
function initHaptic(){
  try{
    hapticEl=document.createElement('input');
    hapticEl.type='checkbox';
    hapticEl.setAttribute('switch','');
    const lab=document.createElement('label');
    lab.appendChild(hapticEl); lab.style.cssText='position:absolute;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(lab);
    hapticEl._label=lab;
  }catch(_){ hapticEl=null; }
}
function haptic(strong){
  try{
    if(hapticEl&&hapticEl._label){
      hapticEl._label.click();
      if(strong) setTimeout(()=>{ try{hapticEl._label.click();}catch(_){} },45);
    }
  }catch(_){}
  try{ if(navigator.vibrate) navigator.vibrate(strong?[12,30,12]:10); }catch(_){}
}
/* WAKE LOCK: tiene lo schermo acceso durante la dettatura lunga */
let wakeLock=null;
async function acquireWake(){
  try{ if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen'); }catch(_){}
}
function releaseWake(){
  try{ if(wakeLock){ wakeLock.release(); wakeLock=null; } }catch(_){}
}

/* ======================================================================
   SUONI PERSONALIZZATI — file dell'utente, solo su questo telefono
   ====================================================================== */
const SFX_LS='sentiero-sfx-v1';
const SFX_MAX_FILE=400*1024, SFX_MAX_TOTAL=2*1024*1024, SFX_MAX_N=8;
let SFX=loadSFX();
function isSfxSource(value){
  return typeof value==='string'&&(value.startsWith('data:')||/^assets\/sfx\/(?:combo-[1-8]|seal)\.mp3$/.test(value));
}
function loadSFX(){
  try{
    const a=JSON.parse(localStorage.getItem(SFX_LS)||'[]');
    return Array.isArray(a)?a.filter(x=>x&&typeof x.name==='string'&&isSfxSource(x.data)).slice(0,SFX_MAX_N):[];
  }catch(_){ return []; }
}
function saveSFX(){
  try{ localStorage.setItem(SFX_LS,JSON.stringify(SFX)); _sfxBuf.length=0; return true; }   /* invalida la cache: gli indici possono essere cambiati */
  catch(_){ toast('Spazio insufficiente per i suoni: usa file pi\u00f9 piccoli (es. .m4r)'); return false; }
}
const CERCHIO_SFX={combos:["assets/sfx/combo-1.mp3", "assets/sfx/combo-2.mp3", "assets/sfx/combo-3.mp3", "assets/sfx/combo-4.mp3", "assets/sfx/combo-5.mp3", "assets/sfx/combo-6.mp3", "assets/sfx/combo-7.mp3", "assets/sfx/combo-8.mp3"],seal:"assets/sfx/seal.mp3"};
const _sfxBuf=[];   /* idx -> AudioBuffer decodificato (riuso del motore Web Audio) */
function _durlToArrayBuffer(durl){
  const b64=(durl.split(',')[1]||''); const bin=atob(b64); const u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  return u8.buffer;
}
function _sfxToArrayBuffer(source){
  if(source.startsWith('data:')) return Promise.resolve(_durlToArrayBuffer(source));
  return fetch(source,{cache:'force-cache'}).then(r=>{ if(!r.ok) throw new Error('SFX_HTTP_'+r.status); return r.arrayBuffer(); });
}
function playSFX(idx){
  try{
    if(!S.settings.sound||!SFX.length) return false;
    const i=Math.max(0,Math.min(idx,SFX.length-1));
    const ctx=audioCtx();
    /* percorso affidabile: stesso motore Web Audio dei Suoni dell'app (iOS: l'elemento <audio> resta muto nelle PWA) */
    if(ctx&&_audioUnlocked){
      if(_sfxBuf[i]) return playBuffer(_sfxBuf[i],1,1);
      const source=SFX[i].data;
      _sfxToArrayBuffer(source).then(data=>ctx.decodeAudioData(data,
        buf=>{ _sfxBuf[i]=buf; playBuffer(buf,1,1); },
        ()=>{ try{ const a=new Audio(source); a.volume=1; a.play().catch(()=>{}); }catch(_){} }
      )).catch(()=>{ try{ const a=new Audio(source); a.volume=1; a.play().catch(()=>{}); }catch(_){} });
      return true;
    }
    const a=new Audio(SFX[i].data); a.volume=1; a.play().catch(()=>{});   /* ripiego (desktop / motore non pronto) */
    return true;
  }catch(_){ return false; }
}
let _sealBuf=null;   /* sigillo incorporato (set Cerchio) */
function playBuiltinSeal(){
  try{
    const d=localStorage.getItem('sentiero-seal-v1'); if(!d||!isSfxSource(d)) return false;
    const ctx=audioCtx(); if(!ctx||!_audioUnlocked) return false;
    if(_sealBuf) return playBuffer(_sealBuf,1,1);
    _sfxToArrayBuffer(d).then(data=>ctx.decodeAudioData(data,buf=>{ _sealBuf=buf; playBuffer(buf,1,1); },()=>{})).catch(()=>{});
    return true;
  }catch(_){ return false; }
}

/* ======================================================================
   POSIZIONE — dov'ero quel giorno; condivisione rapida dal pin
   ====================================================================== */
let lastPos=null;
function capturePos(){
  if(!S.settings.geo||!('geolocation' in navigator)) return;
  try{
    navigator.geolocation.getCurrentPosition(
      p=>{ lastPos={lat:Math.round(p.coords.latitude*1e5)/1e5,lon:Math.round(p.coords.longitude*1e5)/1e5,ts:Date.now()}; },
      ()=>{},
      {enableHighAccuracy:false,timeout:8000,maximumAge:600000}
    );
  }catch(_){}
}
function freshPos(){ return (lastPos&&Date.now()-lastPos.ts<30*60*1000)?{lat:lastPos.lat,lon:lastPos.lon}:null; }
function mapsUrl(p){ return 'https://maps.google.com/?q='+p.lat+','+p.lon; }
/* v224 \u2014 \u00abDOVE SONO\u00bb, RIPARATO.
   Non funzionava, e non per la posizione: per il tempo.
   Il tasto chiedeva la posizione e chiamava la condivisione DENTRO la risposta,
   secondi dopo. iOS pretende che il foglio di condivisione parta nell'istante
   del tocco - passata quella frazione di secondo l'autorizzazione e' scaduta e
   rifiuta. E il rifiuto finiva in un catch vuoto con scritto \u00abcondivisione
   annullata: nessun errore\u00bb, quindi non appariva nemmeno un messaggio: il tasto
   sembrava semplicemente morto.
   Sul telefono di chi sviluppa funzionava perche il permesso era gia dato e la
   posizione gia in memoria; su un telefono nuovo, mai.

   Adesso: se la posizione c'e gia (capturePos la tiene fresca mezz'ora) si
   condivide SUBITO, dentro il tocco. Se non c'e, si chiede - e si dice alla
   persona di toccare di nuovo, invece di far finta di niente. */
/* ══ v271.1 — UNA SOLA AUTORITA PER «DOVE SONO» ════════════════════════════
   Il satellite azzurro cambia mestiere e adesso fa questa stessa cosa. La
   tentazione era scrivere la condivisione una seconda volta accanto a lui: e
   il modo piu rapido di perdere, sul secondo esemplare, la correzione iOS che
   e costata cara: «se la posizione e gia fresca, navigator.share parte DENTRO
   il tocco, senza nessun await davanti». Un await, un setTimeout o un click
   programmato prima della share e Safari la rifiuta in silenzio.
   Quindi la logica resta una, e i due comandi la chiamano.
   DEVE restare sincrona fino a navigator.share(): non trasformarla in async. */
function condividiPosizione(){
  if(!('geolocation' in navigator)){ toast('La posizione non \u00e8 disponibile su questo telefono'); return; }

  const manda=(pos)=>{
    const url=mapsUrl(pos);
    if(navigator.share){
      /* dentro il gesto: niente await prima di qui */
      navigator.share({title:T('La mia posizione'),url:url})
        .catch(e=>{ if(e&&e.name==='AbortError') return;      /* l'ha chiusa lei: non e un errore */
                    copiaPos(url); });
    } else copiaPos(url);
  };
  const copiaPos=(url)=>{
    try{
      navigator.clipboard.writeText(url)
        .then(()=>toast('Link della posizione copiato: incollalo dove vuoi'))
        .catch(()=>toast('Non riesco a copiare il link qui'));
    }catch(_){ toast('Non riesco a copiare il link qui'); }
  };

  const fresca=freshPos();
  if(fresca){ manda(fresca); return; }

  toast('Cerco dove sei\u2026');
  navigator.geolocation.getCurrentPosition(p=>{
    lastPos={lat:Math.round(p.coords.latitude*1e5)/1e5,lon:Math.round(p.coords.longitude*1e5)/1e5,ts:Date.now()};
    /* NON si condivide da qui: il tocco e' scaduto e iOS rifiuterebbe in
       silenzio. Si dice alla persona che adesso si puo. Il messaggio non nomina
       piu il bottone, perche adesso le porte sono due. */
    toast('Trovato. Tocca di nuovo per condividere dove sei.');
  },err=>{
    if(err&&err.code===1) toast('Permesso negato: Impostazioni \u203a Safari \u203a Posizione');
    else toast('Non riesco a trovare dove sei: riprova fra un momento');
  },{enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
document.querySelector('#btn-pin').onclick=()=>condividiPosizione();

/* ======================================================================
   HEADER / TABS
   ====================================================================== */
function renderStreak(){
  { const _d=new Date(); $('#dateline').innerHTML='<span class="d-num">'+_d.getDate()+'</span><span class="d-mese">'+_d.toLocaleDateString(locale(),{month:'long'})+'</span>'; }
  try{ const gd=$('#gb-dow'); if(gd) gd.textContent=new Date().toLocaleDateString(locale(),{weekday:'long'}); }catch(_){}
}
function scrollToSoft(sel){
  try{
    const el=document.querySelector(sel);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(_){}
}
function handleFlowAction(action,extra){
  if(action==='speak'){ showPane('quest'); setTimeout(()=>{ try{ micBtn.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){} try{ micLabel.textContent='Tocca il cerchio per parlare'; }catch(_){} },120); return; }  /* la voce parte con un tocco: il comando guidato porta al cerchio, non insegna un gesto nascosto */
  if(action==='distill'){ showPane('quest'); setTimeout(()=>{ const b=document.querySelector('#btn-save'); if(b&&!b.disabled) b.click(); },80); return; }
  if(action==='settings'){ showPane('impostazioni'); setTimeout(()=>{ const k=document.querySelector('#gemini-key'); if(k) k.focus(); },120); return; }
  if(action==='tasks'){ showPane('impostazioni'); setTimeout(()=>{ const t=document.querySelector('#new-task-txt'); if(t) t.focus(); },120); return; }

  if(action==='today'){ showPane('oggi'); setTimeout(()=>{ if(!focusTarget(extra)) scrollToSoft('#sec-today-quests'); },140); return; }
  /* v211: la strada per scrivere una cosa a mano. Esisteva il pannello (v205) ma
     non c'era nessun modo di arrivarci da un foglio vuoto: chi apriva l'app il
     primo giorno leggeva «parla», e senza chiave parlare non fa nascere niente. */
  if(action==='nuova'){ showPane('oggi'); setTimeout(()=>{ try{ scrollToSoft('#sec-today-quests'); }catch(_){}
    try{ apriNascita(true); }catch(_){} },140); return; }
}
/* ── PROSSIMA MOSSA: non la prima in lista, ma l'UNICA che conta adesso ──
   Principio "vendimi questa penna": togli la scelta, crea l'urgenza, dai il perche'.
   Ordine di leva: task in ritardo > quest scaduta > task imminente > priorita alta >
   prima quest > prima task. Se resta una cosa sola, la cornice diventa "chiudi e finisci". */
function hmToMin(hm){ const m=/^(\d{2}):(\d{2})$/.exec(hm||''); return m?(+m[1]*60 + +m[2]):null; }
function nowMin(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
function fmtMinGap(n){ n=Math.max(0,Math.round(n)); if(n>=60){ const h=Math.floor(n/60),mm=n%60; return h+'h'+(mm?(' '+mm+' min'):''); } return n+' min'; }
function pickNextMove(tk,dow){
  tk=tk||todayKey(); dow=(dow==null?dowOf():dow);
  const checks=S.checks[tk]||{};
  const nm=nowMin();
  const sched=todaysScheduled().filter(t=>{ if(checks[t.id]===true) return false; const tm=hmToMin(t.time); return tm==null||tm<=nm; });  /* solo azioni già affiorate */
  const quests=sortQuests(activeQuests(S,tk)).filter(q=>!q.fatto);
  const r=computeProgress(S,tk,dow);
  const lastOne=(r.total>0 && (r.total-r.done)===1);          /* resta UNA sola cosa: la penna si vende da sola */
  const close='chiudi questa e il cerchio si chiude';
  /* 1) task con orario gia passato: il ritardo e' l'urgenza piu' forte */
  let od=null,odGap=-1;
  sched.forEach(t=>{ const tm=hmToMin(t.time); if(tm!=null&&tm<nm){ const g=nm-tm; if(g>odGap){odGap=g;od=t;} } });
  if(od) return {label:od.titolo,kind:'task',targetId:od.id,why:(lastOne?close:'in ritardo di '+fmtMinGap(odGap))};
  /* 2) quest con data passata */
  const odq=quests.find(q=>q.quando&&q.quando<tk);
  if(odq) return {label:odq.titolo,kind:'quest',targetId:odq.id,why:(lastOne?close:'in ritardo')};
  /* 3) task imminente (entro 90 min): aggancia il momento giusto */
  let soon=null,soonGap=1e9;
  sched.forEach(t=>{ const tm=hmToMin(t.time); if(tm!=null&&tm>=nm&&(tm-nm)<=90){ if((tm-nm)<soonGap){soonGap=tm-nm;soon=t;} } });
  if(soon) return {label:soon.titolo,kind:'task',targetId:soon.id,why:(lastOne?close:'tra '+fmtMinGap(soonGap))};
  /* 4) quest a priorita alta */
  const hi=quests.find(q=>Number(q.prio)===1);
  if(hi) return {label:hi.titolo,kind:'quest',targetId:hi.id,why:(lastOne?close:'priorita alta')};
  /* 5) prima quest in ordine */
  if(quests.length) return {label:quests[0].titolo,kind:'quest',targetId:quests[0].id,why:(lastOne?'l\'ultima rimasta: chiudila':'la prima da chiudere')};
  /* 6) prima task */
  if(sched.length) return {label:sched[0].titolo,kind:'task',targetId:sched[0].id,why:(lastOne?'l\'ultima rimasta: chiudila':'l\'appiglio del giorno')};
  return null;
}
/* VAI AL PUNTO: atterra sull'elemento esatto, lo evidenzia, pronto da spuntare in un tocco */
function focusTarget(extra){
  try{
    if(!extra||!extra.target) return false;
    const esc=(window.CSS&&CSS.escape)?CSS.escape(extra.target):String(extra.target).replace(/["\\]/g,'\\$&');
    const sel=(extra.kind==='task')?('[data-tid="'+esc+'"]'):('[data-qid="'+esc+'"]');
    const el=document.querySelector(sel);
    if(!el) return false;
    try{ el.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){ el.scrollIntoView(); }
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(()=>{ try{ el.classList.remove('flash'); }catch(_){} },1800);
    return true;
  }catch(_){ return false; }
}
/* leva dell'osservatrice: trasforma la riflessione nella mossa concreta che indica */
function renderFlow(){
  const el=document.querySelector('#flow'); if(!el) return;
  if(recording||distilling){ el.innerHTML=''; return; }
  const confirm=!document.querySelector('#confirm-row').classList.contains('hidden');
  if(confirm){ el.innerHTML='<strong>La materia e pronta.</strong><button data-flow="distill">Raccogli adesso</button>'; return; }
  const tk=todayKey(),dow=dowOf(),r=computeProgress(S,tk,dow);
  const checks=S.checks[tk]||{};
  const nextTask=todaysScheduled().find(t=>checks[t.id]!==true);
  const nextQuest=sortQuests(activeQuests(S,tk)).find(q=>!q.fatto);
  if(r.total&&r.done<r.total){
    const mv=pickNextMove(tk,dow);
    if(mv){ const _k=mv.kind+':'+mv.targetId; if(_k!==_lastNextMoveKey){ _lastNextMoveKey=_k; if(Date.now()-_lastUserAct<2000){ try{ playEventSound('nextMoveReady'); }catch(_){} } } }
    const next=mv?mv.label:(nextQuest?nextQuest.titolo:nextTask?nextTask.titolo:'prossima azione');
    const tId=mv?escapeHtml(mv.targetId):'';
    const tKind=mv?mv.kind:'';
    el.innerHTML='<strong>Prossima mossa: '+escapeHtml(next)+'</strong>'+
      (mv&&mv.why?'<span class="flow-why">'+escapeHtml(mv.why)+'</span>':'')+
      '<button data-flow="today" data-target="'+tId+'" data-kind="'+tKind+'">Vai al punto</button>';
    return;
  }
  if(r.total&&r.done===r.total){ el.innerHTML='<strong>Cerchio chiuso.</strong>Lascia che il resto resti leggero.'; return; }
  if(!GEMINI_KEY&&S.diary.length===0&&S.quests.length===0){
    el.innerHTML='<strong>Questo e Sentiero.</strong>Parla, o scrivi una cosa da fare.<button data-flow="nuova">Scrivi una cosa</button> <button data-flow="speak">Parla ora</button>';
    return;
  }
  if(S.diary.length>=2&&!((S.observerNotes||[]).length)){
    el.innerHTML='';
    return;
  }
  el.innerHTML='<strong>Il difficile resta fuori.</strong><button data-flow="speak">Parla una cosa sola</button>';
}
document.querySelector('#flow').addEventListener('click',e=>{
  const b=e.target.closest('[data-flow]'); if(b) handleFlowAction(b.dataset.flow,{target:b.dataset.target,kind:b.dataset.kind});
});
/* ══ v269.3 — UNO STATO, UNA DOMANDA ════════════════════════════════════════
   Il mondo (cielo, luci orbitali, microfono) e il foglio sono due superfici.
   Chi disegna nel mondo ha una domanda sola: «adesso il mondo si vede?».
   Fino alla v269.2 quella domanda non esisteva, e ognuno se la rispondeva da
   solo leggendo uno stato scritto per un'altra ragione. Due lettori su due
   hanno letto male, e nessuno dei due era distratto:

     · «data-pane === "quest"» veniva letto come «il mondo e coperto» in tre
       punti. Ma showPane('quest') e cio che succede quando tocchi «parla»:
       il foglio scende a picco e il mondo si vede PIU DI SEMPRE. Effetto:
       la Chiamata a terra andava in display:none proprio quando doveva esserci,
       e le due luci orbitali smettevano di muoversi.
     · «data-foglio === "picco"» veniva letto come «il foglio copre il cielo»,
       col commento scritto accanto. Ma posDi('picco') mette il foglio a
       H-110-safe, cioe IN FONDO. Effetto: in modo inchiostro il cielo non si
       ridipingeva proprio quando era in vista.

   Non e un errore di due persone: e uno stato che risponde a una domanda
   diversa da quella che gli veniva fatta. Correggere i due selettori avrebbe
   lasciato in piedi la condizione che li ha generati - e la terza funzione che
   nascera nel mondo la sbaglierebbe di nuovo.
   Quindi la domanda diventa esplicita e ha una risposta sola, scritta in un
   posto solo. Chi disegna nel mondo legge «data-mondo», e basta.

   LIMITE DICHIARATO: qui dentro pesano solo foglio e pane. Gli strati che
   coprono tutto (stanza, giardino, terra, proposte, soglia, accoglienza) hanno
   z-index >= 110 e coprono comunque: non entrano in questo calcolo, e quando
   sono aperti il mondo continua a girare sotto. E lavoro sprecato, non un
   errore di stato, ed e un debito dichiarato - non un difetto nascosto. */
/* ══ v269.5 — LA SCATOLA NERA ═══════════════════════════════════════════════
   Il 18 agosto l'app e diventata bianca per alcuni secondi, piu volte, e le
   spiegazioni possibili erano almeno otto: ricaricamento, riavvio della PWA,
   WebKit che uccide la pagina, cambio di service worker, interfaccia fuori
   dalla finestra, tema applicato tardi, disegno fallito, memoria.
   Senza strumenti, ognuna di quelle costa una versione per essere esclusa.

   LA REGOLA CHE RENDE QUESTA SCATOLA SICURA NON E UNA PROMESSA, E UNA FORMA:
   qui non si scrive testo. Si scrive un CODICE preso da una tabella chiusa e
   due numeri. Non c'e nessun modo di far entrare una trascrizione, il titolo di
   una cosa da fare, una riga del diario o una posizione: non esiste il campo.
   Non e «stiamo attenti a non registrare» - e «non si puo».

   Vive in un magazzino suo, separato dal registro del cantiere: quello e il
   corpus privato dell'IA e contiene le parole della persona. Questi sono
   ingranaggi. Due cose diverse non stanno nello stesso cassetto.

   LA DOMANDA A CUI DEVE SAPER RISPONDERE, e per cui e nata:
   quando lo schermo torna bianco, e la PAGINA che e morta o e l'INTERFACCIA che
   e sparita? Se nel nastro compare una «sessione» nuova, la pagina e ripartita
   (ricaricamento, o iOS che ha ucciso la PWA). Se non compare, la pagina era
   viva e il guasto e nel disegno o nella posizione. Sono due mondi diversi e
   fin qui non sapevamo distinguerli. */
const SCATOLA_LS='sentiero-scatola-v1';
const SCATOLA_TETTO=400;              /* nastro circolare: le vecchie escono da sole */
/* la tabella chiusa. Un codice che non e qui dentro non entra. */
const SCATOLA_VOCI={
  ses:'sessione nuova (n1=numero, n2=generazione dell\'HTML che l\'ha aperta)',
  avv:'app pronta',
  pgs:'pageshow  (n1=1 se ripresa dalla cache di iOS)',
  pgh:'pagehide  (n1=1 se messa in cache invece che chiusa)',
  vis:'tornata in primo piano',
  nas:'andata in secondo piano',
  swc:'il service worker che comanda e cambiato',
  swn:'c\'e una versione nuova in attesa',
  bgv:'base linguistica scartata (n1: 1 timbro di un\'altra generazione, 0 senza timbro)',
  swg:'generazione del service worker che serve la pagina (n1, 0 = non si e presentato)',
  gnu:'gesto nuovo: un dito ha preso possesso',
  gd2:'un secondo dito e stato ignorato (Sentiero e monodito)',
  gfi:'gesto finito (n1=1 se annullato dal sistema)',
  gsi:'gesto chiuso d\'ufficio (n1: 1 pagehide, 2 secondo piano)',
  gkn:'un click e stato fermato: il contatto non apparteneva a quel comando',
  gks:'attivazione da tastiera o lettore di schermo: sempre permessa',
  vwp:'la finestra e cambiata (n1=larghezza, n2=altezza)',
  nav:'destinazione (n1: 0 parla, 1 oggi, 2 diario, 3 altro)',
  pan:'destinazione, come la vede segnaMondo (stessa scala di nav)',
  mnd:'mondo (n1: 1 vivo, 0 coperto)',
  mgi:'dito giu sul microfono (storico: Lab 4 e precedenti)',
  mtp:'tocco microfono (n1: 1 avvia, 2 ferma)',
  mrx:'riconoscitore rilasciato: pronto per un nuovo uso',
  mav:'avvio del riconoscimento',
  mon:'il microfono e davvero aperto',
  msu:'dito su',
  mst:'chiusura normale',
  mko:'chiusura anomala (n1: 1 start, 2 permesso, 3 riavvio)',
  msv:'parole salvate dopo la chiusura anomala (n1=1 se c\'era del testo)',
  err:'errore JS (n1: tipo, n2: riga)',
  /* ══ v270.2 — LE FASI DEL SUSSURRO ═════════════════════════════════════════
     Undici momenti piu tre della brace e uno del guardiano. Sono NUMERI e
     basta: la privacy qui non e una promessa, e la forma. Non esiste un campo
     dove potrebbe finire una parola sua, quindi non ci puo finire. */
  sug:'sussurro: generazione richiesta',
  spr:'sussurro: preparazione conclusa (n1=byte del pacchetto)',
  sre:'sussurro: richiesta di rete partita',
  sri:'sussurro: risposta ricevuta (n1=ms, n2: 0 niente, 1 riga, 2 errore)',
  spa:'sussurro: parsing concluso (n1=1 riga tenuta, 0 scartata dal giudice)',
  sps:'sussurro: persistenza conclusa',
  srn:'sussurro: rendering iniziato',
  srf:'sussurro: rendering concluso',
  san:'sussurro: animazione iniziata',
  saf:'sussurro: animazione conclusa',
  sfi:'sussurro: generazione conclusa (n1: 0 silenzio, 1 riga, 2 veto, 3 sorpassata, 4 errore, 5 uscita senza esito; n2=ms)',
  sab:'sussurro: interrotto (n1: 1 errore, 2 annullato da una spunta piu recente)',
  sbc:'brace: accompagnamento troncato, la richiesta e piu lunga (n1=ms)',
  sbn:'brace: spenta perche la pagina e andata in secondo piano',
  sgu:'il ciclo degli eventi si e fermato (n1=ms di ritardo)',
  prm:'promessa rifiutata (n1: tipo)'
};
const SCATOLA_ERR={TypeError:1,ReferenceError:2,RangeError:3,SyntaxError:4,DOMException:5,Error:6};
/* ══ v270.2 — IL GUARDIANO. ═══════════════════════════════════════════════════
   Un blocco non lascia traccia: non e un errore, non e un'eccezione, e
   semplicemente del tempo in cui non e successo niente. Nel nastro appariva
   come un buco, e un buco puo essere anche una persona che ha posato il
   telefono. Questo guardiano batte un colpo al secondo e misura quanto e in
   ritardo: se il ciclo degli eventi e stato fermo, il ritardo lo dice.
   Costa un confronto al secondo, e non tocca niente di suo.
   Il primo battito dopo un ritorno in primo piano non si conta: iOS rallenta i
   timer in secondo piano, e quel ritardo non e uno stallo - e una tasca. */
let _guTeso=0,_guSalta=true,_guUlt=0;
try{
  addEventListener('visibilitychange',function(){ _guSalta=true; });
  setInterval(function(){
    try{
      const ora=performance.now();
      const rit=_guTeso?(ora-_guTeso-1000):0;
      _guTeso=ora;
      if(_guSalta){ _guSalta=false; return; }
      if(rit>250&&ora-_guUlt>2000){ _guUlt=ora; nota('sgu',Math.min(60000,rit)); }
    }catch(_){}
  },1000);
}catch(_){}
/* ══ v269.8 — CHI HA PRODOTTO QUESTO EVENTO? ════════════════════════════════
   Il nastro sopravvive agli aggiornamenti: puo contenere una sessione fatta
   dalla generazione N-1 seguita da una fatta da N. Alla v269.7 non c'era modo
   di attribuirle, e «swc» diceva che il controllore era cambiato senza dire da
   cosa a cosa. Il commento prometteva piu di quanto il nastro contenesse.
   Senza aprire un campo di testo: la generazione diventa un NUMERO, ricavato
   dalla versione. v60S.269.8 -> 269008. Ogni sessione porta con se il numero
   dell'HTML che l'ha aperta, e - appena il worker risponde - quello del worker
   che la sta servendo. Un worker vecchio, che non conosce la domanda, non
   risponde: e zero, e «zero» e a sua volta un'informazione utile. */
function _genNumero(v){
  try{
    const t=String(v||APP_VERSION||'').split('\u00b7')[0];
    const m=t.match(/(\d+)(?:\.(\d+))?\s*$/);
    if(!m) return 0;
    return (parseInt(m[1],10)||0)*1000+(parseInt(m[2]||'0',10)||0);
  }catch(_){ return 0; }
}
let _scatola=[],_scatolaSes=0,_scatolaPen=0;
function scatolaLeggi(){
  try{ const r=JSON.parse(localStorage.getItem(SCATOLA_LS)||'null');
    if(r&&Array.isArray(r.n)) { _scatola=r.n.slice(-SCATOLA_TETTO); _scatolaSes=(r.s|0); } }catch(_){}
}
function scatolaScrivi(){
  _scatolaPen=0;
  try{ localStorage.setItem(SCATOLA_LS,JSON.stringify({s:_scatolaSes,n:_scatola.slice(-SCATOLA_TETTO)})); }catch(_){}
}
/* nota(codice, numero, numero). Nient'altro puo entrare, per costruzione. */
function nota(cod,n1,n2){
  try{
    /* si prova la PRESENZA della chiave, non la verita del valore: una voce con
       descrizione vuota sarebbe stata scartata in silenzio. Trovato dal banco. */
    if(!Object.prototype.hasOwnProperty.call(SCATOLA_VOCI,cod)) return;
    const v=[Date.now()%86400000,cod];                   /* solo l'ora del giorno, in millesimi */
    if(Number.isFinite(n1)) v.push(Math.round(n1));
    if(Number.isFinite(n2)) v.push(Math.round(n2));
    _scatola.push(v);
    if(_scatola.length>SCATOLA_TETTO) _scatola=_scatola.slice(-SCATOLA_TETTO);
    /* si scrive con calma: un nastro che rallenta l'app non serve a niente */
    if(!_scatolaPen) _scatolaPen=setTimeout(scatolaScrivi,1500);
  }catch(_){}
}
/* la stretta di mano: una domanda, una risposta, niente protocollo. Se il
   worker e di prima della v269.8 non risponde e resta zero. */
function _chiediGenerazioneWorker(){
  try{
    const sw=navigator.serviceWorker;
    if(!sw||!sw.controller){ nota('swg',0); return; }
    const mc=new MessageChannel();
    let risposto=false;
    mc.port1.onmessage=function(e){
      risposto=true;
      const g=(e&&e.data&&Number(e.data.gen))||0;
      nota('swg',Number.isFinite(g)?g:0);
    };
    sw.controller.postMessage({q:'gen'},[mc.port2]);
    setTimeout(function(){ if(!risposto) nota('swg',0); },1500);
  }catch(_){ try{ nota('swg',0); }catch(__){} }
}
/* ══ v269.8 — DUE ARTEFATTI, NON UNO ════════════════════════════════════════
   La scatola nera e privata per costruzione. Il suo mezzo di trasporto no: alla
   v269.7 usciva DENTRO il backup completo, cioe dentro Object.assign({},S,...),
   che contiene esattamente la vita che la scatola era stata progettata per non
   chiedere. Scatola sicura non vuol dire file sicuro da mandare.
   Da qui in poi sono due cose diverse, e si chiamano diversamente:

     BACKUP        e della persona. Contiene la sua vita. Serve a portarsela via.
     DIAGNOSTICA   e per chi ripara. Non contiene niente di lei.

   E costruita per LISTA BIANCA: si parte dal vuoto e si aggiunge solo cio che
   serve a distinguere una causa. Non si copia lo stato per poi togliere i campi
   privati - quella e la strada per cui, prima o poi, ne resta uno.
   Dello stato escono soltanto CONTEGGI: quante note, quante cose, quanti byte.
   Un numero non e un contenuto, e serve a capire se il telefono e sotto sforzo. */
function _frontAIWiring(){
  const id=x=>!!document.getElementById(x);
  const fn=x=>{ try{ return typeof window[x]==='function'; }catch(_){ return false; } };
  /* Non misura se Gemini e bravo: misura se ogni uscita del motore ha ancora
     un posto REALE nel front. `terra` resta esclusa: dalla v271 e scollegata
     intenzionalmente e preparaDomandaTerra() ritorna subito. */
  return {
    distill:fn('askDistill')&&id('proposte'),
    ocr:fn('leggiPagina')&&id('st-letto')&&id('stanza-txt'),
    observer:fn('askObserver')&&id('list-diario'),
    sussurro:fn('observerLineFor')&&fn('_whisper'),
    frutto:fn('fruttoDiOggi')&&id('frutto-soglia'),
    seme:fn('semeScrivi')&&id('day-line'),
    desiderio:fn('askDesiderioResult')&&fn('_stanzaApri'),
    pietra:fn('prossimaPietra')&&fn('_stanzaApri'),
    sfida:fn('askSfida')&&id('list-quest-today'),
    capitolo:fn('askCapitolo')&&id('capitoli')
  };
}
function diagnosticaSicura(){
  const d={formato:1, quando:new Date().toISOString().slice(0,19)};
  try{ d.versione={html:String(APP_VERSION||''), generazione:_genNumero()}; }catch(_){}
  try{
    d.dispositivo={
      ua:String(navigator.userAgent||'').slice(0,180),
      viewport:[window.innerWidth|0,window.innerHeight|0],
      schermo:[(screen&&screen.width)|0,(screen&&screen.height)|0],
      dpr:Math.round((window.devicePixelRatio||1)*100)/100,
      lingua:String(navigator.language||'').slice(0,12),
      ridottoMovimento:(function(){ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches?1:0; }catch(_){ return -1; } })(),
      inHome:(function(){ try{ return (matchMedia('(display-mode: standalone)').matches||navigator.standalone)?1:0; }catch(_){ return -1; } })(),
      memoria:(navigator.deviceMemory|0)||0
    };
  }catch(_){}
  /* SOLO NUMERI. Nessun titolo, nessuna riga, nessuna data della sua vita. */
  try{
    const b=JSON.stringify(S||{});
    d.quanto={
      byteStato:b.length,
      note:((S&&S.diary)||[]).length,
      cose:((S&&S.quests)||[]).length,
      ricorrenti:((S&&S.scheduled)||[]).length,
      osservazioni:((S&&S.observerNotes)||[]).length,
      conChiave:GEMINI_KEY?1:0,
      chiaveInStorage:(function(){ try{ return String(localStorage.getItem(GEMINI_KEY_LS)||'').trim()?1:0; }catch(_){ return -1; } })(),
      baseLinguistica:((_baseLing()&&(_baseLing().versione|0)>0)?1:0)
    };
  }catch(_){}
  try{
    const _b=_baseLing();
    d.baseLingua={
      origine:(S&&S.baseLing)?'pubblicata-validata':'incorporata-completa',
      versione:(_b&&_b.versione)|0,
      impronta:String((_b&&_b.impronta)||'').slice(0,80),
      parole:Array.isArray(_b&&_b.nucleo)?_b.nucleo.length:0,
      prescrizioni:Array.isArray(_b&&_b.prescrizione)?_b.prescrizione.length:0,
      gergo:Array.isArray(_b&&_b.gergo)?_b.gergo.length:0,
      ultimoEsito:String((_BASE_ULTIMO_ESITO&&_BASE_ULTIMO_ESITO.esito)||'').slice(0,32),
      canale:String((_BASE_ULTIMO_ESITO&&_BASE_ULTIMO_ESITO.canale)||'').slice(0,20),
      ricevutoPerVersione:String((_BASE_ULTIMO_ESITO&&_BASE_ULTIMO_ESITO.per_versione)||'').slice(0,40),
      ricevutoVersione:Number((_BASE_ULTIMO_ESITO&&_BASE_ULTIMO_ESITO.versione)||0),
      ricevutoImpronta:String((_BASE_ULTIMO_ESITO&&_BASE_ULTIMO_ESITO.impronta)||'').slice(0,80)
    };
  try{ d.frontAI=_frontAIWiring(); }catch(_){}
  }catch(_){}
  try{
    const g=geometriaVoce(), e=window._ensoView||null;
    d.geometriaVoce={mic:[Math.round(g.x),Math.round(g.y),Math.round(g.w)],enso:e?[Math.round(e.cx),Math.round(e.cy)]:null,
      deltaEnsoPx:e?Math.round(Math.hypot(g.x-e.cx,g.y-e.cy)*10)/10:null};
  }catch(_){}
  try{ const q=window._questMotionDiag||{}; d.movimentoQuest={targetHz:Number(q.targetHz)||60,frameMs:Number(q.frameMs)||16.667,runs:Number(q.runs)||0,blue:Number(q.blue)||0,red:Number(q.red)||0,purple:Number(q.purple)||0,undo:Number(q.undo)||0,cancelled:Number(q.cancelled)||0,fallback:Number(q.fallback)||0,lastStep:Number(q.lastStep)||0,lastPhase:String(q.lastPhase||'').slice(0,12),lastFrames:Number(q.lastFrames)||0,lastMs:Number(q.lastMs)||0,probeAvvio:0}; }catch(_){}
  /* Solo contatori tecnici del giorno: nessun prompt, risposta o contenuto. */
  try{
    const tk=todayKey(), tutti=(S.registro||[]).filter(e=>e&&e.tipo==='gemini');
    const rr=tutti.filter(e=>String(e.t||'').slice(0,10)===tk);
    const _sommaGemini=function(a){ return {
      operazioni:a.length,
      richiesteApi:a.reduce((n,e)=>n+(Number.isFinite(e.api)?e.api:0),0),
      riuscite:a.filter(e=>e.msg==='ok').length,
      fallite:a.filter(e=>String(e.msg||'').startsWith('errore:')).length,
      sospese:a.filter(e=>String(e.msg||'').startsWith('pausa:')).length,
      rateLimit429:a.reduce((n,e)=>{ const hops=(String(e.salti||'').match(/:429/g)||[]).length; return n+Math.max(Number(e.http)===429?1:0,hops); },0),
      inputToken:a.reduce((n,e)=>n+(Number.isFinite(e.tin)?e.tin:0),0),
      outputToken:a.reduce((n,e)=>n+(Number.isFinite(e.tout)?e.tout:0),0),
      thinkingToken:a.reduce((n,e)=>n+(Number.isFinite(e.think)?e.think:0),0),
      retry:a.reduce((n,e)=>{ const m=String(e.salti||'').match(/retry:(\d+)/); return n+(m?Number(m[1]):0); },0),
      background:a.filter(e=>Number(e.background)===1).length,
      pollBackground:a.reduce((n,e)=>n+(Number(e.poll)||0),0),
      deleteBackgroundFallite:a.filter(e=>Number(e.deleted)<0).length
    }; };
    d.geminiOggi=_sommaGemini(rr);
    /* Lab 22: una diagnostica presa alle 00:01 non deve cancellare la prova
       delle 23:59. I contatori restano giornalieri, ma gli ultimi eventi
       attraversano la mezzanotte e aggiungiamo un riepilogo del giorno prima. */
    const yd=new Date(tk+'T12:00:00'); yd.setDate(yd.getDate()-1); const yk=yd.toISOString().slice(0,10);
    d.geminiIeri=_sommaGemini(tutti.filter(e=>String(e.t||'').slice(0,10)===yk));
    d.geminiUltimi=tutti.slice(-12).map(e=>({quando:String(e.t||'').slice(0,19),task:String(e.task||'').slice(0,24),model:String(e.model||'').slice(0,32),profile:String(e.profile||'').slice(0,12),provider:String(e.provider||'interactions').slice(0,20),resolution:String(e.resolution||'').slice(0,12),status:String(e.status||'').slice(0,16),format:String(e.format||'').slice(0,8),msg:String(e.msg||'').slice(0,32),ms:Number(e.ms)||0,tin:Number(e.tin)||0,tout:Number(e.tout)||0,think:Number(e.think)||0,http:Number(e.http)||0,api:Number(e.api)||0,background:Number(e.background)||0,poll:Number(e.poll)||0,deleted:Number(e.deleted)||0,rate:String(e.rate||'').slice(0,40),wait:Number(e.wait)||0,salti:String(e.salti||'').slice(0,120)}));
    const mods=[...new Set([].concat(AI_CHAINS.max.heavy,AI_CHAINS.max.cheap,AI_CHAINS.balanced.heavy,AI_CHAINS.balanced.cheap,AI_CHAINS.fast.heavy))];
    d.geminiCooldown=mods.map(m=>{ const x=_aiRateGet(m); return x?{model:m,kind:x.kind||'limite',code:x.code||'',secondi:Math.max(1,Math.ceil((x.until-Date.now())/1000))}:null; }).filter(Boolean);
  }catch(_){}
  try{ scatolaScrivi(); d.scatola={voci:SCATOLA_VOCI,sessione:_scatolaSes,nastro:_scatola.slice(-SCATOLA_TETTO)}; }catch(_){}
  return d;
}
function scaricaDiagnostica(){
  try{
    const j=JSON.stringify(diagnosticaSicura(),null,1);
    const blob=new Blob([j],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='sentiero-diagnostica-'+todayKey()+'.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(_){} },1000);
    toast('Diagnostica salvata: ingranaggi, non i tuoi dati');
  }catch(_){ toast('Non sono riuscito a salvarla'); }
}
function scatolaAvvia(){
  scatolaLeggi();
  _scatolaSes=(_scatolaSes|0)+1;
  /* n1 = quale sessione, n2 = QUALE GENERAZIONE l'ha aperta. Da qui ogni evento
     che segue appartiene a quella, finche non compare la sessione dopo. */
  nota('ses',_scatolaSes,_genNumero());
  scatolaScrivi();
  /* e la domanda al worker: «chi sta servendo questa pagina?» */
  try{ _chiediGenerazioneWorker(); }catch(_){}
  try{
    nota('vwp',window.innerWidth,window.innerHeight);
    addEventListener('pageshow',function(e){ nota('pgs',(e&&e.persisted)?1:0); });
    addEventListener('pagehide',function(e){ nota('pgh',(e&&e.persisted)?1:0); scatolaScrivi(); });
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){ nota('nas'); scatolaScrivi(); } else { nota('vis'); } });
    let _rt=0;
    addEventListener('resize',function(){ if(_rt) return;
      _rt=setTimeout(function(){ _rt=0; nota('vwp',window.innerWidth,window.innerHeight); },400); });
    addEventListener('error',function(e){
      const t=(e&&e.error&&e.error.constructor&&SCATOLA_ERR[e.error.constructor.name])||0;
      nota('err',t,(e&&e.lineno)||0); });
    addEventListener('unhandledrejection',function(e){
      const r=e&&e.reason; const t=(r&&r.constructor&&SCATOLA_ERR[r.constructor.name])||0;
      nota('prm',t); });
    if(navigator.serviceWorker){
      navigator.serviceWorker.addEventListener('controllerchange',function(){
        nota('swc'); try{ _chiediGenerazioneWorker(); }catch(_){} scatolaScrivi(); });
    }
  }catch(_){}
}
/* si accende subito: se l'app muore fra dieci secondi, i dieci secondi ci sono */
try{ scatolaAvvia(); }catch(_){}
/* ═══════════════════════════════════════════════════════════════════════════
   L'ARBITRO DEL GESTO — un contatto fisico, un proprietario, un'interpretazione.

   PERCHE ESISTE. Nel sorgente di Sentiero ci sono quattordici ascoltatori di
   gesto agganciati a window o document, usati da quattro macchine indipendenti
   (trascinamento del foglio, gesto del microfono, pressione lunga della stanza,
   pressione lunga del verdetto). Ognuna decide da se se il dito e suo, e una
   sola consulta nelMondo(). Il trascinamento del foglio e il gesto del
   microfono ascoltano ENTRAMBI pointermove su window, per lo stesso dito: che
   non si pestino i piedi dipende da due variabili che nessuno confronta mai.

   L'INVARIANTE, nella forma che regge anche ai bordi:

     una singola intenzione fisica non viene interpretata contemporaneamente da
     due macchine; le attivazioni semantiche native restano disponibili.

   Tre conseguenze, e sono le tre cose che questo file rende vere:

   1 · UN CONTATTO, UN PROPRIETARIO, DECISO UNA VOLTA.
       Il proprietario e legato al pointerId, non a una variabile globale. Il
       primo pointer ammesso acquisisce il gesto; un secondo dito NON puo
       cambiare la proprieta del primo, e il suo pointerup non termina il gesto
       altrui. Sentiero e monodito per decisione dichiarata: il secondo contatto
       viene ignorato, non arbitrato.

   2 · LA GEOMETRIA PUO CAMBIARE, L'IDENTITA NO.
       Dopo il pointerdown il foglio puo muoversi, la tastiera aprirsi, il nodo
       sparire, l'orientamento girare. Il proprietario resta quello. Si esce
       solo con un evento terminale dichiarato: pointerup, pointercancel, o una
       cancellazione sistemica (pagehide, la pagina che va in secondo piano,
       il nodo che lascia il documento). Niente proprietari zombie.

   3 · IL CLICK NON E UNA SECONDA AUTORITA.
       Un <button> deve restare un <button>: tastiera, VoiceOver, Invio. Quindi
       non si vieta il click. Si distingue:
         · click con detail === 0  ->  attivazione SEMANTICA (tastiera, lettore
           di schermo, .click() da codice). Sempre permessa: non nasce da un
           contatto fisico e non puo essere in conflitto con nessuno.
         · click con detail > 0    ->  generato dal contatto fisico appena
           finito. Permesso solo se QUEL contatto apparteneva a questo comando.
       Cosi il singolo contatto resta interpretato una volta sola, e chi usa la
       tastiera non perde niente.

   USO
     const ARB = arbitroDelGesto({
       macchine: [ {nome:'foglio', dove:'#app', priorita:1},
                   {nome:'voce',   dove:'#mic', priorita:3} ],
       suRegistro: (cod,n1,n2) => nota(cod,n1,n2)      // facoltativo
     });
     ARB.mio('voce', e)     -> true se questo evento appartiene alla voce
     ARB.proprietario()     -> nome del proprietario corrente, o null
   ═══════════════════════════════════════════════════════════════════════════ */
function arbitroDelGesto(opz) {
  const MACCHINE = (opz && opz.macchine) || [];
  const registra = (opz && opz.suRegistro) || function () { };
  /* LA CAMPANA. Un arbitro che sa solo dire «non e tuo» crea un guaio nuovo:
     se cancella il gesto per conto suo - la pagina che sparisce, lo schermo che
     si spegne - la macchina proprietaria non riceve piu il proprio pointerup e
     resta aperta. Quindi quando l'arbitro chiude d'ufficio, AVVISA chi possedeva.
     E la stessa lezione della v269.2: chi termina qualcosa deve riportare a casa
     chi la stava usando. */
  const avvisa = (opz && opz.suCancellazione) || function () { };
  const doc = (opz && opz.document) || document;
  const win = (opz && opz.window) || window;

  /* lo stato: UNO solo, legato a un pointerId preciso, e con DUE momenti
     distinti che alla prima stesura erano uno solo (vedi «finisci»). */
  let gesto = null;   /* {id, macchina, nato, bersaglio, finito} */
  let ultimo = null;  /* l'ultimo gesto concluso: serve a giudicare il click */

  function scegli(bersaglio) {
    let vinta = null;
    for (const m of MACCHINE) {
      if (!m.dove) continue;
      try { if (bersaglio && bersaglio.closest && bersaglio.closest(m.dove)) {
        if (!vinta || m.priorita > vinta.priorita) vinta = m; } } catch (_) { }
    }
    return vinta || MACCHINE.filter(m => !m.dove)[0] || null;
  }

  function giu(e) {
    /* IL SECONDO DITO NON ESISTE. Non si arbitra: si ignora. Sentiero e
       monodito, e dichiararlo qui e piu onesto che scoprirlo in un bordo.
       ATTENZIONE: perche questo valga davvero, anche gli INGRESSI delle
       macchine devono chiedere «e mio?» prima di partire. Ignorare il secondo
       dito qui dentro e inutile se poi la macchina parte lo stesso: e
       esattamente il difetto della v269.9, dove il secondo dito avviava un
       trascinamento che non avrebbe mai ricevuto la propria fine. */
    if (gesto && !gesto.finito) { registra('gd2', 1); return; }
    const m = scegli(e.target);
    gesto = { id: e.pointerId, macchina: m ? m.nome : null, nato: Date.now(), bersaglio: e.target };
    registra('gnu', 1);
  }
  /* ══ «TERMINALE RICEVUTO» NON E «PROPRIETA LIBERATA» ══════════════════════
     Alla prima stesura questa funzione faceva «gesto = null» subito. Ma
     l'arbitro ascolta in CATTURA e le macchine in BOLLA: su window la cattura
     arriva prima e la bolla dopo. Quindi la sequenza reale era

       pointerup -> arbitro (cattura) -> gesto=null -> macchina (bolla)
                 -> «e mio?» -> NO -> il proprietario non riceve la sua fine

     cioe l'arbitro conteneva esattamente la classe che doveva eliminare:
     qualcuno dichiarava morto il gesto prima che il proprietario potesse
     riportarsi a casa. Provato: quattro terminali su quattro non arrivavano.

     Adesso i due momenti sono separati. Al terminale il gesto viene MARCATO
     finito - e continua a rispondere «si, e tuo» al proprietario per tutto il
     resto della propagazione - e viene LIBERATO in una microtask, cioe appena
     la propagazione e conclusa e prima di qualunque altro evento.
     La microtask non e un ritardo scelto a caso: e il primo istante in cui si
     e sicuri che la bolla e finita. */
  function liberaDopo() {
    const fine = function () { if (gesto && gesto.finito) gesto = null; };
    try { Promise.resolve().then(fine); }
    catch (_) { try { setTimeout(fine, 0); } catch (__) { gesto = null; } }
  }
  function finisci(e, cancellato) {
    if (!gesto || gesto.finito) return;
    /* solo il pointer PROPRIETARIO puo chiudere il gesto. Il pointerup di un
       secondo dito non tocca niente: era proprio il bordo da chiudere. */
    if (e && e.pointerId !== undefined && e.pointerId !== gesto.id) return;
    gesto.finito = true;
    ultimo = { macchina: gesto.macchina, bersaglio: gesto.bersaglio, fine: Date.now(), cancellato: !!cancellato };
    registra('gfi', cancellato ? 1 : 0);
    liberaDopo();
  }
  /* la cancellazione sistemica: se la pagina sparisce, il gesto e finito.
     Un proprietario che sopravvive alla pagina e uno zombie. */
  function cancellaTutto(perche) {
    /* la campana suona SOLO quando non c'e un terminale consegnabile. Se il
       gesto e gia stato chiuso da un pointerup o da un pointercancel, la
       macchina si e gia riportata a casa da sola: suonare adesso sarebbe la
       seconda chiusura. Ne due ne zero: esattamente una. */
    if (!gesto || gesto.finito) return;
    const chi = gesto.macchina;
    finisci({ pointerId: gesto.id }, true);
    registra('gsi', perche | 0);
    try { avvisa(chi, perche | 0); } catch (_) { }
  }

  try {
    win.addEventListener('pointerdown', giu, true);
    win.addEventListener('pointerup', e => finisci(e, false), true);
    win.addEventListener('pointercancel', e => finisci(e, true), true);
    win.addEventListener('pagehide', () => cancellaTutto(1), true);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancellaTutto(2); }, true);
  } catch (_) { }

  /* IL CLICK. Non si vieta: si giudica solo quello nato da un contatto. */
  function giudicaClick(e) {
    /* v275 LAB — IL MICROFONO NON E PIU UNA MACCHINA DI GESTO.
       Il suo click e l'autorita primaria start/stop e non deve essere vetoato
       dall'arbitro storico se Safari chiude il pointer con pointercancel. */
    try{ if(e.target&&e.target.closest&&e.target.closest('#mic,#btn-fermo')) return true; }catch(_){}
    const semantico = !e.detail;          /* 0 = tastiera, lettore di schermo, .click() */
    if (semantico) { registra('gks', 0); return true; }
    const m = scegli(e.target);
    const nome = m ? m.nome : null;
    /* il contatto appena concluso apparteneva a questo comando? */
    const buono = ultimo && ultimo.macchina === nome && !ultimo.cancellato;
    if (!buono) { registra('gkn', 1);
      try { e.preventDefault(); e.stopPropagation(); } catch (_) { } }
    return !!buono;
  }
  try { win.addEventListener('click', giudicaClick, true); } catch (_) { }

  return {
    /* la domanda che ogni macchina fa, al posto di deciderlo da sola */
    mio(nome, e) {
      if (!gesto) return false;
      if (e && e.pointerId !== undefined && e.pointerId !== gesto.id) return false;
      return gesto.macchina === nome;
    },
    /* «chi possiede un gesto IN CORSO». Un gesto gia terminato non e piu di
       nessuno, anche se la proprieta viene liberata un istante dopo per poter
       consegnare il terminale: le due domande sono diverse e vanno tenute
       diverse. mio() dice «questo evento e tuo» - e vero anche durante la
       consegna della fine; proprietario() dice «c'e un gesto aperto». */
    proprietario() { return (gesto && !gesto.finito) ? gesto.macchina : null; },
    pointerProprietario() { return (gesto && !gesto.finito) ? gesto.id : null; },
    ultimoConcluso() { return ultimo; },
    /* per i banchi e per le cancellazioni dichiarate dall'app */
    cancella(perche) { cancellaTutto(perche || 0); },
    _giudicaClick: giudicaClick
  };
}
/* ══ v269.9 — L'ARBITRO ENTRA, E SOLO SU DUE MACCHINE ═══════════════════════
   v274: la voce non passa piu da questo arbitro. Il microfono e un button
   start/stop e non ascolta pointermove. L'arbitro resta soltanto come guardia
   storica dei contatti dell'interfaccia generale.

   IL RITORNO INDIETRO E UNA RIGA. Se sul dispositivo qualcosa non torna,
   ARBITRO_ACCESO=false e il gesto ridiventa esattamente quello della v269.8:
   le guardie sono tutte della forma «se l'arbitro e spento, passa».

   LA CAMPANA: quando l'arbitro chiude d'ufficio un gesto - la pagina che va in
   secondo piano, pagehide - avvisa chi lo possedeva. Senza, il microfono
   resterebbe aperto senza mai ricevere il proprio pointerup: sarebbe la stessa
   classe del P0 del 18 agosto, creata da noi con una funzione nuova. */
const ARBITRO_ACCESO=true;
let ARB=null;
try{
  ARB=arbitroDelGesto({
    macchine:[{nome:'foglio',dove:'#app',priorita:1},
              {nome:'mondo',dove:null,priorita:0}],
    suRegistro:function(c,n1,n2){ try{ nota(c,n1,n2); }catch(_){} },
    suCancellazione:function(chi){
      try{
        if(chi==='foglio'&&typeof window._fogliOraBasta==='function') window._fogliOraBasta();
      }catch(_){}
    }
  });
}catch(_){ ARB=null; }
/* la domanda, in una forma sola: «questo evento e mio?». Con l'arbitro spento
   risponde sempre di si, cioe il comportamento di prima. */
function mioGesto(nome,e){
  if(!ARBITRO_ACCESO||!ARB) return true;
  return ARB.mio(nome,e);
}
/* ══ v270 — UNA SOLA AUTORITA SULLA DESTINAZIONE ═══════════════════════════
   Prima «dove sono» era una posizione geometrica (picco/mezzo/pieno) decisa da
   quattro macchine di gesto, e la si negoziava col dito. Adesso e uno STATO,
   e ha un autore solo: NAV.vai().

   Le proprieta che questo modello rende vere per costruzione:
     · un tap di navigazione naviga; niente altro naviga;
     · nessun pointercancel, secondo dito, scroll, resize o tastiera puo
       cambiare destinazione: nessuno di loro chiama NAV.vai;
     · ogni destinazione ha il proprio scroll, salvato quando si esce e
       rimesso quando si torna;
     · lo scroll della UI NON entra nello stato della persona: vive qui, in
       memoria, e se si perde si perde una comodita, non un ricordo.
   La barra e fatta di <a>: un tocco e un click, e un click non ha bisogno di
   nessun arbitro per dire «Diario». */
const NAV_SEZIONI=['parla','oggi','diario','altro'];
const NAV={corrente:'parla',scroll:{parla:0,oggi:0,diario:0,altro:0}};
function _navCorpo(sez){
  /* v270.2 — il corpo che scorre di Parla non e piu #mic-wrap: da quando il
     Mondo e una composizione a fulcro, #mic-wrap tiene ferma la voce e sono le
     due zone a scorrere. Quella che porta il contenuto lungo - Lascito,
     Rivelazione, letture, trascritto - e #mondo-giu, e quindi e la sua la
     posizione che vale la pena ritrovare tornando. Il ripiego resta #mic-wrap:
     se un domani le zone non ci fossero piu, si torna a scorrere il
     contenitore invece di perdere silenziosamente la funzione. */
  if(sez==='parla') return document.getElementById('mondo-giu')||document.getElementById('mic-wrap');
  return document.querySelector('#app>main');
}
function navVai(sez,perche){
  try{
    if(NAV_SEZIONI.indexOf(sez)<0) return;
    const vecchia=NAV.corrente;
    if(vecchia===sez&&document.body.getAttribute('data-sez')===sez) return;
    if(vecchia==='oggi'&&sez!=='oggi') try{ if(window._settleTodayMotion) window._settleTodayMotion('nav'); }catch(_){}
    /* si mette da parte lo scroll di dove si era, PRIMA di cambiare */
    try{ const cv=_navCorpo(vecchia); if(cv) NAV.scroll[vecchia]=cv.scrollTop; }catch(_){}
    NAV.corrente=sez;
    document.body.setAttribute('data-sez',sez);
    /* «quale schermata» resta quello di prima, per chi lo legge gia */
    try{ document.body.setAttribute('data-pane',sez==='altro'?'impostazioni':(sez==='parla'?'quest':sez)); }catch(_){}
    try{ segnaMondo(); }catch(_){}
    document.querySelectorAll('#barra a').forEach(function(a){
      if(a.getAttribute('data-sez')===sez) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
    /* e si rimette quello di dove si sta andando */
    try{ const cn=_navCorpo(sez); if(cn) cn.scrollTop=NAV.scroll[sez]||0; }catch(_){}
    try{ nota('nav',NAV_SEZIONI.indexOf(sez)); }catch(_){}
    /* v270: quale delle due pile si vede lo decide data-sez, in CSS. */
    /* v270.1 — ENTRANDO IN ALTRO, IL PANNELLO SI RICOSTRUISCE.
       Finche Altro era un pannello nascosto, qualcun altro lo ridisegnava
       prima di scoprirlo. Adesso e una destinazione: chi ci porta e navVai,
       e quindi tocca a navVai chiedere il contenuto. Senza questa riga Altro
       si raggiunge e si trova vuoto - che e peggio di non raggiungerlo. */
    try{ if(sez==='altro'&&typeof renderSettings==='function') renderSettings(); }catch(_){}
  }catch(_){}
}
/* Oggi e Diario vivono impilati dentro lo stesso <main>: qui si dice quale dei
   due si vede. E l'unico pezzo di geometria rimasto, ed e una classe, non un
   trascinamento. */
function _navMostraOggi(){ try{ document.body.classList.remove('solo-diario'); }catch(_){} }
try{
  document.addEventListener('DOMContentLoaded',function(){
    const b=document.getElementById('barra'); if(!b) return;
    b.addEventListener('click',function(e){
      const a=e.target.closest&&e.target.closest('a[data-sez]');
      if(!a) return; e.preventDefault(); navVai(a.getAttribute('data-sez'),'tap');
    });
  });
}catch(_){}
function _navMostraDiario(){
  try{ document.body.classList.add('solo-diario');
    const m=document.querySelector('#app>main'); if(m) m.scrollTop=NAV.scroll.diario||0; }catch(_){}
}
window.NAV=NAV; window.navVai=navVai;
/* ══ v270 — «IL MONDO E COPERTO?» ADESSO E BANALE ═════════════════════════
   Alla v269.3 questa funzione doveva ricostruire la copertura da due stati
   scritti per altre ragioni (data-pane e data-foglio), ed e li che due lettori
   su due avevano sbagliato. Adesso la domanda ha una risposta diretta: il
   mondo si vede quando la destinazione E il mondo. */
function segnaMondo(){
  try{
    const sez=document.body.getAttribute('data-sez')||'parla';
    const coperto=(sez!=='parla');
    document.body.setAttribute('data-mondo',coperto?'coperto':'vivo');
    try{ nota('mnd',coperto?0:1); nota('pan',NAV_SEZIONI.indexOf(sez)); }catch(_){}
  }catch(_){}
}

/* ══ v270 — showPane NON DECIDE PIU: TRADUCE ═══════════════════════════════
   Restava per compatibilita con i punti che la chiamavano gia. Ma «quale
   schermata» non e piu una posizione del foglio: e una destinazione, e chi la
   decide e navVai. Qui si traduce il vecchio vocabolario nel nuovo, e basta.
     'quest'        -> parla   (era «foglio a picco, la voce e nel mondo»)
     'impostazioni' -> altro
     'diario'       -> diario
     tutto il resto -> oggi                                                */
function showPane(name){
  const dest = (name==='quest')?'parla':(name==='impostazioni')?'altro':(name==='diario')?'diario':'oggi';
  navVai(dest,'showPane');
}

document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>showPane(b.dataset.tab);
});
/* v274 — Altro si raggiunge soltanto dalla quarta voce della barra. */
{ const ph=document.querySelector('#prog-head'); if(ph) ph.onclick=()=>{
  const sec=document.querySelector('#sec-programma');
  const apre=sec.classList.contains('collapsed');   /* sta per aprirsi */
  sec.classList.toggle('collapsed');
  /* all'apertura la pagina ti accompagna: lo spazio si concede DAVANTI agli occhi, non sotto la piega */
  if(apre) setTimeout(()=>{ try{ sec.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_){} },70);
}; }
function foglioDopoVoce(){
  /* se il Motore ha lasciato qualcosa da leggere (letture/lascito/rivelazione), il foglio non lo copre */
  try{
    const vivo=['#letture','#lascito','#rivelazione'].some(function(s){
      const el=document.querySelector(s);
      return el&&!el.classList.contains('hidden')&&el.textContent.trim();
    });
    navVai(vivo?'parla':'oggi');
  }catch(_){ try{ navVai('oggi'); }catch(__){} }
}
/* ══ v270 — IL CASSETTO NON C'E PIU ═══════════════════════════════════════
   Qui vivevano i tre detent (picco, mezzo, pieno), il trascinamento con
   velocita, proiezione, inerzia e gomma, l'handoff scroll->foglio, il morphing
   della testata e i riposizionamenti su resize e focus. Circa novemila
   caratteri di codice il cui compito era decidere QUANTO DELL'APP SI PUO
   VEDERE, e che sulla PWA reale (375x647, iPhone SE) si richiudeva da solo al
   punto da rendere Sentiero inutilizzabile.
   Non e stato riparato: e stato tolto. Al suo posto c'e una navigazione con
   quattro destinazioni, dove «dove sono» e uno stato dichiarato e non una
   posizione geometrica da negoziare col dito.
   Il codice rimosso resta nella release v269.10, che e il reperto. */

document.querySelectorAll('#seg-uitheme button').forEach(b=>{
  b.onclick=()=>{ S.settings.uiTheme=(b.dataset.uitheme==='carta')?'carta':'classico'; save(); applyTheme(); renderSettings(); };
});
document.querySelector('#nov-ok').onclick=()=>{
  try{ document.getElementById('novita').classList.add('hidden'); }catch(_){}
  S.vistoVersione=APP_VERSION; save();
};
document.querySelectorAll('#seg-anim button').forEach(b=>{
  b.onclick=()=>{ S.settings.anim=(b.dataset.anim==='sempre')?'sempre':'auto'; save(); applyTheme(); renderSettings(); };
});
/* diagnosi una-tantum: se iOS riduce il movimento, l'app lo DICE invece di sembrare rotta */
setTimeout(()=>{ try{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches && S.settings.anim!=='sempre' && !localStorage.getItem('sentiero-rm-avvisato')){
    localStorage.setItem('sentiero-rm-avvisato','1');
    toast('iOS ha "Riduci velocita" attivo: le animazioni sono spente. Impostazioni > Animazioni > Sempre per riaccenderle.');
  }
}catch(_){} },1600);

/* v274 — nessun tasto Indietro interno ad Altro: la barra e l'unica navigazione. */

/* ======================================================================
   DETTATURA
   ====================================================================== */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const SR_ANDROID=/Android/i.test(navigator.userAgent||'');   /* su Android il continuous e rotto alla radice (bug storico di Chrome): sessioni brevi e riavvio */
let rec=null,recording=false,committedText='',sessionFinal='',interimText='';
const micBtn=$('#mic'),micLabel=$('#mic-label'),live=$('#live');
if(!SR){ micLabel.textContent='Dettatura non disponibile: scrivi qui sotto.'; live.classList.add('show'); live.contentEditable='true'; }
try{ if(anzianita(S)>=1&&SR){
  const INVITI=['racconta anche cosa ti \u00e8 pesato, oggi','di\u2019 anche come stai, non solo cosa hai fatto','cosa hai rimandato, oggi? si pu\u00f2 dire','se qualcosa ti \u00e8 costato, nominalo'];
  let hsh=0; const tkL=todayKey(); for(let i=0;i<tkL.length;i++) hsh=(hsh*31+tkL.charCodeAt(i))>>>0;
  micLabel.textContent=(hsh%3===0)?INVITI[hsh%INVITI.length]:'';
} }catch(_){}

/* ══ v269.2 — L'USCITA D'EMERGENZA DELLA REGISTRAZIONE ══════════════════════
   L'INVARIANTE: se la registrazione finisce - bene o male - Sentiero torna in
   UNO stato di riposo, sempre lo stesso.
   Fino alla v269.1 c'erano quattro modi di finire e solo due tornavano a casa:
   stopRec() e buttaRegistrazione(). Le altre tre - rec.start() che lancia,
   il permesso negato, il secondo riavvio fallito dentro onend - mettevano
   «recording=false», toglievano una classe e basta. Restavano dietro:
     · _staRegistrando=true, quindi resize e orientationchange MORTI per sempre
       (sono gli unici lavori che passano da lavoroPesante: la tela, il cielo e
       la misura dell'orbita). Su iOS il viewport cambia di continuo: da li in
       poi la tela resta della misura vecchia e le luci orbitali vengono messe
       con una geometria che non corrisponde piu allo schermo.
     · il WAKE LOCK preso, quindi lo schermo che non si spegne piu.
     · la musica abbassata e mai risalita.
     · il tasto «Fermo» acceso senza niente da fermare.
     · il cerchio traslato e sbiadito dal gesto del buttare.
   Qui si torna a casa una volta sola, e chi finisce male passa di qui.
   NON e un refactoring della registrazione: stopRec e buttaRegistrazione
   restano com'erano. Questa e solo la porta che mancava. */
function chiudiRegistrazioneFallita(motivo,msg){
  try{ nota('mko',motivo==='start-sincrono'?1:(motivo==='riavvio-fallito'?3:2)); }catch(_){}
  recording=false;
  try{ _tastoFermo(false); }catch(_){}
  /* la riga che conta: senza, un errore del microfono spegne per sempre la
     reazione ai cambi di dimensione e di orientamento */
  try{ riprendiLavori(); }catch(_){}
  try{ micBtn.classList.remove('rec','arming','butta'); micBtn.style.transform=''; micBtn.style.opacity=''; }catch(_){}
  try{ window._cieloVoce&&window._cieloVoce('quiete'); }catch(_){}
  /* sMicOff e releaseWake sono gia scritti per essere innocui se il microfono
     non era mai partito: stopRec li chiama incondizionatamente dalla v101 */
  try{ sMicOff(); }catch(_){}
  try{ releaseWake(); }catch(_){}
  try{ if(S.settings&&S.settings.music){ MUSIC.recDuck(false); ORCH.duck(false); ATHEME.duck(false); } }catch(_){}
  /* ══ v269.9 — E IL RICONOSCITORE, CHE MI ERO DIMENTICATO ═════════════════
     Trovato dal banco di equivalenza, non rileggendo il codice: confrontando
     gli EFFETTI della macchina vera con quelli del modello, il riconoscimento
     risultava ancora ATTIVO dopo una chiusura anomala. stopRec lo chiude
     (rec.onend=…; rec.stop()), questa uscita no. Su «not-allowed» non cambia
     niente perche non era mai partito; su «service-not-allowed» a sessione
     aperta, e sul riavvio fallito dentro onend, il motore restava acceso senza
     che nessuno lo governasse piu.
     Si azzera onend prima di fermarlo: se no il riavvio automatico riparte
     proprio mentre stiamo chiudendo. */
  if(rec){ const _morto=rec; rec=null; try{ _morto.onend=null; _morto.stop(); }catch(_){} }
  /* v269.6: prima di tutto, le sue parole. Se ce ne sono, la riga della
     rilettura vince sul messaggio d'errore: il guasto glielo diciamo dopo, con
     un avviso di passaggio, ma quello che ha detto lo deve ritrovare. */
  let _salve=false;
  try{ _salve=presentaRaccolto(''); }catch(_){}
  try{ if(msg){ if(_salve) toast(msg); else micLabel.textContent=msg; } }catch(_){}
  try{ regCantiere('microfono',{msg:'chiusura anomala: '+String(motivo||'?').slice(0,60)}); }catch(_){}
  try{ nota('msv',_salve?1:0); }catch(_){}
}
function startRec(){
  if(recording) return;
  /* v274 — ogni uso parte da un riconoscitore nuovo. Un oggetto SpeechRecognition
     terminato non viene mai riciclato: su Safari PWA e' la differenza fra
     "seconda registrazione" e un controllo che sembra morto. */
  if(rec){ const _vecchio=rec; rec=null; try{ _vecchio.onend=null; _vecchio.abort(); }catch(_){} }
  committedText=''; sessionFinal=''; interimText=''; _pausaDa=0;
  rec=new SR();
  rec.lang=locale(); rec.interimResults=true;
  rec.continuous=!SR_ANDROID;   /* iOS: flusso continuo come sempre. Android: UN finale per sessione - impossibile duplicare - e il riavvio in onend cuce i segmenti */
  rec.onstart=()=>{
    /* il microfono è DAVVERO attivo: solo ora invitiamo a parlare ed entriamo in rosso */
    if(!recording) return;
    try{ nota('mon'); }catch(_){}
    micBtn.classList.remove('arming'); micBtn.classList.add('rec');
    try{ window._cieloVoce&&window._cieloVoce('rec'); }catch(_){}   /* la voce prende il cosmo */
    micLabel.textContent='Parla… tocca il cerchio per fermare';
    renderFlow();
    sMicOn(); haptic(); acquireWake();
    try{ if(S.settings.music) MUSIC.recDuck(true); }catch(_){}  /* la musica scende: la voce resta pulita per il riconoscimento */
    try{ if(S.settings.music) ORCH.duck(true); }catch(_){}
    try{ if(S.settings.music) ATHEME.duck(true); }catch(_){}
  };
  rec.onresult=e=>{
    /* ══ LE PAUSE DIVENTANO A CAPO (v251) ═══════════════════════════════════
       Le guide sul parlato lungo dicono che il silenzio fa parte del pensiero, e
       gli studi sulle pause dicono di piu: le pause portano STRUTTURA, sono i
       confini veri di quello che una persona sta dicendo.
       Sentiero quell'informazione ce l'ha gia, e la buttava via. Il motore della
       dettatura si chiude e riparte quando uno tace: fra la chiusura e la parola
       dopo c'e il tempo esatto del respiro. Bastano due orari e una soglia.
       Da qui una nota lunga si scrive con gli a capo DOVE LI HAI FATTI TU:
       riletta un mese dopo ha il tuo ritmo dentro, invece di essere un blocco.
       Due secondi: sotto e un respiro, sopra e un pensiero che cambia. E solo se
       qualcosa era gia stato detto - un a capo in cima non vuol dire niente. */
    if(_pausaDa&&committedText.trim()&&(Date.now()-_pausaDa)>2000){
      if(!/\n\n$/.test(committedText)) committedText+='\n\n';
    }
    _pausaDa=0;
    const arr=[];
    for(let i=0;i<e.results.length;i++) arr.push({final:e.results[i].isFinal,text:e.results[i][0].transcript});
    const acc=accumFromResults(arr);
    sessionFinal=acc.sessionFinal; interimText=acc.interim;
    live.innerHTML=escapeHtml(committedText+sessionFinal)+'<em>'+escapeHtml(interimText)+'</em>';
    live.scrollTop=live.scrollHeight;   /* l'ultima parola resta in vista */
    try{ window._cieloParola&&window._cieloParola(); }catch(_){}   /* ogni parola, un'onda nel campo */
    live.classList.add('show');
  };
  rec.onerror=e=>{
    if(e.error==='not-allowed'||e.error==='service-not-allowed'){
      chiudiRegistrazioneFallita(e.error,'Microfono non concesso. Attivalo in Impostazioni → Sentiero.');
      return;
    }
    if(e.error!=='no-speech'&&e.error!=='aborted'){ toast('Errore microfono: '+e.error); stopRec(); }
  };
  rec.onend=()=>{
    committedText+=sessionFinal; sessionFinal=''; interimText='';
    if(recording) _pausaDa=Date.now();   /* v251: da qui comincia il silenzio */
    if(recording){
      try{ rec.start(); }
      catch(_){
        setTimeout(function(){ if(!recording) return;   /* Android: il motore a volte non e pronto subito - secondo tentativo */
          try{ rec.start(); }catch(__){ chiudiRegistrazioneFallita('riavvio-fallito','Microfono interrotto. Tocca il cerchio per riprendere.'); }
        },200);
      }
    }
  };
  try{ nota('mav'); }catch(_){}
  recording=true;
    _staRegistrando=true;
    try{ _tastoFermo(true); }catch(_){}   /* v249: da qui i ridimensionamenti aspettano */
    /* stato 'in avvio': enso pulsa neutro, l'utente NON è invitato a parlare finché onstart non scatta */
  micBtn.classList.add('arming');
  micLabel.textContent='Preparazione del microfono…';
  renderFlow();
  try{ rec.start(); }
  catch(_){ chiudiRegistrazioneFallita('start-sincrono','Impossibile avviare il microfono. Riprova.');
            toast('Impossibile avviare il microfono'); }
}
function stopRec(){
  try{ nota('mst'); }catch(_){}
  recording=false;
  try{ _tastoFermo(false); }catch(_){}
  /* v249: appena il microfono si chiude, i lavori rimandati si fanno - uno
     alla volta, cosi il picco non si sposta soltanto piu in la. */
  try{ riprendiLavori(); }catch(_){}
  /* niente riavvio, ma il commit dell'ultima sessione resta: Android consegna l'ultimo finale DOPO lo stop */
  if(rec){
    const _chiudo=rec; rec=null;
    _chiudo.onend=function(){ committedText+=sessionFinal; sessionFinal=''; try{ nota('mrx'); }catch(_){} };
    try{ _chiudo.stop(); }catch(_){ try{ _chiudo.abort(); }catch(__){} }
  }
  micBtn.classList.remove('rec','arming');
  try{ window._cieloVoce&&window._cieloVoce('quiete'); }catch(_){}   /* il cielo torna a casa */
  sMicOff(); releaseWake();
  try{ if(S.settings.music) MUSIC.recDuck(false); }catch(_){}  /* la musica risale dopo la dettatura */
  try{ if(S.settings.music) ORCH.duck(false); }catch(_){}
  try{ if(S.settings.music) ATHEME.duck(false); }catch(_){}
  micLabel.textContent='\u2026';
  setTimeout(function(){ presentaRaccolto('Silenzio. Riprova quando vuoi.'); },420);
}
/* ══ v269.6 — CIO CHE E STATO DETTO SI RILEGGE, COMUNQUE SIA FINITA ═════════
   Questa era la coda di stopRec e viveva solo li. Percio, quando il microfono
   moriva da solo - il caso «onend, riavvio fallito due volte» - le parole gia
   trascritte restavano dentro committedText e non le vedeva piu nessuno: la
   persona aveva parlato, il sistema aveva ricevuto, e il testo spariva.

   LA PROPRIETA: un errore tecnico non decide al posto della persona di
   distruggere parole che il sistema ha gia ricevuto.

   Sono state pesate quattro strade prima di scegliere:
     · perdere: viola la proprieta, ed e cio che succedeva;
     · chiedere «vuoi tenerlo?»: aggiunge una decisione nel momento peggiore,
       e ce n'e gia una subito dopo;
     · un ricupero temporaneo tipo «Rimettila»: giusto per chi BUTTA apposta,
       sbagliato qui - non ha buttato niente;
     · la rilettura di sempre: la persona ritrova quello che ha detto dove se lo
       aspetta, con i due tasti che conosce gia. Nessuna schermata nuova,
       nessuno stato nuovo, nessuna domanda in piu.
   Vince la quarta, ed e anche l'unica che non aggiunge niente. */
function presentaRaccolto(seNiente){
  try{
    const txt=(committedText+sessionFinal+' '+interimText).replace(/\s+/g,' ').trim()||(!SR?live.textContent.trim():'');
    if(txt){
      micLabel.textContent='Rileggi e raccogli';
      live.textContent=txt; live.classList.add('show'); live.scrollTop=0;   /* si rilegge dall'inizio */
      const mw=document.getElementById('mic-wrap'); if(mw) mw.classList.add('reviewing');
      const cr=document.querySelector('#confirm-row'); if(cr) cr.classList.remove('hidden');
      renderFlow();
      return true;
    }
    if(seNiente) micLabel.textContent=seNiente;
    live.classList.remove('show');
    try{ const mw=document.getElementById('mic-wrap'); if(mw) mw.classList.remove('reviewing'); }catch(_){}
    try{ updateRing(); }catch(_){}
  }catch(_){}
  return false;
}
/* ══ v274 LAB — IL MICROFONO TORNA A ESSERE UN BOTTONE ═════════════════════
   Il test reale su iPhone ha chiuso la discussione: swipe, lock, pointercancel,
   arbitri e soglie stavano facendo fallire l'azione piu semplice dell'app.

   La macchina di riconoscimento (continuous, pause, recovery, wake lock,
   trascritto incrementale) resta intatta. Viene rifatto soltanto l'INGRESSO:

       riposo + TAP  -> startRec()
       aperto + TAP  -> stopRec()

   Nessun pointerdown avvia la voce, nessun pointermove cambia significato,
   nessun pointercancel decide al posto della persona. Il browser produce un
   click semantico dal tocco; tastiera e VoiceOver producono lo stesso click.
   Dopo STOP, Butta/Tieni sono gia visibili: lo swipe a sinistra duplicava un
   comando esistente. Lo swipe in alto era diventato ridondante dal momento in
   cui un semplice tap lascia gia il microfono hands-free. */
let _pausaDa=0;   /* quando e cominciato il silenzio, per gli a capo */

function _tastoFermo(on){
  try{ const bf=document.getElementById('btn-fermo');
    if(bf) bf.classList.toggle('hidden',!on); }catch(_){}
}
function toggleMicrofono(){
  if(!SR){
    const txt=live.textContent.trim();
    if(txt){
      try{ const mw=document.getElementById('mic-wrap'); if(mw) mw.classList.add('reviewing'); }catch(_){}
      document.querySelector('#confirm-row').classList.remove('hidden');
    }
    return;
  }
  try{ nota('mtp',recording?2:1); }catch(_){}
  if(recording) stopRec(); else startRec();
}

/* Il cerchio e un vero <button>: click e l'evento giusto per tocco, mouse,
   tastiera e VoiceOver. Niente detail-filter: quello era necessario soltanto
   quando il pointerdown faceva gia il lavoro e il click sarebbe stato doppio. */
micBtn.addEventListener('click',function(e){
  try{ if(e) e.stopPropagation(); }catch(_){}
  toggleMicrofono();
});

/* Controllo esplicito di sicurezza: usa la stessa autorita, non una macchina
   parallela. Se e visibile, recording deve essere true e STOP e immediato. */
try{
  const bf=document.getElementById('btn-fermo');
  if(bf) bf.onclick=function(e){
    try{ e.stopPropagation(); }catch(_){}
    if(recording){ try{ nota('mtp',2); }catch(_){} stopRec(); }
  };
}catch(_){}
document.querySelector('#btn-discard').onclick=()=>{ resetCapture();
  /* v270: buttare via una registrazione ti lascia dove sei. Prima riportava il
     foglio a «mezzo», cioe ti spostava. */ };
/* domanda priorità: se l'IA rileva quest urgenti/importanti, l'utente conferma */
let pendingPrioIds=[];
function maybeAskPriority(bornIds){
  try{ if(anzianita(S)>=2){ const r=document.querySelector('#prio-row'); if(r) r.classList.add('hidden'); return; } }catch(_){}
  pendingPrioIds=(bornIds||[]).filter(id=>{ const q=S.quests.find(x=>x.id===id); return q&&q.prio<=2; });
  const row=document.querySelector('#prio-row');
  if(!pendingPrioIds.length){ row.classList.add('hidden'); return; }
  const n=pendingPrioIds.length;
  micLabel.textContent='Ho rilevato '+n+(n===1?' quest in evidenza':' quest in evidenza')+': le tengo così?';
  row.classList.remove('hidden');
}
document.querySelector('#btn-prio-yes').onclick=()=>{
  document.querySelector('#prio-row').classList.add('hidden');
  pendingPrioIds=[]; micLabel.textContent=micLabelDefault();
  haptic();
};
document.querySelector('#btn-prio-no').onclick=()=>{
  pendingPrioIds.forEach(id=>{ const q=S.quests.find(x=>x.id===id); if(q) q.prio=3; });
  save(); render();
  document.querySelector('#prio-row').classList.add('hidden');
  pendingPrioIds=[]; micLabel.textContent=micLabelDefault();
  toast('Priorità azzerate: tutte normali');
};
function resetCapture(){
  committedText='';sessionFinal='';interimText='';
  try{ const mw=document.getElementById('mic-wrap'); if(mw) mw.classList.remove('reviewing'); }catch(_){}
  live.textContent='';live.classList.remove('show','distill');
  if(!SR) live.classList.add('show');
  document.querySelector('#confirm-row').classList.add('hidden');
  document.querySelector('#prio-row').classList.add('hidden');
  micLabel.textContent=micLabelDefault();
  updateRing();
  renderFlow();
}
function guideAfterDistill(bornIds){
  try{ if(anzianita(S)>=1) return; }catch(_){}
  bornIds=bornIds||[];
  if(bornIds.length){
    streamInto(micLabel,'Fatto. Ora chiudi la prima quest.',{speed:34});   /* il risultato prende forma */
    setTimeout(()=>scrollToSoft('#sec-today-quests'),180);
  }else{
    streamInto(micLabel,'Nota salvata. Il sentiero resta leggero.',{speed:34});
  }
  renderFlow();
}

/* ======================================================================
   DISTILLAZIONE (IA)
   ====================================================================== */
let distilling=false;
document.querySelector('#btn-save').onclick=async()=>{
  if(distilling) return; /* mai due distillazioni sovrapposte */
  const transcript=live.textContent.trim();
  if(!transcript) return;
  distilling=true;
  try{ window._cieloVoce&&window._cieloVoce('distilla'); }catch(_){}   /* il collasso: il cielo consegna la luce al fuoco */
  const btn=document.querySelector('#btn-save');
  btn.textContent='Raccolgo…'; btn.disabled=true;
  live.classList.add('distill'); micLabel.textContent='Le parole si trasformano…';
  renderFlow();
  let wispTimer=setInterval(()=>{
    try{
      const lr=live.getBoundingClientRect();
      for(let i=0;i<3;i++) FX.wisp(lr.left+Math.random()*lr.width, lr.top+Math.random()*lr.height*0.7);
    }catch(_){}
  },140);
  const beforeMap=new Map(S.quests.map(q=>[q.id,q]));
  let _propLocale=[]; try{ _propLocale=distillaLocale(transcript,todayKey()); }catch(_){ _propLocale=[]; }
  const voceDiario=diarioProvvisorio(transcript);
  if(!salvaSubito()){ try{ S.diary=S.diary.filter(x=>x!==voceDiario); }catch(_){} throw new Error('PERSIST'); }
  micLabel.textContent=GEMINI_KEY?'Nota al sicuro · distillo…':'Nota al sicuro';
  try{
    if(GEMINI_KEY){
      const t0Dist=Date.now();
      const out=await askDistill(transcript);
      try{ regCantiere('distilla',{ms:Date.now()-t0Dist,
        msg:out?('ok \u00b7 attriti '+((out.attriti||[]).length)+' \u00b7 menzioni '+((out.menzioni||[]).length)+' \u00b7 sguardo '+((out.sguardo&&out.sguardo.livello)||0)):'vuoto'}); }catch(_){}
      if(out){
        /* LA FUSIONE (v133): il contratto e un DELTA - il modello consegna solo quest nuove e
           modificate, il client conserva tutte le altre. L'omissione non e piu un errore possibile. */
        /* v201 — DA UN DOLORE NON NASCE UN COMPITO.
           Il modello dice "peso":true quando il racconto porta sofferenza grave e reale.
           Allora la raccolta si ferma qui: niente quest, niente rituali. Lo scritto si
           salva intero e marcato. Il caso che ha deciso la regola: uno racconta che gli
           e morta la nonna e che e rimasto un'ora in macchina davanti a casa sua; la
           macchina fa il suo mestiere e la mattina dopo gli apre davanti la quest
           "Andare da nonna", con l'anello di progresso. Nessun errore di codice: era
           il codice a essere costruito cosi.
           La guardia sta in DUE punti perche le strade sono due: qui il microfono,
           e in scrittoNelDiario la Chiamata a terra e la stanza della sera. */
        const pesa=(out.peso===true);
        if(!Array.isArray(S.quests)) S.quests=[];
        let nuoveN=0, aggN=0;
        if(!pesa) (out.quests||[]).forEach(nq=>{
          if(!nq||!nq.titolo) return;
          const ex=nq.id?S.quests.find(q=>q&&q.id===nq.id):null;
          if(ex){ Object.assign(ex,nq,{id:ex.id}); aggN++; return; }
          const tit=String(nq.titolo).trim().toLowerCase();
          const dup=S.quests.find(q=>q&&!q.fatto&&String(q.titolo||'').trim().toLowerCase()===tit);
          if(dup){ Object.assign(dup,nq,{id:dup.id}); aggN++; }
          else{ if(!nq.id) nq.id=uid(); if(!nq.nata) nq.nata=todayKey(); S.quests.push(nq); nuoveN++; }   /* v141: ogni quest porta la sua data di nascita */
        });
        S.quests=sortQuests(S.quests);
        if(nuoveN||aggN){ try{ regCantiere('fusione',{msg:'quest nuove '+nuoveN+' \u00b7 aggiornate '+aggN}); }catch(_){} }
        /* rituali nati a voce: fusione in scheduled, con guardia client-side sui titoli gia esistenti */
        const bornRit=[];
        if(!pesa) for(const r of (out.rituali||[])){
          if((S.scheduled||[]).length>=LIMITS.SMAX) break;
          if(S.scheduled.some(t=>t.titolo.trim().toLowerCase()===r.titolo.trim().toLowerCase())) continue;
          if(!r.nata) r.nata=todayKey();   /* v199: vedi sopra */
          S.scheduled.push(r);
          bornRit.push(r.titolo+' ('+r.days.map(d=>DAYS_IT[d]).join('')+(r.time?' '+r.time:'')+')');
        }
        /* collegamenti nota↔quest calcolati in locale, per diff: esatti, non interpretati */
        const bornIds=S.quests.filter(q=>!beforeMap.has(q.id)).map(q=>q.id);
        const bornTitles=S.quests.filter(q=>!beforeMap.has(q.id)).map(q=>q.titolo);
        const doneTitles=S.quests.filter(q=>{const b=beforeMap.get(q.id);return b&&!b.fatto&&q.fatto;}).map(q=>q.titolo);
        completaDiario(voceDiario,out.diario||transcript,bornTitles.concat(bornRit.map(t=>'Rituale: '+t)),doneTitles,pesa);
        save(); render(bornIds);
        bornIds.forEach((_,i)=>sAppear(i));
        setTimeout(()=>{ /* scintille su ogni quest appena nata, a cascata */
          bornIds.forEach((id,i)=>{
            const qel=document.querySelector('[data-qid="'+id+'"]');
            if(qel){ const r=qel.getBoundingClientRect(); setTimeout(()=>{ try{FX.sparkle(r.left+26,r.top+r.height/2);}catch(_){} }, i*130); }
          });
        },60);
        const nq=bornIds.length,nr=bornRit.length;
        let msg;
        if(nq&&nr) msg=nq+' quest e '+nr+(nr===1?' rituale distillati':' rituali distillati');
        else if(nq) msg=nq+(nq===1?' nuova quest distillata':' nuove quest distillate');
        else if(nr) msg=nr+(nr===1?' nuovo rituale distillato':' nuovi rituali distillati');
        else msg='Quest aggiornate, nota salvata';
        if(out.non_eseguibile) msg+=' · Non posso: '+out.non_eseguibile;
        if(out.non_eseguibile||anzianita(S)<1) toast(msg);   /* l'esito e gia visibile: dal 7\u00b0 giorno parla solo se c'e qualcosa che non si vede */
        if(!pesa){ try{ processMastery(out.motore); }catch(_){} }   /* un racconto pesante non alimenta attriti/letture/sguardo */
        try{ semeRaccolto(); }catch(_){}
        if(!pesa){ try{ renderLetture(out.motore); }catch(_){} }
        try{ if(!maybeRivelazione()) maybeLascito(); }catch(_){}
        resetCapture();
        if(bornIds.length){ try{ window._nascitaQuest(bornIds[0]); }catch(_){ foglioDopoVoce(); } }   /* la voce diventa materia, e ti ci porta */
        else foglioDopoVoce();
        guideAfterDistill(bornIds);
        maybeAskPriority(bornIds);
        return;
      } else throw new Error('bad');
    }else{
      /* v206: senza chiave nessuno ha letto questo testo. La rete a maglie larghe
         non fara nascere ne bloccare niente: serve solo perche stasera
         l'osservatrice e domattina il frutto sappiano come parlare. */
      completaDiario(voceDiario,transcript,[],[],pesoLocale(transcript));
      salvaSubito(); render();
      let _aperto=false;
      try{ _aperto=apriProposte(_propLocale); }catch(_){ _aperto=false; }
      toast(_aperto?'Nota salvata. Ho sentito qualcosa da fare.':'Nota salvata nel diario');
      try{ semeRaccolto(); }catch(_){}
      resetCapture();
      foglioDopoVoce();
      guideAfterDistill([]);
      return;
    }
  }catch(err){
    completaDiario(voceDiario,transcript,[],[],pesoLocale(transcript)); salvaSubito(); render(); resetCapture(); foglioDopoVoce(); try{ semeRaccolto(); }catch(_){}
    const code=(err&&err.message)||'';
    let msg='IA non raggiungibile'+(code&&code!=='bad'?' ['+code.slice(0,90)+']':'')+': trascritto salvato comunque';
    if(code==='bad') msg='L\u2019IA ha risposto in un formato non leggibile: riprova. Trascritto salvato.';
    else if(code==='AUTH') msg='Chiave API non valida: ricopiala in Altro. Trascritto salvato.';
    else if(code==='RATE') msg='Gemini non ha quota disponibile adesso. Il trascritto è stato salvato.';
    else if(code==='MODEL') msg='Modello IA non disponibile: serve aggiornare l\u2019app. Trascritto salvato.';
    else if(code==='BUSY') msg='Server IA sovraccarichi: riprova tra poco. Trascritto salvato.';
    else if(err&&err.name==='AbortError') msg='IA troppo lenta (timeout): riprova. Trascritto salvato.';
    else if(code==='PERSIST') msg='Non riesco a mettere la nota al sicuro sul dispositivo.';
    else if(err instanceof TypeError) msg='Rete assente o bloccata: controlla la connessione. Trascritto salvato.';
    /* v212 — LA RETE GENERATIVA CHE CADE SENZA SAPERLO. Visto in prova: si detta una nota
       e quella finisce solo nel diario: momento perso, e
       l'app non gliel'ha nemmeno detto in modo utile. Adesso, quando il modello
       doveva rispondere e non ce l'ha fatta - per qualunque ragione - subentra
       l'estrattore di casa e propone quello che ha sentito. La nota non basta:
       serve che le cose da fare escano comunque. */
    let _apertoE=false;
    try{ _apertoE=apriProposte(_propLocale); }catch(_){ _apertoE=false; }
    if(_apertoE) msg=msg.replace(/Trascritto salvato\.?/,'Intanto le cerco io.');
    toast(msg);
  }finally{
    clearInterval(wispTimer);
    distilling=false;
    btn.textContent='Tieni'; btn.disabled=false;
    live.classList.remove('distill');
    renderFlow();
  }
};
/*MICROFONO-LOCALE-INIZIO*/

/* ── i mattoni ────────────────────────────────────────────────────────────── */
function _micNorm(t){
  let s=String(t||'').toLowerCase();
  try{ s=s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(_){}
  return s.replace(/\s+/g,' ').trim();
}
/* i verbi all'infinito: in italiano finiscono in -are/-ere/-ire, anche riflessivi.
   Da soli non bastano (anche «mare» finisce in -are), e infatti non si cercano da
   soli: si cercano dopo un marcatore, o in testa a una frase. */
/* La radice puo essere corta: «dare», «fare», «dire» hanno una lettera sola prima
   della desinenza, e chiedendone tre si perdevano «Fare 300 €» e «dare
   un'occhiata». Serve solo che la parola intera arrivi a quattro lettere. */
const _MIC_INF=/^[a-z']+(?:are|arsi|ere|ersi|ire|irsi|urre|arre|orre|ursi|orsi|arla|arlo|arli|arle|erla|erlo|irla|irlo)$/  /* v244: mancavano -urre, -arre, -orre. «Introdurre le istruzioni» non
     produceva niente pur cominciando con un infinito, e con lei condurre,
     produrre, tradurre, ridurre, porre, comporre, proporre, esporre, trarre.
     Non e un caso raro: e una coniugazione intera. */;
/* «fare» stava qui dentro come verbo servile, e si mangiava «Fare 300 € prima di
   domenica»: e uno dei verbi piu concreti che ci siano. Restano fuori solo quelli
   che da soli non sono mai una cosa da fare. */
const _MIC_NONVERBI=new Set(['essere','avere','stare','potere','volere','dovere','sapere',
  'torre','corre','occorre','scorre','ricorre','soccorre','carre','birre',   /* i falsi amici di -orre e -arre */
  'mare','sere','pere','vere','opere','genere','carattere','padre','madre','ere','aria','storie',
  'care','cara','ore','rare','pure','dure','mere','chiare','sere','vere','oltre','altre','nostre','vostre']);
/* parole che finiscono in -o e non sono verbi alla prima persona: senza questo
   elenco «il momento», «un attimo», «il giorno» diventerebbero cose da fare. */
const _MIC_NON_IO=new Set(['solo','modo','tempo','giorno','momento','ufficio','primo','secondo','anno',
  'mese','tutto','poco','molto','troppo','subito','presto','dopo','prima','sopra','sotto','dentro',
  'fuori','vicino','lontano','domano','pero','ancoro','bello','nuovo','vecchio','stesso','altro',
  'quello','questo','loro','uno','no','ho','so','sto','vo','po','pomeriggio','lavoro','numero',
  'gruppo','punto','posto','pezzo','pezzo','conto','termine','sguardo','ricordo','bisogno','esempio',
  'periodo','progetto','contratto','appuntamento','corso','centro','stato','caso','cambio','peso',
  /* i servili non sono la cosa da fare: se dopo «devo» non c'e un infinito, il
     titolo non puo essere «devo». Usciva «Devo essere in via Roma 1». */
  'devo','debbo','voglio','posso','riesco','dovro','saro','faro','andro']);
const _MIC_TEMPO_FUT=/\b(domani|dopodomani|stasera|stamattina|stamane|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|alle |dalle |entro |fra |tra |prossim|a partire da)/;
function _micEInfinito(p){ return p.length>=4&&_MIC_INF.test(p)&&!_MIC_NONVERBI.has(p); }
/* «essere» e «stare» da soli non sono cose da fare, ma «devo essere in via
   Saluzzo alle sei e un quarto» e un appuntamento in piena regola. Valgono solo
   quando reggono un luogo, ed e la forma con cui si dicono gli appuntamenti. */
const _MIC_LUOGO=/^(in|a|al|allo|alla|ai|alle|agli|da|dal|dalla|presso|davanti|sotto|sopra|vicino)$/;
function _micEsserciDove(norm,i){
  return (norm[i]==='essere'||norm[i]==='stare')&&norm[i+1]&&_MIC_LUOGO.test(norm[i+1]);
}

/* i marcatori che annunciano una cosa da fare. Presi dalle sue note vere:
   «devo contattare», «ho da contattare», «mi devo ricordare che devo chiedere»,
   «quando possibile dare un'occhiata», «ho un appuntamento per vedere». */
const _MIC_MARCA=[
  'devo','dovrei','dovro','ho da','mi tocca','bisogna','voglio','vorrei','mi ricordo che devo',
  'mi devo ricordare di','devo ricordarmi di','mi sa che devo','ho bisogno di','e ora di',
  'appuntamento per','serve','va','provo a','cerco di','penso di','conto di','mi piacerebbe',
  'quando possibile','appena posso','se posso','mi ricordo che','ricordarmi di','da'
];
/* le parole che chiudono un titolo: quello che viene dopo e contorno, non la cosa */
const _MIC_TAGLIA=/\b(perche|perche'|cosi|siccome|dato che|visto che|in modo tale che|in modo che|altrimenti|comunque|pero|ma insomma)\b/;

/* ── il tempo ─────────────────────────────────────────────────────────────── */
const _MIC_DOW={'lunedi':1,'martedi':2,'mercoledi':3,'giovedi':4,'venerdi':5,'sabato':6,'domenica':0};
const _MIC_MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const _MIC_NUM={'una':1,'uno':1,'un':1,'due':2,'tre':3,'quattro':4,'cinque':5,'sei':6,'sette':7,'otto':8,
  'nove':9,'dieci':10,'undici':11,'dodici':12,'tredici':13,'quattordici':14,'quindici':15,'sedici':16,
  'diciassette':17,'diciotto':18,'diciannove':19,'venti':20,'ventuno':21,'trenta':30};
function _micISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function _micPiu(oggiISO,n){ const d=new Date(oggiISO+'T12:00:00'); d.setDate(d.getDate()+n); return _micISO(d); }
function _micQuando(t,oggiISO){
  const s=_micNorm(t);
  if(/\bdopodomani\b/.test(s)) return _micPiu(oggiISO,2);
  if(/\bdomani\b/.test(s)) return _micPiu(oggiISO,1);
  if(/\b(oggi|stasera|stamattina|stamane|stanotte|nel pomeriggio|a pranzo)\b/.test(s)) return oggiISO;
  let m=s.match(/\bfra\s+(\w+)\s+giorn/)||s.match(/\btra\s+(\w+)\s+giorn/);
  if(m){ const n=_MIC_NUM[m[1]]||parseInt(m[1],10); if(n>0&&n<400) return _micPiu(oggiISO,n); }
  m=s.match(/\b(?:fra|tra)\s+(\w+)\s+settiman/);
  if(m){ const n=_MIC_NUM[m[1]]||parseInt(m[1],10); if(n>0&&n<60) return _micPiu(oggiISO,n*7); }
  m=s.match(/\b(?:fra|tra)\s+(\w+)\s+mes/);
  if(m){ const n=_MIC_NUM[m[1]]||parseInt(m[1],10); if(n>0&&n<40) return _micPiu(oggiISO,n*30); }
  m=s.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/);
  if(m){ const g=+m[1], mese=_MIC_MESI.indexOf(m[2]); const oggi=new Date(oggiISO+'T12:00:00');
    let anno=oggi.getFullYear(); const d=new Date(anno,mese,g,12,0,0);
    /* «il 4 agosto» detto il 10 agosto vuol dire sei giorni fa, non fra un anno.
       Si passa all'anno prossimo solo se la data e vecchia di piu di un mese. */
    if((oggi-d)>31*86400000) d.setFullYear(anno+1);
    return _micISO(d); }
  for(const g in _MIC_DOW){
    if(new RegExp('\\b'+g+'\\b').test(s)){
      const oggi=new Date(oggiISO+'T12:00:00'); let delta=(_MIC_DOW[g]-oggi.getDay()+7)%7;
      if(delta===0) delta=7;                       /* «giovedi» detto di giovedi vuol dire il prossimo */
      return _micPiu(oggiISO,delta);
    }
  }
  return '';
}
function _micOra(t){
  const s=_micNorm(t);
  let m=s.match(/\balle\s+(\d{1,2})[:.](\d{2})\b/); if(m) return _mic2(m[1])+':'+m[2];
  m=s.match(/\b(?:alle|dalle|entro le|per le)\s+(\d{1,2})\b/);
  if(m){ let h=+m[1]; if(h<=12&&/\b(pomeriggio|sera|stasera)\b/.test(s)) h+=12; if(h<24) return _mic2(h)+':00'; }
  m=s.match(/\b(?:alle|dalle|entro le|per le)\s+([a-z]+)\b/);
  if(m&&_MIC_NUM[m[1]]!==undefined){ let h=_MIC_NUM[m[1]];
    if(h<=12&&/\b(pomeriggio|sera|stasera)\b/.test(s)) h+=12;
    if(h<=12&&/\bdi mattina|del mattino|mattina\b/.test(s)&&h<7) h+=0;
    if(h>=0&&h<24) return _mic2(h)+':00'; }
  if(/\bstasera\b/.test(s)) return '20:00';
  if(/\b(stamattina|stamane|di mattina|del mattino)\b/.test(s)) return '09:00';
  if(/\ba pranzo\b/.test(s)) return '13:00';
  if(/\bnel pomeriggio|di pomeriggio\b/.test(s)) return '15:00';
  return '';
}
function _mic2(n){ n=+n; return (n<10?'0':'')+n; }
function _micPrio(t){
  const s=_micNorm(t);
  if(/\b(urgente|urgentissimo|assolutamente|entro oggi|subito|non posso rimandare)\b/.test(s)) return 1;
  if(/\b(importante|mi preme|entro domani|il prima possibile|quanto prima)\b/.test(s)) return 2;
  return 3;
}

/* ── il taglio in frasi ───────────────────────────────────────────────────── */
function _micFrasi(testo){
  return String(testo||'')
    .split(/(?<=[.;!?])\s+|\s+(?:e\s+poi|poi|inoltre|dopodiche|dopo di che)\s+/i)
    /* una parola sola basta se e un infinito: la sua nota piu corta e «Fumare» */
    .map(x=>x.trim()).filter(x=>x&&(x.split(/\s+/).length>=2||_micEInfinito(_micNorm(x))));
}

/* ── il titolo ────────────────────────────────────────────────────────────── */
/* v232 — I RIEMPITIVI E LE BALBUZIE DELLA DETTATURA.
   Misurando l'estrattore su trascritti veri di dettatura e venuto fuori che il
   divario col modello non e il tempo - quello lo legge quasi sempre giusto - ma
   il TITOLO: dieci parole in mediana contro le quattro del modello, e ventisei
   titoli su sessantuno arrivati al tetto delle dodici parole, cioe TRONCATI e
   non riassunti. Chi detta ripete («Su su smartphone sullo smartphone»),
   riparte da capo, infila parole che non dicono niente («cioe», «praticamente»).
   Un titolo non si accorcia tagliandolo: si accorcia togliendo cio che non e
   la cosa da fare. Il tetto viene dopo, e serve solo da rete. */
const _MIC_VUOTE=/^(cioe|praticamente|assolutamente|appunto|insomma|diciamo|ecco|allora|quindi|dunque|tipo|niente|comunque|proprio|un po|poi|va be|vabbe|boh|mah|ok|okay|allora)$/;

/* la dettatura ripete: la stessa parola due volte di fila, o la stessa coppia
   di parole due volte di fila. Si tiene la prima e si butta l'eco. */
function _micEco(out){
  const fuori=[];
  for(let i=0;i<out.length;i++){
    const a=_micNorm(out[i]);
    if(fuori.length&&_micNorm(fuori[fuori.length-1])===a) continue;          /* «su su» */
    if(fuori.length>=2&&i+1<out.length&&
       _micNorm(fuori[fuori.length-2])===a&&
       _micNorm(fuori[fuori.length-1])===_micNorm(out[i+1])){ i++; continue; } /* «sullo smartphone sullo smartphone» */
    fuori.push(out[i]);
  }
  return fuori;
}

function _micTitolo(parole,da){
  let fine=parole.length;
  for(let i=da;i<parole.length;i++){
    if(_MIC_TAGLIA.test(_micNorm(parole[i]))){ fine=i; break; }
  }
  let out=parole.slice(da,fine);
  out=_micEco(out);
  /* le parole vuote si tolgono ovunque tranne che in testa, dove potrebbero
     essere l'inizio vero della cosa da fare */
  out=out.filter(function(p,i){ return i===0||!_MIC_VUOTE.test(_micNorm(p)); });
  /* via la coda temporale: la data e l'ora vivono nei loro campi, non nel nome */
  while(out.length>2&&/^(oggi|domani|dopodomani|stasera|stamattina|stamane|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|alle|dalle|entro|per|il|la|nel|in|a|di)$/.test(_micNorm(out[out.length-1]))) out.pop();
  /* la coda che ripete la stessa preposizione due volte di fila («in nelle»)
     e un pezzo di dettatura, non di senso */
  out=out.filter(function(p,i){
    return !(i>0&&/^(in|a|di|da|con|su|per)$/.test(_micNorm(out[i-1]))&&
             /^(in|a|di|da|con|su|per|nel|nella|nelle|nei|al|alla|alle|ai|del|della|delle|dei)$/.test(_micNorm(p)));
  });
  /* il tetto scende da dodici a otto, ma solo DOPO aver tolto il di piu: prima
     era una ghigliottina, adesso e una rete. E si taglia a un confine, non in
     mezzo a un complemento: se l'ultima parola e una preposizione, si arretra. */
  /* gli articoli e i possessivi il modello li toglie sempre: «il mio client
     email» diventa «client email». Provate tre varianti col metro, questa e
     l'unica che accorcia SENZA perdere fedelta - il tetto piu basso da solo
     accorciava e basta, e la somiglianza scendeva dal 52 al 46 per cento. */
  out=out.filter(function(p,i){ return i===0||!/^(il|lo|la|i|gli|le|un|uno|una|mio|mia|miei|mie|dei|delle|degli)$/.test(_micNorm(p)); });
  if(out.length>10) out=out.slice(0,10);
  while(out.length>3&&/^(in|a|di|da|con|su|per|il|lo|la|i|gli|le|un|una|uno|nel|nella|del|della|al|alla|e|che)$/.test(_micNorm(out[out.length-1]))) out.pop();
  let t=out.join(' ').replace(/[,;:]+$/,'').trim();
  if(t.length<3) return '';
  return t.charAt(0).toUpperCase()+t.slice(1);
}

/* ── L'ESTRATTORE ─────────────────────────────────────────────────────────── */
function distillaLocaleIT(testo,oggiISO){
  const fuori=[], visti={};
  const tuttoQuando=_micQuando(testo,oggiISO), tuttoOra=_micOra(testo);
  for(const frase of _micFrasi(testo)){
    const parole=frase.split(/\s+/);
    const norm=parole.map(_micNorm);
    let da=-1;
    /* 1 · un marcatore, e subito dopo un infinito */
    for(let i=0;i<norm.length&&da<0;i++){
      for(const mk of _MIC_MARCA){
        const pezzi=mk.split(' ');
        if(norm.slice(i,i+pezzi.length).join(' ')===mk){
          for(let j=i+pezzi.length;j<Math.min(i+pezzi.length+3,norm.length);j++){
            if(_micEInfinito(norm[j])||_micEsserciDove(norm,j)){ da=j; break; }
          }
        }
        if(da>=0) break;
      }
    }
    /* 2 · un infinito in testa alla frase, o quasi: «Implementare in Sentiero…»,
           «Quando possibile dare un'occhiata…». Tre parole di tolleranza bastano
           a coprire gli attacchi che usa davvero. */
    if(da<0){ for(let i=0;i<Math.min(3,norm.length);i++){ if(_micEInfinito(norm[i])){ da=i; break; } } }
    /* 3 · «per» + infinito: «un appuntamento per vedere un appartamento» */
    if(da<0){
      for(let i=0;i<norm.length-1;i++){
        if(norm[i]==='per'&&_micEInfinito(norm[i+1])){ da=i+1; break; }
      }
    }
    /* 4 · IL PRESENTE CHE VALE PER FUTURO. In italiano parlato «domani mattina
           alle nove misuro la porta» e un impegno quanto «devo misurare». Il
           segnale non e il verbo da solo - sarebbe rumore - ma il verbo alla
           prima persona INSIEME a un tempo futuro nella stessa frase. */
    if(da<0&&_MIC_TEMPO_FUT.test(_micNorm(frase))){
      for(let i=0;i<norm.length;i++){
        const w=norm[i];
        if(w.length>=4&&/o$/.test(w)&&!_MIC_NON_IO.has(w)&&!/^(gi|se|ci|vi)o$/.test(w)){ da=i; break; }
      }
    }
    /* 4b · L'INFINITO USATO COME NOME: «il risolvere», «lo scrivere», «il fare».
       In italiano parlato e comunissimo - «segna il rispondere alla mail»
       - e l'estrattore non lo trovava, perche cercava l'infinito dopo un
       marcatore o in testa, mai dopo un articolo. Una nota che diceva
       chiaramente una cosa da fare non produceva niente.
       L'articolo entra nel titolo? No: si parte dal verbo, cosi «il risolvere il
       caso» diventa «Risolvere il caso» e non «Il risolvere il caso». */
    if(da<0){
      for(let i=0;i<norm.length-1;i++){
        if(/^(il|lo|la|l')$/.test(norm[i])&&_micEInfinito(norm[i+1])){ da=i+1; break; }
      }
    }
    /* 5 · «e» / «ed» + infinito: «Nota per il 4 agosto e scrivere a chi di dovere» */
    if(da<0){
      for(let i=0;i<norm.length-1;i++){
        if((norm[i]==='e'||norm[i]==='ed')&&_micEInfinito(norm[i+1])){ da=i+1; break; }
      }
    }
    if(da<0) continue;
    /* LA NEGAZIONE, e non e un dettaglio: su «no non provare a fumare erba»
       usciva la proposta «Provare a fumare erba», cioe il contrario esatto di
       quello che aveva detto. Una nota che nega non e una cosa da fare: si lascia
       stare. Meglio perdere una proposta che ribaltarne il senso. */
    /* LA NEGAZIONE, e non e un dettaglio: su «no non provare a fumare erba»
       usciva la proposta «Provare a fumare erba», cioe il contrario esatto di
       quello che aveva detto. Una nota che nega non e una cosa da fare: si lascia
       stare. Meglio perdere una proposta che ribaltarne il senso.

       v244 — CI HO PROVATO A CAMBIARLA, E L'HO RIMESSA COM'ERA.
       Tenendo la negazione dentro il titolo si recuperavano due note su
       novantaquattro - «domani non fumo erba» diventava «Non fumo erba». Ma
       questa non e una regola tecnica: e una decisione di prodotto, scritta qui
       sopra e difesa da provaMicrofono. Il banco mi ha fermato, ed e servito.
       Se un giorno si vuole cambiare, si cambia la decisione E il banco insieme,
       non il codice di nascosto. Il prezzo e noto: due note su novantaquattro. */
    const primaDelVerbo=norm.slice(Math.max(0,da-3),da).join(' ');
    if(/\bnon\b|\bmai\b|\bniente\b/.test(primaDelVerbo)||/^no\b/.test(norm[0])) continue;
    const titolo=_micTitolo(parole,da);
    if(!titolo) continue;
    const chiave=_micNorm(titolo);
    if(visti[chiave]) continue;
    visti[chiave]=1;
    fuori.push({titolo:titolo,
                quando:_micQuando(frase,oggiISO)||tuttoQuando,
                ora:_micOra(frase)||tuttoOra,
                prio:_micPrio(frase)});
    if(fuori.length>=6) break;      /* una nota non fa nascere una lista infinita */
  }
  return fuori;
}
/*MICROFONO-LOCALE-FINE*/
/*MICROFONO-EN-INIZIO*/
/* ══ L'ESTRATTORE CHE LEGGE IL PACCHETTO (v218) ═════════════════════════════
   Gli schemi non sono piu scritti qui: stanno in lingue/<lingua>.json. Qui c'e
   solo il mestiere - trova il marcatore, prendi il verbo, taglia la coda
   temporale - e vale per qualunque lingua che porti i suoi schemi.

   Senza pacchetto non estrae niente. E la scelta giusta: leggere una lingua con
   gli schemi di un'altra non da meno proposte, ne da di sbagliate. */
function _micxNorm(t){
  let s=String(t||'').toLowerCase();
  try{ s=s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(_){}
  return s.replace(/[’‘]/g,"'").replace(/\bdon't\b/g,'dont').replace(/\s+/g,' ').trim();
}
function _micxPack(){ const p=PACCHETTO; return (p&&p.micro)?p.micro:null; }
function _micxQuando(t,oggiISO){
  const m=_micxPack(); if(!m) return '';
  const s=_micxNorm(t), N=m.numeri||{};
  if(/\bday after tomorrow\b/.test(s)) return _micPiu(oggiISO,2);
  if(/\btomorrow\b/.test(s)) return _micPiu(oggiISO,1);
  if(/\b(today|tonight|this morning|this afternoon|this evening|at lunch)\b/.test(s)) return oggiISO;
  let x=s.match(/\bin\s+(\w+)\s+days?\b/);
  if(x){ const n=N[x[1]]||parseInt(x[1],10); if(n>0&&n<400) return _micPiu(oggiISO,n); }
  x=s.match(/\bin\s+(\w+)\s+weeks?\b/);
  if(x){ const n=N[x[1]]||parseInt(x[1],10); if(n>0&&n<60) return _micPiu(oggiISO,n*7); }
  x=s.match(/\bin\s+(\w+)\s+months?\b/);
  if(x){ const n=N[x[1]]||parseInt(x[1],10); if(n>0&&n<40) return _micPiu(oggiISO,n*30); }
  if(/\bnext week\b/.test(s)) return _micPiu(oggiISO,7);
  const mesi=m.mesi||[], elenco=mesi.join('|');
  if(elenco){
    x=s.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?('+elenco+')\\b'))
    ||s.match(new RegExp('\\b('+elenco+')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b'));
    if(x){
      let g,me;
      if(/^\d/.test(x[1])){ g=+x[1]; me=mesi.indexOf(x[2]); } else { me=mesi.indexOf(x[1]); g=+x[2]; }
      if(me>=0){
        const oggi=new Date(oggiISO+'T12:00:00'), d=new Date(oggi.getFullYear(),me,g,12,0,0);
        if((oggi-d)>31*86400000) d.setFullYear(oggi.getFullYear()+1);
        return _micISO(d);
      }
    }
  }
  const giorni=m.giorni||{};
  for(const g in giorni){
    if(new RegExp('\\b'+g+'\\b').test(s)){
      const oggi=new Date(oggiISO+'T12:00:00'); let delta=(giorni[g]-oggi.getDay()+7)%7;
      if(delta===0) delta=7;
      return _micPiu(oggiISO,delta);
    }
  }
  return '';
}
function _micxOra(t){
  const m=_micxPack(); if(!m) return '';
  const s=_micxNorm(t), N=m.numeri||{};
  let x=s.match(/\b(?:at|by|before)\s+(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if(x){ let h=+x[1]; if(x[3]==='pm'&&h<12) h+=12; if(x[3]==='am'&&h===12) h=0; return _mic2(h)+':'+x[2]; }
  x=s.match(/\b(?:at|by|before)\s+(\d{1,2})\s*(am|pm)\b/);
  if(x){ let h=+x[1]; if(x[2]==='pm'&&h<12) h+=12; if(x[2]==='am'&&h===12) h=0; return _mic2(h)+':00'; }
  x=s.match(/\b(?:at|by|before)\s+(\d{1,2})\b/);
  if(x){ let h=+x[1]; if(h<=12&&/\b(afternoon|evening|tonight|pm)\b/.test(s)) h+=12; if(h<24) return _mic2(h)+':00'; }
  x=s.match(/\b(?:at|by|before)\s+([a-z]+)\b/);
  if(x&&N[x[1]]!==undefined&&x[1]!=='a'&&x[1]!=='an'){
    let h=N[x[1]]; if(h<=12&&/\b(afternoon|evening|tonight|pm)\b/.test(s)) h+=12;
    if(h>=0&&h<24) return _mic2(h)+':00';
  }
  if(/\btonight\b/.test(s)) return '20:00';
  if(/\bthis morning\b/.test(s)) return '09:00';
  if(/\bat lunch\b/.test(s)) return '13:00';
  if(/\bthis afternoon\b/.test(s)) return '15:00';
  return '';
}
function _micxPrio(t){
  const s=_micxNorm(t);
  if(/\b(urgent|urgently|asap|right away|cant wait|cannot wait)\b/.test(s)) return 1;
  if(/\b(important|matters|by tomorrow|as soon as possible|soon)\b/.test(s)) return 2;
  return 3;
}
function _micxTitolo(parole,da,m){
  const taglia=m.taglia?new RegExp(m.taglia,'i'):null;
  let fine=parole.length;
  if(taglia) for(let i=da;i<parole.length;i++){ if(taglia.test(_micxNorm(parole[i]))){ fine=i; break; } }
  let out=parole.slice(da,fine).slice(0,12);
  let t=out.join(' ').replace(/[,;:]+$/,'').trim();
  const code=(m.code||[]).map(r=>new RegExp(r,'i'));
  let cambia=true,giri=0;
  while(cambia&&giri++<6){
    cambia=false;
    for(const re of code){
      const n=t.replace(re,'');
      if(n!==t&&n.trim().split(/\s+/).length>=2){ t=n.trim(); cambia=true; }
    }
  }
  t=t.replace(/[,;:]+$/,'').trim();
  if(t.length<2) return '';
  return t.charAt(0).toUpperCase()+t.slice(1);
}
function distillaLocalePack(testo,oggiISO){
  const m=_micxPack(); if(!m) return [];
  const verbi=new Set(m.verbi||[]), luogo=m.luogo?new RegExp(m.luogo):null;
  const eVerbo=w=>verbi.has(w);
  const fuori=[], visti={};
  const tuttoQuando=_micxQuando(testo,oggiISO), tuttoOra=_micxOra(testo);
  const frasi=String(testo||'').split(/(?<=[.;!?])\s+|\s+(?:and then|then|also|after that)\s+/i)
    .map(x=>x.trim()).filter(Boolean);
  for(const frase of frasi){
    const parole=frase.split(/\s+/);
    const norm=parole.map(w=>_micxNorm(w).replace(/[^a-z0-9']/g,''));
    let da=-1;
    for(let i=0;i<norm.length&&da<0;i++){
      for(const mk of (m.marcatori||[])){
        const pezzi=mk.split(' ');
        if(norm.slice(i,i+pezzi.length).join(' ')===mk){
          for(let j=i+pezzi.length;j<Math.min(i+pezzi.length+3,norm.length);j++){
            if(norm[j]==='to') continue;
            if(eVerbo(norm[j])||(norm[j]==='be'&&luogo&&luogo.test(norm[j+1]||''))){ da=j; break; }
          }
        }
        if(da>=0) break;
      }
    }
    if(da<0){ for(let i=0;i<norm.length-1;i++){ if(norm[i]==='to'&&eVerbo(norm[i+1])){ da=i+1; break; } } }
    if(da<0){ for(let i=0;i<Math.min(2,norm.length);i++){ if(eVerbo(norm[i])){ da=i; break; } } }
    if(da<0) continue;
    const prima=norm.slice(Math.max(0,da-3),da).join(' ');
    if(/\b(dont|not|never|no)\b/.test(prima)&&!/forget/.test(prima)) continue;
    if(/\b(yesterday|last night|already)\b/.test(_micxNorm(frase))
       &&!/\b(need to|have to|should|must|remind)\b/.test(_micxNorm(frase))) continue;
    const titolo=_micxTitolo(parole,da,m);
    if(!titolo) continue;
    const k=_micxNorm(titolo);
    if(visti[k]) continue;
    visti[k]=1;
    fuori.push({titolo:titolo,quando:_micxQuando(frase,oggiISO)||tuttoQuando,
                ora:_micxOra(frase)||tuttoOra,prio:_micxPrio(frase)});
    if(fuori.length>=6) break;
  }
  return fuori;
}
/*MICROFONO-EN-FINE*/

/* ══ LO SMISTAMENTO (v217) ═══════════════════════════════════════════════════
   Una porta sola, due motori dietro. Chi ha il telefono in italiano passa da
   quello misurato sulle 85 note vere; chi ce l'ha in inglese passa dal secondo.
   Una lingua che non abbiamo non prende il motore sbagliato: non prende niente,
   e la nota resta nel diario come prima. Meglio tacere che estrarre una cosa da
   fare leggendo il tedesco con le regole dell'italiano. */
function distillaLocale(testo,oggiISO){
  const l=(typeof linguaApp==='function')?linguaApp():'it';
  if(l==='it') return distillaLocaleIT(testo,oggiISO);
  return distillaLocalePack(testo,oggiISO);   /* e se il pacchetto non c'e, tace */
}


/* ══ IL PESO SENZA MODELLO (v206) ═══════════════════════════════════════════
   Nella Generativa il marchio del peso puo arrivare dal modello, che legge il
   testo nel suo contesto. In Base quella lettura semantica non esiste, ma la
   protezione della v202 - l'osservatrice che cambia registro, il frutto che non
   fa il bilancio delle mancanze - deve continuare ad arrivare lo stesso.

   QUESTO NON E UN RICONOSCITORE. E una rete a maglie larghissime, e va giudicata
   per quello che non fa, non per quello che fa:
   · non blocca MAI la nascita di una quest. Senza chiave le quest le scrive la
     persona a mano, e impedirle di scriverne una perche ha nominato un lutto
     sarebbe paternalismo. L'unica conseguenza e che le due voci parlano piu
     piano.
   · quindi un falso positivo costa una frase piu sobria del solito. Niente.
     Un falso negativo riporta le cose come stavano prima. E per questo che qui
     le parole chiave sono accettabili, mentre sul lato con la chiave no: la
     stessa tecnica, con conseguenze diverse, e una scelta diversa.
   · le frasi sono quelle che non si possono fraintendere. «mi manca mio nonno
     oggi, era il suo compleanno» NON deve scattare, ed e la riga su cui il banco
     insiste di piu: e un ricordo dentro una giornata normale, e porta pure una
     cosa da fare.

   Misurata sul corpus di attrezzi/corpus-peso.md: nessun falso positivo sulle
   dodici giornate storte, e ne prende meno della meta fra quelle gravi. E un
   pavimento, non una soluzione: la versione con la chiave resta molto migliore,
   e va detto a chi sceglie. */
/* Le frasi si scrivono SENZA accenti, e il testo viene spogliato prima di
   guardarlo. Sul telefono «e morta mia nonna» si scrive tutti i giorni senza
   accento, e la prima versione di questa rete si lasciava sfuggire proprio il
   caso da cui era nata tutta la storia. */
const _PESO_LOCALE=[
  /* il pensiero di non esserci */
  /\bfarla finita\b/, /\bnon voglio piu vivere\b/, /\bnon voglio piu esserci\b/,
  /\bse non ci fossi\b/, /\bsuicid/, /\bfarmi del male\b/, /\bfatt[oa] male apposta\b/,
  /\bmi sono tagliat[oa]\b/, /\bsparire per sempre\b/,
  /* la paura in casa */
  /\bmi ha picchiat[oa]\b/, /\bmi picchia\b/, /\bmi ha minacciat[oa]\b/, /\bviolentat[oa]\b/,
  /\bho paura di\s+(?:lui|lei|mio marito|mia moglie|mio padre|mia madre)\b/,
  /* v233 — LE CINQUE FAMIGLIE CHE IL CORPUS DICEVA MANCANTI.
     Misurando la Base contro attrezzi/corpus-peso.md e uscito 50% preso e ZERO
     falsi positivi: prudente, quindi con spazio per stringere. Le cinque frasi
     che non vedeva non erano una famiglia sola ma cinque, e sono queste.
     Ogni riga qui e stata aggiunta e poi rimisurata: la regola e che i falsi
     positivi devono restare zero. Una che ne facesse nascere uno andrebbe
     tolta, non addolcita - un diario che si allarma quando uno sbuffa e
     inutilizzabile in una settimana, e quel guasto non si vede. */
  /* la notte in ospedale */
  /\bpronto soccorso\b/, /\bal? pronto soccorso\b/, /\bricoverat[oa]\b/, /\bin ospedale (?:con|per)\b/,
  /\bambulanza\b/, /\bnon ho (?:ancora )?smesso di tremare\b/,
  /\bsiamo (?:ancora )?in ospedale\b/, /\bd'?urgenza\b/, /\bin ospedale\b.{0,40}\bnon ho (?:chiuso occhio|dormito)\b/,
  /* la paura dentro casa, quando non e detta con un verbo di violenza */
  /\btorna a casa ubriac[oa]\b/, /\bquando beve\b.{0,40}\b(mi chiudo|scappo|aspetto)\b/,
  /\bmi chiudo in camera\b/, /\baspetto che si addormenti\b/,
  /\bho paura di (?:tornare a casa|rientrare)\b/, /\bquando (?:lui|lei) ha bevuto\b/,
  /* la fine di una storia lunga, detta come fine e non come litigio */
  /\bse n'?e andat[oa]\b.{0,30}\b(dopo|anni)\b/, /\be finita\b.{0,40}\bdopo\b.{0,20}\banni\b/,
  /\bla casa era vuota\b/, /\bmi ha lasciat[oa]\b.{0,30}\banni\b/,
  /\bci siamo lasciati\b/, /\bl'?armadio era (?:mezzo )?vuoto\b/,
  /* il lavoro perso, che non e «odio il lavoro» */
  /\bmi hanno licenziat[oa]\b/, /\bho perso il lavoro\b/, /\bnon so come si paga\b/,
  /\bmi hanno mandat[oa] via dal lavoro\b/, /\bmi hanno messo in mezzo a una strada\b/,
  /\bnon riesco a pagare (?:l'affitto|il mutuo|le bollette)\b/,
  /* il corpo che non si alza: giorni, non una mattina */
  /\b(?:sono )?(?:tre|quattro|cinque|sei|sette|dieci|\d+) giorni che non (?:esco|mi alzo|mangio|dormo)\b/,
  /\bnon riesco ad alzarmi\b/,
  /* «non e pigrizia» da sola NON basta, e la prova e arrivata dai dati veri:
     scattava su una riga dell'osservatrice - «Non e pigrizia: e che stavi
     progettando un testimone» - che di pesante non ha niente. Nel corpus il
     peso stava nella seconda meta della frase, non in quella. Una regola che
     prende una frase comune e un falso positivo che aspetta il suo giorno. */
  /* la malattia grave */
  /\bterapia intensiva\b/, /\bin coma\b/, /\bmetastasi\b/, /\bchemioterapia\b/, /\bchemio\b/,
  /\btumore\b/, /\bha ricevuto la diagnosi\b/, /\bdiagnosi di\b/,
  /* la perdita, quando e nominata cosi e non si puo confondere */
  /\bho perso\s+(?:il\s+|la\s+|mi[ao]\s+)?(?:bambin[oa]|figli[oa])\b/, /\bveglia funebre\b/, /\bfunerale\b/
];
/* La morte chiede DUE cose insieme: la parola, e una persona a cui riferirla.
   Da sola «e morta» prende la batteria del telefono; da sola «mia nonna» prende
   il suo compleanno. Servono tutte e due nella stessa riga. */
const _PESO_MORTE=/\b(mort[oa]|venut[oa] a mancare|spirat[oa]|se n'e andat[oa] per sempre)\b/;
const _PESO_CARO=/\b(nonn[ao]|madre|padre|mamma|papa|fratello|sorella|figli[oa]|marito|moglie|compagn[oa]|zi[ao]|nipote|amic[ao]|cane|gatt[oa])\b/;
/* e prima di tutto si tolgono i modi di dire, o «sono morto di sonno» diventa un lutto */
const _PESO_MODIDIRE=/\b(mort[oi]?|stanc[oa])\s+di\s+(fame|sonno|sete|freddo|caldo|paura|ridere|noia|stanchezza|lavoro)\b|\bmorend[oa]\s+di\s+\w+/g;
/* ══════ GEMINI — IL PESO RESTA PRIMA DI TUTTO ═════════════════════════
   I due modelli ML locali sperimentali sono stati rimossi dalla branch LAB.
   La Base conserva le regole deterministiche qui sotto: sono immediate, offline
   e non dipendono da nessun provider. La Generativa aggiunge il giudizio
   semantico nel contratto di distillazione Gemini, dove il campo `peso` resta
   una zona di regressione ad alta criticita. */
function pesoLocale(testo){
  let t=String(testo||'').toLowerCase();
  if(!t) return false;
  try{ t=t.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(_){}
  t=t.replace(_PESO_MODIDIRE,' ');
  for(const r of _PESO_LOCALE){ if(r.test(t)) return true; }
  if(_PESO_MORTE.test(t)&&_PESO_CARO.test(t)) return true;
  return false;
}

/* ══ I DUE LIVELLI (v207) ═════════════════════════════════════════════════
   Un solo progetto, un solo file, due marce. Senza chiave e Sentiero e basta:
   il diario, le cose da fare, i rituali, l'anello, la stanza della sera, la
   Chiamata a terra e l'osservatrice che legge i tuoi giorni e ti dice una riga.
   Con la chiave diventa Sentiero - versione Generativa, e le voci le scrive un
   modello sui tuoi giorni invece che il motore di casa.
   Il nome non e cosmetica: decide come l'app parla di se stessa a chi resta in Base. */
function generativa(){ return !!GEMINI_KEY; }
function nomeLivello(){ return generativa()?'Sentiero \u2014 Generativa':'Sentiero'; }

function addDiary(testo,born,done,raw,seme,dom,peso){
  const lst=a=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.trim()).slice(0,20).map(x=>x.slice(0,200)):[];
  const v={data:todayKey(),iso:new Date().toISOString(),testo:clampStr(testo,LIMITS.DIARY),raw:clampStr(raw||'',LIMITS.RAW),born:lst(born),done:lst(done),pos:freshPos(),seme:clampStr(seme||'',40),dom:clampStr(dom||'',LIMITS.DOM)};
  /* v201: il marchio resta sulla voce, non sul momento. Serve dopo, e serve
     soprattutto offline: l'osservatrice locale gira senza chiave e non legge il
     testo - senza questo segno non avrebbe modo di sapere che giorno era. */
  if(peso===true) v.peso=true;
  S.diary.unshift(v);
  if(S.diary.length>LIMITS.DMAX) S.diary.length=LIMITS.DMAX;
}
/* v272.2 — Tieni mette la nota al sicuro PRIMA della rete. */
function diarioProvvisorio(testo){
  const v={data:todayKey(),iso:new Date().toISOString(),testo:clampStr(testo,LIMITS.DIARY),raw:clampStr(testo,LIMITS.RAW),born:[],done:[],pos:freshPos(),seme:'',dom:''};
  S.diary.unshift(v); if(S.diary.length>LIMITS.DMAX) S.diary.length=LIMITS.DMAX; return v;
}
function completaDiario(v,testo,born,done,peso){
  if(!v) return; const lst=a=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.trim()).slice(0,20).map(x=>x.slice(0,200)):[];
  v.testo=clampStr(testo,LIMITS.DIARY); v.born=lst(born); v.done=lst(done);
  if(peso===true) v.peso=true; else try{ delete v.peso; }catch(_){}
}

/* ══ GEMINI — MODEL ROUTING + CONTRATTI ═════════════════════════════════
   Il dominio non conosce Google. Il profilo decide modello, profondita di
   pensiero e - per OCR - fedelta visiva. Massimo privilegia qualita, Bilanciato
   parte dal Flash-Lite gia validato su iPhone e conserva 3.7 come fallback,
   Veloce usa una sola strada economica. */
const AI_CHAINS={
  /* TRE PROFILI, con una eccezione di mestiere: Distillazione usa sempre Flash-Lite.
     Massimo privilegia 3.7 nei lavori riflessivi; Bilanciato parte da Flash-Lite
     e conserva 3.7 come rete di qualita; Veloce usa soltanto Flash-Lite. */
  max:{heavy:['gemini-3.7-flash','gemini-3.5-flash-lite'],cheap:['gemini-3.7-flash','gemini-3.5-flash-lite']},
  balanced:{heavy:['gemini-3.5-flash-lite','gemini-3.7-flash'],cheap:['gemini-3.5-flash-lite','gemini-3.7-flash']},
  fast:{heavy:['gemini-3.5-flash-lite'],cheap:['gemini-3.5-flash-lite']}
};
const AI_HEAVY_TASKS=new Set(['distill','observer','fruit','ocr','observer-distill']);
function aiModels(task){
  /* v272.2 — la Distillazione e estrazione strutturata in tempo reale, non un
     mestiere creativo. Flash-Lite e la strada operativa; Massimo resta 3.7 per
     i mestieri dove il ragionamento lungo porta valore. */
  if(task==='distill'||task==='distill-recovery') return ['gemini-3.5-flash-lite'];
  const mode=(S.settings&&S.settings.aiModel)||'balanced';
  const set=AI_CHAINS[mode]||AI_CHAINS.balanced;
  return (AI_HEAVY_TASKS.has(task)?set.heavy:set.cheap).slice();
}
const AI_MODELS=AI_CHAINS.balanced.heavy.slice();

const AI_SCHEMAS={
  distill:{type:'object',additionalProperties:false,properties:{
    diario:{type:'string'},
    quests:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},titolo:{type:'string'},note:{type:'string'},quando:{type:'string'},ora:{type:'string'},prio:{type:'integer',minimum:1,maximum:3},fatto:{type:'boolean'}},required:['id','titolo','note','quando','ora','prio','fatto']}},
    rituali:{type:'array',items:{type:'object',additionalProperties:false,properties:{titolo:{type:'string'},days:{type:'array',items:{type:'integer',minimum:0,maximum:6}},time:{type:'string'}},required:['titolo','days','time']}},
    letture:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},stato:{type:'string',enum:['completata','trasformata']},prova:{type:'string'},variante:{type:['string','null']},nuovo_titolo:{type:['string','null']}},required:['id','stato','prova','variante','nuovo_titolo']}},
    menzioni:{type:'array',items:{type:'string'}},
    attriti:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},frase:{type:'string'}},required:['id','frase']}},
    sguardo:{type:'object',additionalProperties:false,properties:{livello:{type:'integer',minimum:1,maximum:3},segnale:{type:'string'}},required:['livello','segnale']},
    peso:{type:'boolean'},non_eseguibile:{type:'string'}
  },required:['diario','quests','rituali','letture','menzioni','attriti','sguardo','peso','non_eseguibile']},
  fruit:{type:'object',additionalProperties:false,properties:{frutto:{type:'string'}},required:['frutto']},
  observer:{type:'object',additionalProperties:false,properties:{note:{type:'string'}},required:['note']},
  pietra:{type:'object',additionalProperties:false,properties:{pietra:{type:'string'},compiuto:{type:'boolean'}}},
  sfida:{type:'object',additionalProperties:false,properties:{sfida:{type:'string'}},required:['sfida']},
  seme:{type:'object',additionalProperties:false,properties:{seme:{type:'string'}},required:['seme']},
  terra:{type:'object',additionalProperties:false,properties:{domanda:{type:'string'}},required:['domanda']},
  capitolo:{type:'object',additionalProperties:false,properties:{riga:{type:'string'}},required:['riga']}
};

async function askDistill(transcript){
  const oggi=new Date();
  const giorni=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  const oggiStr=giorni[oggi.getDay()]+' '+todayKey();
  const sched=todaysScheduled().map(t=>({id:t.id,titolo:t.titolo}));
  const sys='Sei il motore di distillazione di "Sentiero", diario vocale personale in italiano. OGGI è '+oggiStr+', ora locale '+oggi.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'})+'.\n'+
'Ricevi: (1) le quest esistenti in JSON, (2) le task già pianificate per oggi, (3) i rituali ricorrenti esistenti, (4) il trascritto vocale grezzo (può contenere errori di riconoscimento).\n'+
'COMPITI:\n'+
'1. Estrai OGNI attività distinta come quest separata. Ignora riempitivi, esitazioni, divagazioni.\n'+
'2. Titolo: imperativo, conciso, iniziale maiuscola, senza "devo/dovrei". Es. "devo chiamare il commercialista per la fattura" → titolo "Chiamare il commercialista", note "per la fattura". Metti il contesto utile in "note", non nel titolo.\n'+
'3. Priorità: 1=urgente (scadenza oggi/critico, parole come "assolutamente", "entro oggi", "urgente"), 2=importante, 3=normale.\n'+
'4. DATE RELATIVE → risolvi in YYYY-MM-DD usando OGGI: "oggi"=oggi, "domani"=+1, "dopodomani"=+2, "tra N giorni", nomi di giorno ("lunedì"→il prossimo lunedì futuro), "tra una settimana"=+7, "fine mese"=ultimo giorno del mese. ORE → "stasera"=20:00, "stamattina/in mattinata"=09:00, "pomeriggio"=15:00, "a pranzo"=13:00, orari espliciti vanno in "ora" (HH:MM). Se nulla è indicato, lascia "quando" e "ora" vuoti.\n'+
'5. COMPLETAMENTI: se dice di aver già fatto qualcosa ("ho chiamato", "fatto", "già spedito") e c\'è una quest che combacia (anche con parole diverse), imposta "fatto":true su quella (stesso id).\n'+
'6. ANTI-DUPLICATI: se un\'attività combacia con una quest esistente o con una task già pianificata per oggi, NON crearne una nuova: aggiorna l\'esistente o ometti.\n'+
'7. QUEST ESISTENTI - IL DELTA: nel campo "quests" metti SOLO le quest NUOVE nate dal racconto e le esistenti MODIFICATE dal racconto (completata: stesso id e "fatto":true; nuova data o priorita: stesso id e il campo cambiato). NON ripetere le esistenti non toccate: il sistema le conserva da solo. Per le nuove lascia "id" vuoto: lo assegna il sistema.\n'+
'8. "diario": il trascritto ripulito SOLO dagli errori evidenti di riconoscimento vocale (omofoni, nomi: "Justin case"→"just in case"). Punteggiatura minima. NON aggiungere, togliere o reinterpretare: restano le parole dell\'utente, in prima persona. Se non serve, identico.\n'+
'9. RITUALI: se l\'utente chiede ESPLICITAMENTE di ripetere o pianificare un\'attività in modo ricorrente ("ogni martedì", "tutti i giorni", "dal lunedì al venerdì", "segna come ricorrente"), NON creare una quest: mettila in "rituali" con "days" (0=lunedì, 1=martedì, 2=mercoledì, 3=giovedì, 4=venerdì, 5=sabato, 6=domenica) ed eventuale "time" HH:MM. SOLO su istruzione esplicita: mai dedurre un rituale da come racconta le sue abitudini ("in questo periodo mi alleno tutti i giorni" è racconto, non istruzione). Se tra i RITUALI ESISTENTI ce n\'è già uno equivalente, non crearlo.\n'+
'10. Se chiede di MODIFICARE o ELIMINARE un rituale esistente, non puoi: lascia tutto intatto e scrivi in "non_eseguibile" una frase breve su cosa non puoi fare (es. "modificare i rituali: si fa a mano dalla lista"). Usa "non_eseguibile" SOLO per questo, altrimenti lascialo vuoto.\n'+
'11. LETTURE (motore di riconoscimento): i RITUALI/TASK DI OGGI e le QUEST hanno un id. Per ogni attivita di cui il racconto dice che E STATA FATTA oggi, aggiungi a "letture" {"id","stato":"completata","prova":parole esatte del trascritto, max 12}. Se ha fatto una VARIANTE reale, "stato":"trasformata" con "variante" e, SOLO se pare la nuova forma stabile, "nuovo_titolo" (altrimenti null). IL SILENZIO NON E UN NO: se un id non e nel racconto, NIENTE riga. In dubbio ometti: un riconoscimento mancato costa un tocco, uno inventato costa la fiducia.\n'+
'12. MENZIONI: array degli id toccati dal racconto in QUALUNQUE modo, anche negati o al futuro.\n'+
'13. ATTRITI (campo importante: cercali DAVVERO, torna indietro a controllare): qualsiasi segnale di fatica, rimando o peso verso un id - "dovrei", "prima o poi", "non ho ancora", "non riesco", "mi pesa", "non ho voglia", "di nuovo non", sfoghi anche indiretti ("uff, la palestra"). Riporta la frase ESATTA: [{"id","frase"}]. Se il racconto contiene anche un solo lamento legato a un id, l\'array NON deve restare vuoto.\n'+
'14. SGUARDO: classifica il diario: 1=cronaca, 2=osservazione su di se, 3=pattern/connessione causale su di se. Vale il livello massimo presente: {"livello":N,"segnale":"frase"}.\n'+
'15. PESO — il campo piu delicato del contratto, e quello dove sbagliare in eccesso costa quanto sbagliare in difetto. Metti "peso":true SOLO se il racconto porta sofferenza grave e reale: un lutto, una malattia seria propria o di una persona vicina, un pensiero di farsi del male o di non esserci piu, violenza o paura in casa, un crollo che non e la stanchezza di una giornata. In tutti gli altri casi "peso":false. NON sono peso e devono restare false: la giornata storta, la rabbia per il lavoro, la stanchezza, lo sfogo, il litigio, il non avere voglia, il sentirsi indietro, la tristezza che passa - sono la materia normale di un diario, e un diario che si allarma a ogni lunedi storto diventa inutilizzabile. Nel dubbio: false. Quando "peso" e true lascia VUOTI "quests", "rituali" e "attriti": da un dolore non nasce un compito. "diario" si compila sempre, come al punto 8, con le parole dell\'utente intatte.\n'+
'Rispondi ESCLUSIVAMENTE con un oggetto JSON, nessun testo prima o dopo:\n'+
'{"diario":"...","quests":[{"id":"...","titolo":"...","note":"","quando":"","ora":"","prio":3,"fatto":false}],"rituali":[{"titolo":"...","days":[0],"time":""}],"letture":[{"id":"...","stato":"completata","prova":"...","variante":null,"nuovo_titolo":null}],"menzioni":["id"],"attriti":[{"id":"...","frase":"..."}],"sguardo":{"livello":1,"segnale":""},"peso":false,"non_eseguibile":""}';
  /* v273 — il modello riceve il delta operativo, non l'archivio. Campi storici
     (nata, monte) e Quest concluse remote non cambiano nessuna decisione della
     distillazione: si tengono solo le ultime venti concluse per riconoscere una
     menzione retrospettiva. */
  const _qA=(S.quests||[]).filter(q=>q&&!q.fatto),_qD=(S.quests||[]).filter(q=>q&&q.fatto).slice(-20);
  const _qCtx=_qA.concat(_qD).slice(-100).map(q=>({id:q.id,titolo:q.titolo,note:q.note||'',quando:q.quando||'',ora:q.ora||'',prio:q.prio||3,fatto:!!q.fatto}));
  const distUser=(window._semeAttivo?'DOMANDA SEMINATA (il racconto risponde a questa):\n'+window._semeAttivo.testo+'\n\n':'')+'QUEST ESISTENTI:\n'+JSON.stringify(_qCtx)+'\n\nTASK GIÀ PIANIFICATE OGGI: '+JSON.stringify(sched)+'\n\nRITUALI ESISTENTI:\n'+JSON.stringify((S.scheduled||[]).map(t=>({id:t.id,titolo:t.titolo,days:t.days,time:t.time})))+'\n\nTRASCRITTO GREZZO ('+todayKey()+'):\n'+transcript;
  /* v272.3 — DISTILLAZIONE: ENDPOINT DEDICATO, NON INTERACTIONS.
     Il test reale su iPhone ha mostrato due timeout consecutivi da 10 s su
     Interactions mentre lo stesso progetto Gemini rispondeva ad altri task.
     Per questo mestiere usiamo GenerateContent, documentato da Google per
     structured output. Due modelli distinti: se il primo rallenta, non ripetiamo
     lo stesso collo di bottiglia. */
  let res=await _geminiGenerate({system:sys,user:distUser,task:'distill',model:'gemini-3.5-flash-lite',schema:AI_SCHEMAS.distill,maxOutputTokens:1800,reasoning:'minimal',timeout:18000});
  if(res&&['timeout','rete','occupato','schema','modello','http','accesso','richiesta'].includes(res.err)){
    const first=res;
    try{ if(typeof micLabel!=='undefined'&&micLabel) micLabel.textContent='Nota al sicuro · provo la seconda strada Gemini…'; }catch(_){}
    const rec=await _geminiGenerate({system:sys,user:distUser,task:'distill-recovery',model:'gemini-3.1-flash-lite',schema:AI_SCHEMAS.distill,maxOutputTokens:1800,reasoning:'minimal',timeout:12000});
    if(rec&&!rec.err){ rec.salti=['generateContent-fallback',first.model+':'+(first.err||''),rec.salti||''].filter(Boolean).join(' ').slice(0,120); res=rec; }
    else if(rec){ rec.salti=['generateContent-fallback-fail',first.model+':'+(first.err||''),rec.salti||''].filter(Boolean).join(' ').slice(0,120); res=rec; }
  }
  if(res.err){ const e=res.err;
    if(e==='chiave') throw new Error('AUTH');
    if(e==='limite'||e==='quota') throw new Error('RATE');
    if(e==='occupato') throw new Error('BUSY');
    if(e==='modello') throw new Error('MODEL');
    if(e==='timeout') throw Object.assign(new Error('TIMEOUT'),{name:'AbortError'});
    if(e==='schema') throw new Error('bad');
    if(e==='offline'||e==='rete') throw new TypeError('rete');
    throw new Error('HTTP '+e);
  }
  const text=res.text||'';
  const _ext=(res.json&&typeof res.json==='object')?res.json:extractJson(text);
  const plan=aiOutputToState(_ext);
  if(plan){
    plan.motore=sanitizeMotore(_ext);
    try{ Object.defineProperty(plan,'_geminiMeta',{value:{model:res.model||'',ms:res.durationMs||0,tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''},enumerable:false}); }catch(_){}
  }
  return plan;
}


/* ══ IL BANCO DEL SUSSURRO (v157, infrastruttura B del Metodo Parisi) ══════════════════════
   Prende i pacchetti conservati accanto alle righe passate (v151) e li rigioca contro il
   contratto di ADESSO. A vuoto: nessun sussurro appare, nessuna brace vola, il registro dei
   battiti non si sporca, il diario non si tocca. Solo un confronto: la riga di allora e la riga
   di adesso, sullo stesso identico materiale. ═══════════════════════════════════════════════ */
let _bancoInCorso=false;
function bancoPacchetti(){
  const out=[];
  const reg=(S.registro||[]);
  for(let i=reg.length-1;i>=0&&out.length<8;i--){
    const e=reg[i];
    if(e&&e.pkg&&(e.tipo==='sussurro'||e.tipo==='silenzio')) out.push(e);
  }
  return out.reverse();
}
function renderBanco(){
  const box=document.querySelector('#banco-esiti'); if(!box) return;
  const b=(S.banco||[]);
  if(!b.length){ box.innerHTML=''; return; }
  let h='';
  b.slice(-8).reverse().forEach(x=>{
    const uguale=(x.prima||'')===(x.dopo||'');
    h+='<div class="switchrow" style="display:block;padding:12px 0">'
      +'<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.55">'+escapeHtml(x.task||'')+' · '+escapeHtml(String(x.iso||'').slice(0,16).replace('T',' '))+'</div>'
      +'<div style="font-size:14px;opacity:.6;margin-top:6px">prima: '+escapeHtml(x.prima||'(silenzio)')+'</div>'
      +'<div style="font-size:15px;margin-top:4px;color:var(--accent)">dopo: '+escapeHtml(x.dopo||'(silenzio)')+'</div>'
      +'<div style="font-size:11px;opacity:.42;margin-top:5px">'+escapeHtml(x.profile||'')+(x.model?' · '+escapeHtml(x.model):'')+(x.ms?' · '+x.ms+' ms':'')+(x.tin?' · '+x.tin+' in':'')+(x.tout?' · '+x.tout+' out':'')+(x.think?' · '+x.think+' pensiero':'')+'</div>'
      +(uguale?'<div style="font-size:12px;opacity:.45;margin-top:4px">identica</div>':'')
      +'</div>';
  });
  box.innerHTML=h;
}
async function eseguiBanco(){
  if(_bancoInCorso) return;
  const note=document.querySelector('#banco-note'), btn=document.querySelector('#btn-banco');
  const lotto=bancoPacchetti();
  if(!lotto.length){ if(note) note.textContent='Nessun pacchetto conservato ancora: i pacchetti entrano nel registro dalla v151, dopo qualche spunta.'; return; }
  if(!GEMINI_KEY){ if(note) note.textContent='Serve la chiave Gemini.'; return; }
  _bancoInCorso=true; if(btn){ btn.disabled=true; btn.textContent='In corso…'; }
  let fatti=0;
  for(const e of lotto){
    if(note) note.textContent='Rigioco '+(fatti+1)+' di '+lotto.length+'…';
    const t0=Date.now();
    let res=null;
    try{ res=await askObserverLine(e.pkg); }catch(_){ res=null; }
    S.banco=(S.banco||[]).concat([{iso:new Date().toISOString(),ver:APP_VERSION.slice(0,24),
      task:clampStr(e.task||'',120),prima:clampStr(e.riga||'',300),
      dopo:clampStr((res&&res.riga)||'',300),model:(res&&res.model)||'',profile:(S.settings&&S.settings.aiModel)||'balanced',
      ms:Date.now()-t0,tin:(res&&res.tin)||0,tout:(res&&res.tout)||0,think:(res&&res.thought)||0,pkg:e.pkg}]).slice(-24);
    fatti++; save(); renderBanco();
    await new Promise(s=>setTimeout(s,400));   /* il banco non ha fretta: e un laboratorio, non una spunta */
  }
  regCantiere('banco',{msg:'rigiocati '+fatti+' pacchetti'});
  if(note) note.textContent='Fatti '+fatti+'. Gli esiti sono nel prossimo backup: prima e dopo sullo stesso pacchetto.';
  if(btn){ btn.disabled=false; btn.textContent='Rigioca'; }
  _bancoInCorso=false;
}

/* ══ LAB 13 — BANCO DELLE ALTRE VOCI, COME IN PRODUZIONE ═══════════════════
   Niente input sintetico e niente salvataggi. L'Osservatrice riceve lo stesso
   FATTO gia scelto dal motore locale che riceverebbe nella catena reale; lo
   Scritto distillato legge il vero pacchetto degli ultimi giorni; il Frutto
   parte solo se ieri contiene davvero materiale. Se una voce non ha materia,
   il banco dice "non testato": non finge che Gemini abbia taciuto. */
let _bancoVociInCorso=false;
function _observerBenchInput(){
  const d=buildObserverDigest();
  try{ d.famiglie_recenti=(S.obsFamiglie||[]).slice(-4); }catch(_){}
  try{ d.forme_recenti=(S.obsForme||[]).slice(-24); }catch(_){}
  let fatti=[],scelta=null;
  try{ fatti=_ossFatti(d); scelta=_scegliCosa(fatti,d); }catch(_){}
  if(!scelta||scelta.silenzio||!scelta.fatto) return {ok:false,perche:'nessun fatto meritevole nei giorni conclusi'};
  d.cosa_gia_scelta=scelta;
  d.fatto_scelto={tipo:scelta.fatto.t,di:(scelta.fatto.cosa||scelta.fatto.ferma||''),
    conserva:(scelta.fatto.conserva||[]).slice(),
    istruzione:'Scrivi la riga SOLO su questo fatto. Non sceglierne un altro.'};
  return {ok:true,digest:d};
}
function _bancoCard(nome,testo,piede){
  const t=String(testo||'');
  const fail=/^(?:errore:|formato non valido|\(errore:|quota temporaneamente)/i.test(t);
  const skip=/^\(non testat|^\(non applicabile/i.test(t);
  const mark=fail?'✕ ':skip?'— ':'✓ ';
  return '<div class="switchrow" style="display:block"><b>'+escapeHtml(mark+nome)+'</b>'+
    '<div style="margin-top:6px">'+escapeHtml(testo)+'</div>'+
    (piede?'<small>'+escapeHtml(piede)+'</small>':'')+'</div>';
}
function _bancoRateText(){
  const st=_aiRateChainState(aiModels('observer')); if(!st.blocked) return '';
  return st.kind==='quota'
    ?('quota giornaliera raggiunta · Sentiero resta locale · riprova dopo il reset (~'+_aiRateHuman(st.waitMs)+')')
    :('limite temporaneo Gemini · Sentiero resta locale · riprova tra ~'+_aiRateHuman(st.waitMs));
}
function _bancoStopQuota(righe,box,note){
  const tx=_bancoRateText(); if(!tx) return false;
  righe.push(_bancoCard('Gemini in pausa',tx,'le altre prove non vengono inviate: zero chiamate inutili'));
  if(box) box.innerHTML=righe.join('');
  if(note) note.textContent='Banco fermato sulla quota: nessun altro test viene mandato a Gemini.';
  return true;
}
function _bancoErrore(e){ const x=String((e&&e.message)||e||''); return (x==='RATE'||x==='limite'||x==='quota')?'quota temporaneamente raggiunta':x; }
async function eseguiBancoVoci(){
  if(_bancoVociInCorso) return;
  const btn=document.querySelector('#btn-banco-voci'),note=document.querySelector('#banco-voci-note'),box=document.querySelector('#banco-voci-esiti');
  if(!GEMINI_KEY){ if(note) note.textContent='Serve la chiave Gemini.'; return; }
  const prof=(S.settings&&S.settings.aiModel)||'balanced';
  _bancoVociInCorso=true; if(btn){ btn.disabled=true; btn.textContent='In corso…'; } if(box) box.innerHTML='';
  const righe=[];
  try{
    if(_bancoStopQuota(righe,box,note)) return;
    if(note) note.textContent='Provo la distillazione strutturata su una voce reale e non pesante…';
    try{
      const de=(S.diary||[]).find(e=>e&&e.testo&&e.peso!==true&&String(e.testo).trim().length>=8);
      if(!de){
        righe.push(_bancoCard('Distillazione strutturata','(non testato: nessuna voce reale adatta)','nessuna chiamata Gemini'));
      }else{
        const tD=Date.now();
        try{
          const dp=await askDistill(String(de.testo));
          if(!dp) righe.push(_bancoCard('Distillazione strutturata','(nessun piano valido)','controlla Diagnostica'));
          else{
            const dm=dp._geminiMeta||{};
            const nq=Array.isArray(dp.quests)?dp.quests.length:0,nr=Array.isArray(dp.rituali)?dp.rituali.length:0;
            const sint='JSON valido · '+nq+(nq===1?' quest':' quest')+' · '+nr+(nr===1?' rituale':' rituali')+' · peso '+(dp.peso===true?'sì':'no');
            righe.push(_bancoCard('Distillazione strutturata',sint,prof+' · '+(dm.model||'?')+' · '+(Date.now()-tD)+' ms · nessun salvataggio'));
          }
        }catch(e){ righe.push(_bancoCard('Distillazione strutturata','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-tD)+' ms')); }
      }
    }catch(_){ righe.push(_bancoCard('Distillazione strutturata','(non testato: materiale non disponibile)','nessuna chiamata Gemini')); }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Provo la Mente Osservatrice sullo stesso fatto che userebbe davvero…';
    const ob=_observerBenchInput();
    if(!ob.ok){
      righe.push(_bancoCard('Osservatrice','(non testato: '+ob.perche+')','nessuna chiamata Gemini'));
    }else{
      const t0=Date.now();
      try{
        const o=await askObserver(ob.digest);
        righe.push(_bancoCard('Osservatrice',(o&&o.note)||'(silenzio)',prof+' · '+((o&&o.model)||'?')+' · '+(Date.now()-t0)+' ms'));
      }catch(e){
        righe.push(_bancoCard('Osservatrice','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-t0)+' ms'));
      }
    }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Provo lo Scritto distillato senza salvarlo…';
    const pp=buildPeriodPackage(), haPeriodo=(pp&&((pp.diario&&pp.diario.length)||(pp.giorni_attivi|0)>0));
    if(!haPeriodo){
      righe.push(_bancoCard('Scritto distillato','(non testato: non c’è ancora un periodo ordinario da rileggere)','nessuna chiamata Gemini'));
    }else{
      const t2=Date.now();
      try{
        const od=await askObserverDistill(pp);
        const tx=od&&od.text?od.text:('(errore: '+((od&&od.err)||'nessun esito')+')');
        righe.push(_bancoCard('Scritto distillato',tx,prof+' · '+((od&&od.model)||'?')+' · '+(Date.now()-t2)+' ms'));
      }catch(e){
        righe.push(_bancoCard('Scritto distillato','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-t2)+' ms'));
      }
    }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Controllo se il Frutto ha davvero un ieri da leggere…';
    const fp=fruttoPacchetto(S,todayKey());
    if(!fp.fatte_ieri.length&&!fp.mancate_ieri.length){
      righe.push(_bancoCard('Frutto','(non testato: ieri vuoto)','nessuna chiamata Gemini'));
    }else{
      const t1=Date.now();
      try{
        const f=await scriviFrutto(S,todayKey());
        let txt='(nessun esito)';
        if(f&&f.riga) txt=f.riga;
        else if(f&&f.silenzio) txt='(silenzio scelto dal modello)';
        else if(f&&f.veto) txt='(veto locale: '+f.veto+')';
        else if(f&&f.errore) txt='(errore: '+f.errore+')';
        righe.push(_bancoCard('Frutto',txt,prof+' · '+((f&&f.meta&&f.meta.model)||'?')+' · '+(Date.now()-t1)+' ms'));
      }catch(e){
        righe.push(_bancoCard('Frutto','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-t1)+' ms'));
      }
    }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Provo il Seme con la stessa candidatura che userebbe oggi…';
    try{
      const d=new Date(),tk=todayKey();
      const cand=seminaCandidate(S,{tk:tk,ora:d.getHours(),dow:dowOf(d),sealed:S.lastSealed===tk,vuoti:giorniVuoti(S,tk)});
      if(!cand){
        righe.push(_bancoCard('Seme','(non testato: in questo momento il motore locale non pianterebbe un seme)','nessuna chiamata Gemini'));
      }else{
        const t3=Date.now();
        try{
          const sr=await askSemeResult(cand),st=sr.testo||'';
          const mem=(S.semi||[]).slice(-12).map(x=>x&&x.testo).filter(Boolean);
          if(!st){
            righe.push(_bancoCard('Seme','(nessuna domanda emessa; in produzione entra il vivaio locale)',prof+' · '+(sr.model||'?')+' · '+(Date.now()-t3)+' ms'));
          }else{
            const ok=semeFiltro(st,mem,cand.tipo);
            righe.push(_bancoCard('Seme',ok?st:'(veto locale: la domanda non passa il contratto)',prof+' · '+(sr.model||'?')+' · '+(Date.now()-t3)+' ms'));
          }
        }catch(e){
          righe.push(_bancoCard('Seme','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-t3)+' ms'));
        }
      }
    }catch(e){
      righe.push(_bancoCard('Seme','(non testato: candidatura non disponibile)','nessuna chiamata Gemini'));
    }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Rigioco un Sussurro reale senza salvarlo…';
    try{
      const pac=bancoPacchetti().filter(e=>e&&e.pkg&&sussurroServeGemini(e.pkg)).slice(-1)[0];
      if(!pac){
        righe.push(_bancoCard('Sussurro','(non testato: nessun pacchetto reale con un filo abbastanza forte)','nessuna chiamata Gemini'));
      }else{
        const t4=Date.now();
        try{
          const sr=await askObserverLine(pac.pkg),grezzo=sr&&sr.riga?sr.riga:'';
          if(!grezzo) righe.push(_bancoCard('Sussurro','(silenzio scelto dal modello)',prof+' · '+((sr&&sr.model)||'?')+' · '+(Date.now()-t4)+' ms'));
          else{
            const line=raffinaRiga(grezzo),male=rigaDaButtare(line);
            righe.push(_bancoCard('Sussurro',male?('(veto locale: '+male+')'):line,prof+' · '+((sr&&sr.model)||'?')+' · '+(Date.now()-t4)+' ms · pacchetto reale'));
          }
        }catch(e){ righe.push(_bancoCard('Sussurro','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-t4)+' ms')); }
      }
    }catch(_){ righe.push(_bancoCard('Sussurro','(non testato: pacchetto non disponibile)','nessuna chiamata Gemini')); }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Controllo se la Montagna chiederebbe davvero una nuova Pietra…';
    try{
      if(!S.desiderio){
        righe.push(_bancoCard('Pietra','(non testato: nessun desiderio attivo)','nessuna chiamata Gemini'));
      }else if(_pietraViva()){
        righe.push(_bancoCard('Pietra','(non testato: esiste già una pietra viva; il prodotto non ne chiederebbe un’altra)','nessuna chiamata Gemini'));
      }else{
        const tP=Date.now();
        try{
          const pr=await askPietraResult();
          let tx='(nessun esito)'; if(pr&&pr.out){ if(pr.out.compiuto===true) tx='(montagna compiuta)'; else if(pr.out.pietra) tx=String(pr.out.pietra); }
          righe.push(_bancoCard('Pietra',tx,prof+' · '+((pr&&pr.model)||'?')+' · '+(Date.now()-tP)+' ms · nessun salvataggio'));
        }catch(e){ righe.push(_bancoCard('Pietra','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-tP)+' ms')); }
      }
    }catch(_){ righe.push(_bancoCard('Pietra','(non testato: stato non disponibile)','nessuna chiamata Gemini')); }
    if(_bancoStopQuota(righe,box,note)) return;

    if(note) note.textContent='Controllo se esiste una Sfida che il motore proporrebbe davvero…';
    try{
      const sf=sfidaCandidate(S,todayKey());
      if(!sf){
        righe.push(_bancoCard('Sfida','(non testato: nessun rituale è maturo per essere alzato)','nessuna chiamata Gemini'));
      }else if(sf.tipo!=='assaggio'){
        righe.push(_bancoCard('Sfida','(non testato: lo stato corrente richiede una decisione locale, non una nuova frase)','nessuna chiamata Gemini'));
      }else if(sf.forma){
        righe.push(_bancoCard('Sfida','(non testato: la forma alzata esiste già)','nessuna chiamata Gemini'));
      }else{
        const tF=Date.now();
        try{ const fx=await askSfida(sf.id); righe.push(_bancoCard('Sfida',fx,prof+' · modello in Diagnostica · '+(Date.now()-tF)+' ms · nessun salvataggio')); }
        catch(e){ righe.push(_bancoCard('Sfida','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-tF)+' ms')); }
      }
    }catch(_){ righe.push(_bancoCard('Sfida','(non testato: candidatura non disponibile)','nessuna chiamata Gemini')); }
    if(_bancoStopQuota(righe,box,note)) return;

    /* Lab 17 — Capitolo: altra famiglia reale, senza inventare un mese.
       Usa solo un mese che il prodotto stesso considererebbe da rilegare e non
       salva ne capitolo ne ensō. Se non esiste, il gate resta chiuso. */
    try{
      const cand=capitoloCandidati(S,todayKey().slice(0,7));
      if(!cand.length){
        righe.push(_bancoCard('Capitolo','(non testato: nessun mese reale da rilegare)','nessuna chiamata Gemini'));
      }else{
        const mese=cand[cand.length-1], f=capitoloFotografia(S,mese), tC=Date.now();
        try{ const cx=await askCapitolo(f,mese); righe.push(_bancoCard('Capitolo',cx,prof+' · modello in Diagnostica · '+(Date.now()-tC)+' ms · nessun salvataggio')); }
        catch(e){ righe.push(_bancoCard('Capitolo','errore: '+_bancoErrore(e),prof+' · '+(Date.now()-tC)+' ms')); }
      }
    }catch(_){ righe.push(_bancoCard('Capitolo','(non testato: candidatura non disponibile)','nessuna chiamata Gemini')); }

    if(box) box.innerHTML=righe.join('');
    if(note) note.textContent='Prova finita. Nessun risultato è stato salvato; la Diagnostica conserva soltanto metadati tecnici.';
  } finally { _bancoVociInCorso=false; if(btn){ btn.disabled=false; btn.textContent='Prova'; } }
}

let _bancoDesiderioInCorso=false;
async function eseguiBancoDesiderio(){
  if(_bancoDesiderioInCorso) return;
  const btn=document.querySelector('#btn-banco-desiderio'), note=document.querySelector('#banco-desiderio-note'), box=document.querySelector('#banco-desiderio-esito');
  const des=clampStr(String((document.querySelector('#banco-desiderio-txt')||{}).value||'').trim(),240);
  const ost=clampStr(String((document.querySelector('#banco-desiderio-ost')||{}).value||'').trim(),240);
  if(!GEMINI_KEY){ if(note) note.textContent='Serve la chiave Gemini.'; return; }
  if(!des||!ost){ if(note) note.textContent='Scrivi sia il desiderio sia cosa ti ha fermato finora.'; return; }
  const prof=(S.settings&&S.settings.aiModel)||'balanced', t0=Date.now();
  const c0=_aiRateChainState(aiModels('desiderio'));
  if(c0.blocked){
    if(box) box.innerHTML=_bancoCard('Desiderio strutturato',c0.kind==='quota'?'quota giornaliera raggiunta':'Gemini è in pausa per limite temporaneo','nessuna chiamata API · riprova tra ~'+_aiRateHuman(c0.waitMs));
    if(note) note.textContent='La prova non parte: aspetto la quota invece di martellare Gemini.'; return;
  }
  _bancoDesiderioInCorso=true; if(btn){ btn.disabled=true; btn.textContent='In corso…'; } if(box) box.innerHTML='';
  if(note) note.textContent='Provo la stessa chiamata strutturata della Montagna, senza creare nulla…';
  try{
    const r=await askDesiderioResult(des,ost), out=r&&r.out;
    const cresta=(out&&Array.isArray(out.cresta)?out.cresta:[]).map(x=>clampStr(String(x),120)).filter(Boolean).slice(0,4);
    const pietra=clampStr(String((out&&out.pietra)||''),160);
    if(box) box.innerHTML=_bancoCard('Desiderio strutturato','cresta: '+cresta.join(' → ')+' · prima pietra: '+pietra,prof+' · '+((r&&r.model)||'?')+' · '+((r&&r.wire)||'?')+' · '+(Date.now()-t0)+' ms · nessun salvataggio');
    if(note) note.textContent='Prova finita. Desiderio, ostacolo, cresta e pietra non sono stati salvati da Sentiero.';
  }catch(e){
    const ex=String((e&&e.message)||e), quota=(ex==='limite'||ex==='quota'||ex==='RATE');
    if(box) box.innerHTML=_bancoCard('Desiderio strutturato',quota?'quota temporaneamente raggiunta':(ex==='schema'?'formato non valido dopo i fallback':('errore: '+ex)),prof+' · '+(Date.now()-t0)+' ms · nessun salvataggio');
    if(note) note.textContent=quota?'Nessun difetto del Desiderio dimostrato: Gemini ha risposto 429. Aspetto la quota.':'La prova non ha modificato lo stato.';
  }finally{ _bancoDesiderioInCorso=false; if(btn){ btn.disabled=false; btn.textContent='Prova senza salvare'; } }
}

/* ══ IL FRUTTO DI IERI ══════════════════════════════════════════════════════════════════════
   Tre righe, tutte calcolate qui: nessuna chiamata al modello, nessuna invenzione possibile.
     LETTURA — cosa ha detto l'amico ieri, parola per parola (o, se ha taciuto, la forma del giorno)
     ALBERO  — una cosa vera da settimane, che spiega perche quel frutto e venuto cosi
     MOSSA   — una cosa per stasera, e SOLO una che nell'orologio viene ancora dopo
   Un numero per riga, mai un rapporto: la legge del sussurro vale anche qui. ══════════════ */

function _fPar(n){
  const W=['zero','una','due','tre','quattro','cinque','sei','sette','otto','nove','dieci',
           'undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove','venti'];
  return (n>=0&&n<W.length)?W[n]:String(n);
}
function _fGiorno(i){ return ['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'][i]; }
function _fIeri(tk){ const d=new Date(tk+'T12:00:00'); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
function _fDow(tk){ return (new Date(tk+'T12:00:00').getDay()+6)%7; }
function _fPrevista(t,tk){ return !!(t&&Array.isArray(t.days)&&t.days.includes(_fDow(tk)))||!!(t&&t.date&&t.date===tk); }
function _fFatta(S,t,tk){ return !!(S.checks&&S.checks[tk]&&S.checks[tk][t.id]===true); }
function _fGiorni(S){ return Object.keys(S.checks||{}).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort(); }
/* le quest ricorrenti con un titolo ambiguo vanno distinte, se no ogni lettura che le tocca e cieca */
function _fTitolo(S,t){
  const uguali=(S.scheduled||[]).filter(x=>x&&x.titolo===t.titolo);
  if(uguali.length<2||!t.time) return t.titolo;
  const h=parseInt(String(t.time).slice(0,2),10);
  return t.titolo+(h<13?' del mattino':' del pomeriggio');
}

/* ── LETTURA ──────────────────────────────────────────────────────────────── */
function frGenereSbagliato(S,r){
  const g=(S&&S.settings&&S.settings.genere)||'';
  if(g!=='m'&&g!=='f') return false;
  const fem=/\b(sei|eri|ti sei|non sei|saresti)\s+\w*(ata|uta|ita)\b|\btu stessa\b/i.test(r);
  const mas=/\b(sei|eri|ti sei|non sei|saresti)\s+\w*(ato|uto|ito)\b|\btu stesso\b/i.test(r);
  return g==='m'?fem:mas;
}
const _F_RITORNO=/(torna|tornano|tornato|tornata|ritorno|riapre|ripres|dopo un vuoto|mancate di fila|saltat)/i;


/* ── ALBERO ───────────────────────────────────────────────────────────────── */
function frAlberi(S,tk){
  const out=[]; const gg=_fGiorni(S).filter(d=>d<tk);
  if(gg.length<10) return out;
  const att=(S.scheduled||[]).filter(t=>t&&t.id&&t.titolo&&Array.isArray(t.days)&&t.days.length);
  /* catene: A tira C. Solo un verso, quello piu forte, e solo con abbastanza occasioni */
  /* Una correlazione e simmetrica, una frase no: «quando fai X, Y arriva» dice che X viene PRIMA.
     Se l'orologio dice il contrario la frase e falsa anche se i numeri tornano - e la stessa
     superstizione dell'ordine gia trovata sulla mossa. Quindi la catena si racconta SEMPRE nel
     verso del tempo, e la probabilita si ricalcola in quel verso. */
  const ore=frOreTipiche(S);
  const viste={};
  att.forEach(a=>att.forEach(c=>{
    if(a.id===c.id) return;
    const chiave=[a.id,c.id].sort().join('|');
    const com=gg.filter(d=>_fPrevista(a,d)&&_fPrevista(c,d));
    if(com.length<20) return;
    const ha=frOraDi(S,a,ore), hc=frOraDi(S,c,ore);
    if(ha!==null&&hc!==null&&ha>hc+0.5) return;      /* verso sbagliato: la coppia si guarda dall'altro lato */
    const fa=com.filter(d=>_fFatta(S,a,d)), na=com.filter(d=>!_fFatta(S,a,d));
    if(fa.length<8||na.length<8) return;
    const p1=fa.filter(d=>_fFatta(S,c,d)).length/fa.length;
    const p0=na.filter(d=>_fFatta(S,c,d)).length/na.length;
    const salto=p1-p0;
    if(salto<0.20) return;
    if(viste[chiave]&&viste[chiave]>=salto) return;
    viste[chiave]=salto;
    const forza=p1>=0.99?'arriva sempre, senza una sola eccezione':p1>=0.8?'arriva quasi sempre':'arriva molto più spesso';
    out.push({id:'catena:'+chiave,peso:salto+0.5,tira:c.id,
      testo:'quando fai «'+_fTitolo(S,a)+'», «'+_fTitolo(S,c)+'» '+forza+'.'});
  }));
  /* ritorni e strisce */
  att.forEach(t=>{
    const p=gg.filter(d=>_fPrevista(t,d));
    let best=0,cur=0,rit=0,vuoto=0;
    p.forEach(d=>{
      const ok=_fFatta(S,t,d);
      cur=ok?cur+1:0; if(cur>best) best=cur;
      if(ok){ if(vuoto>=2) rit++; vuoto=0; } else vuoto++;
    });
    if(rit>=3) out.push({id:'ritorni:'+t.id,peso:0.4+rit/20,tira:t.id,
      testo:'«'+_fTitolo(S,t)+'» l\'hai ripresa '+_fPar(rit)+' volte dopo averla mollata.'});
    if(best>=5) out.push({id:'striscia:'+t.id,peso:0.3+best/40,tira:t.id,
      testo:'su «'+_fTitolo(S,t)+'» sei arrivato a '+_fPar(best)+' volte di fila: è la tua striscia più lunga su questa.'});
  });
  /* il giorno della settimana */
  const perd={}; gg.forEach(d=>{ const k=_fDow(d);
    (perd[k]=perd[k]||[]).push(Object.keys(S.checks[d]||{}).filter(x=>S.checks[d][x]===true).length); });
  const tutti=[].concat.apply([],Object.keys(perd).map(k=>perd[k]));
  const media=tutti.reduce((a,b)=>a+b,0)/(tutti.length||1);
  Object.keys(perd).forEach(k=>{
    if(perd[k].length<5) return;
    const m=perd[k].reduce((a,b)=>a+b,0)/perd[k].length;
    if(m-media>=0.8) out.push({id:'sett:'+k,peso:0.35,testo:'il '+_fGiorno(+k)+' è il giorno in cui ti riesce di più, da settimane.'});
    if(media-m>=0.8) out.push({id:'sett:'+k,peso:0.35,testo:'il '+_fGiorno(+k)+' è il giorno in cui lasci cadere di più, e succede da settimane.'});
  });
  return out.sort((a,b)=>b.peso-a.peso);
}


/* ── MOSSA ────────────────────────────────────────────────────────────────── */
/* l'ora tipica in cui una quest viene chiusa: dal registro, che e l'unica traccia oraria vera */
function frOreTipiche(S){
  const per={};
  (S.registro||[]).forEach(e=>{
    if(!e||(e.tipo!=='sussurro'&&e.tipo!=='silenzio')||!e.task||!e.t) return;
    /* regCantiere scrive l'istante in UTC senza marcatore: senza la Z si legge due ore indietro
       e la regola dell'orologio sbaglia di due ore, che e esattamente l'errore da evitare qui. */
    const d=new Date(String(e.t)+'Z');
    if(isNaN(d.getTime())) return;
    (per[e.task]=per[e.task]||[]).push(d.getHours()+d.getMinutes()/60);
  });
  const out={};
  Object.keys(per).forEach(k=>{ const v=per[k]; if(v.length>=3) out[k]=v.reduce((a,b)=>a+b,0)/v.length; });
  return out;
}
/* l'ora di una quest: prima quella che le hai messo tu, poi quella che risulta dai fatti.
   La tua batte la media, perche due quest con lo stesso titolo nel registro si confondono. */
function frOraDi(S,t,ore){
  if(t&&typeof t.time==='string'&&/^\d{2}:\d{2}$/.test(t.time)){
    return parseInt(t.time.slice(0,2),10)+parseInt(t.time.slice(3),10)/60;
  }
  const h=ore[t&&t.titolo];
  return (h===undefined)?null:h;
}
function frMossa(S,tk,oraOra,albero){
  const dow=_fDow(tk);
  const oggi=(S.scheduled||[]).filter(t=>t&&t.id&&_fPrevista(t,tk)&&!_fFatta(S,t,tk));
  if(!oggi.length) return null;
  const ore=frOreTipiche(S);
  /* SOLO una quest che nell'orologio viene ancora dopo: dire «comincia da X» quando X e gia passata
     e una superstizione, non un consiglio. */
  const dopo=oggi.filter(t=>{ const h=frOraDi(S,t,ore); return h===null?true:(h>=oraOra-0.5); });
  if(!dopo.length) return null;
  let scelta=null;
  if(albero&&albero.tira) scelta=dopo.filter(t=>t.id===albero.tira)[0]||null;
  if(!scelta){
    /* altrimenti quella che manca da piu tempo fra le previste di oggi */
    let peggio=-1;
    dopo.forEach(t=>{
      const gg=_fGiorni(S).filter(d=>d<tk&&_fPrevista(t,d)).slice(-14);
      let vuoto=0; for(let i=gg.length-1;i>=0;i--){ if(_fFatta(S,t,gg[i])) break; vuoto++; }
      if(vuoto>peggio){ peggio=vuoto; scelta=t; }
    });
  }
  if(!scelta) return null;
  const h=frOraDi(S,scelta,ore);
  const quando=(h===null)?'':(h>=19?' — di solito la chiudi di sera':h>=14?' — di solito la chiudi nel pomeriggio':h>=11?' — di solito verso mezzogiorno':' — di solito la chiudi al mattino');
  return {id:scelta.id,testo:'oggi c\'è ancora «'+_fTitolo(S,scelta)+'»'+quando+'.'};
}

/* ── IL FRUTTO ────────────────────────────────────────────────────────────── */

/* ══ IL FRUTTO SCRITTO (v164) ═══════════════════════════════════════════════════════════════
   La carta calcolata garantiva la verita ma non il senso: righe di ieri rilette stamattina coi
   deittici rotti, correlazioni vere e vuote, e il dialetto interno («rara») colato addosso a chi
   legge. Da qui: i FATTI restano del client, la SCRITTURA e del modello, ogni mattina, per
   stamattina. E davanti c'e un veto meccanico: lessico interno, rapporti, genere sbagliato -
   NIENTE CARTA. Meglio nessun frutto che un frutto morto. ═══════════════════════════════ */
const FRUTTO_SYS=
"Sei la voce del mattino di Sentiero. Scrivi IL FRUTTO DI IERI: la prima cosa che la persona legge aprendo la giornata.\n"+
"COSA: DUE o TRE frasi brevi su cosa e stato davvero ieri, viste da stamattina. Non un elenco: una lettura - cosa tiene, cosa e tornato, cosa manca, cosa lega i fatti fra loro.\n"+
"LINGUA: italiano di tutti i giorni, come si parla a un amico al bar. La carta puo finire su WhatsApp: deve capirla chiunque, anche chi non sa cosa sia Sentiero. Minuscole anche a inizio frase.\n"+
"VIETATO, pena il cestino: le parole interne dell'app (vuota, rara, a meta, piena, quasi piena, occasioni previste, arco, task, quest, streak, spunta, rituale); i rapporti numerici (3 su 7, sette su sette); piu di UN numero in tutto; ieri detto come se fosse oggi (le righe_di_ieri sono scritte DENTRO ieri: raccontale da stamattina, non copiarle); lodi generiche, esclamazioni, emoji, morale in coda.\n"+
"I NOMI: usa i nomi veri delle cose della persona (il libro, il sonno, il caffe), mai i titoli tecnici fra virgolette.\n"+
"CHI TI LEGGE: il campo chi_ti_legge dice se e un uomo o una donna: ogni accordo segue quello. Se non lo sai, gira la frase.\n"+
"IL RESPIRO: quattordici parole per frase, mai sopra venti. Una frase su tre sotto le otto parole, e l'ultima sia quella: chiude. IL TRATTINO NON CE L'HAI: nella prosa di Pavese, London e Pratchett sono tre ogni cento frasi. Dove ti viene, mettici un punto. Non far girare le frasi su e, sono, hai: cerca un verbo che faccia qualcosa. Prima la cosa concreta (l'oggetto, le sue parole), poi cosa vuol dire.\n"+
"L'ORA NON CE L'HAI. Sentiero registra quando lui SEGNA una cosa, non quando la fa: puo allenarsi a mezzogiorno e spuntarla a mezzanotte. Non dire mai a che ora ha fatto qualcosa, non dire che e partito tardi, non dire che un orario slitta. Se in righe_di_ieri trovi frasi che lo fanno, erano sbagliate: non riprenderle.\n"+
"IL PESO: se ieri_pesava e true, ieri ha portato sofferenza grave e reale. Allora niente lettura di come e andata, niente cosa tiene e cosa manca, niente legami fra i fatti, nessuna morale, nessuna spinta verso oggi. Al massimo due frasi brevi che dicono che hai letto e che resti. Non dire che capisci, non dire che passera, non dirgli cosa fare. Se hai il minimo dubbio che quello che stai per scrivere suoni come un bilancio, rispondi SILENZIO.\n"+
"SILENZIO: se il materiale non regge due frasi vere e comprensibili, rispondi con la sola parola SILENZIO. Nessuna carta e meglio di una carta vuota.\n"+
"Rispondi SOLO con il testo del frutto, senza JSON, markdown o etichette. Se non c'e abbastanza materiale, rispondi con la sola parola SILENZIO.";
function fruttoPacchetto(S,tk){
  const ieri=_fIeri(tk);
  const p={};
  try{ const d=new Date(ieri+'T12:00:00');
    p.ieri=d.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'}); }catch(_){ p.ieri=ieri; }
  p.chi_ti_legge=(S.settings&&S.settings.genere==='m')?'un uomo':(S.settings&&S.settings.genere==='f')?'una donna':'non lo sai: non usare accordi di genere';
  const fatteIds=Object.keys((S.checks&&S.checks[ieri])||{}).filter(k=>S.checks[ieri][k]===true);
  const nome=id=>{ const t=(S.scheduled||[]).find(x=>x&&x.id===id)||(S.quests||[]).find(x=>x&&x.id===id)||(S.questLog||[]).find(x=>x&&x.id===id); return t?_fTitolo(S,t):null; };
  p.fatte_ieri=fatteIds.map(nome).filter(Boolean);
  p.ritorni_di_ieri=[];
  (S.scheduled||[]).forEach(t=>{
    if(!t||!t.id||!Array.isArray(t.days)||!t.days.length) return;
    if(!_fPrevista(t,ieri)||!_fFatta(S,t,ieri)) return;
    const prima=_fGiorni(S).filter(d=>d<ieri&&_fPrevista(t,d));
    let vuoto=0; for(let i=prima.length-1;i>=0;i--){ if(_fFatta(S,t,prima[i])) break; vuoto++; }
    if(vuoto>=2) p.ritorni_di_ieri.push({cosa:_fTitolo(S,t),dopo:_fPar(vuoto)+' volte saltata'});
  });
  p.mancate_ieri=(S.scheduled||[]).filter(t=>t&&t.id&&Array.isArray(t.days)&&t.days.length&&_fPrevista(t,ieri)&&!_fFatta(S,t,ieri)).map(t=>_fTitolo(S,t));
  try{ if(S.patto&&S.patto.tk===ieri){ const q=nome(S.patto.id);
    if(q) p.patto_di_ieri={promessa:q,mantenuto:fatteIds.indexOf(S.patto.id)>=0,azzardo:!!S.patto.audace}; } }catch(_){}
  p.radici=frAlberi(S,tk).slice(0,3).map(a=>a.testo);
  p.righe_di_ieri=[];
  (S.registro||[]).forEach(e=>{ if(e&&e.tipo==='sussurro'&&e.riga&&String(e.t||'').slice(0,10)===ieri) p.righe_di_ieri.push(String(e.riga).slice(0,220)); });
  p.righe_di_ieri=p.righe_di_ieri.slice(0,6);
  p.diario_di_ieri=(S.diary||[]).filter(x=>x&&x.data===ieri&&x.testo).slice(0,3).map(x=>String(x.testo).slice(0,200));
  /* v202 — IL MATTINO DOPO.
     Il frutto e messo peggio dell'osservatrice, e per due ragioni insieme: legge
     davvero il testo del diario (diario_di_ieri) e riceve l'elenco di tutto quello
     che non hai fatto (mancate_ieri). Il giorno di un lutto quell'elenco e pieno per
     definizione - non hai spuntato niente - e il mestiere del frutto e scrivere
     «cosa e stato davvero ieri». Cioe: la mattina dopo, sopra la voce di diario che
     racconta la morte di una persona, una lettura costruita su una lista di
     mancanze.
     Le mancanze non gliele diamo proprio. Non e una raccomandazione nel prompt: e
     materiale che non parte. Se poi non resta niente da dire, scriviFrutto tace da
     solo, ed e la cosa giusta - nessuna carta e meglio di una carta vuota. */
  p.ieri_pesava=(S.diary||[]).some(x=>x&&x.data===ieri&&x.peso===true);
  if(p.ieri_pesava){ p.mancate_ieri=[]; p.ritorni_di_ieri=[]; }
  return p;
}
function fruttoVeto(S,testo){
  const t=String(testo||'');
  /* v268.2: il protocollo si ferma qui, l'ultimo posto prima della persona.
     Vale come proprieta generale di tutte le uscite, non come toppa sul frutto. */
  const prot=haProtocollo(t); if(prot) return 'protocollo: '+prot;
  const _lv=_lingVoceVeto(t,{prescrizione:true,gergo:true,giudizio:true}); if(_lv) return _lv;
  if(!t||t.length<40) return 'corto';
  if(t.length>420) return 'lungo';
  const ti=t.toLowerCase();
  /* v166: prima era indexOf, e «quest» beccava «questo», «questa», «queste» - cioe meta delle
     frasi italiane finivano nel cestino. Le parole vanno cercate INTERE. */
  const banditi=[/\bvuota\b/,/\brar[ae]\b/,/\ba met[aà]\b/,/\bquasi piena\b/,/\boccasioni previste\b/,
                 /\barco delle\b/,/\btask\b/,/\bquest\b/,/\bquests\b/,/\bstreak\b/,/\bspunt[ae]\b/,/\britual[ei]\b/];
  for(const b of banditi){ const m=ti.match(b); if(m) return 'lessico interno: '+m[0]; }
  if(/\b\d+\s+su\s+\d+\b/.test(ti)) return 'rapporto numerico';
  if((t.match(/\b\d+\b/g)||[]).length>1) return 'piu di un numero';
  if(t.indexOf('!')>=0) return 'esclamazione';
  if(frGenereSbagliato(S,t)) return 'genere sbagliato';
  /* v166: il respiro. Non blocco per una frase pesante: blocco i due guasti grossi, il fiato
     unico e la frase fiume - quelli che il giudice trova sull'83% e sul 38% delle righe passate. */
  const _fr=t.split(/(?<=[.?\u2026])\s+/).filter(x=>x.trim());
  if(_fr.length<2) return 'fiato unico: nessun punto in mezzo';
  if(_fr.some(x=>x.split(/\s+/).length>26)) return 'frase fiume';
  if((t.match(/\s[\u2014\u2013-]\s/g)||[]).length>1) return 'troppi trattini';
  return null;
}
async function scriviFrutto(S,tk){
  const pkg=fruttoPacchetto(S,tk);
  if(!pkg.fatte_ieri.length&&!pkg.mancate_ieri.length) return {silenzio:true,perche:'ieri vuoto'};
  const res=await aiCall({system:FRUTTO_SYS,user:'DATI (JSON):\n'+JSON.stringify(pkg),
    task:'fruit',maxOutputTokens:900,reasoning:'medium',timeout:60000,priority:25});
  const meta={model:(res&&res.model)||null,tin:(res&&res.tin)||0,tout:(res&&res.tout)||0,thought:(res&&res.thought)||0,salti:(res&&res.salti)||undefined};
  if(!res||res.err) return {errore:res?res.err:'nulla',meta:meta};
  const testo=scrostaProtocollo(res.text);
  if(/^silenzio[.!…]?$/i.test(testo)) return {silenzio:true,perche:'scelto',meta:meta};
  let riga=String(testo||'').trim();
  /* compatibilita difensiva con vecchi output JSON, senza richiederli. */
  try{ const j=_geminiStructuredJson(riga); if(j&&typeof j.frutto==='string') riga=j.frutto.trim(); }catch(_){}
  riga=scrostaProtocollo(riga);
  const veto=fruttoVeto(S,riga);
  if(veto) return {veto:veto,meta:meta};
  return {riga:clampStr(riga,420),meta:meta};
}
/* ── la carta (v163): si compone alla PRIMA apertura del giorno, si legge, e non torna.
   E si porta fuori: disegnata su canvas nello stile dell'app e consegnata al foglio di iOS. ── */
/* ══ IL FRUTTO DI CASA (v208) ═══════════════════════════════════════════════
   L'ultima cosa che al livello base mancava del tutto. «Al mattino c'e un frutto»
   sta nella prima riga con cui Sentiero si descrive, e senza chiave non c'era:
   la mattina era vuota, e restava vuota per sempre.

   Stesso metodo dell'osservatrice locale, e stesso patto: si scrivono piu
   costruzioni sui fatti di IERI, si giudicano, e si mostra solo quella che passa.
   Qui pero il giudice esisteva gia ed e quello vero dell'app - fruttoVeto - lo
   stesso che boccia le carte scritte dal modello. Le regole della casa valgono
   uguali per tutti e due: niente parole interne, un numero al massimo, due frasi
   almeno, mai dire a che ora hai fatto una cosa.

   E se ieri pesava, il frutto TACE. Non cambia registro come l'osservatrice:
   tace. Il suo mestiere e dire com'e andata ieri, e la mattina dopo un lutto non
   c'e nessun modo garbato di farlo con un motore che conta le spunte. Nessuna
   carta e meglio di una carta vuota, e qui vale doppio. */
function _fLocaleFatti(S,tk){
  const ieri=_fIeri(tk), F={ieri:ieri};
  const nome=id=>{ const t=(S.scheduled||[]).find(x=>x&&x.id===id)||(S.quests||[]).find(x=>x&&x.id===id); return t?_fTitolo(S,t):null; };
  F.fatte=Object.keys((S.checks&&S.checks[ieri])||{}).filter(k=>S.checks[ieri][k]===true).map(nome).filter(Boolean);
  F.mancate=(S.scheduled||[]).filter(t=>t&&t.id&&_fPrevista(t,ieri)&&!_fFatta(S,t,ieri)).map(t=>_fTitolo(S,t));
  F.scritto=(S.diary||[]).some(x=>x&&x.data===ieri&&x.testo);
  F.pesava=(S.diary||[]).some(x=>x&&x.data===ieri&&x.peso===true);
  /* il ritorno: una cosa ripresa ieri dopo che era mancata piu volte di fila.
     E il solo fatto di ieri che parli del tempo, ed e quello che vale di piu. */
  F.ritorni=[];
  (S.scheduled||[]).forEach(t=>{
    if(!t||!t.id||!Array.isArray(t.days)||!t.days.length) return;
    if(!_fPrevista(t,ieri)||!_fFatta(S,t,ieri)) return;
    const prima=_fGiorni(S).filter(d=>d<ieri&&_fPrevista(t,d));
    let vuoto=0; for(let i=prima.length-1;i>=0;i--){ if(_fFatta(S,t,prima[i])) break; vuoto++; }
    if(vuoto>=2) F.ritorni.push(_fTitolo(S,t));
  });
  return F;
}
function _fLocaleForme(F){
  const q=F.fatte, m=F.mancate, r=F.ritorni;
  const c=t=>String(t||'').trim().replace(/^./,x=>x.toLowerCase());
  const forme=[];
  if(r.length) forme.push(
    c(r[0])+' e tornata ieri, dopo che era mancata piu volte. non e poco.',
    'ieri hai ripreso '+c(r[0])+'. era ferma da un pezzo, e adesso no.');
  if(q.length>=2) forme.push(
    'ieri hai portato a casa '+c(q[0])+' e '+c(q[1])+'. il resto puo aspettare.',
    'di ieri restano '+c(q[0])+' e '+c(q[1])+'. tieni questa forma.');
  if(q.length===1) forme.push(
    'ieri e passato '+c(q[0])+'. una cosa fatta e una cosa fatta.',
    'di ieri resta '+c(q[0])+'. e abbastanza per oggi.');
  if(q.length&&m.length) forme.push(
    'ieri e andata '+c(q[0])+', mentre '+c(m[0])+' e rimasta fuori. questo e il fatto.');
  if(!q.length&&F.scritto) forme.push(
    'ieri non e passato niente, pero hai lasciato una riga. e gia una traccia.',
    'ieri hai scritto, e non hai chiuso niente. il foglio conta quanto il resto.');   /* «spuntato» e lessico interno: lo vieta fruttoVeto */
  if(!q.length&&!F.scritto&&m.length) forme.push(
    'ieri e passato senza lasciare niente. capita, e oggi riparte da zero.');
  return forme;
}
function fruttoLocale(S,tk){
  const F=_fLocaleFatti(S,tk);
  if(F.pesava) return null;                                  /* ieri pesava: si tace */
  if(!F.fatte.length&&!F.mancate.length&&!F.scritto) return null;   /* ieri vuoto davvero */
  for(const riga of _fLocaleForme(F)){
    /* il giudice vero dell'app, lo stesso che legge le carte del modello */
    if(fruttoVeto(S,riga)) continue;
    if(/\s[—–-]\s/.test(riga)) continue;                     /* la firma numero uno */
    return riga;
  }
  return null;
}

const FRUTTO_JOB_KEY='sentiero-frutto-job-v1';
let _fruttoInFlight=null,_fruttoInFlightKey='';
function _fruttoJobLeggi(){ try{ const value=JSON.parse(localStorage.getItem(FRUTTO_JOB_KEY)||'null'); return value&&typeof value==='object'?value:null; }catch(_){ return null; } }
function _fruttoJobScrivi(tk,state,extra){
  try{ const old=_fruttoJobLeggi(),attempts=(old&&old.tk===tk?Number(old.attempts)||0:0)+(state==='GENERATING'?1:0);
    localStorage.setItem(FRUTTO_JOB_KEY,JSON.stringify(Object.assign({tk:tk,state:state,attempts:attempts,updatedAt:Date.now()},extra||{}))); }catch(_){}
}

async function fruttoDiOggi(){
  const tk=todayKey();
  const gia=(S.frutti||[]).filter(f=>f&&f.tk===tk)[0];
  if(gia){ _fruttoJobScrivi(tk,'AVAILABLE',{silenzio:!!gia.silenzio}); return gia.silenzio?null:gia; }
  if(_fruttoInFlight&&_fruttoInFlightKey===tk) return _fruttoInFlight;
  _fruttoInFlightKey=tk; _fruttoJobScrivi(tk,'GENERATING',{startedAt:Date.now()});
  _fruttoInFlight=(async function(){
  try{
  if(!generativa()){
    /* v208: senza chiave il frutto lo scrive la casa. Prima qui non c'era niente,
       e la mattina restava vuota per sempre. */
    const riga=fruttoLocale(S,tk);
    if(!riga){ S.frutti=(S.frutti||[]).concat([{_syncId:'frutto-'+tk,tk:tk,silenzio:true}]).slice(-40); salvaSubito(); _fruttoJobScrivi(tk,'AVAILABLE',{silenzio:true}); return null; }
    const mossaL=frMossa(S,tk,new Date().getHours(),null);
    const nuovoL={tk:tk,lettura:riga,albero:'',alberoId:'',mossa:mossaL?mossaL.testo:'',chiuso:false,visto:false,locale:true};
    nuovoL._syncId='frutto-'+tk; S.frutti=(S.frutti||[]).filter(item=>item&&item.tk!==tk).concat([nuovoL]).slice(-40); salvaSubito(); _fruttoJobScrivi(tk,'AVAILABLE');
    try{ regCantiere('frutto',{msg:'locale'}); }catch(_){}
    return nuovoL;
  }
  const t0=Date.now();
  let esito=null;
  try{ esito=await scriviFrutto(S,tk); }catch(_){ esito=null; }
  const ms=Date.now()-t0;
  if(!esito||esito.errore){ try{ regCantiere('frutto',{msg:'errore: '+((esito&&esito.errore)||'nulla'),ms:ms}); }catch(_){}
    _fruttoJobScrivi(tk,'RECOVERABLE_ERROR',{error:clampStr((esito&&esito.errore)||'nessuna risposta',80),nextAt:Date.now()+30000}); return null; }
  if(esito.silenzio||esito.veto){
    S.frutti=(S.frutti||[]).filter(item=>item&&item.tk!==tk).concat([{_syncId:'frutto-'+tk,tk:tk,silenzio:true}]).slice(-40); salvaSubito(); _fruttoJobScrivi(tk,'AVAILABLE',{silenzio:true});
    try{ regCantiere('frutto',{msg:esito.veto?('veto: '+esito.veto):('silenzio: '+(esito.perche||'')),ms:ms,
      model:esito.meta&&esito.meta.model,tin:esito.meta&&esito.meta.tin,tout:esito.meta&&esito.meta.tout}); }catch(_){}
    return null; }
  const mossa=frMossa(S,tk,new Date().getHours(),null);
  const nuovo={_syncId:'frutto-'+tk,tk:tk,lettura:esito.riga,albero:'',alberoId:'',mossa:mossa?mossa.testo:'',chiuso:false,visto:false};
  S.frutti=(S.frutti||[]).filter(item=>item&&item.tk!==tk).concat([nuovo]).slice(-40); salvaSubito(); _fruttoJobScrivi(tk,'AVAILABLE');
  try{ regCantiere('frutto',{msg:'scritto',ms:ms,model:esito.meta&&esito.meta.model,
    tin:esito.meta&&esito.meta.tin,tout:esito.meta&&esito.meta.tout,salti:esito.meta&&esito.meta.salti}); }catch(_){}
  return nuovo;
  }catch(error){ _fruttoJobScrivi(tk,'RECOVERABLE_ERROR',{error:clampStr(String(error&&error.message||error||'errore'),80),nextAt:Date.now()+30000}); throw error; }
  })();
  try{ return await _fruttoInFlight; }
  finally{ if(_fruttoInFlightKey===tk){ _fruttoInFlight=null; _fruttoInFlightKey=''; } }
}

function recuperaFrutto(){
  try{
    const tk=todayKey(),existing=(S.frutti||[]).some(item=>item&&item.tk===tk),job=_fruttoJobLeggi();
    if(existing||document.hidden||!navigator.onLine) return;
    if(job&&job.tk===tk&&job.state==='RECOVERABLE_ERROR'&&Number(job.nextAt||0)>Date.now()) return;
    if(job&&job.tk===tk&&job.state==='GENERATING'&&Date.now()-Number(job.startedAt||0)<90000) return;
    const run=fruttoDiOggi(); if(run&&run.catch) run.catch(()=>{});
  }catch(_){}
}
function _frCapo(x,testo,px,y,maxW,lh,font,colore){
  x.font=font; x.fillStyle=colore;
  const parole=String(testo).split(' '); let riga='';
  parole.forEach(w=>{
    const t=riga?riga+' '+w:w;
    if(x.measureText(t).width>maxW&&riga){ x.fillText(riga,px,y); y+=lh; riga=w; }
    else riga=t;
  });
  if(riga){ x.fillText(riga,px,y); y+=lh; }
  return y;
}
async function condividiFrutto(f){
  try{
    const W=1080,Hc=1350, cv=document.createElement('canvas'); cv.width=W; cv.height=Hc;
    const x=cv.getContext('2d');
    x.fillStyle='#0d120f'; x.fillRect(0,0,W,Hc);
    const g=x.createRadialGradient(W/2,300,0,W/2,300,900);
    g.addColorStop(0,'rgba(232,188,106,.14)'); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.fillRect(0,0,W,Hc);
    for(let i=0;i<70;i++){ x.fillStyle='rgba(245,242,234,'+(0.06+Math.random()*0.22)+')';
      x.beginPath(); x.arc(Math.random()*W,Math.random()*Hc*0.5,Math.random()*1.6+0.4,0,7); x.fill(); }
    x.strokeStyle='rgba(232,188,106,.55)'; x.lineWidth=3; x.strokeRect(46,46,W-92,Hc-92);
    x.textAlign='left';
    const d=new Date(f.tk+'T12:00:00');
    const quando=d.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'});
    x.font='600 30px -apple-system,sans-serif'; x.fillStyle='#E8A84C';
    x.fillText(('IL FRUTTO DI '+quando).toUpperCase(),96,150);
    let y=260;
    y=_frCapo(x,f.lettura,96,y,W-192,68,'italic 52px Georgia,serif','#F5F2EA');
    if(f.albero){ y+=34; y=_frCapo(x,f.albero,96,y,W-192,54,'italic 38px Georgia,serif','rgba(245,242,234,.62)'); }
    /* v164: la carta condivisa si ritaglia sul testo - niente meta immagine vuota */
    const fine=Math.min(Hc,Math.max(680,y+170));
    const cv2=document.createElement('canvas'); cv2.width=W; cv2.height=fine;
    const x2=cv2.getContext('2d');
    x2.drawImage(cv,0,0,W,fine,0,0,W,fine);
    x2.fillStyle='#0d120f'; x2.fillRect(40,fine-100,W-80,60);
    x2.strokeStyle='rgba(232,188,106,.55)'; x2.lineWidth=3; x2.strokeRect(46,46,W-92,fine-92);
    x2.font='30px -apple-system,sans-serif'; x2.fillStyle='rgba(245,242,234,.38)';
    x2.fillText('sentiero',96,fine-96);
    const blob=await new Promise(r=>cv2.toBlob(r,'image/png'));
    const file=new File([blob],'sentiero-frutto-'+f.tk+'.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); }
    else if(navigator.share){ await navigator.share({title:'Sentiero',text:f.lettura}); }
    else{ try{ toast('La condivisione non è disponibile qui'); }catch(_){} }
  }catch(e){ if(!(e&&e.name==='AbortError')){ try{ toast('Condivisione non riuscita'); }catch(_){} } }
}
/* ── LA SOGLIA (v167) ─────────────────────────────────────────────────────────────────────
   Fra il tocco sull'icona e l'app c'era una finestra bianca di due secondi e mezzo. Il frutto
   sta li: non e una carta dentro un cassetto, e la cosa che si attraversa per entrare.
   Regole dure: se non c'e un frutto la soglia sparisce SUBITO, e non aspetta mai piu di sei
   secondi. Nessuno deve restare fermo davanti a un'attesa che non porta niente. ─────────── */
const SOGLIA_ATTESA_MAX=20000;  /* tetto della PORTA, non del lavoro: dopo 20 s Sentiero entra e il Frutto resta recuperabile */
const FRUTTO_SKIP_KEY='sentiero-frutto-skip';
function _sogliaVia(el){
  if(!el||el.classList.contains('via')) return;
  el.classList.add('via');
  setTimeout(()=>{ try{ el.classList.add('hidden'); el.innerHTML='<div id="frutto-corpo"></div>'; }catch(_){} },650);
}
function _fruttoSaltatoOggi(tk){ try{ return localStorage.getItem(FRUTTO_SKIP_KEY)===tk; }catch(_){ return false; } }
function _fruttoSegnaSaltato(tk){ try{ localStorage.setItem(FRUTTO_SKIP_KEY,tk); }catch(_){} }
function _fruttoSegnaVisto(fr,modo){
  if(!fr||!fr.tk) return;
  try{
    (S.frutti||[]).forEach(g=>{ if(g&&g.tk===fr.tk){ g.visto=true; if(modo) g.saltato=modo; } });
    save();
  }catch(_){}
}
function _fruttoDisegna(corpo,fr,chiudi){
  if(!corpo||!fr||!fr.lettura) return;
  corpo.classList.remove('on');
  corpo.innerHTML='<div class="sg-testa">il frutto di ieri</div>'
    +'<p class="sg-lettura">'+escapeHtml(fr.lettura)+'</p>'
    +(fr.mossa?'<p class="sg-mossa">'+escapeHtml(fr.mossa)+'</p>':'')
    +'<div class="sg-piede"><button id="sg-cond">Condividi</button><button id="sg-entra">Entra</button></div>';
  requestAnimationFrame(()=>{ try{ corpo.classList.add('on'); }catch(_){} });
  const bc=corpo.querySelector('#sg-cond');
  if(bc) bc.onclick=(e)=>{ e.stopPropagation(); condividiFrutto(fr); };
  const be=corpo.querySelector('#sg-entra');
  if(be) be.onclick=(e)=>{ e.stopPropagation(); chiudi('entra'); };
}
async function apriSoglia(){
  const el=document.querySelector('#frutto-soglia'); if(!el) return;
  const tk=todayKey();
  const gia=(S.frutti||[]).filter(x=>x&&x.tk===tk)[0];
  if(gia&&(gia.silenzio||gia.visto)) return;
  if(_fruttoSaltatoOggi(tk)) return;                       /* «entra subito» vale per tutta la mattina */

  /* ══ LAB 25 — CARICAMENTO E FRUTTO SONO LA STESSA AZIONE ═══════════════
     I due video reali del 24/08 hanno mostrato il difetto senza ambiguita:
       07:44  CARICAMENTO per ~6 s -> porta chiusa -> nessun Frutto
       07:46  riapertura            -> il Frutto compare da solo
     La causa era SOGLIA_ATTESA=6000: il timer chiudeva SOLO il front-end,
     mentre fruttoDiOggi() continuava sotto, salvava la risposta e la lasciava
     non vista. Alla riapertura sembrava che il Frutto fosse nato dal nulla.

     Da qui la promessa e transazionale:
       alba/splash + generazione in parallelo
       -> se e gia pronto, Frutto diretto
       -> se sta lavorando, CARICAMENTO resta finche il lavoro finisce
       -> tocco «entra subito» = skip ESPLICITO per oggi, mai sorpresa dopo
       -> errore/silenzio = la porta sparisce appena lo sappiamo.

     Il lavoro parte PRIMA di aspettare l'alba. Cosi i secondi scenografici
     dell'apertura sono anche secondi utili di rete, non latenza sommata. */
  let frPronto=false, frVal=null;
  const lavoro=(async function(){
    try{ frVal=gia||await fruttoDiOggi(); return frVal; }
    catch(_){ frVal=null; return null; }
    finally{ frPronto=true; }
  })();

  /* L'alba resta davanti, ma il backend sta gia lavorando dietro. */
  await (async function(){ const t0=Date.now();
    while(document.getElementById('soglia') && Date.now()-t0<5000){
      await new Promise(r=>setTimeout(r,120));
    } })();

  /* Fast path: il Frutto ha usato il tempo dell'alba. Niente finto loading. */
  if(frPronto){
    const fr=frVal;
    if(!fr||!fr.lettura) return;
    el.classList.remove('hidden','via');
    const corpo=el.querySelector('#frutto-corpo'); if(!corpo) return;
    let chiusa=false;
    const chiudi=()=>{ if(chiusa) return; chiusa=true; _sogliaVia(el); };
    _fruttoSegnaVisto(fr,'mostrato');
    _fruttoDisegna(corpo,fr,chiudi);
    try{ regCantiere('frutto-porta',{msg:'pronto durante alba'}); }catch(_){}
    return;
  }

  el.classList.remove('hidden','via');
  const corpo=el.querySelector('#frutto-corpo'); if(!corpo) return;
  corpo.innerHTML='<div class="sg-caricamento" role="status" aria-live="polite">'
    +'<div class="sg-load-t">CARICAMENTO</div>'
    +'<div class="sg-load-s">il frutto di ieri</div>'
    +'<div class="sg-attesa" aria-hidden="true"></div>'
    +'<div class="sg-load-skip">tocca per entrare subito</div></div>';
  corpo.classList.add('on');

  let chiusa=false,saltata=false,scaduta=false;
  const chiudi=(motivo)=>{ if(chiusa) return; chiusa=true; _sogliaVia(el); try{ regCantiere('frutto-porta',{msg:String(motivo||'chiusa')}); }catch(_){} };
  /* Il gesto di skip esiste SOLO durante CARICAMENTO. Prima restava attaccato
     alla soglia anche dopo il Frutto: un pointerdown su «Condividi» poteva
     iniziare a chiudere la schermata prima ancora del click del pulsante. */
  const salta=function(){
    if(!corpo.querySelector('.sg-caricamento')) return;
    saltata=true; _fruttoSegnaSaltato(tk); chiudi('saltato dalla persona');
  };
  el.addEventListener('pointerdown',salta);
  const tetto=setTimeout(function(){
    if(chiusa||saltata) return;
    scaduta=true;
    try{ el.removeEventListener('pointerdown',salta); }catch(_){}
    /* Un guasto tecnico non decide al posto della persona. Non scriviamo
       FRUTTO_SKIP_KEY e non tocchiamo `visto`: se il lavoro termina tardi,
       rimane un Frutto non visto e la prossima apertura puo mostrarlo. */
    const car=corpo.querySelector('.sg-caricamento');
    if(car) car.innerHTML='<div class="sg-load-t">ATTESA LUNGA</div>'
      +'<div class="sg-load-s">La rete sta impiegando troppo.</div>'
      +'<div class="sg-load-s">Entro adesso. Il Frutto resta in attesa e Sentiero riproverà se serve.</div>';
    try{ regCantiere('frutto-porta',{msg:'tetto tecnico: non consumato'}); }catch(_){}
    setTimeout(function(){ chiudi('tetto tecnico: retry preservato'); },2200);
  },SOGLIA_ATTESA_MAX);

  const fr=await lavoro;
  clearTimeout(tetto);
  try{ el.removeEventListener('pointerdown',salta); }catch(_){}

  /* Solo «entra subito» consuma volontariamente il Frutto di oggi. Un timeout
     tecnico lascia intatta la possibilità di vederlo a una riapertura. */
  if(saltata){
    if(fr&&fr.lettura) _fruttoSegnaVisto(fr,'saltato');
    return;
  }
  if(scaduta){
    try{ if(fr&&fr.lettura) regCantiere('frutto-porta',{msg:'arrivato dopo il tetto: resta non visto'}); }catch(_){}
    return;
  }
  if(chiusa) return;
  if(!fr||!fr.lettura){ chiudi('silenzio o errore'); return; }

  _fruttoSegnaVisto(fr,'mostrato');
  _fruttoDisegna(corpo,fr,chiudi);
  try{ regCantiere('frutto-porta',{msg:'caricamento -> frutto'}); }catch(_){}
}
try{
  window.addEventListener('online',recuperaFrutto,{passive:true});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) recuperaFrutto(); },{passive:true});
}catch(_){}
/* ══════ MOTORE MAESTRIA fase 1: il modello legge, il client conta ══════ */
function processMastery(mo){
  if(!mo) return;
  if(!S.mastery) S.mastery={quest:{},giorni:{},sguardo:[],riv:[]};
  const tk=todayKey(), dw=dowOf();
  const attivi=scheduledFor(S,dw,tk).map(t=>t.id).concat(activeQuests(S,tk).map(q=>q.id));   /* BUG STORICO (v133): era activeQuests(S.quests) - TypeError silenziato dal catch: la Maestria non era MAI partita */
  const toccati=new Set((mo.menzioni||[]).concat((mo.letture||[]).map(l=>l.id)));
  /* ══ v268.4 — LA FOTOGRAFIA DI FINE IERI ══════════════════════════════════
     Questi contatori non cambiano a mezzanotte: cambiano quando il modello legge
     un racconto, cioe a un'ora qualunque. E sono la sorgente dei due fatti che
     pesano di piu (le sue parole sull'attrito, cio che tace da molti giorni).
     Quindi raccontare la giornata alle 18 poteva togliere all'Osservatrice un
     fatto che alle 8 c'era. La prima volta che si tocca un contatore in un
     giorno nuovo si mette da parte com'era a fine ieri: il digest legge quello,
     e la finestra resta la stessa a qualunque ora. */
  const _fermaIeri=q=>{ if(q.tocco!==tk){ q.prima={assenze:q.assenze|0,attriti:q.attriti|0,fraseAttrito:q.fraseAttrito||''}; q.tocco=tk; } };
  attivi.forEach(id=>{
    if(!S.mastery.quest[id]) S.mastery.quest[id]={assenze:0,attriti:0,fraseAttrito:'',taciFino:''};
    const q=S.mastery.quest[id];
    _fermaIeri(q);
    if(toccati.has(id)) q.assenze=0; else q.assenze++;
  });
  (mo.attriti||[]).forEach(a=>{
    if(!S.mastery.quest[a.id]) S.mastery.quest[a.id]={assenze:0,attriti:0,fraseAttrito:'',taciFino:''};
    _fermaIeri(S.mastery.quest[a.id]);
    S.mastery.quest[a.id].attriti++; S.mastery.quest[a.id].fraseAttrito=a.frase;
  });
  if(mo.sguardo){ S.mastery.sguardo.push({iso:new Date().toISOString().slice(0,16),livello:mo.sguardo.livello}); if(S.mastery.sguardo.length>180) S.mastery.sguardo=S.mastery.sguardo.slice(-180); }
  try{ const pr=computeProgress(S,tk,dw); S.mastery.giorni[tk]={pianificate:pr.total,fatte:pr.done}; }catch(_){}
  save();
}
let _pendingLetture=null;
/* ══ v268.6 — MEMORIA E STATO SONO DUE COSE ═══════════════════════════════
   «non ho mai voglia di telefonare» e una frase che la persona ha detto una
   volta. Fino alla v268.5 c'erano due modi di trattarla, tutti e due sbagliati:
     · cancellarla quando rispondeva «e ancora mia» - cioe distruggere le sue
       parole perche il nostro contatore era stato azzerato;
     · tenerla e continuare a usarla come attrito di ADESSO - cioe rinfacciarle
       un peso che ha appena detto di aver ripreso in mano.
   La distinzione e questa, e vale una definizione sola:

     MEMORIA  «avevo detto che questa cosa mi pesava»  ->  fraseAttrito, resta
     STATO    «questa cosa mi sta pesando adesso»      ->  attriti >= 1

   Nessun campo nuovo: il contatore che gia c'era E' lo stato. Azzerarlo spegne
   l'attrito senza toccare il ricordo; un attrito nuovo lo riaccende e riscrive
   la frase (processMastery fa attriti++ e fraseAttrito=a.frase insieme).
   Chi vuole «l'attrito che pesa ora» chiede QUI, e non guarda piu se la frase
   esiste: i tre posti che lo facevano sono buildObserverDigest, buildLinePackage
   e semeDigest. Una nozione, tre consumatori, zero eccezioni sparse. */
function _attritoVivo(q){
  if(!q) return '';
  if((q.attriti|0)<1) return '';   /* c'e il ricordo, non il peso di adesso */
  return String(q.fraseAttrito||'');
}
function _titoloDiId(id){
  const s=(S.scheduled||[]).find(t=>t.id===id); if(s) return s.titolo;
  const q=(S.quests||[]).find(t=>t.id===id); return q?q.titolo:null;
}
function renderLetture(mo){
  const box=document.querySelector('#letture'); if(!box) return;
  const valide=(mo&&mo.letture||[]).filter(l=>_titoloDiId(l.id));
  if(!valide.length){ box.classList.add('hidden'); box.innerHTML=''; _pendingLetture=null; return; }
  _pendingLetture=valide;
  let htm='<div class="lett-head">Il racconto dice:</div>';
  valide.forEach((l,i)=>{
    const tit=escapeHtml(_titoloDiId(l.id));
    const sub=l.stato==='trasformata'?('trasformata: '+escapeHtml(l.variante||'variante')):('\u00ab'+escapeHtml(l.prova||'')+'\u00bb');
    htm+='<div class="lett-row on" data-i="'+i+'"><span class="lett-chk"></span><span class="lett-txt">'+tit+'<em>'+sub+'</em>'+
      (l.nuovo_titolo?'<button class="lett-upd" data-i="'+i+'">aggiorna in: '+escapeHtml(l.nuovo_titolo)+'</button>':'')+'</span></div>';
  });
  htm+='<div class="btn-row" style="margin-top:10px"><button class="act" id="lett-no">Ignora</button><button class="act primary" id="lett-ok">Conferma</button></div>';
  box.innerHTML=htm; box.classList.remove('hidden');
  box.querySelectorAll('.lett-row').forEach(r=>{ r.onclick=e=>{ if(e.target.classList.contains('lett-upd')) return; r.classList.toggle('on'); }; });
  box.querySelectorAll('.lett-upd').forEach(b=>{ b.onclick=e=>{ e.stopPropagation(); b.classList.toggle('sel'); }; });
  document.querySelector('#lett-no').onclick=()=>{ box.classList.add('hidden'); box.innerHTML=''; _pendingLetture=null; };
  document.querySelector('#lett-ok').onclick=()=>{
    const righe=[...box.querySelectorAll('.lett-row.on')];
    if(!righe.length){ box.classList.add('hidden'); box.innerHTML=''; _pendingLetture=null; toast('Nessuna conferma'); return; }
    const ok=document.querySelector('#lett-ok'), no=document.querySelector('#lett-no');
    if(ok) ok.disabled=true; if(no) no.disabled=true;
    righe.forEach((r,i)=> setTimeout(()=>{ try{ r.classList.add('stamped'); }catch(_){} }, i*90));
    const attesa=righe.length*90+430;   /* l'ultimo timbro finisce di assestarsi, poi si passa allo stato */
    setTimeout(()=>{
      const tk=todayKey(); if(!S.checks[tk]) S.checks[tk]={};
      let n=0;
      righe.forEach(r=>{
        const l=_pendingLetture[+r.dataset.i]; if(!l) return;
        const upd=r.querySelector('.lett-upd');
        if(upd&&upd.classList.contains('sel')&&l.nuovo_titolo){
          const s=(S.scheduled||[]).find(t=>t.id===l.id); const q=(S.quests||[]).find(t=>t.id===l.id);
          if(s) s.titolo=l.nuovo_titolo; if(q) q.titolo=l.nuovo_titolo;
        }
        S.checks[tk][l.id]=true; n++;
      });
      box.classList.add('via');
      setTimeout(()=>{ box.classList.remove('via'); box.classList.add('hidden'); box.innerHTML=''; _pendingLetture=null; },300);
      save(); render(); try{ updateRing(); }catch(_){}
      toast(n+(n===1?' confermata dal racconto':' confermate dal racconto'));
    },attesa);
  };
}
function _isoPlus(gg){ const d=new Date(); d.setDate(d.getDate()+gg); return d.toISOString().slice(0,10); }
/* quante volte una cosa e mancata, detta in parole: le quantita si dicono
   in parole anche qui, e «racconti» non e un'unita di misura per nessuno. */
function _lascDa(n){
  const v=n|0;
  if(v>=24) return 'da tanto';
  if(v>=16) return 'da un pezzo';
  if(v>=8)  return 'da parecchio';
  return 'da un po\'';
}
/* ══ v269.4 — «MOSTRATO» DEVE VOLER DIRE MOSTRATO ═══════════════════════════
   Il Lascito e nato sotto il foglio: #lascito e figlio di #mic-wrap (z-index 1)
   e il foglio e #app (z-index 10). Su uno schermo corto il foglio scende a
   48vh, e la domanda finisce sotto. Dimostrato: si legge nella schermata di chi
   usa l'app, sbiadita sotto il bordo del foglio, con i due tasti tagliati.
   Non e solo un guaio grafico. Appena costruita, la domanda faceva anche:
       taciFino = fra due giorni
   cioe Sentiero scriveva «gliel'ho mostrata» perche aveva tolto la classe
   «hidden» a un elemento. Ma togliere «hidden» non e mostrare: e la stessa
   distinzione che alla v268.4 abbiamo dovuto fare fra «presentata» e «vista»
   per la nota della sera, li nel tempo, qui nello spazio.

   TRE STATI, e non cinque - questi sono i soli che cambiano il comportamento:
     GENERATO   c'e una domanda da fare. Non consegue niente.
     VISIBILE   la persona ha AVUTO LA POSSIBILITA di leggerla: e sullo schermo,
                grande abbastanza, non coperta da nient'altro, per un tempo
                minimo. Da qui - e solo da qui - il breve silenzio.
     RISPOSTO   ha toccato uno dei due tasti. Da qui il silenzio lungo.
   «Presentato» non serve: non ha conseguenze diverse da «generato».
   «Visto» non lo sappiamo e non lo sapremo: nessuno legge gli occhi. «Visibile»
   e il piu vicino che si possa misurare, e si chiama cosi apposta.

   COSA MISURA quandoDavveroVisibile: che l'elemento intersechi la finestra per
   almeno il 60%, che il suo centro appartenga davvero a lui (elementFromPoint:
   se sopra c'e il foglio, non e lui), e che la pagina non sia in secondo piano.
   Per un tempo minimo continuo. Non e una ricevuta di lettura: e la fine
   dell'alibi «l'ho messo nel DOM». */
function quandoDavveroVisibile(el,ms,cb){
  if(!el||typeof cb!=='function') return function(){};
  let fatto=false,t=null,giri=0,io=null,iv=null;
  /* ══ v269.8 — SI FALLISCE VERSO LA PRUDENZA ══════════════════════════════
     Alla v269.7 questa misura aveva il verso sbagliato in due punti, e tutti e
     due davano il beneficio del dubbio a noi invece che alla persona:
       · il catch tornava «non coperto», cioe «non riesco a misurare» diventava
         «e visibile». Per una funzione che concede il diritto di scrivere
         taciFino, e l'errore piu costoso possibile;
       · e il controllo periodico - l'unico che resta quando IntersectionObserver
         manca o fallisce - guardava soltanto il centro, non la superficie.
         Un elemento visibile al dieci per cento col centro sullo schermo veniva
         promosso, mentre il commento sopra prometteva il sessanta per cento.
     La regola adesso e una sola e vale per tutte le strade:
         si dichiara VISIBILE solo con la prova. Nessuna prova, nessuna
         conseguenza. Non accusiamo il contenuto di essere coperto: ci
         rifiutiamo di dichiararlo visto senza evidenza.
     E la prova si calcola qui, con l'aritmetica, non delegata a un osservatore
     che potrebbe non esserci. */
  const QUOTA=0.6;                     /* la stessa che promette il commento */
  function provaVisibile(){
    try{
      if(document.hidden) return false;
      const W=window.innerWidth||0, H=window.innerHeight||0;
      if(!W||!H) return false;
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height) return false;
      /* 1 · quanta della sua superficie sta davvero dentro la finestra */
      const dx=Math.max(0,Math.min(r.right,W)-Math.max(r.left,0));
      const dy=Math.max(0,Math.min(r.bottom,H)-Math.max(r.top,0));
      if((dx*dy)/(r.width*r.height)<QUOTA) return false;
      /* 2 · e il suo centro appartiene a lui, cioe non c'e nessuno sopra */
      const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
      if(x<0||y<0||x>=W||y>=H) return false;
      const q=document.elementFromPoint(x,y);
      if(!(q&&(q===el||el.contains(q)||q.contains(el)))) return false;
      return true;
    }catch(_){ return false; }   /* non misurabile = non dimostrato = non visibile */
  }
  function ferma(){ if(t){ clearTimeout(t); t=null; } }
  /* v269.8: chiudi() toglie TUTTO, compreso l'ascoltatore. Prima lo toglieva
     solo annulla(): su una promozione riuscita restava attaccato per sempre, e
     dopo mesi d'uso sarebbero stati cento ascoltatori addormentati. */
  function chiudi(){
    fatto=true; ferma();
    try{ io&&io.disconnect(); }catch(_){} io=null;
    if(iv){ clearInterval(iv); iv=null; }
    try{ document.removeEventListener('visibilitychange',guarda); }catch(_){}
  }
  function guarda(){
    if(fatto) return;
    if(!provaVisibile()){ ferma(); return; }   /* e il tempo riparte da capo */
    if(t) return;
    t=setTimeout(function(){
      t=null;
      if(fatto||!provaVisibile()) return;      /* deve reggere anche alla fine */
      chiudi(); try{ cb(); }catch(_){}
    },ms||1200);
  }
  /* l'osservatore resta, ma solo come SVEGLIA: dice quando vale la pena
     guardare. La decisione la prende sempre provaVisibile, che non delega. */
  try{
    io=new IntersectionObserver(function(){ guarda(); },{threshold:[0,QUOTA,1]});
    io.observe(el);
  }catch(_){}
  /* la rete: l'osservatore non vede chi sta SOPRA, e qui e proprio quello il caso */
  iv=setInterval(function(){ if(fatto||++giri>120){ chiudi(); return; } guarda(); },400);
  try{ document.addEventListener('visibilitychange',guarda); }catch(_){}
  guarda();
  /* annulla() non fa altro che chiudere: la rimozione dell'ascoltatore vive
     dentro chiudi(), e farla due volte era un difetto vero - trovato dal banco
     che contava gli ascoltatori residui, non dal codice riletto. */
  return function annulla(){ chiudi(); };
}
let _lascitoAnnulla=null;
function maybeLascito(){
  const box=document.querySelector('#lascito'); if(!box) return;
  const tk=todayKey();
  const c=lascitoCandidate(S,tk);
  if(!c){ try{ if(_lascitoAnnulla){ _lascitoAnnulla(); _lascitoAnnulla=null; } }catch(_){}
          box.classList.add('hidden'); box.innerHTML=''; return; }
  const tit=_titoloDiId(c.id); if(!tit){ box.classList.add('hidden'); return; }
  /* ══ v266 — LA DOMANDA DEL LASCITO NON PASSAVA DA NESSUN GIUDICE ═══════════
     Diceva, testuale: «Smettere di fumare» non entra nei tuoi racconti da 19
     racconti — è ancora tua?
     Tre cose sbagliate in una riga sola, e tutte e tre sono vietate altrove:
       · il trattino lungo, che e la firma numero uno del giudice;
       · una cifra in faccia, e per giunta di un'unita che nessuno conta
         («diciannove racconti» non vuol dire niente a chi legge);
       · «racconti da ... racconti», la stessa parola due volte in sei parole.
     Il motore della sera passa da _ossGiudica dalla v204. Questa domanda no:
     era nata prima e nessuno l'aveva mai riportata dentro. Adesso ci passa, e
     un banco lo controlla. */
  const prova=c.motivo==='attrito'
    ? 'ne parli come di un peso, e non solo stavolta: \u00ab'+escapeHtml(c.frase)+'\u00bb.'
    : 'nei tuoi racconti non compare '+_lascDa(c.assenze)+'.';
  box.innerHTML='<div class="lasc-txt">\u00ab'+escapeHtml(tit)+'\u00bb: '+prova+' \u00e8 ancora tua?'+
    '</div><div class="btn-row" style="margin-top:10px"><button class="act" id="lasc-si">\u00c8 ancora mia</button>'+
    '<button class="act" id="lasc-no">La lascio andare</button></div>';
  box.classList.remove('hidden');
  /* v269.4: il silenzio breve NON si applica piu perche la domanda e stata
     costruita. Si applica quando la persona ha avuto la possibilita di leggerla.
     Se resta sotto il foglio, Sentiero la riproporra: e giusto, non l'ha vista. */
  try{ if(_lascitoAnnulla) _lascitoAnnulla(); }catch(_){}
  _lascitoAnnulla=quandoDavveroVisibile(box,1200,function(){
    try{ if(S.mastery&&S.mastery.quest[c.id]){ S.mastery.quest[c.id].taciFino=_isoPlus(2); save(); } }catch(_){}
    try{ regCantiere('lascito',{msg:'visibile davvero'}); }catch(_){}
  });
  document.querySelector('#lasc-si').onclick=()=>{
    /* ══ v268.5 — L'ECCEZIONE ALL'INVARIANZA, DETTA BENE ══════════════════════
       Il commento della v268.4 stava qui e diceva «chiedere di lasciar andare»:
       era il ramo sbagliato. Questo e «E ANCORA MIA» - la quest resta, si azzera
       il conto delle assenze e si tace per quarantacinque giorni. Sbagliare il
       nome di un ramo non e un refuso: e il modo in cui si finisce per ragionare
       sul pezzo di codice che non si sta guardando.

       La regola vera non e «lasciar andare vale subito». E questa, e vale per
       tutte e due i tasti:

         i fatti sui giorni conclusi non dipendono dall'ORA in cui apro l'app;
         dipendono pero da cio che la persona FA di proposito, quando quello che
         fa e una risposta diretta a quel fatto.

       Aprire l'app alle 14 invece che alle 8 e un caso. Rispondere a una domanda
       non lo e. Sentiero ha chiesto «e ancora tua?» proprio su questa cosa: se
       stasera ripetesse la stessa osservazione, avrebbe chiesto senza ascoltare.
       Percio la fotografia di fine ieri va buttata: il conto delle assenze era
       un indizio di abbandono, e la persona ha appena portato una prova migliore
       di qualunque contatore - la propria parola.
       Misurato: senza queste due assegnazioni la riga di stasera resta
       ««non ho mai voglia di telefonare», avevi scritto...», cioe il rimprovero
       a cui ha appena risposto.
       DICHIARATA: banchi/provaOraDelGiorno.js, sezione D. */
    /* v268.6: «fraseAttrito» NON si cancella piu. «E ancora mia» non vuol dire
       «non e piu dura»: azzera il nostro giudizio sull'abbandono e sull'attrito,
       non le parole che la persona aveva detto. Il contatore a zero basta a
       spegnere l'attrito ovunque, perche adesso tutti passano da _attritoVivo. */
    if(S.mastery&&S.mastery.quest[c.id]){ const q=S.mastery.quest[c.id]; q.taciFino=_isoPlus(45); q.assenze=0; q.attriti=0; q.prima=null; q.tocco=''; }
    try{ if(_lascitoAnnulla){ _lascitoAnnulla(); _lascitoAnnulla=null; } }catch(_){}   /* risposto: non serve piu guardare se era visibile */
    save(); box.classList.add('hidden'); box.innerHTML='';
  };
  document.querySelector('#lasc-no').onclick=()=>{
    S.scheduled=(S.scheduled||[]).filter(t=>t.id!==c.id);
    S.quests=(S.quests||[]).filter(t=>t.id!==c.id);
    if(S.mastery&&S.mastery.quest[c.id]) delete S.mastery.quest[c.id];
    try{ if(_lascitoAnnulla){ _lascitoAnnulla(); _lascitoAnnulla=null; } }catch(_){}
    save(); render(); try{ updateRing(); }catch(_){}
    box.classList.add('hidden'); box.innerHTML='';
    toast('Messa gi\u00f9. Va bene cos\u00ec.');
  };
}
function maybeRivelazione(){
  const box=document.querySelector('#rivelazione'); if(!box) return false;
  const tk=todayKey();
  const c=rivelazioneCandidate(S,tk);
  if(!c){ box.classList.add('hidden'); box.innerHTML=''; return false; }
  box.innerHTML='<div class="riv-head">Rivelazione</div><div class="riv-txt">'+escapeHtml(rivTesto(c))+
    '</div><div class="btn-row" style="margin-top:10px;justify-content:flex-end"><button class="act primary" id="riv-ok">Ho visto</button></div>';
  box.classList.remove('hidden');
  /* CERIMONIA: sette scintille d'oro salgono attorno al drop, poi si dissolvono */
  try{
    if(!box.querySelector('.riv-fx')){
      const fx=document.createElement('div'); fx.className='riv-fx'; fx.setAttribute('aria-hidden','true');
      for(let i=0;i<7;i++){ const s=document.createElement('span'); s.className='rs';
        s.style.left=(8+Math.random()*84)+'%';
        s.style.animationDelay=(120+i*90+Math.random()*60)+'ms';
        s.style.setProperty('--rx',((Math.random()-.5)*26)+'px');
        fx.appendChild(s); }
      box.appendChild(fx);
      setTimeout(()=>{ try{ fx.remove(); }catch(_){} },2200);
    }
  }catch(_){}
  if(!S.mastery.riv) S.mastery.riv=[];
  S.mastery.riv.push({iso:new Date().toISOString().slice(0,16),asse:c.asse});
  if(S.mastery.riv.length>24) S.mastery.riv=S.mastery.riv.slice(-24);
  save();
  try{ playEventSound('distillStart'); }catch(_){}
  document.querySelector('#riv-ok').onclick=()=>{ box.classList.add('hidden'); box.innerHTML=''; };
  return true;
}

/* ======================================================================
   MENTE OSSERVATRICE — specchio-commentatore. Solo osserva, non dialoga.
   Riusa l'IA già presente; se non c'è chiave o è offline, usa logica locale.
   ====================================================================== */
const OBSERVER_SYS='Sei la voce di Sentiero: l\'amico con la memoria lunga, nel suo momento piu raccolto - il digest. Rileggi i giorni e restituisci UNA riflessione. Non sei una chat, non fai domande, non dialoghi.\n'+
'IL TUO CARATTERE, tre tesori mai dichiarati: compassione (sei dalla sua parte anche quando affondi il colpo), misura (parole contate), umilta (mai in cattedra). LA LEGGE DELLA LAMA: se i giorni mostrano una persona in piedi puoi essere affilato e nominare il filo scomodo che torna; se mostrano una persona a terra deponi la lama: gentilezza concreta, mai pietismo, mai analisi.\n'+
'LA SCOPERTA (il tuo mestiere): trova il legame che ancora non ha visto - cosa si tira dietro cosa, cosa cede sempre nello stesso punto, cosa funziona solo se ridotto. Nomina il MATERIALE REALE (la quest specifica, il giorno, le sue parole esatte), mai categorie astratte.\n'+
'SAGGEZZA (Tao, senza mai nominarlo): il grande nasce dal piccolo; non-forzare; l\'acqua scava la roccia; sapersi fermare. Traspare dal modo di leggere, mai come predica o citazione.\n'+
'IL MATERIALE: nei dati trovi anche la voce del Motore - attriti_vivi (le sue parole esatte sul peso: sono oro, citale tra virgolette basse), assenze_lunghe (cio che tace da molti giorni), sguardo_recente. E sussurri_recenti sono le righe che hai gia detto alle spunte: mai ripeterle, puoi dar loro seguito.\n'+
'I NUMERI: vietate cifre, conteggi e rapporti (mai "6 intenzioni", mai "5 volte", mai "3 su 7", nemmeno scritti a lettere). Le quantita si dicono in parole: quasi ogni giorno, piu volte, di rado, mai. Un solo numero ammesso se e un fatto vissuto (il terzo giorno di fila).\n'+
'CONFINI: giudichi il sistema e il comportamento, mai l\'identita. Niente diagnosi, moralismi o consigli non chiesti: chiudi con una leva minuscola solo se emerge da sola dai dati. Confronta con le OSSERVAZIONI PRECEDENTI: mai ripeterle; se qualcosa e cambiato, in meglio o in peggio, nominalo.\n'+
'FORMATO: 1-3 frasi, massimo 280 caratteri, seconda persona, minuscole come si parla.\n'+
'IL PESO (viene prima di tutto il resto): se un giorno del diario porta "pesa":true, quel giorno ha portato sofferenza grave e reale - un lutto, una malattia, paura vera. Allora non fai il tuo mestiere: niente scoperta, niente lettura di schemi, niente legame che non ha visto, niente leva minuscola, nessuna metafora, nessuna domanda, e non nominare cosa ha fatto o non ha fatto in quei giorni. Una o due frasi brevissime che dicono soltanto che hai letto e che resti. Non dire che capisci. Non dire che passera. Non chiedergli niente.\n'+
'FORMATO TECNICO: rispondi SOLO con la riflessione da mostrare, in testo semplice. Niente JSON, niente markdown, niente etichette, niente commenti sul prompt. Il modello scrive SOLO il COME: il fatto da dire e gia stato scelto da Sentiero.';

/* v202 — LA RIGA DEL PESO, quando l'osservatrice non ha il modello.
   Senza chiave o con la rete rotta, l'osservatrice non puo scrivere: puo solo
   scegliere fra frasi gia scritte. Questa e l'unica che dice davanti a un giorno
   che pesa, ed e per questo che le parole le ha scelte una persona e non un modello. */
const OSS_RIGA_PESO='ho letto. non ho niente da dirti su come stai andando, e non serve che tu faccia niente.';

/* raccoglie SOLO i dati necessari: intenzioni (quest nate), azioni (compiute), promesse aperte, continuità */
function buildObserverDigest(){
  const tk=todayKey();
  /* ══ v268.4 — LA FINESTRA: I GIORNI CONCLUSI, E BASTA ═════════════════════
     L'app promette «una riga su come stanno andando i tuoi giorni». Un giorno
     ancora in corso non e un giorno: e mezzo giorno, e non si sa quale meta.
     Fino alla v268.3 il digest prendeva il diario e le spunte senza escludere
     oggi. Conseguenza misurata: la stessa vita produceva fatti diversi secondo
     l'ORA CASUALE in cui l'app veniva aperta.
       · alle 08:00 oggi risultava «vuoto» - cioe un giorno fallito che non era
         nemmeno cominciato: il ritmo scendeva, il giorno-della-settimana che
         cede si accendeva, la tenuta spariva;
       · alle 20:00 oggi era l'ultimo giorno del diario, e il fatto «ritorno»
         guarda proprio l'ultimo giorno: quindi esisteva solo la sera.
     Non e un difetto d'interfaccia: cambia il SIGNIFICATO di cio che viene
     detto. Da qui l'orizzonte e uno solo e non dipende dall'orologio: si guarda
     fino a IERI compreso. «oggi» resta, ma come punto di riferimento per le
     distanze - non come dato.
     Cio che non ha data resta dichiarato in «senza_data»: si veda piu sotto. */
  const _ieri=(function(k){ try{ const d=new Date(k+'T12:00:00'); d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10); }catch(_){ return k; } })(tk);
  /* azioni reali dalle spunte toccate (questLog), raggruppate per giorno */
  const log=Array.isArray(S.questLog)?S.questLog:[];
  const azioniPerGiorno={}, chiuseOggi=new Set();
  log.forEach(e=>{ if(e.lasciata) return;   /* v148: una quest lasciata andare non e un fatto */
    if((e.day||'')>_ieri){ if(e.titolo) chiuseOggi.add(e.titolo); return; }   /* v268.4: oggi non e ancora un giorno */
    if(!azioniPerGiorno[e.day]) azioniPerGiorno[e.day]=[]; azioniPerGiorno[e.day].push(e.titolo); });
  const diario=(S.diary||[]).filter(e=>((e.iso||'').slice(0,10))<=_ieri).slice(0,30).map(e=>{
    const g=(e.iso||'').slice(0,10);
    const dettate=Array.isArray(e.done)?e.done.slice(0,12):[];
    const toccate=azioniPerGiorno[g]||[];
    /* unisci dettate + toccate, senza duplicati */
    const azioni=Array.from(new Set([...dettate,...toccate])).slice(0,16);
    /* v202: il segno del peso viaggia nel digest. Senza, ne l'osservatrice locale ne
       il modello avrebbero modo di sapere che giorno era: il digest non porta il
       testo del diario, solo intenzioni e azioni. Cioe proprio quello che su una
       giornata di lutto vale zero e suona peggio di zero. */
    const v={giorno:g, intenzioni:Array.isArray(e.born)?e.born.slice(0,12):[], azioni:azioni};
    if(e.peso===true) v.pesa=true;
    return v;
  });
  /* v268.4: aperte COM'ERANO A FINE IERI. Una quest nata stamattina ieri non
     esisteva; una chiusa stamattina ieri era ancora aperta. Se no, spuntare una
     cosa alle 14 cancellava un fatto che alle 8 c'era. */
  const questAperte=(S.quests||[])
    .filter(q=>q&&(!q.nata||q.nata<=_ieri))
    .filter(q=>!q.fatto||chiuseOggi.has(q.titolo))
    .map(q=>({titolo:q.titolo,prio:q.prio||3,quando:q.quando||null}));
  /* giorni con attività = sia task ricorrenti spuntate sia quest completate */
  const giorniSet=new Set([...Object.keys(S.checks||{}).filter(k=>k<=_ieri),...Object.keys(azioniPerGiorno)]);
  const giorni=Array.from(giorniSet).sort().slice(-14);
  const passiGiornalieri=giorni.map(day=>{
    const n=Object.values((S.checks||{})[day]||{}).filter(v=>v===true).length + (azioniPerGiorno[day]?azioniPerGiorno[day].length:0);
    return {giorno:day, passo:n===0?'vuoto':n===1?'un passo':n<4?'qualche passo':'molti passi'};
  });
  /* v204: erano quattro, ora sette. Servono a due cose - dire al modello di non
     ripetersi, e far scartare al motore locale una riga che rifa una costruzione
     gia usata. Quattro coprivano meno di una settimana, e il giudice trovava
     costruzioni ripetute proprio nella finestra dei sette giorni che controlla. */
  const osservazioniPrecedenti=(S.observerNotes||[]).slice(-7).map(n=>n.note);
  /* v268 — LA MEMORIA DEL CONTENUTO.
     Fino alla v267 Sentiero ricordava le COSTRUZIONI e le FAMIGLIE: sapeva come
     aveva parlato, non DI CHE COSA. Cambiare le parole non rende nuovo un
     contenuto gia consumato, e il duello lo ha mostrato: cinque delle sette sere
     bocciate parlavano di una cosa gia nominata nei giorni prima.
     Qui viaggia quello che serve al livello COSA: di quale cosa, quando, in che
     senso, con quale valore. Quattro campi, niente di piu. */
  const detti_recenti=(S.obsDetti||[]).slice(-24);
  /* l'oro del Motore (acceso dalla v133): gli attriti con le parole esatte, le assenze lunghe, lo sguardo */
  const dalMotore={};
  try{
    const mq=(S.mastery&&S.mastery.quest)||{};
    const att=[], ass=[];
    Object.keys(mq).forEach(id=>{ const q0=mq[id]||{};
      /* v268.4: i contatori della Maestria non cambiano a mezzanotte, cambiano
         quando il modello legge un racconto - quindi anche alle 18 di oggi.
         Dalla v268.4 processMastery mette da parte lo stato di FINE IERI prima
         di toccarli il primo volta di ogni giorno: se sono gia stati toccati
         oggi si legge quello. Se non c'e (stato vecchio), si legge il vivo. */
      const q=(q0.tocco===tk&&q0.prima)?q0.prima:q0;
      const _vive=_attritoVivo(q);   /* v268.6: l'attrito di adesso, non il ricordo */
      if(_vive){ const t=_titoloDiId(id); if(t) att.push({quest:clampStr(t,60),parole:clampStr(_vive,120)}); }
      if((q.assenze|0)>=4){ const t=_titoloDiId(id); if(t) ass.push(clampStr(t,60)); }
    });
    if(att.length) dalMotore.attriti_vivi=att.slice(0,4);
    if(ass.length) dalMotore.assenze_lunghe=ass.slice(0,4);
    const sg=(S.mastery&&S.mastery.sguardo)||[];
    if(sg.length>=3){
      const ult=sg.slice(-8), m3=ult.filter(e=>e.livello>=3).length, m2=ult.filter(e=>e.livello===2).length;
      dalMotore.sguardo_recente=m3>=3?'vede i propri pattern':(m2+m3)>=4?'spesso si osserva':'per lo piu cronaca';
    }
  }catch(_){}
  return {oggi:tk, fino:_ieri,
    /* la finestra viaggia col digest: chi legge questi dati - il motore locale,
       il modello, gli attrezzi del laboratorio - deve sapere fin dove arrivano. */
    finestra:'giorni conclusi, fino a '+_ieri+' compreso: oggi non e ancora un giorno',
    /* cio che non porta una data e non si puo tagliare a ieri. Dichiarato, non
       nascosto: lo sguardo del Motore e un giudizio accumulato, non un giorno. */
    senza_data:['taskRicorrenti','sguardo_recente'],
    diario:diario, questAperte:questAperte, taskRicorrenti:(S.scheduled||[]).map(t=>t.titolo), giorniRecenti:giorni, passiGiornalieri:passiGiornalieri, dalMotore:dalMotore, sussurri_recenti:(S.obsLines||[]).slice(-5).map(n=>clampStr(n.riga,140)), osservazioniPrecedenti:osservazioniPrecedenti, detti_recenti:detti_recenti};
}

function observerOutputSospetto(t){
  const s=String(t||'').trim(); if(!s) return true;
  if(s.length>360) return true;
  if(/```|\b(?:the prompt|does the prompt|wait,|i should|let me|analysis|system instruction|assistant:)\b/i.test(s)) return true;
  if(/^[\s\]\[{}*_`#>"]{2,}/.test(s)) return true;
  return false;
}
async function askObserver(digest){
  /* Lab 13 — Observer ha un solo valore semantico: la riga. Structured output
     qui aggiungeva soltanto un punto di rottura: sul telefono 3.7 rispondeva,
     ma il client falliva il parsing e la risposta buona arrivava dal fallback.
     Il fatto resta scelto localmente; Gemini scrive soltanto il COME, in testo. */
  const res=await aiCall({system:OBSERVER_SYS,user:'DATI OSSERVATI (JSON):\n'+JSON.stringify(digest),task:'observer',maxOutputTokens:220,reasoning:'low',timeout:45000,priority:30});
  if(res.err){ const e=res.err;
    if(e==='chiave') throw new Error('AUTH');
    if(e==='limite'||e==='quota') throw new Error('RATE');
    if(e==='occupato') throw new Error('BUSY');
    if(e==='modello') throw new Error('MODEL');
    if(e==='timeout') throw Object.assign(new Error('TIMEOUT'),{name:'AbortError'});
    if(e==='offline'||e==='rete') throw new TypeError('rete');
    throw new Error('HTTP '+e);
  }
  let raw=String(res.text||'').trim();
  /* compatibilita difensiva: se un modello ignora il nuovo formato e restituisce
     ancora {note:"..."}, estraiamo solo il campo. Non e il formato richiesto. */
  try{ const j=_geminiStructuredJson(raw); if(j&&typeof j.note==='string') raw=j.note.trim(); }catch(_){}
  const note=clampStr(raw,600).trim();
  if(!note||/^silenzio[.!…]?$/i.test(note)) throw new Error('EMPTY');
  if(observerOutputSospetto(note)) throw new Error('bad');
  return {summary:'',detectedPatterns:[],note:note,model:res.model||'',tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''};
}

/* logica locale base: gira offline, senza chiave. Rileva i pattern essenziali. */
/* ══ IL MOTORE LOCALE — l'osservatrice senza modello (v204) ═══════════════════
   Sorgente leggibile. Da qui viene innestato in index.html: si modifica QUI e si
   rilancia attrezzi/innesta_motore.py, altrimenti le due copie divergono.

   PERCHE ESISTE. Senza chiave l'osservatrice cadeva su sei rami fissi con un
   registro da coach - «scegli una spunta ridicola e proteggila» - e su chi non
   paga era l'unica voce che l'app avesse. Questo motore non e un ripiego: e lo
   stesso metodo dei prompt, senza il modello. Trova i fatti nei dati, li scrive
   in piu costruzioni diverse, e poi LE GIUDICA con le stesse misure prese sui
   maestri (attrezzi/maestri.py, 9 agosto 2026) tenendo solo quella che passa.
   Il modello scrive e poi noi misuriamo; qui si misura prima di mostrare.

   LE DUE FIRME DA BATTERE, misurate su Pavese, London e Pratchett:
     TRATTINO   nove passi su dieci dei maestri non ne hanno nessuno; sei righe
                su dieci di Sentiero ne avevano uno. Qui: zero, sempre.
     COPULE     il p90 dei maestri e 0,133 ed e identico in tutti e cinque i
                libri. Sentiero sforava nel 42% delle righe. Qui il giudice
                scarta sopra 0,133.

   COSA NON PUO FARE, e va detto: non legge il testo del diario. Vede intenzioni,
   azioni, titoli, giorni e le parole d'attrito che il Motore ha gia estratto.
   Quindi non distingue un lutto da una giornata storta: quello resta al modello,
   e senza chiave la protezione del peso arriva da un'altra parte. ══════════ */

/*MOTORE-LOCALE-INIZIO*/
/* ── QUANTO DURA L'ECO (v202) ──────────────────────────────────────────────
   Un giorno che pesa non finisce a mezzanotte, ma non puo nemmeno spegnere
   l'osservatrice per sempre: il lutto non e uno stato permanente dell'app. Tre
   giorni e una scelta di sensibilita, non un calcolo: si cambia qui e si vede
   l'effetto nei banchi.
   Sta in questo file, e non in index.html, perche l'innesto possiede tutta la
   regione fino a buildObserverLocal: tenerlo di la voleva dire vederselo portare
   via al primo innesto, ed e successo. */
const PESO_ECO_GIORNI=3;
function _pesaDiRecente(digest){
  const d=digest&&digest.diario||[];
  let limite='';
  try{ limite=new Date(Date.parse(digest.oggi+'T12:00:00')-PESO_ECO_GIORNI*86400000).toISOString().slice(0,10); }catch(_){}
  return d.some(g=>g&&g.pesa&&(!limite||g.giorno>=limite));
}

/* ── i mattoni ─────────────────────────────────────────────────────────────
   I numeri non si scrivono mai: il contratto di casa ne ammette al massimo uno
   per riga, e questa voce non ne usa nessuno. Le quantita diventano parole. */
/* ANCHE LE QUANTITA E LE DURATE SONO DATI (v219). Erano parole italiane dentro
   il codice, e uscivano tali e quali dentro una frase inglese: «came back after
   una settimana of silence». Adesso stanno in due tabelle, italiane qui e di
   ogni altra lingua nel suo pacchetto. */
const QUANTITA_IT=[{q:0.85,t:'quasi ogni giorno'},{q:0.6,t:'piu giorni si che no'},
                   {q:0.35,t:'un giorno si e uno no'},{q:0.15,t:'ogni tanto'},{q:0,t:'di rado'}];
const QUANTITA_ZERO_IT='mai', QUANTITA_UNA_IT='una volta sola';
const DURATE_IT=[{g:1,t:'un giorno'},{g:3,t:'qualche giorno'},{g:8,t:'una settimana'},
                 {g:20,t:'un paio di settimane'},{g:45,t:'un mese'},{g:99999,t:'mesi'}];
function _ossTab(nome,casa){
  const p=(typeof PACCHETTO!=='undefined')?PACCHETTO:null;
  if(p&&p.voci&&p.voci[nome]) return p.voci[nome];
  if(typeof linguaApp==='function'&&linguaApp()!=='it') return null;
  return casa;
}
function _ossQuanto(n, tot){
  const tab=_ossTab('quantita',QUANTITA_IT); if(!tab) return '';
  const zero=_ossTab('quantita_zero',QUANTITA_ZERO_IT)||'';
  const una=_ossTab('quantita_una',QUANTITA_UNA_IT)||'';
  if(!tot||n<=0) return zero;
  if(n===1) return una;
  const q=n/tot;
  for(let i=0;i<tab.length;i++){ if(q>=tab[i].q) return tab[i].t; }
  return tab[tab.length-1].t;
}
/* la durata esce NUDA, senza preposizione: e chi costruisce la frase a mettere
   «da» o «dopo». Altrimenti si finisce con «tornata dopo da una settimana», che
   e il genere di errore che nessun giudice a soglie puo vedere. */
function _ossDurata(n){
  const tab=_ossTab('durate',DURATE_IT); if(!tab) return '';
  for(let i=0;i<tab.length;i++){ if(n<=tab[i].g) return tab[i].t; }
  return tab[tab.length-1].t;
}
const _OSS_DOW=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
function _ossDow(g){
  const nomi=_ossTab('giorni',_OSS_DOW)||_OSS_DOW;
  try{ return nomi[new Date(g+'T12:00:00').getDay()]; }catch(_){ return ''; }
}
/* domenica e femminile, gli altri sei no: «il domenica» era la prima riga che
   usciva sul caso del giorno che cede. In inglese l'articolo non c'e, e il
   pacchetto porta il proprio modello: «{g}» e basta. */
function _ossIlGiorno(dw){
  const mod=_ossTab('ilgiorno',null);
  if(mod) return String(mod).split('{g}').join(dw);
  if(typeof linguaApp==='function'&&linguaApp()!=='it') return dw;
  return (dw==='domenica'?'la ':'il ')+dw;
}
function _ossGiorniFra(a,b){ try{ return Math.round((Date.parse(b+'T12:00:00')-Date.parse(a+'T12:00:00'))/86400000); }catch(_){ return 0; } }
function _ossMinuscolo(t){ return String(t||'').trim().replace(/^./,c=>c.toLowerCase()); }

/* ── I FATTI ───────────────────────────────────────────────────────────────
   Ogni fatto e una cosa vera e verificabile nei dati, col nome esatto della cosa.
   Niente categorie astratte: non «la costanza», ma «camminare».
   L'ordine dell'elenco e l'ordine di preferenza: le sue parole prima di tutto. */
/* v267 — «conserva»: cosa una frase DEVE portare con se, qualunque parole usi.
   E il primo pezzo del giorno in cui significato e frase saranno due cose
   separate. Oggi e un elenco di stringhe e il controllo e letterale; domani sara
   una struttura e il controllo sara strutturale. Ma il posto dove scriverlo
   esiste da adesso, e la giuria lo guarda gia: cosi quando arrivera il livello
   semantico non ci sara niente da smontare. */
function _ossFatti(d){
  const F=[], diario=(d.diario||[]), oggi=d.oggi||'';
  const passi=(d.passiGiornalieri||[]), motore=(d.dalMotore||{});

  /* 1 · le sue parole esatte sull'attrito. Sono oro perche non sono nostre:
        le ha scritte lui, e il Motore le ha gia messe da parte. */
  (motore.attriti_vivi||[]).slice(0,2).forEach(a=>{
    if(a&&a.quest&&a.parole) F.push({t:'attrito',peso:10,cosa:a.quest,parole:String(a.parole).trim(),
                                     conserva:[a.quest,String(a.parole).trim()]});
  });

  /* 2 · quello che tace da molti giorni, col suo nome */
  (motore.assenze_lunghe||[]).slice(0,2).forEach(x=>{
    if(x) F.push({t:'silenzio',peso:8,cosa:x,conserva:[x]});
  });

  /* 3 · la promessa che torna: nata piu volte, mai fatta */
  {
    const nate={}, fatte={};
    diario.forEach(g=>{ (g.intenzioni||[]).forEach(t=>nate[t]=(nate[t]||0)+1);
                        (g.azioni||[]).forEach(t=>fatte[t]=(fatte[t]||0)+1); });
    let peggio=null,gap=0;
    Object.keys(nate).forEach(t=>{ const v=nate[t]-(fatte[t]||0);
      if(nate[t]>=2&&v>gap){ gap=v; peggio=t; } });
    if(peggio) F.push({t:'ricorrente',peso:9,cosa:peggio,volte:nate[peggio],conserva:[peggio]});
  }

  /* 4 · il ritorno: una cosa ricomparsa dopo un silenzio. E il fatto piu bello
        che i dati contengano, e nessuno lo raccontava. */
  {
    const perGiorno={}; diario.forEach(g=>{ perGiorno[g.giorno]=new Set(g.azioni||[]); });
    const giorni=Object.keys(perGiorno).sort();
    if(giorni.length>=3){
      const ultimo=giorni[giorni.length-1];
      (Array.from(perGiorno[ultimo]||[])).forEach(t=>{
        let vuoti=0, visto=null;
        for(let i=giorni.length-2;i>=0;i--){
          if(perGiorno[giorni[i]].has(t)){ visto=giorni[i]; break; }
          vuoti++;
        }
        if(visto&&vuoti>=3) F.push({t:'ritorno',peso:9,cosa:t,dopo:_ossGiorniFra(visto,ultimo),conserva:[t]});
      });
    }
  }

  /* 5 · il giorno della settimana che cede sempre */
  {
    const perDow={}, vuotiDow={};
    passi.forEach(p=>{ const dw=_ossDow(p.giorno); if(!dw) return;
      perDow[dw]=(perDow[dw]||0)+1; if(p.passo==='vuoto') vuotiDow[dw]=(vuotiDow[dw]||0)+1; });
    let quale=null;
    Object.keys(perDow).forEach(dw=>{
      if(perDow[dw]>=2&&(vuotiDow[dw]||0)===perDow[dw]) quale=dw;
    });
    if(quale) F.push({t:'giorno',peso:7,cosa:quale,conserva:[quale]});
  }

  /* 6 · la piu vecchia rimasta aperta */
  {
    const ap=(d.questAperte||[]).filter(q=>q&&q.titolo);
    if(ap.length&&diario.length){
      const prima={};
      diario.slice().reverse().forEach(g=>{ (g.intenzioni||[]).forEach(t=>{ if(!prima[t]) prima[t]=g.giorno; }); });
      let vecchia=null,eta=0;
      ap.forEach(q=>{ const n=prima[q.titolo]; if(!n) return;
        const g=_ossGiorniFra(n,oggi); if(g>eta){ eta=g; vecchia=q.titolo; } });
      if(vecchia&&eta>=7) F.push({t:'vecchia',peso:6,cosa:vecchia,giorni:eta,conserva:[vecchia]});
    }
  }

  /* 7 · lo scritto: quanto ha lasciato una riga, e non e una spunta */
  {
    const g=diario.length, tot=Math.max(passi.length,g);
    if(g>=3) F.push({t:'scritto',peso:4,quanto:_ossQuanto(g,tot),giorni:tot,conserva:[_ossQuanto(g,tot)]});
  }

  /* 8 · il ritmo, che e il ripiego di sempre ma detto senza fare il maestro.
        Porta con se l'ampiezza vera della finestra: e l'unico modo onesto di
        agganciarlo al passato senza inventare una durata. */
  {
    const pieni=passi.filter(p=>p.passo!=='vuoto').length;
    if(passi.length>=4) F.push({t:'ritmo',peso:2,quanto:_ossQuanto(pieni,passi.length),
                                pieni:pieni,vuoti:passi.length-pieni,giorni:passi.length,
                                conserva:[_ossQuanto(pieni,passi.length)]});
  }

  /* ══ v264 — I DUE FATTI CHE FANNO COMUNICARE, INVECE DI RIFERIRE ═══════════
     Fin qui il motore sapeva fare una cosa sola: ridire un dato con parole
     italiane. In psicologia del colloquio si chiama RIFLESSO SEMPLICE, ed e il
     gradino piu basso: ripete, non aggiunge. Chi comunica davvero fa altre due
     cose, e sono queste.

     9 · IL CONTRASTO, cioe il riflesso a due facce.
     Si tengono insieme le due parti di una contraddizione che la persona sta
     vivendo: una cosa ferma e una che si muove, nella stessa settimana. La
     regola che viene dal colloquio motivazionale e precisa e vale come vincolo
     di scrittura: la frase deve CHIUDERE sulla parte che si e mossa, perche
     l'accento cade sull'ultima cosa detta. Chiudere sul fermo lascia addosso il
     fermo, e sarebbe un rimprovero travestito da osservazione. */
  {
    const nate={}, fatte={}, ultimaFatta={};
    diario.forEach(g=>{
      (g.intenzioni||[]).forEach(t=>{ if(t) nate[t]=(nate[t]||0)+1; });
      (g.azioni||[]).forEach(t=>{ if(t){ fatte[t]=(fatte[t]||0)+1; if(!ultimaFatta[t]) ultimaFatta[t]=g.giorno; } });
    });
    const ferme=Object.keys(nate).filter(t=>!fatte[t]);
    const mosse=Object.keys(fatte);
    if(ferme.length&&mosse.length){
      /* la ferma piu insistita, la mossa piu recente: le due che pesano di piu */
      let ferma=ferme[0]; ferme.forEach(t=>{ if(nate[t]>nate[ferma]) ferma=t; });
      let mossa=mosse[0]; mosse.forEach(t=>{ if((ultimaFatta[t]||'')>(ultimaFatta[mossa]||'')) mossa=t; });
      if(ferma&&mossa&&ferma!==mossa) F.push({t:'contrasto',peso:9.5,ferma:ferma,mossa:mossa,conserva:[ferma,mossa]});
      /* il peso: sopra al ricorrente, sotto alle sue parole. Un riflesso a due
         facce contiene gia il fatto del ricorrente e in piu il contrappeso:
         dice di piu, quindi passa avanti. Sopra restano solo le parole che ha
         scritto lei, che non sono nostre e valgono sempre di piu. */
    }
  }

  /* 10 · LA TENUTA, cioe l'affermazione.
     L'affermazione non e una lode. La lode mette al centro chi parla («sono
     contento che»), e Sentiero non ha nessun diritto di essere contento di
     niente. L'affermazione toglie di mezzo chi parla e nomina una cosa precisa
     che la persona ha fatto, lasciandole il merito di accorgersene.
     Il fatto: una cosa passata proprio in un giorno che dava poco. Non e un
     complimento, e una misura - e vale perche e specifica. */
  {
    const azDi={}; diario.forEach(g=>{ if((g.azioni||[]).length) azDi[g.giorno]=g.azioni; });
    const magri=passi.filter(p=>p.passo==='un passo'&&azDi[p.giorno]);
    if(magri.length){
      const g=magri[magri.length-1];
      const cosa=(azDi[g.giorno]||[])[0];
      if(cosa) F.push({t:'tenuta',peso:6.5,cosa:cosa,giorno:g.giorno,conserva:[cosa]});   /* sopra al ritmo e allo scritto, che sono generici */
    }
  }
  return F.sort((a,b)=>b.peso-a.peso);
}

/* ── LE FORME ──────────────────────────────────────────────────────────────
   Piu costruzioni per ogni fatto, cosi la voce non ha una sola architettura.
   La firma vecchia era sempre la stessa: fatto, trattino, senso. Qui i trattini
   non ci sono e le costruzioni si alternano. Tutte in minuscolo, due frasi al
   massimo, e nessuna dice cosa fare: sono osservazioni, non consigli. */
/* ══ LE FORME SONO MODELLI (v219) ═══════════════════════════════════════════
   Erano frasi scritte nel codice, e quindi italiane per sempre. Adesso sono
   modelli con dei buchi - {cosa}, {parole}, {quanto}, {durata} - e i modelli
   italiani stanno qui mentre quelli di ogni altra lingua stanno nel suo
   pacchetto, accanto alle scritte e agli schemi del microfono.

   L'italiano resta dentro per la stessa ragione di sempre: e la garanzia che
   l'app parli al primo avvio senza chiedere niente a nessuno. E se un pacchetto
   non porta le forme, quella voce tace invece di parlare italiano a uno che non
   lo capisce. */
/* ══ v265 — I POLI, cioe i CONTRARI messi al lavoro ═════════════════════════
   Il riflesso a due facce dice sempre la stessa opposizione: ferma / andata
   avanti. Ma l'opposizione ha molti modi di dirsi, e sceglierne uno diverso ogni
   volta e esattamente cosa vuol dire avere padronanza di una lingua.

   LA REGOLA DI DANTE, e non e un ornamento. Nel «De vulgari eloquentia» Dante
   scrive IN LATINO, per i dotti, e dentro sostiene il volgare per tutti: la
   cultura sta nello studio, quello che arriva alla gente dev'essere capito da
   chiunque. Percio qui entrano solo modi di dire che il vocabolario segna come
   DIFFUSI - li capisce chiunque parli italiano, di qualunque eta e regione.
   Una metafora che capisce solo chi la dice non comunica niente, ed e la cosa
   peggiore che quest'app possa fare. Lo tiene chiuso banchi/provaVolgare.js.

   Sono locuzioni invariabili di proposito: non si accordano, quindi non possono
   sbagliare genere accanto al nome di una cosa che non conosciamo. */
const POLI_IT=[
  {fermo:'al palo',            mosso:'in movimento'},
  {fermo:'a terra',            mosso:'in piedi'},
  {fermo:'in stallo',          mosso:'in corsa'},
  {fermo:'nel dimenticatoio',  mosso:'a galla'}
];
const FORME_IT={
  attrito:['di {cosa} avevi scritto «{parole}». quelle parole sono ancora li.',
            '«{parole}», scrivevi di {cosa}.',
            '«{parole}», avevi scritto. era {cosa}.',
            'quella frase non si e consumata. la scrivevi di {cosa}: «{parole}».',
            'te lo eri detto. su {cosa} scrivevi «{parole}».',
            'quella riga non invecchia. di {cosa} dicevi «{parole}».',
            'resta li, quella riga. sotto {cosa} c\'era «{parole}».',
            'nessuno l\'ha smentita. di {cosa} scrivevi «{parole}».',
            'da li non ti sei mosso. «{parole}», dicevi di {cosa}.',
            'la frase tiene ancora. riguardava {cosa}: «{parole}».'],
  silenzio:['{cosa} non compare da un pezzo. non e sparita, tace.',
             'di {cosa} non si parla piu da parecchio.',
             'nessuna traccia di {cosa}, ormai da un pezzo.',
             'non e sparita: tace. {cosa} non si fa viva da un pezzo.',
             'silenzio da un pezzo. di {cosa} non si sente piu niente.',
             'si e messa da parte. {cosa} non compare da un bel po\'.',
             'nessuno l\'ha cancellata. {cosa} manca da parecchio.',
             'manca all\'appello da tempo: {cosa}.',
             'zitta, non chiusa. {cosa} non si affaccia piu.',
             'resta li, muta. da un pezzo {cosa} non torna.'],
  ricorrente:['{cosa} torna a nascere e non si chiude mai.',
               'hai rimesso in lista {cosa} piu di una volta. torna sempre li.',
               'rientra in lista ogni volta. e {cosa} non se ne va.',
               'nasce, muore, rinasce. {cosa} fa questo giro da un po\'.',
               'molte partenze, nessun arrivo. cosi va {cosa}.',
               'ci torni sempre. chiuderla e un altro paio di maniche, {cosa}.',
               'la scrivi e la riscrivi. {cosa} resta li in lista.',
               'ricomincia da capo ogni volta: {cosa}.',
               'quante ripartenze. {cosa} torna in lista e ci resta.',
               'non si chiude mai. {cosa} rientra e basta.'],
  ritorno:['{cosa} e tornata dopo {dopo} di silenzio.',
            'dopo {dopo} ferma, {cosa} e ricomparsa.',
            '{cosa} aveva smesso di comparire. ora c\'e di nuovo.',
            'oggi si, finalmente. erano {dopo} che {cosa} non si vedeva.',
            'e rispuntata. {cosa} mancava da {dopo}.',
            'riecco. dopo {dopo}, {cosa} rientra.',
            'come se niente fosse. {cosa} rientra dopo {dopo}.',
            'ci ha messo un po\'. dopo {dopo}, {cosa} rispunta.',
            'nel dimenticatoio per {dopo}. poi {cosa} torna.',
            'il vuoto e durato {dopo}. adesso {cosa} torna a farsi vedere.'],
  giorno:['{ilgiorno} torna, e non lascia mai niente.',
           'ogni {cosa} la giornata passa e non resta niente. torna cosi da settimane.',
           'c\'e un giorno che cede sempre: {ilgiorno}.',
           'passa liscio. {ilgiorno} non lascia il segno.',
           'non ci si attacca niente: {ilgiorno} scivola via.',
           'resta tutto bianco. succede ogni {cosa}.',
           'sempre lo stesso: {ilgiorno} arriva e se ne va a mani vuote.',
           'settimana dopo settimana, {ilgiorno} non tiene.',
           'di {cosa} non resta mai traccia.',
           'c\'e un buco fisso nella settimana: {ilgiorno}.'],
  vecchia:['{cosa} aspetta da {durata}.',
            'la piu vecchia rimasta aperta e {cosa}. sta li da {durata}.',
            'ferma e ancora in piedi. {cosa} sta in lista da {durata}.',
            'nessuna aspetta quanto lei. {cosa} e li da {durata}.',
            'in cima alle cose ferme. {cosa}, da {durata}.',
            'la piu paziente di tutte: {cosa}, da {durata}.',
            'porta {durata} sulle spalle: {cosa}.',
            'non si muove da {durata}: {cosa}.',
            'aspetta piu di tutte. {cosa}, ormai da {durata}.',
            'da {durata} nella stessa posizione: {cosa}.'],
  scritto:['da {durata} hai lasciato una riga {quanto}.',
            'in queste settimane scrivi {quanto}, e le righe restano.',
            'il diario porta la tua voce {quanto}. va cosi da {durata}.',
            'da {durata} qui dentro resta qualcosa di scritto {quanto}.',
            'scrivi {quanto}. lo fai da {durata}.',
            'le parole le lasci {quanto}. succede da {durata}.',
            'il foglio non resta bianco {quanto}. e da {durata}.',
            'qualcosa di scritto rimane {quanto}. va avanti da {durata}.',
            'una riga finisce qui {quanto}. da {durata}.',
            'da {durata} la tua voce compare qui {quanto}.'],
  ritmo:['da {durata} le giornate con qualcosa dentro sono {quanto}.',
          'in queste settimane qualcosa si muove {quanto}.',
          'i giorni pieni arrivano {quanto}, ormai da {durata}.',
          'da {durata} il passo tiene {quanto}.',
          'qualcosa si muove {quanto}. va cosi da {durata}.',
          '{quanto} resta un segno nella giornata. e da {durata}.',
          'le giornate piene arrivano {quanto}. e da {durata}.',
          'il passo si sente {quanto}. ormai da {durata}.',
          'da {durata} qualcosa tiene {quanto}.',
          'le giornate con dentro qualcosa arrivano {quanto}. da {durata}.'],
  contrasto:['{ferma} e rimasta ferma. intanto {mossa} e andata avanti.',
              'da una parte {ferma}, che aspetta. dall\'altra {mossa}, che cammina.',
              '{ferma} non si e mossa. {mossa} si.',
              'mentre {ferma} restava indietro, {mossa} teneva.',
              'due cose insieme. {ferma} al palo, {mossa} in movimento.',
              '{ferma} aspetta ancora. e intanto {mossa} va.',
              'non e tutto fermo. lo e {ferma}, non {mossa}.',
              'una resta li e una no. {ferma} ferma, {mossa} avanti.',
              'su {ferma} niente. su {mossa} qualcosa si e mosso.',
              '{ferma} sta dov\'era. {mossa} no.',
              '{ferma} {fermoM}, {mossa} {mossoM}.',
              '{ferma} resta {fermoM}. {mossa} e {mossoM}.',
              'eccole insieme. {ferma} {fermoM}, {mossa} {mossoM}.'],
  tenuta:['non era un giorno pieno. {cosa} e passata lo stesso.',
           'quel giorno non ha lasciato quasi niente. {cosa} si.',
           'una giornata sottile. dentro c\'era {cosa}.',
           'quando la giornata dava poco, {cosa} e passata.',
           'poco in quella giornata. {cosa} pero c\'era.',
           'nel giorno piu corto ha tenuto {cosa}.',
           'quel giorno reggeva poco. {cosa} ha retto.',
           'restava poco spazio. {cosa} ci e entrata lo stesso.',
           'una giornata quasi vuota, con dentro {cosa}.',
           'in fondo a un giorno magro: {cosa}.']
};
function _ossRiempi(modelli,f){
  const c=_ossMinuscolo(f.cosa||'');
  const buchi={
    '{cosa}':c,
    '{parole}':_ossMinuscolo(f.parole||''),
    '{quanto}':f.quanto||'',
    '{durata}':_ossDurata(f.giorni||0),
    '{dopo}':_ossDurata(f.dopo||0),
    '{ilgiorno}':_ossIlGiorno(c),
    /* v264: le due parti del riflesso a due facce. Restano minuscole come tutto
       il resto, e restano SUE: il giudice non le conta come prosa nostra. */
    '{ferma}':_ossMinuscolo(f.ferma||''),
    '{mossa}':_ossMinuscolo(f.mossa||''),
    /* v265: i due poli dell'opposizione, presi dai modi di dire diffusi. Se
       nessuno li ha scelti si usa il primo, cosi la forma resta viva anche
       quando il motore gira senza memoria (nei banchi, per esempio). */
    '{fermoM}':((f.polo||POLI_IT[0]).fermo),
    '{mossoM}':((f.polo||POLI_IT[0]).mosso)
  };
  return (modelli||[]).map(m=>{
    let t=String(m);
    for(const k in buchi) t=t.split(k).join(buchi[k]);
    return t;
  }).filter(function(t){
    /* un buco rimasto vuol dire modello sbagliato: si scarta. Si cercano le
       chiavi intere e non la graffa da sola, e non e un vezzo: l'estrattore dei
       banchi conta le parentesi ANCHE dentro le stringhe, e una graffa spaiata
       in un letterale gli impedisce di trovare la fine della funzione. Ci ho
       perso mezz'ora. */
    for(var k in buchi){ if(t.indexOf(k)>=0) return false; }
    return true;
  });
}
function _ossModelli(tipo){
  const p=(typeof PACCHETTO!=='undefined')?PACCHETTO:null;
  if(p&&p.voci&&p.voci.osservatrice&&p.voci.osservatrice[tipo]) return p.voci.osservatrice[tipo];
  if(typeof linguaApp==='function'&&linguaApp()!=='it') return null;   /* niente pacchetto: si tace */
  return FORME_IT[tipo]||null;
}
function _ossForme(f){
  return _ossRiempi(_ossModelli(f&&f.t),f||{});
}

/* ── IL GIUDICE, IN CASA ───────────────────────────────────────────────────
   Le stesse regole di laboratorio/giudice.py, quelle che si possono misurare
   senza un modello. Le soglie vengono dai maestri e stanno scritte accanto.
   Una riga che non passa non si mostra: si prova la costruzione dopo. */
const OSS_SOGLIE={copule:0.133, frase:31, corta:7, lettere:280};
const _OSS_COP=/\b(e|è|sono|sei|siamo|siete|era|erano|eri|essere|stato|stata|stati|state|ho|hai|ha|abbiamo|avete|hanno|avevo|avevi|aveva|avevano|avere|avuto)\b/g;
const _OSS_PRESCRIVE=/\b(devi|dovresti|dovrai|prova a|cerca di|ricorda di|basta che|ti serve|scegli)\b/;
/* v249 — LE PAROLE CHE DENTRO L'APP NON SI LEGGONO DA NESSUNA PARTE.
   Il sussurro ha detto «...su questo rituale». «Rituale» e una parola
   nostra: sullo schermo non compare mai, e chi usa Sentiero non l'ha mai vista.
   Il divieto esisteva gia - il contratto del modello grande lo scrive nero su
   bianco - ma viveva SOLO dentro quel contratto, e il giudice del sussurro non
   lo consultava. Cosi la riga di casa e quella del modello locale potevano
   dirla, e nessuno le fermava.
   Adesso l'elenco sta in un posto solo e lo guarda anche il giudice. La regola
   dietro e piu vecchia del bug: le cose si chiamano coi loro nomi, e se una
   parola non la useresti parlando a voce con un amico, non si usa. */
/* le desinenze si scrivono per intero: «rituali?» prende «ritual» e «rituali»
   ma NON «rituale», che e proprio la parola che aveva detto. Una lettera, e
   la regola non serviva a niente - se n'e accorta la prova, non io. */
/* «spunta» NON e in elenco, e la prova me l'ha insegnato: una riga scritta a
   mano la usa - «una riga, una spunta, e qui comincia a esserci
   qualcosa» - e li dentro non e gergo, e italiano. Il contratto del modello
   grande la vieta a LUI, che potrebbe usarla come termine tecnico; il giudice
   invece guarda righe gia scritte, dove la stessa parola puo essere innocente.
   Vietare tutto e facile: costa una riga buona ogni volta che si sbaglia. */
const _OSS_GERGO=/\b(ritual[ei]|quests?|tasks?|streaks?|arco delle|occasioni previste|distillazione|osservatrice|sussurr[oi]|patto del mattino|pergamena)\b/i;

/* ══ LAB 21 — IL DIZIONARIO È UN CONTRATTO, NON UNA COLLEZIONE DI PAROLE ══
   Le liste linguistiche possono essere aggiornate dal file statico, ma un file
   non deve mai poter allargare i permessi dell'app. Qui servono solo a
   riconoscere classi gia vietate: prescrizione e gergo di sistema.
   Il matching e per parola/locuzione intera: «male» non deve colpire «formale». */
function _lingEsc(s){ return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function _lingHit(t,lista){
  const s=String(t||'').toLowerCase();
  for(const voce of (lista||[])){
    const v=String(voce||'').trim().toLowerCase(); if(!v) continue;
    const re=new RegExp('(^|[^a-zà-ÿ0-9])'+_lingEsc(v).replace(/\s+/g,'\\s+')+'(?=$|[^a-zà-ÿ0-9])','i');
    if(re.test(s)) return v;
  }
  return '';
}
function _lingContratto(){
  try{ return _baseLing(); }catch(_){ return null; }
}
/* Lab 22 — UNA BASE, POLITICHE DIVERSE PER MESTIERE.
   Prescrizione/gergo sono confini duri nelle voci riflessive; lode, biasimo e
   consolazione sono parole di giudizio che alcuni mestieri (Frutto, Capitolo,
   Scritto, Seme) devono scartare, mentre una Sfida puo essere imperativa per
   definizione. La base fornisce le classi; il mestiere decide quali valgono. */
function _lingVoceVeto(t,opt){
  opt=opt||{};
  let s=String(t||'').replace(/«[^»]*»/g,' ');
  const B=_lingContratto(); if(!B) return '';
  if(opt.prescrizione!==false){ const h=_lingHit(s,B.prescrizione||[]); if(h) return 'prescrizione: '+h; }
  if(opt.gergo!==false){ const h=_lingHit(s,B.gergo||[]); if(h) return 'parola di sistema: '+h; }
  if(opt.giudizio===true){
    for(const k of ['lode','biasimo','consolazione']){ const h=_lingHit(s,B[k]||[]); if(h) return k+': '+h; }
  }
  return '';
}

/* v262 — LE SUE CIFRE NON SONO LE NOSTRE.
   Il divieto sui numeri serve a impedire che l'app faccia i conti in faccia a
   qualcuno: «aspetta da 3 giorni» e sbagliata, e resta bocciata per sempre. Ma
   era scritto sulla riga INTERA, e nella riga intera c'e il titolo, e il titolo
   se l'e scritto la persona. Chi chiama un suo impegno «10 000 passi»
   o «Niente schermi dopo le 22:00» veniva censurato dal proprio nome.

   Misurato sull'archivio vero del 12 agosto, rivivendo i trenta giorni:
     Misurato su un archivio reale, in laboratorio: una riga su tre bocciata per
     «cifra», e ogni volta per una cifra che stava in un titolo scritto dalla
     persona - un orario, una quantita, una somma.
     Tre famiglie su otto - silenzio, ritorno, giorno - mute per trenta giorni.

   La riparazione era gia stata scritta una volta, per la chiamata a terra: il
   commento dentro terraDomandaCasa la racconta per esteso. Ma viveva li, in quel punto solo, e l'osservatrice della sera e il
   sussurro della spunta hanno continuato a morire sulla stessa pietra. Adesso
   sta nel giudice, che e il posto dove la sapevano tutti quelli che la chiamano.

   Il terzo argomento e facoltativo: chi non lo passa ha il giudice di sempre. */
function _ossGiudica(riga, precedenti, sue){
  const t=String(riga||'').trim();
  if(!t) return 'vuota';
  if(t.length>OSS_SOGLIE.lettere) return 'troppo lunga';
  if(/\s[—–-]\s/.test(t)) return 'trattino';            /* la firma numero uno */
  if(/[!]/.test(t)) return 'esclamazione';
  /* la prosa nostra: la riga meno le sue parole fra virgolette basse e meno i
     nomi che si e dato da sola. E la stessa scelta gia fatta per le copule
     poco piu sotto, e per le cifre nella chiamata a terra. */
  let _nostro=t.replace(/«[^»]*»/g,' ');
  if(sue) for(const s of (sue||[])){
    const p=String(s||'').trim(); if(!p) continue;
    _nostro=_nostro.split(p).join(' quella ');
    _nostro=_nostro.split(_ossMinuscolo(p)).join(' quella ');   /* com'e incollato nella riga */
  }
  if(/\d/.test(_nostro)) return 'cifra';                           /* le quantita si dicono in parole */
  if(/^[A-Z]/.test(t)) return 'attacco maiuscolo';
  /* Lab 21: il giudice guarda la PROSA NOSTRA, non le parole citate della persona,
     e usa la base linguistica come sorgente unica quando disponibile. */
  const _BL=_lingContratto();
  const _pr=_lingHit(_nostro,(_BL&&_BL.prescrizione)||[]);
  if(_pr||_OSS_PRESCRIVE.test(_nostro.toLowerCase())) return 'prescrive'+(_pr?(': '+_pr):'');
  const _ge=_lingHit(_nostro,(_BL&&_BL.gergo)||[]);
  if(_ge||_OSS_GERGO.test(_nostro)) return 'parola nostra'+(_ge?(': '+_ge):'');   /* v249/Lab21 */
  const fr=t.split(/(?<=[.?…])\s+/).filter(x=>x.trim());
  const parole=t.split(/\s+/).filter(Boolean);
  if(fr.some(f=>f.split(/\s+/).length>OSS_SOGLIE.frase)) return 'frase lunga';
  if(parole.length>=14&&fr.length<2) return 'fiato unico';         /* il punto in mezzo */
  if(fr.length>=2&&!fr.some(f=>f.split(/\s+/).length<=OSS_SOGLIE.corta)) return 'non respira';
  /* Le copule si contano SOLO nella prosa nostra: quello che sta fra virgolette
     basse sono le sue parole, ricopiate, e non e uno stile che possiamo scegliere.
     Senza questa esclusione la citazione dell'attrito - il materiale migliore che
     abbiamo, perche e vero e suo - veniva bocciata quasi sempre: basta un «non ho
     voglia» dentro una riga corta per sforare.

     E si contano FRASE PER FRASE, con due metri diversi. Un rapporto su sei parole
     non vuol dire niente: una sola copula fa 0,167 e sfora una soglia ricavata da
     passi lunghi il quadruplo. Misurato sui maestri (9 agosto): la soglia unica a
     0,133 boccia il 23% delle loro frasi corte contro il 12% di quelle lunghe -
     puniva la brevita, che e proprio cio che vogliamo. Sotto le dodici parole i
     maestri stanno a UNA copula per frase (p90); il tetto a una ne boccia il 6%,
     che e in linea con l'altro metro. */
  const nostro=t.replace(/«[^»]*»/g,' ');
  for(const fr of nostro.split(/(?<=[.?…])\s+/)){
    const pf=fr.split(/\s+/).filter(Boolean);
    if(pf.length<4) continue;
    const c=(fr.toLowerCase().match(_OSS_COP)||[]).length;
    if(pf.length<12){ if(c>1) return 'copule'; }
    else if(c/pf.length>OSS_SOGLIE.copule) return 'copule';
  }
  /* e non deve somigliare a quello che ha gia detto, in due modi diversi.
     LE PAROLE: se ripete lo stesso materiale. */
  const chiave=s=>new Set(String(s).toLowerCase().replace(/[^a-zà-ÿ\s]/g,' ').split(/\s+/).filter(w=>w.length>4));
  const mie=chiave(t);
  for(const p of (precedenti||[])){
    const sue=chiave(p); if(!sue.size||!mie.size) continue;
    let uguali=0; mie.forEach(w=>{ if(sue.has(w)) uguali++; });
    if(uguali/mie.size>=0.5) return 'gia detta';
  }
  /* LA COSTRUZIONE: se ripete la stessa architettura con parole diverse.
     Questa mancava, e l'ha trovata il giudice in laboratorio (R2) puntato contro
     le righe del motore: diciassette su quarantotto avevano lo scheletro di
     un'altra. E il difetto storico di Sentiero, quello per cui settantasei righe
     su cento erano fatto, trattino, senso: cambiavano le parole e non la forma. */
  const mioSk=_ossScheletro(t);
  if(mioSk&&(precedenti||[]).some(p=>_ossScheletro(p)===mioSk)) return 'stessa costruzione';
  return null;
}
const _OSS_FUNZ=new Set(['il','lo','la','i','gli','le','un','uno','una','e','ed','o','ma','di','a','da','in','con','su','per','tra','fra','che','non','del','della','dei','delle','al','alla','ai','alle','dal','dalla','nel','nella','si','ci','ti','ne','piu','ancora','sono','era','erano','hai','ha','ho']);
function _ossScheletro(riga){
  const tok=String(riga||'').toLowerCase().replace(/«[^»]*»/g,' ').replace(/[^a-zà-ÿ\s]/g,' ').split(/\s+/).filter(Boolean);
  return tok.filter(w=>!_OSS_FUNZ.has(w)).slice(0,3).join(' ');
}


/* ══ v267 — LA BASE LINGUISTICA ════════════════════════════════════════════
   Sentiero misura le proprie frasi. Per misurare serve un metro, e un metro
   deve dire DA DOVE VIENE, se no e un'opinione con dei numeri sopra.

   Due livelli utili, in ordine di preferenza:
     1. la base scaricata e validata (S.baseLing), quando c'e stata rete;
     2. la base COMPLETA incorporata nello stesso HTML della release.

   BASE_MINIMA resta soltanto come reperto/failsafe tecnico: il runtime normale
   non deve piu ricaderci per un errore di GitHub, CDN o cache. */
const BASE_MINIMA={"versione":0,"impronta":"minima-incorporata","nucleo":["a","adesso","affaccia","ancora","andare","andata","anche","appello","arriva","arrivano","aspetta","avanti","aveva","avevi","avuto","basta","bianco","bel","buco","cammina","capo","che","chi","chiude","chiusa","ci","cima","come","compare","con","corsa","cosa","cosi","cui","da","dal","dalla","dava","dentro","di","dice","dicevi","dimenticatoio","dopo","dov","due","durato","e","era","erano","essere","fa","farsi","fatto","fermo","ferma","fila","finalmente","fine","foglio","fondo","fosse","fuori","galla","giornata","giorni","giorno","gia","ha","hai","in","indietro","insieme","invecchia","la","lascia","lasciato","le","li","lista","lo","ma","magro","mai","mancava","manca","messa","mezzo","mosso","mossa","mosse","movimento","muove","muta","nasce","nascere","nel","nella","nessuna","nessuno","niente","no","non","nuovo","oggi","ogni","ora","ormai","palo","parla","parole","parte","parecchio","passa","passata","passo","pezzo","piede","piedi","piena","piene","piu","poco","poi","porta","posizione","pronta","proprio","qualcosa","quanto","quasi","quel","quella","questa","queste","qui","reggeva","resta","restano","restava","rientra","riga","righe","rimane","rimasta","rispunta","ritorno","scritto","scrivi","scrivevi","segno","sempre","senza","settimana","settimane","si","sente","sotto","spalle","sparita","sta","stallo","stessa","stesso","su","tace","tanto","tempo","tiene","torna","tornata","traccia","tua","tuoi","tutte","tutto","un","una","va","vecchia","vedere","viva","voce","volta","volte","vuota","zitta"],"bigrammi":["non compare","da un","un pezzo","non si","si parla","piu da","nessuna traccia","non e","e sparita","si fa","fa viva","messa da","da parte","non torna","torna a","a nascere","non se","se ne","ne va","in lista","piu di","di una","una volta","torna sempre","sempre li","da capo","ogni volta","non si chiude","si chiude","chiude mai","e tornata","dopo un","di silenzio","aveva smesso","smesso di","di comparire","ora c","di nuovo","al palo","in movimento","a terra","in piedi","in stallo","in corsa","nel dimenticatoio","a galla","non lascia","lascia mai","mai niente","passa liscio","il segno","scivola via","a mani","mani vuote","settimana dopo","dopo settimana","la piu","piu vecchia","rimasta aperta","sta li","li da","non si muove","in cima","alle cose","cose ferme","da un pezzo","hai lasciato","lasciato una","una riga","in queste","queste settimane","le righe","righe restano","il diario","la tua","tua voce","va cosi","cosi da","i giorni","giorni pieni","il passo","passo tiene","qualcosa si","si muove","un segno","nella giornata","le giornate","giornate piene","con dentro","dentro qualcosa","quel giorno","un giorno","giorno pieno","lo stesso","ha retto","poco spazio","ci e","e entrata","in fondo","a un","non era","e passata"],"lode":["bravo","brava","bravi","brave","complimenti","ottimo","ottima","benissimo","ben fatto","grande","fantastico","fantastica","orgoglioso","orgogliosa","congratulazioni","meritato","meritata","impressionante","eccellente","perfetto"],"biasimo":["pigro","pigra","pigrizia","fallito","fallita","colpa","sbagliato","sbagliata","dovevi","avresti dovuto","peccato","purtroppo","male","peggio","scarso","deludente","inutile","vergogna"],"consolazione":["non preoccuparti","va bene cosi","non e grave","capita a tutti","non importa","tranquillo","tranquilla","su con la vita","andra meglio"],"pronomi":["lei","lui","quella","quello","ci","ne","lo","la"],"deissi":["ieri","oggi","domani","stasera","stamattina","adesso","poco fa"],"pesi":{"comprensibilita":3.0,"carico":2.0,"fedelta":4.0,"neutralita":3.0,"ambiguita":0.0,"naturalezza":0.0,"vita":0.0,"coesione":3.0},"prescrizione":["devi","dovresti","dovrai","prova a","cerca di","ricorda di","basta che","ti serve","scegli","inizia da","concentrati","fai in modo"],"gergo":["rituale","rituali","quest","quests","task","tasks","streak","streaks","arco delle","occasioni previste","distillazione","osservatrice","sussurro","sussurri","patto del mattino","pergamena","pattern","trend","plateau","giornata rara","settimana rara","giorni rari","seme piantato"]};
/* la cache sta in un oggetto e non in una variabile sciolta: cosi il montaggio
   dei banchi la trova insieme alle altre costanti, invece di lasciarla fuori e
   far morire il motore con «_BASE is not defined». Ci ho perso due minuti. */
/* v272.3 — BASE COMPLETA INCORPORATA. Il file esterno resta aggiornabile, ma
   la qualita linguistica non dipende piu da GitHub/CDN/cache: l'HTML porta gia
   la stessa base validata della release. */
const BASE_COMPLETA={"per_versione":"v60S.272.7","versione":9,"impronta":"v10-2026-08-26-production-sentiero-272-7","nucleo":["a","adesso","affaccia","ancora","andare","andata","anche","appello","arriva","arrivano","aspetta","avanti","aveva","avevi","avuto","basta","bianco","bel","buco","cammina","capo","che","chi","chiude","chiusa","ci","cima","come","compare","con","corsa","cosa","cosi","cui","da","dal","dalla","dava","dentro","di","dice","dicevi","dimenticatoio","dopo","dov","due","durato","e","era","erano","essere","fa","farsi","fatto","fermo","ferma","fila","finalmente","fine","foglio","fondo","fosse","fuori","galla","giornata","giorni","giorno","gia","ha","hai","in","indietro","insieme","invecchia","la","lascia","lasciato","le","li","lista","lo","ma","magro","mai","mancava","manca","messa","mezzo","mosso","mossa","mosse","movimento","muove","muta","nasce","nascere","nel","nella","nessuna","nessuno","niente","no","non","nuovo","oggi","ogni","ora","ormai","palo","parla","parole","parte","parecchio","passa","passata","passo","pezzo","piede","piedi","piena","piene","piu","poco","poi","porta","posizione","pronta","proprio","qualcosa","quanto","quasi","quel","quella","questa","queste","qui","reggeva","resta","restano","restava","rientra","riga","righe","rimane","rimasta","rispunta","ritorno","scritto","scrivi","scrivevi","segno","sempre","senza","settimana","settimane","si","sente","sotto","spalle","sparita","sta","stallo","stessa","stesso","su","tace","tanto","tempo","tiene","torna","tornata","traccia","tua","tuoi","tutte","tutto","un","una","va","vecchia","vedere","viva","voce","volta","volte","vuota","zitta"],"bigrammi":["non compare","da un","un pezzo","non si","si parla","piu da","nessuna traccia","non e","e sparita","si fa","fa viva","messa da","da parte","non torna","torna a","a nascere","non se","se ne","ne va","in lista","piu di","di una","una volta","torna sempre","sempre li","da capo","ogni volta","non si chiude","si chiude","chiude mai","e tornata","dopo un","di silenzio","aveva smesso","smesso di","di comparire","ora c","di nuovo","al palo","in movimento","a terra","in piedi","in stallo","in corsa","nel dimenticatoio","a galla","non lascia","lascia mai","mai niente","passa liscio","il segno","scivola via","a mani","mani vuote","settimana dopo","dopo settimana","la piu","piu vecchia","rimasta aperta","sta li","li da","non si muove","in cima","alle cose","cose ferme","da un pezzo","hai lasciato","lasciato una","una riga","in queste","queste settimane","le righe","righe restano","il diario","la tua","tua voce","va cosi","cosi da","i giorni","giorni pieni","il passo","passo tiene","qualcosa si","si muove","un segno","nella giornata","le giornate","giornate piene","con dentro","dentro qualcosa","quel giorno","un giorno","giorno pieno","lo stesso","ha retto","poco spazio","ci e","e entrata","in fondo","a un","non era","e passata"],"lode":["bravo","brava","bravi","brave","complimenti","ottimo","ottima","benissimo","ben fatto","grande","fantastico","fantastica","orgoglioso","orgogliosa","congratulazioni","meritato","meritata","impressionante","eccellente","perfetto"],"biasimo":["pigro","pigra","pigrizia","fallito","fallita","colpa","sbagliato","sbagliata","dovevi","avresti dovuto","peccato","purtroppo","male","peggio","scarso","deludente","inutile","vergogna"],"consolazione":["non preoccuparti","va bene cosi","non e grave","capita a tutti","non importa","tranquillo","tranquilla","su con la vita","andra meglio"],"prescrizione":["devi","dovresti","dovrai","prova a","cerca di","ricorda di","basta che","ti serve","scegli","inizia da","concentrati","fai in modo"],"gergo":["rituale","rituali","quest","quests","task","tasks","streak","streaks","arco delle","occasioni previste","distillazione","osservatrice","sussurro","sussurri","patto del mattino","pergamena","pattern","trend","plateau","giornata rara","settimana rara","giorni rari","seme piantato"],"pronomi":["lei","lui","quella","quello","ci","ne","lo","la"],"deissi":["ieri","oggi","domani","stasera","stamattina","adesso","poco fa"],"pesi":{"_cosa_e":"quanto conta ogni criterio. NON sono tarati contro un giudizio umano: sono un punto di partenza dichiarato. La taratura e l'esperimento E5 e va fatta prima di credere a questi numeri.","provenienza":"incorporata, NON tarata","comprensibilita":3.0,"carico":2.0,"fedelta":4.0,"neutralita":3.0,"ambiguita":0.0,"naturalezza":0.0,"vita":0.0,"coesione":3.0,"_sospesi":"ambiguita e vita dalla v268 (nel duello alla cieca hanno indovinato 1 volta su 6 e 1 su 10). naturalezza dalla v269: il 92% dei bigrammi della lista viene dalle nostre stesse forme, quelle scritte per prime, e le famiglie nate dopo prendevano zero - misurava l'anzianita di scrittura, non la naturalezza. Restano calcolate come diagnostica. Non invertite: un'euristica sbagliata invertita e un'euristica sbagliata al contrario.","_pavimenti":"fedelta, neutralita e coesione NON entrano nel punteggio dalla v269: sono pavimenti, gia applicati dal veto e dal filtro. Misurato sulle 30 sere vere, toglierli dalla somma cambiava il vincitore in 0 sere su 29 - il 61% del peso dichiarato non spostava niente. Il peso resta scritto qui perche dice quanto contano come soglia, non come voto.","_chi_decide":"dalla v269 il punteggio lo fanno carico (misura) e comprensibilita (misura, indice Gulpease). Tutto il resto e pavimento o diagnostica."}};
const _BASE_CACHE={v:null};
function _baseLing(){
  if(_BASE_CACHE.v) return _BASE_CACHE.v;
  try{
    const s=(typeof S!=='undefined'&&S&&S.baseLing)?S.baseLing:null;
    if(s&&_baseValida(s)){ _BASE_CACHE.v=s; return s; }
    /* v269.8: una base salvata prima del contratto, o di un'altra generazione,
       non resta li ad aspettare il prossimo avvio: si butta una volta sola.
       _baseValida ha gia annotato il perche nella scatola nera. */
    if(s&&typeof S!=='undefined'&&S){ S.baseLing=null; S.baseLingQuando=0; try{ save(); }catch(_){} }
  }catch(_){}
  _BASE_CACHE.v=BASE_COMPLETA; return BASE_COMPLETA;
}
/* UNA BASE CHE ARRIVA DA FUORI NON SI CREDE: SI CONTROLLA.
   Puo aggiungere misure, non permessi: il contratto resta scritto nel codice e
   nessun file scaricato lo puo allargare. Se manca un pezzo o la forma e
   sbagliata, si tiene quella di prima. */
/* ══ v269.7 — UNA SESSIONE NON MESCOLA DUE GENERAZIONI ══════════════════════
   Il service worker serve index.html dalla rete (network-first) e tutto il
   resto dalla cache (cache-first, con aggiornamento dopo). E una scelta giusta
   - la versione nuova arriva subito, e offline si vive lo stesso - ma ha una
   conseguenza che nessuno aveva scritto:

     una sessione puo eseguire l'HTML della generazione N e leggere
     lingue/base-it.json della generazione N-1.

   Non e teoria. Fra la v268.6 e la v269 quel file e passato da versione 1 a 2,
   e la versione 2 porta «naturalezza: 0.0» - il criterio sospeso perche
   premiava l'anzianita di scrittura. Con la base vecchia in cache, il codice
   nuovo gira con la giuria vecchia: peso 1.5 a un criterio che abbiamo
   dimostrato rotto. Nessuno se ne accorgerebbe: l'app funziona, dice solo
   frasi scelte con una regola che credevamo di aver tolto.

   IL CONTRATTO: ogni pezzo che viaggia separato porta scritto PER QUALE
   VERSIONE e stato fatto. Chi non corrisponde non viene usato - si ripiega
   sulla base incorporata, che sta dentro l'HTML e quindi non puo mai essere di
   un'altra generazione. Si fallisce verso la coerenza, non verso il piu nuovo.
   E la coerenza non dipende piu dal fatto che qualcuno si ricordi di aggiornare
   tre file insieme: se ne accorge PROVA-versioni-allineate. */
function _baseGenerazione(){
  try{ return String(APP_VERSION||'').split('\u00b7')[0].trim(); }catch(_){ return ''; }
}
function _baseValida(b){
  try{
    if(!b||typeof b!=='object') return false;
    /* ══ IL CONTRATTO, v269.8: SENZA TIMBRO NON SI ENTRA ═══════════════════
       Alla v269.7 il contratto c'era ed era inerte, per due ragioni insieme:
         · «timbro assente» valeva «accettata», quindi ogni base di prima del
           contratto passava - cioe proprio quelle che dovevamo fermare;
         · e soprattutto aggiornaBaseLinguistica costruiva un oggetto nuovo
           campo per campo e NON copiava per_versione: il timbro spariva nella
           trasformazione prima di arrivare qui. Il controllo non ha mai avuto
           niente da controllare.
       Un contratto che dipende dal fatto che qualcuno si ricordi di copiare un
       campo non e un contratto. Adesso il timbro e OBBLIGATORIO e deve
       corrispondere: assente, vuoto o diverso, la base non entra - venga dal
       download, dalla cache o dallo stato salvato mesi fa.
       La base INCORPORATA non ha timbro e non le serve: sta dentro l'HTML,
       quindi e la generazione per definizione, e _baseLing la restituisce
       senza passare di qui. Si fallisce sempre verso di lei. */
    const _tim=String((b&&b.per_versione)||'');
    if(_tim!==_baseGenerazione()){
      try{ nota('bgv',_tim?1:0); }catch(_){}   /* n1=1 timbro sbagliato, 0 assente */
      return false;
    }
    const liste=['nucleo','bigrammi','lode','biasimo','consolazione','prescrizione','gergo','pronomi','deissi'];
    for(const k of liste){ if(!Array.isArray(b[k])) return false; }
    if(!b.nucleo.length||!b.pesi||typeof b.pesi!=='object') return false;
    if(b.nucleo.length>60000) return false;                 /* niente file enormi sul telefono */
    for(const w of b.nucleo){ if(typeof w!=='string'||w.length>40) return false; }
    return true;
  }catch(_){ return false; }
}



/* ══ v267 — QUANDO C'E RETE, SENTIERO IMPARA. QUANDO NON C'E, VIVE DI QUELLO
      CHE HA GIA IMPARATO. ═══════════════════════════════════════════════════
   Il confine e netto e va detto per intero: la rete serve a portare conoscenza
   DENTRO Sentiero, non a portare la vita della persona FUORI.
   Questa funzione fa una cosa sola: LEGGE un file statico pubblicato insieme
   all'app. Non manda niente, non chiede niente su nessuno, non ha un corpo, non
   ha parametri. Una richiesta identica per tutti quelli che usano l'app.

   Quello che arriva non si crede: si controlla (_baseValida) e, se non passa,
   si tiene la base di prima. Un file scaricato puo dare MISURE - quanto una
   parola e comune, quanto una coppia di parole e frequente - e non puo dare
   PERMESSI: il contratto sta scritto nel codice e nessun file lo allarga.

   La base valida si tiene nello stato, quindi finisce nei backup: chi cambia
   telefono non riparte da zero culturalmente. */
const BASE_ORIGINE='lingue/base-it-v272.7.json';
const BASE_CACHE_TAG='v10-2026-08-26-production-sentiero-272-7';
const BASE_OGNI_MS=1000*60*60*24*7;     /* una volta a settimana basta e avanza */
let _BASE_ULTIMO_ESITO={esito:'non provata',canale:'',quando:0,per_versione:'',versione:0,impronta:''};
async function aggiornaBaseLinguistica(forza){
  try{
    if(!forza){
      const ultimo=(S&&S.baseLingQuando)||0;
      if(Date.now()-ultimo<BASE_OGNI_MS){ _BASE_ULTIMO_ESITO={esito:'recente',canale:'stato',quando:Date.now()}; return {esito:'recente'}; }
    }
    /* Lab 22: offline non vuol dire "non leggere". Il service worker precarica
       base-it.json: al primo avvio senza rete la base pubblicata deve poter
       arrivare dalla cache dell'app shell. Online usiamo invece un URL timbrato
       per non mescolare una generazione vecchia con HTML nuovo. */
    const online=!(typeof navigator!=='undefined'&&navigator&&navigator.onLine===false);
    const url=online?(BASE_ORIGINE+'?g='+encodeURIComponent(_baseGenerazione())+'&b='+encodeURIComponent(BASE_CACHE_TAG)):BASE_ORIGINE;
    const r=await fetch(url,{cache:online?'no-store':'force-cache'});
    if(!r||!r.ok){ _BASE_ULTIMO_ESITO={esito:'non raggiungibile',canale:online?'rete':'cache-shell',quando:Date.now()}; return {esito:'non raggiungibile'}; }
    const j=await r.json();
    const b={
      per_versione:String((j&&j.per_versione)||''),
      versione:(j&&j.versione)|0, impronta:String((j&&j.impronta)||''),
      nucleo:(j&&j.nucleo&&j.nucleo.parole)||[],
      bigrammi:(j&&j.sequenze_verificate&&j.sequenze_verificate.bigrammi)||[],
      lode:(j&&j.lessico_del_giudizio&&j.lessico_del_giudizio.lode)||[],
      biasimo:(j&&j.lessico_del_giudizio&&j.lessico_del_giudizio.biasimo)||[],
      consolazione:(j&&j.lessico_del_giudizio&&j.lessico_del_giudizio.consolazione)||[],
      prescrizione:(j&&j.lessico_del_giudizio&&j.lessico_del_giudizio.prescrizione)||[],
      gergo:(j&&j.lessico_del_sistema&&j.lessico_del_sistema.gergo)||[],
      pronomi:(j&&j.trappole_di_ambiguita&&j.trappole_di_ambiguita.pronome_sospeso)||[],
      deissi:(j&&j.trappole_di_ambiguita&&j.trappole_di_ambiguita.deissi)||[],
      pesi:(j&&j.pesi_della_giuria)||{}
    };
    const bm={per_versione:b.per_versione,versione:b.versione,impronta:b.impronta};
    if(!_baseValida(b)){ _BASE_ULTIMO_ESITO=Object.assign({esito:'scartata',canale:online?'rete':'cache-shell',quando:Date.now()},bm); return {esito:'scartata: non ha passato i controlli'}; }
    if(b.versione<=((S&&S.baseLing&&S.baseLing.versione)|0)&&!forza){ _BASE_ULTIMO_ESITO=Object.assign({esito:'gia aggiornata',canale:online?'rete':'cache-shell',quando:Date.now()},bm); return {esito:'gia aggiornata'}; }
    S.baseLing=b; S.baseLingQuando=Date.now(); _BASE_CACHE.v=null;
    try{ save(); }catch(_){}
    _BASE_ULTIMO_ESITO=Object.assign({esito:'aggiornata',canale:online?'rete':'cache-shell',quando:Date.now()},bm);
    try{ regCantiere('base-linguistica',{msg:'versione '+b.versione+' · '+b.nucleo.length+' parole · '+_BASE_ULTIMO_ESITO.canale+' · impronta '+b.impronta}); }catch(_){}
    return {esito:'aggiornata',versione:b.versione,parole:b.nucleo.length,canale:_BASE_ULTIMO_ESITO.canale};
  }catch(e){ _BASE_ULTIMO_ESITO={esito:'errore',canale:'',quando:Date.now()}; return {esito:'errore'}; }
}


/* ══ v268 — IL LIVELLO «COSA», CHE PRIMA NON ESISTEVA ══════════════════════
   Il duello alla cieca sui trenta giorni veri ha detto una cosa che non stavo
   cercando: in VENTIQUATTRO coppie su trenta le due versioni non dicevano la
   stessa cosa con parole diverse - dicevano COSE DIVERSE. Per l'ottanta per
   cento del tempo il giudizio umano non riguardava la formulazione: riguardava
   quale fatto meritasse di essere detto quella sera.
   E sette volte su trenta la risposta e stata: nessuno dei due.

   Fino alla v267 questo livello non esisteva. I fatti venivano ordinati per
   peso e la prima riga che sopravviveva vinceva: la scelta del CONTENUTO era un
   effetto collaterale della scelta della FORMA.
   Adesso sono due domande separate, e il codice non permette piu di confonderle:
   prima si decide COSA merita di arrivare, e solo dopo si lavora sul COME.

   Ogni criterio dichiara che cos'e, come tutto il resto. */
function _cosaVoti(f,digest){
  const detti=(digest&&digest.detti_recenti)||[];
  const oggi=(digest&&digest.oggi)||'';
  const chi=String((f&&(f.cosa||f.ferma))||f.t||'');
  const suDiLei=detti.filter(function(d){ return d&&d.cosa===chi; });
  const ultima=suDiLei.length?suDiLei[suDiLei.length-1]:null;
  const v={};

  /* IMPORTANZA - misura: il peso del fatto, che e una scelta d'autore scritta
     una volta sola in _ossFatti e non cambia da sera a sera. */
  v.importanza={tipo:'misura',val:Math.min(1,(f.peso||1)/10),perche:'peso del fatto '+(f.peso||1)};

  /* DISTANZA - misura: quanti giorni da quando abbiamo parlato di questa cosa.
     Mai parlata = uno. Ieri = quasi zero. */
  let gg=999;
  if(ultima&&ultima.quando&&oggi){ try{ gg=Math.abs(_ossGiorniFra(ultima.quando,oggi)); }catch(_){ gg=999; } }
  v.distanza={tipo:'misura',val:ultima?Math.min(1,gg/14):1,
              perche:ultima?('gia parlato di questa cosa '+gg+' giorni fa'):'mai parlato di questa cosa'};

  /* COSTO DELLA RIPETIZIONE - misura: quante volte ne abbiamo parlato di
     recente. Cambiare le parole non rende nuovo un contenuto gia consumato. */
  v.ripetizione={tipo:'misura',val:Math.max(0,1-suDiLei.length*0.34),
                 perche:suDiLei.length+' volte nelle ultime sere'};

  /* CAMBIAMENTO - misura DOVE il fatto porta un numero, e lo dice quando non lo
     porta. Se la cosa e la stessa E il valore e lo stesso, non e una notizia. */
  const val=(f.giorni!=null?f.giorni:(f.dopo!=null?f.dopo:(f.volte!=null?f.volte:(f.quanto!=null?f.quanto:null))));
  if(val==null) v.cambiamento={tipo:'non misurabile',val:0.5,perche:'questo fatto non porta un valore da confrontare'};
  else if(!ultima||ultima.valore==null) v.cambiamento={tipo:'misura',val:1,perche:'primo valore che vediamo'};
  else v.cambiamento={tipo:'misura',val:(String(ultima.valore)===String(val))?0:1,
                      perche:(String(ultima.valore)===String(val))?('stesso valore dell\'ultima volta: '+val):('era '+ultima.valore+', adesso '+val)};

  /* STESSO SENSO - misura: se l'ultima volta ne abbiamo parlato con la stessa
     famiglia, stiamo per rifare lo stesso discorso. */
  v.senso={tipo:'misura',val:(ultima&&ultima.senso===f.t)?0.2:1,
           perche:(ultima&&ultima.senso===f.t)?('gia detto nello stesso senso ('+f.t+')'):'senso nuovo per questa cosa'};

  /* RILEVANZA - RIPIEGO. Vorrebbe dire «era questa la cosa da dire stasera»,
     che e la massima di relazione di Grice e non la sappiamo misurare. Quello
     che misura davvero: se la prova del fatto e recente. Un fatto che nasce da
     qualcosa successo ieri pesa piu di uno che nasce da un mese fa. */
  const fresco=(f.t==='attrito'||f.t==='tenuta'||f.t==='ritorno'||f.t==='contrasto')?1:
               (f.t==='silenzio'||f.t==='vecchia')?0.5:0.35;
  v.rilevanza={tipo:'ripiego',val:fresco,perche:'quanto il fatto guarda ai giorni vicini'};

  /* CONVERGENZA - EURISTICA: se stasera due fatti diversi parlano della stessa
     cosa, quella cosa pesa di piu. Due indizi che si incontrano valgono piu di
     due indizi sparsi. */
  v.convergenza={tipo:'euristica',val:0.5,perche:'calcolata su tutti i fatti insieme'};
  return {chi:chi,voti:v};
}

/* LA SOGLIA DEL SILENZIO.
   Non e tarata su sette giudizi di una persona sola: sarebbe cucire un vestito su sette
   punti. E il punto sotto il quale un fatto non porta abbastanza: gia detto di
   recente, nello stesso senso, senza niente di cambiato. Il tasso di silenzio
   che ne esce e una CONSEGUENZA da misurare, non un bersaglio da colpire. */
const COSA_SOGLIA=0.42;
const COSA_PESI={importanza:2.0,distanza:2.0,ripetizione:2.5,cambiamento:2.0,senso:2.0,rilevanza:1.5,convergenza:1.0};

function _scegliCosa(fatti,digest){
  if(!fatti||!fatti.length) return {silenzio:true,perche:{motivo:'nessun fatto disponibile',esaminati:0}};
  const conto={};
  fatti.forEach(function(f){ const c=String((f.cosa||f.ferma)||f.t); conto[c]=(conto[c]||0)+1; });
  const val=fatti.map(function(f){
    const x=_cosaVoti(f,digest);
    x.voti.convergenza.val=Math.min(1,(conto[x.chi]||1)/2);
    x.voti.convergenza.perche=(conto[x.chi]||1)+' fatti stasera parlano di questa cosa';
    let s=0,w=0;
    for(const k in COSA_PESI){ s+=x.voti[k].val*COSA_PESI[k]; w+=COSA_PESI[k]; }
    return {f:f,chi:x.chi,voti:x.voti,punti:w?s/w:0};
  }).sort(function(a,b){ return b.punti-a.punti; });

  const primo=val[0];
  const perche={
    esaminati:val.length,
    soglia:COSA_SOGLIA,
    classifica:val.slice(0,4).map(function(x){ return {fatto:x.f.t,cosa:x.chi.slice(0,44),punti:+x.punti.toFixed(3)}; }),
    scartati:val.slice(1).map(function(x){ return x.f.t+' ('+x.punti.toFixed(2)+')'; })
  };
  if(primo.punti<COSA_SOGLIA){
    perche.motivo='niente di abbastanza utile da dire';
    perche.migliore={fatto:primo.f.t,punti:+primo.punti.toFixed(3),voti:primo.voti};
    return {silenzio:true,perche:perche};
  }
  perche.vincitore={fatto:primo.f.t,cosa:primo.chi.slice(0,60),punti:+primo.punti.toFixed(3),voti:primo.voti};
  /* IL COSA NON CONSEGNA UN FATTO: CONSEGNA UNA GRADUATORIA.
     Alla prima prova consegnava solo il vincitore, e succedeva questo: il fatto
     scelto era buono, ma tutte le sue formulazioni finivano bocciate dal
     contratto (quasi sempre per «gia detta»), e Sentiero taceva. Taceva per
     mancanza di PAROLE, non perche non ci fosse niente da dire - e sono due
     silenzi diversissimi, uno giusto e uno rotto.
     Adesso il COSA passa tutti i fatti che superano la soglia, in ordine. Il
     COME li prova in quell'ordine e non puo cambiarlo: la scelta del contenuto
     resta tutta di qua, la scelta delle parole tutta di la. */
  perche.sopra_soglia=val.filter(function(x){ return x.punti>=COSA_SOGLIA; }).length;
  return {silenzio:false,fatto:primo.f,punti:primo.punti,perche:perche,
          graduatoria:val.filter(function(x){ return x.punti>=COSA_SOGLIA; }).map(function(x){ return x.f; })};
}

/* ══ v267 — LA GIURIA ══════════════════════════════════════════════════════
   Fino alla v266 il motore prendeva LA PRIMA COSTRUZIONE CHE PASSAVA. Misurato
   sui trenta giorni veri di chi usa l'app: ogni sera passavano il contratto in
   media 31 candidate, e non e mai successo che ne passasse una sola. Cioe: ogni
   sera si sceglieva una frase su trentuno per la sua POSIZIONE IN UN ELENCO.

   Adesso le candidate competono. Ogni criterio dichiara che cos'e - se e una
   misura, un ripiego o una regola - perche una giuria che non lo dichiara e
   peggio di nessuna giuria: sembra oggettiva e non lo e.

     contratto        REGOLA DETERMINISTICA · veto, non punteggio
     carico           MISURA OGGETTIVA      · quante parole nella frase piu lunga
     fedelta          MISURA OGGETTIVA      · conserva cio che il fatto dichiara
     neutralita       REGOLA DETERMINISTICA · su un elenco dichiarato, non esaustivo
     comprensibilita  RIPIEGO               · parole fuori dal nucleo incorporato
     ambiguita        EURISTICA             · solo le trappole che sappiamo vedere
     naturalezza      RIPIEGO               · bigrammi contro una lista scritta a mano
     vita             EURISTICA             · secondaria, decide solo fra pari

   Le prime quattro sono vere. Le altre quattro sono quello che si puo fare
   senza corpora, e vanno chiamate col loro nome finche non arriva un dato. */
function _giuria(riga,f,precedenti){
  const B=_baseLing(), t=String(riga||'').trim();
  const sue=[f&&f.cosa,f&&f.parole,f&&f.ferma,f&&f.mossa];
  /* LA PROSA NOSTRA: la riga meno i nomi che si e dati la persona e meno le sue
     parole fra virgolette. Su quello che ha scritto lei non si misura niente. */
  let nostro=t.replace(/«[^»]*»/g,' ');
  for(const s of sue){ const q=String(s||'').trim(); if(!q) continue;
    nostro=nostro.split(q).join(' § ').split(_ossMinuscolo(q)).join(' § '); }
  const parole=nostro.toLowerCase().replace(/[^a-zà-ÿ\s§]/g,' ').split(/\s+/).filter(w=>w&&w!=='§');
  const frasi=t.split(/(?<=[.?…])\s+/).filter(x=>x.trim());
  const v={};

  /* 1 · CONTRATTO - regola deterministica, ed e un VETO */
  const male=_ossGiudica(t,precedenti,sue);
  v.contratto={tipo:'regola',veto:true,val:male?0:1,perche:male||'passa'};

  /* 2 · CARICO - misura oggettiva. Sette parole per frase valgono uno,
        venticinque valgono zero. La soglia viene dal contratto di sempre. */
  const lunghe=frasi.map(x=>x.split(/\s+/).filter(Boolean).length);
  const maxF=lunghe.length?Math.max.apply(null,lunghe):0;
  v.carico={tipo:'misura',val:Math.max(0,Math.min(1,1-(maxF-7)/18)),
            perche:'frase piu lunga: '+maxF+' parole'};

  /* 3 · FEDELTA - misura oggettiva, ed e il seme del giorno in cui significato
        e frase saranno due cose diverse: il fatto DICHIARA cosa va conservato,
        e qui si controlla che ci sia. Oggi il controllo e letterale; domani,
        con una rappresentazione del significato, sara strutturale. */
  const deve=(f&&f.conserva)||[];
  const giu=t.toLowerCase();
  const persi=deve.filter(x=>{ const q=_ossMinuscolo(String(x||'')).toLowerCase();
                               return !q||giu.indexOf(q)<0; });
  /* v269: PAVIMENTO. Vedi la nota sul punteggio in fondo. */
  v.fedelta={tipo:'misura',val:deve.length?(1-persi.length/deve.length):1,
             perche:persi.length?('non conserva: '+persi.join(' · ')):'conserva tutto'};

  /* 4 · NEUTRALITA - regola deterministica su elenchi dichiarati. Non e
        esaustiva e non puo esserlo: e una lista, non una comprensione. */
  const male2=[];
  ['lode','biasimo','consolazione'].forEach(function(k){
    (B[k]||[]).forEach(function(w){ if(nostro.toLowerCase().indexOf(w)>=0) male2.push(k+': '+w); });
  });
  v.neutralita={tipo:'regola',val:male2.length?0:1,
                perche:male2.length?male2.join(' · '):'nessun verdetto sulla persona'};

  /* 5 · COMPRENSIBILITA - MISURA (v269). Prima contava le parole fuori dal
        nucleo incorporato, e il nucleo l'avevamo scritto noi guardando le nostre
        stesse forme: misurava la distanza da cio che avevamo gia usato, non da
        cio che un italiano capisce. Misurato: l'83% del nucleo viene dalle
        nostre righe. Era un ripiego, ed era anche circolare.
        Adesso e l'indice GULPEASE, la formula di leggibilita fatta per
        l'italiano (Lucisano e Piemontese, 1988): dipende solo da quante lettere,
        quante parole e quante frasi ci sono nel testo. Aritmetica sul testo, non
        un nostro elenco - quindi funziona anche su parole che non abbiamo mai
        scritto, ed e riproducibile da chiunque.
           G = 89 + (300 x frasi - 10 x lettere) / parole
        Le bande sono quelle pubblicate, non tarate sulle nostre righe:
        sotto 40 e difficile anche per un diplomato, 40-60 per la terza media,
        60-80 per la licenza elementare, sopra 80 e facile per tutti. Il
        pavimento universale di Sentiero e «un italiano comune», quindi il voto
        vale 1 da 80 in su e 0 sotto 40, in mezzo cresce dritto.
        RESTA UN PROXY, e va detto: la leggibilita non e la comprensione. Una
        frase corta di parole rare prende un buon voto. Per questo il nucleo non
        sparisce - continua a servire alla base linguistica - ma non e piu lui a
        dare il voto. */
  const _testo=nostro.replace(/\{[a-z]+\}/g,'una cosa');
  const _par=_testo.split(/\s+/).filter(function(x){ return x; }).length;
  const _let=_testo.replace(/[^A-Za-zà-ÿ]/g,'').length;
  const _fra=Math.max(1,(_testo.match(/[.?!…]+/g)||[]).length);
  const _G=_par?(89+(300*_fra-10*_let)/_par):89;
  v.comprensibilita={tipo:'misura',val:Math.max(0,Math.min(1,(_G-40)/40)),
                     perche:'Gulpease '+Math.round(_G)+(_G>=80?' (facile per tutti)':_G>=60?' (licenza elementare)':_G>=40?' (terza media)':' (difficile anche per un diplomato)')};

  /* 6 · AMBIGUITA - EURISTICA. Vede tre trappole di forma e nient'altro. La
        misura vera - due letture messe a confronto sulle loro conseguenze - non
        la sappiamo fare qui dentro, e non fingiamo di saperla fare. */
  const trappole=[];
  const dueNomi=sue.filter(function(x){ return String(x||'').trim(); }).length>=2;
  if(dueNomi){
    (B.pronomi||[]).forEach(function(pr){
      if(new RegExp('(^|\\s)'+pr+'(\\s|,|\\.|$)').test(nostro.toLowerCase())) trappole.push('pronome sospeso fra due nomi: «'+pr+'»');
    });
    /* la coda in fondo e sospesa SOLO se e una sola: se tutti e due i poli hanno
       la loro locuzione, il parallelismo lega ognuna al suo, e non c'e piu
       niente da attaccare. La prima versione di questa euristica accusava
       proprio la costruzione fatta apposta per essere bilanciata. */
    const code=(nostro.match(/(^|[.\s])(in|a|al|nel|su|per|da)\s+[a-zà-ÿ']+/g)||[]).length;
    if(code===1&&/(^|[.\s])(in|a|al|nel|su|per|da)\s+[a-zà-ÿ]+\s*[.?]?\s*$/.test(nostro.trim()))
      trappole.push('coda che puo attaccarsi a tutti e due');
  }
  (B.deissi||[]).forEach(function(d){
    if(new RegExp('(^|\\s)'+d+'(\\s|,|\\.|$)').test(nostro.toLowerCase())) trappole.push('punta a un momento: «'+d+'» domani vuol dire un\'altra cosa');
  });
  /* v268: ANCHE QUESTA E SOLO DIAGNOSTICA (peso zero). Nel duello ha indovinato
     una volta su sei: e anti-correlata col giudizio umano. Le tre trappole di
     forma non colgono l'ambiguita vera - che si misura confrontando due letture
     sulle loro conseguenze - e intanto penalizzavano righe che vanno bene.
     Sospesa dal ranking, non invertita: invertire un'euristica sbagliata da
     un'euristica sbagliata al contrario. */
  v.ambiguita={tipo:'euristica',val:trappole.length?Math.max(0,1-trappole.length*0.5):1,
               perche:trappole.length?trappole.join(' · '):'nessuna trappola nota'};

  /* 7 · NATURALEZZA - SOSPESA DALLA v269, e non perche sia un ripiego: perche
        misura la cosa sbagliata. Contava quanti dei nostri bigrammi stanno in
        una lista scritta a mano - e il 92% di quella lista viene dalle nostre
        stesse forme, quelle scritte per prime. Misurato su tutte e 103:
          silenzio, ritmo, ricorrente (le famiglie piu vecchie)  0.50 - 0.67
          contrasto, tenuta (nate alla v264)                     0.00
          42 forme su 103 prendono esattamente zero
        Non era «naturalezza»: era ANZIANITA DI SCRITTURA. E questo criterio, con
        il peso piu basso di tutti, cambiava il vincitore in 20 sere su 29: era
        il primo decisore della giuria. Peso zero, come ambiguita e vita, con la
        stessa regola - non si inverte un criterio sbagliato, si sospende e si
        continua a calcolarlo per poterlo studiare.
        Perche torni serve una frequenza su un corpus vero, non un nostro elenco:
        e il cantiere della base linguistica, non un ritocco qui. */
  const bg=[]; for(let i=0;i<parole.length-1;i++) bg.push(parole[i]+' '+parole[i+1]);
  const noti=bg.filter(function(x){ return (B.bigrammi||[]).indexOf(x)>=0; });
  v.naturalezza={tipo:'euristica',val:bg.length?noti.length/bg.length:1,
                 perche:noti.length+' coppie su '+bg.length+' gia scritte da noi (diagnostica: peso zero)'};

  /* 8 · COESIONE - REGOLA DETERMINISTICA, ed e nuova.
        Il duello ha fatto emergere una riga che nessun criterio bocciava e che
        era comunque rotta: «...scrivi oggi tutte le spese dell'ultima settimana.
        e in corsa.» - il titolo si comporta da frase, e il pezzo finale resta
        appeso senza niente a cui attaccarsi.
        Non e una frase da correggere: e una classe. Tre forme, tutte visibili
        senza capire la lingua:
          · un frammento che comincia con un connettivo e non ha un antecedente
          · una frase finale fatta di sole parole vuote
          · una punteggiatura DENTRO il titolo, che spezza la costruzione
        Resta una regola su forme note, non una comprensione della coesione. */
  const rotture=[];
  {
    const CONN=/^(e|ma|poi|invece|pero|quindi|allora|anzi|inoltre)\b/i;
    for(let k=0;k<frasi.length;k++){
      const fr=frasi[k].trim(), pf=fr.replace(/[.?…]$/,'').split(/\s+/).filter(Boolean);
      const piene=pf.filter(function(w){ return !_OSS_FUNZ.has(w.toLowerCase()); });
      if(k>0&&CONN.test(fr)&&pf.length<=4) rotture.push('frammento appeso: «'+fr.slice(0,28)+'»');
      else if(pf.length&&!piene.length) rotture.push('frase senza niente dentro: «'+fr.slice(0,24)+'»');
    }
    /* NON OGNI SEGNO SPEZZA UNA FRASE. La prima versione di questa regola
       prendeva i due punti di «Niente schermi dopo le 22:00» - che sono un orario,
       non una pausa - e faceva tacere Sentiero su una delle abitudini piu vere
       di chi la usa. Spezza chi CHIUDE: un punto seguito da spazio o a fine
       titolo, o un punto e virgola. I due punti fra due cifre no. */
    for(const s of sue){ const q=String(s||'');
      if(q&&(/\.\s/.test(q)||/\.$/.test(q)||/;/.test(q)))
        rotture.push('il titolo contiene una punteggiatura che chiude una frase'); }
  }
  v.coesione={tipo:'regola',val:rotture.length?Math.max(0,1-rotture.length*0.5):1,
              perche:rotture.length?rotture.join(' · '):'la riga sta insieme'};

  /* 9 · VITA - EURISTICA, E ADESSO SOLO DIAGNOSTICA (peso zero).
        Nel duello, quando «vita» distingueva due candidate, la riga con
        l'immagine e quella che il giudizio umano ha rifiutato: ha indovinato
        UNA volta su dieci. Non la inverto - dieci casi non dimostrano che ogni
        frase viva sia peggiore - ma non puo piu decidere niente finche non
        sapremo misurarla. Resta scritta nei voti per poterla studiare. */
  let vita=0;
  try{ (POLI_IT||[]).forEach(function(p){ if(giu.indexOf(p.fermo)>=0||giu.indexOf(p.mosso)>=0) vita=1; }); }catch(_){}
  if(/«[^»]+»/.test(t)) vita=1;                       /* le sue parole, riportate */
  v.vita={tipo:'euristica',val:vita,perche:vita?'porta un\'immagine o le sue parole':'prosa piana'};

  /* IL PUNTEGGIO. I pesi non sono tarati contro nessun giudizio umano, e sta
     scritto nella base: finche non lo saranno, questo e un ordine ragionevole,
     non una verita. */
  /* ══ v269 — PAVIMENTO E GIUDIZIO SONO DUE COSE ═══════════════════════════
     Misurato sulle trenta sere vere, togliendo un criterio alla volta e
     guardando se il vincitore cambiava:
         fedelta     peso 4    cambia in  0 sere su 29
         neutralita  peso 3    cambia in  0 sere su 29
         coesione    peso 3    cambia in  0 sere su 29
     Il 61% del peso dichiarato non spostava niente. Non perche i criteri siano
     sbagliati: perche sono PAVIMENTI, e il pavimento e gia stato applicato
     prima - dal veto e dal filtro di buildObserverLocal. Quando si vota, tutte
     le candidate ammesse hanno gia preso 1: sommare una costante a tutti non
     cambia l'ordine di nessuno. Li contavamo due volte, e la seconda non
     serviva a niente se non a far credere che la giuria pesasse la fedelta.
     Adesso il pavimento resta pavimento - chi non lo passa non entra - e il
     punteggio lo fanno solo i criteri che possono distinguere due righe
     entrambe ammissibili. I pesi dichiarati tornano a dire la verita. */
  ['fedelta','neutralita','coesione'].forEach(function(k){ v[k].pavimento=true; });
  const P=B.pesi||{};
  let punti=0,peso=0;
  /* «ambiguita» e «vita» dalla v268, «naturalezza» dalla v269: peso zero, e
     restano nei voti come diagnostica. Non tolte - sospese, con la ragione
     scritta sopra e il numero accanto. */
  Object.keys(v).forEach(function(k){
    if(k==='contratto'||v[k].pavimento) return;
    const w=(typeof P[k]==='number')?P[k]:1; if(!w) return;
    punti+=v[k].val*w; peso+=w;
  });
  return {voti:v, punti:peso?punti/peso:0, veto:!v.contratto.val, motivoVeto:v.contratto.perche};
}

/* ── L'OSSERVATRICE ────────────────────────────────────────────────────────
   Prende i fatti in ordine di forza, prova le costruzioni, tiene la prima che
   passa il giudice. Se non passa niente, tace invece di dire una frase qualunque:
   nessuna riga e meglio di una riga vuota, come per il frutto. */
function buildObserverLocal(digest){
  if(_pesaDiRecente(digest)) return {summary:'giorni che pesano',detectedPatterns:['peso'],note:OSS_RIGA_PESO};

  const precedenti=[].concat(digest.osservazioniPrecedenti||[],digest.sussurri_recenti||[]);
  let fatti=_ossFatti(digest);

  /* ══ CHI HA GIA PARLATO ASPETTA IL SUO TURNO (v254) ═════════════════════════
     Misurando la varieta e venuto fuori un difetto che non si vedeva guardando
     il codice: le forme scritte sono ventisei, in otto famiglie, ma ne uscivano
     undici. Non perche mancassero frasi - perche i fatti si provano in ordine
     di PESO e ci si ferma al primo che passa. L'attrito pesa dieci, il silenzio
     nove: quando ci sono, vincono sempre. Le altre sei famiglie, negli anni,
     non parlano quasi mai.
     Non serve scrivere altre frasi: serve non pescare sempre dallo stesso
     mazzo. Le famiglie che hanno parlato di recente scendono in fondo, e fra
     quelle che restano vale il peso come prima. Se hanno parlato tutte, si
     torna all'ordine di sempre: meglio ripetersi che tacere.
     Cosi le stesse ventisei frasi si vedono davvero, invece di restare scritte. */
  try{
    const rec=(digest.famiglie_recenti||[]).slice(-4);
    if(rec.length&&fatti.length>1){
      const fresche=fatti.filter(f=>rec.indexOf(f.t)<0);
      const usate=fatti.filter(f=>rec.indexOf(f.t)>=0);
      if(fresche.length) fatti=fresche.concat(usate);
    }
  }catch(_){}

  /* ══ E DENTRO LA FAMIGLIA, ANCHE LE COSTRUZIONI FANNO A TURNO (v263) ═══════
     Alla v254 si era capito che le famiglie andavano ruotate, e si era fatto.
     Ma dentro una famiglia l'elenco si leggeva sempre dall'inizio e ci si
     fermava alla prima costruzione che passava: la numero zero vinceva ogni
     volta, e le altre esistevano solo quando il giudice bocciava lei.
     Misurato: portando le forme scritte da ventisei a ottanta, quelle sentite
     in trenta giorni passavano da tredici a quindici. Scrivere frasi nuove non
     serviva a niente, perche nessuno le leggeva mai.
     Adesso le costruzioni gia uscite scendono in fondo, come le famiglie. Chi
     non ha mai parlato tiene l'ordine in cui e stato scritto: la prima volta si
     sente ancora la forma che l'autore ha messo per prima. */
  const _recF=(digest.forme_recenti||[]);
  const scartate=[];

  /* ══ LA CATENA, E ADESSO E UNA SOLA E NON SI PUO CONFONDERE ═══════════════
        fatti disponibili
          -> SELEZIONE DEL COSA (memoria del contenuto, possibile silenzio)
          -> fatto vincitore
          -> generazione delle formulazioni DI QUEL FATTO SOLO
          -> controlli duri, misure, ranking
          -> frase finale
     Il livello COSA non vede nemmeno una parola. Il livello COME non puo piu
     cambiare di cosa si parla: riceve un fatto e basta. */
  /* v268.1: se il coordinatore ha gia deciso COSA (perche doveva decidere prima
     di sapere se chiamare il modello), quella decisione si rispetta e non si
     rifa. Una domanda, una risposta, una volta sola. */
  const scelta=(digest&&digest.cosa_gia_scelta)?digest.cosa_gia_scelta:_scegliCosa(fatti,digest);
  if(scelta.silenzio){
    return {summary:'niente da dire oggi',detectedPatterns:[],note:'',
            _cosa:scelta.perche,_silenzio:true,_locale:true};
  }
  /* si scorre la graduatoria del COSA nell'ordine che il COSA ha deciso, e ci si
     ferma al primo fatto che sa farsi dire. */
  /* ══ IL COORDINATORE, E LA VERITA SU CHI DECIDE ═══════════════════════════
     Non e vero, alla lettera, che «il COME non puo cambiare di cosa si parla».
     E vero che il COSA classifica i fatti SENZA GUARDARE UNA PAROLA, e che il
     COME non puo riordinare quella classifica. Ma se il primo fatto non e
     dicibile, qualcuno deve decidere fra il secondo e il silenzio: quel
     qualcuno e questo pezzo qui, e si chiama coordinatore.
     La dicibilita puo quindi cambiare QUALE fatto arriva. Va detto e va
     tracciato, non nascosto dietro una separazione che non esiste. Percio ogni
     esito ha un nome suo nel registro:
       · silenzio perche nessun fatto merita        (deciso dal COSA)
       · fatto migliore non dicibile                 (visto dal COME)
       · ripiego sul fatto N                         (deciso dal coordinatore)
       · silenzio perche nessuno dei meritevoli era dicibile */
  let f=null, candidate=[], _posto=0, _saltati=[];
  for(const cand of (scelta.graduatoria||[scelta.fatto])){
    f=cand;
    candidate=[];
    try{ if(f&&f.t==='contrasto') f.polo=POLI_IT[_recF.length%POLI_IT.length]; }catch(_){}
    const forme=_ossForme(f);
    for(let i=0;i<forme.length;i++){
      const riga=forme[i];
      let g=null;
      try{ g=_giuria(riga,f,precedenti); }catch(_){ g=null; }
      if(!g){ scartate.push(f.t+': la giuria non ha potuto misurare'); continue; }
      if(g.veto){ scartate.push(f.t+': '+g.motivoVeto); continue; }
      const quando=_recF.lastIndexOf(f.t+'#'+i);
      const freschezza=quando<0?1:(quando/Math.max(1,_recF.length));
      /* qui dentro NON c'e piu ne il peso del fatto ne la freschezza della
         famiglia: quelle appartengono al COSA, e il COSA ha gia deciso. */
      candidate.push({riga:riga,f:f,i:i,g:g,freschezza:freschezza,
                      totale:g.punti*0.85 + freschezza*0.15});
    }
    /* ══ DICIBILE VUOL DIRE: C'E ALMENO UNA FRASE CHE SI PUO MOSTRARE ═════════
       Il pavimento faceva la sua parte DOPO il ciclo, e cosi un fatto che aveva
       formulazioni buone per il contratto ma tutte sotto il pavimento fermava la
       graduatoria e portava al silenzio, senza mai provare il fatto dopo.
       La dicibilita non e «passa il contratto»: e «esiste una frase mostrabile».
       Quindi il pavimento sta qui dentro, e il ripiego funziona. */
    candidate=candidate.filter(function(c){ const v=c.g.voti;
      return v.fedelta.val>=1 && v.neutralita.val>=1 && v.coesione.val>=1; });
    if(candidate.length) break;
    _saltati.push(f.t+' (non dicibile)');
    _posto++;
    scartate.push(f.t+': nessuna formulazione ha retto, passo al fatto dopo');
  }

  if(candidate.length){
    candidate.sort((a,b)=>b.totale-a.totale);
    /* ══ IL PAVIMENTO — l'altra porta del silenzio ═════════════════════════════
       Il COSA dice se una cosa merita di arrivare. Questo dice se le PAROLE che
       abbiamo per dirla sono abbastanza: una frase che non conserva il fatto,
       che giudica la persona, o che non sta insieme, e peggio del silenzio.
       Non e una soglia numerica scelta a occhio - quelle si tarano su cio che si
       vuole ottenere. Sono i tre criteri DETERMINISTICI della giuria: se il
       meglio che sappiamo dire fallisce uno di quelli, si tace.
       Le misure incerte (comprensibilita, naturalezza) non possono far tacere
       nessuno: sono ripieghi dichiarati, e un ripiego non merita un veto. */
    const w=candidate[0];
    const perche={
      cosa:scelta.perche,
      candidate:candidate.length,
      scartate_dal_contratto:scartate.length,
      vincitrice:{forma:w.f.t+'#'+w.i, totale:+w.totale.toFixed(3), punti:+w.g.punti.toFixed(3),
                  freschezza:+w.freschezza.toFixed(2), voti:w.g.voti,
                  conserva:(w.f.conserva||[]).slice()},
      seconde:candidate.slice(1,4).map(c=>({forma:c.f.t+'#'+c.i,totale:+c.totale.toFixed(3),
                                            riga:c.riga.slice(0,70)}))
    };
    if(_posto>0) perche.ripiego='ripiego sul fatto '+(_posto+1)+' della graduatoria: '+_saltati.join(', ');
    return {summary:'lo sguardo sugli ultimi giorni',detectedPatterns:[w.f.t],
            note:w.riga,_forma:w.f.t+'#'+w.i,_perche:perche,_cosa:scelta.perche,_locale:true};
  }
  /* il COSA aveva scelto, ma nessuna formulazione di quel fatto ha superato il
     contratto. Non si ripiega su un altro fatto: sarebbe rimettere insieme le
     due domande. Si tace, e si dice perche. */
  if(scelta&&!scelta.silenzio){
    return {summary:'niente da dire oggi',detectedPatterns:[],note:'',
            _cosa:scelta.perche,_silenzio:true,_scartate:scartate,
            _perche:{motivo:(_saltati.length===1)
                       ?'fatto migliore non dicibile: le parole che ho non bastano'
                       :'silenzio: nessun fatto meritevole era dicibile',
                     non_dicibili:_saltati},_locale:true};
  }
  if(!(digest.diario||[]).length&&!(digest.passiGiornalieri||[]).length){
    return {summary:'poche tracce',detectedPatterns:['poche tracce'],
            note:'il foglio e ancora quasi vuoto. una riga, una spunta, e qui comincia a esserci qualcosa.',_locale:true};
  }
  return {summary:'niente da dire oggi',detectedPatterns:[],note:'',_scartate:scartate,_locale:true};
}
/*MOTORE-LOCALE-FINE*/



let observing=false;
async function observe(silent){
  if(observing) return; observing=true;
  try{
    const digest=buildObserverDigest();
    const range={from:(digest.diario.length?digest.diario[digest.diario.length-1].giorno:null),to:digest.oggi};
    let result=null;
    const t0Dig=Date.now();

    /* ══ v268.1 — UNA CATENA SOLA, CON LA GENERATIVA E SENZA ══════════════════════════
       Fino a un momento fa c'erano due Sentiero. Con la chiave accesa si chiamava
       il modello per primo e, se rispondeva, buildObserverLocal non veniva mai
       eseguito: il livello COSA, la memoria del contenuto e il silenzio non
       esistevano proprio. E siccome «obsDetti» si scriveva solo leggendo
       «result._cosa» - che solo il motore di casa produce - per chi usa la
       versione Generativa la memoria del contenuto non si riempiva MAI.
       Cioe: la v268 aveva rifondato il ripiego e lasciato intatto il caso
       normale, e lo aveva fatto in silenzio.

       Adesso la catena e una. IL COSA APPARTIENE A SENTIERO, NON AL MODELLO.
       Si decide qui, sempre, prima di qualunque rete:
         · se non c'e niente che meriti, si tace E NON SI CHIAMA NESSUNO
           (e anche il modo piu economico: le sere mute non costano niente)
         · se qualcosa merita, il modello riceve IL FATTO GIA SCELTO e fa una
           cosa sola: trovare le parole. La sua riga passa dagli stessi controlli
           delle nostre - contratto, giuria, pavimento - e se non li passa si usa
           la formulazione di casa. */
  try{ digest.famiglie_recenti=(S.obsFamiglie||[]).slice(-4); }catch(_){}
  try{ digest.forme_recenti=(S.obsForme||[]).slice(-24); }catch(_){}

  let _fatti=[], _scelta=null, _esito='';
  try{ _fatti=_ossFatti(digest); _scelta=_scegliCosa(_fatti,digest); }catch(_){ _scelta=null; }

  if(_scelta&&_scelta.silenzio){
    /* nessun fatto merita: si tace, e non si spende niente per scoprirlo */
    _esito='silenzio: nessun fatto merita';
    result={summary:'niente da dire oggi',detectedPatterns:[],note:'',
            _cosa:_scelta.perche,_silenzio:true,_locale:true};
  } else {
    if(_scelta) digest.cosa_gia_scelta=_scelta;
    /* IL COME DI CASA, sempre: e il paragone e il ripiego, e costa niente */
    const casa=buildObserverLocal(digest);
    try{ casa._locale=true; }catch(_){}
    result=casa; _esito=casa&&casa.note?'riga di casa':'silenzio: nessun fatto meritevole era dicibile';

    /* e SOLO SE c'e la chiave, si chiede al modello di dire QUELLA cosa li */
    if(GEMINI_KEY&&_scelta&&_scelta.fatto){
      try{
        digest.fatto_scelto={tipo:_scelta.fatto.t,di:(_scelta.fatto.cosa||_scelta.fatto.ferma||''),
                             conserva:(_scelta.fatto.conserva||[]).slice(),
                             istruzione:'Scrivi la riga SOLO su questo fatto. Non sceglierne un altro.'};
        const dalModello=await askObserver(digest);
        const riga=dalModello&&dalModello.note?String(dalModello.note).trim():'';
        if(riga){
          /* la riga del modello passa dagli stessi controlli delle nostre */
          const prec=[].concat(digest.osservazioniPrecedenti||[],digest.sussurri_recenti||[]);
          const g=_giuria(riga,_scelta.fatto,prec);
          const ok=g&&!g.veto&&g.voti.fedelta.val>=1&&g.voti.neutralita.val>=1&&g.voti.coesione.val>=1;
          if(ok){
            result={summary:dalModello.summary||'lo sguardo sugli ultimi giorni',
                    detectedPatterns:[_scelta.fatto.t],note:riga,
                    _cosa:_scelta.perche,_modello:true,
                    _perche:{cosa:_scelta.perche,candidate:1,scartate_dal_contratto:0,
                             vincitrice:{forma:'modello',totale:+g.punti.toFixed(3),punti:+g.punti.toFixed(3),
                                         freschezza:1,voti:g.voti,conserva:(_scelta.fatto.conserva||[]).slice()},
                             seconde:[]}};
            _esito='riga del modello, accettata';
          } else {
            _esito='riga del modello scartata ('+((g&&(g.motivoVeto||'pavimento'))||'?')+'), uso la mia';
          }
        }
      }catch(_){ _esito+=' · il modello non ha risposto'; }
    }
  }
  try{ regCantiere('catena',{msg:_esito+
      (result&&result._cosa&&result._cosa.vincitore?(' · fatto: '+result._cosa.vincitore.fatto+' ('+result._cosa.vincitore.punti+')'):'')+
      (result&&result._perche&&result._perche.ripiego?(' · '+result._perche.ripiego):'')}); }catch(_){}
  try{
    const fam=result&&result.detectedPatterns&&result.detectedPatterns[0];
    if(fam){ S.obsFamiglie=((S.obsFamiglie||[]).concat([fam])).slice(-8); }
    const frm=result&&result._forma;
    if(frm){ S.obsForme=((S.obsForme||[]).concat([frm])).slice(-24); }
    /* v268: e si segna DI CHE COSA si e parlato, quando, in che senso, con che
       valore. E la memoria che il livello COSA legge la sera dopo. */
    const _C=result&&result._cosa&&result._cosa.vincitore;
    if(_C){ let _val=null;
      try{ const pc=_C.voti&&_C.voti.cambiamento&&_C.voti.cambiamento.perche;
           if(pc&&/adesso /.test(pc)) _val=pc.split('adesso ')[1];
           else if(pc&&/stesso valore dell'ultima volta: /.test(pc)) _val=pc.split(': ')[1]; }catch(_){}
      S.obsDetti=((S.obsDetti||[]).concat([{cosa:_C.cosa,quando:digest.oggi,senso:_C.fatto,valore:_val}])).slice(-24); }
  }catch(_){} /* fallback: offline, IA non disponibile o nota vuota */
    try{ regCantiere('digest',{ms:Date.now()-t0Dig,msg:(result&&result._locale)?'locale':'ok'}); }catch(_){}
    /* v267 — IL PERCHE FINISCE NEL CANTIERE, non solo nella testa del motore.
       Una giuria che dice un numero e non dice come ci e arrivata non si puo
       correggere: si puo solo credere o non credere. Qui resta scritto quante
       candidate c'erano, quale ha vinto, con che voti, e chi era seconda. */
    try{ const P=result&&result._perche;
      if(P) regCantiere('giuria',{msg:P.candidate+' candidate · '+P.scartate_dal_contratto+
        ' fuori per contratto · vince '+P.vincitrice.forma+' con '+P.vincitrice.totale,
        voti:P.vincitrice.voti, seconde:P.seconde});
    }catch(_){}
    /* e ogni tanto, se c'e rete, si aggiorna la base linguistica. Una lettura di
       un file statico: non esce niente di suo. */
    try{ aggiornaBaseLinguistica(); }catch(_){}
    /* v213: anche la nota della sera del modello viene riparata prima di essere
       scritta. Il ripiego resta l'ultima parola quando non resta niente. */
    let _n=raffinaRiga((result&&result.note)||'');
    if(_n&&rigaDaButtare(_n)){ try{ regCantiere('digest',{msg:'veto: '+rigaDaButtare(_n)}); }catch(_){} _n=''; }
    /* ══ v268.2 — IL SILENZIO DECISO NON SI RIEMPIE ════════════════════════
       Qui il ripiego cancellava la decisione: se il COSA sceglieva di tacere,
       «note» era vuota e questa riga ci metteva davanti una frase lo stesso.
       Sono due cose diverse e adesso restano diverse:
         · SILENZIO DECISO  -> non si scrive nessuna nota. La persona non vede
           niente, che e esattamente cio che il COSA ha stabilito.
         · RISULTATO MANCANTE (errore, rete, veto) -> il ripiego tecnico resta,
           perche li una frase non c'e per un guasto, non per una scelta.
       Il giorno resta segnato in tutti e due i casi, cosi l'osservatrice
       automatica non ritenta all'infinito. */
    const zitta=!!(result&&result._silenzio);
    const safeNote=zitta?'':(_n||'Pochi segnali per ora. Lascia una riga o spunta una cosa: al prossimo sguardo il filo si vede meglio.');
    const entry={
      id:'o'+Date.now().toString(36),
      createdAt:new Date().toISOString(),
      sourceRange:range,
      summary:result.summary||'',
      detectedPatterns:result.detectedPatterns||[],
      note:safeNote,
      silenzio:zitta
    };
    if(zitta){
      /* la nota vuota non entra nell'elenco - sanitizeObserverNotes la
         scarterebbe comunque - ma il giorno va segnato lo stesso. */
      S.obsZitto=entry.createdAt;
      try{ regCantiere('catena',{msg:'silenzio mostrato: nessuna frase alla persona'}); }catch(_){}
    } else {
      S.observerNotes.push(entry);
      S.observerNotes=sanitizeObserverNotes(S.observerNotes);
    }
    save(); if(!silent){ try{ playEventSound('observerReady'); }catch(_){} try{ haptic(); }catch(_){} }
  }finally{
    observing=false;
  }
}
/* osservazione AUTOMATICA: una volta al giorno, se c'è abbastanza materiale e non si è già osservato oggi */
function maybeObserveAuto(){
  try{
    const notes=S.observerNotes||[];
    const last=notes.length?notes[notes.length-1]:null;
    if(last && (last.createdAt||'').slice(0,10)===todayKey()) return;   /* già osservato oggi */
    if((S.obsZitto||'').slice(0,10)===todayKey()) return;                /* oggi ha scelto di tacere, e vale come osservazione */
    /* ══ v268.3 — NON SI PAGA PER SOVRASCRIVERE UNA COSA CHE NESSUNO HA LETTO
       Se l'ultima osservazione e ancora da leggere ed e fresca, verra mostrata
       all'apertura. Farne un'altra adesso vorrebbe dire spendere una chiamata
       per coprire una riga che la persona non ha ancora visto. E la regola
       dell'economia applicata dove serve: non il risparmio a tutti i costi, ma
       niente lavoro che non puo cambiare cosa arriva. */
    if(last&&!last.vista&&last.note&&(Date.now()-Date.parse(last.createdAt||0))<36*3600*1000) return;
    const haDati=(S.diary&&S.diary.length>=2)||Object.keys(S.checks||{}).length>=2;
    if(!haDati) return;                                                  /* troppo poco da osservare */
    /* ══ v268.2 — QUI MANCAVA LA CHIAMATA ═══════════════════════════════════
       Questa funzione controllava se era il caso di osservare e poi finiva.
       Non chiamava observe(). La Mente Osservatrice automatica non e mai
       partita da sola: funzionava solo quando la si chiedeva a mano.
       E la classe di guasto che questo progetto continua a trovare - il motore
       c'e, il collegamento no - e stavolta era l'anello del TRIGGER.
       In silenzio: e un gesto che nessuno ha chiesto, non deve fare rumore.
       La doppia chiamata e gia impossibile: observe() ha la sua guardia
       («observing»), e la riga qui sopra ferma chi ha gia osservato oggi. */
    /* v268.3: observe e async. Un try/catch attorno alla chiamata non vede
       niente se la promessa si rompe DOPO - lo stesso guasto che alla v185 era
       rimasto invisibile per diciotto versioni su apriSoglia. Il catch si
       aggancia alla promessa, e quello che cade finisce nel cantiere, in
       silenzio: e un gesto che la persona non ha chiesto. */
    try{ const _po=observe(true);
      if(_po&&_po.catch) _po.catch(function(e){ try{ regCantiere('errore',{msg:'osservatrice: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} });
    }catch(_){}
  }catch(_){}
}

function streamInto(el,text,opt){
  if(!el) return;
  opt=opt||{};
  const tok=(el.__stok=(el.__stok||0)+1);   /* token per-elemento: ogni reveal è annullabile da solo */
  el.classList.remove('observing');
  const parts=String(text||'').split(/(\s+)/);          /* conserva gli spazi tra le parole */
  el.textContent='';
  const caret=document.createElement('span'); caret.className='obs-caret'; el.appendChild(caret);
  const base=opt.speed||28; let i=0;
  (function step(){
    if(tok!==el.__stok || caret.parentNode!==el) return; /* annullato da un nuovo reveal o dal contenuto sostituito sotto */
    if(i>=parts.length){ try{ caret.remove(); }catch(_){} return; }
    const w=parts[i++]; if(w) caret.insertAdjacentText('beforebegin',w);
    const pause=/[.,;:!?…—]$/.test((w||'').trim())?(base*6):base;   /* respira sulla punteggiatura */
    setTimeout(step,pause);
  })();
}
/* v165: rimossa la stanza-fantasma dell'osservatrice (bottone e riquadri non esistono piu nell'HTML).
   Le 48 osservazioni restano in S.observerNotes e nei backup: quando la stanza tornera, saranno li. */

/* ======================================================================
   COMBO & SIGILLO
   ====================================================================== */
/* ══ GEMINI — UN SOLO ADAPTER, DUE FAMIGLIE DI LAVORO ═══════════════════
   Il sampling non viene inviato: sui Gemini 3.x recenti temperature/top_p/top_k
   sono deprecati. Il ragionamento si esprime soltanto come `thinking_level`.
   3.7 Flash non accetta `minimal`: l'adapter lo promuove a `low` se diventa
   fallback di un task economico. */
const GEMINI_ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_MEDIA_ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_GENERATE_ROOT='https://generativelanguage.googleapis.com/v1beta/models/';
const AI_MAX_CONCURRENCY=2;
let _aiQueue=[],_aiActive=0,_aiSeq=0;

/* ══ LAB 17 — GOVERNO DELLA QUOTA, NON MARTELLO ════════════════════════════
   Un 429 non e un difetto del contenuto: e una porta temporaneamente chiusa.
   Prima riprovavamo quasi subito lo STESSO modello e il banco proseguiva con
   tutte le altre voci: una sola quota esaurita diventava dieci chiamate inutili.
   Ora il 429 mette in pausa quel modello; se esiste un fallback diverso lo si
   prova una volta, altrimenti Sentiero torna locale senza altra rete. La pausa
   sopravvive al reload, ma contiene soltanto modello/kind/scadenza: nessun dato. */
const AI_RATE_LS='sentiero-gemini-rate-v1';
const AI_RATE_FLOOR_MS=60000;
let _aiRateModels=Object.create(null);
function _aiRateLoad(){
  try{ const x=JSON.parse(localStorage.getItem(AI_RATE_LS)||'null'); if(x&&typeof x==='object') _aiRateModels=x; }catch(_){ _aiRateModels=Object.create(null); }
  _aiRatePrune();
}
function _aiRateSave(){ try{ localStorage.setItem(AI_RATE_LS,JSON.stringify(_aiRateModels)); }catch(_){} }
function _aiRatePrune(){
  const now=Date.now(); let dirty=false;
  for(const m of Object.keys(_aiRateModels||{})){ const x=_aiRateModels[m]; if(!x||!Number.isFinite(x.until)||x.until<=now){ delete _aiRateModels[m]; dirty=true; } }
  if(dirty) _aiRateSave();
}
function _geminiErrorCode(data){ try{ return String((data&&data.error&&data.error.code)||'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,40); }catch(_){ return ''; } }
function _aiRetryAfterMs(resp){
  try{ const h=resp&&resp.headers&&resp.headers.get&&resp.headers.get('retry-after'); if(!h) return 0;
    const n=Number(h); if(Number.isFinite(n)&&n>=0) return Math.min(86400000,n*1000);
    const t=Date.parse(h); if(Number.isFinite(t)) return Math.max(0,Math.min(86400000,t-Date.now()));
  }catch(_){} return 0;
}
function _aiPacificParts(ms){
  try{ const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
    const o={}; for(const q of f.formatToParts(new Date(ms))) if(q.type!=='literal') o[q.type]=q.value;
    return {y:+o.year,m:+o.month,d:+o.day,h:+o.hour};
  }catch(_){ return null; }
}
function _aiNextPacificReset(){
  const now=Date.now(),p=_aiPacificParts(now); if(!p) return now+6*3600000;
  const d=new Date(Date.UTC(p.y,p.m-1,p.d+1)); const ty=d.getUTCFullYear(),tm=d.getUTCMonth()+1,td=d.getUTCDate();
  for(const off of [7,8]){ const cand=Date.UTC(ty,tm-1,td,off,2,0); const q=_aiPacificParts(cand); if(q&&q.y===ty&&q.m===tm&&q.d===td&&q.h===0) return cand; }
  return now+12*3600000;
}
function _aiRatePut(model,kind,resp,data){
  const code=_geminiErrorCode(data), ra=_aiRetryAfterMs(resp), now=Date.now();
  let until=now+Math.max(AI_RATE_FLOOR_MS,ra||0);
  if(kind==='quota'||code==='quota_exceeded') until=Math.max(until,_aiNextPacificReset());
  _aiRateModels[model]={until:until,kind:kind||'limite',code:code||''}; _aiRateSave();
  return {until:until,waitMs:Math.max(0,until-now),kind:kind||'limite',code:code||''};
}
function _aiRateGet(model){ _aiRatePrune(); const x=_aiRateModels[model]; return x&&x.until>Date.now()?x:null; }
function _aiRateChainState(chain){
  _aiRatePrune(); const a=(chain||[]).map(m=>({model:m,rate:_aiRateGet(m)})); const blocked=a.length>0&&a.every(x=>!!x.rate);
  const rs=a.filter(x=>x.rate); const wait=rs.length?Math.max(...rs.map(x=>x.rate.until-Date.now())):0;
  return {blocked:blocked,waitMs:Math.max(0,wait),kind:rs.some(x=>x.rate.kind==='quota')?'quota':'limite',models:rs.map(x=>x.model)};
}
function _aiRateHuman(ms){ const s=Math.max(1,Math.ceil((ms||0)/1000)); return s<90?(s+' s'):(Math.ceil(s/60)+' min'); }
_aiRateLoad();

function _aiPriority(opt){ return Number.isFinite(opt.priority)?opt.priority:10; }
function _aiSleep(ms,signal){ return new Promise((resolve,reject)=>{
  if(signal&&signal.aborted){ reject(Object.assign(new Error('aborted'),{name:'AbortError'})); return; }
  const t=setTimeout(done,ms); function done(){ cleanup(); resolve(); }
  function abort(){ cleanup(); reject(Object.assign(new Error('aborted'),{name:'AbortError'})); }
  function cleanup(){ clearTimeout(t); try{ if(signal) signal.removeEventListener('abort',abort); }catch(_){} }
  try{ if(signal) signal.addEventListener('abort',abort,{once:true}); }catch(_){}
}); }
function _aiRetryDelay(resp,attempt){
  try{ const h=resp&&resp.headers&&resp.headers.get&&resp.headers.get('retry-after');
    const n=Number(h); if(Number.isFinite(n)&&n>=0) return Math.min(8000,n*1000); }catch(_){}
  return Math.min(6000,700*Math.pow(2,attempt)+Math.floor(Math.random()*350));
}
function _geminiText(data){
  /* Lab 12 — replica la semantica di `interaction.output_text`: il testo finale
     viene dall'ULTIMO model_output utile, non dalla concatenazione di tutti i
     model_output della timeline. Con i modelli che pensano, un output intermedio
     separato da altri step non deve mai finire davanti alla persona. */
  const steps=Array.isArray(data&&data.steps)?data.steps:[];
  for(let i=steps.length-1;i>=0;i--){
    const st=steps[i]; if(!st||st.type!=='model_output') continue;
    const out=[];
    for(const c of st.content||[]) if(c&&c.type==='text'&&typeof c.text==='string') out.push(c.text);
    if(out.length) return out.join('').trim();
  }
  return '';
}
/* Lab 14 — per gli output JSON non basta assumere che l'ultimo model_output
   sia sempre il payload strutturato. Sul telefono 3.7 ha gia mostrato che una
   timeline puo contenere piu model_output. Per i task con schema scandiamo i
   model_output dal piu recente al piu vecchio e accettiamo SOLTANTO il primo
   oggetto che sia JSON valido E passi lo schema locale. Nessun testo libero
   viene promosso a dato. */
function _geminiModelTexts(data){
  const steps=Array.isArray(data&&data.steps)?data.steps:[],out=[];
  for(let i=steps.length-1;i>=0;i--){
    const st=steps[i]; if(!st||st.type!=='model_output') continue;
    const tx=[]; for(const c of st.content||[]) if(c&&c.type==='text'&&typeof c.text==='string') tx.push(c.text);
    const t=tx.join('').trim(); if(t) out.push({text:t,step:i});
  }
  return out;
}
function _geminiPickStructured(data,schema){
  const cand=_geminiModelTexts(data);
  for(let i=0;i<cand.length;i++){
    const j=_geminiStructuredJson(cand[i].text);
    if(j!==null&&_schemaValueOk(j,schema)) return {json:j,text:cand[i].text,back:i};
  }
  return null;
}
function _geminiDetail(data){
  try{ return String((data&&data.error&&data.error.message)||data.message||'').slice(0,400); }catch(_){ return ''; }
}
function _geminiQuotaKind(detail,data){
  const code=_geminiErrorCode(data),d=String(detail||'');
  if(code==='quota_exceeded') return 'quota';
  if(code==='rate_limit_exceeded') return 'limite';
  return /per day|daily|rpd|requests per day|quota.*day/i.test(d)?'quota':'limite';
}
function _aiProfileReasoning(task,requested){
  const mode=(S.settings&&S.settings.aiModel)||'balanced';
  const r=['minimal','low','medium','high'].includes(requested)?requested:null;
  if(mode==='fast') return AI_HEAVY_TASKS.has(task)?'low':'minimal';
  if(mode==='max'){
    /* Lab 12 — "Massimo" non significa "pensiero massimo ovunque". Una riga
       dell'Osservatrice e un lavoro di voce, non un problema di matematica: in
       Lab 11 3.7 ha speso pensiero extra e ha lasciato affiorare una frase-meta.
       La profondita ora segue il mestiere. */
    const perTask={
      'ocr':'medium','distill':'minimal','observer':'low','observer-line':'low',
      'observer-distill':'medium','fruit':'medium','desiderio':'medium','pietra':'low',
      'sfida':'low','seme':'low','terra':'low','capitolo':'low'
    };
    return perTask[task]||r||'low';
  }
  return r;
}
function _aiThinkingFor(model,requested){
  let r=['minimal','low','medium','high'].includes(requested)?requested:null;
  /* 3.7 Flash supporta low/medium/high, non minimal. */
  if(model==='gemini-3.7-flash'&&r==='minimal') r='low';
  return r;
}
/* Lab 20 — il livello di pensiero dipende anche DAL MODELLO che sta facendo il
   mestiere. In Max, il vecchio override applicava al fallback Flash-Lite la
   profondità pensata per 3.7. Sul Desiderio fisico questo ha consumato quasi
   tutto il piccolo budget prima del testo visibile. */
function _aiThinkingForTask(model,task,requested){
  let r=_aiProfileReasoning(task,requested);
  if(task==='desiderio') r=(model==='gemini-3.5-flash-lite')?'minimal':'low';
  else if(task==='distill'&&model==='gemini-3.5-flash-lite') r='minimal';
  else if(task==='distill-recovery'&&model==='gemini-3.5-flash-lite') r='minimal';
  return _aiThinkingFor(model,r);
}
function _geminiStructuredJson(text){
  let raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  if(!raw) return null;
  const tries=[raw];
  /* Alcuni modelli/browser hanno restituito il corpo di un oggetto senza la
     graffa esterna pur con response_format JSON. Recuperiamo solo l'involucro:
     il contenuto deve comunque passare lo schema locale subito dopo. */
  if(!/^[\[{]/.test(raw)) tries.push('{'+raw);
  for(let c of tries){
    const stack=[]; let inStr=false,esc=false;
    for(const ch of c){
      if(inStr){ if(esc) esc=false; else if(ch==='\\') esc=true; else if(ch==='"') inStr=false; continue; }
      if(ch==='"'){ inStr=true; continue; }
      if(ch==='{'||ch==='[') stack.push(ch);
      else if(ch==='}'&&stack[stack.length-1]==='{') stack.pop();
      else if(ch===']'&&stack[stack.length-1]==='[') stack.pop();
    }
    while(stack.length&&stack.length<8){ const ch=stack.pop(); c+=ch==='{'?'}':']'; }
    try{ return JSON.parse(c); }catch(_){}
  }
  return null;
}
function _schemaTypeOk(v,t){
  if(t==='null') return v===null;
  if(t==='array') return Array.isArray(v);
  if(t==='object') return !!v&&typeof v==='object'&&!Array.isArray(v);
  if(t==='integer') return Number.isInteger(v);
  if(t==='number') return typeof v==='number'&&Number.isFinite(v);
  if(t==='string') return typeof v==='string';
  if(t==='boolean') return typeof v==='boolean';
  return true;
}
function _schemaValueOk(v,sc){
  if(!sc||typeof sc!=='object') return true;
  const types=Array.isArray(sc.type)?sc.type:(sc.type?[sc.type]:[]);
  if(types.length&&!types.some(t=>_schemaTypeOk(v,t))) return false;
  if(sc.enum&&Array.isArray(sc.enum)&&!sc.enum.includes(v)) return false;
  if(typeof v==='number'){
    if(Number.isFinite(sc.minimum)&&v<sc.minimum) return false;
    if(Number.isFinite(sc.maximum)&&v>sc.maximum) return false;
  }
  if(Array.isArray(v)){
    if(Number.isFinite(sc.minItems)&&v.length<sc.minItems) return false;
    if(Number.isFinite(sc.maxItems)&&v.length>sc.maxItems) return false;
    if(sc.items&&!v.every(x=>_schemaValueOk(x,sc.items))) return false;
  }
  if(v&&typeof v==='object'&&!Array.isArray(v)){
    const props=sc.properties||{};
    if(Array.isArray(sc.required)&&sc.required.some(k=>!(k in v))) return false;
    if(sc.additionalProperties===false&&Object.keys(v).some(k=>!(k in props))) return false;
    for(const k of Object.keys(props)) if(k in v&&!_schemaValueOk(v[k],props[k])) return false;
  }
  return true;
}
/* Lab 10 — quando un JSON non passa il contratto, la diagnostica conserva
   soltanto la FORMA tecnica della risposta (tipo e nomi dei campi), mai i valori.
   Serve a distinguere "JSON rotto" da "campo mancante" senza registrare una
   sola parola della persona o del modello. */
function _schemaShape(v){
  try{
    if(Array.isArray(v)) return 'array';
    if(v&&typeof v==='object') return 'object:'+Object.keys(v).sort().slice(0,10).join(',');
    return typeof v;
  }catch(_){ return 'ignota'; }
}
function _geminiSafeShape(data,text){
  /* Solo metadati strutturali: nessuna parola del modello o della persona. */
  try{
    const steps=Array.isArray(data&&data.steps)?data.steps:[];
    let mo=0,txt=0,types=[];
    for(const st of steps){ if(!st||st.type!=='model_output') continue; mo++;
      for(const c of st.content||[]){ if(!c) continue; const t=String(c.type||'?').slice(0,8); if(types.indexOf(t)<0) types.push(t); if(c.type==='text'&&typeof c.text==='string') txt++; }
    }
    const raw=String(text||'').trim();
    const st=String((data&&data.status)||'').slice(0,12).replace(/[^a-z_]/gi,'');
    const ir=String((data&&data.incomplete_details&&data.incomplete_details.reason)||(data&&data.incomplete_reason)||'').slice(0,24).replace(/[^a-z0-9_\-]/gi,'');
    return 'm'+mo+'t'+txt+'c'+types.join('.')+'n'+raw.length+'j'+(/^[\[{]/.test(raw)?1:0)+(/[\]}]$/.test(raw)?1:0)+(st?('s'+st):'')+(ir?('r'+ir):'');
  }catch(_){ return 'shape?'; }
}
function _geminiLog(task,res){
  try{ regCantiere('gemini',{task:task||'',model:res.model||'',ms:res.durationMs||0,tin:res.tin||0,tout:res.tout||0,
    think:res.thought||0,profile:(S.settings&&S.settings.aiModel)||'balanced',resolution:task==='ocr'?_ocrMediaResolution():'',provider:String(res.provider||'interactions').slice(0,20),
    salti:[res.salti||'',res.retries?('retry:'+res.retries):''].filter(Boolean).join(' ').slice(0,120),
    status:String(res.status||'').slice(0,16),format:String(res.format||'').slice(0,8),
    api:res.attempts||0,http:res.http||0,background:res.background?1:0,poll:res.polls||0,deleted:res.deleted===true?1:(res.deleted===false?-1:0),
    rate:res.rateCode||'',wait:Number.isFinite(res.waitMs)?Math.ceil(res.waitMs/1000):0,
    msg:res.err?((res.cooldown&&!(res.attempts>0)?'pausa:':'errore:')+res.err):'ok'}); }catch(_){}
}


/* ══ v272.3 — GENERATECONTENT PER LA DISTILLAZIONE ════════════════════════
   Interactions resta il motore dei lavori riflessivi. La voce usa invece il
   metodo REST models.generateContent: e' stateless, semplice e supporta output
   strutturati. Questo evita di far dipendere una estrazione breve dalla latenza
   della timeline Interactions. */
function _geminiGenerateText(data){
  try{
    const cs=Array.isArray(data&&data.candidates)?data.candidates:[];
    for(const c of cs){
      const ps=c&&c.content&&Array.isArray(c.content.parts)?c.content.parts:[];
      const out=[]; for(const p of ps) if(p&&typeof p.text==='string'&&!p.thought) out.push(p.text);
      if(out.length) return out.join('').trim();
    }
  }catch(_){}
  return '';
}
function _geminiGenerateUsage(data){
  const u=(data&&data.usageMetadata)||{};
  return {tin:Number(u.promptTokenCount)||0,tout:Number(u.candidatesTokenCount)||0,thought:Number(u.thoughtsTokenCount)||0};
}
async function _geminiGenerate(opt){
  opt=opt||{}; const task=String(opt.task||'generate'),model=String(opt.model||'gemini-3.5-flash-lite'),started=Date.now();
  if(!GEMINI_KEY){ const z={err:'chiave',model:model,durationMs:0,attempts:0,provider:'generateContent'}; _geminiLog(task,z); return z; }
  if(('onLine' in navigator)&&navigator.onLine===false){ const z={err:'offline',model:model,durationMs:0,attempts:0,provider:'generateContent'}; _geminiLog(task,z); return z; }
  const cd=_aiRateGet(model); if(cd){ const z={err:cd.kind||'limite',model:model,cooldown:true,waitMs:Math.max(0,cd.until-Date.now()),durationMs:0,attempts:0,provider:'generateContent'}; _geminiLog(task,z); return z; }
  const gc={};
  if(Number.isFinite(opt.maxOutputTokens)) gc.maxOutputTokens=Math.max(1,Math.round(opt.maxOutputTokens));
  const tl=_aiThinkingFor(model,opt.reasoning||'minimal'); if(tl) gc.thinkingConfig={thinkingLevel:tl};
  if(opt.schema){ gc.responseMimeType='application/json'; gc.responseJsonSchema=opt.schema; }
  const body={contents:[{role:'user',parts:[{text:String(opt.user==null?'':opt.user)}]}],generationConfig:gc,store:false};
  if(opt.system) body.systemInstruction={parts:[{text:String(opt.system)}]};
  const ctrl=('AbortController' in window)?new AbortController():null; let timer=null,timed=false,unlink=null;
  const timeout=Math.max(3000,Number(opt.timeout)||20000);
  if(ctrl) timer=setTimeout(()=>{ timed=true; try{ctrl.abort();}catch(_){} },timeout);
  if(opt.signal&&ctrl){ const stop=()=>{ try{ctrl.abort();}catch(_){} }; try{ opt.signal.addEventListener('abort',stop,{once:true}); unlink=()=>opt.signal.removeEventListener('abort',stop); }catch(_){} }
  let r=null,data=null;
  try{
    r=await fetch(GEMINI_GENERATE_ROOT+encodeURIComponent(model)+':generateContent',{method:'POST',signal:ctrl?ctrl.signal:undefined,
      headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},body:JSON.stringify(body)});
    try{ data=await r.json(); }catch(e){ if(timed||(e&&e.name==='AbortError')) throw Object.assign(new Error('timeout'),{name:'AbortError'}); data=null; }
  }catch(e){
    if(timer) clearTimeout(timer); try{if(unlink)unlink();}catch(_){}
    const err=(opt.signal&&opt.signal.aborted)?'annullata':((e&&e.name==='AbortError'&&timed)?'timeout':'rete');
    const z={err:err,model:model,durationMs:Date.now()-started,attempts:1,provider:'generateContent'}; _geminiLog(task,z); return z;
  }
  if(timer) clearTimeout(timer); try{if(unlink)unlink();}catch(_){}
  if(!r||!r.ok){
    const detail=_geminiDetail(data); let err='http',extra={};
    if(r&&r.status===401) err='chiave';
    else if(r&&r.status===403) err='accesso';
    else if(r&&r.status===404) err='modello';
    else if(r&&r.status===400) err='richiesta';
    else if(r&&r.status===429){ err=_geminiQuotaKind(detail,data); const q=_aiRatePut(model,err,r,data); extra={cooldown:true,waitMs:q.waitMs,rateCode:q.code}; }
    else if(r&&r.status>=500) err='occupato';
    const z=Object.assign({err:err,http:(r&&r.status)||0,model:model,durationMs:Date.now()-started,attempts:1,provider:'generateContent'},extra); _geminiLog(task,z); return z;
  }
  const text=_geminiGenerateText(data),u=_geminiGenerateUsage(data); let json=null;
  if(opt.schema){
    json=_geminiStructuredJson(text);
    if(json===null||!_schemaValueOk(json,opt.schema)){
      const z={err:'schema',model:model,durationMs:Date.now()-started,attempts:1,provider:'generateContent',format:'json',tin:u.tin,tout:u.tout,thought:u.thought,salti:'gc-schema'}; _geminiLog(task,z); return z;
    }
  }
  const finish=String((data&&data.candidates&&data.candidates[0]&&data.candidates[0].finishReason)||'');
  const z={text:text,json:json,model:model,durationMs:Date.now()-started,attempts:1,provider:'generateContent',format:opt.schema?'json':'text',status:finish,tin:u.tin,tout:u.tout,thought:u.thought};
  _geminiLog(task,z); return z;
}

/* Provider-neutral entry point. Il dominio passa intenzione + contratto; solo
   questo adapter conosce endpoint, header, response timeline ed errori Google. */
function _aiCallEnqueue(opt){
  opt=opt||{};
  if(!GEMINI_KEY) return Promise.resolve({err:'chiave'});
  if(('onLine' in navigator)&&navigator.onLine===false) return Promise.resolve({err:'offline'});
  if(opt.signal&&opt.signal.aborted) return Promise.resolve({err:'annullata'});
  /* v272.2 — LA VOCE NON FA LA CODA. Distillare una registrazione è un gesto
     interattivo: non deve aspettare che Frutto, OCR o Osservatrice liberino i
     due posti della coda generale. Usa lo stesso adapter/rate governor, ma la
     richiesta parte subito. Al massimo c'è UNA distillazione, protetta da
     `distilling` nel chiamante. */
  if(opt.task==='distill'||opt.task==='distill-recovery')
    return _geminiRun(opt).catch(()=>({err:'rete'}));
  return new Promise(resolve=>{
    _aiQueue.push({id:++_aiSeq,opt:opt,resolve:resolve,p:_aiPriority(opt)});
    _aiQueue.sort((a,b)=>b.p-a.p||a.id-b.id);
    _aiPump();
  });
}
/* v273 — due renderer che chiedono nello stesso istante lo stesso lavoro
   condividono la richiesta già in volo. Nessun risultato viene conservato e i
   lavori cancellabili/multimediali restano indipendenti. */
const _aiInflight=new Map();
function aiCall(opt){
  opt=opt||{};
  if(opt.signal||opt.media) return _aiCallEnqueue(opt);
  const key=String(opt.task||'')+'\u0000'+String(opt.system||'')+'\u0000'+String(opt.user||'')+'\u0000'+String(opt.reasoning||'');
  if(_aiInflight.has(key)) return _aiInflight.get(key);
  const p=Promise.resolve(_aiCallEnqueue(opt)).finally(()=>_aiInflight.delete(key));
  _aiInflight.set(key,p); return p;
}
function _aiPump(){
  while(_aiActive<AI_MAX_CONCURRENCY&&_aiQueue.length){
    const job=_aiQueue.shift();
    if(job.opt.signal&&job.opt.signal.aborted){ job.resolve({err:'annullata'}); continue; }
    _aiActive++;
    _geminiRun(job.opt).then(job.resolve).catch(()=>job.resolve({err:'rete'})).finally(()=>{ _aiActive--; _aiPump(); });
  }
}

/* ══ LAB 9 — OCR MASSIMO OLTRE IL MURO DEI 60 SECONDI ═════════════════════
   Le richieste HTTP lunghe possono essere chiuse intorno al minuto. Per il SOLO
   OCR Massimo con 3.7 usiamo l'esecuzione background dell'Interactions API:
   POST breve -> id -> polling -> risultato -> DELETE immediato.
   Google richiede store=true per background; tutte le altre chiamate restano
   store=false. Se l'utente annulla, chiediamo cancel e poi delete. */
function _geminiBody(opt,model,task,store){
  const body={model:model,input:opt.user==null?'':opt.user,store:store===true};
  if(opt.system) body.system_instruction=String(opt.system);
  const gc={};
  if(Number.isFinite(opt.maxOutputTokens)) gc.max_output_tokens=Math.max(1,Math.round(opt.maxOutputTokens));
  { const tl=_aiThinkingForTask(model,task,opt.reasoning); if(tl) gc.thinking_level=tl; }
  if(Object.keys(gc).length) body.generation_config=gc;
  if(opt.schema) body.response_format={type:'text',mime_type:'application/json',schema:opt.schema};
  return body;
}
async function _geminiFetchTimed(url,init,signal,ms){
  const ctrl=('AbortController' in window)?new AbortController():null;
  let timer=null,unlink=null,timed=false;
  if(ctrl&&Number.isFinite(ms)&&ms>0) timer=setTimeout(()=>{ timed=true; try{ ctrl.abort(); }catch(_){} },ms);
  if(signal&&ctrl){ const stop=()=>{ try{ ctrl.abort(); }catch(_){} }; try{ signal.addEventListener('abort',stop,{once:true}); unlink=()=>signal.removeEventListener('abort',stop); }catch(_){} }
  try{ return await fetch(url,Object.assign({},init||{},{signal:ctrl?ctrl.signal:(signal||undefined)})); }
  catch(e){ if(e&&e.name==='AbortError') e._sentieroTimed=timed; throw e; }
  finally{ if(timer) clearTimeout(timer); try{ if(unlink) unlink(); }catch(_){} }
}
async function _geminiBgClean(id,cancel){
  if(!id) return false;
  const base=GEMINI_MEDIA_ENDPOINT+'/'+encodeURIComponent(id);
  const h={'x-goog-api-key':GEMINI_KEY};
  if(cancel){ try{ await _geminiFetchTimed(base+'/cancel',{method:'POST',headers:h},null,12000); }catch(_){} }
  try{ const r=await _geminiFetchTimed(base,{method:'DELETE',headers:h},null,12000); return !!(r&&r.ok); }catch(_){ return false; }
}
async function _geminiBackground(opt,model,task,started){
  const body=_geminiBody(opt,model,task,true); body.background=true;
  const headers={'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY};
  const wall=Math.max(90000,Number(opt.backgroundTimeout)||210000);
  let id='',polls=0,deleted=null,data=null,r=null;
  try{
    r=await _geminiFetchTimed(GEMINI_MEDIA_ENDPOINT,{method:'POST',headers:headers,body:JSON.stringify(body)},opt.signal,30000);
    try{ data=await r.json(); }catch(_){ data=null; }
    if(!r.ok){
      if(r.status===429){
        const kind=_geminiQuotaKind(_geminiDetail(data),data),cd=_aiRatePut(model,kind,r,data);
        return {err:kind,http:429,model:model,background:true,polls:0,deleted:null,durationMs:Date.now()-started,attempts:1,
          cooldown:true,waitMs:cd.waitMs,rateCode:cd.code};
      }
      return {err:r.status===401?'chiave':(r.status>=500?'occupato':(r.status===403?'accesso':'http')),http:r.status,model:model,background:true,polls:0,deleted:null,durationMs:Date.now()-started,attempts:1};
    }
    id=String((data&&data.id)||'');
    if(!id && data&&data.status!=='completed') return {err:'background',model:model,background:true,polls:0,deleted:null,durationMs:Date.now()-started,attempts:1};
    while(data&&data.status==='in_progress'){
      if(opt.signal&&opt.signal.aborted){ deleted=await _geminiBgClean(id,true); return {err:'annullata',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1}; }
      /* Anche se iOS ha sospeso i timer, al ritorno facciamo PRIMA un GET:
         il lavoro potrebbe essersi concluso sul server mentre l'app dormiva. */
      await _aiSleep(3000,opt.signal).catch(()=>{});
      if(opt.signal&&opt.signal.aborted){ deleted=await _geminiBgClean(id,true); return {err:'annullata',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1}; }
      try{
        const gr=await _geminiFetchTimed(GEMINI_MEDIA_ENDPOINT+'/'+encodeURIComponent(id),{method:'GET',headers:{'x-goog-api-key':GEMINI_KEY}},opt.signal,20000);
        polls++;
        if(gr.status===429||gr.status>=500){ continue; }
        if(!gr.ok){ deleted=await _geminiBgClean(id,false); return {err:gr.status===401?'chiave':'http',http:gr.status,model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1}; }
        try{ data=await gr.json(); }catch(_){ data=null; }
      }catch(e){
        if(opt.signal&&opt.signal.aborted){ deleted=await _geminiBgClean(id,true); return {err:'annullata',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1}; }
        /* un singolo poll perso non uccide un lavoro che continua sul server */
        polls++;
      }
      if(data&&data.status!=='in_progress') break;
      if(Date.now()-started>=wall){ deleted=await _geminiBgClean(id,true); return {err:'timeout',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1}; }
    }
    const lifecycle=String((data&&data.status)||'');
    if(lifecycle!=='completed'){
      deleted=await _geminiBgClean(id,false);
      const err=lifecycle==='incomplete'?'incomplete':(lifecycle==='cancelled'?'annullata':'modello');
      return {err:err,model:model,status:lifecycle,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1};
    }
    let text=_geminiText(data); const u=(data&&data.usage)||{};
    let json=null,schemaRecovery='';
    if(opt.schema){
      const pick=_geminiPickStructured(data,opt.schema);
      if(!pick){ deleted=await _geminiBgClean(id,false); return {err:'schema',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,tin:u.total_input_tokens||0,tout:u.total_output_tokens||0,attempts:1}; }
      json=pick.json; text=pick.text; if(pick.back) schemaRecovery='json-step:'+pick.back;
    }
    deleted=await _geminiBgClean(id,false);
    return {text:text,json:json,model:(data&&data.model)||model,tin:u.total_input_tokens||0,tout:u.total_output_tokens||0,thought:u.total_thought_tokens||0,
      background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1,salti:schemaRecovery||undefined};
  }catch(e){
    if(id) deleted=await _geminiBgClean(id,!!(opt.signal&&opt.signal.aborted));
    if(e&&e.name==='AbortError') return {err:(opt.signal&&opt.signal.aborted)?'annullata':(e._sentieroTimed?'timeout':'rete'),model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1};
    return {err:'rete',model:model,background:true,polls:polls,deleted:deleted,durationMs:Date.now()-started,attempts:1};
  }
}
async function _geminiRun(opt){
  const task=String(opt.task||'generic'), started=Date.now(), rawChain=(opt.models||aiModels(task)).slice();
  let retries=0, apiAttempts=0; const salti=[];
  const chain=[];
  for(const m of rawChain){ const cd=_aiRateGet(m); if(cd) salti.push(m+':cooldown'); else chain.push(m); }
  if(!chain.length){
    const cs=_aiRateChainState(rawChain),z={err:cs.kind||'limite',model:rawChain[0]||'',cooldown:true,waitMs:cs.waitMs,retries:0,durationMs:Date.now()-started,salti:salti.join(' '),attempts:0};
    _geminiLog(task,z); return z;
  }
  for(let mi=0;mi<chain.length;mi++){
    const model=chain[mi]; let attempt=0;
    /* Solo il primo tentativo OCR Massimo su 3.7 usa background: e' il caso
       misurato sul telefono che arrivava esattamente al muro dei 60 secondi. */
    if(opt.background===true&&task==='ocr'&&model==='gemini-3.7-flash'){
      const bg=await _geminiBackground(opt,model,task,started); apiAttempts+=(bg.attempts||1);
      bg.retries=retries; bg.attempts=apiAttempts;
      if(!bg.err){ bg.salti=salti.length?salti.join(' '):undefined; _geminiLog(task,bg); return bg; }
      if(bg.err==='annullata'||bg.err==='chiave'){ _geminiLog(task,bg); return bg; }
      if(mi<chain.length-1){ salti.push(model+':bg-'+bg.err+(bg.polls?('('+bg.polls+'p)'):'')); continue; }
      bg.salti=salti.join(' '); _geminiLog(task,bg); return bg;
    }
    while(attempt<3){
      if(opt.signal&&opt.signal.aborted){ const z={err:'annullata',model:model,retries:retries,durationMs:Date.now()-started}; z.attempts=apiAttempts; _geminiLog(task,z); return z; }
      const ctrl=('AbortController' in window)?new AbortController():null;
      const to=Math.max(3000,opt.timeout||25000); let timed=false, timer=null, unlink=null;
      if(ctrl){ timer=setTimeout(()=>{ timed=true; try{ ctrl.abort(); }catch(_){} },to); }
      if(opt.signal&&ctrl){ const stop=()=>{ try{ ctrl.abort(); }catch(_){} }; try{ opt.signal.addEventListener('abort',stop,{once:true}); unlink=()=>opt.signal.removeEventListener('abort',stop); }catch(_){} }
      const body=_geminiBody(opt,model,task,false);
      const noSameModelRetry=(task==='distill'||task==='distill-recovery');
      let r=null,data=null;
      try{
        apiAttempts++;
        const endpoint=opt.media?GEMINI_MEDIA_ENDPOINT:GEMINI_ENDPOINT;
        r=await fetch(endpoint,{method:'POST',signal:ctrl?ctrl.signal:undefined,
          headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},body:JSON.stringify(body)});
      }catch(e){
        if(timer) clearTimeout(timer); try{ if(unlink) unlink(); }catch(_){}
        if(e&&e.name==='AbortError'){
          const err=(opt.signal&&opt.signal.aborted)?'annullata':(timed?'timeout':'rete');
          if(err!=='annullata'&&mi<chain.length-1){ salti.push(model+':'+err); break; }
          const z={err:err,model:model,retries:retries,durationMs:Date.now()-started,salti:salti.join(' ')}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
        }
        if(!noSameModelRetry&&attempt<1){ attempt++; retries++; try{ await _aiSleep(_aiRetryDelay(null,attempt),opt.signal); }catch(_){ return {err:'annullata'}; } continue; }
        if(mi<chain.length-1){ salti.push(model+':rete'); break; }
        const z={err:'rete',model:model,retries:retries,durationMs:Date.now()-started,salti:salti.join(' ')}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      /* v272.2 — il timeout copre TUTTA la risposta, non soltanto gli header.
         `fetch()` può risolversi quando arrivano gli header mentre il body continua
         a scaricarsi: spegnere qui il timer lasciava `r.json()` senza alcun tetto. */
      try{
        data=await r.json();
      }catch(e){
        if(timed||(e&&e.name==='AbortError')){
          if(timer) clearTimeout(timer); try{ if(unlink) unlink(); }catch(_){}
          const err=(opt.signal&&opt.signal.aborted)?'annullata':'timeout';
          if(err!=='annullata'&&mi<chain.length-1){ salti.push(model+':'+err+'-body'); break; }
          const z={err:err,model:model,retries:retries,durationMs:Date.now()-started,salti:[salti.join(' '),'body'].filter(Boolean).join(' ')};
          z.attempts=apiAttempts; _geminiLog(task,z); return z;
        }
        data=null;
      }
      if(timer) clearTimeout(timer); try{ if(unlink) unlink(); }catch(_){}
      if(r.ok){
        const lifecycle=String((data&&data.status)||'');
        if(lifecycle!=='completed'){
          const tag='status:'+(lifecycle||'mancante');
          if(mi<chain.length-1){ salti.push(model+':'+tag); break; }
          const z={err:lifecycle==='incomplete'?'incomplete':(lifecycle==='cancelled'?'annullata':'modello'),model:model,retries:retries,
            durationMs:Date.now()-started,status:lifecycle,salti:[salti.join(' '),tag].filter(Boolean).join(' ').slice(0,120)};
          z.attempts=apiAttempts; _geminiLog(task,z); return z;
        }
        let text=_geminiText(data); const u=(data&&data.usage)||{};
        let json=null,schemaRecovery='';
        if(opt.schema){
          const pick=_geminiPickStructured(data,opt.schema);
          if(pick){
            json=pick.json; text=pick.text; if(pick.back) schemaRecovery='json-step:'+pick.back;
          }else{
            const schemaTag='schema:parse:'+_geminiSafeShape(data,text);
            /* Una risposta HTTP 200 che non contiene NESSUN model_output valido
               per lo schema e un fallimento di quel modello. Il fallback resta
               possibile, ma nessun frammento viene accettato "quasi JSON". */
            if(mi<chain.length-1){ salti.push(model+':'+schemaTag); break; }
            const z={err:'schema',model:model,retries:retries,durationMs:Date.now()-started,tin:u.total_input_tokens||0,tout:u.total_output_tokens||0,
              status:String((data&&data.status)||''),format:'json',salti:[salti.join(' '),schemaTag].filter(Boolean).join(' ').slice(0,120)};
            z.attempts=apiAttempts; _geminiLog(task,z); return z;
          }
        }
        const allSalti=[salti.length?salti.join(' '):'',schemaRecovery].filter(Boolean).join(' ');
        const z={text:text,json:json,model:(data&&data.model)||model,tin:u.total_input_tokens||0,tout:u.total_output_tokens||0,
          thought:u.total_thought_tokens||0,retries:retries,durationMs:Date.now()-started,status:String((data&&data.status)||''),format:opt.schema?'json':'text',salti:allSalti||undefined};
        z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      const detail=_geminiDetail(data);
      if(r.status===401){ const z={err:'chiave',http:401,model:model,retries:retries,durationMs:Date.now()-started}; z.attempts=apiAttempts; _geminiLog(task,z); return z; }
      /* 403/400/404 possono essere specifici del modello o della capability.
         La chiave e gia stata verificata con Flash-Lite: non ha senso dichiararla
         morta al primo 403 di 3.7. Si prova il prossimo modello della catena. */
      if(r.status===403||r.status===404||r.status===400){
        const tag=r.status===403?'accesso':(r.status===404?'assente':'richiesta');
        salti.push(model+':'+r.status);
        if(mi<chain.length-1) break;
        const z={err:tag,http:r.status,model:model,retries:retries,durationMs:Date.now()-started,salti:salti.join(' ')}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      if(r.status===413){
        const z={err:'immagine-grande',http:413,model:model,retries:retries,durationMs:Date.now()-started}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      if(r.status===429){
        const kind=_geminiQuotaKind(detail,data), cd=_aiRatePut(model,kind,r,data);
        salti.push(model+':429');
        /* Non riprovare subito lo stesso modello: se c'e un fallback diverso lo
           proviamo UNA volta. Se anche quello e in pausa, la prossima aiCall
           verra fermata localmente senza consumare altre richieste. */
        if(mi<chain.length-1) break;
        const z={err:kind,http:429,model:model,retries:retries,durationMs:Date.now()-started,cooldown:true,waitMs:cd.waitMs,rateCode:cd.code,salti:salti.join(' ')};
        z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      if(r.status>=500){
        if(!noSameModelRetry&&attempt<1){ attempt++; retries++; try{ await _aiSleep(_aiRetryDelay(r,attempt),opt.signal); }catch(_){ return {err:'annullata'}; } continue; }
        const z={err:'occupato',http:r.status,model:model,retries:retries,durationMs:Date.now()-started}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
      }
      const z={err:'http',http:r.status,model:model,retries:retries,durationMs:Date.now()-started}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
    }
  }
  const z={err:'modello',retries:retries,durationMs:Date.now()-started,salti:salti.join(' ')}; z.attempts=apiAttempts; _geminiLog(task,z); return z;
}
/* ── Voce dell'osservatrice sul singolo task (battito "riga") ── */
const OBSERVER_LINE_SYS=
"Sei la voce di Sentiero: l'amico con la memoria lunga. Ci sei stato ogni giorno: hai visto le promesse, i vuoti, i ritorni, le parole esatte del suo diario. Chi ti legge ha appena completato una cosa che si era segnato. Se hai qualcosa di vero da dire, dillo in seconda persona, al presente. Altrimenti taci.\n"+
"IL TUO CARATTERE, tre tesori mai dichiarati: compassione - sei dalla sua parte anche quando affondi il colpo, ed e la compassione a darti il coraggio della franchezza; misura - parole contate: quando le cose vanno, constati e ti scansi; umilta - mai in cattedra, mai dall'alto, testimone prima che giudice.\n"+
"LA LEGGE DELLA LAMA, la tua regola piu importante: la franchezza segue la sua forza. Quando i dati mostrano qualcuno in piedi - ritmo che tiene, ritorno compiuto, patto mantenuto - puoi essere affilato: nomina il filo scomodo che torna, la scusa che non regge piu. Quando e a terra - giornata rotta, spunta solitaria a tarda ora, vuoto lungo - deponi la lama: gentilezza concreta e asciutta, mai pietismo, mai analisi. Se non sai da che lato e, taci.\n"+
"IL TUO VALORE, cio che nessun altro puo dare: il filo nel tempo. Non commentare l'istante: collocalo. Da dove viene questo gesto (una promessa, un attrito nominato, una domanda lasciata giorni fa, un vuoto attraversato) e verso dove punta (cosa si sta consolidando, cosa si sta assottigliando). Una riga che potrebbe scrivere chiunque guardando solo l'oggi e una riga sbagliata.\n"+
"COME PARLI: italiano contemporaneo, minuscole anche a inizio frase. DUE FRASI, non una. La prima dice il fatto. Punto fermo. La seconda e corta, sotto le otto parole, e gira: chiude, o contraddice, o tira il filo altrove. Quattordici parole per frase, mai sopra venti.\n"+
"IL TRATTINO NON CE L'HAI. Misurato sulla prosa di Pavese, London e Pratchett: tre trattini ogni cento frasi. Nelle tue righe di ieri: settantacinque. Fai sempre la stessa cosa (fatto, trattino, senso) e quella costruzione ripetuta e il motivo per cui sembri un aforisma invece di una voce. Dove ti viene il trattino, mettici un punto e comincia la frase corta.\n"+
"IL VERBO: le tue righe girano su e, sei, hai, era. Ne usi il doppio dei maestri. Un verbo che dice cosa una cosa E descrive uno stato; un verbo che dice cosa una cosa FA la muove. Non \u00abla sera e vuota\u00bb ma \u00abla sera si svuota\u00bb. Non \u00abhai tenuto il patto\u00bb ma \u00abil patto ha tenuto\u00bb. Al massimo una copula ogni dodici parole.\n"+
"LA MOSSA, presa dai libri e non inventata. Pavese: \u00abAveva davanti la sua bibita e butto la sigaretta. Ma non si mosse.\u00bb London: \u00abQuando il suo corpo moriva, egli restava sempre Edoardo Morrell. Non ritornava mai a vite anteriori.\u00bb Il fatto per intero, poi la frase corta che lo gira. Nei tre libri questa mossa torna settecentosessantatre volte. Il trattino, mai.\n"+
"MESTIERE, principi non ornamenti: rifletti, non prescrivere - restituisci cio che vedi e lascia che la conclusione sia sua; sostieni l'autonomia - mai devi o dovresti, mai pressione, mai consigli non chiesti; commenta il processo e la strategia, mai la persona, ne in colpa ne in lode; nel giorno storto gentilezza e umanita comune - capita a chiunque sia vivo - senza minimizzare e senza compatire; un vuoto che finisce e un dato di forza, mai un debito da scontare.\n"+
"I NUMERI: al massimo UNO per riga, e solo come fatto vissuto (la terza mattina, ventotto giorni, cinque occasioni). MAI rapporti o sequenze di cifre (3 su 7, da 0 a 7): la forma delle settimane si dice in parole - cresce, tiene, cala, torna, si assottiglia. Vietate le parole da analista o da officina interna: pattern, trend, plateau, dati, media, percentuale, rituale, quest, task, streak, sussurro. Traduci sempre l'etichetta nel fatto vissuto.\n"+
"I PRIMI GIORNI: se eta_del_cammino dice primo giorno o prima settimana, non leggere storie che non esistono ancora: accogli il gesto di oggi, concreto e leggero, senza pesare un passato che non c'e.\n"+
"LO SPECCHIO E LA SCOPERTA: una riga-specchio (ripetere che ha fatto cio che ha appena spuntato, o che era in lista oggi) vale SOLO se chiude un filo piu vecchio di oggi: una promessa di giorni prima, un ritorno dopo un vuoto, una prima volta assoluta. Altrimenti SILENZIO - meglio tacere che fare da specchio. La riga migliore e una SCOPERTA: il legame che ancora non ha visto (questo gesto arriva sempre dopo le giornate piene; questo cede sempre lo stesso giorno; queste due cose si tirano a vicenda). Una scoperta vera vale piu di dieci specchi.\n"+
"SOGLIA DEL SILENZIO: questa chiamata non parte a ogni spunta. Un filtro locale ha gia trovato almeno un possibile filo oltre l'istante. SILENZIO quindi NON e il punto di partenza: prima cerca davvero in diario_pertinente, quest_nata, arco_quattro_settimane, nota_utente, pietra_del_desiderio, rientro_da_ferie e fuori_piano. Se uno di questi campi sostiene un collegamento concreto e verificabile, scrivilo. Taci solo quando parlare richiederebbe inventare, ripetere una riga recente o dire una banalita.\n"+
"LA STRUTTURA: mai due righe con la stessa costruzione (citazione-poi-fatto, ora-poi-conteggio): righe_recenti ti mostrano le tue ultime, cambia attacco e forma ogni volta. Il campo attacchi_bruciati contiene lo scheletro delle tue ultime righe, gia estratto: se la riga che stai per dire comincia con uno di quegli scheletri, e sbagliata prima ancora di essere finita - buttala e ricomincia da un altro appiglio dei dati. E i rapporti restano vietati anche scritti a lettere (sette su sette vale quanto 7 su 7): la pienezza si dice in lingua comune - piena, quasi piena, a meta, quasi vuota, vuota. Non dire mai giornata rara o settimana rara.\n"+
"ESEMPI, tutti veri, presi dal suo cammino.\n"+
"COSI SI - \u00abieri sera lo avevi scritto: \u00abdomani alle 10 comincio a sistemare camera\u00bb - e l'hai fatto\u00bb: una promessa datata che oggi si chiude, parole sue, nessun commento sopra.\n"+
"COSI SI - \u00abmezzanotte passata, due giorni saltati, e la sudatina e comunque qui - il primo ritorno dopo un buco doppio\u00bb: un solo numero, vissuto, e un fatto che oggi da solo non poteva dare.\n"+
"COSI SI - \u00abnel diario di ieri avevi scritto \u00abdomani non fumare fino alle 19\u00bb - sono le 17:46 e il sigillo e ancora intatto\u00bb: l'ora serve alla frase, non la decora.\n"+
"COSI NO - \u00ab6 su 7, streak a 1 - ieri tenuto\u00bb: due cifre e un rapporto. E un bollettino, e un bollettino non e un amico.\n"+
"COSI NO - \u00abquasi le 18 e il caffe non l'hai preso\u00bb: specchio puro, niente che sia piu vecchio di oggi. Qui la risposta giusta era SILENZIO.\n"+
"COSI NO - \u00ablo scrivevi gia un mese fa e oggi l'hai fatto davvero\u00bb detto su una quest che quest_nata dava per nata OGGI: un ricordo inventato. Un solo filo falso toglie credito a tutti quelli veri.\n"+
"SILENZIO: se dopo quella ricerca i dati non offrono nulla di vero e nuovo, o la riga verrebbe generica, rispondi con la sola parola SILENZIO. Tacere resta parte del mestiere, ma non usarlo come rifugio quando il filo concreto c'e.\n"+
"LA TUA VOCE: nel campo la_tua_voce sai quanto hai gia parlato oggi e quanto hai taciuto. Sei un amico presente, non un commentatore: piu hai gia parlato, piu alta deve essere la soglia per parlare ancora - dopo molte righe, solo un filo davvero forte merita la prossima. Se l'ultima riga e di pochi minuti fa, evita soprattutto di ripetere lo stesso filo o la stessa forma; un collegamento indipendente, concreto e nuovo puo ancora meritare voce. Il silenzio da valore alla voce, non deve spegnerla.\n"+
"MATERIALE: ancora tutto a particolari reali dei dati - l'arco delle settimane, il ritorno dopo le occasioni mancate, il patto di stamattina, l'attrito che aveva nominato, una domanda rimasta aperta, una frase del suo diario. Le sue parole esatte tra virgolette basse \u00abcosi\u00bb, mai parafrasate, solo se calzano da sole. righe_recenti sono le TUE frasi passate, con la data: puoi riprendere il filo e dargli direzione - continuita, non ripetizione: mai riusare struttura, immagine o attacco. La costanza si misura SOLO sui giorni previsti dal piano: non leggere assenze nei giorni non previsti. diario_pertinente e un accostamento per parola chiave, non per senso: il campo per dice QUALE parola ha fatto l'aggancio - guardala, e se quella parola nella voce vuol dire un'altra cosa, la voce non c'entra: scartala e non citarla. Ogni voce del diario porta nel campo scritto QUANTO FA, gia in parole: le distanze nel tempo si RICOPIANO da li, MAI calcolate da te partendo dalle date - se scritto dice piu di un mese fa, dire ieri e una menzogna. quest_nata dice da quando esiste la quest appena compiuta: ogni distanza nel tempo sulla sua origine puoi dirla SOLO leggendo quest_nata o una data esplicita nei dati - se e ignota, non datare: una memoria inventata tradisce tutte le altre. pietra_del_desiderio dice che questa quest e una pietra della montagna nominata da chi ti legge: e il filo piu lungo che esista - trattalo con il peso che merita, senza retorica da vetta.\n"+
"L'ORA: quello che ricevi e ora_in_cui_ha_segnato, cioe il minuto in cui ha toccato lo schermo. NON e l'ora in cui ha fatto la cosa, e quella tu non la sai. Puo aver corso a mezzogiorno e averlo segnato a mezzanotte. Quindi: mai dire ne far capire quando una cosa e stata fatta, ne che sia cominciata tardi, ne che l'orario stia scivolando. Puoi dire a che ora CHIUDE la lista o segna le cose, perche quello e vero. Il momento (prima spunta del giorno, giorno completo) puo dare vita alla riga, mai citato in modo meccanico.\n"+
"CHI TI LEGGE: il campo chi_ti_legge dice se e un uomo o una donna, e ogni participio e ogni aggettivo che lo riguarda si accorda a quello: sei tornato o sei tornata, non sei solo o non sei sola. Se dice che non lo sai, NON tirare a indovinare: gira la frase e scegli forme che il genere non lo chiedono (l'hai fatto, ci sei, e tornato il ritmo, oggi c'e). Sbagliare il genere di chi ti legge cancella in un colpo solo tutta la memoria lunga: e la prova che non lo conosci.\n"+
"LINGUA PIANA: le tue righe possono finire sotto gli occhi di chiunque. Vietate le parole di sistema: task, quest, rituale, streak, arco, occasioni previste, spunta. Le cose si chiamano coi loro nomi (il libro, il sonno, il caffe). Se una parola non la useresti parlando a voce con un amico, non usarla.\n"+
"IL RESPIRO. Nei libri che ama: dodici parole per frase, una frase su tre sotto le otto, quasi mai un trattino. Nelle tue: venti parole, il sei per cento corte, un trattino a riga. Quindi: MAI un fiato solo, spezza. Il punto fermo e il tuo strumento, il trattino no - se stai per metterne uno, prova prima il punto. Chiudi con una frase corta che atterra, e dopo il colpo non spiegare piu niente. E guarda il verbo: se la riga gira su e, sono, hai, non sta succedendo niente.\n"+
"COSI NO, COSI SI - righe tue, riparate.\n"+
"NO: \u00abotto occasioni consecutive mancate, e oggi questo torna \u2014 \u00e8 il ritorno piu lungo che hai attraversato in questo cammino\u00bb. Venti parole, un fiato, un trattino, e gira su \u00e8.\n"+
"SI: \u00abotto volte di fila non \u00e8 successo. oggi si. non eri mai tornato da cosi lontano\u00bb. Tre frasi, quattordici parole, nessun trattino.\n"+
"NO: \u00abla settimana quasi piena di adesso assomiglia a quella di un mese fa \u2014 la caduta di mezzo non ha lasciato traccia\u00bb.\n"+
"SI: \u00abquesta settimana somiglia a quella di un mese fa. quella storta in mezzo non ha lasciato segno\u00bb.\n"+
"NO: \u00abieri mancata, oggi \u00e8 qui \u2014 la settimana resta quasi piena\u00bb.\n"+
"SI: \u00abieri saltata. oggi no\u00bb. Quando non c'e altro da dire, quattro parole bastano.\n"+
"LA DOMANDA: ogni tanto puoi farne una, vera, non retorica. Finora non ne hai mai fatta nessuna.\n"+
"IL DETTAGLIO PRIMA DEL SENSO: l'ora, l'oggetto, la parola sua. Prima la cosa che si tocca, poi cosa vuol dire - mai il contrario.\n"+
"CONFINI: niente lode generica, niente esclamazioni, niente aforismi, niente morale in coda, niente emoji. Se nei dati c'e nota_utente non vuota, rispondi a QUELLA. Italiano. Nessun preambolo, niente virgolette intorno alla riga intera (le \u00abvirgolette basse\u00bb per parole sue vanno bene): solo la frase o le frasi, oppure SILENZIO.";
function _titleById(id){
  const s=(S.scheduled||[]).find(x=>x&&x.id===id); if(s) return s.titolo;
  const q=(S.quests||[]).find(x=>x&&x.id===id); if(q) return q.titolo;
  return null;
}
/* v152: LA PIENEZZA SI DICE IN PAROLE, e il vocabolario e uno solo per tutto il pacchetto.
   Qui stava il bollettino numerico: pkg.oggi passava {fatte:6,previste:7} - due interi affiancati,
   cioe il rapporto che il contratto vieta, servito su un piatto. Il modello non lo calcolava:
   lo COPIAVA. 36 violazioni su 77 nella baseline del 28/07 nascono da questa riga.
   Il materiale batte il contratto: se la cifra non c'e, non si puo dire. */
/* v153: L'ATTACCO BRUCIATO. Il contratto dice gia «mai due righe con la stessa costruzione» e il
   modello lo viola 18 volte su 95 (baseline 28/07): deve accorgersi da solo di essersi ripetuto,
   leggendo sei righe intere. Glielo diciamo noi: lo scheletro delle ultime righe, calcolato qui,
   in chiaro. Stessa formula del giudice in laboratorio, cosi app e banco giudicano identico. */
const _SK_FUNZ=new Set(['il','lo','la','i','gli','le','un','uno','una','e','ed','o','ma','di','a','da','in','con','su','per','tra','fra','che','non','del','della','dei','delle','al','alla','ai','alle','dal','dalla','nel','nella','si','ci','ti','ne']);
function scheletroRiga(r){
  const t=String(r||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\d+/g,'#').replace(/[^a-z#\s]/g,' ');
  const tok=t.split(/\s+/).filter(Boolean).slice(0,8);
  return tok.filter(w=>!_SK_FUNZ.has(w)).slice(0,4).join(' ');
}
function formaPienezza(dn,pl){
  if(!pl) return 'nessuna prevista';
  const r=dn/pl;
  return dn===0?'vuota':r<0.34?'quasi vuota':r<0.67?'a meta':dn===pl?'piena':'quasi piena';
}
/* v146: la distanza nel tempo la scrive SEMPRE il client, in parole - mai aritmetica al modello */
function paroleDistanza(gg){
  gg=Math.max(0,Math.round(gg));
  if(gg===0) return 'oggi';
  if(gg===1) return 'ieri';
  if(gg<7) return gg+' giorni fa';
  if(gg<14) return 'una settimana fa';
  if(gg<31) return Math.round(gg/7)+' settimane fa';
  if(gg<62) return 'piu di un mese fa';
  return 'mesi fa';
}
/* v199 — QUANDO E NATO UN RITUALE.
   I rituali creati prima della v199 non avevano una data di nascita: il campo non c'era.
   Per quelli che ci sono gia la si deduce dal primo giorno in cui e stato spuntato,
   che e la sola traccia vera che ne resta. Se non e mai stato spuntato non si puo
   sapere, e allora si torna al comportamento di prima invece di inventare. */
function _nascitaRituale(S,sched){
  if(!sched) return '';
  if(typeof sched.nata==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(sched.nata)) return sched.nata;
  let prima='';
  try{
    const ck=S.checks||{};
    Object.keys(ck).forEach(function(k){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      if(ck[k]&&ck[k][sched.id]===true&&(!prima||k<prima)) prima=k;
    });
  }catch(_){}
  return prima;
}
function buildLinePackage(id,title){
  const tk=todayKey(); const today=new Date(tk+'T12:00:00');
  const NOMI=['lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica'];
  const sched=(S.scheduled||[]).find(t=>t&&t.id===id)||null;
  const quest=sched?null:((S.quests||[]).find(q=>q&&q.id===id)||null);
  const pkg={battito:'riga',task:title};
  if(sched&&sched.days&&sched.days.length){
    pkg.tipo='rituale ricorrente ('+sched.days.map(d=>NOMI[d]).join(', ')+')';
    /* la costanza si misura contro il piano, non contro il calendario:
       contare i giorni in cui il task NON era previsto come assenze era il punto cieco dell'osservatrice */
    let planned=0,doneOnPlan=0,extra=0,lastPlan=null;
    for(let diff=0;diff<=6;diff++){
      const d=new Date(today); d.setDate(d.getDate()-diff);
      const k=localDayKey(d);
      const isPlan=sched.days.includes(dowOf(d));
      const isDone=!!(S.checks[k]&&S.checks[k][id]===true);
      if(isPlan){ planned++; if(isDone) doneOnPlan++; if(diff>0&&lastPlan===null) lastPlan={diff,done:isDone,giorno:NOMI[dowOf(d)]}; }
      else if(isDone) extra++;
    }
    const rCost=planned?doneOnPlan/planned:0;
    pkg.costanza='questa settimana, sui giorni previsti: '+(planned===0?'nessuna prevista':doneOnPlan===0?'vuota':rCost<0.34?'quasi vuota':rCost<0.67?'a meta':doneOnPlan===planned?'piena':'quasi piena');
    if(extra) pkg.fuori_piano=(extra>1?'piu di una volta':'una volta')+' anche in giorni non previsti';
    pkg.occasione_precedente=lastPlan
      ?('la precedente prevista era '+(lastPlan.diff===1?'ieri':lastPlan.giorno+', '+lastPlan.diff+' giorni fa')+': '+(lastPlan.done?'fatta':'mancata'))
      :'nessuna occasione prevista nei 6 giorni precedenti';
    /* l'eta del cammino: mai leggere storie precedenti alla prima traccia vera */
    let inizio='';
    try{
      const kc=Object.keys(S.checks||{}).sort()[0]||'';
      const dl=(S.diary||[]).length?String(S.diary[S.diary.length-1].data||''):'';
      const ra=String((((S.registro||[]).filter(e=>e&&e.tipo==='apertura')[0])||{}).msg||'');
      [kc,dl,ra].forEach(v=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&(!inizio||v<inizio)) inizio=v; });
    }catch(_){}
    if(!inizio||inizio>tk) inizio=tk;
    const etaGiorni=Math.max(0,Math.round((Date.parse(tk)-Date.parse(inizio))/86400000));
  /* v199 — L'INIZIO GIUSTO. «inizio» e il primo giorno del cammino intero. Ma un
     rituale nato ieri non puo aver mancato i giorni in cui non esisteva: in prova,
     Sentiero ha detto a una persona che una cosa «saltava da ventotto giorni di
     fila» quando era nata il giorno prima. Da qui il conto parte dal piu recente
     fra i due inizi. */
  const _nasc=_nascitaRituale(S,sched);
  const inizioRit=(_nasc&&_nasc>inizio)?_nasc:inizio;
  const etaRit=Math.max(0,Math.round((Date.parse(tk)-Date.parse(inizioRit))/86400000));
  pkg.eta_del_rituale=etaRit<1?'nato oggi':etaRit<2?'nato ieri':etaRit<7?'nato in questa settimana':etaRit<31?'nato in questo mese':'c\u2019e da oltre un mese';
    pkg.eta_del_cammino=etaGiorni<1?'primo giorno':etaGiorni<7?'prima settimana':etaGiorni<31?'primo mese':'oltre un mese';
    /* l'arco: quattro settimane dette in PAROLE, mai in numeri - il modello ripete la forma che riceve */
    const forma=formaPienezza;   /* v152: un vocabolario solo, cosi l'arco e il giorno parlano la stessa lingua */
    const sett=[];
    for(let wk=3;wk>=0;wk--){
      let pl=0,dn=0;
      for(let diff=wk*7;diff<wk*7+7;diff++){
        const d=new Date(today); d.setDate(d.getDate()-diff);
        const k=localDayKey(d);
        if(k<inizioRit) continue;                           /* prima dell'inizio non esisteva nulla da mancare */
        if(sched.days.includes(dowOf(d))){ pl++; if(S.checks[k]&&S.checks[k][id]===true) dn++; }
      }
      sett.push(forma(dn,pl));
    }
    if(etaGiorni>=7) pkg.arco_quattro_settimane='dalla piu lontana a questa: '+sett.join(' \u00b7 ');
    /* il ritorno: contato solo dentro il cammino reale */
    let mancateFila=0;
    for(let diff=1;diff<=28;diff++){
      const d=new Date(today); d.setDate(d.getDate()-diff);
      const k=localDayKey(d);
      if(k<inizioRit) break;
      if(!sched.days.includes(dowOf(d))) continue;
      if(S.checks[k]&&S.checks[k][id]===true) break;
      mancateFila++;
    }
    if(mancateFila>=2) pkg.ritorno='oggi torna dopo '+mancateFila+' occasioni previste mancate di fila';
  }else if(sched&&sched.date){
    pkg.tipo='appuntamento con data fissa ('+sched.date+'): non ha costanza settimanale';
  }else if(quest){
    pkg.tipo='quest singola: non ha costanza settimanale';
    if(quest.prio===1) pkg.priorita='alta'; else if(quest.prio===2) pkg.priorita='media';
    /* v141 LA NASCITA: la data d'origine e un fatto del client, mai una deduzione del modello.
       Per le quest d'epoca (senza nata) si risale alla voce di diario PIU ANTICA che l'ha partorita. */
    let nat=quest.nata||'';
    if(!nat){ try{ const dArr=S.diary||[];
      for(let i=dArr.length-1;i>=0;i--){ const b=dArr[i]&&dArr[i].born;
        if(b&&b.indexOf&&b.indexOf(title)>=0){ nat=String(dArr[i].data||''); break; } }
    }catch(_){} }
    if(nat&&/^\d{4}-\d{2}-\d{2}$/.test(nat)){
      const gg=Math.max(0,Math.round((Date.parse(tk)-Date.parse(nat))/86400000));
      pkg.quest_nata=gg===0?'oggi':gg===1?'ieri':gg<7?gg+' giorni fa':gg<14?'una settimana fa':gg<31?Math.round(gg/7)+' settimane fa':'piu di un mese fa';
    }else pkg.quest_nata='ignota';
    /* v143: la pietra del desiderio - il filo lungo che sale la montagna */
    if(quest.monte&&S.desiderio&&S.desiderio.id===quest.monte){
      const ORD=['prima','seconda','terza','quarta','quinta','sesta','settima','ottava','nona','decima'];
      const nP=(S.desiderio.pietre||[]).length;
      pkg.pietra_del_desiderio={desiderio:clampStr(S.desiderio.testo,120),
        pietra:(ORD[nP-1]||('numero '+nP))+' pietra spostata',
        ostacolo_storico:clampStr(S.desiderio.ostacolo,120)||null};
    }
  }else{
    pkg.tipo='task';
  }
  /* la forma del giorno: quante previste, quante fatte, le essenziali — prima l'osservatrice tirava a indovinare */
  const dow=dowOf(today);
  const pr=computeProgress(S,tk,dow); const es=essentialStatus(S,tk,dow);
  const oggi=S.checks[tk]||{};
  pkg.oggi={giornata:formaPienezza(pr.done,pr.total),titoli_fatte:Object.keys(oggi).filter(k=>oggi[k]===true).map(_titleById).filter(Boolean)};   /* v152: MAI le due cifre affiancate */
  /* la coscienza del momento: l'ora vera, e se questa spunta apre o chiude il giorno */
  const adesso=new Date();
  /* v199 — il nome dice la verita. Questa e l'ora in cui ha toccato lo schermo,
     e Sentiero non sa a che ora abbia fatto la cosa: i checks salvano solo true.
     Chiamandolo «ora» il modello lo leggeva come l'ora del fatto e ne usciva
     «l'allenamento partito dopo le undici» per un allenamento delle dodici. */
  pkg.ora_in_cui_ha_segnato=String(adesso.getHours()).padStart(2,'0')+':'+String(adesso.getMinutes()).padStart(2,'0');
  if(pr.done===1) pkg.momento='prima spunta del giorno';
  if(pr.total>0&&pr.done>=pr.total) pkg.momento='con questa il giorno e completo';
  if(es.total) pkg.oggi.essenziali=(es.done>=es.total?'tutti fatti':es.done===0?'ancora nessuno':'in parte fatti');
  const stk=S.streak||0;
  pkg.fuoco=stk<1?'da riaccendere':stk<3?'appena riacceso':stk<7?'acceso da qualche giorno':stk<21?'acceso da settimane':'un fuoco lungo';
  const sealGap=S.lastSealed?Math.round((today-new Date(S.lastSealed+'T12:00:00'))/86400000):null;
  pkg.ultimo_sigillo=S.lastSealed?(sealGap===0?'oggi':sealGap+' giorni fa'):'mai';
  /* diario: accostamento per parola chiave; la data serve al modello per pesare la distanza nel tempo */
  const stop=new Set(['dopo','della','delle','sono','essere','questo','questa','molto','anche','come','quando','perche','niente','ogni','pagine','gram']);
  const kws=(title||'').toLowerCase().split(/[^a-zàèéìòùé]+/).filter(w=>w.length>=4&&!stop.has(w));
  /* v136: S.diary ha il piu recente in TESTA (unshift) - il vecchio loop partiva dalla coda
     e serviva al modello le 3 voci piu VECCHIE dell'intero diario: da qui il falso filo del meccanico.
     Ora si parte dal presente; e il match e a confine di parola (mai piu Mandare->andare). */
  const arr=(S.diary||[]);
  /* v156: LA PAROLA RARA. Prima bastava UNA parola in comune col titolo perche una voce del diario
     entrasse nel pacchetto: parole frequenti come «casa», «oggi», «fare» agganciavano tutto a tutto,
     e il modello vedeva un filo dove c'era solo vocabolario (§7, problema #5).
     Ora una parola aggancia solo se e RARA nel diario - se compare in meno di un quinto delle voci -
     e la voce entra ordinata per quante parole rare condivide. E il pacchetto dice QUALE parola ha
     fatto l'aggancio: cosi il modello puo scartare l'omonimia invece di berla. */
  const df={};   /* in quante voci del diario compare ogni parola */
  arr.forEach(v=>{
    const visti=new Set(String(v&&v.testo||'').toLowerCase().split(/[^a-zàèéìòùé]+/).filter(w=>w.length>=4));
    visti.forEach(w=>{ df[w]=(df[w]||0)+1; });
  });
  const sogliaDF=Math.max(2,Math.ceil(arr.length/5));   /* rara = meno di un quinto del diario */
  const kwRare=kws.filter(w=>(df[w]||0)<sogliaDF);
  const usate=kwRare.length?kwRare:kws;                 /* se sono tutte comuni si tiene il vecchio comportamento, ma si segnala */
  const kwRe=usate.map(w=>({w:w,re:new RegExp('(^|[^a-zàèéìòùé])'+w+'($|[^a-zàèéìòùé])')}));
  const cand=[];
  for(let i=0;i<arr.length;i++){
    const t=(arr[i]&&arr[i].testo||'').toLowerCase();
    const per=kwRe.filter(k=>k.re.test(t)).map(k=>k.w);
    if(!per.length) continue;
    const qd=String(arr[i].iso||'').slice(0,10);
    const gg=/^\d{4}-\d{2}-\d{2}$/.test(qd)?Math.round((Date.parse(tk)-Date.parse(qd))/86400000):null;
    cand.push({peso:per.length,i:i,voce:{scritto:(gg==null?'data ignota':paroleDistanza(gg))+' ('+qd+')',
      testo:clampStr(arr[i].testo,220),
      per:per.join(', ')+(kwRare.length?'':' (parola comune: aggancio debole, fidati poco)')}});
  }
  cand.sort((a,b)=> b.peso-a.peso || a.i-b.i);          /* piu parole rare in comune prima, poi il piu recente */
  pkg.diario_pertinente=cand.slice(0,3).map(c=>c.voce);
  pkg.nota_utente=(window._notaPend&&window._notaPend.id===id&&window._notaPend.tk===tk)?window._notaPend.testo:null;
  if(pkg.nota_utente) window._notaPend=null;   /* la nota si consuma: una parola, una risposta */
  /* il materiale del filo: cio che solo chi c'era puo collegare */
  try{
    if(S.ferie&&S.ferie[id]===tk) pkg.rientro_da_ferie='oggi rientra da un riposo programmato: le assenze recenti erano volute, non vuoti';
  }catch(_){}
  try{
    if(S.patto&&S.patto.tk===tk&&S.patto.id){
      const pq=(S.quests||[]).find(x=>x&&x.id===S.patto.id)||(S.scheduled||[]).find(x=>x&&x.id===S.patto.id);
      if(pq) pkg.patto_di_stamattina={promessa:clampStr(pq.titolo,120),audace:!!S.patto.audace,riguarda_questo_task:S.patto.id===id};
    }
  }catch(_){}
  try{
    const mq=S.mastery&&S.mastery.quest&&S.mastery.quest[id];
    const _vive=_attritoVivo(mq);   /* v268.6 */
    if(_vive) pkg.attrito_nominato='sul farla aveva detto: '+clampStr(_vive,120);
  }catch(_){}
  try{
    const sv=(S.semi||[]).filter(s=>s&&s.stato==='piantato'&&s.testo).slice(-1)[0];
    if(sv){ const gg=Math.max(0,Math.round((today-new Date((sv.tk||tk)+'T12:00:00'))/86400000));
      pkg.seme_piantato={domanda:clampStr(sv.testo,140),scritto:paroleDistanza(gg)}; }   /* v152: in parole come tutte le altre distanze */
  }catch(_){}
  /* v137: la coscienza della voce - l'amico sa quanto ha gia parlato oggi e dosa da solo.
     regCantiere scrive t in UTC senza marcatore: si riappende la Z per riavere l'istante vero. */
  try{
    const W=['nessuna','una volta','due volte','tre volte','quattro volte','cinque volte','sei volte','sette volte','otto volte','nove volte','dieci volte'];
    const ev=[];
    (S.registro||[]).forEach(e=>{
      if(!e||(e.tipo!=='sussurro'&&e.tipo!=='silenzio')) return;
      const ms=Date.parse(String(e.t||'')+'Z');
      if(Number.isFinite(ms)&&localDayKey(new Date(ms))===tk) ev.push({tipo:e.tipo,ms:ms});
    });
    const sus=ev.filter(e=>e.tipo==='sussurro');
    const sil=ev.length-sus.length;
    let voce;
    if(!sus.length) voce='oggi non hai ancora parlato';
    else{
      const min=Math.max(0,Math.round((Date.now()-sus[sus.length-1].ms)/60000));
      const quando=min<10?'pochi minuti fa':min<45?"circa mezz'ora fa":min<90?"circa un'ora fa":min<300?'qualche ora fa':'molte ore fa';
      voce='oggi hai gia parlato '+(sus.length>10?'piu di dieci volte':W[sus.length])+", l'ultima "+quando;
    }
    if(sil>0) voce+='; il silenzio lo hai scelto '+(sil>10?'piu di dieci volte':W[sil]);
    pkg.la_tua_voce=voce;
  }catch(_){}
  /* v150: l'unico dato su CHI sta leggendo. Il contratto era scritto in terza persona femminile
     («la persona», «dirle», «sopra di lei») e il modello accordava al femminile: 6 righe su 95
     davano del femminile a un uomo. Un amico che sbaglia questo non e un amico. */
  pkg.chi_ti_legge=(S.settings&&S.settings.genere==='m')?'un uomo':(S.settings&&S.settings.genere==='f')?'una donna':'non lo sai: non usare accordi di genere';
  /* v153: gli attacchi gia usati, in chiaro: il modello non deve dedurli, deve evitarli */
  pkg.attacchi_bruciati=Array.from(new Set((S.obsLines||[]).slice(-6).map(n=>scheletroRiga(n.riga)).filter(Boolean)));
  pkg.righe_recenti=(S.obsLines||[]).slice(-6).map(n=>{
    const qd=String(n.iso||'').slice(0,10);
    const gg=/^\d{4}-\d{2}-\d{2}$/.test(qd)?Math.round((Date.parse(tk)-Date.parse(qd))/86400000):null;
    return {detta:(gg==null?'':paroleDistanza(gg)),task:n.task,riga:n.riga};
  });
  return pkg;
}
/* ══ v271 — LA LETTURA DI UNA PAGINA ═══════════════════════════════════════
   Il compito e TRASCRIVERE, non capire. E una distinzione che il modello non fa
   da solo: se gli mostri una foto, il suo istinto e descriverla o riassumerla.
   Qui gli si dice, in modo che non resti spazio: sei una macchina da scrivere
   che guarda. */
const OCR_SYS =
'Trascrivi il testo che vedi in questa immagine. E una pagina scritta - a mano o stampata - e il tuo unico compito e riportarla come e.\n'+
'FAI:\n'+
'- trascrivi ESATTAMENTE le parole che vedi, nell ordine in cui stanno;\n'+
'- conserva gli a capo, i paragrafi e le righe vuote;\n'+
'- conserva la punteggiatura, le maiuscole e gli errori di chi ha scritto;\n'+
'- conserva elenchi, trattini, numerazioni e date come sono scritti.\n'+
'NON FARE:\n'+
'- non riassumere, mai, nemmeno se il testo e lungo;\n'+
'- non migliorare lo stile, non riformulare, non rendere piu bello;\n'+
'- non correggere l ortografia, la grammatica o la punteggiatura;\n'+
'- non commentare, non introdurre, non concludere;\n'+
'- non descrivere l immagine, la carta, la calligrafia o il contesto;\n'+
'- non inventare parole per riempire un buco.\n'+
'SE UNA PAROLA E DAVVERO ILLEGGIBILE: scrivila come [?] e basta. Un segno minimo, che chi legge possa cancellare in un tocco. Non tirare a indovinare una frase intera.\n'+
'SE NELL IMMAGINE NON C E NESSUN TESTO: rispondi soltanto con la parola VUOTO.\n'+
'Rispondi SOLO con la trascrizione. Nessuna virgoletta attorno, nessuna intestazione, nessuna spiegazione.';

function _ocrMediaResolution(){
  /* Google raccomanda HIGH per le immagini quando serve leggere testo fine.
     Veloce sceglie MEDIUM per ridurre token/latency; Bilanciato e Massimo danno
     al modello tutti i dettagli utili, senza fingere che piu pixel siano gratis. */
  return ((S.settings&&S.settings.aiModel)==='fast')?'medium':'high';
}
function _ocrPrepProfile(){
  const m=(S.settings&&S.settings.aiModel)||'balanced';
  if(m==='max') return {lato:2200,q:.90};
  if(m==='fast') return {lato:1400,q:.80};
  return {lato:1800,q:.86};
}
async function leggiPagina(dataUrl,segnale){
  const m=/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(dataUrl||''));
  if(!m) return {err:'immagine'};
  const res=await aiCall({
    system:OCR_SYS,
    /* Best practice Gemini: per un'immagine con testo, l'istruzione viene PRIMA
       dell'immagine. `resolution` e il controllo multimodale nativo Gemini 3. */
    user:[{type:'text',text:'Trascrivi questa pagina esattamente, senza riassumere.'},
          {type:'image',mime_type:m[1],data:m[2],resolution:_ocrMediaResolution()}],
    task:'ocr',media:true,maxOutputTokens:4000,reasoning:'low',timeout:60000,background:((S.settings&&S.settings.aiModel)==='max'),backgroundTimeout:210000,priority:40,signal:segnale||undefined});
  if(res&&res.err) return res;
  let t=String((res&&res.text)||'').trim();
  if(/^vuoto\.?$/i.test(t)) t='';
  return {testo:clampStr(t,LIMITS.DIARY), model:res&&res.model, tin:res&&res.tin, tout:res&&res.tout};
}

/* ══ PREPARARE LA FOTO ══════════════════════════════════════════════════════
   Tre cose da fare bene, e una da non fare.
   · l orientamento: una foto scattata col telefono in mano porta l orientamento
     nei metadati, e un canvas che non lo rispetta produce una pagina coricata -
     illeggibile per il modello quanto per una persona. createImageBitmap con
     imageOrientation:'from-image' lo risolve dove c e; dove non c e, i browser
     recenti gia raddrizzano da soli disegnando su canvas.
   · la misura: e un PROFILO, non una costante. Veloce 1400, Bilanciato 1800,
     Massimo 2200 sul lato lungo: una pagina difficile puo conservare piu tratto
     senza imporre quel peso a ogni foto.
   · la compressione segue lo stesso profilo: JPEG .80 / .86 / .90.
   · la risoluzione che Gemini dedica alla visione e separata dai pixel inviati:
     Bilanciato e Massimo chiedono HIGH; Veloce MEDIUM.
   E la cosa da non fare: tenersi copie. Il bitmap si chiude, il canvas si
   azzera, l URL oggetto si revoca. Sentiero salva una nota, non un archivio
   fotografico. */
async function preparaFoto(file){
  let bmp=null,url=null,cv=null;
  try{
    try{ bmp=await createImageBitmap(file,{imageOrientation:'from-image'}); }
    catch(_){ try{ bmp=await createImageBitmap(file); }catch(__){ bmp=null; } }
    let w,h,src;
    if(bmp){ w=bmp.width; h=bmp.height; src=bmp; }
    else{
      url=URL.createObjectURL(file);
      src=await new Promise((ris,rif)=>{ const im=new Image();
        im.onload=()=>ris(im); im.onerror=()=>rif(new Error('immagine')); im.src=url; });
      w=src.naturalWidth; h=src.naturalHeight;
    }
    if(!w||!h) throw new Error('immagine');
    const _op=_ocrPrepProfile();
    const k=Math.min(1,_op.lato/Math.max(w,h));
    cv=document.createElement('canvas');
    cv.width=Math.max(1,Math.round(w*k)); cv.height=Math.max(1,Math.round(h*k));
    const cx=cv.getContext('2d');
    cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height);   /* i PNG trasparenti non diventano pagine nere */
    cx.drawImage(src,0,0,cv.width,cv.height);
    return cv.toDataURL('image/jpeg',_op.q);
  } finally {
    try{ if(bmp&&bmp.close) bmp.close(); }catch(_){}
    try{ if(url) URL.revokeObjectURL(url); }catch(_){}
    try{ if(cv){ cv.width=1; cv.height=1; } }catch(_){}
  }
}

async function askObserverLine(pkg,segnale){
  /* v270.2 — il tetto era settantacinque secondi. Non e stato quello a bloccare
     Sentiero (era la brace tenuta accesa a vuoto per tutto quel tempo, ed e
     corretta a parte), ma settantacinque secondi restano piu di qualunque
     attesa onesta per una riga di sei parole: e una DECISIONE, non una
     scoperta. Quarantacinque bastano alla catena piu lenta con il pensiero
     acceso, e il segnale permette di smettere prima se la riga non serve piu. */
  const res=await aiCall({system:OBSERVER_LINE_SYS,user:'DATI (JSON):\n'+JSON.stringify(pkg),task:'observer-line',maxOutputTokens:180,reasoning:'minimal',timeout:30000,priority:55,signal:segnale||undefined});
  const meta={model:(res&&res.model)||null,tin:(res&&res.tin)||0,tout:(res&&res.tout)||0,salti:(res&&res.salti)||undefined,err:(res&&res.err)||null};
  const line=(res&&res.text)?clampStr(res.text,600).trim():null;
  if(!line||/^silenzio[.!\u2026]?$/i.test(line)) return Object.assign({riga:null},meta);   /* silenzio e guasto restano entrambi non invasivi, ma la Diagnostica adesso li distingue */
  return Object.assign({riga:line},meta);
}
/* ══ LA NASCITA DALLA POLVERE — dopo la distillazione l'app non tace piu: il foglio sale da solo
   fino alla quest appena nata, e la polvere del mondo la SCRIVE - lo sciame spazza la riga da
   sinistra a destra e ogni carattere si accende dove un grano atterra. Tick aptico alla nascita.
   Con riduci-moto: solo l'aura. La prima nata ha il rito pieno. ══ */
(function(){
  const RMQ=matchMedia('(prefers-reduced-motion: reduce)');
  function okAnim(){ try{ return (S.settings&&S.settings.anim==='sempre')||!RMQ.matches; }catch(_){ return !RMQ.matches; } }
  let cv=null,ctx=null;
  function tela(){
    if(cv) return;
    cv=document.createElement('canvas');
    cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
    document.body.appendChild(cv); ctx=cv.getContext('2d');
    const fit=()=>{ const d=Math.min(2,devicePixelRatio||1); cv.width=innerWidth*d; cv.height=innerHeight*d; ctx.setTransform(d,0,0,d,0,0); };
    fit(); addEventListener('resize',fit);
  }
  window._nascitaQuest=function(qid){
    try{
      /* v270 */
      setTimeout(function(){
        const row=document.querySelector('#list-quest-today .item[data-qid="'+qid+'"]');
        if(!row){ try{ foglioDopoVoce(); }catch(_){} return; }
        try{ row.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){}
        setTimeout(function(){
          const r=row.getBoundingClientRect();
          if(!(r.width||r.height)) return;
          const au=document.createElement('div');
          au.style.cssText='position:absolute;inset:-2px -8px;border-radius:12px;pointer-events:none;opacity:0;background:linear-gradient(90deg,rgba(212,162,78,.12),transparent 70%);border:.5px solid rgba(212,162,78,.35);animation:q-aura 2.2s ease-out .25s both';
          row.style.position='relative'; row.appendChild(au);
          setTimeout(function(){ try{ au.remove(); }catch(_){} },2700);
          try{ haptic(false); }catch(_){}
          if(!okAnim()) return;
          const ttl=row.querySelector('.ttl');
          if(ttl){
            const ini=ttl.querySelector('.ini');
            const colIni=ini?ini.style.color:'';
            const testo=ttl.textContent||'';
            ttl.innerHTML='';
            for(let i=0;i<testo.length;i++){
              const s=document.createElement('span');
              s.style.cssText='opacity:0;display:inline-block;animation:q-pc .3s ease both;animation-delay:'+(160+i*24)+'ms'+((i===0&&colIni)?';color:'+colIni:'');
              s.textContent=testo[i]===' '?'\u00a0':testo[i];
              ttl.appendChild(s);
            }
          }
          tela();
          const t0=performance.now();
          const CM=(function(){ try{ const m=document.getElementById('mic'); if(m){ const rr=m.getBoundingClientRect(); return {x:rr.left+rr.width/2,y:Math.max(40,rr.top+rr.height/2)}; } }catch(_){} return {x:innerWidth/2,y:80}; })();
          const P=[];
          for(let i=0;i<46;i++){
            const fq=i/46;
            P.push({x0:CM.x+(Math.random()*160-80), y0:CM.y+(Math.random()*60-30),
              tx:r.left+14+fq*(r.width-40)+(Math.random()*10-5), ty:r.top+r.height/2+(Math.random()*12-6),
              cx:(Math.random()*200-100), r:0.9+Math.random()*1.8, dl:fq*0.55+Math.random()*0.08,
              col:Math.random()<0.6?'232,188,106':(Math.random()<0.8?'246,238,214':'238,178,128')});
          }
          (function volo(now){
            const t=(now-t0)/1000;
            ctx.clearRect(0,0,innerWidth,innerHeight);
            let vivi=0;
            for(let i=0;i<P.length;i++){
              const p=P[i];
              const k=(t-p.dl)/0.62;
              if(k>=1) continue;
              vivi++;
              if(k<0) continue;
              const e=1-Math.pow(1-k,3), u=1-e;
              const mx=(p.x0+p.tx)/2+p.cx;
              const x=u*u*p.x0+2*u*e*mx+e*e*p.tx;
              const y=u*u*p.y0+2*u*e*((p.y0+p.ty)/2-40)+e*e*p.ty;
              ctx.globalAlpha=(k<0.75?0.95:(1-k)*3.8);
              ctx.fillStyle='rgba('+p.col+',1)';
              ctx.beginPath(); ctx.arc(x,y,p.r*(1-e*0.45),0,6.2832); ctx.fill();
            }
            ctx.globalAlpha=1;
            if(vivi) requestAnimationFrame(volo);
            else ctx.clearRect(0,0,innerWidth,innerHeight);
          })(t0);
        },430);
      },650);
    }catch(_){}
  };
})();
/* ══════ v249 — MENTRE SI REGISTRA, IL TELEFONO NON FA ALTRO ═══════════════
   In prova si e dovuta rifare la stessa registrazione piu volte, e ruotando il
   telefono la registrazione si interrompeva. Il riavvio automatico c'era gia:
   il problema e piu a monte. Girando lo schermo partono tutti insieme i
   ridimensionamenti di TRE tele a schermo intero, ognuna con la sua
   moltiplicazione per il rapporto dei pixel - e su un telefono, mentre il
   microfono e aperto, quel picco basta a far cadere il riconoscimento.
   Qui si dice una cosa sola e la si dice in un posto solo: mentre il microfono
   e aperto, chi ridisegna aspetta. Non si perde niente - una tela ridimensionata
   mezzo secondo dopo non la nota nessuno - e si smette di far litigare la voce
   con la grafica per una risorsa che serve alla voce. */
let _staRegistrando=false;
const _lavoriRimandati=new Set();
function lavoroPesante(f){
  return function(){
    if(_staRegistrando){ _lavoriRimandati.add(f); return; }
    try{ f(); }catch(_){}
  };
}
function riprendiLavori(){
  _staRegistrando=false;
  const da=Array.from(_lavoriRimandati); _lavoriRimandati.clear();
  /* uno alla volta, non tutti insieme: altrimenti si sposta il picco invece di
     toglierlo. Un fotogramma di distanza basta. */
  da.forEach(function(f,i){ setTimeout(function(){ try{ f(); }catch(_){} },i*16); });
}

let _whisperEl=null,_whisperTimer=null,_whisperTimer2=null;
const _sussurroDiag=window._sussurroDiag={attempts:0,disabled:0,preflight:0,intentional:0,local:0,coalesced:0,aborted:0,superseded:0,accepted:0,vetoed:0,empty:0,errors:0,rendered:0,lastOutcome:'',lastTask:''};
function _whisper(text){
  if(!text) return;
  if(!_whisperEl){
    const d=document.createElement('div'); d.id='obs-whisper';
    d.setAttribute('role','status'); d.setAttribute('aria-live','polite'); d.setAttribute('aria-atomic','true');
    d.style.cssText='position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);transform:translateX(-50%);max-width:94%;width:max-content;z-index:70;font-family:Lora,var(--serif);font-style:italic;font-size:19px;line-height:1.5;color:#b8e8d6;text-align:center;background:rgba(8,13,12,.9);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(159,216,196,.26);border-radius:14px;padding:15px 20px;opacity:0;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,.45)';
    document.body.appendChild(d); _whisperEl=d;
  }
  clearTimeout(_whisperTimer); clearTimeout(_whisperTimer2);
  const el=_whisperEl;
  el.classList.remove('esce'); el.classList.remove('entra');
  el.innerHTML='';
  /* Lab 24: il vecchio passo da 16 ms rendeva una riga lunga piu teatrale che leggibile.
     Dieci millisecondi conserva il sorgere delle lettere ma porta prima il contenuto a chi legge. */
  let i=0;
  const parole=String(text).split(' ');
  parole.forEach((wd,wi)=>{
    const w=document.createElement('span'); w.className='w';
    for(const ch of wd){
      const c=document.createElement('span'); c.className='c'; c.textContent=ch;
      c.style.animationDelay=(80+i*10)+'ms'; i++;
      w.appendChild(c);
    }
    el.appendChild(w);
    if(wi<parole.length-1){ el.appendChild(document.createTextNode(' ')); i++; }  /* anche lo spazio costa un frame */
  });
  void el.offsetWidth;   /* riavvia le animazioni al giro successivo */
  el.classList.add('entra');
  try{ _sussurroDiag.rendered++;_sussurroDiag.lastOutcome='rendered'; }catch(_){}
  el.style.pointerEvents=(window._verdettoRef&&window._verdettoRef.riga===String(text))?'auto':'none';   /* v147: solo un sussurro vero riceve il tocco */
  if(window._verdettoRef&&window._verdettoRef.riga!==String(text)) window._verdettoRef=null;
  const durata=Math.min(14500, 3400 + String(text).length*70);
  _whisperTimer=setTimeout(()=>{ el.classList.remove('entra'); el.classList.add('esce'); }, durata);
  _whisperTimer2=setTimeout(()=>{ el.classList.remove('esce'); el.innerHTML=''; el.style.pointerEvents='none'; window._verdettoRef=null; }, durata+520);
}

/* ══ LA NOTA ALL'OSSERVATRICE — tocco lungo su una riga: una parola tua, la riga rispondera ══ */
window._notaPend=null;
function apriNotaBox(div,id,titolo,isQuest){   /* LA CURA: aggiorna la riga, o lasciala andare col perche */
  const prev=div.nextElementSibling;
  if(prev&&prev.classList&&prev.classList.contains('nota-obs-box')){ prev.remove(); return; }
  document.querySelectorAll('.nota-obs-box').forEach(x=>x.remove());
  const box=document.createElement('div'); box.className='nota-obs-box';
  box.innerHTML='<button class="cura-btn cura-agg">Aggiorna</button>'+
    (isQuest?'<button class="cura-btn cura-rim">Rimanda\u2026</button>':'')+
    (isQuest?'<button class="cura-btn cura-las">Lascia andare\u2026</button>':'')+
    (isQuest?'':'<button class="cura-btn cura-rip">Riposo oggi</button>')+
    (isQuest?'':'<button class="cura-btn cura-fer">In ferie\u2026</button>')+
    '<button class="cura-btn cura-via">Elimina</button>';
  div.after(box);
  const fase=(modo)=>{
    box.innerHTML='<input class="patto-inp cura-inp" type="text" maxlength="200" enterkeyhint="done">'+
      '<button class="patto-inp-ok cura-ok">'+(modo==='agg'?'Salva':'Elimina')+'</button>';
    const inp=box.querySelector('.cura-inp');
    if(modo==='agg'){ inp.value=titolo; }
    else { inp.placeholder='perch\u00e9 la elimini? (obbligatorio)'; }
    const ok=()=>{
      const v=String(inp.value||'').trim();
      if(modo==='agg'){
        if(!v) return;
        if(isQuest){ const q=(S.quests||[]).find(x=>x&&x.id===id); if(q) q.titolo=v.slice(0,200); }
        else { const r=(S.scheduled||[]).find(x=>x&&x.id===id); if(r) r.titolo=v.slice(0,200); }
        save(); box.remove(); try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
      } else {
        if(v.length<3){ inp.value=''; inp.placeholder='serve il perch\u00e9: \u00e8 il prezzo dell\u2019eliminare'; return; }
        if(isQuest) S.quests=(S.quests||[]).filter(x=>!(x&&x.id===id));
        else { S.scheduled=(S.scheduled||[]).filter(x=>!(x&&x.id===id)); S.essentials=(S.essentials||[]).filter(x=>x!==id); }
        try{ addDiary('Lascio andare \u00ab'+titolo+'\u00bb: '+v.slice(0,300),[],[],''); }catch(_){}
        save(); box.remove();
        try{ render(); }catch(_){} try{ updateRing(); }catch(_){} try{ renderDiary(); }catch(_){}
      }
    };
    box.querySelector('.cura-ok').onclick=ok;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); ok(); } });
    setTimeout(()=>{ try{ inp.focus(); }catch(_){} },60);
  };
  box.querySelector('.cura-agg').onclick=()=>fase('agg');
  box.querySelector('.cura-via').onclick=()=>fase('via');
  const brim=box.querySelector('.cura-rim');
  if(brim) brim.onclick=()=>{   /* RIMANDA (v148): la quest non muore, cambia giorno */
    const tkR=todayKey();
    const salta=(n)=>{ const d=new Date(tkR+'T12:00:00'); d.setDate(d.getDate()+n); return localDayKey(d); };
    const applica=(v)=>{
      const q=(S.quests||[]).find(x=>x&&x.id===id); if(!q){ box.remove(); return; }
      q.quando=v; q.fatto=false;
      save(); box.remove();
      try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
      try{ toast('Rimandata al '+v.slice(8,10)+'/'+v.slice(5,7)+'.'); }catch(_){}
    };
    box.innerHTML='<button class="cura-btn cura-r1">domani</button>'+
      '<button class="cura-btn cura-r7">+1 settimana</button>'+
      '<button class="cura-btn cura-rd">data\u2026</button>';
    box.querySelector('.cura-r1').onclick=()=>applica(salta(1));
    box.querySelector('.cura-r7').onclick=()=>applica(salta(7));
    box.querySelector('.cura-rd').onclick=()=>{
      const min=salta(1);
      box.innerHTML='<input class="patto-inp cura-data" type="date" min="'+min+'">'+
        '<button class="patto-inp-ok cura-ok">Rimanda</button>';
      const inp=box.querySelector('.cura-data'); inp.value=min;
      box.querySelector('.cura-ok').onclick=()=>{
        const v=String(inp.value||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<=tkR){ try{ toast('Scegli un giorno da domani in poi'); }catch(_){} return; }
        applica(v);
      };
      setTimeout(()=>{ try{ inp.focus(); }catch(_){} },60);
    };
  };
  const blas=box.querySelector('.cura-las');
  if(blas) blas.onclick=()=>{   /* LASCIA ANDARE (v148): esce dalle attive, resta agli atti */
    box.innerHTML='<input class="patto-inp cura-inp" type="text" maxlength="200" enterkeyhint="done" placeholder="perch\u00e9 la lasci andare?">'+
      '<button class="patto-inp-ok cura-ok">Lascia andare</button>';
    const inp=box.querySelector('.cura-inp');
    const okL=()=>{
      const v=String(inp.value||'').trim();
      if(v.length<3){ inp.value=''; inp.placeholder='due parole bastano: perch\u00e9 la lasci?'; return; }
      const q=(S.quests||[]).find(x=>x&&x.id===id); if(!q){ box.remove(); return; }
      try{ if(!Array.isArray(S.questLog)) S.questLog=[]; S.questLog.push({titolo:q.titolo,day:todayKey(),nata:q.nata||'',lasciata:1}); if(S.questLog.length>300) S.questLog=S.questLog.slice(-300); }catch(_){}
      S.quests=(S.quests||[]).filter(x=>!(x&&x.id===id));
      try{ addDiary('Lascio andare \u00ab'+q.titolo+'\u00bb: '+v.slice(0,300),[],[],''); }catch(_){}
      save(); box.remove();
      try{ render(); }catch(_){} try{ updateRing(); }catch(_){} try{ renderDiary(); }catch(_){}
      try{ toast('Lasciata andare. Resta agli atti.'); }catch(_){}
    };
    box.querySelector('.cura-ok').onclick=okL;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); okL(); } });
    setTimeout(()=>{ try{ inp.focus(); }catch(_){} },60);
  };
  const bfer=box.querySelector('.cura-fer');
  if(bfer) bfer.onclick=()=>{   /* LE FERIE: scegli il giorno del ritorno; fino ad allora la task riposa e non conta */
    const min=new Date(Date.now()+86400000).toISOString().slice(0,10);
    box.innerHTML='<input class="patto-inp cura-data" type="date" min="'+min+'">'+
      '<button class="patto-inp-ok cura-ok">Riposa</button>';
    const inp=box.querySelector('.cura-data'); inp.value=min;
    box.querySelector('.cura-ok').onclick=()=>{
      const v=String(inp.value||'');
      let oggiK=''; try{ oggiK=todayKey(); }catch(_){ oggiK=new Date().toISOString().slice(0,10); }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<=oggiK){ try{ toast('Scegli un giorno da domani in poi'); }catch(_){} return; }
      if(!S.ferie) S.ferie={};
      Object.keys(S.ferie).forEach(k=>{ if(S.ferie[k]<oggiK) delete S.ferie[k]; });   /* pota le ferie gia consumate */
      S.ferie[id]=v;
      save(); box.remove();
      try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
      try{ toast('A riposo: torna il '+v.slice(8,10)+'/'+v.slice(5,7)+'.'); }catch(_){}
    };
    setTimeout(()=>{ try{ inp.focus(); }catch(_){} },60);
  };
  const brip=box.querySelector('.cura-rip');
  if(brip) brip.onclick=()=>{
    const tkR=todayKey();
    if(!S.riposi) S.riposi={};
    if(!Array.isArray(S.riposi[tkR])) S.riposi[tkR]=[];
    if(S.riposi[tkR].indexOf(id)<0) S.riposi[tkR].push(id);
    save(); box.remove();
    try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
    try{ toast('Riposo per oggi. Domani torna.'); }catch(_){}
  };
}
function attachScopri(div){
  /* v176 (Fase 7): la × non sta piu in riga accanto al calendario, dove un'azione neutra e una
     distruttiva avevano lo stesso peso. Si scopre scorrendo il dito verso sinistra.
     Tre guardie: il gesto deve essere chiaramente orizzontale (se no e lo scroll o il foglio),
     non deve partire dal bordo sinistro (li iOS fa «indietro»), e non parte dai bottoni. */
  let x0=0,y0=0,vivo=false;
  div.addEventListener('pointerdown',e=>{
    if(e.target&&e.target.closest&&e.target.closest('.chk,.essbtn,.del,.cal,button')) return;
    if(e.clientX<24) return;                       /* bordo sinistro: e la navigazione di iOS */
    x0=e.clientX; y0=e.clientY; vivo=true;
  });
  div.addEventListener('pointermove',e=>{
    if(!vivo) return;
    const dx=e.clientX-x0, dy=Math.abs(e.clientY-y0);
    if(dy>16){ vivo=false; return; }               /* sta scorrendo la lista: non e affar nostro */
    if(dx<-42){ div.classList.add('scoperta'); vivo=false; }
    else if(dx>42){ div.classList.remove('scoperta'); vivo=false; }
  });
  const stop=()=>{ vivo=false; };
  div.addEventListener('pointerup',stop);
  div.addEventListener('pointercancel',stop);
}
/* v186 — attachDispiega e stata tolta.
   Era della Fase 6: un tocco sulla riga apriva il titolo troncato. Ma nella
   Fase 8 (v181) si e deciso che i titoli non si troncano piu, e con quella
   decisione e sparita l'unica regola CSS che vestiva la classe «aperta».
   Da allora la funzione girava lo stesso: due ascoltatori su OGNI riga, per
   commutare una classe che non cambiava un pixel. Non un guasto - un gesto
   che non risponde piu, e codice che il prossimo che passa deve capire per
   scoprire che non serviva. */
function attachNota(div,id,titolo,isQuest){

  let t=null,x0=0,y0=0;
  div.addEventListener('pointerdown',e=>{
    if(e.target&&e.target.closest&&e.target.closest('.chk,.essbtn,.del,.cal,.editq')) return;
    x0=e.clientX; y0=e.clientY;
    t=setTimeout(()=>{ t=null; try{ haptic(); }catch(_){} apriNotaBox(div,id,titolo,isQuest); },550);
  });
  const annulla=()=>{ if(t){ clearTimeout(t); t=null; } };
  div.addEventListener('pointerup',annulla);
  div.addEventListener('pointercancel',annulla);
  div.addEventListener('pointermove',e=>{ if(t&&(Math.abs(e.clientX-x0)>10||Math.abs(e.clientY-y0)>10)) annulla(); });
}
/* ══ IL REGISTRO DI CANTIERE — la memoria tecnica dell'app: misura Sentiero, mai la vita.
   Sussurri e silenzi con la loro latenza, gli errori veri, un battito d'apertura al giorno.
   Vive nello stato: ogni backup esportato lo porta con se. Tetto duro: 250 voci. ══ */
/* v151: solo gli ultimi LIMITS.PKG pacchetti restano attaccati. Il corpus vale, lo spazio no:
   un pacchetto pesa quanto trenta righe, e il backup deve restare un file che si manda per mail. */
function potaPacchetti(reg){
  if(!Array.isArray(reg)) return reg;
  let n=0;
  for(let i=reg.length-1;i>=0;i--){
    if(reg[i]&&reg[i].pkg){ n++; if(n>LIMITS.PKG) delete reg[i].pkg; }
  }
  return reg;
}
function regCantiere(tipo,dati){
  try{
    const v={t:new Date().toISOString().slice(0,19),tipo:String(tipo||'').slice(0,16),ver:APP_VERSION.slice(0,24)};
    if(dati&&typeof dati==='object'){
      if(dati.task) v.task=clampStr(dati.task,120);
      if(dati.riga) v.riga=clampStr(dati.riga,300);
      if(dati.msg) v.msg=clampStr(dati.msg,220);
      if(Number.isFinite(dati.ms)) v.ms=Math.round(dati.ms);
      if(dati.model) v.model=clampStr(dati.model,40);                  /* v139: il costo del battito resta agli atti */
      if(Number.isFinite(dati.tin)) v.tin=Math.round(dati.tin);
      if(Number.isFinite(dati.tout)) v.tout=Math.round(dati.tout);
      if(Number.isFinite(dati.think)) v.think=Math.round(dati.think);
      if(dati.profile) v.profile=clampStr(dati.profile,12);
      if(dati.provider) v.provider=clampStr(dati.provider,20);          /* v272.3: interactions o generateContent */
      if(dati.resolution) v.resolution=clampStr(dati.resolution,12);
      if(dati.status) v.status=clampStr(dati.status,16);                /* lifecycle/finishReason, mai contenuto */
      if(dati.format) v.format=clampStr(dati.format,8);                 /* text/json */
      if(Number.isFinite(dati.api)&&dati.api>=0&&dati.api<20) v.api=Math.round(dati.api);
      if(Number.isFinite(dati.http)&&dati.http>=100&&dati.http<=599) v.http=Math.round(dati.http);
      if(dati.effort) v.effort=clampStr(dati.effort,10);           /* v155: la leva com'era posizionata a quel battito */
      if(dati.stop) v.stop=clampStr(dati.stop,20);                 /* campo legacy preservato soltanto per leggere vecchi registri */
      if(dati.salti) v.salti=clampStr(dati.salti,120);             /* Lab 17: include anche cooldown/429, sempre senza contenuto */
      if(dati.rate) v.rate=clampStr(dati.rate,40);
      if(Number.isFinite(dati.wait)&&dati.wait>=0&&dati.wait<172800) v.wait=Math.round(dati.wait);
      /* Lab 10: Lab 9 li calcolava ma il registro non li persisteva; senza questi
         tre numeri il test dell'OCR background risultava invisibile in Diagnostica. */
      if(Number.isFinite(dati.background)) v.background=dati.background?1:0;
      if(Number.isFinite(dati.poll)&&dati.poll>=0&&dati.poll<500) v.poll=Math.round(dati.poll);
      if(Number.isFinite(dati.deleted)&&dati.deleted>=-1&&dati.deleted<=1) v.deleted=Math.round(dati.deleted);
      /* v151: IL REGISTRO DEI PACCHETTI. Accanto alla riga resta il JSON esatto che l'ha generata.
         Da qui in poi ogni backup e un corpus prompt-in / riga-out: il giudice puo verificare
         OGNI affermazione della riga contro i fatti che il modello aveva davvero davanti,
         e nessuno deve piu dare voti a mano. */
      if(dati.pkg&&typeof dati.pkg==='object'){
        try{ const j=JSON.stringify(dati.pkg); if(j.length<=LIMITS.PKGB) v.pkg=JSON.parse(j); }catch(_){}
      }
    }
    const ult=(S.registro||[]).slice(-1)[0];
    if(ult&&v.tipo==='errore'&&ult.tipo==='errore'&&ult.msg===v.msg) return;   /* lo stesso errore a raffica si scrive una volta */
    S.registro=(S.registro||[]).concat([v]).slice(-250);
    potaPacchetti(S.registro);
    save();
  }catch(_){}
}
(function(){
  try{
    const oggi=todayKey();
    const ap=(S.registro||[]).filter(e=>e&&e.tipo==='apertura').slice(-1)[0];
    if(!ap||ap.msg!==oggi) regCantiere('apertura',{msg:oggi});
  }catch(_){}
  addEventListener('error',e=>{ try{ regCantiere('errore',{msg:String((e&&e.message)||'')+' @'+String((e&&e.lineno)||'')}); }catch(_){} });
  addEventListener('unhandledrejection',e=>{ try{ regCantiere('errore',{msg:'promise: '+String((e&&e.reason&&e.reason.message)||(e&&e.reason)||'').slice(0,180)}); }catch(_){} });
})();


/* ══ IL DESIDERIO (v143) — la montagna e le pietre. Uno solo alla volta (Legge del Fuoco).
   Si esprime toccando una stella cadente nella stanza del giardino; il Motore disegna la
   cresta (3-4 tappe come orizzonte) e posa UNA pietra viva: una quest concreta, meno di un
   giorno. Spostata una pietra, il Motore posa la successiva. Niente percentuali: una
   montagna non sa quante pietre contiene - conta solo quante ne hai spostate. ══ */
const DESIDERIO_WIRE_SYS=
"Sei la voce di Sentiero. Costruisci una montagna da un desiderio e dal suo ostacolo. Rispondi SOLO in questo protocollo, una voce per riga, senza markdown o testo extra:\nT1: prima tappa\nT2: seconda tappa\nT3: terza tappa\nT4: quarta tappa facoltativa\nP: prima azione concreta\nREGOLE: 3 o 4 tappe totali, massimo 8 parole ciascuna; P e una sola azione fisica sotto un giorno, massimo 9 parole; italiano, niente gergo da coach.";
/* Lab 19 — il protocollo lineare diventa il wire canonico del Desiderio su
   entrambi i modelli. Evidenza fisica: 3.7 ha chiuso ripetutamente il piccolo
   structured output come `incomplete`, mentre lo stesso significato su Flash-Lite
   in T1..T4/P e arrivato completo e ha superato la giuria locale. Il dominio
   continua ad avere un oggetto {cresta,pietra}; cambia solo il trasporto. */
const PIETRA_SYS=
"Sei la voce di Sentiero. La persona muove una montagna spostando una pietra alla volta. Ricevi desiderio, ostacolo storico, cresta e pietre gia spostate. Restituisci SOLO uno dei due formati: `COMPIUTO` se la montagna e onestamente mossa; altrimenti `PIETRA: ...` con una sola azione fisica e concreta, meno di un giorno, massimo 9 parole, passo successivo naturale, mai gia spostato. Italiano. Niente JSON, markdown o spiegazioni.";
function _pietraViva(){
  if(!S.desiderio) return null;
  return (S.quests||[]).find(q=>q&&!q.fatto&&q.monte===S.desiderio.id)||null;
}
function _nParole(t){ return String(t||'').trim().split(/\s+/).filter(Boolean).length; }
function _desiderioPayloadOk(out){
  if(!out||typeof out!=='object'||Array.isArray(out)) return false;
  const c=Array.isArray(out.cresta)?out.cresta.map(x=>String(x||'').trim()).filter(Boolean):[];
  const p=String(out.pietra||'').trim();
  /* La legge 3..4 resta interamente locale. Lab 19 mantiene anche i limiti di
     concisione che prima vivevano solo nel prompt: un trasporto alternativo non
     deve poter allargare la semantica del prodotto. */
  return c.length>=3&&c.length<=4&&c.every(x=>_nParole(x)<=8)&&!!p&&_nParole(p)<=9;
}
function _desiderioLiteParse(txt){
  let raw=String(txt||'').trim(); if(!raw) return null;
  try{ const j=_geminiStructuredJson(raw); if(j&&_desiderioPayloadOk(j)) return {cresta:j.cresta.map(x=>String(x).trim()),pietra:String(j.pietra).trim()}; }catch(_){}
  raw=raw.replace(/^```(?:text|txt)?\s*/i,'').replace(/```$/,'').trim();
  raw=raw.replace(/^[•*\-]\s*/gm,'')
         .replace(/\s*;\s*(?=(?:T[1-4]|P(?:IETRA)?)\s*[:.\-)])/gi,'\n')
         .replace(/\s+(?=(?:T[1-4]|P(?:IETRA)?)\s*[:.\-)])/gi,'\n');
  const righe=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const cresta=[], seen=new Set(); let pietra='';
  for(const r of righe){
    let m=r.match(/^T([1-4])\s*(?::|\-|\.|\))\s*(.+)$/i);
    if(m){ const n=Number(m[1]); if(seen.has(n)) return null; seen.add(n); cresta.push({n:n,t:m[2].trim()}); continue; }
    m=r.match(/^P(?:IETRA)?\s*(?::|\-|\.|\))\s*(.+)$/i);
    if(m){ if(pietra) return null; pietra=m[1].trim(); continue; }
    return null;
  }
  cresta.sort((a,b)=>a.n-b.n);
  if(cresta.some((x,i)=>x.n!==i+1)) return null;
  const out={cresta:cresta.map(x=>x.t),pietra:pietra};
  return _desiderioPayloadOk(out)?out:null;
}
function _desiderioFatalErr(e){ return ['chiave','offline','annullata','rete'].includes(String(e||'')); }
async function askDesiderioResult(testo,ostacolo){
  const des=clampStr(String(testo||'').trim(),240), ost=clampStr(String(ostacolo||'').trim(),240);
  if(!des||!ost) throw new Error('mancano dati');
  const chain=aiModels('desiderio'), salti=[]; let last='modello';
  for(const model of chain){
    const is37=model==='gemini-3.7-flash';
    const res=await aiCall({system:DESIDERIO_WIRE_SYS,
      user:'DATI (JSON):\n'+JSON.stringify({desiderio:des,ostacolo:ost}),
      task:'desiderio',models:[model],maxOutputTokens:900,reasoning:is37?'low':'minimal',timeout:is37?40000:30000,priority:20});
    if(!res.err){
      const out=_desiderioLiteParse(res.text);
      if(out) return {out:out,model:res.model||model,tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,
        salti:salti.concat(res.salti||[]).filter(Boolean).join(' '),wire:'linee'};
      last='schema';
    }else{
      last=res.err; if(_desiderioFatalErr(res.err)) throw new Error(res.err);
    }
    salti.push(model+':'+last);
  }
  throw new Error(last||'schema');
}
async function esprimiDesiderio(testo,ostacolo){
  let pack=null; try{ pack=await askDesiderioResult(testo,ostacolo); }catch(_){ return null; }
  const out=pack&&pack.out; if(!out) return null;
  const tk=todayKey();
  S.desiderio={id:coreUid(),testo:clampStr(testo,240),ostacolo:clampStr(ostacolo,240),nata:tk,
    cresta:(Array.isArray(out.cresta)?out.cresta:[]).map(x=>clampStr(String(x),120)).filter(Boolean).slice(0,4),
    pietre:[]};
  const q={id:coreUid(),titolo:clampStr(String(out.pietra),160),note:'',quando:tk,ora:'',prio:2,fatto:false,nata:tk,monte:S.desiderio.id};
  if(!Array.isArray(S.quests)) S.quests=[];
  S.quests.push(q); S.quests=sortQuests(S.quests); save();
  regCantiere('desiderio',{msg:'espresso: '+clampStr(testo,120)});
  try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
  return q.titolo;
}
function _pietraParse(txt){
  const t=String(txt||'').trim(); if(!t) return null;
  if(/^COMPIUTO[.!]?$/i.test(t)) return {compiuto:true};
  const m=t.match(/^PIETRA\s*:\s*(.+)$/i); if(!m) return null;
  const p=m[1].trim(); if(!p||_nParole(p)>9) return null;
  return {pietra:p,compiuto:false};
}
async function askPietraResult(){
  if(!S.desiderio) throw new Error('nessun desiderio');
  const res=await aiCall({system:PIETRA_SYS,
    user:'DATI (JSON):\n'+JSON.stringify({desiderio:S.desiderio.testo,ostacolo:S.desiderio.ostacolo,
      cresta:S.desiderio.cresta,pietre_spostate:(S.desiderio.pietre||[]).slice(-12)}),
    task:'pietra',maxOutputTokens:120,reasoning:'low',timeout:30000,priority:15});
  if(res.err) throw new Error(res.err);
  const out=_pietraParse(res.text); if(!out) throw new Error('schema');
  return {out:out,model:res.model||'',tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''};
}
async function prossimaPietra(){
  if(!S.desiderio) return null;
  const viva=_pietraViva(); if(viva) return viva.titolo;
  let pack=null; try{ pack=await askPietraResult(); }catch(_){ return null; }
  const out=pack&&pack.out;
  if(!out) return null;
  if(out.compiuto===true){
    regCantiere('desiderio',{msg:'la montagna e mossa: '+clampStr(S.desiderio.testo,100)});
    return 'COMPIUTO';
  }
  if(!out.pietra) return null;
  const tk=todayKey();
  const q={id:coreUid(),titolo:clampStr(String(out.pietra),160),note:'',quando:tk,ora:'',prio:2,fatto:false,nata:tk,monte:S.desiderio.id};
  S.quests.push(q); S.quests=sortQuests(S.quests); save();
  regCantiere('pietra',{msg:'posata: '+clampStr(q.titolo,100)});
  try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
  return q.titolo;
}
/* ══ LA STANZA DEL GIARDINO (v140 · memoria v142 · desiderio v143) — tieni premuta la notte e il mondo
   mostra cosa e cresciuto. Il fiume e il tempo: sorgente = 28 giorni fa, fuoco = oggi.
   v142: ogni pianta toccata racconta il SUO giorno con i fatti veri - i titoli compiuti,
   la riga di diario - e il velo parla in seconda persona. Vive SOLO da aperta. ══ */
function _stanzaDati(){
  const tk=todayKey(); const oggi=new Date(tk+'T12:00:00');
  const dEntry={}; (S.diary||[]).forEach(e=>{ if(e&&e.data){ dEntry[e.data]=e; } });   /* diary e newest-first: resta la voce PIU ANTICA del giorno */
  const qT={}; (S.questLog||[]).forEach(q=>{ if(q&&q.day&&!q.lasciata){ (qT[q.day]=qT[q.day]||[]).push(q.titolo); } });   /* v148 */
  const days=[]; let totF=0,totP=0;
  for(let diff=27;diff>=0;diff--){
    const d=new Date(oggi); d.setDate(d.getDate()-diff); const k=localDayKey(d); const dw=dowOf(d);
    const plan=scheduledFor(S,dw,k); const ck=(S.checks&&S.checks[k])||{};
    const fattiT=plan.filter(t=>ck[t.id]===true).map(t=>t.titolo);
    let prev,fatte;
    if(S.foto&&S.foto[k]){ prev=S.foto[k].tot||0; fatte=S.foto[k].done||0; }
    else{ prev=plan.length; fatte=fattiT.length; }
    totF+=fatte; totP+=prev;
    days.push({k:k,p:prev?Math.min(1,fatte/prev):null,diario:!!dEntry[k],
      quiete:((S.riposi&&S.riposi[k])||[]).length>0,q:(qT[k]||[]).length,
      fattiT:fattiT.slice(0,6),questT:(qT[k]||[]).slice(0,4),
      voce:dEntry[k]?clampStr(dEntry[k].testo,110):'',
      patto:!!(S.patti&&S.patti[k])});
  }
  let runs=0,somma=0;
  (S.scheduled||[]).forEach(t=>{
    if(!t||!t.days||!t.days.length) return;
    let miss=0;
    for(let diff=27;diff>=0;diff--){
      const d=new Date(oggi); d.setDate(d.getDate()-diff); const k=localDayKey(d);
      if(!t.days.includes(dowOf(d))) continue;
      if(S.checks&&S.checks[k]&&S.checks[k][t.id]===true){ if(miss>=1){runs++;somma+=miss;} miss=0; }
      else miss++;
    }
  });
  const primo=days[0].k;
  return {days:days,
    fioriture:{fatte:totF,previste:totP,patti:Object.keys(S.patti||{}).filter(k=>k>=primo).length},
    lucciole:{giorni:days.filter(x=>x.diario).length,voci:(S.diary||[]).filter(e=>e&&e.data>=primo).length},
    ricrescite:{n:runs,media:runs?Math.round(somma/runs*10)/10:0}};
}
function _stanzaNomeGiorno(k){
  try{
    const d=new Date(k+'T12:00:00');
    const G=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
    const M=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
    return G[d.getDay()]+' '+d.getDate()+' '+M[d.getMonth()];
  }catch(_){ return k; }
}
let _stanzaViva=null;
function _stanzaChiudi(){
  if(!_stanzaViva) return;
  try{ cancelAnimationFrame(_stanzaViva.raf); }catch(_){}
  try{ _stanzaViva.el.remove(); }catch(_){}
  _stanzaViva=null;
}
function _stanzaApri(){
  if(_stanzaViva) return;
  try{ const sel=window.getSelection&&window.getSelection(); if(sel&&sel.removeAllRanges) sel.removeAllRanges(); }catch(_){}   /* v144: nessuna selezione residua sotto la stanza */
  const dati=_stanzaDati(); const GG=dati.days;
  const el=document.createElement('div'); el.id='giardino';
  const num=function(v){ return String(v).replace('.',','); };
  const IW=['zero','una','due','tre','quattro','cinque','sei','sette','otto','nove','dieci'];
  const mR=dati.ricrescite.media, mRp=mR>0&&mR<=10?(mR<=1.5?'subito, alla prima occasione':'di solito entro '+(IW[Math.round(mR)]||Math.round(mR))+' occasioni'):'';
  el.innerHTML='<canvas></canvas>'
   +'<button id="giardino-x" aria-label="chiudi">&times;</button>'
   +'<div id="giardino-velo">'
   +'<div class="frase">in queste quattro settimane hai compiuto <b>'+dati.fioriture.fatte+'</b> dei <b>'+dati.fioriture.previste+'</b> passi che ti eri promesso'+(dati.fioriture.patti?', e tenuto <b>'+(IW[dati.fioriture.patti]||dati.fioriture.patti)+'</b> patti del mattino':'')+'.</div>'
   +'<div class="frase">hai dato voce al diario <b>'+dati.lucciole.giorni+'</b> notti su ventotto — <b>'+dati.lucciole.voci+'</b> voci: le lucciole del giardino.</div>'
   +'<div class="frase">dopo le cadute sei tornato <b>'+dati.ricrescite.n+'</b> volte'+(mRp?', '+mRp:'')+'. nessun contatore di serie sa vederlo: il giardino sì.</div>'
   +'<div class="firma">tocca una pianta: il suo giorno ricorda \u00b7 quando passa una stella cadente, toccala</div>'
   +'</div>'
   +'<div id="giardino-giorno"></div>'+'<div id="giardino-rito"></div>';
  document.body.appendChild(el);
  el.querySelector('#giardino-x').addEventListener('click',_stanzaChiudi);
  el.addEventListener('touchmove',function(e){ e.preventDefault(); },{passive:false});
  const cv=el.querySelector('canvas'); const ctx2=cv.getContext('2d');
  const DPR=Math.min(2,devicePixelRatio||1);
  let W=innerWidth,H2=innerHeight;
  cv.width=W*DPR; cv.height=H2*DPR; ctx2.setTransform(DPR,0,0,DPR,0,0);
  /* v238 — IL GIARDINO A INCHIOSTRO, SENZA FILTRI.
     Era l'ultimo mondo rimasto a invert(), e si vedeva: una macchia bruna e i
     colori ribaltati. Ma il giardino disegna con QUATTRO colori dichiarati qui
     sopra: non serve ribaltare l'immagine, bastano altri quattro colori.
     Cosi le piante restano linee - che e quello che sono - e diventano tratti
     d'inchiostro su carta, come una tavola botanica. Il cuore chiaro delle luci
     (CORE2) sulla carta diventa il punto PIU SCURO: e il rovescio esatto, perche
     su carta il centro di un segno e dove l'inchiostro si deposita di piu. */
  const _inkG=(function(){ try{ const c=document.body.classList;
    return c.contains('theme-lcd')&&c.contains('ink-giardino'); }catch(_){ return false; } })();
  const ORO   = _inkG?'184,150,88' :'232,188,106';
  const AMBRA2= _inkG?'171,112,70' :'196,124,38';
  const CIELO2= _inkG?'112,145,166':'159,196,232';
  const CORE2 = _inkG?'205,201,190':'255,244,214';
  const rr=function(a,b){ return a+Math.random()*(b-a); };
  function corso(t){ return {x:W*(0.22+0.56*t)+Math.sin(t*Math.PI*2.2)*W*0.16, y:H2*0.06+t*H2*0.78}; }
  function tang(t){ const a=corso(Math.max(0,t-0.01)), b=corso(Math.min(1,t+0.01));
    const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy)||1; return {x:dx/L,y:dy/L}; }
  const FUOCO=corso(1);
  const stelle=[]; for(let i=0;i<60;i++) stelle.push({x:Math.random(),y:Math.random(),r:rr(0.4,1.1),f:rr(1,4)});
  const acqua=[]; for(let i=0;i<120;i++) acqua.push({t:Math.random(),v:rr(0.00035,0.0009),off:rr(-1,1),r:rr(0.5,1.6),h:Math.random()});
  let scint=[]; let scelto=-1;
  let meteora=null,metNext=performance.now()+7000+Math.random()*10000;
  const CAIRN={x:FUOCO.x-Math.min(W,H2)*0.17,y:FUOCO.y+Math.min(W,H2)*0.03};
  const piante=GG.map(function(g,i){
    const t=0.04+0.92*(i/(GG.length-1));
    const p0=corso(t), tg=tang(t), lato=(i%2?1:-1);
    const nx=-tg.y*lato, ny=tg.x*lato;
    const larg=Math.min(W,520)*0.10+Math.abs(Math.sin(t*9))*8;
    return {g:g,bx:p0.x+nx*larg,by:p0.y+ny*larg,nx:nx,ny:ny,
      h:g.p==null?7:10+g.p*Math.min(H2*0.055,46),fase:rr(0,9),nasce:500+i*80};
  });
  function giornoParla(i){
    scelto=i; const g=GG[i]; const box=el.querySelector('#giardino-giorno');
    const forma=g.p==null?'nessun passo previsto':g.p>=0.99?'giornata piena':g.p>=0.5?'giornata quasi piena':g.p>0?'qualche passo':'giornata vuota';
    let hh='<div class="g-testa">'+_stanzaNomeGiorno(g.k)+' — '+forma+(g.quiete?' · quiete voluta':'')+(g.patto?' · patto tenuto':'')+'</div>';
    const fatti=g.fattiT.concat(g.questT);
    if(fatti.length) hh+='<div class="g-fatti">'+fatti.map(function(t){return '<span>'+String(t).replace(/</g,'&lt;')+'</span>';}).join('')+'</div>';
    if(g.voce) hh+='<div class="g-voce">&laquo;'+String(g.voce).replace(/</g,'&lt;')+'&raquo;</div>';
    if(!fatti.length&&!g.voce) hh+='<div class="g-voce muto">questo giorno non ha lasciato tracce scritte — ma il fiume l\\u2019ha attraversato comunque</div>';
    box.innerHTML=hh; box.classList.add('on'); el.classList.remove('svelato');
  }
  function ritoChiudi(){ const r=el.querySelector('#giardino-rito'); r.classList.remove('on'); r.innerHTML=''; }
  function ritoApri(){
    if(S.desiderio){ cardDesiderio(); return; }
    const r=el.querySelector('#giardino-rito');

    /* v226 — LA PORTA CHE SI APRIVA SUL VUOTO.
       esprimiDesiderio() chiama il modello e non ha nessun motore di casa: e
       l'unica cosa in tutta l'app rimasta cosi. Senza chiave la persona scriveva
       il desiderio piu grande che ha, scriveva cosa l'ha fermata finora, toccava
       «Comincia» - e il tasto rispondeva «non ha funzionato - riprova».
       Le si chiedeva la cosa piu difficile da dire, per poi non ascoltarla.
       Un rifiuto detto prima e meno peggio di un fallimento dopo: adesso la
       porta dice cos'e, e non fa scrivere niente a vuoto. */
    if(typeof generativa==='function' && !generativa()){
      r.innerHTML='<div class="r-box">'
       +'<div class="r-t">'+T('la cosa grande che vuoi')+'</div>'
       +'<div class="r-l" style="margin-top:10px;line-height:1.6">'
       +T('Questa ha bisogno della chiave. Serve qualcuno che sappia prendere una montagna e ricavarne il primo passo, quello piccolo abbastanza da farlo oggi — e senza chiave l’app non lo sa fare abbastanza bene da meritarsi la tua risposta.')
       +'</div>'
       +'<div class="r-l" style="margin-top:12px;line-height:1.6">'
       +T('Tutto il resto di Sentiero funziona senza.')
       +'</div>'
       +'<div class="r-b"><button id="r-no">'+T('ho capito')+'</button></div>'
       +'</div>';
      r.classList.add('on');
      r.querySelector('#r-no').addEventListener('click',ritoChiudi);
      return;
    }

    r.innerHTML='<div class="r-box">'
     +'<div class="r-t">la cosa grande che vuoi</div>'
     +'<div class="r-l">scrivila con parole tue</div>'
     +'<textarea id="r-des" rows="2"></textarea>'
     +'<div class="r-l">cosa te lo ha impedito, finora?</div>'
     +'<textarea id="r-ost" rows="2"></textarea>'
     +'<div class="r-b"><button id="r-va">Comincia</button><button id="r-no">non ora</button></div>'
     +'</div>';
    r.classList.add('on');
    r.querySelector('#r-no').addEventListener('click',ritoChiudi);
    r.querySelector('#r-va').addEventListener('click',async function(){
      const t1=r.querySelector('#r-des').value.trim(), t2=r.querySelector('#r-ost').value.trim();
      if(!t1){ r.querySelector('#r-des').focus(); return; }
      const b=this; b.disabled=true; b.textContent='un attimo\u2026';
      let esito=null; try{ esito=await esprimiDesiderio(t1,t2); }catch(_){}
      if(esito){ ritoChiudi(); try{ toast('Il primo passo: \u00ab'+esito+'\u00bb \u2014 \u00e8 tra le cose di oggi.'); }catch(_){} }
      else{ b.disabled=false; b.textContent='non ha funzionato \u2014 riprova'; }
    });
  }
  function cardDesiderio(){
    if(!S.desiderio){ ritoApri(); return; }
    const d=S.desiderio, box=el.querySelector('#giardino-giorno');
    const viva=_pietraViva(); const n=(d.pietre||[]).length;
    let hh='<div class="g-testa">quello che vuoi \u2014 da '+_stanzaNomeGiorno(d.nata)+'</div>'
     +'<div class="g-voce">\u00ab'+String(d.testo).replace(/</g,'&lt;')+'\u00bb</div>';
    if(d.cresta&&d.cresta.length) hh+='<div class="g-cresta">'+d.cresta.map(function(c){return '<i>'+String(c).replace(/</g,'&lt;')+'</i>';}).join(' \u00b7 ')+'</div>';
    hh+='<div class="g-fatti"><span>'+n+' passi fatti</span>'
      +(viva?'<span class="pv">il passo di adesso: '+String(viva.titolo).replace(/</g,'&lt;')+'</span>':'')+'</div>';
    const arch=(S.desideri||[]);
    if(arch.length){
      const np=arch.reduce((a,x)=>a+((x.pietre||[]).length),0);
      hh+='<div class="g-cresta" style="opacity:.5">prima di questo: '+arch.length+(arch.length===1?' desiderio':' desideri')+', '+np+(np===1?' passo fatto':' passi fatti')+'</div>';
    }
    /* v159: tre uscite, non due. «e cambiato» e la terza, ed e quella vera quasi sempre:
       i passi spostano la persona, e la persona sposta il desiderio. Non e una resa. */
    hh+='<div class="g-azioni" id="d-azioni">'
      +(!viva?'<button id="d-posa">il prossimo passo</button>':'')
      +'<button id="d-fatto">\u00e8 compiuto</button>'
      +'<button id="d-cambia">\u00e8 cambiato</button>'
      +'<button id="d-via">lascia andare</button></div>';
    box.innerHTML=hh; box.classList.add('on'); el.classList.remove('svelato');
    const bp=box.querySelector('#d-posa');
    if(bp) bp.addEventListener('click',async function(){
      this.disabled=true; this.textContent='un attimo\u2026';
      let t=null; try{ t=await prossimaPietra(); }catch(_){}
      if(t==='COMPIUTO'){ box.classList.remove('on'); S.desiderio=null; save(); try{ toast('Fatto davvero.'); }catch(_){} }
      else if(t){ cardDesiderio(); try{ toast('Posata: \u00ab'+t+'\u00bb'); }catch(_){} }
      else{ this.disabled=false; this.textContent='riprova'; }
    });
    /* v159: la conferma era il bottone stesso che diventava una domanda, e non c'era nessun «si»
       da premere: chi tocca una volta resta li a guardare una domanda senza risposta - ed e il
       motivo per cui un desiderio lasciato andare il 28 luglio era ancora al suo posto il 29.
       Ora la domanda e una domanda, e sotto ci sono due bottoni veri. */
    function chiedi(domanda,etichetta,poi){
      const az=box.querySelector('#d-azioni'); if(!az) return;
      az.innerHTML='<div class="g-voce" style="margin:0 0 8px">'+domanda+'</div>'
        +'<button id="d-si">'+etichetta+'</button><button id="d-no">annulla</button>';
      az.querySelector('#d-no').addEventListener('click',function(){ cardDesiderio(); });
      az.querySelector('#d-si').addEventListener('click',function(){ this.disabled=true; poi(); });
    }
    box.querySelector('#d-fatto').addEventListener('click',function(){
      chiedi('\u00e8 fatta davvero?','s\u00ec, \u00e8 fatta',function(){
        const n=archiviaDesiderio('compiuto'); box.classList.remove('on');
        try{ toast('Fatta. '+n+(n===1?' passo resta':' passi restano')+' salvati.'); }catch(_){}
      });
    });
    box.querySelector('#d-cambia').addEventListener('click',function(){
      chiedi('\u00e8 cambiato: i passi gi\u00e0 fatti restano, e ne scrivi uno nuovo.','s\u00ec, ne scrivo un altro',function(){
        const n=archiviaDesiderio('cambiato'); box.classList.remove('on');
        try{ toast(n+(n===1?' passo resta':' passi restano')+' salvati. Scrivi il nuovo.'); }catch(_){}
        ritoApri();
      });
    });
    box.querySelector('#d-via').addEventListener('click',function(){
      chiedi('lo lasci andare? i passi fatti restano salvati.','s\u00ec, lascio andare',function(){
        const n=archiviaDesiderio('lasciato'); box.classList.remove('on');
        try{ toast('Lasciato andare. '+n+(n===1?' passo resta':' passi restano')+' salvati.'); }catch(_){}
      });
    });
  }
  el.addEventListener('pointerdown',function(e){
    if(e.target&&(e.target.id==='giardino-x'||e.target.closest&&e.target.closest('#giardino-giorno,#giardino-rito,#giardino-rito *'))) return;
    const px=e.clientX, py=e.clientY;
    if(meteora&&meteora.px!=null&&Math.hypot(px-meteora.px,py-meteora.py)<48){ ritoApri(); return; }
    /* v159: il cerchio del cairn apre sempre. Prima, senza desiderio, l'unica porta era la stella
       cadente: 4,2 secondi ogni 16-38, e con le animazioni ridotte non passava MAI - chi ha il
       risparmio di moto attivo non poteva esprimere un desiderio, mai. */
    if(Math.hypot(px-CAIRN.x,py-CAIRN.y)<34){ if(S.desiderio) cardDesiderio(); else ritoApri(); return; }
    let best=-1,bd=1e9;
    for(let i=0;i<piante.length;i++){ const pl=piante[i];
      const tx=pl.bx+pl.nx*pl.h, ty=pl.by+pl.ny*pl.h;
      const d1=Math.hypot(px-pl.bx,py-pl.by), d2=Math.hypot(px-tx,py-ty);
      const d=Math.min(d1,d2); if(d<bd){ bd=d; best=i; } }
    if(best>=0&&bd<=30){ giornoParla(best); return; }
    const box=el.querySelector('#giardino-giorno');
    if(box.classList.contains('on')){ box.classList.remove('on'); scelto=-1; return; }
    el.classList.toggle('svelato');
  });
  const RIDOTTO=(function(){ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches&&!(S.settings&&S.settings.anim==='sempre'); }catch(_){ return false; } })();
  const T0=performance.now();
  function eBack(x){ const c=1.7; return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2); }
  function quadro(now){
    const T=RIDOTTO?99999:(now-T0);
    ctx2.fillStyle=_inkG?'#151612':'#070a09'; ctx2.fillRect(0,0,W,H2);   /* LCD: grafite, OLED: notte */
    for(let i=0;i<stelle.length;i++){ const s=stelle[i];
      ctx2.fillStyle='rgba('+CORE2+','+(_inkG?0.30:(0.25+0.3*Math.abs(Math.sin(now/1000/s.f))))+')';
      ctx2.beginPath(); ctx2.arc(s.x*W,s.y*H2,s.r,0,7); ctx2.fill(); }
    if(!_inkG){ for(let k=0;k<=30;k++){ const p=corso(k/30);
      const gr=ctx2.createRadialGradient(p.x,p.y,0,p.x,p.y,26);
      gr.addColorStop(0,'rgba('+CIELO2+',0.045)'); gr.addColorStop(1,'rgba(0,0,0,0)');
      ctx2.fillStyle=gr; ctx2.beginPath(); ctx2.arc(p.x,p.y,26,0,7); ctx2.fill(); } }
    for(let i=0;i<acqua.length;i++){ const f=acqua[i];
      if(!RIDOTTO){ f.t+=f.v; if(f.t>1){ f.t=0; f.off=rr(-1,1); } }
      const p=corso(f.t), tg=tang(f.t), sp=Math.sin(now/700+f.off*7)*4;
      const x=p.x+(-tg.y)*(f.off*13+sp), y=p.y+tg.x*(f.off*13+sp);
      const vic=Math.max(0,1-Math.hypot(x-FUOCO.x,y-FUOCO.y)/(H2*0.3));
      const col=f.h<0.55?CIELO2:(f.h<0.85?CORE2:ORO);
      ctx2.fillStyle='rgba('+col+','+(0.25+0.35*f.t+vic*0.3)+')';
      ctx2.beginPath(); ctx2.arc(x,y,f.r+vic*0.8,0,7); ctx2.fill(); }
    const puls=_inkG?1:(1+0.08*Math.sin(now/430)+0.03*Math.sin(now/97));
    const R=Math.min(W,H2)*0.055*puls;
    if(_inkG){
      ctx2.fillStyle='rgba('+ORO+',0.48)'; ctx2.beginPath(); ctx2.arc(FUOCO.x,FUOCO.y,3.4,0,7); ctx2.fill();
      ctx2.strokeStyle='rgba('+ORO+',0.25)'; ctx2.lineWidth=1; ctx2.beginPath(); ctx2.arc(FUOCO.x,FUOCO.y,R*1.12,0,7); ctx2.stroke();
    }else{
      const gf=ctx2.createRadialGradient(FUOCO.x,FUOCO.y,0,FUOCO.x,FUOCO.y,R*3.2);
      gf.addColorStop(0,'rgba('+CORE2+',0.9)'); gf.addColorStop(0.25,'rgba('+ORO+',0.55)');
      gf.addColorStop(0.6,'rgba('+AMBRA2+',0.18)'); gf.addColorStop(1,'rgba(0,0,0,0)');
      ctx2.fillStyle=gf; ctx2.beginPath(); ctx2.arc(FUOCO.x,FUOCO.y,R*3.2,0,7); ctx2.fill();
    }
    for(let i=0;i<piante.length;i++){ const pl=piante[i], g=pl.g;
      const vita=Math.min(1,Math.max(0,(T-pl.nasce)/700)); if(vita<=0) continue;
      const cre=eBack(vita), ond=RIDOTTO?0:Math.sin(now/900+pl.fase)*2.4;
      const tx=pl.bx+pl.nx*pl.h*cre+ond, ty=pl.by+pl.ny*pl.h*cre;
      if(i===scelto){ if(_inkG){ ctx2.strokeStyle='rgba('+CORE2+',0.24)'; ctx2.lineWidth=1; ctx2.beginPath(); ctx2.arc(pl.bx,pl.by,18,0,7); ctx2.stroke(); } else { ctx2.fillStyle='rgba('+CORE2+',0.10)'; ctx2.beginPath(); ctx2.arc(pl.bx,pl.by,22,0,7); ctx2.fill(); } }
      if(g.p===0){
        ctx2.strokeStyle='rgba(120,95,60,0.55)'; ctx2.lineWidth=1.4; ctx2.beginPath();
        ctx2.moveTo(pl.bx,pl.by);
        ctx2.quadraticCurveTo(pl.bx+pl.nx*8,pl.by+pl.ny*8,pl.bx+pl.nx*10+6,pl.by+pl.ny*10+3); ctx2.stroke();
      }else{
        const al=g.p==null?0.3:0.35+g.p*0.5;
        ctx2.strokeStyle='rgba('+ORO+','+(al*0.7)+')'; ctx2.lineWidth=1.2;
        ctx2.beginPath(); ctx2.moveTo(pl.bx,pl.by);
        ctx2.quadraticCurveTo(pl.bx+pl.nx*pl.h*0.5+ond*0.5,pl.by+pl.ny*pl.h*0.5,tx,ty); ctx2.stroke();
        if(g.p!=null&&g.p>=0.99){
          for(let k=0;k<6;k++){ const a=now/2600+k/6*6.2832;
            ctx2.fillStyle='rgba('+ORO+',0.85)'; ctx2.beginPath();
            ctx2.arc(tx+Math.cos(a)*4.6,ty+Math.sin(a)*4.6,1.7,0,7); ctx2.fill(); }
          ctx2.fillStyle='rgba('+CORE2+',0.95)'; ctx2.beginPath(); ctx2.arc(tx,ty,2.4,0,7); ctx2.fill();
          if(!RIDOTTO&&Math.random()<0.004) scint.push({x:tx,y:ty,vx:-pl.nx*rr(0.2,0.5),vy:-pl.ny*rr(0.2,0.5)+0.15,a:1});
        }else{
          ctx2.fillStyle='rgba('+((g.p!=null&&g.p>=0.5)?ORO:CORE2)+','+al+')';
          ctx2.beginPath(); ctx2.arc(tx,ty,g.p==null?1.2:1.2+g.p*2,0,7); ctx2.fill();
        }
      }
      if(g.quiete){ ctx2.fillStyle='rgba('+CIELO2+',0.3)'; ctx2.beginPath(); ctx2.arc(pl.bx+6,pl.by+2,2,0,7); ctx2.fill(); }
      if(g.q){ ctx2.fillStyle='rgba('+CORE2+',0.9)'; ctx2.beginPath(); ctx2.arc(pl.bx-6,pl.by-3,1.8,0,7); ctx2.fill(); }
      if(g.diario){
        const lx=pl.bx+pl.nx*(pl.h+14)+(RIDOTTO?0:Math.sin(now/1100+pl.fase)*6);
        const ly=pl.by+pl.ny*(pl.h+14)+(RIDOTTO?0:Math.cos(now/1300+pl.fase)*5);
        ctx2.fillStyle='rgba('+CIELO2+','+(0.5+0.4*Math.sin(now/500+pl.fase))+')';
        ctx2.beginPath(); ctx2.arc(lx,ly,1.7,0,7); ctx2.fill();
        if(!_inkG){ ctx2.fillStyle='rgba('+CIELO2+',0.12)'; ctx2.beginPath(); ctx2.arc(lx,ly,5,0,7); ctx2.fill(); }
      }
    }
    /* v159: senza desiderio resta comunque un segno tappabile: il posto dove poggerebbe la prima pietra */
    if(!S.desiderio){
      if(!_inkG){ const gv=ctx2.createRadialGradient(CAIRN.x,CAIRN.y,0,CAIRN.x,CAIRN.y,26);
        gv.addColorStop(0,'rgba('+ORO+',0.055)'); gv.addColorStop(1,'rgba(0,0,0,0)');
        ctx2.fillStyle=gv; ctx2.beginPath(); ctx2.arc(CAIRN.x,CAIRN.y,26,0,7); ctx2.fill(); }
      ctx2.strokeStyle='rgba('+ORO+',0.30)'; ctx2.lineWidth=0.9; ctx2.setLineDash([2,4]);
      ctx2.beginPath(); ctx2.ellipse(CAIRN.x,CAIRN.y,9,4.5,0,0,7); ctx2.stroke(); ctx2.setLineDash([]);
    }
    /* l'ometto di pietre: il desiderio che si muove, una pietra alla volta */
    if(S.desiderio){
      const n=(S.desiderio.pietre||[]).length;
      if(!_inkG){ const gl=ctx2.createRadialGradient(CAIRN.x,CAIRN.y,0,CAIRN.x,CAIRN.y,30);
        gl.addColorStop(0,'rgba('+ORO+',0.10)'); gl.addColorStop(1,'rgba(0,0,0,0)');
        ctx2.fillStyle=gl; ctx2.beginPath(); ctx2.arc(CAIRN.x,CAIRN.y,30,0,7); ctx2.fill(); }
      if(n===0){ ctx2.strokeStyle='rgba('+ORO+',0.5)'; ctx2.setLineDash([2,3]);
        ctx2.beginPath(); ctx2.ellipse(CAIRN.x,CAIRN.y,8,4,0,0,7); ctx2.stroke(); ctx2.setLineDash([]); }
      let resto=Math.min(n,21), fila=0, yF=CAIRN.y;
      while(resto>0){ const inFila=Math.min(6-fila,resto);
        for(let j=0;j<inFila;j++){ const xs=CAIRN.x+(j-(inFila-1)/2)*9;
          ctx2.fillStyle=_inkG?'#25261F':'#2c2820'; ctx2.strokeStyle='rgba('+ORO+',0.45)';   /* i sassi */ ctx2.lineWidth=0.8;
          ctx2.beginPath(); ctx2.ellipse(xs,yF,4.6,3,0,0,7); ctx2.fill(); ctx2.stroke(); }
        resto-=inFila; fila++; yF-=5.4; if(fila>5) break; }
      if(n>21){ ctx2.fillStyle='rgba('+CORE2+',0.8)'; ctx2.font='9px sans-serif'; ctx2.textAlign='center';
        ctx2.fillText(String(n),CAIRN.x,CAIRN.y+14); }
    }
    /* la stella cadente: si esprime un desiderio, come si e sempre fatto */
    if(!RIDOTTO){
      if(!meteora&&now>metNext){ meteora={y0:H2*(0.06+Math.random()*0.22),t0:now,dur:4200,px:null,py:null}; }
      if(meteora){
        const e2=(now-meteora.t0)/meteora.dur;
        if(e2>1){ meteora=null; metNext=now+16000+Math.random()*22000; }
        else{
          meteora.px=-30+(W+70)*e2; meteora.py=meteora.y0+H2*0.05*e2;
          let g3=null; if(!_inkG){ g3=ctx2.createLinearGradient(meteora.px-64,meteora.py-8,meteora.px,meteora.py);
            g3.addColorStop(0,'rgba('+CORE2+',0)'); g3.addColorStop(1,'rgba('+CORE2+',0.75)'); }
          ctx2.strokeStyle=_inkG?('rgba('+CORE2+',0.30)'):g3; ctx2.lineWidth=_inkG?0.9:1.6; ctx2.beginPath();
          ctx2.moveTo(meteora.px-64,meteora.py-8); ctx2.lineTo(meteora.px,meteora.py); ctx2.stroke();
          ctx2.fillStyle='rgba('+CORE2+','+(_inkG?0.55:0.95)+')'; ctx2.beginPath(); ctx2.arc(meteora.px,meteora.py,_inkG?1.5:2.2,0,7); ctx2.fill();
        }
      }
    }
    const vive=[];
    for(let i=0;i<scint.length;i++){ const s=scint[i];
      s.x+=s.vx; s.y+=s.vy; s.a*=0.985; if(s.a>0.02) vive.push(s);
      ctx2.fillStyle='rgba('+ORO+','+s.a+')'; ctx2.beginPath(); ctx2.arc(s.x,s.y,1.3,0,7); ctx2.fill(); }
    scint=vive;
    if(_stanzaViva) _stanzaViva.raf=requestAnimationFrame(quadro);
  }
  _stanzaViva={el:el,raf:requestAnimationFrame(quadro)};
  regCantiere('stanza',{msg:GG.length+' giorni, '+dati.fioriture.fatte+'/'+dati.fioriture.previste});
}
(function(){
  let hT=null,hx=0,hy=0;
  /* v258 — IL GIARDINO SI APRE SOLO DAL MONDO.
     Prima questa funzione elencava i posti da cui NON si doveva aprire, e la
     lista non poteva che essere incompleta: dentro le impostazioni, tenendo
     premuta una riga per cancellarla, si spalancava il giardino. Una lista di
     eccezioni difende solo i casi che qualcuno si e ricordato di scrivere.
     Adesso e il contrario: si apre da un posto solo, il mondo - cioe fuori dal
     foglio, dove ci sono il cielo e il cerchio. Dentro il foglio non si apre
     mai, qualunque cosa ci mettiamo domani. */
  function nelMondo(e){
    const el=e.target; if(!el||!el.closest) return el===document.body;
    if(document.body.getAttribute('data-pane')==='impostazioni') return false;
    if(el.closest('#app,#giardino,#stanza,dialog,#onboard,#soglia,#frutto-soglia,#tour,#obs-whisper')) return false;
    return !el.closest('button,input,textarea,select,a,label,.chk,#mic');
  }
  window.addEventListener('pointerdown',function(e){
    if(_stanzaViva||!nelMondo(e)) return;
    try{ document.body.classList.add('no-sel'); }catch(_){}   /* v144: si spegne la selezione PRIMA che iOS decida */
    hx=e.clientX; hy=e.clientY; clearTimeout(hT);
    hT=setTimeout(function(){ hT=null; try{ _stanzaApri(); }catch(_){} },700);
  },{passive:true});
  window.addEventListener('pointermove',function(e){
    if(hT&&(Math.abs(e.clientX-hx)>12||Math.abs(e.clientY-hy)>12)){ clearTimeout(hT); hT=null; }
  },{passive:true});
  ['pointerup','pointercancel'].forEach(function(ev){
    window.addEventListener(ev,function(){ clearTimeout(hT); hT=null; try{ document.body.classList.remove('no-sel'); }catch(_){} },{passive:true});
  });
})();

let _lineTimer=null,_lineToken=0,_lineAbort=null;
/* ══ IL SUSSURRO DI CASA (v210) ═════════════════════════════════════════════
   La riga che nasce quando spunti una cosa. E il momento piu toccato dell'app,
   e senza chiave non c'era: observerLineFor usciva subito, in silenzio.

   Qui la regola non e «parla piu spesso che puoi», e il contrario. Il contratto
   del sussurro dice che UNO SPECCHIO VALE SOLO SE CHIUDE UN FILO PIU VECCHIO DI
   OGGI: senza un filo la riga e solo eco - ti dice che hai fatto la cosa che
   sai di aver fatto. Il pacchetto lo costruisce gia il telefono da solo, senza
   rete: dentro ci sono i fili veri. Se non ce n'e uno, si tace.

   Quindi questo sussurro parla di rado, ed e giusto cosi. Su una spunta
   qualunque non ha niente da dire, e dirlo lo stesso sarebbe rumore. */
function _sussFilo(pkg){
  if(!pkg) return null;
  /* il ritorno: la cosa era mancata piu volte di fila, e oggi e passata */
  if(pkg.ritorno) return {t:'ritorno'};
  /* le sue parole esatte sull'attrito, e oggi l'ha fatta lo stesso */
  if(pkg.attrito_nominato){
    const f=String(pkg.attrito_nominato).split(': ').slice(1).join(': ').trim();
    if(f) return {t:'attrito',parole:f};
  }
  /* la promessa di stamattina, se riguardava proprio questa */
  const p=pkg.patto_di_stamattina;
  if(p&&p.riguarda_questo_task) return {t:'patto'};
  return null;
}
function _sussForme(f,titolo){
  const c=_ossMinuscolo(titolo||'');
  switch(f&&f.t){
    case 'ritorno': return [
      c+' era mancata piu volte di fila. oggi e passata.',
      'oggi '+c+' torna al suo posto. era rimasta indietro a lungo.'];
    case 'attrito': return [
      'di questa avevi scritto «'+_ossMinuscolo(f.parole)+'». oggi e passata lo stesso.',
      '«'+_ossMinuscolo(f.parole)+'», dicevi. e invece eccola.'];
    case 'patto': return [
      'era la promessa di stamattina. tenuta.',
      'l’avevi messa davanti stamattina. adesso e chiusa.'];
  }
  return [];
}
function sussurroServeGemini(pkg){
  if(!pkg) return false;
  if(_sussFilo(pkg)) return true;
  if(pkg.pietra_del_desiderio||pkg.rientro_da_ferie||pkg.nota_utente||pkg.fuori_piano) return true;
  if(pkg.seme_piantato) return true;
  if(pkg.quest_nata&&pkg.quest_nata!=='oggi'&&pkg.quest_nata!=='ignota') return true;
  if(Array.isArray(pkg.diario_pertinente)&&pkg.diario_pertinente.some(v=>v&&v.scritto&&!/^oggi\b/.test(v.scritto)&&!/data ignota/.test(v.scritto)&&!/aggancio debole/.test(v.per||''))) return true;
  if(pkg.arco_quattro_settimane){
    const parti=String(pkg.arco_quattro_settimane).split(':').slice(1).join(':').split('·').map(x=>x.trim()).filter(Boolean);
    if(new Set(parti).size>=2) return true;
  }
  return false;
}
function sussurroLocale(pkg,titolo){
  try{
    const f=_sussFilo(pkg);
    if(!f) return '';                                  /* nessun filo: silenzio, ed e la regola */
    const mem=(S.obsLines||[]).map(x=>x&&x.riga).filter(Boolean);
    for(const r of _sussForme(f,titolo)){
      if(!r) continue;
      if(/\s[—–-]\s/.test(r)) continue;
      /* v262 — LA CIFRA SI CERCAVA UNA RIGA TROPPO PRESTO.
         Il controllo stava QUI, sulla riga cruda, mentre la riga col titolo
         sostituito nasce nella riga dopo. Due sole forme del sussurro incollano
         il titolo dentro (quelle del ritorno), e per chi chiama la sua cosa
         «10 000 passi» morivano tutte e due, in silenzio. Il divieto
         non si e tolto: si e spostato di una riga, dentro il giudice, dove
         guarda «nostro» come tutte le altre misure. */
      const nostro=titolo?r.split(_ossMinuscolo(titolo)).join('quella'):r;
      if(_ossGiudica(nostro,[],[titolo])) continue;
      if(mem.some(m=>m&&_ossScheletro(m)===_ossScheletro(r))) continue;
      return r;
    }
  }catch(_){}
  return '';
}


/* ══ IL GIUDICE DAVANTI ANCHE AL MODELLO (v213) ══════════════════════════════
   Fino alla v212 il motore locale aveva un controllo di qualita PIU SEVERO di
   quello generativo. Il motore di casa passa da _ossGiudica prima di mostrare
   una riga; il frutto del modello passa da fruttoVeto; ma il sussurro e la nota
   della sera scritti dal modello andavano dritti sullo schermo, senza che
   nessuno li leggesse.

   Misurato sulle 138 righe vere che il modello ha scritto nei backup:
     · il 59% ha un TRATTINO, che i suoi stessi prompt vietano
     · il 67% e un FIATO UNICO: una riga lunga e mai un punto in mezzo
     · solo l'8% e da buttare davvero

   Quindi non si butta: si RIPARA. Il trattino diventa un punto - che e proprio
   il ricambio che il prompt chiede - e la parola dopo torna minuscola. Sulle
   righe vere: trattini dal 59% allo 0%, fiato unico dal 67% al 12%.

   Si butta solo cio che non si puo aggiustare senza riscrivere: un'esclamazione,
   un'emoji, una prescrizione, piu di un numero. Quelle sono violazioni del
   contratto, non difetti di forma, e il silenzio e meglio.

   NOTA ONESTA sulle misure: dopo la riparazione R14 e R11 salgono, ma non e un
   peggioramento. Sono due regole che si applicano solo alle righe di piu frasi,
   e prima quelle righe erano una frase sola: cambia la platea, non il testo. */
function raffinaRiga(t){
  let r=String(t||'').trim();
  if(!r) return '';
  r=r.replace(/\s+[—–]\s+/g,'. ').replace(/\s+-\s+/g,'. ');
  r=r.replace(/\.\s*\./g,'.');
  /* Lab 24: prima di cestinare una riga buona per un'etichetta storica,
     traduciamo SOLO il gergo che ha un equivalente innocuo e univoco. */
  r=r.replace(/\bgiornata rara\b/gi,'giornata quasi vuota')
     .replace(/\bsettimana rara\b/gi,'settimana quasi vuota')
     .replace(/\bgiorni rari\b/gi,'giorni quasi vuoti')
     .replace(/\bseme piantato\b/gi,'domanda lasciata')
     .replace(/\bpattern\b/gi,'andamento')
     .replace(/\brituale\b/gi,'abitudine');
  r=r.replace(/\.\s+([A-ZÀ-Ý])/g,(m,c)=>'. '+c.toLowerCase());
  if(/^[A-ZÀ-Ý]/.test(r)) r=r.charAt(0).toLowerCase()+r.slice(1);
  return r.replace(/\s{2,}/g,' ').trim();
}
function rigaDaButtare(t,sue){
  const r=String(t||'');
  if(!r.trim()) return 'vuota';
  { const prot=haProtocollo(r); if(prot) return 'protocollo: '+prot; }
  if(r.indexOf('!')>=0) return 'esclamazione';
  for(let i=0;i<r.length;i++){ if(r.charCodeAt(i)>0x2100) return 'emoji'; }
  /* Le parole della persona non diventano gergo perche stanno dentro un titolo:
     il veto guarda la prosa che Sentiero ha scelto di scrivere. */
  let nostro=r.replace(/«[^»]*»/g,' ');
  for(const x of (sue||[])){
    const q=String(x||'').trim(); if(!q) continue;
    nostro=nostro.split(q).join(' quella ');
    nostro=nostro.split(_ossMinuscolo(q)).join(' quella ');
  }
  const _lv=_lingVoceVeto(nostro,{prescrizione:true,gergo:true,giudizio:true});
  if(_lv) return _lv;
  /* cintura retrocompatibile: se la base incorporata fosse incompleta, questi
     due regex storici continuano a difendere il pavimento. */
  if(_OSS_PRESCRIVE.test(nostro.toLowerCase())) return 'prescrizione';
  if(_OSS_GERGO.test(nostro)) return 'parola di sistema';
  const senzaOre=nostro.replace(/\b\d{1,2}[:.]\d{2}\b/g,' ');
  if((senzaOre.match(/\b\d+\b/g)||[]).length>1) return 'piu di un numero';
  return null;
}

/* ══════ GEMINI — NESSUN LLM LOCALE NELLA BASE ═════════════════════════
   La Base mostra soltanto `sussurroLocale()`: nessun download, worker o WebGPU.
   La Generativa passa dal layer provider-neutral `aiCall()`. */
function observerLineFor(el){
  try{
    _sussurroDiag.attempts++;
    const taskHint=(((el&&el.querySelector&&el.querySelector('.ttl'))||{}).textContent||'').trim();
    _sussurroDiag.lastTask=clampStr(taskHint,120);
    if(S.settings&&S.settings.obsLine===false){
      _sussurroDiag.disabled++;_sussurroDiag.lastOutcome='disabled';
      try{ regCantiere('silenzio',{task:taskHint,msg:'impostazione: riga sulle spunte disattivata'}); }catch(_){}
      return;
    }
    if(!generativa()){
      const idL=el&&(el.dataset.tid||el.dataset.qid); if(!idL){ _sussurroDiag.preflight++;_sussurroDiag.lastOutcome='missing-id';return; }
      const titL=((el.querySelector('.ttl')||{}).textContent||'').trim(); if(!titL){ _sussurroDiag.preflight++;_sussurroDiag.lastOutcome='missing-title';return; }
      const pkgL=buildLinePackage(idL,titL);
      let rigaL='';
      try{ rigaL=sussurroLocale(pkgL,titL); }
      catch(err){
        _sussurroDiag.errors++;_sussurroDiag.lastOutcome='local-exception';
        try{ regCantiere('errore',{task:titL,msg:'sussurro locale: '+String((err&&err.message)||err||'').slice(0,120),pkg:pkgL}); }catch(_){}
        return;
      }
      if(!rigaL){
        _sussurroDiag.intentional++;_sussurroDiag.lastOutcome='local-gate';
        try{ regCantiere('silenzio',{task:titL,msg:'gate locale: nessun filo significativo',pkg:pkgL}); }catch(_){}
        return;
      }
      _sussurroDiag.local++;_sussurroDiag.accepted++;_sussurroDiag.lastOutcome='local';
      S.obsLines=(S.obsLines||[]).concat([{iso:new Date().toISOString(),task:clampStr(titL,120),riga:rigaL}]).slice(-12);
      save();
      try{ regCantiere('sussurro',{task:titL,riga:rigaL,msg:'locale deterministico'}); }catch(_){}
      try{ _whisper(rigaL); }catch(_){}
      return;
    }

    const id=el&&(el.dataset.tid||el.dataset.qid); if(!id){ _sussurroDiag.preflight++;_sussurroDiag.lastOutcome='missing-id';return; }
    const title=((el.querySelector('.ttl')||{}).textContent||'').trim(); if(!title){ _sussurroDiag.preflight++;_sussurroDiag.lastOutcome='missing-title';return; }

    const token=++_lineToken;
    if(_lineTimer!==null){
      clearTimeout(_lineTimer);_lineTimer=null;
      _sussurroDiag.coalesced++;_sussurroDiag.lastOutcome='coalesced';
      try{ nota('sab',3); }catch(_){}
    }

    try{
      if(_lineAbort){
        _lineAbort.abort();
        _sussurroDiag.aborted++;_sussurroDiag.lastOutcome='aborted';
        try{ nota('sab',2); }catch(_){}
      }
    }catch(_){}

    _lineAbort=null;

    _lineTimer=setTimeout(function(){
      _lineTimer=null;
      const t0Linea=Date.now();
      const ctrlA=('AbortController' in window)?new AbortController():null;
      _lineAbort=ctrlA;

      let chiusa=false;

      function chiudiCiclo(cod,ms){
        if(chiusa) return;
        chiusa=true;
        if(_lineAbort===ctrlA) _lineAbort=null;
        try{ nota('sfi',cod,Math.min(120000,ms|0)); }catch(_){}
      }

      try{ nota('sug'); }catch(_){}

      (async function(){
        try{
          const pkgL=buildLinePackage(id,title);

          if(!sussurroServeGemini(pkgL)){
            _sussurroDiag.intentional++;_sussurroDiag.lastOutcome='gemini-gate';
            try{
              regCantiere('silenzio',{
                task:title,
                msg:'gate locale: nessun filo significativo',
                pkg:pkgL
              });
            }catch(_){}

            chiudiCiclo(0,Date.now()-t0Linea);
            return;
          }

          try{
            nota('spr',Math.min(60000,JSON.stringify(pkgL).length));
          }catch(_){}

          try{ nota('sre'); }catch(_){}

          const resL=await askObserverLine(
            pkgL,
            ctrlA?ctrlA.signal:null
          );

          const msLinea=Date.now()-t0Linea;

          try{
            nota(
              'sri',
              Math.min(120000,msLinea),
              (resL&&resL.riga)?1:((resL&&resL.err)?2:0)
            );
          }catch(_){}

          if(token!==_lineToken){
            _sussurroDiag.superseded++;_sussurroDiag.lastOutcome='superseded';
            chiudiCiclo(3,msLinea);
            return;
          }

          if(resL&&resL.riga){
            const line=raffinaRiga(resL.riga);
            const male=rigaDaButtare(line,[title]);

            try{ nota('spa',male?0:1); }catch(_){}

            if(male){
              _sussurroDiag.vetoed++;_sussurroDiag.lastOutcome='veto';
              try{
                regCantiere('silenzio',{
                  task:title,
                  msg:'veto: '+male,
                  riga:String(resL.riga).slice(0,200)
                });
              }catch(_){}

              chiudiCiclo(2,msLinea);
              return;
            }

            S.obsLines=(S.obsLines||[]).concat([{
              iso:new Date().toISOString(),
              task:clampStr(title,120),
              riga:line
            }]).slice(-12);

            save();
            _sussurroDiag.accepted++;_sussurroDiag.lastOutcome='accepted';

            try{
              regCantiere('sussurro',{
                task:title,
                riga:line,
                ms:msLinea,
                model:resL.model,
                tin:resL.tin,
                tout:resL.tout,
                salti:resL.salti,
                pkg:pkgL
              });
            }catch(_){}

            try{ nota('sps'); }catch(_){}

            window._verdettoRef={
              riga:String(line),
              aperto:false
            };

            try{ nota('srn'); }catch(_){}

            _whisper(line);

            try{ nota('srf'); }catch(_){}

            chiudiCiclo(1,msLinea);

          }else if(resL&&resL.err){
            _sussurroDiag.errors++;_sussurroDiag.lastOutcome='provider-error';

            try{
              regCantiere('errore',{
                task:title,
                msg:'sussurro: '+String(resL.err).slice(0,100),
                ms:msLinea,
                model:resL.model,
                salti:resL.salti,
                pkg:pkgL
              });
            }catch(_){}

            chiudiCiclo(4,msLinea);

          }else{

            _sussurroDiag.empty++;_sussurroDiag.lastOutcome='empty';

            regCantiere('silenzio',{
              task:title,
              ms:msLinea,
              model:resL&&resL.model,
              tin:resL&&resL.tin,
              tout:resL&&resL.tout,
              salti:resL&&resL.salti,
              pkg:pkgL
            });

            chiudiCiclo(0,msLinea);
          }

        }catch(err){

          _sussurroDiag.errors++;_sussurroDiag.lastOutcome='exception';

          try{ nota('sab',1); }catch(_){}

          try{
            regCantiere('errore',{
              msg:'sussurro: '+String(
                (err&&err.message)||err||''
              ).slice(0,140)
            });
          }catch(_){}

          chiudiCiclo(4,Date.now()-t0Linea);

        }finally{

          chiudiCiclo(5,Date.now()-t0Linea);

        }
      })();

    },120);

  }catch(err){
    try{ _sussurroDiag.errors++;_sussurroDiag.lastOutcome='outer-exception';regCantiere('errore',{task:_sussurroDiag.lastTask,msg:'sussurro preflight: '+String((err&&err.message)||err||'').slice(0,120)}); }catch(_){}
  }
}
/* ══ IL VERDETTO DELL'AMICO (v147) — pressione lunga su un sussurro appena nato:
   due scelte, vera / scherziamo. Il verdetto si scrive nel registro accanto alla riga
   (verdetto:1|0) e sulla memoria del sussurro, e viaggia nei backup. Fase 0 del cantiere. ══ */
window._verdettoRef=null;
function _verdettoApri(){
  const el=_whisperEl, ref=window._verdettoRef;
  if(!el||!ref||ref.aperto) return;
  ref.aperto=true;
  clearTimeout(_whisperTimer); clearTimeout(_whisperTimer2);   /* la bolla aspetta il verdetto */
  el.classList.remove('esce'); el.classList.add('entra');
  el.innerHTML='';
  const tit=document.createElement('span'); tit.className='verd-tit'; tit.textContent='questa riga era…'; el.appendChild(tit);
  const bV=document.createElement('button'); bV.className='verd-b'; bV.textContent='vera';
  const bS=document.createElement('button'); bS.className='verd-b'; bS.textContent='scherziamo';
  bV.addEventListener('click',function(e){ e.stopPropagation(); _verdettoSegna(1); });
  bS.addEventListener('click',function(e){ e.stopPropagation(); _verdettoSegna(0); });
  el.appendChild(bV); el.appendChild(bS);
  _whisperTimer=setTimeout(_verdettoChiudi,8000);   /* nessuna scelta: la bolla se ne va senza verdetto */
}
function _verdettoSegna(v){
  const el=_whisperEl, ref=window._verdettoRef;
  if(!el||!ref) return;
  try{
    const rg=clampStr(ref.riga,300);
    for(let i=(S.registro||[]).length-1;i>=0;i--){ const e=S.registro[i];
      if(e&&e.tipo==='sussurro'&&e.riga===rg){ e.verdetto=v; break; } }
    for(let i=(S.obsLines||[]).length-1;i>=0;i--){ const n=S.obsLines[i];
      if(n&&n.riga===ref.riga){ n.verdetto=v; break; } }
    save();
  }catch(_){}
  window._verdettoRef=null;
  el.innerHTML=''; const ok=document.createElement('span'); ok.className='verd-ok'; ok.textContent=(v===1?'vera':'scherziamo')+' — segnato'; el.appendChild(ok);
  clearTimeout(_whisperTimer); clearTimeout(_whisperTimer2);
  _whisperTimer=setTimeout(()=>{ el.classList.remove('entra'); el.classList.add('esce'); },900);
  _whisperTimer2=setTimeout(()=>{ el.classList.remove('esce'); el.innerHTML=''; el.style.pointerEvents='none'; },1420);
}
function _verdettoChiudi(){
  const el=_whisperEl; window._verdettoRef=null;
  if(!el) return;
  el.classList.remove('entra'); el.classList.add('esce');
  _whisperTimer2=setTimeout(()=>{ el.classList.remove('esce'); el.innerHTML=''; el.style.pointerEvents='none'; },520);
}
(function(){   /* la pressione lunga: 550ms fermi sulla bolla */
  let vT=null,vx=0,vy=0;
  document.addEventListener('pointerdown',function(e){
    if(!window._verdettoRef||window._verdettoRef.aperto) return;
    if(!(e.target&&e.target.closest&&e.target.closest('#obs-whisper'))) return;
    vx=e.clientX; vy=e.clientY; clearTimeout(vT);
    vT=setTimeout(function(){ vT=null; try{ _verdettoApri(); }catch(_){} },550);
  },{passive:true});
  document.addEventListener('pointermove',function(e){ if(vT&&(Math.abs(e.clientX-vx)>12||Math.abs(e.clientY-vy)>12)){ clearTimeout(vT); vT=null; } },{passive:true});
  ['pointerup','pointercancel'].forEach(function(ev){ document.addEventListener(ev,function(){ clearTimeout(vT); vT=null; },{passive:true}); });
})();

/* ── Scritto distillato (battito "distillato"): un dono, nella voce dell'osservatrice ── */
const OBSERVER_DISTILL_SYS=
"Sei la Mente Osservatrice di Sentiero. Rileggi un periodo del cammino di una persona e scrivine UNO scritto breve, da custodire e magari donare a una sola persona. Le parli in seconda persona, con la tua voce di testimone: ti ho guardato...\n"+
"REGOLE:\n"+
"- Parti da UN particolare reale del periodo: un numero, una sua frase di diario, una svolta. Niente massime.\n"+
"- Arriva a UNA verita non ovvia su di lei: un punto cieco, lo scarto tra cio che dice e cio che fa, una cosa cambiata.\n"+
"- Chiudi con UNA riga trasferibile, qualcosa che possa servire a un altro sulla stessa salita. Niente trofeo, niente metriche esibite.\n"+
"- 3-6 frasi. Italiano. Niente emoji, niente virgolette, nessun titolo ne preambolo: solo lo scritto.";
function buildPeriodPackage(){
  const tk=todayKey(); const today=new Date(tk+'T12:00:00');
  /* Lab 19 — un giorno `peso` non entra nella rilettura del periodo, neppure
     indirettamente come giorno mancato. Viene sospeso dal denominatore, dai
     controlli e dal testo. Il periodo riparte dal materiale ordinario rimasto. */
  const pesoDays=new Set((S.diary||[]).filter(e=>e&&e.peso===true&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.data||''))).map(e=>String(e.data)));
  const win=Object.keys(S.checks||{}).filter(k=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||pesoDays.has(k)) return false;
    const d=Math.round((today-new Date(k+'T12:00:00'))/86400000); return d>=0&&d<=29;
  });
  /* plan-aware: fatte/previste soltanto sui giorni realmente in piano e non sospesi */
  const cons={};
  (S.scheduled||[]).forEach(s=>{ if(!s||!s.id||!s.titolo) return;
    let fatte=0,prev=0;
    win.forEach(k=>{
      const dw=dowOf(new Date(k+'T12:00:00'));
      const inPlan=(Array.isArray(s.days)&&s.days.includes(dw))||(s.date&&s.date===k);
      if(!inPlan) return;
      prev++; if(S.checks[k]&&S.checks[k][s.id]===true) fatte++;
    });
    if(prev>=3) cons[s.titolo]={fatte,prev,r:fatte/prev};
  });
  const ranked=Object.entries(cons).sort((a,b)=>b[1].r-a[1].r);
  /* Diary is newest-first: take the six newest safe entries, never the oldest six. */
  const dia=(S.diary||[]).filter(e=>e&&e.peso!==true&&!pesoDays.has(String(e.data||''))&&e.testo)
    .slice(0,6).map(e=>clampStr(e.testo,200)).filter(Boolean);
  return {battito:'distillato', periodo:'ultimi '+win.length+' giorni attivi', giorni_attivi:win.length,
    piu_costanti:ranked.slice(0,2).map(([t,c])=>t+' '+c.fatte+'/'+c.prev+' previste'),
    meno_costanti:ranked.slice(-2).map(([t,c])=>t+' '+c.fatte+'/'+c.prev+' previste'),
    diario:dia};
}
function observerDistillVeto(t){
  const s=String(t||'').trim(); if(!s) return 'vuoto';
  const prot=haProtocollo(s); if(prot) return 'protocollo: '+prot;
  const _lv=_lingVoceVeto(s,{prescrizione:true,gergo:true,giudizio:true}); if(_lv) return _lv;
  if(s.length<50) return 'troppo corto';
  if(s.length>1400) return 'troppo lungo';
  if(/```|\b(?:the prompt|system instruction|assistant:|analysis:)\b/i.test(s)) return 'meta';
  return null;
}
async function askObserverDistill(pkg){
  const res=await aiCall({system:OBSERVER_DISTILL_SYS,user:'DATI DEL PERIODO (JSON):\n'+JSON.stringify(pkg),task:'observer-distill',maxOutputTokens:600,reasoning:'medium',timeout:45000,priority:30});
  if(!res||res.err) return {err:(res&&res.err)||'modello',model:(res&&res.model)||''};
  const text=clampStr(scrostaProtocollo(res.text),1400).trim();
  const veto=observerDistillVeto(text);
  if(veto) return {err:'qualita',veto:veto,model:res.model||'',tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''};
  return {text:text,model:res.model||'',tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''};
}
let _lastDistill='';
/* v165: rimosso runDistill - pannello morto, i suoi elementi non esistono dall'HTML da molte versioni */
/* v165: rimossa anche la coda del pannello (close/share): elementi inesistenti */
/* ══════ v272.7 — QUEST MOTION: UN SOLO ATTORE, SOLO DOPO IL TOCCO ══════
   CONTRATTO DI STABILITA:
   - nessun timer/rAF/fetch/probe all'avvio;
   - nessuna mutazione dello stato persistente;
   - un solo movimento attivo alla volta: il nuovo gesto fa assestare il vecchio;
   - solo transform/opacity su una piccola zona locale;
   - i key pose sono numerati in frame a 60 Hz; l'interpolazione la fa WebKit.
   Il conteggio e lo STATO REALE di oggi: scheduled spuntate + quest fatte. Una
   deselezione lo abbassa da sola, senza contatori temporali da correggere. */
function completateOggi(state,tk,dow){
  const ck=(state.checks&&state.checks[tk])||{};
  const sched=scheduledFor(state,dow,tk).filter(t=>ck[t.id]===true).length;
  /* rolloverDay archivia le quest fatte quando cambia giorno: q.fatto, durante
     il giorno corrente, e quindi un fatto di OGGI anche se la quest aveva una
     data futura ed e stata anticipata. */
  const quest=(state.quests||[]).filter(q=>q&&q.fatto===true).length;
  return sched+quest;
}
function anteprimaSigillo(state,tk,dow){
  const r=computeProgress(state,tk,dow), es=essentialStatus(state,tk,dow);
  const full=r.total>0&&r.p===1&&state.lastFullSealed!==tk;
  const soft=!full&&state.lastSealed!==tk&&((es.total>0)?es.done===es.total:(r.total>=2&&r.p>=.667));
  return full?'full':soft?'soft':'';
}
const QUEST_MOTION=(()=>{
  const HZ=60,FRAME=1000/HZ;
  const D=window._questMotionDiag={targetHz:HZ,frameMs:+FRAME.toFixed(3),runs:0,blue:0,red:0,purple:0,undo:0,undoBlue:0,undoRed:0,undoPurple:0,handoffs:0,cancelled:0,fallback:0,lastStep:0,lastPhase:'',lastRank:0,lastStrength:0,lastDensity:0,lastFrames:0,lastMs:0,lastUndoPhase:'',lastUndoStep:0};
  let active=null,token=0,timers=[];
  const reduced=()=>{ try{return matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.body.classList.contains('anima-sempre');}catch(_){return false;} };
  function clearTimers(){ timers.forEach(x=>clearTimeout(x));timers=[]; }
  function after(tok,ms,fn){ const id=setTimeout(()=>{ if(tok===token) try{fn();}catch(_){} },ms);timers.push(id);return id; }
  function finish(a){ if(!a)return; try{a.anim.forEach(x=>x&&x.cancel&&x.cancel());}catch(_){} try{a.layer&&a.layer.remove();}catch(_){} try{a.el.classList.remove('qm-active','qm-blue','qm-red','qm-purple','qm-undo','justdone');a.el.style.removeProperty('--qm-fill-ms');a.el.style.removeProperty('--qm-mark-delay');}catch(_){} }
  function settle(){ if(active){ D.cancelled++; finish(active); active=null; } clearTimers(); token++; }
  function kf(nominal,poses){ return poses.map(p=>Object.assign({offset:Math.max(0,Math.min(1,p.f/nominal))},p.v)); }
  function anim(node,frames,nominal,poses){ if(!node||!node.animate)return null; return node.animate(kf(nominal,poses),{duration:Math.round(frames*FRAME),easing:'linear',fill:'both'}); }
  function phase(step,seal){ if(seal)return 'purple'; return step<=3?'blue':(step<=6?'red':'purple'); }
  function profile(step,seal){
    step=Math.max(1,step|0);const ph=phase(step,seal);
    const start=ph==='blue'?1:(ph==='red'?4:7), cap=ph==='purple'?3:2;
    const rank=Math.max(0,Math.min(cap,step-start));
    const baseFrames=ph==='blue'?24:(ph==='red'?30:36), frameStep=ph==='purple'?3:2;
    const frames=seal?16:(baseFrames+rank*frameStep);
    const strength=Math.min(1,(ph==='blue'?.58:(ph==='red'?.72:.84))+rank*.065);
    const density=Math.min(1,(ph==='blue'?.70:(ph==='red'?.80:.88))+rank*.06);
    return {ph,rank,frames,strength:seal?.78:strength,density:seal?.74:density,handoff:!!seal};
  }
  function makeLayer(el){ const q=document.createElement('span');q.className='qm-layer';q.setAttribute('aria-hidden','true');q.innerHTML='<i class="qm-core"></i><i class="qm-ring"></i><i class="qm-wave"></i><i class="qm-a"></i><i class="qm-b"></i>';el.insertBefore(q,el.firstChild);return q; }
  function play(el,step,seal){
    settle(); if(!el)return {ms:0,token:token,impact:0};
    step=Math.max(1,step|0);const p=profile(step,seal),ph=p.ph,F=p.frames,ms=Math.round(F*FRAME),tok=token,f=p.strength;
    D.runs++;D[ph]++;if(p.handoff)D.handoffs++;D.lastStep=step;D.lastPhase=ph;D.lastRank=p.rank;D.lastStrength=+p.strength.toFixed(3);D.lastDensity=+p.density.toFixed(3);D.lastFrames=F;D.lastMs=ms;
    el.style.setProperty('--qm-fill-ms',ms+'ms');el.style.setProperty('--qm-mark-delay',Math.round(ms*.22)+'ms');
    el.classList.add('qm-active','qm-'+ph);const q=makeLayer(el),A=[];q.style.opacity=String(p.density);active={el,layer:q,anim:A,token:tok};
    if(reduced()||!el.animate){ if(!el.animate)D.fallback++;after(tok,40,()=>{finish(active);active=null;});return {ms:40,token:tok,impact:0}; }
    const chk=el.querySelector('.chk'),core=q.querySelector('.qm-core'),ring=q.querySelector('.qm-ring'),wave=q.querySelector('.qm-wave'),a=q.querySelector('.qm-a'),b=q.querySelector('.qm-b');
    const amp=1+(f-.5)*.14, squash=1-(f-.5)*.13;
    if(ph==='blue'){
      A.push(anim(chk,F,36,[{f:0,v:{transform:'scale(1)'}},{f:4,v:{transform:`scale(${squash.toFixed(3)})`}},{f:8,v:{transform:`scale(${(squash-.035).toFixed(3)})`}},{f:12,v:{transform:`scale(${amp.toFixed(3)})`}},{f:17,v:{transform:'scale(.985)'}},{f:23,v:{transform:'scale(1.012)'}},{f:36,v:{transform:'scale(1)'}}]));
      A.push(anim(core,F,36,[{f:0,v:{opacity:0,transform:'scale(1.55)'}},{f:3,v:{opacity:.20,transform:'scale(1.25)'}},{f:7,v:{opacity:.90,transform:'scale(.40)'}},{f:10,v:{opacity:1,transform:'scale(.18)'}},{f:14,v:{opacity:.58,transform:'scale(.72)'}},{f:22,v:{opacity:.18,transform:'scale(1.35)'}},{f:36,v:{opacity:0,transform:'scale(1.7)'}}]));
      A.push(anim(ring,F,36,[{f:0,v:{opacity:0,transform:'scale(.7)'}},{f:10,v:{opacity:0,transform:'scale(.7)'}},{f:12,v:{opacity:.60,transform:'scale(.82)'}},{f:18,v:{opacity:.28,transform:'scale(1.22)'}},{f:27,v:{opacity:.06,transform:'scale(1.55)'}},{f:36,v:{opacity:0,transform:'scale(1.65)'}}]));
      A.push(anim(wave,F,36,[{f:0,v:{opacity:0,transform:'scaleX(0)'}},{f:13,v:{opacity:0,transform:'scaleX(0)'}},{f:16,v:{opacity:.38,transform:'scaleX(.14)'}},{f:23,v:{opacity:.22,transform:'scaleX(.68)'}},{f:31,v:{opacity:0,transform:'scaleX(1)'}},{f:36,v:{opacity:0,transform:'scaleX(1)'}}]));
    }else if(ph==='red'){
      A.push(anim(chk,F,36,[{f:0,v:{transform:'scale(1)'}},{f:4,v:{transform:`scale(${(squash-.025).toFixed(3)})`}},{f:8,v:{transform:`scale(${(squash-.065).toFixed(3)})`}},{f:11,v:{transform:`scale(${(amp+.045).toFixed(3)})`}},{f:16,v:{transform:'scale(.97)'}},{f:22,v:{transform:'scale(1.025)'}},{f:36,v:{transform:'scale(1)'}}]));
      A.push(anim(core,F,36,[{f:0,v:{opacity:0,transform:'scale(.28)'}},{f:5,v:{opacity:.28,transform:'scale(.36)'}},{f:9,v:{opacity:1,transform:'scale(.58)'}},{f:12,v:{opacity:.92,transform:'scale(.98)'}},{f:18,v:{opacity:.42,transform:'scale(1.55)'}},{f:27,v:{opacity:.08,transform:'scale(2.05)'}},{f:36,v:{opacity:0,transform:'scale(2.2)'}}]));
      A.push(anim(ring,F,36,[{f:0,v:{opacity:0,transform:'scale(.45)'}},{f:9,v:{opacity:.18,transform:'scale(.5)'}},{f:12,v:{opacity:.82,transform:'scale(.74)'}},{f:18,v:{opacity:.48,transform:'scale(1.22)'}},{f:27,v:{opacity:.10,transform:'scale(1.75)'}},{f:36,v:{opacity:0,transform:'scale(2)'}}]));
      A.push(anim(wave,F,36,[{f:0,v:{opacity:0,transform:'scaleX(0)'}},{f:10,v:{opacity:0,transform:'scaleX(0)'}},{f:13,v:{opacity:.66,transform:'scaleX(.12)'}},{f:19,v:{opacity:.48,transform:'scaleX(.66)'}},{f:27,v:{opacity:.12,transform:'scaleX(1.02)'}},{f:36,v:{opacity:0,transform:'scaleX(1.08)'}}]));
    }else{
      /* Purple non e un terzo colore gratuito: nei primi 12 frame i due campi
         locali convergono, restano quasi fermi per due frame, poi la risultante
         prende il posto di entrambi. */
      A.push(anim(chk,F,42,[{f:0,v:{transform:'scale(1)'}},{f:5,v:{transform:`scale(${(squash-.04).toFixed(3)})`}},{f:8,v:{transform:`scale(${(squash-.075).toFixed(3)})`}},{f:10,v:{transform:`scale(${(squash-.075).toFixed(3)})`}},{f:13,v:{transform:`scale(${(amp+.07).toFixed(3)})`}},{f:18,v:{transform:'scale(.96)'}},{f:25,v:{transform:'scale(1.035)'}},{f:34,v:{transform:'scale(.993)'}},{f:42,v:{transform:'scale(1)'}}]));
      A.push(anim(a,F,42,[{f:0,v:{opacity:0,transform:'translate3d(-12px,0,0) scale(1)'}},{f:3,v:{opacity:.42,transform:'translate3d(-10px,0,0) scale(1)'}},{f:8,v:{opacity:.92,transform:'translate3d(-4px,0,0) scale(.88)'}},{f:10,v:{opacity:1,transform:'translate3d(-1px,0,0) scale(.78)'}},{f:12,v:{opacity:0,transform:'translate3d(0,0,0) scale(.45)'}},{f:42,v:{opacity:0,transform:'translate3d(0,0,0) scale(.45)'}}]));
      A.push(anim(b,F,42,[{f:0,v:{opacity:0,transform:'translate3d(12px,0,0) scale(1)'}},{f:3,v:{opacity:.42,transform:'translate3d(10px,0,0) scale(1)'}},{f:8,v:{opacity:.92,transform:'translate3d(4px,0,0) scale(.88)'}},{f:10,v:{opacity:1,transform:'translate3d(1px,0,0) scale(.78)'}},{f:12,v:{opacity:0,transform:'translate3d(0,0,0) scale(.45)'}},{f:42,v:{opacity:0,transform:'translate3d(0,0,0) scale(.45)'}}]));
      A.push(anim(core,F,42,[{f:0,v:{opacity:0,transform:'scale(.2)'}},{f:10,v:{opacity:0,transform:'scale(.2)'}},{f:12,v:{opacity:.94,transform:'scale(.24)'}},{f:15,v:{opacity:1,transform:'scale(.52)'}},{f:21,v:{opacity:.68,transform:'scale(1.18)'}},{f:30,v:{opacity:.20,transform:'scale(1.88)'}},{f:42,v:{opacity:0,transform:'scale(2.35)'}}]));
      A.push(anim(ring,F,42,[{f:0,v:{opacity:0,transform:'scale(.35)'}},{f:13,v:{opacity:.12,transform:'scale(.4)'}},{f:15,v:{opacity:.88,transform:'scale(.64)'}},{f:21,v:{opacity:.58,transform:'scale(1.18)'}},{f:31,v:{opacity:.12,transform:'scale(1.8)'}},{f:42,v:{opacity:0,transform:'scale(2.18)'}}]));
      A.push(anim(wave,F,42,[{f:0,v:{opacity:0,transform:'scaleX(0)'}},{f:14,v:{opacity:0,transform:'scaleX(0)'}},{f:17,v:{opacity:.76,transform:'scaleX(.12)'}},{f:24,v:{opacity:.54,transform:'scaleX(.72)'}},{f:34,v:{opacity:.10,transform:'scaleX(1.08)'}},{f:42,v:{opacity:0,transform:'scaleX(1.16)'}}]));
    }
    after(tok,ms+20,()=>{ if(active&&active.token===tok){finish(active);active=null;} });
    const nominal=ph==='purple'?42:36, impactFrame=ph==='purple'?13:11;
    return {ms:ms,token:tok,impact:p.handoff?0:Math.round((impactFrame/nominal)*ms),phase:ph,rank:p.rank,strength:p.strength,density:p.density,handoff:p.handoff};
  }
  function undo(el,remaining){
    settle();if(!el)return 0;const previous=Math.max(1,(remaining|0)+1),p=profile(previous,''),ph=p.ph;
    const F=(ph==='blue'?12:(ph==='red'?15:18))+p.rank*2,ms=Math.round(F*FRAME),tok=token;
    D.undo++;D['undo'+ph.charAt(0).toUpperCase()+ph.slice(1)]++;D.lastUndoPhase=ph;D.lastUndoStep=previous;
    el.classList.add('qm-active','qm-'+ph,'qm-undo');const q=makeLayer(el),A=[];q.style.opacity=String(Math.max(.55,p.density-.12));active={el,layer:q,anim:A,token:tok};
    if(reduced()||!el.animate){ if(!el.animate)D.fallback++;after(tok,40,()=>{finish(active);active=null;});return 40; }
    const chk=el.querySelector('.chk'),core=q.querySelector('.qm-core'),ring=q.querySelector('.qm-ring'),wave=q.querySelector('.qm-wave');
    A.push(anim(chk,F,18,[{f:0,v:{transform:'scale(1)'}},{f:5,v:{transform:'scale(.955)'}},{f:10,v:{transform:'scale(1.018)'}},{f:18,v:{transform:'scale(1)'}}]));
    A.push(anim(wave,F,18,[{f:0,v:{opacity:.34,transform:'scaleX(.72)'}},{f:7,v:{opacity:.22,transform:'scaleX(.38)'}},{f:14,v:{opacity:.08,transform:'scaleX(.08)'}},{f:18,v:{opacity:0,transform:'scaleX(0)'}}]));
    A.push(anim(ring,F,18,[{f:0,v:{opacity:.48,transform:'scale(1.34)'}},{f:8,v:{opacity:.32,transform:'scale(.88)'}},{f:15,v:{opacity:.12,transform:'scale(.48)'}},{f:18,v:{opacity:0,transform:'scale(.28)'}}]));
    A.push(anim(core,F,18,[{f:0,v:{opacity:.42,transform:'scale(1.12)'}},{f:8,v:{opacity:.64,transform:'scale(.58)'}},{f:14,v:{opacity:.28,transform:'scale(.26)'}},{f:18,v:{opacity:0,transform:'scale(.16)'}}]));
    after(tok,ms+20,()=>{ if(active&&active.token===tok){finish(active);active=null;} });
    return ms;
  }
  return {play,undo,after,settle,diag:D,targetHz:HZ,frameMs:FRAME,phase,profile};
})();

/* ══════ v272.8 — TODAY_STAGE: LA PRESSIONE RESTA DENTRO OGGI ═════════════
   QUEST_MOTION possiede la checkbox. TODAY_STAGE dirige invece la scena:
   legge il medesimo conteggio reale, muove per pochi frame la riga sorgente,
   le vicine e le intestazioni, poi distrugge ogni proprio elemento.

   Non salva niente, non conta niente, non suona e non vibra. Il suo unico
   stato e la cancellazione tecnica dell'animazione in corso. Al sigillo usa
   un handoff breve: converge, si assesta, e lascia i side effect al Cerchio. */
const TODAY_STAGE=(()=>{
  const HZ=60,FRAME=1000/HZ;
  const D=window._todayStageDiag={targetHz:HZ,frameMs:+FRAME.toFixed(3),runs:0,blue:0,red:0,purple:0,undo:0,handoffs:0,cancelled:0,fallback:0,activeLayers:0,lastStep:0,lastPhase:'',lastRank:0,lastFrames:0,lastReach:0,lastAmp:0,lastField:0,lastUndoStep:0,lastUndoPhase:'',lastSettleReason:''};
  let active=null,token=0,timers=[];
  const reduced=()=>{ try{return matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.body.classList.contains('anima-sempre');}catch(_){return false;} };
  function clearTimers(){ timers.forEach(x=>clearTimeout(x));timers=[]; }
  function after(tok,ms,fn){ const id=setTimeout(()=>{ if(tok===token) try{fn();}catch(_){} },ms);timers.push(id);return id; }
  function phase(step,seal){ if(seal)return 'purple';return step<=3?'blue':(step<=6?'red':'purple'); }
  function profile(step,seal){
    step=Math.max(1,step|0);const ph=phase(step,seal),start=ph==='blue'?1:(ph==='red'?4:7);
    const rank=Math.max(0,Math.min(ph==='purple'?3:2,step-start));
    if(seal)return {ph:'purple',rank,frames:12,reach:0,amp:.72,field:.34,handoff:true};
    const frames=ph==='blue'?(22+rank*3):(ph==='red'?(29+rank*3):(37+rank*4));
    const reach=ph==='blue'?(rank===0?0:(rank===1?1:2)):(ph==='red'?(rank<2?1:2):2);
    const amp=Math.min(2.22,(ph==='blue'?.70+rank*.25:(ph==='red'?1.25+rank*.30:1.55+rank*.22)));
    const field=Math.min(.75,(ph==='blue'?.28+rank*.09:(ph==='red'?.44+rank*.08:.56+rank*.06)));
    return {ph,rank,frames,reach,amp,field,handoff:false};
  }
  function kf(nominal,poses){ return poses.map(p=>Object.assign({offset:Math.max(0,Math.min(1,p.f/nominal))},p.v)); }
  function anim(node,frames,poses){ if(!node||!node.animate)return null;return node.animate(kf(frames,poses),{duration:Math.round(frames*FRAME),easing:'linear',fill:'both'}); }
  function finish(a){
    if(!a)return;
    try{a.anim.forEach(x=>x&&x.cancel&&x.cancel());}catch(_){}
    try{a.layer&&a.layer.remove();}catch(_){}
    try{
      a.tab.classList.remove('ts-blue','ts-red','ts-purple','ts-handoff','ts-undo','ts-reduced');
      a.tab.style.removeProperty('--ts-x');a.tab.style.removeProperty('--ts-y');
    }catch(_){}
    try{a.rows.forEach(x=>x.classList.remove('ts-source','ts-neighbor'));}catch(_){}
    try{a.heads.forEach(x=>x.classList.remove('ts-heading'));}catch(_){}
    D.activeLayers=0;
  }
  function settle(reason){
    if(active){D.cancelled++;finish(active);active=null;}
    else try{const q=document.querySelector('#tab-oggi #today-stage-layer');if(q)q.remove();}catch(_){}
    clearTimers();token++;D.lastSettleReason=String(reason||'settle').slice(0,24);
  }
  function rowsNear(tab,el,reach){
    const all=[].slice.call(tab.querySelectorAll('#list-task>.item,#list-quest-today>.item'));
    const at=all.indexOf(el),out=[];
    if(at<0||reach<1)return out;
    for(let d=1;d<=reach;d++){
      if(all[at-d])out.push({node:all[at-d],dist:d,dir:-1});
      if(all[at+d])out.push({node:all[at+d],dist:d,dir:1});
    }
    return out;
  }
  function stageHeads(tab,el,ph){
    const sec=el.closest&&el.closest('section'),one=sec&&sec.querySelector('.sec-head');
    if(ph!=='purple')return one?[one]:[];
    return [].slice.call(tab.querySelectorAll('#sec-task>.sec-head,#sec-today-quests>.sec-head'));
  }
  function makeLayer(tab,el,ph){
    const old=tab.querySelector('#today-stage-layer');if(old)old.remove();
    const tr=tab.getBoundingClientRect(),hit=el.querySelector('.chk')||el,hr=hit.getBoundingClientRect();
    const x=Math.max(24,Math.min(tr.width-24,(hr.left-tr.left)+(hr.width/2)));
    const y=Math.max(24,(hr.top-tr.top)+(hr.height/2));
    tab.style.setProperty('--ts-x',x.toFixed(2)+'px');tab.style.setProperty('--ts-y',y.toFixed(2)+'px');
    const q=document.createElement('span');q.id='today-stage-layer';q.className='ts-layer ts-'+ph;q.setAttribute('aria-hidden','true');
    q.innerHTML='<i class="ts-field"></i><i class="ts-spine"></i><i class="ts-wave"></i><i class="ts-left"></i><i class="ts-right"></i><i class="ts-mark"></i>';
    tab.appendChild(q);return q;
  }
  function completeAfter(tok,ms){
    after(tok,ms+24,()=>{if(active&&active.token===tok){const a=active;active=null;finish(a);clearTimers();}});
  }
  function play(el,step,seal){
    settle('replace');const tab=document.getElementById('tab-oggi');
    if(!tab||!el||!tab.contains(el))return {ms:0,token:token,phase:'',handoff:false};
    step=Math.max(1,step|0);const p=profile(step,seal),ph=p.ph,F=p.frames,ms=Math.round(F*FRAME),tok=token;
    D.runs++;D[ph]++;if(p.handoff)D.handoffs++;D.lastStep=step;D.lastPhase=ph;D.lastRank=p.rank;D.lastFrames=F;D.lastReach=p.reach;D.lastAmp=+p.amp.toFixed(3);D.lastField=+p.field.toFixed(3);
    const near=rowsNear(tab,el,p.reach),heads=p.handoff?[]:stageHeads(tab,el,ph),rows=[el].concat(near.map(x=>x.node)),A=[];
    tab.classList.add('ts-'+ph);if(p.handoff)tab.classList.add('ts-handoff');
    el.classList.add('ts-source');near.forEach(x=>x.node.classList.add('ts-neighbor'));heads.forEach(x=>x.classList.add('ts-heading'));
    active={tab,el,rows,heads,layer:null,anim:A,token:tok};
    if(reduced()||!el.animate){
      if(!el.animate)D.fallback++;tab.classList.add('ts-reduced');completeAfter(tok,40);
      return {ms:40,token:tok,phase:ph,rank:p.rank,handoff:p.handoff};
    }
    const q=makeLayer(tab,el,ph);active.layer=q;D.activeLayers=1;
    const field=q.querySelector('.ts-field'),spine=q.querySelector('.ts-spine'),wave=q.querySelector('.ts-wave');
    const left=q.querySelector('.ts-left'),right=q.querySelector('.ts-right'),mark=q.querySelector('.ts-mark');
    const impact=Math.max(3,Math.round(F*.27)),prop=Math.max(impact+2,Math.round(F*.55)),release=Math.max(prop+2,Math.round(F*.78));
    if(p.handoff){
      A.push(anim(el,F,[{f:0,v:{transform:'translate3d(0,0,0) scale(1)'}},{f:3,v:{transform:'translate3d(0,0,0) scale(.992)'}},{f:6,v:{transform:'translate3d(0,0,0) scale(1.003)'}},{f:F,v:{transform:'translate3d(0,0,0) scale(1)'}}]));
      A.push(anim(left,F,[{f:0,v:{opacity:.38,transform:'scaleX(1)'}},{f:4,v:{opacity:.72,transform:'scaleX(.08)'}},{f:6,v:{opacity:0,transform:'scaleX(0)'}},{f:F,v:{opacity:0,transform:'scaleX(0)'}}]));
      A.push(anim(right,F,[{f:0,v:{opacity:.38,transform:'scaleX(1)'}},{f:4,v:{opacity:.72,transform:'scaleX(.08)'}},{f:6,v:{opacity:0,transform:'scaleX(0)'}},{f:F,v:{opacity:0,transform:'scaleX(0)'}}]));
      A.push(anim(mark,F,[{f:0,v:{opacity:0,transform:'rotate(45deg) scale(.45)'}},{f:4,v:{opacity:.82,transform:'rotate(45deg) scale(.78)'}},{f:7,v:{opacity:.22,transform:'rotate(135deg) scale(1.18)'}},{f:F,v:{opacity:0,transform:'rotate(135deg) scale(1.3)'}}]));
      completeAfter(tok,ms);return {ms,token:tok,phase:ph,rank:p.rank,handoff:true};
    }
    const a=p.amp,span=ph==='blue'?(p.rank===0?.36:(p.rank===1?.48:.60)):(ph==='red'?.76:1);
    if(ph==='blue'){
      A.push(anim(el,F,[{f:0,v:{transform:'translate3d(0,0,0) scaleX(1)'}},{f:impact-2,v:{transform:'translate3d('+(-.28*a).toFixed(2)+'px,0,0) scaleX(.997)'}},{f:impact,v:{transform:'translate3d('+( .48*a).toFixed(2)+'px,0,0) scaleX(1.002)'}},{f:prop,v:{transform:'translate3d('+(-.12*a).toFixed(2)+'px,0,0) scaleX(.999)'}},{f:F,v:{transform:'translate3d(0,0,0) scaleX(1)'}}]));
    }else if(ph==='red'){
      A.push(anim(el,F,[{f:0,v:{transform:'translate3d(0,0,0) scaleX(1)'}},{f:impact-2,v:{transform:'translate3d('+(-.42*a).toFixed(2)+'px,0,0) scaleX(.993)'}},{f:impact,v:{transform:'translate3d('+( .82*a).toFixed(2)+'px,0,0) scaleX(1.004)'}},{f:prop,v:{transform:'translate3d('+(-.26*a).toFixed(2)+'px,0,0) scaleX(.997)'}},{f:release,v:{transform:'translate3d('+( .10*a).toFixed(2)+'px,0,0) scaleX(1.001)'}},{f:F,v:{transform:'translate3d(0,0,0) scaleX(1)'}}]));
    }else{
      A.push(anim(el,F,[{f:0,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(0deg) scaleX(1)'}},{f:impact-3,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(.48deg) scaleX(.991)'}},{f:impact,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(-.24deg) scaleX(1.005)'}},{f:prop,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(.12deg) scaleX(.997)'}},{f:release,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(-.05deg) scaleX(1.001)'}},{f:F,v:{transform:'perspective(420px) translate3d(0,0,0) rotateX(0deg) scaleX(1)'}}]));
      A.push(anim(left,F,[{f:0,v:{opacity:0,transform:'scaleX(1)'}},{f:impact-5,v:{opacity:.28+p.field*.26,transform:'scaleX(.82)'}},{f:impact-1,v:{opacity:.78,transform:'scaleX(.08)'}},{f:impact+1,v:{opacity:0,transform:'scaleX(0)'}},{f:F,v:{opacity:0,transform:'scaleX(0)'}}]));
      A.push(anim(right,F,[{f:0,v:{opacity:0,transform:'scaleX(1)'}},{f:impact-5,v:{opacity:.28+p.field*.26,transform:'scaleX(.82)'}},{f:impact-1,v:{opacity:.78,transform:'scaleX(.08)'}},{f:impact+1,v:{opacity:0,transform:'scaleX(0)'}},{f:F,v:{opacity:0,transform:'scaleX(0)'}}]));
    }
    A.push(anim(spine,F,[{f:0,v:{opacity:0,transform:'scaleY(.06)'}},{f:impact-2,v:{opacity:.16+p.field*.28,transform:'scaleY(.18)'}},{f:impact,v:{opacity:.72,transform:'scaleY('+(span*.58).toFixed(3)+')'}},{f:prop,v:{opacity:.30,transform:'scaleY('+span.toFixed(3)+')'}},{f:F,v:{opacity:0,transform:'scaleY('+(span*1.08).toFixed(3)+')'}}]));
    A.push(anim(wave,F,[{f:0,v:{opacity:0,transform:'scaleX(.02)'}},{f:impact,v:{opacity:.18+p.field*.50,transform:'scaleX(.06)'}},{f:prop,v:{opacity:.26+p.field*.24,transform:'scaleX('+(ph==='blue'?.52:(ph==='red'?.78:1))+')'}},{f:release,v:{opacity:.08,transform:'scaleX(1)'}},{f:F,v:{opacity:0,transform:'scaleX(1.04)'}}]));
    A.push(anim(field,F,[{f:0,v:{opacity:0,transform:'translate3d(-50%,-50%,0) scale(.28)'}},{f:impact,v:{opacity:p.field,transform:'translate3d(-50%,-50%,0) scale(.52)'}},{f:prop,v:{opacity:p.field*.62,transform:'translate3d(-50%,-50%,0) scale(1)'}},{f:F,v:{opacity:0,transform:'translate3d(-50%,-50%,0) scale(1.16)'}}]));
    A.push(anim(mark,F,[{f:0,v:{opacity:0,transform:'rotate(45deg) scale(.28)'}},{f:impact,v:{opacity:.52+p.field*.35,transform:'rotate(45deg) scale(.78)'}},{f:prop,v:{opacity:.18,transform:'rotate('+(ph==='purple'?135:70)+'deg) scale(1.12)'}},{f:F,v:{opacity:0,transform:'rotate('+(ph==='purple'?180:90)+'deg) scale(1.24)'}}]));
    near.forEach(n=>{
      const lag=Math.min(F-4,impact+n.dist*2),d=(a*(ph==='blue'?.30:(ph==='red'?.58:.72))/n.dist)*n.dir;
      A.push(anim(n.node,F,[{f:0,v:{transform:'translate3d(0,0,0)'}},{f:lag-2,v:{transform:'translate3d(0,0,0)'}},{f:lag,v:{transform:'translate3d(0,'+d.toFixed(2)+'px,0)'}},{f:release,v:{transform:'translate3d(0,'+(-d*.22).toFixed(2)+'px,0)'}},{f:F,v:{transform:'translate3d(0,0,0)'}}]));
    });
    heads.forEach((h,i)=>{
      const d=ph==='blue'?.45:(ph==='red'?1.05:1.35),lag=Math.min(F-3,impact+i);
      A.push(anim(h,F,[{f:0,v:{opacity:1,transform:'translate3d(0,0,0) scaleX(1)'}},{f:lag,v:{opacity:ph==='purple'?.86:.92,transform:'translate3d('+d+'px,0,0) scaleX('+(ph==='purple'?.992:.997)+')'}},{f:release,v:{opacity:.97,transform:'translate3d('+(-d*.22).toFixed(2)+'px,0,0) scaleX(1)'}},{f:F,v:{opacity:1,transform:'translate3d(0,0,0) scaleX(1)'}}]));
    });
    completeAfter(tok,ms);
    return {ms,token:tok,phase:ph,rank:p.rank,reach:p.reach,amp:p.amp,field:p.field,handoff:false};
  }
  function undo(el,remaining){
    settle('undo');const tab=document.getElementById('tab-oggi');
    if(!tab||!el||!tab.contains(el))return 0;
    const previous=Math.max(1,(remaining|0)+1),p=profile(previous,''),ph=p.ph;
    const F=(ph==='blue'?12:(ph==='red'?15:18))+p.rank*2,ms=Math.round(F*FRAME),tok=token;
    D.undo++;D.lastUndoStep=previous;D.lastUndoPhase=ph;
    const near=rowsNear(tab,el,Math.min(1,p.reach)),rows=[el].concat(near.map(x=>x.node)),heads=[],A=[];
    tab.classList.add('ts-'+ph,'ts-undo');el.classList.add('ts-source');near.forEach(x=>x.node.classList.add('ts-neighbor'));
    active={tab,el,rows,heads,layer:null,anim:A,token:tok};
    if(reduced()||!el.animate){if(!el.animate)D.fallback++;tab.classList.add('ts-reduced');completeAfter(tok,40);return 40;}
    const q=makeLayer(tab,el,ph);active.layer=q;D.activeLayers=1;
    const field=q.querySelector('.ts-field'),spine=q.querySelector('.ts-spine'),wave=q.querySelector('.ts-wave'),mark=q.querySelector('.ts-mark');
    A.push(anim(el,F,[{f:0,v:{transform:'translate3d(0,0,0) scaleX(1)'}},{f:Math.round(F*.28),v:{transform:'translate3d(-.6px,0,0) scaleX(.994)'}},{f:Math.round(F*.58),v:{transform:'translate3d(.24px,0,0) scaleX(1.002)'}},{f:F,v:{transform:'translate3d(0,0,0) scaleX(1)'}}]));
    A.push(anim(wave,F,[{f:0,v:{opacity:.24+p.field*.24,transform:'scaleX('+(ph==='blue'?.52:(ph==='red'?.78:1))+')'}},{f:Math.round(F*.55),v:{opacity:.18,transform:'scaleX(.24)'}},{f:F,v:{opacity:0,transform:'scaleX(.02)'}}]));
    A.push(anim(spine,F,[{f:0,v:{opacity:.36,transform:'scaleY('+(ph==='purple'?1:(ph==='red'?.76:.48))+')'}},{f:Math.round(F*.56),v:{opacity:.18,transform:'scaleY(.24)'}},{f:F,v:{opacity:0,transform:'scaleY(.04)'}}]));
    A.push(anim(field,F,[{f:0,v:{opacity:p.field*.44,transform:'translate3d(-50%,-50%,0) scale(.92)'}},{f:Math.round(F*.62),v:{opacity:.14,transform:'translate3d(-50%,-50%,0) scale(.42)'}},{f:F,v:{opacity:0,transform:'translate3d(-50%,-50%,0) scale(.18)'}}]));
    A.push(anim(mark,F,[{f:0,v:{opacity:.46,transform:'rotate(135deg) scale(1.02)'}},{f:Math.round(F*.58),v:{opacity:.24,transform:'rotate(70deg) scale(.64)'}},{f:F,v:{opacity:0,transform:'rotate(45deg) scale(.24)'}}]));
    near.forEach(n=>{const d=.58*n.dir;A.push(anim(n.node,F,[{f:0,v:{transform:'translate3d(0,0,0)'}},{f:Math.round(F*.34),v:{transform:'translate3d(0,'+(-d).toFixed(2)+'px,0)'}},{f:F,v:{transform:'translate3d(0,0,0)'}}]));});
    completeAfter(tok,ms);return ms;
  }
  return {play,undo,settle,phase,profile,diag:D,targetHz:HZ,frameMs:FRAME};
})();
window.TODAY_STAGE=TODAY_STAGE;
window._settleTodayMotion=function(reason){try{QUEST_MOTION.settle();}catch(_){}try{TODAY_STAGE.settle(reason);}catch(_){}};

function onComplete(el){
  const tk=todayKey(),dow=dowOf();
  const passo=Math.max(1,completateOggi(S,tk,dow)|0), lvl=Math.max(1,Math.min(8,passo));
  const seal=anteprimaSigillo(S,tk,dow);
  el.classList.add('justdone');
  const qm=QUEST_MOTION.play(el,passo,seal);
  const stage=TODAY_STAGE.play(el,passo,seal);
  /* Se questa stessa spunta sigilla il giorno, la regia del Cerchio della v272.3
     resta l'unica fonte di aptica/suono globale: niente doppio rituale. */
  if(!seal){
    haptic(lvl>=4);
    QUEST_MOTION.after(qm.token,qm.impact,()=>{
      let sfxPlayed=false;
      try{ if(SFX.length) sfxPlayed=playSFX(lvl-1); }catch(_){}
      if(!sfxPlayed){ try{ playEventSound('questCompleted',{semitones:Math.min(passo-1,7)}); }catch(_){} }
    });
  }
  try{ observerLineFor(el); }catch(_){}   /* resta immediata come nella v272.3 */
  updateRing();                            /* Cerchio e side effect: contratto v272.3 */
  return Math.max(qm.ms||0,stage.ms||0)||600;
}
function ink(itemEl){
  const chk=itemEl.querySelector('.chk');
  if(!chk) return;
  const d=document.createElement('span');
  d.className='inkdot';
  d.style.left=(chk.offsetLeft+8)+'px';
  d.style.top=(chk.offsetTop+8)+'px';
  itemEl.appendChild(d);
  setTimeout(()=>d.remove(),600);
}
function applyTheme(){ try{
  const _lcd=S.settings.uiTheme==='carta';
  /* Lab 7: il vecchio tema chiaro `theme-carta` resta nel file solo come storia
     e compatibilita del CSS, ma non viene piu applicato. LCD e `theme-lcd`: base
     OLED meno emissione, non OLED piu carta bianca. */
  document.body.classList.remove('theme-carta');
  document.body.classList.toggle('theme-lcd',_lcd);
  /* v237 — LE PROVE D'INCHIOSTRO VIVONO SOLO DENTRO L'LCD.
     Erano legate solo all'interruttore, senza guardare il tema. Il CSS era
     scopato a .theme-carta e quindi sembrava a posto, ma il JAVASCRIPT no:
     il cielo e il fuoco chiedono «c'e la classe ink-mondo?» e basta. Con
     l'interruttore acceso e l'aspetto su OLED, il fuoco si stampava a polvere
     dentro il tema scuro - cioe la cosa che non doveva succedere mai.
     La classe non si mette se l'aspetto non e Carta. Punto. */
  /* Gemini — LCD per sottrazione: le vecchie prove d'inchiostro
     diventano il comportamento standard del tema LCD. Le classi restano come
     dettaglio d'implementazione per non riscrivere i motori canvas, ma non sono
     piu una preferenza utente. */
  document.body.classList.toggle('ink-mondo',_lcd);
  /* il cielo si ridipinge da solo ogni cinque minuti. Cambiando aspetto
     resterebbe quello di prima fino allo scadere: si chiede subito. */
  try{ if(typeof window._ridipingiCielo==='function') window._ridipingiCielo(); }catch(_){}
  document.body.classList.toggle('ink-giardino',_lcd);
  try{
    const carta=S.settings.uiTheme==='carta';
    const mt=document.querySelector('meta[name="theme-color"]');
    if(mt) mt.setAttribute('content',carta?'#151612':'#070A09');
    const sb=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if(sb) sb.setAttribute('content','black');
  }catch(_){}
  document.body.classList.toggle('anima-sempre',S.settings.anim==='sempre');
}catch(_){} }
/* ══════ ENSO VIVO v3 — IL MONDO (F1 Foglio) ══════
   Il fuoco e il fondale dell'intera app: canvas fixed inset:0, z sotto il contenuto.
   La grammatica (banda/cometa/burst/meteo) e INTATTA: cambia solo il montaggio.
   Spazio interno invariato (C=150,R=79); il contesto trasla sul centro del cerchio
   vocale quando e in scena (rect letto a ogni frame: segue anche lo scroll),
   altrimenti sull'ultima ancora nota. Scala k=rectWidth/200. rAF 60fps. */
(function(){
  const cv=document.getElementById('enso-fx'); if(!cv) return;
  /* ══ IL FUOCO A POLVERE (v235) ══════════════════════════════════════════
     Sul tema LCD il fuoco non si inverte piu. Invertire lasciava una macchia
     bruna sotto il giardino - un buco bruciato - e soprattutto lasciava intatta
     la GRAMMATICA dell'OLED: una stella che brilla. Su carta niente brilla.
     Il fuoco si dipinge piccolo su una lastra fuori schermo, si legge quanta
     luce c'e in ogni cella, e al suo posto si stampano PUNTI D'INCHIOSTRO:
     dove c'era piu luce ci sono piu punti e piu grossi. La luce diventa
     densita, che e come la stampa ha sempre reso la luce.
     Il colore non si perde: ogni punto prende la tinta della cella da cui
     nasce, quindi l'oro resta oro e il viola resta viola - solo, scuri.
     La lastra e un quinto per lato, cioe un venticinquesimo dei pixel: si
     rilegge tutta a ogni fotogramma senza che si senta. */
  const rctx=cv.getContext('2d');
  let ctx=rctx;
  const POL=document.createElement('canvas'), pctx=POL.getContext('2d',{willReadFrequently:true});
  const KP=5;
  /* due lucchetti e non uno: la classe DEVE esserci e l'aspetto DEVE essere
     Carta. Se un giorno la classe si mette per sbaglio, il fuoco dell'OLED
     non se ne accorge nemmeno. */
  function inchiostro(){ try{ const c=document.body.classList;
    return c.contains('ink-mondo')&&c.contains('theme-lcd'); }catch(_){ return false; } }
  /* v248 — e quando si passa da un modo all'altro, la tela si ripulisce SUBITO.
     Senza, l'ultima polvere resta in scena sotto il fuoco nuovo (o viceversa) e
     si vede una sovrapposizione che sembra un difetto di disegno. */
  let _ultimoModo=null;
  function cambioModo(ora){
    if(_ultimoModo===ora) return false;
    _ultimoModo=ora;
    try{ rctx.setTransform(DPR,0,0,DPR,0,0); rctx.clearRect(0,0,VW,VH); }catch(_){}
    try{ pctx.setTransform(1,0,0,1,0,0); pctx.clearRect(0,0,POL.width,POL.height); }catch(_){}
    _ultimoAnelloLCD=0;
    return true;
  }
  const DPR=Math.min(2,window.devicePixelRatio||1);
  let VW=1,VH=1;
  function dimensiona(){ VW=Math.max(1,window.innerWidth); VH=Math.max(1,window.innerHeight);
    cv.width=Math.round(VW*DPR); cv.height=Math.round(VH*DPR); }
  dimensiona();
  window.addEventListener('resize',dimensiona);
  window.addEventListener('orientationchange',lavoroPesante(dimensiona));
  /* l'ancora del fuoco: centro del cerchio vocale quando visibile, ultima nota altrimenti */
  let FCX=VW/2, FCY=VH*0.34, FK=(VW<=380?196:(VW<=400?212:310))/200;
  function sprite(r1,g1,b1,core){ const s=document.createElement('canvas'); s.width=s.height=32;
    const c=s.getContext('2d'); const g=c.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,core||'rgba(255,244,215,1)'); g.addColorStop(.32,'rgba('+r1+','+g1+','+b1+',.92)');
    g.addColorStop(1,'rgba('+r1+','+g1+','+b1+',0)'); c.fillStyle=g; c.fillRect(0,0,32,32); return s; }
  const spOro=sprite(242,197,107), spBrace=sprite(230,120,70), spCuore=sprite(255,214,140,'rgba(255,252,240,1)');
  const P=[]; const RAD=Math.PI/180, A0=-100*RAD, ARCO=305*RAD, R=79, C=150;
  let p=0, wasSealed=false, burst=0, last=0, CAL=0, RIE=false;
  /* IL METEO DEL FUOCO — tirato una volta al giorno, vero caso: tocca il COME arde,
     mai il QUANTO (quello resta legge: calore, streak, sigillo). quieto | vento | crepito */
  let MET={fl:1,am:1,wav:1,com:1};
  try{
    const mtk=todayKey(); let m=null;
    try{ m=JSON.parse(localStorage.getItem('sentiero-meteo')||'null'); }catch(_){}
    if(!m||m.tk!==mtk){ m={tk:mtk,car:meteoCarattere(Math.random())};
      try{ localStorage.setItem('sentiero-meteo',JSON.stringify(m)); }catch(_){} }
    MET=(m.car==='vento')?{fl:1.6,am:1,wav:2.2,com:1.4}:
        (m.car==='crepito')?{fl:1.1,am:1.5,wav:1,com:1.2}:
                            {fl:0.8,am:0.8,wav:0.6,com:0.7};
  }catch(_){}
  const rmq=matchMedia('(prefers-reduced-motion: reduce)');
  function animOk(){ try{ return (S.settings&&S.settings.anim==='sempre')||!rmq.matches; }catch(_){ return true; } }
  function banda(ts,rec,statico){
    if(p<=0.002) return;
    const n=Math.max(2,Math.round(ARCO*p/0.045));
    const sp=rec?spBrace:spOro;
    for(let i=0;i<=n;i++){
      const t=i/n, a=A0+ARCO*p*t;
      const f=statico?0.85:(0.72+0.28*MET.am*Math.sin(ts*0.006*MET.fl+i*1.7));
      const d=9.5*(0.95+0.18*CAL)*f*(0.85+0.3*Math.sin(i*0.7));
      ctx.globalAlpha=(0.11+0.05*CAL)*f;
      ctx.drawImage(sp,C+R*Math.cos(a)-d/2,C+R*Math.sin(a)-d/2,d,d);
      if(i%2===0||CAL>0.55){ const d2=d*0.55; ctx.globalAlpha=0.11*f;
        ctx.drawImage(spCuore,C+R*Math.cos(a)-d2/2,C+R*Math.sin(a)-d2/2,d2,d2); }
    }
    ctx.globalAlpha=1;
  }
  function spawnArco(rosso){ const t=Math.random()*Math.max(0.02,p); const a=A0+ARCO*t;
    P.push({x:C+R*Math.cos(a),y:C+R*Math.sin(a),
      vx:Math.cos(a)*0.13+((Math.random()-.5)*0.24),vy:Math.sin(a)*0.13-0.24-Math.random()*0.2,
      vita:1,dec:0.007+Math.random()*0.008,s:5+Math.random()*8,rosso:!!rosso,bianco:(!rosso&&CAL>0.7&&Math.random()<0.15),wav:Math.random()*6.28}); }
  function spawnSpirale(){ const a=Math.random()*Math.PI*2, rr=126+Math.random()*18;
    P.push({a,rr,orb:0.03+Math.random()*0.02,x:C+rr*Math.cos(a),y:C+rr*Math.sin(a),
      vita:1,dec:0.011,s:4+Math.random()*6,rosso:true,spirale:true}); }
  function spawnBurst(){ const a=Math.random()*Math.PI*2, v=1.7+Math.random()*2.8;
    P.push({x:C+R*Math.cos(a)*0.98,y:C+R*Math.sin(a)*0.98,
      vx:Math.cos(a)*v,vy:Math.sin(a)*v-0.3,vita:1,dec:0.013+Math.random()*0.012,
      s:6+Math.random()*9,rosso:false,grav:0.045,wav:0}); }
  /* ══════ IL FILO (v256) ══════════════════════════════════════════════════
     Il fuoco a polvere e a molecole non funzionava, e il motivo non erano i
     numeri: erano una TEXTURE che imitava un bagliore, e su carta un bagliore
     imitato e sporco. La carta non ha luce da imitare - ha il tratto. Le
     famiglie native di un plotter sono linee: campi, curve di livello, spirali.

     Qui il mondo diventa UNA LINEA SOLA che si allunga col giorno. Parte dal
     centro, gira verso fuori, e quando il cerchio si chiude ha fatto tutto il
     giro. Non c'e nessuna nuvola: c'e un solo segno, e alla fine e il tuo
     giorno disegnato.

     ══ E QUI STA LA RISPOSTA ALL'EPILESSIA, che non e una regolazione ma una
     regola: IL PASSATO E INCHIOSTRO ASCIUTTO. La parte gia percorsa non si
     muove piu - e successa, sta ferma. Respira solo la TESTA, l'ultimo pezzo,
     dove il giorno e adesso. Cosi non c'e niente che possa tremolare: c'e una
     linea immobile e un punto vivo. Il movimento non e stato ridotto: e stato
     messo dove ha un senso, e tolto da tutto il resto.

     Il fuoco non sparisce: e diventato il vento che increspa la testa. La
     stessa simulazione, letta in un punto solo invece che su tutto lo schermo -
     motivo per cui costa anche molto meno. */
  /* Lab 12 — L'ENSO LCD NON E PIU UNA SPIRALE.
     La prova "filo" era nata nel vecchio body.theme-carta e nel Lab 7 era stata
     trascinata dentro theme-lcd insieme alle buone sottrazioni. Era l'errore:
     cambiava la SEMANTICA del cerchio, non soltanto la sua materia.

     Da qui LCD usa la stessa geometria dell'OLED: A0 + ARCO * progresso.
     Cambia solo il mezzo: tratto piatto di pigmento, nessun bloom/sprite/twinkle. */
  let _ultimoAnelloLCD=0;
  function disegnaAnelloLCD(ts){
    const dt=Math.min(3,(ts-last)/16.7||1); last=ts;
    const mic=document.getElementById('mic');
    { const gv=geometriaVoce(); FCX=gv.x; FCY=gv.y; FK=gv.w/200; }
    window._ensoView={cx:FCX,cy:FCY,k:FK,dpr:DPR};
    const rec=mic&&mic.classList.contains('rec');
    const sealed=mic&&mic.classList.contains('sealed');
    const pieno=mic&&mic.classList.contains('pieno');
    CAL=Math.max(0,Math.min(1,window._ensoCalore||0)); RIE=!!window._ensoRientro;
    const T=(sealed?1:(window._ensoTarget||0));
    p+=(T-p)*(1-Math.exp(-0.075*dt));
    if(Math.abs(T-p)<0.0012) p=T;
    wasSealed=sealed; burst=0;

    rctx.setTransform(DPR,0,0,DPR,0,0);
    rctx.clearRect(0,0,VW,VH);
    rctx.save();
    rctx.translate(FCX,FCY); rctx.scale(FK,FK); rctx.translate(-C,-C);
    rctx.globalCompositeOperation='source-over';
    rctx.lineCap='round'; rctx.lineJoin='round';

    /* il giro ancora da compiere: supporto, non luce */
    rctx.strokeStyle='rgba(216,212,201,.13)';
    rctx.lineWidth=1.05;
    rctx.beginPath(); rctx.arc(C,C,R,A0,A0+ARCO,false); rctx.stroke();

    /* il giro compiuto: stessa crescita dell'OLED, resa a pigmento */
    if(p>0.002){
      const a1=A0+ARCO*Math.max(0,Math.min(1,p));
      rctx.strokeStyle=rec?'rgba(168,107,80,.88)':'rgba(181,138,67,.92)';
      rctx.lineWidth=sealed?2.45:(1.65+Math.min(.45,CAL*.45));
      rctx.beginPath(); rctx.arc(C,C,R,A0,a1,false); rctx.stroke();
      if(!sealed){
        const hx=C+R*Math.cos(a1),hy=C+R*Math.sin(a1);
        rctx.fillStyle=rec?'rgba(168,107,80,.94)':'rgba(181,138,67,.96)';
        rctx.beginPath(); rctx.arc(hx,hy,2.35,0,6.2832); rctx.fill();
      }
    }

    /* chiusura: UN solo arco pieno. Nessuna spirale interna e nessun secondo
       anello. Il pieno resta distinguibile dal testo/stato e dal tratto appena
       piu deciso, non da un altro ornamento. */
    if(sealed){
      rctx.strokeStyle=pieno?'rgba(197,151,72,.98)':'rgba(181,138,67,.95)';
      rctx.lineWidth=pieno?2.8:2.45;
      rctx.beginPath(); rctx.arc(C,C,R,A0,A0+ARCO,false); rctx.stroke();
    }
    rctx.restore();
  }
  function frame(ts){
    requestAnimationFrame(frame);
    if(document.hidden){ last=ts; return; }
    if(ditoInMovimento()){ last=ts; return; }
    const modo=inchiostro();
    cambioModo(modo);
    if(modo){
      try{ if(document.body.getAttribute('data-mondo')==='coperto') return; }catch(_){}
      /* agganciato al refresh del display, ma non piu veloce del necessario */
      if(ts-_ultimoAnelloLCD<15) return;
      _ultimoAnelloLCD=ts;
      disegnaAnelloLCD(ts);
      return;
    }
    ctx=rctx; frameInterno(ts);
  }
  function frameInterno(ts){
    const dt=Math.min(3,(ts-last)/16.7||1); last=ts;
    const mic=document.getElementById('mic');
    { const gv=geometriaVoce(); FCX=gv.x; FCY=gv.y; FK=gv.w/200; }
    window._ensoView={cx:FCX,cy:FCY,k:FK,dpr:DPR};
    const rec=mic&&mic.classList.contains('rec');
    const sealed=mic&&mic.classList.contains('sealed');
    const pieno=mic&&mic.classList.contains('pieno');
    CAL=Math.max(0,Math.min(1,window._ensoCalore||0)); RIE=!!window._ensoRientro;
    if(sealed&&!wasSealed) burst=(pieno?54:34)+(mic&&mic.classList.contains('oro')?22:0);   /* l'azzardo vinto: il fuoco sa */
    wasSealed=sealed;
    const T=(sealed?1:(window._ensoTarget||0));
    p+=(T-p)*(1-Math.exp(-0.055*dt));
    if(Math.abs(T-p)<0.0012) p=T;
    ctx.setTransform(ctx===pctx?(1/KP):DPR,0,0,ctx===pctx?(1/KP):DPR,0,0);
    ctx.clearRect(0,0,VW,VH);
    ctx.translate(FCX,FCY); ctx.scale(FK,FK); ctx.translate(-C,-C);
    ctx.globalCompositeOperation='lighter';
    if(!animOk()){ banda(ts,rec,true);
      if(p>0.002&&p<0.998){ const a=A0+ARCO*p;
        ctx.drawImage(spOro,C+R*Math.cos(a)-13,C+R*Math.sin(a)-13,26,26); }
      ctx.globalCompositeOperation='source-over'; return;
    }
    banda(ts,rec,false);
    /* fiamma pilota: a giorno vuoto, una sola brace che aspetta alla testa */
    if(p<=0.002){ const f=0.6+0.4*Math.sin(ts*0.005);
      ctx.globalAlpha=0.7*f;
      const d=(RIE?14:10)+3*f;   /* al rientro la brace e piu grande: non si era spenta */
      ctx.drawImage(RIE?spBrace:spOro,C+R*Math.cos(A0)-d/2,C+R*Math.sin(A0)-d/2,d,d);
      ctx.globalAlpha=1; }
    const rate=(rec?1.5:(sealed?0.55:(p>0?(0.25+p*0.9):0.05)))*(0.8+0.6*CAL)*((document.body.getAttribute('data-sez')==='parla')?1:0.3)   /* v270: si disegna piano quando il mondo non e la destinazione */*(window._foglioVento?1.35:1);
    if(Math.random()<rate*dt*0.6) (rec?spawnSpirale:spawnArco)(rec||(RIE&&Math.random()<0.5));
    if(pieno&&Math.random()<0.28*dt) spawnArco(false);
    if(burst>0){ const n=Math.min(6,burst); for(let i=0;i<n;i++) spawnBurst(); burst-=n; }
    for(let i=P.length-1;i>=0;i--){ const q=P[i];
      if(q.spirale){ q.a+=q.orb*dt; q.rr-=0.55*dt; q.x=C+q.rr*Math.cos(q.a); q.y=C+q.rr*Math.sin(q.a);
        if(q.rr<40) q.vita-=0.05*dt; }
      else{ if(q.grav) q.vy+=q.grav*dt;
        if(q.wav!==undefined){ q.wav+=0.09*dt; q.x+=Math.sin(q.wav)*0.18*MET.wav*dt; }
        q.x+=q.vx*dt; q.y+=q.vy*dt; }
      q.vita-=q.dec*dt;
      if(q.vita<=0){ P.splice(i,1); continue; }
      const d=q.s*(0.5+q.vita*0.9);
      ctx.globalAlpha=Math.min(1,q.vita*1.3);
      ctx.drawImage(q.bianco?spCuore:(q.rosso?spBrace:spOro),q.x-d/2,q.y-d/2,d,d);
    }
    ctx.globalAlpha=1;
    /* LA COMETA: cuore ardente sul fronte, coda tripla, fontana di scintille */
    if(p>0.002&&p<0.998){
      const a=A0+ARCO*p;
      for(let k2=1;k2<=3;k2++){ const ab=a-k2*0.055, dd=19-k2*4.5;
        ctx.globalAlpha=0.52-k2*0.13;
        ctx.drawImage(rec?spBrace:spOro,C+R*Math.cos(ab)-dd/2,C+R*Math.sin(ab)-dd/2,dd,dd); }
      ctx.globalAlpha=1;
      const dd=26+Math.sin(ts*0.004)*4;
      ctx.drawImage(rec?spBrace:spOro,C+R*Math.cos(a)-dd/2,C+R*Math.sin(a)-dd/2,dd,dd);
      const dc=dd*0.45;
      ctx.drawImage(spCuore,C+R*Math.cos(a)-dc/2,C+R*Math.sin(a)-dc/2,dc,dc);
      if(Math.random()<0.9*MET.com*dt){ P.push({x:C+R*Math.cos(a),y:C+R*Math.sin(a),
        vx:(Math.random()-.5)*0.8,vy:-0.35-Math.random()*0.55,vita:0.85,dec:0.018,s:4+Math.random()*5,rosso:rec,wav:Math.random()*6.28}); }
    }
    if(P.length>120) P.splice(0,P.length-120);
    ctx.globalCompositeOperation='source-over';
  }
  requestAnimationFrame(frame);
})();

/* ══════ IL CIELO — specchio vero: le stelle che ora stanno a sud ══════
   Tempo siderale calcolato, catalogo delle ~85 piu luminose (RA h, Dec deg, mag),
   proiezione a sud (az ±80°). Ridisegno ogni 5 minuti: zero costo per frame.
   Il fuoco resta l'unico protagonista: alfa a sussurro, niente luna, niente scintillio. */
(function(){
  const cv=document.getElementById('cielo'); if(!cv) return;
  const scr=cv.getContext('2d');            /* lo schermo: solo blit, ridipinto di continuo */
  const base=document.createElement('canvas');   /* la lastra: qui si dipinge il cielo, fuori schermo */
  const ctx=base.getContext('2d');
  const DPR=Math.min(2,window.devicePixelRatio||1);
  const STELLE=[
    [6.75,-16.7,-1.46],[14.26,19.2,-0.05],[18.62,38.8,0.03],[5.28,46.0,0.08],[5.24,-8.2,0.13],
    [7.66,5.2,0.34],[5.92,7.4,0.50],[19.85,8.9,0.77],[4.60,16.5,0.86],[16.49,-26.4,0.96],
    [13.42,-11.2,0.97],[7.76,28.0,1.14],[22.96,-29.6,1.16],[20.69,45.3,1.25],[10.14,12.0,1.35],
    [6.98,-29.0,1.50],[7.58,31.9,1.58],[17.56,-37.1,1.62],[5.42,6.3,1.64],[5.44,28.6,1.65],
    [5.60,-1.2,1.69],[5.68,-1.9,1.77],[12.90,55.96,1.77],[11.06,61.75,1.79],[3.41,49.9,1.80],
    [7.14,-26.4,1.84],[18.40,-34.4,1.85],[13.79,49.3,1.86],[6.00,44.9,1.90],[6.63,16.4,1.92],
    [6.38,-18.0,1.98],[9.46,-8.7,1.98],[2.53,89.26,1.98],[2.12,23.5,2.00],[0.73,-18.0,2.02],
    [18.92,-26.3,2.05],[0.14,29.1,2.06],[1.16,35.6,2.05],[17.58,12.6,2.07],[10.33,19.8,2.08],
    [14.85,74.2,2.08],[5.80,-9.7,2.09],[11.82,14.6,2.11],[3.14,40.96,2.12],[9.13,-43.4,2.21],
    [13.40,54.9,2.23],[20.37,40.3,2.23],[17.94,51.5,2.23],[5.53,-0.3,2.23],[0.68,56.5,2.24],
    [16.00,-22.6,2.32],[0.15,59.15,2.27],[15.58,26.7,2.23],[2.06,42.3,2.26],[23.06,28.1,2.42],
    [11.03,56.4,2.37],[14.75,27.1,2.37],[21.74,9.9,2.39],[17.71,-39.0,2.39],[0.44,-42.3,2.38],
    [11.90,53.7,2.44],[17.17,-15.7,2.43],[21.31,62.6,2.46],[7.40,-29.3,2.45],[0.945,60.7,2.47],
    [23.08,15.2,2.49],[3.04,4.1,2.53],[16.62,-10.6,2.56],[12.26,-17.5,2.59],[1.43,60.2,2.66],
    [12.26,57.0,3.31],[16.84,-34.3,2.29],[14.11,-36.4,2.06],[8.06,-40.0,2.25],[12.69,-48.96,2.17],
    [19.51,27.96,3.05],[18.35,-29.8,2.70],[20.77,33.97,3.20],[3.79,24.1,2.87],[4.95,33.2,2.69],
    [13.92,18.4,2.68],[15.74,6.4,2.63],[22.09,-46.96,2.40],[10.99,20.5,2.56],[9.76,23.8,3.14],
    [1.91,20.8,2.64],[2.98,53.5,2.93]
  ];
  /* ══ v269.1 — SENZA POSIZIONE IL CIELO NON E IL CIELO DI NESSUNO ═════════
     Qui c'erano le coordinate di casa di chi ha scritto l'app. Chi installava
     Sentiero e non dava la posizione non vedeva un cielo neutro: vedeva il
     cielo sopra un paese preciso, senza saperlo e senza averlo chiesto. Un dato
     personale che viaggiava come impostazione predefinita.
     Adesso il valore di partenza non e un luogo: 45 gradi e la latitudine media
     dell'emisfero nord, 0 e il meridiano di riferimento internazionale. Senza
     posizione il cielo e una DECORAZIONE con una geometria plausibile, non «il
     tuo cielo» e non quello di qualcun altro. Con la geolocalizzazione accesa -
     e solo allora - diventa davvero quello sopra la testa di chi guarda, e
     resta sul telefono. */
  let LAT=45, LON=0;
  try{ const c=JSON.parse(localStorage.getItem('sentiero-cielo-pos')||'null');
    if(c&&isFinite(c.la)&&isFinite(c.lo)){ LAT=c.la; LON=c.lo; } }catch(_){}
  try{
    if(S.settings&&S.settings.geo&&navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(p){
        try{ LAT=p.coords.latitude; LON=p.coords.longitude;
          localStorage.setItem('sentiero-cielo-pos',JSON.stringify({la:LAT,lo:LON})); dipingi(); }catch(_){}
      },function(){},{maximumAge:3600000,timeout:8000});
    }
  }catch(_){}
  function fascia(){ return 1; }   /* le stelle costanti: il cielo non segue piu l'orologio, solo la rotazione vera */
  const POOL=[];                 /* il fiume stellare: particelle che nascono, scorrono e muoiono, come il fuoco */
  const ANCR={x:2,y:2};          /* il pixel-sentinella del nucleo (dichiarato PRIMA del primo dipinto) */
  let ultSent=0;
  const SPR={},SPK={};   /* sprite: stella morbida e stella con lame di diffrazione, per colore */
  function spr(col){
    if(SPR[col]) return SPR[col];
    const c=document.createElement('canvas'); c.width=c.height=64;
    const g2=c.getContext('2d');
    const gr=g2.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba('+col+',1)');
    gr.addColorStop(0.18,'rgba('+col+',0.92)');
    gr.addColorStop(0.4,'rgba('+col+',0.38)');
    gr.addColorStop(0.7,'rgba('+col+',0.09)');
    gr.addColorStop(1,'rgba('+col+',0)');
    g2.fillStyle=gr; g2.fillRect(0,0,64,64);
    SPR[col]=c; return c;
  }
  function spk(col){
    if(SPK[col]) return SPK[col];
    const c=document.createElement('canvas'); c.width=c.height=128;
    const g2=c.getContext('2d');
    for(let i=0;i<4;i++){                              /* lame affusolate, non croci da mirino */
      const dx=(i===0)?1:(i===1)?-1:0, dy=(i===2)?1:(i===3)?-1:0;
      const g=g2.createLinearGradient(64,64,64+dx*58,64+dy*58);
      g.addColorStop(0,'rgba('+col+',0.9)');
      g.addColorStop(0.35,'rgba('+col+',0.38)');
      g.addColorStop(1,'rgba('+col+',0)');
      g2.beginPath();
      g2.moveTo(64+dy*2.2,64+dx*2.2);
      g2.lineTo(64+dx*58,64+dy*58);
      g2.lineTo(64-dy*2.2,64-dx*2.2);
      g2.closePath(); g2.fillStyle=g; g2.fill();
    }
    const gr=g2.createRadialGradient(64,64,0,64,64,24);
    gr.addColorStop(0,'rgba(255,255,255,1)');
    gr.addColorStop(0.2,'rgba('+col+',0.95)');
    gr.addColorStop(0.5,'rgba('+col+',0.35)');
    gr.addColorStop(1,'rgba('+col+',0)');
    g2.fillStyle=gr; g2.beginPath(); g2.arc(64,64,24,0,6.2832); g2.fill();
    SPK[col]=c; return c;
  }
  function dipingi(){ try{
    const W=Math.max(1,window.innerWidth), H2=Math.max(1,window.innerHeight);
    base.width=Math.round(W*DPR); base.height=Math.round(H2*DPR);
    cv.width=base.width; cv.height=base.height;
    ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0,0,W,H2);
    const RAD=Math.PI/180, mul=fascia();

    /* ══ IL CIELO A MOLECOLE (v232) ══════════════════════════════════════
       Sul tema LCD il cielo non si inverte piu: si disegna. Invertire era il
       prototipo - un filtro negativo, e si vedeva che lo era: la Via Lattea
       diventava una sbavatura grigia e il fuoco un buco bruciato.
       Su carta una stella non e un alone, perche un alone e luce e la luce qui
       non c'e: e una MOLECOLA. Un nucleo pieno del suo colore vero, e uno o due
       anelli attorno, tanto piu larghi quanto piu la stella e luminosa. Le
       magnitudini sono quelle vere, gia nei dati: cambia solo l'alfabeto con
       cui si scrivono. La Via Lattea diventa pulviscolo - punti fini, che e
       come la stampa ha sempre reso una nebbia. */
    if(document.body.classList.contains('ink-mondo')&&document.body.classList.contains('theme-lcd')){
      const D2=(Date.now()/86400000)-10957.5;
      let lst2=(18.697374558+24.06570982441908*D2+LON/15)%24; if(lst2<0)lst2+=24;
      const la2=LAT*RAD;
      let s2=1234567; const rnd2=function(){ s2^=s2<<13; s2^=s2>>>17; s2^=s2<<5; return ((s2>>>0)/4294967296); };
      /* il pulviscolo della banda: un nastro obliquo di punti finissimi */
      /* Su grafite la Via Lattea e retino, non nebbia luminosa. */
      ctx.fillStyle='rgba(203,199,188,.20)';
      for(let i=0;i<650;i++){
        const t=rnd2(), u=rnd2()*2-1;
        const x=W*(0.06+t*0.92), y=H2*(0.16+t*0.62)+u*u*u*H2*0.13;
        const r=0.28+rnd2()*0.52;
        ctx.globalAlpha=((1-Math.abs(u))*0.34+0.05);
        ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fill();
      }
      ctx.globalAlpha=1;
      for(let i=0;i<STELLE.length;i++){
        const st=STELLE[i];
        const ha=((lst2-st[0])*15)*RAD, de=st[1]*RAD;
        const alt=Math.asin(Math.sin(de)*Math.sin(la2)+Math.cos(de)*Math.cos(la2)*Math.cos(ha));
        if(alt<=0.03) continue;
        const az=Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(la2)-Math.tan(de)*Math.cos(la2))/RAD;
        if(az<-80||az>80) continue;
        const x=W*(0.5+az/160), y=H2*(0.92-(alt/RAD)/80*0.88);
        if(y<0) continue;
        const m=st[2];
        const r=Math.max(.75,(2.8-m)*.62);
        const forza=Math.max(.26,Math.min(.68,(2.8-m)*.20));
        const caldo=((i*37)%5)<2;
        const col=caldo?'184,150,88':'112,145,166';
        /* UN segno pieno. Nessun alone, nessun guscio, nessuna croce. */
        ctx.fillStyle='rgba('+col+','+forza.toFixed(2)+')';
        ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fill();
      }
      ctx.globalAlpha=1;
      return;
    }

    /* la polvere: seme fisso, texture che non cambia mai */
    let s=88675123; const rnd=function(){ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)/4294967296); };
    /* niente grana fissa: ogni stella del campo e una particella viva del fiume, disegnata dal motore */
    /* ── LA VIA LATTEA v2 — la grammatica delle lastre: il latte (migliaia di grani fini),
       poche ancore brillanti con alone e croci di diffrazione, il velo continuo della banda,
       nebulose e corsie scure dentro. Stesso seme: la texture non cambia mai. ── */
    ctx.globalAlpha=1;   /* il pennello torna pieno dopo la polvere */
    /* ── LA VIA LATTEA v3 — copia del render approvato: velo gaussiano a due strati,
       nuvole di latte, corsie scure, ~3800 stelle-sprite in quattro popoli. ── */
    /* il nucleo della galassia E il cerchio vocale: la banda nasce da li */
    const CM0=(function(){ const g=geometriaVoce(); return {x:g.x,y:g.y}; })();
    const AX=CM0.x, AY=CM0.y, ANG=-0.56, ca=Math.cos(ANG), sa=Math.sin(ANG), L=Math.hypot(W,H2);
    ANCR.x=Math.max(0,Math.round(AX*DPR)); ANCR.y=Math.max(0,Math.round(AY*DPR));
    ctx.save(); ctx.translate(AX,AY); ctx.rotate(ANG);
    const GB=[[0.16,0.10,'242,228,196'],[0.055,0.13,'246,238,214']];
    for(let gi=0;gi<2;gi++){
      const wg=GB[gi][0], ag=GB[gi][1], cg=GB[gi][2];
      const g=ctx.createLinearGradient(0,-L*wg*2,0,L*wg*2);
      g.addColorStop(0,'rgba('+cg+',0)');
      g.addColorStop(0.2,'rgba('+cg+','+(ag*0.21).toFixed(3)+')');
      g.addColorStop(0.35,'rgba('+cg+','+(ag*0.56).toFixed(3)+')');
      g.addColorStop(0.5,'rgba('+cg+','+ag.toFixed(3)+')');
      g.addColorStop(0.65,'rgba('+cg+','+(ag*0.56).toFixed(3)+')');
      g.addColorStop(0.8,'rgba('+cg+','+(ag*0.21).toFixed(3)+')');
      g.addColorStop(1,'rgba('+cg+',0)');
      ctx.fillStyle=g; ctx.fillRect(-L,-L*wg*2,2*L,L*wg*4);
    }
    ctx.restore();
    for(let i=0;i<16;i++){
      const t=(rnd()*2-1)*L*0.6, dd=(rnd()*2-1)*L*0.05, rg=L*(0.05+rnd()*0.09);
      const gx=AX+ca*t-sa*dd, gy=AY+sa*t+ca*dd;
      const g=ctx.createRadialGradient(gx,gy,0,gx,gy,rg);
      g.addColorStop(0,'rgba(244,230,198,'+((0.06+rnd()*0.05)).toFixed(3)+')');
      g.addColorStop(1,'rgba(244,230,198,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(gx,gy,rg,0,6.2832); ctx.fill();
    }
    for(let i=0;i<3;i++){
      const t=(rnd()*2-1)*L*0.5, gx=AX+ca*t, gy=AY+sa*t, rg=L*0.08;
      const g=ctx.createRadialGradient(gx,gy,0,gx,gy,rg);
      g.addColorStop(0,'rgba(196,214,242,0.06)');
      g.addColorStop(1,'rgba(196,214,242,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(gx,gy,rg,0,6.2832); ctx.fill();
    }
    for(let i=0;i<6;i++){
      const t=(rnd()*2-1)*L*0.5, dd=(rnd()*2-1)*L*0.03, rg=L*(0.04+rnd()*0.06);
      const gx=AX+ca*t-sa*dd, gy=AY+sa*t+ca*dd;
      const g=ctx.createRadialGradient(gx,gy,0,gx,gy,rg);
      g.addColorStop(0,'rgba(7,10,9,0.5)');
      g.addColorStop(1,'rgba(7,10,9,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(gx,gy,rg,0,6.2832); ctx.fill();
    }
    /* il campo non si dipinge piu sulla lastra: vive nel fiume (motore vita) */
    /* le stelle vere: tempo siderale locale, poi alt-az, finestra verso sud */
    const D=(Date.now()/86400000)-10957.5;   /* giorni da J2000 */
    let lst=(18.697374558+24.06570982441908*D+LON/15)%24; if(lst<0)lst+=24;
    const la=LAT*RAD;
    for(let i=0;i<STELLE.length;i++){
      const st=STELLE[i];
      const ha=((lst-st[0])*15)*RAD, de=st[1]*RAD;
      const alt=Math.asin(Math.sin(de)*Math.sin(la)+Math.cos(de)*Math.cos(la)*Math.cos(ha));
      if(alt<=0.03) continue;
      const az=Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(la)-Math.tan(de)*Math.cos(la))/RAD;  /* 0=sud, +ovest */
      if(az<-80||az>80) continue;
      const x=W*(0.5+az/160), y=H2*(0.92-(alt/RAD)/80*0.88);
      if(y<0) continue;
      const m=st[2];
      const r=Math.max(0.6,(2.9-m)*0.55);
      const a=Math.max(0.05,Math.min(0.34,(2.6-m)*0.11))*mul;
      const g=ctx.createRadialGradient(x,y,0,x,y,r*2.4);
      g.addColorStop(0,'rgba(245,242,234,'+a.toFixed(3)+')');
      g.addColorStop(0.5,'rgba(242,222,180,'+(a*0.5).toFixed(3)+')');
      g.addColorStop(1,'rgba(242,222,180,0)');
      ctx.globalAlpha=1; ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(x,y,r*2.4,0,6.2832); ctx.fill();
    }
    ctx.globalAlpha=1;
  }catch(e){ try{ regCantiere('errore',{msg:'cielo: '+String((e&&e.message)||e).slice(0,150)}); }catch(_){} } }
  dipingi();
  window._ridipingiCielo=dipingi;   /* per chi cambia tema: vedi applyTheme */
  setInterval(function(){ try{ if(!document.hidden) dipingi(); }catch(_){} },300000);
  window.addEventListener('resize',lavoroPesante(function(){ try{ dipingi(); }catch(_){} }));
  document.addEventListener('visibilitychange',function(){ try{ if(!document.hidden) dipingi(); }catch(_){} });
  /* ── IL CIELO VIVO — il popolo brilla frame per frame (~30fps) sopra la lastra.
     Il ridisegno continuo tiene vivo il buffer (iOS); ogni uno-due minuti una meteora.
     Con riduci-moto (senza Animazioni:sempre): statico, ridisegnato piano, niente meteore. ── */
  function vivoOk(){
    try{
      if(document.hidden) return false;
      if(S.settings&&S.settings.anim==='sempre') return true;
      return !matchMedia('(prefers-reduced-motion: reduce)').matches;
    }catch(_){ return false; }
  }
  let met=null, metNext=Date.now()+20000+Math.random()*40000;
  /* ══ IL FIUME STELLARE — un solo organismo, come il fuoco: ogni stella nasce, scorre, muore.
     Lontano dal cerchio la corrente segue la banda; vicino si curva in vortice attorno al nucleo,
     e chi spiraleggia fino in fondo consegna la sua luce al fuoco. La voce accelera la corrente,
     ogni parola e un'onda, la distillazione e la piena che trascina tutto dentro. ══ */
  function vivoOk(){
    try{
      if(document.hidden) return false;
      if(S.settings&&S.settings.anim==='sempre') return true;
      return !matchMedia('(prefers-reduced-motion: reduce)').matches;
    }catch(_){ return false; }
  }
  let lastT=0, mQ=0, modo='quiete', distT=0;
  const PULSES=[];
  window._cieloVoce=function(st){
    if(st==='rec') modo='rec';
    else if(st==='distilla'){ modo='distilla'; distT=Date.now(); }
    else modo='quiete';
  };
  window._cieloParola=function(){ if(PULSES.length<4) PULSES.push(Date.now()); };
  function centroMic(W,H2){ const g=geometriaVoce(); return {x:g.x,y:g.y,R:g.R}; }
  const CAB=Math.cos(-0.56), SAB=Math.sin(-0.56);
  function nasce(p,W,H2,CM){
    const L=Math.hypot(W,H2), dove=Math.random();
    if(dove<0.62){                                       /* nel letto della banda */
      const t=(Math.random()*2-1)*L*0.7, dd=((Math.random()+Math.random()+Math.random())/1.5-1)*L*0.13;
      p.x=CM.x+CAB*t-SAB*dd; p.y=CM.y+SAB*t+CAB*dd;
    }else if(dove<0.80){                                 /* sull'orlo del vortice */
      const a2=Math.random()*6.2832, rr=CM.R*(1.05+Math.random()*0.8);
      p.x=CM.x+Math.cos(a2)*rr; p.y=CM.y+Math.sin(a2)*rr;
    }else{ p.x=Math.random()*W; p.y=Math.random()*H2; }
    const q=Math.random(), c=Math.random();
    if(q<0.75){ p.r=0.55+Math.random()*0.55; p.a=0.22+Math.random()*0.22; p.k=0; }
    else if(q<0.95){ p.r=1.1+Math.random()*0.9; p.a=0.35+Math.random()*0.3; p.k=0; }
    else{ p.r=2.2+Math.random()*1.2; p.a=0.7+Math.random()*0.3; p.k=1; p.cr=Math.random()<0.5; }
    const rho=Math.hypot(p.x-CM.x,p.y-CM.y);
    if(rho<CM.R*1.6) p.col=c<0.55?'242,222,180':c<0.8?'238,178,128':'246,240,224';   /* vicino al fuoco nasce calda */
    else p.col=c<0.5?'245,242,234':c<0.72?'242,222,180':c<0.9?'186,208,244':'238,178,128';
    p.tw=1400+Math.random()*3600; p.ph=Math.random()*6.2832; p.amp=0.3+Math.random()*0.3;
    p.vel=0.7+Math.random()*0.6;
    p.ttl=8000+Math.random()*12000; p.eta=0;
  }
  function vita(){
    try{
      const W=Math.max(1,window.innerWidth), H2=Math.max(1,window.innerHeight);
      scr.setTransform(DPR,0,0,DPR,0,0); scr.clearRect(0,0,W,H2);
      if(base.width>0&&base.height>0) scr.drawImage(base,0,0,W,H2);
      const now=Date.now(), ok=vivoOk();
      const lcdInk=document.body.classList.contains('theme-lcd');
      const dt=lastT?Math.min(80,now-lastT):33; lastT=now;
      if(now-ultSent>4000){ ultSent=now;
        try{ const pd=ctx.getImageData(ANCR.x,ANCR.y,1,1).data;
          if(!(pd[0]|pd[1]|pd[2])) dipingi();              /* iOS ha svuotato la lastra: si ridipinge */
        }catch(_){}
      }
      const attivo=(modo!=='quiete')&&ok;
      mQ=Math.max(0,Math.min(1,mQ+(attivo?1:-1)*dt/900));
      if(modo==='distilla'&&now-distT>800) modo='quiete';
      const CM=centroMic(W,H2);
      while(PULSES.length&&now-PULSES[0]>1400) PULSES.shift();
      if(!POOL.length){ for(let i=0;i<540;i++){ const p={}; nasce(p,W,H2,CM); p.eta=Math.random()*p.ttl; POOL.push(p); } }
      const spinta=1+2.5*mQ, piena=(modo==='distilla')?6:0;
      /* Lab 11 — sul supporto LCD la lastra base contiene gia Via Lattea e
         stelle vere. Il fiume resta vivo, ma non puo usare gli sprite OLED
         spr()/spk(): erano proprio le poche stelle con alone che nel video
         sembravano accendersi, spegnersi e saltare. Si disegnano meno particelle,
         come punti di pigmento, senza twinkle ne diffrazione. */
      const poolN=lcdInk?Math.min(260,POOL.length):POOL.length;
      for(let i=0;i<poolN;i++){
        const p=POOL[i];
        if(ok) p.eta+=dt;
        if(p.eta>=p.ttl){ nasce(p,W,H2,CM); }
        const px=p.x-CM.x, py=p.y-CM.y;
        const rho=Math.max(1,Math.hypot(px,py));
        const wv=1/(1+Math.pow(rho/(CM.R*2.2),3));        /* quanto comanda il vortice, qui */
        const bandV=9*p.vel;
        let vx=CAB*bandV*(1-wv), vy=SAB*bandV*(1-wv);     /* la corrente della banda */
        const orb=(20*CM.R/Math.max(rho,CM.R*0.6))*p.vel; /* il vortice: kepleriano attorno al nucleo */
        vx+=(-py/rho)*orb*wv; vy+=(px/rho)*orb*wv;
        const dentro=(3+piena*14)*(CM.R/rho)*(wv*0.9+0.1)*(0.35+mQ);
        vx-=(px/rho)*dentro; vy-=(py/rho)*dentro;         /* la spirale che consegna al fuoco */
        if(ok){ p.x+=vx*spinta*dt/1000; p.y+=vy*spinta*dt/1000; }
        if(rho<CM.R*0.32||p.x<-30||p.x>W+30||p.y<-30||p.y>H2+30){ nasce(p,W,H2,CM); continue; }
        const env=Math.sin(3.1416*Math.min(1,p.eta/p.ttl));
        const tw=lcdInk?1:(ok?(1-p.amp*(0.5+0.5*Math.sin(now/p.tw*6.2832+p.ph))):(1-p.amp*0.5));
        let al=p.a*env*tw*(1+0.2*mQ+((modo==='distilla')?0.5:0));
        if(!lcdInk&&PULSES.length){
          for(let pi=0;pi<PULSES.length;pi++){
            const age=now-PULSES[pi], R2=age*0.35;
            al+=Math.exp(-Math.pow((rho-R2)/90,2))*Math.exp(-age/900)*0.5;
          }
        }
        scr.globalAlpha=Math.max(0,Math.min(1,al));
        if(lcdInk){
          /* punto pieno: nessun gradiente radiale, nessuna lama, nessun bloom */
          const rr=Math.max(.38,Math.min(1.35,p.r*(p.k===1?.52:.42)));
          scr.fillStyle='rgb('+p.col+')';
          scr.beginPath(); scr.arc(p.x,p.y,rr,0,6.2832); scr.fill();
        } else if(p.k===1){
          const f=p.cr?p.r*10:p.r*5.5; scr.drawImage(p.cr?spk(p.col):spr(p.col),p.x-f/2,p.y-f/2,f,f);
        } else scr.drawImage(spr(p.col),p.x-p.r*2,p.y-p.r*2,p.r*4,p.r*4);
      }
      scr.globalAlpha=1;
      if(!lcdInk&&mQ>0.02){                              /* il nucleo OLED si accende con la voce */
        const rg=Math.min(W,H2)*0.5;
        const g=scr.createRadialGradient(CM.x,CM.y,0,CM.x,CM.y,rg);
        const av=0.05*mQ+((modo==='distilla')?0.08:0);
        g.addColorStop(0,'rgba(244,230,198,'+av.toFixed(3)+')');
        g.addColorStop(1,'rgba(244,230,198,0)');
        scr.fillStyle=g; scr.beginPath(); scr.arc(CM.x,CM.y,rg,0,6.2832); scr.fill();
      }
      if(ok){
        if(!met&&now>metNext){
          met={x0:Math.random()*W,y0:-20,dx:(0.4+Math.random()*0.5)*(Math.random()<0.5?-1:1)*W*0.5,dy:H2*(0.25+Math.random()*0.2),t0:now,dur:520};
        }
        if(met){
          const p2=(now-met.t0)/met.dur;
          if(p2>=1){ met=null; metNext=now+30000+Math.random()*60000; }
          else{
            const hx=met.x0+met.dx*p2, hy=met.y0+met.dy*p2;
            const tx=hx-met.dx*0.16, ty=hy-met.dy*0.16;
            if(lcdInk){
              scr.globalAlpha=.42*Math.sin(3.1416*Math.min(1,p2));
              scr.strokeStyle='rgb(203,199,188)'; scr.lineWidth=.8;
              scr.beginPath(); scr.moveTo(tx,ty); scr.lineTo(hx,hy); scr.stroke();
              scr.globalAlpha=1;
            }else{
              const g=scr.createLinearGradient(tx,ty,hx,hy);
              g.addColorStop(0,'rgba(246,240,224,0)');
              g.addColorStop(1,'rgba(246,240,224,'+(0.85*Math.sin(3.1416*Math.min(1,p2))).toFixed(3)+')');
              scr.strokeStyle=g; scr.lineWidth=1.6;
              scr.beginPath(); scr.moveTo(tx,ty); scr.lineTo(hx,hy); scr.stroke();
            }
          }
        }
      }
      /* Lab 10 — il satellite era gia su requestAnimationFrame, il cielo no:
         setTimeout(33) deriva rispetto al refresh di iOS e rendeva percepibile
         quel piccolo "riavvio". Solo in LCD il cielo si aggancia ora al frame
         reale del display. OLED conserva esattamente la cadenza precedente. */
      if(ok&&document.body.classList.contains('theme-lcd')) requestAnimationFrame(vita);
      else setTimeout(vita,ok?33:1500);
    }catch(e){
      if(document.body.classList.contains('theme-lcd')) requestAnimationFrame(vita);
      else setTimeout(vita,3000);
    }
  }
  vita();
})();

/* ══════ LA SOGLIA — l'alba adattiva ══════ */
(function(){
  const sg=document.getElementById('soglia'); if(!sg) return;
  const rmq=matchMedia('(prefers-reduced-motion: reduce)');
  let animaSempre=false; try{ animaSempre=(S.settings&&S.settings.anim==='sempre'); }catch(_){}
  const tk=(function(){ try{ return todayKey(); }catch(_){ return new Date().toISOString().slice(0,10); } })();
  let prima=true;
  try{ prima=(localStorage.getItem('sentiero-soglia')!==tk); localStorage.setItem('sentiero-soglia',tk); }catch(_){}
  let chiusa=false;
  const fine=()=>{ if(chiusa) return; chiusa=true;
    if(sg.classList.contains('rito')){ try{ document.body.classList.add('app-nasce');
      setTimeout(()=>{ try{ document.body.classList.remove('app-nasce'); }catch(_){} },1700); }catch(_){} }
    sg.classList.add('via'); setTimeout(()=>{ try{ sg.remove(); }catch(_){} },520); };
  sg.addEventListener('click',fine);   /* tap salta sempre */
  /* ══ v268.4 — LA NOTA SI PRENDE PRIMA DI QUALUNQUE USCITA ══════════════════
     Qui c'era un ritorno anticipato con DUE condizioni, e stava sopra al punto
     in cui l'osservazione viene letta:
       · «!prima»: la soglia si compone solo alla prima apertura del giorno;
       · «rmq.matches»: con «Riduci movimento» acceso non si compone mai.
     Risultato: chi tiene acceso Riduci movimento - cioe chi ha costruito questa
     app - non ha MAI potuto ricevere un'osservazione, per nessuna via. E alla
     seconda apertura della giornata nemmeno gli altri.
     Riduci movimento deve ridurre il MOVIMENTO, non il contenuto. Quindi la
     nota si prende adesso, e se c'e viene consegnata comunque: ferma, senza
     animazione, per il tempo che serve a leggerla. Se non c'e nessuna nota -
     compreso il caso in cui il COSA ha scelto il silenzio - non cambia niente
     e la soglia sparisce come prima. */
  const _oss=(function(){
    try{ const notes=S.observerNotes||[];
      const ult=notes.length?notes[notes.length-1]:null;
      const eta=ult&&ult.createdAt?(Date.now()-Date.parse(ult.createdAt)):1e12;
      if(ult&&!ult.vista&&ult.note&&eta<36*3600*1000) return ult;
    }catch(_){}
    return null;
  })();
  /* Lab 25: la ricevuta di lettura dell'Osservatrice non vive piu nella
     splash. La gestisce il banner persistente: visibilita reale oppure X. */
  function _consegnaBanner(ult){
    if(!ult||!ult.note) return false;
    /* Lab 25 — il video reale mostrava una frase dell'Osservatrice in arancione
       per 2,6 secondi fra apertura e Frutto. Era proprio la classe di frase che
       la persona aveva descritto come "sfuggente". Il rito d'apertura torna a
       essere rito; il CONTENUTO vero va nel banner persistente con X. */
    try{ return mostraVoceBanner(ult.note,'osservatrice',{ref:ult.id}); }catch(_){ return false; }
  }
  if(!prima || (rmq.matches&&!animaSempre)){
    if(_oss) _consegnaBanner(_oss);
    setTimeout(fine,180);                                      /* micro-entrata: il contenuto resta nel banner */
    return;
  }
  const hnow=new Date().getHours();
  const F=(hnow>=5&&hnow<9)?{c:'232,168,76',s:"il mattino ha l'oro in bocca"}:
          (hnow>=9&&hnow<17)?{c:'214,209,196',s:'un passo alla volta'}:
          (hnow>=17&&hnow<22)?{c:'217,116,75',s:'la sera raccoglie'}:
                              {c:'127,184,164',s:'la notte custodisce'};
  /* la soglia respira: una volta su dodici, una sfumatura fuori canone. non premia: ricorda
     che il mondo non e un dipendente. tinta rara nella stessa fascia, a volte un saluto raro. */
  try{
    if(Math.random()<1/12){
      const RARI={
        '232,168,76':{c:['239,186,96','224,148,58'],s:'nebbia leggera anche qui dentro. si cammina lo stesso.'},
        '214,209,196':{c:['203,207,188','221,213,185'],s:'il giorno non ha fretta di te.'},
        '217,116,75':{c:['227,133,97','204,99,64'],s:'stasera perfino la luce si siede.'},
        '127,184,164':{c:['115,175,176','141,191,151'],s:'le stelle non tengono il conto.'}
      };
      const rr=RARI[F.c];
      if(rr){ F.c=rr.c[Math.random()<0.5?0:1]; if(Math.random()<0.5) F.s=rr.s; }
    }
  }catch(_){}
  /* ══ v268.3 — L'OSSERVAZIONE ARRIVA QUI, E PRIMA NON ARRIVAVA DA NESSUNA PARTE
     La stanza dell'osservatrice e stata tolta alla v165. Da allora l'unica strada
     verso la persona era questa riga, e aveva un interruttore sbagliato:
     «S.settings.music» - che e l'impostazione dell'AUDIO, e nasce spenta.
     Quindi la Mente Osservatrice poteva spendere una chiamata, scrivere una
     buona riga, salvarla, e non farla leggere a nessuno. Mai.

     La casa naturale e questa: l'apertura del giorno. Non serve una stanza
     nuova, serve che quello che ha visto ieri sera arrivi stamattina - che e
     anche il momento in cui ha senso leggerlo.
     Tre condizioni, per non fare rumore:
       · la nota non e ancora stata letta
       · e recente (entro trentasei ore: piu vecchia non parla di oggi)
       · e non e vuota - se il COSA ha scelto il silenzio, non c'e nessuna nota
         e il saluto resta quello di sempre. Il silenzio continua a non mostrare
         niente, come deve. */
  let testo=F.s, durata=1.9;
  if(_oss) _consegnaBanner(_oss);                            /* non piu una frase vera in una splash da 2,6 s */
  const sal=document.getElementById('soglia-saluto');
  if(sal){ sal.textContent=testo; sal.style.color='rgba('+F.c+',.92)'; }
  try{ document.body.style.setProperty('--alba-d',(durata-0.55).toFixed(2)+'s');
    document.body.classList.add('alba'); }catch(_){}
  const cv=document.getElementById('soglia-cv'); const ctx=cv?cv.getContext('2d'):null;
  /* ══ L'APERTURA E IL MONDO — niente secondo teatro: il velo nero si alza sul fiume stellare
     vero (il motore del cielo gira gia dietro), e nel sollevarsi il cosmo si stira con un
     impulso reale al campo di gravita - lo stesso della voce - poi torna a casa. ══ */
  const W=Math.max(1,window.innerWidth), H=Math.max(1,window.innerHeight);
  const DPRS=Math.min(2,window.devicePixelRatio||1);
  if(cv){ cv.width=Math.round(W*DPRS); cv.height=Math.round(H*DPRS); if(ctx) ctx.setTransform(DPRS,0,0,DPRS,0,0); }
  let t0=null;
  function fr(ts){
    if(chiusa) return;
    if(!t0) t0=ts;
    const t=(ts-t0)/1000;
    if(ctx){ ctx.clearRect(0,0,W,H);
      const velo=1-(1-Math.pow(1-Math.min(1,t/1.6),3));   /* il velo: 1 -> 0, il mondo emerge */
      if(velo>0){ ctx.fillStyle='rgba(7,10,9,'+velo.toFixed(3)+')'; ctx.fillRect(0,0,W,H); }
      const su=Math.min(1,t/1.1), e=1-Math.pow(1-su,3);
      const g=ctx.createLinearGradient(0,H,0,H-H*e*1.35);
      g.addColorStop(0,'rgba('+F.c+','+(0.22*(1-su*0.45)).toFixed(3)+')');
      g.addColorStop(1,'rgba('+F.c+',0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
    if(t>=durata){ fine(); return; }
    requestAnimationFrame(fr);
  }
  sg.classList.add('rito');
  try{ window._cieloVoce&&window._cieloVoce('rec');   /* il respiro d'apertura: il cosmo si stira verso il fuoco */
    setTimeout(function(){ try{ window._cieloVoce&&window._cieloVoce('quiete'); }catch(_){} },1400);
  }catch(_){}
  requestAnimationFrame(fr);
})();

/* ══════ IL PATTO DEL MATTINO ══════
   Il dispositivo chiede una volta al giorno; tu scegli il passo che conta, o rifiuti.
   Mantenuto = timbro d'oro + parola alla firma. Mai insistente, mai punitivo. */
/* puro: il calore del fuoco — cresce col cammino, logaritmico (0 al giorno 1, ~0.55 a 7, 1 a 42+) */
function fuocoCalore(streak){ const s=Math.max(0,streak|0); return Math.min(1, Math.log2(1+s)/Math.log2(43)); }
/* puro: il rientro — streak azzerato ma con storia recente: il fuoco sa di aver gia bruciato */
function fuocoRientro(streak,giorni,tk){
  if((streak|0)>1) return false;
  if(!giorni||typeof giorni!=='object') return false;
  const oggi=new Date(tk); let storia=0;
  for(let i=2;i<=14;i++){ const d=new Date(oggi); d.setDate(d.getDate()-i);
    const k=d.toISOString().slice(0,10); const g=giorni[k];
    if(g&&(g.fatte|0)>0) storia++; }
  return storia>=3;
}
/* puro: il marchio del giorno — 0 nessuno, 1 patto mantenuto, 2 azzardo vinto */
/* ══ LA SFIDA CHE CRESCE — puro: quale rituale e maturo, quale assaggio chiede l'esito ══
   Legge: il motore propone, mai impone. Assaggio di un giorno (patto audace, il rituale
   resta com'e) -> dopo tre assaggi vinti propone la forma stabile. Rifiuto implicito=14gg,
   sfida persa=30gg di silenzio. */
function sfidaMatura(state,t,tk){
  if(!t||!Array.isArray(t.days)||!t.days.length) return false;
  const m=((state.mastery||{}).quest||{})[t.id];
  if(m&&(((m.attriti|0)>=1)||((m.assenze|0)>=3))) return false;
  let plan=0,fatte=0;
  for(let i=1;i<=21;i++){
    const d=new Date(tk+'T12:00:00'); d.setDate(d.getDate()-i);
    if(!t.days.includes(dowOf(d))) continue;
    plan++;
    const k=d.toISOString().slice(0,10);
    if(state.checks[k]&&state.checks[k][t.id]===true) fatte++;
  }
  return plan>=10&&(fatte/plan)>=0.9;
}
function sfidaCandidate(state,tk){
  const sfide=state.sfide||{}; const sched=state.scheduled||[];
  const dISO=(base,delta)=>{ const d=new Date(base+'T12:00:00'); d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10); };
  const q14=dISO(tk,-14), q3=dISO(tk,-3);
  for(const t of sched){
    if(!t||!t.id||!t.titolo) continue;
    const e=sfide[t.id]; if(!e) continue;
    if(e.stabile||!(e.giorni||[]).length) continue;
    const giorni=e.giorni.filter(g=>g<tk);
    if(!giorni.length) continue;
    const vinte=giorni.filter(g=>state.checks[g]&&state.checks[g][t.id]===true);
    if(giorni.length>=3) return (vinte.length>=3&&e.forma)?{tipo:'stabile',id:t.id,forma:e.forma,titolo:t.titolo}:{tipo:'spegni',id:t.id};
    if(e.forma&&giorni[giorni.length-1]<=q3) return {tipo:'assaggio',id:t.id,titolo:t.titolo,forma:e.forma};
  }
  for(const t of sched){
    if(!t||!t.id||!t.titolo) continue;
    const e=sfide[t.id];
    if(e&&((e.taciFino&&e.taciFino>=tk)||(e.prop&&e.prop>q14)||(e.giorni||[]).length)) continue;
    if(e&&e.stabile&&e.stabile>dISO(tk,-21)) continue;
    if(sfidaMatura(state,t,tk)) return {tipo:'assaggio',id:t.id,titolo:t.titolo};
  }
  return null;
}
const SFIDA_SYS='Sei il motore di Sentiero. Un rituale quotidiano e diventato solido: proponi UNA versione appena piu alta.\n'+
'REGOLE: stessa attivita, incremento piccolo e concreto (il grande nasce dal piccolo): un quarto d\u2019ora prima, una serie o una soglia in piu. Mai raddoppi, mai attivita nuove.\n'+
'FORMATO: solo il nuovo titolo, imperativo conciso nello stile dell\u2019originale, massimo sessanta caratteri, in italiano. Niente JSON, markdown o etichette.';
async function askSfida(id){
  const t=(S.scheduled||[]).find(x=>x&&x.id===id); if(!t) throw new Error('rituale');
  let plan=0,fatte=0; const tkS=todayKey();
  for(let i=1;i<=21;i++){ const d=new Date(tkS+'T12:00:00'); d.setDate(d.getDate()-i);
    if(!t.days.includes(dowOf(d))) continue; plan++;
    const k=d.toISOString().slice(0,10);
    if(S.checks[k]&&S.checks[k][t.id]===true) fatte++; }
  const res=await aiCall({system:SFIDA_SYS,user:'RITUALE: '+t.titolo+'\nCOSTANZA: '+fatte+' fatte su '+plan+' previste nelle ultime tre settimane.',task:'sfida',maxOutputTokens:100,reasoning:'minimal',timeout:20000,priority:10});
  if(res.err) throw new Error(res.err);
  let f=clampStr(String((res&&res.text)||''),80).trim();
  try{ const p=_geminiStructuredJson(f); if(p&&typeof p.sfida==='string') f=clampStr(p.sfida,80).trim(); }catch(_){}
  if(!f||f.toLowerCase()===t.titolo.trim().toLowerCase()) throw new Error('vuota');
  /* Qui l'imperativo e il prodotto, quindi la prescrizione e ammessa; restano
     vietati gergo interno e verdetti sulla persona. */
  if(_lingVoceVeto(f,{prescrizione:false,gergo:true,giudizio:true})) throw new Error('qualita');
  return f;
}
function pattoMark(patto,tk,checksDay){
  if(!patto||patto.tk!==tk) return 0;
  if(!checksDay||!checksDay[patto.id]) return 0;
  return patto.audace?2:1;
}
function azzardoCandidates(sched,mastery){
  const out=[]; const m=(mastery&&mastery.quest)||{};
  (sched||[]).forEach(t=>{ const q=m[t.id];
    if(q&&(((q.assenze|0)>=3)||((q.attriti|0)>=1))&&t.titolo) out.push({id:t.id,titolo:t.titolo}); });
  const seen=new Set();
  return out.filter(c=>{ if(seen.has(c.id)) return false; seen.add(c.id); return true; }).slice(0,3);
}
function renderPatto(){
  const box=document.getElementById('patto'); if(!box) return;
  const tk=todayKey();
  const scelto=(S.patto&&S.patto.tk===tk);
  let no=false; try{ no=(localStorage.getItem('sentiero-patto-no')===tk); }catch(_){}
  let sched=[]; try{ sched=scheduledFor(S,dowOf(),tk)||[]; }catch(_){}
  let qOggi=[]; try{ qOggi=(S.quests||[]).filter(q=>q&&q.id&&!q.fatto&&(!q.quando||q.quando<=tk)).slice(0,3); }catch(_){}   /* anche le quest del giorno sono passi che contano */
  /* v179: prima, appena sceglievi, la pergamena spariva del tutto. La promessa
     durava il tempo di farla. Ora la carta si richiude su una riga sola e resta
     sotto gli occhi tutto il giorno. Nessun contatore, nessun sollecito: dice
     solo cosa hai promesso stamattina. */
  if(scelto){
    const pq=(S.quests||[]).find(x=>x&&x.id===S.patto.id)||(S.scheduled||[]).find(x=>x&&x.id===S.patto.id);
    if(!pq){ box.innerHTML=''; box.classList.add('hidden'); box.dataset.tk=''; box.dataset.stato=''; return; }
    let fatta=false; try{ fatta=!!pq.fatto||!!((S.checks[tk]||{})[S.patto.id]); }catch(_){}
    const firma=tk+'|'+S.patto.id+'|'+(fatta?'1':'0');
    if(box.dataset.stato===firma) return;          /* gia in scena e uguale: non si ridisegna */
    box.dataset.stato=firma; box.dataset.tk=tk;
    box.classList.remove('hidden'); box.classList.add('chiusa');
    box.classList.toggle('tenuta',fatta);
    box.innerHTML='<div class="patto-angoli"></div>'+
      '<span class="patto-eyebrow">la promessa del mattino</span>'+
      '<span class="patto-chiusa"><i class="patto-luce"></i><span>'+
        escapeHtml(clampStr(pq.titolo||'',140))+'</span></span>'+
      (fatta?'<span class="patto-tenuta">tenuta</span>':'');
    return;
  }
  if(no||(!sched.length&&!qOggi.length)){ box.innerHTML=''; box.classList.add('hidden');
    box.dataset.tk=''; box.dataset.stato=''; return; }
  if(box.dataset.tk===tk&&box.innerHTML){ box.classList.remove('hidden'); return; }   /* gia in scena: l'ingresso non si rigioca */
  box.dataset.tk=tk; box.dataset.stato='';
  box.classList.remove('hidden'); box.classList.remove('chiusa'); box.classList.remove('tenuta');
  box.innerHTML='<div class="patto-angoli"></div><div class="patto-fermaglio"><b></b></div>'+
    '<span class="patto-eyebrow">la promessa del mattino</span>'+
    '<span class="patto-title">Cosa conta davvero, oggi?</span>'+
    sched.slice(0,6).concat(qOggi).map(t=>'<button class="patto-r" data-id="'+t.id+'">'+escapeHtml(t.titolo||'')+'</button>').join('')+
    (function(){ const az=azzardoCandidates(sched,S.mastery);
      return '<div class="azz-head">la scommessa \u2014 la cosa che rimandi da troppo</div>'+
        az.map(c=>'<button class="patto-r azz-r" data-id="'+c.id+'">'+escapeHtml(c.titolo)+'</button>').join('')+
        '<button class="patto-nuovo azz-nuovo">+ scrivi la scommessa</button>'; })()+
    (function(){ let sf=null; try{ sf=sfidaCandidate(S,tk); }catch(_){}
      if(!sf) return '';
      if(!S.sfide) S.sfide={};
      if(sf.tipo==='spegni'){ const e=S.sfide[sf.id];
        if(e){ const d=new Date(tk+'T12:00:00'); d.setDate(d.getDate()+30);
          e.taciFino=d.toISOString().slice(0,10); e.giorni=[]; e.forma=''; save(); }
        return ''; }
      const e=S.sfide[sf.id]||(S.sfide[sf.id]={prop:'',taciFino:'',forma:'',giorni:[],stabile:''});
      if(sf.tipo==='stabile') return '<div class="azz-head sfida-head">alzata tre volte: rendila la nuova normalit\u00e0</div>'+
        '<button class="patto-r sfida-r" data-sfida-stabile="'+sf.id+'">\u00ab'+escapeHtml(sf.forma)+'\u00bb \u00b7 da oggi vale questa</button>';
      if(e.prop!==tk){ e.prop=tk; save(); }
      return '<div class="azz-head sfida-head">una cosa ti riesce quasi sempre: alzala di un pelo</div>'+
        '<button class="patto-r sfida-r" data-sfida="'+sf.id+'" data-forma="'+escapeHtml(sf.forma||'')+'">'+escapeHtml(sf.titolo)+' \u00b7 prova ad alzarla</button>'; })()+
    '<button class="patto-nuovo">+ un passo nuovo</button>'+
    '<div class="patto-nuovo-box hidden"><input class="patto-inp" type="text" maxlength="80" placeholder="l\'idea di stamattina\u2026" enterkeyhint="done"><button class="patto-inp-ok">Patto</button></div>'+
    '<button class="patto-no">oggi niente promesse</button>';
  box.querySelectorAll('.patto-r').forEach(bt=>{ bt.onclick=()=>{
    const audace=bt.classList.contains('azz-r');
    S.patto={tk:tk,id:bt.dataset.id,audace:audace}; save();
    try{ if(anzianita(S)<1) toast(audace?'Scommessa presa: stasera si vede.':'Promessa presa: stasera si vede.'); }catch(_){}
    try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
  };});
  const bn=box.querySelector('.patto-no');
  if(bn) bn.onclick=()=>{ try{ localStorage.setItem('sentiero-patto-no',tk); }catch(_){} renderPatto(); };
  /* la sfida che cresce: l'assaggio apre la casella con la forma alzata (AI o mano tua) */
  const nboxS=box.querySelector('.patto-nuovo-box');
  const bsf=box.querySelector('[data-sfida]');
  if(bsf) bsf.onclick=async()=>{
    if(!nboxS) return;
    nboxS.dataset.audace='1'; nboxS.dataset.sfida=bsf.dataset.sfida;
    box.querySelectorAll('.patto-nuovo').forEach(x=>x.classList.add('hidden'));
    nboxS.classList.remove('hidden');
    const inp=nboxS.querySelector('.patto-inp');
    if(inp){
      inp.placeholder='come la alzi, oggi?\u2026';
      inp.value=bsf.dataset.forma||'';
      if(!inp.value&&GEMINI_KEY){
        inp.placeholder='la forma alzata sta arrivando\u2026';
        try{ const f=await askSfida(bsf.dataset.sfida); if(f&&!inp.value) inp.value=f; }catch(_){}
        inp.placeholder='come la alzi, oggi?\u2026';
      }
      inp.focus();
    }
  };
  const bst=box.querySelector('[data-sfida-stabile]');
  if(bst) bst.onclick=()=>{
    const id=bst.dataset.sfidaStabile;
    const t=(S.scheduled||[]).find(x=>x&&x.id===id);
    const e=(S.sfide||{})[id];
    if(t&&e&&e.forma){
      t.titolo=e.forma; e.stabile=tk; e.giorni=[]; e.forma=''; save();
      try{ toast('Da oggi vale: \u00ab'+t.titolo+'\u00bb'); }catch(_){}
      box.dataset.tk='';
      try{ render(); }catch(_){} try{ renderPatto(); }catch(_){} try{ updateRing(); }catch(_){}
    }
  };
  /* l'idea del mattino diventa la puntata: nasce quest di oggi, il patto si stringe su di lei */
  const nbox=box.querySelector('.patto-nuovo-box');
  box.querySelectorAll('.patto-nuovo').forEach(bnu=>{ bnu.onclick=()=>{
    if(nbox){ nbox.dataset.audace=bnu.classList.contains('azz-nuovo')?'1':'';
      box.querySelectorAll('.patto-nuovo').forEach(x=>x.classList.add('hidden'));
      /* v164: la casella nasceva in FONDO al foglio (fuori schermo) e il focus era in un
         setTimeout - iOS apre la tastiera solo dentro il gesto. Ora la casella si sposta
         accanto al bottone toccato e il focus e sincrono. */
      try{ bnu.insertAdjacentElement('afterend',nbox); }catch(_){}
      nbox.classList.remove('hidden');
      const inp=nbox.querySelector('.patto-inp');
      if(inp){ inp.focus(); try{ nbox.scrollIntoView({block:'center'}); }catch(_){} }
    }
  };});
  const bok=box.querySelector('.patto-inp-ok');
  const nasciPatto=()=>{
    const inp=box.querySelector('.patto-inp'); if(!inp) return;
    const titolo=String(inp.value||'').trim().slice(0,80); if(!titolo) return;
    const sfId=(box.querySelector('.patto-nuovo-box')||{dataset:{}}).dataset.sfida;
    if(sfId){
      if(!S.sfide) S.sfide={};
      const e=S.sfide[sfId]||(S.sfide[sfId]={prop:tk,taciFino:'',forma:'',giorni:[],stabile:''});
      e.forma=titolo; e.giorni=(e.giorni||[]).concat([tk]).slice(-8);
      S.patto={tk:tk,id:sfId,audace:true}; save();
      try{ toast('\u00ab'+titolo+'\u00bb \u2014 oggi si prova cos\u00ec. Stasera si vede.'); }catch(_){}
      try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
      return;
    }
    const q={id:coreUid(),titolo:titolo,note:'',quando:tk,ora:'',prio:3,fatto:false,nata:tk};
    if(!Array.isArray(S.quests)) S.quests=[];
    S.quests.push(q);
    const aud=!!(box.querySelector('.patto-nuovo-box')&&box.querySelector('.patto-nuovo-box').dataset.audace);
    S.patto={tk:tk,id:q.id,audace:aud}; save();
    try{ if(anzianita(S)<1) toast((aud?'Azzardo scritto: ':'Nata dal patto: ')+'\u00ab'+titolo+'\u00bb'); }catch(_){}
    try{ render(); }catch(_){} try{ updateRing(); }catch(_){}
  };
  if(bok) bok.onclick=nasciPatto;
  const binp=box.querySelector('.patto-inp');
  if(binp) binp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); nasciPatto(); } });
}
/* v145: renderCammino estirpato - il passato vive nella stanza del giardino */
/* ══ L'ENSŌ CHE NON CHIEDE DI ESSERE SALVATO — v273 LAB ═════════════════════
   Il doppio tocco e poi il pulsante erano entrambi memoria affidata alla persona:
   se non ricordi di esportare, perdi proprio il segno che dovrebbe ricordarti il
   mese. Il recap mensile ha gia il momento giusto: quando `capitolo` si chiude,
   i dati sono stabili. Da quelli nasce un ensō deterministico che:
     1. compare dentro il capitolo mensile;
     2. viene archiviato automaticamente in IndexedDB sul dispositivo;
     3. non gonfia lo state e quindi non entra nel JSON di backup;
     4. e rigenerabile dal capitolo stesso dopo un import.
   Nessun download silenzioso verso Foto/File: Safari non garantisce scritture
   arbitrarie fuori dalla sandbox senza un gesto dell'utente. Qui "automatico"
   significa davvero automatico e affidabile: archivio locale dell'app, senza
   prompt e senza pulsanti. */
const ENSO_DB='sentiero-enso-v1', ENSO_STORE='archivio';
let _ensoDbP=null;
function ensoDb(){
  if(_ensoDbP) return _ensoDbP;
  _ensoDbP=new Promise((resolve,reject)=>{
    try{
      const rq=indexedDB.open(ENSO_DB,1);
      rq.onupgradeneeded=()=>{ const db=rq.result; if(!db.objectStoreNames.contains(ENSO_STORE)) db.createObjectStore(ENSO_STORE,{keyPath:'id'}); };
      rq.onsuccess=()=>resolve(rq.result); rq.onerror=()=>reject(rq.error||new Error('enso-db'));
    }catch(e){ reject(e); }
  });
  return _ensoDbP;
}
function _ensoCapColore(pt){
  if(pt&&pt.pieno) return '#F5F2EA';
  if(pt&&pt.p>0) return '#E8A84C';
  return 'rgba(245,242,234,.10)';
}
function _ensoCapAlpha(pt){
  if(pt&&pt.pieno) return 0.96;
  if(pt&&pt.p>0) return Math.max(.24,Math.min(.86,.24+(+pt.p||0)*.62));
  return .10;
}
function capitoloEnsoSvg(c){
  const pts=(c&&Array.isArray(c.pietre))?c.pietre:[]; if(!pts.length) return '';
  const n=pts.length, r=43, circ=2*Math.PI*r, slot=circ/n, seg=Math.max(1,slot*.72);
  let out='<svg class="cap-enso" viewBox="0 0 120 120" aria-label="Ensō del mese"><circle class="base" cx="60" cy="60" r="43"/>';
  pts.forEach((pt,i)=>{
    const off=-(i*slot);
    const sw=pt&&pt.pieno?8.8:(pt&&pt.p>0?7.2:4.2);
    out+='<circle class="seg" cx="60" cy="60" r="43" stroke="'+_ensoCapColore(pt)+'" stroke-opacity="'+_ensoCapAlpha(pt).toFixed(2)+'" stroke-width="'+sw+'" stroke-dasharray="'+seg.toFixed(2)+' '+(circ-seg).toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'" transform="rotate(-90 60 60)"/>';
    if(pt&&pt.oro){ const a=-Math.PI/2+(i+.5)*Math.PI*2/n, rr=54; const x=60+Math.cos(a)*rr, y=60+Math.sin(a)*rr;
      out+='<circle class="oro" cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="'+(pt.oro===2?2.3:1.7)+'"/>'; }
  });
  return out+'</svg>';
}
function capitoloEnsoCanvas(c,size){
  const pts=(c&&Array.isArray(c.pietre))?c.pietre:[]; if(!pts.length) return null;
  const S1=size||900, cv=document.createElement('canvas'); cv.width=S1; cv.height=S1;
  const ctx=cv.getContext('2d'); if(!ctx) return null;
  ctx.fillStyle='#000'; ctx.fillRect(0,0,S1,S1);
  const cx=S1/2,cy=S1/2,r=S1*.31,n=pts.length,gap=.34*(Math.PI*2/n);
  ctx.lineCap='round';
  ctx.strokeStyle='rgba(245,242,234,.08)'; ctx.lineWidth=S1*.035;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  pts.forEach((pt,i)=>{
    const a0=-Math.PI/2+i*Math.PI*2/n+gap/2, a1=-Math.PI/2+(i+1)*Math.PI*2/n-gap/2;
    ctx.globalAlpha=_ensoCapAlpha(pt); ctx.strokeStyle=_ensoCapColore(pt);
    ctx.lineWidth=S1*(pt&&pt.pieno?.044:(pt&&pt.p>0?.036:.020));
    ctx.beginPath(); ctx.arc(cx,cy,r,a0,a1); ctx.stroke();
    if(pt&&pt.oro){ const a=(a0+a1)/2,rr=r+S1*.075; ctx.globalAlpha=1; ctx.fillStyle='#E8A84C';
      ctx.beginPath(); ctx.arc(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,S1*(pt.oro===2?.012:.008),0,Math.PI*2); ctx.fill(); }
  });
  ctx.globalAlpha=1;
  return cv;
}
function _canvasBlob(cv){ return new Promise(resolve=>{ try{ cv.toBlob(b=>resolve(b||null),'image/png'); }catch(_){ resolve(null); } }); }
async function archiviaEnsoCapitolo(c){
  if(!c||!/^\d{4}-\d{2}$/.test(c.mese||'')) return false;
  const cv=capitoloEnsoCanvas(c,900); if(!cv) return false;
  const blob=await _canvasBlob(cv); if(!blob) return false;
  const db=await ensoDb();
  await new Promise((resolve,reject)=>{ try{
    const tx=db.transaction(ENSO_STORE,'readwrite');
    tx.objectStore(ENSO_STORE).put({id:'mese:'+c.mese,mese:c.mese,tipo:'mese',mime:'image/png',blob:blob,quando:new Date().toISOString()});
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error||new Error('enso-put')); tx.onabort=()=>reject(tx.error||new Error('enso-abort'));
  }catch(e){ reject(e); } });
  try{ nota('ens',1); }catch(_){}
  return true;
}
const _ensoCapSession=new Set();
function assicuraEnsoCapitolo(c){
  if(!c||!c.mese||_ensoCapSession.has(c.mese)) return;
  _ensoCapSession.add(c.mese);
  Promise.resolve().then(()=>archiviaEnsoCapitolo(c)).catch(()=>{ _ensoCapSession.delete(c.mese); try{ nota('ens',2); }catch(_){} });
}
/* ══ Lab 23 — MESSAGGI CHE SI POSSONO DAVVERO LEGGERE ════════════════════
   Perla e dono sono rari: proprio per questo non devono evaporare mentre la
   persona sta guardando altro. Restano nel front finche viene premuta la X.
   Non entrano nel backup e non cambiano Diario/quest: e solo memoria di UI. */
const VOCE_BANNER_LS='sentiero-voce-banner-v1';
let _voceBannerAnnulla=null;
function _voceBannerCoda(){
  try{
    const x=JSON.parse(localStorage.getItem(VOCE_BANNER_LS)||'null');
    const a=Array.isArray(x)?x:(x?[x]:[]);                  /* compatibile con Lab 23/24: prima c'era un solo oggetto */
    return a.filter(v=>v&&v.tk===todayKey()&&v.testo).slice(0,4);
  }catch(_){ return []; }
}
function _voceBannerSalva(a){
  try{
    const q=(a||[]).filter(v=>v&&v.tk===todayKey()&&v.testo).slice(0,4);
    if(q.length) localStorage.setItem(VOCE_BANNER_LS,JSON.stringify(q));
    else localStorage.removeItem(VOCE_BANNER_LS);
  }catch(_){}
}
function _voceBannerLeggi(){ const q=_voceBannerCoda(); return q.length?q[0]:null; }
function _voceBannerSegnaOsservatrice(x){
  if(!x||x.tipo!=='osservatrice'||!x.ref) return;
  try{
    const n=(S.observerNotes||[]).find(v=>v&&v.id===x.ref);
    if(n&&!n.vista){ n.vista=true; save(); try{ regCantiere('osservatrice',{msg:'letta nel banner'}); }catch(_){} }
  }catch(_){}
}
function renderVoceBanner(x){
  const el=document.getElementById('voce-banner'); if(!el) return false;
  try{ if(_voceBannerAnnulla){ _voceBannerAnnulla(); _voceBannerAnnulla=null; } }catch(_){}
  x=x||_voceBannerLeggi();
  if(!x){ el.classList.add('hidden'); el.classList.remove('dono','osservatrice'); return false; }
  const t=document.getElementById('voce-banner-txt'), tag=document.getElementById('voce-banner-tag');
  if(t) t.textContent=String(x.testo||'');
  if(tag) tag.textContent=x.tipo==='dono'?'Trovato sul sentiero':(x.tipo==='osservatrice'?'L\u2019Osservatrice':'Una riga sul sentiero');
  el.classList.toggle('dono',x.tipo==='dono');
  el.classList.toggle('osservatrice',x.tipo==='osservatrice');
  el.classList.remove('hidden');
  /* Lab 25: l'osservazione non e "vista" perche e stata messa nel DOM. Deve
     essere stata davvero davanti agli occhi, come il Lascito. Se resta dietro
     la pagina Parla, il contatore non mente. */
  if(x.tipo==='osservatrice'&&x.ref){
    try{ _voceBannerAnnulla=quandoDavveroVisibile(el,1600,function(){ _voceBannerSegnaOsservatrice(x); }); }catch(_){}
  }
  return true;
}
function mostraVoceBanner(testo,tipo,opt){
  opt=opt||{};
  const tp=tipo==='dono'?'dono':(tipo==='osservatrice'?'osservatrice':'perla');
  const x={tk:todayKey(),testo:String(testo||'').trim(),tipo:tp};
  if(opt.ref) x.ref=String(opt.ref).slice(0,64);
  if(!x.testo) return false;
  const q=_voceBannerCoda();
  const dup=q.some(v=>(x.ref&&v.ref===x.ref)||(!x.ref&&v.tipo===x.tipo&&v.testo===x.testo));
  if(!dup){ q.push(x); _voceBannerSalva(q); }
  return renderVoceBanner();
}
function chiudiVoceBanner(){
  const q=_voceBannerCoda(); const x=q.shift()||null;
  if(x) _voceBannerSegnaOsservatrice(x);                  /* una X esplicita conta come lettura/decisione */
  _voceBannerSalva(q);
  try{ if(_voceBannerAnnulla){ _voceBannerAnnulla(); _voceBannerAnnulla=null; } }catch(_){}
  if(q.length) renderVoceBanner(q[0]);
  else{ const el=document.getElementById('voce-banner'); if(el){ el.classList.add('hidden'); el.classList.remove('dono','osservatrice'); } }
}

/* ══ IL DONO — poche volte l'anno, vero caso: una riga trovata, mai guadagnata.
   MAI oro, MAI voce dell'osservatrice, MAI numeri. Un tiro al giorno, quiete di
   ventun giorni tra un dono e l'altro, la perla vince, il seme quel giorno tace. ══ */
function meteoCarattere(r){ return r<0.5?'quieto':(r<0.82?'vento':'crepito'); }
const DONI=[
 'una foglia attraversa la strada. nessuno la vede, tranne te.',
 'il ciliegio non tiene il conto dei suoi fiori.',
 'la luna non corre. eppure arriva sempre.',
 'il vento passa tra i rami senza contarli.',
 'la pioggia cade uguale sul tetto e sul sentiero.',
 'una pietra nel torrente: liscia, e senza fretta di esserlo.',
 'anche il silenzio, stamattina, era una specie di musica.',
 'il sole non sa di essere puntuale.',
 'l\u2019erba cresce anche dove nessuno guarda.',
 'due rive, lo stesso fiume.'
];
function donoCandidate(rng,ctx){
  if(ctx.ultimo){ const gap=Math.round((Date.parse(ctx.tk+'T12:00:00Z')-Date.parse(ctx.ultimo+'T12:00:00Z'))/86400000); if(gap<21) return -1; }
  if(rng()>=1/80) return -1;
  const dati=ctx.dati||[]; const liberi=[];
  for(let i=0;i<ctx.poolN;i++) if(dati.indexOf(i)<0) liberi.push(i);
  const pool=liberi.length?liberi:Array.from({length:ctx.poolN},(_,i)=>i);
  return pool[Math.floor(rng()*pool.length)%pool.length];
}
function donoScrivi(testo){
  return mostraVoceBanner(String(testo||'').replace(/\s*·\s*trovato sul sentiero\s*$/i,''),'dono');
}
function maybeDono(){
  try{
    const tk=todayKey();
    try{ if(localStorage.getItem('sentiero-perla')===tk) return; }catch(_){}   /* la perla vince */
    let st=null; try{ st=JSON.parse(localStorage.getItem('sentiero-dono')||'null'); }catch(_){}
    if(!st||typeof st!=='object') st={roll:'',ultimo:'',dati:[]};
    if(st.roll===tk) return;                                                   /* un tiro al giorno */
    st.roll=tk;
    const idx=donoCandidate(Math.random,{tk:tk,ultimo:st.ultimo||'',dati:st.dati||[],poolN:DONI.length});
    if(idx>=0&&donoScrivi(DONI[idx])){
      st.ultimo=tk; st.dati=(st.dati||[]).concat([idx]);
      if(st.dati.length>=DONI.length) st.dati=[];
    }
    try{ localStorage.setItem('sentiero-dono',JSON.stringify(st)); }catch(_){}
  }catch(_){}
}
/* ══ LE PERLE: dettagli rari, mai a caso, max una al giorno ══ */
function perle(){
  const tk=todayKey();
  try{ if(localStorage.getItem('sentiero-perla')===tk) return; }catch(_){}
  const d=new Date(); const pr=computeProgress(S,tk,dowOf());
  const sealed=S.lastSealed===tk, full=S.lastFullSealed===tk;
  const L=[];
  if(full&&S.streak===7)  L.push('sette giorni. il tratto non si e mai staccato dal foglio.');
  if(full&&S.streak===30) L.push('trenta cerchi. la via si fa camminando.');
  if(full&&S.streak===42) L.push('quarantadue. la risposta, a quanto pare, era la costanza.');
  if(full&&S.streak===100)L.push('cento. a questo punto sei tu che disegni il cerchio, non il contrario.');
  if(pr.done===1&&d.getHours()<6) L.push('prima dell\'alba. il mondo dorme, tu hai gia un segno.');
  if(sealed&&d.getDay()===5&&d.getHours()>=20) L.push('cerchio chiuso, venerdi sera. shine on.');
  if((S.diary||[]).length===100) L.push('cento voci. fatti non foste a viver come bruti.');
  if(full&&d.getDate()===1) L.push('primo del mese, cerchio pieno: ben cominciato e mezzo fatto.');
  if(sealed&&d.getMonth()===11&&d.getDate()===21) L.push('la notte piu lunga dell\'anno, e il tuo cerchio e chiuso lo stesso.');
  if(sealed&&d.getMonth()===5&&d.getDate()===21) L.push('solstizio: oggi anche il sole ha fatto il giro largo.');
  if(!L.length) return;
  const dl=document.querySelector('#day-line'); if(!dl) return;
  try{ localStorage.setItem('sentiero-perla',tk); }catch(_){}
  /* Lab 23: una perla rara non ha piu una scadenza di nove secondi. */
  mostraVoceBanner(L[0],'perla');
}
function syncDayLine(){   /* striscia di stato in pagina Oggi: eco del cerchio + doppio mini-anello */
  const dl=document.querySelector('#day-line'); if(!dl) return;
  const rc=document.querySelector('#ring-count');
  dl.textContent=rc?rc.textContent:'';
  try{ dl.classList.toggle('sealed',micBtn.classList.contains('sealed')); }catch(_){}
}
function updateRing(){
  const tk=todayKey(),dow=dowOf();
  const r=computeProgress(S,tk,dow);
  window._ensoTarget=r.p;
  try{ if(!S.foto) S.foto={}; S.foto[tk]={done:r.done|0,tot:(r.total|0)};
    const kk=Object.keys(S.foto); if(kk.length>60) kk.sort().slice(0,kk.length-60).forEach(k=>{ delete S.foto[k]; }); }catch(_){}   /* la pittura la disegna il motore rAF, frame per frame */
  try{ window._ensoCalore=fuocoCalore(S.streak);
    window._ensoRientro=fuocoRientro(S.streak,(S.mastery&&S.mastery.giorni)||null,todayKey()); }catch(_){}
  try{ syncAdaptiveMusic(false); }catch(_){}  /* musica adattiva: WAV primario, generativo come fallback */
  const res=sealIfComplete(S,tk,dow);
  if(res==='soft'){
    save();
    micBtn.classList.add('sealed');
    haptic(true); setTimeout(()=>haptic(true),150);   /* due pulsazioni morbide: sei tornato a casa */
    floatWord('Cerchio del giorno',4);
    try{ document.querySelector('#ring-count').textContent='Cerchio del giorno · gli essenziali ci sono'; }catch(_){}
    try{ renderStreak(); }catch(_){}
  } else if(res==='full'){
    save();
    haptic(true); setTimeout(()=>haptic(true),160); setTimeout(()=>haptic(true),320);  /* tre pulsazioni decise: il cerchio è pieno */
    micBtn.classList.add('sealed');
    setTimeout(()=>{
      try{ATHEME.stop(true);}catch(_){}   /* ultima quest completata → fade out dell'Active Theme; niente Victory sintetica */
      try{ say('Cerchio pieno',6); }catch(_){}  /* il conseguimento dice cio che e, non un grado filosofico */
      floatWord('Cerchio pieno',6); shake(true);
      try{ if(!playEventSound('cerchioChiuso') && !playBuiltinSeal() && SFX.length) playSFX(SFX.length-1); }catch(_){}   /* sigillo: suono dedicato, o sigillo incorporato, o l'ultimo livello */
      try{ FX.bloom(); }catch(_){}
      try{ const f=document.querySelector('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }catch(_){}
      try{ streamInto(document.querySelector('#ring-count'),'Cerchio pieno · niente è rimasto fuori',{speed:46}); }catch(_){ try{ document.querySelector('#ring-count').textContent='Cerchio pieno · niente è rimasto fuori'; }catch(_){} }
      try{ renderStreak(); }catch(_){}
    },350);
  } else if(res==='already'){
    micBtn.classList.add('sealed');
    document.querySelector('#ring-count').textContent='Cerchio chiuso · a domani';
  } else {
    micBtn.classList.remove('sealed');
    document.querySelector('#ring-count').textContent= r.total? (r.done+' / '+r.total+' · il cerchio si chiude') : '';
  }
  try{ micBtn.classList.toggle('pieno',S.lastFullSealed===todayKey()); }catch(_){}
  try{ const tkO=todayKey();
    micBtn.classList.toggle('oro',!!(S.patto&&S.patto.tk===tkO&&S.patto.audace&&(S.checks[tkO]||{})[S.patto.id]&&S.lastSealed===tkO));
  }catch(_){}
  try{ syncDayLine(); setTimeout(syncDayLine,2400); }catch(_){}
  /* la memoria d'oro: il registro si scrive (o si ritira) nell'istante del passo */
  try{ const tkM=todayKey();
    if(!S.patti||typeof S.patti!=='object') S.patti={};
    const mk=pattoMark(S.patto,tkM,S.checks[tkM]||{});
    if(mk&&S.patti[tkM]!==mk){ S.patti[tkM]=mk; save(); }
    else if(!mk&&S.patti[tkM]){ delete S.patti[tkM]; save(); }
  }catch(_){}
  try{ renderPatto(); }catch(_){}
  /* la presenza dell'osservatrice: dopo la firma, una soglia dell'accumulo puo farsi voce — una al giorno */
  try{ const tkP=todayKey();
    if(S.lastSealed===tkP&&localStorage.getItem('sentiero-presenza')!==tkP){
      const c=presenzaCandidate(S.mastery);
      if(c){
        let titolo='';
        if(c.id){ const s2=(S.scheduled||[]).find(t=>t.id===c.id); const q2=(S.quests||[]).find(t=>t.id===c.id);
          titolo=(s2&&s2.titolo)||(q2&&q2.titolo)||''; }
        if(!c.id||titolo){
          localStorage.setItem('sentiero-presenza',tkP);
          if(!Array.isArray(S.mastery.detti)) S.mastery.detti=[];
          S.mastery.detti.push(c.key); if(S.mastery.detti.length>40) S.mastery.detti=S.mastery.detti.slice(-40);
          save();
          const txt=presenzaTesto(c.tipo,titolo);
          if(txt) setTimeout(()=>{ try{ _whisper(txt); }catch(_){} },5200);
        }
      }
    } }catch(_){}
  /* la parola della sera: se il patto e mantenuto, la firma lo dice — una volta */
  try{ const tk2=todayKey();
    if(S.patto&&S.patto.tk===tk2&&(S.checks[tk2]||{})[S.patto.id]&&S.lastSealed===tk2&&window._pattoDetto!==tk2){
      window._pattoDetto=tk2; const audD=!!(S.patto&&S.patto.audace);
      setTimeout(()=>{ try{ toast(audD?'La scommessa \u00e8 vinta.':'Promessa mantenuta.'); }catch(_){} },1900);
    } }catch(_){}
  try{ setTimeout(()=>{ perle(); try{ maybeDono(); }catch(_){} try{ const _p=maybeSemina(); if(_p&&_p.catch) _p.catch(function(e){ try{ regCantiere('errore',{msg:'maybeSemina: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} }); }catch(_){} },2800); }catch(_){}   /* il ritardo copre il testo in streaming; poi perla > dono > seme */
  try{ renderFlow(); }catch(_){}
}

/* ======================================================================
   NUOVO GIORNO
   ====================================================================== */
let renderedDay=todayKey();
function initDay(){ if(rolloverDay(S,todayKey())) save(); try{ nota('avv'); }catch(_){}
  /* v271: al caricamento e a ogni giorno nuovo si recupera una condizione
     raggiunta prima di un riavvio, e nascono le occorrenze del giorno. E qui
     che «se l'app era chiusa» smette di essere un buco. */
  try{ sbloccaOra('giorno'); }catch(_){}
  try{ mostraPromemoria(); }catch(_){}
  try{ navVai('parla','avvio'); }catch(_){} }
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'){ try{ save(); }catch(_){} try{ if(window._settleTodayMotion) window._settleTodayMotion('hidden'); }catch(_){} try{FX.pause();}catch(_){} try{ATHEME.pause();}catch(_){} try{MUSIC.stop();}catch(_){} return; }
  try{FX.resume();}catch(_){}
  try{ const c=(typeof audioCtx==='function')&&audioCtx(); if(c&&c.state==='suspended') c.resume(); }catch(_){}   /* iOS sospende l'audio in background: lo risveglio */
  if(renderedDay!==todayKey()){
    renderedDay=todayKey();
    initDay(); resetCapture(); render();
  }
  scheduleReminders();
  capturePos();
  try{ syncAdaptiveMusic(false); }catch(_){}
});

/* ======================================================================
   RENDER
   ====================================================================== */
/* ══════════════════════════════════════════════════════════════════════════
   IL RIDISEGNO (v253) — misurato prima di toccarlo.

   render() rifa OTTO pannelli, per ventimila caratteri di lavoro, con
   ventisette scritture di innerHTML e una decina di cicli. Viene chiamato da
   ventitre punti, quasi sempre subito dopo save(): spuntare una cosa
   ricostruisce anche l'intero pannello delle impostazioni, che quasi sempre
   non e nemmeno sullo schermo.
   E' lo stesso difetto del salvataggio, ma sullo schermo, e la cura e la stessa:
   chi chiama dice «questo va ridisegnato», non «ridisegna adesso». Piu chiamate
   nello stesso istante diventano un ridisegno solo, sul fotogramma dopo - che e
   anche il momento giusto, perche il browser sta per dipingere comunque.
   Due cautele, e sono quelle che rendono la cosa sicura:
   · chi ha bisogno del DOM aggiornato SUBITO chiama renderSubito();
   · le cose NATE non si perdono: se arrivano piu chiamate i loro id si sommano
     invece di sovrascriversi. Perderli vorrebbe dire una riga che compare senza
     nascere. */
let _renderT=null,_bornAcc=[];
let _forzaSettings=false;   /* quando il pannello si apre, si ridisegna comunque */

function render(bornIds){
  if(bornIds&&bornIds.length) _bornAcc=_bornAcc.concat(bornIds);
  if(_renderT) return;
  _renderT=requestAnimationFrame(function(){
    _renderT=null;
    const b=_bornAcc; _bornAcc=[];
    renderOra(b);
  });
}
function renderSubito(bornIds){
  if(_renderT){ try{ cancelAnimationFrame(_renderT); }catch(_){} _renderT=null; }
  if(bornIds&&bornIds.length) _bornAcc=_bornAcc.concat(bornIds);
  const b=_bornAcc; _bornAcc=[];
  renderOra(b);
}

function renderOra(bornIds){
  const S_=(f)=>{ try{ f(); }catch(_){} };  /* ogni sezione è isolata: un guasto non ferma le altre */
  S_(()=>renderTasks());
  S_(()=>renderTodayQuests(bornIds||[]));
  S_(()=>renderQuests(bornIds||[]));
  S_(()=>renderDiary());
  S_(()=>renderSettings());
  S_(()=>renderStreak());
  S_(()=>updateRing());
  S_(()=>renderFlow());
}
function todaysScheduled(){ return scheduledFor(S,dowOf(),todayKey()); }
function setEmpty(el,text,action,label){
  try{ if(anzianita(S)>=1){ action=null; label=null; } }catch(_){}
  el.innerHTML='<p class="empty">'+escapeHtml(text)+(action&&label?'<button class="empty-go" data-flow="'+action+'">'+escapeHtml(label)+'</button>':'')+'</p>';
  const b=el.querySelector('[data-flow]');
  if(b) b.onclick=()=>handleFlowAction(b.dataset.flow);
}

function buildTaskRow(t,checks){
  const done=checks[t.id]===true;
  const isEss=(S.essentials||[]).includes(t.id);
  const div=document.createElement('div');
  div.className='item'+(done?' done':'')+((S.patto&&S.patto.tk===todayKey()&&S.patto.id===t.id)?(' passo'+(S.patto.audace?' audace':'')):'');
  div.dataset.tid=t.id;
  div.innerHTML='<span class="prio prio-0"></span>'+
    '<button class="chk" aria-label="Completa"><svg class="chk-mark" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>'+
    '<span class="txt"><span class="ttl">'+inizialeQuest(String(t.titolo||'').charAt(0).toUpperCase()+String(t.titolo||'').slice(1),t.id)+'</span>'+(t.time?'<span class="meta">'+t.time+'</span>':'')+'</span>'+
    '<button class="essbtn'+(isEss?' on':'')+'" aria-label="Essenziale" title="Essenziale: chiude il Cerchio del giorno">&#9670;</button>';
  div.querySelector('.essbtn').onclick=(e)=>{
    e.stopPropagation();
    S.essentials=S.essentials||[];
    const i=S.essentials.indexOf(t.id);
    if(i>=0) S.essentials.splice(i,1);
    else { S.essentials.push(t.id); if(S.essentials.length===1) toast('Segnata come importante: stasera conta questa'); }
    save(); renderTasks(); updateRing();
  };
  div.querySelector('.chk').onclick=()=>{
    if(div.dataset.busy) return;
    div.dataset.busy='1';
    const tk=todayKey();
    S.checks[tk]=S.checks[tk]||{};
    const now=!(S.checks[tk][t.id]===true);   /* stato LIVE: non ricostruiamo più la riga, quindi 'done' catturato sarebbe vecchio */
    S.checks[tk][t.id]=now; save();
    /* v271: una spunta puo essere l'ultimo pezzo di una condizione */
    if(now) try{ sbloccaOra('spunta'); }catch(_){}
    if(now){ div.classList.add('done'); const ms=onComplete(div)||600; setTimeout(()=>{ div.classList.remove('justdone'); delete div.dataset.busy; },ms+40); }
    else { div.classList.remove('done'); sUndo(); updateRing(); const left=completateOggi(S,tk,dowOf()); const ms=Math.max(QUEST_MOTION.undo(div,completateOggi(S,tk,dowOf())),TODAY_STAGE.undo(div,left)); setTimeout(()=>{ delete div.dataset.busy; },Math.max(80,ms+20)); }
  };
  try{ attachNota(div,t.id,t.titolo); }catch(_){}
  return div;
}
function renderTasks(){
  const el=document.querySelector('#list-task'); const all=todaysScheduled();
  const checks=S.checks[todayKey()]||{};
  if(!all.length){ setEmpty(el,'Nessuna task pianificata per oggi. Se vuoi un appiglio fisso, crealo una volta e poi non pensarci piu.','tasks','Crea una task'); return; }
  const now=nowMin();
  /* azioni con orario: affiorano quando è la loro ora (e restano se in ritardo); senza orario: sempre presenti */
  const due=[], later=[];
  all.forEach(t=>{
    const tm=hmToMin(t.time);
    if(checks[t.id]===true || tm==null || tm<=now) due.push(t); else later.push(t);
  });
  due.sort((a,b)=>{ const x=hmToMin(a.time),y=hmToMin(b.time); return (x==null?9999:x)-(y==null?9999:y); });   /* orari prima, in ordine; senza orario in fondo */
  later.sort((a,b)=>(hmToMin(a.time)||0)-(hmToMin(b.time)||0));
  el.innerHTML='';
  due.forEach(t=>el.appendChild(buildTaskRow(t,checks)));
  if(later.length){
    const head=document.createElement('div');
    head.className='later-head'+(_laterOpen?' open':'');
    head.innerHTML='<span>'+(anzianita(S)>=2?'Pi\u00f9 tardi':('Pi\u00f9 tardi \u00b7 '+later.length+(later.length===1?' azione':' azioni')+' \u00b7 dalle '+later[0].time))+'</span><span class="later-chev">'+(_laterOpen?'\u2227':'\u2228')+'</span>';
    head.onclick=()=>{ _laterOpen=!_laterOpen; renderTasks(); };
    el.appendChild(head);
    if(_laterOpen) later.forEach(t=>{ const row=buildTaskRow(t,checks); row.classList.add('later-item'); el.appendChild(row); });
  }
}
function questWhen(q,tk,domani){
  const future=q.quando&&q.quando>tk;
  const overdue=q.quando&&q.quando<tk&&!q.fatto;
  let when='';
  if(q.quando){
    const lbl=q.quando===tk?'oggi':q.quando===domani?'domani':new Date(q.quando+'T12:00:00').toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});
    /* v173 (Fase 5): via la parola «in ritardo». Ripetuta su righe consecutive costruiva un muro
       accusatorio, e le Tre Leggi vietano la pressione sul ritardo. Resta la data, spenta:
       la constatazione, non il rimprovero. Il conteggio sta una volta sola, in testa alla sezione. */
    when='<span class="meta'+(overdue?' over':future?' soon':'')+'">'+lbl+(q.ora?' \u00b7 '+q.ora:'')+'</span>';
  } else if(q.ora){
    when='<span class="meta">'+q.ora+'</span>';
  }
  return {when,future};
}
/* ======================================================================
   PONTE AL CALENDARIO — solo esportazione (.ics). iOS non concede sync alle PWA.
   ====================================================================== */
function icsEscape(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n'); }
function icsFold(line){ if(line.length<=72) return line; let out='',i=0; while(i<line.length){ out+=(i?'\r\n ':'')+line.substr(i,72); i+=72; } return out; }
function icsFmtLocal(dt){ const p=n=>String(n).padStart(2,'0'); return ''+dt.getFullYear()+p(dt.getMonth()+1)+p(dt.getDate())+'T'+p(dt.getHours())+p(dt.getMinutes())+'00'; }
function icsStamp(){ return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
function buildICS(q){
  const uid='sentiero-'+(q.id||Math.random().toString(36).slice(2))+'@sentiero.app';
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sentiero//Diario//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+icsStamp()];
  /* v271: la ricorrenza annuale e l'avviso lungo viaggiano anche nel calendario
     del telefono. RRULE la capiscono tutti i calendari; il secondo VALARM a
     -P14D e lo stesso richiamo che Sentiero mostra da solo, cosi chi vive nel
     calendario lo trova li e chi vive in Sentiero lo trova qui. */
  const _annuale=(q.repeat==='yearly');
  if(q.ora){
    const start=new Date(q.quando+'T'+q.ora+':00');
    const end=new Date(start.getTime()+60*60000); /* durata 1h di cortesia */
    L.push('DTSTART:'+icsFmtLocal(start),'DTEND:'+icsFmtLocal(end));
    if(_annuale) L.push('RRULE:FREQ=YEARLY');
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEscape(q.titolo),'TRIGGER:-PT30M','END:VALARM'); /* avviso 30 min prima */
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEscape(q.titolo),'TRIGGER:-P14D','END:VALARM');
  } else {
    const d0=q.quando.replace(/-/g,'');
    const nd=new Date(q.quando+'T12:00:00'); nd.setDate(nd.getDate()+1);
    const p=n=>String(n).padStart(2,'0'); const d1=''+nd.getFullYear()+p(nd.getMonth()+1)+p(nd.getDate());
    L.push('DTSTART;VALUE=DATE:'+d0,'DTEND;VALUE=DATE:'+d1);
    if(_annuale) L.push('RRULE:FREQ=YEARLY');
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEscape(q.titolo),'TRIGGER:PT9H','END:VALARM'); /* mattina del giorno, ~9:00 */
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEscape(q.titolo),'TRIGGER:-P14D','END:VALARM');
  }
  L.push('SUMMARY:'+icsEscape(q.titolo));
  if(q.note) L.push('DESCRIPTION:'+icsEscape(q.note));
  L.push('END:VEVENT','END:VCALENDAR');
  return L.map(icsFold).join('\r\n');
}
function slugify(s){ return (String(s||'evento').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'evento').slice(0,40); }
async function addToCalendar(q){
  try{ haptic(); }catch(_){}
  const ics=buildICS(q);
  const fname=slugify(q.titolo)+'.ics';
  /* via primaria: condivisione di sistema con file — la più affidabile dalla PWA installata */
  try{
    if(navigator.canShare){
      const file=new File([ics],fname,{type:'text/calendar'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:q.titolo});
        return;
      }
    }
  }catch(_){ /* l'utente può annullare la condivisione: nessun errore da mostrare */ return; }
  /* fallback: scarica/apri il file, con guida */
  try{
    const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=fname; a.rel='noopener';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{document.body.removeChild(a);}catch(_){}; URL.revokeObjectURL(url); },4000);
    toast('Evento pronto: se il Calendario non si apre, cercalo nei File e toccalo');
  }catch(_){ toast('Non riesco a creare l\u2019evento su questo dispositivo'); }
}
function inizialeQuest(titolo,id){
  /* v172 (Fase 4) — la maiuscola miniata.
     Prima il colore era COL[hash(id)%4]: un resto di divisione, quattro tinte diverse riga per
     riga, zero significato. L'audit della Fase 3 non ha trovato nessuna dimensione che valga la
     pena mappare, quindi il capolettera diventa monocromatico e segue il FUOCO, come tutto il
     resto di cio che e vivo. Il colore sta nel CSS, non piu inline: cosi il tema lo governa.
     E si applica SOLO se il titolo comincia con una lettera: su una cifra faceva sembrare il
     numero un dato staccato dal resto («10 000 passi» con il 10 grande e d'oro). */
  const t=String(titolo||''); if(!t) return '';
  const c0=t.charAt(0);
  if(!/\p{L}/u.test(c0)) return escapeHtml(t);
  return '<span class="ini">'+escapeHtml(c0.toUpperCase())+'</span>'+escapeHtml(t.slice(1));
}
let _questEditId='',_questEditPrio=3,_questEditFocus=null;
function chiudiQuestEditor(){
  const box=document.querySelector('#quest-editor'); if(!box) return;
  box.classList.add('hidden'); _questEditId='';
  try{ if(_questEditFocus&&document.contains(_questEditFocus)) _questEditFocus.focus(); }catch(_){}
}
function apriQuestEditor(id){
  const q=(S.quests||[]).find(x=>x&&x.id===id),box=document.querySelector('#quest-editor'); if(!q||!box) return;
  _questEditId=q.id; _questEditPrio=q.prio||3; _questEditFocus=document.activeElement;
  document.querySelector('#qedit-titolo').value=q.titolo||'';
  document.querySelector('#qedit-note').value=q.note||'';
  document.querySelector('#qedit-quando').value=q.quando||'';
  document.querySelector('#qedit-ora').value=q.ora||'';
  document.querySelectorAll('[data-qprio]').forEach(b=>b.classList.toggle('on',Number(b.dataset.qprio)===_questEditPrio));
  box.classList.remove('hidden'); setTimeout(()=>{ try{document.querySelector('#qedit-titolo').focus();}catch(_){} },40);
}
function salvaQuestEditor(){
  const q=(S.quests||[]).find(x=>x&&x.id===_questEditId); if(!q) return chiudiQuestEditor();
  const patch={titolo:document.querySelector('#qedit-titolo').value,note:document.querySelector('#qedit-note').value,
    quando:document.querySelector('#qedit-quando').value,ora:document.querySelector('#qedit-ora').value,prio:_questEditPrio};
  if(!aggiornaQuestInPlace(q,patch)){ toast('Controlla titolo, giorno e ora'); return; }
  if(!salvaSubito()){ toast('La modifica non è stata salvata'); return; }
  chiudiQuestEditor(); renderTodayQuests([]); renderQuests([]); updateRing(); segnalaStatoGiorno(); toast('Quest aggiornata');
}
try{
  document.querySelector('#qedit-close').onclick=chiudiQuestEditor;
  document.querySelector('#qedit-save').onclick=salvaQuestEditor;
  document.querySelectorAll('[data-qprio]').forEach(b=>b.onclick=()=>{ _questEditPrio=Number(b.dataset.qprio)||3; document.querySelectorAll('[data-qprio]').forEach(x=>x.classList.toggle('on',x===b)); });
  document.querySelector('#quest-editor').onclick=e=>{ if(e.target&&e.target.id==='quest-editor') chiudiQuestEditor(); };
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!document.querySelector('#quest-editor').classList.contains('hidden')) chiudiQuestEditor(); });
}catch(_){}
function buildQuestRow(q,tk,domani,bornIds,rerender){
  const {when,future}=questWhen(q,tk,domani);
  const p=q.prio||3;
  const div=document.createElement('div');
  div.dataset.qid=q.id;
  div.className='item'+(q.fatto?' done':'')+(future?' future':'')+(bornIds.includes(q.id)?' born':'')+((S.patto&&S.patto.tk===todayKey()&&S.patto.id===q.id)?(' passo'+(S.patto.audace?' audace':'')):'');
  if(bornIds.includes(q.id)) div.style.animationDelay=(bornIds.indexOf(q.id)*0.13)+'s';
  const calBtn=(q.quando&&!q.fatto)?'<button class="cal" aria-label="Aggiungi al calendario"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg></button>':'';
  div.innerHTML='<span class="prio prio-'+p+'"></span>'+
    '<button class="chk" aria-label="Completa"><svg class="chk-mark" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>'+
    '<span class="txt"><span class="ttl">'+inizialeQuest(q.titolo,q.id)+'</span>'+when+(q.note?'<span class="meta">'+escapeHtml(q.note)+'</span>':'')+'</span>'+
     calBtn+
     '<button class="editq" aria-label="Modifica quest"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/></svg></button>'+
     '<button class="del" aria-label="Elimina">&#215;</button>';
  div.querySelector('.chk').onclick=()=>{
    if(div.dataset.busy) return;
    div.dataset.busy='1';
    q.fatto=!q.fatto;
    try{ const tkq=todayKey();
      if(S.patto&&S.patto.tk===tkq&&S.patto.id===q.id){
        if(!S.checks[tkq]) S.checks[tkq]={};
        if(q.fatto) S.checks[tkq][q.id]=true; else delete S.checks[tkq][q.id];
      }
    }catch(_){}
    if(q.fatto){
      /* registra l'azione: così la Mente Osservatrice sa che l'hai DAVVERO compiuta */
      try{ if(!Array.isArray(S.questLog)) S.questLog=[]; S.questLog.push({titolo:q.titolo,day:todayKey(),nata:q.nata||''}); if(S.questLog.length>300) S.questLog=S.questLog.slice(-300); }catch(_){}
      try{ sbloccaOra('quest'); }catch(_){}   /* v271 */
      try{
        if(q.monte&&S.desiderio&&S.desiderio.id===q.monte){
          S.desiderio.pietre.push({titolo:clampStr(q.titolo,160),giorno:todayKey()});
          regCantiere('pietra',{msg:'spostata la n.'+S.desiderio.pietre.length+': '+clampStr(q.titolo,80)});
          setTimeout(function(){ try{ const _p=prossimaPietra(); if(_p&&_p.catch) _p.catch(function(e){ try{ regCantiere('errore',{msg:'prossimaPietra: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} }); }catch(_){} },1500);   /* la montagna non aspetta: la prossima pietra si posa da sola */
        }
      }catch(_){}
    } else {
      /* annullamento: togli l'ultimo log di oggi per quel titolo */
      try{ for(let i=S.questLog.length-1;i>=0;i--){ if(S.questLog[i].titolo===q.titolo&&S.questLog[i].day===todayKey()&&!S.questLog[i].lasciata){ S.questLog.splice(i,1); break; } } }catch(_){}
      try{
        if(q.monte&&S.desiderio&&S.desiderio.id===q.monte){
          const ps=S.desiderio.pietre;
          for(let i=ps.length-1;i>=0;i--){ if(ps[i].titolo===clampStr(q.titolo,160)&&ps[i].giorno===todayKey()){ ps.splice(i,1); break; } }
        }
      }catch(_){}
    }
    save();
    if(q.fatto){ div.classList.add('done'); const ms=onComplete(div)||600; setTimeout(rerender,ms+40); }
    else { div.classList.remove('done'); sUndo(); updateRing(); const left=completateOggi(S,todayKey(),dowOf()); const ms=Math.max(QUEST_MOTION.undo(div,completateOggi(S,todayKey(),dowOf())),TODAY_STAGE.undo(div,left)); setTimeout(rerender,Math.max(80,ms+20)); }
  };
  const cb=div.querySelector('.cal'); if(cb) cb.onclick=(e)=>{ e.stopPropagation(); addToCalendar(q); };
  const eb=div.querySelector('.editq'); if(eb) eb.onclick=(e)=>{ e.stopPropagation(); apriQuestEditor(q.id); };
  div.querySelector('.del').onclick=(e)=>{
    e.stopPropagation();
    /* v176: prima spariva e basta. Ora si tiene il posto in cui stava, e per cinque secondi
       si puo rimettere dov'era. La memoria della posizione conta: rimetterla in fondo sarebbe
       un'altra cosa da quella che avevi. */
    const dove=S.quests.indexOf(q);
    S.quests=S.quests.filter(x=>x!==q); save(); rerender(); updateRing();
    try{ toastAnnulla('Tolta \u00ab'+clampStr(q.titolo,40)+'\u00bb','Rimettila',()=>{
      const i=Math.max(0,Math.min(S.quests.length,dove));
      S.quests.splice(i,0,q); save();
      try{ rerender(); }catch(_){ try{ render(); }catch(__){} }
      try{ updateRing(); }catch(_){}
      try{ toast('Rimessa dov\u2019era'); }catch(_){}
    }); }catch(_){}
  };
  try{ attachNota(div,q.id,q.titolo,true); }catch(_){}
  try{ attachScopri(div); }catch(_){}
  return div;
}
let _soloArretrate=false;
function renderTodayQuests(bornIds){
  bornIds=bornIds||[];
  const el=document.querySelector('#list-quest-today');
  const tk=todayKey();
  const domani=localDayKey(new Date(Date.now()+86400000));
  let list=sortQuests(activeQuests(S,tk));
  const arretrate=list.filter(q=>q&&q.quando&&q.quando<tk&&!q.fatto);
  /* il conteggio vive in testa alla sezione, una volta sola, e non e colorato d'allarme:
     e un filtro, non un cartello. */
  try{
    const sez=document.querySelector('#sec-today-quests .sec-head');
    if(sez){
      const vecchio=sez.querySelector('.arretrate'); if(vecchio) vecchio.remove();
      if(arretrate.length){
        const b=document.createElement('button');
        b.className='arretrate'+(_soloArretrate?' on':'');
        b.textContent=arretrate.length+(arretrate.length===1?' da prima':' da prima');
        b.onclick=()=>{ _soloArretrate=!_soloArretrate; renderTodayQuests([]); };
        sez.appendChild(b);
      } else if(_soloArretrate){ _soloArretrate=false; }
    }
  }catch(_){}
  if(_soloArretrate&&arretrate.length) list=arretrate;
  if(!list.length){
    /* v211 — LA BUGIA DEL PRIMO GIORNO.
       Questa riga diceva «una frase detta bene basta a far comparire il prossimo
       passo», e senza chiave e falso: parlare salva una nota nel diario e non fa
       comparire niente. Chi riceve l'app in regalo legge quella riga, parla, non
       vede succedere nulla e conclude che e rotta. Era il difetto peggiore del
       livello base, e non stava nel motore: stava in una frase. */
    if(generativa()) setEmpty(el,'Nessuna quest per oggi. Una frase detta bene basta a far comparire il prossimo passo.','speak','Parla al cerchio');
    else setEmpty(el,'Niente per oggi. Scrivi qui sotto la prima cosa che vuoi fare: bastano tre parole.','nuova','Scrivine una');
    return; }
  el.innerHTML='';
  list.forEach(q=>el.appendChild(buildQuestRow(q,tk,domani,bornIds,()=>renderTodayQuests([]))));
}
function renderQuests(bornIds){
  bornIds=bornIds||[];
  const el=document.querySelector('#list-quest');
  const tk=todayKey();
  const domani=localDayKey(new Date(Date.now()+86400000));
  const list=sortQuests(futureQuests(S,tk));
  if(!list.length){
    if(generativa()) setEmpty(el,'Nessuna quest in programma. Il futuro resta pulito finche non gli dai una data.','speak','Detta una quest');
    else setEmpty(el,'Niente in programma. Il futuro resta pulito finche non gli dai una data.','nuova','Scrivine una');
    return; }
  el.innerHTML='';
  list.forEach(q=>el.appendChild(buildQuestRow(q,tk,domani,bornIds,()=>{renderQuests([]);renderTodayQuests([]);})));
}
/* ══════════════════════════════════════════════════════════════
   LA SEMINA DI DOMANDE — un seme, non un consiglio. Adattiva: decidono i dati.
   Legge: 1/di max · la perla vince · MAI numeri · venerdi sera silenzio ·
   mattina=pattern, sera=senso/corpo · ignorata torna variata · toccata si pianta
   nel Diario · ritoccata apre il mic e la risposta entra nel ciclo dell'osservatrice.
   ══════════════════════════════════════════════════════════════ */
const SEME_VIVAIO={
 pattern:{
  inizia:['cosa aspetta da settimane un inizio che dura un minuto?','la prima mossa che rimandi: e davvero grande o l\u2019hai solo disegnata grande?'],
  smetti:['cosa continui a fare solo perche hai sempre fatto cosi?','quale abitudine ti ruba le mattine senza pagare affitto?'],
  proteggi:['cosa funziona gia, e nessuno se ne accorge - nemmeno tu?','quale parte del tuo giorno difenderesti a mani nude?']
 },
 senso:{
  inizia:['per chi ancora ti chiama per nome: cosa stai costruendo che vedranno?'],
  smetti:['cosa porti avanti per abitudine che non serve piu a nessuno che ami?','a chi stai ancora dimostrando qualcosa che non guarda piu?'],
  proteggi:['chi ami di piu al mondo - e il tuo tempo lo sa?']
 },
 corpo:{
  inizia:['che gesto chiede il corpo appena sveglio, prima che decida la testa?'],
  smetti:['la tensione nel collo: che parola non stai dicendo?','la fame che arriva quando non sei attento: di cosa ha fame davvero?'],
  proteggi:['il corpo stanco del giorno buono e quello del giorno storto: li distingui ancora?','quale stanchezza stasera e guadagnata, e quale solo subita?']
 },
 rientro:['il sentiero non si offende: aspetta.','anche il vuoto e una pietra, se lo attraversi.'],
 germoglio:['quella domanda che avevi piantato - \u00ab%T\u00bb - e germogliato qualcosa?','\u00ab%T\u00bb, avevi piantato. la risposta e cresciuta o l\u2019ha vinta il buio?']
};
function seminaCooldown(semi){
  const s=semi||[]; if(!s.length) return 0;
  const veri=s.filter(x=>x.asse!=='rientro');
  if(!veri.length) return 2;
  const ultimo=veri[veri.length-1];
  if(ultimo.stato==='piantato'||ultimo.stato==='risposto') return 2;
  const u2=veri.slice(-2);
  if(u2.length===2&&u2.every(x=>x.stato==='esalato')) return 5;
  return 3;
}
function giorniVuoti(state,tk){
  let n=0;
  for(let i=1;i<=5;i++){
    const d=new Date(tk+'T12:00:00'); d.setDate(d.getDate()-i);
    const k=d.toISOString().slice(0,10);
    const day=(state.checks||{})[k];
    if(day&&Object.values(day).some(v=>v===true)) break;
    n++;
  }
  return n;
}
function seminaCandidate(state,ctx){
  const semi=state.semi||[];
  if(semi.some(s=>s.tk===ctx.tk)) return null;
  if(ctx.dow===4&&ctx.ora>=18) return null;
  const mattina=(ctx.ora>=5&&ctx.ora<12);
  const sera=(ctx.ora>=18&&ctx.ora<23&&ctx.sealed);
  if(!mattina&&!sera) return null;
  if(ctx.vuoti>=2){
    const sette=new Date(ctx.tk+'T12:00:00'); sette.setDate(sette.getDate()-7);
    const soglia=sette.toISOString().slice(0,10);
    if(!semi.some(s=>s.asse==='rientro'&&s.tk>=soglia)) return {tipo:'rientro'};
    return null;
  }
  const q14=new Date(ctx.tk+'T12:00:00'); q14.setDate(q14.getDate()-14);
  const sogliaG=q14.toISOString().slice(0,10);
  const germ=semi.find(s=>(s.stato==='piantato'||s.stato==='risposto')&&s.asse!=='germoglio'&&s.tk&&s.tk<=sogliaG&&!semi.some(x=>x.rif===s.id));
  if(germ) return {tipo:'germoglio',rif:germ.id,rifTesto:germ.testo};
  const veri=semi.filter(x=>x.asse!=='rientro');
  if(veri.length){
    const ultimo=veri[veri.length-1];
    const gap=Math.round((Date.parse(ctx.tk+'T12:00:00Z')-Date.parse((ultimo.tk||ctx.tk)+'T12:00:00Z'))/86400000);
    if(gap<seminaCooldown(semi)) return null;
  }
  const pool=mattina?['pattern']:['senso','corpo'];
  let asse=pool[0];
  if(pool.length>1){
    const lastIdx=a=>{ for(let i=semi.length-1;i>=0;i--) if(semi[i].asse===a) return i; return -1; };
    asse=pool.slice().sort((a,b)=>lastIdx(a)-lastIdx(b))[0];
  }
  const GESTI=['inizia','smetti','proteggi'];
  const lastG=g=>{ for(let i=semi.length-1;i>=0;i--) if(semi[i].gesto===g) return i; return -1; };
  const gesto=GESTI.slice().sort((a,b)=>lastG(a)-lastG(b))[0];
  return {tipo:'seme',asse:asse,gesto:gesto};
}
function semeVivaio(tipo,asse,gesto,mem,rifTesto){
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z\u00e0-\u00f9 ]/g,'').slice(0,60);
  const usati=new Set((mem||[]).map(norm));
  let pool;
  if(tipo==='rientro') pool=SEME_VIVAIO.rientro;
  else if(tipo==='germoglio') pool=SEME_VIVAIO.germoglio.map(t=>t.replace('%T',clampStr(rifTesto||'',60)));
  else pool=(SEME_VIVAIO[asse]&&SEME_VIVAIO[asse][gesto])||SEME_VIVAIO.pattern.inizia;
  for(const t of pool) if(!usati.has(norm(t))) return t;
  return pool[(mem||[]).length%pool.length];
}
function semeFiltro(testo,mem,tipo){
  const t=String(testo||'').trim();
  if(!t||t.length<12||t.length>150) return false;
  if(/\d/.test(t)) return false;
  if(tipo!=='rientro'&&!/\?$/.test(t)) return false;
  if(/(se non avessi paura|immagina (se|di)|sogna|io migliore|non avere paura|zona di comfort)/i.test(t)) return false;
  /* Una domanda puo contenere il verbo "scegli" senza essere un ordine; per
     questo qui la prescrizione non usa il dizionario alla cieca. Si vietano
     invece gli attacchi chiaramente imperativi, oltre a giudizio e gergo. */
  if(/^\s*(?:devi|dovresti|dovrai|prova a|cerca di|ricorda di|basta che|ti serve|scegli|inizia da|concentrati|fai in modo)/i.test(t)) return false;
  if(_lingVoceVeto(t,{prescrizione:false,gergo:true,giudizio:true})) return false;
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z\u00e0-\u00f9 ]/g,'').slice(0,60);
  if((mem||[]).some(m=>norm(m)===norm(t))) return false;
  return true;
}
const SEME_SYS='Sei l\u2019osservatrice di Sentiero. Ogni tanto pianti una DOMANDA nella giornata: un seme, non un consiglio.\n'+
'VOCE: calma, affilata, leggermente audace. Ironia asciutta ammessa. Minuscole, come si parla.\n'+
'VIETATO: retorica motivazionale ("se non avessi paura", "immagina se", "sogna", "il tuo io migliore"), consigli, imperativi, esclamazioni, e qualsiasi numero o cifra.\n'+
'ASSI: pattern (cosa si ripete) \u00b7 senso (per chi, verso dove) \u00b7 corpo (dove lo senti). GESTI: iniziare, smettere, proteggere. Ti arrivano asse e gesto: restaci.\n'+
'I TEMI: non li sai in anticipo. Escono da quello che ti arriva - il diario, gli attriti, le quest aperte. Se i dati non dicono niente su un tema, quel tema non esiste.\n'+
'Se nei dati ci sono parole del suo diario, puoi riprenderne DUE-TRE esatte tra virgolette basse \u00ab...\u00bb, mai parafrasate.\n'+
'Se c\u2019e germoglio_di: la domanda torna su QUEL seme piantato tempo fa - chiedi cosa e cresciuto, di lato, senza ripeterlo uguale.\n'+
'NON RIPETERTI: semi_recenti sono le domande gia piantate; cambia immagine, attacco, struttura.\n'+
'FORMATO: UNA domanda sola, massimo centotrenta caratteri, finisce col punto interrogativo. Rispondi SOLO con la domanda, senza JSON, markdown o etichette.';
function semeDigest(cand){
  const dia=(S.diary||[]).slice(0,2).map(e=>clampStr(e.testo,240));
  /* v268.6: gli attriti VIVI, non tutti quelli mai nominati */
  const attr=[]; try{ Object.values((S.mastery&&S.mastery.quest)||{}).forEach(q=>{ const v=_attritoVivo(q); if(v) attr.push(clampStr(v,90)); }); }catch(_){}
  const d={momento:(new Date().getHours()<12)?'mattina':'sera',asse:cand.asse||cand.tipo,gesto:cand.gesto||'',
    quest_aperte:(S.quests||[]).filter(q=>!q.fatto).slice(0,8).map(q=>q.titolo),
    attriti:attr.slice(0,3),diario_recente:dia,
    semi_recenti:(S.semi||[]).slice(-6).map(s=>s.testo)};
  if(cand.tipo==='germoglio') d.germoglio_di=clampStr(cand.rifTesto||'',160);
  return d;
}
async function askSemeResult(cand){
  const res=await aiCall({system:SEME_SYS,user:'DATI (JSON):\n'+JSON.stringify(semeDigest(cand)),task:'seme',maxOutputTokens:150,reasoning:'minimal',timeout:25000,priority:8});
  if(res.err) throw new Error(res.err);
  let t=clampStr(String(res.text||''),160).trim();
  try{ const j=_geminiStructuredJson(t); if(j&&typeof j.seme==='string') t=clampStr(j.seme,160).trim(); }catch(_){}
  /* Lab 15 — HTTP 200 + zero testo non e un errore di trasporto. In produzione
     il Seme ha gia una rete di sicurezza deterministica: se Gemini non emette una
     domanda, maybeSemina usa il vivaio locale. Il laboratorio deve raccontare la
     stessa cosa, non trasformarla in "errore: vuoto". */
  return {testo:t,silenzio:!t,model:res.model||'',tin:res.tin||0,tout:res.tout||0,thought:res.thought||0,salti:res.salti||''};
}
async function askSeme(cand){ const r=await askSemeResult(cand); return r.testo||''; }
function semeScrivi(testo,semeId){   /* il rito della perla, in giada: si scrive un carattere alla volta */
  const dl=document.querySelector('#day-line'); if(!dl) return false;
  dl.innerHTML=''; let pi=0;
  String(testo).split(' ').forEach((wd,wi,arr)=>{
    const w=document.createElement('span'); w.className='pw';
    for(const ch of wd){ const c=document.createElement('span'); c.className='pc'; c.textContent=ch;
      c.style.animationDelay=(90+pi*14)+'ms'; pi++; w.appendChild(c); }
    dl.appendChild(w);
    if(wi<arr.length-1){ dl.appendChild(document.createTextNode(' ')); pi++; }
  });
  dl.classList.add('perla','seme');
  const gb=document.getElementById('giorno-bar');
  window._semeVivo=semeId;
  if(gb){ gb.classList.add('semina-viva');
    gb.addEventListener('click',function h(){
      gb.removeEventListener('click',h);
      if(window._semeVivo===semeId){ try{ semePianta(semeId); }catch(_){} }
    }); }
  setTimeout(()=>{ if(window._semeVivo===semeId) dl.classList.add('perla-via'); },11500);
  setTimeout(()=>{ window._semeVivo=null; if(gb) gb.classList.remove('semina-viva');
    dl.classList.remove('perla','seme','perla-via'); try{ syncDayLine(); }catch(_){} },12000);
  return true;
}
function semePianta(id){
  const s=(S.semi||[]).find(x=>x.id===id); if(!s||s.stato!=='esalato') return;
  s.stato='piantato';
  addDiary(s.testo,[],[],'',id);
  window._semeVivo=null;
  save(); try{ renderDiary(); }catch(_){}
  const dl=document.querySelector('#day-line'); if(dl) dl.classList.add('perla-via');
  try{ if(anzianita(S)<1) toast('Seme piantato nel diario'); }catch(_){}
  try{ haptic(); }catch(_){}
}
function semeRispondiUI(id,testo){
  window._semeAttivo={id:id,testo:testo};
  showPane('quest');
  setTimeout(()=>{ try{ micBtn.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){}
    try{ micLabel.textContent='\u00ab'+testo+'\u00bb \u2014 tocca e rispondi'; }catch(_){} },120);
}
function semeRaccolto(){   /* il racconto e arrivato: il seme e risposto */
  if(!window._semeAttivo) return;
  const s=(S.semi||[]).find(x=>x.id===window._semeAttivo.id);
  if(s&&s.stato!=='risposto'){ s.stato='risposto'; save(); try{ renderDiary(); }catch(_){} }
  window._semeAttivo=null;
}
/* ══ LA CHIAMATA A TERRA (v175) ═══════════════════════════════════════════════════════════
   Il seme faceva una domanda scritta e mandava al microfono a rispondere: cinque domande,
   zero risposte. Non mancava la domanda - mancava la porta. Questa e la porta, e si scrive.
   Il resto della catena esisteva gia: la raccolta sa del seme («DOMANDA SEMINATA»), e la
   risposta finisce nel diario legata al suo id. ══════════════════════════════════════════ */
let _terraSeme=null;
/* ══ LA RACCOLTA CONDIVISA (v198) ══════════════════════════════════════════
   La Chiamata a terra e la stanza della sera scrivono nello stesso diario e
   fanno nascere le stesse quest. Una funzione sola, due porte. ═══════════ */
/* ══ v271.1 — L'UNICA AUTORITA DELLA RACCOLTA ══════════════════════════════
   «da questo testo possono nascere quest, rituali e una voce del Diario»: una
   domanda sola, una risposta sola. Il microfono, la Stanza che scrive e la
   Stanza che legge una foto arrivano tutti e tre qui.
   Il terzo parametro e nuovo e OPZIONALE, quindi i due chiamanti che c'erano
   prima non cambiano di una virgola: serve solo a dire da dove viene il testo
   e cosa aveva letto la macchina, quando viene da una pagina fotografata. */
async function scrittoNelDiario(testo, dom, orig){
  const _fonte=(orig&&orig.fonte==='ocr')?'ocr':'';
  /* LA MATERIA ORIGINALE NON SI PERDE MAI.
     Per il parlato, «raw» e gia il trascritto grezzo e «testo» la forma che il
     Diario mostra. Per una pagina fotografata la stessa distinzione ha lo
     stesso significato: raw e cio che ha letto la macchina, e cio che la
     persona ha corretto e la verita. Se non ha corretto niente, non si
     conservano due copie identiche della stessa frase. */
  const _raw=(_fonte==='ocr'&&orig.raw&&String(orig.raw).trim()!==String(testo).trim())?String(orig.raw):testo;
  let fatto=false, nuove=0;
  try{
    if(GEMINI_KEY){
      const out=await askDistill(testo);
      if(out){
        if(!Array.isArray(S.quests)) S.quests=[];
        const nati=[];
        const pesa=(out.peso===true);   /* v201: la stessa guardia della distillazione a voce, vedi il commento la */
        if(!pesa) (out.quests||[]).forEach(nq=>{
          if(!nq||!nq.titolo) return;
          const ex=nq.id?S.quests.find(q=>q&&q.id===nq.id):null;
          if(ex){ Object.assign(ex,nq,{id:ex.id}); return; }
          const tit=String(nq.titolo).trim().toLowerCase();
          const dup=S.quests.find(q=>q&&!q.fatto&&String(q.titolo||'').trim().toLowerCase()===tit);
          if(dup){ Object.assign(dup,nq,{id:dup.id}); return; }
          if(!nq.id) nq.id=uid();
          if(!nq.nata) nq.nata=todayKey();
          S.quests.push(nq); nati.push(nq.titolo); nuove++;
        });
        S.quests=sortQuests(S.quests);
        if(!pesa) for(const r of (out.rituali||[])){
          if((S.scheduled||[]).length>=LIMITS.SMAX) break;
          if(!r||!r.titolo) continue;
          if(S.scheduled.some(t=>t&&String(t.titolo||'').trim().toLowerCase()===String(r.titolo).trim().toLowerCase())) continue;
          if(!r.nata) r.nata=todayKey();   /* v199: senza, il conto delle mancate parte dall'inizio del cammino */
          S.scheduled.push(r);
        }
        if(!pesa){ try{ processMastery(out.motore); }catch(_){} }
        /* out.diario e la forma che la raccolta propone; il quarto argomento e
           «raw», la materia da cui e nata. Nessuna delle due cancella l'altra. */
        addDiary(out.diario||testo,nati,[],_raw,'',dom,pesa);
        if(_fonte&&S.diary&&S.diary[0]) S.diary[0].fonte=_fonte;
        fatto=true;
      }
    }
  }catch(_){ fatto=false; }
  if(!fatto){
    /* v206: il peso si calcola PRIMA, e per conto suo. Questo addDiary e l'ultima
       rete che ha lo scritto della persona, e sta dentro un catch muto: se il
       rilevatore inciampasse li dentro, il testo sparirebbe senza un errore e
       senza un avviso. Un di piu che non deve mai costare un di meno. */
    let _p=false; try{ _p=pesoLocale(testo); }catch(_){}
    try{ addDiary(testo,[],[],_raw,'',dom,_p); }catch(_){}
    try{ if(_fonte&&S.diary&&S.diary[0]) S.diary[0].fonte=_fonte; }catch(_){}
    try{ salvaSubito(); }catch(_){}   /* v252: la stanza della sera scrive subito */
  }
  return {fatto:fatto, nuove:nuove};
}

/* ══ LA STANZA DELLA SERA (v198) ═══════════════════════════════════════════
   Dalle 19 alle 4:20. Non e un orario tondo scelto a caso: 4:20 e l'alba di
   Sentiero, il momento in cui il giorno gira. La stanza dura esattamente quanto
   la sera e la notte, e la mattina non esiste.
   Quello che ci scrivi va nel diario come tutto il resto: e un altro modo di
   entrare, non un altro archivio. ═════════════════════════════════════════ */
const STANZA_DA = 19*60;                  /* le diciannove */
const STANZA_A  = ALBA_MS/60000;          /* 260 minuti: le 4:20 */
function stanzaOra(quando){
  const d = quando || new Date();
  const m = d.getHours()*60 + d.getMinutes();
  return m>=STANZA_DA || m<STANZA_A;
}

/* ══ v271.1 — LA STANZA HA DUE MODI ═══════════════════════════════════════
   Non due finestre: due mestieri della stessa carta. Lo stato vive in due
   attributi sulla Stanza - data-modo e data-fase - e il CSS ci si appende:
   cosi non esiste un secondo posto dove lo stato possa divergere da cio che
   si vede. */
let _stModo='scrivi', _stFase='scelta', _stAuto='', _stAbort=null;
function stanzaModo(m){
  _stModo=(m==='foto')?'foto':'scrivi';
  const el=document.getElementById('stanza'); if(!el) return;
  el.setAttribute('data-modo',_stModo);
  try{ el.querySelectorAll('#stanza-modo button').forEach(b=>{
    const on=b.dataset.modo===_stModo;
    b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); }); }catch(_){}
  const txt=el.querySelector('#stanza-txt');
  if(_stModo==='foto'){
    stanzaFase('scelta');
    /* SENZA CHIAVE LA PORTA NON DEVE SEMBRARE APERTA. I due tasti restano
       visibili - nascondere una funzione non la spiega - ma sono spenti, e
       accanto c'e il perche. «Scrivi» continua a funzionare interamente. */
    const gen=(function(){ try{ return generativa(); }catch(_){ return false; } })();
    ['#st-scatta','#st-scegli'].forEach(sel=>{ const b=el.querySelector(sel); if(b) b.disabled=!gen; });
    const av=el.querySelector('#st-senza-chiave');
    if(av) av.textContent=gen?'':'Per leggere una foto serve la versione Generativa. La foto non viene inviata da nessuna parte.';
  } else {
    _stOcrPulisci();
    stanzaFase('testo');
    try{ if(txt) txt.focus(); }catch(_){}
  }
  _stAggiornaOk();
}
function stanzaFase(f){
  _stFase=f;
  const el=document.getElementById('stanza'); if(el) el.setAttribute('data-fase',f);
  _stAggiornaOk();
}
function _stAggiornaOk(){
  try{
    const el=document.getElementById('stanza'); if(!el) return;
    const txt=el.querySelector('#stanza-txt'), ok=el.querySelector('#stanza-ok');
    if(!txt||!ok) return;
    const visibile=(_stModo==='scrivi')||(_stFase==='testo');
    ok.disabled=!visibile||txt.value.trim().length<2;
  }catch(_){}
}
function _stOcrPulisci(){
  /* niente resta appeso: la richiesta si annulla, la trascrizione si lascia
     andare, i campi dei file si svuotano. La fotografia non sopravvive al
     flusso, ed e la ragione per cui non puo finire nello stato. */
  try{ if(_stAbort) _stAbort.abort(); }catch(_){}
  _stAbort=null; _stAuto='';
  ['#st-file-cam','#st-file-lib'].forEach(sel=>{ try{ const i=document.querySelector(sel); if(i) i.value=''; }catch(_){} });
}
async function _stLeggi(file){
  if(!file) return;
  stanzaFase('attesa');
  let dataUrl='';
  const ctrl=('AbortController' in window)?new AbortController():null;
  _stAbort=ctrl;
  try{
    dataUrl=await preparaFoto(file);
    if(ctrl&&ctrl.signal.aborted){ stanzaFase('scelta'); return; }
    const r=await leggiPagina(dataUrl,ctrl?ctrl.signal:null);
    dataUrl='';                                    /* letta: non serve piu a nessuno */
    if(ctrl&&ctrl.signal.aborted){ stanzaFase('scelta'); return; }
    const el=document.getElementById('stanza');
    const av=el&&el.querySelector('#st-senza-chiave');
    if(r&&r.err){
      stanzaFase('scelta');
      if(av) av.textContent=(r.err==='annullata')?'':_ocrMsgErrore(r.err);
      return;
    }
    const t=String((r&&r.testo)||'');
    _stAuto=t;
    const txt=el&&el.querySelector('#stanza-txt');
    if(txt) txt.value=t;
    if(av) av.textContent='';
    stanzaFase('testo');
    try{ regCantiere('ocr',{msg:'letta una pagina',model:(r&&r.model)||'',tin:r&&r.tin,tout:r&&r.tout}); }catch(_){}
  }catch(e){
    stanzaFase('scelta');
    try{ const av=document.querySelector('#st-senza-chiave');
      if(av) av.textContent='Non sono riuscito ad aprire questa immagine.'; }catch(_){}
    try{ regCantiere('errore',{msg:'ocr: '+String((e&&e.message)||e).slice(0,120)}); }catch(_){}
  } finally {
    dataUrl='';
    if(_stAbort===ctrl) _stAbort=null;
  }
}

function apriStanza(){
  const el=document.getElementById('stanza'); if(!el) return;
  const txt=el.querySelector('#stanza-txt'), ok=el.querySelector('#stanza-ok');
  txt.value=''; ok.disabled=true;
  txt.oninput=()=>{ _stAggiornaOk(); };
  _stOcrPulisci();
  stanzaModo('scrivi');            /* il gesto storico non cambia: tocco il viola e scrivo */
  el.classList.remove('hidden');
  /* due fotogrammi: senza, la transizione parte da uno stato che il browser non
     ha ancora visto e la stanza compare di scatto invece di accendersi */
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('aperta')));
  try{ haptic(); }catch(_){}
}
function chiudiStanza(){
  const el=document.getElementById('stanza'); if(!el) return;
  try{ _stOcrPulisci(); }catch(_){}
  el.classList.remove('aperta');
  try{ const t=el.querySelector('#stanza-txt'); if(t) t.blur(); }catch(_){}
  setTimeout(()=>{ el.classList.add('hidden'); }, 440);
}
let _stanzaRaccolgo=false;
async function raccogliStanza(){
  if(_stanzaRaccolgo) return;
  const el=document.getElementById('stanza'); if(!el) return;
  const txt=el.querySelector('#stanza-txt');
  const testo=String(txt.value||'').trim();
  if(testo.length<2) return;
  _stanzaRaccolgo=true;
  const ok=el.querySelector('#stanza-ok');
  ok.disabled=true; ok.textContent='Raccolgo…';
  /* ══ v271.1 — QUI STA IL PUNTO DELLA PATCH ══════════════════════════════
     Nella v271 la pagina fotografata finiva dritta nel Diario con addDiary, e
     il testo non veniva mai interpretato: una fotografia era digitalizzazione
     passiva, e basta. Adesso passa da scrittoNelDiario esattamente come cio
     che si scrive a mano e come cio che si dice al microfono. Se nella pagina
     c'e scritto «chiamare il dentista», da li puo nascere la cosa da fare,
     come nascerebbe se l'avessi detta.
     Cambia il mezzo con cui il testo entra. Non cambia cosa significa. */
  const daFoto=(_stModo==='foto');
  const orig=daFoto?{fonte:'ocr',raw:String(_stAuto||'')}:null;
  let esito={fatto:false,nuove:0};
  try{ esito = await scrittoNelDiario(testo,'',orig); }
  finally{
    _stanzaRaccolgo=false;
    ok.textContent='Raccogli';
  }
  save();
  try{ regCantiere('stanza',{msg:(daFoto?'pagina · ':'')+(esito.fatto?'raccolta':'salvata a mano')+' · '+testo.length+' caratteri · quest nuove '+esito.nuove}); }catch(_){}
  chiudiStanza();
  try{ render(); renderDiary(); }catch(_){}
  try{ haptic(); }catch(_){}
  try{ toast(esito.fatto?(esito.nuove?('Raccolto · '+esito.nuove+(esito.nuove===1?' cosa nuova':' cose nuove')):'Raccolto nel diario'):'Salvato nel diario'); }catch(_){}
}

/* ══ IL MOTORE DELLA CHIAMATA A TERRA (v197) ═══════════════════════════════
   Fino alla v196 la domanda usciva da un vivaio di frasi scritte a mano, due per
   casella, e la casella la sceglieva seminaCandidate - che pero risponde solo
   di mattina presto o di sera a giornata sigillata. Aperta la porta nel
   pomeriggio, seminaCandidate dava null, scattava il ripiego {senso,inizia} e il
   vivaio restituiva sempre la prima delle sue due frasi. Sempre la stessa.
   Aggravante: le domande volanti non finivano da nessuna parte, quindi la
   memoria anti-ripetizione non le vedeva nemmeno.

   Qui la domanda la fa il modello, e la fa sui suoi giorni.

   La semina resta congelata, e resta giusto cosi: quella SPINGEVA una domanda
   dentro la giornata senza che nessuno l'avesse chiesta, e infatti cinque semi
   fecero zero risposte. La Chiamata a terra e il contrario: la porta la apre lui.
   Domanda tirata, non spinta.

   E la porta non deve mai far aspettare: la domanda si prepara PRIMA e sta nel
   cassetto. Se il cassetto e vuoto, o non c'e chiave, o non c'e rete, si torna al
   vivaio - che pero adesso ha la memoria buona e non ripete. ═══════════════ */
const TERRA_SYS =
'Sei l’osservatrice di Sentiero. Chi ti legge ha aperto una porta ed e venuto a chiederti una domanda. Non gliel’hai proposta tu: l’ha voluta lui.\n'+
'VOCE: calma, affilata, un po’ audace. Minuscole, come si parla. Ironia asciutta ammessa.\n'+
'VIETATO: retorica motivazionale, consigli, imperativi, esclamazioni, cifre. E il trattino, che non ce l’hai.\n'+
'DA DOVE NASCE: dai suoi giorni, che ti arrivano qui sotto. Non da un tema generale. Se la domanda si potrebbe fare a chiunque, l’hai sbagliata.\n'+
'Prendi DUE o TRE parole sue esatte e mettile fra virgolette basse «...». Esatte, non parafrasate. Se non trovi niente di suo da citare, allora parti da un fatto preciso dei suoi giorni.\n'+
'NON RIPETERTI: in domande_fatte ci sono quelle che gli hai gia posto. Cambia immagine, cambia attacco, cambia struttura. E non tornare sullo stesso tema con altre parole: lo riconosce.\n'+
'FORMATO: UNA domanda sola, sotto i centotrenta caratteri, finisce col punto interrogativo. Rispondi SOLO con la domanda, senza JSON, markdown o etichette.';

function terraPacchetto(){
  /* gli ultimi quattordici giorni di diario, che e la materia che la persona ha
     scelto, piu le domande gia fatte perche non tornino */
  const oggi = new Date(todayKey()+'T12:00:00');
  const giorni = [];
  (S.diary||[]).forEach(v=>{
    if(!v||!v.testo) return;
    const d = Math.round((oggi-new Date((v.data||todayKey())+'T12:00:00'))/86400000);
    if(d<0||d>14) return;
    if(giorni.length<24) giorni.push({quando:v.data||'', testo:clampStr(v.testo,320)});
  });
  return {
    giorni: giorni,
    domande_fatte: (S.domChieste||[]).slice(-12).map(x=>x&&x.testo).filter(Boolean),
    aperte: (S.quests||[]).filter(q=>q&&!q.fatto).slice(0,10).map(q=>clampStr(q.titolo||'',80))
  };
}

async function askDomandaTerra(){
  const res = await aiCall({system:TERRA_SYS,
    user:'I SUOI GIORNI (JSON):\n'+JSON.stringify(terraPacchetto()),
    task:'terra',maxOutputTokens:200,reasoning:'low',timeout:25000,priority:8});
  if(res.err) throw new Error(res.err);
  let t = clampStr(String((res&&res.text)||''),LIMITS.DOM).trim();
  try{ const p=_geminiStructuredJson(t); if(p&&typeof p.domanda==='string') t=clampStr(p.domanda,LIMITS.DOM).trim(); }catch(_){}
  if(!t) throw new Error('vuota');
  return t;
}

let _terraPreparo = false;
/* ══ v271 — QUESTO MOTORE E SPENTO ═════════════════════════════════════════
   Preparava in anticipo la domanda della Chiamata a terra, a ogni avvio e dopo
   ogni raccolta: una chiamata generativa con ragionamento controllato, per produrre
   una domanda che dalla v271 nessuno puo piu vedere, perche dietro quella porta
   adesso c'e la lettura di una pagina.
   Non l'ho cancellato - TERRA_SYS, il vivaio e i ripieghi sono lavoro buono e
   documentato, e la porta potrebbe un giorno tornare a due ante. L'ho STACCATO:
   esce subito, non spende niente, non tocca lo stato. Codice che continua a
   girare per nessuno non e prudenza, e un costo pagato a ogni apertura. */
async function preparaDomandaTerra(forza){
  return;
  if(_terraPreparo) return;
  if(!forza && S.domPronta && S.domPronta.testo) return;   /* ce n'e gia una in attesa */
  if(!GEMINI_KEY) return;  /* senza chiave resta il vivaio */
  if(!(S.diary||[]).length) return;                         /* senza materia non si inventa niente */
  _terraPreparo = true;
  try{
    const t = await askDomandaTerra();
    const gia = new Set((S.domChieste||[]).map(x=>String((x&&x.testo)||'').toLowerCase().slice(0,50)));
    if(t && !gia.has(t.toLowerCase().slice(0,50))){
      S.domPronta = {testo:t, iso:new Date().toISOString()};
      save();
    }
  }catch(e){
    try{ regCantiere('terra',{msg:'domanda non preparata: '+String((e&&e.message)||e).slice(0,80)}); }catch(_){}
  } finally { _terraPreparo = false; }
}

function terraRegistra(testo){
  /* ogni domanda a cui ha davvero risposto entra in memoria, o il vivaio la
     ripropone all'infinito - che e esattamente cio che succedeva */
  const t = String(testo||'').trim();
  if(!t) return;
  if(!Array.isArray(S.domChieste)) S.domChieste=[];
  S.domChieste.push({testo:clampStr(t,LIMITS.DOM), iso:new Date().toISOString()});
  if(S.domChieste.length>40) S.domChieste = S.domChieste.slice(-40);
}

function _terraGiaFatta(testo,mem){
  const n=t=>String(t||'').toLowerCase().replace(/[^a-z\u00e0-\u00f9 ]/g,'').slice(0,60);
  const q=n(testo); if(!q) return true;
  return (mem||[]).some(x=>n(x)===q);
}
function _terraVivaioLargo(mem){
  /* tutte le caselle del vivaio, tranne germoglio che porta un segnaposto %T */
  const tutte=[];
  try{
    Object.keys(SEME_VIVAIO).forEach(k=>{
      const v=SEME_VIVAIO[k];
      if(Array.isArray(v)){ if(k!=='germoglio') v.forEach(t=>tutte.push(t)); }
      else Object.keys(v).forEach(g=>v[g].forEach(t=>tutte.push(t)));
    });
  }catch(_){ return ''; }
  /* v260: la porta si chiama «chiamata a terra» e ha un compito solo: CHIEDERE.
     Il ripiego largo pescava anche dalle caselle di conforto - «il sentiero non
     si offende: aspetta.» - che sono frasi giuste al posto giusto ma non sono
     domande: la porta si apriva con un'affermazione, e restare li a rispondere
     a un'affermazione non ha senso. Qui passano solo le domande vere. */
  for(const t of tutte){
    if(!/\?\s*$/.test(String(t))) continue;
    if(String(t).indexOf('%T')>=0) continue;
    if(!_terraGiaFatta(t,mem)) return t;
  }
  return '';
}
/* ══ LA DOMANDA DI CASA (v209) ══════════════════════════════════════════════
   Il vivaio ha diciotto frasi. Sono scritte bene, ma sono diciotto: dopo tre
   settimane senza chiave la Chiamata a terra ricomincia da capo, e una domanda
   che hai gia sentito non e piu una domanda - e un cartello.

   La via d'uscita non era scriverne altre cento. Era smettere di pescare da un
   serbatoio e cominciare a guardare i suoi giorni: il materiale non finisce mai,
   perche cambia da solo. Sono gli stessi fatti che usa l'osservatrice la sera -
   le sue parole d'attrito, quello che tace, la promessa che torna, il giorno che
   cede - girati in domanda invece che in osservazione.

   UNA DOMANDA NON E UN RIMPROVERO, ed e la riga sottile di tutto questo pezzo.
   «cosa la ferma?» apre; «perche non l'hai ancora fatta?» accusa, e su
   un'abitudine mancata la seconda viene molto piu facile della prima. Per questo
   nessuna forma nomina una colpa, e piu d'una offre di lasciar andare: «e ancora
   tua?», «la vuoi ancora?». Sono le Tre Leggi applicate a una domanda.

   Le parole sono scritte a mano e da rivedere: qui la macchina sceglie il materiale,
   non il tono. */
const DOMANDE_IT={
  attrito:['di {cosa} avevi scritto «{parole}». cosa la rende cosi pesante?',
           '«{parole}», dicevi di {cosa}. e ancora vero stamattina?'],
  silenzio:['{cosa} non compare da un pezzo. la vuoi ancora?',
            'di {cosa} non si parla piu. cosa e cambiato?'],
  ricorrente:['{cosa} torna a nascere e non si chiude. cosa la ferma?',
              'hai rimesso in lista {cosa} piu di una volta. e la cosa giusta, o solo quella che ricordi?'],
  ritorno:['{cosa} e tornata dopo un vuoto. cosa e stato diverso, quel giorno?',
           'hai ripreso {cosa}. cosa te l’ha resa possibile?'],
  giorno:['{ilgiorno} non lascia mai niente. cosa succede, {ilgiorno}?',
          'ogni {cosa} la giornata passa e non resta niente. com’e fatto quel giorno?'],
  vecchia:['{cosa} aspetta da un pezzo. e ancora tua?',
           '{cosa} e in lista e non si muove. la vuoi ancora, o la lasci andare?'],
  aperta:['{cosa} aspetta da un po’. la senti ancora tua?',
          '{cosa} sta in lista. cosa la tiene ferma?']
};
function _terraFormeCasa(f){
  const p=(typeof PACCHETTO!=='undefined')?PACCHETTO:null;
  let mod=null;
  if(p&&p.voci&&p.voci.domanda&&p.voci.domanda[f&&f.t]) mod=p.voci.domanda[f.t];
  else if(typeof linguaApp!=='function'||linguaApp()==='it') mod=DOMANDE_IT[f&&f.t]||null;
  return _ossRiempi(mod,f||{});
}
/* I fatti per la DOMANDA non sono esattamente quelli della sera: l'osservatrice
   cerca pattern, la porta puo anche chiedere di una cosa sola. Tenerli separati
   evita che la riga della sera cominci a elencare la lista delle cose aperte. */
function _terraFattiCasa(d){
  const F=_ossFatti(d).slice();
  (d.questAperte||[]).forEach(q=>{ if(q&&q.titolo) F.push({t:'aperta',peso:5,cosa:q.titolo}); });
  return F.sort((a,b)=>b.peso-a.peso);
}
function terraDomandaCasa(){
  try{
    const d=buildObserverDigest();
    if(_pesaDiRecente(d)) return '';        /* nei giorni che pesano non si chiede niente */
    const mem=(S.semi||[]).map(s=>s&&s.testo).concat((S.domChieste||[]).map(x=>x&&x.testo)).filter(Boolean);
    /* l'ultima domanda fatta, per non tornare due volte di fila sulla stessa cosa:
       tre mattine sulla stessa cosa sono tre modi di dire la stessa frase. */
    const ultima=_ossMinuscolo(String(mem[mem.length-1]||''));
    for(const f of _terraFattiCasa(d)){
      const suo=String(f.cosa||'');
      if(suo&&ultima&&ultima.indexOf(_ossMinuscolo(suo))>=0) continue;
      for(const q of _terraFormeCasa(f)){
        if(!q) continue;
        if(!/\?$/.test(q.trim())) continue;                 /* deve restare una domanda */
        if(/\s[—–-]\s/.test(q)) continue;
        /* le cifre si cercano SOLO nella prosa nostra. Se una quest si chiama
           «Fare 300 €», il divieto sui numeri - che esiste perche l'app non
           faccia i conti in faccia a nessuno - censura un titolo che la persona
           si e scritta da sola. Su un archivio reale, in laboratorio, questo
           bastava a far uscire zero domande: il difetto si vedeva solo li, e non
           nei casi finti. */
        /* la domanda si giudica con il suo titolo sostituito da un pronome: cosi
           le misure cadono sulla NOSTRA prosa e non sulle sue parole. Vale per le
           cifre e vale per tutto il resto - e la stessa scelta fatta per le
           citazioni fra virgolette nel motore della sera. */
        const nostro=suo?q.split(suo).join('quella').split(_ossMinuscolo(suo)).join('quella'):q;
        if(/\d/.test(nostro)) continue;
        if(/^[A-Z]/.test(q)) continue;
        if(/\bdevi\b|\bdovresti\b|prova a |cerca di |perche non /i.test(q)) continue;   /* niente rimproveri */
        /* LE MISURE sul testo col pronome, LA NOVITA sul testo vero. Tenerle
           insieme sembrava piu pulito e invece rompeva tutto: col titolo
           sostituito, due domande su cose diverse diventano identiche agli occhi
           del giudice, e dalla seconda in poi venivano scartate tutte come «gia
           detta». Sul suo archivio le domande erano crollate da sei a due, e il
           motivo non si vedeva da nessuna parte se non provandolo li. */
        if(_ossGiudica(nostro.replace(/\?/g,'.'),[])) continue;
        if(mem.some(m=>m&&_ossScheletro(m)===_ossScheletro(q))) continue;
        if(mem.some(m=>m&&String(m).trim()===q.trim())) continue;
        return q;
      }
    }
  }catch(_){}
  return '';
}

function terraDomanda(){
  /* prima una domanda vera gia piantata e senza risposta; se non c'e, se ne chiede una nuova
     al vivaio locale (nessuna chiamata al modello: la porta non deve mai far aspettare) */
  const aperti=(S.semi||[]).filter(s=>s&&s.testo&&(s.stato==='esalato'||s.stato==='piantato'));
  if(aperti.length) return aperti[aperti.length-1];
  /* la domanda preparata dal motore: sta nel cassetto, esce senza far aspettare */
  if(S.domPronta&&S.domPronta.testo) return {id:'',testo:S.domPronta.testo,volante:true,motore:true};
  /* v209: prima del vivaio, la domanda costruita sui suoi giorni. Il vivaio resta
     sotto, per quando non c'e ancora materiale: i primi giorni, o una settimana
     senza tracce. */
  {
    const q=terraDomandaCasa();
    if(q) return {id:'',testo:q,volante:true,casa:true};
  }
  try{
    const d=new Date(), tk=todayKey();
    const cand=seminaCandidate(S,{tk:tk,ora:d.getHours(),dow:dowOf(d),sealed:S.lastSealed===tk,vuoti:giorniVuoti(S,tk)})
      ||{tipo:'seme',asse:'senso',gesto:'inizia'};
    /* la memoria comprende ora anche le domande volanti gia fatte: prima il
       vivaio non le vedeva e restituiva eternamente la prima frase del pool */
    const mem=(S.semi||[]).map(s=>s.testo).concat((S.domChieste||[]).map(x=>x&&x.testo)).filter(Boolean);
    let testo=semeVivaio(cand.tipo,cand.asse,cand.gesto,mem,cand.rifTesto);
    /* ogni casella del vivaio ha DUE frasi: alla terza apertura senza rete
       semeVivaio ricomincia a girare sulle stesse. Allora si allarga a tutte le
       caselle, che sono diciotto. Sempre un serbatoio finito, ma lungo il triplo
       di una settimana offline. */
    if(!testo||_terraGiaFatta(testo,mem)){
      const largo=_terraVivaioLargo(mem);
      if(largo) testo=largo;
    }
    if(testo) return {id:'',testo:testo,volante:true};
  }catch(_){}
  return {id:'',testo:'cosa e successo davvero, oggi?',volante:true};
}
/* la domanda si scrive parola per parola: e una voce che parla, non un cartello */
/* v260: le domande che restano vere anche senza sapere niente di chi le legge.
   Sono l'ultimo gradino, non il primo: si arriva qui solo se ogni altra strada
   ha taciuto. Girano in ordine col giorno, cosi due aperture vicine non danno
   la stessa. */
const TERRA_RETE=[
 'cosa ti sta chiedendo attenzione, in questo momento?',
 'di tutto quello che hai in testa adesso, cosa pesa di piu?',
 'se domani ne restasse una sola, quale terresti?',
 'cosa hai rimandato oggi, e perche proprio quella?',
 'cosa ti e riuscito oggi che nessuno ha notato?'
];
const TERRA_RETE_EN=[
 'what is asking for your attention right now?',
 'of everything on your mind, what weighs the most?',
 'if only one were left tomorrow, which would you keep?',
 'what did you put off today, and why that one?',
 'what went well today that nobody noticed?'
];
function _terraUltimaRete(){
  /* la rete parla la lingua dell'app: se il pacchetto ne porta una sua, quella;
     se no l'inglese per chi non e in italiano. Una domanda nella lingua
     sbagliata non e una domanda, e un errore che si vede. */
  let pool=TERRA_RETE;
  try{
    const p=(typeof PACCHETTO!=='undefined')?PACCHETTO:null;
    if(p&&p.voci&&Array.isArray(p.voci.rete)&&p.voci.rete.length) pool=p.voci.rete;
    else if(typeof linguaApp==='function'&&linguaApp()!=='it') pool=TERRA_RETE_EN;
  }catch(_){}
  try{
    const g=Math.floor(Date.parse(todayKey()+'T12:00:00')/86400000)||0;
    return pool[Math.abs(g)%pool.length];
  }catch(_){ return pool[0]; }
}
function scriviTerraDomanda(testo){
  const d=document.querySelector('#terra-dom'); if(!d) return;
  d.innerHTML='';
  String(testo||'').split(' ').forEach((w,i)=>{
    const sp=document.createElement('span'); sp.className='w'; sp.textContent=w;
    sp.style.animationDelay=(120+i*26)+'ms';
    d.appendChild(sp); d.appendChild(document.createTextNode(' '));
  });
}
/* ══ v271 — LA PAGINA LETTA (era la Chiamata a terra) ══════════════════════
   La luce, l'orbita, il volo e il fiore restano: sono l'identita visiva di
   Sentiero e non c'era nessuna ragione di buttarli. Cambia cosa c'e dietro la
   porta. Prima era una domanda che l'app faceva; adesso e una pagina che la
   persona ha gia scritto a mano, altrove, e vuole tenere qui.
   Il vecchio motore - TERRA_SYS, il vivaio, i ripieghi, la preparazione
   anticipata - non e stato lasciato acceso a girare per nessuno: e stato
   spento. Codice che produce cose che nessuno puo piu vedere non e prudenza,
   e un costo che si paga a ogni avvio. */
let _ocrStato='scelta';        /* scelta · attesa · testo */
let _ocrAbort=null;
let _ocrAuto='';               /* la trascrizione come e arrivata: entra in raw */
function _ocrFase(f){
  _ocrStato=f;
  const el=document.querySelector('#terra'); if(!el) return;
  el.classList.remove('ocr-scelta-on','ocr-attesa-on','ocr-testo-on');
  el.classList.add('ocr-'+f+'-on');
  const at=document.querySelector('#ocr-attesa'); if(at) at.classList.toggle('hidden',f!=='attesa');
  const ok=document.querySelector('#terra-ok');
  if(ok) ok.classList.toggle('hidden',f!=='testo');
  if(f==='testo'){ const t=document.querySelector('#terra-txt');
    if(ok&&t) ok.disabled=t.value.trim().length<1; }
}
function _ocrPulisci(){
  /* NIENTE COPIE. Il data URL di una foto da 1600 punti pesa qualche centinaio
     di kilobyte: tenerlo appeso a una variabile finche l'app vive e' il modo
     piu' silenzioso di buttare memoria. Qui si lascia andare tutto. */
  try{ if(_ocrAbort){ _ocrAbort.abort(); } }catch(_){}
  _ocrAbort=null; _ocrAuto='';
  try{ const a=document.querySelector('#ocr-file-cam'); if(a) a.value=''; }catch(_){}
  try{ const b=document.querySelector('#ocr-file-lib'); if(b) b.value=''; }catch(_){}
}
function _ocrAvviso(t){ const el=document.querySelector('#ocr-avviso'); if(el) el.textContent=t||''; }

async function _ocrLeggi(file){
  if(!file) return;
  _ocrFase('attesa'); _ocrAvviso('');
  let dataUrl='';
  const ctrl=('AbortController' in window)?new AbortController():null;
  _ocrAbort=ctrl;
  let _ocrLento=null;
  try{
    dataUrl=await preparaFoto(file);
    if(!ctrl||!ctrl.signal.aborted){
      if(((S.settings&&S.settings.aiModel)||'balanced')==='max') _ocrLento=setTimeout(()=>{
        if(_ocrStato==='attesa') _ocrAvviso('Massimo sta ancora leggendo. Non e bloccato: continuo ad aspettare il risultato.');
      },55000);
      const r=await leggiPagina(dataUrl,ctrl?ctrl.signal:null);
      dataUrl='';                                   /* letta: la foto non serve piu a nessuno */
      if(ctrl&&ctrl.signal.aborted){ _ocrFase('scelta'); return; }
      if(r&&r.err){
        _ocrFase('scelta');
        _ocrAvviso(r.err==='annullata'?'':(_ocrMsgErrore(r.err)));
        return;
      }
      const t=String((r&&r.testo)||'');
      _ocrAuto=t;
      const txt=document.querySelector('#terra-txt');
      if(txt) txt.value=t;
      _ocrFase('testo');
      _ocrAvviso(t?'Correggi quello che serve, poi salva. Il testo e tuo, non suo.'
                  :'Non ho trovato testo in questa foto. Puoi riprovare o scrivere a mano.');
      try{ regCantiere('ocr',{msg:'letta una pagina',model:(r&&r.model)||'',tin:r&&r.tin,tout:r&&r.tout}); }catch(_){}
    }
  }catch(e){
    _ocrFase('scelta');
    _ocrAvviso('Non sono riuscito ad aprire questa immagine.');
    try{ regCantiere('errore',{msg:'ocr: '+String((e&&e.message)||e).slice(0,120)}); }catch(_){}
  } finally {
    if(_ocrLento) clearTimeout(_ocrLento);
    dataUrl='';                                     /* anche sulla strada dell'errore */
    if(_ocrAbort===ctrl) _ocrAbort=null;
  }
}
function _ocrMsgErrore(err){
  if(err==='chiave') return 'Per leggere una foto serve la versione Generativa. Puoi comunque scrivere la pagina a mano.';
  if(err==='offline'||err==='rete') return 'Senza rete non posso leggere la foto. Riprova, o scrivila a mano.';
  if(err==='timeout') return 'Massimo ha superato anche l’attesa lunga. Puoi riprovare in Bilanciato o con una foto piu nitida.';
  if(err==='quota'||err==='limite') return 'La quota Gemini del tuo progetto non risponde adesso. Riprova più tardi.';
  if(err==='immagine'||err==='immagine-grande') return 'Questa foto non e arrivata bene a Gemini. Riprova: Sentiero la riduce da solo.';
  if(err==='accesso'||err==='richiesta'||err==='modello'||err==='http') return 'Gemini non ha accettato la lettura della foto. Ho conservato il codice tecnico nella Diagnostica.';
  return 'Non sono riuscito a leggere la pagina. Puoi riprovare o scriverla a mano.';
}

/* ══ v271.1 — LA VECCHIA PORTA E CHIUSA ═══════════════════════════════════
   Alla v271 il satellite azzurro apriva qui una seconda esperienza di
   scrittura, col suo pannello, i suoi tre stati e il suo salvataggio. Adesso
   la Stanza fa quel mestiere - meglio, e con la raccolta vera dietro - e il
   satellite dice dove sei. Due porte per la stessa cosa sono due posti dove
   correggere lo stesso guasto, e uno dei due si dimentica sempre.
   La funzione resta come muro, non come porta: se qualcosa la chiamasse per
   una strada che non ho visto, non si apre niente e resta agli atti.
   Il MOTORE dell'OCR - preparaFoto, leggiPagina, OCR_SYS, _ocrMsgErrore - non
   e stato toccato: lo usa la Stanza, ed e lo stesso che funzionava. */
function apriTerra(){
  try{ regCantiere('terra',{msg:'porta vecchia: non si apre piu, la Stanza ha preso il suo posto'}); }catch(_){}
  return;
}
function chiudiTerra(){
  const el=document.querySelector('#terra'); if(!el) return;
  /* chiudere non deve MAI lasciare uno stato appeso: una lettura in corso si
     annulla, i campi dei file si svuotano, il testo automatico si lascia
     andare. Riaprendo si riparte dalla scelta, sempre. */
  try{ _ocrPulisci(); }catch(_){}
  try{ _ocrFase('scelta'); }catch(_){}
  try{ const t=el.querySelector('#terra-txt'); if(t){ t.value=''; t.blur(); } }catch(_){}
  if(window._terraLuce&&window._terraLuce.chiudi) window._terraLuce.chiudi();
  else { el.classList.add('via'); setTimeout(()=>{ try{ el.classList.add('hidden'); }catch(_){} },340); }
}

/* ══ IL MOTORE DELLA LUCE (v180) ═══════════════════════════════════════════════════
   Un solo rAF. Si muove soltanto transform e opacity: tutto il resto costa un
   frame. Tre stati - orbita, volo, atterrata - e nessuna coda di timeout che si
   accavalla. ═══════════════════════════════════════════════════════════════════ */
(function(){
  const luce=document.getElementById('terra-luce'); if(!luce) return;
  const scie=[].slice.call(document.querySelectorAll('.terra-scia'));
  /* ══ v271.1 — LA LUCE ORBITA, E BASTA ═════════════════════════════════════
     Questa guardia chiedeva anche il pannello e la sua carta, perche la luce
     doveva ATTERRARCI sopra. Adesso il satellite condivide dove sei: non
     atterra piu da nessuna parte, e pretendere un pannello che non esiste piu
     avrebbe spento l'orbita insieme al pannello - cioe avrebbe fatto sparire
     dal cielo una cosa che deve restare identica.
     L'identita non si tocca: colore, nucleo, alone, scie, moto, bersaglio,
     ottimizzazione e riduzione del movimento sono quelli di prima. */
  const el=document.getElementById('terra');
  const fiore=document.getElementById('terra-fiore');
  const carta=document.getElementById('terra-carta');
  if(!fiore) return;
  const GIRO=26000, VOLO=440;
  let CX=0, CY=0, RR=120, ang=-Math.PI/2, t0=performance.now(), stato='orbita', volo=null;
  const STORIA=[];

  function calmo(){
    try{ if(S.settings&&S.settings.anim==='sempre') return false;
      return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; }
  }
  /* il centro VERO del cerchio: si misura il bottone, non la scatola che lo contiene.
     r=79 su un viewBox 200 e il raggio del tracciato: la luce corre sull'anello. */
  function misura(){ const g=geometriaVoce(); CX=g.x; CY=g.y; RR=g.ringR; }
  misura();
  addEventListener('resize',lavoroPesante(misura)); addEventListener('orientationchange',lavoroPesante(misura));
  try{ const m=document.getElementById('mic'); if(m&&window.ResizeObserver) new ResizeObserver(misura).observe(m); }catch(_){}

  function punto(a){ return {x:CX+Math.cos(a)*RR, y:CY+Math.sin(a)*RR}; }
  function poni(e,x,y,op){
    e.style.transform='translate3d('+x.toFixed(2)+'px,'+y.toFixed(2)+'px,0)';
    if(op!=null) e.style.opacity=op;
  }

  function frame(now){
    requestAnimationFrame(frame);
    if(document.hidden) return;
    if(ditoInMovimento()) return;   /* v259: il dito ha la precedenza */
    if(stato==='orbita'&&document.body.getAttribute('data-mondo')==='coperto') return;   /* coperta: zero lavoro */
    let x,y,k=1,op=1;
    if(stato==='orbita'){
      misura();
      ang=((now-t0)/GIRO)*Math.PI*2 - Math.PI/2;
      const p=punto(ang); x=p.x; y=p.y;
      k=1+Math.sin(now/1400)*0.10;         /* il respiro, appena percettibile */
    } else if(stato==='volo'){
      const u=Math.min(1,(now-volo.t)/VOLO);
      const e=u<0.5 ? 4*u*u*u : 1-Math.pow(-2*u+2,3)/2, m=1-e;
      x=m*m*m*volo.x0+3*m*m*e*volo.cx1+3*m*e*e*volo.cx2+e*e*e*volo.x1;
      y=m*m*m*volo.y0+3*m*m*e*volo.cy1+3*m*e*e*volo.cy2+e*e*e*volo.y1;
      k=1+e*2.6;
      op=u>0.86?Math.max(0,(1-u)/0.14):1;
      if(u>=1){ if(volo.verso==='giu'){ stato='atterrata'; sboccia(volo.x1,volo.y1); }
                else { stato='orbita'; t0=performance.now()-((ang+Math.PI/2)/(Math.PI*2))*GIRO; } }
    } else { x=volo?volo.x1:CX; y=volo?volo.y1:CY; op=0; }

    poni(luce,x,y,op);
    luce.style.setProperty('--luce-k',k);
    STORIA.push(x,y); if(STORIA.length>80) STORIA.splice(0,2);
    for(let i=0;i<scie.length;i++){
      const j=STORIA.length/2-1-(i+1)*5;
      if(j<0){ scie[i].style.opacity=0; continue; }
      scie[i].style.setProperty('--sd',(7-i*1.4).toFixed(1)+'px');
      poni(scie[i],STORIA[j*2],STORIA[j*2+1],(stato==='orbita'?1:op)*(0.40-i*0.11));
    }
  }
  requestAnimationFrame(frame);

  function sboccia(x,y){
    try{ if(carta) carta.style.transformOrigin=((x/(innerWidth||1))*100).toFixed(1)+'% 0%'; }catch(_){}
    if(calmo()){ if(el) el.classList.add('aperto'); return; }
    fiore.style.transition='none';
    fiore.style.transform='translate3d('+x+'px,'+y+'px,0) scale(1)';
    fiore.style.opacity='0';
    requestAnimationFrame(()=>{
      fiore.style.transition='transform .34s cubic-bezier(.16,.9,.3,1),opacity .34s ease';
      fiore.style.transform='translate3d('+x+'px,'+y+'px,0) scale(9,2.2)';
      fiore.style.opacity='1';
      setTimeout(()=>{ fiore.style.transition='transform .3s ease,opacity .3s ease';
        fiore.style.transform='translate3d('+x+'px,'+y+'px,0) scale(22,.6)';
        fiore.style.opacity='0'; },180);
    });
    setTimeout(()=>{ if(el) el.classList.add('aperto'); },150);
  }

  window._terraLuce={
    apri(){
      if(!el||!carta) return;              /* v271.1: non c'e piu niente da aprire */
      el.classList.add('acceso');
      misura();
      let alt=0; try{ alt=carta.getBoundingClientRect().height; }catch(_){}
      if(!alt) alt=Math.min(innerHeight*0.52,420);
      const x1=innerWidth/2, y1=innerHeight-alt;
      if(calmo()||stato!=='orbita'){ stato='atterrata'; volo={x1:x1,y1:y1}; sboccia(x1,y1); return; }
      const p0=punto(ang), tg={x:-Math.sin(ang),y:Math.cos(ang)};
      volo={verso:'giu',t:performance.now(),x0:p0.x,y0:p0.y,
        cx1:p0.x+tg.x*RR*0.55, cy1:p0.y+tg.y*RR*0.55,
        cx2:x1, cy2:y1-Math.max(90,alt*0.42), x1:x1, y1:y1};
      stato='volo';
    },
    chiudi(){
      if(!el) return;
      el.classList.add('chiudendo'); el.classList.remove('aperto','acceso');
      setTimeout(()=>{
        el.classList.remove('chiudendo'); el.classList.add('hidden');
        const p=punto(ang);
        if(calmo()||!volo){ stato='orbita'; t0=performance.now()-((ang+Math.PI/2)/(Math.PI*2))*GIRO; return; }
        const tg={x:-Math.sin(ang),y:Math.cos(ang)};
        volo={verso:'su',t:performance.now(),x0:volo.x1,y0:volo.y1,
          cx1:volo.x1, cy1:volo.y1-140,
          cx2:p.x+tg.x*RR*0.55, cy2:p.y+tg.y*RR*0.55, x1:p.x, y1:p.y};
        stato='volo';
      },300);
    }
  };

  /* ── LA TASTIERA ────────────────────────────────────────────────────
     Su iOS la tastiera NON rimpicciolisce il layout: ci si mette sopra.
     Un pannello ancorato in basso ci finisce sotto per forza, ed e cosi
     che si finiva a scrivere alla cieca. visualViewport e l'unico che
     dice quanto schermo resta davvero. */
  const vv=window.visualViewport;
  const txt=document.getElementById('terra-txt');
  function tastiera(){
    if(!vv) return;
    const h=Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', h+'px');
    if(!txt) return;
    try{
      const alto=carta.getBoundingClientRect().height;
      if(alto > vv.height-24 && txt.rows>2) txt.rows=txt.rows-1;
    }catch(_){}
  }
  /* v259: passivi. Il telefono non deve aspettare la fine di questa funzione
     per muovere la pagina: qui non si annulla niente. */
  if(vv){ vv.addEventListener('resize',tastiera,{passive:true}); vv.addEventListener('scroll',tastiera,{passive:true}); }
  if(txt){
    txt.addEventListener('focus',()=>setTimeout(tastiera,60));
    txt.addEventListener('blur',()=>{ txt.rows=5; setTimeout(tastiera,80); });
  }
  /* il velo si tocca e si chiude: ma solo il velo, non la carta.
     v271.1: il velo non esiste piu - il pannello azzurro e stato smontato e la
     Stanza ha preso il suo posto. Senza questa guardia la riga lanciava un
     TypeError proprio durante l'aggancio degli ascoltatori, e TUTTO cio che
     veniva agganciato dopo - il tocco del satellite, il selettore dei due modi
     della Stanza - non veniva agganciato affatto. Un errore muto in coda a un
     blocco che ne spegne un altro: e la classe di guasto peggiore, perche non
     assomiglia alla sua causa. L'ha trovato la sonda, non io. */
  if(el) el.addEventListener('click',e=>{ if(e.target===el) chiudiTerra(); });
})();

/* ══ TERRA DIURNA — codice pesante caricato soltanto al primo ingresso ═══ */
let _giornoModulo=null,_giornoCarica=null;
function endpointGiorno(){
  try{ const meta=document.querySelector('meta[name="sentiero-services"]'),value=meta&&meta.content;
    if(value) return value; }catch(_){}
  try{ const info=window.SentieroSync&&window.SentieroSync.info&&window.SentieroSync.info(); if(info&&info.endpoint) return info.endpoint; }catch(_){}
  return '';
}
function caricaStanzaTerra(){
  if(_giornoModulo) return Promise.resolve(_giornoModulo); if(_giornoCarica) return _giornoCarica;
  _giornoCarica=import('./sentiero-day.mjs?v=60.274.2').then(modulo=>(_giornoModulo=modulo)).catch(error=>{_giornoCarica=null;throw error;});
  return _giornoCarica;
}
function contestoStanzaTerra(){ return {
  state:()=>S, save:()=>{ const ok=salvaSubito(); try{ window.dispatchEvent(new Event('sentiero:state')); }catch(_){} return ok; },
  editQuest:id=>apriQuestEditor(id), ai:opt=>aiCall(opt), canGenerate:()=>generativa(), newsEndpoint:endpointGiorno
}; }
async function apriStanzaTerra(){
  try{ const modulo=await caricaStanzaTerra(); await modulo.open(contestoStanzaTerra()); }
  catch(_){ try{toast('La stanza della Terra non è disponibile');}catch(__){} }
}
window.apriStanzaTerra=apriStanzaTerra;
function segnalaStatoGiorno(){ try{ window.dispatchEvent(new Event('sentiero:state')); }catch(_){} }

/* ══ IL SATELLITE DELLA SERA + LA TERRA DEL GIORNO (v274) ════════════════
   Stesso anello del microfono, punto opposto a quello azzurro, giro piu lento:
   cosi non si raggiungono mai e non si sovrappongono. Compare alle 19 e sparisce
   alle 4:20. Un solo requestAnimationFrame, e si ferma quando la pagina e coperta
   o quando l'ora non e la sua: fuori orario non consuma niente. ══════════ */
(function(){
  const luce=document.getElementById('notte-luce'); if(!luce) return;
  const pianeta=document.getElementById('giorno-terra'); if(!pianeta) return;
  const scie=[].slice.call(document.querySelectorAll('.notte-scia'));
  const el=document.getElementById('stanza');
  const fiore=document.getElementById('notte-fiore');
  if(!el||!fiore) return;
  const GIRO=34000;   /* piu lento dell'azzurro, che gira in 26 secondi */
  let CX=0, CY=0, RR=120, ang=Math.PI/2, t0=performance.now(), acceso=null;
  const STORIA=[];
  function calmo(){ try{ if(S.settings&&S.settings.anim==='sempre') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } }
  function misura(){ const g=geometriaVoce(); CX=g.x; CY=g.y; RR=g.ringR; }
  misura(); addEventListener('resize',lavoroPesante(misura)); addEventListener('orientationchange',lavoroPesante(misura));
  try{ const m=document.getElementById('mic'); if(m&&window.ResizeObserver) new ResizeObserver(misura).observe(m); }catch(_){}
  function poni(e,x,y,op){ e.style.transform='translate3d('+x.toFixed(2)+'px,'+y.toFixed(2)+'px,0)';
    if(op!=null) e.style.opacity=op; }
  function orario(){
    const c = (typeof stanzaOra==='function') ? stanzaOra() : false;
    if(c!==acceso){
      acceso=c;
      luce.classList.toggle('hidden',!c);
      pianeta.classList.toggle('hidden',c);
      if(!c){ scie.forEach(x=>x.style.opacity=0); }
      if(c&&_giornoModulo&&typeof _giornoModulo.close==='function') try{_giornoModulo.close();}catch(_){}
    }
    return c;
  }
  /* v258: anche l'orologio del cielo tace a schermo coperto - e riparte al
     ritorno, che e gia' scritto nella riga qui sotto. */
  orario(); setInterval(function(){ if(!document.hidden) orario(); }, 30000);
  document.addEventListener('visibilitychange',orario);
  function frame(now){
    requestAnimationFrame(frame);
    if(document.hidden) return;
    if(ditoInMovimento()) return;                         /* v259: il dito ha la precedenza */
    if(document.body.getAttribute('data-mondo')==='coperto') return;
    if(el.classList.contains('aperta')||document.body.classList.contains('giorno-aperto')) return;
    misura();
    if(!acceso){
      const a=calmo()?-Math.PI/2:((now-t0)/42000)*Math.PI*2-Math.PI/2;
      const x=CX+Math.cos(a)*RR,y=CY+Math.sin(a)*RR;
      poni(pianeta,x,y,1); return;
    }
    const quiet=calmo();
    ang=quiet?Math.PI/2:((now-t0)/GIRO)*Math.PI*2 + Math.PI/2;
    const x=CX+Math.cos(ang)*RR, y=CY+Math.sin(ang)*RR;
    const k=quiet?1:1+Math.sin(now/1700)*0.13;             /* reduced motion: immobile */
    poni(luce,x,y,1);
    luce.style.setProperty('--luce-k',k.toFixed(3));
    if(quiet){ scie.forEach(x=>x.style.opacity=0); return; }
    STORIA.push(x,y); if(STORIA.length>80) STORIA.splice(0,2);
    for(let i=0;i<scie.length;i++){
      const j=STORIA.length/2-1-(i+1)*5;
      if(j<0){ scie[i].style.opacity=0; continue; }
      scie[i].style.setProperty('--sd',(9-i*1.6).toFixed(1)+'px');
      poni(scie[i],STORIA[j*2],STORIA[j*2+1],0.44-i*0.12);
    }
  }
  requestAnimationFrame(frame);
  function sboccia(x,y){
    if(calmo()) return;
    fiore.style.transition='none';
    fiore.style.transform='translate3d('+x+'px,'+y+'px,0) scale(1)';
    fiore.style.opacity='1';
    requestAnimationFrame(()=>{
      fiore.style.transition='transform .5s cubic-bezier(.16,.9,.3,1),opacity .5s ease';
      fiore.style.transform='translate3d('+x+'px,'+y+'px,0) scale(120)';
      fiore.style.opacity='0';
    });
  }
  luce.addEventListener('click',()=>{
    const p={x:CX+Math.cos(ang)*RR, y:CY+Math.sin(ang)*RR};
    sboccia(p.x,p.y);
    try{ apriStanza(); }catch(_){}
  });
  pianeta.addEventListener('click',()=>{ try{apriStanzaTerra();}catch(_){} });
  /* la tastiera: senza visualViewport iOS non ridimensiona la pagina e il piede
     della stanza finisce sotto i tasti. Stessa lezione della v180. */
  const vv=window.visualViewport;
  if(vv){
    const tastiera=()=>{
      const h=Math.max(0, innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', h+'px');
      /* v225: la carta si accorcia invece di spostarsi in su. La classe serve
         solo a togliere il margine di sicurezza in basso quando la tastiera c'e:
         quello spazio lo occupa gia lei. */
      try{ document.getElementById('stanza').classList.toggle('tastiera', h>40); }catch(_){}
      /* e il campo segue il cursore: con la carta piu bassa, la riga che si sta
         scrivendo puo finire sotto il bordo del campo. Il browser lo fa da solo
         quando il campo ha il fuoco, ma non sempre dopo un cambio di altezza. */
      try{
        const t=document.getElementById('stanza-txt');
        if(t && document.activeElement===t) t.scrollTop=t.scrollHeight;
      }catch(_){}
    };
    vv.addEventListener('resize',tastiera,{passive:true}); vv.addEventListener('scroll',tastiera,{passive:true});   /* v259 */
  }
  const no=document.getElementById('stanza-no'), ok=document.getElementById('stanza-ok');
  if(no) no.addEventListener('click',()=>{ try{ chiudiStanza(); }catch(_){} });
  /* ══ v271.1 — i due modi, e le tre vie della foto ═══════════════════════ */
  try{ document.querySelectorAll('#stanza-modo button').forEach(b=>
    b.addEventListener('click',()=>{ try{ stanzaModo(b.dataset.modo); }catch(_){} })); }catch(_){}
  {
    const cam=document.getElementById('st-file-cam'), lib=document.getElementById('st-file-lib');
    /* i due input restano nascosti e si aprono dal tocco su un tasto vero: e
       cosi che iOS apre fotocamera e libreria in modo nativo, e - punto che
       conta - nessun permesso viene chiesto prima del gesto esplicito. */
    const via=inp=>{ try{ if(inp){ inp.value=''; inp.click(); } }catch(_){} };
    const bs=document.getElementById('st-scatta'); if(bs) bs.addEventListener('click',()=>via(cam));
    const bg=document.getElementById('st-scegli'); if(bg) bg.addEventListener('click',()=>via(lib));
    [cam,lib].forEach(inp=>{ if(!inp) return;
      inp.addEventListener('change',()=>{ const f=inp.files&&inp.files[0]; inp.value='';
        if(f){ const r=_stLeggi(f); if(r&&r.catch) r.catch(()=>{}); } }); });
    const st=document.getElementById('st-stop');
    if(st) st.addEventListener('click',()=>{ try{ _stOcrPulisci(); stanzaFase('scelta'); }catch(_){} });
    const rf=document.getElementById('st-rifai');
    if(rf) rf.addEventListener('click',()=>{ try{ _stOcrPulisci();
      const t=document.getElementById('stanza-txt'); if(t) t.value='';
      stanzaFase('scelta'); }catch(_){} });
  }
  if(ok) ok.addEventListener('click',()=>{
    try{ const p=raccogliStanza();
      if(p&&p.catch) p.catch(function(e){ try{ regCantiere('errore',{msg:'raccogliStanza: '+String((e&&e.message)||e).slice(0,120)}); }catch(_){} });
    }catch(_){}
  });
})();
/* v271.1 — raccogliTerra salvava il testo dritto nel Diario, saltando la
   raccolta: era giusto per la missione della v271 e non lo e piu. Il suo
   lavoro adesso lo fa raccogliStanza, che passa da scrittoNelDiario. */
async function raccogliTerra(){ return; }
let _seminaBusy=false;
async function maybeSemina(){
  return;   /* LA SEMINA E CONGELATA (decisione dal campo, 2026-07-20: cinque semi, cinque esalati, zero risposte).
     Tornera, forse rifondata sulle scoperte dell'amico. Il codice sotto resta intatto. */
  if(_seminaBusy) return; _seminaBusy=true;
  try{
    const tk=todayKey();
    try{ if(localStorage.getItem('sentiero-seme')===tk) return; }catch(_){}
    try{ if(localStorage.getItem('sentiero-perla')===tk) return; }catch(_){}      /* la perla vince */
    try{ if(localStorage.getItem('sentiero-presenza')===tk) return; }catch(_){}   /* una voce sola per sera */
    try{ const dn=JSON.parse(localStorage.getItem('sentiero-dono')||'null'); if(dn&&dn.ultimo===tk) return; }catch(_){}   /* il giorno del dono, il seme tace */
    const d=new Date();
    const cand=seminaCandidate(S,{tk:tk,ora:d.getHours(),dow:dowOf(d),sealed:S.lastSealed===tk,vuoti:giorniVuoti(S,tk)});
    if(!cand) return;
    const mem=(S.semi||[]).map(s=>s.testo);
    let testo='',fonte='locale';
    if(GEMINI_KEY&&cand.tipo!=='rientro'){
      try{ testo=await askSeme(cand); fonte='ai'; }catch(_){ testo=''; }
      if(testo&&!semeFiltro(testo,mem,cand.tipo)) testo='';
      if(!testo) fonte='locale';
    }
    if(!testo) testo=semeVivaio(cand.tipo,cand.asse,cand.gesto,mem,cand.rifTesto);
    if(!semeFiltro(testo,mem,cand.tipo)) return;
    const id='sm'+Date.now().toString(36);
    if(!semeScrivi(testo,id)) return;
    S.semi.push({id:id,iso:new Date().toISOString(),tk:tk,asse:cand.tipo==='seme'?cand.asse:cand.tipo,
      gesto:cand.gesto||'',testo:testo,stato:'esalato',fonte:fonte,rif:cand.rif||''});
    S.semi=sanitizeSemi(S.semi);
    try{ localStorage.setItem('sentiero-seme',tk); }catch(_){}
    save();
  }catch(_){}
  finally{ _seminaBusy=false; }
}
/* ══════════════════════════════════════════════════════════════════
   I CAPITOLI — alla prima apertura di un mese nuovo, quello finito si rilega:
   fotografia delle pietre (col piano di oggi, il meglio che la memoria offre)
   + una riga dell'osservatrice. Vive in cima al Diario. MAI numeri nella riga.
   ══════════════════════════════════════════════════════════════════ */
/* puro: quali mesi rilegare (con segni, prima del corrente, non ancora capitoli) */
function capitoloCandidati(state,meseCorr){
  const gia=new Set((state.capitoli||[]).map(c=>c.mese));
  const mesi=new Set();
  Object.keys(state.checks||{}).forEach(k=>{ const m=k.slice(0,7); if(/^\d{4}-\d{2}$/.test(m)&&m<meseCorr) mesi.add(m); });
  Object.keys(state.patti||{}).forEach(k=>{ const m=k.slice(0,7); if(/^\d{4}-\d{2}$/.test(m)&&m<meseCorr) mesi.add(m); });
  return Array.from(mesi).filter(m=>!gia.has(m)).sort().slice(-3);
}
/* puro: congela il mese in pietre {g,p,pieno,oro} + stats */
function capitoloFotografia(state,mese){
  const y=+mese.slice(0,4), mo=+mese.slice(5,7);
  const nG=new Date(y,mo,0).getDate();
  const pietre=[]; let attivi=0,pieni=0,oroN=0;
  for(let g=1;g<=nG;g++){
    const tk=mese+'-'+String(g).padStart(2,'0');
    let p=0,done=0,tot=0;
    try{ const r=fotoDi(state,tk,dowOf(new Date(y,mo-1,g))); p=r.p||0; done=r.done||0; tot=r.tot||0; }catch(_){}
    const haDati=!!((state.checks&&state.checks[tk])||((state.foto||{})[tk]));
    const pieno=(haDati&&tot>0&&done>=tot)?1:0;
    const oroRaw=((state.patti||{})[tk]|0);
    const oro=(oroRaw===1||oroRaw===2)?oroRaw:0;
    if(haDati&&done>0) attivi++;
    if(pieno) pieni++;
    if(oro) oroN++;
    pietre.push({g:g,p:haDati?Math.round(p*100)/100:0,pieno:pieno,oro:oro});
  }
  return {pietre:pietre,stats:{giorni:nG,attivi:attivi,pieni:pieni,oro:oroN}};
}
/* puro: la riga di ripiego, senza chiave e senza cifre — sempre uguale a parita di dati */
function capitoloRigaLocale(f){
  const s=f.stats,n=s.giorni||30,terzo=Math.ceil(n/3);
  let inizio=0,fine=0;
  (f.pietre||[]).forEach(pt=>{ const on=(pt.p>0||pt.pieno); if(!on)return; if(pt.g<=terzo)inizio++; else if(pt.g>n-terzo)fine++; });
  const rAtt=s.attivi/n, rPieni=s.attivi?s.pieni/s.attivi:0;
  if(!s.attivi) return 'Un mese in bianco. Anche la pausa lascia un segno: il foglio e ancora qui.';
  if(rAtt>=0.9&&rPieni>=0.7) return 'Un mese che non ha chiesto eroismi: solo il tratto, ogni giorno. Cosi scava l\u2019acqua.';
  if(s.oro>0&&rAtt>=0.6) return 'Tra le pietre brilla l\u2019oro dei patti mantenuti. La parola data a se stessi pesa piu della voglia.';
  if(fine>inizio*2) return 'Il mese e cresciuto camminando: il finale dice piu dell\u2019inizio.';
  if(inizio>fine*2) return 'Partenza piena, finale sottile. Il fuoco che dura e piu raro di quello che divampa.';
  if(rAtt>=0.5) return 'Un mese a giorni alterni: il ritmo compare, poi si interrompe ai bordi.';
  return 'Poche pietre, ma vere. Il sentiero non misura la lunghezza del passo: misura che tu sia passato.';
}
const CAPITOLO_SYS='Sei la voce di Sentiero. Un mese si chiude: rileggilo e restituisci UNA riga sola, in italiano semplice, senza parole di sistema (task, quest, arco, rituale). Corta: sotto le quindici parole, nessun trattino.\n'+
'VOCE: calma, essenziale, un filo di Tao senza mai nominarlo. Niente domande, niente esclamazioni, niente elenchi.\n'+
'REGOLA ASSOLUTA: VIETATO qualsiasi numero o cifra nel testo. Parla per immagini del ritmo: costanza, vuoti, ritorni, il finale che cresce, il fuoco che dura.\n'+
'Guarda i DATI: giorni attivi contro vuoti, cerchi pieni, patti d\u2019oro, dove si addensa il mese (inizio, centro, fine), il confronto col capitolo precedente se c\u2019e.\n'+
'FORMATO: massimo 140 caratteri, una frase o due brevissime. Rispondi SOLO con la riga, senza JSON, markdown o etichette.';
function capitoloDigest(f,mese,prev){
  const n=f.stats.giorni,terzo=Math.ceil(n/3); let inizio=0,centro=0,fine=0;
  f.pietre.forEach(pt=>{ if(!(pt.p>0||pt.pieno)) return; if(pt.g<=terzo) inizio++; else if(pt.g>n-terzo) fine++; else centro++; });
  return {mese:mese,giorni:n,attivi:f.stats.attivi,vuoti:n-f.stats.attivi,cerchi_pieni:f.stats.pieni,patti_oro:f.stats.oro,
    distribuzione:{inizio:inizio,centro:centro,fine:fine},capitolo_precedente:prev?prev.riga:null};
}
async function askCapitolo(f,mese){
  const prev=(S.capitoli||[]).length?S.capitoli[S.capitoli.length-1]:null;
  const res=await aiCall({system:CAPITOLO_SYS,user:'DATI DEL MESE (JSON):\n'+JSON.stringify(capitoloDigest(f,mese,prev)),task:'capitolo',maxOutputTokens:200,reasoning:'low',timeout:30000,priority:12});
  if(res.err) throw new Error(res.err);
  let riga=clampStr(String((res&&res.text)||''),160).trim();
  try{ const p=_geminiStructuredJson(riga); if(p&&typeof p.riga==='string') riga=clampStr(p.riga,160).trim(); }catch(_){}
  if(!riga) throw new Error('vuota');
  if(_lingVoceVeto(riga,{prescrizione:true,gergo:true,giudizio:true})) throw new Error('qualita');
  return riga;
}
let _capitoliBusy=false;
async function maybeChiudiCapitolo(){
  if(_capitoliBusy) return; _capitoliBusy=true;
  try{
    const cand=capitoloCandidati(S,todayKey().slice(0,7));
    if(!cand.length) return;
    for(let i=0;i<cand.length;i++){
      const mese=cand[i];
      const f=capitoloFotografia(S,mese);
      let riga='';
      if(i===cand.length-1&&GEMINI_KEY){ try{ riga=await askCapitolo(f,mese); }catch(_){ riga=''; } }
      if(riga&&/\d/.test(riga)) riga='';   /* dove parla l\u2019osservatrice, mai numeri */
      const fonte=riga?'ai':'locale';
      if(!riga) riga=capitoloRigaLocale(f);
      const cap={id:'c'+Date.now().toString(36)+i,mese:mese,pietre:f.pietre,stats:f.stats,riga:riga,fonte:fonte,createdAt:new Date().toISOString()};
      S.capitoli.push(cap);
      try{ await archiviaEnsoCapitolo(cap); _ensoCapSession.add(mese); }catch(_){}   /* archivio derivato: il capitolo non fallisce se IndexedDB non c'e */
    }
    S.capitoli=sanitizeCapitoli(S.capitoli);
    save(); try{ renderCapitoli(); }catch(_){}
  }catch(_){}
  finally{ _capitoliBusy=false; }
}
function meseNome(mese,maiuscola){
  try{ const n=new Date(mese+'-15T12:00:00').toLocaleDateString(locale(),{month:'long'});
    return maiuscola?(n.charAt(0).toUpperCase()+n.slice(1)):n; }catch(_){ return mese; }
}
function renderCapitoli(){   /* la costellazione: cenere=spento, anello oro=parziale, vermiglio=pieno, scintilla=patto */
  const box=document.getElementById('capitoli'); if(!box) return;
  const caps=S.capitoli||[];
  if(!caps.length){ box.innerHTML=''; return; }
  const c=caps[caps.length-1];
  try{ assicuraEnsoCapitolo(c); }catch(_){}   /* import/restore: se l'archivio locale manca, il capitolo lo ricrea da solo */
  const nG=(c.stats&&c.stats.giorni)||c.pietre.length||30;
  const STEP=340/nG;
  let fila='';
  c.pietre.forEach(pt=>{
    const x=(STEP*(pt.g-1)+STEP/2).toFixed(1);
    if(pt.pieno) fila+='<circle cx="'+x+'" cy="30" r="5.4" fill="#C9503C"/>';
    else if(pt.p>0) fila+='<circle cx="'+x+'" cy="30" r="5" fill="none" stroke="rgba(232,168,76,.8)" stroke-width="2"/>';
    else fila+='<circle cx="'+x+'" cy="30" r="2.8" fill="rgba(245,242,234,.10)"/>';
    if(pt.oro){
      if(pt.oro===2) fila+='<circle cx="'+x+'" cy="13" r="5" fill="none" stroke="rgba(217,116,75,.75)" stroke-width="1.4"/>';
      fila+='<circle cx="'+x+'" cy="13" r="2.4" fill="'+(pt.oro===2?'#F2C56B':'#E8A84C')+'"/>';
    }
  });
  const prec=caps.slice(0,-1).slice(-5).reverse().map(p=>
    '<div class="pr"><b>'+escapeHtml(meseNome(p.mese))+'</b><span>'+escapeHtml(p.riga)+'</span></div>').join('');
  box.innerHTML='<div class="capitolo">'+
    '<div class="cap-angoli"></div><div class="cap-fermaglio"><b></b></div>'+
    '<span class="cap-eyebrow">capitolo</span>'+
    '<span class="cap-mese">'+escapeHtml(meseNome(c.mese,true))+'<small>'+escapeHtml(c.mese.slice(0,4))+'</small></span>'+
    capitoloEnsoSvg(c)+
    '<svg class="cap-fila" viewBox="0 0 340 46" xmlns="http://www.w3.org/2000/svg">'+fila+'</svg>'+
    '<p class="cap-riga">'+escapeHtml(c.riga)+'</p>'+
    '<div class="cap-firma">\u2014 l\u2019osservatrice</div>'+
    (prec?'<div class="cap-prec">'+prec+'</div>':'')+
    '</div>';
}
/* ══ LA DISTILLAZIONE (v195) ═══════════════════════════════════════════════
   Ventinove giorni diventano uno scritto breve. Non un riassunto: una lettura.
   Si puo solo quando c'e materiale - se il periodo e magro non c'e nemmeno la
   porta, come il frutto che tace invece di dire una cosa vuota. ══════════ */
const DISTILLA_MINIMI = 10;      /* giorni attivi negli ultimi 29 */

function _distillaMateriale(){
  try{
    const oggi = new Date(todayKey()+'T12:00:00');
    let n = 0;
    Object.keys(S.checks||{}).forEach(k=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const d = Math.round((oggi-new Date(k+'T12:00:00'))/86400000);
      if(d>=0 && d<=29 && Object.keys(S.checks[k]||{}).length) n++;
    });
    return n;
  }catch(_){ return 0; }
}

function salvaLascito(testo){
  /* stessa forma di addDiary, piu il segno: e una voce del diario, ma non
     l'hai scritta tu. Il ramo che la veste in renderDiary guarda questo campo. */
  S.diary.unshift({data:todayKey(), iso:new Date().toISOString(),
    testo:clampStr(testo,LIMITS.DIARY), raw:'', born:[], done:[], pos:null,
    seme:'', lascito:true});
  if(S.diary.length>LIMITS.DMAX) S.diary.length=LIMITS.DMAX;
  save();
}

let _distillando = false;
async function distillaPeriodo(bottone){
  if(_distillando) return;
  _distillando = true;
  const testoPrima = bottone ? bottone.textContent : '';
  try{
    if(!GEMINI_KEY){
      try{ toast('La distillazione del periodo sta nella versione Generativa, in Altro.'); }catch(_){}
      return;
    }
    if(bottone){ bottone.disabled = true; bottone.textContent = 'sto rileggendo…'; }
    const pkg = buildPeriodPackage();
    const res = await askObserverDistill(pkg);
    const testo = res && res.text ? String(res.text).trim() : '';
    if(!testo){
      try{ toast('Non e venuto fuori niente. Riprova piu tardi.'); }catch(_){}
      return;
    }
    salvaLascito(testo);
    try{ renderDiary(); }catch(_){}
    try{ haptic(true); }catch(_){}
    /* lo scritto e appena nato: sta in cima, e ci si va */
    try{ const el=document.querySelector('#list-diario .entry.lascito');
      if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){}
  } finally {
    _distillando = false;
    if(bottone){ bottone.disabled = false; bottone.textContent = testoPrima || 'Distilla questo periodo'; }
  }
}

function condividiLascito(testo){
  const t = String(testo||'').trim();
  if(!t) return;
  try{
    if(navigator.share){ navigator.share({text:t}); return; }
    if(navigator.clipboard){ navigator.clipboard.writeText(t); toast('Copiato'); return; }
  }catch(_){}
  try{ toast('Non riesco a condividerlo da qui'); }catch(_){}
}

/* ══ v258 — IL DIARIO NON SI RIFA' SE NON E' CAMBIATO ═══════════════════════
   Ogni spunta chiama render(), e render() rifaceva TUTTO il diario: con
   centocinquanta voci sono centocinquanta gruppi di nodi buttati e ricostruiti
   per una casella che nessuno ha toccato. Misurato: centoventiquattro
   millesimi ogni volta, contro zero virgola diciassette per accorgersi che non
   e cambiato niente. Settecento volte meno lavoro, e lo stesso schermo.

   La firma non e un'astuzia: e' lo stato vero, scritto per intero. Cosi non
   esiste il caso «e cambiato qualcosa che la firma non guardava» - che sarebbe
   il modo classico di guadagnare velocita e perdere fiducia.
   Chi ha bisogno di ridisegnare comunque chiama renderDiary(true). */
let _diarioFirma=null;
/* ══ v271 — LA RICERCA NEL DIARIO ══════════════════════════════════════════
   Locale, immediata, senza rete e senza modello. Tre proprieta, e ognuna ha una
   ragione precisa:

   · E UNA VISTA, NON UNA TRASFORMAZIONE. S.diary non viene toccato mai: si
     filtra al momento di disegnare. Una ricerca che modificasse l'array
     sarebbe un modo eccellente di perdere il diario di qualcuno la prima volta
     che save() parte mentre il filtro e attivo.
   · NORMALIZZA GLI ACCENTI. «perche» deve trovare «perche'» e «perché», e
     viceversa: chi cerca di fretta sulla tastiera di un telefono non mette gli
     accenti. NFD spezza la lettera dal segno, e si buttano i segni.
   · CERCA SU TUTTE LE VOCI, non su quelle disegnate: il Diario disegna tutto
     comunque, ma il testo su cui si cerca comprende anche «raw» - il parlato
     grezzo e la trascrizione automatica di una pagina - perche una parola che
     hai detto e poi corretto resta una parola che hai detto. */
let _qDiario='';
function _normQ(t){
  try{ return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  catch(_){ return String(t||'').toLowerCase(); }
}
function _testoCercabile(e){
  if(!e) return '';
  return _normQ([e.testo,e.raw,e.dom,(e.born||[]).join(' '),(e.done||[]).join(' ')].filter(Boolean).join('\n'));
}
/* UN AUTORE SOLO per la query: il campo, la ×, lo stato vuoto e la chiusura
   passano tutti di qui. Senza, «cancella» avrebbe tre implementazioni e due di
   loro si dimenticherebbero di ridisegnare. */
function diarioCerca(q){
  _qDiario=String(q==null?'':q).slice(0,120);
  try{ const inp=document.querySelector('#d-cerca'); if(inp&&inp.value!==_qDiario) inp.value=_qDiario; }catch(_){}
  try{ const x=document.querySelector('#d-cerca-x'); if(x) x.classList.toggle('hidden',!_qDiario.trim()); }catch(_){}
  try{ renderDiary(); }catch(_){}
}
function diarioFiltrato(){
  const q=_normQ(_qDiario).trim();
  if(!q) return S.diary||[];
  return (S.diary||[]).filter(e=>_testoCercabile(e).indexOf(q)>=0);
}
function _firmaDiario(){
  /* la query ENTRA nella firma. Senza, l'ottimizzazione della v258 - che evita
     di ricostruire il Diario quando i dati non sono cambiati - vedrebbe gli
     stessi dati e si rifiuterebbe di ridisegnare: si digiterebbe nel campo e
     non succederebbe niente. L'ottimizzazione resta intatta, e adesso sa che
     anche «cosa sto guardando» fa parte di cosa c'e da disegnare. */
  try{ return JSON.stringify([S.diary,S.capitoli,S.semi,S.settings,todayKey(),_qDiario]); }catch(_){ return null; }
}
function renderDiary(forza){
  const el0=document.querySelector('#list-diario');
  const firma=_firmaDiario();
  if(!forza&&firma!=null&&firma===_diarioFirma&&el0&&el0.children.length){
    /* i capitoli li disegna S.capitoli, che sta DENTRO la firma: se la firma non
       e cambiata, nemmeno loro. Rifarli qui sarebbe rifare per abitudine. */
    return;
  }
  _diarioFirma=firma;
  const _q=String(_qDiario||'').trim();
  const _voci=diarioFiltrato();
  try{ document.body.classList.toggle('d-cercando',!!_q); }catch(_){}
  try{ const es=document.querySelector('#d-cerca-esito');
    if(es) es.textContent=_q?(_voci.length?(_voci.length+(_voci.length===1?' voce':' voci')+' con «'+_q+'»'):''):''; }catch(_){}
  if(!_q){ try{ renderCapitoli(); }catch(_){} }
  const el=document.querySelector('#list-diario');
  if(_q&&!_voci.length){
    /* non si passa da setEmpty: quello nasconde l'azione dopo il primo giorno
       di cammino, ed e giusto per gli inviti - ma «cancella la ricerca» non e
       un invito, e la via d'uscita da un vicolo cieco, e deve esserci sempre. */
    el.innerHTML='<p class="empty">Nessuna voce contiene \u00ab'+escapeHtml(_q)+
      '\u00bb.<button class="empty-go" id="d-cerca-vuoto">Cancella la ricerca</button></p>';
    const b=el.querySelector('#d-cerca-vuoto');
    if(b) b.onclick=()=>{ try{ diarioCerca(''); }catch(_){} };
    return;
  }
  if(!S.diary.length){
    /* qui «parla» resta vero anche senza chiave: la nota si salva comunque, ed e
       proprio quello che il diario fa. La stanza della sera e l'altra porta. */
    setEmpty(el,'Il diario e vuoto. Non va riempito: va lasciato dietro ogni azione vera.','speak','Registra la prima nota'); return; }
  el.innerHTML='';
  /* v182 (Fase 9): il giorno si scriveva su OGNI voce. Con centosedici voci lo
     stesso «1 marzo» tornava sei volte di fila, e il diario sembrava un elenco
     di ricevute invece che di giornate. Ora la data si dice una volta sola, in
     testa al gruppo, e resta appiccicata in alto mentre scorri quel giorno. */
  let _giornoIn=null, _nEntry=0;
  /* da qui in giu si disegna _voci, che senza ricerca E S.diary */
  const _chiaveGiorno=e=>{ try{ return localDayKey(new Date(e.iso)); }catch(_){ return e.data||''; } };
  /* la giornata di Sentiero comincia all'alba (ALBA_MS), non a mezzanotte: quello
     che scrivi alle due di notte sta sotto il giorno prima, ed e giusto. Ma senza
     dirlo un «00:32» sotto «venerdi 28 febbraio» sembra uno sbaglio. */
  const _notte=d=>{ try{
    const cal=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return localDayKey(d)!==cal;      /* la definizione, non un giro di date: la voce
                                         sta in un giorno di Sentiero diverso dal suo
                                         giorno di calendario. Confrontare i numeri
                                         con la chiave del gruppo ne mancava due su
                                         nove e non sapevo dire perche. */
  }catch(_){ return false; } };
  _voci.forEach(e=>{
    const _k=_chiaveGiorno(e);
    if(_k&&_k!==_giornoIn){
      _giornoIn=_k;
      const t=document.createElement('div'); t.className='d-giorno';
      /* v183: prima usciva «1 sabato agosto», che non si legge. La grammatica
         giusta l'app ce l'ha gia nella sua testata - SABATO sopra, poi il numero
         grande e il mese in corsivo - e questa intestazione e la stessa cosa, un
         piano piu giu. _stanzaNomeGiorno da «sabato 1 marzo»: si prendono i tre
         pezzi e si rimettono in quell'ordine, invece di ritagliare a stringhe. */
      const _pz=_stanzaNomeGiorno(_k).split(' ');
      t.innerHTML='<span class="dg-num">'+escapeHtml(_pz[1]||'')+'</span>'+
        '<span class="dg-mo">'+escapeHtml(_pz[2]||'')+'</span>'+
        '<span class="dg-dow">'+escapeHtml(_pz[0]||'')+'</span>';
      el.appendChild(t);
    }
    const div=document.createElement('div'); div.className='entry';
    /* la scaletta d'entrata stava su .entry:nth-child, che conta TUTTI i fratelli:
       con le intestazioni in mezzo si sarebbe spostata di uno. Qui si dichiara. */
    if(_nEntry<6) div.style.animationDelay=(0.02+_nEntry*0.05).toFixed(2)+'s';
    _nEntry++;
    const d=new Date(e.iso);
    const txt=e.raw||e.testo;
    const born=Array.isArray(e.born)?e.born:[];
    const done=Array.isArray(e.done)?e.done:[];
    const giorno=d.getDate();
    const mese=d.toLocaleDateString(locale(),{month:'short'}).replace('.','');
    const dow=d.toLocaleDateString(locale(),{weekday:'long'});
    const ora=d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
    if(e.lascito){
      /* la voce dell'osservatrice: sta nel diario come tutte, ma si riconosce.
         Il bottone dona: e la meta del suo mestiere, «da custodire e magari
         donare a una sola persona». */
      div.classList.add('lascito');
      div.innerHTML=
        '<div class="entry-date"><span class="ed-meta">l’osservatrice · '+ora+'</span></div>'+
        '<p class="lasc-txt">'+escapeHtml(txt)+'</p>'+
        '<div class="lasc-piede"><button class="lasc-dona">Dona</button></div>';
      const bd=div.querySelector('.lasc-dona');
      if(bd) bd.onclick=(ev)=>{ ev.stopPropagation(); condividiLascito(txt); };
    } else if(e.seme){
      div.classList.add('seme');
      const stS=((S.semi||[]).find(s=>s.id===e.seme)||{}).stato||'piantato';
      div.innerHTML=
        '<div class="entry-date">'+
          '<span class="ed-meta">seme '+(stS==='risposto'?'\u00b7 risposta raccolta':'\u00b7 tocca per rispondere a voce')+'</span>'+
        '</div>'+
        '<p class="seme-q">'+escapeHtml(txt)+'</p>';
      if(stS!=='risposto') div.onclick=()=>{ try{ semeRispondiUI(e.seme,txt); }catch(_){} };
    } else div.innerHTML=
      '<div class="entry-date">'+
        '<span class="ed-meta">'+ora+(_notte(d)?' \u00b7 notte':'')+
          (e.pos?' · <a class="posa" href="'+mapsUrl(e.pos)+'" target="_blank" rel="noopener">dov\u2019ero</a>':'')+
        '</span>'+
      '</div>'+
      (e.dom?'<p class="entry-dom">'+escapeHtml(e.dom)+'</p>':'')+
      '<p>'+escapeHtml(txt)+'</p>'+
      (born.length?'<p class="tags born-t">✦ '+born.map(escapeHtml).join(' · ')+'</p>':'')+
      (done.length?'<p class="tags done-t">✓ '+done.map(escapeHtml).join(' · ')+'</p>':'');
    /* eliminazione a due tocchi: una voce di diario e irripetibile, un tocco solo non basta */
    const del=document.createElement('button');
    del.className='e-del'; del.setAttribute('aria-label','Elimina la voce'); del.innerHTML='&#215;';
    let armTimer=null;
    del.onclick=(ev)=>{
      ev.stopPropagation();
      if(!del.classList.contains('armed')){
        del.classList.add('armed'); del.textContent='Elimina?';
        armTimer=setTimeout(()=>{ del.classList.remove('armed'); del.innerHTML='&#215;'; },3000);
        return;
      }
      clearTimeout(armTimer);
      /* l'addio: esala di lato (14 frame), poi lo spazio si chiude (13), poi lo stato */
      try{
        const riga=div;
        riga.classList.add('via-entry');
        setTimeout(()=>{ try{
          riga.style.height=riga.offsetHeight+'px'; riga.classList.add('chiudi');
          void riga.offsetWidth;
          riga.style.height='0px'; riga.style.paddingTop='0px'; riga.style.paddingBottom='0px';
        }catch(_){} },230);
        setTimeout(()=>{ S.diary=S.diary.filter(x=>x!==e); save(); renderDiary(); toast('Voce eliminata'); },470);
      }catch(_){
        S.diary=S.diary.filter(x=>x!==e); save(); renderDiary(); toast('Voce eliminata');
      }
    };
    div.appendChild(del);
    el.appendChild(div);
  });

  /* v195 — la porta della distillazione, in fondo. Compare solo se il periodo
     ha sostanza: se non c'e materiale non c'e nemmeno l'invito. E non ricompare
     se lo scritto di questo periodo e gia stato fatto: un lascito alla volta. */
  try{
    const giorni=_distillaMateriale();
    const giaFatto=(S.diary||[]).some(x=>x&&x.lascito&&
      Math.round((new Date(todayKey()+'T12:00:00')-new Date(x.iso))/86400000)<=29);
    if(giorni>=DISTILLA_MINIMI && !giaFatto){
      const box=document.createElement('div'); box.id='distilla';
      box.innerHTML='<p class="dst-inv">Gli ultimi giorni hanno lasciato qualcosa. '+
        'Vuoi che li rilegga e ne scriva una cosa sola?</p>'+
        '<button id="btn-distill">Distilla questo periodo</button>';
      const b=box.querySelector('#btn-distill');
      if(b) b.onclick=()=>{ const pr=distillaPeriodo(b);
        if(pr&&pr.catch) pr.catch(function(err){ try{ regCantiere('errore',
          {msg:'distilla: '+String((err&&err.message)||err).slice(0,140)}); }catch(_){} }); };
      el.appendChild(box);
    }
  }catch(_){}
}

/* ======================================================================
   IMPOSTAZIONI
   ====================================================================== */
let newDays=[0,1,2,3,4,5,6];
let _ricMod=null;   /* v258: quale cosa ricorrente si sta cambiando */
/* ══ v271 — LE QUEST SBLOCCABILI: il pannello ══════════════════════════════ */
let _unlMod=null;        /* quale regola si sta cambiando */
let _unlReq=[];          /* i prerequisiti scelti: {tipo,id}, da uno a tre */
let _unlModo='una-volta';
function _unlChiave(r){ return r.tipo+':'+r.id; }
function _unlHa(t,id){ return _unlReq.some(r=>r.tipo===t&&r.id===id); }
function _unlToggle(t,id){
  const i=_unlReq.findIndex(r=>r.tipo===t&&r.id===id);
  if(i>=0){ _unlReq.splice(i,1); }
  else{
    if(_unlReq.length>=3){ try{ toast('Al massimo tre prerequisiti'); }catch(_){} return; }
    _unlReq.push({tipo:t,id:id});
  }
  renderUnlock();
}
function _unlModoVai(m){
  _unlModo=(m==='ogni-giorno')?'ogni-giorno':'una-volta';
  try{ document.querySelectorAll('#unlock-modo button').forEach(b=>
    b.classList.toggle('on',b.dataset.modo===_unlModo)); }catch(_){}
}
function _unlFine(){
  _unlMod=null; _unlReq=[]; _unlModoVai('una-volta');
  try{ document.querySelector('#unlock-txt').value=''; }catch(_){}
  renderUnlock();
}
function renderUnlock(){
  try{
    /* la regola che si stava cambiando puo essere sparita: stessa guardia dei
       rituali, stessa ragione - un id che non esiste piu lascia il pannello in
       uno stato che non si riesce piu a chiudere. */
    if(_unlMod&&!(S.unlockRules||[]).some(r=>r&&r.id===_unlMod)) _unlMod=null;
    const lista=document.querySelector('#list-unlock');
    if(lista){
      lista.innerHTML='';
      const rr=S.unlockRules||[];
      if(!rr.length){
        lista.innerHTML='<p class="note" style="margin:0">Nessuna ancora.</p>';
      } else rr.forEach(r=>{
        const div=document.createElement('div');
        div.className='item imp'+(_unlMod===r.id?' in-modifica':'');
        const pezzi=(r.req||[]).map(q=>{
          const manca=reqMancante(S,q);
          return '<span class="'+(manca?'unl-manca':'')+'">'+escapeHtml(reqNome(S,q))+(manca?' (tolto)':'')+'</span>';
        }).join(' + ');
        const modo=(r.modo==='ogni-giorno')?'ogni giorno':'una volta';
        div.innerHTML='<span class="txt">'+escapeHtml(r.titolo)+
          '<span class="meta">'+pezzi+' · '+modo+(_unlMod===r.id?' · la stai cambiando':'')+
          '</span></span><button class="del" aria-label="Elimina">&#215;</button>';
        div.querySelector('.txt').onclick=()=>{ if(_unlMod===r.id) _unlFine(); else _unlModifica(r.id); };
        div.querySelector('.del').onclick=()=>{
          const prima=(S.unlockRules||[]).slice();
          if(_unlMod===r.id) _unlMod=null;
          S.unlockRules=(S.unlockRules||[]).filter(x=>x!==r); save(); renderUnlock();
          try{ toastAnnulla('Eliminata','Rimettila',()=>{ S.unlockRules=sanitizeUnlockRules(prima); save(); renderUnlock(); }); }catch(_){}
        };
        lista.appendChild(div);
      });
    }
    /* I PREREQUISITI SCEGLIBILI: le cose che si ripetono, e le quest aperte.
       Sono le sole cose spuntabili di Sentiero, quindi sono le sole che possono
       essere una condizione. Si salvano per RIFERIMENTO - tipo e id - non per
       copia: cambiare domani il titolo del rituale non rompe la regola. */
    const box=document.querySelector('#unlock-req');
    if(box){
      box.innerHTML='';
      const voci=[]
        .concat(((S.scheduled||[]).map(t=>({tipo:'task',id:t.id,titolo:t.titolo}))))
        .concat(((S.quests||[]).filter(q=>q&&!q.fatto).map(q=>({tipo:'quest',id:q.id,titolo:q.titolo}))));
      if(!voci.length){
        box.innerHTML='<p class="note" style="margin:0">Prima crea qualcosa di spuntabile: una cosa che si ripete, o una quest.</p>';
      } else voci.forEach(v=>{
        const b=document.createElement('button');
        b.type='button';
        b.className='unl-req'+(_unlHa(v.tipo,v.id)?' on':'');
        b.innerHTML='<span class="unl-box"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>'+
          '<span class="unl-t"></span><span class="unl-kind">'+(v.tipo==='task'?'si ripete':'quest')+'</span>';
        b.querySelector('.unl-t').textContent=v.titolo||'';
        b.onclick=()=>_unlToggle(v.tipo,v.id);
        box.appendChild(b);
      });
    }
    const ba=document.querySelector('#btn-add-unlock');
    if(ba) ba.textContent=_unlMod?'Salva le modifiche':'Aggiungi';
    const an=document.querySelector('#btn-annulla-unlock');
    if(an) an.classList.toggle('hidden',!_unlMod);
  }catch(_){}
}
function _unlModifica(id){
  const r=(S.unlockRules||[]).find(x=>x&&x.id===id); if(!r) return;
  _unlMod=id;
  _unlReq=(r.req||[]).map(q=>({tipo:q.tipo,id:q.id}));
  _unlModoVai(r.modo);
  try{ document.querySelector('#unlock-txt').value=r.titolo||''; }catch(_){}
  renderUnlock();
  try{ haptic(); }catch(_){}
  try{ document.querySelector('#unlock-txt').scrollIntoView({block:'center',behavior:'smooth'}); }catch(_){}
}
function _unlSalva(){
  const inp=document.querySelector('#unlock-txt');
  const txt=String((inp&&inp.value)||'').trim();
  if(!txt) return toast('Scrivi il titolo della quest');
  if(!_unlReq.length) return toast('Scegli almeno un prerequisito');
  const base={titolo:txt,req:_unlReq.slice(0,3),modo:_unlModo,prio:2};
  if(_unlMod){
    S.unlockRules=sanitizeUnlockRules((S.unlockRules||[]).map(x=>
      x&&x.id===_unlMod?Object.assign({},x,base):x));
  } else {
    S.unlockRules=sanitizeUnlockRules([...(S.unlockRules||[]),
      Object.assign({id:uid(),nata:todayKey()},base)]);
  }
  const eraMod=_unlMod;
  _unlFine();
  save();
  /* cambiata la regola, la condizione potrebbe essere gia vera adesso */
  try{ sbloccaOra('regola'); }catch(_){}
  toast(eraMod?'Cambiata':'Regola aggiunta');
}
let _settingsPage='',_pairToken='',_pairInvite='',_pairReady=false;
const SETTINGS_TITLES={devices:'Dispositivi',experience:'Esperienza',gemini:'Versione Generativa',planning:'Pianificazione',language:'Lingua',data:'Dati e backup',help:'Guida e privacy',audio:'Suoni'};
function apriSettingsPage(page){
  _settingsPage=SETTINGS_TITLES[page]?page:'';
  const home=document.querySelector('#settings-home'),back=document.querySelector('#settings-back'),title=document.querySelector('#settings-title');
  if(home) home.classList.toggle('hidden',!!_settingsPage);
  if(back) back.classList.toggle('hidden',!_settingsPage);
  if(title) title.textContent=_settingsPage?SETTINGS_TITLES[_settingsPage]:'Altro';
  document.querySelectorAll('#tab-impostazioni [data-settings-page]').forEach(s=>s.classList.toggle('settings-page-active',s.dataset.settingsPage===_settingsPage));
  try{ const m=document.querySelector('#app>main'); if(m) m.scrollTop=0; }catch(_){}
  if(_settingsPage==='devices') caricaSentieroSync().then(()=>renderSyncPanel(true)).catch(()=>{});
}
function _syncQuando(ms){ if(!ms)return 'Mai sincronizzato'; try{return 'Ultimo aggiornamento '+new Date(ms).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch(_){return 'Ultimo aggiornamento disponibile';} }
async function renderSyncDevices(){
  const el=document.querySelector('#sync-devices'); if(!el||!window.SentieroSync||!window.SentieroSync.info().enabled)return;
  try{
    const own=window.SentieroSync.info(),list=await window.SentieroSync.listDevices(); el.innerHTML='';
    list.forEach(d=>{ const row=document.createElement('div'); row.className='sync-device';
      const revoked=!!d.revoked_at,mine=d.id===own.deviceId;
      row.innerHTML='<span><b>'+escapeHtml(d.name||'Dispositivo')+(mine?' · questo':'')+'</b><small>'+(revoked?'Revocato':_syncQuando(d.last_seen))+'</small></span>'+(revoked||mine?'':'<button aria-label="Revoca dispositivo">Revoca</button>');
      const b=row.querySelector('button'); if(b)b.onclick=async()=>{ if(!confirm('Revocare «'+String(d.name||'questo dispositivo')+'»? Non potrà più sincronizzare.'))return; await window.SentieroSync.revokeDevice(d.id); renderSyncDevices(); };
      el.appendChild(row);
    });
  }catch(_){ el.innerHTML='<p class="note">Elenco non raggiungibile. Le modifiche locali restano in coda.</p>'; }
}
function renderSyncPanel(loadDevices){
  if(!window.SentieroSync)return; const x=window.SentieroSync.info();
  const name=document.querySelector('#sync-name'),endpoint=document.querySelector('#sync-endpoint');
  document.querySelector('#sync-device-name').textContent=x.deviceName||'Questo dispositivo';
  document.querySelector('#sync-state').textContent=x.status+(x.pending?(' · '+x.pending+' in coda'):'');
  document.querySelector('#sync-last').textContent=x.enabled?_syncQuando(x.lastSync):'Le modifiche restano locali e funzionano offline.';
  if(name&&document.activeElement!==name) name.value=x.deviceName||'';
  if(endpoint&&document.activeElement!==endpoint) endpoint.value=x.endpoint||'';
  document.querySelector('#sync-enable').textContent=x.enabled?'Aggiorna nome':'Attiva sincronizzazione';
  document.querySelector('#sync-now').classList.toggle('hidden',!x.enabled);
  document.querySelector('#sync-enabled-tools').classList.toggle('hidden',!x.enabled);
  if(loadDevices&&x.enabled) renderSyncDevices();
}
function _b64urlText(text){ const bytes=new TextEncoder().encode(text); let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _fromB64url(text){ let s=String(text||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return new TextDecoder().decode(a); }
function _inviteUrl(payload){ const u=new URL(location.href); u.hash='';u.search='';u.searchParams.set('sentieroPair',_b64urlText(payload));return u.toString(); }
function _invitePayload(text){
  const t=String(text||'').trim(); if(!t)throw new Error('EMPTY');
  if(t[0]==='{')return t;
  const u=new URL(t); const p=u.searchParams.get('sentieroPair'); if(!p)throw new Error('CODE'); return _fromB64url(p);
}
let _qrLoader=null;
function _loadQr(){
  if(typeof qrcode==='function')return Promise.resolve(); if(_qrLoader)return _qrLoader;
  _qrLoader=new Promise((ok,no)=>{const s=document.createElement('script');s.src='./vendor/qrcode.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});return _qrLoader;
}
let _qrReaderLoader=null;
function _loadQrReader(){
  if(typeof jsQR==='function')return Promise.resolve();if(_qrReaderLoader)return _qrReaderLoader;
  _qrReaderLoader=new Promise((ok,no)=>{const s=document.createElement('script');s.src='./vendor/jsQR.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});return _qrReaderLoader;
}
async function _drawPairQr(text){
  await _loadQr(); const canvas=document.querySelector('#pair-qr'); if(!canvas||typeof qrcode!=='function')throw new Error('QR');
  const qr=qrcode(0,'M'); qr.addData(text);qr.make(); const n=qr.getModuleCount(),quiet=4,cell=Math.max(2,Math.floor(232/(n+quiet*2))),size=(n+quiet*2)*cell;
  canvas.width=canvas.height=size; const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,size,size);c.fillStyle='#000';
  for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))c.fillRect((col+quiet)*cell,(r+quiet)*cell,cell,cell);
}
async function _leggiQrFile(file){
  if(!file)throw new Error('QR_EMPTY');
  let bmp=null;
  try{bmp=await createImageBitmap(file);}catch(_){
    bmp=await new Promise((ok,no)=>{const img=new Image(),u=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(u);ok(img);};img.onerror=()=>{URL.revokeObjectURL(u);no(new Error('QR_IMAGE'));};img.src=u;});
  }
  try{
    if('BarcodeDetector' in window){
      try{const codes=await new BarcodeDetector({formats:['qr_code']}).detect(bmp);if(codes.length&&codes[0].rawValue)return codes[0].rawValue;}catch(_){}
    }
    await _loadQrReader();
    const ow=bmp.width||bmp.naturalWidth,oh=bmp.height||bmp.naturalHeight,max=1600,scale=Math.min(1,max/Math.max(ow,oh)),w=Math.max(1,Math.round(ow*scale)),h=Math.max(1,Math.round(oh*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,w,h);
    const found=jsQR(x.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'attemptBoth'});if(found&&found.data)return found.data;
  }finally{try{if(bmp&&bmp.close)bmp.close();}catch(_){}}
  throw new Error('QR_EMPTY');
}
function _syncMessage(text){ const p=document.querySelector('#pair-status');if(p)p.textContent=text; }

try{
  document.querySelectorAll('[data-settings-open]').forEach(b=>b.onclick=()=>apriSettingsPage(b.dataset.settingsOpen));
  document.querySelector('#settings-back').onclick=()=>apriSettingsPage('');
  document.querySelector('#sync-enable').onclick=async()=>{
    const b=document.querySelector('#sync-enable'),endpoint=document.querySelector('#sync-endpoint').value.trim(),name=document.querySelector('#sync-name').value.trim();
    b.disabled=true;
    try{
      const x=window.SentieroSync.info();
      if(x.enabled){ if(name&&name!==x.deviceName){ await window.SentieroSync.renameDevice(x.deviceId,name); } toast('Nome dispositivo aggiornato'); }
      else { if(!/^https:\/\//i.test(endpoint))throw new Error('Serve un indirizzo HTTPS'); await window.SentieroSync.createSpace(endpoint,name); toast('Sincronizzazione attiva'); }
      renderSyncPanel(true);
    }catch(e){toast(String(e&&e.message||'Server non raggiungibile'));}finally{b.disabled=false;}
  };
  document.querySelector('#sync-now').onclick=async()=>{ await window.SentieroSync.syncNow();renderSyncPanel(true); };
  document.querySelector('#sync-delete').onclick=async()=>{if(!confirm('Eliminare dal server tutto il journal sincronizzato e revocare tutti i dispositivi? I dati locali resteranno qui.'))return;try{await window.SentieroSync.deleteSpace();toast('Dati sincronizzati eliminati');renderSyncPanel(false);}catch(_){toast('Eliminazione non riuscita');}};
  document.querySelector('#pair-create').onclick=async()=>{
    try{ const r=await window.SentieroSync.createPairing();_pairToken=r.token;_pairInvite=_inviteUrl(r.payload);_pairReady=false;
      document.querySelector('#pair-code').textContent=_pairInvite;document.querySelector('#pair-invite').classList.remove('hidden');await _drawPairQr(_pairInvite);_syncMessage('Invito pronto · scade tra dieci minuti.');
    }catch(e){toast('Non riesco a creare l’invito');}
  };
  document.querySelector('#pair-copy').onclick=async()=>{try{await navigator.clipboard.writeText(_pairInvite);toast('Codice copiato');}catch(_){toast('Seleziona e copia il codice');}};
  document.querySelector('#pair-approve').onclick=async()=>{
    try{
      if(!_pairReady){ const s=await window.SentieroSync.pairingStatus(_pairToken);if(s.status!=='pending-confirmation')return _syncMessage('Apri l’invito sull’altro dispositivo, poi riprova.');_pairReady=true;_syncMessage('Confronta il codice '+s.confirmationCode+' su entrambi i dispositivi. Se coincide, tocca di nuovo Approva.');document.querySelector('#pair-approve').textContent='Conferma e approva';return; }
      await window.SentieroSync.approvePairing(_pairToken);_syncMessage('Dispositivo approvato.');renderSyncDevices();
    }catch(e){_syncMessage('Approvazione non riuscita o invito scaduto.');}
  };
  document.querySelector('#pair-scan').onclick=()=>document.querySelector('#pair-image').click();
  document.querySelector('#pair-image').onchange=async e=>{try{const t=await _leggiQrFile(e.target.files&&e.target.files[0]);document.querySelector('#pair-paste').value=t;}catch(err){toast(err&&err.message==='QR_UNSUPPORTED'?'Questo browser non legge QR: incolla il codice':'QR non leggibile');}e.target.value='';};
  document.querySelector('#pair-redeem').onclick=async()=>{try{const p=_invitePayload(document.querySelector('#pair-paste').value),parsed=JSON.parse(p),host=new URL(parsed.endpoint).host;if(!confirm('Collegare questo dispositivo al servizio '+host+'? Al termine i dati Sentiero presenti qui saranno sostituiti dallo spazio collegato; una copia locale pre-pairing verrà conservata.'))return;const r=await window.SentieroSync.redeemPairing(parsed,document.querySelector('#sync-name').value);_syncMessage('Confronta il codice '+r.confirmationCode+' sul dispositivo che ti invita, poi attendi l’approvazione.');toast('Richiesta inviata');}catch(e){toast('Codice non valido, già usato o scaduto');}};
  document.querySelector('#pair-finish').onclick=async()=>{try{const r=await window.SentieroSync.finishPairing();if(r&&r.status&&r.status!=='approved')return _syncMessage('In attesa dell’approvazione sull’altro dispositivo.');_syncMessage('Dispositivo collegato.');renderSyncPanel(true);}catch(e){_syncMessage(e&&e.message==='PAIR_BACKUP'?'Spazio locale insufficiente per la copia di sicurezza: fai un Backup completo e libera spazio.':'In attesa oppure invito scaduto.');}};
  const _urlPair=new URL(location.href).searchParams.get('sentieroPair'); if(_urlPair)setTimeout(()=>{try{navVai('altro','pair');apriSettingsPage('devices');document.querySelector('#pair-paste').value=_inviteUrl(_fromB64url(_urlPair));}catch(_){}},350);
}catch(_){}

function renderSettings(){
  try{ if(_ricMod&&!(S.scheduled||[]).some(x=>x&&x.id===_ricMod)) _ricMod=null; }catch(_){}
  /* v253 — non si ricostruisce un pannello che nessuno sta guardando.
     renderSettings rifa la lingua, i segmenti, gli interruttori, i rituali e i
     suoni: otto cicli. Girava a ogni spunta, anche col pannello chiuso. */
  /* v270.1 — leggere la classe del vecchio pannello era vero-per-sempre o
     falso-per-sempre: tolta la classe, il cancello restava aperto. La domanda
     giusta non e «che classe porti», e «sono li dentro?»: lo sa la navigazione. */
  try{ if(typeof NAV!=='undefined'&&NAV&&NAV.corrente!=='altro'&&!_forzaSettings) return; }catch(_){}
  /* v207 — I DUE LIVELLI, CHIAMATI PER NOME.
     Il livello base non si chiama «Sentiero Free» ne «Sentiero Lite»: si chiama
     Sentiero. E l'altra ad essere una variante, non questa ad essere una
     mancanza. Fino alla v206 l'app diceva a chi non aveva la chiave «IA spenta:
     manca la chiave», cioe gli diceva che gli mancava qualcosa mentre gli stava
     dando tutto quello che ha. */
  try{ renderLingua(); }catch(_){}
  document.querySelector('#version-line').textContent=nomeLivello()+' '+APP_VERSION;
  document.querySelector('#gemini-key').value=GEMINI_KEY;
  document.querySelector('#sw-sound').classList.toggle('on',S.settings.sound);
  document.querySelector('#sw-music').classList.toggle('on',!!S.settings.music);
  const mn=document.querySelector('#music-note');
  if(mn) mn.textContent=S.settings.music
    ? 'La musica usa campioni locali e sale con le quest rimaste; tace quando il cerchio si chiude. In questa modalità suoni normali, voce e suoni personali restano in pausa.'
    : '';
  document.querySelector('#sw-voice').classList.toggle('on',S.settings.voice);
  { const sw=document.querySelector('#sw-obsline'); if(sw) sw.classList.toggle('on',S.settings.obsLine!==false); }
  document.querySelectorAll('#seg-genere button').forEach(b=>b.classList.toggle('on',b.dataset.genere===(S.settings.genere||'')));
  try{ renderBanco(); const bn=document.querySelector('#banco-note');
    if(bn&&!bn.textContent){ const n=bancoPacchetti().length; bn.textContent=n?(n+' pacchetti conservati, pronti da rigiocare.'):'Nessun pacchetto conservato ancora.'; } }catch(_){}
  document.querySelector('#sw-notif').classList.toggle('on',S.settings.notif);
  document.querySelector('#sw-geo').classList.toggle('on',S.settings.geo);
  document.querySelectorAll('#seg-theme button').forEach(b=>b.classList.toggle('on',b.dataset.theme===S.settings.theme));
  document.querySelectorAll('#seg-uitheme button').forEach(b=>b.classList.toggle('on',b.dataset.uitheme===(S.settings.uiTheme||'classico')));
  document.querySelectorAll('#seg-anim button').forEach(b=>b.classList.toggle('on',b.dataset.anim===(S.settings.anim||'auto')));
  applyTheme();

  try{ const n=document.querySelector('#gemini-usage-note'); if(n){
    const tk=todayKey(), rr=(S.registro||[]).filter(e=>e&&e.tipo==='gemini'&&String(e.t||'').slice(0,10)===tk);
    const ok=rr.filter(e=>e.msg==='ok').length, api=rr.reduce((n,e)=>n+(Number.isFinite(e.api)?e.api:0),0);
    const cs=_aiRateChainState(aiModels('observer'));
    n.textContent=rr.length?('Oggi: '+api+' richieste Gemini · '+ok+' riuscite'+(cs.blocked?(' · quota in pausa ~'+_aiRateHuman(cs.waitMs)) : ''))
      :'Oggi: nessuna richiesta Gemini'+(cs.blocked?(' · quota in pausa ~'+_aiRateHuman(cs.waitMs)):'');
  } }catch(_){}
  const mdl=(S.settings.aiModel)||'balanced';
  document.querySelectorAll('#seg-model button').forEach(b=>b.classList.toggle('on',b.dataset.model===mdl));
  const mnote=document.querySelector('#model-note');
  /* Gemini: la nota dice la catena vera,
     quella che parte davvero: se lo schermo mente sul motore, la telemetria non serve a niente. */
  if(mnote) mnote.textContent={
    max:'Massimo: 3.7 Flash parte per primo. Per le foto puo continuare oltre il minuto in background fino a circa tre minuti e mezzo; Flash-Lite resta il ripiego.',
    balanced:'Bilanciato: Flash-Lite parte per primo e 3.7 Flash interviene se serve; le foto restano ad alta risoluzione.',
    fast:'Veloce: solo Flash-Lite, meno ragionamento e foto a risoluzione media per ridurre attesa e consumo.'}[mdl];
  /* lista suoni personalizzati */
  const sfxEl=document.querySelector('#list-sfx');
  if(!SFX.length){ sfxEl.innerHTML='<p class="empty">Nessun suono caricato: combo e sigillo usano il tema sonoro.</p>'; }
  else{
    sfxEl.innerHTML='';
    SFX.forEach((s,i)=>{
      const div=document.createElement('div'); div.className='item imp';
      div.innerHTML='<span class="txt">Livello '+(i+1)+(i===SFX.length-1?' + sigillo':'')+'<span class="meta">'+escapeHtml(s.name)+'</span></span><button class="del">×</button>';
      div.querySelector('.txt').onclick=()=>playSFX(i); /* tocca per riascoltare */
      div.querySelector('.del').onclick=()=>{ SFX.splice(i,1); saveSFX(); renderSettings(); };
      sfxEl.appendChild(div);
    });
  }
  document.querySelector('#btn-addsfx').textContent=SFX.length>=SFX_MAX_N?'Massimo 8 suoni':'Aggiungi suono (livello '+(SFX.length+1)+')';
  document.querySelector('#btn-addsfx').disabled=SFX.length>=SFX_MAX_N;
  try{ renderSoundEvents(); }catch(_){}   /* lista eventi dei Suoni dell'app */
  const dd=document.querySelector('#new-task-days'); dd.innerHTML='';
  DAYS_IT.forEach((lbl,i)=>{
    const b=document.createElement('button');
    b.textContent=lbl; b.type='button';
    b.className=newDays.includes(i)?'on':'';
    b.onclick=()=>{ newDays=newDays.includes(i)?newDays.filter(x=>x!==i):[...newDays,i]; renderSettings(); };
    dd.appendChild(b);
  });
  { /* v258: il bottone dice se aggiunge o se salva una modifica, e mentre si
       modifica compare il modo di tirarsi indietro. */
    const ba=document.querySelector('#btn-addtask');
    if(ba) ba.textContent=_ricMod?'Salva le modifiche':'Aggiungi';
    try{ renderUnlock(); }catch(_){}   /* v271 */
    const an=document.querySelector('#btn-annulla-mod');
    if(an) an.classList.toggle('hidden',!_ricMod); }
  const el=document.querySelector('#list-sched');
  if(!S.scheduled.length){ el.innerHTML='<p class="empty">Niente di ricorrente ancora: aggiungi qui sotto.</p>'; }
  else{
    el.innerHTML='';
    S.scheduled.forEach(t=>{
      const div=document.createElement('div');
      /* v258: «imp» dice che questa riga sta nelle impostazioni, dove la × deve
         VEDERSI. Nel mondo si scopre scorrendo, e li ha senso: la riga si spunta
         cento volte e si cancella una. Qui e il posto in cui si viene apposta
         per togliere una cosa, e nasconderla e stato un errore di sei versioni. */
      div.className='item imp'+(_ricMod===t.id?' in-modifica':'');
      let quando;
      if(t.date){
        const d=new Date(t.date+'T12:00:00');
        quando=(t.repeat==='yearly')
          ? ('ogni anno · '+d.toLocaleDateString(locale(),{day:'numeric',month:'long'}))
          : d.toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'});
      } else {
        quando=t.days.length===7?'ogni giorno':t.days.map(i=>DAYS_IT[i]).join(' ');
      }
      const _calT=t.date?'<button class="cal" aria-label="Aggiungi al calendario"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></button>':'';
      div.innerHTML='<span class="txt">'+escapeHtml(t.titolo)+'<span class="meta">'+quando+(t.time?' · '+t.time:'')+(_ricMod===t.id?' · la stai cambiando':'')+'</span></span>'+_calT+'<button class="del" aria-label="Elimina">&#215;</button>';
      div.querySelector('.txt').onclick=()=>{ if(_ricMod===t.id) fineModifica(); else modificaRicorrente(t.id); };
      { const _cb=div.querySelector('.cal');
        if(_cb) _cb.onclick=e=>{ e.stopPropagation();
          /* la prossima occorrenza, non l'origine: nel calendario si mette la
             data che sta per arrivare, e RRULE ci mette sopra tutti gli anni. */
          addToCalendar({id:t.id,titolo:t.titolo,quando:prossimaOccorrenza(t,todayKey())||t.date,
                         ora:t.time||'',repeat:t.repeat==='yearly'?'yearly':'none'}); }; }
      div.querySelector('.del').onclick=()=>{
        const prima=[...S.scheduled];
        if(_ricMod===t.id) _ricMod=null;
        S.scheduled=S.scheduled.filter(x=>x!==t); save(); renderSettings(); renderTasks(); updateRing();
        /* cancellare e distruttivo: si annulla, come ovunque in questa app */
        toastAnnulla('Eliminata','Rimettila',()=>{ S.scheduled=sanitizeScheduled(prima); save(); renderSettings(); renderTasks(); updateRing(); });
      };
      el.appendChild(div);
    });
  }
}
document.querySelector('#sw-sound').onclick=()=>{ S.settings.sound=!S.settings.sound; save(); renderSettings(); if(S.settings.sound) sAppear(0); };
document.querySelector('#sw-music').onclick=()=>{
  S.settings.music=!S.settings.music; save(); renderSettings();
  if(S.settings.music){
    const remaining=syncAdaptiveMusic(true);   /* gesto utente: sblocca davvero Web Audio su iOS */
    toast(remaining?'Colonna sonora attiva':'Colonna sonora pronta: partirà alla prossima quest');
  } else {
    try{ syncAdaptiveMusic(false); }catch(_){}
    toast('Colonna sonora disattivata');
  }
};
document.querySelectorAll('#seg-theme button').forEach(b=>{
  b.onclick=()=>{
    S.settings.theme=b.dataset.theme==='zen'?'zen':'arcade';
    save(); renderSettings();
    sCheck(3); /* anteprima immediata del nuovo tema */
  };
});
document.querySelectorAll('#seg-model button').forEach(b=>{
  b.onclick=()=>{
    S.settings.aiModel=b.dataset.model;
    save(); renderSettings(); haptic();
    toast(b.dataset.model==='max'?'Motore IA: Gemini 3.7 Flash':b.dataset.model==='fast'?'Motore IA: Flash-Lite':'Motore IA: bilanciato');
  };
});
/* v271.1 — il satellite azzurro non apre piu una scrittura: dice dove sei.
   Stessa funzione del bottone «dove sono», non una seconda copia. */
{ const sa=document.querySelector('#terra-luce'); if(sa) sa.onclick=(e)=>{ e.stopPropagation(); condividiPosizione(); };
  /* ══ v271 — LA RICERCA: aggancio ═══════════════════════════════════════
     «input» e non «keyup»: prende anche l'incolla, il dettato e la × nativa.
     Nessun debounce: il filtro e un indexOf su un array in memoria, e su
     migliaia di voci resta sotto il millisecondo. Un ritardo qui sarebbe
     lentezza aggiunta a mano. */
  const _dc=document.querySelector('#d-cerca');
  if(_dc) _dc.addEventListener('input',()=>diarioCerca(_dc.value));
  if(_dc) _dc.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); diarioCerca(''); _dc.blur(); } });
  const _dx=document.querySelector('#d-cerca-x');
  if(_dx) _dx.onclick=()=>{ diarioCerca(''); try{ const i=document.querySelector('#d-cerca'); if(i) i.focus(); }catch(_){} };
  const tn=document.querySelector('#terra-no'); if(tn) tn.onclick=chiudiTerra;
  const to=document.querySelector('#terra-ok'); if(to) to.onclick=()=>{
    const r=raccogliTerra();
    if(r&&r.catch) r.catch(function(e){ try{ regCantiere('errore',{msg:'raccogliTerra: '+String((e&&e.message)||e).slice(0,120)}); }catch(_){} });
  };
  /* ══ v271 — LE TRE VIE DELLA PAGINA ══════════════════════════════════════
     I due <input type=file> sono nascosti e vengono aperti dal tocco su un
     bottone vero: e il modo in cui iOS apre la fotocamera e la libreria in
     modo nativo, e - punto che conta - NESSUN PERMESSO viene chiesto prima.
     La fotocamera entra in gioco solo dopo il gesto esplicito. */
  const _cam=document.querySelector('#ocr-file-cam'), _lib=document.querySelector('#ocr-file-lib');
  const _apriFile=inp=>{ try{ if(inp){ inp.value=''; inp.click(); } }catch(_){} };
  const _bs=document.querySelector('#ocr-scatta'); if(_bs) _bs.onclick=()=>_apriFile(_cam);
  const _bg=document.querySelector('#ocr-scegli'); if(_bg) _bg.onclick=()=>_apriFile(_lib);
  [_cam,_lib].forEach(inp=>{ if(!inp) return;
    inp.onchange=()=>{ const f=inp.files&&inp.files[0];
      inp.value='';                                  /* il file non resta appeso all'input */
      if(f){ const r=_ocrLeggi(f); if(r&&r.catch) r.catch(()=>{}); } };
  });
  const _bm=document.querySelector('#ocr-mano'); if(_bm) _bm.onclick=()=>{
    _ocrAuto=''; _ocrFase('testo'); _ocrAvviso('');
    try{ const t=document.querySelector('#terra-txt'); if(t){ t.value=''; t.focus(); } }catch(_){}
  };
  const _br=document.querySelector('#ocr-rifai'); if(_br) _br.onclick=()=>{
    _ocrPulisci(); _ocrAvviso('');
    try{ const t=document.querySelector('#terra-txt'); if(t) t.value=''; }catch(_){}
    _ocrFase('scelta');
  };
  const _bst=document.querySelector('#ocr-stop'); if(_bst) _bst.onclick=()=>{
    /* annullare durante la lettura non deve lasciare niente in piedi: la
       richiesta si ferma davvero, e si torna alla scelta. */
    _ocrPulisci(); _ocrAvviso(''); _ocrFase('scelta');
  };
  const bb=document.querySelector('#btn-banco'); if(bb) bb.onclick=()=>{ eseguiBanco(); };
  const bv=document.querySelector('#btn-banco-voci'); if(bv) bv.onclick=()=>{ eseguiBancoVoci(); };
  const bd=document.querySelector('#btn-banco-desiderio'); if(bd) bd.onclick=()=>{ eseguiBancoDesiderio(); }; }
document.querySelectorAll('#seg-genere button').forEach(b=>{
  b.onclick=()=>{ S.settings.genere=b.dataset.genere; save(); renderSettings(); haptic();
    toast(b.dataset.genere==='f'?'Ti parlerà al femminile':'Ti parlerà al maschile'); };
});
document.querySelector('#sw-voice').onclick=()=>{ S.settings.voice=!S.settings.voice; save(); renderSettings(); if(S.settings.voice) say('Voce attiva'); };
document.querySelector('#sw-obsline').onclick=()=>{ S.settings.obsLine=!(S.settings.obsLine!==false); save(); renderSettings(); toast(S.settings.obsLine?'Riga sulle spunte attiva':'Riga sulle spunte spenta'); };
document.querySelector('#sw-geo').onclick=()=>{
  if(!S.settings.geo){
    if(!('geolocation' in navigator)){ toast('Posizione non supportata qui'); return; }
    S.settings.geo=true; save(); renderSettings();
    capturePos(); /* fa apparire subito la richiesta di permesso iOS */
    toast('Da ora le note salvano anche il posto');
  } else {
    S.settings.geo=false; lastPos=null; save(); renderSettings();
    toast('Posizione spenta: le note non la registrano pi\u00f9');
  }
};
document.querySelector('#btn-addsfx').onclick=()=>document.querySelector('#sfx-file').click();
document.querySelector('#sfx-file').onchange=e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  if(f.size>SFX_MAX_FILE){ toast('File troppo grande (max 400 KB): usa la versione .m4r'); return; }
  const total=SFX.reduce((a,s)=>a+s.data.length,0);
  if(total+f.size*1.4>SFX_MAX_TOTAL){ toast('Spazio suoni esaurito: rimuovine qualcuno'); return; }
  const r=new FileReader();
  r.onload=()=>{
    let data=r.result;
    /* iOS rifiuta data-URL senza MIME: i .m4r spesso arrivano senza tipo */
    if(data.startsWith('data:;')||data.startsWith('data:application/octet-stream;')){
      const ext=(f.name.split('.').pop()||'').toLowerCase();
      const mime=ext==='wav'?'audio/wav':ext==='mp3'?'audio/mpeg':'audio/mp4';
      data='data:'+mime+';'+data.split(';').slice(1).join(';');
    }
    SFX.push({name:f.name.slice(0,60),data:data});
    if(saveSFX()){ renderSettings(); playSFX(SFX.length-1); toast('Suono caricato al livello '+SFX.length); }
    else SFX.pop();
  };
  r.onerror=()=>toast('Impossibile leggere il file');
  r.readAsDataURL(f);
};
document.querySelector('#btn-cerchio').onclick=()=>{
  try{ unlockAudioOnUserGesture(); }catch(_){}
  SFX=CERCHIO_SFX.combos.map((d,i)=>({name:'Cerchio '+(i+1),data:d}));
  try{ localStorage.setItem('sentiero-seal-v1',CERCHIO_SFX.seal); }catch(_){}
  _sealBuf=null;
  if(saveSFX()){ S.settings.sound=true; save(); renderSettings(); toast('Suoni Cerchio attivati: 8 livelli + sigillo'); try{ playSFX(0); }catch(_){} }
  else SFX=loadSFX();
};
document.querySelector('#btn-clearsfx').onclick=()=>{ if(!SFX.length){ return; } SFX=[]; saveSFX(); try{ localStorage.removeItem('sentiero-seal-v1'); }catch(_){} _sealBuf=null; renderSettings(); toast('Suoni rimossi: si torna al tema sonoro'); };

/* ======================================================================
   SUONI DELL'APP — "Firma sonora": ogni evento dell'app è uno slot.
   Isolato e reversibile: chiave localStorage propria + IndexedDB per i blob.
   Non tocca il sistema SFX/THEMES esistente. Default di ogni evento = silenzio.
   ====================================================================== */
const SND_LS='sentiero-snd-v1';
const SND_MAX_FILE=2*1024*1024;
const SND_MAX_BASE=8*1024*1024;   /* la canzone di base è un brano: cap più alto */
const SOUND_EVENTS=[
  {id:'baseLoop',       label:'Canzone di base', description:'Suona di continuo, in loop, mentre usi l\'app. La scegli tu (max 8 MB).', category:'base', loop:true},
  {id:'questCompleted', label:'Quest completata', description:'Quando spunti una quest o una task come fatta.', category:'azione'},
  {id:'cerchioChiuso',  label:'Cerchio chiuso', description:'Il suono del giorno completato, quando chiudi tutte le azioni.', category:'rito'},
  {id:'observerReady',  label:'Mente Osservatrice pronta', description:'Quando l\'app genera una nuova osservazione sul tuo comportamento.', category:'mente'},
  {id:'nextMoveReady',  label:'Prossima Mossa pronta', description:'Quando l\'app propone l\'azione concreta da fare adesso.', category:'mente'},
  {id:'appOpened',      label:'Apertura app', description:'All\'avvio dell\'app.', category:'sistema'},
  {id:'questCreated',   label:'Quest creata', description:'Quando nasce una nuova quest.', category:'azione'},
  {id:'questDiscarded', label:'Quest scartata', description:'Quando elimini una quest.', category:'azione'},
  {id:'distillStart',   label:'Distillazione avviata', description:'Quando parte la distillazione del parlato.', category:'diario'},
  {id:'distillSuccess', label:'Distillazione riuscita', description:'Quando la distillazione produce le quest.', category:'diario'},
  {id:'diarySaved',     label:'Diario salvato', description:'Quando una voce di diario viene salvata.', category:'diario'},
  {id:'offlineSaved',   label:'Salvato offline', description:'Quando salvi qualcosa senza connessione.', category:'sistema'},
  {id:'softError',      label:'Errore lieve', description:'Su un errore non bloccante o quando vai offline.', category:'sistema'}
];
function defaultSoundSettings(){ return {audioEnabled:true, masterVolume:1, eventEnabledMap:{}, eventVolumes:{}, eventSoundMap:{}}; }
let SND=loadSoundSettings();
function loadSoundSettings(){
  try{
    const r=JSON.parse(localStorage.getItem(SND_LS)||'null'); const d=defaultSoundSettings();
    if(!r||typeof r!=='object'||Array.isArray(r)) return d;
    return {
      audioEnabled: r.audioEnabled!==false,
      masterVolume: (typeof r.masterVolume==='number'&&r.masterVolume>=0&&r.masterVolume<=1)?r.masterVolume:1,
      eventEnabledMap: (r.eventEnabledMap&&typeof r.eventEnabledMap==='object')?r.eventEnabledMap:{},
      eventVolumes: (r.eventVolumes&&typeof r.eventVolumes==='object')?r.eventVolumes:{},
      eventSoundMap: (r.eventSoundMap&&typeof r.eventSoundMap==='object')?r.eventSoundMap:{}
    };
  }catch(_){ return defaultSoundSettings(); }
}
function saveSoundSettings(){ try{ localStorage.setItem(SND_LS,JSON.stringify(SND)); return true; }catch(_){ return false; } }

/* --- IndexedDB minimale per i blob audio personali --- */
const SND_DB='sentiero-audio', SND_STORE='sounds';
let _sndDbP=null;
function sndDb(){
  if(_sndDbP) return _sndDbP;
  _sndDbP=new Promise((res,rej)=>{
    let req; try{ req=indexedDB.open(SND_DB,1); }catch(e){ rej(e); return; }
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(SND_STORE)) db.createObjectStore(SND_STORE,{keyPath:'id'}); };
    req.onsuccess=()=>res(req.result);
    req.onerror=()=>rej(req.error);
  });
  return _sndDbP;
}
function sndTx(mode,fn){
  return sndDb().then(db=>new Promise((res,rej)=>{
    let tx; try{ tx=db.transaction(SND_STORE,mode); }catch(e){ rej(e); return; }
    const st=tx.objectStore(SND_STORE); let req;
    try{ req=fn(st); }catch(e){ rej(e); return; }
    tx.oncomplete=()=>res(req?req.result:undefined);
    tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error);
  }));
}
function idbPutSound(rec){ return sndTx('readwrite',st=>st.put(rec)); }
function idbGetSound(id){ return sndTx('readonly',st=>st.get(id)).then(r=>r||null); }
function idbDelSound(id){ return sndTx('readwrite',st=>st.delete(id)); }
function idbListSounds(){ return sndTx('readonly',st=>st.getAll()).then(a=>Array.isArray(a)?a:[]); }

/* --- motore di riproduzione (Web Audio: su iOS l'audio va sbloccato da un gesto) --- */
let _actx=null, _audioUnlocked=false; const _bufCache=new Map();
function audioCtx(){ if(!_actx) _actx=sharedAC(); return _actx; }   /* stesso contesto unico degli altri motori */
function unlockAudioOnUserGesture(){
  return;   /* AUDIO SPENTO */
  if(_audioUnlocked) return;
  const ctx=audioCtx(); if(!ctx){ _audioUnlocked=true; return; }
  try{
    if(ctx.state==='suspended') ctx.resume();
    const b=ctx.createBuffer(1,1,22050), s=ctx.createBufferSource(); s.buffer=b; s.connect(ctx.destination); s.start(0);
    _audioUnlocked=true;
  }catch(_){}
}
function decodeSound(soundId){
  if(_bufCache.has(soundId)) return Promise.resolve(_bufCache.get(soundId));
  const ctx=audioCtx(); if(!ctx) return Promise.resolve(null);
  return idbGetSound(soundId).then(rec=>{
    if(!rec||!rec.blob||!rec.blob.arrayBuffer) return null;
    return rec.blob.arrayBuffer().then(ab=>new Promise(res=>{
      try{ ctx.decodeAudioData(ab.slice(0), buf=>{ _bufCache.set(soundId,buf); res(buf); }, ()=>res(null)); }
      catch(_){ res(null); }
    }));
  }).catch(()=>null);
}
function playBuffer(buf,gain,rate){
  const ctx=audioCtx(); if(!ctx||!buf) return false;
  try{
    if(ctx.state==='suspended') ctx.resume();
    const g=ctx.createGain(); g.gain.value=Math.max(0,Math.min(1,gain==null?1:gain));
    const s=ctx.createBufferSource(); s.buffer=buf; if(rate&&rate>0) s.playbackRate.value=rate; s.connect(g); g.connect(ctx.destination); s.start(0);
    return true;
  }catch(_){ return false; }
}
function getSoundForEvent(eventName){ return (SND.eventSoundMap||{})[eventName]||null; }
function eventEnabled(eventName){ return (SND.eventEnabledMap||{})[eventName]!==false; }
function eventVolume(eventName){ const v=(SND.eventVolumes||{})[eventName]; return (typeof v==='number'&&v>=0&&v<=1)?v:1; }
function playEventSound(eventName,opts){
  return false;   /* AUDIO SPENTO: rinascera in un cantiere dedicato */
  try{
    if(!SND.audioEnabled||!eventEnabled(eventName)) return false;
    const id=getSoundForEvent(eventName); if(!id) return false;   /* predefinito = silenzio finché l'utente non assegna il suo */
    if(!_audioUnlocked) return false;                              /* iOS: nessun audio prima del primo gesto */
    const gain=(SND.masterVolume==null?1:SND.masterVolume)*eventVolume(eventName);
    const rate=(opts&&opts.semitones)?Math.pow(2,opts.semitones/12):1;   /* combo: ogni spunta ravvicinata sale di un semitono (alla Candy Crush) */
    const cached=_bufCache.get(id);
    if(cached) return playBuffer(cached,gain,rate);
    decodeSound(id).then(buf=>{ if(buf) playBuffer(buf,gain,rate); });
    return true;
  }catch(_){ return false; }
}
function previewSound(soundId){
  unlockAudioOnUserGesture();
  const vol=(SND.masterVolume==null?1:SND.masterVolume);
  const cached=_bufCache.get(soundId);
  if(cached) return Promise.resolve(playBuffer(cached,vol));
  return decodeSound(soundId).then(buf=>buf?playBuffer(buf,vol):(toast('Anteprima non disponibile'),false));
}
function validateAudioFile(file,maxBytes){
  return new Promise(res=>{
    if(!file){ res({ok:false,reason:'Nessun file'}); return; }
    const lim=maxBytes||SND_MAX_FILE;
    if(file.size>lim){ res({ok:false,reason:'File troppo grande (max '+Math.round(lim/1048576)+' MB)'}); return; }
    const okExt=/\.(mp3|m4a|wav|ogg)$/i.test(file.name||'');
    const okType=/(mpeg|mp4|m4a|aac|wav|wave|ogg)/i.test(file.type||'');
    if(!okExt&&!okType){ res({ok:false,reason:'Formato non riconosciuto: usa mp3, m4a, wav o ogg'}); return; }
    const ctx=audioCtx();
    if(!ctx||!file.arrayBuffer){ res({ok:true,durationMs:null}); return; }
    file.arrayBuffer().then(ab=>{
      try{ ctx.decodeAudioData(ab.slice(0), buf=>res({ok:true,durationMs:Math.round(buf.duration*1000)}), ()=>res({ok:false,reason:'Audio non leggibile su questo dispositivo (su iPhone evita .ogg)'})); }
      catch(_){ res({ok:false,reason:'Audio non leggibile su questo dispositivo'}); }
    }).catch(()=>res({ok:false,reason:'Lettura del file non riuscita'}));
  });
}
function sndUid(){ return 'snd-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function assignSoundToEvent(eventName,soundId){ SND.eventSoundMap=SND.eventSoundMap||{}; SND.eventSoundMap[eventName]=soundId; saveSoundSettings(); }
function uploadSoundForEvent(eventName,file){
  return validateAudioFile(file, eventName==='baseLoop'?SND_MAX_BASE:SND_MAX_FILE).then(v=>{
    if(!v.ok){ try{ toast(v.reason); }catch(_){} return null; }
    const rec={ id:sndUid(), name:(file.name||'suono').slice(0,60), fileName:(file.name||'').slice(0,120), mimeType:file.type||'', size:file.size, durationMs:v.durationMs||null, createdAt:new Date().toISOString(), blob:file };
    return idbPutSound(rec).then(()=>{ assignSoundToEvent(eventName,rec.id); _bufCache.delete(rec.id); return rec.id; })
      .catch(()=>{ try{ toast('Salvataggio del suono non riuscito'); }catch(_){} return null; });
  });
}
function _soundStillUsed(soundId){ return Object.values(SND.eventSoundMap||{}).includes(soundId); }
function resetEventSound(eventName){
  const id=getSoundForEvent(eventName);
  if(SND.eventSoundMap) delete SND.eventSoundMap[eventName];
  saveSoundSettings();
  if(id&&!_soundStillUsed(id)){ _bufCache.delete(id); idbDelSound(id).catch(()=>{}); }   /* niente file orfani */
}

function initSoundSystem(){ /* AUDIO SPENTO */ }

/* --- Canzone di base: un loop continuo, scelto dall'utente, indipendente dalla colonna sonora adattiva --- */
let _baseSrc=null;
function stopBaseLoop(){ try{ if(_baseSrc){ _baseSrc.onended=null; _baseSrc.stop(); _baseSrc.disconnect(); } }catch(_){} _baseSrc=null; }
function startBaseLoop(){
  stopBaseLoop();
  if(!SND.audioEnabled||!eventEnabled('baseLoop')) return;
  const id=getSoundForEvent('baseLoop'); if(!id) return;
  if(!_audioUnlocked) return;                 /* iOS: parte al primo gesto */
  decodeSound(id).then(buf=>{
    if(!buf||getSoundForEvent('baseLoop')!==id||!_audioUnlocked) return;   /* potrebbe essere cambiata/sbloccata nel frattempo */
    const ctx=audioCtx(); if(!ctx) return;
    try{
      if(ctx.state==='suspended') ctx.resume();
      const g=ctx.createGain(); g.gain.value=Math.max(0,Math.min(1,(SND.masterVolume==null?1:SND.masterVolume)*eventVolume('baseLoop')));
      const s=ctx.createBufferSource(); s.buffer=buf; s.loop=true; s.connect(g); g.connect(ctx.destination); s.start(0);
      _baseSrc=s;
    }catch(_){}
  });
}

/* --- UI: lista eventi nelle impostazioni --- */
let _pendingSndEvent=null;
function renderSoundEvents(){
  const sw=document.querySelector('#sw-appaudio'); if(sw) sw.classList.toggle('on',!!SND.audioEnabled);
  const host=document.querySelector('#list-snd-events'); if(!host) return;
  host.innerHTML='<p class="empty">Carico…</p>';
  idbListSounds().then(all=>{
    const byId={}; all.forEach(s=>{ byId[s.id]=s; });
    host.innerHTML='';
    SOUND_EVENTS.forEach(ev=>{
      const id=getSoundForEvent(ev.id); const snd=id?byId[id]:null;
      const div=document.createElement('div'); div.className='snd-ev';
      div.innerHTML=
        '<div class="snd-label">'+escapeHtml(ev.label)+'</div>'+
        '<div class="snd-cur">Suono: '+(snd?escapeHtml(snd.name):'predefinito (silenzio)')+'</div>'+
        '<div class="snd-desc">'+escapeHtml(ev.description)+'</div>'+
        '<div class="snd-acts">'+
          '<button data-a="preview"'+(snd?'':' disabled')+'>Anteprima</button>'+
          '<button data-a="change">Cambia</button>'+
          '<button data-a="reset"'+(snd?'':' disabled')+'>Reset</button>'+
        '</div>';
      div.querySelector('[data-a="preview"]').onclick=()=>{ if(!id) return; if(ev.loop){ unlockAudioOnUserGesture(); startBaseLoop(); } else previewSound(id); };
      div.querySelector('[data-a="change"]').onclick=()=>{ unlockAudioOnUserGesture(); _pendingSndEvent=ev.id; const inp=document.querySelector('#snd-file'); if(inp){ inp.value=''; inp.click(); } };
      div.querySelector('[data-a="reset"]').onclick=()=>{ if(!id) return; if(ev.loop) stopBaseLoop(); resetEventSound(ev.id); renderSoundEvents(); try{ toast('Tornato al predefinito'); }catch(_){} };
      host.appendChild(div);
    });
  }).catch(()=>{ host.innerHTML='<p class="empty">Archivio suoni non disponibile su questo browser.</p>'; });
}
(function(){
  const sw=document.querySelector('#sw-appaudio');
  if(sw) sw.onclick=()=>{ SND.audioEnabled=!SND.audioEnabled; saveSoundSettings(); renderSoundEvents(); if(SND.audioEnabled){ try{ startBaseLoop(); }catch(_){} } else { try{ stopBaseLoop(); }catch(_){} } };
  const inp=document.querySelector('#snd-file');
  if(inp) inp.onchange=e=>{
    const f=e.target.files&&e.target.files[0]; e.target.value='';
    const ev=_pendingSndEvent; _pendingSndEvent=null;
    if(!f||!ev) return;
    uploadSoundForEvent(ev,f).then(id=>{ if(id){ renderSoundEvents(); if(ev==='baseLoop'){ unlockAudioOnUserGesture(); startBaseLoop(); } else previewSound(id); try{ toast(ev==='baseLoop'?'Canzone di base impostata':'Suono assegnato'); }catch(_){} } });
  };
})();

document.querySelector('#sw-notif').onclick=async()=>{
  if(!S.settings.notif){
    if(!('Notification' in window)){ toast('Notifiche non supportate qui. Installa l\u2019app sulla Home.'); return; }
    let perm='denied';
    try{ perm=await Notification.requestPermission(); }
    catch(_){ try{ Notification.requestPermission(p=>{perm=p;}); }catch(__){} }
    if(perm!=='granted'){ toast('Permesso negato nelle impostazioni iOS'); return; }
    S.settings.notif=true; save(); renderSettings(); scheduleReminders(); toast('Promemoria attivi');
  } else {
    S.settings.notif=false; save(); renderSettings(); clearReminders(); toast('Promemoria spenti');
  }
};
/* v221: il testo lungo sull'informativa sta sul sito, accanto all'app nello
   stesso indirizzo. Si apre in una scheda nuova per non buttare fuori dall'app
   chi la sta usando; se non c'e rete, il riassunto qui sopra resta ed e gia
   quello che conta. */
{ const b=document.querySelector('#btn-privacy');
  if(b) b.onclick=()=>{ try{ window.open('./privacy.html','_blank','noopener'); }catch(_){ location.href='./privacy.html'; } }; }
/* v224: la guida per intero sta accanto all'app, come l'informativa. Viaggia
   nella cache del service worker, quindi si apre anche senza rete: una guida che
   si apre solo online e' inutile proprio il giorno che serve. */
{ const b=document.querySelector('#btn-guida');
  if(b) b.onclick=()=>{ try{ window.open('./guida.html','_blank','noopener'); }catch(_){ location.href='./guida.html'; } }; }
document.querySelector('#btn-savekey').onclick=()=>{
  const ok=setGeminiKey(document.querySelector('#gemini-key').value);
  toast(ok?(GEMINI_KEY?'Chiave Gemini salvata e verificata sul dispositivo':'Chiave rimossa'):'Non riesco a salvare la chiave su questo dispositivo'); renderSettings();
};
document.querySelector('#btn-testkey').onclick=async()=>{
  const out=document.querySelector('#test-result');
  const field=document.querySelector('#gemini-key').value.trim();
  if(field!==GEMINI_KEY) setGeminiKey(field);
  if(!GEMINI_KEY){ out.textContent='Nessuna chiave Gemini salvata: incollala qui sopra.'; return; }
  out.textContent='Provo la strada usata dalla Distillazione…';
  const probeSchema={type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}},required:['ok']};
  const r=await _geminiGenerate({task:'distill-probe',model:'gemini-3.5-flash-lite',system:'Rispondi soltanto con il JSON richiesto.',user:'Imposta ok a true.',schema:probeSchema,maxOutputTokens:24,reasoning:'minimal',timeout:15000});
  if(!r.err&&r.json&&r.json.ok===true){ out.textContent='✓ Distillazione Gemini pronta · '+r.model+' · GenerateContent'; try{ sAppear(0); }catch(_){} }
  else if(r.err==='chiave') out.textContent='✗ La chiave non è accettata dal progetto Gemini. Ricopiala da Google AI Studio e riprova.';
  else if(r.err==='quota') out.textContent='✗ Quota giornaliera del progetto esaurita. Sentiero Base continua a funzionare.';
  else if(r.err==='limite') out.textContent='✗ Limite temporaneo di richieste. Riprova più tardi: Sentiero Base continua a funzionare.';
  else if(r.err==='modello') out.textContent='✗ I modelli configurati non risultano disponibili per questo progetto.';
  else if(r.err==='offline'||r.err==='rete') out.textContent='✗ Gemini non è raggiungibile dalla rete in questo momento.';
  else if(r.err==='timeout') out.textContent='✗ La strada della Distillazione non ha risposto entro 15 secondi. La chiave può essere valida, ma questo test non è verde.';
  else if(r.err==='occupato') out.textContent='✗ Gemini è momentaneamente indisponibile. Riprova più tardi.';
  else out.textContent='✗ Connessione non riuscita ('+r.err+').';
  renderSettings();
};
let taskMode='ric'; /* 'ric' = ricorrente, 'data' = data precisa */
function vaiModoTask(m){
  taskMode=(m==='data')?'data':'ric';
  document.querySelectorAll('#task-mode button').forEach(x=>x.classList.toggle('on',x.dataset.mode===taskMode));
  document.querySelector('#task-ric').classList.toggle('hidden',taskMode!=='ric');
  document.querySelector('#task-data').classList.toggle('hidden',taskMode!=='data');
}
document.querySelectorAll('#task-mode button').forEach(b=>{ b.onclick=()=>vaiModoTask(b.dataset.mode); });

/* ══ v258 — LE COSE RICORRENTI SI POSSONO CAMBIARE ═════════════════════════
   Fino a ieri una cosa ricorrente, una volta scritta, era per sempre: si poteva
   solo cancellare e riscrivere daccapo - e riscrivendola si perdeva la sua data
   di nascita, cioe il conto di quante volte e stata mancata dall'inizio.
   Toccare la riga la riporta qui sotto per cambiarla. Id e nascita restano
   quelli: e la stessa cosa, detta meglio, non una cosa nuova.
   (la variabile e dichiarata sopra, accanto a renderSettings: qui sarebbe piu
   in basso di chi la legge, e una let letta prima della sua riga esplode) */
let newRepeat='none';   /* v271: la ricorrenza scelta per l'evento a data precisa */
function vaiModoRepeat(r){
  newRepeat=(r==='yearly')?'yearly':'none';
  try{ document.querySelectorAll('#task-repeat button').forEach(b=>
    b.classList.toggle('on',b.dataset.rep===newRepeat)); }catch(_){}
}
function modificaRicorrente(id){
  const t=(S.scheduled||[]).find(x=>x&&x.id===id); if(!t) return;
  _ricMod=id;
  document.querySelector('#new-task-txt').value=t.titolo||'';
  document.querySelector('#new-task-time').value=t.time||'';
  if(t.date){ vaiModoTask('data'); document.querySelector('#new-task-date').value=t.date; newDays=[];
    vaiModoRepeat(t.repeat==='yearly'?'yearly':'none'); }
  else { vaiModoTask('ric'); newDays=[...(t.days||[])]; vaiModoRepeat('none'); }
  renderSettings();
  try{ haptic(); }catch(_){}
  try{ document.querySelector('#new-task-txt').scrollIntoView({block:'center',behavior:'smooth'}); }catch(_){}
}
function fineModifica(){
  _ricMod=null; newDays=[]; vaiModoRepeat('none');
  document.querySelector('#new-task-txt').value='';
  document.querySelector('#new-task-time').value='';
  document.querySelector('#new-task-date').value='';
  vaiModoTask('ric');
  renderSettings();
}
/* ══ LA NASCITA A MANO (v205) ═══════════════════════════════════════════════
   Una quest poteva nascere solo da una risposta del modello. Cinque punti nel
   codice, tutti e cinque dietro la chiave: per i rituali il bottone «Aggiungi»
   c'era da sempre, per le quest non c'era mai stato. Senza chiave il cuore
   dell'app - parli, e le cose da fare prendono forma - semplicemente non c'era.

   Serve anche a chi la chiave ce l'ha: la rete cade, il modello tace, e intanto
   una cosa da fare la vuoi segnare lo stesso.

   La data di nascita si mette QUI, e non si dimentica: e la terza volta che
   quel campo viene aggiunto a una strada nuova (v199 dalla voce, v203 dai
   rituali a mano, v205 da qui), e le prime due volte era stato dimenticato. */

/* ══ IL FOGLIO DELLE PROPOSTE (v212) ════════════════════════════════════════
   Quello che l'estrattore di casa tira fuori NON entra da solo nella lista: si
   propone, e tu tocchi quello che vale. Un falso positivo costa un tocco; una
   quest inventata che si installa da sola costa la fiducia - e la stessa scelta
   fatta per la rete del peso nella v206.
   E c'e un vantaggio che il modello non ha: vedi esattamente cosa ha capito. */
let _propCand=[];
function apriProposte(cand){
  _propCand=(cand||[]).slice(0,6);
  const el=document.getElementById('proposte'), lista=document.getElementById('proposte-lista');
  if(!el||!lista||!_propCand.length) return false;
  lista.innerHTML='';
  _propCand.forEach((c,i)=>{
    const r=document.createElement('div'); r.className='prop on'; r.dataset.i=String(i);
    const k=document.createElement('div'); k.className='prop-chk';
    const t=document.createElement('div'); t.className='prop-txt'; t.textContent=c.titolo;
    if(c.quando||c.ora){
      const q=document.createElement('span'); q.className='prop-quando';
      q.textContent=[c.quando?_propGiorno(c.quando):'',c.ora||''].filter(Boolean).join(' · ');
      t.appendChild(q);
    }
    r.appendChild(k); r.appendChild(t);
    r.onclick=()=>{ r.classList.toggle('on'); };
    lista.appendChild(r);
  });
  el.classList.remove('hidden');
  try{ haptic(); }catch(_){}
  return true;
}
function _propGiorno(iso){
  try{
    const tk=todayKey();
    if(iso===tk) return 'oggi';
    if(iso===localDayKey(new Date(Date.now()+86400000))) return 'domani';
    const d=new Date(iso+'T12:00:00');
    return d.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'});
  }catch(_){ return iso; }
}
function chiudiProposte(){ const el=document.getElementById('proposte'); if(el) el.classList.add('hidden'); _propCand=[]; }
function tieniProposte(){
  const lista=document.getElementById('proposte-lista'); if(!lista) return;
  const scelte=[];
  lista.querySelectorAll('.prop.on').forEach(r=>{ const c=_propCand[+r.dataset.i]; if(c) scelte.push(c); });
  chiudiProposte();
  if(!scelte.length) return;
  if(!Array.isArray(S.quests)) S.quests=[];
  const nati=[];
  scelte.forEach(c=>{
    const q={id:uid(),titolo:clampStr(c.titolo,LIMITS.TITLE),note:'',quando:c.quando||'',ora:c.ora||'',
             prio:c.prio||3,fatto:false,nata:todayKey(),monte:''};
    /* dalla stessa porta delle quest del modello: la validazione e una sola */
    const prima=S.quests.length;
    S.quests=sortQuests(sanitizeQuests([...S.quests,q]));
    if(S.quests.length>prima) nati.push(q.id);
  });
  save();
  try{ render(nati); }catch(_){}
  try{ playEventSound('questCreated'); }catch(_){}
  try{ haptic(); }catch(_){}
  try{ toast(nati.length===1?'Una cosa tenuta':(nati.length+' cose tenute')); }catch(_){}
}
document.querySelector('#proposte-no').onclick=chiudiProposte;
document.querySelector('#proposte-ok').onclick=tieniProposte;
document.querySelector('#proposte').onclick=(e)=>{ if(e.target&&e.target.id==='proposte') chiudiProposte(); };

function apriNascita(apri){
  const f=document.querySelector('#nascita-form'), b=document.querySelector('#nascita-apri');
  if(!f||!b) return;
  f.classList.toggle('hidden',!apri);
  b.classList.toggle('hidden',apri);
  if(apri){ const t=document.querySelector('#nascita-txt'); if(t){ t.value=''; setTimeout(()=>t.focus(),40); } }
  else { const d=document.querySelector('#nascita-quando'); if(d) d.value=''; }
}
function nasciAMano(){
  const t=document.querySelector('#nascita-txt'), d=document.querySelector('#nascita-quando');
  const titolo=String((t&&t.value)||'').trim();
  if(!titolo) return;
  const q={id:uid(),titolo:clampStr(titolo,LIMITS.TITLE),note:'',
           quando:String((d&&d.value)||''),ora:'',prio:3,fatto:false,
           nata:todayKey(),monte:''};
  /* dalla stessa porta da cui passano le quest del modello: se il titolo e
     impossibile o la data e scritta male, e sanitizeQuests a dirlo, non io. */
  const prima=(S.quests||[]).length;
  S.quests=sortQuests(sanitizeQuests([...(S.quests||[]),q]));
  if((S.quests||[]).length===prima){ toast('Non sono riuscito a tenerla'); return; }
  save();
  apriNascita(false);
  try{ render([q.id]); }catch(_){}
  try{ playEventSound('questCreated'); }catch(_){}
  try{ haptic(); }catch(_){}
}
document.querySelector('#nascita-apri').onclick=()=>apriNascita(true);
document.querySelector('#nascita-no').onclick=()=>apriNascita(false);
document.querySelector('#nascita-ok').onclick=nasciAMano;
document.querySelector('#nascita-txt').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); nasciAMano(); } });

{ const an=document.querySelector('#btn-annulla-mod'); if(an) an.onclick=()=>fineModifica(); }
try{ document.querySelectorAll('#task-repeat button').forEach(b=>
  b.onclick=()=>vaiModoRepeat(b.dataset.rep)); }catch(_){}
try{ document.querySelectorAll('#unlock-modo button').forEach(b=>
  b.onclick=()=>_unlModoVai(b.dataset.modo)); }catch(_){}
{ const b=document.querySelector('#btn-add-unlock'); if(b) b.onclick=()=>_unlSalva();
  const a=document.querySelector('#btn-annulla-unlock'); if(a) a.onclick=()=>_unlFine(); }
document.querySelector('#btn-addtask').onclick=()=>{
  const txt=document.querySelector('#new-task-txt').value.trim();
  if(!txt) return toast('Scrivi il testo della task');
  const time=document.querySelector('#new-task-time').value||'';
  if(taskMode==='data'){
    const date=document.querySelector('#new-task-date').value||'';
    if(!date) return toast('Scegli una data');
    /* v203: la data di nascita mancava proprio qui, ed e la strada piu battuta.
       La v199 la mise ai rituali nati dalla voce (due punti, tutti e due dentro
       una risposta del modello) e questo bottone resto fuori: e da qui che sono
       nati tutti e quattordici i rituali nel backup dell'8 agosto, nessuno con
       la data. Senza, _nascitaRituale prova a dedurla dal primo giorno spuntato
       e per un rituale creato oggi non c'e niente da dedurre: il conto delle
       mancate riparte dall'inizio del cammino. E' esattamente il guasto che la
       v199 doveva chiudere, rimasto aperto sul lato che si usa di piu - e l'unico
       che esiste per chi non ha la chiave, dove i rituali si fanno solo a mano. */
    const rep=(newRepeat==='yearly')?'yearly':'none';
    if(_ricMod){ S.scheduled=sanitizeScheduled(S.scheduled.map(x=>x&&x.id===_ricMod?Object.assign({},x,{titolo:txt,days:[],date,time,repeat:rep}):x)); }
    else S.scheduled=sanitizeScheduled([...S.scheduled,{id:uid(),titolo:txt,days:[],date,time,repeat:rep,nata:todayKey()}]);
    document.querySelector('#new-task-date').value=''; vaiModoRepeat('none');
  } else {
    if(!newDays.length) return toast('Scegli almeno un giorno');
    const gg=[...newDays].sort((a,b)=>a-b);
    if(_ricMod){ S.scheduled=sanitizeScheduled(S.scheduled.map(x=>x&&x.id===_ricMod?Object.assign({},x,{titolo:txt,days:gg,date:'',time,repeat:'none'}):x)); }
    else S.scheduled=sanitizeScheduled([...S.scheduled,{id:uid(),titolo:txt,days:gg,time,nata:todayKey()}]);
  }
  const eraMod=_ricMod; _ricMod=null; newDays=eraMod?[]:newDays;
  document.querySelector('#new-task-txt').value=''; document.querySelector('#new-task-time').value='';
  save(); renderSettings(); renderTasks(); updateRing(); scheduleReminders();
  try{ mostraPromemoria(); }catch(_){}
  toast(eraMod?'Cambiata':'Task aggiunta');
};

/* ══ v271 — IL PROMEMORIA A QUATTORDICI GIORNI ═════════════════════════════
   L'architettura dei promemoria di Sentiero crea timer soltanto per cio che
   cade entro ventidue ore: e una scelta giusta, perche un setTimeout di due
   settimane non sopravvive alla chiusura dell'app e prometterebbe una cosa che
   non puo mantenere. Quindi qui NON si programma niente.

   Si CALCOLA. La fonte di verita e lo stato locale piu la data di oggi: a ogni
   apertura si chiede «quali eventi cadono entro quattordici giorni e non li ho
   ancora mostrati per QUESTA occorrenza». Se l'app resta chiusa per dieci
   giorni, il richiamo non e perso: alla prima apertura utile e ancora dovuto,
   perche la condizione non e «e oggi il T-14» ma «siamo dentro la finestra».

   La chiave di memoria e «id|data-occorrenza». Chiuso il compleanno di
   quest'anno, quello dell'anno prossimo ha una chiave diversa e torna da solo,
   senza una riga di codice che lo faccia tornare. */
const PROM_GIORNI=14;
function _giorniFra(a,b){
  try{ return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000); }catch(_){ return 9999; }
}
function promemoriaDovuti(state,tk){
  tk=_dataOk(tk)?tk:todayKey();
  const visti=(state&&state.promVisti)||{};
  const out=[];
  ((state&&state.scheduled)||[]).forEach(t=>{
    if(!t||!_dataOk(t.date)) return;
    const occ=prossimaOccorrenza(t,tk);
    if(!occ) return;                                  /* una volta, gia passato */
    const g=_giorniFra(tk,occ);
    if(g<0||g>PROM_GIORNI) return;                    /* fuori dalla finestra */
    if(visti[t.id+'|'+occ]===true) return;            /* gia visto per QUESTA occorrenza */
    out.push({id:t.id,titolo:t.titolo,occ:occ,giorni:g});
  });
  out.sort((a,b)=>a.giorni-b.giorni||String(a.titolo).localeCompare(String(b.titolo)));
  return out;
}
function promemoriaVisto(state,id,occ){
  if(!state.promVisti||typeof state.promVisti!=='object') state.promVisti={};
  state.promVisti[id+'|'+occ]=true;
  /* la memoria non cresce all'infinito: le occorrenze passate non servono piu.
     Si tiene tutto cio che riguarda date da oggi in poi, piu un margine. */
  try{
    const tk=todayKey();
    Object.keys(state.promVisti).forEach(k=>{
      const d=k.slice(k.indexOf('|')+1);
      if(_dataOk(d)&&_giorniFra(tk,d)< -40) delete state.promVisti[k];
    });
  }catch(_){}
}
function _promFrase(p){
  if(p.giorni<=0) return 'Oggi · '+p.titolo;
  if(p.giorni===1) return 'Domani · '+p.titolo;
  return 'Tra '+p.giorni+' giorni · '+p.titolo;
}
/* IL RICHIAMO. Visibile ma non aggressivo: non ruba il fuoco, non copre niente,
   non chiede di decidere. Si chiude con un tocco, e quel tocco vale per quella
   occorrenza e basta. */
function mostraPromemoria(){
  try{
    const box=document.getElementById('prom-lista'); if(!box) return;
    const da=promemoriaDovuti(S,todayKey());
    box.innerHTML='';
    box.classList.toggle('hidden',!da.length);
    da.slice(0,4).forEach(p=>{
      const d=document.createElement('div'); d.className='prom-riga';
      d.innerHTML='<span class="prom-txt"></span><button class="prom-x" aria-label="Ho visto">'+
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      d.querySelector('.prom-txt').textContent=_promFrase(p);
      d.querySelector('.prom-x').onclick=()=>{
        promemoriaVisto(S,p.id,p.occ); save();
        try{ mostraPromemoria(); }catch(_){}
        try{ haptic(); }catch(_){}
      };
      box.appendChild(d);
    });
  }catch(_){}
}

/* ======================================================================
   PROMEMORIA
   ====================================================================== */
let reminderTimers=[];
function clearReminders(){ reminderTimers.forEach(clearTimeout); reminderTimers=[]; }
function scheduleReminders(){
  clearReminders();
  if(!S.settings.notif||!('Notification' in window)||Notification.permission!=='granted') return;
  nextReminderDelays(S,new Date()).forEach(t=>{
    reminderTimers.push(setTimeout(async()=>{
      try{
        const reg=await navigator.serviceWorker.ready;
        reg.showNotification('Sentiero',{body:t.titolo,icon:'icon-192.png',badge:'icon-192.png',tag:'sentiero-'+t.id});
      }catch(_){ try{ new Notification('Sentiero',{body:t.titolo}); }catch(__){} }
    },t.ms));
  });
}

/* ======================================================================
   BACKUP
   ====================================================================== */
/* v215: la scelta della lingua. Cambia la dettatura, le date e l'attributo lang
   della pagina; l'interfaccia resta in italiano finche non c'e la tabella delle
   scritte, e la nota qui sotto lo dice invece di lasciarlo credere. */
function renderLingua(){
  const seg=document.querySelector('#seg-lingua'); if(!seg) return;
  const scelta=(S.settings&&S.settings.lingua)||'';
  seg.querySelectorAll('button').forEach(b=>{
    b.classList.toggle('on',(b.dataset.lingua||'')===scelta);
    b.onclick=()=>{
      S.settings.lingua=b.dataset.lingua||'';
      save(); accendiLingua().catch(function(){});
      try{ render(); }catch(_){}
      try{ toast('Lingua: '+(LINGUE_NOTE[linguaApp()]||{}).nome); }catch(_){}
    };
  });
  const n=document.querySelector('#lingua-note');
  if(n) n.textContent=linguaApp()==='it'
    ? 'Dettatura e date in italiano.'
    : 'Dettatura e date in ' + ((LINGUE_NOTE[linguaApp()]||{}).nome||'') + '. Le scritte dell\u2019app sono ancora in italiano.';
}

{ const _bd=document.querySelector('#btn-diagnostica'); if(_bd) _bd.onclick=scaricaDiagnostica; }
function scaricaBackup(includeKey){
  try{
    const diag={ver:APP_VERSION,quando:new Date().toISOString(),
      dispositivo:{ua:String(navigator.userAgent||'').slice(0,160),vw:innerWidth,vh:innerHeight,dpr:devicePixelRatio||1,
        riduciMoto:(function(){try{return !!matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}})(),
        standalone:(function(){try{return !!(navigator.standalone||matchMedia('(display-mode: standalone)').matches);}catch(_){return false;}})()},
      statoByte:JSON.stringify(S).length,
      conteggi:{quests:(S.quests||[]).length,diario:(S.diary||[]).length,rituali:(S.scheduled||[]).length,
        semi:(S.semi||[]).length,capitoli:(S.capitoli||[]).length,foto:Object.keys(S.foto||{}).length,
        patti:(S.patti||[]).length,registro:(S.registro||[]).length},
      impostazioni:S.settings};
    let _sn=null; try{ scatolaScrivi(); _sn={voci:SCATOLA_VOCI,sessione:_scatolaSes,nastro:_scatola.slice(-SCATOLA_TETTO)}; }catch(_){}
    const payload=Object.assign({},S,{_cantiere:diag,_scatola:_sn});
    let txt='';
    if(includeKey){
      if(!confirm('Creare un BACKUP COMPLETO?\n\nConterrà anche la chiave Gemini. Custodiscilo come una password.')) return;
      payload._sentieroChiaveGemini=GEMINI_KEY||'';
      txt=JSON.stringify(payload,null,2);
    }else txt=jsonExportSenzaSegreti(payload,2);
    const blob=new Blob([txt],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='sentiero-backup-'+(includeKey?'completo-':'')+todayKey()+'.json'; a.rel='noopener';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    toast(includeKey?'Backup completo pronto: contiene anche la chiave Gemini':'Backup pronto. La chiave Gemini non è nel file');
  }catch(_){ toast('Esportazione non riuscita'); }
}
document.querySelector('#btn-export').onclick=()=>scaricaBackup(false);
{ const b=document.querySelector('#btn-export-full'); if(b) b.onclick=()=>scaricaBackup(true); }
document.querySelector('#btn-import').onclick=()=>document.querySelector('#import-file').click();
document.querySelector('#import-file').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    /* v272.2 — la fotografia della chiave vive FUORI dal try: se l'import
       fallisce dopo aver toccato lo stato, il rollback deve poterla rimettere. */
    let prima=null, mutato=false, chiavePrima=String(GEMINI_KEY||'');
    try{
      const parsed=JSON.parse(r.result);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('shape');
      const chiaveBackup=typeof parsed._sentieroChiaveGemini==='string'?String(parsed._sentieroChiaveGemini).trim().slice(0,500):null;
      const nq=Array.isArray(parsed.quests)?parsed.quests.length:0;
      const nd=Array.isArray(parsed.diary)?parsed.diary.length:0;
      const when=parsed.lastSealed||parsed.lastDayInit||'';
      const ok=confirm('Importare questo backup?\n\n'+nq+' quest · '+nd+' voci di diario'+(when?('\nUltimo giorno: '+when):'')+(chiaveBackup!==null?'\nChiave Gemini: inclusa':'\nChiave Gemini: quella attuale resta')+'\n\nSostituirà TUTTI i dati attuali su questo telefono.');
      if(!ok){ toast('Import annullato: dati intatti'); return; }

      /* Gemini — IMPORT TRANSAZIONALE.
         Prima fotografia, poi stato nuovo, poi scrittura e rilettura. Se anche
         un solo passaggio fallisce, si rimette la fotografia precedente. La
         chiave Gemini e fuori da S e quindi non entra mai nella transazione. */
      prima=JSON.stringify(S);
      try{ localStorage.setItem(LS_PRE_IMPORT,prima); }catch(_){}
      const prossimo=sanitizeState(parsed,defaultState);
      S=prossimo; mutato=true;
      initDay();
      if(!salvaSubito()) throw new Error('persist');
      const verifica=safeGet(LS);
      if(!verifica) throw new Error('verify-empty');
      JSON.parse(verifica);  /* se non si rileggono i dati appena scritti, rollback */
      if(chiaveBackup!==null){ if(!setGeminiKey(chiaveBackup)) throw new Error('key-persist'); }
      else if(!setGeminiKey(chiavePrima)) throw new Error('key-restore');
      render();
      toast(chiaveBackup!==null?'Backup completo importato. Chiave Gemini ripristinata e verificata':(GEMINI_KEY?'Backup importato. La chiave Gemini è rimasta al suo posto':'Backup importato'));
    }catch(_){
      if(mutato&&prima){
        try{
          S=sanitizeState(JSON.parse(prima),defaultState);
          try{ setGeminiKey(chiavePrima); }catch(_){}
          salvaSubito(); render();
          toast('Import non riuscito: i dati precedenti sono stati ripristinati');
          return;
        }catch(__){}
      }
      toast('File non valido o non leggibile');
    }
  };
  r.onerror=()=>{ toast('Lettura del file non riuscita'); };
  r.readAsText(f);
  e.target.value='';
};

/* ======================================================================
   AVVIO
   ====================================================================== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(function(reg){
    try{ scheduleReminders(); }catch(_){}
    /* due strade, perche i telefoni non si comportano tutti uguale:
       - updatefound: e arrivato un lavoratore nuovo e sta per prendere servizio
       - controllerchange: il cambio e gia avvenuto sotto i piedi della pagina
       In tutti e due i casi si DICE e basta. Ricaricare da soli qui vorrebbe
       dire buttare via quello che una persona sta scrivendo. */
    function avvisa(){ try{ const r=document.getElementById('riavvia'); if(r) r.classList.remove('hidden'); }catch(_){} }
    try{
      reg.addEventListener('updatefound',function(){
        const nuovo=reg.installing; if(!nuovo) return;
        nuovo.addEventListener('statechange',function(){
          if(nuovo.state==='installed' && navigator.serviceWorker.controller) avvisa();
        });
      });
    }catch(_){}
    try{ navigator.serviceWorker.addEventListener('controllerchange',function(){
      avvisa();
      /* Lab 23: la prima lettura della base puo essere passata dal worker N-1.
         Quando il worker della build corrente prende davvero il controllo, la
         rileggiamo una volta: cosi il front non resta per tutta la sessione con
         la base incorporata pur avendo gia la cache giusta sotto i piedi. */
      setTimeout(function(){ try{ const u=aggiornaBaseLinguistica(true); if(u&&u.catch) u.catch(function(){}); }catch(_){} },700);
    }); }catch(_){}
  }).catch(()=>{});
}
try{ initHaptic(); }catch(_){}
try{ initDay(); }catch(_){}
try{
  const _vbx=document.getElementById('voce-banner-x'); if(_vbx) _vbx.onclick=chiudiVoceBanner;
  renderVoceBanner();
}catch(_){}
/* Lab 21: la base pubblicata viene verificata all'avvio, non soltanto dopo una
   distillazione serale. La query porta la generazione e non puo quindi ricevere
   dal vecchio service worker una base di un'altra build. Offline resta la base
   incorporata, senza bloccare nulla. */
try{ setTimeout(function(){ try{ const _u=aggiornaBaseLinguistica(); if(_u&&_u.catch) _u.catch(function(){}); }catch(_){} },1200); }catch(_){}
/* v255 — L'ASPETTO SI METTE ALL'AVVIO, DA SOLO.
   applyTheme() vive dentro renderSettings(), e dalla v253 renderSettings non
   gira piu quando il pannello e chiuso: cioe quasi mai, e all'avvio mai.
   Risultato: il foglio partiva chiaro - quello lo mette lo script del primo
   istante - ma il MONDO restava quello scuro, e diventava chiaro solo aprendo
   le impostazioni. Un difetto che ho introdotto io ottimizzando, e che si
   vedeva solo aprendo l'app: il posto in cui nessuna misura guarda.
   Da qui in poi l'aspetto e roba dell'avvio, non un effetto collaterale di un
   pannello. */
try{ applyTheme(); }catch(_){}
try{ render(); }catch(_){}
try{ scheduleReminders(); }catch(_){}
try{ maybeObserveAuto(); }catch(_){}
try{ mostraNovita(); }catch(_){}
/* la Mente Osservatrice si accende da sola, una volta al giorno */
try{ const _p=maybeChiudiCapitolo(); if(_p&&_p.catch) _p.catch(function(e){ try{ regCantiere('errore',{msg:'maybeChiudiCapitolo: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} }); }catch(_){}
/* v193 — la schermata di benvenuto viene chiamata.
   Era li, finita: il markup, nove regole di CSS, l'enso che si disegna, il testo,
   il bottone «Inizia». E maybeOnboard fa una cosa che non fa nessun altro - chiede
   il microfono nel momento giusto, dietro un gesto vero, che e l'unico modo perche
   iOS lo conceda. Non la chiamava nessuno: chi apriva Sentiero per la prima volta
   non vedeva niente di tutto questo. Va prima della soglia: a chi arriva oggi non
   si mostra il frutto di ieri, si mostra la porta.
   (Chi ha gia dei dati non la vede: maybeOnboard se ne accorge da sola e passa oltre.) */
/* v197: la domanda della Chiamata a terra si prepara adesso, in sottofondo, cosi
   quando lui aprira la porta e gia nel cassetto e non deve aspettare nessuno. */
/* v271: la preparazione anticipata della domanda non parte piu all'avvio.
   La riga resta, disinnescata a monte, cosi il ramo e visibile a chi legge. */
try{ const _pt=preparaDomandaTerra();
     if(_pt&&_pt.catch) _pt.catch(function(e){ try{ regCantiere('errore',{msg:'preparaDomandaTerra: '+String((e&&e.message)||e).slice(0,120)}); }catch(_){} }); }catch(_){}
/* v218: accendiLingua e async, e un try/catch attorno alla chiamata non puo
   prendere una promessa rotta - e la famiglia K del lint, che infatti l'ha
   beccata appena scritta. Il catch va agganciato alla promessa. */
accendiLingua().catch(function(){});
try{ maybeOnboard(); }catch(e){ try{ regCantiere('errore',{msg:'onboard: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} }
try{ accendiMettiInHome(); }catch(e){ try{ regCantiere('errore',{msg:'mettiInHome: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} }
/* v185: era «try{ apriSoglia(); }catch(_){}». Una funzione async NON lancia:
   restituisce una promessa, e se quella si rompe il try/catch non vede niente.
   E' cosi che un guasto e rimasto invisibile per diciotto versioni. Ora si
   aggancia il catch alla promessa, e quello che cade finisce nel cantiere. */
try{ const _ps=apriSoglia();
  if(_ps&&_ps.catch) _ps.catch(function(e){ try{ regCantiere('errore',{msg:'soglia: '+String((e&&e.message)||e).slice(0,140)}); }catch(_){} });
}catch(_){}   /* v167: il frutto sta nella finestra d'apertura, non nel cassetto */   /* i capitoli: il mese finito si rilega da solo, alla prima apertura del nuovo */
/* v188 — tolto «il segnavia impara a tacere».
   Non e stata una scelta di gusto: la barra che doveva attenuarsi NON ESISTE PIU.
   Quando il foglio ha preso il posto delle pagine, il <nav> e sparito dal
   documento e sono rimasti indietro il timer da cinque secondi, un ascoltatore
   su ogni tocco della pagina, e quattordici regole CSS che vestivano un elemento
   che non c'era. Se un giorno quell'idea torna - si attenua quando non serve, al
   tocco riprende - va scritta su qualcosa che esiste. */
try{ initSoundSystem(); }catch(_){}    /* Suoni dell'app: pre-decodifica i suoni già assegnati */
window.addEventListener('pointerdown',()=>{ _lastUserAct=Date.now(); },{passive:true});  /* ogni tocco reale: i suoni automatici partono solo dietro un'azione */
/* orologio del giorno: ogni minuto, se una task con orario è appena affiorata, aggiorna la lista da sola */
let _lastDueSig='';
/* v258 — L'OROLOGIO DEL GIORNO NON GIRA A VUOTO.
   Ogni minuto questo controlla se una cosa con l'orario e appena affiorata, e
   se e cambiato qualcosa RIDISEGNA la lista. Girava anche a schermo coperto: un
   ridisegno che nessuno vede e batteria buttata, e sull'SE la batteria e il
   problema vero. Ora a schermo coperto tace, e appena si torna a guardare
   controlla SUBITO - cosi non si perde niente, si smette solo di lavorare per
   nessuno. */
function _orologioDelGiorno(){
  if(document.hidden) return;
  try{
    const checks=S.checks[todayKey()]||{}; const nm=nowMin();
    const sig=todaysScheduled().filter(t=>{ const tm=hmToMin(t.time); return tm!=null&&tm<=nm&&checks[t.id]!==true; }).map(t=>t.id).join(',');
    if(sig!==_lastDueSig){ _lastDueSig=sig; try{ renderTasks(); }catch(_){} try{ renderFlow(); }catch(_){} }
  }catch(_){}
}
setInterval(_orologioDelGiorno,60000);
document.addEventListener('visibilitychange',function(){ if(!document.hidden) _orologioDelGiorno(); });
/* rete di sicurezza audio: il primo tocco ovunque sblocca la colonna sonora (iOS esige un gesto) */
(function(){
  function firstGesture(){
    try{ if(S.settings.music) syncAdaptiveMusic(true); }catch(_){}
    try{ unlockAudioOnUserGesture(); }catch(_){}   /* sblocca anche i Suoni dell'app */
    try{ startBaseLoop(); }catch(_){}              /* avvia la canzone di base scelta dall'utente, se impostata */
    window.removeEventListener('pointerdown',firstGesture);
    window.removeEventListener('touchend',firstGesture);
  }
  window.addEventListener('pointerdown',firstGesture,{passive:true});
  window.addEventListener('touchend',firstGesture,{passive:true});
})();
/* la posizione si attiva solo su scelta esplicita (switch in Altro) o sul pin: niente richieste a freddo */
/* v186 — tolto l'ascoltatore che commutava «scrolled».
   Doveva compattare la testata allo scroll, ma nessuna regola CSS ha mai vestito
   quella classe: il lavoro lo fa --fp, guidato da fpDaScroll, che e un'altra
   strada per la stessa cosa. Era un residuo di un tentativo precedente, e
   costava un rAF a ogni frame di scorrimento per non cambiare niente. */
/* ── apertura: la SOGLIA è l'unica porta; qui restano i lavori di servizio ── */
try{ const appEl=document.querySelector('#app'); if(appEl) appEl.style.opacity='1'; }catch(_){}
try{ document.addEventListener('pointerdown',()=>{ try{ if(S.settings.music) syncAdaptiveMusic(true); }catch(_){} },{once:true}); }catch(_){}

/* ======================================================================
   ONBOARDING + PERMESSI (una sola volta, nel contesto giusto)
   ====================================================================== */
function isStandalone(){
  return (window.navigator&&window.navigator.standalone===true) ||
         (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
}
/* v222 — l'avviso che tiene in vita il diario di chi lo apre dal browser.
   Tre condizioni, tutte e tre necessarie:
     · e un iPhone o un iPad, perche la regola dei sette giorni e di WebKit;
     · non e stata messa in Home, perche li dentro la regola non vale;
     · e in piedi la memoria del browser, perche se non c'e il problema e un altro.
   Si ricontrolla quando l'app torna in primo piano: chi la installa mentre e
   aperta se la vede sparire da sola, senza dover capire perche. */
function iOSVero(){
  const ua=navigator.userAgent||'';
  return /iPad|iPhone|iPod/.test(ua) ||
         (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
function aggiornaMettiInHome(){
  try{
    const el=document.querySelector('#metti-in-home');
    if(!el) return;
    const serve = iOSVero() && !isStandalone();
    el.classList.toggle('hidden',!serve);
  }catch(_){}
}
function accendiMettiInHome(){
  try{
    const b=document.querySelector('#mih-come');
    /* «Come» apre la pagina d'ingresso, che le istruzioni per il telefono che hai
       in mano le ha gia e le mette per prime. Un secondo posto dove scriverle
       sarebbe un secondo posto da tenere aggiornato. */
    if(b) b.onclick=()=>{ try{ window.open('./inizia.html','_blank','noopener'); }catch(_){ location.href='./inizia.html'; } };
    aggiornaMettiInHome();
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) aggiornaMettiInHome(); });
    if(window.matchMedia){
      const mq=window.matchMedia('(display-mode: standalone)');
      if(mq.addEventListener) mq.addEventListener('change',aggiornaMettiInHome);
      else if(mq.addListener) mq.addListener(aggiornaMettiInHome);
    }
  }catch(_){}
}
function maybeOnboard(){
  let seen=false;
  try{ seen=localStorage.getItem('sentiero-onboarded')==='1'; }catch(_){}
  /* chi ha già usato l'app (ha dati) è di fatto onboardato: niente seconda schermata */
  if(!seen){
    const haDati=(S.diary&&S.diary.length>0)||(S.quests&&S.quests.length>0)||(Array.isArray(S.questLog)&&S.questLog.length>0);
    if(haDati){ try{ localStorage.setItem('sentiero-onboarded','1'); }catch(_){} seen=true; }
  }
  if(seen){ try{ if(S.settings.music) syncAdaptiveMusic(true); }catch(_){} return; }
  const ob=document.querySelector('#onboard');
  const note=document.querySelector('#ob-note');
  /* v222: diceva «per i permessi permanenti e le notifiche». Era la ragione
     sbagliata, e la ragione sbagliata non convince nessuno a fare una cosa che
     costa dieci secondi. La ragione vera e che su iPhone, restando nel browser,
     dopo qualche giorno sparisce quello che hai scritto. */
  if(!isStandalone()) note.textContent = iOSVero()
    ? 'Prima però mettilo in Home: Condividi → «Aggiungi alla schermata Home». Se lo lasci nel browser, dopo qualche giorno l’iPhone cancella quello che hai scritto.'
    : 'Suggerimento: aggiungilo alla schermata Home. Si apre più in fretta e funziona anche senza rete.';
  ob.classList.remove('hidden');

  /* v224: «Inizia» non chiude piu la schermata, apre la domanda. Chiudere e
     lasciare uno sconosciuto davanti a un'app vuota era esattamente il punto in
     cui, in prova, una persona si e fermata. */
  const chiudi=()=>{
    ob.style.transition='opacity .4s ease'; ob.style.opacity='0';
    setTimeout(()=>{ ob.classList.add('hidden'); try{ avviaMano(); }catch(_){} },400);
  };
  document.querySelector('#ob-go').onclick=async()=>{
    try{ localStorage.setItem('sentiero-onboarded','1'); }catch(_){}
    /* chiede il microfono una volta, nel momento giusto, con un gesto utente reale */
    await primeMicPermission();
    try{ if(S.settings.music) syncAdaptiveMusic(true); }catch(_){}  /* dopo il microfono, sblocca e avvia la musica */
    const rito=document.querySelector('#ob-rito');
    const go=document.querySelector('#ob-go'), nota=document.querySelector('#ob-note');
    if(!rito){ chiudi(); return; }
    if(go) go.style.display='none';
    if(nota) nota.style.display='none';
    rito.classList.remove('hidden');
    try{ document.querySelector('#ob-rito-txt').focus(); }catch(_){}
  };
  const salva=()=>{
    const inp=document.querySelector('#ob-rito-txt');
    const v=String((inp&&inp.value)||'').trim();
    if(v){
      /* ogni giorno, senza orario: la forma piu innocua che esista. Un orario
         vorrebbe dire una notifica, e una notifica il primo giorno e' una fretta
         che quest'app non mette. */
      S.scheduled=[{id:'r'+Date.now().toString(36),titolo:clampStr(v,80),
                    days:[0,1,2,3,4,5,6],time:'',date:'',nata:todayKey()}];
      save();
      try{ renderTasks(); renderSettings(); updateRing(); }catch(_){}
    }
    chiudi();
  };
  const b1=document.querySelector('#ob-rito-ok'), b2=document.querySelector('#ob-rito-salta');
  if(b1) b1.onclick=salva;
  if(b2) b2.onclick=chiudi;
  const inp=document.querySelector('#ob-rito-txt');
  if(inp) inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); salva(); } };
}

/* ══════════════════════════════════════════════════════════════════════════
   LA MANO GUIDATA (v224)

   Quattro passi. Ognuno accende un pezzo VERO dello schermo, misurato con
   getBoundingClientRect: se domani il cerchio si sposta, il buco lo segue da
   solo. Se un elemento non c'e, il passo si salta invece di accendere il vuoto.

   Nasce da una prova sul campo: su uno schermo piccolo, davanti alla prima
   schermata, una persona non ha capito cosa toccare. Il testo spiega a chi
   legge; il dito indica a chiunque.

   Si salta a ogni passo, e saltata una volta non torna mai piu.
   ══════════════════════════════════════════════════════════════════════════ */
const MANO_LS='sentiero-mano';
const MANO_PASSI=[
  {sel:'#mic',        txt:'Tocca qui e di’ quello che ti passa per la testa. Tocca di nuovo per fermare: resta scritto.'},
  {sel:'#sec-today-quests', txt:'Le cose che dici di voler fare finiscono qui sotto da sole. Nessuno te le cancella se passa una settimana.'},
  {sel:'#nascita-apri', txt:'Se preferisci scriverle a mano invece che dirle, si aggiungono da qui.'},
  {sel:'#barra a[data-sez="altro"]', txt:'Altro è sempre qui: impostazioni, guida, dati e versione Generativa vivono nella quarta voce della barra.'}
];
let _manoI=0;
function manoFinita(){
  try{ return localStorage.getItem(MANO_LS)==='1'; }catch(_){ return true; }
}
function chiudiMano(){
  try{ localStorage.setItem(MANO_LS,'1'); }catch(_){}
  const t=document.querySelector('#tour'); if(t) t.classList.add('hidden');
}
function disegnaMano(){
  const t=document.querySelector('#tour'); if(!t) return;
  /* salta i passi il cui bersaglio non c'e o non si vede: meglio un passo in
     meno che un buco acceso sul nulla */
  while(_manoI<MANO_PASSI.length){
    const el=document.querySelector(MANO_PASSI[_manoI].sel);
    const r=el?el.getBoundingClientRect():null;
    if(r&&r.width>4&&r.height>4) break;
    _manoI++;
  }
  if(_manoI>=MANO_PASSI.length){ chiudiMano(); return; }
  const passo=MANO_PASSI[_manoI];
  const el=document.querySelector(passo.sel);
  /* se il pezzo da indicare e fuori dallo schermo, prima si porta a tiro:
     accendere un buco su qualcosa che non si vede non indica niente. */
  try{
    const r0=el.getBoundingClientRect();
    if(r0.top<0||r0.bottom>window.innerHeight) el.scrollIntoView({block:'center',behavior:'auto'});
  }catch(_){}
  const r=el.getBoundingClientRect();
  const pad=8;
  const buco=document.querySelector('#tour-buco');
  buco.style.top=Math.max(0,r.top-pad)+'px';
  buco.style.left=Math.max(0,r.left-pad)+'px';
  buco.style.width=Math.min(window.innerWidth,r.width+pad*2)+'px';
  buco.style.height=(r.height+pad*2)+'px';
  document.querySelector('#tour-txt').textContent=T(passo.txt);
  document.querySelector('#tour-conta').textContent=(_manoI+1)+' / '+MANO_PASSI.length;
  document.querySelector('#tour-avanti').textContent=T(_manoI===MANO_PASSI.length-1?'Ho capito':'Avanti');
  /* v228 — LA SCHEDA NON PUO USCIRE DALLO SCHERMO. MAI.

     Al secondo passo, su una finestra alta, l'app si bloccava del tutto: il velo
     copre tutto e la scheda con «Avanti» finiva SOTTO il bordo dello schermo.
     Niente tasto avanti, niente tasto salta, niente scorrimento - l'unica via
     d'uscita era chiudere l'app. Su un telefono lungo poteva capitare uguale.

     La causa: si sceglieva fra «sotto il buco» e «sopra il buco» e si teneva il
     risultato com'era. Se il bersaglio stava in fondo, tutte e due le posizioni
     cadevano fuori.

     Adesso: si sceglie, e POI si costringe dentro lo schermo. Una scheda che si
     puo toccare e la condizione perche la mano guidata non diventi una gabbia. */
  const box=document.querySelector('#tour-box');
  box.style.top='0px';
  /* offsetHeight, non getBoundingClientRect: il primo da sempre l'altezza vera
     dell'elemento, il secondo puo tornare zero se qualcosa nella catena non e
     ancora impaginato - e con zero si finiva a usare un valore di ripiego piu
     piccolo del vero, mettendo la scheda dove non ci stava. */
  const h=Math.max(box.offsetHeight||0, box.getBoundingClientRect().height||0, 160);
  const H=window.innerHeight;
  const sotto=r.bottom+pad+12, sopra=r.top-pad-12-h;
  let y=(sotto+h<H-12)?sotto:sopra;
  if(!(y>=0)) y=12;
  y=Math.max(12, Math.min(y, H-h-12));     /* dentro lo schermo, sempre */
  box.style.top=y+'px';
}
function avviaMano(){
  if(manoFinita()) return;
  const t=document.querySelector('#tour'); if(!t) return;
  _manoI=0;
  t.classList.remove('hidden');
  const avanti=()=>{ _manoI++; if(_manoI>=MANO_PASSI.length) chiudiMano(); else disegnaMano(); };
  const av=document.querySelector('#tour-avanti'), sa=document.querySelector('#tour-salta');
  if(av) av.onclick=avanti;
  if(sa) sa.onclick=chiudiMano;

  /* v228 — DUE VIE D'USCITA IN PIU, e non sono un vezzo.
     Il velo copre tutto lo schermo: finche e acceso, l'app non risponde a
     nient'altro. Se per qualsiasi ragione il tasto «Avanti» non si potesse
     toccare, la persona resterebbe chiusa dentro senza capire perche - ed e
     successo davvero, alla v227, al secondo passo.
     Quindi: un tocco in un punto qualunque del velo va avanti, e il tasto Esc
     chiude. Una schermata che copre tutto deve avere piu di una porta. */
  t.onclick=e=>{ if(e.target===t) avanti(); };
  document.addEventListener('keydown',e=>{
    if(t.classList.contains('hidden')) return;
    if(e.key==='Escape') chiudiMano();
    else if(e.key==='Enter'||e.key===' ') avanti();
  });
  window.addEventListener('resize',()=>{ if(!t.classList.contains('hidden')) disegnaMano(); });
  /* un istante di respiro: l'app ha appena finito di disegnarsi */
  setTimeout(disegnaMano,260);
}
/* "scalda" il permesso microfono: avvio+stop immediato così iOS chiede ORA, non a metà dettatura */
async function primeMicPermission(){
  if(!SR) return;
  try{
    if(navigator.permissions&&navigator.permissions.query){
      const st=await navigator.permissions.query({name:'microphone'}).catch(()=>null);
      if(st&&st.state==='granted') return; /* già concesso: non ridisturbare */
    }
  }catch(_){}
  try{
    const probe=new SR(); probe.lang=locale();
    probe.onerror=()=>{}; probe.onstart=()=>{ try{probe.stop()}catch(_){} };
    probe.start();
    setTimeout(()=>{ try{probe.stop()}catch(_){} },400);
  }catch(_){}
}

/* v273 — il journal asincrono parte dopo che tutto il runtime storico esiste.
   Il checkpoint localStorage e gia utilizzabile: IndexedDB e la rete non possono
   bloccare il primo disegno. Un merge remoto rientra dallo stesso sanitizzatore
   e dalla stessa porta di salvataggio di qualunque dato locale. */
let _syncLoadPromise=null,_syncSubscribed=false;
function initSentieroSync(){
  if(!window.SentieroSync)return Promise.reject(new Error('SYNC_LOAD'));
  if(!_syncSubscribed){_syncSubscribed=true;window.SentieroSync.subscribe(()=>{if(_settingsPage==='devices')renderSyncPanel(false);});}
  return window.SentieroSync.bootstrap(S,{onRemote:function(next){
    try{
      S=sanitizeState(next,defaultState);
      salvaSubito();
      render(); renderTasks(); renderTodayQuests([]); renderQuests([]); updateRing();
      segnalaStatoGiorno();
      if(typeof renderSettings==='function') renderSettings();
    }catch(_){}
  }});
}
function caricaSentieroSync(){
  if(window.SentieroSync)return initSentieroSync(); if(_syncLoadPromise)return _syncLoadPromise;
  _syncLoadPromise=new Promise((ok,no)=>{const s=document.createElement('script');s.src='./sentiero-sync.js?v=60.274.2';s.onload=()=>initSentieroSync().then(ok,no);s.onerror=no;document.head.appendChild(s);});return _syncLoadPromise;
}
try{
  const _loadJournal=()=>caricaSentieroSync().catch(function(){ try{ regCantiere('errore',{msg:'journal locale non disponibile'}); }catch(_){} });
  if('requestIdleCallback' in window) requestIdleCallback(_loadJournal,{timeout:1600}); else setTimeout(_loadJournal,700);
}catch(_){}
