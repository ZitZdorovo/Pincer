import { useRef } from 'react';
import { cn } from '../lib/utils';
interface PanelTabButtonProps {
  testId?: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function PanelTabButton({ testId, icon, label, active, onClick }: PanelTabButtonProps) {
  const pointerActivated = useRef(false);

  return (
    <button
      data-testid={testId}
      type="button"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerActivated.current = true;
        event.preventDefault();
        onClick();
      }}
      onClick={() => {
        if (pointerActivated.current) {
          pointerActivated.current = false;
          return;
        }
        onClick();
      }}
      className={cn(
        'relative z-40 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-foreground/10 text-foreground'
          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
