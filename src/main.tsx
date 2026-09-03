import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { HashRouter } from 'react-router-dom';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from 'sonner';
import { usePreferences } from './preferences';
import './donor/i18n';
import './styles/globals.css';
import 'katex/dist/katex.min.css';
import 'streamdown/styles.css';
import './styles/chrome.css';
import './styles/chat.css';

function DonorToaster() { const { theme } = usePreferences(); return <Toaster position="bottom-right" richColors closeButton theme={theme} style={{ zIndex: 99999 }} />; }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><TooltipProvider delayDuration={300}><App /><DonorToaster /></TooltipProvider></HashRouter></React.StrictMode>);
