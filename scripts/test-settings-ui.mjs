import { build } from "esbuild";
import { TOOL_NAMES } from "obsidian-mcp-pro";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { runUiChecks } from "../tests/settings-ui.test.mjs";

const playwright = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
  : await import("playwright");
const temporary = await mkdtemp(join(tmpdir(), "mcp-role-ui-"));
let browser;
let server;
try {
  const output = await build({
    entryPoints: ["tests/settings-ui.fixture.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    plugins: [
      {
        name: "browser-fixture",
        setup(builder) {
          builder.onResolve(
            { filter: /^(node:crypto|obsidian-mcp-pro|\.\/hosts)$/ },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents:
              args.path === "obsidian-mcp-pro"
                ? `export const TOOL_NAMES=${JSON.stringify(TOOL_NAMES)};`
                : args.path === "./hosts"
                  ? `export const normalizeHostEntries=entries=>[...entries];`
                  : `export const randomUUID=()=>crypto.randomUUID(); export const randomBytes=n=>({toString:()=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('')});`,
          }));
        },
      },
    ],
  });
  await writeFile(
    join(temporary, "fixture.js"),
    output.outputFiles[0].contents,
  );
  const css = await readFile("styles.css", "utf8");
  const html = `<!doctype html><meta charset="utf-8"><style>:root{font-family:system-ui;font-size:16px;--size-4-1:4px;--size-4-2:8px;--size-4-3:12px;--size-4-6:24px;--background-modifier-border:#888}body{margin:20px}button,input,select,textarea{font:inherit}main{max-width:720px}.theme-dark{color:#ddd;background:#222}input{max-width:100%}label{overflow-wrap:anywhere}${css}</style><main class="mcp-settings"></main><script src="/fixture.js"></script>`;
  server = createServer(async (request, response) => {
    if (request.url === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(await readFile(join(temporary, "fixture.js")));
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await playwright.chromium.launch({
    executablePath: process.env.UI_BROWSER_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await runUiChecks(page);
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.screenshot({
      path: join(process.env.UI_SCREENSHOT_DIR, "roles-browser-harness.png"),
      fullPage: true,
    });
  }
  console.log(
    "PASS: role/token browser fixture checks. This harness does not prove native Obsidian integration.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
