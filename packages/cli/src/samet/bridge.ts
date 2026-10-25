import { Service, type Endpoint } from "@opencode/client/effect/service"
import { OpenCode, type EventSubscribeOutput } from "@opencode/client/promise"
import { SessionMessage } from "@opencode/schema/session-message"
import { noTimeoutFetch } from "@opencode/util/no-timeout-fetch"
import { errorMessage } from "../util/error"

const PROMPT_TIMEOUT = 15 * 60_000

type Outcome = {
  readonly text?: string
  readonly error?: string
}

type Pending = {
  readonly id: string
  readonly texts: string[]
  started: boolean
  settle: (outcome: Outcome) => void
  timer: ReturnType<typeof setTimeout>
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

  async ask(sessionID: string, text: string) {
    if (this.pending.has(sessionID)) throw new Error("Bu sohbet için hâlâ çalışan bir istek var")
    await this.waitOnline()
    const outcome = new Promise<Outcome>((resolve) => {
      const id = SessionMessage.ID.create()
      const timer = setTimeout(() => {
        this.pending.delete(sessionID)
        void this.client.session.interrupt({ sessionID }).catch(() => {})
        resolve({ error: "İstek zaman aşımına uğradı ve durduruldu." })
      }, PROMPT_TIMEOUT)
      this.pending.set(sessionID, { id, texts: [], started: false, settle: resolve, timer })
    })
    const pending = this.pending.get(sessionID)!
    try {
      await this.client.session.prompt({ sessionID, id: pending.id, text, delivery: "steer" })
    } catch (error) {
      clearTimeout(pending.timer)
      this.pending.delete(sessionID)
      throw error
    }
    const result = await outcome
    if (result.error) throw new Error(result.error)
    return result.text?.trim() || "İşlem tamamlandı, model metin yanıtı döndürmedi."
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
      if (event.data.inboxID === pending.id) pending.started = true
      return
    }
    if (
      event.type === "session.step.started" ||
      event.type === "session.text.started" ||
      event.type === "session.text.ended"
    ) {
      pending.started = true
    }
    if (event.type === "session.text.ended") {
      pending.texts.push(event.data.text)
      return
    }
    if (!pending.started) return
    if (event.type === "session.execution.succeeded") {
      this.finish(pending, event.data.sessionID, { text: pending.texts.join("\n\n") })
      return
    }
    if (event.type === "session.execution.failed") {
      this.finish(pending, event.data.sessionID, { error: event.data.error.message })
      return
    }
    if (event.type === "session.execution.interrupted") {
      this.finish(pending, event.data.sessionID, {
        error: event.data.reason === "user" ? "İstek durduruldu." : `Oturum kesildi (${event.data.reason}).`,
      })
    }
  }

  private finish(pending: Pending, sessionID: string, outcome: Outcome) {
    clearTimeout(pending.timer)
    this.pending.delete(sessionID)
    pending.settle(outcome)
  }
}

export * as SametBridge from "./bridge"
