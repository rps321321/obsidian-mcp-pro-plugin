# Connect an MCP client

The plugin starts a Streamable HTTP MCP endpoint inside desktop Obsidian. It does not install configuration into another application. Start the server in **Settings → MCP Pro**, then configure the client separately.

## Release and verification status

The published baseline is plugin [v0.4.0](https://github.com/rps321321/obsidian-mcp-pro-plugin/releases/tag/v0.4.0), bundled with core 4.1.1 and SDK 1.32.1. Its native verification used an isolated Windows Obsidian 1.14.5 renderer, Electron 43.8.3, and Node.js 24.22.0. See the [validation record](role-settings-validation.md) for artifact hashes, tested flows, and limits. The older v0.3.0 source declared core `^1.4.0` and allowed an empty bearer setting. These instructions target v0.4.0.

| Client or check           | Evidence and status                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript MCP SDK 1.32.1 | Protocol connections and live Role changes were checked against the native fixture. This is the verified client baseline, not acceptance of a named desktop or cloud application.            |
| Cursor desktop            | The recipe below follows current official configuration documentation. No installed Cursor version has been acceptance-tested here.                                                          |
| Claude Code               | Its official docs describe HTTP connections with bearer headers. The adapted recipe below is untested here; Claude Code is separate from Claude Desktop.                                     |
| Claude Desktop            | No client-version-specific setup is verified. Remote connectors and local Desktop configuration are different mechanisms; the copied JSON is not claimed to be a tested Desktop import.      |
| ChatGPT                   | No application connection is verified. A cloud connection cannot directly reach this computer's loopback endpoint. Network reachability and supported authentication must both be addressed. |

Client documentation was checked on 2026-10-23. Record the actual application version, plugin/core versions, transport, and connection result when verifying another client. A successful SDK test does not fill in those missing application results.

## Local endpoint and generated configuration

For a client running on the same computer, retain the default loopback bind and use the actual listening port. Keep Obsidian and the plugin server running. A different computer's `127.0.0.1` points to that computer, not to the vault server.

Each token has one Role. **Read only** permits `get_vault_stats` and omits mutation/indexing Tools. Choose a narrower custom Role when appropriate. An empty Role legitimately advertises no Tools. Role permissions include a Tool's supported modes and side effects.

**Copy Connection JSON…** produces this shape, using the running endpoint when available:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": {
        "Authorization": "Bearer <token-from-plugin-settings>"
      }
    }
  }
}
```

Replace the example port with the actual one. The copied value contains the actual token; the placeholder above is not a working credential. Keep it out of shared project files and logs. Tokens are stored unencrypted in plugin settings, and copying also puts the secret on the clipboard.

### Cursor desktop: documented recipe, not application-tested

[Cursor's MCP documentation](https://cursor.com/docs/mcp) describes this `mcpServers` / `url` / `headers` format for HTTP connections. Add the copied entry to the personal `~/.cursor/mcp.json`; merge it with any existing `mcpServers` entries. A project-scoped `.cursor/mcp.json` is also supported, but do not commit a bearer token into it. Use Cursor's MCP controls to enable/connect the server, then check Tool discovery and a permitted harmless call. Record the installed Cursor version before calling this path verified.

Cursor also documents environment interpolation in headers. That is a client configuration option, not a feature provided by this plugin.

### Claude Code: documented adaptation, not application-tested

[Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp) describes HTTP servers with authorization headers. Its HTTP entry includes `"type": "http"`; adapt the copied entry to that client's documented configuration:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:3333/mcp",
      "headers": {
        "Authorization": "Bearer ${OBSIDIAN_MCP_TOKEN}"
      }
    }
  }
}
```

Save the entry in your project's `.mcp.json` and follow Claude Code's project approval flow. Here `${OBSIDIAN_MCP_TOKEN}` is Claude Code's documented environment-variable syntax. Set it in the environment used to launch that client. Do not replace it with a literal token in a shared project file. This example has not been run against an installed Claude Code version. Do not paste it into Claude Desktop's settings and assume the same behavior.

## Remote and cloud connections

A local HTTP server does not automatically become a remote service. A remote client needs a route to the server, typically a separately configured HTTPS reverse proxy. Changing the bind address alone does not configure TLS, a firewall, routing, or client authentication. This guide does not provision a proxy or tunnel.

The plugin uses static bearer tokens, not an OAuth authorization server. The actual client must support that authentication or use an independently configured compatible gateway. Keep authentication enabled. Do not expose an unauthenticated vault endpoint to make a client connect.

Additional allowed hosts are destination HTTP `Host` values, not a list of client machines. Configure the exact Host that the proxy forwards, including an explicit port when present, then stop and start the plugin server. Bare entries permit the bare Host and that Host with the plugin's listening port; they do not grant every port. Copying a local connection does not substitute the public proxy URL: the remote client's URL must identify the reachable endpoint.

- [Claude's remote connector documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) says those connections originate from Anthropic's infrastructure, including when configured in Claude Desktop. Local Desktop configuration/extensions are separate. A loopback URL in a remote connector does not reach this vault.
- [ChatGPT's custom MCP documentation](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) distinguishes remote connections from local servers. [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) is a separate official private-network route. Neither that tunnel nor a public proxy has been tested with this plugin here. [ChatGPT authentication documentation](https://developers.openai.com/plugins/build/auth) also describes supported authentication and the limitation on custom API keys; the plugin's copied bearer JSON is not a verified ChatGPT connector setup.

## Check a connection

In the actual client, first confirm the server is running and that Tool discovery succeeds. For a token with **Read only** or another Role containing `get_vault_stats`, call that Tool without arguments. This checks authentication, MCP initialization, discovery, and one permitted operation. It does not establish attachment rendering or every Tool.

`GET /health` is only an unauthenticated liveness check. A 200 response does not verify the bearer token, MCP session, Host validation, or Role. The plugin may leave the `/version` field empty, so do not use that field to infer the bundled core version; use the release/lockfile record.

### Development-only SDK check

From a source checkout, use Node.js 24 or newer and `npm ci` to install the locked development dependencies. `scripts/check-connection.mjs` uses the SDK resolved from the installed core package. It is not needed to run the released Obsidian plugin and does not test a named client application.

Set `MCP_SERVER_URL` to the complete endpoint and `MCP_BEARER_TOKEN` through a secret-input mechanism. For example, in PowerShell:

```powershell
$env:MCP_SERVER_URL = "http://127.0.0.1:3333/mcp"
$secret = Read-Host "MCP bearer token" -AsSecureString
$env:MCP_BEARER_TOKEN = [System.Net.NetworkCredential]::new("", $secret).Password
try {
  node scripts/check-connection.mjs
} finally {
  Remove-Item Env:MCP_BEARER_TOKEN -ErrorAction SilentlyContinue
  $secret.Dispose()
}
```

The check lists Tools and calls `get_vault_stats`. It never prints the token, headers, Tool results, or raw SDK errors. Its output reports connection success or a fixed diagnostic category. Use a synthetic vault when testing changes; do not send private note contents to diagnose a connection.

## Troubleshooting

| Symptom                                                       | Next step                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection refused, timeout, or server `error` status         | Keep Obsidian open, inspect the plugin's status, and check the actual port. If another process owns it, choose a free port and restart. Confirm the client's network can reach that endpoint.                                                      |
| `/mcp` returns 401                                            | Supply the correct bearer header. Check that the token still exists, references a valid Role, and was not regenerated. Recopied configuration contains a secret; do not include it in reports.                                                     |
| `/mcp` returns 403, `Host not allowed`                        | Check the destination Host, including case and port, and the Host forwarded by any proxy. Correct Additional Allowed Hosts, save, and restart. CORS does not replace the Host allowlist.                                                           |
| Old session rejected after a permission change                | Reinitialize/reconnect the client. Another valid token cannot reuse that session, even if it has the same Role.                                                                                                                                    |
| No Tools, or a Tool is not found                              | Check the assigned Role's explicit Tool list. Empty discovery can be correct; omitted Tools cannot be called directly.                                                                                                                             |
| Build says a core API is missing or npm cannot find a version | Use the current lockfile and registry dependency, not the old core 1.4 setup or a guessed unpublished version. Check registry availability and package/version metadata before retrying; do not bypass compilation or commit a local tarball path. |

For a report, include client/version, plugin and core versions, transport, whether the endpoint is local or remote, and the status/error category. Remove bearer tokens, configuration headers, and private vault content.

PDF/DOCX resources from the released plugin have passed raw protocol and byte-identity checks. Application rendering or extraction is not established. [Issue #2](https://github.com/rps321321/obsidian-mcp-pro-plugin/issues/2) remains open for client-conversion diagnosis because the affected client and version are unknown. A wire-level pass does not establish that this report is fixed.
