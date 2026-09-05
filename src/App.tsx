import { useEffect, useRef, useState } from 'react';
import type { GatewayState, UpdateState } from '../shared/contract';
import { TitleBar } from './components/TitleBar';
import { ConnectionPage } from './components/ConnectionPage';
import { Shell } from './components/Shell';
import { translator } from './i18n';
import { UpdateModal } from './features/Updates';
import { Settings } from './features/Settings';
import { Approvals } from './features/Approvals';
import { usePreferences } from './preferences';
import { useLocation, useNavigate } from 'react-router-dom';
import i18n from './donor/i18n';

export default function App() {
  const [state, setState] = useState<GatewayState | null>(null);
  const [error, setError] = useState(false);
  const [shell, setShell] = useState(false);
  const [updates, setUpdates] = useState<UpdateState | null>(null);
  const lastConnected = useRef(false);
  const location = useLocation(); const navigate = useNavigate();
  const settings = location.pathname === '/settings';
  const setSettings = (open: boolean) => navigate(open ? '/settings' : '/');
  const [dirty, setDirty] = useState(false);
  const preferences = usePreferences();
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const { language } = preferences;
  const dark = preferences.theme === 'system' ? systemDark : preferences.theme === 'dark';
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
    const query = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.lang = language;
    void i18n.changeLanguage(language);
    localStorage.setItem('pincer.theme', dark ? 'dark' : 'light');
    localStorage.setItem('pincer.language', language);
  }, [dark, language]);
  useEffect(() => {
    document.documentElement.dataset.interfaceFontSize = preferences.interfaceFontSize;
    document.documentElement.dataset.reducedMotion = preferences.reducedMotion;
    document.documentElement.dataset.interfaceFont = preferences.interfaceFont;
    document.documentElement.dataset.chatFont = preferences.chatFont;
    document.documentElement.dataset.accentColor = preferences.accentColor;
    document.documentElement.style.setProperty('--pincer-chat-width', `${preferences.chatWidth}px`);
  }, [preferences.interfaceFontSize, preferences.reducedMotion, preferences.interfaceFont, preferences.chatFont, preferences.accentColor, preferences.chatWidth]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === ',' && !document.querySelector('dialog[open], [role="dialog"]')) { event.preventDefault(); setSettings(true); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
    <TitleBar />
    {!state ? <main className="grid flex-1 place-items-center text-sm text-muted-foreground" role={error ? 'alert' : 'status'}>{t(error ? 'startupError' : 'loading')}</main>
      : <><div className={shell && !settings ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><Shell key={JSON.stringify(state.profile)} state={state} language={language} configure={() => setShell(false)} openSettings={() => setSettings(true)} updates={updates} onDirty={setDirty} active={shell && !settings} /></div>
        {settings ? <Settings initialSection={new URLSearchParams(location.search).get('section') === 'gateway' ? 'gateway' : new URLSearchParams(location.search).get('section') === 'updates' ? 'updates' : 'appearance'} gateway={state} updates={updates} back={() => { setShell(true); setSettings(false); }} dirty={dirty} /> : !shell && <ConnectionPage state={state} language={language} preview={() => setShell(true)} />}</>}
    <Approvals updateBusy={updates?.phase === 'downloading' || updates?.phase === 'installing'} />
    <UpdateModal state={updates} language={language} />
  </div>;
}
