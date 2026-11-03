import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toBlob } from 'html-to-image';
import { PASSAGE_TIER_LABELS, type CompiledPassage } from './corpus';
import { COMPILED_DEMO_PASSAGES } from './corpus/compiled-demos';
import {
  LearningLibrary,
  type LearningItemSummary,
} from './components/LearningLibrary';
import { PassageCard, type PassageCardProps } from './components/PassageCard';
import {
  readLearningState,
  recordPassageRead,
  writeLearningState,
  type LearningState,
} from './learning-state';

export interface AppProps {
  passages?: CompiledPassage[];
}

const PASSAGE_EXPORT_WIDTH = 1080;

function passageImageFilename(passage: CompiledPassage): string {
  const safeParts = `${passage.indexLabel}-${passage.titleZh}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/-+/g, '-');
  return `${safeParts}.png`;
}

function downloadPng(blob: Blob, filename: string): void {
  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 0);
}

function collectLearningItems(passages: CompiledPassage[]): LearningItemSummary[] {
  const items = new Map<string, LearningItemSummary>();
  for (const passage of passages) {
    for (const paragraph of passage.paragraphs) {
      for (const sentence of paragraph.sentences) {
        for (const token of sentence.tokens) {
          if (token.type !== 'annotation') continue;
          const item = items.get(token.itemKey) ?? {
            key: token.itemKey,
            label:
              token.headwordId ??
              token.phrase ??
              token.itemKey.replace(/^(?:word|phrase|oos):/, ''),
            surfaces: [],
            glosses: [],
          };
          if (!item.surfaces.includes(token.surface)) {
            item.surfaces.push(token.surface);
          }
          if (!item.glosses.includes(token.gloss)) item.glosses.push(token.gloss);
          items.set(token.itemKey, item);
        }
      }
    }
  }
  return Array.from(items.values());
}

export function App({ passages = COMPILED_DEMO_PASSAGES }: AppProps) {
  const [activeId, setActiveId] = useState<string>(passages[0]?.id ?? '');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const libraryTrigger = useRef<HTMLButtonElement>(null);
  const exportCardRef = useRef<HTMLElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [learningState, setLearningState] = useState<LearningState>(() => {
    const saved = readLearningState();
    return passages[0] ? recordPassageRead(saved, passages[0].id) : saved;
  });

  useEffect(() => {
    writeLearningState(learningState);
  }, []);

  const commitLearningState = (nextState: LearningState) => {
    setLearningState(nextState);
    writeLearningState(nextState);
  };

  const toggleMasteredItem = (itemKey: string) => {
    const mastered = new Set(learningState.masteredItemKeys);
    if (mastered.has(itemKey)) {
      mastered.delete(itemKey);
    } else {
      mastered.add(itemKey);
    }
    commitLearningState({
      ...learningState,
      masteredItemKeys: Array.from(mastered),
    });
  };

  const setExpansionHidden = (
    passageId: string,
    entryId: string,
    hidden: boolean
  ) => {
    const hiddenEntries = new Set(
      learningState.hiddenExpansionIds[passageId] ?? []
    );
    if (hidden) {
      hiddenEntries.add(entryId);
    } else {
      hiddenEntries.delete(entryId);
    }
    const hiddenExpansionIds = { ...learningState.hiddenExpansionIds };
    if (hiddenEntries.size > 0) {
      hiddenExpansionIds[passageId] = Array.from(hiddenEntries);
    } else {
      delete hiddenExpansionIds[passageId];
    }
    commitLearningState({ ...learningState, hiddenExpansionIds });
  };

  const activePassage =
    passages.find((p) => p.id === activeId) ?? passages[0];
  const activePassageCardProps: PassageCardProps | null = activePassage
    ? {
        passage: activePassage,
        masteredItemKeys: new Set(learningState.masteredItemKeys),
        onToggleMastered: toggleMasteredItem,
        hiddenExpansionIds:
          learningState.hiddenExpansionIds[activePassage.id] ?? [],
        onHideExpansion: (entryId) =>
          setExpansionHidden(activePassage.id, entryId, true),
        onRestoreExpansion: (entryId) =>
          setExpansionHidden(activePassage.id, entryId, false),
      }
    : null;
  const learningItems = useMemo(() => collectLearningItems(passages), [passages]);

  const restoreMasteredItems = (itemKeys: string[]) => {
    const restored = new Set(itemKeys);
    commitLearningState({
      ...learningState,
      masteredItemKeys: learningState.masteredItemKeys.filter(
        (key) => !restored.has(key)
      ),
    });
  };

  const exportPassageImage = async () => {
    if (!activePassage) return;

    flushSync(() => {
      setIsExporting(true);
      setExportMessage('正在生成高清图片...');
    });
    try {
      const exportCard = exportCardRef.current;
      if (!exportCard) throw new Error('Passage image is not ready.');
      const png = await toBlob(exportCard, {
        width: PASSAGE_EXPORT_WIDTH,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      if (!png) throw new Error('Unable to create passage image.');

      downloadPng(png, passageImageFilename(activePassage));
      setExportMessage('高清 PNG 图片已开始下载。');
    } catch {
      setExportMessage('图片导出失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-shell">
      <nav className="passage-switcher" aria-label="示例短文切换">
        <div className="passage-switcher__brand">
          <span className="passage-switcher__brand-title">短文背单词</span>
          <span className="passage-switcher__brand-sub">
            2016版四六级大纲 · 双栏语境精读
          </span>
          <button
            ref={libraryTrigger}
            type="button"
            className="learning-library-trigger"
            aria-haspopup="dialog"
            aria-expanded={isLibraryOpen}
            onClick={() => setIsLibraryOpen(true)}
          >
            已掌握词库
          </button>
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
                onClick={() => {
                  setActiveId(item.id);
                  commitLearningState(recordPassageRead(learningState, item.id));
                }}
              >
                {item.indexLabel} · {PASSAGE_TIER_LABELS[item.tier]} · {item.topic}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="app-main">
        {activePassageCardProps && (
          <>
            <div className="passage-actions">
              <button
                type="button"
                className="passage-export-button"
                aria-busy={isExporting}
                disabled={isExporting}
                onClick={exportPassageImage}
              >
                {isExporting ? '正在导出图片...' : '导出图片'}
              </button>
              <span
                className="passage-export-status"
                role={exportMessage ? 'status' : undefined}
                aria-live="polite"
              >
                {exportMessage}
              </span>
            </div>
            <PassageCard
              key={activePassageCardProps.passage.id}
              {...activePassageCardProps}
            />
            {isExporting && (
              <div
                className="passage-export-stage"
                aria-hidden="true"
                inert
                style={{ width: PASSAGE_EXPORT_WIDTH }}
              >
                <PassageCard
                  key={`export-${activePassageCardProps.passage.id}`}
                  {...activePassageCardProps}
                  exportMode
                  exportRef={exportCardRef}
                />
              </div>
            )}
          </>
        )}
      </main>
      {isLibraryOpen && (
        <LearningLibrary
          state={learningState}
          items={learningItems}
          passages={passages}
          onClose={() => {
            setIsLibraryOpen(false);
            libraryTrigger.current?.focus();
          }}
          onRestoreItems={restoreMasteredItems}
          onImportState={commitLearningState}
        />
      )}
    </div>
  );
}
