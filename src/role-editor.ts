import {
  TOOL_CATEGORIES,
  createRole,
  duplicateRole,
  getRoleTokens,
  removeRole,
  type PluginRole,
  type Settings,
} from "./settings-model";
import {
  button,
  element,
  field,
  roleOptions,
  save,
  confirmInline,
  type SettingsPlugin,
} from "./settings-ui";

const TOOL_WARNINGS: Readonly<Record<string, string>> = {
  delete_note: "Includes permanent deletion.",
  move_note: "Can rewrite links in other notes.",
  index_vault:
    "Sends note text to the configured embedding provider and writes a persistent index.",
  search_semantic:
    "Sends the search query to the configured embedding provider. Does not grant indexing.",
};

function impact(settings: Settings, roleId: string): string {
  return JSON.stringify(
    getRoleTokens(settings, roleId).map(({ id, label }) => [id, label]),
  );
}

export class RoleEditor {
  private selected = "";
  private draft: PluginRole | null = null;
  private original = "";
  private afterSave: ((id: string) => void) | undefined;
  private body: HTMLElement;
  private prompt: HTMLElement;
  private select: HTMLSelectElement;

  constructor(
    private parent: HTMLElement,
    private plugin: SettingsPlugin,
    private changed: () => void,
  ) {
    element(parent, "h3", "Roles");
    element(
      parent,
      "p",
      "Roles save explicit tool names. New tools stay disabled in saved roles, including Full Access.",
      "setting-item-description",
    );
    const controls = element(parent, "div", "", "mcp-actions");
    const label = element(controls, "label", "Role ");
    this.select = element(label, "select");
    this.select.setAttribute("aria-label", "Role");
    this.select.addEventListener("change", () => {
      const selected = this.select.value;
      this.request(() => this.edit(selected, true));
    });
    button(controls, "Create Custom Role…", () => this.beginCreate());
    button(controls, "Duplicate Role…", () =>
      this.request(() => this.duplicate()),
    );
    button(controls, "Delete Role…", () => this.request(() => this.remove()));
    this.prompt = element(parent, "div", "", "mcp-confirmation");
    this.body = element(parent, "div");
    this.edit(plugin.settings.roles[0]?.id ?? "");
  }

  beginCreate(afterSave?: (id: string) => void): void {
    this.request(() => {
      this.afterSave = afterSave;
      this.selected = "";
      this.draft = createRole("");
      this.original = "";
      this.render();
      this.body.querySelector("input")?.focus();
      this.parent.scrollIntoView({ block: "nearest" });
    });
  }

  private edit(id: string, focus = false): void {
    this.selected = id;
    const role = this.plugin.settings.roles.find((item) => item.id === id);
    this.draft = role ? { ...role, tools: [...role.tools] } : null;
    this.original = role ? JSON.stringify(role) : "";
    this.afterSave = undefined;
    this.prompt.replaceChildren();
    this.render();
    if (focus) this.select.focus();
  }

  private dirty(): boolean {
    return this.draft !== null && JSON.stringify(this.draft) !== this.original;
  }

  private request(action: () => void): void {
    if (!this.dirty()) {
      action();
      return;
    }
    this.select.value = this.selected;
    this.prompt.replaceChildren();
    element(this.prompt, "p", "This role has unsaved changes.");
    button(this.prompt, "Save Changes", () => this.reviewSave(action));
    button(this.prompt, "Discard Changes", () => {
      this.prompt.replaceChildren();
      action();
    });
    button(this.prompt, "Cancel", () => {
      this.prompt.replaceChildren();
      this.select.focus();
    });
  }

  private duplicate(): void {
    const source = this.plugin.settings.roles.find(
      (role) => role.id === this.selected,
    );
    if (!source) return;
    this.draft = duplicateRole(source);
    this.selected = "";
    this.original = "";
    this.afterSave = undefined;
    this.render();
    this.body.querySelector("input")?.focus();
  }

  private remove(): void {
    const role = this.plugin.settings.roles.find(
      (item) => item.id === this.selected,
    );
    if (!role) return;
    const assigned = getRoleTokens(this.plugin.settings, role.id);
    if (assigned.length) {
      this.prompt.replaceChildren();
      element(
        this.prompt,
        "p",
        `Reassign or revoke these tokens before deleting ${role.name}: ${assigned.map((item) => item.label).join(", ")}.`,
      );
      return;
    }
    confirmInline(
      this.prompt,
      `Delete ${role.name}?`,
      "This removes the saved role. Tokens are not revoked.",
      "Delete Role",
      async () => {
        if (
          await save(this.plugin, this.prompt, (current) =>
            removeRole(current, role.id),
          )
        ) {
          this.edit(this.plugin.settings.roles[0]?.id ?? "", true);
          this.changed();
        }
      },
    );
  }

  private render(): void {
    roleOptions(this.select, this.plugin.settings, this.selected);
    this.body.replaceChildren();
    if (!this.draft) {
      element(this.body, "p", "Create a role to choose its tools.");
      return;
    }
    const name = field(this.body, "Role name", this.draft.name);
    name.addEventListener("input", () => {
      this.prompt.replaceChildren();
      this.draft = { ...this.draft!, name: name.value };
    });
    element(
      this.body,
      "p",
      "Editing tools can destroy existing content even without delete_note. Search only can return snippets and metadata. Write only excludes dedicated retrieval tools, but mutation responses may include existing content or metadata.",
      "setting-item-description",
    );
    for (const category of TOOL_CATEGORIES) this.renderCategory(category);
    const actions = element(this.body, "div", "", "mcp-actions");
    button(actions, "Review and Save Role", () => this.reviewSave());
    button(actions, "Cancel Changes", () =>
      this.edit(this.selected || this.plugin.settings.roles[0]?.id || "", true),
    );
  }

  private renderCategory(category: (typeof TOOL_CATEGORIES)[number]): void {
    const group = element(this.body, "div", "", "mcp-tool-category");
    const allLabel = element(group, "label", "", "mcp-category-toggle");
    const all = element(allLabel, "input");
    all.type = "checkbox";
    element(allLabel, "span", `Select all ${category.name} tools`);
    const details = element(group, "details");
    const summary = element(details, "summary");
    const count = (): number =>
      category.tools.filter((tool) => this.draft!.tools.includes(tool)).length;
    const update = (): void => {
      const selected = count();
      all.checked = selected === category.tools.length;
      all.indeterminate = selected > 0 && selected < category.tools.length;
      if (all.indeterminate) all.setAttribute("data-indeterminate", "true");
      else all.removeAttribute("data-indeterminate");
      summary.textContent = `${category.name} — ${selected}/${category.tools.length} enabled`;
    };
    const boxes = category.tools.map((tool) =>
      this.renderTool(details, tool, update),
    );
    all.addEventListener("change", () => {
      this.prompt.replaceChildren();
      const tools = new Set(this.draft!.tools);
      category.tools.forEach((tool) =>
        all.checked ? tools.add(tool) : tools.delete(tool),
      );
      this.draft = { ...this.draft!, tools: [...tools] };
      boxes.forEach((box) => {
        box.checked = all.checked;
      });
      update();
    });
    update();
  }

  private renderTool(
    parent: HTMLElement,
    tool: string,
    update: () => void,
  ): HTMLInputElement {
    const label = element(parent, "label", "", "mcp-tool-choice");
    const checkbox = element(label, "input");
    checkbox.type = "checkbox";
    checkbox.checked = this.draft!.tools.includes(tool);
    const text = element(label, "span");
    element(text, "code", tool);
    if (TOOL_WARNINGS[tool])
      element(
        text,
        "span",
        ` ${TOOL_WARNINGS[tool]}`,
        "setting-item-description",
      );
    checkbox.addEventListener("change", () => {
      this.prompt.replaceChildren();
      const tools = new Set(this.draft!.tools);
      checkbox.checked ? tools.add(tool) : tools.delete(tool);
      this.draft = { ...this.draft!, tools: [...tools] };
      update();
    });
    return checkbox;
  }

  private reviewSave(next?: () => void): void {
    if (!this.draft) return;
    this.prompt.replaceChildren();
    if (!this.draft.name.trim()) {
      element(this.prompt, "p", "Enter a role name before saving.");
      return;
    }
    const draft = {
      ...this.draft,
      name: this.draft.name.trim(),
      tools: [...this.draft.tools],
    };
    const original = this.original;
    const reviewed = impact(this.plugin.settings, draft.id);
    const tokens = getRoleTokens(this.plugin.settings, draft.id);
    const description = tokens.length
      ? `Affected tokens: ${tokens.map((token) => token.label).join(", ")}. Their active sessions close when tool permissions change; clients must reinitialize after those changes.`
      : "No tokens are assigned to this role. An empty tool selection grants no tools.";
    confirmInline(
      this.prompt,
      `Save ${draft.name}?`,
      description,
      "Save Role",
      () => this.saveReviewed(draft, original, reviewed, next),
    );
  }

  private async saveReviewed(
    draft: PluginRole,
    original: string,
    reviewed: string,
    next?: () => void,
  ): Promise<void> {
    const saved = await save(this.plugin, this.prompt, (current) => {
      const existing = current.roles.find((role) => role.id === draft.id);
      if (
        (existing ? JSON.stringify(existing) : "") !== original ||
        impact(current, draft.id) !== reviewed
      ) {
        throw new Error("Role changed during review.");
      }
      return {
        ...current,
        roles: existing
          ? current.roles.map((role) => (role.id === draft.id ? draft : role))
          : [...current.roles, draft],
      };
    });
    if (!saved) return;
    const assigned = this.afterSave;
    this.edit(draft.id, true);
    this.changed();
    assigned?.(draft.id);
    next?.();
  }
}
