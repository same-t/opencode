import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

const isWindows = process.platform === "win32"

function exists(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve the real opencode executable. Preferring a real binary over the
 * npm .cmd/.ps1 shims keeps argv handling safe on Windows (no shell involved,
 * so message text can contain quotes, &, %, etc. without being mangled).
 */
export function resolveOpencodeBin(configured) {
  const configuredValue = (configured || "").trim()
  if (configuredValue) {
    if (path.isAbsolute(configuredValue) || configuredValue.includes(path.sep)) {
      if (exists(configuredValue)) return { bin: configuredValue, source: "config" }
    } else {
      return { bin: configuredValue, source: "config", needsShell: isWindows && /\.(cmd|bat)$/i.test(configuredValue) }
    }
  }

  const candidates = []
  if (isWindows) {
    const appData = process.env.APPDATA
    const localAppData = process.env.LOCALAPPDATA
    if (appData) candidates.push(path.join(appData, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe"))
    if (localAppData) {
      candidates.push(path.join(localAppData, "opencode", "bin", "opencode.exe"))
      candidates.push(path.join(localAppData, "Programs", "opencode", "opencode.exe"))
    }
    if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, ".opencode", "bin", "opencode.exe"))
  } else {
    const home = process.env.HOME || ""
    if (home) candidates.push(path.join(home, ".opencode", "bin", "opencode"))
    candidates.push("/usr/local/bin/opencode", "/usr/bin/opencode", "/opt/homebrew/bin/opencode")
  }

  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return { bin: candidate, source: "detected" }
  }

  return { bin: isWindows ? "opencode.cmd" : "opencode", source: "fallback", needsShell: isWindows }
}

export function ensureWorkdir(dir) {
  const target = dir && dir.trim() ? dir.trim() : path.join(process.env.USERPROFILE || process.cwd(), ".opencode-samet", "workspace")
  fs.mkdirSync(target, { recursive: true })
  return target
}

export function buildArgs({ text, sessionID, opencode }) {
  const args = ["run", "--standalone", "--format", "json"]
  if (sessionID) args.push("--session", sessionID)
  if (opencode.model && opencode.model.trim()) args.push("--model", opencode.model.trim())
  if (opencode.agent && opencode.agent.trim()) args.push("--agent", opencode.agent.trim())
  if (opencode.autoApprove) args.push("--auto")
  // Everything after "--" is treated as the literal message by the CLI.
  args.push("--", text)
  return args
}

/**
 * Runs one prompt through the opencode CLI and collects the assistant text.
 * Returns { ok, text, sessionID, tools, errors }.
 */
export function runOpencode({ text, sessionID, opencode, onLog, onTool }) {
  const resolved = resolveOpencodeBin(opencode.bin)
  const cwd = ensureWorkdir(opencode.workdir)
  const args = buildArgs({ text, sessionID, opencode })
  const timeoutMs = Number(opencode.timeoutMs) > 0 ? Number(opencode.timeoutMs) : 15 * 60 * 1000

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(resolved.bin, args, {
        cwd,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: process.env.CI ?? "" },
        windowsHide: true,
        shell: Boolean(resolved.needsShell),
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch (error) {
      resolve({ ok: false, text: "", sessionID, tools: [], errors: [error.message] })
      return
    }

    const texts = new Map()
    const tools = []
    const errors = []
    let activeSession = sessionID
    let stderr = ""
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill("SIGTERM")
        setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {}
        }, 5000)
      } catch {}
    }, timeoutMs)

    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const body = [...texts.values()].join("\n\n").trim()
      if (timedOut) errors.push(`Zaman aşımı (${Math.round(timeoutMs / 1000)} sn)`)
      if (!body && !errors.length && code !== 0) {
        errors.push(stderr.trim().split("\n").slice(-6).join("\n") || `opencode çıkış kodu ${code}`)
      }
      resolve({ ok: !timedOut && (code === 0 || Boolean(body)), text: body, sessionID: activeSession, tools, errors })
    }

    const rl = readline.createInterface({ input: child.stdout })
    rl.on("line", (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let event
      try {
        event = JSON.parse(trimmed)
      } catch {
        onLog?.("debug", `opencode: ${trimmed.slice(0, 400)}`)
        return
      }
      if (event.sessionID) activeSession = event.sessionID
      if (event.type === "text" && event.part?.text) {
        texts.set(event.part.id ?? String(texts.size), event.part.text)
      } else if (event.type === "tool_use" && event.part) {
        const part = event.part
        const name = part.tool ?? part.name ?? "tool"
        if (part.state?.status === "completed" || part.state?.status === "error" || !part.state) {
          tools.push(name)
          onTool?.(name)
        }
      } else if (event.type === "error") {
        const message = event.error?.message ?? event.error?.data?.message
        if (message) errors.push(String(message))
        onLog?.("error", `opencode hata: ${message ?? "bilinmeyen hata"}`)
      }
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
    })

    child.on("error", (error) => {
      errors.push(error.message)
      finish(1)
    })
    child.on("close", (code) => finish(code ?? 0))
  })
}
