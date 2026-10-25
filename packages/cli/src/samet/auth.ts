import { randomBytes, timingSafeEqual } from "node:crypto"

export const DEFAULT_PASSWORD = "samet123"

const COOKIE = "samet_session"
const TTL = 7 * 24 * 60 * 60 * 1_000
const MAX_PASSWORD = 256

export class Access {
  private readonly sessions = new Map<string, number>()

  constructor(
    private readonly password: string,
    private readonly now = () => Date.now(),
  ) {}

  verify(input: unknown) {
    if (typeof input !== "string" || input.length === 0 || input.length > MAX_PASSWORD) return false
    const expected = Buffer.from(this.password)
    const actual = Buffer.from(input)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  issue() {
    this.prune()
    const token = randomBytes(32).toString("hex")
    this.sessions.set(token, this.now() + TTL)
    return token
  }

  authorized(header: string | null | undefined) {
    const token = readCookie(header)
    if (!token) return false
    const expires = this.sessions.get(token)
    if (expires === undefined) return false
    if (expires <= this.now()) {
      this.sessions.delete(token)
      return false
    }
    return true
  }

  logout(header: string | null | undefined) {
    const token = readCookie(header)
    if (token) this.sessions.delete(token)
  }

  cookie(token: string) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL / 1_000}`
  }

  clear() {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  }

  private prune() {
    const now = this.now()
    for (const [token, expires] of this.sessions) if (expires <= now) this.sessions.delete(token)
  }
}

function readCookie(header: string | null | undefined) {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim()
  }
  return undefined
}
