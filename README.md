<p align="center">
  <strong>opencode-samet</strong><br />
  A Telegram bridge and setup UI for the opencode coding agent.
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.tr.md">Türkçe</a>
</p>

---

This repository is a fork of [opencode](https://github.com/anomalyco/opencode) that adds
`opencode-samet`: a local Telegram bridge that lets you drive an opencode session from a
Telegram chat, plus a small Turkish setup UI on `http://127.0.0.1:1010`.

## Features

- **Telegram on/off** with a bot token stored only in the local settings file.
- **Optional proxy** in `ip:port:username:password` (or URL) form. When set, model
  requests made by the private opencode server and all Telegram API traffic go through
  the proxy. Loopback stays excluded so the UI and the local server keep working.
- **Model picker**: fetch every available model, filter it, copy the reference, and save
  it. Saved models are applied to new sessions and every prompt.
- **Version check and self-update** against this repository (`origin/dev`). The update
  button runs `git pull`, reinstalls dependencies when `bun.lock` changed, and restarts
  the bridge automatically. A dirty working tree blocks the update.
- **Files and images in both directions**: photos, documents, video, audio, and voice
  messages are downloaded under `.opencode/telegram/<chatID>/`; images are attached to
  the prompt. Files produced by the agent inside the working directory are sent back to
  Telegram.
- **One live status message** edited in place while the agent works. It shows the most
  recent shell commands, tool calls, and commentary; the final answer replaces it, and
  longer answers continue in additional messages.
- **`/stop`** interrupts the running request. `/new`, `/status`, and `/help` are also
  available.
- Works on **Windows and Linux**.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer.
- Git, for the in-app update check.
- A Telegram bot token from [@BotFather](https://t.me/BotFather).
- An opencode provider/model that the agent can use.

## Run from a checkout

```bash
git clone https://github.com/same-t/opencode.git
cd opencode
bun install
bun run dev:samet
```

`dev:samet` starts the CLI in the repository root and serves the setup UI at
<http://127.0.0.1:1010>.

To expose the command globally in a checkout:

```bash
cd packages/cli
bun link
```

Then:

```bash
opencode-samet                       # work in the current directory
opencode-samet /path/to/project      # work in another directory
opencode-samet /path/to/project --port 1011
```

The bridge always starts a private opencode server so the proxy configuration applies
only to this bridge.

## Setup UI

Open <http://127.0.0.1:1010> after starting the command.

1. **Telegram**: paste the bot token and enable the switch. The token is validated with
   `getMe` before it is saved.
2. **Proxy**: enter `ip:port:username:password` and press **Kaydet**. **Test et** checks
   the connection, **Proxy'yi kaldır** removes it. Proxy changes restart the process.
3. **Model**: press **Modelleri Getir**, select a model, then **Kopyala** or **Kaydet**.
4. **Sürüm Kontrol**: press **Güncelleme Kontrol** to compare with GitHub. If commits are
   available, **Güncelle** pulls them and restarts the bridge.
5. **Durum** shows the bot, working directory, sessions, active requests, and the last
   error.

The UI only listens on `127.0.0.1`.

## Telegram commands

| Command   | Description                                                       |
| --------- | ----------------------------------------------------------------- |
| `/stop`   | Stop the running request (alias `/iptal`).                        |
| `/new`    | Start a fresh opencode session (alias `/reset`).                  |
| `/status` | Show the selected model, directory, session, and active requests. |
| `/help`   | Show the help message.                                            |

Every chat keeps its own opencode session. Messages in one chat are processed in order;
`/stop` is handled immediately, even while a request is running.

## Files and limits

- Telegram bot downloads are limited to 20 MB; larger files are rejected with a message.
- Incoming files are stored in `.opencode/telegram/<chatID>/` inside the working
  directory. The prompt receives the absolute path, so the agent can open or modify it.
- Images are additionally attached as image parts, so vision-capable models see them
  directly.
- Outgoing files must resolve inside the working directory. Images up to 10 MB are sent
  as photos, everything else as documents.

## Configuration and environment

Settings live in `~/.config/opencode/samet.json` with owner-only permissions where the
platform allows it. The file stores the bot token, proxy, selected model, and per-chat
session IDs.

| Variable                      | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`         | Override the settings directory.                               |
| `OPENCODE_SAMET_DIRECTORY`    | Default working directory when no directory argument is given. |
| `OPENCODE_SAMET_TELEGRAM_API` | Telegram API base URL; useful for tests.                       |
| `OPENCODE_BUN_PATH`           | Bun executable used by the `opencode-samet` launcher.          |

## Development

Run the focused checks from `packages/cli`:

```bash
bun run typecheck
bun test test/samet.test.ts
bun x oxlint src/samet
bun x prettier --check "src/samet/*.ts"
```

Implementation lives in `packages/cli/src/samet/`:

- `app.ts` — setup server, config API, Telegram polling, live message, files.
- `bridge.ts` — opencode client and event-to-status translation.
- `telegram.ts` — Telegram Bot API client with proxy, uploads, and downloads.
- `proxy.ts` — proxy parsing, masking, environment, and connectivity test.
- `update.ts` — git update check, pull, and dependency refresh.
- `page.ts` — the Turkish setup UI.

The older standalone implementation in `packages/samet/` is not used by the
`opencode-samet` command.

## License

MIT. See [LICENSE](LICENSE). opencode is copyright its original authors.
