import fs from "node:fs"
import path from "node:path"

const CHECK_INTERVAL = 60_000
const GIT_TIMEOUT = 30_000
const PULL_TIMEOUT = 180_000
const INSTALL_TIMEOUT = 300_000

export type UpdateStatus = {
  readonly source: boolean
  readonly repo?: string
  readonly repoURL?: string
  readonly branch?: string
  readonly current?: { readonly commit: string; readonly subject: string; readonly date: string }
  readonly remote?: { readonly commit: string; readonly subject: string; readonly date: string }
  readonly behind: number
  readonly ahead: number
  readonly available: boolean
  readonly dirty: boolean
  readonly checkedAt: number
  readonly error?: string
}

export type UpdateResult = UpdateStatus & {
  readonly updated: boolean
  readonly previous?: string
}

let cached: UpdateStatus | undefined
let cachedAt = 0
let pending: Promise<UpdateStatus> | undefined

export async function checkUpdate(force = false, proxy?: Record<string, string>): Promise<UpdateStatus> {
  if (!force && cached && Date.now() - cachedAt < CHECK_INTERVAL) return cached
  if (pending) return pending
  pending = readUpdate(force, proxy).finally(() => {
    pending = undefined
  })
  return pending
}

export async function applyUpdate(proxy?: Record<string, string>): Promise<UpdateResult> {
  const status = await checkUpdate(true, proxy)
  if (!status.source) throw new Error(status.error ?? "Güncelleme için git deposu bulunamadı.")
  if (status.error) throw new Error(status.error)
  if (!status.available) return { ...status, updated: false }
  if (status.dirty) throw new Error("Çalışma ağacında kaydedilmemiş değişiklikler var. Önce commit veya stash yap.")

  const root = repository()
  if (!root) throw new Error("Git deposu bulunamadı.")
  const previous = status.current?.commit
  const pulled = await run(["git", "-C", root, "pull", "--ff-only", "origin", status.branch ?? "dev"], {
    timeout: PULL_TIMEOUT,
    env: proxy,
  })
  if (pulled.code !== 0) throw new Error(gitError("Güncelleme alınamadı", pulled))

  const changed = await run(["git", "-C", root, "diff", "--name-only", "HEAD@{1}", "HEAD"], { env: proxy })
  if (changed.code === 0 && changed.stdout.split("\n").includes("bun.lock")) {
    const installed = await run([bunCommand(), "install"], {
      timeout: INSTALL_TIMEOUT,
      cwd: root,
      env: proxy,
    })
    if (installed.code !== 0) throw new Error(gitError("Bağımlılıklar kurulamadı", installed))
  }

  cached = undefined
  const next = await checkUpdate(true, proxy)
  return { ...next, updated: true, previous }
}

async function readUpdate(force: boolean, proxy?: Record<string, string>): Promise<UpdateStatus> {
  const checkedAt = Date.now()
  const root = repository()
  if (!root) {
    cached = {
      source: false,
      behind: 0,
      ahead: 0,
      available: false,
      dirty: false,
      checkedAt,
      error: "Bu kurulum bir git deposundan çalışmıyor.",
    }
    cachedAt = checkedAt
    return cached
  }

  const remote = await run(["git", "-C", root, "remote", "get-url", "origin"], { env: proxy })
  if (remote.code !== 0) {
    cached = {
      source: true,
      behind: 0,
      ahead: 0,
      available: false,
      dirty: false,
      checkedAt,
      error: gitError("Git remote okunamadı", remote),
    }
    cachedAt = checkedAt
    return cached
  }

  const info = parseRemote(remote.stdout)
  const branchResult = await run(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { env: proxy })
  const branch = branchResult.stdout || "dev"
  const current = await describe(root, "HEAD", proxy)
  const dirtyResult = await run(["git", "-C", root, "status", "--porcelain"], { env: proxy })
  const base = {
    source: true,
    repo: info?.repo,
    repoURL: info?.url,
    branch,
    current,
    behind: 0,
    ahead: 0,
    available: false,
    dirty: dirtyResult.stdout.length > 0,
    checkedAt,
  } satisfies UpdateStatus

  if (force) {
    const fetched = await run(["git", "-C", root, "fetch", "--quiet", "origin", branch], {
      timeout: GIT_TIMEOUT,
      env: proxy,
    })
    if (fetched.code !== 0) {
      cached = { ...base, error: gitError("GitHub'dan güncelleme kontrol edilemedi", fetched) }
      cachedAt = checkedAt
      return cached
    }
  }

  const tracking = `origin/${branch}`
  const remoteDescription = await describe(root, tracking, proxy)
  const counts = await run(["git", "-C", root, "rev-list", "--left-right", "--count", `HEAD...${tracking}`], {
    env: proxy,
  })
  if (counts.code !== 0) {
    cached = { ...base, error: gitError("Sürüm karşılaştırılamadı", counts) }
    cachedAt = checkedAt
    return cached
  }
  const [ahead, behind] = counts.stdout.split(/\s+/).map(Number)
  cached = {
    ...base,
    remote: remoteDescription,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    available: Number.isFinite(behind) && behind > 0,
  }
  cachedAt = checkedAt
  return cached
}

async function describe(root: string, ref: string, proxy?: Record<string, string>) {
  const result = await run(["git", "-C", root, "log", "-1", "--format=%h%x00%s%x00%cs", ref], { env: proxy })
  if (result.code !== 0) return undefined
  const [commit, subject, date] = result.stdout.split("\u0000")
  return { commit: commit ?? "", subject: subject ?? "", date: date ?? "" }
}

export function repository() {
  const start = path.resolve(import.meta.dir, "../../../..")
  const candidates = [start, process.cwd()]
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, ".git"))) ?? undefined
}

function parseRemote(remote: string) {
  const value = remote.trim()
  const match = /^(?:git@|ssh:\/\/git@|https?:\/\/)([^/:]+)[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(value)
  if (!match) return undefined
  const host = match[1]
  const repo = match[2]
  return { repo, url: `https://${host}/${repo}` }
}

function bunCommand() {
  const runtime = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase()
  return runtime === "bun" ? process.execPath : "bun"
}

function gitError(message: string, result: { stderr: string; code: number }) {
  const detail = result.stderr.split("\n").find((line) => line.trim())
  return detail ? `${message}: ${detail}` : `${message} (çıkış kodu ${result.code}).`
}

type RunOptions = {
  readonly cwd?: string
  readonly timeout?: number
  readonly env?: Record<string, string>
}

async function run(command: string[], options: RunOptions = {}) {
  const proc = spawn(command, options)
  if (!proc)
    return {
      code: -1,
      stdout: "",
      stderr: "Komut başlatılamadı.",
    }
  const timer = options.timeout ? setTimeout(() => proc.kill(), options.timeout) : undefined
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (timer) clearTimeout(timer)
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

function spawn(command: string[], options: RunOptions) {
  try {
    return Bun.spawn(command, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        ...options.env,
      },
    })
  } catch {
    return undefined
  }
}
