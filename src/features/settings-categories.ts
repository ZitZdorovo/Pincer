// Gateway schema roots, not hand-picked leaf fields. Advanced includes ALL roots,
// including new/plugin settings unknown to this version of Pincer.
export const gatewayCategories: Record<string, string[]> = {
  appearance: ['ui'], notifications: ['messages'], gateway: ['gateway', 'proxy'],
  channels: ['channels', 'bindings'], communications: ['messages', 'broadcast', 'attachments', 'tts'],
  talk: ['talk', 'tts'], devices: ['nodeHost', 'desktop'], 'cloud-workers': ['cloudWorkers'],
  agents: ['agents', 'session', 'acp'], labs: ['cloudWorkers', 'desktop', 'browser', 'tools', 'agents'],
  providers: ['models', 'auth'], mcp: ['mcp'], memory: ['memory', 'agents'], skills: ['skills', 'plugins'],
  automation: ['cron', 'commands', 'hooks', 'bindings', 'plugins'],
  security: ['security', 'accessGroups', 'tools', 'browser', 'telemetry'], secrets: ['secrets', 'env', 'auth'],
  approvals: ['approvals', 'tools'], infrastructure: ['gateway', 'browser', 'nodeHost', 'discovery', 'acp', 'mcp', 'surfaces', 'proxy'],
  advanced: [], developer: ['diagnostics', 'meta', 'wizard'], logs: ['logging', 'transcripts', 'diagnostics'], updates: ['update'],
};
export const rootLabels: Record<string, [string, string]> = {
  meta: ['Метаданные', 'Metadata'], env: ['Переменные окружения', 'Environment'], wizard: ['Первоначальная настройка', 'Setup'],
  diagnostics: ['Диагностика', 'Diagnostics'], logging: ['Журналирование', 'Logging'], update: ['Обновления OpenClaw', 'OpenClaw updates'],
  telemetry: ['Телеметрия', 'Telemetry'], browser: ['Браузер', 'Browser'], ui: ['Интерфейс OpenClaw', 'OpenClaw interface'],
  secrets: ['Секреты', 'Secrets'], auth: ['Профили авторизации', 'Authentication profiles'], accessGroups: ['Группы доступа', 'Access groups'],
  acp: ['ACP на сервере', 'Server ACP'], models: ['Модели', 'Models'], nodeHost: ['Хост ноды', 'Node host'], agents: ['Агенты', 'Agents'],
  tools: ['Инструменты', 'Tools'], security: ['Безопасность', 'Security'], bindings: ['Привязки', 'Bindings'], broadcast: ['Рассылка', 'Broadcast'],
  attachments: ['Вложения', 'Attachments'], messages: ['Сообщения', 'Messages'], tts: ['Синтез речи', 'Text to speech'], commands: ['Команды', 'Commands'],
  approvals: ['Одобрения', 'Approvals'], session: ['Сессии', 'Sessions'], cron: ['Расписание', 'Scheduling'], transcripts: ['История разговоров', 'Transcripts'],
  hooks: ['Обработчики событий', 'Hooks'], channels: ['Каналы', 'Channels'], discovery: ['Обнаружение', 'Discovery'], talk: ['Разговор', 'Talk'],
  gateway: ['Gateway', 'Gateway'], cloudWorkers: ['Облачные воркеры', 'Cloud workers'], desktop: ['Рабочий стол', 'Desktop'], memory: ['Память', 'Memory'],
  mcp: ['MCP', 'MCP'], skills: ['Навыки', 'Skills'], plugins: ['Плагины', 'Plugins'], surfaces: ['Поверхности интерфейса', 'Surfaces'], proxy: ['Прокси', 'Proxy'],
};
