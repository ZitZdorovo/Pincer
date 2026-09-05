import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { UpdateState } from '../../shared/contract';
import type { Language } from '../i18n';
import { featureText } from './text';
import { Button } from '../components/ui/button';

export function UpdatesPage({ state, language, dirty, nodeVersion, embedded = false }: { state: UpdateState | null; language: Language; dirty: boolean; nodeVersion: string; embedded?: boolean }) {
  const t = featureText(language);
  return <section data-testid="updates-page" className={embedded ? 'space-y-5' : 'mx-auto w-full max-w-2xl p-8'}>
    <div><h1 className="settings-section-title">{t('updates')}</h1><p className="settings-section-description">{t('updateHelp')}</p></div>
    <div className="settings-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div><p className="text-sm font-semibold">Pincer {state?.currentVersion || '—'}</p><p className="mt-1 text-xs text-muted-foreground">{t('nodeVersion')}: {nodeVersion}</p></div>
        {state?.phase === 'available' ? <Button disabled={dirty} onClick={() => void window.pincer.updates.install()}>{t('install')}</Button>
          : <Button variant="outline" disabled={!state || state.phase === 'checking' || state.phase === 'development'} onClick={() => void window.pincer.updates.check()}>{t('check')}</Button>}
      </div>
      {state && <p role="status" className="pt-4 text-sm">{state.phase === 'available' ? `${t('available')}: ${state.version}` : state.phase === 'development' ? t('development') : state.phase === 'current' ? t('current') : state.phase === 'checking' ? t('checking') : state.phase === 'error' ? t('updateError') : ''}</p>}
      {dirty && <p className="mt-3 text-sm text-muted-foreground">{t('unsaved')}</p>}
    </div>
  </section>;
}
export function UpdateModal({ state, language }: { state: UpdateState | null; language: Language }) {
  const t = featureText(language); const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = state?.phase === 'downloading' || state?.phase === 'installing';
  useEffect(() => { if (active) dialog.current?.showModal(); else dialog.current?.close(); }, [active]);
  return <dialog ref={dialog} onCancel={(event) => event.preventDefault()} aria-labelledby="update-heading" aria-describedby="update-description" className="w-[420px] max-w-[90vw] rounded-2xl border border-border bg-surface-modal p-6 text-foreground shadow-2xl backdrop:bg-black/20 dark:backdrop:bg-black/40">
    <h2 id="update-heading" className="text-lg font-semibold">{t('updateTitle')}</h2>
    <p id="update-description" className="mt-1 text-xs leading-5 text-muted-foreground">{t('restart')}</p>
    <div className="mt-4 flex items-center gap-3">
      <div role="progressbar" aria-label={t('updateTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state?.percent} className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <motion.div key={state?.percent !== undefined ? 'determinate' : 'indeterminate'} initial={false} className="h-full rounded-full bg-primary" animate={!active ? { width: '0%', x: '0%' } : state?.percent !== undefined ? { width: `${state.percent}%`, x: '0%' } : { width: '33%', x: reduced ? '100%' : ['-100%', '300%'] }} transition={state?.percent !== undefined ? { duration: .2 } : { duration: reduced ? 0 : 1.5, repeat: active && !reduced ? Infinity : 0 }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground" aria-live="polite">{state?.percent === undefined ? t('preparing') : `${Math.round(state.percent)}%`}</span>
    </div>
  </dialog>;
}
