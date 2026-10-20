import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

type Tab<V extends string> = { value: V; label: ReactNode };

type TabsProps<V extends string> = {
  /** Names the tab list for assistive tech, e.g. "Survey sections". */
  label: string;
  tabs: readonly Tab<V>[];
  value: V;
  onChange: (value: V) => void;
  /** The selected tab's content, rendered in the one tabpanel. */
  children: ReactNode;
};

/**
 * The console's sub-tabs (`.subtabs`), as a real ARIA tabs widget: one Tab
 * stop, Left/Right (wrapping), Home and End move and select, and the content
 * sits in a `tabpanel` labelled by its tab.
 */
export function Tabs<V extends string>({ label, tabs, value, onChange, children }: TabsProps<V>) {
  const baseId = useId();
  const refs = useRef(new Map<V, HTMLButtonElement>());
  const tabId = (v: V) => `${baseId}-tab-${v}`;
  const panelId = `${baseId}-panel`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((t) => t.value === value);
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? index === last ? 0 : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0 ? last : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const next = target === null ? undefined : tabs[target];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <>
      <div className="subtabs" role="tablist" aria-label={label}>
        {tabs.map((t) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              ref={(el) => {
                if (el) refs.current.set(t.value, el);
                else refs.current.delete(t.value);
              }}
              id={tabId(t.value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              className={`subtab${selected ? ' active' : ''}`}
              onClick={() => onChange(t.value)}
              onKeyDown={onKeyDown}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="subtab-panel" role="tabpanel" id={panelId} aria-labelledby={tabId(value)}>
        {children}
      </div>
    </>
  );
}
