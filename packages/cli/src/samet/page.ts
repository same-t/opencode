export function renderPage(port: number) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>opencode samet · Telegram</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #080b10;
    --card: rgba(255, 255, 255, 0.045);
    --line: rgba(255, 255, 255, 0.09);
    --text: #eef2f8;
    --muted: #95a0b3;
    --accent: #8aa4ff;
    --accent-strong: #6f8df7;
    --ok: #4ade80;
    --warn: #fbbf24;
    --bad: #fb7185;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background:
      radial-gradient(900px 500px at 15% -10%, rgba(111, 141, 247, 0.24), transparent 60%),
      radial-gradient(700px 420px at 110% 10%, rgba(74, 222, 128, 0.1), transparent 55%),
      var(--bg);
    color: var(--text);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex;
    justify-content: center;
    padding: 48px 18px 64px;
  }
  .shell { width: 100%; max-width: 780px; display: grid; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; padding: 4px 4px 10px; }
  .mark {
    width: 46px; height: 46px; border-radius: 14px;
    display: grid; place-items: center;
    background: linear-gradient(145deg, var(--accent), #4f5fd6);
    color: #0a0d14; font-weight: 800; font-size: 20px;
    box-shadow: 0 12px 30px rgba(111, 141, 247, 0.32);
  }
  h1 { margin: 0; font-size: 19px; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
  .badge {
    margin-left: auto; display: inline-flex; align-items: center; gap: 7px;
    border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03);
    padding: 6px 11px; border-radius: 999px; font-size: 12px; color: var(--muted);
    white-space: nowrap;
  }
  .badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #64748b; }
  .badge.ok { color: var(--ok); }
  .badge.ok::before { background: var(--ok); box-shadow: 0 0 12px var(--ok); }
  .badge.err { color: var(--bad); }
  .badge.err::before { background: var(--bad); }
  .badge.warn { color: var(--warn); }
  .badge.warn::before { background: var(--warn); }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 22px;
    backdrop-filter: blur(18px);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }
  .cardHead { display: flex; align-items: flex-start; gap: 16px; }
  .cardHead .grow { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 15px; letter-spacing: -0.01em; }
  p { margin: 0; }
  .row { display: flex; align-items: center; gap: 20px; }
  .row > div:first-child { flex: 1; }
  .hint { color: var(--muted); font-size: 13px; margin-top: 5px; }
  .switch {
    flex: none; width: 54px; height: 31px; border-radius: 999px; padding: 3px;
    border: 1px solid var(--line); background: rgba(255, 255, 255, 0.07);
    cursor: pointer; transition: background 160ms ease;
  }
  .switch span {
    display: block; width: 23px; height: 23px; border-radius: 50%;
    background: #cbd5e1; transition: transform 160ms ease, background 160ms ease;
  }
  .switch.on { background: var(--accent); border-color: transparent; }
  .switch.on span { transform: translateX(23px); background: #0a0d14; }
  label { display: block; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 8px; }
  .tokenRow { display: flex; gap: 10px; }
  input {
    flex: 1; min-width: 0; background: rgba(0, 0, 0, 0.34); color: var(--text);
    border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;
    font: 13.5px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; outline: none;
  }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(111, 141, 247, 0.18); }
  button { cursor: pointer; font: inherit; }
  .ghost {
    background: rgba(255, 255, 255, 0.05); color: var(--text);
    border: 1px solid var(--line); border-radius: 12px; padding: 0 14px; font-size: 13px;
    min-height: 44px; white-space: nowrap;
  }
  .ghost:hover { background: rgba(255, 255, 255, 0.1); }
  .ghost:disabled { opacity: 0.45; cursor: not-allowed; }
  .ghost.danger { color: var(--bad); }
  .primary {
    width: 100%; margin-top: 16px; border: 0; border-radius: 12px; padding: 12px 16px;
    background: linear-gradient(180deg, var(--accent), var(--accent-strong));
    color: #080b10; font-weight: 700; font-size: 14px;
    box-shadow: 0 10px 24px rgba(111, 141, 247, 0.25);
  }
  .primary:hover { filter: brightness(1.06); }
  .primary:disabled { opacity: 0.55; cursor: wait; }
  .primary.mini { width: auto; margin: 0; padding: 10px 16px; font-size: 13px; }
  .error { color: var(--bad); font-size: 13px; margin-top: 12px; min-height: 18px; }
  .okText { color: var(--ok); }
  .warnText { color: var(--warn); }
  dl { display: grid; grid-template-columns: 150px 1fr; gap: 10px 14px; margin: 14px 0 0; font-size: 13.5px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  ol { margin: 12px 0 0; padding-left: 20px; color: var(--muted); font-size: 13.5px; }
  li + li { margin-top: 6px; }
  code { color: var(--text); background: rgba(255, 255, 255, 0.07); padding: 1px 6px; border-radius: 6px; font-size: 12.5px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  .chip { border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--muted); }
  .hidden { display: none !important; }
  .foot { text-align: center; color: #5f6b7f; font-size: 12px; padding-top: 6px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .actions .ghost { flex: none; }
  .updateMeta { display: grid; gap: 6px; margin-top: 14px; font-size: 13px; color: var(--muted); }
  .updateMeta b { color: var(--text); font-weight: 600; }
  .models {
    margin-top: 16px; border: 1px solid var(--line); border-radius: 14px;
    background: rgba(0, 0, 0, 0.2); overflow: hidden;
  }
  .modelFilter { padding: 10px; border-bottom: 1px solid var(--line); }
  .modelFilter input { width: 100%; }
  .modelList { max-height: 340px; overflow: auto; }
  .model {
    display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--line);
    background: transparent; color: var(--text); padding: 11px 13px; font-size: 13px;
  }
  .model:last-child { border-bottom: 0; }
  .model:hover { background: rgba(255, 255, 255, 0.04); }
  .model.selected { background: rgba(111, 141, 247, 0.16); }
  .model .name { font-weight: 600; }
  .model .meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .model .ref { display: inline-block; margin-top: 4px; font: 11.5px ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--accent); }
  .selectedRow {
    display: flex; align-items: center; gap: 10px; margin-top: 14px;
    border: 1px dashed var(--line); border-radius: 12px; padding: 10px 12px; font-size: 13px;
  }
  .selectedRow code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .banner {
    position: sticky; top: 10px; z-index: 5;
    display: flex; align-items: center; gap: 10px;
    border: 1px solid rgba(251, 191, 36, 0.4); color: var(--warn);
    background: rgba(251, 191, 36, 0.1); border-radius: 12px; padding: 10px 14px; font-size: 13px;
  }
  .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(251, 191, 36, 0.3); border-top-color: var(--warn);
    animation: spin 900ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 540px) {
    body { padding: 24px 12px 40px; }
    dl { grid-template-columns: 1fr; gap: 4px; }
    dd { margin-bottom: 8px; }
    .card { padding: 18px; }
  }
</style>
</head>
<body>
<main class="shell">
  <header class="brand">
    <div class="mark">S</div>
    <div>
      <h1>opencode samet</h1>
      <p class="sub">Telegram köprüsü · 127.0.0.1:${port}</p>
    </div>
    <span id="badge" class="badge">Kapalı</span>
  </header>

  <div id="banner" class="banner hidden">
    <span class="spinner"></span>
    <span id="bannerText">Yeniden başlatılıyor…</span>
  </div>

  <section class="card">
    <div class="row">
      <div>
        <h2>Telegram kullanılsın mı?</h2>
        <p class="hint">Açıkken bota gelen her mesaj OpenCode oturumunda işlenir ve yanıt Telegram'a gönderilir.</p>
      </div>
      <button id="toggle" class="switch" role="switch" aria-checked="false" aria-label="Telegram köprüsünü aç veya kapat">
        <span></span>
      </button>
    </div>
  </section>

  <section id="tokenCard" class="card hidden">
    <label for="token">Telegram bot token</label>
    <div class="tokenRow">
      <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="123456789:AA..." />
      <button id="reveal" class="ghost" type="button">Göster</button>
    </div>
    <p class="hint">Token'ı <b>@BotFather</b> üzerinden <code>/newbot</code> ile alabilirsin. Token bu makinede yalnızca yerel ayar dosyasında saklanır.</p>
    <button id="save" class="primary">Kaydet ve bağlan</button>
    <p id="error" class="error"></p>
  </section>

  <section class="card">
    <div class="cardHead">
      <div class="grow">
        <h2>Proxy</h2>
        <p class="hint">İsteğe bağlı. Girersen OpenCode'un tüm dış istekleri ve Telegram trafiği bu proxy üzerinden çıkar.</p>
      </div>
    </div>
    <div style="margin-top:16px">
      <label for="proxy">Proxy adresi</label>
      <input id="proxy" type="text" autocomplete="off" spellcheck="false" placeholder="ip:port:username:password" />
      <p id="proxyHint" class="hint"></p>
      <div class="actions">
        <button id="proxySave" class="ghost">Kaydet</button>
        <button id="proxyTest" class="ghost">Test et</button>
        <button id="proxyClear" class="ghost danger">Proxy'yi kaldır</button>
      </div>
      <p id="proxyError" class="error"></p>
    </div>
  </section>

  <section class="card">
    <div class="cardHead">
      <div class="grow">
        <h2>Model</h2>
        <p class="hint">Bütün modelleri getir, birini seç ve kaydet. Kaydettiğin model yeni oturumlarda ve isteklerde kullanılır.</p>
      </div>
    </div>
    <div class="actions">
      <button id="modelsLoad" class="ghost">Modelleri Getir</button>
    </div>
    <div id="models" class="models hidden">
      <div class="modelFilter">
        <input id="modelFilter" type="text" placeholder="Model ara…" autocomplete="off" spellcheck="false" />
      </div>
      <div id="modelList" class="modelList"></div>
    </div>
    <div class="selectedRow">
      <input id="modelInput" type="text" placeholder="provider/model#variant" autocomplete="off" spellcheck="false" />
      <button id="modelCopy" class="ghost" type="button">Kopyala</button>
      <button id="modelSave" class="primary mini" type="button">Kaydet</button>
      <button id="modelClear" class="ghost danger" type="button">Temizle</button>
    </div>
    <p class="hint">Model listesinden seçebilir veya <code>provider/model#variant</code> biçiminde elle yazabilirsin.</p>
    <p id="modelError" class="error"></p>
  </section>

  <section class="card">
    <div class="cardHead">
      <div class="grow">
        <h2>Sürüm Kontrol</h2>
        <p class="hint">GitHub deposundaki <code id="repoName">same-t/opencode</code> ile karşılaştırır. Güncelleme varsa indirir ve köprüyü otomatik yeniden başlatır.</p>
      </div>
    </div>
    <div id="updateMeta" class="updateMeta">
      <div>Yerel sürüm: <b id="updateCurrent">—</b></div>
      <div>GitHub: <b id="updateRemote">—</b></div>
      <div id="updateState">Henüz kontrol edilmedi.</div>
    </div>
    <div class="actions">
      <button id="updateCheck" class="ghost">Güncelleme Kontrol</button>
      <button id="updateApply" class="primary mini" disabled>Güncelle</button>
    </div>
    <p id="updateError" class="error"></p>
  </section>

  <section class="card">
    <h2>Durum</h2>
    <dl>
      <dt>Bot</dt><dd id="bot">—</dd>
      <dt>Çalışma klasörü</dt><dd id="directory">—</dd>
      <dt>Sürüm</dt><dd id="version">—</dd>
      <dt>Oturumlar</dt><dd id="sessions">—</dd>
      <dt>İşlenen mesaj</dt><dd id="messages">0</dd>
      <dt>Aktif istek</dt><dd id="active">0</dd>
      <dt>Son hata</dt><dd id="lastError">—</dd>
    </dl>
  </section>

  <section class="card">
    <h2>Nasıl çalışır?</h2>
    <ol>
      <li>Telegram'da botuna bir mesaj, fotoğraf veya dosya gönder.</li>
      <li>Köprü mesajı bu klasördeki bir OpenCode oturumuna iletir; dosyalar <code>.opencode/telegram</code> altına indirilir.</li>
      <li>Durum tek bir mesajda canlı güncellenir; OpenCode yanıtı hazır olunca aynı mesajda sonuç gösterilir.</li>
      <li>Üretilen görsel ve dosyalar Telegram'a geri gönderilir.</li>
      <li>Her Telegram sohbeti kendi OpenCode oturumunu kullanır; <code>/new</code> ile sıfırlayabilirsin.</li>
    </ol>
    <div class="chips">
      <span class="chip">/stop</span>
      <span class="chip">/new</span>
      <span class="chip">/status</span>
      <span class="chip">/help</span>
    </div>
  </section>

  <p class="foot">Ayarlar: ~/.config/opencode/samet.json</p>
</main>
<script>
  const $ = (id) => document.getElementById(id)
  let state = { enabled: false, hasToken: false, phase: "disabled" }
  let pending = false
  let restarting = false
  let allModels = []
  let selectedModel = ""
  let lastUpdate = undefined

  function badge() {
    const el = $("badge")
    el.className = "badge"
    if (restarting) {
      el.classList.add("warn")
      el.textContent = "Yeniden başlatılıyor"
      return
    }
    if (!state.enabled) {
      el.textContent = "Kapalı"
      return
    }
    if (state.phase === "running") {
      el.classList.add("ok")
      el.textContent = "Bağlı"
      return
    }
    if (state.phase === "error") {
      el.classList.add("err")
      el.textContent = "Hata"
      return
    }
    el.textContent = "Başlatılıyor"
  }

  function render() {
    badge()
    $("banner").classList.toggle("hidden", !restarting)
    $("toggle").classList.toggle("on", state.enabled || pending)
    $("toggle").setAttribute("aria-checked", String(state.enabled || pending))
    $("tokenCard").classList.toggle("hidden", !(state.enabled || pending))
    $("bot").textContent = state.bot
      ? "@" + (state.bot.username || state.bot.name) + " · " + state.bot.name
      : state.enabled
        ? "Bağlanıyor…"
        : "Kapalı"
    $("directory").textContent = state.directory || "—"
    $("version").textContent = state.version || "—"
    $("sessions").textContent = String(state.sessions ?? 0)
    $("messages").textContent = String(state.messages ?? 0)
    $("active").textContent = String(state.active ?? 0)
    $("lastError").textContent = state.error || "—"
    if (state.hasToken && !$("token").value) {
      $("token").placeholder = "Kayıtlı token: " + state.tokenHint + " (değiştirmek için yaz)"
    }
    const proxy = state.proxy || {}
    $("proxyHint").textContent = proxy.configured
      ? "Kayıtlı proxy: " + (proxy.hint || "tanımlı") + " · Değiştirmek için yeni adres gir."
      : "Proxy kullanılmıyor."
    if (!selectedModel) selectedModel = state.model || ""
    renderModelCurrent()
    renderUpdate()
  }

  function renderModelCurrent() {
    const value = selectedModel || state.model || ""
    const input = $("modelInput")
    if (document.activeElement !== input && input.value !== value) input.value = value
    const current = input.value.trim() || value
    $("modelCopy").disabled = !current
    $("modelSave").disabled = !current
    $("modelClear").disabled = !state.model
  }

  function renderUpdate() {
    const update = lastUpdate
    if (!update) {
      $("updateState").textContent = "Henüz kontrol edilmedi."
      return
    }
    $("repoName").textContent = update.repo || "same-t/opencode"
    $("updateCurrent").textContent = update.current
      ? update.current.commit + " · " + update.current.subject + " (" + update.current.date + ")"
      : "—"
    $("updateRemote").textContent = update.remote
      ? update.remote.commit + " · " + update.remote.subject + " (" + update.remote.date + ")"
      : update.branch
        ? "origin/" + update.branch
        : "—"
    const el = $("updateState")
    el.className = ""
    if (update.error) {
      el.classList.add("warnText")
      el.textContent = update.error
    } else if (update.available) {
      el.classList.add("warnText")
      el.textContent = update.behind + " yeni commit var." + (update.dirty ? " Çalışma ağacı kirli, önce commit/stash gerekir." : "")
    } else {
      el.classList.add("okText")
      el.textContent = "Güncel görünüyorsun." + (update.ahead ? " " + update.ahead + " yerel commit ileride." : "")
    }
    $("updateApply").disabled = !(update.available && !update.dirty) || restarting
  }

  async function refresh() {
    try {
      const response = await fetch("/api/status", { cache: "no-store" })
      state = await response.json()
      if (state.enabled) pending = false
      if (state.restarting) startRestartWatch()
      else if (restarting) {
        restarting = false
        void loadUpdate(false)
      }
      render()
      return true
    } catch {
      return false
    }
  }

  async function request(path, options) {
    const response = await fetch(path, options)
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.error) throw new Error(result.error || "İstek başarısız")
    return result
  }

  async function save(enabled, token) {
    $("save").disabled = true
    $("error").textContent = ""
    try {
      const body = { enabled }
      if (token) body.token = token
      const result = await request("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      state = result
      pending = false
      $("token").value = ""
      render()
      return true
    } catch (error) {
      $("error").textContent = error.message
      return false
    } finally {
      $("save").disabled = false
    }
  }

  function startRestartWatch() {
    if (restarting) return
    restarting = true
    render()
    const tick = async () => {
      const up = await refresh()
      if (up && !restarting) return
      setTimeout(tick, 1200)
    }
    setTimeout(tick, 1200)
  }

  async function config(body) {
    const result = await request("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (result.restarting) startRestartWatch()
    return result
  }

  async function loadModels() {
    $("modelsLoad").disabled = true
    $("modelError").textContent = ""
    try {
      const result = await request("/api/models")
      allModels = result.models || []
      if (result.default && !state.model) selectedModel = result.default
      $("models").classList.remove("hidden")
      renderModels()
    } catch (error) {
      $("modelError").textContent = error.message
    } finally {
      $("modelsLoad").disabled = false
    }
  }

  function renderModels() {
    const filter = $("modelFilter").value.trim().toLowerCase()
    const list = $("modelList")
    list.textContent = ""
    const items = allModels.filter((model) => {
      if (!filter) return true
      return (model.ref + " " + model.name + " " + model.provider).toLowerCase().includes(filter)
    })
    if (items.length === 0) {
      const empty = document.createElement("div")
      empty.className = "model"
      empty.textContent = allModels.length === 0 ? "Model bulunamadı." : "Aramayla eşleşen model yok."
      list.appendChild(empty)
      return
    }
    for (const model of items) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "model" + (selectedModel === model.ref ? " selected" : "")
      const name = document.createElement("div")
      name.className = "name"
      name.textContent = model.name + (model.variants && model.variants.length ? " · " + model.variants.join(", ") : "")
      const meta = document.createElement("div")
      meta.className = "meta"
      meta.textContent = model.provider + " · " + model.id + " · " + model.status + (model.image ? " · görsel" : "")
      const ref = document.createElement("span")
      ref.className = "ref"
      ref.textContent = model.ref
      button.append(name, meta, ref)
      button.addEventListener("click", () => {
        selectedModel = model.ref
        $("modelInput").value = model.ref
        renderModelCurrent()
        renderModels()
      })
      button.addEventListener("dblclick", () => {
        void copyModel()
      })
      list.appendChild(button)
    }
  }

  async function copyModel() {
    const value = $("modelInput").value.trim() || selectedModel || state.model
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const input = document.createElement("textarea")
      input.value = value
      document.body.appendChild(input)
      input.select()
      document.execCommand("copy")
      input.remove()
    }
  }

  $("toggle").addEventListener("click", async () => {
    $("error").textContent = ""
    if (state.enabled || pending) {
      pending = false
      await save(false)
      return
    }
    if (state.hasToken) {
      await save(true)
      return
    }
    pending = true
    render()
    $("token").focus()
  })

  $("save").addEventListener("click", () => save(true, $("token").value.trim()))

  $("reveal").addEventListener("click", () => {
    const input = $("token")
    input.type = input.type === "password" ? "text" : "password"
    $("reveal").textContent = input.type === "password" ? "Göster" : "Gizle"
  })

  $("proxySave").addEventListener("click", async () => {
    $("proxyError").className = "error"
    $("proxyError").textContent = ""
    const value = $("proxy").value.trim()
    if (!value) {
      $("proxyError").textContent = "Proxy adresi gir veya kaldır düğmesini kullan."
      return
    }
    try {
      await config({ proxy: value })
      $("proxy").value = ""
      startRestartWatch()
    } catch (error) {
      $("proxyError").textContent = error.message
    }
  })

  $("proxyClear").addEventListener("click", async () => {
    $("proxyError").className = "error"
    $("proxyError").textContent = ""
    try {
      await config({ proxy: null })
      $("proxy").value = ""
      startRestartWatch()
    } catch (error) {
      $("proxyError").textContent = error.message
    }
  })

  $("proxyTest").addEventListener("click", async () => {
    $("proxyError").className = "error"
    $("proxyError").textContent = ""
    $("proxyTest").disabled = true
    try {
      const value = $("proxy").value.trim()
      if (!value) throw new Error("Önce test edilecek proxy adresini gir.")
      await request("/api/proxy/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proxy: value }),
      })
      $("proxyError").textContent = ""
      $("proxyError").className = "error okText"
      $("proxyError").textContent = "Proxy bağlantısı başarılı."
    } catch (error) {
      $("proxyError").className = "error"
      $("proxyError").textContent = error.message
    } finally {
      $("proxyTest").disabled = false
    }
  })

  $("modelsLoad").addEventListener("click", loadModels)
  $("modelFilter").addEventListener("input", renderModels)
  $("modelInput").addEventListener("input", () => {
    selectedModel = $("modelInput").value.trim()
    renderModelCurrent()
    if (!$("models").classList.contains("hidden")) renderModels()
  })
  $("modelInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("modelSave").click()
  })
  $("modelCopy").addEventListener("click", copyModel)
  $("modelSave").addEventListener("click", async () => {
    $("modelError").className = "error"
    $("modelError").textContent = ""
    const value = $("modelInput").value.trim()
    if (!value) {
      $("modelError").textContent = "Kaydetmek için bir model gir veya listeden seç."
      return
    }
    $("modelSave").disabled = true
    try {
      state = await config({ model: value })
      selectedModel = value
      render()
      $("modelError").className = "error okText"
      $("modelError").textContent = "Model kaydedildi."
    } catch (error) {
      $("modelError").className = "error"
      $("modelError").textContent = error.message
    } finally {
      renderModelCurrent()
    }
  })
  $("modelClear").addEventListener("click", async () => {
    $("modelError").className = "error"
    $("modelError").textContent = ""
    try {
      state = await config({ model: null })
      selectedModel = ""
      $("modelInput").value = ""
      render()
    } catch (error) {
      $("modelError").className = "error"
      $("modelError").textContent = error.message
    }
  })

  async function loadUpdate(force) {
    $("updateError").textContent = ""
    $("updateCheck").disabled = true
    try {
      lastUpdate = await request("/api/update" + (force ? "?refresh=1" : ""))
      renderUpdate()
    } catch (error) {
      $("updateError").textContent = error.message
    } finally {
      $("updateCheck").disabled = false
    }
  }

  $("updateCheck").addEventListener("click", () => loadUpdate(true))

  $("updateApply").addEventListener("click", async () => {
    $("updateError").textContent = ""
    $("updateApply").disabled = true
    $("updateApply").textContent = "Güncelleniyor…"
    try {
      const result = await request("/api/update", { method: "POST" })
      lastUpdate = result
      renderUpdate()
      if (result.updated) {
        startRestartWatch()
      } else {
        $("updateError").textContent = "Güncelleme yok."
      }
    } catch (error) {
      $("updateError").textContent = error.message
    } finally {
      $("updateApply").textContent = "Güncelle"
      renderUpdate()
    }
  })

  refresh()
  setInterval(refresh, 3500)
</script>
</body>
</html>`
}
