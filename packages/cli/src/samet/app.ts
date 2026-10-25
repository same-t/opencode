import type { Endpoint } from "@opencode/client/effect/service"
import { Model } from "@opencode/schema/model"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { errorMessage } from "../util/error"
import { Bridge, type AskFile } from "./bridge"
import { Access, DEFAULT_PASSWORD } from "./auth"
import { maskToken, Store } from "./config"
import { renderLogin, renderPage } from "./page"
import { maskProxy, parseProxy, proxyEnvironment, testProxy } from "./proxy"
import {
  splitMessage,
  Telegram,
  TelegramError,
  validateToken,
  type TelegramChat,
  type TelegramFile,
  type TelegramMessage,
} from "./telegram"
import { applyUpdate, checkUpdate } from "./update"

const MAX_DOWNLOAD = 20 * 1_024 * 1_024
const STATUS_LIMIT = 600
const MESSAGE_LIMIT = 4_000
const EDIT_INTERVAL = 1_400

type ConfigInput = {
  readonly enabled?: boolean
  readonly token?: string | null
  readonly proxy?: string | null
  readonly model?: string | null
}

type Phase = "disabled" | "starting" | "running" | "error"

type BotState = { readonly id: number; readonly name: string; readonly username?: string }

type Attachment = {
  readonly fileID: string
  readonly name: string
  readonly mime?: string
  readonly size?: number
}

type Downloaded = Attachment & { readonly path: string }

type Options = {
  readonly onRestart?: () => void
  readonly host?: string
  readonly password?: string
}

export type Status = {
  readonly enabled: boolean
  readonly hasToken: boolean
  readonly tokenHint?: string
  readonly proxy: { readonly configured: boolean; readonly hint?: string }
  readonly model?: string
  readonly phase: Phase
  readonly bot?: { readonly id: number; readonly name: string; readonly username?: string }
  readonly error?: string
  readonly directory: string
  readonly host: string
  readonly sessions: number
  readonly messages: number
  readonly active: number
  readonly version: string
  readonly restarting: boolean
  readonly external: boolean
}

export class Samet {
  private readonly store: Store
  private readonly bridge: Bridge
  private readonly host: string
  private readonly access: Access
  private readonly queues = new Map<string, Promise<void>>()
  private readonly controls = new Map<string, Promise<void>>()
  private server: ReturnType<typeof Bun.serve> | undefined
  private botAbort: AbortController | undefined
  private poller: Promise<void> | undefined
  private phase: Phase = "disabled"
  private botInfo: BotState | undefined
  private error: string | undefined
  private messages = 0
  private stopping = false
  private restartScheduled = false
  private restarting = false

  constructor(
    endpoint: Endpoint,
    private readonly directory: string,
    private readonly port: number,
    private readonly version: string,
    private readonly options: Options = {},
    store = new Store(),
  ) {
    this.store = store
    this.host = options.host?.trim() || "127.0.0.1"
    this.access = new Access(options.password || DEFAULT_PASSWORD)
    this.bridge = new Bridge(endpoint, directory)
  }

  async start() {
    await this.store.load()
    for (const session of Object.values(this.store.current.sessions)) this.bridge.own(session.sessionID)
    this.bridge.start()
    this.server = Bun.serve({
      hostname: this.host,
      port: this.port,
      fetch: (request) => this.fetch(request),
    })
    if (this.store.current.enabled && this.store.current.token) await this.startBot()
    return `http://127.0.0.1:${this.port}/`
  }

  status(): Status {
    const token = this.store.current.token
    return {
      enabled: this.store.current.enabled,
      hasToken: token !== undefined,
      tokenHint: maskToken(token),
      proxy: {
        configured: this.store.current.proxy !== undefined,
        hint: maskProxy(this.store.current.proxy),
      },
      model: this.store.current.model,
      phase: this.phase,
      bot: this.botInfo,
      error: this.error,
      directory: this.directory,
      host: this.host,
      sessions: Object.keys(this.store.current.sessions).length,
      messages: this.messages,
      active: this.bridge.active,
      version: this.version,
      restarting: this.restarting,
      external: !isLoopback(this.host),
    }
  }

  async setConfig(input: ConfigInput) {
    if (input.enabled !== undefined && typeof input.enabled !== "boolean")
      throw new Error("enabled true veya false olmalı.")
    if ("token" in input && input.token !== null && typeof input.token !== "string")
      throw new Error("token metin olmalı.")
    if ("proxy" in input && input.proxy !== null && typeof input.proxy !== "string")
      throw new Error("proxy metin olmalı.")
    if ("model" in input && input.model !== null && typeof input.model !== "string")
      throw new Error("model metin olmalı.")
    const hasEnabled = input.enabled !== undefined
    const hasToken = "token" in input
    const hasProxy = "proxy" in input
    const hasModel = "model" in input
    if (!hasEnabled && !hasToken && !hasProxy && !hasModel) throw new Error("Ayar gövdesi boş.")

    const current = this.store.current
    const token = hasToken ? input.token?.trim() || undefined : current.token
    const proxy = hasProxy ? parseProxyInput(input.proxy) : current.proxy
    const model = hasModel ? await this.validateModel(input.model) : current.model
    const enabled = hasEnabled ? input.enabled === true : current.enabled
    const proxyChanged = proxy !== current.proxy
    const willEnable = enabled

    if (willEnable && !token) throw new Error("Telegram'ı açmak için bir bot token girmelisin.")
    if (hasToken && token && (token !== current.token || proxyChanged)) {
      await validateToken(token, proxy).catch((error) => {
        throw new Error(authMessage(error))
      })
    }

    await this.store.update({
      ...(hasEnabled ? { enabled } : {}),
      ...(hasToken ? { token } : {}),
      ...(hasProxy ? { proxy } : {}),
      ...(hasModel ? { model } : {}),
    })

    if (proxyChanged) {
      // The standalone server keeps its environment for its whole lifetime, so
      // a proxy change only takes effect after a clean process restart.
      this.scheduleRestart()
      return this.status()
    }
    if (hasEnabled) {
      if (enabled) await this.startBot()
      else await this.stopBot()
      return this.status()
    }
    return this.status()
  }

  async models() {
    const [models, providers] = await Promise.all([
      this.bridge.client.model.list({ location: { directory: this.directory } }),
      this.bridge.client.provider.list({ location: { directory: this.directory } }).catch(() => undefined),
    ])
    const names = new Map(providers?.data.map((provider) => [provider.id, provider.name]) ?? [])
    let defaultModel: string | undefined
    await this.bridge.client.model
      .default({ location: { directory: this.directory } })
      .then((result) => {
        defaultModel = result.data ? refString({ id: result.data.id, providerID: result.data.providerID }) : undefined
      })
      .catch(() => {})
    return {
      default: defaultModel,
      models: models.data.map((item) => ({
        ref: refString({ id: item.id, providerID: item.providerID }),
        id: item.id,
        providerID: item.providerID,
        provider: names.get(item.providerID) ?? item.providerID,
        name: item.name,
        status: item.status,
        variants: item.variants.map((variant) => variant.id),
        image: item.capabilities.input.includes("image"),
        tools: item.capabilities.tools,
        released: item.time.released,
      })),
    }
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
    const bot = new Telegram(token, this.store.current.proxy)
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
          const message = update.message
          if (!message) continue
          const command = controlCommand(message)
          if (!command) {
            this.enqueue(bot, message)
            continue
          }
          const run = () =>
            this.control(bot, message, command).catch((error) => {
              console.error("samet: command failed", errorMessage(error))
            })
          // /stop must stay immediate; other commands are ordered per chat so a
          // quick /new followed by /chat acts on the session /new just created.
          if (command === "/stop" || command === "/iptal") void run()
          else this.sequence(String(message.chat.id), run)
        }
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof TelegramError && (error.code === 401 || error.code === 404)) {
          this.phase = "error"
          this.error = "Bot token geçersiz veya yetkisiz. Token'ı kontrol edip yeniden kaydet."
          return
        }
        if (error instanceof TelegramError && error.code === 409) {
          // Another process or device is long-polling the same bot token. Keep
          // retrying so this instance recovers as soon as the duplicate stops.
          this.phase = "error"
          this.error =
            "Aynı bot token'ı başka bir süreç veya cihaz da kullanıyor (Conflict). Diğer opencode-samet/bot süreçlerini kapat; bu süreç otomatik yeniden deniyor."
          await Bun.sleep(Math.max(backoff, 5_000))
          backoff = Math.min(backoff * 2, 15_000)
          continue
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

  private sequence(key: string, run: () => Promise<void>) {
    const previous = this.controls.get(key) ?? Promise.resolve()
    const next = previous.then(run)
    this.controls.set(key, next)
    void next.finally(() => {
      if (this.controls.get(key) === next) this.controls.delete(key)
    })
  }

  private async control(bot: Telegram, message: TelegramMessage, command: string) {
    const chatID = message.chat.id
    const argument = (message.text ?? "")
      .trim()
      .replace(/^\/\S+\s*/, "")
      .trim()
    try {
      if (command === "/stop" || command === "/iptal") {
        const sessionID = this.sessionID(chatID)
        if (!sessionID) {
          await bot.sendMessage(chatID, "ℹ️ Şu anda çalışan bir istek yok.").catch(() => {})
          return
        }
        const stopped = await this.bridge.interrupt(sessionID)
        if (!stopped) await bot.sendMessage(chatID, "ℹ️ Şu anda çalışan bir istek yok.").catch(() => {})
        return
      }
      if (command === "/new" || command === "/reset") {
        const previous = this.sessionID(chatID)
        if (previous) await this.bridge.interrupt(previous)
        const id = await this.newSession(message.chat, argument || undefined)
        await bot.sendMessage(chatID, `🆕 Yeni oturum açıldı.\n${argument ? `${argument}\n` : ""}${id}`).catch(() => {})
        return
      }
      if (command === "/chats" || command === "/sessions" || command === "/sohbetler") {
        await bot.sendMessage(chatID, await this.chatList(chatID)).catch(() => {})
        return
      }
      if (command === "/chat" || command === "/switch" || command === "/gec") {
        await this.switchSession(bot, message, argument)
        return
      }
      if (command === "/rename" || command === "/adlandir") {
        await this.renameSession(bot, message, argument)
        return
      }
      if (command === "/model") {
        await this.modelCommand(bot, message, argument)
        return
      }
      if (command === "/status") {
        const sessionID = this.sessionID(chatID)
        const title = sessionID ? this.store.current.sessions[String(chatID)]?.title : undefined
        const model = this.store.current.model ?? "varsayılan"
        await bot
          .sendMessage(
            chatID,
            [
              "📊 Durum",
              `Bot: ${this.botInfo ? `@${this.botInfo.username ?? this.botInfo.name}` : "bağlı değil"}`,
              `Model: ${model}`,
              `Klasör: ${this.directory}`,
              `Oturum: ${title ? `${title}\n${sessionID}` : "yok"}`,
              `Aktif istek: ${this.bridge.active}`,
            ].join("\n"),
          )
          .catch(() => {})
        return
      }
      await bot.sendMessage(chatID, this.help()).catch(() => {})
    } catch (error) {
      await bot.sendMessage(chatID, `⚠️ ${errorMessage(error)}`).catch(() => {})
    }
  }

  private async listSessions() {
    const page = await this.bridge.client.session.list({
      directory: this.directory,
      limit: 50,
      order: "desc",
    })
    return page.data.filter((session) => !session.parentID).slice(0, 20)
  }

  private async chatList(chatID: number) {
    const sessions = await this.listSessions()
    if (sessions.length === 0) return "Henüz oturum yok. /new ile yeni bir oturum açabilirsin."
    const current = this.sessionID(chatID)
    const active = sessions.findIndex((session) => session.id === current)
    return [
      `🧵 Oturumlar (${sessions.length})`,
      ...sessions.map(
        (session, index) =>
          `${session.id === current ? "▶️" : "▫️"} ${index + 1}. ${oneLine(session.title || "Başlıksız", 40)} · ${ago(session.time.updated)} · ${session.id.slice(0, 12)}`,
      ),
      "",
      active >= 0 ? `Şu an: #${active + 1}` : "Şu an: bu sohbete bağlı oturum yok",
      "Geçmek için: /chat 2",
    ].join("\n")
  }

  private async switchSession(bot: Telegram, message: TelegramMessage, argument: string) {
    const chatID = message.chat.id
    const sessions = await this.listSessions()
    if (sessions.length === 0) {
      await bot.sendMessage(chatID, "Henüz oturum yok. /new ile yeni bir oturum aç.").catch(() => {})
      return
    }
    if (!argument) {
      await bot.sendMessage(chatID, await this.chatList(chatID)).catch(() => {})
      return
    }
    const index = Number.parseInt(argument, 10)
    const picked = Number.isInteger(index) && index > 0 ? sessions[index - 1] : undefined
    const session = picked ?? sessions.find((item) => item.id === argument || item.id.startsWith(argument))
    if (!session) {
      await bot.sendMessage(chatID, `Oturum bulunamadı: ${argument}\n/chats ile listeyi yenile.`).catch(() => {})
      return
    }
    const previous = this.sessionID(chatID)
    if (previous && previous !== session.id) await this.bridge.interrupt(previous)
    this.bridge.own(session.id)
    await this.store.remember(String(chatID), {
      sessionID: session.id,
      directory: this.directory,
      title: session.title,
      updatedAt: Date.now(),
    })
    await bot
      .sendMessage(
        chatID,
        `🔀 Bu sohbet artık şu oturuma bağlı.\n#${sessions.indexOf(session) + 1} · ${session.title || "Başlıksız"}\n${session.id}`,
      )
      .catch(() => {})
  }

  private async renameSession(bot: Telegram, message: TelegramMessage, title: string) {
    const chatID = message.chat.id
    if (!title) {
      await bot.sendMessage(chatID, "Kullanım: /rename Yeni başlık").catch(() => {})
      return
    }
    const sessionID = await this.session(message.chat)
    const name = title.slice(0, 80)
    await this.bridge.client.session.update({ sessionID, title: name })
    await this.store.remember(String(chatID), {
      sessionID,
      directory: this.directory,
      title: name,
      updatedAt: Date.now(),
    })
    await bot.sendMessage(chatID, `✏️ Oturum adı: ${name}`).catch(() => {})
  }

  private async modelCommand(bot: Telegram, message: TelegramMessage, argument: string) {
    const chatID = message.chat.id
    if (!argument) {
      await bot
        .sendMessage(
          chatID,
          [
            `🤖 Model: ${this.store.current.model ?? "varsayılan"}`,
            "",
            "Değiştirmek için: /model provider/model",
            "Varyant için: /model provider/model#varyant",
          ].join("\n"),
        )
        .catch(() => {})
      return
    }
    const model = await this.validateModel(argument)
    if (!model) {
      await bot.sendMessage(chatID, "Kullanım: /model provider/model").catch(() => {})
      return
    }
    await this.store.update({ model })
    await bot
      .sendMessage(chatID, `✅ Model kaydedildi: ${model}\nBundan sonraki mesajlar bu modelle çalışır.`)
      .catch(() => {})
  }

  private async handle(bot: Telegram, message: TelegramMessage) {
    if (message.from?.is_bot) return
    const chatID = message.chat.id
    const text = (message.text ?? message.caption ?? "").trim()
    const attachment = attachmentOf(message)
    if (!text && !attachment) {
      await bot.sendMessage(chatID, "Şimdilik metin, fotoğraf ve dosya gönderebilirsin.").catch(() => {})
      return
    }

    const typing = setInterval(() => {
      void bot.sendChatAction(chatID).catch(() => {})
    }, 4_000)
    void bot.sendChatAction(chatID).catch(() => {})
    const placeholder = await bot.sendMessage(chatID, "⏳ İşleniyor…").catch(() => undefined)
    const live = new LiveMessage(bot, chatID, this.directory, placeholder?.message_id)

    try {
      let file: Downloaded | undefined
      if (attachment) {
        await live.update(["📎 Dosya indiriliyor…"])
        file = await this.download(bot, chatID, attachment)
      }
      if (this.stopping) return
      const sessionID = await this.session(message.chat)
      const prompt = [text, file ? `[Telegram dosyası: ${file.path}${file.name ? ` (${file.name})` : ""}]` : ""]
        .filter(Boolean)
        .join("\n\n")
      const files =
        file && file.mime?.startsWith("image/")
          ? [{ uri: pathToFileURL(file.path).href, name: file.name } satisfies AskFile]
          : []
      const result = await this.bridge.ask(sessionID, prompt || "Bu dosyayı incele.", {
        model: this.modelRef(),
        files,
        onStatus: (status) => void live.update(status.lines),
      })
      this.messages++
      await live.finish(result.text, result.files)
    } catch (error) {
      if (this.stopping) return
      await live.finish(`⚠️ ${errorMessage(error)}`, [])
    } finally {
      clearInterval(typing)
    }
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

  private sessionID(chatID: number) {
    const stored = this.store.current.sessions[String(chatID)]
    return stored?.directory === this.directory ? stored.sessionID : undefined
  }

  private async newSession(chat: TelegramChat, title?: string) {
    const name =
      chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id))
    const model = this.modelRef()
    const info = await this.bridge.client.session.create({
      title: (title || `Telegram · ${name}`).slice(0, 80),
      location: { directory: this.directory },
      ...(model ? { model } : {}),
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

  private modelRef() {
    const value = this.store.current.model
    if (!value) return undefined
    try {
      return Model.Ref.parse(value)
    } catch {
      return undefined
    }
  }

  private async validateModel(input: string | null | undefined) {
    const value = input?.trim()
    if (!value) return undefined
    let ref
    try {
      ref = Model.Ref.parse(value)
    } catch {
      throw new Error("Model biçimi provider/model olmalı. Örnek: opencode/deepseek-v4.")
    }
    const models = await this.bridge.client.model.list({ location: { directory: this.directory } })
    const found = models.data.find((item) => item.id === ref.id && item.providerID === ref.providerID)
    if (!found) throw new Error("Model bulunamadı. Önce Modelleri Getir ile listeyi yenile.")
    if (ref.variant && !found.variants.some((variant) => variant.id === ref.variant))
      throw new Error(`Bu modelde ${ref.variant} varyantı yok.`)
    return refString(ref)
  }

  private async download(bot: Telegram, chatID: number, attachment: Attachment) {
    if (attachment.size && attachment.size > MAX_DOWNLOAD) throw new Error("Telegram dosyası 20 MB sınırını aşıyor.")
    const info: TelegramFile = await bot.getFile(attachment.fileID)
    if (!info.file_path) throw new Error("Telegram dosya yolunu vermedi.")
    const bytes = await bot.download(info.file_path)
    if (bytes.byteLength > MAX_DOWNLOAD) throw new Error("Telegram dosyası 20 MB sınırını aşıyor.")
    const directory = path.join(this.directory, ".opencode", "telegram", String(chatID))
    await fs.promises.mkdir(directory, { recursive: true })
    const extension = path.extname(attachment.name) || path.extname(info.file_path)
    const base = path.basename(attachment.name, path.extname(attachment.name)) || "dosya"
    const name = `${Date.now()}-${safeName(base)}${extension ? safeName(extension) : ""}`
    const target = path.join(directory, name)
    await Bun.write(target, bytes)
    return { ...attachment, path: target, size: bytes.byteLength } satisfies Downloaded
  }

  private help() {
    return [
      "👋 Merhaba! Ben OpenCode Telegram köprüsüyüm.",
      "",
      "Bana yazdığın her mesajı, bu komutun çalıştığı klasördeki bir OpenCode oturumunda işler ve yanıtı buraya gönderirim.",
      "",
      `📁 Çalışma klasörü: ${this.directory}`,
      "",
      "Komutlar:",
      "/chats — oturumları listele",
      "/chat 2 — numaraya göre oturuma geç",
      "/new [başlık] — yeni bir OpenCode oturumu başlat",
      "/rename başlık — mevcut oturumu adlandır",
      "/model — modeli göster, /model provider/model ile değiştir",
      "/stop — çalışan isteği durdur",
      "/status — model ve oturum durumu",
      "/help — bu mesajı göster",
      "",
      "Fotoğraf veya dosya gönderebilirsin; çalışma klasörüne indirilir.",
    ].join("\n")
  }

  private async fetch(request: Request) {
    const url = new URL(request.url)
    const cookie = request.headers.get("cookie")
    if (request.method === "POST" && url.pathname === "/api/logout") {
      this.access.logout(cookie)
      return json({ ok: true }, 200, { "set-cookie": this.access.clear() })
    }
    if (request.method === "POST" && url.pathname === "/api/login") {
      const body = (await request.json().catch(() => undefined)) as { password?: unknown } | undefined
      if (!this.access.verify(body?.password)) {
        await Bun.sleep(350)
        return json({ error: "Parola yanlış." }, 401)
      }
      return json({ ok: true }, 200, { "set-cookie": this.access.cookie(this.access.issue()) })
    }
    if (!this.access.authorized(cookie)) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Giriş gerekli." }, 401)
      if (request.method === "GET") return html(renderLogin(this.port, url.hostname), 401)
      return json({ error: "Bulunamadı" }, 404)
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/setup")) {
      return html(renderPage(this.port, url.hostname))
    }
    if (request.method === "GET" && url.pathname === "/api/status") return json(this.status())
    if (request.method === "GET" && url.pathname === "/api/models") {
      try {
        return json(await this.models())
      } catch (error) {
        return json({ error: errorMessage(error), models: [] }, 400)
      }
    }
    if (request.method === "GET" && url.pathname === "/api/update") {
      try {
        return json(await checkUpdate(url.searchParams.has("refresh"), proxyEnvironment(this.store.current.proxy)))
      } catch (error) {
        return json({ source: false, error: errorMessage(error), checkedAt: Date.now() }, 400)
      }
    }
    if (request.method === "POST" && url.pathname === "/api/update") {
      try {
        const result = await applyUpdate(proxyEnvironment(this.store.current.proxy))
        if (result.updated) this.scheduleRestart()
        return json({ ...result, restarting: result.updated && this.restarting })
      } catch (error) {
        return json({ ...(await this.updateStatus()), error: errorMessage(error) }, 400)
      }
    }
    if (request.method === "POST" && url.pathname === "/api/proxy/test") {
      const body = (await request.json().catch(() => undefined)) as { proxy?: unknown } | undefined
      if (typeof body?.proxy !== "string" || !body.proxy.trim()) return json({ error: "Proxy adresi gerekli." }, 400)
      try {
        await testProxy(body.proxy)
        return json({ ok: true })
      } catch (error) {
        return json({ error: errorMessage(error) }, 400)
      }
    }
    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = (await request.json().catch(() => undefined)) as ConfigInput | undefined
      if (!body || typeof body !== "object") return json({ ...this.status(), error: "Geçersiz istek gövdesi." }, 400)
      try {
        return json(await this.setConfig(body))
      } catch (error) {
        return json({ ...this.status(), error: errorMessage(error) }, 400)
      }
    }
    return json({ error: "Bulunamadı" }, 404)
  }

  private scheduleRestart() {
    if (this.restartScheduled || !this.options.onRestart) return
    this.restartScheduled = true
    this.restarting = true
    setTimeout(() => {
      void this.options.onRestart?.()
    }, 500)
  }

  private async updateStatus() {
    return await checkUpdate(false, proxyEnvironment(this.store.current.proxy))
  }
}

class LiveMessage {
  private lines: string[] = []
  private finalFiles: AskFile[] = []
  private messageID: number | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private chain: Promise<void> = Promise.resolve()
  private last = 0
  private closed = false

  constructor(
    private readonly bot: Telegram,
    private readonly chatID: number,
    private readonly directory: string,
    messageID?: number,
  ) {
    this.messageID = messageID
  }

  update(lines: string[]) {
    this.lines = lines
    this.schedule()
  }

  async finish(text: string, files: AskFile[]) {
    this.finalFiles = files
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const final = finalParts(this.lines, text)
    await this.write(final.text)
    for (const chunk of final.rest) await this.send(chunk)
    await this.sendFiles()
  }

  private schedule() {
    if (this.closed || this.timer) return
    const wait = Math.max(0, EDIT_INTERVAL - (Date.now() - this.last))
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.closed) return
      void this.write(composeStatus(this.lines))
    }, wait)
  }

  private write(text: string) {
    const value = text || "⏳ İşleniyor…"
    this.last = Date.now()
    const sent = this.chain.then(() => this.deliver(value))
    this.chain = sent.catch(() => {})
    return sent
  }

  private async deliver(text: string) {
    try {
      if (this.messageID === undefined) {
        const sent = await this.bot.sendMessage(this.chatID, text)
        this.messageID = sent.message_id
        return
      }
      await this.bot.editMessage(this.chatID, this.messageID, text)
    } catch {
      // Telegram rejects edits that do not change the message; the next event retries.
    }
  }

  private async send(text: string) {
    await this.bot.sendMessage(this.chatID, text).catch(() => {})
  }

  private async sendFiles() {
    const seen = new Set<string>()
    for (const file of this.finalFiles) {
      if (file.uri.startsWith("data:")) {
        const data = parseDataURL(file.uri)
        if (!data) continue
        const name = file.name ?? dataName(data.mime)
        const key = `${data.mime}:${data.bytes.byteLength}:${name}`
        if (seen.has(key)) continue
        seen.add(key)
        const blob = new File([data.bytes], name, { type: data.mime })
        try {
          if (data.mime.startsWith("image/") && data.bytes.byteLength <= 10 * 1_024 * 1_024)
            await this.bot.sendPhoto(this.chatID, blob, name, name)
          else await this.bot.sendDocument(this.chatID, blob, name, name)
        } catch (error) {
          await this.bot.sendMessage(this.chatID, `⚠️ Dosya gönderilemedi: ${errorMessage(error)}`).catch(() => {})
        }
        continue
      }
      const target = resolveFile(file.uri, this.directory)
      if (!target || seen.has(target)) continue
      seen.add(target)
      const exists = await Bun.file(target)
        .exists()
        .catch(() => false)
      if (!exists) continue
      const info = Bun.file(target)
      const type = info.type || ""
      const caption = file.name ?? path.basename(target)
      try {
        if (type.startsWith("image/") && info.size <= 10 * 1_024 * 1_024)
          await this.bot.sendPhoto(this.chatID, target, caption, path.basename(target))
        else await this.bot.sendDocument(this.chatID, target, caption, path.basename(target))
      } catch (error) {
        await this.bot.sendMessage(this.chatID, `⚠️ Dosya gönderilemedi: ${errorMessage(error)}`).catch(() => {})
      }
    }
  }
}

function parseDataURL(uri: string) {
  if (uri.length > 64 * 1_024 * 1_024) return undefined
  const match = /^data:([^;,]*)((?:;[^,]*)*),(.*)$/s.exec(uri)
  if (!match) return undefined
  if (!match[2].split(";").includes("base64")) return undefined
  const mime = match[1] || "application/octet-stream"
  const bytes = Buffer.from(match[3].replace(/\s+/g, ""), "base64")
  if (bytes.byteLength === 0) return undefined
  return { mime, bytes }
}

function dataName(mime: string) {
  const extension = mime.split("/")[1]?.replace(/[^a-zA-Z0-9]+/g, "") || "bin"
  return `dosya-${Date.now()}.${extension}`
}

function composeStatus(lines: string[]) {
  const status = lines.join("\n")
  if (!status) return "⏳ İşleniyor…"
  return tail(status, STATUS_LIMIT)
}

function finalParts(lines: string[], answer: string) {
  const status = lines.length > 0 ? `🛠️ İşlemler\n${tail(lines.join("\n"), STATUS_LIMIT)}\n\n` : ""
  const body = answer.trim() || "İşlem tamamlandı."
  const [first = "", ...rest] = splitMessage(body, Math.max(200, MESSAGE_LIMIT - status.length))
  return { text: `${status}${first}`, rest }
}

function tail(text: string, limit: number) {
  if (text.length <= limit) return text
  return `…${text.slice(text.length - limit + 1)}`
}

const CONTROL_COMMANDS = [
  "/stop",
  "/iptal",
  "/new",
  "/reset",
  "/status",
  "/help",
  "/start",
  "/chats",
  "/sessions",
  "/sohbetler",
  "/chat",
  "/switch",
  "/gec",
  "/rename",
  "/adlandir",
  "/model",
]

function controlCommand(message: TelegramMessage) {
  const text = message.text?.trim().toLowerCase()
  if (!text || !text.startsWith("/")) return undefined
  const command = text.split(/\s+/)[0]?.replace(/@[\w_]+$/, "")
  if (CONTROL_COMMANDS.includes(command ?? "")) return command
  return undefined
}

function attachmentOf(message: TelegramMessage): Attachment | undefined {
  const photo = message.photo?.at(-1)
  if (photo)
    return {
      fileID: photo.file_id,
      name: `fotograf-${photo.width}x${photo.height}.jpg`,
      mime: "image/jpeg",
      size: photo.file_size,
    }
  const file = message.document ?? message.video ?? message.audio ?? message.voice ?? message.animation
  if (!file) return undefined
  const name = file.file_name ?? `${message.document ? "belge" : "medya"}-${file.file_unique_id}`
  return { fileID: file.file_id, name, mime: file.mime_type, size: file.file_size }
}

function resolveFile(uri: string, directory: string) {
  try {
    if (uri.startsWith("file:")) return path.resolve(fileURLToPath(uri))
    if (path.isAbsolute(uri)) return path.resolve(uri)
    return path.resolve(directory, uri)
  } catch {
    return undefined
  }
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)
}

function parseProxyInput(input: string | null | undefined) {
  const value = input?.trim()
  if (!value) return undefined
  return parseProxy(value).url
}

function refString(ref: { id: string; providerID: string; variant?: string }) {
  return `${ref.providerID}/${ref.id}${ref.variant ? `#${ref.variant}` : ""}`
}

function ago(updated: number) {
  const minutes = Math.floor(Math.max(0, Date.now() - updated) / 60_000)
  if (minutes < 1) return "az önce"
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} sa önce`
  return `${Math.floor(hours / 24)} gün önce`
}

function oneLine(text: string, limit: number) {
  const value = text.replace(/\s+/g, " ").trim()
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  })
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  })
}

function isLoopback(host: string) {
  return host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "localhost"
}

function authMessage(error: unknown) {
  if (error instanceof TelegramError && (error.code === 401 || error.code === 404))
    return "Bot token geçersiz. @BotFather'dan aldığın token'ı kontrol et."
  return errorMessage(error)
}
