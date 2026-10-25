export type ProxyAddress = {
  readonly url: string
  readonly protocol: "http:" | "https:"
  readonly host: string
  readonly port: number
  readonly username?: string
  readonly password?: string
}

const protocols = new Set(["http:", "https:"])

export function parseProxy(input: string) {
  const value = input.trim()
  if (!value) throw new Error("Proxy adresi boş olamaz.")
  if (value.includes("://")) return parseURL(value)
  return parseCompact(value)
}

export function maskProxy(input?: string) {
  if (!input) return undefined
  try {
    const proxy = parseProxy(input)
    return `${proxy.host}:${proxy.port}${proxy.username ? ` · ${proxy.username}` : ""}`
  } catch {
    return "geçersiz proxy"
  }
}

export function proxyEnvironment(input?: string) {
  if (!input) return undefined
  const proxy = parseProxy(input)
  const noProxy = "127.0.0.1,localhost,::1"
  return {
    HTTP_PROXY: proxy.url,
    HTTPS_PROXY: proxy.url,
    ALL_PROXY: proxy.url,
    http_proxy: proxy.url,
    https_proxy: proxy.url,
    all_proxy: proxy.url,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  }
}

export async function testProxy(input: string) {
  const proxy = parseProxy(input)
  const signal = AbortSignal.timeout(15_000)
  try {
    await fetch("https://api.telegram.org/", { method: "HEAD", proxy: proxy.url, signal })
  } catch (error) {
    throw new Error(`Proxy bağlantısı kurulamadı: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseURL(value: string) {
  const url = new URL(value)
  if (!protocols.has(url.protocol)) throw new Error("Proxy protokolü http veya https olmalı.")
  if (!url.hostname) throw new Error("Proxy sunucusu eksik.")
  const port = parsePort(url.port || (url.protocol === "https:" ? "443" : "80"))
  return {
    url: url.toString(),
    protocol: url.protocol as ProxyAddress["protocol"],
    host: url.hostname,
    port,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  } satisfies ProxyAddress
}

function parseCompact(value: string) {
  const hostEnd = value.startsWith("[") ? value.indexOf("]") + 1 : value.indexOf(":")
  if (hostEnd <= 0) throw new Error("Proxy biçimi ip:port:username:password olmalı.")
  const host = value.startsWith("[") ? value.slice(1, hostEnd - 1) : value.slice(0, hostEnd)
  const rest = value.slice(hostEnd)
  if (!rest.startsWith(":")) throw new Error("Proxy portu eksik.")
  const parts = rest.slice(1).split(":")
  const port = parsePort(parts[0])
  const username = parts[1] || undefined
  const password = parts.length > 2 ? parts.slice(2).join(":") : undefined
  if (!host || /[\s/@]/.test(host)) throw new Error("Proxy sunucusu geçersiz.")
  const auth = username
    ? `${encodeURIComponent(username)}${password !== undefined ? `:${encodeURIComponent(password)}` : ""}@`
    : ""
  return {
    url: `http://${auth}${host.includes(":") ? `[${host}]` : host}:${port}`,
    protocol: "http:" as const,
    host,
    port,
    username,
    password,
  } satisfies ProxyAddress
}

function parsePort(value: string) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Proxy portu 1-65535 arasında olmalı.")
  return port
}
