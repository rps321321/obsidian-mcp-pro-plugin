# MCP Pro

A community plugin that runs an **MCP server** inside your vault. One click, and your notes are available to Claude Desktop, Cursor, ChatGPT, or any MCP-compatible client — over HTTP, no config-file editing.

Wraps the [`obsidian-mcp-pro`](https://github.com/rps321321/obsidian-mcp-pro) library.

## Features

- One-click start/stop from the ribbon or command palette
- Status bar indicator showing port and state
- Auto-start on app launch (optional)
- Bearer-token authentication for remote use
- Copy-to-clipboard connection snippet for client configs
- Everything bundled — no separate Node install required

## Install

### From a GitHub release (recommended)

1. Grab `main.js` and `manifest.json` from the [latest release](https://github.com/rps321321/obsidian-mcp-pro-plugin/releases/latest).
2. Drop them into `<your-vault>/.obsidian/plugins/mcp-pro/`.
3. Enable the plugin in **Settings → Community plugins**.

That's it — everything is bundled into `main.js`, no `node_modules` required.

### From source

```bash
git clone https://github.com/rps321321/obsidian-mcp-pro-plugin.git
cd obsidian-mcp-pro-plugin
npm install
npm run build
```

Then copy `main.js` + `manifest.json` into your vault's plugin folder as above.

## Usage

1. Open **Settings → Obsidian MCP Pro**, configure port + optional bearer token.
2. Click **Start** (or the ribbon icon, or the command `MCP Pro: Start server`).
3. Click **Copy JSON** to get a client config snippet like:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

4. Paste into your client (Cursor's `~/.cursor/mcp.json`, Claude Desktop's `claude_desktop_config.json`, etc.).

## Security

- **Default bind is loopback** (`127.0.0.1`). The settings tab shows an inline warning the moment you type any other host — binding to `0.0.0.0` or a LAN interface exposes your vault to every device on the network.
- **Bearer token optional but strongly recommended** if the port is reachable from anywhere other than this machine. The token field is masked, stored in the plugin's data JSON, and compared in constant time on the server side.
- **DNS rebinding protection** is enabled on the HTTP transport — requests with a mismatched `Host` header are rejected.
- **Vault boundary** — every path the server resolves is realpath-checked against the vault root, so symlinks inside the vault cannot leak data outside it.
- When you copy the connection snippet, the clipboard contents include your bearer token verbatim. The plugin shows a longer-duration notice when that's the case — don't paste the snippet into shared documents or version control.

## Architecture

`obsidian-mcp-pro` is bundled directly into the plugin's `main.js` via esbuild (currently v1.4.0). On start, the plugin calls the library's `buildMcpServer()` + `startHttpServer()` in-process (no child process, no node_modules). The HTTP server listens on the configured port with DNS rebinding protection, optional bearer auth, per-session state, and a 1 h idle-session sweeper, and is cleanly stopped on plugin unload.

## Development

```bash
npm install
npm run dev   # watches src/ and rebuilds main.js
```

Symlink the plugin folder into a test vault's `.obsidian/plugins/` so reloads pick up rebuilds.

## License

MIT
