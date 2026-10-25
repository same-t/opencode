import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const HOME_DIR = path.join(os.homedir(), ".opencode-samet")
export const CONFIG_PATH = path.join(HOME_DIR, "config.json")
export const STATE_PATH = path.join(HOME_DIR, "state.json")
export const LOG_PATH = path.join(HOME_DIR, "samet.log")

export function defaultConfig() {
  return {
    telegram: {
      enabled: false,
      token: "",
      allowedChatIds: [],
    },
    opencode: {
      bin: "",
      workdir: path.join(HOME_DIR, "workspace"),
      model: "",
      agent: "",
      autoApprove: true,
      timeoutMs: 15 * 60 * 1000,
    },
  }
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return fallback
  }
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8")
  fs.renameSync(tmp, file)
}

function merge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (current && typeof current === "object" && !Array.isArray(current) && value && typeof value === "object" && !Array.isArray(value))
      out[key] = merge(current, value)
    else if (value !== undefined) out[key] = value
  }
  return out
}

export function loadConfig() {
  return merge(defaultConfig(), readJSON(CONFIG_PATH, {}))
}

export function saveConfig(config) {
  writeJSON(CONFIG_PATH, config)
  return config
}

export function loadState() {
  return merge({ sessions: {}, offset: 0 }, readJSON(STATE_PATH, {}))
}

export function saveState(state) {
  try {
    writeJSON(STATE_PATH, state)
  } catch {
    // state is best-effort: never break the bridge because of a disk hiccup
  }
}

export function maskToken(token) {
  if (!token) return ""
  if (token.length <= 8) return "•".repeat(token.length)
  return `${token.slice(0, 4)}${"•".repeat(Math.min(24, token.length - 8))}${token.slice(-4)}`
}
