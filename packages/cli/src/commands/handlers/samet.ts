import { Effect, Option } from "effect"
import path from "node:path"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { ServerConnection } from "../../services/server-connection"
import { OPENCODE_VERSION } from "../../version"
import { errorMessage } from "../../util/error"

export default Runtime.handler(
  Commands.commands.samet,
  Effect.fnUntraced(function* (input) {
    const server = yield* ServerConnection.resolve()
    const port = Option.getOrUndefined(input.port) ?? 1010
    const directory = path.resolve(
      Option.getOrUndefined(input.directory) ?? process.env.OPENCODE_SAMET_DIRECTORY ?? process.cwd(),
    )
    const { Samet } = yield* Effect.promise(() => import("../../samet/app"))
    const app = new Samet(server.endpoint, directory, port, OPENCODE_VERSION)
    const url = yield* Effect.promise(() =>
      app.start().catch((error) => {
        if (addressInUse(error))
          throw new Error(`Port ${port} zaten kullanımda. Başka bir port için: opencode-samet --port 1011`)
        throw new Error(`Telegram köprüsü başlatılamadı: ${errorMessage(error)}`)
      }),
    )
    console.log("opencode samet · Telegram köprüsü")
    console.log(`Setup:       ${url}`)
    console.log(`Çalışma yeri: ${directory}`)
    console.log("Kapatmak için Ctrl+C.")
    yield* Effect.promise(() => waitForShutdown(app))
  }),
)

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

function addressInUse(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("code" in error && error.code === "EADDRINUSE") return true
  return "cause" in error && addressInUse(error.cause)
}
