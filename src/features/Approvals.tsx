import { useEffect, useState } from 'react';
import { ShieldQuestion, RefreshCw } from 'lucide-react';
import type { ApprovalDecision, ApprovalScope } from '@openclaw/gateway-protocol';
import type { ApprovalItem, ApprovalState } from '../../shared/approvals';
import { usePreferences } from '../preferences';
import { Modal } from '../components/ui/modal';
import { Button } from '../components/ui/button';
import { useLocation } from 'react-router-dom';

function Scope({ scope, ru }: { scope: ApprovalScope; ru: boolean }) {
  const labels: Record<string, string> = ru
    ? { kind: 'Действие', target: 'Адресат', recipientCount: 'Получателей', recipients: 'Получатели', audience: 'Аудитория', amount: 'Сумма', currency: 'Валюта', visibility: 'Видимость', automation: 'Автоматизация', command: 'Команда', expiresInDays: 'Срок, дней' }
    : { kind: 'Action', target: 'Target', recipientCount: 'Recipients', recipients: 'Recipients', audience: 'Audience', amount: 'Amount', currency: 'Currency', visibility: 'Visibility', automation: 'Automation', command: 'Command', expiresInDays: 'Expires in days' };
  const values: Record<string, string> = ru ? { 'message-send': 'Отправка сообщения', payment: 'Платёж', 'external-post': 'Публикация', 'standing-grant': 'Постоянное разрешение', public: 'Публично', restricted: 'Ограниченный доступ', internal: 'Внутренняя', external: 'Внешняя' } : {};
  return <dl className="mt-3 space-y-1 rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{Object.entries(scope).map(([key, value]) => <div key={key} className="flex gap-3"><dt className="w-24 shrink-0 text-muted-foreground">{labels[key] || key}</dt><dd className="min-w-0 break-words font-medium">{Array.isArray(value) ? value.join(', ') : values[String(value)] || String(value)}</dd></div>)}</dl>;
}

function Card({ item, connected, now, ru }: { item: ApprovalItem; connected: boolean; now: number; ru: boolean }) {
  const { approval, reviewToken } = item; const presentation = approval.presentation;
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [permanent, setPermanent] = useState(false);
  const pending = approval.status === 'pending' && approval.expiresAtMs > now;
  const labels: Record<ApprovalDecision, string> = ru ? { 'allow-once': 'Разрешить один раз', 'allow-always': 'Разрешать всегда', deny: 'Отклонить' } : { 'allow-once': 'Allow once', 'allow-always': 'Always allow', deny: 'Deny' };
  const statuses = ru ? { pending: 'Ожидает решения', allowed: 'Разрешено', denied: 'Отклонено', expired: 'Срок истёк', cancelled: 'Отменено' } : { pending: 'Awaiting decision', allowed: 'Allowed', denied: 'Denied', expired: 'Expired', cancelled: 'Cancelled' };
  const resolve = async (decision: ApprovalDecision) => {
    if (decision === 'allow-always' && !permanent) { setPermanent(true); return; }
    setBusy(true); setError('');
    try {
      const result = await window.pincer.approvals.resolve(approval.id, reviewToken, decision);
      if (!result.ok) {
        const changed = ['APPROVAL_CHANGED', 'APPROVAL_FINISHED', 'CONNECTION_CHANGED'].includes(result.error.code);
        setError(changed ? (ru ? 'Запрос изменился или уже завершён. Проверьте актуальное состояние.' : 'This request changed or was already resolved. Check its current state.') : (ru ? 'Решение не подтверждено Gateway. Обновите список перед повторной попыткой.' : 'The Gateway did not confirm this decision. Refresh before retrying.'));
      }
    } catch { setError(ru ? 'Не удалось получить подтверждение.' : 'Could not confirm the decision.'); }
    finally { setBusy(false); setPermanent(false); }
  };
  return <article data-testid="approval-card" className="rounded-2xl border border-amber-500/20 bg-surface-modal px-4 py-3 shadow-sm">
    <div className="flex items-start gap-2"><ShieldQuestion size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" /><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{presentation.kind === 'exec' ? (ru ? 'Выполнение команды' : 'Run command') : presentation.title}</h3><p className="mt-1 text-xs text-muted-foreground">{statuses[pending ? 'pending' : approval.status === 'pending' ? 'expired' : approval.status]}</p></div></div>
    {presentation.kind === 'exec' ? <><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{presentation.commandText}</pre>{presentation.commandPreview && presentation.commandPreview !== presentation.commandText && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{presentation.commandPreview}</p>}{presentation.warningText && <p className="mt-2 whitespace-pre-wrap text-xs text-amber-700 dark:text-amber-400">{presentation.warningText}</p>}<p className="mt-2 break-all text-xs text-muted-foreground">{[presentation.host, presentation.nodeId].filter(Boolean).join(' · ')}</p></> : <><p className="mt-3 whitespace-pre-wrap text-sm">{presentation.description}</p>{presentation.kind === 'plugin' && presentation.detail && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{presentation.detail}</pre>}</>}
    {presentation.agentId && <p className="mt-2 text-xs text-muted-foreground">{ru ? 'Агент' : 'Agent'}: {presentation.agentId}</p>}
    {'scope' in presentation && presentation.scope && <Scope scope={presentation.scope} ru={ru} />}
    {pending && <p className="mt-2 text-xs text-muted-foreground">{ru ? 'Действует до' : 'Expires at'} {new Date(approval.expiresAtMs).toLocaleTimeString(ru ? 'ru-RU' : 'en-US')}</p>}
    {presentation.kind === 'plugin' && presentation.externalResolution && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{ru ? 'Подтверждение во внешнем сервисе: ' : 'Confirm in the external service: '}{presentation.externalResolution.label}</p>}
    {permanent && pending && <div className="mt-3 rounded-lg border border-amber-500/30 p-3 text-xs"><p>{ru ? 'Это разрешение будет действовать и для последующих подходящих запросов. Подтвердить постоянное правило?' : 'This permission also applies to future matching requests. Create a standing rule?'}</p><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !connected} onClick={() => void resolve('allow-always')}>{ru ? 'Подтвердить правило' : 'Confirm rule'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setPermanent(false)}>{ru ? 'Отмена' : 'Cancel'}</Button></div></div>}
    {pending && !permanent && <div className="mt-3 flex flex-wrap gap-2">{presentation.allowedDecisions.map((decision) => <Button key={decision} type="button" size="sm" variant={decision === 'deny' ? 'outline' : 'secondary'} disabled={busy || !connected || (presentation.kind === 'plugin' && Boolean(presentation.externalResolution?.decisions.some((value) => value === decision)))} onClick={() => void resolve(decision)}>{labels[decision]}</Button>)}</div>}
    {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
  </article>;
}

export function Approvals({ updateBusy, inline = false }: { updateBusy: boolean; inline?: boolean }) {
  const location = useLocation();
  const ru = usePreferences().language === 'ru';
  const [state, setState] = useState<ApprovalState | null>(null); const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now()); const [error, setError] = useState(false); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let mounted = true;
    const accept = (next: ApprovalState) => { if (mounted) setState((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.approvals.onState(accept); void window.pincer.approvals.snapshot().then(accept);
    return () => { mounted = false; off(); };
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (updateBusy) setOpen(false); }, [updateBusy]);
  const pending = state?.items.filter((item) => item.approval.status === 'pending' && item.approval.expiresAtMs > now).length || 0;
  useEffect(() => { if (!pending || location.pathname !== '/') setOpen(false); }, [pending, location.pathname]);
  if (!state || (!inline && !pending)) return null;
  const content = <><Button size="sm" variant="ghost" disabled={!state.connected || refreshing} onClick={() => { setRefreshing(true); setError(false); void window.pincer.approvals.refresh().then((result) => setError(!result.ok)).catch(() => setError(true)).finally(() => setRefreshing(false)); }}><RefreshCw size={14} className="mr-2" />{ru ? 'Обновить' : 'Refresh'}</Button>
      {!state.connected && <p className="my-2 text-xs text-muted-foreground">{ru ? 'Нет подключения. Решения временно недоступны.' : 'Disconnected. Decisions are temporarily unavailable.'}</p>}
      {(state.error || error) && <p role="alert" className="my-2 text-xs text-destructive">{ru ? 'Не удалось обновить запросы. Проверьте подключение и поддержку approvals на Gateway.' : 'Could not refresh requests. Check the connection and Gateway approvals support.'}</p>}
      <div className="mt-3 max-h-[60vh] space-y-3 overflow-auto">{state.items.map((item) => <Card key={item.approval.id + item.reviewToken} item={item} connected={state.connected && !updateBusy} now={now} ru={ru} />)}{!state.items.length && <p className="text-sm text-muted-foreground">{ru ? 'Нет ожидающих или недавних запросов.' : 'No pending or recent requests.'}</p>}</div></>;
  if (inline) return <section className="space-y-5"><div><h2 className="openx-section-title !mb-2">{ru ? 'Одобрения Gateway' : 'Gateway approvals'}</h2><p className="text-sm text-muted-foreground">{ru ? 'Ожидающие запросы и недавние решения. Решение всегда принимает пользователь.' : 'Pending requests and recent decisions. The user always makes the decision.'}</p></div><div className="settings-card">{content}</div></section>;
  return <>
    <button disabled={updateBusy} onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-surface-modal px-3 py-2 text-xs shadow-sm" aria-label={ru ? 'Разрешения' : 'Approvals'}><ShieldQuestion size={15} className="text-amber-600 dark:text-amber-400" />{ru ? 'Разрешения' : 'Approvals'}{pending > 0 && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-medium" aria-live="polite">{pending}</span>}</button>
    <Modal open={open} title={ru ? 'Разрешения' : 'Approvals'} close={() => setOpen(false)} description={ru ? 'Решения принимает пользователь. Правила и срок запроса задаёт Gateway.' : 'You choose whether to approve. The Gateway sets the rules and expiry.'}>
      {content}
    </Modal>
  </>;
}
