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

## Architecture

`obsidian-mcp-pro` is bundled directly into the plugin's `main.js` via esbuild. On start, the plugin calls the library's `buildMcpServer()` + `startHttpServer()` in-process (no child process, no node_modules). The HTTP server listens on the configured port with DNS rebinding protection, optional bearer auth, and per-session state, and is cleanly stopped on plugin unload.

## Development

```bash
npm install
npm run dev   # watches src/ and rebuilds main.js
```

Symlink the plugin folder into a test vault's `.obsidian/plugins/` so reloads pick up rebuilds.

## License

MIT
