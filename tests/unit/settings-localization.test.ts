import { describe, expect, it } from 'vitest';
import { russianEnumValue, russianSettingHelp, russianSettingLabel } from '../../src/features/settings-localization';

describe('OpenClaw settings localization', () => {
  it('translates known paths and enum labels without changing stored values', () => {
    expect(russianSettingLabel(['gateway', 'mode'], 'Gateway Mode')).toBe('Режим');
    expect(russianSettingLabel(['gateway', 'controlUi'], 'Control UI')).toBe('Интерфейс управления Gateway');
    expect(russianEnumValue('local')).toBe('Локальный');
    expect(russianEnumValue('remote')).toBe('Удалённый');
    expect(['local', 'remote']).toEqual(['local', 'remote']);
  });

  it('never exposes an untranslated English schema description in Russian mode', () => {
    const known = russianSettingHelp('Gateway runtime surface for bind mode, auth, control UI, remote transport, and operational safety controls.', 'Gateway');
    const unknown = russianSettingHelp('Vendor supplied English-only documentation.', 'Особый параметр');
    expect(known).toContain('Параметры среды Gateway');
    expect(unknown).toBe('Настройка «Особый параметр» в конфигурации OpenClaw.');
    expect(unknown).not.toContain('Vendor supplied');
  });
});
