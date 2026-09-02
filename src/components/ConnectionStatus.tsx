import type { GatewayState, Role } from '../../shared/contract';
import { translator, type Language } from '../i18n';
import { cn } from '../lib/utils';

export function ConnectionStatus({ state, language }: { state: GatewayState; language: Language }) {
  const t = translator(language);
  return <div className="space-y-3" aria-live="polite" data-testid="connection-status">
    {(['operator', 'node'] as Role[]).map((role) => {
      const link = state[role];
      const pending = ['connecting', 'reconnecting'].includes(link.phase);
      return <div key={role} className="rounded-lg border border-border px-3 py-2.5" data-testid={`status-${role}`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{t(role)}</span>
          <span className="flex items-center gap-1.5" data-testid={`phase-${role}`}>
            <span className={cn('h-1.5 w-1.5 rounded-full', link.phase === 'connected' ? 'bg-green-500' : link.phase === 'disconnected' ? 'bg-muted-foreground/40' : 'bg-amber-500', pending && 'animate-pulse')} />
            {t(link.phase)}
          </span>
        </div>
        {link.serverVersion && <p className="mt-1 text-tiny text-muted-foreground">{t('version')}: {link.serverVersion} · {t('protocol')}: {link.protocol}</p>}
        {link.failure && <div className="mt-2 break-words text-tiny text-destructive">
          <p>{link.failure.message}</p>
          {link.failure.requestId && <p className="mt-1 select-text font-mono">{t('requestId')}: {link.failure.requestId}</p>}
        </div>}
        {link.phase === 'pairing-required' && <p className="mt-2 text-tiny text-muted-foreground">{t('pairingHelp')}</p>}
        {link.phase === 'incompatible' && <p className="mt-2 text-tiny text-muted-foreground">{t('incompatibleHelp')}</p>}
      </div>;
    })}
  </div>;
}
