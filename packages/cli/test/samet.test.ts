import { expect, test } from "bun:test"
import { Access } from "../src/samet/auth"
import { maskProxy, parseProxy, proxyEnvironment } from "../src/samet/proxy"
import { splitMessage } from "../src/samet/telegram"

test("splitMessage leaves short text intact", () => {
  expect(splitMessage("merhaba")).toEqual(["merhaba"])
})

test("splitMessage preserves every character across chunks", () => {
  const text = Array.from({ length: 200 }, (_, index) => `satır ${index} ${"x".repeat(40)}`).join("\n")
  const chunks = splitMessage(text, 500)
  expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true)
  expect(chunks.join("")).toBe(text)
})

test("splitMessage prefers a newline near the limit", () => {
  const chunks = splitMessage(`${"a".repeat(80)}\n${"b".repeat(80)}`, 100)
  expect(chunks).toEqual([`${"a".repeat(80)}\n`, "b".repeat(80)])
})

test("parseProxy reads the compact ip:port:username:password form", () => {
  expect(parseProxy("10.0.0.5:8080:ali:sifre")).toEqual({
    url: "http://ali:sifre@10.0.0.5:8080",
    protocol: "http:",
    host: "10.0.0.5",
    port: 8080,
    username: "ali",
    password: "sifre",
  })
})

test("parseProxy keeps every colon after the username", () => {
  const proxy = parseProxy("proxy.local:3128:user:pa:ss:word")
  expect(proxy.password).toBe("pa:ss:word")
  expect(proxy.url).toBe("http://user:pa%3Ass%3Aword@proxy.local:3128")
})

test("parseProxy accepts URL form and decodes credentials", () => {
  const proxy = parseProxy("http://ali:sifre@127.0.0.1:8888")
  expect(proxy.host).toBe("127.0.0.1")
  expect(proxy.port).toBe(8888)
  expect(proxy.username).toBe("ali")
  expect(proxy.password).toBe("sifre")
})

test("parseProxy rejects bad input", () => {
  expect(() => parseProxy("")).toThrow()
  expect(() => parseProxy("127.0.0.1")).toThrow()
  expect(() => parseProxy("127.0.0.1:0")).toThrow()
  expect(() => parseProxy("socks5://127.0.0.1:1080")).toThrow()
})

test("maskProxy hides the password", () => {
  expect(maskProxy("10.0.0.5:8080:ali:sifre")).toBe("10.0.0.5:8080 · ali")
  expect(maskProxy(undefined)).toBeUndefined()
})

test("proxyEnvironment applies the proxy without intercepting loopback", () => {
  const env = proxyEnvironment("10.0.0.5:8080:ali:sifre")
  expect(env?.HTTP_PROXY).toBe("http://ali:sifre@10.0.0.5:8080")
  expect(env?.HTTPS_PROXY).toBe(env?.HTTP_PROXY)
  expect(env?.NO_PROXY).toContain("127.0.0.1")
  expect(proxyEnvironment(undefined)).toBeUndefined()
})

test("Access checks the password without leaking length differences", () => {
  const access = new Access("samet123")
  expect(access.verify("samet123")).toBe(true)
  expect(access.verify("samet124")).toBe(false)
  expect(access.verify("samet1")).toBe(false)
  expect(access.verify("")).toBe(false)
  expect(access.verify(123)).toBe(false)
})

test("Access issues a session cookie that authorizes and logs out", () => {
  const access = new Access("samet123")
  const token = access.issue()
  const cookie = access.cookie(token)
  expect(cookie).toContain("HttpOnly")
  expect(cookie).toContain("SameSite=Strict")
  expect(cookie).toContain("Path=/")
  expect(access.authorized(cookie)).toBe(true)
  expect(access.authorized("samet_session=yanlis")).toBe(false)
  expect(access.authorized(undefined)).toBe(false)
  access.logout(cookie)
  expect(access.authorized(cookie)).toBe(false)
})

test("Access rejects an expired session", () => {
  let now = 1_000
  const access = new Access("samet123", () => now)
  const cookie = access.cookie(access.issue())
  expect(access.authorized(cookie)).toBe(true)
  now += 7 * 24 * 60 * 60 * 1_000 + 1
  expect(access.authorized(cookie)).toBe(false)
})
