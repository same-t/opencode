#!/usr/bin/env node

// Launcher for the Telegram bridge. A source checkout runs the TypeScript CLI with
// Bun so local changes apply; an installed package delegates to the opencode binary
// with the `samet` subcommand prepended.
const childProcess = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const source = path.join(__dirname, "..", "src", "index.ts")
if (fs.existsSync(source) && !process.env.OPENCODE_BIN_PATH) {
  const directory = process.cwd()
  const cli = path.join(__dirname, "..")
  const child = childProcess.spawn(bunBinary(), [`--cwd=${cli}`, source, "samet", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, OPENCODE_SAMET_DIRECTORY: directory },
  })
  child.on("error", (error) => {
    console.error(error.message)
    process.exit(1)
  })
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {}
    })
  }
  child.on("exit", (code) => process.exit(typeof code === "number" ? code : 0))
} else {
  process.argv.splice(2, 0, "samet")
  require("./opencode.cjs")
}

function bunBinary() {
  const executable = process.platform === "win32" ? "bun.exe" : "bun"
  const candidates = [
    process.env.OPENCODE_BUN_PATH,
    process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, "bin", executable) : undefined,
    path.join(os.homedir(), ".bun", "bin", executable),
    process.platform === "win32" && process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", executable)
      : undefined,
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return executable
}
