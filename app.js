// Mis Finanzas — lógica de la app
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DEF_IN = ["Sueldo","Horas extra","Freelance","Otros ingresos"];
const DEF_OUT = ["Vivienda","Comida","Transporte","Celular / Internet","Servicios","Tarjetas / Deudas","Salud","Educación","Ocio","Compras","Otros"];

const fmt = new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2});
const money = v => fmt.format(v||0);
const pct = v => (isFinite(v)?(v*100).toFixed(1):"0.0")+"%";
const num = v => { const n = parseFloat(String(v).replace(",",".")); return isFinite(n)?n:null; };
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);

const now = new Date();
const S = { view:"mes", y:now.getFullYear(), m:now.getMonth(), docs:{}, store:null, email:"" };
try { const v = sessionStorage.getItem("mf-view"); if (v) S.view = v; } catch(e) {}

const key = (y,m) => "m-"+y+"-"+String(m+1).padStart(2,"0");
const items = (y,m) => (S.docs[key(y,m)]||{}).items || [];
const debts = () => (S.docs["deudas"]||{}).items || [];
const cats = tipo => { const a = S.docs["ajustes"]||{}; return (tipo==="in"?a.catIn:a.catOut) || (tipo==="in"?DEF_IN:DEF_OUT); };

const $ = id => document.getElementById(id);
function show(screen){ for (const s of ["loading","login","denied","app"]) $("screen-"+s).hidden = s!==screen; }

/* ======================= almacenamiento ======================= */

// Modo prueba: guarda en este navegador
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

// Firebase: login con Google + Firestore
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
          ? "Este dominio no está autorizado en Firebase. Revisa el paso 3 de la guía."
          : "No se pudo entrar. Revisa tu conexión e intenta de nuevo.";
      }
    }
  };
  $("btn-logout-denied").onclick = () => A.signOut(auth);

  return new Promise(resolve => {
    let unsub = null;
    A.onAuthStateChanged(auth, async user => {
      if (unsub) { unsub(); unsub = null; }
      if (!user) { S.docs = {}; show("login"); return; }
      const email = (user.email||"").toLowerCase();
      S.email = email;
      let ok = false;
      try { ok = (await F.getDoc(F.doc(db,"permitidos",email))).exists(); } catch(e) { ok = false; }
      if (!ok) { $("denied-email").textContent = email; show("denied"); return; }
      const col = F.collection(db,"usuarios",user.uid,"datos");
      const store = {
        demo:false,
        subscribe(cb){
          unsub = F.onSnapshot(col, snap => {
            const d = {}; snap.forEach(x => d[x.id] = x.data()); cb(d);
            setStatus(snap.metadata.fromCache ? "Sin conexión: lo que anotes se guardará al volver internet." : "");
          }, () => setStatus("No se pudieron cargar tus datos. Recarga la página."));
        },
        save(id,val){ F.setDoc(F.doc(col,id),val).catch(() => toast("No se pudo guardar. Revisa tu conexión.")); },
        signOut(){ return A.signOut(auth); }
      };
      resolve(store); startApp(store);
    });
  });
}

function save(id,data){ S.docs[id]=clean(data); render(); S.store && S.store.save(id,S.docs[id]); }
function clean(o){ return JSON.parse(JSON.stringify(o,(k,v)=>v===undefined?null:v)); }
const setItems = (y,m,list) => save(key(y,m),{items:list,anio:y,mes:m+1});
const setDebts = list => save("deudas",{items:list});
const setCats = (catIn,catOut) => save("ajustes",{...(S.docs.ajustes||{}),catIn,catOut});

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
const kpi = (lab,val,sub,cls) => h("div",{class:"kpi "+(cls||"")},h("div",{class:"lab",text:lab}),h("div",{class:"val"},val),sub?h("div",{class:"sub"},sub):null);
const fdate = f => f ? f.split("-").reverse().join("/") : "";

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

/* ======================= vistas ======================= */
function render(){
  $("mlabel").textContent = S.view==="anio" ? String(S.y) : (S.view==="mes" ? MESES[S.m]+" "+S.y : "");
  $("prev").hidden = $("next").hidden = !(S.view==="mes"||S.view==="anio");
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected",String(b.dataset.v===S.view));
  const app = $("app"); app.replaceChildren();
  if (S.store && S.store.demo) app.append(h("div",{class:"demo",text:"Modo prueba: los datos se guardan solo en este navegador. Cuando conectes Firebase (ver guía), se guardarán en tu cuenta."}));
  const v = {mes:viewMes, anio:viewAnio, deudas:viewDeudas, ajustes:viewAjustes}[S.view] || viewMes;
  app.append(...v());
}

function viewMes(){
  const list = items(S.y,S.m), t = totals(list), out = [];
  out.push(h("div",{class:"kpis"},
    kpi("Ingresos",money(t.inR),"Planeado "+money(t.inP)),
    kpi("Gastos",money(t.outR),"Planeado "+money(t.outP)),
    kpi("Sobrante",signed(t.bal),"Planeado "+money(t.balP),"hero"),
    kpi("% de ahorro",h("span",{class:t.rate<0?"neg":"",text:pct(t.rate)}),t.inR>0?"del ingreso del mes":"sin ingresos aún")));

  if (!list.length){
    const py = S.m===0?S.y-1:S.y, pm = S.m===0?11:S.m-1, prev = items(py,pm);
    out.push(h("div",{class:"list"},h("div",{class:"empty"},
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
      h("div",{class:"bars"},rows.map(([n,v])=>h("div",{class:"bar"},
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
    h("div",{class:"list"}, mine.length ? mine.map(it=>{
      const diff = it.plan!=null && it.real!=null ? (tipo==="in"?it.real-it.plan:it.plan-it.real) : null;
      return h("button",{class:"row",onclick:()=>openMov(it),"aria-label":"Editar "+(it.concepto||"movimiento")},
        h("span",{class:"c",text:it.concepto||"(sin nombre)"}),
        h("span",{class:"a"}, it.real!=null ? money(it.real) : h("span",{class:"note",text:"pendiente"})),
        h("span",{class:"m"},h("span",{class:"chip"+(tipo==="out"?" out":""),text:it.cat||"Otros"}),it.fecha?h("span",{text:fdate(it.fecha)}):null),
        h("span",{class:"p"}, it.plan!=null?"Plan "+money(it.plan):"", diff?h("span",{class:diff<0?"neg":"pos",text:" ("+(diff>0?"+":"")+money(diff)+")"}):null));
    }) : h("div",{class:"empty",text:tipo==="in"?"Sin ingresos este mes.":"Sin gastos este mes."})));
}

function yearData(y){ return MESES.map((n,m)=>({n,m,...totals(items(y,m))})); }

function viewAnio(){
  const data = yearData(S.y);
  const T = data.reduce((a,d)=>({inR:a.inR+d.inR,outR:a.outR+d.outR}),{inR:0,outR:0});
  const bal = T.inR-T.outR, out = [];
  out.push(h("div",{class:"kpis"},
    kpi("Ingresos del año",money(T.inR)), kpi("Gastos del año",money(T.outR)),
    kpi("Ahorrado",signed(bal),null,"hero"), kpi("% de ahorro",pct(T.inR>0?bal/T.inR:0))));
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Ingresos y gastos por mes"})),chartYear(data)));
  const go = m => { S.m=m; S.view="mes"; remember(); render(); window.scrollTo(0,0); };
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Mes a mes"}),h("span",{class:"tot",text:"Toca un mes para abrirlo"})),
    h("div",{class:"tablewrap"},h("table",null,
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
    svg.append(s("line",{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:"var(--line)"}));
    const tx = s("text",{x:L-8,y:y(v)+4,"text-anchor":"end","font-size":"11",fill:"var(--muted)"}); tx.textContent="S/ "+short.format(v); svg.append(tx);
  }
  const band = w/12, bw = Math.min(16,band*0.32);
  data.forEach((d,i)=>{
    const cx = L+band*i+band/2;
    [[d.inR,"var(--brand)",-bw-1],[d.outR,"var(--spend)",1]].forEach(([v,c,off])=>{
      if (v>0) svg.append(s("rect",{x:cx+off,y:y(v),width:bw,height:Math.max(1,y(0)-y(v)),rx:3,fill:c}));
    });
    const cur = S.y===now.getFullYear() && i===now.getMonth();
    const tx = s("text",{x:cx,y:H-10,"text-anchor":"middle","font-size":"11",fill:cur?"var(--ink)":"var(--muted)","font-weight":cur?"600":"400"});
    tx.textContent = d.n.slice(0,3); svg.append(tx);
  });
  return h("div",{class:"chart"},svg,h("div",{class:"legend"},
    h("span",null,h("i",{style:"background:var(--brand)"}),"Ingresos"),
    h("span",null,h("i",{style:"background:var(--spend)"}),"Gastos")));
}

function viewDeudas(){
  const list = debts();
  const tot = list.reduce((a,d)=>a+(d.total||0),0), ab = list.reduce((a,d)=>a+Math.min(d.abonado||0,d.total||0),0);
  const out = [];
  out.push(h("div",{class:"kpis"},kpi("Deuda total",money(tot)),kpi("Abonado",money(ab)),kpi("Te falta pagar",money(tot-ab),null,"hero"),kpi("% pagado",pct(tot>0?ab/tot:0))));
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Tus deudas"}),h("button",{class:"btn ghost sm",onclick:()=>openDebt({})},"+ Agregar deuda")),
    list.length ? h("div",{class:"debts"},list.map(d=>{
      const paid = Math.min(d.abonado||0,d.total||0), share = d.total>0?paid/d.total:0;
      const inp = h("input",{type:"number",inputmode:"decimal",step:"0.01",min:"0",placeholder:"Monto del abono",id:"ab-"+d.id,"aria-label":"Monto del abono"});
      return h("div",{class:"debt"},
        h("div",{class:"t"},h("strong",{text:d.nombre||"Deuda"}),h("span",{class:"note",text:money(paid)+" de "+money(d.total)+" · falta "+money((d.total||0)-paid)})),
        h("div",{class:"prog",role:"progressbar","aria-valuenow":Math.round(share*100),"aria-valuemin":"0","aria-valuemax":"100"},h("div",{style:"width:"+share*100+"%"})),
        paid>=d.total && d.total>0 ? h("p",{class:"pos",style:"margin:0;font-weight:600",text:"¡Pagada por completo!"}) : null,
        h("div",{class:"inline"},inp,
          h("button",{class:"btn",onclick:()=>{ const v=num(inp.value); if(!v||v<=0){toast("Escribe un monto mayor a cero.");return}
            setDebts(debts().map(x=>x.id===d.id?{...x,abonado:(x.abonado||0)+v}:x)); toast("Abono de "+money(v)+" registrado."); }},"Registrar abono"),
          h("button",{class:"btn ghost",onclick:()=>openDebt(d)},"Editar")));
    })) : h("div",{class:"list"},h("div",{class:"empty",text:"No tienes deudas registradas. Si tienes alguna (estudios, celular en cuotas, tarjeta), agrégala para ver cuánto te falta."}))));
  return out;
}

let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.view==="ajustes") render(); });

function viewAjustes(){
  const out = [];
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
      h("div",{class:"list"},
        h("div",{class:"catlist"},list.map(c=>h("div",{class:"catrow"},
          h("span",{text:c}),
          h("button",{class:"btn ghost sm",onclick:()=>renameCat(tipo,c)},"Renombrar"),
          delBtn("Quitar",()=>{ const nl = list.filter(x=>x!==c); tipo==="in"?setCats(nl,cats("out")):setCats(cats("in"),nl); toast("Categoría quitada. Tus movimientos anteriores la conservan."); }))),
        h("div",{class:"catrow"},h("div",{class:"inline",style:"flex:1"},inp,h("button",{class:"btn sm",onclick:add},"Agregar"))))));
  };
  out.push(catSection("out"), catSection("in"));

  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Exportar"})),
    h("div",{class:"card"},h("p",{class:"note",text:"Descarga un Excel con el resumen del año, una hoja por mes y tus deudas."}),
      h("div",null,h("button",{class:"btn",onclick:exportYear},"Descargar "+S.y+" en Excel")))));

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Instalar en tu celular"})),
    h("div",{class:"card"}, standalone ? h("p",{text:"Ya la estás usando como app. 👌"}) : [
      installEvt ? h("div",null,h("button",{class:"btn",onclick:async()=>{ installEvt.prompt(); await installEvt.userChoice; installEvt=null; render(); }},"Instalar app")) : null,
      h("p",{class:"note",text:"Android (Chrome): menú ⋮ → «Agregar a la pantalla principal» o «Instalar app»."}),
      h("p",{class:"note",text:"iPhone (Safari): botón Compartir → «Agregar a inicio»."})])));

  out.push(h("section",null,h("div",{class:"sechead"},h("h2",{text:"Cuenta"})),
    h("div",{class:"card"},
      S.store && S.store.demo ? h("p",{class:"note",text:"Modo prueba, sin cuenta. Conecta Firebase siguiendo la guía para entrar con Google."})
      : [h("p",null,"Entraste como ",h("strong",{text:S.email})),
         h("p",{class:"note",text:"Para que otra persona use la app con sus propios datos, agrega su correo en Firebase (ver guía, paso 6) y pásale el link."}),
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
  const deu = [["Deuda","Monto total","Abonado","Restante"],...debts().map(d=>[d.nombre,d.total,d.abonado||0,(d.total||0)-(d.abonado||0)])];
  try {
    const X = await import(SHEETJS);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(resumen),"Resumen "+y);
    MESES.forEach((n,m)=>{ if (items(y,m).length) X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(movs(m)),cap(n)); });
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(deu),"Deudas");
    X.writeFile(wb,"mis-finanzas-"+y+".xlsx");
  } catch(e){
    // Sin conexión a la librería: CSV que abre Excel
    const rows = [["Resumen "+y],...resumen,[],...MESES.flatMap((n,m)=>items(y,m).length?[[cap(n)],...movs(m),[]]:[]),["Deudas"],...deu];
    const csv = "﻿"+rows.map(r=>r.map(c=>c==null?"":'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const a = h("a",{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:"mis-finanzas-"+y+".csv"});
    document.body.append(a); a.click(); a.remove();
  }
}

/* ======================= navegación e inicio ======================= */
function remember(){ try{ sessionStorage.setItem("mf-view",S.view); }catch(e){} }
$("prev").onclick = () => { if (S.view==="anio") S.y--; else if (S.m===0){S.m=11;S.y--;} else S.m--; render(); };
$("next").onclick = () => { if (S.view==="anio") S.y++; else if (S.m===11){S.m=0;S.y++;} else S.m++; render(); };
for (const b of document.querySelectorAll(".tab")) b.onclick = () => { S.view=b.dataset.v; remember(); render(); window.scrollTo(0,0); };

function startApp(store){
  S.store = store;
  show("app"); render();
  store.subscribe(d => { S.docs = d; render(); });
}

(async () => {
  const cfg = (window.MF_CONFIG||{}).firebase||{};
  const configured = cfg.apiKey && !String(cfg.apiKey).includes("PEGA_AQUI");
  if (!configured) { startApp(localStore()); return; }
  try { await firebaseStore(cfg); }
  catch(e){ show("login"); $("login-error").textContent = "No se pudo conectar con Firebase. Revisa tu internet o los datos de config.js."; }
})();

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
