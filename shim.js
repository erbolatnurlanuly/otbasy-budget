/* Кіру, отбасы және Supabase-пен деректер синхрондау.
   app.js бұрынғы db.collection(...).doc(...).set/update/delete/onSnapshot интерфейсін қолданады,
   бұл файл сол интерфейсті Supabase үстінен береді. */
(function () {
  const C = window.APP_CONFIG;
  const sb = supabase.createClient(C.url, C.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.SB = sb;

  const store = {}, subs = {};
  let FAM = null, UID = null, EMAIL = "", MEMBERS = [], chan = null, started = false, loading = null;
  const K = (priv, coll) => (priv ? "p:" : "f:") + coll;
  const resolve = p => p.startsWith("data/users/") ? { priv: true, coll: "mine" } : { priv: false, coll: p };
  const map = k => store[k] || (store[k] = new Map());
  const emit = k => (subs[k] || []).forEach(f => { try { f() } catch (e) { console.error(e) } });
  const listen = (k, fn) => { (subs[k] = subs[k] || []).push(fn); fn() };
  const snapOf = k => ({ docs: [...map(k)].map(([id, d]) => ({ id, data: () => d })) });
  const docSnap = (k, id) => ({ id, exists: map(k).has(id), data: () => map(k).get(id) });
  const h = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = () => document.getElementById("app");
  const nav = () => document.getElementById("nav");

  async function call(p) { const r = await p; if (r.error) throw r.error; return r.data }
  function fail(e) { console.error(e); toast("Сақталмады: " + kz(e)); loadAll(); throw e }

  function toast(m) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t) }
    t.textContent = m; t.classList.add("on"); clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 2600);
  }
  window.toast = toast;

  function kz(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Email немесе құпиясөз қате.";
    if (/already registered|already exists/i.test(m)) return "Бұл email тіркелген. «Кіру» арқылы кіріңіз.";
    if (/Email not confirmed/i.test(m)) return "Email расталмаған. Поштаңдағы хатты аш.";
    if (/at least 6|Password should/i.test(m)) return "Құпиясөз кемінде 6 таңба болсын.";
    if (/valid email|invalid format/i.test(m)) return "Email дұрыс емес.";
    if (/bad code/i.test(m)) return "Мұндай отбасы коды жоқ.";
    if (/already in a family/i.test(m)) return "Сен бір отбасына қосылып қойғансың.";
    if (/family full/i.test(m)) return "Отбасы толы.";
    if (/rate limit|too many/i.test(m)) return "Тым жиі. Біраз күтіп, қайта көр.";
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Интернет жоқ сияқты.";
    return m;
  }

  /* ---------- деректер ---------- */
  function collection(path) {
    const { priv, coll } = resolve(path), k = K(priv, coll);
    return {
      onSnapshot(cb) { listen(k, () => cb(snapOf(k))) },
      doc(id) {
        return {
          onSnapshot(cb) { listen(k, () => cb(docSnap(k, id))) },
          async set(data) {
            data = JSON.parse(JSON.stringify(data));
            map(k).set(id, data); emit(k);
            try {
              await call(priv
                ? sb.from("private_docs").upsert({ user_id: UID, coll, id, data })
                : sb.from("docs").upsert({ family_id: FAM.id, coll, id, data }));
            } catch (e) { fail(e) }
          },
          async update(patch) {
            patch = JSON.parse(JSON.stringify(patch));
            const m = map(k); m.set(id, { ...(m.get(id) || {}), ...patch }); emit(k);
            try { await call(sb.rpc(priv ? "priv_merge" : "doc_merge", { p_coll: coll, p_id: id, p_patch: patch })) }
            catch (e) { fail(e) }
          },
          async delete() {
            map(k).delete(id); emit(k);
            try {
              await call(priv
                ? sb.from("private_docs").delete().match({ user_id: UID, coll, id })
                : sb.from("docs").delete().match({ family_id: FAM.id, coll, id }));
            } catch (e) { fail(e) }
          }
        };
      }
    };
  }

  async function fetchAll(table, match) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await call(sb.from(table).select("coll,id,data").match(match).range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) break;
    }
    return out;
  }

  function loadAll() {
    if (!FAM) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const [a, b] = await Promise.all([fetchAll("docs", { family_id: FAM.id }), fetchAll("private_docs", { user_id: UID })]);
        const keys = new Set(Object.keys(store));
        for (const k of keys) store[k] = new Map();
        a.forEach(r => map(K(false, r.coll)).set(r.id, r.data));
        b.forEach(r => map(K(true, r.coll)).set(r.id, r.data));
        new Set([...keys, ...Object.keys(store)]).forEach(emit);
      } catch (e) { console.error(e); toast("Жүктелмеді: " + kz(e)) }
      finally { loading = null }
    })();
    return loading;
  }

  function apply(priv, p) {
    const del = p.eventType === "DELETE", r = del ? p.old : p.new;
    if (!r || !r.coll) return;
    if (priv ? r.user_id !== UID : r.family_id !== FAM.id) return;
    const k = K(priv, r.coll);
    if (del) map(k).delete(r.id); else map(k).set(r.id, r.data);
    emit(k);
  }

  function subscribe() {
    if (chan) sb.removeChannel(chan);
    let first = true;
    chan = sb.channel("fam-" + FAM.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "docs", filter: "family_id=eq." + FAM.id }, p => apply(false, p))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "docs", filter: "family_id=eq." + FAM.id }, p => apply(false, p))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "docs" }, p => apply(false, p))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_docs", filter: "user_id=eq." + UID }, p => apply(true, p))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_docs", filter: "user_id=eq." + UID }, p => apply(true, p))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "private_docs" }, p => apply(true, p))
      .subscribe(st => { if (st === "SUBSCRIBED") { if (!first) loadAll(); first = false } });
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && started) loadAll() });
  window.addEventListener("online", () => { if (started) loadAll() });

  /* ---------- экрандар ---------- */
  function shell(html) { nav().innerHTML = ""; nav().style.display = "none"; app().innerHTML = html }

  function loginView(mode, msg) {
    mode = mode || "in";
    const up = mode === "up", reset = mode === "reset";
    shell(`<div class="auth">
      <div class="logo">₸</div>
      <h1 style="text-align:center;margin:10px 0 2px">Отбасылық бюджет</h1>
      <p class="mu" style="text-align:center;margin:0 0 18px">Екеуіңе ортақ бюджет, әрқайсыңа өз аккаунт</p>
      <div class="card">
        ${reset ? "" : `<div class="seg"><button class="${up ? "" : "on"}" onclick="AUTH.view('in')">Кіру</button><button class="${up ? "on" : ""}" onclick="AUTH.view('up')">Тіркелу</button></div>`}
        ${reset ? `<b>Құпиясөзді қалпына келтіру</b><p class="mu">Email жаз, сілтеме жібереміз.</p>` : ""}
        <input id="au_e" type="email" autocomplete="email" inputmode="email" placeholder="Email" style="margin-top:10px">
        ${reset ? "" : `<input id="au_p" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="Құпиясөз (кемінде 6 таңба)" style="margin-top:8px" onkeydown="if(event.key==='Enter')AUTH.go('${mode}')">`}
        <button id="au_b" style="margin-top:12px;width:100%" onclick="AUTH.go('${mode}')">${up ? "Тіркелу" : reset ? "Сілтеме жіберу" : "Кіру"}</button>
        <div id="au_m" class="mu" style="margin-top:10px;min-height:18px">${h(msg || "")}</div>
        ${reset ? `<button class="g" style="width:100%" onclick="AUTH.view('in')">← Артқа</button>` : (up ? "" : `<button class="x" style="width:100%;color:var(--mu)" onclick="AUTH.view('reset')">Құпиясөзді ұмыттым</button>`)}
      </div></div>`);
  }

  function newPassView(msg) {
    shell(`<div class="auth"><div class="logo">₸</div><div class="card"><b>Жаңа құпиясөз</b>
      <input id="np" type="password" autocomplete="new-password" placeholder="Жаңа құпиясөз" style="margin-top:10px">
      <button style="margin-top:12px;width:100%" onclick="AUTH.setPass()">Сақтау</button>
      <div id="au_m" class="mu" style="margin-top:10px">${h(msg || "")}</div></div></div>`);
  }

  function familyView(msg) {
    shell(`<div class="auth"><div class="logo">₸</div>
      <h1 style="text-align:center;margin:10px 0 2px">Отбасыңды қос</h1>
      <p class="mu" style="text-align:center;margin:0 0 14px">${h(EMAIL)}</p>
      <div class="card"><b>Атың</b><input id="fm_n" placeholder="Мысалы: Ербол" style="margin-top:8px"></div>
      <div class="card"><b>Жаңа отбасы ашамын</b><p class="mu" style="margin:4px 0 8px">Бірінші болып кіретін адам ашады. Содан кейін кодты жұбайыңа жібересің.</p>
        <button style="width:100%" onclick="AUTH.create()">Отбасы ашу</button></div>
      <div class="card"><b>Кодпен қосыламын</b><p class="mu" style="margin:4px 0 8px">Жұбайың берген 6 таңбалы кодты жаз.</p>
        <div class="row"><input id="fm_c" placeholder="ABC123" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:3px;font-weight:700"><button onclick="AUTH.join()">Қосылу</button></div></div>
      <div id="au_m" class="neg" style="min-height:18px">${h(msg || "")}</div>
      <button class="g" style="width:100%" onclick="AUTH.out()">Шығу</button></div>`);
  }

  const setMsg = (m, bad) => { const e = document.getElementById("au_m"); if (e) { e.textContent = m; e.className = bad ? "neg" : "mu" } };
  const busy = on => { const b = document.getElementById("au_b"); if (b) { b.disabled = on; b.style.opacity = on ? .6 : 1 } };
  const val = id => ((document.getElementById(id) || {}).value || "").trim();

  window.AUTH = {
    view: m => loginView(m),
    async go(mode) {
      const email = val("au_e"), pass = (document.getElementById("au_p") || {}).value || "";
      if (!email) return setMsg("Email жаз.", 1);
      busy(true); setMsg("Күте тұр…");
      try {
        if (mode === "reset") {
          await call(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
          setMsg("Поштаңа сілтеме жібердік.");
        } else if (mode === "up") {
          if (pass.length < 6) { busy(false); return setMsg("Құпиясөз кемінде 6 таңба болсын.", 1) }
          const d = await call(sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } }));
          if (!d.session) setMsg("Поштаңа растау хаты келді. Сілтемені басып, осында қайта кір.");
        } else {
          await call(sb.auth.signInWithPassword({ email, password: pass }));
        }
      } catch (e) { setMsg(kz(e), 1) }
      busy(false);
    },
    async setPass() {
      const p = (document.getElementById("np") || {}).value || "";
      if (p.length < 6) return setMsg("Кемінде 6 таңба.", 1);
      try { await call(sb.auth.updateUser({ password: p })); toast("Құпиясөз өзгерді ✓"); setTimeout(() => location.replace(location.pathname), 800) } catch (e) { setMsg(kz(e), 1) }
    },
    async create() {
      try { const code = await call(sb.rpc("create_family", { p_name: "Отбасы", p_display: val("fm_n") || EMAIL.split("@")[0] })); toast("Отбасы ашылды. Код: " + code); boot() }
      catch (e) { setMsg(kz(e), 1) }
    },
    async join() {
      const c = val("fm_c"); if (!c) return setMsg("Кодты жаз.", 1);
      try { await call(sb.rpc("join_family", { p_code: c, p_display: val("fm_n") || EMAIL.split("@")[0] })); toast("Отбасына қосылдың ✓"); boot() }
      catch (e) { setMsg(kz(e), 1) }
    },
    async out() {
      if (!confirm("Аккаунттан шығасың ба?")) return;
      if (chan) sb.removeChannel(chan); chan = null;
      await sb.auth.signOut(); location.reload();
    },
    async rename(v) {
      v = String(v || "").trim(); if (!v) return;
      try { await call(sb.from("members").update({ display_name: v }).match({ user_id: UID })); const m = MEMBERS.find(x => x.user_id === UID); if (m) m.display_name = v; toast("Сақталды ✓") }
      catch (e) { toast(kz(e)) }
    },
    async share() {
      const t = "Отбасылық бюджетке қосыл: " + location.origin + location.pathname + "\nТіркеліп, мына кодты жаз: " + FAM.code;
      try { if (navigator.share) { await navigator.share({ text: t }); return } } catch (_) { return }
      try { await navigator.clipboard.writeText(t); toast("Көшірілді ✓") } catch (_) { prompt("Көшіріп ал:", t) }
    }
  };

  window.accountCard = function () {
    if (!FAM) return "";
    const me = MEMBERS.find(x => x.user_id === UID) || {};
    return `<div class="card"><div class="row sp"><b>👤 Аккаунт</b><span class="mu">${h(EMAIL)}</span></div>
      <label class="mu" style="display:block;margin-top:8px;font-size:12px">Атың<input value="${h(me.display_name || "")}" placeholder="Атың" onchange="AUTH.rename(this.value)"></label>
      <div class="it" style="margin-top:6px"><div class="mu">Отбасы мүшелері</div>${MEMBERS.map(m => `<div>${m.user_id === UID ? "🟢" : "👤"} ${h(m.display_name || "—")}${m.user_id === UID ? ' <span class="mu">(сен)</span>' : ""}</div>`).join("")}</div>
      <div class="row sp it"><span><span class="mu">Отбасы коды</span><div style="font-size:22px;font-weight:800;letter-spacing:4px">${h(FAM.code)}</div></span><button class="g" onclick="AUTH.share()">Жіберу</button></div>
      ${MEMBERS.length < 2 ? `<div class="mu">Жұбайың қосымшаны ашып, тіркеліп, осы кодты жазса — бюджет ортақ болады.</div>` : ""}
      <button class="x" style="width:100%;margin-top:6px" onclick="AUTH.out()">Аккаунттан шығу</button></div>`;
  };

  /* ---------- іске қосу ---------- */
  let booting = false;
  async function boot() {
    if (booting) return; booting = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { started = false; loginView(); return }
      UID = session.user.id; EMAIL = session.user.email || "";
      const mem = await call(sb.from("members").select("family_id").eq("user_id", UID).maybeSingle());
      if (!mem) { familyView(); return }
      FAM = await call(sb.from("families").select("id,name,code").eq("id", mem.family_id).single());
      MEMBERS = await call(sb.from("members").select("user_id,display_name,joined_at").eq("family_id", FAM.id).order("joined_at"));
      if (started) { loadAll(); return }
      app().innerHTML = '<p class="mu" style="text-align:center;margin-top:40vh">Жүктелуде…</p>';
      await loadAll();
      window.FDB = { uid: UID, collection };
      nav().style.display = "";
      started = true;
      subscribe();
      init();
    } catch (e) {
      console.error(e);
      shell(`<div class="auth"><div class="card"><b>Қосылу мүмкін болмады</b><p class="mu">${h(kz(e))}</p><button style="width:100%" onclick="location.reload()">Қайта көру</button></div></div>`);
    } finally { booting = false }
  }

  sb.auth.onAuthStateChange((ev) => {
    if (ev === "PASSWORD_RECOVERY") { setTimeout(() => newPassView(), 0); return }
    if (ev === "SIGNED_IN" && !started) setTimeout(boot, 0);
    if (ev === "SIGNED_OUT") { started = false; FAM = null; setTimeout(() => loginView(), 0) }
  });

  boot();
})();
