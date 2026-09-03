import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunTiming } from '../../electron/workspace/run-timing';
import { projectTranscript } from '../../electron/workspace/transcript';
const transcript = (text = 'Question', at = 1000) => projectTranscript([{ role: 'user', content: text, timestamp: at }, { role: 'assistant', content: 'Answer', timestamp: at, usage: { output: 1102 } }]);
it('keeps an observed 16 seconds when Gateway timestamps coincide; phases do not reset timing', () => {
  const timer = new RunTiming(); timer.begin('run', 'scope', 'chat', { role: 'user', text: 'Question' }, [], 1000);
  timer.phase('run', 'responding'); timer.phase('run', 'working'); timer.phase('run', 'responding');
  expect(timer.get('run')).toMatchObject({ started: 1000, phase: 'working' });
  timer.finish('run', 17000); timer.finish('run', 90000);
  for (let i = 0; i < 3; i++) expect(timer.apply('scope', 'chat', transcript())[1].durationMs).toBe(16000);
  expect(timer.apply('other-scope', 'chat', transcript())[1].durationMs).toBeUndefined();
  expect(timer.apply('scope', 'other-chat', transcript())[1].durationMs).toBeUndefined();
});
it('never invents elapsed time from historical timestamps or matches an ambiguous repeated message', () => {
  expect(transcript()[1].durationMs).toBeUndefined();
  const timer = new RunTiming(); timer.begin('run', 'scope', 'chat', { role: 'user', text: 'Question' }, [], 1000); timer.finish('run', 17000);
  expect(timer.apply('scope', 'chat', [...transcript(), ...transcript('Question', 2000)]).filter(m => m.durationMs !== undefined)).toEqual([]);
});
it('excludes previous identical requests and persists only hashed identity and duration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pincer-timing-')); const path = join(directory, 'timing');
  const storage = { path, cipher: { encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() } };
  try {
    const timer = new RunTiming(storage); const old = transcript('Question', 500);
    timer.begin('run', 'scope', 'chat', { role: 'user', text: 'Question' }, old, 1000); timer.apply('scope', 'chat', [...old, ...transcript()]); timer.finish('run', 17000);
    expect(new RunTiming(storage).apply('scope', 'chat', transcript())[1].durationMs).toBe(16000);
    const saved = readFileSync(path, 'utf8'); expect(saved).not.toMatch(/Question|Answer|chat|scope|run/);
    writeFileSync(path, 'CORRUPT'); const broken = new RunTiming(storage); broken.begin('r', 's', 'c', { role: 'user', text: 'Question' }, [], 1000); broken.finish('r', 3000); broken.apply('s', 'c', transcript()); expect(readFileSync(path, 'utf8')).toBe('CORRUPT');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
