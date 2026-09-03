export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = { [key: string]: unknown; type?: string | string[]; title?: string; description?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; additionalProperties?: boolean | JsonSchema; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; allOf?: JsonSchema[]; enum?: JsonValue[]; const?: JsonValue; required?: string[]; default?: JsonValue; format?: string; readOnly?: boolean };
export type SettingHint = { label?: string; help?: string; sensitive?: boolean; advanced?: boolean; group?: string; order?: number };
export type SettingsCatalog = { version: string; roots: { key: string; title: string; description: string }[] };
export type SettingsDocument = { lease: string; root: string; hash: string; schema: JsonSchema; hints: Record<string, SettingHint>; value: JsonValue; protectedValues: string[] };
export type GatewaySettingsApi = {
  catalog(): Promise<import('./contract').Result<SettingsCatalog>>;
  section(root: string): Promise<import('./contract').Result<SettingsDocument>>;
  save(lease: string, value: JsonValue): Promise<import('./contract').Result<void>>;
};
export const isProtectedSetting = (value: unknown): value is string => typeof value === 'string' && /^__PINCER_PROTECTED_[a-f0-9-]+__$/.test(value);
export function settingHint(hints: Record<string, SettingHint>, path: string[]): SettingHint {
  const exact = hints[path.join('.')]; if (exact) return exact;
  return Object.entries(hints).find(([key]) => { const parts = key.replace(/\[\]/g, '.*').split('.'); return parts.length === path.length && parts.every((part, i) => part === '*' || part === path[i]); })?.[1] || {};
}
export function resolveSchema(schema: JsonSchema, value: unknown): JsonSchema {
  const variants = schema.anyOf || schema.oneOf;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const branch = variants?.find(v => v.const !== undefined && v.const === value) || variants?.find(v => v.type === type) || variants?.[0];
  const all = (schema.allOf || []).reduce((out, part) => ({ ...out, ...part, properties: { ...out.properties, ...part.properties } }), {} as JsonSchema);
  return { ...schema, ...all, ...branch, properties: { ...schema.properties, ...all.properties, ...branch?.properties } };
}
