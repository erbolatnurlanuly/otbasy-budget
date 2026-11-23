const TABS=[["home","🏠","Басты"],["bud","💵","Бюджет"],["debt","💳","Қарыз"],["inv","📈","Инвест"],["met","📐","Методика"],["shop","🛒","Тізім"],["note","📝","Өзгерту"],["me","🔒","Жеке"]];
const BASE=[["🛒","Продукт"],["🚗","Көлік"],["🏠","Коммуналка"],["📱","Байланыс"],["🎁","Сыйлық"],["💊","Дәрі"],["👕","Киім"],["🎈","Көңіл көтеру"],["📦","Басқа"]];
let CATS=BASE;
function rebuildCats(){CATS=BASE.map((c,i)=>{const o=S.cats.find(x=>x.id==="c"+i);return o?[o.e||c[0],o.n||c[1]]:c}).concat(customCats().map(x=>[x.e||"📦",x.n||"Жаңа"]))}
const customCats=()=>S.cats.filter(x=>x.id[0]==="x").sort((a,b)=>(a.t||0)-(b.t||0));
const catId=i=>i<BASE.length?"c"+i:(customCats()[i-BASE.length]||{}).id;
const cat=i=>CATS[i]||CATS[BASE.length-1];
const DT={my:"Менің қарызым",owed:"Маған қарыз",credit:"Несие",inst:"Бөліп төлеу"};
const DC={my:"#ffa726",owed:"#4dd0e1",credit:"#ff7043",inst:"#ffd54f"};
const COL=["#4a9a8c","#ffa726","#ff7043","#ffd54f","#7e9cf0","#c78bd9","#4dd0e1","#a1887f","#90a4ae"];
let INCOME=[],BILLS=[],db=null,uid=null;
const S={tab:"home",met:[],mset:[],sub:{bud:"exp",debt:"all"},cat:0,debts:[],shop:[],notes:[],msec:[],incOpen:null,cats:[],inf:[],mode:"out",edit:null,per:"month",ad:null,at:null,sec:null,log:[],mine:[],income:[],bills:[],exp:[],lim:[],dep:[],budget:30000};
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(n).toLocaleString("ru-RU")+" ₸";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const num=id=>Number(($("#"+id)||{}).value)||0;
const txt=id=>(($("#"+id)||{}).value||"").trim();
const thisM=t=>{const a=new Date(t),b=new Date();return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear()};
function sub(path,key){db.collection(path).onSnapshot(s=>{S[key]=s.docs.map(d=>({id:d.id,...d.data()}));if(key==="cats")rebuildCats();render()},()=>{})}
async function init(){
  db=window.FDB;uid=db.uid;
  sub("debts","debts");sub("methods","met");sub("mset","mset");sub("shop","shop");sub("notes","notes");sub("msec","msec");sub("cats","cats");sub("inflow","inf");sub("fundlog","log");sub("expenses","exp");sub("limits","lim");sub("deposits","dep");sub("data/users/"+uid,"mine");
  db.collection("income").onSnapshot(s=>{S.income=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.day-b.day);INCOME=S.income.map(x=>[x.day,x.amt,x.name]);render()},()=>{});
  db.collection("bills").onSnapshot(s=>{S.bills=s.docs.map(d=>({id:d.id,...d.data()}));BILLS=S.bills.map(x=>[x.name,x.amt]);render()},()=>{});
  db.collection("fund").doc("main").onSnapshot(d=>{if(d.exists)S.budget=d.data().budget||30000;render()},()=>{});
  render();
}
function pills(t,l){return `<div class="pills">${l.map(([k,n])=>`<button class="${S.sub[t]===k?"":"g"}" onclick="sub2('${t}','${k}')">${n}</button>`).join("")}</div>`}
const sub2=(t,k)=>{S.sub[t]=k;render()};
function donut(items,label,total){let a=0;const t=items.reduce((s,x)=>s+x.v,0)||1,g=items.filter(x=>x.v>0).map(x=>{const s=a;a+=x.v/t*100;return `${x.c} ${s}% ${a}%`}).join(",");
  return `<div class="dn" style="background:${g?`conic-gradient(${g})`:"var(--ac2)"}"><div><div class="mu">${label}</div><b style="font-size:19px">${fmt(total)}</b></div></div>`}
function nextIncome(){const now=new Date(),y=now.getFullYear(),m=now.getMonth(),t=new Date(y,m,now.getDate()),out=[];
  for(const k of [0,1])for(const [d,a,n] of INCOME){const dt=new Date(y,m+k,d);if(dt>=t)out.push({dt,a,n})}
  return out.sort((a,b)=>a.dt-b.dt).slice(0,3)}
/* ---- debts math ---- */
function mp(d){const n=d.months||0;if(!n)return 0;if(d.sched)return d.sched[d.pm||0]||0;if(d.mpay)return d.mpay;const r=(d.rate||0)/1200,P=d.total;
  if(d.kind==="diff")return P/n+(P-P/n*(d.pm||0))*r;
  return r?P*r/(1-Math.pow(1+r,-n)):P/n}
function tp(d){const n=d.months||0;if(!n||d.fixed)return d.total;const r=(d.rate||0)/1200;return d.kind==="diff"?d.total+r*d.total*(n+1)/2:mp(d)*n}
const left=d=>Math.max(0,tp(d)-d.paid);
const ty=d=>d.type||"my";
const myOwe=()=>S.debts.filter(d=>ty(d)!=="owed").reduce((s,d)=>s+left(d),0);
/* ---- tabs ---- */
function home(){
  if(S.incOpen)return incView();
  const inc=INCOME.reduce((s,x)=>s+x[1],0),bill=BILLS.reduce((s,x)=>s+x[1],0),owe=myOwe();
  const up=nextIncome().map(x=>`<div class="row sp it"><span>${x.dt.getDate()}.${String(x.dt.getMonth()+1).padStart(2,"0")} · ${x.n}</span><b class="pos">+${fmt(x.a)}</b></div>`).join("");
  const mon=S.debts.filter(d=>d.months&&d.pm<d.months).reduce((s,d)=>s+mp(d),0);
  return `<h1>Отбасылық бюджет</h1>
  <div class="card"><div class="mu">Ай сайынғы табыс</div><div class="big">${fmt(inc)}</div>
  <div class="row sp it"><span>Міндетті шығын</span><b>${fmt(bill)}</b></div>
  <div class="row sp it"><span>Несие/бөліп төлеу (айына)</span><b>${fmt(mon)}</b></div>
  <div class="row sp it"><span>Қалады</span><b class="${inc-bill-mon<0?"neg":"pos"}">${fmt(inc-bill-mon)}</b></div>
  <div class="row sp it"><span>Жалпы қарыз қалдығы</span><b class="${owe?"neg":"pos"}">${fmt(owe)}</b></div></div>
  <div class="card"><b>Жақын түсетін ақша</b>${up}</div>
  <div class="card"><b>Табыс көздері</b>${S.income.map(x=>{const pl=x.plan||[],d=pl.filter(p=>p.done===curM()).length;return `<div class="row sp it" style="cursor:pointer" onclick="S.incOpen='${x.id}';render();scrollTo(0,0)"><span>${x.day}-і · ${esc(x.name)} <span class="mu">›</span>${pl.length?` <span class="mu">✓${d}/${pl.length}</span>`:""}</span><span>${fmt(x.amt)} <button class="x" onclick="event.stopPropagation();del('income','${x.id}')">✕</button></span></div>`}).join("")}
  <div class="row" style="margin-top:8px"><input id="in" placeholder="Атауы"><input id="ia" type="number" inputmode="numeric" placeholder="Сома"><input id="id" type="number" inputmode="numeric" placeholder="Күні" style="max-width:80px"></div><button style="margin-top:8px;width:100%" onclick="addInc()">Табыс қосу</button></div>
  <div class="card"><b>Тұрақты шығындар</b>${S.bills.map(b=>`<div class="row sp it"><span>${esc(b.name)}</span><span>${fmt(b.amt)} <button class="x" onclick="del('bills','${b.id}')">✕</button></span></div>`).join("")}
  <div class="row" style="margin-top:8px"><input id="bn" placeholder="Атауы"><input id="ba" type="number" inputmode="numeric" placeholder="Сома"></div><button style="margin-top:8px;width:100%" onclick="addBill()">Шығын қосу</button></div>`;
}
function bud(){const s=S.sub.bud;return `<h1>Бюджет</h1>`+pills("bud",[["exp","Шығындар"],["lim","Лимиттер"],["fund","Қор"],["cats","Санаттар"]])+(s==="exp"?exp():s==="lim"?lim():s==="cats"?catsV():fun())}
function hm(t){const d=new Date(t);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}
const fdm=t=>{const d=new Date(t);return String(d.getDate()).padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+" "+hm(t)};
function editBox(x){const k=x.k,id=x.id;
  return `<div style="background:var(--bg);border-radius:10px;padding:10px;margin:6px 0">
  <input value="${esc(x.note||"")}" placeholder="Атауы" onchange="upd('${k}','${id}','note',this.value)">
  <div class="row" style="margin-top:8px"><input type="number" inputmode="numeric" value="${x.amt}" onchange="upd('${k}','${id}','amt',Number(this.value)||0)">${k==="expenses"?`<select onchange="upd('${k}','${id}','cat',Number(this.value))">${CATS.map((c,i)=>`<option value="${i}" ${x.cat===i?"selected":""}>${c[0]} ${esc(c[1])}</option>`).join("")}</select>`:""}</div>
  <div class="row" style="margin-top:8px"><input id="ed" type="date" value="${dstr(x.t)}" onchange="setWhen('${k}','${id}')"><input id="et" type="time" value="${hm(x.t)}" onchange="setWhen('${k}','${id}')"></div>
  <textarea style="min-height:70px;margin-top:8px" placeholder="💬 Пікір" onchange="upd('${k}','${id}','cm',this.value)">${esc(x.cm||"")}</textarea>
  <button class="g" style="margin-top:8px;width:100%" onclick="S.edit=null;render()">Дайын</button></div>`}
function exp(){
  const m=S.exp.filter(x=>inPer(x.t)),mi=S.inf.filter(x=>inPer(x.t)),by=CATS.map((c,i)=>m.filter(x=>x.cat===i).reduce((s,x)=>s+x.amt,0)),tot=by.reduce((a,b)=>a+b,0),inc=mi.reduce((s,x)=>s+x.amt,0),out=S.mode==="out";
  const all=[...m.map(x=>({...x,k:"expenses"})),...mi.map(x=>({...x,k:"inflow"}))].sort((a,b)=>b.t-a.t);
  return `<button class="g" style="width:100%;margin-bottom:12px" onclick="KASPI.pick()">📄 Kaspi выпискасын жүктеу</button><div class="pills">${PER.map(([k,n])=>`<button class="${(S.per||"month")===k?"":"g"}" onclick="S.per='${k}';render()">${n}</button>`).join("")}</div><div class="card">${donut(by.map((v,i)=>({v,c:COL[i%COL.length]})),"Жұмсалды",tot)}
  <div class="row sp it"><span>Кіріс</span><b class="pos">+${fmt(inc)}</b></div><div class="row sp it"><span>Шығын</span><b>${fmt(tot)}</b></div><div class="row sp it"><span>Айырма</span><b class="${inc-tot<0?"neg":"pos"}">${fmt(inc-tot)}</b></div></div>
  <div class="card"><div class="pills" style="margin-bottom:8px"><button class="${out?"":"g"}" onclick="setMode('out')">Шығын</button><button class="${out?"g":""}" onclick="setMode('in')">Кіріс</button></div>
  ${out?`<div class="chips">${CATS.map((c,i)=>`<button class="chip ${S.cat===i?"on":""}" onclick="pickCat(${i})">${c[0]}<br><small>${esc(c[1])}</small></button>`).join("")}</div>`:""}
  <div class="row"><input id="ea" type="number" inputmode="numeric" placeholder="Сома"><input id="en" placeholder="${out?"Пікір":"Қайдан түсті"}"></div>
  <div class="row" style="margin-top:8px"><input id="ad" type="date" value="${S.ad||today()}" onchange="S.ad=this.value"><input id="at" type="time" value="${S.at||hm(Date.now())}" onchange="S.at=this.value"></div>
  <div class="pills" style="margin:8px 0 0">${[[0,"Бүгін"],[1,"Кеше"],[2,"2 күн бұрын"],[7,"Апта бұрын"]].map(([n,l])=>`<button class="g" onclick="setAd(${n})">${l}</button>`).join("")}</div>
  <button style="margin-top:8px;width:100%" onclick="addExp()">${out?"Шығын қосу":"Кіріс қосу"}</button></div>
  <div class="card">`+(all.length?all.map(x=>{const o=x.k==="expenses",open=S.edit&&S.edit.k===x.k&&S.edit.id===x.id;
    return `<div class="row sp it" style="cursor:pointer" onclick="editRow('${x.k}','${x.id}')"><span style="min-width:0">${o?cat(x.cat)[0]:"💰"} ${esc(x.note||(o?cat(x.cat)[1]:"Кіріс"))}<div class="mu">${fdm(x.t)}${x.cm?" · 💬 "+esc(x.cm.slice(0,40)):""}</div></span><span class="${o?"":"pos"}" style="white-space:nowrap">${o?"":"+"}${fmt(x.amt)} <button class="x" onclick="event.stopPropagation();del('${x.k}','${x.id}')">✕</button></span></div>${open?editBox(x):""}`}).join(""):'<span class="mu">Бұл кезеңде жазба жоқ. Жоғарыдан қосыңыз.</span>')+`</div>`;
}
const PER=[["today","Бүгін"],["yest","Кеше"],["week","Апта"],["month","Осы ай"],["prev","Өткен ай"],["all","Барлығы"]];
function inPer(t){const d=new Date(t),n=new Date(),p=S.per||"month";
  if(p==="today")return dstr(t)===today();if(p==="yest")return dstr(t)===dstr(Date.now()-864e5);
  if(p==="week")return t>=Date.now()-7*864e5&&t<=Date.now()+864e5;
  if(p==="prev"){const q=new Date(n.getFullYear(),n.getMonth()-1,1);return d.getMonth()===q.getMonth()&&d.getFullYear()===q.getFullYear()}
  if(p==="all")return true;return thisM(t)}
function setAd(n){S.ad=dstr(Date.now()-n*864e5);const e=$("#ad");if(e)e.value=S.ad;if(!n){S.at=null;const t=$("#at");if(t)t.value=hm(Date.now())}}
function stamp(){const d=($("#ad")||{}).value||today(),t=($("#at")||{}).value||hm(Date.now()),ms=new Date(d+"T"+t).getTime();return ms||Date.now()}
const setMode=m=>{S.mode=m;render()};
const editRow=(k,id)=>{S.edit=S.edit&&S.edit.k===k&&S.edit.id===id?null:{k,id};render()};
const upd=(k,id,f,v)=>w(db.collection(k).doc(id).update({[f]:v}));
function setWhen(k,id){const d=$("#ed").value,t=$("#et").value;if(!d)return;const ms=new Date(d+"T"+(t||"12:00")).getTime();if(ms)upd(k,id,"t",ms)}
function catsV(){
  return `<p class="mu">Смайлик пен атауды өзің қой. Телефонның смайлик пернетақтасымен ауыстыр.</p><div class="card">`+CATS.map((c,i)=>`<div class="row it"><input value="${esc(c[0])}" style="width:64px;flex:none;text-align:center;font-size:22px" onchange="setCat(${i},'e',this.value)"><input value="${esc(c[1])}" onchange="setCat(${i},'n',this.value)"></div>`).join("")+`</div>
  <div class="card"><b>Жаңа санат</b><div class="row" style="margin-top:8px"><input id="ce" placeholder="😀" style="width:64px;flex:none;text-align:center;font-size:22px"><input id="cn" placeholder="Атауы"></div><button style="margin-top:8px;width:100%" onclick="addCat()">Санат қосу</button></div>`}
function setCat(i,f,v){const id=catId(i);if(!id)return;v=v.trim();if(!v)return;const cur=Object.assign({},S.cats.find(x=>x.id===id)||{});delete cur.id;
  if(i<BASE.length&&!cur.e){cur.e=BASE[i][0];cur.n=BASE[i][1]}cur[f]=v;w(db.collection("cats").doc(id).set(cur))}
function addCat(){const e=txt("ce")||"📦",n=txt("cn");if(!n)return;w(db.collection("cats").doc("x"+nid()).set({e,n,t:Date.now()}))}
function lim(){
  return `<p class="mu">Санатқа айлық лимит қойыңыз. Асып кетсе қызылға боялады.</p>`+CATS.map((c,i)=>{
    const l=(S.lim.find(x=>x.id==="c"+i)||{}).amt||0,sp=S.exp.filter(x=>x.cat===i&&thisM(x.t)).reduce((s,x)=>s+x.amt,0),p=l?Math.min(100,sp/l*100):0;
    return `<div class="card"><div class="row sp"><b>${c[0]} ${c[1]}</b><span class="${l&&sp>l?"neg":"mu"}">${fmt(sp)} / ${l?fmt(l):"—"}</span></div>
    <div class="bar"><i style="width:${p}%;${l&&sp>l?"background:var(--rd)":""}"></i></div>
    <div class="row"><input id="l${i}" type="number" inputmode="numeric" placeholder="Лимит сомасы"><button class="g" onclick="setLim(${i})">Қою</button></div></div>`}).join("");
}
function fun(){
  const spent=S.log.reduce((s,x)=>s+x.amt,0),lf=S.budget-spent,dim=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();
  return `<div class="card"><b>Отбасылық көңіл көтеру қоры</b><div class="big ${lf<0?"neg":"pos"}">${fmt(lf)}</div>
  <div class="bar"><i style="width:${Math.min(100,spent/S.budget*100||0)}%"></i></div>
  <div class="mu">Айлық қор: ${fmt(S.budget)} · күніне ~${fmt(S.budget/dim)}</div>
  <div class="row" style="margin-top:8px"><input id="bg" type="number" inputmode="numeric" placeholder="Жаңа айлық сома"><button class="g" onclick="setBudget()">Өзгерту</button></div></div>
  <div class="card"><div class="row"><input id="fn" placeholder="Не үшін"><input id="fa" type="number" inputmode="numeric" placeholder="Сома"></div>
  <button style="margin-top:8px;width:100%" onclick="addLog()">Шығын жазу</button></div>
  <div class="card">`+(S.log.length?S.log.sort((a,b)=>b.t-a.t).map(x=>`<div class="row sp it"><span>${esc(x.note)}</span><span>${fmt(x.amt)} <button class="x" onclick="del('fundlog','${x.id}')">✕</button></span></div>`).join(""):'<span class="mu">Жазба жоқ.</span>')+
  (S.log.length?`<button class="g" style="margin-top:10px;width:100%" onclick="newMonth()">Жаңа ай: тазалау</button>`:"")+`</div>`;
}
function debt(){
  const f=S.sub.debt,list=S.debts.filter(d=>f==="all"?ty(d)!=="owed":ty(d)===f);
  const items=["my","credit","inst","owed"].filter(k=>f==="all"?k!=="owed":k===f).map(k=>({v:S.debts.filter(d=>ty(d)===k).reduce((s,d)=>s+left(d),0),c:DC[k]}));
  return `<h1>Қарыздар</h1>`+pills("debt",[["all","Барлығы"],["credit","Несие"],["inst","Бөліп төлеу"],["my","Менің"],["owed","Маған қарыз"]])+
  `<div class="card">${donut(items,"Қалдық",items.reduce((s,x)=>s+x.v,0))}</div>
  <div class="card"><select id="dty" onchange="tyCh()"><option value="my">Менің қарызым</option><option value="credit">Несие</option><option value="inst">Бөліп төлеу</option><option value="owed">Маған қарыз</option></select>
  <div class="row" style="margin-top:8px"><input id="dn" placeholder="Атауы (Аға, Фокус…)"><input id="dt" type="number" inputmode="numeric" placeholder="Сома"></div>
  <div id="ex" class="row" style="margin-top:8px;display:none"><input id="dm" type="number" inputmode="numeric" placeholder="Ай саны"><input id="dr" type="number" inputmode="decimal" placeholder="Пайыз %"><select id="dk"><option value="ann">Аннуитет</option><option value="diff">Дифференциалды</option></select></div>
  <input id="dc" placeholder="Не үшін алдым / бердім" style="margin-top:8px">
  <div class="row" style="margin-top:8px"><label class="mu" style="flex:1;font-size:12px">Алған күні<input id="dd1" type="date" value="${today()}"></label><label class="mu" style="flex:1;font-size:12px">Беру күні<input id="dd2" type="date"></label></div><button style="margin-top:8px;width:100%" onclick="addDebt()">Қосу</button></div>`+
  (list.map(d=>{const L=left(d),t=tp(d),p=Math.min(100,d.paid/t*100||0),m=d.months;
  return `<div class="card"><div class="row sp"><span class="row"><i style="width:12px;height:12px;border-radius:4px;background:${DC[ty(d)]}"></i><b>${esc(d.name)}</b></span><span class="row">${m?`<span class="tag">${d.pm||0}/${m}</span>`:`<span class="mu">${DT[ty(d)]}</span>`}<button class="x" onclick="del('debts','${d.id}')">✕</button></span></div>
  <div class="bar"><i style="width:${p}%"></i></div>
  ${dstat(d,L)}<input value="${esc(d.note||"")}" placeholder="📝 Не үшін алдым / бердім" style="margin-top:6px" onchange="setDF('${d.id}','note',this.value)">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0">${[["taken","Алған күні"],["due","Беру күні"],["paidDate","Берілді"]].map(([f,l])=>`<label class="mu" style="font-size:11px">${l}<input type="date" value="${d[f]||""}" style="padding:6px;font-size:13px" onchange="setDF('${d.id}','${f}',this.value)"></label>`).join("")}</div>
  <div class="row sp mu"><span>Жалпы: ${fmt(t)}</span><span>Қалды: <b class="${L?"neg":"pos"}">${fmt(L)}</b></span></div>
  ${m?`<div class="mu" style="margin-top:4px">Келесі айлық төлем: <b>${fmt(mp(d))}</b>${d.rate?` · ${d.rate}% · ${d.kind==="diff"?"дифф.":"аннуитет"}`:""}</div>`:""}
  <div class="row" style="margin-top:8px">${m?`<button class="g" style="width:100%" ${(d.pm||0)>=m?"disabled":""} onclick="payD('${d.id}',1)">Айлық төлем төледім</button>`:`<input id="p${d.id}" type="number" inputmode="numeric" placeholder="Сома"><button class="g" onclick="payD('${d.id}',0)">${ty(d)==="owed"?"Қайтарды":"Төледім"}</button>`}</div></div>`}).join("")||'<p class="mu">Бос.</p>');
}
function inv(){
  const tot=S.dep.reduce((s,d)=>s+d.amt,0),yr=S.dep.reduce((s,d)=>s+d.amt*d.rate/100,0);
  return `<h1>Депозиттер</h1><div class="card"><div class="mu">Салынды</div><div class="big">${fmt(tot)}</div>
  <div class="row sp it"><span>Жылдық пайда</span><b class="pos">+${fmt(yr)}</b></div><div class="row sp it"><span>Айына шамамен</span><b class="pos">+${fmt(yr/12)}</b></div></div>
  <div class="card"><input id="vb" placeholder="Банктің атауы"><div class="row" style="margin-top:8px"><input id="va" type="number" inputmode="numeric" placeholder="Салым сомасы"><input id="vr" type="number" inputmode="decimal" placeholder="Пайыз % (жылдық)"></div>
  <input id="vd" type="date" style="margin-top:8px"><button style="margin-top:8px;width:100%" onclick="addDep()">Депозит қосу</button></div>`+
  S.dep.map(d=>`<div class="card"><div class="row sp"><b>${esc(d.bank)}</b><button class="x" onclick="del('deposits','${d.id}')">✕</button></div>
  <div class="row sp it"><span>Сома</span><b>${fmt(d.amt)}</b></div><div class="row sp it"><span>Пайыз</span><span>${d.rate}% · жылына +${fmt(d.amt*d.rate/100)}</span></div>${d.date?`<div class="row sp it"><span>Салым күні</span><span>${esc(d.date)}</span></div>`:""}</div>`).join("");
}
const dstr=t=>{const d=new Date(t);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const today=()=>dstr(Date.now());
const skey=n=>String(n).trim().toLowerCase();
const dayOf=s=>s.day||(s.t?dstr(s.t):"0000-00-00");
function prices(){const m={};[...S.shop].filter(s=>s.price>0).sort((a,b)=>(a.t||0)-(b.t||0)).forEach(s=>{m[skey(s.name)]=s.price});return m}
const KW=[[0,/нан|хлеб|сүт|молоко|ет\b|мясо|жұмыртқа|яйц|сыр\b|йогурт|кефир|қаймақ|май\b|қант|тұз|ұн\b|күріш|макарон|картоп|пияз|сәбіз|қияр|қызанақ|алма|банан|жеміс|көкөніс|тауық|шай\b|кофе|шоколад|печенье|су\b|шырын|сок|азық|колбас|балық|сосиска|тоқаш|торт/i],[1,/бензин|жанармай|такси|автобус|мойка|шина|көлік/i],[2,/свет|жарық|газ\b|коммунал|ысыту|су ақы/i],[3,/телефон|интернет|тариф|байланыс|связь/i],[4,/сыйлық|подарок|гүл/i],[5,/дәрі|таблетка|физраствор|аптека|витамин|лекарство|пластырь|сироп|шприц|термометр/i],[6,/киім|көйлек|аяқ ?киім|шұлық|куртка|джинс|шалбар|футболка|белдік/i],[7,/кино|ойын|кафе|мейрамхана|ойыншық|аттракцион/i]];
function catMem(){const m={};[...S.shop].filter(x=>x.cat!=null).sort((a,b)=>(a.t||0)-(b.t||0)).forEach(x=>{m[skey(x.name)]=x.cat});return m}
function guessCat(n){const m=catMem()[skey(n)];if(m!=null)return m;for(const [c,re] of KW)if(re.test(n))return c;return 8}
const catOf=s=>s.cat!=null?s.cat:guessCat(s.name);
function syncExp(s){const id="sh_"+s.id,amt=qn(s)*(s.price||0),e=db.collection("expenses").doc(id);
  if(s.done&&amt>0)return e.set({cat:catOf(s),amt,note:s.name+(qn(s)>1?" ×"+qn(s):""),t:s.t||Date.now(),src:"shop",sid:s.id,qty:qn(s),unit:s.price,name:s.name});
  return Promise.resolve(e.delete()).catch(()=>{})}
const delShop=id=>w(Promise.all([db.collection("shop").doc(id).delete(),Promise.resolve(db.collection("expenses").doc("sh_"+id).delete()).catch(()=>{})]));
function setSCat(id,v){const s=S.shop.find(x=>x.id===id);if(!s)return;const u={cat:Number(v)};w(Promise.all([db.collection("shop").doc(id).update(u),syncExp({...s,...u})]))}
const qn=s=>s.qty>0?s.qty:1;
const lineT=(s,pm)=>qn(s)*(s.price||(pm?pm[skey(s.name)]:0)||0);
function shopRow(s,pm){const p=s.price||pm[skey(s.name)]||0,q=qn(s);
  return `<div class="it"><div class="row sp"><label class="row" style="flex:1;min-width:0"><input type="checkbox" style="width:22px;height:22px;flex:none" ${s.done?"checked":""} onchange="tog('${s.id}',this.checked)"><span class="${s.done?"done":""}">${esc(s.name)}</span></label>
  <input type="number" inputmode="numeric" value="${q}" min="1" title="Саны" style="width:52px;text-align:center;flex:none" onchange="setQty('${s.id}',this.value)"><span class="mu">×</span>
  <input type="number" inputmode="numeric" value="${s.price||""}" placeholder="${p?fmt(p):"₸ бірі"}" style="width:86px;text-align:right;flex:none" onchange="setPrice('${s.id}',this.value)"><button class="x" onclick="delShop('${s.id}')">✕</button></div>
  <div class="row" style="margin:2px 0 0 30px;gap:8px;flex-wrap:wrap"><select style="width:auto;padding:4px 8px;font-size:13px" onchange="setSCat('${s.id}',this.value)">${CATS.map((c,i)=>`<option value="${i}" ${catOf(s)===i?"selected":""}>${c[0]} ${esc(c[1])}</option>`).join("")}</select>
  ${q>1&&p?`<div class="mu" style="margin-left:30px">${q} × ${fmt(p)} = <b>${fmt(q*p)}</b></div>`:""}</div>`}
function setQty(id,v){const s=S.shop.find(x=>x.id===id);if(!s)return;const u={qty:Math.max(1,Math.round(Number(v))||1)};w(Promise.all([db.collection("shop").doc(id).update(u),syncExp({...s,...u})]))}
function parseQty(s){const m=s.match(/^(.*?)\s*(?:[x×*]\s*(\d+)|(\d+)\s*(?:дана|данa|шт\.?|штук[а]?|х|x|×))$/i);return m&&m[1].trim()?{n:m[1].trim(),q:Number(m[2]||m[3])||1}:{n:s,q:0}}
function shop(){
  const pm=prices(),todo=S.shop.filter(s=>!s.done),done=S.shop.filter(s=>s.done),days={};
  done.forEach(s=>{(days[dayOf(s)]=days[dayOf(s)]||[]).push(s)});
  const planned=todo.reduce((a,s)=>a+lineT(s,pm),0);
  const dn=Object.keys(days).sort().reverse().map(d=>{const l=days[d],tot=l.reduce((a,s)=>a+qn(s)*(s.price||0),0),p=d.split("-");
    return `<div class="card"><div class="row sp"><b>${p[2]}.${p[1]}.${p[0]}${d===today()?" · бүгін":""}</b><b>${fmt(tot)}</b></div>${l.map(s=>shopRow(s,pm)).join("")}</div>`}).join("");
  return `<h1>Сатып алу тізімі</h1>
  <div class="card"><div class="row"><input id="sn" placeholder="Сабын, нан, сүт…" oninput="fillP(this.value)" onkeydown="if(event.key==='Enter')addShop()"><input id="sq" type="number" inputmode="numeric" placeholder="Саны" style="width:62px;flex:none"><input id="sp" type="number" inputmode="numeric" placeholder="Бірі ₸" style="width:84px;flex:none" oninput="this.dataset.u=1"><button onclick="addShop()">+</button></div>
  <select id="sc" style="margin-top:8px"><option value="">🪄 Санат: автоматты</option>${CATS.map((c,i)=>`<option value="${i}">${c[0]} ${esc(c[1])}</option>`).join("")}</select>
  <div class="mu" style="margin-top:6px">«нан 2 дана» немесе «нан ×2» деп жазсаң да болады. Баға — біреуінің бағасы, бұрын алынған болса өзі шығады.</div>
</div>
  <div class="card"><div class="row sp"><b>Алу керек</b><span class="mu">~${fmt(planned)}</span></div>`+(todo.length?todo.map(s=>shopRow(s,pm)).join(""):'<span class="mu">Тізім бос.</span>')+`</div>`+
  (dn?`<h1 style="font-size:16px">Алынғандар (тарих)</h1>`+dn:"");
}
function fillP(v){const e=$("#sp");if(!e||e.dataset.u)return;const p=prices()[skey(v)];e.value=p||""}
function setPrice(id,v){const s=S.shop.find(x=>x.id===id);if(!s)return;const u={price:Number(v)||0};if(!s.done)u.t=Date.now();w(Promise.all([db.collection("shop").doc(id).update(u),syncExp({...s,...u})]))}
function stat(m){const e=$("#scst");if(e)e.textContent=m}
async function scan(inp){const f=inp.files&&inp.files[0];inp.value="";if(!f)return;
  stat("Чекті оқып жатыр…");
  try{
    const sm=await claude.use("sample");if(!sm){stat("Бұл жерде чек оқу қолжетімсіз.");return}
    const L=await sm.limits().catch(()=>null);if(!L||!L.images){stat("Бұл жерде фото жіберу қолжетімсіз.");return}
    const items=await sm.json('Бұл дүкен чегінің фотосы. Әр тауарды, санын (дана) және біреуінің бағасын (теңгемен) оқы. Чекте тек жалпы сома жазылса, жалпы соманы санға бөліп біреуінің бағасын есепте. Тек JSON массивін қайтар: [{"name":"Нан","qty":2,"price":150}]. Саны көрсетілмесе qty=1. Тауар атауын чектегідей қалдыр. Жиынтық, салық, ақша қайтару жолдарын қоспа. Оқылмаса — бос массив [].',{images:[f],cache:false});
    if(!Array.isArray(items)||!items.length){stat("Чектен тауар табылмады. Жақынырақ, жарық жерде түсіріп көр.");return}
    const open=S.shop.filter(s=>!s.done),used=new Set(),ops=[];let n=0;
    for(const it of items){const nm=String(it&&it.name||"").trim(),pr=Math.round(Number(it&&it.price))||0,qt=Math.max(1,Math.round(Number(it&&it.qty))||1);if(!nm)continue;n++;
      const m=open.find(s=>!used.has(s.id)&&skey(s.name)===skey(nm));
      if(m){used.add(m.id);const u={done:true,qty:qt,price:pr,day:today(),t:Date.now()};if(m.cat==null)u.cat=catOf(m);ops.push(db.collection("shop").doc(m.id).update(u),syncExp({...m,...u}))}
      else{const id=nid(),o={id,name:nm,qty:qt,price:pr,cat:guessCat(nm),done:true,day:today(),t:Date.now()},d=Object.assign({},o);delete d.id;ops.push(db.collection("shop").doc(id).set(d),syncExp(o))}}
    await Promise.all(ops);stat("Қосылды: "+n+" тауар. Бағасын тексеріп ал.");render();
  }catch(e){const c=e&&e.code;stat(c==="not_granted"?"Рұқсат берілмеді.":c==="rate_limited"?"Біраздан соң қайталап көр.":c==="invalid_json"?"Чекті оқи алмады, қайта түсір.":"Қате: "+((e&&e.message)||c||e))}}
function note(){
  const t=(S.notes.find(x=>x.id==="main")||{}).text||"";
  return `<h1>Не өзгерту керек</h1><p class="mu">Жазғаның сақталады. Көшіру батырмасы бәрін алады.</p>
  <div class="card"><textarea id="nt" placeholder="Мысалы: Тізімде бағасы шықсын…" onchange="saveNote()">${esc(t)}</textarea>
  <div class="row" style="margin-top:8px"><button style="flex:1" onclick="copyNote()">📋 Көшіру</button><button class="g" style="flex:1" onclick="saveNote()">Сақтау</button></div>
  <div id="ncs" class="mu" style="margin-top:6px"></div></div>`;
}
function saveNote(){const e=$("#nt");if(!e)return;w(db.collection("notes").doc("main").set({text:e.value,t:Date.now()}))}
async function copyNote(){const e=$("#nt");if(!e)return;const s=$("#ncs");let ok=false;
  try{await navigator.clipboard.writeText(e.value);ok=true}catch(_){try{e.focus();e.select();ok=document.execCommand("copy")}catch(__){}}
  if(s)s.textContent=ok?"Көшірілді ✓":"Көшіру болмады: мәтінді ұзақ басып, «Көшіру» таңда."}
const gnext=g=>{const d=new Date(g.date+"T00:00:00");if(!g.yearly)return d;const n=new Date(),t=new Date(n.getFullYear(),n.getMonth(),n.getDate());let x=new Date(t.getFullYear(),d.getMonth(),d.getDate());if(x<t)x=new Date(t.getFullYear()+1,d.getMonth(),d.getDate());return x};
const gleft=d=>{const n=new Date();return Math.round((d-new Date(n.getFullYear(),n.getMonth(),n.getDate()))/864e5)};
const gcol=()=>db.collection("data/users/"+uid);
const gotNow=g=>g.got===String(gnext(g).getFullYear());
function gifts(){
  const gr={};S.mine.filter(x=>x.kind==="gift").forEach(g=>{const k=g.ev+"|"+g.date;(gr[k]=gr[k]||{ev:g.ev,date:g.date,yearly:g.yearly,items:[]}).items.push(g)});
  const L=Object.values(gr).map(e=>{const nd=gnext(e.items[0]);return {...e,nd,left:gleft(nd)}}).sort((x,y)=>(x.left<0?1e6-x.left:x.left)-(y.left<0?1e6-y.left:y.left));
  const up=L.filter(e=>e.left>=0),pl=up.reduce((q,e)=>q+e.items.reduce((z,g)=>z+(g.amt||0),0),0),bg=up.reduce((q,e)=>q+e.items.filter(gotNow).reduce((z,g)=>z+(g.amt||0),0),0);
  const fd=d=>d.getDate().toString().padStart(2,"0")+"."+String(d.getMonth()+1).padStart(2,"0")+(d.getFullYear()!==new Date().getFullYear()?"."+d.getFullYear():"");
  return `<h1>🎁 Мерекелер мен сыйлықтар</h1>
  <div class="card"><div class="row sp it"><span>Алдағы сыйлық бюджеті</span><b>${fmt(pl)}</b></div><div class="row sp it"><span>Алынды (✓)</span><b class="pos">${fmt(bg)}</b></div><div class="row sp it"><span>Алу керек</span><b>${fmt(pl-bg)}</b></div></div>`+
  L.map(e=>{const tot=e.items.reduce((z,g)=>z+(g.amt||0),0),got=e.items.filter(gotNow).reduce((z,g)=>z+(g.amt||0),0);
   return `<div class="card" ${e.left<0?'style="opacity:.6"':""}><div class="row sp"><b>${esc(e.ev)}</b><span class="${e.left>=0&&e.left<=7?"neg":"mu"}">${e.left===0?"Бүгін!":e.left>0?e.left+" күн қалды":"өтті"}</span></div>
   <div class="row sp mu"><span>${fd(e.nd)}${e.yearly?" · жыл сайын":""}</span><span>${fmt(got)} / ${fmt(tot)}</span></div>`+
   e.items.map(g=>`<div class="row it" style="gap:8px"><input type="checkbox" style="width:22px;height:22px;flex:none" ${gotNow(g)?"checked":""} onchange="gotG('${g.id}',this.checked)"><span style="flex:1;min-width:0" class="${gotNow(g)?"done":""}">${esc(g.who||"—")}<div class="mu">${esc(g.what||"")}</div></span><input type="number" inputmode="numeric" value="${g.amt||""}" placeholder="₸" style="width:90px;flex:none;text-align:right" onchange="gcol().doc('${g.id}').update({amt:Number(this.value)||0}).then(render)"><button class="x" onclick="del2('${g.id}')">✕</button></div>`).join("")+
   `<button class="g" style="margin-top:8px;width:100%" data-e="${esc(e.ev)}" data-d="${e.date}" data-y="${e.yearly?1:""}" onclick="fillG(this)">＋ Осы мерекеге сыйлық</button></div>`}).join("")+
  `<div class="card" id="gform"><b>Жаңа сыйлық</b>
  <div class="row" style="margin-top:8px"><input id="ge" placeholder="Мереке (Наурыз, туған күн…)"></div>
  <div class="row" style="margin-top:8px"><input id="gd" type="date"><label class="row mu" style="flex:none;gap:6px"><input id="gy" type="checkbox" style="width:22px;height:22px"> жыл сайын</label></div>
  <div class="row" style="margin-top:8px"><input id="gw" placeholder="Кімге"><input id="gm" type="number" inputmode="numeric" placeholder="Бағасы" style="width:100px;flex:none"></div>
  <div class="row" style="margin-top:8px"><input id="gt" placeholder="Қандай сыйлық"></div>
  <button style="margin-top:8px;width:100%" onclick="addGift()">Қосу</button></div>`;
}
function fillG(b){$("#ge").value=b.dataset.e;$("#gd").value=b.dataset.d;$("#gy").checked=!!b.dataset.y;$("#gform").scrollIntoView({behavior:"smooth"});$("#gw").focus()}
function addGift(){const ev=txt("ge"),date=$("#gd").value;if(!ev||!date)return;const who=txt("gw"),what=txt("gt");if(!who&&!what)return;
  w(gcol().doc(nid()).set({kind:"gift",ev,date,yearly:$("#gy").checked,who,what,amt:num("gm")}))}
function gotG(id,c){const g=S.mine.find(x=>x.id===id);if(!g)return;w(gcol().doc(id).update({got:c?String(gnext(g).getFullYear()):null}))}
function me(){
  const pm=S.mine.filter(x=>!x.kind),tot=pm.reduce((s,x)=>s+(x.amt||0),0);
  return `<h1>🔒 Жеке бөлім</h1>`+accountCard()+`<p class="mu">Төмендегі жазбалар мен сыйлықтар тек саған көрінеді.</p>`+gifts()+`<h1 style="margin-top:20px">📝 Жеке жазбалар</h1>
  <div class="card"><div class="row"><input id="mn" placeholder="Жазба"><input id="ma" type="number" inputmode="numeric" placeholder="Сома"></div>
  <button style="margin-top:8px;width:100%" onclick="addMine()">Қосу</button></div>
  <div class="card"><div class="row sp"><b>Барлығы</b><b>${fmt(tot)}</b></div>`+pm.map(x=>`<div class="row sp it"><span>${esc(x.note||"")}</span><span>${fmt(x.amt||0)} <button class="x" onclick="del2('${x.id}')">✕</button></span></div>`).join("")+`</div>`;
}
function secBadge(id){const d=S.msec.find(x=>x.id===id);return d&&((d.rows&&d.rows.length)||d.note||d.plan)?"📝":""}
const secKind=n=>/қарыз|несие|кредит|kaspi/i.test(n)?"debt":/шығын|азық|коммуналка|жол|көлік/i.test(n)?"exp":/демал/i.test(n)?"trip":/ата-ана/i.test(n)?"par":/фпб|қор|запас|капитал|кәсіп|арман/i.test(n)?"fund":"gen";
const openSec=(m,k,n,a)=>{S.sec={id:m+"_"+k,n,a:Number(a)||0};render();scrollTo(0,0)};
function secSave(patch){const cur=Object.assign({},S.msec.find(x=>x.id===S.sec.id)||{});delete cur.id;return w(db.collection("msec").doc(S.sec.id).set({...cur,...patch}))}
function secRows(){return (S.msec.find(x=>x.id===S.sec.id)||{}).rows||[]}
function addRow(){const who=txt("rw"),a=num("ra");if(!who&&a<=0)return;secSave({rows:[...secRows(),{id:nid(),who,amt:a,why:txt("ry"),date:txt("rd")||today()}]})}
const delRow=id=>secSave({rows:secRows().filter(r=>r.id!==id)});
function secView(){
  const {id,n,a}=S.sec,d=S.msec.find(x=>x.id===id)||{},rows=d.rows||[],kind=secKind(n),tot=rows.reduce((s,r)=>s+(r.amt||0),0),fd=s=>s?s.split("-").reverse().join("."):"";
  const lab={par:["Кімге","Не үшін"],fund:["Қай жаққа / қайда","Пікір"],trip:["Қайда / не үшін","Пікір"],gen:["Кімге / қайда","Не үшін"]}[kind]||["Кімге","Не үшін"];
  let auto="";
  if(kind==="debt"){const l=S.debts.filter(x=>ty(x)!=="owed"&&left(x)>0).sort((x,y)=>left(x)-left(y)),mon=l.reduce((s,x)=>s+(x.months?mp(x):0),0);
    auto=`<div class="card"><b>Қарыздар (автоматты)</b><div class="mu">Бөлінген сома: ${fmt(a)} · айлық міндетті төлем: ${fmt(mon)}</div>`+(l.map(x=>`<div class="row sp it"><span>${esc(x.name)}<div class="mu">${x.due?"Беру күні: "+fd(x.due)+" · ":""}${x.months?"айына "+fmt(mp(x)):"қалдық"}</div></span><b class="neg">${fmt(left(x))}</b></div>`).join("")||'<span class="mu">Қарыз жоқ 🎉</span>')+`<div class="mu" style="margin-top:6px">Тәртіп: қалдығы кішісінен бастап жабу.</div></div>`}
  if(kind==="exp"){const cf=/азық/i.test(n)?[0]:/коммуналка/i.test(n)?[2]:/жол|көлік/i.test(n)?[1]:null,m=S.exp.filter(x=>thisM(x.t)&&(!cf||cf.includes(x.cat))).sort((x,y)=>y.t-x.t),sp=m.reduce((q,x)=>q+x.amt,0);
    auto=`<div class="card"><b>Осы айда не алдым (автоматты)</b><div class="row sp it"><span>Бөлінген</span><b>${fmt(a)}</b></div><div class="row sp it"><span>Жұмсалды</span><b class="${sp>a?"neg":""}">${fmt(sp)}</b></div><div class="row sp it"><span>Қалды</span><b class="${a-sp<0?"neg":"pos"}">${fmt(a-sp)}</b></div>`+
    m.map(x=>`<div class="row sp it"><span>${cat(x.cat)[0]} ${esc(x.note||cat(x.cat)[1])}<div class="mu">${fdm(x.t)}${x.cm?" · 💬 "+esc(x.cm.slice(0,40)):""}</div></span><b>${fmt(x.amt)}</b></div>`).join("")+(m.length?"":'<span class="mu">Осы айда жазба жоқ. Тізімнен «алдым» деп белгілесең, өзі осында түседі.</span>')+`</div>`}
  if(kind==="trip"){const g=d.goal||0,p=Math.min(100,tot/(g||1)*100);
    auto=`<div class="card"><b>Демалыс жоспары</b><div class="row" style="margin-top:8px"><input id="tg" type="number" inputmode="numeric" placeholder="Мақсат сома ₸" value="${g||""}" onchange="secSave({goal:Number(this.value)||0})"></div>
    <div class="bar"><i style="width:${p}%"></i></div><div class="row sp mu"><span>Жиналды: ${fmt(tot)}</span><span>${g?"Қалды: "+fmt(Math.max(0,g-tot)):""}</span></div>
    <textarea style="min-height:90px;margin-top:8px" placeholder="Қайда, қашан, кіммен, не істейміз…" onchange="secSave({plan:this.value})">${esc(d.plan||"")}</textarea></div>`}
  return `<button class="g" onclick="S.sec=null;render()">← Артқа</button><h1 style="margin-top:12px">${esc(n)}</h1><div class="mu" style="margin-bottom:10px">Осы ай бөлінген сома: <b>${fmt(a)}</b></div>${auto}
  <div class="card"><b>${kind==="par"?"Берілгендер":kind==="fund"?"Қайда бөлдім":"Жазбалар"}</b><div class="row sp it"><span class="mu">Барлығы</span><b>${fmt(tot)}</b></div>`+
  rows.map(r=>`<div class="row sp it"><span>${esc(r.who||"—")}<div class="mu">${fd(r.date)}${r.why?" · "+esc(r.why):""}</div></span><span>${fmt(r.amt||0)} <button class="x" onclick="delRow('${r.id}')">✕</button></span></div>`).join("")+
  `<div class="row" style="margin-top:8px"><input id="rw" placeholder="${lab[0]}"><input id="ra" type="number" inputmode="numeric" placeholder="Сома" style="width:100px;flex:none"></div>
  <div class="row" style="margin-top:8px"><input id="ry" placeholder="${lab[1]}"><input id="rd" type="date" value="${today()}" style="width:140px;flex:none"></div><button style="margin-top:8px;width:100%" onclick="addRow()">Қосу</button></div>
  <div class="card"><b>📝 Пікір</b><textarea style="min-height:100px;margin-top:8px" placeholder="Осы бөлім туралы жаз…" onchange="secSave({note:this.value})">${esc(d.note||"")}</textarea></div>`;
}
function met(){
  if(S.sec)return secView();
  const inc=INCOME.reduce((s,x)=>s+x[1],0);
  return `<h1>Методикалар</h1><p class="mu">Табыс: ${fmt(inc)}. Бәрі осы сомаға автоматты есептеледі.</p>`+(S.met.length?[...S.met].sort((a,b)=>(a.ord||0)-(b.ord||0)).map(m=>m.kind==="cascade"?casc(m,inc):prio(m,inc)).join(""):'<p class="mu">Методика жоқ.</p>');
}
function casc(m,inc){
  let base=inc,h="";
  m.stages.forEach((st,si)=>{let used=0;
    h+=`<div class="row sp" style="background:var(--ac2);border-radius:8px;padding:6px 10px;margin-top:8px"><span class="mu">${si?"Қалдық":"Табыс"} (100%)</span><b>${fmt(base)}</b></div>`;
    st.items.forEach((x,xi)=>{const a=base*x.p/100;used+=a;
      h+=`<div class="row sp it" style="cursor:pointer" data-n="${esc(x.n)}" data-a="${Math.round(a)}" onclick="openSec('${m.id}','s${si}x${xi}',this.dataset.n,this.dataset.a)"><span>${esc(x.n)} <span class="mu">${x.p}%</span> ${secBadge(m.id+"_s"+si+"x"+xi)}</span><b>${fmt(a)} <span class="mu">›</span></b></div>`;
      (x.kids||[]).forEach((k,ki)=>{h+=`<div class="row sp it" style="padding-left:18px;cursor:pointer" data-n="${esc(k.n)}" data-a="${Math.round(a*k.p/100)}" onclick="openSec('${m.id}','s${si}x${xi}k${ki}',this.dataset.n,this.dataset.a)"><span class="mu">↳ ${esc(k.n)} ${k.p}% ${secBadge(m.id+"_s"+si+"x"+xi+"k"+ki)}</span><span>${fmt(a*k.p/100)} <span class="mu">›</span></span></div>`})});
    base-=used});
  return `<div class="card"><b>${esc(m.name)}</b>${h}</div>`;
}
function auto(it){const s=it.src||"";
  if(s.startsWith("bill:")){const b=S.bills.find(x=>x.name===s.slice(5));return b?b.amt:0}
  if(s==="credit"||s==="kaspi")return S.debts.filter(d=>d.months&&(d.pm||0)<d.months&&(d.type==="credit"||d.type==="inst")&&(/kaspi/i.test(d.name)===(s==="kaspi"))).reduce((a,d)=>a+mp(d),0);
  return 0}
function prio(m,inc){
  const vals=(S.mset.find(x=>x.id===m.id)||{}).vals||{};let tot=0;
  const g=m.groups.map((gr,gi)=>{let sb=0;const rows=gr.items.map((it,ii)=>{const k="g"+gi+"i"+ii,v=vals[k]!==undefined?vals[k]:(it.amt!==undefined?it.amt:auto(it));sb+=v;
    return `<div class="row sp it"><span style="cursor:pointer;flex:1" data-n="${esc(it.n)}" data-a="${Math.round(v)}" onclick="openSec('${m.id}','${k}',this.dataset.n,this.dataset.a)">${esc(it.n)} <span class="mu">›</span> ${secBadge(m.id+"_"+k)}</span><input type="number" inputmode="numeric" value="${v||""}" placeholder="0" style="width:110px;text-align:right" onchange="setV('${m.id}','${k}',this.value)"></div>`}).join("");
    tot+=sb;return `<div class="mu" style="margin-top:8px">${esc(gr.t)}</div>${rows}<div class="row sp it"><b>Барлығы</b><b>${fmt(sb)}</b></div>`}).join("");
  const fr=inc-tot;
  return `<div class="card"><b>${esc(m.name)}</b>${g}<div class="row sp it"><b>Табыс − барлық шығын</b><b class="${fr<0?"neg":"pos"}">${fmt(fr)}</b></div></div>`;
}
function setV(id,k,v){const cur=Object.assign({},((S.mset.find(x=>x.id===id)||{}).vals)||{});if(v==="")delete cur[k];else cur[k]=Number(v)||0;w(db.collection("mset").doc(id).set({vals:cur}))}
function render(){
  if(!db)return;const a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="SELECT"||a.tagName==="TEXTAREA")&&a.type!=="checkbox")return;
  $("#nav").innerHTML=TABS.map(t=>`<button class="${S.tab===t[0]?"on":""}" onclick="go('${t[0]}')"><div style="font-size:19px">${t[1]}</div>${t[2]}</button>`).join("");
  $("#app").innerHTML={home,bud,debt,inv,met,shop,note,me}[S.tab]();
}
const go=t=>{S.tab=t;S.sec=null;S.incOpen=null;if(document.activeElement)document.activeElement.blur();render()};
const w=p=>p.then(()=>{if(document.activeElement)document.activeElement.blur();render()}).catch(e=>alert("Жазу мүмкін болмады: "+(e&&e.message||e)));
const del=(c,id)=>w(db.collection(c).doc(id).delete());
const del2=id=>w(db.collection("data/users/"+uid).doc(id).delete());
function pickCat(i){S.cat=i;document.querySelectorAll(".chip").forEach((b,j)=>b.classList.toggle("on",i===j))}
function tyCh(){const v=$("#dty").value;$("#ex").style.display=(v==="credit"||v==="inst")?"flex":"none"}
const curM=()=>today().slice(0,7);
const incSave=p=>w(db.collection("income").doc(S.incOpen).update(p));
const planSave=l=>incSave({plan:l});
function incView(){const x=S.income.find(i=>i.id===S.incOpen);if(!x){S.incOpen=null;return home()}
  const pl=x.plan||[],tot=pl.reduce((a,p)=>a+(p.amt||0),0),dn=pl.filter(p=>p.done===curM()).reduce((a,p)=>a+(p.amt||0),0),free=x.amt-tot;
  const sg=[...new Set([...S.bills.map(b=>b.name),"Қарыз","ФПБ","Ата-ана","Демалыс","Қор"])];
  return `<button class="g" onclick="S.incOpen=null;render()">← Артқа</button><h1 style="margin-top:12px">Табыс көзі</h1>
  <div class="card"><input value="${esc(x.name)}" placeholder="Атауы" onchange="incSave({name:this.value.trim()||'—'})">
  <div class="row" style="margin-top:8px"><input type="number" inputmode="numeric" value="${x.amt}" onchange="incSave({amt:Number(this.value)||0})"><input type="number" inputmode="numeric" value="${x.day}" min="1" max="31" style="max-width:80px" onchange="incSave({day:Math.min(31,Math.max(1,Number(this.value)||1))})"></div>
  <div class="mu" style="margin-top:4px">Сома және ай сайын түсетін күні</div></div>
  <div class="card"><b>Қай жаққа жұмсаймын</b>
  <div class="row sp it"><span>Жоспар</span><b>${fmt(tot)}</b></div>
  <div class="row sp it"><span>Бөлінбей қалды</span><b class="${free<0?"neg":"pos"}">${fmt(free)}</b></div>
  <div class="row sp it"><span>Жұмсалды (✓, осы ай)</span><b>${fmt(dn)}</b></div>
  <div class="mu" style="margin:6px 0">Орнына жұмсағанда галочка қой. Галочка келесі айда өзі тазарады.</div>`+
  pl.map(p=>`<div class="row it" style="gap:8px"><input type="checkbox" style="width:22px;height:22px;flex:none" ${p.done===curM()?"checked":""} onchange="planTog('${p.id}',this.checked)"><input value="${esc(p.to)}" class="${p.done===curM()?"done":""}" onchange="planUpd('${p.id}','to',this.value)"><input type="number" inputmode="numeric" value="${p.amt||""}" style="width:96px;flex:none;text-align:right" onchange="planUpd('${p.id}','amt',Number(this.value)||0)"><button class="x" onclick="planDel('${p.id}')">✕</button></div>`).join("")+
  `<div class="row" style="margin-top:8px"><input id="pt" placeholder="Қайда: мысалы Квартира"><input id="pa" type="number" inputmode="numeric" placeholder="Сома" style="width:96px;flex:none"></div>
  <div class="chips" style="margin-top:8px;flex-wrap:wrap">${sg.map(n=>`<button class="chip" data-n="${esc(n)}" onclick="$('#pt').value=this.dataset.n">${esc(n)}</button>`).join("")}</div>
  <button style="margin-top:8px;width:100%" onclick="planAdd()">Қосу</button></div>`}
const curPlan=()=>((S.income.find(i=>i.id===S.incOpen)||{}).plan||[]);
function planAdd(){const to=txt("pt"),a=num("pa");if(!to&&a<=0)return;planSave([...curPlan(),{id:nid(),to,amt:a,done:null}])}
const planUpd=(id,f,v)=>planSave(curPlan().map(p=>p.id===id?{...p,[f]:v}:p));
const planTog=(id,c)=>planSave(curPlan().map(p=>p.id===id?{...p,done:c?curM():null}:p));
const planDel=id=>planSave(curPlan().filter(p=>p.id!==id));
function addInc(){const n=txt("in"),a=num("ia"),d=num("id");if(!n||a<=0||d<1||d>31)return;w(db.collection("income").doc(nid()).set({name:n,amt:a,day:d}))}
function addBill(){const n=txt("bn"),a=num("ba");if(!n||a<=0)return;w(db.collection("bills").doc(nid()).set({name:n,amt:a}))}
function addExp(){const a=num("ea");if(a<=0)return;const t=stamp();S.at=null;if(S.mode==="in")w(db.collection("inflow").doc(nid()).set({amt:a,note:txt("en"),t}));else w(db.collection("expenses").doc(nid()).set({cat:S.cat,amt:a,note:txt("en"),t}))}
function setLim(i){const v=num("l"+i);if(v>0)w(db.collection("limits").doc("c"+i).set({amt:v}))}
function addDebt(){const t=$("#dty").value,n=txt("dn"),a=num("dt");if(!n||a<=0)return;const o={name:n,total:a,paid:0,type:t,note:txt("dc"),taken:txt("dd1"),due:txt("dd2")};
  if(t==="credit"||t==="inst"){o.months=num("dm");o.rate=num("dr");o.kind=$("#dk").value;o.pm=0;if(!o.months){alert("Ай санын жазыңыз");return}}
  w(db.collection("debts").doc(nid()).set(o))}
function payD(id,m){const d=S.debts.find(x=>x.id===id);if(!d)return;const a=m?mp(d):num("p"+id);if(a<=0)return;
  const u=m?{paid:d.paid+a,pm:(d.pm||0)+1}:{paid:d.paid+a};if(m?u.pm>=d.months:u.paid>=tp(d))u.paidDate=today();
  w(db.collection("debts").doc(id).update(u))}
const setDF=(id,f,v)=>w(db.collection("debts").doc(id).update({[f]:v}));
function dstat(d,L){const fd=s=>s.split("-").reverse().join(".");
  if(L<=0)return `<div class="pos" style="margin-top:6px">✓ Берілді${d.paidDate?" · "+fd(d.paidDate):""}</div>`;
  if(!d.due)return "";const n=Math.round((new Date(d.due)-new Date(today()))/864e5);
  return `<div class="${n<0?"neg":"mu"}" style="margin-top:6px">${n<0?"⚠ Мерзімі "+(-n)+" күнге өтті":n===0?"Бүгін беру керек":"Беруге "+n+" күн қалды"} · ${fd(d.due)}</div>`}
function addDep(){const b=txt("vb"),a=num("va"),r=num("vr");if(!b||a<=0)return;w(db.collection("deposits").doc(nid()).set({bank:b,amt:a,rate:r,date:txt("vd")}))}
function addShop(){const raw=txt("sn");if(!raw)return;const pq=parseQty(raw),n=pq.n,q=num("sq")||pq.q||1,p=num("sp")||prices()[skey(n)]||0;
  const r=db.collection("shop").doc(nid()).set({name:n,qty:q,price:p,cat:($("#sc").value!==""?Number($("#sc").value):guessCat(n)),done:false,day:today(),t:Date.now()});$("#sn").value="";$("#sq").value="";const e=$("#sp");e.value="";delete e.dataset.u;w(r)}
function tog(id,v){const s=S.shop.find(x=>x.id===id);if(!s)return;const u={done:v};
  if(v){u.day=today();u.t=Date.now();if(!s.price){const p=prices()[skey(s.name)];if(p)u.price=p}if(s.cat==null)u.cat=catOf(s)}
  w(Promise.all([db.collection("shop").doc(id).update(u),syncExp({...s,...u})]))}
function setBudget(){const v=num("bg");if(v>0)w(db.collection("fund").doc("main").set({budget:v}))}
function addLog(){const n=txt("fn"),a=num("fa");if(!n||a<=0)return;w(db.collection("fundlog").doc(nid()).set({note:n,amt:a,t:Date.now()}))}
function newMonth(){if(confirm("Барлық жазбаны өшіру керек пе?"))S.log.forEach(x=>del("fundlog",x.id))}
function addMine(){const n=txt("mn"),a=num("ma");if(!n)return;w(db.collection("data/users/"+uid).doc(nid()).set({note:n,amt:a}))}
