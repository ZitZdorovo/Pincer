// ArtifactPanel/WorkspaceBrowserBody layout from OpenX, connected only to Pincer's scoped file API.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Eye, FileEdit, Folder, FolderOpen, FolderTree, RefreshCw, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { WorkspaceEntry, WorkspaceFile, WorkspaceFiles } from '../../shared/files';
import { setPreferences, usePreferences } from '../preferences';
import { Button } from '../components/ui/button';
import { PanelTabButton } from '../donor/PanelTabButton';
import { MaterialFileIcon } from '../donor/MaterialFileIcon';
import { DonorMarkdown } from '../donor/Message';
import { cn } from '../lib/utils';
import { motion, useReducedMotion } from 'framer-motion';

export function Files({ sessionKey, close, onDirty }: { sessionKey: string; close(): void; onDirty(value: boolean): void }) {
 const { t } = useTranslation('chat'); const preferences = usePreferences(); const ru = preferences.language === 'ru';
 const [listing, setListing] = useState<WorkspaceFiles | null>(null);
 const [branches, setBranches] = useState<Record<string, WorkspaceEntry[]>>({});
 const [expanded, setExpanded] = useState<Record<string, boolean>>({});
 const [file, setFile] = useState<WorkspaceFile | null>(null); const [content, setContent] = useState('');
 const [tab, setTab] = useState<'browser' | 'preview' | 'changes'>('browser'); const [editing, setEditing] = useState(false);
 const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [refresh, setRefresh] = useState(0);
 const [width, setWidth] = useState(preferences.workspacePanelWidth); const panel = useRef<HTMLElement>(null);
 const [resizing, setResizing] = useState(false); const [resizeCollapsed, setResizeCollapsed] = useState(false); const [thresholdAnimating, setThresholdAnimating] = useState(false); const thresholdTimer = useRef<number | null>(null); const systemReduceMotion = useReducedMotion();
 const reduceMotion = preferences.reducedMotion === 'on' || (preferences.reducedMotion === 'system' && systemReduceMotion);
 const generation = useRef(0);
 const dirty = file !== null && file.content !== content;
 useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
 useEffect(() => () => { delete document.body.dataset.columnResizing; if (thresholdTimer.current !== null) window.clearTimeout(thresholdTimer.current); }, []);
 useEffect(() => {
   const epoch = ++generation.current; setBusy(true); setError('');
   void window.pincer.files.list(sessionKey, '').then((result) => { if (epoch !== generation.current) return; if (result.ok) { setListing(result.value); setBranches({}); setExpanded({}); } else setError(result.error.message); }).catch((failure) => { if (epoch === generation.current) setError(String(failure)); }).finally(() => { if (epoch === generation.current) setBusy(false); });
   return () => { ++generation.current; };
 }, [sessionKey, refresh]);
 const discard = () => !dirty || window.confirm(ru ? 'Отменить несохранённые изменения файла?' : 'Discard unsaved file changes?');
 const read = async (path: string) => {
   if (busy || !discard()) return; const epoch = ++generation.current; setBusy(true); setError('');
   try { const result = await window.pincer.files.read(sessionKey, path); if (epoch !== generation.current) return; if (result.ok) { setFile(result.value); setContent(result.value.content); setEditing(false); } else setError(result.error.message); }
   catch (failure) { if (epoch === generation.current) setError(String(failure)); } finally { if (epoch === generation.current) setBusy(false); }
 };
 const toggleDirectory = async (path: string) => {
   if (busy) return;
   if (branches[path]) { setExpanded((all) => ({ ...all, [path]: !all[path] })); return; }
   const epoch = generation.current; setBusy(true); setError('');
   try { const result = await window.pincer.files.list(sessionKey, path); if (epoch !== generation.current) return; if (result.ok) { setBranches((all) => ({ ...all, [path]: result.value.entries })); setExpanded((all) => ({ ...all, [path]: true })); } else setError(result.error.message); }
   catch (failure) { if (epoch === generation.current) setError(String(failure)); } finally { if (epoch === generation.current) setBusy(false); }
 };
 const save = async () => {
   if (!file?.hash || busy || !dirty) return; setBusy(true); setError(''); const epoch = generation.current;
   try { const result = await window.pincer.files.save(sessionKey, file.path, content, file.hash); if (epoch !== generation.current) return; if (result.ok) { setFile(result.value); setContent(result.value.content); } else setError(result.error.message); }
   catch (failure) { if (epoch === generation.current) setError(String(failure)); } finally { if (epoch === generation.current) setBusy(false); }
 };
 const rows = (entries: WorkspaceEntry[], level = 0): React.ReactNode => entries.map((entry) => <div key={entry.path}><div className="h-7 px-1"><button type="button" disabled={busy} aria-expanded={entry.kind === 'directory' ? Boolean(expanded[entry.path]) : undefined} onClick={() => entry.kind === 'directory' ? void toggleDirectory(entry.path) : void read(entry.path)} className={cn('flex h-full w-full items-center gap-1 rounded-md pr-2 text-left text-xs transition-colors', file?.path === entry.path ? 'bg-black/5 text-foreground dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10')} style={{ paddingLeft: level * 8 }} title={entry.path}>
   {entry.kind === 'directory' ? <><ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded[entry.path] && 'rotate-90')} />{expanded[entry.path] ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}<span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span></> : <><span className="h-3.5 w-3.5 shrink-0" aria-hidden /><MaterialFileIcon filename={entry.name} className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{entry.name}</span></>}
 </button></div>{expanded[entry.path] && branches[entry.path] && level < 30 && rows(branches[entry.path], level + 1)}</div>);
 const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
   event.preventDefault();
   const handle = event.currentTarget; const pointerId = event.pointerId;
   const startX = event.clientX; const startWidth = width; const parentWidth = panel.current?.parentElement?.clientWidth || 1;
   let currentWidth = width; let hiddenDuringResize = false;
   const previousUserSelect = document.body.style.userSelect;
   setResizing(true); document.body.dataset.columnResizing = 'true'; document.body.style.userSelect = 'none';
   handle.setPointerCapture(pointerId);
   const animateThreshold = (hidden: boolean) => {
     if (thresholdTimer.current !== null) window.clearTimeout(thresholdTimer.current);
     setThresholdAnimating(true); setResizeCollapsed(hidden);
     thresholdTimer.current = window.setTimeout(() => { thresholdTimer.current = null; setThresholdAnimating(false); }, 220);
   };
   const move = (pointerEvent: PointerEvent) => {
     const next = startWidth + (startX - pointerEvent.clientX) / parentWidth * 100;
     if (next * parentWidth / 100 <= 24) {
       if (!hiddenDuringResize) { hiddenDuringResize = true; animateThreshold(true); }
       return;
     }
     if (hiddenDuringResize) { hiddenDuringResize = false; animateThreshold(false); }
     currentWidth = Math.max(28, Math.min(75, next)); setWidth(currentWidth);
   };
   const finish = (pointerEvent: PointerEvent) => {
     window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish);
     if (handle.isConnected && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
     delete document.body.dataset.columnResizing; document.body.style.userSelect = previousUserSelect;
     setResizing(false);
     if (pointerEvent.type === 'pointercancel') { setWidth(startWidth); animateThreshold(false); return; }
     if (hiddenDuringResize) { requestAnimationFrame(close); return; }
     setResizeCollapsed(false); setPreferences({ workspacePanelWidth: currentWidth });
   };
   window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', finish, { once: true });
 };
 const preview = !file ? <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"><p className="text-sm font-medium text-foreground">{t('artifactPanel.preview.emptyTitle')}</p></div>
   : file.missing ? <p className="p-4 text-sm text-muted-foreground">{ru ? 'Файл отсутствует.' : 'File is missing.'}</p>
   : file.previewKind === 'text' ? editing ? <textarea aria-label={file.name} className="h-full min-h-0 w-full resize-none bg-transparent p-4 font-mono text-xs leading-6 outline-none" value={content} maxLength={1_000_000} disabled={busy} onChange={(event) => setContent(event.target.value)} spellCheck={false} /> : /\.md$/i.test(file.name) ? <div className="h-full overflow-auto p-4"><DonorMarkdown text={content} /></div> : <pre className="h-full overflow-auto p-4 font-mono text-xs leading-6">{content}</pre>
   : file.previewKind === 'image' && file.contentEncoding === 'base64' && /^image\/(png|jpeg|webp|gif|bmp)$/.test(file.mimeType || '') ? <div className="h-full overflow-auto p-4"><img alt={file.name} src={`data:${file.mimeType};base64,${file.content}`} className="max-w-full" /></div> : <p className="p-4 text-sm text-muted-foreground">{ru ? 'Предпросмотр этого формата пока не поддерживается.' : 'Preview for this format is not supported yet.'}</p>;
 return <motion.aside ref={panel} data-testid="workspace-files" data-resize-collapsed={resizeCollapsed ? 'true' : 'false'} className="relative h-full min-h-0 shrink-0 overflow-visible bg-background" initial={reduceMotion ? false : { width: '0%', x: '100%' }} animate={resizeCollapsed ? { width: '0%', x: '100%' } : { width: width + '%', x: 0 }} exit={reduceMotion ? { width: '0%' } : { width: '0%', x: '100%' }} transition={{ duration: reduceMotion ? 0 : thresholdAnimating || !resizing ? 0.2 : 0, ease: [0, 0, 0.2, 1] }}>
   <div role="separator" aria-label={ru ? 'Ширина панели файлов' : 'File panel width'} aria-orientation="vertical" tabIndex={0} className="pincer-resize-handle group absolute inset-y-0 -left-1 z-40 w-2" onPointerDown={startResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = Math.max(28, Math.min(75, width + (event.key === 'ArrowLeft' ? 1 : -1))); setWidth(next); setPreferences({ workspacePanelWidth: next }); } }}><span className="pincer-resize-line left-1" /></div>
  <div data-testid="artifact-panel" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
   <div className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-black/5 bg-background px-3 py-2 dark:border-white/10">
    <div data-testid="artifact-panel-tabs" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      <PanelTabButton testId="artifact-panel-tab-browser" icon={<FolderTree className="h-3.5 w-3.5" />} label={t('artifactPanel.tabs.browser')} active={tab === 'browser'} onClick={() => setTab('browser')} />
      <PanelTabButton testId="artifact-panel-tab-preview" icon={<Eye className="h-3.5 w-3.5" />} label={t('artifactPanel.tabs.preview')} active={tab === 'preview'} onClick={() => setTab('preview')} />
      <PanelTabButton testId="artifact-panel-tab-changes" icon={<FileEdit className="h-3.5 w-3.5" />} label={t('artifactPanel.tabs.changes')} active={tab === 'changes'} onClick={() => setTab('changes')} />
    </div><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { if (!busy && discard()) close(); }} aria-label={ru ? 'Закрыть файлы' : 'Close files'}><X className="h-4 w-4 pointer-events-none" /></Button>
   </div>
   {error && <p role="alert" className="m-3 break-words text-sm text-destructive">{error}</p>}
   {tab === 'changes' ? <p className="p-6 text-sm text-muted-foreground">{ru ? 'Gateway пока не предоставляет историю изменений файлов для этой панели.' : 'The Gateway does not expose file change history for this panel yet.'}</p> : <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden">
    <header className="flex items-center justify-between gap-3 border-b border-black/5 px-3 py-1.5 dark:border-white/10"><h2 data-testid="workspace-header-title" title={listing?.root} className="m-0 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm font-medium"><span className="min-w-0 truncate">{listing?.root?.split(/[\\/]/).filter(Boolean).at(-1) || t('artifactPanel.tabs.browser')}</span></h2><div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy} onClick={() => { if (discard()) setRefresh((value) => value + 1); }} aria-label={t('workspace.actions.refresh')}><RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info(t('skills:pincer.remoteFolders'))} aria-label={t('workspace.actions.openRootInFinder')}><FolderOpen className="h-3.5 w-3.5 pointer-events-none" /></Button></div></header>
    <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: tab === 'browser' ? 'minmax(100px, 220px) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
     {tab === 'browser' && <aside className="min-h-0 overflow-hidden border-r border-black/5 dark:border-white/10"><div className="h-full overflow-y-auto py-2 text-sm">{listing && rows(listing.entries)}{listing?.truncated && <p className="p-2 text-xs text-muted-foreground">{ru ? 'Список сокращён сервером.' : 'The server truncated this list.'}</p>}</div></aside>}
     <section className="flex min-h-0 flex-col overflow-hidden">{file && <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-1.5 text-xs text-muted-foreground dark:border-white/10"><div className="flex min-w-0 items-center gap-2"><MaterialFileIcon filename={file.name} className="h-4 w-4" /><span className="truncate font-mono" title={file.path}>{file.path}</span></div>{file.previewKind === 'text' && (editing ? <Button size="sm" className="h-7" disabled={busy || !dirty || !file.hash} onClick={() => void save()}><Save className="mr-1 h-3.5 w-3.5" />{ru ? 'Сохранить' : 'Save'}</Button> : <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(true)}>{ru ? 'Редактировать' : 'Edit'}</Button>)}</div>}<div data-testid="file-preview-content" className="min-h-0 flex-1 overflow-hidden">{preview}</div></section>
    </div>
   </div>}
  </div>
 </motion.aside>;
}
