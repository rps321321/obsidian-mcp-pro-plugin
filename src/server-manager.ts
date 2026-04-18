import { spawn, type ChildProcess } from "child_process";
import { Notice } from "obsidian";
import type { Settings } from "./settings";

export type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface ServerState {
  status: ServerStatus;
  pid?: number;
  port?: number;
  lastError?: string;
}

type Listener = (state: ServerState) => void;

/**
 * Spawns the `obsidian-mcp-pro` CLI as a child process in HTTP-transport
 * mode. Uses Electron-as-node (`ELECTRON_RUN_AS_NODE=1`) so the user
 * doesn't need a system-wide Node install — every Obsidian desktop build
 * ships Electron, which can run our entrypoint as plain Node.
 */
export class ServerManager {
  private child: ChildProcess | null = null;
  private state: ServerState = { status: "stopped" };
  private listeners: Set<Listener> = new Set();

  constructor(
    private vaultPath: string,
    private getSettings: () => Settings,
    private resolveEntryPath: () => string,
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
    const entry = this.resolveEntryPath();
    this.setState({ status: "starting", port: settings.port });

    const args = [
      entry,
      "--transport=http",
      `--host=${settings.host}`,
      `--port=${settings.port}`,
    ];
    if (settings.bearerToken) {
      args.push(`--token=${settings.bearerToken}`);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      OBSIDIAN_VAULT_PATH: this.vaultPath,
    };
    if (settings.vaultName) env.OBSIDIAN_VAULT_NAME = settings.vaultName;

    try {
      this.child = spawn(process.execPath, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
      return;
    }

    const child = this.child;
    if (!child) return;

    // The server prints "HTTP server listening on …" to stderr once it's
    // bound and ready. Wait for that before flipping to "running" so the
    // status badge is accurate.
    let ready = false;
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf-8");
      console.log("[obsidian-mcp-pro]", text.trimEnd());
      if (!ready && text.includes("HTTP server listening")) {
        ready = true;
        this.setState({
          status: "running",
          pid: child.pid,
          port: settings.port,
        });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err) => {
      this.fail(err.message);
    });

    child.on("exit", (code, signal) => {
      this.child = null;
      if (this.state.status === "starting") {
        this.fail(`Server exited before ready (code=${code}, signal=${signal})`);
      } else if (this.state.status === "running") {
        this.setState({ status: "stopped" });
      }
    });

    // Give it a generous timeout to bind.
    setTimeout(() => {
      if (!ready && this.child) {
        this.fail("Server did not become ready within 10 seconds");
        this.stop();
      }
    }, 10_000);
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.setState({ status: "stopped" });
      return;
    }
    const child = this.child;
    try {
      if (process.platform === "win32") {
        child.kill();
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (this.child === child) child.kill("SIGKILL");
        }, 3_000);
      }
    } catch (err) {
      console.error("[obsidian-mcp-pro] stop error:", err);
    }
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
