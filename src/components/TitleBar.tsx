// Presentation adapted from OpenX TitleBar. All host calls are new Pincer IPC.
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, PanelLeft, Square, X, Copy, Moon, Sun, Languages } from 'lucide-react';
import { translator, type Language } from '../i18n';

export function TitleBar({ language, dark, toggleTheme, toggleLanguage, toggleSidebar, back }: {
  language: Language; dark: boolean; toggleTheme(): void; toggleLanguage(): void; toggleSidebar(): void; back(): void;
}) {
  const [maximized, setMaximized] = useState(false);
  const t = translator(language);
  useEffect(() => {
    const off = window.pincer.window.onMaximized(setMaximized);
    void window.pincer.window.isMaximized().then(setMaximized);
    return off;
  }, []);
  return <div data-testid="windows-titlebar" className="drag-region flex h-10 shrink-0 items-center bg-surface-sidebar">
    <div className="no-drag flex h-full items-center pl-1" style={window.pincer.platform === 'darwin' ? { paddingLeft: 80 } : undefined}>
      <button className="titlebar-button" title={t('sidebar')} aria-label={t('sidebar')} onClick={toggleSidebar}><PanelLeft className="h-4 w-4" /></button>
      <button className="titlebar-button" title={t('back')} aria-label={t('back')} onClick={back}><ArrowLeft className="h-4 w-4" /></button>
      <button className="titlebar-button" title={t('forward')} aria-label={t('forward')} disabled><ArrowRight className="h-4 w-4" /></button>
      <div className="ml-2 flex h-full items-center gap-0.5">
        {(['file', 'edit', 'view', 'help'] as const).map((menu) => <button key={menu} className="h-7 rounded px-2.5 text-xs text-foreground/75 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10" onClick={() => void window.pincer.window.showMenu(menu)}>{t(menu)}</button>)}
      </div>
    </div>
    <div className="min-w-8 flex-1" />
    <div className="no-drag flex h-full items-center">
      <button className="titlebar-button" title={t('language')} aria-label={t('language')} onClick={toggleLanguage}><Languages className="h-4 w-4" /></button>
      <button className="titlebar-button" title={t('theme')} aria-label={t('theme')} onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
      {window.pincer.platform === 'win32' && <>
        <button className="window-control" aria-label={t('minimize')} title={t('minimize')} onClick={() => void window.pincer.window.action('minimize')}><Minus className="h-4 w-4" /></button>
        <button className="window-control" aria-label={maximized ? t('restore') : t('maximize')} title={maximized ? t('restore') : t('maximize')} onClick={() => void window.pincer.window.action('maximize')}>{maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-4 w-4" />}</button>
        <button className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-500 hover:text-white" aria-label={t('close')} title={t('close')} onClick={() => void window.pincer.window.action('close')}><X className="h-4 w-4" /></button>
      </>}
    </div>
  </div>;
}
