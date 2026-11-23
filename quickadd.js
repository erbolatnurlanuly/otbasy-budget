/* Жылдам қосу: Apple Pay / «Пәрмендер» арқылы келген сатып алуды бір басумен шығынға жазу.
   Кіру жолдары:
   - iPhone қосымшасы: window.QUICKADD({amt, m})
   - веб: ?add=1&amt=...&m=... сілтемесі
   Дүкен → санат сәйкестігі "merchants" ортақ коллекциясында сақталады (отбасына ортақ). */
(function () {
  let pending = null;

  // "1 234,50 ₸", "₸1,234.00", "2500" → сан
  function parseAmt(s) {
    s = String(s == null ? "" : s).replace(/[^\d.,]/g, "");
    if (!s) return 0;
    const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    if (last >= 0 && s.length - last - 1 <= 2) return Number(s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1)) || 0;
    return Number(s.replace(/[.,]/g, "")) || 0;
  }

  const mkey = m => String(m || "").toLowerCase().replace(/[^a-zа-яәіңғүұқөһё0-9]+/gi, " ").trim().slice(0, 60);

  // Дүкен атауынан санат (негізгі санаттар нөмірі: 0 Продукт, 1 Көлік/Такси, 2 Коммуналка, 3 Байланыс,
  // 4 Сыйлық, 5 Дәрі, 6 Киім, 7 Көңіл көтеру, 8 Басқа)
  const MKW = [
    [0, /magnum|small|galmart|anvar|metro|ramstore|interfood|арзан|arzan|toimart|той|dina|fix price|ассорти|магнум|смолл|market|маркет|продукт|азық|супермаркет|magazin|дүкен|minimarket|airba fresh|gross/i],
    [1, /yandex.?go|yandex.?taxi|uber|indriver|indrive|taxi|такси|qazaq.?oil|helios|sinooil|kmg|petro|azs|азс|gas station|parking|паркинг|onay|онай|автобус/i],
    [2, /alseco|алсеко|энерго|energo|су арнасы|водоканал|kazakhtelecom.*home|жкх|кск|osi|оси|eрц|ерц|газ|qazaqgaz/i],
    [3, /kcell|activ|beeline|tele2|altel|kazakhtelecom|казахтелеком|izi|megaline|связь|байланыс/i],
    [5, /аптек|apteka|pharm|фарм|biosfera|europharma|sadykhan|гиппократ|dari|дәрі|med|клиник|clinic|invivo|olymp/i],
    [6, /lc waikiki|zara|h&m|bershka|stradivarius|pull&bear|defacto|koton|sportmaster|adidas|nike|puma|ostin|gloria|colins|lamoda|wildberries|ozon|kiyim|киім|обувь|shoes/i],
    [7, /kino|cinema|кино|chaplin|kinopark|netflix|spotify|apple\.com|itunes|youtube|steam|playstation|кафе|cafe|coffee|кофе|starbucks|kfc|burger|bahandi|del papa|dodo|pizza|пицца|salam bro|tanuki|sushi|ресторан|restaurant|бар\b|bar\b/i]
  ];

  function guessFromMerchant(m) {
    const mem = (window.FDB_STORE && window.FDB_STORE("merchants")) || {};
    const k = mkey(m);
    if (k && mem[k] && mem[k].cat != null && (typeof CATS === "undefined" || mem[k].cat < CATS.length)) return { cat: mem[k].cat, learned: true };
    for (const [c, re] of MKW) if (re.test(m)) return { cat: c, learned: false };
    return { cat: 8, learned: false };
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) }
  const money = n => Math.round(n).toLocaleString("ru-RU") + " ₸";

  function close() { const o = document.getElementById("qa"); if (o) o.remove() }

  function show(o) {
    close();
    const amt = parseAmt(o.amt), m = String(o.m || "").trim(), g = guessFromMerchant(m);
    const cats = typeof CATS !== "undefined" ? CATS : [];
    const el = document.createElement("div");
    el.id = "qa";
    el.innerHTML = `<div class="qa-bg" onclick="QA.cancel()"></div>
      <div class="qa-sheet" role="dialog" aria-label="Шығын қосу">
        <div class="mu" style="text-align:center">${o.src === "applepay" ? "Apple Pay арқылы төленді" : "Жаңа шығын"}</div>
        <input id="qa_amt" class="qa-amt" type="number" inputmode="decimal" value="${amt || ""}" placeholder="Сома">
        <input id="qa_m" value="${esc(m)}" placeholder="Қайда (дүкен)" style="text-align:center">
        <div class="mu" style="margin:10px 0 6px">Санат ${g.learned ? "· <span class='pos'>бұрынғыдай</span>" : "· ұсыныс"}</div>
        <div class="chips">${cats.map((c, i) => `<button class="chip ${i === g.cat ? "on" : ""}" data-i="${i}" onclick="QA.pick(${i})">${c[0]}<br><small>${esc(c[1])}</small></button>`).join("")}</div>
        <input id="qa_c" placeholder="💬 Пікір (міндетті емес)">
        <div class="row" style="margin-top:10px"><button class="g" style="flex:1" onclick="QA.cancel()">Бас тарту</button><button style="flex:2" onclick="QA.save()">Сақтау</button></div>
      </div>`;
    el.dataset.cat = g.cat;
    document.body.appendChild(el);
  }

  function tryShow() {
    if (!pending) return;
    if (!window.FDB || typeof CATS === "undefined") return;   // кіргеннен кейін көрсетіледі
    const o = pending; pending = null;
    show(o);
  }

  window.QA = {
    pick(i) {
      const el = document.getElementById("qa"); if (!el) return;
      el.dataset.cat = i;
      el.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", Number(b.dataset.i) === i));
    },
    cancel() { close() },
    async save() {
      const el = document.getElementById("qa"); if (!el) return;
      const amt = parseAmt(document.getElementById("qa_amt").value);
      if (!(amt > 0)) { window.toast && toast("Соманы жаз"); return }
      const m = document.getElementById("qa_m").value.trim(), cm = document.getElementById("qa_c").value.trim(), cat = Number(el.dataset.cat) || 0;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const rec = { cat, amt, note: m, t: Date.now(), src: "applepay" };
      if (cm) rec.cm = cm;
      close();
      try {
        const ops = [FDB.collection("expenses").doc(id).set(rec)];
        const k = mkey(m);
        if (k) ops.push(FDB.collection("merchants").doc(k.replace(/\s+/g, "_")).set({ n: m, cat, k }));
        await Promise.all(ops);
        window.toast && toast("Қосылды: " + money(amt) + (typeof CATS !== "undefined" ? " · " + CATS[cat][0] + " " + CATS[cat][1] : ""));
        window.render && render();
      } catch (_) { /* қатені shim өзі көрсетеді */ }
    }
  };

  window.QA_GUESS = guessFromMerchant;   // kaspi.js қолданады
  window.QA_MKEY = mkey;
  window.QUICKADD = function (o) { pending = o || {}; tryShow() };
  window.QUICKADD_READY = tryShow;   // shim кіргеннен кейін шақырады

  // Веб-сілтеме: ?add=1&amt=2500&m=Magnum
  const p = new URLSearchParams(location.search);
  if (p.get("add")) {
    pending = { amt: p.get("amt"), m: p.get("m") || "", src: p.get("src") || "applepay" };
    history.replaceState(null, "", location.pathname);
  }
})();
