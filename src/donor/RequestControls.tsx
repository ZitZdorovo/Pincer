import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Shield, ShieldEllipsis, LockKeyhole, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { PermissionMode, WorkspaceState } from '../../shared/contract';
import { QuotaList } from '../features/ProviderLimits';
function usePopover() {
  const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const dismiss = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key); }; }, []);
  return { open, setOpen, root };
}
export function AccessPicker({ state, disabled }: { state: WorkspaceState | null; disabled: boolean }) {
  const { i18n } = useTranslation(); const ru = i18n.language.startsWith('ru'); const { open, setOpen, root } = usePopover(); const [busy, setBusy] = useState(false);
  const choices = [
    { mode: null, icon: ShieldCheck, title: ru ? 'По умолчанию' : 'Default', description: ru ? 'Следовать настроенной политике агента.' : 'Follow the agent’s configured policy.' },
    { mode: 'read-only', icon: ShieldEllipsis, title: ru ? 'Только чтение' : 'Read only', description: ru ? 'Чтение в пределах корня сессии; запись и команды заблокированы.' : 'Read within the session root; writes and commands are blocked.' },
    { mode: 'guarded', icon: LockKeyhole, title: ru ? 'С контролем' : 'Supervised', description: ru ? 'Человек проверяет запросы за пределами корня сессии.' : 'A person reviews requests outside the session root.' },
    { mode: 'workspace', icon: Shield, title: ru ? 'Рабочая область' : 'Workspace', description: ru ? 'ИИ-рецензент проверяет запросы за пределами корня сессии.' : 'An AI reviewer checks requests outside the session root.' },
    { mode: 'full', icon: ShieldAlert, title: ru ? 'Полный доступ' : 'Full access', description: ru ? 'Без рецензента; в пределах прав Gateway и системы.' : 'No reviewer; subject to Gateway and operating system permissions.' },
  ] as const;
  const selected = choices.find((item) => item.mode === (state?.permissionMode ?? null))!; const Icon = selected.icon;
  const effective = state?.permissionMode == null ? choices.find((item) => item.mode === state?.effectivePermissionMode) : undefined;
  return <div ref={root} className="relative shrink-0"><button type="button" data-testid="chat-access-button" aria-label={selected.title} title={selected.title} aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)} className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 ${selected.mode === 'full' ? 'text-amber-500' : 'text-muted-foreground'}`}><Icon size={15} /></button>
    {open && <div role="menu" aria-label={ru ? 'Разрешения' : 'Permissions'} className="absolute bottom-full left-0 z-50 mb-2 w-[340px] rounded-xl border border-border bg-surface-modal p-2 shadow-2xl"><div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ru ? 'Разрешения' : 'Permissions'}</div>{choices.map((item) => <button key={item.mode || 'default'} role="menuitemradio" aria-checked={selected.mode === item.mode} disabled={busy} data-testid={`chat-access-${item.mode || 'default'}`} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { setBusy(true); void window.pincer.chat.setPermission(item.mode as PermissionMode | null).then((r) => { if (r.ok) setOpen(false); else toast.error(r.error.message); }).finally(() => setBusy(false)); }}><item.icon size={15} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{item.title}{item.mode === null && effective ? ` (${effective.title})` : ''}</span><span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{item.description}</span></span>{selected.mode === item.mode && <Check size={14} className="text-primary" />}</button>)}</div>}
  </div>;
}
export function RequestStats({ state }: { state: WorkspaceState | null }) {
  const { t, i18n } = useTranslation('chat'); const ru = i18n.language.startsWith('ru'); const { open, setOpen, root } = usePopover();
  const model = state?.models.find((m) => m.id === state.model); const used = state?.contextTokens; const limit = state?.contextWindow ?? model?.contextWindow;
  const percent = used !== undefined && limit ? Math.min(100, Math.round(100 * used / limit)) : undefined;
  const last = state?.messages.filter((m) => m.role === 'assistant' && m.usage).at(-1)?.usage;
  const number = (n: number) => new Intl.NumberFormat(ru ? 'ru' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return <div ref={root} className="relative z-40 shrink-0"><button type="button" data-testid="chat-request-stats-button" onClick={() => setOpen(!open)} title={t('composer.requestStats')} aria-label={t('composer.requestStats')} aria-expanded={open} className="flex h-6 items-center justify-center gap-0.5 rounded-full px-1 text-muted-foreground hover:text-foreground"><span className="flex h-[18px] w-[18px] items-center justify-center rounded-full" style={{ background: `conic-gradient(currentColor ${percent ?? 0}%, hsl(var(--muted)) ${percent ?? 0}% 100%)` }}><span className="h-3 w-3 rounded-full bg-surface-sidebar" /></span>{percent !== undefined && <span className="font-mono text-2xs tabular-nums">{percent}%</span>}</button>
    {open && <div role="dialog" aria-label={t('composer.requestStats')} data-testid="chat-request-stats-panel" className="absolute bottom-full right-0 z-[70] mb-2 max-h-[65vh] w-80 overflow-y-auto rounded-xl border border-border bg-surface-modal p-4 text-left shadow-2xl"><div className="flex justify-between gap-2 text-[11px] font-medium uppercase"><span className="text-muted-foreground">{t('composer.contextWindow')}</span><span>{used !== undefined ? number(used) : '—'} / {limit ? number(limit) : '—'}{percent !== undefined ? ` · ${percent}%` : ''}</span></div>
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full bg-foreground/55 transition-[width]" style={{ width: `${percent ?? 0}%` }} /></div>
    {!!last && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">{(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((key) => last[key] !== undefined && <div key={key} className="bg-black/[0.025] p-2 dark:bg-white/[0.035]"><p className="text-[10px] text-muted-foreground">{t(`composer.${key}`)}</p><p className="font-mono text-xs">{number(last[key]!)}</p></div>)}</div>}
    <div className="mt-4 border-t border-border pt-3"><QuotaList key={state?.scope} scope={state?.scope || ''} compact /></div>
    </div>}
  </div>;
}
