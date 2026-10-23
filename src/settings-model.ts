import { normalizeHostEntries } from "./hosts";
import { randomBytes, randomUUID } from "node:crypto";
import { TOOL_NAMES, type AuthorizationOptions } from "obsidian-mcp-pro";

export interface PluginRole {
  readonly id: string;
  readonly name: string;
  readonly tools: readonly string[];
}
export interface PluginToken {
  readonly id: string;
  readonly label: string;
  readonly token: string;
  readonly roleId: string;
}
export interface Settings {
  readonly schemaVersion: 2;
  readonly host: string;
  readonly port: number;
  readonly vaultName: string;
  readonly autoStart: boolean;
  readonly allowedHosts: readonly string[];
  readonly roles: readonly PluginRole[];
  readonly tokens: readonly PluginToken[];
}
export interface ToolCategory {
  readonly id: string;
  readonly name: string;
  readonly tools: readonly string[];
}
export const TOOL_CATEGORIES: readonly ToolCategory[] = Object.freeze(
  [
    {
      id: "read",
      name: "Read and discover notes",
      tools: [
        "get_note",
        "list_notes",
        "get_daily_note",
        "get_recent_notes",
        "get_vault_stats",
        "resolve_alias",
        "search_notes",
        "search_by_frontmatter",
      ],
    },
    {
      id: "write",
      name: "Create and modify notes",
      tools: [
        "create_note",
        "create_daily_note",
        "append_to_note",
        "prepend_to_note",
        "update_frontmatter",
        "move_note",
        "delete_note",
      ],
    },
    {
      id: "sections",
      name: "Sections and blocks",
      tools: [
        "list_sections",
        "update_section",
        "insert_at_section",
        "edit_block",
        "replace_in_note",
      ],
    },
    {
      id: "tags",
      name: "Tags",
      tools: ["list_tags", "search_by_tag", "rename_tag"],
    },
    {
      id: "links",
      name: "Links and graph",
      tools: [
        "get_backlinks",
        "get_outlinks",
        "get_graph_neighbors",
        "find_broken_links",
        "find_orphans",
      ],
    },
    {
      id: "canvas",
      name: "Canvas",
      tools: [
        "list_canvases",
        "read_canvas",
        "add_canvas_node",
        "add_canvas_edge",
      ],
    },
    {
      id: "bases",
      name: "Bases",
      tools: ["list_bases", "read_base", "query_base"],
    },
    {
      id: "attachments",
      name: "Attachments",
      tools: ["list_attachments", "get_attachment", "find_unused_attachments"],
    },
    {
      id: "semantic",
      name: "Semantic search",
      tools: ["index_vault", "search_semantic", "find_similar_notes"],
    },
  ].map((category) =>
    Object.freeze({ ...category, tools: Object.freeze(category.tools) }),
  ),
);

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  schemaVersion: 2,
  host: "127.0.0.1",
  port: 3333,
  vaultName: "",
  autoStart: false,
  allowedHosts: Object.freeze([]),
  roles: Object.freeze([]),
  tokens: Object.freeze([]),
});
export const generateBearerToken = (): string =>
  randomBytes(32).toString("hex");
export const createToken = (label: string, roleId: string): PluginToken => ({
  id: randomUUID(),
  label,
  token: generateBearerToken(),
  roleId,
});
export const createRole = (
  name: string,
  tools: readonly string[] = [],
): PluginRole => ({ id: randomUUID(), name, tools: [...tools] });
export const duplicateRole = (
  role: PluginRole,
  name = `${role.name} copy`,
): PluginRole => createRole(name, role.tools);
export const getRoleTokens = (
  settings: Settings,
  roleId: string,
): readonly PluginToken[] =>
  settings.tokens.filter((token) => token.roleId === roleId);
export function removeRole(settings: Settings, roleId: string): Settings {
  if (getRoleTokens(settings, roleId).length)
    throw new Error(
      "Reassign or revoke the tokens using this role before removing it.",
    );
  return {
    ...settings,
    roles: settings.roles.filter((role) => role.id !== roleId),
  };
}
export function createPresetRoles(): PluginRole[] {
  const category = (id: string): readonly string[] =>
    TOOL_CATEGORIES.find((group) => group.id === id)!.tools;
  return [
    { id: "full-access", name: "Full Access", tools: [...TOOL_NAMES] },
    {
      id: "read-only",
      name: "Read only",
      tools: [
        ...category("read"),
        ...category("links"),
        ...category("bases"),
        ...category("attachments"),
        "list_sections",
        "list_tags",
        "search_by_tag",
        "list_canvases",
        "read_canvas",
        "search_semantic",
        "find_similar_notes",
      ],
    },
    {
      id: "search-only",
      name: "Search only",
      tools: [
        "search_notes",
        "search_by_frontmatter",
        "search_by_tag",
        "search_semantic",
        "find_similar_notes",
        "query_base",
      ],
    },
    {
      id: "write-only",
      name: "Write only",
      tools: [
        "create_note",
        "create_daily_note",
        "append_to_note",
        "prepend_to_note",
        "update_frontmatter",
        "update_section",
        "insert_at_section",
        "edit_block",
        "replace_in_note",
        "rename_tag",
        "add_canvas_node",
        "add_canvas_edge",
      ],
    },
    {
      id: "create-only",
      name: "Create-only",
      tools: ["create_note", "create_daily_note"],
    },
    { id: "append-only", name: "Append-only", tools: ["append_to_note"] },
  ];
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid saved MCP settings.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    throw new Error(`Invalid ${label}.`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return Array.from(value);
}
function distinct(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}.`);
}
function readRole(value: unknown): PluginRole {
  const raw = record(value);
  const tools = array(raw.tools, "role tools").map((tool) =>
    text(tool, "tool name"),
  );
  if (tools.some((tool) => !TOOL_NAMES.includes(tool)))
    throw new Error("A saved role references an unknown tool.");
  distinct(tools, "tool name");
  return Object.freeze({
    id: text(raw.id, "role ID"),
    name: text(raw.name, "role name"),
    tools: Object.freeze(tools),
  });
}
function readToken(value: unknown): PluginToken {
  const raw = record(value);
  const token = text(raw.token, "bearer token");
  if (token !== token.trim())
    throw new Error("Bearer tokens cannot contain surrounding whitespace.");
  return Object.freeze({
    id: text(raw.id, "token ID"),
    label: text(raw.label, "token label"),
    token,
    roleId: text(raw.roleId, "token role"),
  });
}
export function validateSettings(value: unknown): Settings {
  const raw = record(value);
  if (raw.schemaVersion !== 2)
    throw new Error("Unsupported MCP settings version.");
  const roles = array(raw.roles, "roles").map(readRole);
  const tokens = array(raw.tokens, "tokens").map(readToken);
  distinct(
    roles.map((role) => role.id),
    "role ID",
  );
  distinct(
    tokens.map((token) => token.id),
    "token ID",
  );
  distinct(
    tokens.map((token) => token.token),
    "bearer token",
  );
  if (tokens.some((token) => !roles.some((role) => role.id === token.roleId)))
    throw new Error("A saved token references an unknown role.");
  const host = text(raw.host, "bind address");
  if (host !== host.trim()) throw new Error("Invalid bind address.");
  if (
    typeof raw.port !== "number" ||
    !Number.isInteger(raw.port) ||
    raw.port < 0 ||
    raw.port > 65535
  )
    throw new Error("Invalid port.");
  if (typeof raw.autoStart !== "boolean")
    throw new Error("Invalid auto-start setting.");
  const allowedHosts = normalizeHostEntries(
    array(raw.allowedHosts, "allowed hosts").map((host) =>
      text(host, "allowed host"),
    ),
  );
  return Object.freeze({
    schemaVersion: 2,
    host,
    port: raw.port,
    vaultName: text(raw.vaultName, "vault name", true),
    autoStart: raw.autoStart,
    allowedHosts: Object.freeze(allowedHosts),
    roles: Object.freeze(roles),
    tokens: Object.freeze(tokens),
  });
}
export function loadSettingsData(value: unknown): {
  settings: Settings;
  migrated: boolean;
} {
  const raw = value == null ? {} : record(value);
  if (Object.hasOwn(raw, "schemaVersion"))
    return { settings: validateSettings(raw), migrated: false };
  if (Object.hasOwn(raw, "roles") || Object.hasOwn(raw, "tokens"))
    throw new Error("Role settings are missing their schema version.");
  const bearer =
    raw.bearerToken === undefined
      ? ""
      : text(raw.bearerToken, "legacy bearer token", true).trim();
  const token = createToken("Default token", "full-access");
  const settings = validateSettings({
    ...DEFAULT_SETTINGS,
    host: raw.host ?? DEFAULT_SETTINGS.host,
    port: raw.port ?? DEFAULT_SETTINGS.port,
    vaultName: raw.vaultName ?? DEFAULT_SETTINGS.vaultName,
    autoStart: raw.autoStart ?? DEFAULT_SETTINGS.autoStart,
    allowedHosts: raw.allowedHosts ?? [],
    roles: createPresetRoles(),
    tokens: [{ ...token, token: bearer || token.token }],
  });
  return { settings, migrated: true };
}
export function toAuthorization(settings: Settings): AuthorizationOptions {
  return {
    roles: settings.roles.map(({ id, tools }) => ({ id, tools })),
    tokens: settings.tokens.map(({ token, roleId }) => ({ token, roleId })),
  };
}
