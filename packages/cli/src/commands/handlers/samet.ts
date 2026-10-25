import { Effect, Option } from "effect"
import path from "node:path"
import { Commands, Server } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Standalone } from "../../services/standalone"
import { ServerConnection } from "../../services/server-connection"
import { OPENCODE_VERSION } from "../../version"
import { errorMessage } from "../../util/error"
import { selfCommand } from "../../util/process"

export default Runtime.handler(
  Commands.commands.samet,
  Effect.fnUntraced(function* (input) {
    const port = Option.getOrUndefined(input.port) ?? 1010
    const directory = path.resolve(
      Option.getOrUndefined(input.directory) ?? process.env.OPENCODE_SAMET_DIRECTORY ?? process.cwd(),
    )
    const { Store } = yield* Effect.promise(() => import("../../samet/config"))
    const { proxyEnvironment } = yield* Effect.promise(() => import("../../samet/proxy"))
    const store = new Store()
    yield* Effect.promise(() => store.load())

    // The bridge needs its own private server so proxy environment variables
    // reach every model request instead of the shared background service.
    const explicitServer = Option.getOrUndefined(Option.flatten(yield* Effect.serviceOption(Server)))
    const endpoint =
      explicitServer !== undefined
        ? (yield* ServerConnection.resolve({ server: explicitServer })).endpoint
        : yield* Standalone.start({ env: proxyEnvironment(store.current.proxy) })

    const { Samet } = yield* Effect.promise(() => import("../../samet/app"))
    const app = new Samet(
      endpoint,
      directory,
      port,
      OPENCODE_VERSION,
      {
        onRestart: () => restart(directory, port, explicitServer),
      },
      store,
    )
    const url = yield* Effect.promise(() =>
      app.start().catch((error) => {
        if (addressInUse(error))
          throw new Error(`Port ${port} zaten kullanımda. Başka bir port için: opencode-samet --port 1011`)
        throw new Error(`Telegram köprüsü başlatılamadı: ${errorMessage(error)}`)
      }),
    )
    ignoreBrokenPipe()
    console.log("opencode samet · Telegram köprüsü")
    console.log(`Setup:        ${url}`)
    console.log(`Çalışma yeri: ${directory}`)
    console.log("Kapatmak için Ctrl+C.")
    yield* Effect.promise(() => waitForShutdown(app))
  }),
)

function restart(directory: string, port: number, server?: string) {
  const [executable, ...args] = selfCommand()
  if (!executable) throw new Error("Failed to resolve CLI entrypoint")
  const child = Bun.spawn(
    [executable, ...args, "samet", directory, "--port", String(port), ...(server ? ["--server", server] : [])],
    {
      cwd: process.cwd(),
      detached: true,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      env: process.env,
    },
  )
  child.unref()
  setTimeout(() => process.exit(0), 250)
}

function waitForShutdown(app: { stop(): Promise<void> }) {
  return new Promise<void>((resolve) => {
    let stopping = false
    const shutdown = () => {
      if (stopping) return
      stopping = true
      void app.stop().finally(resolve)
    }
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
  })
}

function ignoreBrokenPipe() {
  for (const stream of [process.stdout, process.stderr])
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error
    })
}

function addressInUse(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("code" in error && error.code === "EADDRINUSE") return true
  return "cause" in error && addressInUse(error.cause)
}
