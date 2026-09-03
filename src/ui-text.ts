import type { Language } from './i18n';
import ruCommon from './locales/ru/common.json';
import enCommon from './locales/en/common.json';
import ruOrganization from './locales/ru/organization.json';
import enOrganization from './locales/en/organization.json';
import ruChat from './locales/ru/chat.json';
import enChat from './locales/en/chat.json';
import ruSettings from './locales/ru/settings.json';
import enSettings from './locales/en/settings.json';
import ruDashboard from './locales/ru/dashboard.json';
import enDashboard from './locales/en/dashboard.json';
import ruAgents from './locales/ru/agents.json';
import enAgents from './locales/en/agents.json';
import ruChannels from './locales/ru/channels.json';
import enChannels from './locales/en/channels.json';
import ruSkills from './locales/ru/skills.json';
import enSkills from './locales/en/skills.json';
import ruCron from './locales/ru/cron.json';
import enCron from './locales/en/cron.json';
export const resources = {
  ru: { common: ruCommon, organization: ruOrganization, chat: ruChat, settings: ruSettings, dashboard: ruDashboard, agents: ruAgents, channels: ruChannels, skills: ruSkills, cron: ruCron },
  en: { common: enCommon, organization: enOrganization, chat: enChat, settings: enSettings, dashboard: enDashboard, agents: enAgents, channels: enChannels, skills: enSkills, cron: enCron },
};
export type Namespace = keyof typeof resources.ru;
export function uiText(language: Language, namespace: Namespace) {
  return (key: string, values: Record<string, string | number> = {}): string => {
    let value: unknown = resources[language][namespace];
    for (const part of key.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(values[name] ?? ''));
  };
}
