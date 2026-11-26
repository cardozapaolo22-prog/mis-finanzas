// Mis Finanzas v2 — lógica de la app
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DEF_IN = ["Sueldo","Horas extra","Freelance","Otros ingresos"];
const DEF_OUT = ["Vivienda","Comida","Transporte","Celular / Internet","Servicios","Tarjetas / Deudas","Salud","Educación","Ocio","Compras","Otros"];
const DEF_COLOR = "#12a37a";
const DIAS_MES = 30; // el mes cuenta como 30 días para el interés diario

const fmt = new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2,maximumFractionDigits:2});
const money = v => fmt.format(v||0);
const pct = v => (isFinite(v)?(v*100).toFixed(1):"0.0")+"%";
const num = v => { const n = parseFloat(String(v).replace(",",".")); return isFinite(n)?n:null; };
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

const now = new Date();
const S = { view:"mes", y:now.getFullYear(), m:now.getMonth(), docs:{}, store:null, email:"", name:"", photo:"" };
try { const v = sessionStorage.getItem("mf-view"); if (v) S.view = v; } catch(e) {}

const key = (y,m) => "m-"+y+"-"+String(m+1).padStart(2,"0");
const items = (y,m) => (S.docs[key(y,m)]||{}).items || [];
const debts = () => (S.docs["deudas"]||{}).items || [];
const loans = () => (S.docs["prestamos"]||{}).items || [];
const prefs = () => S.docs["ajustes"] || {};
const cats = tipo => { const a = prefs(); return (tipo==="in"?a.catIn:a.catOut) || (tipo==="in"?DEF_IN:DEF_OUT); };

const $ = id => document.getElementById(id);
function show(screen){ for (const s of ["loading","login","denied","app"]) $("screen-"+s).hidden = s!==screen; }

/* ======================= tema y color ======================= */
function hexToHsl(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex||""); if (!m) return [160,70,42];
  const n = parseInt(m[1],16), r=(n>>16&255)/255, g=(n>>8&255)/255, b=(n&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2; let h=0, s=0;
  if (max!==min){ const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    h = max===r?(g-b)/d+(g<b?6:0) : max===g?(b-r)/d+2 : (r-g)/d+4; h*=60; }
  return [Math.round(h), Math.round(s*100), Math.round(l*100)];
}
function applyColor(hex){
  let [h,s,l] = hexToHsl(hex);
  s = Math.max(35, Math.min(90, s || 60));          // siempre con algo de color
  l = Math.max(32, Math.min(52, l));                // legible con texto blanco
  if (h>=45 && h<=70) l = Math.min(l,40);           // amarillos más profundos
  const st = document.documentElement.style;
  st.setProperty("--h",h); st.setProperty("--s",s+"%"); st.setProperty("--l",l+"%");
  try { localStorage.setItem("mf-hsl",JSON.stringify([h,s,l])); localStorage.setItem("mf-color",hex); } catch(e) {}
  $("color-pick").value = hex;
  updateThemeColor();
}
function applyTheme(t){
  document.documentElement.setAttribute("data-theme",t);
  try { localStorage.setItem("mf-tema",t); } catch(e) {}
  $("btn-theme").textContent = t==="dark" ? "☀️" : "🌙";
  $("btn-theme").setAttribute("aria-label", t==="dark" ? "Cambiar a modo día" : "Cambiar a modo noche");
  updateThemeColor();
}
function updateThemeColor(){
  const bg = getComputedStyle(document.body).getPropertyValue("background-color");
  if (bg) $("theme-color").setAttribute("content",bg);
}
const curTheme = () => document.documentElement.getAttribute("data-theme")||"dark";
function syncPrefs(){
  const p = prefs();
  if (p.tema && p.tema!==curTheme()) applyTheme(p.tema);
  let saved; try { saved = localStorage.getItem("mf-color"); } catch(e) {}
  if (p.color && p.color!==saved) applyColor(p.color);
}
function savePref(k,v){ save("ajustes",{...prefs(),[k]:v}); }

/* ======================= almacenamiento ======================= */
function localStore(){
  const K = "mf-demo";
  let data = {};
  try { data = JSON.parse(localStorage.getItem(K)||"{}"); } catch(e) {}
  return {
    demo:true,
    subscribe(cb){ cb(data); },
    save(id,val){ data[id]=val; try{ localStorage.setItem(K,JSON.stringify(data)); }catch(e){ toast("No se pudo guardar en este navegador."); } },
    signOut(){}
  };
}

async function firebaseStore(cfg){
  const [{initializeApp},A,F] = await Promise.all([
    import(FB+"firebase-app.js"), import(FB+"firebase-auth.js"), import(FB+"firebase-firestore.js")
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})}); }
  catch(e){ db = F.getFirestore(app); }

  $("btn-login").onclick = async () => {
    $("login-error").textContent = "";
    const provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    try { await A.signInWithPopup(auth,provider); }
    catch(e){
      if (e.code==="auth/popup-blocked" || e.code==="auth/operation-not-supported-in-this-environment") {
        try { await A.signInWithRedirect(auth,provider); } catch(e2){ $("login-error").textContent = "No se pudo abrir el ingreso con Google. Intenta de nuevo."; }
      } else if (e.code!=="auth/popup-closed-by-user" && e.code!=="auth/cancelled-popup-request") {
        $("login-error").textContent = e.code==="auth/unauthorized-domain"
          ? "Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados)."
          : "No se pudo entrar. Revisa tu conexión e intenta de nuevo.";
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

function save(id,data){ S.docs[id]=clean(data); render(); S.store && S.store.save(id,S.docs[id]); }
function clean(o){ return JSON.parse(JSON.stringify(o,(k,v)=>v===undefined?null:v)); }
const setItems = (y,m,list) => save(key(y,m),{items:list,anio:y,mes:m+1});
const setDebts = list => save("deudas",{items:list});
const setLoans = list => save("prestamos",{items:list});
const setCats = (catIn,catOut) => save("ajustes",{...prefs(),catIn,catOut});

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
function toast(msg){ const t=h("div",{class:"toast",role:"status",text:msg}); document.body.append(t); setTimeout(()=>t.remove(),2800); }
function setStatus(t){ $("status").textContent = t; }
const signed = v => h("span",{class:v<0?"neg":v>0?"pos":"",text:money(v)});
const kpi = (lab,val,sub) => h("div",{class:"glass kpi"},h("div",{class:"lab",text:lab}),h("div",{class:"val"},val),sub?h("div",{class:"sub"},sub):null);
const fdate = f => f ? f.split("-").reverse().join("/") : "";
const initials = s => (s||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function bigMoney(v){
  const t = money(v), i = t.lastIndexOf(".");
  return i>0 ? [t.slice(0,i), h("span",{class:"cents",text:t.slice(i)})] : [t];
}
function hero(label,value,minis){
  return h("div",{class:"hero"},
    h("div",{class:"lab",text:label}),
    h("div",{class:"big"},...(typeof value==="number"?bigMoney(value):[value])),
    h("div",{class:"hrow"},minis.map(([l,v])=>h("div",{class:"mini"},h("span",{text:l}),h("b",{text:v})))));
}

/* ======================= cálculos ======================= */
function totals(list){
  const t = {inR:0,inP:0,outR:0,outP:0,cats:{}};
  for (const it of list){
    const r = it.real||0, p = it.plan||0;
    if (it.tipo==="in"){ t.inR+=r; t.inP+=p; }
    else { t.outR+=r; t.outP+=p; const c = it.cat||"Otros"; t.cats[c]=(t.cats[c]||0)+r; }
  }
  t.bal = t.inR-t.outR; t.balP = t.inP-t.outP; t.rate = t.inR>0 ? t.bal/t.inR : 0;
  return t;
}
function parseISO(s){ const [y,m,d] = (s||"").split("-").map(Number); return y ? new Date(y,(m||1)-1,d||1) : null; }
function daysBetween(a,b){ return Math.max(0, Math.round((b - a)/86400000)); }
// Interés simple: monto × (% mensual ÷ 30) × días transcurridos
function loanCalc(p){
  const monto = p.monto||0, tasa = (p.tasa||0)/100;
  const porDia = monto*tasa/DIAS_MES, porMes = monto*tasa;
  const ini = parseISO(p.fecha);
  const t0 = new Date(); const hoy = new Date(t0.getFullYear(),t0.getMonth(),t0.getDate());
  const fin = p.estado==="pagado" && p.fechaPago ? parseISO(p.fechaPago) : hoy;
  const dias = ini ? daysBetween(ini,fin) : 0;
  const interes = porDia*dias;
  return {monto,porDia,porMes,dias,interes,total:monto+interes};
}

/* ======================= vistas ======================= */
const ICONS = {
  mes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  anio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  prestamos:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/></svg>',
  deudas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></svg>',
  ajustes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>'
};
const TABS = [["mes","Mes"],["anio","Año"],["prestamos","Préstamos"],["deudas","Deudas"],["ajustes","Ajustes"]];
function buildTabs(){
  const nav = $("tabs"); nav.replaceChildren();
  for (const [v,label] of TABS){
    const b = h("button",{class:"tab",role:"tab","data-v":v,onclick:()=>{ S.view=v; remember(); render(); window.scrollTo(0,0); }});
    b.innerHTML = ICONS[v]; b.append(h("span",{text:label}));
    nav.append(b);
  }
}

function renderHeader(){
  const first = (S.name||"").split(" ")[0];
  const hr = new Date().getHours();
  $("hello-sub").textContent = hr<12 ? "Buenos días" : hr<19 ? "Buenas tardes" : "Buenas noches";
  $("hello-name").textContent = first ? "Hola, "+first : "Hola 👋";
  const av = $("avatar"); av.replaceChildren();
  if (S.photo){ const img = h("img",{src:S.photo,alt:"",referrerpolicy:"no-referrer",class:"avatar"}); img.onerror=()=>{ av.textContent = initials(S.name||S.email); }; av.replaceWith(img); img.id="avatar"; }
  else av.textContent = initials(S.name||S.email||"Mis Finanzas");
}

function render(){
  const periodic = S.view==="mes"||S.view==="anio";
  $("monthnav").hidden = !periodic;
  $("mlabel").textContent = S.view==="anio" ? "Año "+S.y : MESES[S.m]+" "+S.y;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected",String(b.dataset.v===S.view));
  const app = $("app"); app.replaceChildren();
  if (S.store && S.store.demo) app.append(h("div",{class:"demo",text:"Modo prueba: los datos se guardan solo en este navegador."}));
  const v = {mes:viewMes, anio:viewAnio, prestamos:viewPrestamos, deudas:viewDeudas, ajustes:viewAjustes}[S.view] || viewMes;
  app.append(...v());
}

function viewMes(){
  const list = items(S.y,S.m), t = totals(list), out = [];
  out.push(hero("Sobrante de "+MESES[S.m], t.bal,
    [["Ingresos",money(t.inR)],["Gastos",money(t.outR)],["Ahorro",t.inR>0?pct(t.rate):"—"]]));
  out.push(h("div",{class:"kpis"},
    kpi("Ingreso planeado",money(t.inP)),
    kpi("Gasto planeado",money(t.outP)),
    kpi("Sobrante planeado",signed(t.balP)),
    kpi("Real vs. plan",signed(t.bal-t.balP),t.bal-t.balP>=0?"mejor de lo planeado":"por debajo del plan")));

  if (!list.length){
    const py = S.m===0?S.y-1:S.y, pm = S.m===0?11:S.m-1, prev = items(py,pm);
    out.push(h("div",{class:"glass list"},h("div",{class:"empty"},
      h("p",{text:"Este mes está vacío. Empieza anotando tu sueldo u otro ingreso, y luego tus gastos."}),
      h("div",{class:"btnrow"},
        h("button",{class:"btn",onclick:()=>openMov({tipo:"in"})},"+ Agregar ingreso"),
        h("button",{class:"btn ghost",onclick:()=>openMov({tipo:"out"})},"+ Agregar gasto"),
        prev.length ? h("button",{class:"btn ghost",onclick:()=>{
          setItems(S.y,S.m,prev.map(it=>({...it,id:uid(),real:null,fecha:""})));
          toast("Copié lo planeado de "+MESES[pm]+". Ahora llena lo real.");
        }},"Copiar lo planeado de "+MESES[pm]) : null))));
  }

  const rows = Object.entries(t.cats).filter(([,v])=>v>0);
  if (t.bal>0) rows.push(["Ahorro (sobrante)",t.bal]);
  rows.sort((a,b)=>b[1]-a[1]);
  if (rows.length){
    const max = Math.max(...rows.map(r=>r[1]));
    out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"A dónde va tu ingreso"})),
      h("div",{class:"glass bars"},rows.map(([n,v])=>h("div",{class:"bar"},
        h("span",{text:n,title:n}),
        h("div",{class:"track"},h("div",{class:"fill"+(n.startsWith("Ahorro")?" save":""),style:"width:"+Math.max(2,v/max*100)+"%"})),
        h("span",{class:"n",text:money(v)+(t.inR>0?" · "+pct(v/t.inR):"")}))))));
  }
  out.push(h("div",{class:"cols"},movList("in",list,t),movList("out",list,t)));
  return out;
}

function movList(tipo,list,t){
  const mine = list.filter(i=>i.tipo===tipo).sort((a,b)=>(a.fecha||"9").localeCompare(b.fecha||"9"));
  return h("section",null,
    h("div",{class:"sechead"},h("h2",null,tipo==="in"?"Ingresos ":"Gastos ",h("span",{class:"tot",text:money(tipo==="in"?t.inR:t.outR)})),
      h("button",{class:"btn ghost sm",onclick:()=>openMov({tipo})},"+ Agregar")),
    h("div",{class:"glass list"}, mine.length ? mine.map(it=>{
      const diff = it.plan!=null && it.real!=null ? (tipo==="in"?it.real-it.plan:it.plan-it.real) : null;
      return h("button",{class:"row",onclick:()=>openMov(it),"aria-label":"Editar "+(it.concepto||"movimiento")},
        h("span",{class:"ic"+(tipo==="out"?" out":""),text:initials(it.cat||it.concepto)}),
        h("span",{class:"c",text:it.concepto||"(sin nombre)"}),
        h("span",{class:"a"}, it.real!=null ? (tipo==="out"?"-":"")+money(it.real) : h("span",{class:"note",text:"pendiente"})),
        h("span",{class:"m"},h("span",{text:it.cat||"Otros"}),it.fecha?h("span",{text:"· "+fdate(it.fecha)}):null),
        h("span",{class:"p"}, it.plan!=null?"Plan "+money(it.plan):"", diff?h("span",{class:diff<0?"neg":"pos",text:" ("+(diff>0?"+":"")+money(diff)+")"}):null));
    }) : h("div",{class:"empty",text:tipo==="in"?"Sin ingresos este mes.":"Sin gastos este mes."})));
}

function yearData(y){ return MESES.map((n,m)=>({n,m,...totals(items(y,m))})); }

function viewAnio(){
  const data = yearData(S.y);
  const T = data.reduce((a,d)=>({inR:a.inR+d.inR,outR:a.outR+d.outR}),{inR:0,outR:0});
  const bal = T.inR-T.outR, out = [];
  out.push(hero("Ahorrado en "+S.y, bal, [["Ingresos",money(T.inR)],["Gastos",money(T.outR)],["Ahorro",T.inR>0?pct(bal/T.inR):"—"]]));
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Ingresos y gastos por mes"})),chartYear(data)));
  const go = m => { S.m=m; S.view="mes"; remember(); render(); window.scrollTo(0,0); };
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Mes a mes"}),h("span",{class:"tot",text:"Toca un mes para abrirlo"})),
    h("div",{class:"glass tablewrap"},h("table",null,
      h("thead",null,h("tr",null,h("th",{text:"Mes"}),h("th",{text:"Ingresos"}),h("th",{text:"Gastos"}),h("th",{text:"Sobrante"}),h("th",{text:"% ahorro"}))),
      h("tbody",null,data.map(d=>h("tr",{class:"click",tabindex:"0",onclick:()=>go(d.m),onkeydown:e=>{if(e.key==="Enter")go(d.m)}},
        h("td",{text:cap(d.n)}),h("td",{text:money(d.inR)}),h("td",{text:money(d.outR)}),h("td",null,signed(d.bal)),h("td",{text:d.inR>0?pct(d.rate):"—"})))),
      h("tfoot",null,h("tr",null,h("td",{text:"Total"}),h("td",{text:money(T.inR)}),h("td",{text:money(T.outR)}),h("td",null,signed(bal)),h("td",{text:T.inR>0?pct(bal/T.inR):"—"})))))));
  return out;
}

function chartYear(data){
  const NS = "http://www.w3.org/2000/svg";
  const W=720,H=260,L=70,R=12,T=14,B=30,w=W-L-R,hgt=H-T-B;
  const max = Math.max(1,...data.map(d=>Math.max(d.inR,d.outR)));
  const p = 10**Math.floor(Math.log10(max/4)), step = p*[1,2,2.5,5,10].find(k=>k*p*4>=max), top = Math.ceil(max/step)*step;
  const y = v => T+hgt-hgt*v/top;
  const s = (tag,a) => { const e=document.createElementNS(NS,tag); for (const k in a) e.setAttribute(k,a[k]); return e; };
  const svg = s("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Ingresos y gastos por mes"});
  const short = new Intl.NumberFormat("es-PE",{notation:top>=10000?"compact":"standard",maximumFractionDigits:1});
  for (let v=0; v<=top+1e-9; v+=step){
    svg.append(s("line",{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:"var(--glass-line)"}));
    const tx = s("text",{x:L-8,y:y(v)+4,"text-anchor":"end","font-size":"11",fill:"var(--muted)"}); tx.textContent="S/ "+short.format(v); svg.append(tx);
  }
  const band = w/12, bw = Math.min(16,band*0.32);
  data.forEach((d,i)=>{
    const cx = L+band*i+band/2;
    [[d.inR,"var(--accent)",-bw-1],[d.outR,"var(--spend)",1]].forEach(([v,c,off])=>{
      if (v>0) svg.append(s("rect",{x:cx+off,y:y(v),width:bw,height:Math.max(1,y(0)-y(v)),rx:4,fill:c}));
    });
    const cur = S.y===now.getFullYear() && i===now.getMonth();
    const tx = s("text",{x:cx,y:H-10,"text-anchor":"middle","font-size":"11",fill:cur?"var(--ink)":"var(--muted)","font-weight":cur?"700":"400"});
    tx.textContent = d.n.slice(0,3); svg.append(tx);
  });
  return h("div",{class:"glass chart"},svg,h("div",{class:"legend"},
    h("span",null,h("i",{style:"background:var(--accent)"}),"Ingresos"),
    h("span",null,h("i",{style:"background:var(--spend)"}),"Gastos")));
}

/* ---------- préstamos ---------- */
const ESTADOS = [["activo","Activo"],["atrasado","Atrasado"],["pagado","Pagado"]];
const estadoLabel = e => (ESTADOS.find(x=>x[0]===e)||ESTADOS[0])[1];

function viewPrestamos(){
  const list = loans();
  const vivos = list.filter(p=>p.estado!=="pagado"), pagados = list.filter(p=>p.estado==="pagado");
  const sum = (arr,f) => arr.reduce((a,p)=>a+f(loanCalc(p)),0);
  const prestado = sum(vivos,c=>c.monto), porDia = sum(vivos,c=>c.porDia), porMes = sum(vivos,c=>c.porMes), cobrar = sum(vivos,c=>c.total);
  const out = [];
  out.push(hero("Total a cobrar hoy", cobrar, [["Prestado",money(prestado)],["Genera al día",money(porDia)],["Genera al mes",money(porMes)]]));
  out.push(h("div",{class:"kpis"},
    kpi("Préstamos activos",String(vivos.length),vivos.filter(p=>p.estado==="atrasado").length?vivos.filter(p=>p.estado==="atrasado").length+" atrasado(s)":"al día"),
    kpi("Intereses ganados",money(cobrar-prestado),"acumulado a hoy"),
    kpi("Cobrados",String(pagados.length),pagados.length?money(sum(pagados,c=>c.total))+" en total":"todavía ninguno"),
    kpi("Fecha de hoy",fdate(todayISO()),"el cálculo se actualiza solo")));
  out.push(h("section",null,
    h("div",{class:"sechead"},h("h2",{text:"Tus préstamos"}),h("button",{class:"btn sm",onclick:()=>openLoan({})},"+ Nuevo préstamo")),
    list.length ? [
      vivos.length ? h("div",{class:"cards"},vivos.sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).map(loanCard)) : h("div",{class:"glass list"},h("div",{class:"empty",text:"No tienes préstamos activos."})),
      pagados.length ? h("div",null,h("div",{class:"subhead",style:"margin-top:18px",text:"Pagados"}),h("div",{class:"cards"},pagados.map(loanCard))) : null
    ] : h("div",{class:"glass list"},h("div",{class:"empty"},
      h("p",{text:"Aquí controlas el dinero que le prestas a otras personas. Anota el monto, el % mensual y la fecha, y la app te dice cuánto te deben al día de hoy."}),
      h("div",{class:"btnrow"},h("button",{class:"btn",onclick:()=>openLoan({})},"+ Registrar mi primer préstamo"))))));
  return out;
}

function loanCard(p){
  const c = loanCalc(p);
  return h("div",{class:"glass item"+(p.estado==="pagado"?" is-pagado":"")},
    h("div",{class:"t"},h("strong",{text:p.nombre||"Sin nombre"}),h("span",{class:"state "+(p.estado||"activo"),text:estadoLabel(p.estado)})),
    h("div",null,
      h("div",{class:"note",text:p.estado==="pagado"?"Cobró en total":"Cobro a hoy"}),
      h("div",{class:"loan-total",text:money(c.total)})),
    h("div",{class:"loan-grid"},
      h("div",null,h("span",{text:"Prestado"}),h("b",{text:money(c.monto)})),
      h("div",null,h("span",{text:"Interés acumulado"}),h("b",{text:money(c.interes)})),
      h("div",null,h("span",{text:(p.tasa||0)+"% mensual"}),h("b",{text:money(c.porDia)+" / día"})),
      h("div",null,h("span",{text:"Desde "+fdate(p.fecha)}),h("b",{text:c.dias+(c.dias===1?" día":" días")+(p.estado==="pagado"?" (hasta "+fdate(p.fechaPago)+")":"")}))),
    h("div",{class:"inline"},
      p.estado!=="pagado" ? h("button",{class:"btn sm",onclick:()=>openPaid(p)},"Marcar pagado") : null,
      h("button",{class:"btn ghost sm",onclick:()=>openLoan(p)},"Editar")));
}

function openLoan(p){
  const isNew = !p.id; let estado = p.estado||"activo";
  modal(close=>{
    const nombre = h("input",{id:"l-nombre",value:p.nombre||"",placeholder:"Ej. Juan Pérez"});
    const monto = h("input",{id:"l-monto",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:p.monto??"",placeholder:"0.00"});
    const tasa = h("input",{id:"l-tasa",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:p.tasa??"",placeholder:"Ej. 10"});
    const fecha = h("input",{id:"l-fecha",type:"date",value:p.fecha||todayISO()});
    const fechaPago = h("input",{id:"l-fpago",type:"date",value:p.fechaPago||todayISO()});
    const pagoField = field("Fecha en que te pagó",fechaPago);
    const preview = h("div",{class:"calc"});
    const seg = h("div",{class:"seg"});
    const drawSeg = () => { seg.replaceChildren(...ESTADOS.map(([v,l])=>h("button",{type:"button","aria-pressed":String(estado===v),onclick:()=>{estado=v;drawSeg();upd();}},l))); pagoField.hidden = estado!=="pagado"; };
    const upd = () => {
      const c = loanCalc({monto:num(monto.value)||0,tasa:num(tasa.value)||0,fecha:fecha.value,estado,fechaPago:fechaPago.value});
      preview.replaceChildren(
        h("span",null,"Genera ",h("b",{text:money(c.porDia)})," por día · ",money(c.porMes)," al mes"),
        h("span",null,c.dias+" días → interés ",money(c.interes)),
        h("span",null,estado==="pagado"?"Total cobrado: ":"Cobro a hoy: ",h("b",{text:money(c.total)})));
    };
    for (const el of [monto,tasa,fecha,fechaPago]) el.addEventListener("input",upd);
    drawSeg(); upd();
    const del = isNew ? null : delBtn("Eliminar",()=>{ setLoans(loans().filter(x=>x.id!==p.id)); close(); toast("Préstamo eliminado."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const rec = {id:p.id||uid(),nombre:nombre.value.trim()||"Sin nombre",monto:num(monto.value)||0,tasa:num(tasa.value)||0,fecha:fecha.value||todayISO(),estado,fechaPago:estado==="pagado"?(fechaPago.value||todayISO()):null};
      if (rec.monto<=0){ toast("Escribe el monto que prestaste."); return; }
      setLoans(isNew?[...loans(),rec]:loans().map(x=>x.id===rec.id?rec:x)); close(); toast(isNew?"Préstamo registrado.":"Guardado.");
    }},
      h("h3",{text:isNew?"Nuevo préstamo":"Editar préstamo"}),
      field("¿A quién le prestaste?",nombre),
      h("div",{class:"two"},field("Monto (S/)",monto),field("Interés mensual (%)",tasa)),
      field("Fecha del préstamo",fecha),
      h("div",{class:"field"},h("label",{text:"Estado"}),seg),
      pagoField,
      preview,
      h("p",{class:"note",style:"margin:0",text:"El interés se cobra por día: el % mensual dividido entre 30, por cada día que pasa."}),
      h("div",{class:"actions"},del,h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},"Guardar"))));
  });
}

function openPaid(p){
  modal(close=>{
    const fp = h("input",{id:"p-fecha",type:"date",value:todayISO()});
    const info = h("div",{class:"calc"});
    const upd = () => { const c = loanCalc({...p,estado:"pagado",fechaPago:fp.value}); info.replaceChildren(h("span",null,c.dias+" días de interés: ",money(c.interes)),h("span",null,"Total cobrado: ",h("b",{text:money(c.total)}))); };
    fp.addEventListener("input",upd); upd();
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      setLoans(loans().map(x=>x.id===p.id?{...x,estado:"pagado",fechaPago:fp.value||todayISO()}:x)); close(); toast("Préstamo marcado como pagado.");
    }},
      h("h3",{text:"¿Cuándo te pagó "+(p.nombre||"")+"?"}),
      field("Fecha de pago",fp), info,
      h("p",{class:"note",style:"margin:0",text:"Desde esta fecha el préstamo deja de sumar interés."}),
      h("div",{class:"actions"},h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},"Marcar pagado"))));
  });
}

/* ---------- deudas ---------- */
function viewDeudas(){
  const list = debts();
  const tot = list.reduce((a,d)=>a+(d.total||0),0), ab = list.reduce((a,d)=>a+Math.min(d.abonado||0,d.total||0),0);
  const out = [];
  out.push(hero("Te falta pagar", tot-ab, [["Deuda total",money(tot)],["Abonado",money(ab)],["Pagado",pct(tot>0?ab/tot:0)]]));
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Tus deudas"}),h("button",{class:"btn sm",onclick:()=>openDebt({})},"+ Agregar deuda")),
    list.length ? h("div",{class:"cards"},list.map(d=>{
      const paid = Math.min(d.abonado||0,d.total||0), share = d.total>0?paid/d.total:0;
      const inp = h("input",{type:"number",inputmode:"decimal",step:"0.01",min:"0",placeholder:"Monto del abono",id:"ab-"+d.id,"aria-label":"Monto del abono"});
      return h("div",{class:"glass item"},
        h("div",{class:"t"},h("strong",{text:d.nombre||"Deuda"}),h("span",{class:"note",text:pct(share)+" pagado"})),
        h("div",null,h("div",{class:"note",text:"Te falta"}),h("div",{class:"loan-total",text:money((d.total||0)-paid)})),
        h("div",{class:"prog",role:"progressbar","aria-valuenow":Math.round(share*100),"aria-valuemin":"0","aria-valuemax":"100"},h("div",{style:"width:"+share*100+"%"})),
        h("div",{class:"note",text:money(paid)+" abonado de "+money(d.total)}),
        paid>=d.total && d.total>0 ? h("p",{class:"pos",style:"margin:0;font-weight:600",text:"¡Pagada por completo!"}) : null,
        h("div",{class:"inline"},inp,
          h("button",{class:"btn sm",onclick:()=>{ const v=num(inp.value); if(!v||v<=0){toast("Escribe un monto mayor a cero.");return}
            setDebts(debts().map(x=>x.id===d.id?{...x,abonado:(x.abonado||0)+v}:x)); toast("Abono de "+money(v)+" registrado."); }},"Abonar"),
          h("button",{class:"btn ghost sm",onclick:()=>openDebt(d)},"Editar")));
    })) : h("div",{class:"glass list"},h("div",{class:"empty",text:"No tienes deudas registradas. Si tienes alguna (estudios, celular en cuotas, tarjeta), agrégala para ver cuánto te falta."}))));
  return out;
}

/* ---------- ajustes ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.view==="ajustes") render(); });

function viewAjustes(){
  const out = [];
  const presets = ["#12a37a","#2f6bff","#7c4dff","#e0457b","#ff7a1a","#0fb5c9","#e5484d","#1f2937"];
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Apariencia"})),
    h("div",{class:"glass card"},
      h("div",{class:"seg",role:"group","aria-label":"Modo"},
        h("button",{type:"button","aria-pressed":String(curTheme()==="light"),onclick:()=>{applyTheme("light");savePref("tema","light");}},"☀️ Día"),
        h("button",{type:"button","aria-pressed":String(curTheme()==="dark"),onclick:()=>{applyTheme("dark");savePref("tema","dark");}},"🌙 Noche")),
      h("p",{class:"note",text:"Color de la app: elige uno o toca 🎨 arriba para escoger cualquier tono."}),
      h("div",{class:"inline"},presets.map(c=>h("button",{type:"button","aria-label":"Color "+c,style:`width:36px;height:36px;border-radius:50%;border:2px solid var(--glass-line);background:${c}`,onclick:()=>{applyColor(c);savePref("color",c);}}))))));

  const catSection = tipo => {
    const list = cats(tipo);
    const inp = h("input",{id:"newcat-"+tipo,placeholder:tipo==="in"?"Nueva categoría de ingreso":"Nueva categoría de gasto","aria-label":"Nueva categoría"});
    const add = () => {
      const v = inp.value.trim(); if (!v) return;
      if (list.some(c=>c.toLowerCase()===v.toLowerCase())) { toast("Esa categoría ya existe."); return; }
      tipo==="in" ? setCats([...list,v],cats("out")) : setCats(cats("in"),[...list,v]);
      toast("Categoría agregada.");
    };
    inp.addEventListener("keydown",e=>{ if(e.key==="Enter") add(); });
    return h("section",null,
      h("div",{class:"sechead"},h("h2",{text:tipo==="in"?"Categorías de ingreso":"Categorías de gasto"})),
      h("div",{class:"glass list"},
        list.map(c=>h("div",{class:"catrow"},
          h("span",{text:c}),
          h("button",{class:"btn ghost sm",onclick:()=>renameCat(tipo,c)},"Renombrar"),
          delBtn("Quitar",()=>{ const nl = list.filter(x=>x!==c); tipo==="in"?setCats(nl,cats("out")):setCats(cats("in"),nl); toast("Categoría quitada. Tus movimientos anteriores la conservan."); }))),
        h("div",{class:"catrow"},h("div",{class:"inline",style:"flex:1"},inp,h("button",{class:"btn sm",onclick:add},"Agregar")))));
  };
  out.push(catSection("out"), catSection("in"));

  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Exportar"})),
    h("div",{class:"glass card"},h("p",{class:"note",text:"Descarga un Excel con el resumen del año, una hoja por mes, tus préstamos y tus deudas."}),
      h("div",null,h("button",{class:"btn",onclick:exportYear},"Descargar "+S.y+" en Excel")))));

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Instalar en tu celular"})),
    h("div",{class:"glass card"}, standalone ? h("p",{text:"Ya la estás usando como app. 👌"}) : [
      installEvt ? h("div",null,h("button",{class:"btn",onclick:async()=>{ installEvt.prompt(); await installEvt.userChoice; installEvt=null; render(); }},"Instalar app")) : null,
      h("p",{class:"note",text:"Android (Chrome): menú ⋮ → «Instalar app» o «Agregar a la pantalla principal»."}),
      h("p",{class:"note",text:"iPhone (Safari): botón Compartir → «Agregar a inicio»."})])));

  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Cuenta"})),
    h("div",{class:"glass card"},
      S.store && S.store.demo ? h("p",{class:"note",text:"Modo prueba, sin cuenta."})
      : [h("p",null,"Entraste como ",h("strong",{text:S.email})),
         h("p",{class:"note",text:"Para que otra persona use la app con sus propios datos, agrega su Gmail en Firebase → Firestore → permitidos, y pásale el link."}),
         h("div",null,h("button",{class:"btn ghost",onclick:()=>S.store.signOut()},"Cerrar sesión"))])));
  return out;
}

function delBtn(label,fn){
  let armed = false;
  const b = h("button",{class:"btn ghost sm",type:"button",onclick:()=>{
    if (!armed){ armed=true; b.className="btn danger sm"; b.textContent="¿Seguro?"; setTimeout(()=>{ if(b.isConnected){armed=false;b.className="btn ghost sm";b.textContent=label;} },3500); return; }
    fn();
  }},label);
  return b;
}

function renameCat(tipo,old){
  modal(close=>{
    const inp = h("input",{id:"f-rename",value:old});
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const v = inp.value.trim(); if (!v || v===old) { close(); return; }
      const list = cats(tipo);
      if (list.some(c=>c!==old && c.toLowerCase()===v.toLowerCase())) { toast("Esa categoría ya existe."); return; }
      const nl = list.map(c=>c===old?v:c);
      tipo==="in" ? setCats(nl,cats("out")) : setCats(cats("in"),nl);
      for (const id of Object.keys(S.docs)) if (id.startsWith("m-")) {
        const its = S.docs[id].items||[];
        if (its.some(i=>i.tipo===tipo && i.cat===old)) save(id,{...S.docs[id],items:its.map(i=>i.tipo===tipo&&i.cat===old?{...i,cat:v}:i)});
      }
      close(); toast("Categoría renombrada en todos tus meses.");
    }},
      h("h3",{text:"Renombrar categoría"}), field("Nuevo nombre",inp),
      h("div",{class:"actions"},h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},"Guardar"))));
  });
}

/* ======================= formularios ======================= */
function modal(content){
  const layer = $("layer");
  const close = () => { layer.replaceChildren(); document.removeEventListener("keydown",esc); };
  const esc = e => { if (e.key==="Escape") close(); };
  document.addEventListener("keydown",esc);
  const ov = h("div",{class:"overlay",onclick:e=>{ if(e.target===ov) close(); }},h("div",{class:"sheet",role:"dialog","aria-modal":"true"},content(close)));
  layer.replaceChildren(ov);
  const f = ov.querySelector("input:not([type=date]),select"); if (f && matchMedia("(pointer:fine)").matches) f.focus();
}
const field = (lab,el) => h("div",{class:"field"},h("label",{for:el.id,text:lab}),el);

function openMov(it){
  const isNew = !it.id; let tipo = it.tipo||"out";
  modal(close=>{
    const concepto = h("input",{id:"f-concepto",value:it.concepto||"",placeholder:"Ej. Sueldo, Alquiler, Menú"});
    const cat = h("select",{id:"f-cat"});
    const fecha = h("input",{id:"f-fecha",type:"date",value:it.fecha||""});
    const plan = h("input",{id:"f-plan",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:it.plan??"",placeholder:"0.00"});
    const real = h("input",{id:"f-real",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:it.real??"",placeholder:"0.00"});
    const fillCats = () => {
      const list = [...cats(tipo)];
      if (it.cat && it.tipo===tipo && !list.includes(it.cat)) list.push(it.cat);
      cat.replaceChildren(...list.map(c=>h("option",{value:c,selected:c===it.cat},c)));
    };
    fillCats();
    const bIn = h("button",{type:"button","aria-pressed":String(tipo==="in")},"Ingreso");
    const bOut = h("button",{type:"button","aria-pressed":String(tipo==="out")},"Gasto");
    const setT = v => { tipo=v; bIn.setAttribute("aria-pressed",String(v==="in")); bOut.setAttribute("aria-pressed",String(v==="out")); fillCats(); };
    bIn.onclick = () => setT("in"); bOut.onclick = () => setT("out");
    const del = isNew ? null : delBtn("Eliminar",()=>{ setItems(S.y,S.m,items(S.y,S.m).filter(x=>x.id!==it.id)); close(); toast("Movimiento eliminado."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const rec = {id:it.id||uid(),tipo,concepto:concepto.value.trim()||cat.value,cat:cat.value,fecha:fecha.value||"",plan:num(plan.value),real:num(real.value)};
      if (rec.plan==null && rec.real==null){ toast("Escribe al menos un monto planeado o real."); return; }
      const list = items(S.y,S.m);
      setItems(S.y,S.m,isNew?[...list,rec]:list.map(x=>x.id===rec.id?rec:x));
      close(); toast(isNew?"Agregado.":"Guardado.");
    }},
      h("h3",{text:(isNew?"Nuevo movimiento · ":"Editar · ")+MESES[S.m]}),
      h("div",{class:"seg"},bIn,bOut),
      field("Concepto",concepto),
      h("div",{class:"two"},field("Categoría",cat),field("Fecha",fecha)),
      h("div",{class:"two"},field("Planeado (S/)",plan),field("Real (S/)",real)),
      h("p",{class:"note",style:"margin:0",text:"Planeado es lo que esperas; Real es lo que de verdad entró o salió. Puedes dejar uno vacío."}),
      h("div",{class:"actions"},del,h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},"Guardar"))));
  });
}

function openDebt(d){
  const isNew = !d.id;
  modal(close=>{
    const nombre = h("input",{id:"d-nombre",value:d.nombre||"",placeholder:"Ej. Universidad, Celular"});
    const total = h("input",{id:"d-total",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:d.total??""});
    const abonado = h("input",{id:"d-abonado",type:"number",inputmode:"decimal",step:"0.01",min:"0",value:d.abonado??""});
    const del = isNew ? null : delBtn("Eliminar",()=>{ setDebts(debts().filter(x=>x.id!==d.id)); close(); toast("Deuda eliminada."); });
    return h("form",{style:"display:grid;gap:12px",onsubmit:e=>{
      e.preventDefault();
      const rec = {id:d.id||uid(),nombre:nombre.value.trim()||"Deuda",total:num(total.value)||0,abonado:num(abonado.value)||0};
      if (rec.total<=0){ toast("Escribe el monto total de la deuda."); return; }
      setDebts(isNew?[...debts(),rec]:debts().map(x=>x.id===rec.id?rec:x)); close(); toast("Guardado.");
    }},
      h("h3",{text:isNew?"Nueva deuda":"Editar deuda"}),
      field("Nombre",nombre),
      h("div",{class:"two"},field("Monto total (S/)",total),field("Ya abonado (S/)",abonado)),
      h("div",{class:"actions"},del,h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:close},"Cancelar"),h("button",{class:"btn",type:"submit"},"Guardar"))));
  });
}

/* ======================= exportar ======================= */
async function exportYear(){
  const y = S.y, data = yearData(y);
  const resumen = [["Mes","Ingresos","Gastos","Sobrante","% ahorro"],
    ...data.map(d=>[cap(d.n),d.inR,d.outR,d.bal,d.inR>0?d.rate:null])];
  const movs = m => [["Fecha","Tipo","Concepto","Categoría","Planeado","Real"],
    ...items(y,m).map(i=>[fdate(i.fecha),i.tipo==="in"?"Ingreso":"Gasto",i.concepto||"",i.cat||"",i.plan,i.real])];
  const pres = [["Persona","Monto","% mensual","Fecha","Estado","Días","Interés","Total"],
    ...loans().map(p=>{ const c=loanCalc(p); return [p.nombre,c.monto,p.tasa,fdate(p.fecha),estadoLabel(p.estado),c.dias,Math.round(c.interes*100)/100,Math.round(c.total*100)/100]; })];
  const deu = [["Deuda","Monto total","Abonado","Restante"],...debts().map(d=>[d.nombre,d.total,d.abonado||0,(d.total||0)-(d.abonado||0)])];
  try {
    const X = await import(SHEETJS);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(resumen),"Resumen "+y);
    MESES.forEach((n,m)=>{ if (items(y,m).length) X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(movs(m)),cap(n)); });
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(pres),"Préstamos");
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(deu),"Deudas");
    X.writeFile(wb,"mis-finanzas-"+y+".xlsx");
  } catch(e){
    const rows = [["Resumen "+y],...resumen,[],...MESES.flatMap((n,m)=>items(y,m).length?[[cap(n)],...movs(m),[]]:[]),["Préstamos"],...pres,[],["Deudas"],...deu];
    const csv = "﻿"+rows.map(r=>r.map(c=>c==null?"":'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const a = h("a",{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:"mis-finanzas-"+y+".csv"});
    document.body.append(a); a.click(); a.remove();
  }
}

/* ======================= navegación e inicio ======================= */
function remember(){ try{ sessionStorage.setItem("mf-view",S.view); }catch(e){} }
$("prev").onclick = () => { if (S.view==="anio") S.y--; else if (S.m===0){S.m=11;S.y--;} else S.m--; render(); };
$("next").onclick = () => { if (S.view==="anio") S.y++; else if (S.m===11){S.m=0;S.y++;} else S.m++; render(); };
$("btn-theme").onclick = () => { const t = curTheme()==="dark"?"light":"dark"; applyTheme(t); savePref("tema",t); if (S.view==="ajustes") render(); };
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

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
