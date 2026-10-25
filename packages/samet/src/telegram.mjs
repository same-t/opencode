const API_ROOT = process.env.OPENCODE_SAMET_TELEGRAM_API ?? "https://api.telegram.org"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function chunkText(text, size = 3900) {
  const value = String(text ?? "")
  if (value.length <= size) return value ? [value] : []
  const chunks = []
  let rest = value
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size)
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size)
    if (cut < size * 0.5) cut = size
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, "")
  }
  if (rest) chunks.push(rest)
  return chunks
}

export class TelegramBot {
  constructor({ token, onLog, onOffset }) {
    this.token = token
    this.onLog = onLog ?? (() => {})
    this.onOffset = onOffset ?? (() => {})
    this.offset = 0
    this.running = false
    this.me = null
    this.queues = new Map()
    this.pollAbort = null
    this.pollPromise = null
  }

  sanitize(value) {
    const text = String(value ?? "")
    return this.token ? text.split(this.token).join("***") : text
  }

  async call(method, payload = {}, timeoutMs = 45_000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${API_ROOT}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!body?.ok) {
        const code = Number(body?.error_code) || 0
        let description = this.sanitize(body?.description || `Telegram API hatası (${method})`)
        if (code === 401) description = "Telegram token geçersiz veya iptal edilmiş (401 Unauthorized). BotFather'dan token'ı kontrol et."
        else if (code === 409) description = "Bu bot başka bir yerde çalışıyor (409 Conflict). Diğer opencode-samet örneğini kapat."
        else if (code === 404) description = `Telegram kaynağı bulunamadı (404): ${description}`
        const error = new Error(description)
        error.code = code
        throw error
      }
      return body.result
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Telegram isteği zaman aşımına uğradı")
      throw new Error(this.sanitize(error?.message || error))
    } finally {
      clearTimeout(timer)
    }
  }

  async getMe() {
    const me = await this.call("getMe", {})
    this.me = me
    return me
  }

  async start({ offset = 0 } = {}) {
    if (this.running) return this.me
    this.offset = Number(offset) > 0 ? Number(offset) : 0
    const me = await this.getMe()
    // Long polling and webhooks are mutually exclusive.
    await this.call("deleteWebhook", { drop_pending_updates: false }).catch((error) =>
      this.onLog("warn", `deleteWebhook: ${error.message}`),
    )
    if (!this.offset) {
      // Discard the backlog so a restart does not answer old messages twice.
      const pending = await this.call("getUpdates", { offset: -1, timeout: 0, limit: 1 }).catch(() => [])
      const last = Array.isArray(pending) && pending.length ? pending[pending.length - 1] : null
      if (last?.update_id) {
        this.offset = last.update_id + 1
        this.onOffset(this.offset)
      }
    }
    this.running = true
    this.pollPromise = this.loop()
    this.onLog("info", `Telegram botu bağlandı: @${me.username}`)
    return me
  }

  async stop() {
    this.running = false
    try {
      this.pollAbort?.abort()
    } catch {}
    await Promise.race([this.pollPromise?.catch(() => {}), sleep(2000)])
    this.pollPromise = null
  }

  async loop() {
    let failures = 0
    while (this.running) {
      this.pollAbort = new AbortController()
      try {
        const updates = await this.getUpdates(this.offset)
        failures = 0
        for (const update of updates) {
          const id = Number(update?.update_id)
          if (Number.isFinite(id) && id >= this.offset) {
            this.offset = id + 1
            this.onOffset(this.offset)
          }
          if (update?.message) this.dispatch(update.message)
        }
      } catch (error) {
        if (!this.running) break
        failures += 1
        this.onLog("error", `Telegram bağlantı hatası: ${error.message}`)
        await sleep(Math.min(30_000, 2000 * failures))
      }
    }
  }

  async getUpdates(offset) {
    return this.call(
      "getUpdates",
      { offset, timeout: 25, limit: 100, allowed_updates: ["message"] },
      40_000,
    )
  }

  dispatch(message) {
    const chatId = message?.chat?.id
    if (!chatId) return
    const previous = this.queues.get(chatId) ?? Promise.resolve()
    const next = previous
      .then(() => this.handle(message))
      .catch((error) => this.onLog("error", `Mesaj işlenemedi: ${error.message}`))
    this.queues.set(chatId, next)
    next.finally(() => {
      if (this.queues.get(chatId) === next) this.queues.delete(chatId)
    })
  }

  async handle(message) {
    const chatId = message.chat.id
    const text = (message.text ?? message.caption ?? "").trim()
    if (!text) {
      await this.send(chatId, "Şimdilik yalnızca metin mesajlarını işleyebiliyorum.")
      return
    }
    await this.onMessage({ message, chatId, text, bot: this })
  }

  sendTyping(chatId) {
    const tick = () => this.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {})
    tick()
    const timer = setInterval(tick, 4500)
    return () => clearInterval(timer)
  }

  async send(chatId, text, extra = {}) {
    const chunks = chunkText(text)
    if (!chunks.length) return
    for (const chunk of chunks) {
      await this.call("sendMessage", {
        chat_id: chatId,
        text: chunk,
        link_preview_options: { is_disabled: true },
        ...extra,
      })
    }
  }
}
