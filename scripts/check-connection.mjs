import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function configuration() {
  if (!process.env.MCP_SERVER_URL || !process.env.MCP_BEARER_TOKEN) {
    throw new Error("configuration");
  }
  let url;
  try {
    url = new URL(process.env.MCP_SERVER_URL);
  } catch {
    throw new Error("configuration");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    /[\r\n]/.test(process.env.MCP_BEARER_TOKEN)
  )
    throw new Error("configuration");
  return { url, token: process.env.MCP_BEARER_TOKEN };
}

async function installedSdk() {
  try {
    const coreRequire = createRequire(import.meta.resolve("obsidian-mcp-pro"));
    const load = (name) =>
      import(pathToFileURL(coreRequire.resolve(name)).href);
    const [client, transport] = await Promise.all([
      load("@modelcontextprotocol/sdk/client/index.js"),
      load("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    ]);
    return { ...client, ...transport };
  } catch {
    throw new Error("dependencies");
  }
}

function diagnostic(error) {
  if (error?.message === "configuration") {
    return "Set MCP_SERVER_URL to an HTTP(S) endpoint and MCP_BEARER_TOKEN to its token. URL credentials and fragments are not accepted.";
  }
  if (error?.message === "dependencies") {
    return "Install this checkout's locked dependencies with npm ci using Node.js 24 or newer.";
  }
  if (error?.code === 401) {
    return "HTTP 401. Check the bearer token, its assigned Role, and whether it was regenerated or revoked.";
  }
  if (error?.code === 403) {
    return "HTTP 403. Check the destination Host and port, including any proxy Host. Save allowed-host changes and restart the server.";
  }
  if (error?.message === "role") {
    return "Connected, but get_vault_stats is not advertised. Assign a Role containing that Tool, then reconnect.";
  }
  if (error?.message === "tool") {
    return "Connected, but the vault statistics call failed. Check the server status and Role, then retry without sharing Tool results.";
  }
  return "Connection check failed. Check that Obsidian and the server are running, the endpoint and network route are correct, and the client can reconnect within five seconds per request.";
}

async function check() {
  let client;
  let transport;
  const deadline = setTimeout(() => {
    console.error(
      "Connection check timed out. Check the server status and endpoint, then reconnect.",
    );
    process.exit(1);
  }, 20000);
  deadline.unref();
  try {
    const { url, token } = configuration();
    const { Client, StreamableHTTPClientTransport } = await installedSdk();
    client = new Client({ name: "mcp-pro-connection-check", version: "1.0.0" });
    transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const options = { timeout: 5000, maxTotalTimeout: 5000 };
    await client.connect(transport, options);
    const catalog = await client.listTools(undefined, options);
    if (!catalog.tools.some((tool) => tool.name === "get_vault_stats")) {
      throw new Error("role");
    }
    const result = await client.callTool(
      { name: "get_vault_stats", arguments: {} },
      undefined,
      options,
    );
    if (result.isError) throw new Error("tool");
    console.log(
      "Connected, listed permitted Tools, and read vault statistics.",
    );
  } catch (error) {
    console.error(diagnostic(error));
    process.exitCode = 1;
  } finally {
    await transport?.terminateSession().catch(() => {});
    await client?.close().catch(() => {});
    clearTimeout(deadline);
  }
}

await check();
