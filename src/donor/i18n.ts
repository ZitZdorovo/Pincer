import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from '../ui-text';
import ruMenu from '../locales/ru/menu.json';
import enMenu from '../locales/en/menu.json';
void i18n.use(initReactI18next).init({
  resources: { ru: { ...resources.ru, menu: ruMenu }, en: { ...resources.en, menu: enMenu } },
  lng: localStorage.getItem('pincer.language') || 'ru', fallbackLng: 'en', defaultNS: 'common',
  interpolation: { escapeValue: false }, initImmediate: false,
});
export default i18n;
i18n.addResourceBundle('ru', 'chat', { pincer: { moveUnavailable: 'Перенос существующего чата в другую рабочую папку пока не поддерживается Gateway. Чат не изменён.' } }, true, true);
i18n.addResourceBundle('en', 'chat', { pincer: { moveUnavailable: 'The Gateway does not support moving an existing chat to another workspace yet. The chat was not changed.' } }, true, true);
for (const namespace of ['settings', 'chat', 'channels', 'skills']) {
  i18n.addResourceBundle('ru', namespace, { pincer: { remoteWorkspace: 'Укажите путь на компьютере Gateway, а не на этом устройстве.', noTelemetry: 'Pincer не отправляет телеметрию.', memory: 'Память и векторный поиск', directConnection: 'Прямое подключение к Gateway. OpenClaw внутри приложения и локальный CLI не используются.' } }, true, true);
  i18n.addResourceBundle('en', namespace, { pincer: { remoteWorkspace: 'Enter a path on the Gateway host, not this device.', noTelemetry: 'Pincer does not send telemetry.', memory: 'Memory and vector search', directConnection: 'Direct Gateway connection. No embedded OpenClaw or local CLI.' } }, true, true);
}
const additions = {
  ru: { usageUnavailable: 'Gateway пока не предоставляет подтверждённую историю использования.', channelConfigUnavailable: 'Настройка и привязка каналов пока недоступны через прямое подключение. Изменений на сервере не будет.', linkCopied: 'Ссылка скопирована', skillFilesUnavailable: 'Чтение файлов навыка пока не поддерживается через Gateway.', remoteFolders: 'Это папка на компьютере Gateway. Локальный проводник не может открыть её.', oauthUnavailable: 'Авторизация OAuth пока не поддерживается прямым подключением.', modelIdRequired: 'Укажите идентификатор модели.', explicitModels: 'Укажите идентификаторы моделей через запятую. Автоматическое обнаружение пока недоступно.' },
  en: { usageUnavailable: 'The Gateway does not expose a verified usage history yet.', channelConfigUnavailable: 'Channel configuration and agent binding are not supported by the direct connection yet. No server changes will be made.', linkCopied: 'Link copied', skillFilesUnavailable: 'Reading skill files through the Gateway is not supported yet.', remoteFolders: 'This folder is on the Gateway host. The local file browser cannot open it.', oauthUnavailable: 'OAuth is not supported by the direct connection yet.', modelIdRequired: 'Enter a model ID.', explicitModels: 'Enter comma-separated model IDs. Automatic model discovery is not available yet.' },
};
for (const language of ['ru', 'en'] as const) for (const namespace of ['settings', 'chat', 'channels', 'skills']) i18n.addResourceBundle(language, namespace, { pincer: additions[language] }, true, true);
for (const namespace of ['settings', 'channels']) {
 i18n.addResourceBundle('ru', namespace, { pincer: { start: 'Запустить канал', stop: 'Остановить канал', logout: 'Выйти из аккаунта', logoutConfirm: 'Выйти из аккаунта канала? Для подключения потребуется повторная авторизация.', runHistory: 'История запусков', probeModel: 'Проверить подключение' } }, true, true);
 i18n.addResourceBundle('en', namespace, { pincer: { start: 'Start channel', stop: 'Stop channel', logout: 'Log out', logoutConfirm: 'Log out of this channel account? Reconnecting will require authorization.', runHistory: 'Run history', probeModel: 'Check connection' } }, true, true);
}
