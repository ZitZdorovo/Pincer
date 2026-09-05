const labels: Record<string, string> = {
  enabled: 'Включено', disabled: 'Выключено', mode: 'Режим', type: 'Тип', name: 'Название', title: 'Заголовок', description: 'Описание',
  host: 'Хост', hostname: 'Имя хоста', port: 'Порт', bind: 'Адрес привязки', path: 'Путь', url: 'Адрес', baseUrl: 'Базовый адрес', endpoint: 'Конечная точка',
  auth: 'Авторизация', token: 'Токен', apiKey: 'API-ключ', password: 'Пароль', secret: 'Секрет', headers: 'Заголовки запросов',
  provider: 'Поставщик', providers: 'Поставщики', model: 'Модель', models: 'Модели', primary: 'Основная', fallback: 'Резервная', fallbacks: 'Резервные',
  timeout: 'Время ожидания', timeoutMs: 'Время ожидания, мс', retries: 'Повторные попытки', retry: 'Повторная попытка', interval: 'Интервал', intervalMs: 'Интервал, мс',
  max: 'Максимум', min: 'Минимум', limit: 'Ограничение', limits: 'Ограничения', size: 'Размер', count: 'Количество', concurrency: 'Параллельность',
  gateway: 'Gateway', proxy: 'Прокси', ui: 'Интерфейс', browser: 'Браузер', desktop: 'Рабочий стол', nodeHost: 'Хост ноды', discovery: 'Обнаружение',
  agents: 'Агенты', agent: 'Агент', session: 'Сессия', sessions: 'Сессии', messages: 'Сообщения', channels: 'Каналы', bindings: 'Привязки', broadcast: 'Рассылка',
  memory: 'Память', search: 'Поиск', embeddings: 'Векторные представления', skills: 'Навыки', plugins: 'Плагины', tools: 'Инструменты', commands: 'Команды',
  cron: 'Расписание', hooks: 'Обработчики событий', approvals: 'Одобрения', security: 'Безопасность', accessGroups: 'Группы доступа', secrets: 'Секреты', env: 'Переменные окружения',
  logging: 'Журналирование', logs: 'Журналы', transcripts: 'История разговоров', diagnostics: 'Диагностика', telemetry: 'Телеметрия', update: 'Обновления',
  attachments: 'Вложения', tts: 'Синтез речи', talk: 'Разговор', cloudWorkers: 'Облачные воркеры', surfaces: 'Поверхности интерфейса',
  allow: 'Разрешить', deny: 'Запретить', policy: 'Политика', rules: 'Правила', default: 'По умолчанию', language: 'Язык', locale: 'Локаль',
  active: 'Активно', auto: 'Автоматически', local: 'Локальный', remote: 'Удалённый', status: 'Состояние', format: 'Формат', directory: 'Каталог', workspace: 'Рабочая область',
};

const exactLabels: Record<string, string> = {
  'gateway.controlUi': 'Интерфейс управления Gateway',
  'gateway.remote': 'Удалённое подключение Gateway',
  'gateway.trustedProxies': 'Доверенные прокси-серверы',
  'memory.search': 'Поиск в памяти',
  'models.providers': 'Поставщики моделей',
  'agents.defaults': 'Настройки агентов по умолчанию',
};

const exactHelp: Record<string, string> = {
  'Gateway runtime surface for bind mode, auth, control UI, remote transport, and operational safety controls.': 'Параметры среды Gateway: режим привязки, авторизация, интерфейс управления, удалённый транспорт и безопасность работы.',
  'Keep conservative defaults unless you intentionally expose the gateway beyond trusted local interfaces.': 'Сохраняйте безопасные значения по умолчанию, если вы намеренно не открываете Gateway за пределами доверенных локальных интерфейсов.',
  'Port used by the gateway listener for API, control UI, and channel-facing ingress paths. Use a dedicated port and avoid collisions with reverse proxies or local developer services.': 'Порт, который Gateway использует для API, интерфейса управления и входящих подключений каналов. Используйте отдельный порт без конфликтов с прокси и локальными службами.',
  'Gateway operation mode: "local" runs channels and agent runtime on this host, while "remote" connects through remote transport. Keep "local" unless you intentionally run a split remote gateway topology.': 'Режим работы Gateway: «Локальный» запускает каналы и агентов на этом компьютере, «Удалённый» использует удалённый транспорт. Оставьте локальный режим, если раздельная схема Gateway вам не нужна.',
};

const enumValues: Record<string, string> = {
  local: 'Локальный', remote: 'Удалённый', auto: 'Автоматически', automatic: 'Автоматически', none: 'Нет', default: 'По умолчанию',
  enabled: 'Включено', disabled: 'Выключено', allow: 'Разрешить', deny: 'Запретить', required: 'Обязательно', optional: 'Необязательно',
  public: 'Публичный', private: 'Закрытый', system: 'Как в системе', light: 'Светлая', dark: 'Тёмная', true: 'Да', false: 'Нет',
};

const words: Record<string, string> = {
  ...labels, control: 'управление', trusted: 'доверенные', proxies: 'прокси', worker: 'воркер', workers: 'воркеры',
  read: 'чтение', write: 'запись', cache: 'кэш', input: 'ввод', output: 'вывод', request: 'запрос', response: 'ответ',
  include: 'включать', exclude: 'исключать', allowed: 'разрешённые', blocked: 'заблокированные', history: 'история',
};

const cyrillic = /[А-Яа-яЁё]/;
const split = (value: string) => value.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').trim().split(/\s+/);

function translatedWords(value: string): string {
  const result = split(value).map((word) => words[word] || words[word.toLowerCase()] || word).join(' ');
  return result ? result[0].toLocaleUpperCase('ru') + result.slice(1) : value;
}

export function russianSettingLabel(path: string[], source: string): string {
  if (cyrillic.test(source)) return source;
  const fieldPath = path.join('.');
  return exactLabels[fieldPath] || labels[path.at(-1) || ''] || translatedWords(path.at(-1) || source);
}

export function russianSettingHelp(source: string | undefined, label: string): string | undefined {
  if (!source || cyrillic.test(source)) return source;
  return exactHelp[source] || `Настройка «${label}» в конфигурации OpenClaw.`;
}

export function russianEnumValue(value: unknown): string {
  const source = String(value);
  return enumValues[source.toLowerCase()] || (cyrillic.test(source) ? source : translatedWords(source));
}
