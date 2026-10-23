import {
  createToken,
  generateBearerToken,
  type PluginToken,
} from "./settings-model";
import {
  button,
  confirmInline,
  element,
  field,
  message,
  roleOptions,
  save,
  type SettingsPlugin,
} from "./settings-ui";
import type { RoleEditor } from "./role-editor";

interface RoleChoice {
  select: HTMLSelectElement;
}

export class TokenSettings {
  private list: HTMLElement;
  private choices: RoleChoice[] = [];
  private acknowledgedSecrets = false;

  constructor(
    private parent: HTMLElement,
    private plugin: SettingsPlugin,
    private editor: RoleEditor,
    private connectionUrl?: () => string | null,
  ) {
    element(parent, "h3", "Tokens");
    element(
      parent,
      "p",
      "Tokens are stored unencrypted in this vault’s plugin settings. Sync and backups may copy them. Masking does not encrypt them.",
      "setting-item-description",
    );
    element(
      parent,
      "p",
      "Each token has one role. To customize one agent, duplicate its role and assign the copy to that token.",
      "setting-item-description",
    );
    this.list = element(parent, "div");
    this.render();
  }

  refreshRoles(): void {
    this.choices.forEach(({ select }) =>
      roleOptions(select, this.plugin.settings, select.value),
    );
  }

  private roleChoice(parent: HTMLElement, roleId: string): HTMLSelectElement {
    const row = element(parent, "div", "", "mcp-actions");
    const label = element(row, "label", "Role ");
    const select = element(label, "select");
    select.setAttribute("aria-label", "Role");
    roleOptions(select, this.plugin.settings, roleId);
    this.choices.push({ select });
    button(row, "Create New Role…", () =>
      this.editor.beginCreate((id) => {
        this.refreshRoles();
        select.value = id;
        select.focus();
      }),
    );
    return select;
  }

  private render(focusToken?: string): void {
    this.list.replaceChildren();
    this.choices = [];
    if (!this.plugin.settings.tokens.length)
      element(this.list, "p", "No tokens. Create one to connect an agent.");
    for (const token of this.plugin.settings.tokens) this.renderToken(token);
    this.renderCreate();
    if (focusToken !== undefined) {
      const target = focusToken
        ? Array.from(
            this.list.querySelectorAll<HTMLElement>("[data-token-id]"),
          ).find((item) => item.dataset.tokenId === focusToken)
        : this.list.lastElementChild;
      target?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }

  private renderCreate(): void {
    const section = element(this.list, "section", "", "mcp-token");
    element(section, "h4", "Create Token");
    const label = field(section, "Token label");
    const defaultRole = this.plugin.settings.roles.some(
      (item) => item.id === "read-only",
    )
      ? "read-only"
      : (this.plugin.settings.roles[0]?.id ?? "");
    const role = this.roleChoice(section, defaultRole);
    const feedback = message(section);
    const create = button(section, "Create Token", () => {
      if (!label.value.trim() || !role.value) {
        feedback.textContent = "Enter a label and choose a role.";
        return;
      }
      const token = createToken(label.value.trim(), role.value);
      create.disabled = true;
      void save(this.plugin, feedback, (current) => ({
        ...current,
        tokens: [...current.tokens, token],
      }))
        .then((saved) => {
          if (saved) this.render(token.id);
        })
        .finally(() => {
          create.disabled = false;
        });
    });
  }

  private renderToken(token: PluginToken): void {
    const section = element(this.list, "section", "", "mcp-token");
    section.dataset.tokenId = token.id;
    element(section, "h4", token.label);
    const label = field(section, "Token label", token.label);
    const role = this.roleChoice(section, token.roleId);
    const feedback = message(section);
    button(section, "Save Token", () =>
      this.saveToken(token, label.value, role.value, feedback),
    );
    element(
      section,
      "p",
      "Changing the assigned role closes this token’s sessions. Reinitialize the client to use the new permissions.",
      "setting-item-description",
    );
    this.renderSecret(section, token);
    this.renderLifecycle(section, token);
  }

  private saveToken(
    token: PluginToken,
    label: string,
    roleId: string,
    feedback: HTMLElement,
  ): void {
    const nextLabel = label.trim();
    if (!nextLabel || !roleId) {
      feedback.textContent = "Enter a label and choose a role.";
      return;
    }
    void save(this.plugin, feedback, (current) => {
      const existing = current.tokens.find((item) => item.id === token.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(token))
        throw new Error("Token changed.");
      return {
        ...current,
        tokens: current.tokens.map((item) =>
          item.id === token.id ? { ...item, label: nextLabel, roleId } : item,
        ),
      };
    }).then((saved) => {
      if (saved) this.render(token.id);
    });
  }

  private renderSecret(section: HTMLElement, token: PluginToken): void {
    const secret = field(section, "Bearer token", "••••••••••••••••");
    secret.type = "password";
    secret.readOnly = true;
    secret.autocomplete = "off";
    secret.spellcheck = false;
    const actions = element(section, "div", "", "mcp-actions");
    const prompt = element(section, "div", "", "mcp-confirmation");
    const reveal = button(actions, "Reveal Token…", () => {
      if (secret.type === "text") {
        secret.type = "password";
        secret.value = "••••••••••••••••";
        reveal.textContent = "Reveal Token…";
      } else
        this.withSecret(prompt, () => {
          secret.value = token.token;
          secret.type = "text";
          reveal.textContent = "Hide Token";
        });
    });
    button(actions, "Copy Token…", () =>
      this.withSecret(prompt, () => this.copy(prompt, token.token)),
    );
    button(actions, "Copy Connection JSON…", () =>
      this.withSecret(prompt, () => this.copyConnection(prompt, token)),
    );
  }

  private copyConnection(
    prompt: HTMLElement,
    token: PluginToken,
  ): void | Promise<void> {
    const { host, port } = this.plugin.settings;
    const urlHost =
      host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const url = this.connectionUrl
      ? this.connectionUrl()
      : port
        ? `http://${urlHost}:${port}/mcp`
        : null;
    if (!url) {
      prompt.textContent =
        "Start the server to choose an available port before copying connection JSON.";
      return;
    }
    const snippet = {
      mcpServers: {
        obsidian: { url, headers: { Authorization: `Bearer ${token.token}` } },
      },
    };
    return this.copy(prompt, JSON.stringify(snippet, null, 2));
  }

  private withSecret(
    parent: HTMLElement,
    action: () => void | Promise<void>,
  ): void {
    if (this.acknowledgedSecrets) {
      void action();
      return;
    }
    confirmInline(
      parent,
      "Protect This Token",
      "Anyone with this token can use its role. Revealing it exposes it on screen; copying puts it on the clipboard. Keep connection JSON private.",
      "Continue",
      async () => {
        this.acknowledgedSecrets = true;
        parent.replaceChildren();
        await action();
      },
    );
  }

  private async copy(parent: HTMLElement, text: string): Promise<void> {
    try {
      const clipboard = parent.ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error("Clipboard unavailable.");
      await clipboard.writeText(text);
      parent.textContent = "Copied. The clipboard contains a secret.";
    } catch {
      parent.textContent =
        "Could not copy. Check clipboard access and try again.";
    }
  }

  private renderLifecycle(section: HTMLElement, token: PluginToken): void {
    const actions = element(section, "div", "", "mcp-actions");
    const prompt = element(section, "div", "", "mcp-confirmation");
    button(actions, "Regenerate Token…", () =>
      confirmInline(
        prompt,
        `Regenerate ${token.label}?`,
        "The old token stops working and its sessions close. Update the client with the new token and reinitialize. This cannot be undone.",
        "Regenerate Token",
        () => this.changeToken(token, false, prompt),
      ),
    );
    button(actions, "Revoke Token…", () =>
      confirmInline(
        prompt,
        `Revoke ${token.label}?`,
        "This token is removed and its sessions close. Clients using it lose access. This cannot be undone.",
        "Revoke Token",
        () => this.changeToken(token, true, prompt),
      ),
    );
  }

  private async changeToken(
    token: PluginToken,
    revoke: boolean,
    prompt: HTMLElement,
  ): Promise<void> {
    const saved = await save(this.plugin, prompt, (current) => {
      const existing = current.tokens.find((item) => item.id === token.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(token))
        throw new Error("Token changed.");
      return {
        ...current,
        tokens: revoke
          ? current.tokens.filter((item) => item.id !== token.id)
          : current.tokens.map((item) =>
              item.id === token.id
                ? { ...item, token: generateBearerToken() }
                : item,
            ),
      };
    });
    if (saved) this.render(revoke ? "" : token.id);
  }
}
