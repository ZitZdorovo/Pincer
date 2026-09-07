import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, LockKeyhole, Plus, RefreshCw, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Select } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { cn } from '../lib/utils';
import { usePreferences } from '../preferences';
import {
  isProtectedSetting,
  resolveSchema,
  settingHint,
  type JsonSchema,
  type JsonValue,
  type SettingHint,
  type SettingsCatalog,
  type SettingsDocument,
} from '../../shared/settings';
import { gatewayCategories, rootLabels } from './settings-categories';
import { russianEnumValue, russianSettingHelp, russianSettingLabel } from './settings-localization';

const objectValue = (value: unknown): Record<string, JsonValue> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {};

const seed = (schema: JsonSchema): JsonValue => {
  const node = resolveSchema(schema, undefined);
  if (node.default !== undefined) return node.default;
  if (node.const !== undefined) return node.const;
  if (node.type === 'object' || node.properties) {
    return Object.fromEntries(Object.entries(node.properties || {})
      .filter(([, child]) => child.const !== undefined)
      .map(([key, child]) => [key, child.const!]));
  }
  if (node.type === 'array') return [];
  if (node.type === 'boolean') return false;
  if (node.type === 'number' || node.type === 'integer') return 0;
  return '';
};

const errorText = (code: string, ru: boolean) => ({
  CONFIG_CONFLICT: ru ? 'Конфигурация уже изменилась на Gateway. Обновите страницу и повторите правки.' : 'The Gateway configuration changed. Reload the page and reapply your edits.',
  SECRET_REFERENCE_MOVED: ru ? 'Скрытый секрет нельзя перемещать. Оставьте его на прежнем месте или введите заново.' : 'A hidden secret cannot be moved. Keep it in place or enter it again.',
  NEW_DESTINATION_REQUIRES_NEW_KEY: ru ? 'После смены адреса нужно заново указать ключ. Сохранённый секрет не отправляется на новый сервер.' : 'Enter the key again after changing an endpoint. Stored credentials are never forwarded to a new server.',
  SETTINGS_SAVE_FAILED: ru ? 'Gateway отклонил изменения. Проверьте значения и обязательные поля.' : 'The Gateway rejected the changes. Check the values and required fields.',
  SETTINGS_RELOAD_REQUIRED: ru ? 'Снимок настроек устарел. Обновите раздел.' : 'This settings snapshot expired. Reload the section.',
}[code] || code);

const categoryDescriptions: Record<string, [string, string]> = {
  appearance: ['Настройки пользовательского интерфейса OpenClaw.', 'OpenClaw user interface preferences.'],
  communications: ['Сообщения, голос, вложения и правила доставки.', 'Messages, voice, attachments, and delivery rules.'],
  talk: ['Настройки разговорного режима и голосовой среды.', 'Talk mode and realtime voice configuration.'],
  labs: ['Экспериментальные возможности Gateway.', 'Experimental Gateway capabilities.'],
  mcp: ['MCP-приложения и серверы.', 'MCP applications and servers.'],
  security: ['Политики безопасности и маршрутизация подтверждений.', 'Security policies and approval routing.'],
  secrets: ['Провайдеры секретов и профили авторизации.', 'Secret providers and authentication profiles.'],
  infrastructure: ['Gateway, браузер, Node Host, обнаружение и ACP.', 'Gateway, browser, Node Host, discovery, and ACP.'],
  advanced: ['Все остальные разделы схемы и редактор конфигурации.', 'Every remaining schema section and configuration editor.'],
};

const tabGroups: Record<string, { id: string; ru: string; en: string; roots: string[] }[]> = {
  communications: [
    { id: 'messages', ru: 'Сообщения', en: 'Messages', roots: ['messages', 'broadcast', 'attachments'] },
    { id: 'voice', ru: 'Голос', en: 'Voice', roots: ['tts'] },
  ],
  infrastructure: [
    { id: 'gateway', ru: 'Gateway', en: 'Gateway', roots: ['gateway'] },
    { id: 'browser', ru: 'Браузер', en: 'Browser', roots: ['browser'] },
    { id: 'nodeHost', ru: 'Node Host', en: 'Node Host', roots: ['nodeHost'] },
    { id: 'discovery', ru: 'Обнаружение', en: 'Discovery', roots: ['discovery'] },
    { id: 'acp', ru: 'ACP', en: 'ACP', roots: ['acp'] },
  ],
  automation: [
    { id: 'commands', ru: 'Команды', en: 'Commands', roots: ['commands'] },
    { id: 'hooks', ru: 'Обработчики', en: 'Hooks', roots: ['hooks'] },
    { id: 'bindings', ru: 'Привязки', en: 'Bindings', roots: ['bindings'] },
    { id: 'cron', ru: 'Cron', en: 'Cron', roots: ['cron'] },
    { id: 'plugins', ru: 'Плагины', en: 'Plugins', roots: ['plugins'] },
  ],
  security: [
    { id: 'security', ru: 'Политика безопасности', en: 'Security policy', roots: ['security', 'accessGroups', 'tools', 'browser', 'telemetry'] },
    { id: 'approvals', ru: 'Одобрения', en: 'Approvals', roots: ['approvals'] },
  ],
  appearance: [{ id: 'ui', ru: 'Интерфейс', en: 'Interface', roots: ['ui'] }],
};

function fieldLabel(path: string[], schema: JsonSchema, hint: SettingHint, ru = false) {
  const source = hint.label || schema.title || path.at(-1) || '';
  return ru ? russianSettingLabel(path, source) : source;
}

function fieldHelp(path: string[], schema: JsonSchema, hint: SettingHint, ru = false) {
  const source = hint.help || schema.description;
  return ru ? russianSettingHelp(source, fieldLabel(path, schema, hint, true)) : source;
}

function schemaMatchesQuery(schema: JsonSchema, value: JsonValue | undefined, path: string[], hints: Record<string, SettingHint>, query: string, ru: boolean, depth = 0): boolean {
  if (!query || depth > 28) return !query;
  const node = resolveSchema(schema, value);
  const hint = settingHint(hints, path);
  const needle = query.toLocaleLowerCase();
  if (`${path.join('.')} ${fieldLabel(path, node, hint, ru)} ${fieldHelp(path, node, hint, ru) || ''}`.toLocaleLowerCase().includes(needle)) return true;
  if (Array.isArray(value)) return value.some((item, index) => schemaMatchesQuery(node.items || {}, item, [...path, String(index)], hints, query, ru, depth + 1));
  const data = objectValue(value);
  const keys = [...new Set([...Object.keys(node.properties || {}), ...Object.keys(data)])];
  return keys.some((key) => schemaMatchesQuery(node.properties?.[key] || (typeof node.additionalProperties === 'object' ? node.additionalProperties : {}), data[key], [...path, key], hints, query, ru, depth + 1));
}

function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0 || tabs.length === 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
}

function JsonEditor({ label, value, set, sensitive }: { label: string; value: JsonValue | undefined; set(value: JsonValue | undefined): void; sensitive?: boolean }) {
  const ru = usePreferences().language === 'ru';
  const [text, setText] = useState(() => isProtectedSetting(value) ? '' : JSON.stringify(value ?? null, null, 2));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(isProtectedSetting(value) ? '' : JSON.stringify(value ?? null, null, 2)); setInvalid(false); }, [value]);
  return <div className="space-y-2">
    <textarea aria-label={label} spellCheck={false} autoComplete="off" className="min-h-32 w-full rounded-xl border border-border bg-surface-input p-3 font-mono text-xs outline-none focus:border-primary/50" placeholder={sensitive ? (ru ? 'Секрет сохранён. Введите JSON только для замены.' : 'Secret stored. Enter JSON only to replace it.') : 'JSON'} value={text} onChange={(event) => { setText(event.target.value); setInvalid(false); }} />
    <div className="flex items-center justify-between gap-3">{invalid ? <p role="alert" className="text-xs text-destructive">{ru ? 'Некорректный JSON.' : 'Invalid JSON.'}</p> : <span />}<Button size="sm" variant="outline" type="button" onClick={() => { try { set(JSON.parse(text) as JsonValue); setInvalid(false); } catch { setInvalid(true); } }}>{ru ? 'Применить к черновику' : 'Apply to draft'}</Button></div>
  </div>;
}

function PrimitiveControl({ schema, value, set, path, hint }: { schema: JsonSchema; value?: JsonValue; set(value: JsonValue | undefined): void; path: string[]; hint: SettingHint }) {
  const ru = usePreferences().language === 'ru';
  const variants = schema.anyOf || schema.oneOf;
  const enumValues = schema.enum || (variants?.length && variants.every((item) => item.const !== undefined) ? variants.map((item) => item.const!) : undefined) || (schema.const !== undefined ? [schema.const] : []);
  const protectedValue = isProtectedSetting(value);
  const sensitive = hint.sensitive === true || schema.format === 'password' || protectedValue;
  const label = fieldLabel(path, schema, hint, ru);
  if (enumValues.length > 0 && enumValues.length <= 5 && enumValues.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
    return <div className="oc-segmented" role="radiogroup" aria-label={label}>{enumValues.map((item) => <button key={JSON.stringify(item)} type="button" role="radio" aria-checked={value === item} className={cn('oc-segmented-option', value === item && 'is-active')} onClick={() => set(item)}>{typeof item === 'boolean' ? (item ? (ru ? 'Вкл' : 'On') : (ru ? 'Выкл.' : 'Off')) : ru ? russianEnumValue(item) : String(item)}</button>)}</div>;
  }
  if (enumValues.length > 0) {
    return <Select aria-label={label} value={value === undefined ? '' : JSON.stringify(value)} onChange={(event) => set(event.target.value ? JSON.parse(event.target.value) as JsonValue : undefined)}><option value="">{ru ? 'Выбрать…' : 'Select…'}</option>{enumValues.map((item) => <option key={JSON.stringify(item)} value={JSON.stringify(item)}>{ru ? russianEnumValue(item) : String(item)}</option>)}</Select>;
  }
  if (schema.type === 'boolean' || typeof value === 'boolean') return <Switch aria-label={label} checked={value === true} onCheckedChange={(checked) => set(checked)} />;
  if (schema.type === 'number' || schema.type === 'integer' || typeof value === 'number') return <Input aria-label={label} type="number" step={schema.type === 'integer' ? 1 : 'any'} value={typeof value === 'number' ? value : ''} placeholder={ru ? 'По умолчанию' : 'Default'} onChange={(event) => set(event.target.value === '' ? undefined : Number(event.target.value))} />;
  return <Input aria-label={label} type={sensitive ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={protectedValue ? '' : value === undefined || value === null ? '' : String(value)} placeholder={protectedValue ? (ru ? 'Сохранено · пустое поле не изменит секрет' : 'Stored · blank keeps the secret') : (ru ? 'Не задано' : 'Not set')} onChange={(event) => set(protectedValue && event.target.value === '' ? value : event.target.value)} />;
}

function SettingField({ schema: rawSchema, value, set, path, hints, depth = 0, query = '' }: { schema: JsonSchema; value?: JsonValue; set(value: JsonValue | undefined): void; path: string[]; hints: Record<string, SettingHint>; depth?: number; query?: string }) {
  const ru = usePreferences().language === 'ru';
  const [newKey, setNewKey] = useState('');
  const [variant, setVariant] = useState<number | null>(null);
  const [raw, setRaw] = useState(false);
  const variants = rawSchema.anyOf || rawSchema.oneOf;
  const schema = resolveSchema(variant !== null && variants?.[variant] ? variants[variant] : rawSchema, value);
  const hint = settingHint(hints, path);
  const label = fieldLabel(path, schema, hint, ru);
  const help = fieldHelp(path, schema, hint, ru);
  const protectedValue = isProtectedSetting(value);
  const object = !protectedValue && (schema.type === 'object' || Boolean(schema.properties) || (value !== null && typeof value === 'object' && !Array.isArray(value)));
  const array = !protectedValue && (schema.type === 'array' || Array.isArray(value));
  const fieldPath = path.join('.');
  const childKeys = [...new Set([...Object.keys(schema.properties || {}), ...Object.keys(objectValue(value))])].sort((a, b) => (settingHint(hints, [...path, a]).order ?? Number.MAX_SAFE_INTEGER) - (settingHint(hints, [...path, b]).order ?? Number.MAX_SAFE_INTEGER));
  const searchText = `${fieldPath} ${label} ${help || ''}`.toLocaleLowerCase();
  const descendantMatches = childKeys.some((key) => schemaMatchesQuery(schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {}), objectValue(value)[key], [...path, key], hints, query, ru));
  if (query && !searchText.includes(query.toLocaleLowerCase()) && !descendantMatches) return null;
  if (depth > 28) return <JsonEditor label={fieldPath} value={value} set={set} />;
  const childSet = (key: string, next: JsonValue | undefined) => { const copy = { ...objectValue(value) }; if (next === undefined) delete copy[key]; else copy[key] = next; set(copy); };
  if (object) {
    const advancedKeys = childKeys.filter((key) => settingHint(hints, [...path, key]).advanced === true);
    const regularKeys = childKeys.filter((key) => !advancedKeys.includes(key));
    return <details className="oc-setting-group" open={query ? true : depth <= 1} data-setting-path={fieldPath}>
      <summary className="oc-setting-group-summary"><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span>{help && <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{help}</span>}</span><ChevronDown className="oc-setting-chevron h-4 w-4 shrink-0" /></summary>
      <div className="oc-setting-group-body">
        {!!variants?.length && <Select aria-label={`${label} ${ru ? 'тип' : 'type'}`} value={variant ?? ''} onChange={(event) => { const next = Number(event.target.value); setVariant(next); set(seed(variants[next])); }}><option value="" disabled>{ru ? 'Тип значения' : 'Value type'}</option>{variants.map((item, index) => <option key={index} value={index}>{item.title || String(item.type || index + 1)}</option>)}</Select>}
        {regularKeys.map((key) => <SettingField key={key} schema={schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {})} value={objectValue(value)[key]} set={(next) => childSet(key, next)} path={[...path, key]} hints={hints} depth={depth + 1} query={query} />)}
        {advancedKeys.length > 0 && <details className="oc-advanced" open={Boolean(query)}><summary><ChevronDown className="h-3.5 w-3.5" />{ru ? 'РАСШИРЕННЫЕ НАСТРОЙКИ' : 'ADVANCED SETTINGS'}</summary><div className="oc-advanced-body">{advancedKeys.map((key) => <SettingField key={key} schema={schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {})} value={objectValue(value)[key]} set={(next) => childSet(key, next)} path={[...path, key]} hints={hints} depth={depth + 1} query={query} />)}</div></details>}
        {schema.additionalProperties !== undefined && schema.additionalProperties !== false && <div className="oc-add-entry"><Input aria-label={`${label} ${ru ? 'новая запись' : 'new entry'}`} value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={ru ? 'Имя новой записи' : 'New entry name'} /><Button size="sm" variant="outline" disabled={!newKey.trim() || Object.hasOwn(objectValue(value), newKey.trim()) || ['__proto__', 'prototype', 'constructor'].includes(newKey.trim())} onClick={() => { const key = newKey.trim(); childSet(key, seed(typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {})); setNewKey(''); }}><Plus className="mr-2 h-4 w-4" />{ru ? 'Добавить' : 'Add'}</Button></div>}
      </div>
    </details>;
  }
  if (array) {
    const items = Array.isArray(value) ? value : [];
    return <div className="oc-array-field" data-setting-path={fieldPath}><div className="oc-setting-row-heading"><div><p className="text-sm font-medium">{label}</p>{help && <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>}</div><span className="text-xs text-muted-foreground">{items.length} {ru ? 'элементов' : 'items'}</span></div><div className="space-y-2">{items.map((item, index) => <div key={index} className="oc-array-item"><SettingField schema={schema.items || {}} value={item} set={(next) => { const copy = [...items]; if (next === undefined) copy.splice(index, 1); else copy[index] = next; set(copy); }} path={[...path, String(index)]} hints={hints} depth={depth + 1} query={query} /><Button size="icon" variant="ghost" aria-label={ru ? 'Удалить элемент' : 'Remove item'} onClick={() => { const copy = [...items]; copy.splice(index, 1); set(copy); }}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button size="sm" variant="outline" onClick={() => set([...items, seed(schema.items || {})])}><Plus className="mr-2 h-4 w-4" />{ru ? 'Добавить' : 'Add'}</Button></div>;
  }
  const booleanControl = !raw && (schema.type === 'boolean' || typeof value === 'boolean');
  return <div className="oc-setting-row" data-setting-path={fieldPath}><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium">{(hint.sensitive || schema.format === 'password' || protectedValue) && <LockKeyhole className="h-3.5 w-3.5" />}{label}</p>{help && <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>}</div><div className={cn('oc-setting-control', booleanControl && 'oc-setting-control-compact')}>{raw ? <JsonEditor label={label} value={value} set={set} sensitive={hint.sensitive} /> : <PrimitiveControl schema={schema} value={value} set={set} path={path} hint={hint} />}{(variants?.length || (!['string', 'number', 'integer', 'boolean'].includes(String(schema.type)) && schema.type !== undefined)) && <button type="button" className="oc-raw-toggle" onClick={() => setRaw((current) => !current)}>{raw ? (ru ? 'Поле' : 'Field') : 'JSON'}</button>}</div></div>;
}

function RootDocument({ document, value, set, query }: { document: SettingsDocument; value: JsonValue; set(value: JsonValue): void; query: string }) {
  const ru = usePreferences().language === 'ru';
  const schema = resolveSchema(document.schema, value);
  const rootHint = settingHint(document.hints, [document.root]);
  const rootTitle = rootLabels[document.root]?.[ru ? 0 : 1] || fieldLabel([document.root], schema, rootHint, ru);
  const description = fieldHelp([document.root], schema, rootHint, ru);
  const keys = [...new Set([...Object.keys(schema.properties || {}), ...Object.keys(objectValue(value))])].sort((a, b) => (settingHint(document.hints, [document.root, a]).order ?? Number.MAX_SAFE_INTEGER) - (settingHint(document.hints, [document.root, b]).order ?? Number.MAX_SAFE_INTEGER));
  const regular = keys.filter((key) => settingHint(document.hints, [document.root, key]).advanced !== true);
  const advanced = keys.filter((key) => !regular.includes(key));
  const childSet = (key: string, next: JsonValue | undefined) => { const copy = { ...objectValue(value) }; if (next === undefined) delete copy[key]; else copy[key] = next; set(copy); };
  return <section id={`oc-config-${document.root}`} className="oc-root-section" data-setting-root={document.root}><header className="oc-root-heading"><h3>{rootTitle.toLocaleUpperCase()}</h3>{description && <p>{description}</p>}</header><div className="oc-settings-card">{regular.map((key) => <SettingField key={key} schema={schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {})} value={objectValue(value)[key]} set={(next) => childSet(key, next)} path={[document.root, key]} hints={document.hints} depth={1} query={query} />)}{regular.length === 0 && advanced.length === 0 && schema.additionalProperties !== undefined && schema.additionalProperties !== false && <SettingField schema={schema} value={value} set={(next) => set(next ?? {})} path={[document.root]} hints={document.hints} query={query} />}</div>{advanced.length > 0 && <details className="oc-root-advanced" open={Boolean(query)}><summary><ChevronDown className="h-3.5 w-3.5" />{ru ? 'РАСШИРЕННЫЕ НАСТРОЙКИ' : 'ADVANCED SETTINGS'}</summary><div className="oc-settings-card">{advanced.map((key) => <SettingField key={key} schema={schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {})} value={objectValue(value)[key]} set={(next) => childSet(key, next)} path={[document.root, key]} hints={document.hints} depth={1} query={query} />)}</div></details>}</section>;
}

type ProjectedField = { root: string; path: string[]; schema: JsonSchema; hint: SettingHint; value: JsonValue | undefined };
const labSpecs = [
  { id: 'code-mode', match: /(?:^|\s)code mode(?:$|\s)/i, ru: 'Code Mode', en: 'Code Mode', fallbackRu: 'Глобальный режим компактных изолированных инструментов JavaScript.', fallbackEn: 'Global default for compact isolated JavaScript tool workflows.' },
  { id: 'swarm', match: /(?:^|\s)swarm(?:$|\s)/i, ru: 'Swarm', en: 'Swarm', fallbackRu: 'Разрешает Code Mode управлять группами субагентов параллельно.', fallbackEn: 'Allows Code Mode to manage groups of subagents in parallel.' },
  { id: 'tool-search', match: /tool search|поиск инструментов/i, ru: 'Поиск инструментов', en: 'Tool Search', fallbackRu: 'Скрывает большой каталог инструментов за поиском.', fallbackEn: 'Keeps large tool catalogs behind search.' },
  { id: 'loop-detection', match: /(?:tool.*loop|loop.*detect|обнаружение циклов)/i, ru: 'Обнаружение циклов инструментов', en: 'Tool loop detection', fallbackRu: 'Предупреждает или блокирует повторяющиеся вызовы инструментов.', fallbackEn: 'Warns about or blocks repetitive tool calls.' },
  { id: 'local-model-tools', match: /(?:lightweight.*local model|local model.*tool|облегч.*локальн)/i, ru: 'Облегчённые инструменты для локальных моделей', en: 'Lightweight local model tools', fallbackRu: 'Оставляет короткий набор инструментов для небольших локальных моделей.', fallbackEn: 'Keeps a smaller tool set for lightweight local models.' },
  { id: 'cli-agents', match: /cli.?agents|cli-агент/i, ru: 'CLI-агенты', en: 'CLI agents', fallbackRu: 'Показывает внешние движки CLI-сессий в выборе модели.', fallbackEn: 'Shows external CLI session engines in model selection.' },
  { id: 'message-audit', match: /message audit scope|message audit metadata|метаданн.*аудит/i, ru: 'Метаданные аудита сообщений', en: 'Message audit metadata', fallbackRu: 'Записывает метаданные без содержимого для прямых диалогов. Требуется перезапуск Gateway.', fallbackEn: 'Records content-free metadata for direct chats. Requires a Gateway restart.', on: 'direct' },
  { id: 'host-desktop', match: /gateway host desktop \(labs\)|хост.*рабочий стол/i, ru: 'Хост-рабочий стол', en: 'Host desktop', fallbackRu: 'Наблюдение и управление машиной Gateway через VNC или Screen Sharing. Требуется перезапуск Gateway.', fallbackEn: 'Observe and control the Gateway machine through VNC or Screen Sharing. Requires a Gateway restart.' },
  { id: 'worker-desktop', match: /cloud worker desktop \(labs\)|рабочий стол облачного/i, ru: 'Рабочий стол облачного воркера', en: 'Cloud worker desktop', fallbackRu: 'Наблюдение за рабочими столами подходящих облачных воркеров. Требуется перезапуск Gateway.', fallbackEn: 'Observe desktops from eligible cloud workers. Requires a Gateway restart.' },
] as const;

function collectProjectedFields(document: SettingsDocument, value: JsonValue): ProjectedField[] {
  const output: ProjectedField[] = [];
  const visit = (raw: JsonSchema, current: JsonValue | undefined, path: string[], depth: number) => {
    if (depth > 28) return;
    const schema = resolveSchema(raw, current);
    const hint = settingHint(document.hints, path);
    const data = objectValue(current);
    const keys = [...new Set([...Object.keys(schema.properties || {}), ...Object.keys(data)])];
    const object = schema.type === 'object' || Boolean(schema.properties) || (current !== null && typeof current === 'object' && !Array.isArray(current));
    if (!object || keys.length === 0) { output.push({ root: document.root, path, schema, hint, value: current }); return; }
    for (const key of keys) visit(schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {}), data[key], [...path, key], depth + 1);
  };
  visit(document.schema, value, [document.root], 0);
  return output;
}

function setAtPath(value: JsonValue, path: string[], next: JsonValue): JsonValue {
  if (path.length === 0) return next;
  const [key, ...rest] = path;
  const data = { ...objectValue(value) };
  data[key] = setAtPath(data[key] ?? {}, rest, next);
  return data;
}

function LabsProjection({ documents, drafts, setDrafts }: { documents: Record<string, SettingsDocument>; drafts: Record<string, JsonValue>; setDrafts: React.Dispatch<React.SetStateAction<Record<string, JsonValue>>> }) {
  const ru = usePreferences().language === 'ru';
  const fields = Object.values(documents).flatMap((document) => collectProjectedFields(document, drafts[document.root]));
  const selected = labSpecs.map((spec) => ({ spec, field: fields.find((field) => {
    const label = `${field.hint.label || ''} ${field.schema.title || ''} ${field.path.join('.')}`;
    return spec.match.test(label);
  }) }));
  const toggleValue = (field: ProjectedField, enabled: boolean, preferred?: string) => {
    const variants = field.schema.enum || (field.schema.anyOf || field.schema.oneOf)?.map((item) => item.const).filter((item): item is JsonValue => item !== undefined) || [];
    const next: JsonValue = enabled
      ? (preferred && variants.includes(preferred) ? preferred : variants.includes('auto') ? 'auto' : variants.find((item) => item !== 'off' && item !== false) ?? true)
      : (variants.includes('off') ? 'off' : variants.includes(false) ? false : false);
    setDrafts((current) => ({ ...current, [field.root]: setAtPath(current[field.root], field.path.slice(1), next) }));
  };
  return <section className="oc-labs-section"><header className="oc-root-heading"><h3>{ru ? 'ЭКСПЕРИМЕНТАЛЬНЫЕ ФУНКЦИИ' : 'EXPERIMENTAL FEATURES'}</h3><p>{ru ? 'Изменения сохраняются на Gateway после подтверждения и применяются к будущим запускам агента.' : 'Changes are saved to the Gateway after confirmation and apply to future agent runs.'}</p></header><div className="oc-settings-card">{selected.map(({ spec, field }) => {
    const enabled = field ? field.value === true || field.value === 'auto' || field.value === 'direct' || field.value === 'all' : false;
    return <div key={spec.id} className="oc-setting-row" data-testid={`labs-${spec.id}`}><div className="min-w-0"><p className="text-sm font-medium">{ru ? spec.ru : spec.en}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{field ? fieldHelp(field.path, field.schema, field.hint, ru) || (ru ? spec.fallbackRu : spec.fallbackEn) : (ru ? `${spec.fallbackRu} Параметр не предоставлен этой версией Gateway.` : `${spec.fallbackEn} This Gateway version does not expose the setting.`)}</p></div><Switch className="justify-self-end" aria-label={ru ? spec.ru : spec.en} disabled={!field} checked={enabled} onCheckedChange={(checked) => field && toggleValue(field, checked, 'on' in spec ? spec.on : undefined)} /></div>;
  })}</div></section>;
}

const advancedGroups = [
  { id: 'main', ru: 'Основное', en: 'Main', roots: ['gateway','ui','updates','diagnostics','telemetry','logging','auth','secrets','env','meta','proxy','desktop','cloudWorkers','attachments','transcripts','accessGroups','surfaces'] },
  { id: 'ai', ru: 'ИИ и агенты', en: 'AI and agents', roots: ['agents','models','tools','memory','skills','plugins','mcp','session'] },
  { id: 'communication', ru: 'Связь', en: 'Communication', roots: ['messages','tts','talk','channels','broadcast','commands','hooks','bindings'] },
] as const;

function AdvancedNavigation({ roots }: { roots: { key: string; title: string }[] }) {
  const ru = usePreferences().language === 'ru';
  const claimed = new Set<string>(advancedGroups.flatMap((group) => [...group.roots]));
  const groups = [...advancedGroups, { id: 'other', ru: 'Другое', en: 'Other', roots: roots.map((root) => root.key).filter((key) => !claimed.has(key)) }];
  return <div className="oc-advanced-navigation">{groups.map((group) => {
    const items = roots.filter((root) => group.roots.includes(root.key as never));
    return <details key={group.id}><summary><span>{ru ? group.ru : group.en}</span><ChevronDown className="h-4 w-4" /></summary><div>{items.map((root) => <button key={root.key} type="button" onClick={() => globalThis.document.getElementById(`oc-config-${root.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{rootLabels[root.key]?.[ru ? 0 : 1] || root.title}</button>)}</div></details>;
  })}</div>;
}

export function SettingsBrowser({ category, connected, scope, title = true, onDirty, suppressEmpty = false }: { category: string; connected: boolean; scope: string; title?: boolean; onDirty?(dirty: boolean): void; showAllRoots?: boolean; suppressEmpty?: boolean }) {
  const ru = usePreferences().language === 'ru';
  const [catalog, setCatalog] = useState<SettingsCatalog | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [documents, setDocuments] = useState<Record<string, SettingsDocument>>({});
  const [drafts, setDrafts] = useState<Record<string, JsonValue>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [advancedMode, setAdvancedMode] = useState<'form' | 'source'>('form');
  const roots = useMemo(() => catalog?.roots.filter((root) => category === 'advanced' || gatewayCategories[category]?.includes(root.key)) || [], [catalog, category]);
  const configuredTabs = tabGroups[category];
  const tabs = useMemo(() => (category === 'advanced' || category === 'labs')
    ? (roots.length ? [{ id: category, ru: category, en: category, roots: roots.map((root) => root.key) }] : [])
    : configuredTabs
    ? configuredTabs.map((tab) => ({ ...tab, roots: tab.roots.filter((key) => roots.some((root) => root.key === key)) })).filter((tab) => tab.roots.length > 0)
    : roots.map((root) => ({ id: root.key, ru: rootLabels[root.key]?.[0] || root.title, en: rootLabels[root.key]?.[1] || root.title, roots: [root.key] })), [configuredTabs, roots]);
  const selectedTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const selectedRoots = selectedTab?.roots || [];
  const dirtyRoots = selectedRoots.filter((key) => documents[key] && JSON.stringify(documents[key].value) !== JSON.stringify(drafts[key]));
  const dirty = dirtyRoots.length > 0;

  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => {
    let alive = true;
    setCatalog(null); setDocuments({}); setDrafts({}); setActiveTab(''); setError('');
    if (!connected) return () => { alive = false; };
    setBusy(true);
    void window.pincer.settings.catalog().then((result) => { if (!alive) return; if (result.ok) setCatalog(result.value); else setError(result.error.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [category, connected, scope]);
  useEffect(() => { if (tabs.length && !tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0].id); }, [activeTab, tabs]);
  useEffect(() => {
    let alive = true;
    if (!connected || selectedRoots.length === 0) return () => { alive = false; };
    setBusy(true); setError('');
    void Promise.all(selectedRoots.map(async (key) => [key, await window.pincer.settings.section(key)] as const)).then((results) => {
      if (!alive) return;
      const nextDocuments: Record<string, SettingsDocument> = {}; const nextDrafts: Record<string, JsonValue> = {};
      for (const [key, result] of results) { if (!result.ok) { setError(result.error.message); return; } nextDocuments[key] = result.value; nextDrafts[key] = result.value.value; }
      setDocuments((current) => ({ ...current, ...nextDocuments })); setDrafts((current) => ({ ...current, ...nextDrafts }));
    }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [connected, reload, scope, selectedTab?.id]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const result = await window.pincer.settings.saveMany(dirtyRoots.map((key) => ({ lease: documents[key].lease, value: drafts[key] })));
      if (!result.ok) { setError(result.error.message); return; }
      toast.success(ru ? 'Настройки сохранены на Gateway' : 'Settings saved to the Gateway'); setConfirmSave(false); setReload((value) => value + 1);
    } finally { setSaving(false); }
  };

  if (suppressEmpty && connected && catalog && !busy && roots.length === 0) return null;

  return <section className="oc-settings-page" data-testid="gateway-settings-browser">
    {title && <header className="oc-page-brand"><div><span className="oc-brand-mark" aria-hidden>●</span><span>OpenClaw</span></div><p>{categoryDescriptions[category]?.[ru ? 0 : 1] || (ru ? 'Настройки подключённого Gateway.' : 'Connected Gateway settings.')}</p></header>}
    {!connected && <div className="settings-browser-empty text-sm text-muted-foreground">{ru ? 'Подключитесь к Gateway, чтобы загрузить настройки.' : 'Connect to the Gateway to load settings.'}</div>}
    {category === 'advanced' && roots.length > 0 && <><div className="oc-mode-tabs" role="tablist" aria-label={ru ? 'Режим редактора' : 'Editor mode'} onKeyDown={handleTabListKeyDown}><button role="tab" type="button" tabIndex={advancedMode === 'form' ? 0 : -1} aria-selected={advancedMode === 'form'} aria-controls="advanced-editor-panel" onClick={() => setAdvancedMode('form')}>{ru ? 'Форма' : 'Form'}</button><button role="tab" type="button" tabIndex={advancedMode === 'source' ? 0 : -1} aria-selected={advancedMode === 'source'} aria-controls="advanced-editor-panel" onClick={() => setAdvancedMode('source')}>{ru ? 'Исходник' : 'Source'}</button></div>{advancedMode === 'form' && <AdvancedNavigation roots={roots} />}</>}
    {category !== 'advanced' && tabs.length > 1 && <div className="oc-page-tabs" role="tablist" aria-label={ru ? 'Разделы настроек' : 'Settings sections'} onKeyDown={handleTabListKeyDown}>{tabs.map((tab) => <button key={tab.id} role="tab" type="button" tabIndex={selectedTab?.id === tab.id ? 0 : -1} aria-selected={selectedTab?.id === tab.id} aria-controls={`settings-tabpanel-${tab.id}`} onClick={() => { if (!dirty) { setActiveTab(tab.id); setQuery(''); } }}>{ru ? tab.ru : tab.en}</button>)}</div>}
    {connected && roots.length > 0 && <div className="oc-settings-toolbar"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? 'Поиск по этой странице…' : 'Search this page…'} /></div><Button variant="ghost" size="sm" disabled={busy || saving} onClick={() => setReload((value) => value + 1)}><RefreshCw className={cn('mr-2 h-4 w-4', busy && 'animate-spin')} />{ru ? 'Обновить' : 'Reload'}</Button></div>}
    {error && <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{errorText(error, ru)}</p>}
    {busy && selectedRoots.some((key) => !documents[key]) && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{ru ? 'Загрузка настроек OpenClaw…' : 'Loading OpenClaw settings…'}</p>}
    <div id={category === 'advanced' ? 'advanced-editor-panel' : selectedTab ? `settings-tabpanel-${selectedTab.id}` : undefined} role={selectedTab || category === 'advanced' ? 'tabpanel' : undefined} className="space-y-8">{category === 'labs' ? <LabsProjection documents={documents} drafts={drafts} setDrafts={setDrafts} /> : category === 'advanced' && advancedMode === 'source' ? <JsonEditor label={ru ? 'Исходная конфигурация' : 'Source configuration'} value={Object.fromEntries(selectedRoots.filter((key) => drafts[key] !== undefined).map((key) => [key, drafts[key]]))} set={(value) => { if (value && typeof value === 'object' && !Array.isArray(value)) setDrafts((current) => ({ ...current, ...value })); }} /> : selectedRoots.map((key) => documents[key] ? <RootDocument key={`${key}:${documents[key].lease}`} document={documents[key]} value={drafts[key]} set={(value) => setDrafts((current) => ({ ...current, [key]: value }))} query={query} /> : null)}</div>
    {connected && roots.length === 0 && !busy && <div className="settings-browser-empty text-sm text-muted-foreground">{ru ? 'В установленной версии Gateway для этой страницы нет отдельных параметров.' : 'The installed Gateway exposes no settings for this page.'}</div>}
    {dirty && <div className="oc-save-bar"><div><p className="text-sm font-medium">{ru ? 'Есть несохранённые изменения' : 'Unsaved changes'}</p><p className="text-xs text-muted-foreground">{ru ? 'Они будут применены к подключённому Gateway.' : 'They will be applied to the connected Gateway.'}</p></div><div className="flex gap-2"><Button variant="ghost" disabled={saving} onClick={() => setReload((value) => value + 1)}>{ru ? 'Отменить' : 'Discard'}</Button><Button disabled={saving} onClick={() => setConfirmSave(true)}><SlidersHorizontal className="mr-2 h-4 w-4" />{ru ? 'Сохранить' : 'Save'}</Button></div></div>}
    {confirmSave && <Modal open title={ru ? 'Применить изменения?' : 'Apply changes?'} close={() => { if (!saving) setConfirmSave(false); }}><p className="text-sm leading-6 text-muted-foreground">{ru ? 'Изменённые параметры будут записаны в конфигурацию Gateway. Некоторые параметры могут потребовать его перезапуска.' : 'Changed values will be written to the Gateway configuration. Some settings may require a restart.'}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setConfirmSave(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button disabled={saving} onClick={() => void save()}>{ru ? 'Применить' : 'Apply'}</Button></div></Modal>}
  </section>;
}
