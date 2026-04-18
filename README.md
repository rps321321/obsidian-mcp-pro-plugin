# Obsidian MCP Pro (plugin)

An Obsidian community plugin that runs an **MCP server** inside Obsidian. One click, your vault is available to Claude Desktop, Cursor, ChatGPT, or any MCP-compatible client — over HTTP, no config-file editing.

Wraps the [`obsidian-mcp-pro`](https://github.com/rps321321/obsidian-mcp-pro) server.

## Features

- One-click start/stop from the ribbon or command palette
- Status bar indicator showing port and state
- Auto-start on Obsidian launch (optional)
- Bearer-token authentication for remote use
- Copy-to-clipboard connection snippet for client configs
- Uses Obsidian's bundled Node runtime — no separate Node install required

## Install

### From source (until the plugin is in the community directory)

```bash
git clone https://github.com/rps321321/obsidian-mcp-pro-plugin.git
cd obsidian-mcp-pro-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` (if any) into your vault:

```
<vault>/.obsidian/plugins/obsidian-mcp-pro/
```

You also need `node_modules/obsidian-mcp-pro/` copied next to them — the plugin spawns the installed CLI as a child process.

Enable the plugin in **Settings → Community plugins**.

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

The plugin spawns `obsidian-mcp-pro --transport=http` as a child process using Electron's bundled Node (`ELECTRON_RUN_AS_NODE=1` + `process.execPath`). The child listens on the configured port with DNS rebinding protection, bearer auth (optional), and per-session state.

When the plugin unloads, the child receives SIGTERM (or `kill()` on Windows), followed by SIGKILL after 3s if still alive.

## Development

```bash
npm install
npm run dev   # watches src/ and rebuilds main.js
```

Symlink the plugin folder into a test vault's `.obsidian/plugins/` so reloads pick up rebuilds.

## License

MIT
