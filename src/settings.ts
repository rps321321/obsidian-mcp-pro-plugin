import { App, PluginSettingTab, Setting } from "obsidian";
import { isIP } from "node:net";
import type { ServerManager } from "./server-manager";
import {
  canonicalizeHostEntry,
  normalizeHostEntries,
  isValidHostEntry,
  detectMachineHosts,
} from "./hosts";
import { RoleEditor } from "./role-editor";
import { TokenSettings } from "./token-settings";
import {
  button,
  element,
  message,
  save,
  type SettingsPlugin,
} from "./settings-ui";
export { DEFAULT_SETTINGS, type Settings } from "./settings-model";

export class McpSettingsTab extends PluginSettingTab {
  private unsubscribe: (() => void) | null = null;
  private disposeDrafts: (() => void) | null = null;

  constructor(
    app: App,
    private plugin: SettingsPlugin,
    private manager: ServerManager,
  ) {
    super(app, plugin);
  }

  hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.disposeDrafts?.();
    this.disposeDrafts = null;
  }

  display(): void {
    this.hide();
    const parent = this.containerEl;
    parent.empty();
    parent.addClass("mcp-settings");
    this.renderServer(parent);
    this.renderConnection(parent);
    this.renderAllowedHosts(parent);
    const roles = element(parent, "section");
    let tokens: TokenSettings | undefined;
    const editor = new RoleEditor(roles, this.plugin, () =>
      tokens?.refreshRoles(),
    );
    tokens = new TokenSettings(
      element(parent, "section"),
      this.plugin,
      editor,
      () => this.connectionUrl(),
    );
    this.disposeDrafts = () => {
      parent
        .querySelectorAll<HTMLInputElement>("input[readonly]")
        .forEach((input) => {
          input.type = "password";
          input.value = "";
        });
    };
  }

  private connectionUrl(): string | null {
    const state = this.manager.getState();
    if (state.status === "running" && state.url) return state.url;
    const { host, port } = this.plugin.settings;
    if (port === 0) return null;
    return `http://${isIP(host) === 6 ? `[${host}]` : host}:${port}/mcp`;
  }

  private renderServer(parent: HTMLElement): void {
    const status = message(parent);
    const controls = new Setting(parent)
      .setName("Server Control")
      .setDesc("Start or stop the HTTP server.");
    const feedback = message(parent);
    const run = (action: () => Promise<void>): void => {
      void action().catch(() => {
        feedback.textContent =
          "Server action failed. Check the server status before retrying.";
      });
    };
    controls.addButton((btn) =>
      btn.setButtonText("Start").onClick(() => run(() => this.manager.start())),
    );
    controls.addButton((btn) =>
      btn.setButtonText("Stop").onClick(() => run(() => this.manager.stop())),
    );
    this.unsubscribe = this.manager.subscribe((state) => {
      status.textContent = `Status: ${state.status}${state.port === undefined ? "" : ` — port ${state.port}`}`;
      if (state.lastError) element(status, "p", state.lastError);
    });
    this.renderAutoStart(parent, feedback);
  }

  private renderAutoStart(parent: HTMLElement, feedback: HTMLElement): void {
    new Setting(parent).setName("Auto-start on Launch").addToggle((toggle) => {
      toggle.toggleEl.setAttribute("aria-label", "Auto-start on launch");
      toggle.toggleEl
        .querySelector("input")
        ?.setAttribute("aria-label", "Auto-start on launch");
      toggle
        .setValue(this.plugin.settings.autoStart)
        .onChange(async (value) => {
          if (
            !(await save(this.plugin, feedback, (current) => ({
              ...current,
              autoStart: value,
            })))
          )
            toggle.setValue(this.plugin.settings.autoStart);
        });
    });
  }

  private renderConnection(parent: HTMLElement): void {
    element(parent, "h3", "Connection");
    element(
      parent,
      "p",
      "Bind address and port changes require a server restart. Non-loopback binding exposes the endpoint to the network; configure the firewall and use HTTPS for remote access.",
      "setting-item-description",
    );
    let host = this.plugin.settings.host;
    let port = String(this.plugin.settings.port);
    const feedback = message(parent);
    new Setting(parent)
      .setName("Bind Address")
      .setDesc("Use 127.0.0.1 for access only from this computer.")
      .addText((input) => {
        input.inputEl.setAttribute("aria-label", "Bind address");
        input.setValue(host).onChange((value) => {
          host = value.trim().toLowerCase();
        });
      });
    new Setting(parent)
      .setName("Port")
      .setDesc("HTTP port to listen on (1–65535).")
      .addText((input) => {
        input.inputEl.setAttribute("aria-label", "Port");
        input.setValue(port).onChange((value) => {
          port = value;
        });
      });
    button(parent, "Save Connection", () => {
      this.saveConnection(host, port, feedback);
    });
  }

  private saveConnection(
    host: string,
    port: string,
    feedback: HTMLElement,
  ): void {
    const numeric = Number(port);
    const literal =
      host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    if (
      !isValidHostEntry(host) ||
      (host.includes(":") && isIP(literal) !== 6)
    ) {
      feedback.textContent =
        "Enter a hostname or IP address without a port, URL scheme, or path.";
      return;
    }
    if (
      !port.trim() ||
      !Number.isInteger(numeric) ||
      numeric < 1 ||
      numeric > 65535
    ) {
      feedback.textContent = "Enter a port from 1 to 65535.";
      return;
    }
    const canonical = canonicalizeHostEntry(host);
    const bindHost = canonical.startsWith("[")
      ? canonical.slice(1, -1)
      : canonical;
    void save(this.plugin, feedback, (current) => ({
      ...current,
      host: bindHost,
      port: numeric,
    }));
  }

  private renderAllowedHosts(parent: HTMLElement): void {
    element(parent, "h3", "Additional Allowed Hosts");
    element(
      parent,
      "p",
      "Destination Host header values for this server, not client addresses. Bind and loopback defaults remain allowed. Enter one hostname or IP address per line; an explicit port matches only that port. Names save as lowercase/punycode; IPv6 uses brackets. Stop and start the server to apply saved host changes.",
      "setting-item-description",
    );
    const label = element(parent, "label", "", "mcp-field");
    element(label, "span", "Additional allowed hosts");
    const input = element(label, "textarea");
    input.rows = 4;
    input.value = this.plugin.settings.allowedHosts.join("\n");
    input.spellcheck = false;
    input.placeholder = "vault.example.com\n192.168.1.10";
    const feedback = message(parent);
    const actions = element(parent, "div", "", "mcp-actions");
    button(actions, "Detect Machine Hosts", () =>
      this.detectHosts(input, feedback),
    );
    button(actions, "Save Allowed Hosts", () =>
      this.saveHosts(input, feedback),
    );
  }

  private detectHosts(input: HTMLTextAreaElement, feedback: HTMLElement): void {
    try {
      const values = [...input.value.split(/\r?\n/), ...detectMachineHosts()];
      input.value = [
        ...new Set(values.map((value) => value.trim()).filter(Boolean)),
      ].join("\n");
      feedback.textContent =
        "Detected destinations added to the draft. Review them, then save.";
    } catch {
      feedback.textContent =
        "Could not detect machine hosts. Enter destination names manually.";
    }
  }

  private saveHosts(input: HTMLTextAreaElement, feedback: HTMLElement): void {
    const lines = input.value.split(/\r?\n/);
    const invalid = lines.flatMap((line, index) =>
      line.trim() && !isValidHostEntry(line.trim()) ? [index + 1] : [],
    );
    if (invalid.length) {
      feedback.textContent = `Correct destination host entries on lines ${invalid.join(", ")}. Nothing was saved.`;
      input.setAttribute("aria-invalid", "true");
      return;
    }
    input.removeAttribute("aria-invalid");
    const allowedHosts = normalizeHostEntries(
      lines.map((line) => line.trim()).filter(Boolean),
    );
    void save(this.plugin, feedback, (current) => ({
      ...current,
      allowedHosts,
    })).then((saved) => {
      if (saved) {
        input.value = this.plugin.settings.allowedHosts.join("\n");
        feedback.textContent =
          "Saved. Stop and start the server to apply host changes.";
      }
    });
  }
}
