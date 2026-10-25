import { Service, type Endpoint } from "@opencode/client/effect/service"
import { OpenCode, type EventSubscribeOutput } from "@opencode/client/promise"
import type { Model } from "@opencode/schema/model"
import { SessionMessage } from "@opencode/schema/session-message"
import { noTimeoutFetch } from "@opencode/util/no-timeout-fetch"
import path from "node:path"
import { errorMessage } from "../util/error"

const PROMPT_TIMEOUT = 15 * 60_000
const MAX_OUTGOING_MEDIA = 20 * 1_024 * 1_024

export type AskFile = {
  readonly uri: string
  readonly name?: string
  readonly description?: string
}

export type AskStatus = {
  readonly lines: string[]
}

export type AskOptions = {
  readonly model?: Model.Ref
  readonly files?: AskFile[]
  readonly onStatus?: (status: AskStatus) => void
}

export type AskResult = {
  readonly text: string
  readonly files: AskFile[]
}

type Outcome = {
  readonly text?: string
  readonly files?: AskFile[]
  readonly error?: string
}

type Entry = {
  readonly id: string
  readonly kind: "tool" | "info"
  readonly name?: string
  readonly summary?: string
  result?: string
  state: "running" | "done" | "error"
}

type Pending = {
  readonly id: string
  readonly texts: string[]
  readonly files: AskFile[]
  readonly entries: Map<string, Entry>
  readonly names: Map<string, string>
  started: boolean
  live: string
  settle: (outcome: Outcome) => void
  timer: ReturnType<typeof setTimeout>
  onStatus?: (status: AskStatus) => void
}

export class Bridge {
  readonly client
  private readonly pending = new Map<string, Pending>()
  private readonly owned = new Set<string>()
  private readonly abort = new AbortController()
  private consuming: Promise<void> | undefined
  private online = false
  private waiters: Array<() => void> = []

  constructor(
    endpoint: Endpoint,
    readonly directory: string,
  ) {
    this.client = OpenCode.make({
      baseUrl: endpoint.url,
      headers: Service.headers(endpoint),
      fetch: noTimeoutFetch,
    })
  }

  start() {
    this.consuming = this.consume()
  }

  own(sessionID: string) {
    this.owned.add(sessionID)
  }

  get active() {
    return this.pending.size
  }

  async stop() {
    for (const [sessionID, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.settle({ error: "Köprü kapandı." })
      await this.client.session.interrupt({ sessionID }).catch(() => {})
    }
    this.pending.clear()
    this.abort.abort()
    await this.consuming?.catch(() => {})
  }

  async ask(sessionID: string, text: string, options: AskOptions = {}) {
    if (this.pending.has(sessionID)) throw new Error("Bu sohbet için hâlâ çalışan bir istek var")
    await this.waitOnline()
    if (options.model) {
      await this.client.session.switchModel({ sessionID, model: options.model }).catch((error) => {
        throw new Error(`Model seçilemedi: ${errorMessage(error)}`)
      })
    }

    let pending!: Pending
    const outcome = new Promise<Outcome>((resolve) => {
      const timer = setTimeout(() => {
        void this.client.session.interrupt({ sessionID }).catch(() => {})
        this.finish(pending, sessionID, { error: "İstek zaman aşımına uğradı ve durduruldu." })
      }, PROMPT_TIMEOUT)
      pending = {
        id: SessionMessage.ID.create(),
        texts: [],
        files: [],
        entries: new Map(),
        names: new Map(),
        started: false,
        live: "",
        settle: resolve,
        timer,
        onStatus: options.onStatus,
      }
    })
    this.pending.set(sessionID, pending)

    try {
      await this.client.session.prompt({
        sessionID,
        id: pending.id,
        text,
        delivery: "steer",
        files: options.files,
      })
    } catch (error) {
      clearTimeout(pending.timer)
      this.pending.delete(sessionID)
      throw error
    }

    const result = await outcome
    if (result.error) throw new Error(result.error)
    return {
      text: result.text?.trim() || "İşlem tamamlandı, model metin yanıtı döndürmedi.",
      files: result.files ?? [],
    } satisfies AskResult
  }

  async interrupt(sessionID: string) {
    if (!this.pending.has(sessionID)) return false
    this.info(sessionID, "stop", "⏹️ Durduruluyor…")
    const result = await this.client.session.interrupt({ sessionID }).catch(() => ({ interrupted: false }))
    return result.interrupted
  }

  private async consume() {
    while (!this.abort.signal.aborted) {
      const stream = this.client.event.subscribe({ signal: this.abort.signal })[Symbol.asyncIterator]()
      try {
        for (;;) {
          const next = await stream.next()
          if (next.done) break
          this.online = true
          this.release()
          await this.handle(next.value)
        }
      } catch {
        if (this.abort.signal.aborted) return
        this.online = false
        await Bun.sleep(1_000)
      } finally {
        this.online = false
        await stream.return?.(undefined).catch(() => {})
      }
    }
  }

  private release() {
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter()
  }

  private waitOnline() {
    if (this.online) return Promise.resolve()
    if (this.abort.signal.aborted) return Promise.reject(new Error("Köprü kapandı."))
    return new Promise<void>((resolve, reject) => {
      const abort = () => reject(new Error("Köprü kapandı."))
      this.abort.signal.addEventListener("abort", abort, { once: true })
      this.waiters.push(() => {
        this.abort.signal.removeEventListener("abort", abort)
        resolve()
      })
    })
  }

  private async handle(event: EventSubscribeOutput) {
    // Telegram has no way to answer OpenCode prompts, so this bridge approves tool
    // permissions and politely cancels forms for the sessions it owns.
    if (event.type === "permission.asked") {
      if (!this.owned.has(event.data.sessionID)) return
      await this.client.permission
        .reply({ sessionID: event.data.sessionID, requestID: event.data.id, decision: "once" })
        .catch((error) => {
          console.error("samet: permission reply failed", errorMessage(error))
        })
      return
    }
    if (event.type === "form.created") {
      const form = event.data.form
      if (!this.owned.has(form.sessionID)) return
      await this.client.session.form
        .cancel({
          sessionID: form.sessionID,
          formID: form.id,
          message: "Telegram üzerinden form yanıtlanamıyor. Soruyu atlayıp devam et.",
        })
        .catch(() => {})
      return
    }
    if (!("sessionID" in event.data)) return
    const pending = this.pending.get(event.data.sessionID)
    if (!pending) return

    if (event.type === "session.inbox.delivered") {
      if (event.data.inboxID === pending.id) {
        pending.started = true
        this.info(event.data.sessionID, "started", "▶️ OpenCode isteği aldı.")
      }
      return
    }
    if (event.type === "session.inbox.cancelled") {
      if (event.data.inboxID === pending.id)
        this.finish(pending, event.data.sessionID, { error: "İstek iptal edildi." })
      return
    }
    if (
      event.type === "session.step.started" ||
      event.type === "session.text.started" ||
      event.type === "session.text.ended"
    ) {
      pending.started = true
    }
    if (event.type === "session.text.delta") {
      if (!pending.started) return
      pending.live = cap(pending.live + event.data.delta, 1_500)
      this.emit(pending)
      return
    }
    if (event.type === "session.text.ended") {
      pending.texts.push(event.data.text)
      pending.live = ""
      this.emit(pending)
      return
    }
    if (!pending.started) return

    if (event.type === "session.tool.input.started") {
      if (!pending.started) return
      pending.names.set(event.data.id, event.data.name)
      return
    }
    if (event.type === "session.tool.called") {
      const name = pending.names.get(event.data.id) ?? "araç"
      this.entry(pending, {
        id: event.data.id,
        kind: "tool",
        name,
        summary: summarize(name, event.data.input),
        state: "running",
      })
      return
    }
    if (event.type === "session.tool.success") {
      const output = event.data.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n")
      for (const content of event.data.content) {
        if (content.type !== "file") continue
        pending.files.push({ uri: content.uri, name: content.name })
      }
      this.updateEntry(pending, event.data.id, {
        state: "done",
        result: toolResult(output, event.data.metadata),
      })
      return
    }
    if (event.type === "session.tool.failed") {
      this.updateEntry(pending, event.data.id, {
        state: "error",
        result: oneLine(event.data.error.message, 140),
      })
      return
    }
    if (event.type === "session.retry.scheduled") {
      this.info(
        event.data.sessionID,
        `retry-${event.data.attempt}`,
        `⏳ Yeniden deniyor (${event.data.attempt}): ${oneLine(event.data.error.message, 160)}`,
      )
      return
    }
    if (event.type === "session.compaction.started") {
      this.info(event.data.sessionID, "compaction", "🗜️ Bağlam sıkıştırılıyor…")
      return
    }
    if (event.type === "session.step.ended" || event.type === "session.step.failed") {
      for (const file of event.data.files ?? []) await this.collectMedia(pending, file)
      return
    }
    if (event.type === "session.execution.succeeded") {
      this.finish(pending, event.data.sessionID, {
        text: pending.texts.join("\n\n"),
        files: pending.files,
      })
      return
    }
    if (event.type === "session.execution.failed") {
      this.finish(pending, event.data.sessionID, { error: event.data.error.message })
      return
    }
    if (event.type === "session.execution.interrupted") {
      this.finish(pending, event.data.sessionID, {
        error: interruptMessage(event.data.reason),
      })
    }
  }

  private info(sessionID: string, id: string, text: string) {
    const pending = this.pending.get(sessionID)
    if (!pending) return
    this.entry(pending, { id, kind: "info", summary: text, state: "done" })
  }

  private entry(pending: Pending, entry: Entry) {
    pending.entries.set(entry.id, entry)
    this.emit(pending)
  }

  private updateEntry(pending: Pending, id: string, patch: Partial<Entry>) {
    const existing = pending.entries.get(id)
    if (!existing) return
    pending.entries.set(id, { ...existing, ...patch })
    this.emit(pending)
  }

  private async collectMedia(pending: Pending, file: string) {
    const target = path.resolve(this.directory, file)
    const info = Bun.file(target)
    if (!(await info.exists().catch(() => false))) return
    if (info.size > MAX_OUTGOING_MEDIA) return
    const type = info.type || ""
    if (!type.startsWith("image/") && !type.startsWith("video/") && !type.startsWith("audio/")) return
    pending.files.push({ uri: target, name: path.basename(target) })
  }

  private emit(pending: Pending) {
    if (!pending.onStatus) return
    const lines = [...pending.entries.values()].map(formatEntry)
    if (pending.live) lines.push(`✍️ ${oneLine(pending.live, 500)}`)
    pending.onStatus({ lines: lines.slice(-14) })
  }

  private finish(pending: Pending, sessionID: string, outcome: Outcome) {
    clearTimeout(pending.timer)
    this.pending.delete(sessionID)
    pending.settle(outcome)
  }
}

function formatEntry(entry: Entry) {
  if (entry.kind === "info") return entry.summary ?? ""
  if (entry.state === "running") return `⚙️ ${entry.name}${entry.summary ? ` · ${entry.summary}` : ""}`
  if (entry.state === "error") return `❌ ${entry.name}${entry.result ? ` · ${entry.result}` : ""}`
  return `✅ ${entry.name}${entry.result ? ` · ${entry.result}` : ""}`
}

function summarize(name: string, input: Record<string, unknown>) {
  if (name === "shell") return oneLine(String(input.command ?? ""), 220)
  for (const key of ["path", "filePath", "file", "pattern", "query", "url", "description", "prompt"]) {
    const value = input[key]
    if (typeof value === "string" && value) return oneLine(value, 160)
  }
  return oneLine(JSON.stringify(input), 160)
}

function toolResult(output: string, metadata?: Record<string, unknown>) {
  const exit = metadata?.exit
  if (typeof exit === "number") return `çıkış ${exit}`
  if (metadata?.status === "running") return "arka planda çalışıyor"
  return output ? oneLine(output, 140) : "tamamlandı"
}

function interruptMessage(reason: string) {
  if (reason === "user") return "İstek durduruldu."
  if (reason === "shutdown") return "Sunucu kapandı."
  if (reason === "superseded") return "Yeni istek önceki isteği devraldı."
  if (reason === "inactivity") return "Oturum zaman aşımına uğradı."
  return `Oturum kesildi (${reason}).`
}

function oneLine(text: string, limit: number) {
  const value = text.replace(/\s+/g, " ").trim()
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function cap(text: string, limit: number) {
  return text.length > limit ? text.slice(text.length - limit) : text
}

export * as SametBridge from "./bridge"
