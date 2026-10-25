export type TelegramUser = {
  readonly id: number
  readonly is_bot: boolean
  readonly first_name?: string
  readonly last_name?: string
  readonly username?: string
}

export type TelegramChat = {
  readonly id: number
  readonly type: "private" | "group" | "supergroup" | "channel"
  readonly title?: string
  readonly username?: string
  readonly first_name?: string
  readonly last_name?: string
}

export type TelegramPhoto = {
  readonly file_id: string
  readonly file_unique_id: string
  readonly width: number
  readonly height: number
  readonly file_size?: number
}

export type TelegramDocument = {
  readonly file_id: string
  readonly file_unique_id: string
  readonly file_name?: string
  readonly mime_type?: string
  readonly file_size?: number
}

export type TelegramMessage = {
  readonly message_id: number
  readonly date: number
  readonly text?: string
  readonly caption?: string
  readonly chat: TelegramChat
  readonly from?: TelegramUser
  readonly photo?: TelegramPhoto[]
  readonly document?: TelegramDocument
  readonly video?: TelegramDocument & { readonly duration?: number; readonly width?: number; readonly height?: number }
  readonly audio?: TelegramDocument & {
    readonly duration?: number
    readonly performer?: string
    readonly title?: string
  }
  readonly voice?: TelegramDocument & { readonly duration?: number }
  readonly animation?: TelegramDocument
}

export type TelegramUpdate = {
  readonly update_id: number
  readonly message?: TelegramMessage
}

export type BotInfo = {
  readonly id: number
  readonly is_bot: boolean
  readonly first_name: string
  readonly username?: string
}

export type TelegramFile = {
  readonly file_id: string
  readonly file_unique_id?: string
  readonly file_size?: number
  readonly file_path?: string
}

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message)
  }
}

type Response<Value> = {
  readonly ok: boolean
  readonly result?: Value
  readonly description?: string
  readonly error_code?: number
}

export class Telegram {
  constructor(
    readonly token: string,
    readonly proxy?: string,
  ) {}

  call<Value>(method: string, payload: Record<string, unknown> = {}, signal?: AbortSignal) {
    return fetch(this.base(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
      proxy: this.proxy,
    })
      .catch((error) => {
        throw this.transport(method, error)
      })
      .then((response) => this.decode<Value>(method, response))
  }

  getMe(signal?: AbortSignal) {
    return this.call<BotInfo>("getMe", {}, signal)
  }

  deleteWebhook(signal?: AbortSignal) {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false }, signal)
  }

  getUpdates(offset: number, signal?: AbortSignal) {
    return this.call<TelegramUpdate[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, signal)
  }

  getFile(fileID: string, signal?: AbortSignal) {
    return this.call<TelegramFile>("getFile", { file_id: fileID }, signal)
  }

  async download(filePath: string, signal?: AbortSignal) {
    const base = process.env.OPENCODE_SAMET_TELEGRAM_API ?? "https://api.telegram.org"
    const response = await fetch(`${base}/file/bot${this.token}/${filePath}`, {
      signal,
      proxy: this.proxy,
    }).catch((error) => {
      throw this.transport("download", error)
    })
    if (!response.ok) throw new TelegramError("download", response.status, `Dosya indirilemedi (${response.status})`)
    return new Uint8Array(await response.arrayBuffer())
  }

  sendMessage(chatID: number, text: string, signal?: AbortSignal) {
    return this.call<TelegramMessage>("sendMessage", { chat_id: chatID, text, disable_web_page_preview: true }, signal)
  }

  sendChatAction(chatID: number, signal?: AbortSignal) {
    return this.call<boolean>("sendChatAction", { chat_id: chatID, action: "typing" }, signal)
  }

  editMessage(chatID: number, messageID: number, text: string, signal?: AbortSignal) {
    return this.call<TelegramMessage>(
      "editMessageText",
      { chat_id: chatID, message_id: messageID, text, disable_web_page_preview: true },
      signal,
    )
  }

  sendPhoto(chatID: number, file: string | Blob, caption?: string, name?: string, signal?: AbortSignal) {
    const form = new FormData()
    form.set("chat_id", String(chatID))
    if (caption) form.set("caption", caption.slice(0, 1_024))
    if (typeof file === "string") form.set("photo", Bun.file(file), name)
    else form.set("photo", file, name)
    return this.upload<TelegramMessage>("sendPhoto", form, signal)
  }

  sendDocument(chatID: number, file: string | Blob, caption?: string, name?: string, signal?: AbortSignal) {
    const form = new FormData()
    form.set("chat_id", String(chatID))
    if (caption) form.set("caption", caption.slice(0, 1_024))
    if (typeof file === "string") form.set("document", Bun.file(file), name)
    else form.set("document", file, name)
    return this.upload<TelegramMessage>("sendDocument", form, signal)
  }

  private upload<Value>(method: string, body: FormData, signal?: AbortSignal) {
    return fetch(this.base(method), { method: "POST", body, signal, proxy: this.proxy })
      .catch((error) => {
        throw this.transport(method, error)
      })
      .then((response) => this.decode<Value>(method, response))
  }

  private async decode<Value>(method: string, response: globalThis.Response) {
    const body = (await response.json().catch(() => undefined)) as Response<Value> | undefined
    if (!body) throw new TelegramError(method, response.status, `Telegram ${method} isteği okunamadı`)
    if (!body.ok)
      throw new TelegramError(
        method,
        body.error_code ?? response.status,
        body.description ?? `Telegram ${method} isteği başarısız`,
      )
    return body.result as Value
  }

  private base(method: string) {
    return `${process.env.OPENCODE_SAMET_TELEGRAM_API ?? "https://api.telegram.org"}/bot${this.token}/${method}`
  }

  private transport(method: string, error: unknown) {
    return new TelegramError(
      method,
      undefined,
      `Telegram'a ulaşılamadı (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

export async function validateToken(token: string, proxy?: string) {
  return new Telegram(token, proxy).getMe(AbortSignal.timeout(10_000))
}

export function splitMessage(text: string, limit = 4_000) {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit - 1)
    const end = cut > limit / 2 ? cut + 1 : limit
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks
}
