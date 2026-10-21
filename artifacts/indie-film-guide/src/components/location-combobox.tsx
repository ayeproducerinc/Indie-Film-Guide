import { useId, useMemo, useRef, useState } from 'react';
import type { Location } from '@workspace/api-client-react';

type Props = {
  locations: Location[];
  selected: Location | null;
  onSelect: (l: Location | null) => void;
  invalid?: boolean;
  describedBy?: string;
};

export function LocationCombobox({ locations, selected, onSelect, invalid, describedBy }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const shown = selected ? `${selected.city}` : text;
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return locations.filter((l) => !q || l.city.toLowerCase().includes(q)).slice(0, 50);
  }, [locations, text]);

  const choose = (l: Location) => {
    onSelect(l);
    setText(l.city);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="relative">
      <input
        ref={ref}
        id={`${id}-input`}
        data-testid="input-city"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-activedescendant={open && matches[active] ? `${id}-opt-${matches[active].id}` : undefined}
        autoComplete="off"
        placeholder="Search Georgia cities"
        value={shown}
        onChange={(e) => {
          if (selected) onSelect(null);
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        className="field"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Georgia cities"
          className="pop absolute z-20 mt-1 max-h-60 w-full overflow-auto border-2 border-foreground bg-popover shadow-lg"
        >
          {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground" role="presentation">No matching city.</li>}
          {matches.map((l, i) => (
            <li
              key={l.id}
              id={`${id}-opt-${l.id}`}
              role="option"
              aria-selected={selected?.id === l.id}
              data-testid={`option-city-${l.id}`}
              onMouseDown={(e) => { e.preventDefault(); choose(l); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-3 text-sm ${i === active ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {l.city}, {l.state}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
