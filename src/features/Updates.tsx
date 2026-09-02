import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { UpdateState } from '../../shared/contract';
import type { Language } from '../i18n';
import { featureText } from './text';
import { Button } from '../components/ui/button';

export function UpdatesPage({ state, language, dirty, nodeVersion }: { state: UpdateState | null; language: Language; dirty: boolean; nodeVersion: string }) {
  const t = featureText(language);
  return <div className="mx-auto w-full max-w-2xl p-8">
    <h1 className="text-2xl font-semibold">{t('updates')}</h1>
    <p className="mt-5 text-lg">Pincer {state?.currentVersion}</p>
    <p className="mt-1 text-sm text-muted-foreground">{t('nodeVersion')}: {nodeVersion}</p>
    <p className="my-6 text-sm leading-6 text-muted-foreground">{t('updateHelp')}</p>
    {state && <p role="status" className="mb-5 text-sm">{state.phase === 'available' ? `${t('available')}: ${state.version}` : state.phase === 'development' ? t('development') : state.phase === 'current' ? t('current') : state.phase === 'checking' ? t('checking') : state.phase === 'error' ? t('updateError') : ''}</p>}
    {state?.phase === 'available' ? <Button disabled={dirty} onClick={() => void window.pincer.updates.install()}>{t('install')}</Button>
      : <Button disabled={!state || state.phase === 'checking' || state.phase === 'development'} onClick={() => void window.pincer.updates.check()}>{t('check')}</Button>}
    {dirty && <p className="mt-3 text-sm text-muted-foreground">{t('unsaved')}</p>}
  </div>;
}
export function UpdateModal({ state, language }: { state: UpdateState | null; language: Language }) {
  const t = featureText(language); const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = state?.phase === 'downloading' || state?.phase === 'installing';
  useEffect(() => { if (active) dialog.current?.showModal(); else dialog.current?.close(); }, [active]);
  return <dialog ref={dialog} onCancel={(event) => event.preventDefault()} aria-labelledby="update-heading" aria-describedby="update-description" className="w-[420px] max-w-[90vw] rounded-[20px] border border-white/5 bg-[#2b2b2b] p-5 text-[#f2f2f2] shadow-2xl backdrop:bg-black/30">
    <h2 id="update-heading" className="text-lg font-semibold">{t('updateTitle')}</h2>
    <p id="update-description" className="mt-1 text-xs leading-5 text-[#aaa]">{t('restart')}</p>
    <div className="mt-4 flex items-center gap-3">
      <div role="progressbar" aria-label={t('updateTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state?.percent} className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-[#3c73c8]" animate={state?.percent !== undefined ? { width: `${state.percent}%`, x: '0%' } : { width: '33%', x: reduced ? '100%' : ['-100%', '300%'] }} transition={state?.percent !== undefined ? { duration: .2 } : { duration: reduced ? 0 : 1.5, repeat: reduced ? 0 : Infinity }} />
      </div>
      <span className="text-xs font-medium text-[#bcbcbc]" aria-live="polite">{state?.percent === undefined ? t('preparing') : `${Math.round(state.percent)}%`}</span>
    </div>
  </dialog>;
}
