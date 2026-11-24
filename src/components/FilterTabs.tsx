export type FilterMode = 'all' | 'person' | 'selected';

interface Props {
  value: FilterMode;
  onChange: (mode: FilterMode) => void;
  allCount: number;
  selectedCount: number;
}

export default function FilterTabs({ value, onChange, allCount, selectedCount }: Props) {
  const tabs: { id: FilterMode; label: string }[] = [
    { id: 'all', label: `All Photos (${allCount})` },
    { id: 'person', label: 'By Person' },
    { id: 'selected', label: `Selected (${selectedCount})` },
  ];
  return (
    <div className="mx-3 mt-3 flex gap-1.5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg border px-2 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
            value === t.id ? 'border-bone bg-bone text-ink' : 'border-surface-3 text-zinc-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
