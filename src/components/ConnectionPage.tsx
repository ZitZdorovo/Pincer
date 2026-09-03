import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, Network } from 'lucide-react';
import type { AuthMode, GatewayState } from '../../shared/contract';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { translator, translatedError, type Language } from '../i18n';
import { ConnectionStatus } from './ConnectionStatus';

export function ConnectionPage({ state, language, preview, embedded = false }: { state: GatewayState; language: Language; preview(): void; embedded?: boolean }) {
  const t = translator(language);
  const [url, setUrl] = useState(state.profile?.url ?? '');
  const [authMode, setAuthMode] = useState<AuthMode>(state.profile?.authMode ?? 'token');
  const [fingerprint, setFingerprint] = useState(state.profile?.tlsFingerprint ?? '');
  const [credential, setCredential] = useState('');
  const [showCredential, setShowCredential] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = state.operator.phase !== 'disconnected' || state.node.phase !== 'disconnected';

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await window.pincer.gateway.connect({ url, authMode, tlsFingerprint: fingerprint, credential: credential || undefined });
      if (!result.ok) setError(translatedError(language, result.error.code, result.error.message));
      else { setCredential(''); setShowCredential(false); }
    } catch { setError(t('startupError')); }
    finally { setSubmitting(false); }
  };
  const retry = async () => {
    setSubmitting(true); setError(null);
    try {
      const result = await window.pincer.gateway.retry();
      if (!result.ok) setError(translatedError(language, result.error.code, result.error.message));
    } catch { setError(t('startupError')); }
    finally { setSubmitting(false); }
  };
  return <main data-testid="setup-page" className={embedded ? 'space-y-6' : 'flex flex-1 items-center justify-center overflow-auto px-6 py-8'}>
    <div className={embedded ? 'w-full space-y-6' : 'my-auto w-full max-w-[46rem] space-y-6'}>
      <header><div className="flex items-center gap-2"><Network className="h-5 w-5 text-primary" /><h1 className="openx-section-title mb-0">{t('title')}</h1></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('subtitle')}</p></header>
      <section><h2 className="mb-3 text-sm font-semibold">{language === 'ru' ? 'Состояние подключения' : 'Connection status'}</h2><ConnectionStatus state={state} language={language} /></section>
      <form className="overflow-hidden rounded-2xl border border-border bg-surface-modal" onSubmit={connect}>
        <div className="space-y-3 p-5"><div className="flex items-center gap-2"><Network className="h-4 w-4 text-muted-foreground" /><Label htmlFor="gateway-url">{t('url')}</Label></div><Input id="gateway-url" data-testid="remote-gateway-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="wss://gateway.example.com:18789" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-10 rounded-lg bg-surface-input font-mono text-sm" disabled={submitting} /><p className="text-xs leading-5 text-muted-foreground">{t('urlHelp')}</p></div>
        <fieldset className="space-y-3 border-t border-border p-5"><legend className="sr-only">{t('authMode')}</legend><div className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="h-4 w-4 text-muted-foreground" />{t('authMode')}</div><div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">{(['token', 'password'] as const).map((mode) => <button key={mode} type="button" data-testid={`remote-gateway-auth-${mode}`} className={cn('h-9 rounded-lg text-sm transition-colors', authMode === mode ? 'bg-surface-modal text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={() => setAuthMode(mode)} disabled={submitting}>{t(mode)}</button>)}</div><Label htmlFor="gateway-credential" className="text-sm">{t(authMode)}</Label><div className="relative"><Input id="gateway-credential" data-testid="remote-gateway-credential" type={showCredential ? 'text' : 'password'} value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={state.hasCredential && url === state.profile?.url && authMode === state.profile.authMode ? t('savedCredential') : ''} autoComplete="off" className="h-10 rounded-lg bg-surface-input pr-10 font-mono text-sm" disabled={submitting} /><button type="button" className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setShowCredential((value) => !value)} aria-label={showCredential ? t('hide') : t('show')}>{showCredential ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><p className="text-xs leading-5 text-muted-foreground">{t('secureStorage')}</p></fieldset>
        <details className="border-t border-border p-5 text-sm"><summary className="cursor-default font-medium text-foreground">{t('advanced')}</summary><div className="mt-4 space-y-2"><Label htmlFor="tls-pin">{t('fingerprint')}</Label><Input id="tls-pin" value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} spellCheck={false} className="font-mono text-sm" disabled={submitting} /><p className="text-xs leading-5 text-muted-foreground">{t('fingerprintHelp')}</p></div></details>
        {error && <div role="alert" data-testid="remote-gateway-error" className="mx-5 mb-5 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-5">{active && <><Button type="button" variant="outline" onClick={() => void retry()} disabled={submitting}>{t('retry')}</Button><Button type="button" variant="ghost" onClick={() => void window.pincer.gateway.disconnect().catch(() => setError(t('startupError')))} disabled={submitting}>{t('disconnect')}</Button></>}<Button type="submit" data-testid="remote-gateway-connect" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? t('connecting') : t('connect')}</Button></div>
      </form>
      {!embedded && <button type="button" className="w-full rounded-lg py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground" onClick={preview}>{t('preview')}</button>}
    </div>
  </main>;
}
