import { describe, expect, it } from 'vitest';
import { parseConnection, profileKey, sameProfile } from '../../electron/gateway/validation';

describe('connection boundary', () => {
  it('normalizes URLs and preserves exact passwords', () => {
    expect(parseConnection({ url: ' wss://EXAMPLE.com/gateway ', authMode: 'password', credential: ' password ' }))
      .toEqual({ url: 'wss://example.com/gateway', authMode: 'password', credential: ' password ', tlsFingerprint: undefined });
  });
  it.each(['https://example.com', 'file:///tmp/test', 'not a url', 'ws://192.168.1.2:18789', 'ws://example.com'])('rejects unsafe endpoint %s', (url) => {
    expect(() => parseConnection({ url, authMode: 'token' })).toThrow();
  });
  it.each(['wss://user:pass@example.com', 'wss://example.com/?token=secret', 'wss://example.com/#secret'])('rejects embedded credentials %s', (url) => {
    expect(() => parseConnection({ url, authMode: 'token' })).toThrow('URL_CONTAINS_CREDENTIALS');
  });
  it.each(['ws://127.0.0.1:1234', 'ws://[::1]:1234', 'ws://localhost:1234'])('allows local tunnels %s', (url) => {
    expect(parseConnection({ url, authMode: 'token' }).url).toBe(`${url}/`);
  });
  it('validates and normalizes certificate pins', () => {
    expect(parseConnection({ url: 'wss://example.com', authMode: 'token', tlsFingerprint: Array(32).fill('AB').join(':') }).tlsFingerprint).toBe('ab'.repeat(32));
    expect(() => parseConnection({ url: 'wss://example.com', authMode: 'token', tlsFingerprint: 'xyz' })).toThrow('INVALID_TLS_PIN');
    expect(() => parseConnection({ url: 'ws://localhost', authMode: 'token', tlsFingerprint: 'ab'.repeat(32) })).toThrow('INVALID_TLS_PIN');
  });
  it('separates context paths, pins and authentication modes', () => {
    const a = { url: 'wss://example.com/a', authMode: 'token' as const };
    expect(profileKey(a)).not.toBe(profileKey({ ...a, url: 'wss://example.com/b' }));
    expect(profileKey(a)).not.toBe(profileKey({ ...a, tlsFingerprint: 'ab'.repeat(32) }));
    expect(sameProfile(a, { ...a, authMode: 'password' })).toBe(false);
  });
});
