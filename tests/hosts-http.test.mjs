import assert from "node:assert/strict";
import { test } from "node:test";
import { request } from "node:http";
import { startHttpServer, buildMcpServer } from "obsidian-mcp-pro";
import { expandHosts } from "../src/hosts.ts";

const options = {
  host: "127.0.0.1",
  port: 0,
  roles: [{ id: "empty", tools: [] }],
  tokens: [{ token: "synthetic-host-test", roleId: "empty" }],
  buildMcpServer: (opts) => buildMcpServer(undefined, undefined, opts),
  installSignalHandlers: false,
};
function initialize(port, host, authenticated = true) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "host-test", version: "1" },
      },
    });
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          Host: host,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(body),
          ...(authenticated
            ? { Authorization: "Bearer synthetic-host-test" }
            : {}),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.setTimeout(3000, () =>
      req.destroy(new Error("HTTP host probe timed out")),
    );
    req.end(body);
  });
}
test("should preserve core defaults and enforce expanded Host entries before bearer authentication", async () => {
  const temporary = await startHttpServer(options);
  const port = temporary.port;
  await temporary.stop();
  const handle = await startHttpServer({
    ...options,
    port,
    allowedHosts: expandHosts(
      ["Vault.Example", "bücher.example", "proxy.example:443", "2001:db8::1"],
      port,
    ),
  });
  try {
    for (const host of [
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `[::1]:${port}`,
      "vault.example",
      `vault.example:${port}`,
      "xn--bcher-kva.example",
      `xn--bcher-kva.example:${port}`,
      "proxy.example:443",
      "[2001:db8::1]",
      `[2001:db8::1]:${port}`,
    ])
      assert.equal(await initialize(port, host), 200, host);
    for (const host of [
      "evil.example",
      `proxy.example:${port}`,
      `Vault.Example:${port}`,
    ])
      assert.equal(await initialize(port, host), 403, host);
    assert.equal(await initialize(port, `vault.example:${port}`, false), 401);
    assert.equal(await initialize(port, "evil.example", false), 403);
  } finally {
    await handle.stop();
  }
});
test("should not assume that the current SDK rejects every uppercase Host", async () => {
  const handle = await startHttpServer({
    ...options,
    allowedHosts: ["UPPER.example"],
  });
  try {
    assert.equal(await initialize(handle.port, "UPPER.example"), 200);
    assert.equal(await initialize(handle.port, "upper.example"), 403);
  } finally {
    await handle.stop();
  }
});
