import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temporary = await mkdtemp(join(tmpdir(), "obsidian-plugin-tests-"));
try {
  const outfile = join(temporary, "backend.cjs");
  await build({
    entryPoints: ["tests/backend.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2022",
    minify: true,
    plugins: [
      {
        name: "obsidian-notices",
        setup(context) {
          context.onResolve({ filter: /^\.\/settings$/ }, (args) =>
            args.importer.endsWith("main.ts")
              ? { path: "settings", namespace: "ui-test" }
              : undefined,
          );
          context.onLoad({ filter: /.*/, namespace: "ui-test" }, () => ({
            contents: "export class McpSettingsTab {}",
            loader: "js",
          }));
          context.onResolve({ filter: /^obsidian$/ }, () => ({
            path: "obsidian",
            namespace: "test",
          }));
          context.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              "export class Plugin {} export class FileSystemAdapter {} export class Notice { constructor(message) { if (typeof message !== 'string') throw new Error('Notice requires text'); (globalThis.__mcpTestNotices ??= []).push(message); } }",
            loader: "js",
          }));
        },
      },
    ],
  });
  const result = spawnSync(process.execPath, ["--test", outfile], {
    encoding: "utf8",
    timeout: 90000,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
