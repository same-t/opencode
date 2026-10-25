import { Global } from "@opencode/util/global"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type ChatSession = {
  readonly sessionID: string
  readonly directory: string
  readonly title?: string
  readonly updatedAt: number
}

export type Settings = {
  readonly enabled: boolean
  readonly token?: string
  readonly proxy?: string
  readonly model?: string
  readonly sessions: Record<string, ChatSession>
}

export type SettingsPatch = {
  readonly enabled?: boolean
  readonly token?: string | null
  readonly proxy?: string | null
  readonly model?: string | null
}

const empty = (): Settings => ({ enabled: false, sessions: {} })

export class Store {
  readonly file: string
  private settings: Settings = empty()
  private writing: Promise<void> = Promise.resolve()

  constructor(directory = configDirectory()) {
    this.file = path.join(directory, "samet.json")
  }

  get current() {
    return this.settings
  }

  async load() {
    const text = await Bun.file(this.file)
      .text()
      .catch(() => undefined)
    if (!text) return this.settings
    const parsed = parse(text)
    if (parsed === undefined) return this.settings
    this.settings = {
      enabled: parsed.enabled === true,
      token: typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : undefined,
      proxy: typeof parsed.proxy === "string" && parsed.proxy.length > 0 ? parsed.proxy : undefined,
      model: typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : undefined,
      sessions: parsed.sessions ?? {},
    }
    return this.settings
  }

  update(patch: SettingsPatch) {
    this.settings = {
      ...this.settings,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...("token" in patch ? { token: patch.token ?? undefined } : {}),
      ...("proxy" in patch ? { proxy: patch.proxy ?? undefined } : {}),
      ...("model" in patch ? { model: patch.model ?? undefined } : {}),
    }
    return this.save()
  }

  remember(chatID: string, session: ChatSession) {
    this.settings = {
      ...this.settings,
      sessions: { ...this.settings.sessions, [chatID]: session },
    }
    return this.save()
  }

  private save() {
    this.writing = this.writing.then(async () => {
      const temporary = `${this.file}.${process.pid}.tmp`
      await Bun.write(temporary, JSON.stringify(this.settings, null, 2))
      await fs.promises.chmod(temporary, 0o600).catch(() => {})
      await fs.promises.rename(temporary, this.file)
    })
    return this.writing
  }
}

export function configDirectory() {
  return process.env.OPENCODE_CONFIG_DIR ?? Global.Path.config ?? path.join(os.homedir(), ".config", "opencode")
}

export function maskToken(token?: string) {
  if (!token) return undefined
  if (token.length <= 10) return "••••••"
  return `${token.slice(0, 4)}••••${token.slice(-4)}`
}

function parse(text: string) {
  try {
    return JSON.parse(text) as Partial<Settings>
  } catch {
    return undefined
  }
}
