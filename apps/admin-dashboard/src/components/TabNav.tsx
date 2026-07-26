type TabId = 'ledger' | 'compliance' | 'policy' | 'forensics' | 'sandbox';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ledger', label: 'Transaction Ledger' },
  { id: 'compliance', label: 'Compliance & Governance' },
  { id: 'policy', label: 'Cedar Policy & Simulator' },
  { id: 'forensics', label: 'Forensics & Verifier' },
  { id: 'sandbox', label: 'Interactive Sandbox' },
];

export function TabNav({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <div className="tabs-navigation" role="tablist" aria-label="Dashboard sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type { TabId };
