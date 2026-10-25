import type { Endpoint } from "@opencode/client/effect/service"
import { errorMessage } from "../util/error"
import { Bridge } from "./bridge"
import { maskToken, Store } from "./config"
import { renderPage } from "./page"
import {
  splitMessage,
  Telegram,
  TelegramError,
  validateToken,
  type TelegramChat,
  type TelegramMessage,
} from "./telegram"

type ConfigInput = {
  readonly enabled: boolean
  readonly token?: string
}

type Phase = "disabled" | "starting" | "running" | "error"

type BotState = { readonly id: number; readonly name: string; readonly username?: string }

export type Status = {
  readonly enabled: boolean
  readonly hasToken: boolean
  readonly tokenHint?: string
  readonly phase: Phase
  readonly bot?: { readonly id: number; readonly name: string; readonly username?: string }
  readonly error?: string
  readonly directory: string
  readonly sessions: number
  readonly messages: number
  readonly version: string
}

export class Samet {
  private readonly store = new Store()
  private readonly bridge: Bridge
  private readonly queues = new Map<string, Promise<void>>()
  private server: ReturnType<typeof Bun.serve> | undefined
  private botAbort: AbortController | undefined
  private poller: Promise<void> | undefined
  private phase: Phase = "disabled"
  private botInfo: BotState | undefined
  private error: string | undefined
  private messages = 0
  private stopping = false

  constructor(
    endpoint: Endpoint,
    private readonly directory: string,
    private readonly port: number,
    private readonly version: string,
  ) {
    this.bridge = new Bridge(endpoint, directory)
  }

  async start() {
    await this.store.load()
    for (const session of Object.values(this.store.current.sessions)) this.bridge.own(session.sessionID)
    this.bridge.start()
    this.server = Bun.serve({
      hostname: "127.0.0.1",
      port: this.port,
      fetch: (request) => this.fetch(request),
    })
    if (this.store.current.enabled && this.store.current.token) await this.startBot()
    return this.server.url
  }

  status(): Status {
    const token = this.store.current.token
    return {
      enabled: this.store.current.enabled,
      hasToken: token !== undefined,
      tokenHint: maskToken(token),
      phase: this.phase,
      bot: this.botInfo,
      error: this.error,
      directory: this.directory,
      sessions: Object.keys(this.store.current.sessions).length,
      messages: this.messages,
      version: this.version,
    }
  }

  async setConfig(input: ConfigInput) {
    const token = input.token?.trim()
    if (input.enabled) {
      const next = token || this.store.current.token
      if (!next) throw new Error("Telegram'ı açmak için bir bot token girmelisin.")
      if (token) {
        const info = await validateToken(token).catch((error) => {
          throw new Error(authMessage(error))
        })
        this.botInfo = { id: info.id, name: info.first_name, username: info.username }
      }
      await this.store.update({ enabled: true, token: next })
      await this.startBot()
      return this.status()
    }
    await this.store.update({ enabled: false })
    await this.stopBot()
    return this.status()
  }

  async stop() {
    this.stopping = true
    this.server?.stop(true)
    this.server = undefined
    await this.stopBot()
    await this.bridge.stop()
  }

  private async startBot() {
    await this.stopBot()
    const token = this.store.current.token
    if (!token) {
      this.phase = "disabled"
      return
    }
    const abort = new AbortController()
    this.botAbort = abort
    this.phase = "starting"
    this.error = undefined
    const bot = new Telegram(token)
    try {
      const info = await bot.getMe(abort.signal)
      await bot.deleteWebhook(abort.signal).catch(() => {})
      this.botInfo = { id: info.id, name: info.first_name, username: info.username }
      this.phase = "running"
    } catch (error) {
      if (abort.signal.aborted) return
      this.phase = "error"
      this.error = authMessage(error)
      return
    }
    this.poller = this.poll(bot, abort.signal)
  }

  private async stopBot() {
    const abort = this.botAbort
    this.botAbort = undefined
    abort?.abort()
    await this.poller?.catch(() => {})
    this.poller = undefined
    this.botInfo = undefined
    this.phase = "disabled"
  }

  private async poll(bot: Telegram, signal: AbortSignal) {
    let offset = 0
    let backoff = 1_000
    while (!signal.aborted) {
      try {
        const updates = await bot.getUpdates(offset, signal)
        backoff = 1_000
        if (this.error) {
          this.error = undefined
          this.phase = "running"
        }
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1)
          if (update.message) this.enqueue(bot, update.message)
        }
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof TelegramError && (error.code === 401 || error.code === 404)) {
          this.phase = "error"
          this.error = "Bot token geçersiz veya yetkisiz. Token'ı kontrol edip yeniden kaydet."
          return
        }
        this.phase = "error"
        this.error = errorMessage(error)
        await Bun.sleep(backoff)
        backoff = Math.min(backoff * 2, 15_000)
      }
    }
  }

  private enqueue(bot: Telegram, message: TelegramMessage) {
    const key = String(message.chat.id)
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous
      .then(() => this.handle(bot, message))
      .catch((error) => {
        console.error("samet: message failed", errorMessage(error))
      })
    this.queues.set(key, next)
    void next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key)
    })
  }

  private async handle(bot: Telegram, message: TelegramMessage) {
    if (message.from?.is_bot) return
    const chatID = message.chat.id
    const text = message.text?.trim()
    if (!text) {
      await bot.sendMessage(chatID, "Şimdilik yalnızca metin mesajlarını işleyebiliyorum.").catch(() => {})
      return
    }
    if (text === "/help" || text === "/start") {
      await bot.sendMessage(chatID, this.help()).catch(() => {})
      return
    }
    if (text === "/new" || text === "/reset") {
      const sessionID = await this.newSession(message.chat)
      await bot.sendMessage(chatID, `🆕 Yeni oturum açıldı.\n${sessionID}`).catch(() => {})
      return
    }

    const typing = setInterval(() => {
      void bot.sendChatAction(chatID).catch(() => {})
    }, 4_000)
    void bot.sendChatAction(chatID).catch(() => {})
    const placeholder = await bot.sendMessage(chatID, "⏳ İşleniyor…").catch(() => undefined)
    try {
      const sessionID = await this.session(message.chat)
      const answer = await this.bridge.ask(sessionID, text)
      this.messages++
      await this.deliver(bot, chatID, placeholder?.message_id, answer)
    } catch (error) {
      await this.deliver(bot, chatID, placeholder?.message_id, `⚠️ ${errorMessage(error)}`)
    } finally {
      clearInterval(typing)
    }
  }

  private async deliver(bot: Telegram, chatID: number, messageID: number | undefined, text: string) {
    if (this.stopping) return
    const chunks = splitMessage(text)
    const first = chunks[0] ?? "…"
    if (messageID !== undefined) {
      await bot.editMessage(chatID, messageID, first).catch(() => bot.sendMessage(chatID, first))
    } else {
      await bot.sendMessage(chatID, first)
    }
    for (const chunk of chunks.slice(1)) await bot.sendMessage(chatID, chunk)
  }

  private async session(chat: TelegramChat) {
    const key = String(chat.id)
    const stored = this.store.current.sessions[key]
    if (stored?.directory === this.directory) {
      const exists = await this.bridge.client.session
        .get({ sessionID: stored.sessionID })
        .then(() => true)
        .catch(() => false)
      if (exists) {
        this.bridge.own(stored.sessionID)
        return stored.sessionID
      }
    }
    return this.newSession(chat)
  }

  private async newSession(chat: TelegramChat) {
    const name =
      chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id))
    const info = await this.bridge.client.session.create({
      title: `Telegram · ${name}`.slice(0, 80),
      location: { directory: this.directory },
    })
    this.bridge.own(info.id)
    await this.store.remember(String(chat.id), {
      sessionID: info.id,
      directory: this.directory,
      title: info.title,
      updatedAt: Date.now(),
    })
    return info.id
  }

  private help() {
    return [
      "👋 Merhaba! Ben OpenCode Telegram köprüsüyüm.",
      "",
      "Bana yazdığın her mesajı, bu komutun çalıştığı klasördeki bir OpenCode oturumunda işlerim ve yanıtı buraya gönderirim.",
      "",
      `📁 Çalışma klasörü: ${this.directory}`,
      "",
      "Komutlar:",
      "/new — yeni bir OpenCode oturumu başlat",
      "/help — bu mesajı göster",
    ].join("\n")
  }

  private async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/setup")) {
      return new Response(renderPage(this.port), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      })
    }
    if (request.method === "GET" && url.pathname === "/api/status") return json(this.status())
    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = (await request.json().catch(() => undefined)) as Partial<ConfigInput> | undefined
      if (!body || typeof body.enabled !== "boolean")
        return json({ ...this.status(), error: "Geçersiz istek gövdesi." }, 400)
      try {
        return json(await this.setConfig({ enabled: body.enabled, token: body.token }))
      } catch (error) {
        return json({ ...this.status(), error: errorMessage(error) }, 400)
      }
    }
    return json({ error: "Bulunamadı" }, 404)
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })
}

function authMessage(error: unknown) {
  if (error instanceof TelegramError && (error.code === 401 || error.code === 404))
    return "Bot token geçersiz. @BotFather'dan aldığın token'ı kontrol et."
  return errorMessage(error)
}
