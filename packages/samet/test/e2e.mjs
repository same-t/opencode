// Sahte Telegram API'si ile uçtan uca köprü testi (gerçek token gerekmez).
import http from "node:http"

process.env.OPENCODE_SAMET_TELEGRAM_API = "http://127.0.0.1:1012"
const { TelegramBot } = await import("../src/telegram.mjs")
const { runOpencode } = await import("../src/opencode.mjs")

const PORT = 1012
const sent = []
let delivered = false
let offset = 0

const server = http.createServer((req, res) => {
  const method = req.url.split("/").pop()
  let body = ""
  req.on("data", (chunk) => (body += chunk))
  req.on("end", () => {
    const payload = body ? JSON.parse(body) : {}
    const ok = (result) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, result }))
    }
    if (method === "getMe") return ok({ id: 1, is_bot: true, username: "samet_test_bot", first_name: "Samet Test" })
    if (method === "deleteWebhook") return ok(true)
    if (method === "sendChatAction") return ok(true)
    if (method === "sendMessage") {
      sent.push(payload)
      return ok({ message_id: sent.length, chat: { id: payload.chat_id }, text: payload.text })
    }
    if (method === "getUpdates") {
      if (payload.offset === -1) return ok([])
      if (payload.timeout === 0) return ok([])
      if (delivered) {
        setTimeout(() => ok([]), 300)
        return
      }
      delivered = true
      offset += 1
      return ok([
        {
          update_id: offset,
          message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 555, type: "private" },
            from: { id: 555, username: "tester" },
            text: "Sadece KOPRU-CALISIYOR yaz.",
          },
        },
      ])
    }
    ok(true)
  })
})

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve))

const bot = new TelegramBot({
  token: "123456:TEST",
  onLog: (level, message) => console.log(`[${level}] ${message}`),
  onOffset: () => {},
})

bot.onMessage = async ({ chatId, text }) => {
  const stopTyping = bot.sendTyping(chatId)
  const result = await runOpencode({
    text,
    opencode: { bin: "", workdir: "", model: "", agent: "", autoApprove: true, timeoutMs: 120000 },
  })
  stopTyping()
  await bot.send(chatId, result.text || `HATA: ${result.errors.join(" | ")}`)
}

await bot.start({ offset: 0 })

const deadline = Date.now() + 120_000
while (Date.now() < deadline && !sent.length) await new Promise((resolve) => setTimeout(resolve, 250))

console.log("GONDERILEN:", JSON.stringify(sent))
const pass = sent.some((message) => String(message.text).includes("KOPRU-CALISIYOR")) && sent.every((m) => m.chat_id === 555)
console.log(pass ? "SONUC: PASS" : "SONUC: FAIL")

await bot.stop()
server.close()
process.exit(pass ? 0 : 1)
