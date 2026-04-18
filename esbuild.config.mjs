import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/*
Obsidian MCP Pro plugin — bundled. Source: https://github.com/rps321321/obsidian-mcp-pro-plugin
*/`;

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  platform: "node",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
  // obsidian-mcp-pro + @modelcontextprotocol/sdk + zod + gray-matter are all
  // bundled into main.js so the plugin is fully self-contained — no
  // node_modules needed at install time.
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
