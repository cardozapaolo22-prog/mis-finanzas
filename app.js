// Mis Finanzas v3 — lógica de la app
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOW = ["L","M","M","J","V","S","D"];
const DEF_IN = ["Sueldo","Horas extra","Freelance","Otros ingresos"];
const DEF_OUT = ["Vivienda","Comida","Transporte","Celular / Internet","Servicios","Tarjetas / Deudas","Salud","Educación","Ocio","Compras","Otros"];
const DEF_COLOR = "#3a5cf0";
const DIAS_MES = 30;
const MODS_DEF = ["alertas","comparacion","cuentas","categorias","proximos","prestamos","metas","movimientos"];
const MOD_NAMES = {alertas:"Alertas",comparacion:"Planeado, real y proyectado",cuentas:"Cuentas y patrimonio",categorias:"Gastos por categoría",proximos:"Próximos movimientos",prestamos:"Préstamos y deudas",metas:"Metas de ahorro",movimientos:"Ingresos y gastos del mes"};
const TIPOS_CUENTA = [["efectivo","Efectivo"],["yape","Yape"],["plin","Plin"],["banco","Cuenta bancaria"],["billetera","Billetera digital"],["otra","Otra"]];
const FREQS = [["","No se repite"],["diaria","Cada día"],["semanal","Cada semana"],["quincenal","Cada 15 días"],["mensual","Cada mes"],["anual","Cada año"],["cada","Cada cierto número de días"]];

const fmtPEN = new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2,maximumFractionDigits:2});
const fmtUSD = new Intl.NumberFormat("es-PE",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
const money = (v,cur) => cur==="USD" ? fmtUSD.format(v||0).replace(/USD\s?|US\$\s?/,"US$ ") : fmtPEN.format(v||0);
const pct = v => (isFinite(v)?(v*100).toFixed(1):"0.0")+"%";
const num = v => { const n = parseFloat(String(v).replace(",",".")); return isFinite(n)?n:null; };
const r2 = v => Math.round((v||0)*100)/100;
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const todayISO = () => iso(new Date());
const parseISO = s => { const [y,m,d] = (s||"").split("-").map(Number); return y ? new Date(y,(m||1)-1,d||1) : null; };
const addDays = (s,n) => { const d = parseISO(s); d.setDate(d.getDate()+n); return iso(d); };
const lastDay = (y,m) => new Date(y,m+1,0).getDate();
const monthEnd = (y,m) => iso(new Date(y,m,lastDay(y,m)));
const monthStart = (y,m) => iso(new Date(y,m,1));
const fdate = f => f ? f.split("-").reverse().join("/") : "";
const fshort = f => { const d = parseISO(f); return d ? d.getDate()+" "+MESES[d.getMonth()].slice(0,3) : ""; };
const initials = s => (s||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();

const now = new Date();
const S = { view:"inicio", mode:"mes", y:now.getFullYear(), m:now.getMonth(), docs:{}, store:null, email:"", name:"", photo:"", selDay:todayISO(), pd:"p", cat:null, catMode:"real" };
try {
  const v = sessionStorage.getItem("mf-view");
  if (v) S.view = {mes:"inicio",anio:"inicio",deudas:"prestamos"}[v] || v;
  if (v==="anio") S.mode = "anio";
  if (v==="deudas") S.pd = "d";
} catch(e) {}
let OPEN = {}; try { OPEN = JSON.parse(localStorage.getItem("mf-open")||"{}"); } catch(e) {}
const isOpen = (id,def) => id in OPEN ? OPEN[id] : def;
function setOpen(id,v){ OPEN[id]=v; try{ localStorage.setItem("mf-open",JSON.stringify(OPEN)); }catch(e){} }

/* ======================= datos ======================= */
const key = (y,m) => "m-"+y+"-"+String(m+1).padStart(2,"0");
const keyOf = f => { const d = parseISO(f); return d ? key(d.getFullYear(),d.getMonth()) : key(S.y,S.m); };
const docItems = id => (S.docs[id]||{}).items || [];
const list = id => (S.docs[id]||{}).items || [];
const debts = () => list("deudas");
const loans = () => list("prestamos");
const accounts = () => list("cuentas");
const goals = () => list("metas");
const recs = () => list("recurrentes");
const prefs = () => S.docs["ajustes"] || {};
const cats = tipo => { const a = prefs(); return (tipo==="in"?a.catIn:a.catOut) || (tipo==="in"?DEF_IN:DEF_OUT); };
const acc = id => accounts().find(a=>a.id===id);
const curOf = mv => (acc(mv.cuenta)||{}).moneda==="USD" ? "USD" : "PEN";
const monthDocs = () => Object.keys(S.docs).filter(k=>k.startsWith("m-"));
const docMonthStart = id => { const [,y,m] = id.split("-"); return y+"-"+m+"-01"; };
function allStored(){ const out=[]; for (const id of monthDocs()) for (const it of docItems(id)) out.push({...it,_doc:id,_date:it.fecha||docMonthStart(id)}); return out; }
const isDone = it => it.real!=null;

/* ---------- recurrentes ---------- */
function occurrences(r,from,to){
  const out=[]; if (!r.inicio || r.activa===false && !r.fin) return out;
  const end = r.fin && r.fin<to ? r.fin : to;
  const start = parseISO(r.inicio); if (!start) return out;
  const step = {diaria:1,semanal:7,quincenal:15,cada:Math.max(1,r.cada||1)}[r.freq];
  let guard=0;
  if (step){
    let d = new Date(start);
    if (iso(d)<from){ const diff = Math.floor((parseISO(from)-d)/86400000); d.setDate(d.getDate()+Math.floor(diff/step)*step); }
    while (iso(d)<=end && guard++<800){ if (iso(d)>=from) out.push(iso(d)); d.setDate(d.getDate()+step); }
  } else if (r.freq==="mensual"||r.freq==="anual"){
    const day = start.getDate(); let y=start.getFullYear(), m=start.getMonth();
    while (guard++<400){
      const d = new Date(y,m,Math.min(day,lastDay(y,m))), s=iso(d);
      if (s>end) break; if (s>=from) out.push(s);
      if (r.freq==="mensual"){ m++; if (m>11){m=0;y++;} } else y++;
    }
  }
  return out;
}
function virtualRecs(from,to){
  const done = new Set(allStored().filter(x=>x.recId).map(x=>x.recId+"|"+x.recDate));
  const out=[];
  for (const r of recs()) for (const d of occurrences(r,from,to)){
    if (done.has(r.id+"|"+d) || (r.omit||[]).includes(d)) continue;
    out.push({id:"v-"+r.id+"-"+d,virtual:"rec",recId:r.id,recDate:d,tipo:r.tipo,concepto:r.concepto,cat:r.cat,fecha:d,plan:r.importe,real:null,cuenta:r.cuenta||null,cuentaDestino:r.cuentaDestino||null,_date:d});
  }
  return out;
}

/* ---------- préstamos ---------- */
function daysBetween(a,b){ return Math.max(0, Math.round((b - a)/86400000)); }
function loanCalc(p,atISO){
  const monto = p.monto||0, tasa = (p.tasa||0)/100;
  const porDia = monto*tasa/DIAS_MES, porMes = monto*tasa;
  const ini = parseISO(p.fecha);
  const at = atISO || todayISO();
  const fin = p.estado==="pagado" && p.fechaPago ? parseISO(p.fechaPago < at ? p.fechaPago : at) : parseISO(at);
  const dias = ini ? daysBetween(ini,fin) : 0;
  const interes = porDia*dias;
  return {monto,porDia,porMes,dias,interes,total:monto+interes};
}
const ESTADOS = [["activo","Activo"],["atrasado","Atrasado"],["pagado","Pagado"]];
const estadoLabel = e => (ESTADOS.find(x=>x[0]===e)||ESTADOS[0])[1];
const loanLate = p => p.estado==="atrasado" || (p.estado!=="pagado" && p.vence && p.vence<todayISO());

/* ---------- movimientos del mes (guardados + programados + intereses cobrados) ---------- */
function monthMovs(y,m){
  const id = key(y,m), a = monthStart(y,m), b = monthEnd(y,m);
  const stored = docItems(id).map(it=>({...it,_doc:id,_date:it.fecha||a}));
  const virt = virtualRecs(a,b);
  const interest = loans().filter(p=>p.estado==="pagado" && p.fechaPago>=a && p.fechaPago<=b).map(p=>{
    const c = loanCalc(p);
    return {id:"i-"+p.id,virtual:"loan",loanId:p.id,tipo:"in",concepto:"Interés · "+(p.nombre||"préstamo"),cat:"Intereses de préstamos",fecha:p.fechaPago,plan:null,real:r2(c.interes),cuenta:null,_date:p.fechaPago};
  }).filter(x=>x.real>0);
  return [...stored,...virt,...interest];
}
function totals(listM){
  const t = {inR:0,inP:0,inJ:0,outR:0,outP:0,outJ:0,catR:{},catP:{},usdIn:0,usdOut:0,pendIn:0,pendOut:0};
  for (const it of listM){
    if (it.tipo==="tr") continue;
    const r = it.real, p = it.plan;
    if (curOf(it)==="USD"){ if (r!=null){ if (it.tipo==="in") t.usdIn+=r; else t.usdOut+=r; } continue; }
    const proj = r!=null ? r : (p||0);
    if (it.tipo==="in"){ t.inR+=r||0; t.inP+=p||0; t.inJ+=proj; if (r==null && p) t.pendIn+=p; }
    else { const c = it.cat||"Otros"; t.outR+=r||0; t.outP+=p||0; t.outJ+=proj; t.catR[c]=(t.catR[c]||0)+(r||0); t.catP[c]=(t.catP[c]||0)+(p||0); if (r==null && p) t.pendOut+=p; }
  }
  t.bal=t.inR-t.outR; t.balP=t.inP-t.outP; t.balJ=t.inJ-t.outJ;
  t.rate = t.inR>0 ? t.bal/t.inR : 0; t.rateJ = t.inJ>0 ? t.balJ/t.inJ : 0;
  return t;
}

/* ---------- saldos y patrimonio ---------- */
function ledger(){
  const ev=[]; // {date, cuenta, amt}
  for (const it of allStored()){
    if (!isDone(it)) continue;
    const d = it._date;
    if (it.tipo==="in" && it.cuenta) ev.push({date:d,cuenta:it.cuenta,amt:it.real,it});
    else if (it.tipo==="out" && it.cuenta) ev.push({date:d,cuenta:it.cuenta,amt:-it.real,it});
    else if (it.tipo==="tr"){ if (it.cuenta) ev.push({date:d,cuenta:it.cuenta,amt:-it.real,it}); if (it.cuentaDestino) ev.push({date:d,cuenta:it.cuentaDestino,amt:it.real,it}); }
  }
  for (const p of loans()){
    if (p.cuenta && p.fecha) ev.push({date:p.fecha,cuenta:p.cuenta,amt:-(p.monto||0),label:"Préstamo a "+(p.nombre||"")});
    if (p.estado==="pagado" && p.cuentaCobro && p.fechaPago) ev.push({date:p.fechaPago,cuenta:p.cuentaCobro,amt:loanCalc(p).total,label:"Cobro de "+(p.nombre||"")});
  }
  for (const d of debts()) for (const a of d.abonos||[]) if (a.cuenta) ev.push({date:a.fecha,cuenta:a.cuenta,amt:-(a.monto||0),label:"Abono · "+(d.nombre||"")});
  for (const g of goals()) for (const a of g.aportes||[]) if (a.cuenta) ev.push({date:a.fecha,cuenta:a.cuenta,amt:-(a.monto||0),label:(a.monto<0?"Retiro de meta · ":"Meta · ")+(g.nombre||"")});
  return ev;
}
function balances(atISO){
  const ev = ledger(), b = {};
  for (const a of accounts()) b[a.id] = a.saldoInicial||0;
  for (const e of ev) if (!atISO || e.date<=atISO) if (e.cuenta in b) b[e.cuenta]+=e.amt;
  return b;
}
function available(atISO){
  const b = balances(atISO), t = {PEN:0,USD:0,hasUSD:false};
  for (const a of accounts()){ if (a.archivada) continue; const c = a.moneda==="USD"?"USD":"PEN"; t[c]+=b[a.id]||0; if (c==="USD") t.hasUSD=true; }
  return t;
}
function goalSaved(g,atISO){
  const ap = g.aportes||[], sumAp = ap.reduce((s,a)=>s+(a.monto||0),0), legacy = (g.acumulado||0)-sumAp;
  return legacy + ap.filter(a=>!atISO||a.fecha<=atISO).reduce((s,a)=>s+(a.monto||0),0);
}
function debtPaid(d,atISO){
  const ab = d.abonos||[], sumAb = ab.reduce((s,a)=>s+(a.monto||0),0), legacy = (d.abonado||0)-sumAb;
  return Math.min(d.total||0, legacy + ab.filter(a=>!atISO||a.fecha<=atISO).reduce((s,a)=>s+(a.monto||0),0));
}
function worth(atISO){
  const at = atISO || todayISO();
  const cash = available(atISO).PEN;
  const metas = goals().reduce((s,g)=>s+goalSaved(g,atISO),0);
  const capital = loans().filter(p=>p.fecha && p.fecha<=at && !(p.estado==="pagado" && p.fechaPago && p.fechaPago<=at)).reduce((s,p)=>s+(p.monto||0),0);
  const deuda = debts().reduce((s,d)=>s+Math.max(0,(d.total||0)-debtPaid(d,atISO)),0);
  return {cash,metas,capital,deuda,neto:cash+metas+capital-deuda};
}

/* ---------- eventos del calendario ---------- */
function eventsBetween(a,b){
  const out=[];
  const stored = allStored().filter(it=>it.fecha && it.fecha>=a && it.fecha<=b);
  for (const it of [...stored,...virtualRecs(a,b)]) out.push({date:it.fecha,kind:it.tipo==="in"?"in":it.tipo==="tr"?"tr":"out",title:it.concepto||it.cat||"Movimiento",amt:it.real!=null?it.real:(it.plan||0),cur:curOf(it),done:isDone(it),item:it});
  for (const p of loans()){
    if (p.vence && p.estado!=="pagado" && p.vence>=a && p.vence<=b) out.push({date:p.vence,kind:"loan",title:"Cobrar a "+(p.nombre||""),amt:loanCalc(p,p.vence).total,done:false,loan:p});
    if (p.estado==="pagado" && p.fechaPago>=a && p.fechaPago<=b) out.push({date:p.fechaPago,kind:"loan",title:"Cobrado · "+(p.nombre||""),amt:loanCalc(p).total,done:true,loan:p});
  }
  for (const d of debts()){
    const pend = (d.total||0)-debtPaid(d);
    if (d.diaPago && pend>0){
      let s = parseISO(a); s = new Date(s.getFullYear(),s.getMonth(),1);
      for (let g=0; g<14; g++){
        const y=s.getFullYear(), m=s.getMonth(), dd = iso(new Date(y,m,Math.min(d.diaPago,lastDay(y,m))));
        if (dd>b) break;
        if (dd>=a){ const paidThisMonth = (d.abonos||[]).some(x=>x.fecha>=monthStart(y,m) && x.fecha<=monthEnd(y,m)); out.push({date:dd,kind:"debt",title:"Cuota · "+(d.nombre||""),amt:d.cuota||null,done:paidThisMonth,debt:d}); }
        s = new Date(y,m+1,1);
      }
    }
    for (const x of d.abonos||[]) if (x.fecha>=a && x.fecha<=b && !d.diaPago) out.push({date:x.fecha,kind:"debt",title:"Abono · "+(d.nombre||""),amt:x.monto,done:true,debt:d});
  }
  return out.sort((x,y)=>x.date.localeCompare(y.date));
}

/* ======================= tema y color ======================= */
const $ = id => document.getElementById(id);
function show(screen){ for (const s of ["loading","login","denied","app"]) $("screen-"+s).hidden = s!==screen; }
function hexToHsl(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex||""); if (!m) return [230,80,55];
  const n = parseInt(m[1],16), r=(n>>16&255)/255, g=(n>>8&255)/255, b=(n&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2; let h=0, s=0;
  if (max!==min){ const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    h = max===r?(g-b)/d+(g<b?6:0) : max===g?(b-r)/d+2 : (r-g)/d+4; h*=60; }
  return [Math.round(h), Math.round(s*100), Math.round(l*100)];
}
function applyColor(hex){
  let [h,s,l] = hexToHsl(hex);
  s = Math.max(35, Math.min(90, s || 60)); l = Math.max(32, Math.min(52, l)); if (h>=45 && h<=70) l = Math.min(l,40);
  const st = document.documentElement.style;
  st.setProperty("--h",h); st.setProperty("--s",s+"%"); st.setProperty("--l",l+"%");
  try { localStorage.setItem("mf-hsl",JSON.stringify([h,s,l])); localStorage.setItem("mf-color",hex); } catch(e) {}
  $("color-pick").value = hex; updateThemeColor();
}
function applyTheme(t){
  document.documentElement.setAttribute("data-theme",t);
  try { localStorage.setItem("mf-tema",t); } catch(e) {}
  $("btn-theme").textContent = t==="dark" ? "☀️" : "🌙";
  $("btn-theme").setAttribute("aria-label", t==="dark" ? "Cambiar a modo día" : "Cambiar a modo noche");
  updateThemeColor();
}
function updateThemeColor(){ const bg = getComputedStyle(document.body).getPropertyValue("background-color"); if (bg) $("theme-color").setAttribute("content",bg); }
const curTheme = () => document.documentElement.getAttribute("data-theme")||"dark";
function syncPrefs(){
  const p = prefs();
  if (p.tema && p.tema!==curTheme()) applyTheme(p.tema);
  let saved; try { saved = localStorage.getItem("mf-color"); } catch(e) {}
  if (p.color && p.color!==saved) applyColor(p.color);
}
function savePref(k,v){ save("ajustes",{...prefs(),[k]:v}); }
const hueOf = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--h"))||230;
const palette = n => Array.from({length:n},(_,i)=>`hsl(${(hueOf()+170+i*47)%360} 72% 58%)`);

/* ======================= almacenamiento ======================= */
function localStore(){
  const K = "mf-demo"; let data = {};
  try { data = JSON.parse(localStorage.getItem(K)||"{}"); } catch(e) {}
  return { demo:true, subscribe(cb){ cb(data); }, save(id,val){ data[id]=val; try{ localStorage.setItem(K,JSON.stringify(data)); }catch(e){ toast("No se pudo guardar en este navegador."); } }, signOut(){} };
}
async function firebaseStore(cfg){
  const [{initializeApp},A,F] = await Promise.all([import(FB+"firebase-app.js"), import(FB+"firebase-auth.js"), import(FB+"firebase-firestore.js")]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})}); } catch(e){ db = F.getFirestore(app); }
  $("btn-login").onclick = async () => {
    $("login-error").textContent = "";
    const provider = new A.GoogleAuthProvider(); provider.setCustomParameters({prompt:"select_account"});
    try { await A.signInWithPopup(auth,provider); }
    catch(e){
      if (e.code==="auth/popup-blocked" || e.code==="auth/operation-not-supported-in-this-environment") {
        try { await A.signInWithRedirect(auth,provider); } catch(e2){ $("login-error").textContent = "No se pudo abrir el ingreso con Google. Intenta de nuevo."; }
      } else if (e.code!=="auth/popup-closed-by-user" && e.code!=="auth/cancelled-popup-request") {
        $("login-error").textContent = e.code==="auth/unauthorized-domain" ? "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados)." : "No se pudo entrar. Revisa tu conexión e intenta de nuevo.";
      }
    }
  };
  $("btn-logout-denied").onclick = () => A.signOut(auth);
  let unsub = null;
  A.onAuthStateChanged(auth, async user => {
    if (unsub) { unsub(); unsub = null; }
    if (!user) { S.docs = {}; show("login"); return; }
    const email = (user.email||"").toLowerCase();
    S.email = email; S.name = user.displayName||""; S.photo = user.photoURL||"";
    let ok = false;
    try { ok = (await F.getDoc(F.doc(db,"permitidos",email))).exists(); } catch(e) { ok = false; }
    if (!ok) { $("denied-email").textContent = email; show("denied"); return; }
    const col = F.collection(db,"usuarios",user.uid,"datos");
    startApp({
      demo:false,
      subscribe(cb){
        unsub = F.onSnapshot(col, snap => {
          const d = {}; snap.forEach(x => d[x.id] = x.data()); cb(d);
          setStatus(snap.metadata.fromCache ? "Sin conexión: lo que anotes se guardará al volver internet." : "");
        }, () => setStatus("No se pudieron cargar tus datos. Recarga la página."));
      },
      save(id,val){ F.setDoc(F.doc(col,id),val).catch(() => toast("No se pudo guardar. Revisa tu conexión.")); },
      signOut(){ return A.signOut(auth); }
    });
  });
}

function clean(o){ return JSON.parse(JSON.stringify(o,(k,v)=>v===undefined?null:(k.startsWith("_")?undefined:v))); }
let renderQueued = false;
function saveMany(pairs){ for (const [id,data] of pairs){ S.docs[id]=clean(data); S.store && S.store.save(id,S.docs[id]); } render(); }
function save(id,data){ saveMany([[id,data]]); }
const setList = (id,arr) => save(id,{...(S.docs[id]||{}),items:arr});
function snapshot(ids){ return ids.map(id=>[id, S.docs[id] ? JSON.parse(JSON.stringify(S.docs[id])) : {items:[]}]); }
function withUndo(ids,fn,msg){ const snap = snapshot(ids); fn(); toast(msg,{label:"Deshacer",fn:()=>{ saveMany(snap); toast("Listo, lo recuperé."); }}); }

/* guardar un movimiento en el mes de su fecha */
function saveMov(rec,oldDoc){
  const target = keyOf(rec.fecha);
  const pairs = [];
  if (oldDoc && oldDoc!==target) pairs.push([oldDoc,{...(S.docs[oldDoc]||{}),items:docItems(oldDoc).filter(x=>x.id!==rec.id)}]);
  const cur = (oldDoc===target ? docItems(target) : docItems(target).filter(x=>x.id!==rec.id));
  const exists = cur.some(x=>x.id===rec.id);
  const d = parseISO(rec.fecha)||new Date(S.y,S.m,1);
  pairs.push([target,{items:exists?cur.map(x=>x.id===rec.id?rec:x):[...cur,rec],anio:d.getFullYear(),mes:d.getMonth()+1}]);
  saveMany(pairs);
}
function removeMov(it){
  if (it.virtual==="rec"){ const r = recs().find(x=>x.id===it.recId); if (r) withUndo(["recurrentes"],()=>setList("recurrentes",recs().map(x=>x.id===r.id?{...x,omit:[...(x.omit||[]),it.recDate]}:x)),"Omití esta fecha."); return; }
  withUndo([it._doc],()=>setList(it._doc,docItems(it._doc).filter(x=>x.id!==it.id)),"Movimiento eliminado.");
}

/* ======================= utilidades DOM ======================= */
function h(tag,props,...kids){
  const el = document.createElement(tag);
  if (props) for (const k in props){
    const v = props[k]; if (v==null || v===false) continue;
    if (k==="class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2),v);
    else if (k==="text") el.textContent = v;
    else el.setAttribute(k, v===true?"":v);
  }
  for (const c of kids.flat()){ if (c==null||c===false) continue; el.append(c.nodeType?c:document.createTextNode(String(c))); }
  return el;
}
function svgIcon(path){ const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.setAttribute("stroke-linecap","round"); s.setAttribute("stroke-linejoin","round"); s.innerHTML = path; return s; }
const IC = {
  inicio:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  calendario:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  prestamos:'<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  ajustes:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chev:'<path d="M6 9l6 6 6-6"/>',
  alertas:'<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h0"/>',
  comparacion:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cuentas:'<rect x="2" y="6" width="20" height="14" rx="3"/><path d="M2 10h20M16 15h2"/>',
  categorias:'<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  proximos:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  metas:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  movimientos:'<path d="M7 7h13M7 12h13M7 17h13M3 7h0M3 12h0M3 17h0"/>',
  efectivo:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  banco:'<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18"/>',
  billetera:'<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13h2"/>',
  otra:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
  rep:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'
};
function accIcon(a){
  if (a.tipo==="yape") return h("span",{class:"ic",style:"background:linear-gradient(135deg,#7b2cbf,#9d4edd)",text:"Y"});
  if (a.tipo==="plin") return h("span",{class:"ic",style:"background:linear-gradient(135deg,#00b4d8,#0096c7)",text:"P"});
  const s = h("span",{class:"ic"}); s.append(svgIcon(IC[a.tipo]||IC.otra)); return s;
}
let toastTimer;
function toast(msg,action){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const t = h("div",{class:"toast",role:"status"},msg, action?h("button",{onclick:()=>{ action.fn(); t.remove(); }},action.label):null);
  document.body.append(t); clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.remove(), action?6000:2600);
}
function setStatus(t){ $("status").textContent = t; }
const signed = (v,cur) => h("span",{class:v<0?"neg":v>0?"pos":"",text:money(v,cur)});
function bigMoney(v){ const t = money(v), i = t.lastIndexOf("."); return i>0 ? [t.slice(0,i), h("span",{class:"cents",text:t.slice(i)})] : [t]; }
const field = (lab,el) => h("div",{class:"field"},h("label",{for:el.id,text:lab}),el);
function accSelect(id,val,allowNone,label){
  const sel = h("select",{id});
  if (allowNone) sel.append(h("option",{value:""},label||"Sin cuenta"));
  for (const a of accounts().filter(a=>!a.archivada||a.id===val)) sel.append(h("option",{value:a.id,selected:a.id===val},a.nombre+(a.moneda==="USD"?" (US$)":"")));
  return sel;
}
function lastAcc(){ try { const v = localStorage.getItem("mf-lastacc"); return acc(v) && !acc(v).archivada ? v : (accounts().find(a=>!a.archivada)||{}).id||""; } catch(e){ return ""; } }
function setLastAcc(v){ try { if (v) localStorage.setItem("mf-lastacc",v); } catch(e){} }

/* módulo plegable */
function mod(id,{title,icon,summary,body,full,defOpen,actions}){
  const open = isOpen(id,defOpen);
  const wrap = h("div",{class:"glass mod"+(open?" open":"")+(full?" full":"")});
  const ic = h("span",{class:"mod-ic"}); ic.append(svgIcon(IC[icon]||IC.otra));
  const chev = svgIcon(IC.chev); chev.setAttribute("class","chev");
  const head = h("button",{class:"mod-h","aria-expanded":String(open)}, ic, h("span",{class:"mod-t"},h("b",{text:title}),h("span",null,summary)), chev);
  const inner = h("div",{class:"mod-in"});
  let built = false;
  const build = () => { if (built) return; built = true; inner.append(h("div",{class:"mod-b"},body())); };
  if (open) build();
  head.onclick = () => { const o = !wrap.classList.contains("open"); if (o) build(); wrap.classList.toggle("open",o); head.setAttribute("aria-expanded",String(o)); setOpen(id,o); };
  wrap.append(head, h("div",{class:"mod-wrap"},inner));
  return wrap;
}
/* fila plegable */
function lrow({ic,c,m,a,p,body,id,extra}){
  const key = "r-"+id, open = !!OPEN[key];
  const row = h("div",{class:"lrow"+(open?" open":"")});
  const chev = svgIcon(IC.chev); chev.setAttribute("class","chev");
  const head = h("button",{class:"lrow-h","aria-expanded":String(open)}, ic, h("span",{class:"c",text:c}), h("span",{class:"a"},a), chev, h("span",{class:"m"},m), h("span",{class:"p"},p), extra||null);
  const b = h("div",{class:"lrow-b"}); b.hidden = !open; if (open) b.append(...[body()].flat());
  head.onclick = () => { const o = b.hidden; if (o && !b.childNodes.length) b.append(...[body()].flat()); b.hidden = !o; row.classList.toggle("open",o); head.setAttribute("aria-expanded",String(o)); OPEN[key]=o; setOpen(key,o); };
  row.append(head,b); return row;
}
function delBtn(label,fn){
  let armed = false;
  const b = h("button",{class:"btn ghost sm",type:"button",onclick:()=>{
    if (!armed){ armed=true; b.className="btn danger sm"; b.textContent="¿Seguro?"; setTimeout(()=>{ if(b.isConnected){armed=false;b.className="btn ghost sm";b.textContent=label;} },3500); return; }
    fn();
  }},label);
  return b;
}
function modal(content){
  const layer = $("layer");
  const close = () => { layer.replaceChildren(); document.removeEventListener("keydown",esc); };
  const esc = e => { if (e.key==="Escape") close(); };
  document.addEventListener("keydown",esc);
  const ov = h("div",{class:"overlay",onclick:e=>{ if(e.target===ov) close(); }},h("div",{class:"sheet",role:"dialog","aria-modal":"true"},content(close)));
  layer.replaceChildren(ov);
  const f = ov.querySelector("input.amount,input:not([type=date]):not([type=checkbox]),select"); if (f && matchMedia("(pointer:fine)").matches) f.focus();
}
const actions = (close,del,okLabel) => h("div",{class:"actions"},del||null,h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},okLabel||"Guardar")));
const amountInput = (id,val) => h("input",{id,class:"amount",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:val??"",placeholder:"0.00","aria-label":"Importe"});

/* ======================= cabecera y navegación ======================= */
const TABS = [["inicio","Inicio"],["calendario","Calendario"],["fab",""],["prestamos","Préstamos"],["ajustes","Ajustes"]];
function buildTabs(){
  const nav = $("tabs"); nav.replaceChildren();
  for (const [v,label] of TABS){
    if (v==="fab"){ nav.append(h("button",{class:"fab",type:"button","aria-label":"Registrar movimiento",onclick:openQuick},"+")); continue; }
    const b = h("button",{class:"tab",role:"tab","data-v":v,onclick:()=>go(v)}); b.append(svgIcon(IC[v]), h("span",{text:label})); nav.append(b);
  }
  document.body.append(h("button",{class:"fab fab-desk",type:"button","aria-label":"Registrar movimiento",onclick:openQuick},"+"));
}
function go(v){ S.view=v; remember(); render(); window.scrollTo(0,0); }
function renderHeader(){
  const first = (S.name||"").split(" ")[0], hr = new Date().getHours();
  $("hello-sub").textContent = hr<12 ? "Buenos días" : hr<19 ? "Buenas tardes" : "Buenas noches";
  $("hello-name").textContent = first ? "Hola, "+first : "Hola 👋";
  const av = $("avatar");
  if (S.photo){ const img = h("img",{src:S.photo,alt:"",referrerpolicy:"no-referrer",class:"avatar",id:"avatar"}); img.onerror=()=>{ const s=h("span",{class:"avatar",id:"avatar",text:initials(S.name||S.email)}); img.replaceWith(s); }; av.replaceWith(img); }
  else av.textContent = initials(S.name||S.email||"Mis Finanzas");
}
function renderNav(){
  const periodic = S.view==="inicio"||S.view==="calendario";
  $("monthnav").hidden = !periodic;
  $("mlabel").textContent = S.view==="inicio" && S.mode==="anio" ? "Año "+S.y : MESES[S.m]+" "+S.y;
  const sw = $("mswitch"); sw.hidden = S.view!=="inicio";
  sw.replaceChildren(...[["mes","Mes"],["anio","Año"]].map(([v,l])=>h("button",{type:"button","aria-pressed":String(S.mode===v),onclick:()=>{ S.mode=v; remember(); render(); }},l)));
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected",String(b.dataset.v===S.view));
}
function render(){
  if (!S.store) return;
  renderNav();
  const app = $("app"); app.replaceChildren();
  if (S.store.demo) app.append(h("div",{class:"demo",text:"Modo prueba: los datos se guardan solo en este navegador."}));
  const v = {inicio:S.mode==="anio"?viewAnio:viewInicio, calendario:viewCalendario, prestamos:viewPD, ajustes:viewAjustes}[S.view] || viewInicio;
  app.append(...v());
}

/* ======================= INICIO (mes) ======================= */
function heroBox(label,value,minis,extra){
  return h("div",{class:"hero"},
    h("div",{class:"lab",text:label}),
    h("div",{class:"big"},...(typeof value==="number"?bigMoney(value):[value])),
    extra||null,
    h("div",{class:"hrow"},minis.map(([l,v])=>h("div",{class:"mini"},h("span",{text:l}),h("b",{text:v})))));
}
function statusMsg(t,y,m){
  const past = new Date(y,m+1,1) <= new Date(now.getFullYear(),now.getMonth(),1) && !(y===now.getFullYear()&&m===now.getMonth());
  if (t.inP===0 && t.outP===0 && t.inR===0 && t.outR===0) return ["✦","Empieza registrando tus movimientos"];
  if (t.outP>0 && t.outR>t.outP) return ["!","Has superado tu presupuesto"];
  if (t.pendIn>0 && !past) return ["↓","Tienes ingresos pendientes de recibir"];
  if (past && t.outP>0 && t.outR<t.outP) return ["✓","Gastaste menos de lo previsto"];
  if (t.outP>0 && t.outR<t.outP*0.85 && !t.pendOut) return ["✓","Has gastado menos de lo previsto"];
  return ["✓","Vas según lo planificado"];
}

function viewInicio(){
  const L = monthMovs(S.y,S.m), t = totals(L), out = [];
  const [si,sm] = statusMsg(t,S.y,S.m);
  out.push(heroBox("Sobrante real de "+MESES[S.m], t.bal,
    [["Ingresos",money(t.inR)],["Gastos",money(t.outR)],["Ahorro potencial",t.inJ>0?pct(t.rateJ):"—"]],
    h("div",{style:"display:grid;gap:6px"},
      h("span",{class:"hstatus"},h("span",{text:si}),sm),
      h("span",{class:"hproj"},"Proyección al cierre: ",h("b",{text:money(t.balJ)})),
      (t.usdIn||t.usdOut) ? h("span",{class:"usd",text:"En dólares: +"+money(t.usdIn,"USD")+" / −"+money(t.usdOut,"USD")}) : null)));

  const order = (prefs().modulos||{}).order || MODS_DEF;
  const hidden = new Set((prefs().modulos||{}).hidden || []);
  const ids = [...order.filter(x=>MODS_DEF.includes(x)), ...MODS_DEF.filter(x=>!order.includes(x))].filter(x=>!hidden.has(x));
  const dash = h("div",{class:"dash"});
  const ctx = {L,t};
  for (const id of ids){ const node = MODULES[id] && MODULES[id](ctx); if (node) dash.append(node); }
  out.push(dash);
  return out;
}

const MODULES = {
  alertas: ({t}) => {
    if (!(S.y===now.getFullYear() && S.m===now.getMonth())) return null;
    const al = computeAlerts(t); if (!al.length) return null;
    return h("div",{class:"alerts full"},al.map(([kind,txt])=>h("div",{class:"alert "+kind},h("i",{text:kind==="bad"?"!":kind==="info"?"i":kind==="good"?"✓":"!"}),h("span",{text:txt}))));
  },
  comparacion: ({t}) => mod("comparacion",{title:"Planeado, real y proyectado",icon:"comparacion",defOpen:false,
    summary:[h("strong",{text:money(t.outR)})," gastado de ",money(t.outP)," planeado"],
    body:()=>[h("div",{class:"tablewrap"},h("table",{class:"cmp"},
      h("thead",null,h("tr",null,h("th",{text:""}),h("th",{text:"Planeado"}),h("th",{text:"Real"}),h("th",{text:"Proyectado"}))),
      h("tbody",null,
        h("tr",null,h("td",{text:"Ingresos"}),h("td",{text:money(t.inP)}),h("td",{text:money(t.inR)}),h("td",{text:money(t.inJ)})),
        h("tr",null,h("td",{text:"Gastos"}),h("td",{text:money(t.outP)}),h("td",{text:money(t.outR)}),h("td",{text:money(t.outJ)})),
        h("tr",{class:"strong"},h("td",{text:"Sobrante"}),h("td",null,signed(t.balP)),h("td",null,signed(t.bal)),h("td",null,signed(t.balJ)))))),
      h("p",{class:"note",style:"margin:0",text:"Planeado: lo que esperabas · Real: lo que ya pasó · Proyectado: cómo cerrarías el mes si se cumple lo pendiente."})]}),

  cuentas: () => {
    const av = available(), w = worth(), accs = accounts().filter(a=>!a.archivada), bal = balances();
    return mod("cuentas",{title:"Cuentas y patrimonio",icon:"cuentas",defOpen:false,
      summary: accs.length ? [h("strong",{text:money(av.PEN)})," disponible", av.hasUSD?" · "+money(av.USD,"USD"):"", " · patrimonio ",money(w.neto)] : "Agrega Efectivo, Yape, tu banco…",
      body:()=>[
        accs.length ? h("div",{class:"lrows"},accs.map(a=>lrow({id:"acc-"+a.id,ic:accIcon(a),c:a.nombre,m:(TIPOS_CUENTA.find(x=>x[0]===a.tipo)||["","Otra"])[1]+(a.moneda==="USD"?" · US$":""),a:money(bal[a.id],a.moneda),p:"",body:()=>accDetail(a)})))
          : h("p",{class:"note",style:"margin:0",text:"Registra dónde tienes tu dinero para saber cuánto tienes disponible. No se piden datos bancarios: solo un nombre y el saldo actual."}),
        h("div",{class:"mini-list"},
          h("div",null,h("span",{text:"Dinero disponible"}),h("b",{text:money(w.cash)})),
          av.hasUSD ? h("div",null,h("span",{text:"Disponible en dólares"}),h("b",{text:money(av.USD,"USD")})) : null,
          w.metas ? h("div",null,h("span",{text:"Apartado en metas"}),h("b",{text:money(w.metas)})) : null,
          h("div",null,h("span",{text:"Te deben (capital prestado)"}),h("b",{text:money(w.capital)})),
          h("div",null,h("span",{text:"Debes"}),h("b",{class:"neg",text:"−"+money(w.deuda)})),
          h("div",{style:"border-top:1px solid var(--glass-line);padding-top:6px"},h("span",{text:"Patrimonio neto",style:"color:var(--ink);font-weight:600"}),h("b",null,signed(w.neto)))),
        h("div",{class:"mod-act"},h("button",{class:"btn sm",onclick:()=>openAccount({})},"+ Cuenta"), accs.length>1?h("button",{class:"btn ghost sm",onclick:()=>openTransfer({})},"Transferir"):null)]});
  },

  categorias: ({L,t}) => {
    const total = S.catMode==="real" ? t.outR : t.outP;
    return mod("categorias",{title:"Gastos por categoría",icon:"categorias",defOpen:true,full:false,
      summary: total>0 ? [h("strong",{text:money(total)})," en ",String(Object.values(S.catMode==="real"?t.catR:t.catP).filter(v=>v>0).length)," categorías"] : "Todavía no hay gastos este mes",
      body:()=>donutBody(L,t)});
  },

  proximos: () => {
    const a = todayISO(), ev = eventsBetween(a, addDays(a,30)).filter(e=>!e.done && e.kind!=="tr").slice(0,5);
    const nx = ev[0];
    return mod("proximos",{title:"Próximos movimientos",icon:"proximos",defOpen:false,
      summary: nx ? [h("strong",{text:nx.title})," · ",fshort(nx.date),nx.amt?" · "+money(nx.amt,nx.cur):""] : "Nada pendiente en los próximos 30 días",
      body:()=>[ ev.length ? h("div",null,ev.map(evRow)) : h("p",{class:"note",style:"margin:0",text:"Cuando registres gastos programados, cuotas o cobros con fecha, aparecerán aquí."}),
        h("div",{class:"mod-act"},h("button",{class:"btn ghost sm",onclick:()=>go("calendario")},"Ver calendario completo"))]});
  },

  prestamos: () => {
    const vivos = loans().filter(p=>p.estado!=="pagado"), pag = loans().filter(p=>p.estado==="pagado");
    const capital = vivos.reduce((s,p)=>s+(p.monto||0),0), acum = vivos.reduce((s,p)=>s+loanCalc(p).interes,0);
    const cobrado = pag.reduce((s,p)=>s+(p.interesCobrado??loanCalc(p).interes),0);
    const pend = debts().reduce((s,d)=>s+Math.max(0,(d.total||0)-debtPaid(d)),0), pagado = debts().reduce((s,d)=>s+debtPaid(d),0);
    if (!loans().length && !debts().length) return mod("prestamos",{title:"Préstamos y deudas",icon:"prestamos",defOpen:false,summary:"Sin préstamos ni deudas registradas",body:()=>[h("div",{class:"mod-act"},h("button",{class:"btn sm",onclick:()=>{S.pd="p";go("prestamos");}},"Registrar préstamo"),h("button",{class:"btn ghost sm",onclick:()=>{S.pd="d";go("prestamos");}},"Registrar deuda"))]});
    const prox = eventsBetween(todayISO(),addDays(todayISO(),60)).find(e=>!e.done&&(e.kind==="loan"||e.kind==="debt"));
    return mod("prestamos",{title:"Préstamos y deudas",icon:"prestamos",defOpen:false,
      summary:["Te deben ",h("strong",{text:money(capital+acum)})," · debes ",h("strong",{text:money(pend)})],
      body:()=>[h("div",{class:"mini-list"},
        h("div",null,h("span",{text:"Capital por recuperar"}),h("b",{text:money(capital)})),
        h("div",null,h("span",{text:"Intereses acumulados (aún no cobrados)"}),h("b",{text:money(acum)})),
        h("div",null,h("span",{text:"Intereses cobrados"}),h("b",{class:"pos",text:money(cobrado)})),
        h("div",null,h("span",{text:"Deudas pendientes"}),h("b",{class:pend?"neg":"",text:money(pend)})),
        h("div",null,h("span",{text:"Pagos realizados a deudas"}),h("b",{text:money(pagado)})),
        prox ? h("div",null,h("span",{text:"Próximo vencimiento"}),h("b",{text:prox.title+" · "+fshort(prox.date)})) : null),
        h("div",{class:"mod-act"},h("button",{class:"btn ghost sm",onclick:()=>go("prestamos")},"Abrir préstamos y deudas"))]});
  },

  metas: () => {
    const gs = goals();
    const avg = gs.length ? gs.reduce((s,g)=>s+Math.min(1,goalSaved(g)/(g.objetivo||1)),0)/gs.length : 0;
    return mod("metas",{title:"Metas de ahorro",icon:"metas",defOpen:false,
      summary: gs.length ? [h("strong",{text:String(gs.length)}),gs.length===1?" meta · ":" metas · ",pct(avg)+" en promedio"] : "Crea una meta: viaje, laptop, fondo de emergencia…",
      body:()=>[ gs.length ? h("div",{class:"lrows"},gs.map(goalRow)) : null, h("div",{class:"mod-act"},h("button",{class:"btn sm",onclick:()=>openGoal({})},"+ Nueva meta"))]});
  },

  movimientos: ({L,t}) => {
    const prog = L.filter(x=>!isDone(x) && x.tipo!=="tr").length;
    return mod("movimientos",{title:"Ingresos y gastos del mes",icon:"movimientos",defOpen:true,full:true,
      summary:[h("strong",{text:String(L.filter(x=>x.tipo!=="tr").length)})," movimientos",prog?" · "+prog+" programados":""],
      body:()=>{
        if (!L.length){
          const py = S.m===0?S.y-1:S.y, pm = S.m===0?11:S.m-1, prev = docItems(key(py,pm)).filter(x=>x.tipo!=="tr" && !x.recId);
          return [h("div",{class:"empty"},
            h("p",{text:"Este mes está vacío. Toca ➕ para registrar tu primer ingreso o gasto."}),
            prev.length ? h("div",{class:"btnrow"},h("button",{class:"btn ghost",onclick:()=>{
              const items = prev.map(it=>{ const d = parseISO(it.fecha); const f = d ? iso(new Date(S.y,S.m,Math.min(d.getDate(),lastDay(S.y,S.m)))) : monthStart(S.y,S.m); return {...it,id:uid(),real:null,plan:it.plan??it.real,fecha:f}; });
              save(key(S.y,S.m),{items,anio:S.y,mes:S.m+1}); toast("Copié lo planeado de "+MESES[pm]+". Confírmalos cuando se realicen.");
            }},"Copiar lo planeado de "+MESES[pm])) : null)];
        }
        const trs = L.filter(x=>x.tipo==="tr");
        return [h("div",{class:"cols"},movList("in",L,t),movList("out",L,t)),
          trs.length ? h("div",null,h("div",{class:"subhead",text:"Transferencias entre cuentas"}),h("div",{class:"list"},trs.map(movRow))) : null];
      }});
  }
};

function computeAlerts(t){
  const out = [], a = todayISO();
  const soon = eventsBetween(a,addDays(a,3)).filter(e=>!e.done && (e.kind==="out"||e.kind==="debt"));
  const late = loans().filter(loanLate);
  if (late.length) out.push(["bad", late.length===1 ? "El préstamo de "+(late[0].nombre||"")+" está vencido." : "Tienes "+late.length+" préstamos vencidos por cobrar."]);
  const remaining = eventsBetween(a,monthEnd(now.getFullYear(),now.getMonth())).filter(e=>!e.done && (e.kind==="out"||e.kind==="debt") && e.cur!=="USD").reduce((s,e)=>s+(e.amt||0),0);
  const av = available();
  if (accounts().some(x=>!x.archivada) && remaining>0 && av.PEN<remaining) out.push(["bad","Tu saldo disponible ("+money(av.PEN)+") podría no cubrir los pagos que faltan este mes ("+money(remaining)+")."]);
  if (soon.length) out.push(["warn", soon.length===1 ? "Pago próximo: "+soon[0].title+" el "+fshort(soon[0].date)+(soon[0].amt?" ("+money(soon[0].amt,soon[0].cur)+")":"")+"." : "Tienes "+soon.length+" pagos en los próximos 3 días."]);
  const over = Object.keys(t.catP).filter(c=>t.catP[c]>0 && t.catR[c]>t.catP[c]).sort((x,y)=>(t.catR[y]-t.catP[y])-(t.catR[x]-t.catP[x]));
  if (over.length) out.push(["warn","Superaste el presupuesto de "+over[0]+": "+money(t.catR[over[0]])+" de "+money(t.catP[over[0]])+"."]);
  const pm = now.getMonth()===0?11:now.getMonth()-1, py = now.getMonth()===0?now.getFullYear()-1:now.getFullYear();
  const prevOut = totals(monthMovs(py,pm)).outR;
  if (prevOut>0 && t.outR>prevOut*1.1) out.push(["warn","Tus gastos ya superan los del mes pasado ("+money(t.outR)+" vs "+money(prevOut)+")."]);
  if (t.pendIn>0) out.push(["info","Tienes "+money(t.pendIn)+" en ingresos pendientes de recibir."]);
  return out.slice(0,3);
}

/* ---------- dona ---------- */
function donutBody(L,t){
  const src = S.catMode==="real" ? t.catR : t.catP;
  const rows = Object.entries(src).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const total = rows.reduce((s,r)=>s+r[1],0);
  const cols = palette(rows.length);
  const seg = h("div",{class:"seg",style:"max-width:260px"},[["real","Real"],["plan","Planeado"]].map(([v,l])=>h("button",{type:"button","aria-pressed":String(S.catMode===v),onclick:()=>{S.catMode=v;S.cat=null;render();}},l)));
  if (!rows.length) return [seg,h("p",{class:"note",style:"margin:0",text:S.catMode==="real"?"Cuando registres gastos realizados, verás aquí en qué se va tu dinero.":"No hay gastos planeados este mes."})];
  const NS="http://www.w3.org/2000/svg", R=80, r=54, C=100;
  const svg = document.createElementNS(NS,"svg"); svg.setAttribute("viewBox","0 0 200 200"); svg.setAttribute("role","img"); svg.setAttribute("aria-label","Gastos por categoría");
  let ang = -Math.PI/2;
  const arc = (a0,a1) => { const big = a1-a0>Math.PI?1:0, p=(rad,a)=>[C+rad*Math.cos(a),C+rad*Math.sin(a)];
    const [x0,y0]=p(R,a0),[x1,y1]=p(R,a1),[x2,y2]=p(r,a1),[x3,y3]=p(r,a0);
    return `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z`; };
  rows.forEach(([c,v],i)=>{
    const a1 = ang + (v/total)*Math.PI*2 - (rows.length>1?0.02:0);
    const path = document.createElementNS(NS,"path");
    path.setAttribute("d", rows.length===1 ? `M${C} ${C-R}A${R} ${R} 0 1 1 ${C-0.01} ${C-R}L${C-0.01} ${C-r}A${r} ${r} 0 1 0 ${C} ${C-r}Z` : arc(ang,a1));
    path.setAttribute("fill",cols[i]); if (S.cat && S.cat!==c) path.setAttribute("opacity",".3");
    path.addEventListener("click",()=>{ S.cat = S.cat===c?null:c; render(); });
    svg.append(path); ang = a1 + (rows.length>1?0.02:0);
  });
  const tx = (y,txt,size,weight,fill) => { const e=document.createElementNS(NS,"text"); e.setAttribute("x",C); e.setAttribute("y",y); e.setAttribute("text-anchor","middle"); e.setAttribute("font-size",size); e.setAttribute("font-weight",weight); e.setAttribute("fill",fill); e.textContent=txt; svg.append(e); };
  const sel = S.cat && rows.find(r=>r[0]===S.cat);
  tx(94, sel ? sel[0].slice(0,16) : "Total gastos", 11, 500, "var(--muted)");
  tx(116, money(sel?sel[1]:total).replace(/\.\d\d$/,""), 18, 700, "var(--ink)");
  const legend = h("div",{class:"legend2"},rows.map(([c,v],i)=>h("button",{class:"lg"+(S.cat===c?" sel":""),type:"button",onclick:()=>{ S.cat = S.cat===c?null:c; render(); }},
    h("i",{style:"background:"+cols[i]}),h("span",{text:c}),h("em",null,h("b",{text:money(v)})," · "+pct(v/total)))));
  const out = [seg, h("div",{class:"donut-wrap"},h("div",{class:"donut"},svg),legend)];
  if (S.cat){
    const ms = L.filter(x=>x.tipo==="out" && (x.cat||"Otros")===S.cat && (S.catMode==="real"?isDone(x):(x.plan||0)>0));
    out.push(h("div",{class:"catmovs"},h("div",{class:"subhead",style:"margin:6px 0",text:S.cat}),ms.map(movRow)));
  }
  if (t.bal>0 && S.catMode==="real") out.push(h("div",{class:"savebar"},h("span",{text:"Ahorro (sobrante), aparte de los gastos"}),h("b",{class:"pos",text:money(t.bal)+(t.inR>0?" · "+pct(t.bal/t.inR)+" del ingreso":"")})));
  return out;
}

/* ---------- listas de movimientos ---------- */
function movRow(it){
  const done = isDone(it), out = it.tipo==="out", tr = it.tipo==="tr";
  const amt = done ? it.real : it.plan;
  const ic = h("span",{class:"ic"+(out?" out":"")});
  if (it.virtual==="rec"||it.recId) ic.append(svgIcon(IC.rep)); else ic.textContent = initials(it.cat||it.concepto);
  const a = acc(it.cuenta), cur = curOf(it);
  const diff = it.plan!=null && it.real!=null && !tr ? (it.tipo==="in"?it.real-it.plan:it.plan-it.real) : null;
  return h("button",{class:"row",onclick:()=>{ if (it.virtual==="loan") { S.pd="p"; go("prestamos"); } else if (tr) openTransfer(it); else openMov(it); },"aria-label":"Editar "+(it.concepto||"movimiento")},
    ic,
    h("span",{class:"c",text:tr ? (a?a.nombre:"?")+" → "+((acc(it.cuentaDestino)||{}).nombre||"?") : (it.concepto||"(sin nombre)")}),
    h("span",{class:"a"}, (out?"−":tr?"":"+")+money(amt,cur)),
    h("span",{class:"m"}, done ? null : h("span",{class:"prog-chip",text:"Programado"}), h("span",{text:[tr?"Transferencia":it.cat, a&&!tr?a.nombre:null, it.fecha?fshort(it.fecha):null].filter(Boolean).join(" · ")})),
    h("span",{class:"p"}, done && it.plan!=null && it.plan!==it.real ? "Plan "+money(it.plan,cur) : "", diff ? h("span",{class:diff<0?"neg":"pos",text:" ("+(diff>0?"+":"")+money(diff,cur)+")"}) : null));
}
function movList(tipo,L,t){
  const mine = L.filter(i=>i.tipo===tipo).sort((a,b)=>(a._date||"").localeCompare(b._date||""));
  return h("section",null,
    h("div",{class:"sechead"},h("h2",null,tipo==="in"?"Ingresos ":"Gastos ",h("span",{class:"tot",text:money(tipo==="in"?t.inR:t.outR)})),
      h("button",{class:"btn ghost sm",onclick:()=>openMov({tipo})},"+ Agregar")),
    h("div",{class:"list"}, mine.length ? mine.map(movRow) : h("div",{class:"empty",text:tipo==="in"?"Sin ingresos este mes.":"Sin gastos este mes."})));
}

/* ---------- eventos ---------- */
const evColor = k => ({in:"ev-in",out:"ev-out",loan:"ev-loan",debt:"ev-debt",tr:"ev-loan"})[k];
function evRow(e){
  const act = [];
  if (!e.done){
    if (e.item) act.push(h("button",{class:"btn sm",onclick:()=>confirmMov(e.item)},e.kind==="in"?"Ya lo recibí":"Ya lo pagué"));
    if (e.loan) act.push(h("button",{class:"btn sm",onclick:()=>openPaid(e.loan)},"Cobrar"));
    if (e.debt) act.push(h("button",{class:"btn sm",onclick:()=>openAbono(e.debt)},"Abonar"));
  }
  if (e.item) act.push(h("button",{class:"btn ghost sm",onclick:()=>e.kind==="tr"?openTransfer(e.item):openMov(e.item)},"Ver"));
  return h("div",{class:"evrow"},
    h("span",{class:"k "+evColor(e.kind)}),
    h("span",{class:"c",text:e.title}),
    h("span",{class:"a",text:e.amt?(e.kind==="out"||e.kind==="debt"?"−":"+")+money(e.amt,e.cur):""}),
    h("span",{class:"m"},fshort(e.date)+" · ", e.done ? h("span",{class:"done-chip",text:"Realizado"}) : h("span",{class:"prog-chip",text:"Pendiente"})),
    act.length ? h("div",{class:"r"},act) : null);
}

/* ======================= AÑO ======================= */
function yearData(y){ return MESES.map((n,m)=>({n,m,...totals(monthMovs(y,m))})); }
function viewAnio(){
  const data = yearData(S.y);
  const T = data.reduce((a,d)=>({inR:a.inR+d.inR,outR:a.outR+d.outR}),{inR:0,outR:0});
  const bal = T.inR-T.outR, out = [], w = worth();
  out.push(heroBox("Ahorrado en "+S.y, bal, [["Ingresos",money(T.inR)],["Gastos",money(T.outR)],["Patrimonio hoy",money(w.neto)]]));
  const dash = h("div",{class:"dash"});
  dash.append(h("section",{class:"full"},h("div",{class:"sechead"},h("h2",{text:"Ingresos y gastos por mes"})),chartYear(data)));
  const pts = MESES.map((n,m)=>{ const end = monthEnd(S.y,m); return end<=monthEnd(now.getFullYear(),now.getMonth()) && (S.y<now.getFullYear() || m<=now.getMonth()) ? worth(end>todayISO()?todayISO():end).neto : null; });
  dash.append(h("section",{class:"full"},h("div",{class:"sechead"},h("h2",{text:"Evolución del patrimonio"}),h("span",{class:"tot",text:"Lo que tienes + lo que te deben − lo que debes"})),lineChart(pts)));
  const goM = m => { S.m=m; S.mode="mes"; remember(); render(); window.scrollTo(0,0); };
  dash.append(h("section",{class:"full"},h("div",{class:"sechead"},h("h2",{text:"Mes a mes"}),h("span",{class:"tot",text:"Toca un mes para abrirlo"})),
    h("div",{class:"glass tablewrap"},h("table",null,
      h("thead",null,h("tr",null,h("th",{text:"Mes"}),h("th",{text:"Ingresos"}),h("th",{text:"Gastos"}),h("th",{text:"Sobrante"}),h("th",{text:"% ahorro"}))),
      h("tbody",null,data.map(d=>h("tr",{class:"click",tabindex:"0",onclick:()=>goM(d.m),onkeydown:e=>{if(e.key==="Enter")goM(d.m)}},
        h("td",{text:cap(d.n)}),h("td",{text:money(d.inR)}),h("td",{text:money(d.outR)}),h("td",null,signed(d.bal)),h("td",{text:d.inR>0?pct(d.rate):"—"})))),
      h("tfoot",null,h("tr",null,h("td",{text:"Total"}),h("td",{text:money(T.inR)}),h("td",{text:money(T.outR)}),h("td",null,signed(bal)),h("td",{text:T.inR>0?pct(bal/T.inR):"—"})))))));
  out.push(dash);
  return out;
}
function niceScale(min,max){
  if (min===max){ min-=1; max+=1; }
  const span=max-min, p=10**Math.floor(Math.log10(span/4)), step=p*[1,2,2.5,5,10].find(k=>k*p*4>=span);
  return {lo:Math.floor(min/step)*step, hi:Math.ceil(max/step)*step, step};
}
function chartYear(data){
  const NS = "http://www.w3.org/2000/svg", W=720,H=250,L=70,R=12,T=14,B=30,w=W-L-R,hgt=H-T-B;
  const {hi:top,step} = niceScale(0,Math.max(1,...data.map(d=>Math.max(d.inR,d.outR))));
  const y = v => T+hgt-hgt*v/top;
  const s = (tag,a) => { const e=document.createElementNS(NS,tag); for (const k in a) e.setAttribute(k,a[k]); return e; };
  const svg = s("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Ingresos y gastos por mes"});
  const short = new Intl.NumberFormat("es-PE",{notation:top>=10000?"compact":"standard",maximumFractionDigits:1});
  for (let v=0; v<=top+1e-9; v+=step){ svg.append(s("line",{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:"var(--glass-line)"})); const tx = s("text",{x:L-8,y:y(v)+4,"text-anchor":"end","font-size":"11",fill:"var(--muted)"}); tx.textContent="S/ "+short.format(v); svg.append(tx); }
  const band = w/12, bw = Math.min(16,band*0.32);
  data.forEach((d,i)=>{
    const cx = L+band*i+band/2;
    [[d.inR,"var(--accent)",-bw-1],[d.outR,"var(--spend)",1]].forEach(([v,c,off])=>{ if (v>0) svg.append(s("rect",{x:cx+off,y:y(v),width:bw,height:Math.max(1,y(0)-y(v)),rx:4,fill:c})); });
    const cur = S.y===now.getFullYear() && i===now.getMonth();
    const tx = s("text",{x:cx,y:H-10,"text-anchor":"middle","font-size":"11",fill:cur?"var(--ink)":"var(--muted)","font-weight":cur?"700":"400"}); tx.textContent = d.n.slice(0,3); svg.append(tx);
  });
  return h("div",{class:"glass chart"},svg,h("div",{class:"legend"},h("span",null,h("i",{style:"background:var(--accent)"}),"Ingresos"),h("span",null,h("i",{style:"background:var(--spend)"}),"Gastos")));
}
function lineChart(pts){
  const NS = "http://www.w3.org/2000/svg", W=720,H=220,L=76,R=16,T=18,B=30,w=W-L-R,hgt=H-T-B;
  const vals = pts.filter(v=>v!=null);
  if (!vals.length) return h("div",{class:"glass card"},h("p",{class:"note",text:"Aún no hay datos para este año."}));
  const {lo,hi,step} = niceScale(Math.min(0,...vals),Math.max(0,...vals));
  const y = v => T+hgt-hgt*(v-lo)/(hi-lo), x = i => L+w*i/11;
  const s = (tag,a) => { const e=document.createElementNS(NS,tag); for (const k in a) e.setAttribute(k,a[k]); return e; };
  const svg = s("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Evolución del patrimonio"});
  const short = new Intl.NumberFormat("es-PE",{notation:Math.max(Math.abs(lo),Math.abs(hi))>=10000?"compact":"standard",maximumFractionDigits:1});
  for (let v=lo; v<=hi+1e-9; v+=step){ svg.append(s("line",{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:Math.abs(v)<1e-9?"var(--muted)":"var(--glass-line)"})); const tx=s("text",{x:L-8,y:y(v)+4,"text-anchor":"end","font-size":"11",fill:"var(--muted)"}); tx.textContent="S/ "+short.format(v); svg.append(tx); }
  let d = "", area = "", first = null, last = null;
  pts.forEach((v,i)=>{ if (v==null) return; d += (d?"L":"M")+x(i)+" "+y(v); if (first==null) first=i; last=i; });
  area = d + `L${x(last)} ${y(Math.max(lo,0))}L${x(first)} ${y(Math.max(lo,0))}Z`;
  svg.append(s("path",{d:area,fill:"hsl(var(--h) 80% 60% / .15)"}), s("path",{d,fill:"none",stroke:"var(--accent)","stroke-width":2.5}));
  svg.append(s("circle",{cx:x(last),cy:y(pts[last]),r:5,fill:"var(--accent)",stroke:"var(--bg-a)","stroke-width":2}));
  const lt = s("text",{x:Math.min(x(last),W-R-4),y:y(pts[last])-12,"text-anchor":x(last)>W-120?"end":"middle","font-size":"12","font-weight":"700",fill:"var(--ink)"}); lt.textContent = money(pts[last]); svg.append(lt);
  MESES.forEach((n,i)=>{ const tx=s("text",{x:x(i),y:H-8,"text-anchor":"middle","font-size":"11",fill:"var(--muted)"}); tx.textContent=n.slice(0,3); svg.append(tx); });
  return h("div",{class:"glass chart"},svg);
}

/* ======================= CALENDARIO ======================= */
function viewCalendario(){
  const a = monthStart(S.y,S.m), b = monthEnd(S.y,S.m), ev = eventsBetween(a,b), byDay = {};
  for (const e of ev) (byDay[e.date] = byDay[e.date]||[]).push(e);
  if (S.selDay<a || S.selDay>b) S.selDay = (S.y===now.getFullYear()&&S.m===now.getMonth()) ? todayISO() : a;
  const grid = h("div",{class:"cal"}, DOW.map(d=>h("div",{class:"dow",text:d})));
  const offset = (new Date(S.y,S.m,1).getDay()+6)%7;
  for (let i=0;i<offset;i++) grid.append(h("div"));
  for (let d=1; d<=lastDay(S.y,S.m); d++){
    const ds = iso(new Date(S.y,S.m,d)), es = byDay[ds]||[];
    const kinds = [...new Set(es.map(e=>e.kind))].slice(0,4);
    grid.append(h("button",{class:"day"+(ds===todayISO()?" today":"")+(ds===S.selDay?" sel":""),type:"button","aria-label":d+" de "+MESES[S.m]+(es.length?", "+es.length+" movimientos":""),onclick:()=>{S.selDay=ds;render();}},
      h("span",{text:String(d)}), h("span",{class:"dots"},kinds.map(k=>h("i",{class:evColor(k)})))));
  }
  const sel = byDay[S.selDay]||[];
  const pend = ev.filter(e=>!e.done && e.kind!=="tr");
  return [
    h("div",{class:"glass card"},grid,
      h("div",{class:"legend",style:"flex-wrap:wrap"},
        h("span",null,h("i",{class:"ev-in"}),"Ingresos"),h("span",null,h("i",{class:"ev-out"}),"Gastos"),h("span",null,h("i",{class:"ev-loan"}),"Préstamos"),h("span",null,h("i",{class:"ev-debt"}),"Deudas"))),
    h("section",null,h("div",{class:"sechead"},h("h2",{text:cap(fshort(S.selDay))+" · "+["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][parseISO(S.selDay).getDay()]}),
      h("button",{class:"btn ghost sm",onclick:()=>openMov({tipo:"out",fecha:S.selDay})},"+ Agregar este día")),
      h("div",{class:"glass card"}, sel.length ? sel.map(evRow) : h("p",{class:"note",text:"No hay movimientos este día."}))),
    h("section",null,h("div",{class:"sechead"},h("h2",{text:"Pendientes de "+MESES[S.m]}),h("span",{class:"tot",text:pend.length+" en total"})),
      h("div",{class:"glass card"}, pend.length ? pend.map(evRow) : h("p",{class:"note",text:"Todo al día en este mes. 🎉"})))
  ];
}

/* ======================= PRÉSTAMOS Y DEUDAS ======================= */
function viewPD(){
  const seg = h("div",{class:"seg glass",style:"padding:4px;border-radius:16px"},[["p","Préstamos que di"],["d","Mis deudas"]].map(([v,l])=>h("button",{type:"button","aria-pressed":String(S.pd===v),onclick:()=>{S.pd=v;render();}},l)));
  return [seg, ...(S.pd==="p" ? viewLoans() : viewDebts())];
}
function viewLoans(){
  const all = loans(), vivos = all.filter(p=>p.estado!=="pagado"), pagados = all.filter(p=>p.estado==="pagado");
  const sum = (arr,f) => arr.reduce((a,p)=>a+f(loanCalc(p)),0);
  const capital = sum(vivos,c=>c.monto), porMes = sum(vivos,c=>c.porMes), porDia = sum(vivos,c=>c.porDia), cobrar = sum(vivos,c=>c.total);
  const cobrado = pagados.reduce((s,p)=>s+(p.interesCobrado??loanCalc(p).interes),0);
  const out = [heroBox("Total a cobrar hoy", cobrar, [["Capital",money(capital)],["Interés acumulado",money(cobrar-capital)],["Genera al mes",money(porMes)]],
    h("span",{class:"hproj"},"Genera ",h("b",{text:money(porDia)})," por día · intereses ya cobrados: ",h("b",{text:money(cobrado)})))];
  out.push(h("section",null,
    h("div",{class:"sechead"},h("h2",{text:"Préstamos activos"}),h("button",{class:"btn sm",onclick:()=>openLoan({})},"+ Nuevo préstamo")),
    vivos.length ? h("div",{class:"glass"},h("div",{class:"lrows"},vivos.sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).map(loanRow)))
      : h("div",{class:"glass list"},h("div",{class:"empty"},h("p",{text:all.length?"No tienes préstamos activos.":"Aquí controlas el dinero que prestas. Anota el monto, el % mensual y la fecha: la app calcula cuánto te deben al día de hoy."}),!all.length?h("div",{class:"btnrow"},h("button",{class:"btn",onclick:()=>openLoan({})},"+ Registrar mi primer préstamo")):null))));
  if (pagados.length) out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Cobrados"}),h("span",{class:"tot",text:pagados.length+" préstamos"})),h("div",{class:"glass"},h("div",{class:"lrows"},pagados.map(loanRow)))));
  return out;
}
function loanRow(p){
  const c = loanCalc(p), paid = p.estado==="pagado", late = loanLate(p);
  const ic = h("span",{class:"ic",text:initials(p.nombre)});
  return lrow({id:"loan-"+p.id, ic, c:p.nombre||"Sin nombre",
    m:money(c.monto)+" prestado",
    a: paid ? money(c.total) : "+"+money(c.porMes)+"/mes",
    p: h("span",{class:"state "+(paid?"pagado":late?"atrasado":"activo"),text:paid?"Cobrado":late?"Atrasado":"Activo"}),
    body:()=>[
      h("div",null,h("div",{class:"note",text:paid?"Cobraste en total":"Cobro a hoy"}),h("div",{class:"loan-total",text:money(c.total)})),
      h("div",{class:"loan-grid"},
        h("div",null,h("span",{text:"Capital prestado"}),h("b",{text:money(c.monto)})),
        h("div",null,h("span",{text:paid?"Interés cobrado":"Interés acumulado"}),h("b",{text:money(paid?(p.interesCobrado??c.interes):c.interes)})),
        h("div",null,h("span",{text:"Interés mensual"}),h("b",{text:(p.tasa||0)+"% · "+money(c.porMes)})),
        h("div",null,h("span",{text:"Genera por día"}),h("b",{text:money(c.porDia)})),
        h("div",null,h("span",{text:"Desde "+fdate(p.fecha)}),h("b",{text:c.dias+(c.dias===1?" día":" días")})),
        p.vence ? h("div",null,h("span",{text:"Vence"}),h("b",{text:fdate(p.vence)})) : null,
        paid ? h("div",null,h("span",{text:"Cobrado el"}),h("b",{text:fdate(p.fechaPago)})) : null),
      h("div",{class:"inline"}, !paid ? h("button",{class:"btn sm",onclick:()=>openPaid(p)},"Cobrar") : null, h("button",{class:"btn ghost sm",onclick:()=>openLoan(p)},"Editar"))]});
}
function viewDebts(){
  const list = debts();
  const tot = list.reduce((a,d)=>a+(d.total||0),0), ab = list.reduce((a,d)=>a+debtPaid(d),0);
  const out = [heroBox("Te falta pagar", tot-ab, [["Deuda total",money(tot)],["Abonado",money(ab)],["Avance",pct(tot>0?ab/tot:0)]])];
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Tus deudas"}),h("button",{class:"btn sm",onclick:()=>openDebt({})},"+ Agregar deuda")),
    list.length ? h("div",{class:"glass"},h("div",{class:"lrows"},list.map(debtRow)))
      : h("div",{class:"glass list"},h("div",{class:"empty",text:"No tienes deudas registradas. Si tienes alguna (estudios, celular en cuotas, tarjeta), agrégala para ver cuánto te falta."}))));
  return out;
}
function debtRow(d){
  const paid = debtPaid(d), share = d.total>0?paid/d.total:0, left = (d.total||0)-paid;
  return lrow({id:"debt-"+d.id, ic:h("span",{class:"ic out",text:initials(d.nombre)}), c:d.nombre||"Deuda",
    m: pct(share)+" pagado"+(d.diaPago?" · paga el "+d.diaPago:""), a: left>0 ? money(left) : "Pagada ✓", p: left>0 ? "por pagar" : "",
    extra: h("span",{class:"thin"},h("div",{style:"width:"+share*100+"%"})),
    body:()=>[
      h("div",{class:"mini-list"},
        h("div",null,h("span",{text:"Monto total"}),h("b",{text:money(d.total)})),
        h("div",null,h("span",{text:"Abonado"}),h("b",{text:money(paid)})),
        d.cuota ? h("div",null,h("span",{text:"Cuota mensual"}),h("b",{text:money(d.cuota)})) : null,
        (d.abonos||[]).length ? h("div",null,h("span",{text:"Último abono"}),h("b",{text:fdate(d.abonos[d.abonos.length-1].fecha)+" · "+money(d.abonos[d.abonos.length-1].monto)})) : null),
      h("div",{class:"inline"}, left>0 ? h("button",{class:"btn sm",onclick:()=>openAbono(d)},"Abonar") : null, h("button",{class:"btn ghost sm",onclick:()=>openDebt(d)},"Editar"))]});
}

/* ---------- metas ---------- */
function goalRow(g){
  const s = goalSaved(g), share = g.objetivo>0 ? Math.min(1,s/g.objetivo) : 0;
  return lrow({id:"goal-"+g.id, ic:h("span",{class:"ic",text:initials(g.nombre)}), c:g.nombre||"Meta", m: pct(share)+(g.fecha?" · para el "+fdate(g.fecha):""), a: money(s), p: "de "+money(g.objetivo),
    extra: h("span",{class:"thin"},h("div",{style:"width:"+share*100+"%"})),
    body:()=>[
      h("div",{class:"note",text: s>=g.objetivo ? "¡Meta cumplida! 🎉" : "Te faltan "+money(g.objetivo-s)}),
      h("div",{class:"inline"},h("button",{class:"btn sm",onclick:()=>openAporte(g,1)},"Aportar"),h("button",{class:"btn ghost sm",onclick:()=>openAporte(g,-1)},"Retirar"),h("button",{class:"btn ghost sm",onclick:()=>openGoal(g)},"Editar"))]});
}

/* ---------- detalle de cuenta ---------- */
function accDetail(a){
  const ev = ledger().filter(e=>e.cuenta===a.id).sort((x,y)=>y.date.localeCompare(x.date)).slice(0,5);
  return [
    ev.length ? h("div",{class:"mini-list"},ev.map(e=>h("div",null,h("span",{text:fshort(e.date)+" · "+(e.label||(e.it.tipo==="tr"?"Transferencia":(e.it.concepto||e.it.cat)))}),h("b",{class:e.amt<0?"":"pos",text:(e.amt<0?"−":"+")+money(Math.abs(e.amt),a.moneda)})))) : h("p",{class:"note",style:"margin:0",text:"Sin movimientos todavía."}),
    h("div",{class:"inline"},h("button",{class:"btn ghost sm",onclick:()=>openAccount(a)},"Editar"),
      h("button",{class:"btn ghost sm",onclick:()=>withUndo(["cuentas"],()=>setList("cuentas",accounts().map(x=>x.id===a.id?{...x,archivada:true}:x)),"Cuenta archivada.")},"Archivar"))];
}

/* ======================= AJUSTES ======================= */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.view==="ajustes") render(); });
function viewAjustes(){
  const out = [];
  const presets = ["#3a5cf0","#7c4dff","#12a37a","#e0457b","#ff7a1a","#0fb5c9","#e5484d","#1f2937"];
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Apariencia"})),
    h("div",{class:"glass card"},
      h("div",{class:"seg",role:"group","aria-label":"Modo"},
        h("button",{type:"button","aria-pressed":String(curTheme()==="light"),onclick:()=>{applyTheme("light");savePref("tema","light");}},"☀️ Día"),
        h("button",{type:"button","aria-pressed":String(curTheme()==="dark"),onclick:()=>{applyTheme("dark");savePref("tema","dark");}},"🌙 Noche")),
      h("p",{class:"note",text:"Color de la app: elige uno o toca 🎨 arriba para escoger cualquier tono."}),
      h("div",{class:"inline"},presets.map(c=>h("button",{type:"button","aria-label":"Color "+c,style:`width:36px;height:36px;border-radius:50%;border:2px solid var(--glass-line);background:${c}`,onclick:()=>{applyColor(c);savePref("color",c);}}))))));

  // módulos del inicio
  const mcfg = prefs().modulos||{}, order = [...(mcfg.order||MODS_DEF).filter(x=>MODS_DEF.includes(x)), ...MODS_DEF.filter(x=>!(mcfg.order||MODS_DEF).includes(x))], hidden = new Set(mcfg.hidden||[]);
  const saveMods = (o,hd) => savePref("modulos",{order:o,hidden:[...hd]});
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Secciones del inicio"}),h("span",{class:"tot",text:"Muestra, oculta u ordena"})),
    h("div",{class:"glass list"},order.map((id,i)=>{
      const chk = h("input",{type:"checkbox",id:"mod-"+id,checked:!hidden.has(id),onchange:e=>{ const hd=new Set(hidden); e.target.checked?hd.delete(id):hd.add(id); saveMods(order,hd); }});
      const mv = d => { const o=[...order]; const j=i+d; if (j<0||j>=o.length) return; [o[i],o[j]]=[o[j],o[i]]; saveMods(o,hidden); };
      return h("div",{class:"modrow"},h("label",{class:"sw"},chk,h("span")),h("span",{text:MOD_NAMES[id]}),
        h("button",{class:"btn ghost sm","aria-label":"Subir",disabled:i===0||null,onclick:()=>mv(-1)},"↑"),h("button",{class:"btn ghost sm","aria-label":"Bajar",disabled:i===order.length-1||null,onclick:()=>mv(1)},"↓"));
    }))));

  // cuentas
  const archived = accounts().filter(a=>a.archivada);
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Cuentas y billeteras"}),h("button",{class:"btn sm",onclick:()=>openAccount({})},"+ Cuenta")),
    h("div",{class:"glass list"},
      accounts().filter(a=>!a.archivada).map(a=>h("div",{class:"catrow"},h("span",{text:a.nombre+(a.moneda==="USD"?" (US$)":"")}),h("button",{class:"btn ghost sm",onclick:()=>openAccount(a)},"Editar"))),
      archived.map(a=>h("div",{class:"catrow"},h("span",null,a.nombre,h("span",{class:"tag",text:"Archivada"})),h("button",{class:"btn ghost sm",onclick:()=>setList("cuentas",accounts().map(x=>x.id===a.id?{...x,archivada:false}:x))},"Restaurar"))),
      !accounts().length ? h("div",{class:"empty",text:"Aún no tienes cuentas."}) : null)));

  // recurrentes
  const rs = recs();
  if (rs.length) out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Movimientos recurrentes"})),
    h("div",{class:"glass list"},rs.map(r=>{
      const active = !r.fin || r.fin>=todayISO();
      return h("div",{class:"catrow"},h("span",null,r.concepto+" · "+money(r.importe)+" · "+((FREQS.find(f=>f[0]===r.freq)||["",""])[1]).toLowerCase(),!active?h("span",{class:"tag",text:"Detenido"}):null),
        active ? delBtn("Detener",()=>{ setList("recurrentes",recs().map(x=>x.id===r.id?{...x,fin:addDays(todayISO(),-1)}:x)); toast("Ya no se repetirá. Lo registrado se mantiene."); }) : null);
    }))));

  const catSection = tipo => {
    const listC = cats(tipo);
    const inp = h("input",{id:"newcat-"+tipo,placeholder:tipo==="in"?"Nueva categoría de ingreso":"Nueva categoría de gasto","aria-label":"Nueva categoría"});
    const add = () => { const v = inp.value.trim(); if (!v) return; if (listC.some(c=>c.toLowerCase()===v.toLowerCase())) { toast("Esa categoría ya existe."); return; } tipo==="in" ? setCats([...listC,v],cats("out")) : setCats(cats("in"),[...listC,v]); toast("Categoría agregada."); };
    inp.addEventListener("keydown",e=>{ if(e.key==="Enter") add(); });
    return h("section",null,h("div",{class:"sechead"},h("h2",{text:tipo==="in"?"Categorías de ingreso":"Categorías de gasto"})),
      h("div",{class:"glass list"},
        listC.map(c=>h("div",{class:"catrow"},h("span",{text:c}),h("button",{class:"btn ghost sm",onclick:()=>renameCat(tipo,c)},"Renombrar"),
          delBtn("Quitar",()=>{ const nl = listC.filter(x=>x!==c); tipo==="in"?setCats(nl,cats("out")):setCats(cats("in"),nl); toast("Categoría quitada. Tus movimientos anteriores la conservan."); }))),
        h("div",{class:"catrow"},h("div",{class:"inline",style:"flex:1"},inp,h("button",{class:"btn sm",onclick:add},"Agregar")))));
  };
  out.push(catSection("out"), catSection("in"));

  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Exportar"})),
    h("div",{class:"glass card"},h("p",{class:"note",text:"Descarga un Excel con el resumen del año, una hoja por mes, cuentas, préstamos, deudas y metas."}),
      h("div",null,h("button",{class:"btn",onclick:exportYear},"Descargar "+S.y+" en Excel")))));
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Instalar en tu celular"})),
    h("div",{class:"glass card"}, standalone ? h("p",{text:"Ya la estás usando como app. 👌"}) : [
      installEvt ? h("div",null,h("button",{class:"btn",onclick:async()=>{ installEvt.prompt(); await installEvt.userChoice; installEvt=null; render(); }},"Instalar app")) : null,
      h("p",{class:"note",text:"Android (Chrome): menú ⋮ → «Instalar app»."}),
      h("p",{class:"note",text:"iPhone (Safari): botón Compartir → «Agregar a inicio»."})])));
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Cuenta"})),
    h("div",{class:"glass card"},
      S.store.demo ? h("p",{class:"note",text:"Modo prueba, sin cuenta."})
      : [h("p",null,"Entraste como ",h("strong",{text:S.email})),
         h("p",{class:"note",text:"Para que otra persona use la app con sus propios datos, agrega su Gmail en Firebase → Firestore → permitidos, y pásale el link."}),
         h("div",null,h("button",{class:"btn ghost",onclick:()=>S.store.signOut()},"Cerrar sesión"))])));
  return out;
}
const setCats = (catIn,catOut) => save("ajustes",{...prefs(),catIn,catOut});
function renameCat(tipo,old){
  modal(close=>{
    const inp = h("input",{id:"f-rename",value:old});
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const v = inp.value.trim(); if (!v || v===old) { close(); return; }
      const listC = cats(tipo);
      if (listC.some(c=>c!==old && c.toLowerCase()===v.toLowerCase())) { toast("Esa categoría ya existe."); return; }
      const pairs = [["ajustes",{...prefs(),[tipo==="in"?"catIn":"catOut"]:listC.map(c=>c===old?v:c)}]];
      for (const id of monthDocs()){ const its = docItems(id); if (its.some(i=>i.tipo===tipo && i.cat===old)) pairs.push([id,{...S.docs[id],items:its.map(i=>i.tipo===tipo&&i.cat===old?{...i,cat:v}:i)}]); }
      if (recs().some(r=>r.tipo===tipo&&r.cat===old)) pairs.push(["recurrentes",{items:recs().map(r=>r.tipo===tipo&&r.cat===old?{...r,cat:v}:r)}]);
      saveMany(pairs); close(); toast("Categoría renombrada en todos tus meses.");
    }}, h("h3",{text:"Renombrar categoría"}), field("Nuevo nombre",inp), actions(close));
  });
}

/* ======================= REGISTRO ======================= */
function frequents(){
  const counts = {};
  for (const it of allStored()){ if (it.tipo==="tr"||!it.concepto) continue; const k = it.tipo+"|"+it.concepto.toLowerCase(); const c = counts[k]||(counts[k]={n:0,it}); c.n++; if ((it._date||"")>(c.it._date||"")) c.it=it; }
  return Object.values(counts).filter(c=>c.n>=2).sort((a,b)=>b.n-a.n).slice(0,6).map(c=>c.it);
}
function recentCats(tipo){
  const seen = []; for (const it of allStored().filter(x=>x.tipo===tipo).sort((a,b)=>(b._date||"").localeCompare(a._date||""))){ if (it.cat && !seen.includes(it.cat)) seen.push(it.cat); if (seen.length>=3) break; }
  return seen;
}
function defaultDate(){ return (S.y===now.getFullYear() && S.m===now.getMonth()) ? todayISO() : monthStart(S.y,S.m); }
function openQuick(){
  modal(close=>{
    const fr = frequents();
    return h("div",{style:"display:grid;gap:14px"},
      h("h3",{text:"¿Qué quieres registrar?"}),
      h("div",{class:"quick"},
        h("button",{type:"button",onclick:()=>{close();openMov({tipo:"in"});}},h("span",{text:"↓"}),"Ingreso"),
        h("button",{type:"button",onclick:()=>{close();openMov({tipo:"out"});}},h("span",{text:"↑"}),"Gasto"),
        h("button",{type:"button",onclick:()=>{ close(); if (accounts().filter(a=>!a.archivada).length<2){ toast("Necesitas al menos 2 cuentas para transferir."); openAccount({}); } else openTransfer({}); }},h("span",{text:"⇄"}),"Transferencia")),
      fr.length ? h("div",{style:"display:grid;gap:8px"},h("div",{class:"subhead",style:"margin:0",text:"Frecuentes · un toque"}),
        h("div",{class:"freq"},fr.map(it=>h("button",{class:"pill",type:"button",onclick:()=>{ close(); openMov({tipo:it.tipo,concepto:it.concepto,cat:it.cat,cuenta:it.cuenta,_amount:it.real??it.plan}); }},(it.tipo==="in"?"+ ":"− ")+it.concepto+" · "+money(it.real??it.plan,curOf(it)))))) : null,
      h("div",{class:"actions"},h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cerrar"))));
  });
}
function confirmMov(it){
  modal(close=>{
    const amt = amountInput("c-amt", it.real??it.plan);
    const cta = accSelect("c-acc", it.cuenta||lastAcc(), true);
    const fecha = h("input",{id:"c-fecha",type:"date",value:it.fecha||todayISO()});
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const v = num(amt.value); if (v==null||v<=0){ toast("Escribe el importe."); return; }
      const rec = {...it, real:v, plan:it.plan??v, cuenta:cta.value||null, fecha:fecha.value||todayISO()};
      const oldDoc = it._doc; delete rec.virtual; if (it.virtual==="rec") rec.id = uid();
      setLastAcc(cta.value); saveMov(rec, it.virtual?null:oldDoc); close(); toast("Marcado como realizado ✓");
    }}, h("h3",{text:(it.tipo==="in"?"Confirmar ingreso · ":"Confirmar pago · ")+(it.concepto||"")}), amt, h("div",{class:"two"},field("Cuenta",cta),field("Fecha",fecha)), actions(close,null,"Confirmar"));
  });
}
function openMov(it){
  const isNew = !it.id || it.virtual==="rec";
  let tipo = it.tipo||"out";
  modal(close=>{
    const imp = amountInput("f-imp", it._amount ?? (it.real ?? it.plan));
    const concepto = h("input",{id:"f-concepto",value:it.concepto||"",placeholder:"Ej. Sueldo, Alquiler, Menú",autocomplete:"off"});
    const cat = h("select",{id:"f-cat"});
    const chips = h("div",{class:"freq"});
    const cuenta = accSelect("f-acc", it.cuenta!==undefined && it.id ? it.cuenta : (it.cuenta||lastAcc()), true);
    const fecha = h("input",{id:"f-fecha",type:"date",value:it.fecha||defaultDate()});
    const doneChk = h("input",{type:"checkbox",id:"f-done",checked:it.id&&!it.virtual ? isDone(it) : (fecha.value<=todayISO())});
    const plan = h("input",{id:"f-plan",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:it.id&&!it.virtual&&isDone(it)&&it.plan!=null&&it.plan!==it.real?it.plan:"",placeholder:"Igual al importe"});
    const nota = h("input",{id:"f-nota",value:it.nota||"",placeholder:"Opcional"});
    const rec = it.recId ? recs().find(r=>r.id===it.recId) : null;
    const freq = h("select",{id:"f-freq"},FREQS.map(([v,l])=>h("option",{value:v},l)));
    const cada = h("input",{id:"f-cada",type:"number",min:"1",step:"1",value:"30"}); const cadaF = field("¿Cada cuántos días?",cada); cadaF.hidden = true;
    freq.onchange = () => { cadaF.hidden = freq.value!=="cada"; };
    const fillCats = () => {
      const l = [...cats(tipo)]; if (it.cat && it.tipo===tipo && !l.includes(it.cat)) l.push(it.cat);
      cat.replaceChildren(...l.map(c=>h("option",{value:c,selected:c===it.cat},c)));
      chips.replaceChildren(...recentCats(tipo).filter(c=>l.includes(c)).map(c=>h("button",{type:"button",class:"pill","aria-pressed":String(cat.value===c),onclick:()=>{cat.value=c;fillChips();}},c)));
    };
    const fillChips = () => chips.querySelectorAll(".pill").forEach(p=>p.setAttribute("aria-pressed",String(p.textContent===cat.value)));
    cat.onchange = fillChips;
    fillCats();
    const bIn = h("button",{type:"button","aria-pressed":String(tipo==="in")},"Ingreso"), bOut = h("button",{type:"button","aria-pressed":String(tipo==="out")},"Gasto");
    const setT = v => { tipo=v; bIn.setAttribute("aria-pressed",String(v==="in")); bOut.setAttribute("aria-pressed",String(v==="out")); fillCats(); doneLab.textContent = v==="in"?"Ya lo recibí":"Ya lo pagué"; };
    bIn.onclick = () => setT("in"); bOut.onclick = () => setT("out");
    const doneLab = h("span",{text:tipo==="in"?"Ya lo recibí":"Ya lo pagué"});
    const del = (!it.id || it.virtual==="loan") ? null : delBtn(it.virtual==="rec"?"Omitir esta vez":"Eliminar",()=>{ close(); removeMov(it); });
    const moreOpen = !!(it.nota || (plan.value!==""));
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const v = num(imp.value); if (v==null||v<=0){ toast("Escribe el importe."); imp.focus(); return; }
      const done = doneChk.checked, pv = num(plan.value);
      const base = it.virtual==="rec" ? {} : it;
      // Planeado: si está pendiente, el importe es lo planeado; si ya se realizó, se conserva lo que estaba planeado (o el monto que indiques en "Más opciones")
      const prevPlan = it.virtual==="rec" ? it.plan : (it.id ? it.plan : null);
      const recObj = {...base, id: isNew ? uid() : it.id, tipo, concepto:concepto.value.trim()||cat.value, cat:cat.value, cuenta:cuenta.value||null, fecha:fecha.value||defaultDate(),
        real: done ? v : null, plan: done ? (pv!=null ? pv : (prevPlan??null)) : v, nota:nota.value.trim()||null};
      if (it.virtual==="rec"){ recObj.recId = it.recId; recObj.recDate = it.recDate; }
      delete recObj._amount; delete recObj.virtual;
      const pairs = [];
      if (!it.recId && freq.value){
        const r = {id:uid(),tipo,concepto:recObj.concepto,cat:recObj.cat,importe:v,cuenta:recObj.cuenta,freq:freq.value,cada:freq.value==="cada"?Math.max(1,parseInt(cada.value)||1):null,inicio:recObj.fecha,omit:[]};
        recObj.recId = r.id; recObj.recDate = recObj.fecha;
        pairs.push(["recurrentes",{items:[...recs(),r]}]);
      }
      if (pairs.length){ for (const [id,d] of pairs){ S.docs[id]=clean(d); S.store.save(id,S.docs[id]); } }
      setLastAcc(recObj.cuenta); saveMov(recObj, isNew ? null : it._doc);
      close(); toast(isNew ? (done?"Registrado ✓":"Programado ✓") : "Guardado ✓");
    }},
      h("h3",{text: isNew ? "Nuevo movimiento" : "Editar movimiento"}),
      h("div",{class:"seg"},bIn,bOut),
      imp,
      field("Concepto",concepto),
      chips,
      h("div",{class:"two"},field("Categoría",cat),field("Cuenta",cuenta)),
      h("div",{class:"two"},field("Fecha",fecha),h("div",{class:"field"},h("label",{text:"Estado"}),h("label",{class:"switchrow",for:"f-done"},doneLab,h("span",{class:"sw"},doneChk,h("span"))))),
      h("details",{class:"more",open:moreOpen||null},h("summary",null,"Más opciones"),h("div",null,
        field("Monto planeado (si fue distinto)",plan),
        field("Nota",nota),
        rec ? h("div",{class:"note"},"Se repite: "+((FREQS.find(f=>f[0]===rec.freq)||["",""])[1]).toLowerCase()+". ", (!rec.fin||rec.fin>=todayISO()) ? h("button",{type:"button",class:"btn ghost sm",onclick:()=>{ setList("recurrentes",recs().map(x=>x.id===rec.id?{...x,fin:addDays(todayISO(),-1)}:x)); close(); toast("Ya no se repetirá."); }},"Detener repetición") : "Repetición detenida.")
          : (isNew ? h("div",{class:"two"},field("Repetir",freq),cadaF) : null))),
      actions(close,del));
  });
}
function openTransfer(it){
  const isNew = !it.id;
  modal(close=>{
    const imp = amountInput("t-imp", it.real);
    const from = accSelect("t-from", it.cuenta||lastAcc(), false), to = accSelect("t-to", it.cuentaDestino||"", false);
    if (!it.cuentaDestino){ const o = [...to.options].find(o=>o.value!==from.value); if (o) to.value = o.value; }
    const fecha = h("input",{id:"t-fecha",type:"date",value:it.fecha||defaultDate()});
    const nota = h("input",{id:"t-nota",value:it.nota||"",placeholder:"Opcional"});
    const del = isNew ? null : delBtn("Eliminar",()=>{ close(); removeMov(it); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const v = num(imp.value); if (v==null||v<=0){ toast("Escribe el importe."); return; }
      if (!from.value || !to.value || from.value===to.value){ toast("Elige dos cuentas distintas."); return; }
      saveMov({id:it.id||uid(),tipo:"tr",concepto:"Transferencia",cat:null,cuenta:from.value,cuentaDestino:to.value,fecha:fecha.value||todayISO(),real:v,plan:null,nota:nota.value.trim()||null}, isNew?null:it._doc);
      close(); toast("Transferencia registrada ✓");
    }}, h("h3",{text:"Transferir entre cuentas"}), imp, h("div",{class:"two"},field("Desde",from),field("Hacia",to)), field("Fecha",fecha), field("Nota",nota),
      h("p",{class:"note",style:"margin:0",text:"No cuenta como ingreso ni como gasto: solo mueve tu dinero."}), actions(close,del));
  });
}
function openAccount(a){
  const isNew = !a.id;
  modal(close=>{
    const nombre = h("input",{id:"a-nombre",value:a.nombre||"",placeholder:"Ej. Yape, BCP Ahorros, Efectivo"});
    const tipo = h("select",{id:"a-tipo"},TIPOS_CUENTA.map(([v,l])=>h("option",{value:v,selected:v===(a.tipo||"efectivo")},l)));
    const moneda = h("select",{id:"a-mon"},h("option",{value:"PEN",selected:a.moneda!=="USD"},"Soles (S/)"),h("option",{value:"USD",selected:a.moneda==="USD"},"Dólares (US$)"));
    const saldo = h("input",{id:"a-saldo",type:"number",inputmode:"decimal",step:"0.01",value:a.saldoInicial??"",placeholder:"0.00"});
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const n = nombre.value.trim() || (TIPOS_CUENTA.find(x=>x[0]===tipo.value)||["","Cuenta"])[1];
      const rec = {...a,id:a.id||uid(),nombre:n,tipo:tipo.value,moneda:moneda.value,saldoInicial:num(saldo.value)||0,archivada:!!a.archivada};
      setList("cuentas", isNew?[...accounts(),rec]:accounts().map(x=>x.id===rec.id?rec:x)); if (isNew && !lastAcc()) setLastAcc(rec.id);
      close(); toast(isNew?"Cuenta creada ✓":"Guardado ✓");
    }}, h("h3",{text:isNew?"Nueva cuenta":"Editar cuenta"}), field("Nombre",nombre), h("div",{class:"two"},field("Tipo",tipo),field("Moneda",moneda)),
      field(isNew?"¿Cuánto tienes ahora?":"Saldo inicial",saldo),
      h("p",{class:"note",style:"margin:0",text:"Solo un nombre y el saldo. Nunca te pediremos números de cuenta ni claves."}), actions(close));
  });
}

/* ---------- préstamos: formularios ---------- */
function openLoan(p){
  const isNew = !p.id; let estado = p.estado||"activo";
  modal(close=>{
    const nombre = h("input",{id:"l-nombre",value:p.nombre||"",placeholder:"Ej. Juan Pérez"});
    const monto = amountInput("l-monto",p.monto);
    const tasa = h("input",{id:"l-tasa",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:p.tasa??"",placeholder:"Ej. 10"});
    const fecha = h("input",{id:"l-fecha",type:"date",value:p.fecha||todayISO()});
    const cuenta = accSelect("l-acc",p.cuenta||"",true,"No salió de una cuenta");
    const vence = h("input",{id:"l-vence",type:"date",value:p.vence||""});
    const preview = h("div",{class:"calc"});
    const seg = h("div",{class:"seg"});
    const drawSeg = () => seg.replaceChildren(...ESTADOS.filter(x=>x[0]!=="pagado"||!isNew).map(([v,l])=>h("button",{type:"button","aria-pressed":String(estado===v),onclick:()=>{estado=v;drawSeg();upd();}},l)));
    const upd = () => { const c = loanCalc({monto:num(monto.value)||0,tasa:num(tasa.value)||0,fecha:fecha.value,estado,fechaPago:p.fechaPago});
      preview.replaceChildren(h("span",null,"Gana ",h("b",{text:money(c.porMes)})," al mes · ",money(c.porDia)," por día"),h("span",null,c.dias+" días → cobro a hoy: ",h("b",{text:money(c.total)}))); };
    for (const el of [monto,tasa,fecha]) el.addEventListener("input",upd);
    drawSeg(); upd();
    const del = isNew ? null : delBtn("Eliminar",()=>{ close(); withUndo(["prestamos"],()=>setList("prestamos",loans().filter(x=>x.id!==p.id)),"Préstamo eliminado."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const rec = {...p,id:p.id||uid(),nombre:nombre.value.trim()||"Sin nombre",monto:num(monto.value)||0,tasa:num(tasa.value)||0,fecha:fecha.value||todayISO(),estado,cuenta:cuenta.value||null,vence:vence.value||null};
      if (estado!=="pagado"){ rec.fechaPago=null; rec.cuentaCobro=null; rec.interesCobrado=null; }
      if (rec.monto<=0){ toast("Escribe el monto que prestaste."); return; }
      setList("prestamos", isNew?[...loans(),rec]:loans().map(x=>x.id===rec.id?rec:x)); close(); toast(isNew?"Préstamo registrado ✓":"Guardado ✓");
    }},
      h("h3",{text:isNew?"Nuevo préstamo":"Editar préstamo"}),
      field("¿A quién le prestaste?",nombre), monto,
      h("div",{class:"two"},field("Interés mensual (%)",tasa),field("Fecha del préstamo",fecha)),
      preview,
      h("details",{class:"more",open:!!(p.vence||p.cuenta||!isNew)||null},h("summary",null,"Más opciones"),h("div",null,
        field("¿De qué cuenta salió el dinero?",cuenta), field("Fecha de vencimiento (opcional)",vence),
        !isNew ? h("div",{class:"field"},h("label",{text:"Estado"}),seg) : null,
        h("p",{class:"note",style:"margin:0",text:"El interés se cobra por día: el % mensual entre 30, por cada día que pasa. El capital no cuenta como ganancia."}))),
      actions(close,del));
  });
}
function openPaid(p){
  modal(close=>{
    const fp = h("input",{id:"p-fecha",type:"date",value:todayISO()});
    const cuenta = accSelect("p-acc",p.cuenta||lastAcc(),true,"No entró a una cuenta");
    const info = h("div",{class:"calc"});
    const upd = () => { const c = loanCalc({...p,estado:"pagado",fechaPago:fp.value}); info.replaceChildren(h("span",null,"Capital que vuelve: ",money(c.monto)),h("span",null,"Interés ganado ("+c.dias+" días): ",h("b",{class:"pos",text:money(c.interes)})),h("span",null,"Total que recibes: ",h("b",{text:money(c.total)}))); };
    fp.addEventListener("input",upd); upd();
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const f = fp.value||todayISO(); const c = loanCalc({...p,estado:"pagado",fechaPago:f});
      setList("prestamos",loans().map(x=>x.id===p.id?{...x,estado:"pagado",fechaPago:f,cuentaCobro:cuenta.value||null,interesCobrado:r2(c.interes)}:x)); close(); toast("Cobrado ✓ El interés se sumó como ingreso del mes.");
    }}, h("h3",{text:"Cobrar a "+(p.nombre||"")}), h("div",{class:"two"},field("Fecha de pago",fp),field("¿A qué cuenta entró?",cuenta)), info,
      h("p",{class:"note",style:"margin:0",text:"Desde esta fecha deja de sumar interés. Solo el interés cuenta como ingreso; el capital es tu dinero que vuelve."}), actions(close,null,"Marcar cobrado"));
  });
}

/* ---------- deudas: formularios ---------- */
function openDebt(d){
  const isNew = !d.id;
  modal(close=>{
    const nombre = h("input",{id:"d-nombre",value:d.nombre||"",placeholder:"Ej. Universidad, Celular"});
    const total = amountInput("d-total",d.total);
    const abonado = h("input",{id:"d-abonado",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:isNew?"":(d.abonado??""),placeholder:"0.00"});
    const dia = h("input",{id:"d-dia",type:"number",min:"1",max:"31",step:"1",value:d.diaPago??"",placeholder:"Ej. 15"});
    const cuota = h("input",{id:"d-cuota",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:d.cuota??"",placeholder:"Opcional"});
    const del = isNew ? null : delBtn("Eliminar",()=>{ close(); withUndo(["deudas"],()=>setList("deudas",debts().filter(x=>x.id!==d.id)),"Deuda eliminada."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const rec = {...d,id:d.id||uid(),nombre:nombre.value.trim()||"Deuda",total:num(total.value)||0,abonado:Math.max(num(abonado.value)||0,(d.abonos||[]).reduce((s,a)=>s+a.monto,0)),diaPago:Math.min(31,Math.max(0,parseInt(dia.value)||0))||null,cuota:num(cuota.value)};
      if (rec.total<=0){ toast("Escribe el monto total de la deuda."); return; }
      setList("deudas", isNew?[...debts(),rec]:debts().map(x=>x.id===rec.id?rec:x)); close(); toast("Guardado ✓");
    }}, h("h3",{text:isNew?"Nueva deuda":"Editar deuda"}), field("Nombre",nombre), total,
      field(isNew?"¿Cuánto ya pagaste? (opcional)":"Total abonado",abonado),
      h("details",{class:"more",open:!!(d.diaPago||d.cuota)||null},h("summary",null,"Más opciones"),h("div",null,
        h("div",{class:"two"},field("Día de pago mensual",dia),field("Cuota mensual (S/)",cuota)),
        h("p",{class:"note",style:"margin:0",text:"Con el día de pago, la cuota aparece en tu calendario y en las alertas."}))),
      actions(close,del));
  });
}
function openAbono(d){
  modal(close=>{
    const amt = amountInput("ab-amt", d.cuota||"");
    const cuenta = accSelect("ab-acc", lastAcc(), true, "No salió de una cuenta");
    const fecha = h("input",{id:"ab-fecha",type:"date",value:todayISO()});
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const v = num(amt.value); if (!v||v<=0){ toast("Escribe un monto mayor a cero."); return; }
      const ab = {fecha:fecha.value||todayISO(),monto:v,cuenta:cuenta.value||null};
      setLastAcc(cuenta.value);
      setList("deudas",debts().map(x=>x.id===d.id?{...x,abonado:(x.abonado||0)+v,abonos:[...(x.abonos||[]),ab]}:x)); close(); toast("Abono de "+money(v)+" registrado ✓");
    }}, h("h3",{text:"Abonar a "+(d.nombre||"")}), amt, h("div",{class:"two"},field("Cuenta",cuenta),field("Fecha",fecha)),
      h("p",{class:"note",style:"margin:0",text:"El abono reduce tu deuda y el saldo de la cuenta. No se cuenta dos veces como gasto."}), actions(close,null,"Abonar"));
  });
}

/* ---------- metas: formularios ---------- */
function openGoal(g){
  const isNew = !g.id;
  modal(close=>{
    const nombre = h("input",{id:"g-nombre",value:g.nombre||"",placeholder:"Ej. Viaje a Cusco, Fondo de emergencia"});
    const obj = amountInput("g-obj",g.objetivo);
    const fecha = h("input",{id:"g-fecha",type:"date",value:g.fecha||""});
    const ya = h("input",{id:"g-ya",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:"",placeholder:"0.00"});
    const del = isNew ? null : delBtn("Eliminar",()=>{ close(); withUndo(["metas"],()=>setList("metas",goals().filter(x=>x.id!==g.id)),"Meta eliminada."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); const o = num(obj.value); if (!o||o<=0){ toast("Escribe cuánto quieres juntar."); return; }
      const rec = {...g,id:g.id||uid(),nombre:nombre.value.trim()||"Meta",objetivo:o,fecha:fecha.value||null,acumulado:isNew?(num(ya.value)||0):(g.acumulado||0),aportes:g.aportes||[]};
      setList("metas", isNew?[...goals(),rec]:goals().map(x=>x.id===rec.id?rec:x)); close(); toast(isNew?"Meta creada ✓":"Guardado ✓");
    }}, h("h3",{text:isNew?"Nueva meta":"Editar meta"}), field("¿Para qué ahorras?",nombre), obj,
      h("div",{class:"two"},field("Fecha objetivo (opcional)",fecha), isNew?field("¿Ya tienes algo ahorrado?",ya):h("div")), actions(close,del));
  });
}
function openAporte(g,sign){
  modal(close=>{
    const amt = amountInput("ap-amt","");
    const cuenta = accSelect("ap-acc", lastAcc(), true, sign>0?"No sale de una cuenta":"No vuelve a una cuenta");
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault(); let v = num(amt.value); if (!v||v<=0){ toast("Escribe un monto."); return; }
      if (sign<0) v = -Math.min(v, goalSaved(g));
      const ap = {fecha:todayISO(),monto:v,cuenta:cuenta.value||null};
      setList("metas",goals().map(x=>x.id===g.id?{...x,acumulado:(x.acumulado||0)+v,aportes:[...(x.aportes||[]),ap]}:x)); close(); toast(sign>0?"Aporte guardado ✓":"Retiro guardado ✓");
    }}, h("h3",{text:(sign>0?"Aportar a ":"Retirar de ")+(g.nombre||"")}), amt, field(sign>0?"¿De qué cuenta sale?":"¿A qué cuenta vuelve?",cuenta),
      h("p",{class:"note",style:"margin:0",text:"Apartar dinero para una meta no es un gasto: sigue siendo tuyo."}), actions(close,null,sign>0?"Aportar":"Retirar"));
  });
}

/* ======================= exportar ======================= */
async function exportYear(){
  const y = S.y, data = yearData(y), bal = balances();
  const resumen = [["Mes","Ingresos","Gastos","Sobrante","% ahorro"],...data.map(d=>[cap(d.n),r2(d.inR),r2(d.outR),r2(d.bal),d.inR>0?r2(d.rate*100)/100:null])];
  const movs = m => [["Fecha","Tipo","Concepto","Categoría","Cuenta","Planeado","Real","Estado"],
    ...monthMovs(y,m).map(i=>[fdate(i.fecha),i.tipo==="in"?"Ingreso":i.tipo==="tr"?"Transferencia":"Gasto",i.concepto||"",i.cat||"",(acc(i.cuenta)||{}).nombre||"",i.plan,i.real,isDone(i)?"Realizado":"Programado"])];
  const ctas = [["Cuenta","Tipo","Moneda","Saldo"],...accounts().map(a=>[a.nombre,(TIPOS_CUENTA.find(x=>x[0]===a.tipo)||["",""])[1],a.moneda||"PEN",r2(bal[a.id])])];
  const pres = [["Persona","Monto","% mensual","Fecha","Estado","Días","Interés","Total"],...loans().map(p=>{ const c=loanCalc(p); return [p.nombre,c.monto,p.tasa,fdate(p.fecha),estadoLabel(p.estado),c.dias,r2(c.interes),r2(c.total)]; })];
  const deu = [["Deuda","Monto total","Abonado","Restante"],...debts().map(d=>[d.nombre,d.total,r2(debtPaid(d)),r2((d.total||0)-debtPaid(d))])];
  const met = [["Meta","Objetivo","Ahorrado","Fecha objetivo"],...goals().map(g=>[g.nombre,g.objetivo,r2(goalSaved(g)),fdate(g.fecha)])];
  try {
    const X = await import(SHEETJS); const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(resumen),"Resumen "+y);
    MESES.forEach((n,m)=>{ if (monthMovs(y,m).length) X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(movs(m)),cap(n)); });
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(ctas),"Cuentas");
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(pres),"Préstamos");
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(deu),"Deudas");
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(met),"Metas");
    X.writeFile(wb,"mis-finanzas-"+y+".xlsx");
  } catch(e){
    const rows = [["Resumen "+y],...resumen,[],...MESES.flatMap((n,m)=>monthMovs(y,m).length?[[cap(n)],...movs(m),[]]:[]),["Cuentas"],...ctas,[],["Préstamos"],...pres,[],["Deudas"],...deu,[],["Metas"],...met];
    const csv = "﻿"+rows.map(r=>r.map(c=>c==null?"":'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const a = h("a",{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:"mis-finanzas-"+y+".csv"}); document.body.append(a); a.click(); a.remove();
  }
}

/* ======================= inicio ======================= */
function remember(){ try{ sessionStorage.setItem("mf-view",S.view==="inicio"&&S.mode==="anio"?"anio":S.view); }catch(e){} }
$("prev").onclick = () => { if (S.view==="inicio"&&S.mode==="anio") S.y--; else if (S.m===0){S.m=11;S.y--;} else S.m--; S.cat=null; render(); };
$("next").onclick = () => { if (S.view==="inicio"&&S.mode==="anio") S.y++; else if (S.m===11){S.m=0;S.y++;} else S.m++; S.cat=null; render(); };
$("btn-theme").onclick = () => { const t = curTheme()==="dark"?"light":"dark"; applyTheme(t); savePref("tema",t); };
$("color-pick").addEventListener("input", e => applyColor(e.target.value));
$("color-pick").addEventListener("change", e => { applyColor(e.target.value); savePref("color",e.target.value); });

applyTheme(curTheme());
try { $("color-pick").value = localStorage.getItem("mf-color") || DEF_COLOR; } catch(e) { $("color-pick").value = DEF_COLOR; }
if (!document.documentElement.style.getPropertyValue("--h")) applyColor($("color-pick").value);
buildTabs();

function startApp(store){
  S.store = store;
  show("app"); renderHeader(); render();
  store.subscribe(d => { S.docs = d; syncPrefs(); render(); });
}
(async () => {
  const cfg = (window.MF_CONFIG||{}).firebase||{};
  const configured = cfg.apiKey && !String(cfg.apiKey).includes("PEGA_AQUI");
  if (!configured) { startApp(localStore()); return; }
  try { await firebaseStore(cfg); }
  catch(e){ show("login"); $("login-error").textContent = "No se pudo conectar con Firebase. Revisa tu internet o los datos de config.js."; }
})();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=3").catch(()=>{}));
