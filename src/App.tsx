import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { zipSync } from 'fflate';
import type { CompiledPassage } from './corpus';
import { PASSAGE_TIER_LABELS } from './corpus/labels';
import { COMPILED_CET4_BATCH_1_FIRST_PASSAGE } from './corpus/compiled-initial';
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
  transitionLearningState,
  writeLearningState,
  type LearningState,
  type LearningStateAction,
} from './learning-state';
import { usePassageCorpus } from './use-passage-corpus';

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

function downloadFile(blob: Blob, filename: string): void {
  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 0);
}

function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Unable to read exported passage image.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read exported passage image.'));
    };
    reader.readAsArrayBuffer(blob);
  });
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
  passages: initialPassages = [COMPILED_CET4_BATCH_1_FIRST_PASSAGE],
  loadAllPassages,
}: AppProps) {
  const {
    passages,
    isLoading: isLoadingCorpus,
    loadFailed: corpusLoadFailed,
    ensureLoaded: ensureCorpusLoaded,
  } = usePassageCorpus(initialPassages, loadAllPassages);
  const [activeId, setActiveId] = useState<string>(initialPassages[0]?.id ?? '');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const libraryTrigger = useRef<HTMLButtonElement>(null);
  const exportCardRef = useRef<HTMLElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPassage, setExportPassage] =
    useState<CompiledPassage | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [masteryFeedback, setMasteryFeedback] =
    useState<MasteryFeedback | null>(null);
  const masteryFeedbackTimer = useRef<number | null>(null);
  const [learningState, setLearningState] = useState<LearningState>(() => {
    const saved = readLearningState();
    return initialPassages[0]
      ? transitionLearningState(saved, {
          type: 'record-passage-read',
          passageId: initialPassages[0].id,
        }).state
      : saved;
  });

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

  const applyLearningAction = (action: LearningStateAction) => {
    const transition = transitionLearningState(learningState, action);
    if (transition.state !== learningState) {
      commitLearningState(transition.state);
    }
    return transition;
  };

  const toggleMasteredItem = (itemKey: string) => {
    applyLearningAction({
      type: 'toggle-mastered-item',
      itemKey,
    });
  };

  const markMasteredItems = (itemKeys: string[]) => {
    const { addedItemKeys: newItemKeys } = applyLearningAction({
      type: 'mark-mastered-items',
      itemKeys,
    });
    if (newItemKeys.length === 0) return;

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

    applyLearningAction({
      type: 'restore-mastered-items',
      itemKeys: itemKeysToUndo,
    });
    showMasteryFeedback({ message: '已撤销本次批量标熟。' }, 2000);
  };

  const setExpansionHidden = (
    passageId: string,
    entryId: string,
    hidden: boolean
  ) => {
    applyLearningAction({
      type: 'set-expansion-hidden',
      passageId,
      entryId,
      hidden,
    });
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
  const exportPassageCardProps: PassageCardProps | null = exportPassage
    ? {
        passage: exportPassage,
        masteredItemKeys,
        onToggleMastered: toggleMasteredItem,
        onMarkMastered: markMasteredItems,
        hiddenExpansionIds:
          learningState.hiddenExpansionIds[exportPassage.id] ?? [],
        onHideExpansion: (entryId) =>
          setExpansionHidden(exportPassage.id, entryId, true),
        onRestoreExpansion: (entryId) =>
          setExpansionHidden(exportPassage.id, entryId, false),
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
    applyLearningAction({ type: 'record-passage-read', passageId });
  };

  const markPassageRead = (passageId: string) => {
    if (learningState.readingRecords[passageId]) return;
    applyLearningAction({ type: 'record-passage-read', passageId });
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
    applyLearningAction({
      type: 'restore-mastered-items',
      itemKeys,
    });
  };

  const importLearningState = (state: LearningState) => {
    applyLearningAction({ type: 'replace-state', state });
  };

  const exportPassageImage = async () => {
    if (!activePassage) return;

    flushSync(() => {
      setIsExporting(true);
      setExportPassage(activePassage);
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

      downloadFile(png, passageImageFilename(activePassage));
      setExportMessage('高清 PNG 图片已开始下载。');
    } catch {
      setExportMessage('图片导出失败，请重试。');
    } finally {
      setExportPassage(null);
      setIsExporting(false);
    }
  };

  const exportCET4PassageBatch = async () => {
    flushSync(() => {
      setIsExporting(true);
      setExportMessage('正在加载并生成批量图片...');
    });

    try {
      const allPassages = await ensureCorpusLoaded();
      const cet4Passages = allPassages.filter(
        (passage) => passage.tier === 'cet4-core'
      );
      if (cet4Passages.length === 0) {
        throw new Error('No CET-4 passages are available to export.');
      }

      const { toBlob } = await import('html-to-image');
      const files: Record<string, Uint8Array> = {};
      for (const passage of cet4Passages) {
        flushSync(() => setExportPassage(passage));
        const exportCard = exportCardRef.current;
        if (!exportCard) throw new Error('Passage image is not ready.');
        const png = await toBlob(exportCard, {
          width: PASSAGE_EXPORT_WIDTH,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
        if (!png) throw new Error(`Unable to export ${passage.id}.`);
        files[passageImageFilename(passage)] = await blobToUint8Array(png);
      }

      const archive = zipSync(files, { level: 0 });
      downloadFile(
        new Blob([archive], { type: 'application/zip' }),
        'cet4-core-passages.zip'
      );
      setExportMessage(`${cet4Passages.length} 篇高清 PNG 图片已打包下载。`);
    } catch {
      setExportMessage('批量图片导出失败，请重试。');
    } finally {
      setExportPassage(null);
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
                <button
                  type="button"
                  className="passage-export-button"
                  aria-busy={isExporting}
                  disabled={isExporting}
                  onClick={exportCET4PassageBatch}
                >
                  {isExporting ? '正在生成批量图片...' : '批量导出20篇'}
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
              {isExporting && exportPassageCardProps && (
                <div
                  className="passage-export-stage"
                  aria-hidden="true"
                  inert
                  style={{ width: PASSAGE_EXPORT_WIDTH }}
                >
                  <PassageCard
                    key={`export-${exportPassageCardProps.passage.id}`}
                    {...exportPassageCardProps}
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
          onImportState={importLearningState}
        />
      )}
    </div>
  );
}
