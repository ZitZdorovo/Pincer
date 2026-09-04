import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_VALUE = '__pincer_default_value__';
export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> & { 'data-testid'?: string };

/** Compact, theme-aware select used everywhere instead of the operating-system popup. */
const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, children, value, defaultValue, onChange, disabled, id, name, required, title, 'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy, 'data-testid': testId }, ref) => {
    const options = React.Children.toArray(children).filter(React.isValidElement).map((element) => {
      const props = element.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
      const optionValue = props.value === undefined ? String(props.children ?? '') : String(props.value);
      return { value: optionValue, disabled: props.disabled, label: props.children };
    });
    const controlled = value === undefined ? undefined : String(value) || EMPTY_VALUE;
    const initial = defaultValue === undefined ? undefined : String(defaultValue) || EMPTY_VALUE;
    return (
      <SelectPrimitive.Root
        value={controlled}
        defaultValue={initial}
        disabled={disabled}
        name={name}
        required={required}
        onValueChange={(next) => {
          const selected = next === EMPTY_VALUE ? '' : next;
          onChange?.({ target: { value: selected }, currentTarget: { value: selected } } as React.ChangeEvent<HTMLSelectElement>);
        }}
      >
        <SelectPrimitive.Trigger ref={ref} id={id} title={title} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} data-testid={testId} data-value={controlled === EMPTY_VALUE ? '' : controlled} className={cn(
          'inline-flex h-8 min-w-[7rem] max-w-full items-center justify-between gap-2 rounded-lg border border-black/10 bg-black/[0.025] px-2.5 text-sm text-foreground shadow-none outline-none transition-colors',
          'hover:bg-black/[0.05] focus:outline-none focus:ring-0 data-[state=open]:bg-black/[0.06] disabled:cursor-default disabled:opacity-45',
          'dark:border-white/10 dark:bg-white/[0.045] dark:hover:bg-white/[0.075] dark:data-[state=open]:bg-white/[0.09]',
          className,
        )}>
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon asChild><ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content position="popper" sideOffset={5} collisionPadding={10} className="z-[10000] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-black/10 bg-surface-modal p-1 text-foreground shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-white/10">
            <SelectPrimitive.Viewport className="max-h-[310px] overflow-y-auto">
              {options.map((option) => <SelectPrimitive.Item key={option.value || EMPTY_VALUE} value={option.value || EMPTY_VALUE} disabled={option.disabled} className="relative flex min-h-8 cursor-default select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-sm outline-none transition-colors data-[disabled]:opacity-40 data-[highlighted]:bg-black/[0.055] dark:data-[highlighted]:bg-white/[0.08]">
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex items-center"><Check className="h-3.5 w-3.5" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>)}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);
Select.displayName = 'Select';

export { Select };
