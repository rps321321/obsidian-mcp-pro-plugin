import { Notice } from "obsidian";
import {
  buildMcpServer,
  startHttpServer,
  createMcpServerServices,
  type AuthorizedHttpServerHandle,
  type McpServerServices,
} from "obsidian-mcp-pro";
import {
  validateSettings,
  toAuthorization,
  type Settings,
} from "./settings-model";
import { expandHosts } from "./hosts";

export type ServerStatus = "stopped" | "starting" | "running" | "error";
export interface ServerState {
  status: ServerStatus;
  port?: number;
  url?: string;
  lastError?: string;
}
type Listener = (state: ServerState) => void;

export class ServerManager {
  private handle: AuthorizedHttpServerHandle | null = null;
  private readonly services: McpServerServices;
  private state: ServerState = { status: "stopped" };
  private listeners = new Set<Listener>();
  private opChain: Promise<void> = Promise.resolve();

  constructor(
    private vaultPath: string,
    private getSettings: () => Settings,
  ) {
    this.services = createMcpServerServices(vaultPath);
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const next = this.opChain.then(op);
    this.opChain = next.catch(() => undefined);
    return next;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): ServerState {
    return this.state;
  }
  isRunning(): boolean {
    return this.state.status === "running" || this.state.status === "starting";
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      if (this.handle || this.isRunning()) return;
      try {
        const settings = validateSettings(this.getSettings());
        this.setState({ status: "starting", port: settings.port });
        if (settings.vaultName)
          process.env.OBSIDIAN_VAULT_NAME = settings.vaultName;
        process.env.OBSIDIAN_VAULT_PATH = this.vaultPath;
        this.handle = await startHttpServer({
          host: settings.host,
          port: settings.port,
          ...toAuthorization(settings),
          allowedHosts: expandHosts(settings.allowedHosts, settings.port),
          buildMcpServer: (options) =>
            buildMcpServer(this.vaultPath, this.services, options),
          installSignalHandlers: false,
        });
        this.setState({
          status: "running",
          port: this.handle.port,
          url: this.handle.url,
        });
      } catch {
        this.clearEnv();
        throw this.fail("MCP server could not be started.");
      }
    });
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.stopCurrent();
      } catch {
        throw this.fail("MCP server could not be stopped.");
      }
    });
  }

  updateSettings(
    change: (current: Settings) => Settings,
    persistAndCommit: (next: Settings) => Promise<void>,
  ): Promise<void> {
    return this.enqueue(async () => {
      let next: Settings;
      try {
        next = validateSettings(change(this.getSettings()));
        await persistAndCommit(next);
      } catch {
        throw new Error("MCP settings could not be saved.");
      }
      if (!this.handle) return;
      try {
        await this.handle.updateAuthorization(toAuthorization(next));
      } catch {
        try {
          await this.stopCurrent();
        } catch {
          console.error(
            "[obsidian-mcp-pro] Unable to stop after authorization update failure",
          );
        }
        throw this.fail(
          "Saved MCP settings could not be applied. Stop the server and retry.",
        );
      }
    });
  }

  private async stopCurrent(): Promise<void> {
    await this.handle?.stop();
    this.handle = null;
    this.clearEnv();
    this.setState({ status: "stopped" });
  }

  private clearEnv(): void {
    delete process.env.OBSIDIAN_VAULT_NAME;
    delete process.env.OBSIDIAN_VAULT_PATH;
  }

  private fail(message: string): Error {
    console.error("[obsidian-mcp-pro]", message);
    new Notice(message, 6_000);
    this.setState({ status: "error", lastError: message });
    return new Error(message);
  }

  private setState(next: ServerState): void {
    this.state = Object.freeze(next);
    for (const listener of this.listeners) listener(this.state);
  }
}
