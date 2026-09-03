import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePreferences } from '../../preferences';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
export function Modal({ open, title, children, close, description }: { open: boolean; title: string; children: ReactNode; close(): void; description?: string }) {
  const { language } = usePreferences();
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}><DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface-modal p-6 text-foreground shadow-2xl">
    <div className="flex items-center gap-3"><DialogTitle className="flex-1 text-xl font-semibold tracking-tight">{title}</DialogTitle><button type="button" onClick={close} aria-label={language === 'ru' ? 'Закрыть' : 'Close'} className="rounded p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button></div><DialogDescription className={description ? 'mt-2 text-sm text-muted-foreground' : 'sr-only'}>{description || title}</DialogDescription><div className="mt-4">{children}</div>
  </DialogContent></Dialog>;
}
