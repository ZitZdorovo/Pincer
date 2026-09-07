// Gateway schema roots, not hand-picked leaf fields. Advanced includes ALL roots,
// including new/plugin settings unknown to this version of Pincer.
export const gatewayCategories: Record<string, string[]> = {
  profile: ['auth', 'identity', 'account', 'users', 'github', 'usage', 'billing'],
  appearance: ['ui'], notifications: ['messages', 'notifications', 'browserNotifications', 'push'], gateway: ['gateway', 'proxy', 'connection', 'server', 'host'],
  channels: ['channels', 'bindings'], communications: ['messages', 'tts'],
  talk: ['talk'], devices: ['nodeHost', 'desktop', 'devices', 'nodes', 'approvals', 'tools', 'agents', 'bindings'], 'cloud-workers': ['cloudWorkers', 'cloud', 'workers'],
  agents: ['agents', 'session', 'acp'], labs: ['agents', 'tools', 'gateway', 'logging', 'desktop', 'cloudWorkers'],
  providers: ['models', 'auth'], mcp: ['mcp'], memory: ['memory', 'agents'], skills: ['skills'], plugins: ['plugins'],
  automation: ['cron', 'commands', 'hooks', 'bindings', 'plugins'],
  security: ['security', 'accessGroups', 'tools', 'browser', 'telemetry'], secrets: [],
  approvals: ['approvals', 'tools'], infrastructure: ['gateway', 'browser', 'nodeHost', 'discovery', 'acp', 'mcp', 'surfaces', 'proxy'],
  advanced: [], developer: ['diagnostics', 'meta', 'wizard'], logs: ['logging', 'transcripts', 'diagnostics'], updates: ['update'],
};
export const rootLabels: Record<string, [string, string]> = {
  identity: ['Идентификация', 'Identity'], account: ['Учётная запись', 'Account'], users: ['Пользователи', 'Users'], github: ['GitHub', 'GitHub'], usage: ['Использование', 'Usage'], billing: ['Лимиты и оплата', 'Usage and billing'],
  meta: ['Метаданные', 'Metadata'], env: ['Переменные окружения', 'Environment'], wizard: ['Первоначальная настройка', 'Setup'],
  diagnostics: ['Диагностика', 'Diagnostics'], logging: ['Журналирование', 'Logging'], update: ['Обновления OpenClaw', 'OpenClaw updates'],
  telemetry: ['Телеметрия', 'Telemetry'], browser: ['Браузер', 'Browser'], ui: ['Интерфейс OpenClaw', 'OpenClaw interface'],
  secrets: ['Секреты', 'Secrets'], auth: ['Профили авторизации', 'Authentication profiles'], accessGroups: ['Группы доступа', 'Access groups'],
  acp: ['ACP на сервере', 'Server ACP'], models: ['Модели', 'Models'], nodeHost: ['Хост ноды', 'Node host'], agents: ['Агенты', 'Agents'],
  tools: ['Инструменты', 'Tools'], security: ['Безопасность', 'Security'], bindings: ['Привязки', 'Bindings'], broadcast: ['Рассылка', 'Broadcast'],
  attachments: ['Вложения', 'Attachments'], messages: ['Сообщения', 'Messages'], tts: ['Синтез речи', 'Text to speech'], commands: ['Команды', 'Commands'],
  approvals: ['Одобрения', 'Approvals'], session: ['Сессии', 'Sessions'], cron: ['Расписание', 'Scheduling'], transcripts: ['История разговоров', 'Transcripts'],
  hooks: ['Обработчики событий', 'Hooks'], channels: ['Каналы', 'Channels'], discovery: ['Обнаружение', 'Discovery'], talk: ['Разговор', 'Talk'],
  gateway: ['Gateway', 'Gateway'], connection: ['Подключение', 'Connection'], server: ['Сервер', 'Server'], host: ['Хост', 'Host'], cloudWorkers: ['Облачные воркеры', 'Cloud workers'], cloud: ['Облако', 'Cloud'], workers: ['Воркеры', 'Workers'], desktop: ['Рабочий стол', 'Desktop'], devices: ['Устройства', 'Devices'], nodes: ['Узлы', 'Nodes'], memory: ['Память', 'Memory'],
  notifications: ['Уведомления Gateway', 'Gateway notifications'], browserNotifications: ['Браузерные уведомления', 'Browser notifications'], push: ['Push-уведомления', 'Push notifications'], communications: ['Коммуникации', 'Communications'], inbound: ['Входящие', 'Inbound'], outbound: ['Исходящие', 'Outbound'],
  mcp: ['MCP', 'MCP'], skills: ['Навыки', 'Skills'], plugins: ['Плагины', 'Plugins'], surfaces: ['Поверхности интерфейса', 'Surfaces'], proxy: ['Прокси', 'Proxy'],
};
