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
    // Never bundle obsidian-mcp-pro — it's spawned as a child process, not
    // imported. Keeping it external avoids dragging its whole dep graph
    // (including MCP SDK) into the plugin bundle.
    "obsidian-mcp-pro",
    ...builtins,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
