// The OpenX setup card's presentation is retained; connection logic is new.
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, PlugZap } from 'lucide-react';
import type { AuthMode, GatewayState } from '../../shared/contract';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { translator, translatedError, type Language } from '../i18n';
import { ConnectionStatus } from './ConnectionStatus';

export function ConnectionPage({ state, language, preview }: { state: GatewayState; language: Language; preview(): void }) {
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
  return <main data-testid="setup-page" className="flex flex-1 items-center justify-center overflow-auto px-6 py-8">
    <section className="my-auto w-full max-w-[430px] shrink-0 rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-black/5 dark:bg-white/5"><PlugZap className="h-4 w-4" aria-hidden="true" /></div>
        <div><h1 className="text-base font-semibold tracking-tight">{t('title')}</h1><p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p></div>
      </header>
      <form className="space-y-5 px-6 py-6" onSubmit={connect}>
        <div className="space-y-2">
          <Label htmlFor="gateway-url" className="text-xs">{t('url')}</Label>
          <Input id="gateway-url" data-testid="remote-gateway-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="wss://gateway.example.com:18789" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="rounded-md bg-surface-input font-mono text-xs" disabled={submitting} />
          <p className="text-[11px] leading-4 text-muted-foreground">{t('urlHelp')}</p>
        </div>
        <fieldset className="space-y-2"><legend className="text-xs font-medium">{t('authMode')}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5">
            {(['token', 'password'] as const).map((mode) => <button key={mode} type="button" data-testid={`remote-gateway-auth-${mode}`} className={cn('h-8 rounded-md text-xs transition-colors', authMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={() => setAuthMode(mode)} disabled={submitting}>{t(mode)}</button>)}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="gateway-credential" className="text-xs">{t(authMode)}</Label>
          <div className="relative">
            <Input id="gateway-credential" data-testid="remote-gateway-credential" type={showCredential ? 'text' : 'password'} value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={state.hasCredential && url === state.profile?.url && authMode === state.profile.authMode ? t('savedCredential') : ''} autoComplete="off" className="rounded-md bg-surface-input pr-10 font-mono text-xs" disabled={submitting} />
            <button type="button" className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setShowCredential((value) => !value)} aria-label={showCredential ? t('hide') : t('show')}>{showCredential ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">{t('secureStorage')}</p>
        </div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t('advanced')}</summary><div className="mt-3 space-y-2">
          <Label htmlFor="tls-pin" className="text-xs">{t('fingerprint')}</Label><Input id="tls-pin" value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} spellCheck={false} className="font-mono text-xs" disabled={submitting} /><p className="text-tiny">{t('fingerprintHelp')}</p>
        </div></details>
        {error && <div role="alert" data-testid="remote-gateway-error" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
        <Button type="submit" data-testid="remote-gateway-connect" className="w-full" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? t('connecting') : t('connect')}</Button>
      </form>
      <div className="space-y-3 border-t border-border px-6 py-4">
        <ConnectionStatus state={state} language={language} />
        {active && <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="flex-1 text-xs" onClick={() => void retry()} disabled={submitting}>{t('retry')}</Button>
          <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => void window.pincer.gateway.disconnect().catch(() => setError(t('startupError')))} disabled={submitting}>{t('disconnect')}</Button>
        </div>}
        <button type="button" className="w-full rounded py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={preview}>{t('preview')}</button>
      </div>
    </section>
  </main>;
}
