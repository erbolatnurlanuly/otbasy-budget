/* Kaspi Gold выпискасын (PDF) телефонның өзінде оқып, шығын/кіріс ретінде қосу.
   Файл ешқайда жіберілмейді: pdf.js браузерде мәтінін алады.
   Қайта жүктесе қайталанбайды: әр жолдың тұрақты id-і бар ("ks_" + хэш). */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = n => Math.round(n).toLocaleString("ru-RU") + " ₸";
  let rows = [], rawText = "";

  // Операция түрлері (орысша және қазақша выписка)
  const OPS = [
    ["buy", /^(Покупка|Покупки|Сатып алу|Сатып алулар)$/i],
    ["transfer", /^(Перевод|Переводы|Аударым|Аударымдар)$/i],
    ["topup", /^(Пополнение|Пополнения|Толықтыру|Толықтырулар)$/i],
    ["cash", /^(Снятие|Снятия|Ақша алу|Ақша шешу|Шешу)$/i],
    ["other", /^(Разное|Әртүрлі|Басқа|Прочее)$/i]
  ];
  const OP_WORDS = "Покупка|Покупки|Сатып алу|Сатып алулар|Перевод|Переводы|Аударым|Аударымдар|Пополнение|Пополнения|Толықтыру|Толықтырулар|Снятие|Снятия|Ақша алу|Ақша шешу|Шешу|Разное|Әртүрлі|Басқа|Прочее";
  // 03.11.25  - 2 500,00 ₸  Покупка  MAGNUM
  const LINE = new RegExp("^(\\d{2})\\.(\\d{2})\\.(\\d{2,4})\\s+([+\\-−–])\\s*([\\d\\s\\u00a0\\u202f]+[.,]\\d{2})\\s*(?:₸|т|KZT)?\\s+(" + OP_WORDS + ")\\s*(.*)$", "i");

  function num(s) { return Number(String(s).replace(/[\s  ]/g, "").replace(",", ".")) || 0 }
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36) }
  const dstr = t => { const d = new Date(t); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() };

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "pdf.min.js?v=1";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js?v=1"; ok(window.pdfjsLib) };
      s.onerror = () => bad(new Error("PDF оқитын бөлік жүктелмеді. Интернетті тексер."));
      document.head.appendChild(s);
    });
  }

  // PDF → жолдар (бір y-координатадағы мәтіндер бір жол)
  async function pdfLines(file) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const byY = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 2) * 2, x = it.transform[4];
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push({ x, s: it.str });
      }
      [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, arr]) => {
        out.push(arr.sort((a, b) => a.x - b.x).map(a => a.s).join(" ").replace(/\s+/g, " ").trim());
      });
    }
    return out;
  }

  function parse(lines) {
    const seen = {}, res = [];
    for (const line of lines) {
      const m = line.match(LINE);
      if (!m) continue;
      let [, dd, mm, yy, sign, amtS, op, det] = m;
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
      const t = new Date(year, Number(mm) - 1, Number(dd), 12, 0, 0).getTime();
      const amt = num(amtS), plus = sign === "+";
      const kind = (OPS.find(([, re]) => re.test(op.trim())) || ["other"])[0];
      det = (det || "").trim();
      const base = [dd, mm, yy, sign, amtS.replace(/\s/g, ""), op, det].join("|");
      seen[base] = (seen[base] || 0) + 1;
      const id = "ks_" + hash(base + "#" + seen[base]);
      res.push({ id, t, amt, plus, kind, op: op.trim(), det });
    }
    return res;
  }

  function prepare(list) {
    const exp = (window.FDB_STORE && FDB_STORE("expenses")) || {}, inf = (window.FDB_STORE && FDB_STORE("inflow")) || {};
    const already = new Set([...Object.keys(exp), ...Object.keys(inf)]);
    // Apple Pay арқылы бұрын қосылғандар: сол күні, сол сома
    const applePay = Object.values(exp).filter(e => e && e.src === "applepay").map(e => dstr(e.t) + "|" + Math.round(e.amt));
    const apUsed = {};
    return list.map(r => {
      const o = { ...r };
      if (r.plus) { o.target = "inflow"; o.cat = null; o.note = r.det || r.op }
      else {
        o.target = "expenses";
        if (r.kind === "buy") { const g = window.QA_GUESS ? QA_GUESS(r.det) : { cat: 8 }; o.cat = g.cat; o.note = r.det }
        else { o.cat = 8; o.note = r.op + (r.det ? ": " + r.det : "") }   // 📦 Басқа
      }
      // Әдепкі таңдау: сатып алу, аударым (шығыс), әртүрлі — иә; толықтыру/қолма-қол ақша — жоқ (қайталанбауы үшін)
      o.on = !r.plus ? ["buy", "transfer", "other"].includes(r.kind) : r.kind === "transfer";
      o.why = "";
      if (already.has(r.id) || (exp[r.id] || inf[r.id])) { o.on = false; o.why = "бұрын жүктелген"; o.dup = true }
      else if (!r.plus && r.kind === "buy") {
        const k = dstr(r.t) + "|" + Math.round(r.amt);
        const n = applePay.filter(x => x === k).length;
        if (n > (apUsed[k] || 0)) { apUsed[k] = (apUsed[k] || 0) + 1; o.on = false; o.why = "Apple Pay-мен бұрын қосылған"; o.dup = true }
      }
      if (r.kind === "topup") o.why = o.why || "толықтыру (өз шотыңнан болуы мүмкін)";
      if (r.kind === "cash") o.why = o.why || "қолма-қол ақша алу";
      return o;
    });
  }

  function close() { const o = document.getElementById("ks"); if (o) o.remove() }

  function sheet(html) {
    close();
    const el = document.createElement("div");
    el.id = "ks";
    el.innerHTML = `<div class="qa-bg" onclick="KASPI.close()"></div><div class="qa-sheet" style="max-height:94vh">${html}</div>`;
    document.body.appendChild(el);
  }

  function renderList() {
    const cats = typeof CATS !== "undefined" ? CATS : [];
    const on = rows.filter(r => r.on), outSum = on.filter(r => !r.plus).reduce((s, r) => s + r.amt, 0), inSum = on.filter(r => r.plus).reduce((s, r) => s + r.amt, 0);
    const from = rows.length ? dstr(Math.min(...rows.map(r => r.t))) : "", to = rows.length ? dstr(Math.max(...rows.map(r => r.t))) : "";
    sheet(`<div class="row sp"><b>📄 Kaspi выпискасы</b><button class="x" onclick="KASPI.close()">✕</button></div>
      <div class="mu">${from} – ${to} · ${rows.length} операция</div>
      <div class="row sp it"><span>Таңдалды: ${on.length}</span><span><b>${money(outSum)}</b> шығын${inSum ? ` · <b class="pos">+${money(inSum)}</b>` : ""}</span></div>
      <div class="row" style="gap:6px;margin:6px 0"><button class="g" style="flex:1;font-size:13px" onclick="KASPI.all(true)">Бәрін белгілеу</button><button class="g" style="flex:1;font-size:13px" onclick="KASPI.all(false)">Бәрін алу</button></div>
      <div>${rows.map((r, i) => `<div class="it" style="opacity:${r.on ? 1 : .55}">
        <div class="row" style="gap:8px"><input type="checkbox" style="width:22px;height:22px;flex:none" ${r.on ? "checked" : ""} onchange="KASPI.tog(${i},this.checked)">
          <span style="flex:1;min-width:0"><span style="overflow-wrap:anywhere">${esc(r.note || r.op)}</span><div class="mu" style="font-size:12px">${dstr(r.t)} · ${esc(r.op)}${r.why ? " · " + esc(r.why) : ""}</div></span>
          <b class="${r.plus ? "pos" : ""}" style="white-space:nowrap">${r.plus ? "+" : "−"}${money(r.amt)}</b></div>
        ${!r.plus ? `<select style="margin:6px 0 0 30px;width:calc(100% - 30px);padding:6px;font-size:14px" onchange="KASPI.cat(${i},this.value)">${cats.map((c, j) => `<option value="${j}" ${r.cat === j ? "selected" : ""}>${c[0]} ${esc(c[1])}</option>`).join("")}</select>` : ""}
      </div>`).join("")}</div>
      <button style="width:100%;margin-top:12px;position:sticky;bottom:0" ${on.length ? "" : "disabled"} onclick="KASPI.save()">Қосу (${on.length})</button>`);
  }

  function failView(msg) {
    sheet(`<div class="row sp"><b>📄 Kaspi выпискасы</b><button class="x" onclick="KASPI.close()">✕</button></div>
      <p>${esc(msg)}</p>
      ${rawText ? `<p class="mu">Файлдың пішімі мен күткендей емес сияқты. «Үлгіні Claude-қа көрсету» бассаң, выписканың мәтіні тек сенің жеке бөліміңе сақталады (келіншегің көрмейді). Claude соны оқып, оқу бөлігін түзетеді.</p>
      <button style="width:100%" onclick="KASPI.sample()">Үлгіні Claude-қа көрсету</button>` : ""}
      <button class="g" style="width:100%;margin-top:8px" onclick="KASPI.close()">Жабу</button>`);
  }

  window.KASPI = {
    pick() {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "application/pdf,.pdf"; inp.style.display = "none";
      inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) KASPI.read(f) };
      document.body.appendChild(inp); inp.click();
    },
    async read(file) {
      sheet(`<div style="text-align:center;padding:30px 0"><b>Выписка оқылып жатыр…</b><div class="mu" style="margin-top:6px">${esc(file.name)}</div></div>`);
      try {
        KASPI.fromLines(await pdfLines(file));
      } catch (e) {
        rawText = "";
        failView((e && e.message) || "Файлды ашу мүмкін болмады. Бұл Kaspi выпискасының PDF-і екенін тексер.");
      }
    },
    fromLines(lines) {
      rawText = lines.join("\n");
      const parsed = parse(lines);
      if (!parsed.length) return failView("Бұл файлдан операциялар табылмады.");
      rows = prepare(parsed).sort((a, b) => b.t - a.t);
      renderList();
    },
    tog(i, v) { rows[i].on = v; renderList() },
    cat(i, v) { rows[i].cat = Number(v); rows[i].catChanged = true },
    all(v) { rows.forEach(r => { if (!r.dup || !v) r.on = v }); renderList() },
    close() { close() },
    async sample() {
      try {
        await FDB.collection("data/users/" + FDB.uid).doc("kaspi_sample").set({ kind: "kaspi_sample", text: rawText.slice(0, 20000), t: Date.now() });
        toast("Үлгі сақталды. Claude-қа «выписка үлгісін салдым» деп жаз.");
        close();
      } catch (_) {}
    },
    async save() {
      const on = rows.filter(r => r.on);
      if (!on.length) return;
      const ops = [], learn = {};
      for (const r of on) {
        if (r.target === "inflow") ops.push(FDB.collection("inflow").doc(r.id).set({ amt: r.amt, note: r.note, t: r.t, src: "kaspi" }));
        else {
          ops.push(FDB.collection("expenses").doc(r.id).set({ cat: r.cat, amt: r.amt, note: r.note, t: r.t, src: "kaspi" }));
          // Тек нақты санат болса ғана есте сақтаймыз (белгісіз дүкен «Басқа» болып жатталып қалмасын)
          if (r.kind === "buy" && r.det && window.QA_MKEY && (r.catChanged || r.cat !== 8)) { const k = QA_MKEY(r.det); if (k) learn[k] = { n: r.det, cat: r.cat, k } }
        }
      }
      // Сатып алынған дүкендердің санатын есте сақтау (келесі жолы өзі қойылады)
      Object.values(learn).forEach(m => ops.push(FDB.collection("merchants").doc(m.k.replace(/\s+/g, "_")).set(m)));
      close();
      try {
        await Promise.all(ops);
        toast("Қосылды: " + on.length + " операция ✓");
        window.render && render();
      } catch (_) {}
    },
    _parse: parse   // тексеру үшін
  };
})();
