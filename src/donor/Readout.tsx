import { useState } from 'react';
import type { JsonRecord } from '../../shared/management';
import type { Result } from '../../shared/contract';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import { useTranslation } from 'react-i18next';
export function RemoteReadout({ label, request }: { label: string; request(): Promise<Result<JsonRecord>> }) {
 const { t } = useTranslation('common'); const [open, setOpen] = useState(false); const [content, setContent] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
 const load = async () => { if (busy) return; setOpen(true); setBusy(true); setError(''); setContent(''); try { const result = await request(); if (result.ok) setContent(JSON.stringify(result.value, null, 2)); else setError(result.error.message); } catch (failure) { setError(String(failure)); } finally { setBusy(false); } };
 return <span onClick={(event) => event.stopPropagation()}><Button variant="ghost" size="sm" onClick={() => void load()}>{label}</Button><Modal open={open} close={() => setOpen(false)} title={label}>{busy ? <p role="status">{t('status.loading')}</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-input p-3 text-xs">{content}</pre>}</Modal></span>;
}
