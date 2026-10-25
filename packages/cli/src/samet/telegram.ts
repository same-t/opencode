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

export type TelegramMessage = {
  readonly message_id: number
  readonly date: number
  readonly text?: string
  readonly chat: TelegramChat
  readonly from?: TelegramUser
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
  constructor(readonly token: string) {}

  call<Value>(method: string, payload: Record<string, unknown> = {}, signal?: AbortSignal) {
    const base = process.env.OPENCODE_SAMET_TELEGRAM_API ?? "https://api.telegram.org"
    return fetch(`${base}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    })
      .catch((error) => {
        throw new TelegramError(
          method,
          undefined,
          `Telegram'a ulaşılamadı (${error instanceof Error ? error.message : String(error)})`,
        )
      })
      .then(async (response) => {
        const body = (await response.json().catch(() => undefined)) as Response<Value> | undefined
        if (!body) throw new TelegramError(method, response.status, `Telegram ${method} isteği okunamadı`)
        if (!body.ok)
          throw new TelegramError(
            method,
            body.error_code ?? response.status,
            body.description ?? `Telegram ${method} isteği başarısız`,
          )
        return body.result as Value
      })
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
}

export async function validateToken(token: string) {
  return new Telegram(token).getMe(AbortSignal.timeout(10_000))
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
