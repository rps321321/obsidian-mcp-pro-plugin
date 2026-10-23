import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMcpServer,
  createMcpServerServices,
  startHttpServer,
} from "obsidian-mcp-pro";

const secret = randomBytes(32).toString("hex");
const script = new URL("check-connection.mjs", import.meta.url);

async function run(url, token = secret) {
  const child = spawn(process.execPath, [fileURLToPath(script)], {
    env: { ...process.env, MCP_SERVER_URL: url, MCP_BEARER_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 25000,
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.ok(!output.includes(secret), "must not print the bearer secret");
  assert.ok(
    !output.includes("private fixture text"),
    "must not print vault text",
  );
  assert.ok(!output.includes(" at "), "must not print an error stack");
  return { code, output };
}

test("connection check reports missing input and stopped endpoints safely", async () => {
  assert.match((await run("", "")).output, /Set MCP_SERVER_URL/);
  assert.match((await run("not a URL")).output, /Set MCP_SERVER_URL/);
  assert.match(
    (await run(`http://user:${secret}@127.0.0.1/mcp`)).output,
    /URL credentials and fragments are not accepted/,
  );
  assert.match(
    (await run("http://127.0.0.1/mcp", `${secret}\n`)).output,
    /Set MCP_SERVER_URL/,
  );
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const result = await run(`http://127.0.0.1:${port}/mcp`);
  assert.equal(result.code, 1);
  assert.match(result.output, /Check that Obsidian and the server are running/);
});

test("connection check gives a fixed Host denial diagnostic", async () => {
  const listener = createServer((_request, response) => {
    response.writeHead(403).end(`secret upstream detail ${secret}`);
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  try {
    const result = await run(`http://127.0.0.1:${listener.address().port}/mcp`);
    assert.equal(result.code, 1);
    assert.match(result.output, /HTTP 403.*Host and port/);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

test("connection check uses installed core with real auth, discovery, and stats", async () => {
  const vault = await mkdtemp(join(tmpdir(), "mcp-connection-check-"));
  let server;
  try {
    await writeFile(join(vault, "fixture.md"), "private fixture text");
    const services = createMcpServerServices(vault);
    const authorization = {
      roles: [{ id: "reader", name: "Reader", tools: ["get_vault_stats"] }],
      tokens: [{ id: "test", token: secret, roleId: "reader" }],
    };
    server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      ...authorization,
      buildMcpServer: (options) => buildMcpServer(vault, services, options),
      installSignalHandlers: false,
    });
    const good = await run(server.url);
    assert.equal(good.code, 0);
    assert.equal(
      good.output.trim(),
      "Connected, listed permitted Tools, and read vault statistics.",
    );
    const bad = await run(server.url, `${secret}wrong`);
    assert.equal(bad.code, 1);
    assert.match(bad.output, /HTTP 401/);
    const missing = await run(server.url, "");
    assert.equal(missing.code, 1);
    assert.match(missing.output, /Set MCP_SERVER_URL/);
    await server.updateAuthorization({
      ...authorization,
      roles: [{ id: "reader", name: "Empty", tools: [] }],
    });
    const denied = await run(server.url);
    assert.equal(denied.code, 1);
    assert.match(denied.output, /get_vault_stats is not advertised/);
  } finally {
    await server?.stop();
    await rm(vault, { recursive: true, force: true });
  }
});
