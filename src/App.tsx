import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CompiledPassage } from './corpus';
import { PASSAGE_TIER_LABELS } from './corpus/labels';
import { COMPILED_DEMO_PASSAGES } from './corpus/compiled-demos';
import {
  GlobalPassageSearch,
  PassageDirectory,
} from './components/PassageDiscovery';
import {
  LearningLibrary,
  type LearningItemSummary,
} from './components/LearningLibrary';
import { PassageCard, type PassageCardProps } from './components/PassageCard';
import {
  buildPassageSearchIndex,
  searchPassages,
} from './passage-library';
import {
  readLearningState,
  recordPassageRead,
  writeLearningState,
  type LearningState,
} from './learning-state';

export interface AppProps {
  passages?: CompiledPassage[];
  loadAllPassages?: () => Promise<CompiledPassage[]>;
}

const PASSAGE_EXPORT_WIDTH = 1080;
const MASTERY_UNDO_DURATION_MS = 10_000;

interface MasteryFeedback {
  message: string;
  itemKeys?: string[];
}

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

export function App({
  passages: initialPassages = COMPILED_DEMO_PASSAGES,
  loadAllPassages,
}: AppProps) {
  const [passages, setPassages] = useState(initialPassages);
  const passagesRef = useRef(initialPassages);
  const passageLoadPromise = useRef<Promise<CompiledPassage[]> | null>(null);
  const [isLoadingCorpus, setIsLoadingCorpus] = useState(false);
  const [corpusLoadFailed, setCorpusLoadFailed] = useState(false);
  const [activeId, setActiveId] = useState<string>(initialPassages[0]?.id ?? '');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const libraryTrigger = useRef<HTMLButtonElement>(null);
  const exportCardRef = useRef<HTMLElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [masteryFeedback, setMasteryFeedback] =
    useState<MasteryFeedback | null>(null);
  const masteryFeedbackTimer = useRef<number | null>(null);
  const [learningState, setLearningState] = useState<LearningState>(() => {
    const saved = readLearningState();
    return initialPassages[0]
      ? recordPassageRead(saved, initialPassages[0].id)
      : saved;
  });

  const ensureCorpusLoaded = () => {
    if (!loadAllPassages) return Promise.resolve(passagesRef.current);
    if (passageLoadPromise.current) return passageLoadPromise.current;

    setIsLoadingCorpus(true);
    setCorpusLoadFailed(false);
    const pendingLoad = Promise.resolve()
      .then(loadAllPassages)
      .then((loadedPassages) => {
        passagesRef.current = loadedPassages;
        setPassages(loadedPassages);
        return loadedPassages;
      })
      .catch((error: unknown) => {
        passageLoadPromise.current = null;
        setCorpusLoadFailed(true);
        throw error;
      })
      .finally(() => setIsLoadingCorpus(false));
    passageLoadPromise.current = pendingLoad;
    return pendingLoad;
  };

  useEffect(() => {
    writeLearningState(learningState);
  }, []);

  useEffect(
    () => () => {
      if (masteryFeedbackTimer.current !== null) {
        window.clearTimeout(masteryFeedbackTimer.current);
      }
    },
    []
  );

  const clearMasteryFeedback = () => {
    if (masteryFeedbackTimer.current !== null) {
      window.clearTimeout(masteryFeedbackTimer.current);
      masteryFeedbackTimer.current = null;
    }
    setMasteryFeedback(null);
  };

  const showMasteryFeedback = (
    feedback: MasteryFeedback,
    durationMs: number
  ) => {
    if (masteryFeedbackTimer.current !== null) {
      window.clearTimeout(masteryFeedbackTimer.current);
    }
    setMasteryFeedback(feedback);
    const timerId = window.setTimeout(() => {
      setMasteryFeedback((current) =>
        current === feedback ? null : current
      );
      if (masteryFeedbackTimer.current === timerId) {
        masteryFeedbackTimer.current = null;
      }
    }, durationMs);
    masteryFeedbackTimer.current = timerId;
  };

  const commitLearningState = (nextState: LearningState) => {
    if (nextState.masteredItemKeys !== learningState.masteredItemKeys) {
      clearMasteryFeedback();
    }
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

  const markMasteredItems = (itemKeys: string[]) => {
    const mastered = new Set(learningState.masteredItemKeys);
    const newItemKeys = Array.from(new Set(itemKeys)).filter(
      (itemKey) => !mastered.has(itemKey)
    );
    if (newItemKeys.length === 0) return;

    commitLearningState({
      ...learningState,
      masteredItemKeys: [...learningState.masteredItemKeys, ...newItemKeys],
    });
    showMasteryFeedback(
      {
        message: `已标熟 ${newItemKeys.length} 个词条。`,
        itemKeys: newItemKeys,
      },
      MASTERY_UNDO_DURATION_MS
    );
  };

  const undoMasteredItems = () => {
    const itemKeysToUndo = masteryFeedback?.itemKeys;
    if (!itemKeysToUndo) return;

    const itemKeys = new Set(itemKeysToUndo);
    commitLearningState({
      ...learningState,
      masteredItemKeys: learningState.masteredItemKeys.filter(
        (itemKey) => !itemKeys.has(itemKey)
      ),
    });
    showMasteryFeedback({ message: '已撤销本次批量标熟。' }, 2000);
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
  const activePassageIndex = activePassage
    ? passages.findIndex((passage) => passage.id === activePassage.id)
    : -1;
  const masteredItemKeys = useMemo(
    () => new Set(learningState.masteredItemKeys),
    [learningState.masteredItemKeys]
  );
  const activePassageCardProps: PassageCardProps | null = activePassage
    ? {
        passage: activePassage,
        masteredItemKeys,
        onToggleMastered: toggleMasteredItem,
        onMarkMastered: markMasteredItems,
        hiddenExpansionIds:
          learningState.hiddenExpansionIds[activePassage.id] ?? [],
        onHideExpansion: (entryId) =>
          setExpansionHidden(activePassage.id, entryId, true),
        onRestoreExpansion: (entryId) =>
          setExpansionHidden(activePassage.id, entryId, false),
      }
    : null;
  const learningItems = useMemo(() => collectLearningItems(passages), [passages]);
  const passageSearchIndex = useMemo(
    () => buildPassageSearchIndex(passages),
    [passages]
  );
  const searchResults = useMemo(
    () => searchPassages(passageSearchIndex, searchQuery),
    [passageSearchIndex, searchQuery]
  );

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && loadAllPassages) {
      void ensureCorpusLoaded().catch(() => undefined);
    }
  };

  const toggleDirectory = () => {
    const shouldOpen = !isDirectoryOpen;
    setIsDirectoryOpen(shouldOpen);
    if (shouldOpen) void ensureCorpusLoaded().catch(() => undefined);
  };

  const openLearningLibrary = () => {
    setIsLibraryOpen(true);
    if (loadAllPassages) void ensureCorpusLoaded().catch(() => undefined);
  };

  const openPassage = (passageId: string) => {
    setActiveId(passageId);
    setIsDirectoryOpen(false);
    setSearchQuery('');
    commitLearningState(recordPassageRead(learningState, passageId));
  };

  const markPassageRead = (passageId: string) => {
    if (learningState.readingRecords[passageId]) return;
    commitLearningState(recordPassageRead(learningState, passageId));
  };

  const navigateWithin = (loadedPassages: CompiledPassage[], offset: number) => {
    const currentIndex = loadedPassages.findIndex(
      (passage) => passage.id === activeId
    );
    const target = loadedPassages[currentIndex + offset];
    if (target) openPassage(target.id);
  };

  const navigateByOffset = (offset: number) => {
    if (!loadAllPassages) {
      navigateWithin(passages, offset);
      return;
    }
    void ensureCorpusLoaded()
      .then((loadedPassages) => navigateWithin(loadedPassages, offset))
      .catch(() => undefined);
  };

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
      const { toBlob } = await import('html-to-image');
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
      <header className="app-header">
        <div className="app-header__brand">
          <span className="passage-switcher__brand-title">短文背单词</span>
          <span className="passage-switcher__brand-sub">
            2016版四六级大纲 · 双栏语境精读
          </span>
        </div>
        <GlobalPassageSearch
          query={searchQuery}
          results={searchResults}
          isLoading={isLoadingCorpus}
          onQueryChange={updateSearchQuery}
          onSelectResult={openPassage}
        />
        <div className="app-header__actions">
          <button
            type="button"
            className="passage-directory-trigger"
            aria-pressed={isDirectoryOpen}
            onClick={toggleDirectory}
          >
            {isDirectoryOpen ? '返回精读' : '短文目录'}
          </button>
          <button
            ref={libraryTrigger}
            type="button"
            className="learning-library-trigger"
            aria-haspopup="dialog"
            aria-expanded={isLibraryOpen}
            onClick={openLearningLibrary}
          >
            已掌握词库
          </button>
        </div>
      </header>
      {corpusLoadFailed && (
        <p role="alert">完整语料加载失败，请重试。</p>
      )}
      {isLoadingCorpus && !isDirectoryOpen && !searchQuery.trim() && (
        <p role="status">正在加载完整语料...</p>
      )}

      {isDirectoryOpen ? (
        isLoadingCorpus ? (
          <p role="status">正在加载完整短文目录...</p>
        ) : (
          <PassageDirectory
            passages={passages}
            state={learningState}
            masteredItemKeys={masteredItemKeys}
            onOpenPassage={openPassage}
            onMarkPassageRead={markPassageRead}
          />
        )
      ) : (
        <main className="app-main">
          {activePassage && (
            <nav className="passage-reader-navigation" aria-label="短文导航">
              <button
                type="button"
                aria-label="上一篇短文"
                disabled={activePassageIndex <= 0}
                onClick={() => navigateByOffset(-1)}
              >
                上一篇
              </button>
              <span>
                {activePassage.indexLabel} ·{' '}
                {PASSAGE_TIER_LABELS[activePassage.tier]} · {activePassage.topic}
              </span>
              <button
                type="button"
                aria-label="下一篇短文"
                disabled={
                  activePassageIndex < 0 ||
                  activePassageIndex >= passages.length - 1
                }
                onClick={() => navigateByOffset(1)}
              >
                下一篇
              </button>
            </nav>
          )}
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
      )}
      {masteryFeedback && (
        <div
          className="mastery-feedback"
          role="status"
          aria-live="polite"
        >
          <span>{masteryFeedback.message}</span>
          {masteryFeedback.itemKeys && (
            <button
              type="button"
              aria-label="撤销本次批量标熟"
              onClick={undoMasteredItems}
            >
              撤销
            </button>
          )}
        </div>
      )}
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
