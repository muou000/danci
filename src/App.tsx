import { useState } from 'react';
import { PASSAGE_TIER_LABELS, type CompiledPassage } from './corpus';
import { COMPILED_DEMO_PASSAGES } from './corpus/compiled-demos';
import { PassageCard } from './components/PassageCard';

export interface AppProps {
  passages?: CompiledPassage[];
}

export function App({ passages = COMPILED_DEMO_PASSAGES }: AppProps) {
  const [activeId, setActiveId] = useState<string>(passages[0]?.id ?? '');

  const activePassage =
    passages.find((p) => p.id === activeId) ?? passages[0];

  return (
    <div className="app-shell">
      <nav className="passage-switcher" aria-label="示例短文切换">
        <div className="passage-switcher__brand">
          <span className="passage-switcher__brand-title">短文背单词</span>
          <span className="passage-switcher__brand-sub">
            2016版四六级大纲 · 双栏语境精读
          </span>
        </div>
        <div className="passage-switcher__tabs">
          {passages.map((item) => {
            const isActive = item.id === activePassage?.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`passage-switcher__tab${
                  isActive ? ' passage-switcher__tab--active' : ''
                }`}
                aria-pressed={isActive}
                onClick={() => setActiveId(item.id)}
              >
                {item.indexLabel} · {PASSAGE_TIER_LABELS[item.tier]} · {item.topic}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="app-main">
        {activePassage && <PassageCard passage={activePassage} />}
      </main>
    </div>
  );
}
