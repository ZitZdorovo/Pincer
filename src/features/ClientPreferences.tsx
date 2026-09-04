import type { ReactNode } from 'react';
import { setPreferences, usePreferences } from '../preferences';
import { Switch } from '../components/ui/switch';
import { Select } from '../components/ui/select';
import { cn } from '../lib/utils';

export function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-[180px] flex-1"><p className="text-sm font-medium">{label}</p>{description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}</div><div className="max-w-full shrink-0">{children}</div></div>;
}
export function AppearanceExtras() {
  const p = usePreferences(); const ru = p.language === 'ru';
  const fonts = [['system', ru ? 'По умолчанию' : 'Default'], ['sans', 'Segoe UI'], ['serif', 'Georgia'], ['mono', 'Consolas']] as const;
  return <div className="divide-y divide-border rounded-2xl border border-border bg-surface-modal px-5" id="settings-typography">
    {(['interfaceFont', 'chatFont'] as const).map(key => <SettingRow key={key} label={key === 'chatFont' ? ru ? 'Шрифт текста чата' : 'Chat font' : ru ? 'Шрифт интерфейса' : 'Interface font'} description={ru ? 'Сохраняется только в Pincer на этом устройстве.' : 'Saved only in Pincer on this device.'}><Select aria-label={key === 'chatFont' ? ru ? 'Шрифт чата' : 'Chat font' : ru ? 'Шрифт интерфейса' : 'Interface font'} value={p[key]} onChange={e => setPreferences({ [key]: e.target.value })}>{fonts.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</Select></SettingRow>)}
    <SettingRow label={ru ? 'Акцентный цвет' : 'Accent color'} description={ru ? 'Кнопки, индикаторы и выделение активных элементов.' : 'Buttons, indicators and selected controls.'}><div className="flex gap-2">{([
      ['default', ru ? 'Синий' : 'Blue', 'bg-blue-500'], ['orange', ru ? 'Оранжевый' : 'Orange', 'bg-orange-500'], ['green', ru ? 'Зелёный' : 'Green', 'bg-emerald-500'], ['violet', ru ? 'Фиолетовый' : 'Violet', 'bg-violet-500'], ['rose', ru ? 'Розовый' : 'Rose', 'bg-rose-500'],
    ] as const).map(([id, text, color]) => <button key={id} aria-label={text} title={text} aria-pressed={p.accentColor === id} onClick={() => setPreferences({ accentColor: id })} className={cn('h-6 w-6 rounded-full border-2 border-surface-modal ring-offset-2 ring-offset-surface-modal', color, p.accentColor === id && 'ring-2 ring-foreground')} />)}</div></SettingRow>
    <div className="chat-markdown py-4"><p>{ru ? 'Хорошая типографика оставляет место для разговора.' : 'Good typography leaves room for conversation.'}</p><code className="mt-2 block font-mono text-xs text-muted-foreground">const greeting = "Hello, world!";</code></div>
  </div>;
}
export function ChatExtras() {
  const p = usePreferences(); const ru = p.language === 'ru';
  return <div className="mb-6 divide-y divide-border rounded-2xl border border-border bg-surface-modal px-5">
    <SettingRow label={ru ? 'Ширина сообщений' : 'Message width'} description={ru ? 'Сообщения и поле ввода остаются по центру и не выходят за окно.' : 'Messages and composer stay centered within the window.'}><div className="flex items-center gap-3"><input aria-label={ru ? 'Ширина сообщений' : 'Message width'} type="range" min="560" max="1200" step="16" value={p.chatWidth} onChange={e => setPreferences({ chatWidth: Number(e.target.value) })} className="w-28 accent-primary" /><output className="w-14 text-right text-xs tabular-nums">{p.chatWidth} px</output><button className="text-xs text-primary" onClick={() => setPreferences({ chatWidth: 736 })}>{ru ? 'Сброс' : 'Reset'}</button></div></SettingRow>
    <SettingRow label={ru ? 'Сворачивать ход работы' : 'Collapse task progress'} description={ru ? 'Вызовы инструментов можно раскрыть в любой момент.' : 'Tool calls can be expanded at any time.'}><Switch aria-label={ru ? 'Сворачивать ход работы' : 'Collapse task progress'} checked={p.collapseTools} onCheckedChange={collapseTools => setPreferences({ collapseTools })} /></SettingRow>
    <SettingRow label={ru ? 'Активность агента в боковой панели' : 'Agent activity in sidebar'} description={ru ? 'Показывать статус работающего чата рядом с его названием.' : 'Show the running chat’s status next to its title.'}><Switch aria-label={ru ? 'Активность агента' : 'Agent activity'} checked={p.showAgentActivity} onCheckedChange={showAgentActivity => setPreferences({ showAgentActivity })} /></SettingRow>
  </div>;
}
export function NotificationSettings() {
  const p = usePreferences(); const ru = p.language === 'ru';
  return <div className="rounded-2xl border border-border bg-surface-modal px-5"><SettingRow label={ru ? 'Ответ готов' : 'Response ready'} description={ru ? 'Уведомление внутри Pincer, если открыт другой раздел. Без системных уведомлений и звука.' : 'An in-app notification when another section is open. No OS notifications or sound.'}><Switch aria-label={ru ? 'Уведомлять о готовом ответе' : 'Notify when response is ready'} checked={p.responseNotifications} onCheckedChange={responseNotifications => setPreferences({ responseNotifications })} /></SettingRow></div>;
}
