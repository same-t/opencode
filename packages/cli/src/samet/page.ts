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
  .shell { width: 100%; max-width: 760px; display: grid; gap: 16px; }
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
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 22px;
    backdrop-filter: blur(18px);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }
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
  }
  .ghost:hover { background: rgba(255, 255, 255, 0.1); }
  .primary {
    width: 100%; margin-top: 16px; border: 0; border-radius: 12px; padding: 12px 16px;
    background: linear-gradient(180deg, var(--accent), var(--accent-strong));
    color: #080b10; font-weight: 700; font-size: 14px;
    box-shadow: 0 10px 24px rgba(111, 141, 247, 0.25);
  }
  .primary:hover { filter: brightness(1.06); }
  .primary:disabled { opacity: 0.55; cursor: wait; }
  .error { color: var(--bad); font-size: 13px; margin-top: 12px; min-height: 18px; }
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
  @media (max-width: 540px) {
    body { padding: 24px 12px 40px; }
    dl { grid-template-columns: 1fr; gap: 4px; }
    dd { margin-bottom: 8px; }
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
    <h2>Durum</h2>
    <dl>
      <dt>Bot</dt><dd id="bot">—</dd>
      <dt>Çalışma klasörü</dt><dd id="directory">—</dd>
      <dt>Oturumlar</dt><dd id="sessions">—</dd>
      <dt>İşlenen mesaj</dt><dd id="messages">0</dd>
      <dt>Son hata</dt><dd id="lastError">—</dd>
    </dl>
  </section>

  <section class="card">
    <h2>Nasıl çalışır?</h2>
    <ol>
      <li>Telegram'da botuna bir mesaj yaz.</li>
      <li>Köprü mesajı, bu komutun çalıştığı klasördeki bir OpenCode oturumuna iletir.</li>
      <li>OpenCode yanıtı hazırladığında sonuç aynı sohbete gönderilir.</li>
      <li>Her Telegram sohbeti kendi OpenCode oturumunu kullanır; <code>/new</code> ile sıfırlayabilirsin.</li>
    </ol>
    <div class="chips">
      <span class="chip">/help</span>
      <span class="chip">/new</span>
    </div>
  </section>

  <p class="foot">Ayarlar: ~/.config/opencode/samet.json</p>
</main>
<script>
  const $ = (id) => document.getElementById(id)
  let state = { enabled: false, hasToken: false, phase: "disabled" }
  let pending = false

  function badge() {
    const el = $("badge")
    el.className = "badge"
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
    $("toggle").classList.toggle("on", state.enabled || pending)
    $("toggle").setAttribute("aria-checked", String(state.enabled || pending))
    $("tokenCard").classList.toggle("hidden", !(state.enabled || pending))
    $("bot").textContent = state.bot
      ? "@" + (state.bot.username || state.bot.name) + " · " + state.bot.name
      : state.enabled
        ? "Bağlanıyor…"
        : "Kapalı"
    $("directory").textContent = state.directory || "—"
    $("sessions").textContent = String(state.sessions ?? 0)
    $("messages").textContent = String(state.messages ?? 0)
    $("lastError").textContent = state.error || "—"
    if (state.hasToken && !$("token").value) {
      $("token").placeholder = "Kayıtlı token: " + state.tokenHint + " (değiştirmek için yaz)"
    }
  }

  async function refresh() {
    try {
      const response = await fetch("/api/status", { cache: "no-store" })
      state = await response.json()
      if (state.enabled) pending = false
      render()
    } catch {}
  }

  async function save(enabled, token) {
    $("save").disabled = true
    $("error").textContent = ""
    try {
      const body = { enabled }
      if (token) body.token = token
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        $("error").textContent = result.error || "Ayarlar kaydedilemedi"
        return false
      }
      state = result
      pending = false
      $("token").value = ""
      render()
      return true
    } catch (error) {
      $("error").textContent = "Sunucuya ulaşılamadı"
      return false
    } finally {
      $("save").disabled = false
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

  refresh()
  setInterval(refresh, 4000)
</script>
</body>
</html>`
}
