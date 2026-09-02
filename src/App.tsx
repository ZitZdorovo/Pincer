import { useEffect, useRef, useState } from 'react';
import type { GatewayState, UpdateState } from '../shared/contract';
import { TitleBar } from './components/TitleBar';
import { ConnectionPage } from './components/ConnectionPage';
import { Shell } from './components/Shell';
import { translator, type Language } from './i18n';
import { UpdateModal } from './features/Updates';

export default function App() {
  const [state, setState] = useState<GatewayState | null>(null);
  const [error, setError] = useState(false);
  const [shell, setShell] = useState(false);
  const [updates, setUpdates] = useState<UpdateState | null>(null);
  const lastConnected = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('pincer.language') === 'en' ? 'en' : 'ru');
  const [dark, setDark] = useState(() => localStorage.getItem('pincer.theme') === 'dark');
  const t = translator(language);
  useEffect(() => {
    let active = true;
    const accept = (next: GatewayState) => {
      if (active) setState((previous) => !previous || next.revision >= previous.revision ? next : previous);
    };
    // Subscribe first, then hydrate; revisions prevent an older snapshot winning.
    const off = window.pincer.gateway.onState(accept);
    void window.pincer.gateway.snapshot().then(accept).catch(() => { if (active) setError(true); });
    return () => { active = false; off(); };
  }, []);
  useEffect(() => {
    const connected = state?.operator.phase === 'connected';
    if (connected && !lastConnected.current) setShell(true);
    lastConnected.current = connected;
  }, [state?.operator.phase]);
  useEffect(() => {
    let active = true;
    const accept = (next: UpdateState) => { if (active) setUpdates((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const off = window.pincer.updates.onState(accept);
    void window.pincer.updates.snapshot().then(accept);
    return () => { active = false; off(); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.lang = language;
    localStorage.setItem('pincer.theme', dark ? 'dark' : 'light');
    localStorage.setItem('pincer.language', language);
  }, [dark, language]);
  return <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
    <TitleBar language={language} dark={dark} toggleTheme={() => setDark((value) => !value)} toggleLanguage={() => setLanguage((value) => value === 'ru' ? 'en' : 'ru')} toggleSidebar={() => setCollapsed((value) => !value)} back={() => setShell((value) => !value)} />
    {!state ? <main className="grid flex-1 place-items-center text-sm text-muted-foreground" role={error ? 'alert' : 'status'}>{t(error ? 'startupError' : 'loading')}</main>
      : <><div className={shell ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><Shell key={JSON.stringify(state.profile)} state={state} language={language} collapsed={collapsed} configure={() => setShell(false)} updates={updates} /></div>
        {!shell && <ConnectionPage state={state} language={language} preview={() => setShell(true)} />}</>}
    <UpdateModal state={updates} language={language} />
  </div>;
}
