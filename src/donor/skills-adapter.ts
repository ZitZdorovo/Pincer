import { useCallback, useRef, useState } from 'react';
import type { WorkspaceState, Result } from '../../shared/contract';
export type Skill = { id: string; name: string; description: string; enabled: boolean; isCore: boolean; isBundled: boolean; source?: string; baseDir?: string; version?: string; icon?: string; author?: string; slug?: string };
type SearchSkill = { slug: string; name: string; description: string; author?: string; version?: string };
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
async function checked<T>(request: Promise<Result<T>>) { const result = await request; if (!result.ok) throw new Error(result.error.message); return result.value; }
export function useSkillsData(workspace: WorkspaceState | null, connected: boolean) {
  const agentId = workspace?.agentId || '';
  const [skills, setSkills] = useState<Skill[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSkill[]>([]); const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState('');
  const [installing, setInstalling] = useState<Record<string, boolean>>({}); const generation = useRef(0); const searchGeneration = useRef(0);
  const fetchSkills = useCallback(async () => {
    if (!connected || !agentId) return false;
    const epoch = ++generation.current; setLoading(true); setError('');
    try { const data = await checked(window.pincer.management.list('skills', agentId)); if (epoch !== generation.current) return false; setSkills((Array.isArray(data.skills) ? data.skills : []).map((entry) => { const row = rec(entry); return { id: String(row.skillKey || row.id || row.name || ''), name: String(row.name || row.skillKey || row.id || ''), description: String(row.description || ''), enabled: row.disabled !== true && row.enabled !== false, isCore: row.always === true, isBundled: row.bundled === true || row.source === 'openclaw-bundled', source: String(row.source || ''), baseDir: String(row.baseDir || ''), icon: String(row.emoji || row.icon || ''), version: typeof row.version === 'string' ? row.version : undefined, slug: typeof row.slug === 'string' ? row.slug : undefined }; })); return true; }
    catch (failure) { if (epoch === generation.current) setError(String(failure)); return false; } finally { if (epoch === generation.current) setLoading(false); }
  }, [connected, agentId]);
  const enableSkill = useCallback(async (id: string) => { await checked(window.pincer.management.setSkill(id, true)); await fetchSkills(); }, [fetchSkills]);
  const disableSkill = useCallback(async (id: string) => { await checked(window.pincer.management.setSkill(id, false)); await fetchSkills(); }, [fetchSkills]);
  const searchSkills = useCallback(async (query: string) => {
    const epoch = ++searchGeneration.current;
    if (!query.trim()) { setSearchResults([]); setSearching(false); setSearchError(''); return; }
    setSearching(true); setSearchError('');
    try { const data = await checked(window.pincer.management.searchSkills(query)); if (epoch !== searchGeneration.current) return; const rows = data.results || data.skills; setSearchResults((Array.isArray(rows) ? rows : []).map((entry) => { const row = rec(entry); return { slug: String(row.slug || ''), name: String(row.displayName || row.name || row.slug || ''), description: String(row.summary || row.description || ''), author: typeof row.author === 'string' ? row.author : undefined, version: typeof row.version === 'string' ? row.version : undefined }; })); }
    catch (failure) { if (epoch === searchGeneration.current) setSearchError(String(failure)); } finally { if (epoch === searchGeneration.current) setSearching(false); }
  }, []);
  const installSkill = useCallback(async (slug: string) => { setInstalling((all) => ({ ...all, [slug]: true })); try { await checked(window.pincer.management.installSkill(slug, agentId)); await fetchSkills(); } finally { setInstalling((all) => ({ ...all, [slug]: false })); } }, [agentId, fetchSkills]);
  const uninstallSkill = useCallback(async (_slug: string) => { throw new Error('Skill removal is not supported by the current Gateway adapter.'); }, []);
  return { skills, loading, error, fetchSkills, enableSkill, disableSkill, searchResults, searchSkills, installSkill, uninstallSkill, searching, searchError, installing };
}
