type ConfiguredModelOption = { modelRef: string; label: string };
const splitModelRef = (raw?: string | null) => raw?.includes('/') ? { modelId: raw.slice(raw.indexOf('/') + 1) } : null;

export const THINKING_LEVELS = [
  'off',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'adaptive',
  'max',
  'ultra',
] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];

export interface ParsedModelVariant {
  baseKey: string;
  baseId: string;
  level: ThinkingLevel;
  explicitLevel: boolean;
}

export interface ConfiguredModelGroup {
  baseKey: string;
  baseId: string;
  variants: Partial<Record<ThinkingLevel, ConfiguredModelOption>>;
  original: ConfiguredModelOption;
  explicitThinking: boolean;
}

const MODEL_ABBREVIATIONS = new Map([
  ['ai', 'AI'],
  ['api', 'API'],
  ['gpt', 'GPT'],
  ['llm', 'LLM'],
  ['mcp', 'MCP'],
  ['ocr', 'OCR'],
  ['vl', 'VL'],
]);

/** Names that cannot be derived reliably from an id alone. */
const EXPLICIT_MODEL_NAMES: Readonly<Record<string, string>> = {
  'gemini-pro-agent': 'Gemini Pro Agent',
  'gpt-5.6-sol': 'GPT 5.6 Sol',
  'gpt-5-6-sol': 'GPT 5.6 Sol',
};

export function parseModelVariant(raw: string | null | undefined): ParsedModelVariant {
  const source = typeof raw === 'string' ? raw.trim() : '';
  if (!source) return { baseKey: 'unknown', baseId: 'unknown', level: 'off', explicitLevel: false };

  // The first segment is the provider; retain every remaining namespace
  // segment in the grouping key so equally named models never collapse.
  const modelPath = source.includes('/') ? source.slice(source.indexOf('/') + 1) : source;
  const separator = modelPath.lastIndexOf('/');
  const namespace = separator >= 0 ? modelPath.slice(0, separator + 1) : '';
  const leaf = separator >= 0 ? modelPath.slice(separator + 1) : modelPath;
  const qualifiedKey = (base: string) => `${namespace}${base}`.toLowerCase();

  let baseId = leaf;
  let level: ThinkingLevel = 'off';
  let explicitLevel = false;
  const suffix = baseId.match(new RegExp(`-(${THINKING_LEVELS.join('|')})$`, 'i'));
  if (suffix) {
    level = suffix[1].toLowerCase() as ThinkingLevel;
    baseId = baseId.slice(0, -suffix[0].length);
    explicitLevel = true;
  }
  baseId = baseId.replace(/[-_\s]thinking$/i, '');
  return { baseKey: qualifiedKey(baseId), baseId, level, explicitLevel };
}

function normalizeDisplayVersion(value: string): string {
  return value
    .replace(/\b(Claude(?:\s+(?:Opus|Sonnet|Haiku))?)\s+(\d+)\s+(\d+)\b/gi, '$1 $2.$3')
    .replace(/\bClaude\s+(\d+(?:\.\d+)?)\s+(Opus|Sonnet|Haiku)\b/gi, 'Claude $2 $1');
}

export function formatAutomaticModelName(raw: string | null | undefined): string {
  const { baseId } = parseModelVariant(raw);
  if (baseId === 'unknown') return 'Model';
  const explicitName = EXPLICIT_MODEL_NAMES[baseId.toLowerCase()];
  if (explicitName) return explicitName;
  if (/claude-?3[.-]?5-?sonnet/i.test(baseId) || /claude.*sonnet.*3[.-]?5/i.test(baseId)) return 'Claude Sonnet 3.5';
  if (/claude-?3[.-]?5-?haiku/i.test(baseId) || /claude.*haiku.*3[.-]?5/i.test(baseId)) return 'Claude Haiku 3.5';

  const normalizedBaseId = baseId.replace(/\b((?:gpt|gemini|claude)(?:-[a-z]+)*?)-(\d+)-(\d+)(?=-|$)/gi, '$1-$2.$3');
  return normalizeDisplayVersion(normalizedBaseId
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(?:\.\d+)+$/.test(part)) return part;
      const abbreviation = MODEL_ABBREVIATIONS.get(part.toLowerCase());
      if (abbreviation) return abbreviation;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/(Claude)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)/gi, '$1 $3 $2')
    .replace(/\s+/g, ' ')
    .trim());
}

export function resolveModelDisplayName(
  raw: string | null | undefined,
  userOverride?: string | null,
  explicitLabel?: string | null,
): string {
  const override = userOverride?.trim();
  if (override) return override;
  const explicit = explicitLabel?.trim();
  const rawModelId = splitModelRef(raw)?.modelId || raw?.trim();
  // Catalogs often repeat the raw id in `name`; that is not a human-authored
  // mapping and should still receive the automatic formatter.
  const generatedProviderLabel = rawModelId ? explicit?.startsWith(`${rawModelId} (`) : false;
  if (explicit && explicit !== raw && explicit !== rawModelId && !generatedProviderLabel) return normalizeDisplayVersion(explicit);
  return formatAutomaticModelName(raw) || raw?.trim() || 'Model';
}

export function modelRouteLabel(modelRef: string): string {
  const first = modelRef.indexOf('/'); const last = modelRef.lastIndexOf('/');
  const provider = first < 0 ? modelRef : modelRef.slice(0, first);
  return last > first ? `${modelRef.slice(first + 1, last)} · ${provider}` : provider;
}

export function groupConfiguredModels(options: ConfiguredModelOption[]): ConfiguredModelGroup[] {
  const groups = new Map<string, ConfiguredModelGroup>();
  for (const option of options) {
    const parsed = parseModelVariant(option.modelRef);
    const group = groups.get(parsed.baseKey) ?? {
      baseKey: parsed.baseKey,
      baseId: parsed.baseId,
      variants: {},
      original: option,
      explicitThinking: false,
    };
    if (parsed.explicitLevel) group.variants[parsed.level] = option;
    group.explicitThinking ||= parsed.explicitLevel;
    if (!parsed.explicitLevel) group.original = option;
    groups.set(parsed.baseKey, group);
  }
  return [...groups.values()];
}

export function resolveGroupVariant(
  group: ConfiguredModelGroup,
  preferredLevel?: string | null,
): ConfiguredModelOption {
  const preferred = THINKING_LEVELS.includes(preferredLevel as ThinkingLevel)
    ? preferredLevel as ThinkingLevel
    : null;
  if (preferred && group.variants[preferred]) return group.variants[preferred]!;
  return group.original;
}

export function availableThinkingLevels(group: ConfiguredModelGroup | null): ThinkingLevel[] {
  if (!group) return [];
  return THINKING_LEVELS.filter((level) => Boolean(group.variants[level]));
}

export function thinkingLevelLabel(level: string): string {
  if (level === 'none') return 'Off';
  if (level === 'xhigh') return 'Xhigh';
  if (level === 'adaptive') return 'Adaptive';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function normalizeThinkingLevel(value: string | null | undefined): ThinkingLevel | null {
  const normalized = value?.trim().toLowerCase();
  return THINKING_LEVELS.includes(normalized as ThinkingLevel)
    ? normalized as ThinkingLevel
    : null;
}
