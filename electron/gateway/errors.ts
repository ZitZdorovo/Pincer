import type { Failure, Phase } from '../../shared/contract';
import { isRecord } from './validation';

export function connectionFailure(error: unknown, redact: (text: string) => string): { phase: Phase; failure: Failure } {
  const record = isRecord(error) ? error : {};
  const details = isRecord(record.details) ? record.details : {};
  const code = typeof details.code === 'string' ? details.code : typeof record.code === 'string' ? record.code : 'CONNECTION_FAILED';
  const message = error instanceof Error ? error.message : 'Connection failed';
  const tag = `${code} ${message}`.toUpperCase();
  const phase: Phase = /PAIRING|NOT_PAIRED/.test(tag) ? 'pairing-required'
    : /PROTOCOL|VERSION_MISMATCH/.test(tag) ? 'incompatible'
    : /UNAUTHORIZED|AUTH_|TOKEN_|PASSWORD|CREDENTIAL/.test(tag) ? 'auth-error' : 'error';
  return {
    phase,
    failure: {
      code: redact(code), message: redact(message),
      ...(typeof details.requestId === 'string' ? { requestId: redact(details.requestId) } : {}),
    },
  };
}
