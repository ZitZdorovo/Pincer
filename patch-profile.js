const fs = require("fs");
const path = "C:/Users/zdawn/Desktop/Pincer/src/features/GatewayAdminSettings.tsx";
let content = fs.readFileSync(path, "utf-8");

if (!content.includes("ChevronRight")) {
    content = content.replace("Check, ", "Check, ChevronRight, ");
}

const start = "export function ProfileSettings(";
const end = "function DeviceCard(";

const idxStart = content.indexOf(start);
const idxEnd = content.indexOf(end);

if (idxStart === -1 || idxEnd === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const newProfileComponent = `export function ProfileSettings({ connected }: { connected: boolean }) {
  const ru = usePreferences().language === 'ru'; 
  const [value, setValue] = useState<UserProfile | null>(null); 
  const [name, setName] = useState(''); 
  const [error, setError] = useState(''); 
  const [busy, setBusy] = useState(false);
  const [expandGithubInfo, setExpandGithubInfo] = useState(false);
  
  const load = () => { 
    if (!connected) return; 
    setError(''); 
    void window.pincer.gatewayAdmin.profile().then(result => { 
      if (result.ok) { 
        setValue(result.value); 
        setName(result.value.displayName || ''); 
      } else setError(result.error.message); 
    }); 
  };
  
  useEffect(load, [connected]);

  return (
    <section className="space-y-6 animate-in fade-in max-w-4xl pb-10">
      <header className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-amber-500">{ru ? 'Профиль' : 'Profile'}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-neutral-400">
          {ru ? 'Статистика вашего агента, серии активности и жизнь на рифе.' : 'Your agent statistics, activity streaks, and life on the reef.'}{' '}
          <span className="text-amber-500 hover:underline cursor-pointer">{ru ? 'Подробнее' : 'Learn more'}</span>
        </p>
      </header>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      
      {value && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted shadow-inner mb-4">
              <span className="text-3xl" role="img" aria-label="mascot crab">🦀</span>
            </div>
            <h3 className="text-xl font-bold">{value.displayName || value.id}</h3>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@{value.id}</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-500 uppercase">
                OPENCLAW
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="p-5 border-b border-border/50">
              <div className="flex sm:items-center justify-between gap-4 flex-col sm:flex-row">
                <div>
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {ru ? 'GITHUB CONNECTIONS' : 'GITHUB CONNECTIONS'}
                  </h3>
                  <p className="mt-1 max-w-xl text-xs text-muted-foreground leading-relaxed">
                    {ru ? 'Выберите учётную запись для каждой цели. Ваша подтверждённая личность для входа и указание соавторства остаются отдельными.' : 'Select an account for each purpose. Your verified login identity and attribution remain separate.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs font-medium px-3.5">
                    {ru ? 'Подключить GitHub' : 'Connect GitHub'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs font-medium px-3.5">
                    {ru ? 'Проверить' : 'Verify'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              <div className="flex sm:items-center justify-between gap-4 p-5 flex-col sm:flex-row hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">My GitHub</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ru ? 'Войдите с личным профилем Gateway, чтобы подключить My GitHub. Администраторы по-прежнему могут управлять System GitHub.' : 'Sign in with your personal Gateway profile to connect My GitHub. Admins can still manage System GitHub.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                   <div className="h-2 w-2 rounded-full bg-muted-foreground"></div>
                   {value.github ? \`@\${value.github.login}\` : ru ? 'Требуется личный вход' : 'Personal sign-in required'}
                </div>
              </div>

              <div className="flex sm:items-center justify-between gap-4 p-5 flex-col sm:flex-row hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">System GitHub</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ru ? 'Общая учётная запись для агентов и публикации по умолчанию.' : 'Shared account for agents and default publishing.'}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-destructive"></div>
                    {ru ? 'Нет учётных данных' : 'No credentials'}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs font-medium px-3">
                    {ru ? 'Изменить System GitHub' : 'Change System GitHub'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-border/50 p-5">
              <button type="button" onClick={() => setExpandGithubInfo(!expandGithubInfo)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer">
                <ChevronRight size={14} className={\`transition-transform duration-200 \${expandGithubInfo ? 'rotate-90' : ''}\`} />
                {ru ? 'Где используются эти аккаунты' : 'Where these accounts are used'}
              </button>
              {expandGithubInfo && (
                 <p className="mt-3 text-xs text-muted-foreground ml-5 animate-in slide-in-from-top-1 fade-in">
                   {ru ? 'GitHub аккаунты используются для создания коммитов, открытия PR, а также чтения приватных репозиториев от имени Pincer. Выбор зависит от контекста запрашиваемой агентской задачи.' : 'GitHub accounts are used to author commits, open PRs, and read private repositories on behalf of Pincer. Selection depends on the context of the agentic task.'}
                 </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between hover:bg-muted/30 transition cursor-pointer group shadow-sm">
            <div>
              <p className="text-sm font-semibold">{ru ? 'Статистика использования' : 'Usage statistics'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{ru ? 'Просмотр активности, расходов и тенденций использования.' : 'View activity logs, cost tracking, and usage trends.'}</p>
            </div>
            <ChevronRight size={20} className="text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      )}
    </section>
  );
}

`;

const newContent = content.slice(0, idxStart) + newProfileComponent + content.slice(idxEnd);
fs.writeFileSync(path, newContent, "utf-8");
console.log("Success");
