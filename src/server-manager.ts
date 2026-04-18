import { Notice } from "obsidian";
import type { HttpServerHandle } from "obsidian-mcp-pro";
import { buildMcpServer, startHttpServer } from "obsidian-mcp-pro";
import type { Settings } from "./settings";

export type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface ServerState {
  status: ServerStatus;
  port?: number;
  url?: string;
  lastError?: string;
}

type Listener = (state: ServerState) => void;

/**
 * Runs the MCP HTTP server in-process (inside the app's renderer Node).
 * No child process, no node_modules requirement at install time — the
 * whole server is bundled into the plugin's `main.js` by esbuild.
 */
export class ServerManager {
  private handle: HttpServerHandle | null = null;
  private state: ServerState = { status: "stopped" };
  private listeners: Set<Listener> = new Set();

  constructor(
    private vaultPath: string,
    private getSettings: () => Settings,
  ) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): ServerState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state.status === "running" || this.state.status === "starting";
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    const settings = this.getSettings();
    this.setState({ status: "starting", port: settings.port });

    if (settings.vaultName) {
      process.env.OBSIDIAN_VAULT_NAME = settings.vaultName;
    }
    process.env.OBSIDIAN_VAULT_PATH = this.vaultPath;

    try {
      const server = buildMcpServer(this.vaultPath);
      const handle = await startHttpServer({
        host: settings.host,
        port: settings.port,
        bearerToken: settings.bearerToken || undefined,
        buildMcpServer: () => server,
        installSignalHandlers: false,
      });
      this.handle = handle;
      this.setState({
        status: "running",
        port: handle.port,
        url: handle.url,
      });
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
    }
  }

  async stop(): Promise<void> {
    const handle = this.handle;
    this.handle = null;
    if (handle) {
      try {
        await handle.stop();
      } catch (err) {
        console.error("[obsidian-mcp-pro] stop error:", err);
      }
    }
    this.setState({ status: "stopped" });
  }

  private fail(msg: string): void {
    console.error("[obsidian-mcp-pro]", msg);
    new Notice(`MCP Pro: ${msg}`, 6_000);
    this.setState({ status: "error", lastError: msg });
  }

  private setState(next: ServerState): void {
    this.state = next;
    for (const l of this.listeners) l(next);
  }
}
