#!/usr/bin/env node
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig, saveConfig, loadState, saveState, maskToken, HOME_DIR, LOG_PATH } from "./config.mjs"
import { resolveOpencodeBin, runOpencode } from "./opencode.mjs"
import { TelegramBot } from "./telegram.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETUP_HTML = path.join(__dirname, "setup.html")
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
})()

// ---------------------------------------------------------------- cli args ---
function readArgs(argv) {
  const options = { port: Number(process.env.PORT) || 1010, host: process.env.HOST || "127.0.0.1", help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--port" || arg === "-p") options.port = Number(argv[++i]) || options.port
    else if (arg.startsWith("--port=")) options.port = Number(arg.slice(7)) || options.port
    else if (arg === "--host") options.host = argv[++i] || options.host
    else if (arg.startsWith("--host=")) options.host = arg.slice(7) || options.host
    else if (arg === "--help" || arg === "-h") options.help = true
  }
  return options
}

const options = readArgs(process.argv.slice(2))
if (options.help) {
  console.log(`
opencode-samet — Telegram ↔ OpenCode köprüsü

Kullanım:
  opencode-samet [--port 1010] [--host 127.0.0.1]

Seçenekler:
  -p, --port   Kurulum arayüzünün portu (varsayılan: 1010)
      --host   Dinlenecek adres (varsayılan: 127.0.0.1)
  -h, --help   Bu yardımı göster

Arayüz: http://127.0.0.1:1010
Ayarlar: ${path.join(HOME_DIR, "config.json")}
`)
  process.exit(0)
}

// ------------------------------------------------------------------- state ---
let config = loadConfig()
const state = loadState()
/** @type {TelegramBot | null} */
let bot = null
let lastTelegramError = null
const logs = []
const sseClients = new Set()

function log(level, message) {
  const entry = { time: new Date().toISOString(), level, message: String(message) }
  logs.push(entry)
  if (logs.length > 500) logs.shift()
  const line = `[${entry.time}] ${level.toUpperCase()} ${entry.message}`
  if (level === "error") console.error(line)
  else console.log(line)
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, line + "\n")
  } catch {}
  const payload = `event: log\ndata: ${JSON.stringify(entry)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(payload)
    } catch {
      sseClients.delete(client)
    }
  }
}

function allowedChatIds() {
  return (config.telegram.allowedChatIds ?? []).map(String).filter(Boolean)
}

function publicState() {
  const resolved = resolveOpencodeBin(config.opencode.bin)
  return {
    ok: true,
    server: { port: options.port, host: options.host, version: VERSION, home: HOME_DIR },
    telegram: {
      enabled: Boolean(config.telegram.enabled),
      connected: Boolean(bot?.running),
      botUsername: bot?.me?.username ?? null,
      botName: bot?.me?.first_name ?? null,
      hasToken: Boolean(config.telegram.token),
      tokenHint: maskToken(config.telegram.token),
      allowedChatIds: allowedChatIds(),
      lastError: lastTelegramError,
    },
    opencode: {
      bin: config.opencode.bin,
      resolvedBin: resolved.bin,
      binSource: resolved.source,
      workdir: config.opencode.workdir,
      model: config.opencode.model,
      agent: config.opencode.agent,
      autoApprove: Boolean(config.opencode.autoApprove),
    },
    sessions: Object.keys(state.sessions ?? {}).length,
    logs: logs.slice(-200),
  }
}

// ------------------------------------------------------------------- bot -----
async function stopBot() {
  if (!bot) return
  try {
    await bot.stop()
    log("info", "Telegram botu durduruldu.")
  } catch (error) {
    log("warn", `Bot durdurulurken hata: ${error.message}`)
  }
  bot = null
}

async function startBot({ token } = {}) {
  const activeToken = (token ?? config.telegram.token ?? "").trim()
  if (!activeToken) throw new Error("Telegram bot token'ı gerekli (BotFather'dan alabilirsin).")
  await stopBot()
  const instance = new TelegramBot({
    token: activeToken,
    onLog: log,
    onOffset: (offset) => {
      state.offset = offset
      saveState(state)
    },
  })
  instance.onMessage = handleTelegramMessage
  const me = await instance.start({ offset: state.offset })
  bot = instance
  lastTelegramError = null
  return me
}

function helpText() {
  return [
    "opencode-samet komutları:",
    "/start   — bağlantı bilgisi",
    "/id      — bu sohbetin kimliği",
    "/new     — yeni oturum başlat",
    "/status  — model, klasör ve oturum bilgisi",
    "/help    — bu mesaj",
    "",
    "Bunlar dışındaki her mesaj opencode'a iletilir.",
  ].join("\n")
}

async function handleTelegramMessage({ chatId, text, bot: instance }) {
  const allowed = allowedChatIds()
  if (allowed.length && !allowed.includes(String(chatId))) {
    log("warn", `Yetkisiz sohbet engellendi: ${chatId}`)
    await instance.send(chatId, "Bu botu kullanma yetkiniz yok.")
    return
  }

  const command = text.split(/\s+/)[0].toLowerCase()
  if (command === "/start") {
    await instance.send(
      chatId,
      `Merhaba! OpenCode köprüsü hazır.\n\nSohbet kimliği: ${chatId}\nKlasör: ${config.opencode.workdir}\n\n${helpText()}`,
    )
    return
  }
  if (command === "/id") {
    await instance.send(chatId, `Sohbet kimliği: ${chatId}`)
    return
  }
  if (command === "/help") {
    await instance.send(chatId, helpText())
    return
  }
  if (command === "/new" || command === "/reset") {
    delete state.sessions[chatId]
    saveState(state)
    await instance.send(chatId, "Yeni oturum açıldı. Sonraki mesaj temiz bir bağlamla başlayacak.")
    return
  }
  if (command === "/status") {
    const session = state.sessions[chatId]
    await instance.send(
      chatId,
      [
        `Model: ${config.opencode.model || "varsayılan"}`,
        `Agent: ${config.opencode.agent || "varsayılan"}`,
        `Klasör: ${config.opencode.workdir}`,
        `Oturum: ${session || "yok (sonraki mesajda açılacak)"}`,
        `Otomatik onay: ${config.opencode.autoApprove ? "açık" : "kapalı"}`,
        `Bot: @${instance.me?.username ?? "?"}`,
      ].join("\n"),
    )
    return
  }
  if (command.startsWith("/") && !command.includes("@")) {
    await instance.send(chatId, `Bilinmeyen komut: ${command}\n\n${helpText()}`)
    return
  }

  log("info", `Mesaj alındı (sohbet ${chatId}, ${text.length} karakter)`)
  const stopTyping = instance.sendTyping(chatId)
  const started = Date.now()
  let result
  try {
    result = await runOpencode({
      text,
      sessionID: state.sessions[chatId],
      opencode: config.opencode,
      onLog: log,
      onTool: (name) => log("debug", `araç: ${name}`),
    })
  } finally {
    stopTyping()
  }

  if (result.sessionID && result.sessionID !== state.sessions[chatId]) {
    state.sessions[chatId] = result.sessionID
    saveState(state)
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  log("info", `Yanıt hazır (${seconds} sn, ${result.text.length} karakter)`)

  if (result.text) {
    await instance.send(chatId, result.text)
    return
  }
  if (result.errors.length) {
    await instance.send(chatId, `⚠️ İşlem tamamlanamadı:\n\n${result.errors.slice(0, 3).join("\n")}`)
    return
  }
  await instance.send(chatId, "Yanıt üretilemedi. Model yapılandırmasını kontrol et.")
}

// ------------------------------------------------------------------- http ----
function sendJSON(response, status, body) {
  const data = JSON.stringify(body)
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(data)
}

function readBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on("data", (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error("İstek gövdesi çok büyük"))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      } catch {
        reject(new Error("Geçersiz JSON gövdesi"))
      }
    })
    request.on("error", reject)
  })
}

function parseChatIds(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === "string")
    return value
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  return []
}

async function handleConfig(request, response) {
  const body = await readBody(request)
  const previous = config

  const next = {
    telegram: { ...previous.telegram },
    opencode: { ...previous.opencode },
  }
  if (typeof body.botToken === "string" && body.botToken.trim()) next.telegram.token = body.botToken.trim()
  if (body.allowedChatIds !== undefined) next.telegram.allowedChatIds = parseChatIds(body.allowedChatIds)
  if (typeof body.workdir === "string" && body.workdir.trim()) next.opencode.workdir = body.workdir.trim()
  if (typeof body.model === "string") next.opencode.model = body.model.trim()
  if (typeof body.agent === "string") next.opencode.agent = body.agent.trim()
  if (typeof body.autoApprove === "boolean") next.opencode.autoApprove = body.autoApprove

  const enable = Boolean(body.telegramEnabled)
  let message = "Ayarlar kaydedildi."
  let status = 200

  if (enable) {
    if (!next.telegram.token.trim()) {
      return sendJSON(response, 400, { ok: false, error: "Telegram'ı açmak için bot token'ı girmelisin." })
    }
    try {
      next.telegram.enabled = true
      config = saveConfig(next)
      const me = await startBot()
      message = `Telegram bağlandı: @${me.username}`
    } catch (error) {
      lastTelegramError = error.message
      config.telegram.enabled = false
      saveConfig(config)
      log("error", `Telegram başlatılamadı: ${error.message}`)
      return sendJSON(response, 400, { ok: false, error: error.message, state: publicState() })
    }
  } else {
    next.telegram.enabled = false
    config = saveConfig(next)
    await stopBot()
    message = "Telegram kapatıldı. Ayarlar kaydedildi."
  }

  log("info", message)
  sendJSON(response, status, { ok: true, message, state: publicState() })
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
  const route = url.pathname

  try {
    if (request.method === "GET" && (route === "/" || route === "/setup")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
      response.end(fs.readFileSync(SETUP_HTML))
      return
    }

    if (request.method === "GET" && route === "/api/state") {
      sendJSON(response, 200, publicState())
      return
    }

    if (request.method === "GET" && route === "/api/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      })
      response.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`)
      sseClients.add(response)
      const heartbeat = setInterval(() => {
        try {
          response.write(": ping\n\n")
        } catch {}
      }, 15_000)
      request.on("close", () => {
        clearInterval(heartbeat)
        sseClients.delete(response)
      })
      return
    }

    if (request.method === "POST" && route === "/api/config") {
      await handleConfig(request, response)
      return
    }

    if (request.method === "POST" && route === "/api/telegram/validate") {
      const body = await readBody(request)
      const token = String(body.token ?? config.telegram.token ?? "").trim()
      if (!token) return sendJSON(response, 400, { ok: false, error: "Token boş." })
      const probe = new TelegramBot({ token })
      try {
        const me = await probe.getMe()
        return sendJSON(response, 200, { ok: true, username: me.username, name: me.first_name, id: me.id })
      } catch (error) {
        return sendJSON(response, 400, { ok: false, error: error.message })
      }
    }

    if (request.method === "POST" && route === "/api/telegram/start") {
      try {
        config.telegram.enabled = true
        config = saveConfig(config)
        const me = await startBot()
        return sendJSON(response, 200, { ok: true, message: `Bağlandı: @${me.username}`, state: publicState() })
      } catch (error) {
        lastTelegramError = error.message
        config.telegram.enabled = false
        saveConfig(config)
        log("error", `Telegram başlatılamadı: ${error.message}`)
        return sendJSON(response, 400, { ok: false, error: error.message, state: publicState() })
      }
    }

    if (request.method === "POST" && route === "/api/telegram/stop") {
      config.telegram.enabled = false
      config = saveConfig(config)
      await stopBot()
      log("info", "Telegram kapatıldı.")
      return sendJSON(response, 200, { ok: true, message: "Telegram kapatıldı.", state: publicState() })
    }

    if (request.method === "POST" && route === "/api/session/reset") {
      const body = await readBody(request)
      const chatId = String(body.chatId ?? "").trim()
      if (chatId) delete state.sessions[chatId]
      else state.sessions = {}
      saveState(state)
      return sendJSON(response, 200, { ok: true, message: "Oturumlar sıfırlandı.", state: publicState() })
    }

    if (route === "/health") {
      return sendJSON(response, 200, { ok: true, version: VERSION })
    }

    sendJSON(response, 404, { ok: false, error: "Bulunamadı" })
  } catch (error) {
    log("error", `HTTP ${route}: ${error.message}`)
    if (!response.headersSent) sendJSON(response, 500, { ok: false, error: error.message })
    else response.end()
  }
})

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\nHata: ${options.port} portu zaten kullanımda. Başka bir port dene: opencode-samet --port 1011\n`)
  } else {
    console.error(`\nSunucu hatası: ${error.message}\n`)
  }
  process.exit(1)
})

server.listen(options.port, options.host, async () => {
  const resolved = resolveOpencodeBin(config.opencode.bin)
  console.log("")
  console.log("  opencode-samet")
  console.log(`  Kurulum arayüzü : http://${options.host}:${options.port}`)
  console.log(`  opencode        : ${resolved.bin} (${resolved.source})`)
  console.log(`  Ayarlar         : ${path.join(HOME_DIR, "config.json")}`)
  console.log("")
  log("info", `Sunucu hazır: http://${options.host}:${options.port}`)

  if (config.telegram.enabled && config.telegram.token) {
    try {
      const me = await startBot()
      console.log(`  Telegram        : @${me.username} bağlı\n`)
    } catch (error) {
      lastTelegramError = error.message
      log("error", `Telegram başlatılamadı: ${error.message}`)
    }
  } else {
    console.log("  Telegram        : kapalı (arayüzden aç)\n")
  }
})

async function shutdown(signal) {
  log("info", `${signal} alındı, kapatılıyor...`)
  await stopBot()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
