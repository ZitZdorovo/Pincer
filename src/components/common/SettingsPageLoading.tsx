import { LoadingSpinner } from './LoadingSpinner';

export function SettingsPageLoading({
  testId,
  title,
  description,
}: {
  testId: string;
  title: string;
  description: string;
}) {
  const ru = document.documentElement.lang.startsWith('ru');
  return (
    <div data-testid={testId} className="openx-page-root" aria-busy="true">
      <div className="openx-page-frame">
        <div className="openx-page-header !mb-6">
          <div>
            <h1 className="openx-page-title">{title}</h1>
            <p className="text-subtitle font-medium text-foreground/70">{description}</p>
          </div>
        </div>
        <div role="status" className="settings-card flex min-h-28 items-center gap-3 text-sm text-muted-foreground">
          <LoadingSpinner size="sm" />
          <span>{ru ? 'Загрузка данных…' : 'Loading data…'}</span>
        </div>
      </div>
    </div>
  );
}
