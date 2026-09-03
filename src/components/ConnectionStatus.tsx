import type { GatewayState, Role } from '../../shared/contract';
import { translator, type Language } from '../i18n';
import { cn } from '../lib/utils';

export function ConnectionStatus({ state, language }: { state: GatewayState; language: Language }) {
  const t = translator(language);
  return <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-modal" aria-live="polite" data-testid="connection-status">
    {(['operator', 'node'] as Role[]).map((role) => {
      const link = state[role];
      const pending = ['connecting', 'reconnecting'].includes(link.phase);
      return <div key={role} className="px-5 py-4" data-testid={`status-${role}`}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">{t(role)}</span>
          <span className="flex items-center gap-1.5" data-testid={`phase-${role}`}>
            <span className={cn('h-1.5 w-1.5 rounded-full', link.phase === 'connected' ? 'bg-green-500' : link.phase === 'disconnected' ? 'bg-muted-foreground/40' : 'bg-amber-500', pending && 'animate-pulse')} />
            {t(link.phase)}
          </span>
        </div>
        {link.serverVersion && <p className="mt-1 text-xs text-muted-foreground">{t('version')}: {link.serverVersion} · {t('protocol')}: {link.protocol}</p>}
        {link.failure && <div className="mt-2 break-words text-xs text-destructive">
          <p>{link.failure.message}</p>
          {link.failure.requestId && <p className="mt-1 select-text font-mono">{t('requestId')}: {link.failure.requestId}</p>}
        </div>}
        {link.phase === 'pairing-required' && <p className="mt-2 text-xs text-muted-foreground">{t('pairingHelp')}</p>}
        {link.phase === 'incompatible' && <p className="mt-2 text-xs text-muted-foreground">{t('incompatibleHelp')}</p>}
      </div>;
    })}
  </div>;
}
