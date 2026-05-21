import {editorTabs} from '../constants';
import type {StudioTab} from '../types';

export function ToolRail({activeTab, setActiveTab}: {activeTab: StudioTab; setActiveTab: (tab: StudioTab) => void}) {
  return (
    <nav className="flex flex-row gap-1 border-b border-line bg-[#090a0d] p-2 lg:flex-col lg:border-b-0 lg:border-r">
      {editorTabs.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            title={item.label}
            className={`flex h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold transition ${
              active ? 'bg-mint text-ink' : 'text-zinc-500 hover:bg-panel hover:text-white'
            }`}
          >
            <Icon size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
