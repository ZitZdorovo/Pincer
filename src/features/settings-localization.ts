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
  queue: 'Очередь сообщений', inbound: 'Входящие сообщения', drop: 'При переполнении', byChannel: 'Правила для каналов',
  debounceMsByChannel: 'Задержка для каждого канала, мс', debounceMs: 'Задержка объединения, мс',
  ackReaction: 'Реакция на получение', ackReactionScope: 'Где подтверждать получение', statusReactions: 'Реакции состояния',
  visibleReplies: 'Видимые ответы', responsePrefix: 'Префикс ответа', messagePrefix: 'Префикс сообщения',
  removeAckAfterReply: 'Убирать реакцию после ответа', groupChat: 'Групповые чаты', cap: 'Размер очереди',
  typingMode: 'Индикатор набора текста', typingIntervalSeconds: 'Интервал индикатора, с',
  usageTemplate: 'Шаблон статистики', responseUsage: 'Статистика в ответах', suppressToolErrors: 'Скрывать ошибки инструментов',
  agentId: 'Агент', consultThinkingLevel: 'Глубина обдумывания', consultFastMode: 'Быстрый режим',
  interruptOnSpeech: 'Прерывать ответ при речи', silenceTimeoutMs: 'Ожидание тишины, мс',
  summaryModel: 'Модель для краткого пересказа', modelOverrides: 'Параметры отдельных моделей', maxTextLength: 'Максимальная длина текста',
  customBindHost: 'Свой адрес привязки', publicOrigin: 'Публичный адрес', roles: 'Роли доступа',
  allowRealIpFallback: 'Использовать резервный IP-адрес', reload: 'Применение изменений', terminal: 'Терминал',
  tls: 'Шифрование соединения', http: 'HTTP-сервер', push: 'Push-уведомления', nodes: 'Ноды',
  allowSystemProfileImport: 'Импорт профиля браузера', evaluateEnabled: 'Выполнение JavaScript', cdpUrl: 'Адрес подключения к браузеру',
  executablePath: 'Путь к приложению', headless: 'Работа без окна', noSandbox: 'Отключить изоляцию браузера', attachOnly: 'Только подключение к браузеру',
  defaultProfile: 'Профиль по умолчанию', snapshotDefaults: 'Параметры снимков страниц', ssrfPolicy: 'Доступ к сетевым адресам',
  profiles: 'Профили', profile: 'Профиль', extraArgs: 'Дополнительные аргументы', tabCleanup: 'Очистка вкладок', extensionRelay: 'Связь с расширением',
  alsoAllow: 'Дополнительные разрешения', byProvider: 'Правила для поставщиков', toolsBySender: 'Инструменты по отправителям',
  web: 'Веб-доступ', media: 'Медиа', links: 'Ссылки', message: 'Отправка сообщений', agentToAgent: 'Общение между агентами',
  elevated: 'Повышенные права', exec: 'Выполнение команд', fs: 'Файловая система', subagents: 'Субагенты', sandbox: 'Изоляция',
  sessions_spawn: 'Создание сессий', updatePlan: 'Обновление плана', scope: 'Область действия', dmScope: 'Личные разговоры', groupScope: 'Групповые разговоры',
  identityLinks: 'Связанные учётные записи', resetTriggers: 'Команды сброса', reset: 'Сброс сессий', resetByType: 'Сброс по типу', resetByChannel: 'Сброс по каналу',
  store: 'Хранилище', mainKey: 'Основная сессия', sendPolicy: 'Правила отправки', threadBindings: 'Привязки к обсуждениям', sharing: 'Общий доступ', maintenance: 'Обслуживание',
  servers: 'Серверы', apps: 'Приложения', projectProfiles: 'Профили проектов',
  unmentionedInbound: 'Сообщения без упоминания', mentionPatterns: 'Шаблоны упоминаний',
};

const exactLabels: Record<string, string> = {
  'gateway.controlUi': 'Интерфейс управления Gateway',
  'gateway.remote': 'Удалённое подключение Gateway',
  'gateway.trustedProxies': 'Доверенные прокси-серверы',
  'memory.search': 'Поиск в памяти',
  'models.providers': 'Поставщики моделей',
  'agents.defaults': 'Настройки агентов по умолчанию',
  'gateway.cliAgents': 'CLI-агенты',
  'talk.activeProvider': 'Активный поставщик разговорного режима',
  'talk.providers': 'Поставщики разговорного режима',
  'talk.realtime': 'Разговор в реальном времени',
  'talk.realtime.brain': 'Стратегия ответа',
  'talk.realtime.mode': 'Режим реального времени',
  'talk.realtime.model': 'Модель реального времени',
  'talk.realtime.provider': 'Поставщик реального времени',
  'talk.realtime.providers': 'Настройки поставщиков реального времени',
  'talk.realtime.speakerVoice': 'Голос собеседника',
  'talk.speechLocale': 'Язык речи',
  'tts.auto': 'Автоматическое озвучивание',
  'tts.persona': 'Голосовой профиль TTS',
  'tts.personas': 'Голосовые профили TTS',
  'tts.providers': 'Настройки поставщиков TTS',
  'tools.toolSearch': 'Поиск инструментов',
  'tools.loopDetection': 'Обнаружение циклов инструментов',
  'tools.lightweightLocalModels': 'Инструменты для небольших локальных моделей',
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
  off: 'Выкл.', on: 'Вкл.', always: 'Всегда', inbound: 'Входящие', tagged: 'С тегом', direct: 'Напрямую', all: 'Все',
  realtime: 'Реальное время', 'stt-tts': 'Распознавание и синтез', transcription: 'Транскрипция', 'agent-consult': 'Консультация агента', 'direct-tools': 'Прямые инструменты',
  steer: 'Уточнять текущий запрос', followup: 'После текущего ответа', collect: 'Объединять сообщения', interrupt: 'Прерывать ответ',
  old: 'Удалять старые', new: 'Отклонять новые', summarize: 'Сохранять сводку',
  'group-mentions': 'Упоминания в группах', 'group-all': 'Все сообщения в группах', 'direct-only': 'Личные сообщения',
  'message-tool': 'Через инструмент сообщений', immediate: 'Сразу', final: 'Готовый ответ',
  object: 'Подробные параметры', string: 'Текстовое значение', array: 'Список значений', number: 'Число', integer: 'Целое число', boolean: 'Переключатель',
  user_request: 'Запрос пользователя', room_event: 'Событие группы',
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

export function russianSettingHelp(source: string | undefined, _label: string): string | undefined {
  const help: Record<string, string> = {
    'Очередь сообщений': 'Обработка сообщений, которые поступают, пока агент готовит ответ.',
    'При переполнении': 'Что делать с сообщениями, когда очередь достигла своего размера.',
    'Задержка объединения, мс': 'Сколько ждать перед объединением нескольких сообщений в один запрос.',
    'Реакция на получение': 'Эмодзи, которым агент подтверждает, что получил сообщение.',
    'Где подтверждать получение': 'В каких разговорах добавлять реакцию на входящее сообщение.',
    'Реакции состояния': 'Показывать ход работы агента с помощью реакций на сообщение.',
    'Убирать реакцию после ответа': 'Удалять подтверждение получения, когда ответ уже отправлен.',
  };
  if (help[_label]) return help[_label];
  if (!source || cyrillic.test(source)) return source;
  return exactHelp[source];
}

export function russianEnumValue(value: unknown): string {
  const source = String(value);
  return enumValues[source.toLowerCase()] || (cyrillic.test(source) ? source : translatedWords(source));
}
