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

## Install this fork

This fork is **not published to npm**. `npm install -g opencode-ai` and the install
script on [opencode.ai](https://opencode.ai) install the upstream project and do **not**
include `opencode-samet`. Install this repository instead.

### Requirements

- [Bun](https://bun.sh) 1.4 or newer.
- Git (needed for cloning and for the in-app update check).
- A Telegram bot token from [@BotFather](https://t.me/BotFather).
- An opencode provider/model that the agent can use.

### Windows

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
git clone https://github.com/same-t/opencode.git
cd opencode
bun install
bun run dev:samet
```

### Linux / macOS

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/same-t/opencode.git
cd opencode
bun install
bun run dev:samet
```

`dev:samet` starts the bridge in the repository root and serves the setup UI at
<http://127.0.0.1:1010>. Log in with the setup password (default `samet123`) and add a bot
token; see [Setup UI](#setup-ui). If you just installed Bun, open a new terminal first so
`bun` is on `PATH`.

### Install the `opencode-samet` command globally

To run it from any project instead of the repository root:

```bash
cd packages/cli
bun link
```

`bun link` also exposes this fork's `opencode` and `opencode2` commands. Then:

```bash
opencode-samet                       # work in the current directory
opencode-samet /path/to/project      # work in another directory
opencode-samet /path/to/project --port 1011
```

If your shell cannot find the command, add Bun's global bin directory to `PATH`:
`~/.bun/bin` on Linux/macOS, `%USERPROFILE%\.bun\bin` on Windows.

The bridge always starts a private opencode server so the proxy configuration applies
only to this bridge.

### Free models and the private server

A build from source reports itself as `local`, and the OpenCode Zen gateway only grants
free models to official releases. To use free models, install the official CLI and let the
bridge start it as its private server:

```bash
npm install -g @opencode/cli
```

The bridge detects an installed `opencode` on `PATH` and runs it with `opencode serve`.
The setup UI shows the choice in the **Sunucu** row and `/status` prints `Sunucu:`. To pick
a different command:

```bash
opencode-samet /path/to/project --server-command "opencode serve"
```

`--server-command` (or `OPENCODE_SAMET_SERVER_COMMAND`) survives restarts and updates.
Without an installed CLI the bridge falls back to its own server, which works with paid
providers but cannot use the free models.

### Update the fork

Use **Güncelleme Kontrol** → **Güncelle** in the setup UI, or update manually:

```bash
cd opencode
git pull
bun install
```

The UI updates and restarts the bridge automatically. A manual update needs a restart
of `opencode-samet`.

## Setup UI

Open <http://127.0.0.1:1010> after starting the command.

1. **Telegram**: paste the bot token and enable the switch. The token is validated with
   `getMe` before it is saved.
2. **Proxy**: enter `ip:port:username:password` and press **Kaydet**. **Test et** checks
   the connection, **Proxy'yi kaldır** removes it. Proxy changes restart the process.
3. **Model**: press **Modelleri Getir**, select a model, then **Kopyala** or **Kaydet**.
4. **Sürüm Kontrol**: press **Güncelleme Kontrol** to compare with GitHub. If commits are
   available, **Güncelle** pulls them and restarts the bridge.
5. **Durum** shows the bot, working directory, private server, sessions, active requests,
   and the last error.

The UI only listens on `127.0.0.1` by default. See [Password and external access](#password-and-external-access).

## Password and external access

The setup UI asks for a password before it shows the dashboard. The default password is
`samet123`. Change it with `--password` or `OPENCODE_SAMET_PASSWORD`:

```bash
opencode-samet --password "daha-guclu-bir-parola"
```

Sessions live in memory and expire after seven days, so a restart or update logs you out.

To reach the UI from another device, bind it to all interfaces:

```bash
opencode-samet --host 0.0.0.0
```

The startup output prints the network address, for example
`http://192.168.1.20:1010/`. To bind one interface instead, pass its address:
`opencode-samet --host 192.168.1.20`. Allow TCP port 1010 in the firewall if the page is
not reachable.

> **Security:** the setup UI can change the bot token and proxy and trigger `git pull`.
> Anyone who can reach the port and knows the password controls those settings. Change the
> default password before exposing the UI. Do not forward plain HTTP to the internet; use a
> VPN or an HTTPS tunnel (Tailscale, Cloudflare Tunnel, SSH tunnel) instead. The login
> password travels over the network, so plain HTTP is only appropriate on a trusted LAN.

## Telegram commands

| Command           | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `/chats`          | List recent sessions with their number (alias `/sessions`).             |
| `/chat N`         | Bind this chat to session number `N` or an ID prefix (alias `/switch`). |
| `/new [title]`    | Start a fresh opencode session (alias `/reset`).                        |
| `/rename <title>` | Rename the current session (alias `/adlandir`).                         |
| `/model`          | Show the model used for all chats.                                      |
| `/model <ref>`    | Set the model for all chats, e.g. `opencode/deepseek-v4#max`.           |
| `/stop`           | Stop the running request (alias `/iptal`).                              |
| `/status`         | Show the selected model, directory, session, and active requests.       |
| `/help`           | Show the help message.                                                  |

Every chat keeps its own opencode session. Messages in one chat are processed in order;
`/stop` is handled immediately, even while a request is running.

If the setup UI or `/status` reports `Conflict: terminated by other getUpdates request`,
another process or device is long-polling the same bot token. Only one instance may poll a
bot at a time. Stop the duplicates and this instance recovers automatically within a few
seconds:

```bash
ps -ef | grep -E "opencode-samet|src/index.ts samet" | grep -v grep
pkill -f "src/index.ts samet"
pkill -f opencode-samet
```

If the same token is used on another machine or by another bot project, create a separate
bot with @BotFather or stop that instance.

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

| Variable                        | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`           | Override the settings directory.                                     |
| `OPENCODE_SAMET_DIRECTORY`      | Default working directory when no directory argument is given.       |
| `OPENCODE_SAMET_HOST`           | Default bind address; same as `--host`.                              |
| `OPENCODE_SAMET_PASSWORD`       | Setup password; same as `--password`.                                |
| `OPENCODE_SAMET_SERVER_COMMAND` | Command for the private opencode server; same as `--server-command`. |
| `OPENCODE_SAMET_TELEGRAM_API`   | Telegram API base URL; useful for tests.                             |
| `OPENCODE_BUN_PATH`             | Bun executable used by the `opencode-samet` launcher.                |

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
