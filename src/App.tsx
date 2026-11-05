import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { zipSync } from 'fflate';
import {
  summarizePassage,
  type CompiledPassage,
  type PassageCatalogEntry,
} from './corpus';
import { COMPILED_FIRST_PASSAGE } from './corpus/compiled-initial';
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
  searchPassages,
  type PassageSearchIndex,
} from './passage-library';
import {
  readLearningState,
  transitionLearningState,
  writeLearningState,
  type LearningState,
  type LearningStateAction,
} from './learning-state';
import {
  usePassageCorpus,
  type PassageContentRepository,
} from './use-passage-corpus';

export interface AppProps {
  passages?: CompiledPassage[];
  repository?: PassageContentRepository;
}

const PASSAGE_EXPORT_WIDTH = 1080;
const MASTERY_UNDO_DURATION_MS = 10_000;
const CORPUS_PREFETCH_TIMEOUT_MS = 1_500;
const CORPUS_PREFETCH_FALLBACK_DELAY_MS = 500;
const DEFAULT_INITIAL_PASSAGES = [COMPILED_FIRST_PASSAGE];

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

function collectLearningItems(
  searchIndex: PassageSearchIndex | null
): LearningItemSummary[] {
  const items = new Map<string, LearningItemSummary>();
  for (const { result } of searchIndex ?? []) {
    const itemKey = result.itemKey;
    if (result.kind !== 'annotation' || !itemKey) continue;
    const item = items.get(itemKey) ?? {
      key: itemKey,
      label: result.expression || itemKey.replace(/^(?:word|phrase|oos):/, ''),
      surfaces: [],
      glosses: [],
    };
    if (result.surface && !item.surfaces.includes(result.surface)) {
      item.surfaces.push(result.surface);
    }
    if (result.summary && !item.glosses.includes(result.summary)) {
      item.glosses.push(result.summary);
    }
    items.set(itemKey, item);
  }
  return Array.from(items.values());
}

export function App({
  passages: initialPassages = DEFAULT_INITIAL_PASSAGES,
  repository,
}: AppProps) {
  const passageCatalog = useMemo<PassageCatalogEntry[]>(
    () => repository?.catalog ?? initialPassages.map(summarizePassage),
    [initialPassages, repository]
  );
  const {
    passages,
    loadingPassageIds,
    failedPassageIds,
    searchIndex,
    isSearchLoading,
    searchLoadFailed,
    ensurePassageLoaded,
    ensureLoaded: ensureAllPassagesLoaded,
    ensureSearchIndex,
  } = usePassageCorpus(initialPassages, passageCatalog, repository);

  useEffect(() => {
    const nextPassage = passageCatalog[1];
    if (!nextPassage || !repository) return;

    const prefetch = () => {
      void ensurePassageLoaded(nextPassage.id, { quiet: true }).catch(
        () => undefined
      );
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idleHandle = window.requestIdleCallback(prefetch, {
        timeout: CORPUS_PREFETCH_TIMEOUT_MS,
      });
      return () => window.cancelIdleCallback(idleHandle);
    }

    const timeoutHandle = window.setTimeout(
      prefetch,
      CORPUS_PREFETCH_FALLBACK_DELAY_MS
    );
    return () => window.clearTimeout(timeoutHandle);
  }, [ensurePassageLoaded, passageCatalog, repository]);

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

  const activePassage = passages.find((passage) => passage.id === activeId);
  const activePassageEntry = passageCatalog.find(
    (passage) => passage.id === activeId
  );
  const activePassageIndex = passageCatalog.findIndex(
    (passage) => passage.id === activeId
  );
  const activePassageIsLoading = loadingPassageIds.has(activeId);
  const activePassageLoadFailed = failedPassageIds.has(activeId);
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
  const learningItems = useMemo(
    () => collectLearningItems(searchIndex),
    [searchIndex]
  );
  const searchResults = useMemo(
    () => searchIndex ? searchPassages(searchIndex, searchQuery) : [],
    [searchIndex, searchQuery]
  );

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      void ensureSearchIndex().catch(() => undefined);
    }
  };

  const toggleDirectory = () => {
    const shouldOpen = !isDirectoryOpen;
    setIsDirectoryOpen(shouldOpen);
  };

  const openLearningLibrary = () => {
    setIsLibraryOpen(true);
    void ensureSearchIndex().catch(() => undefined);
  };

  const openPassage = (passageId: string) => {
    setActiveId(passageId);
    setIsDirectoryOpen(false);
    setSearchQuery('');
    applyLearningAction({ type: 'record-passage-read', passageId });
    if (!passages.some((passage) => passage.id === passageId)) {
      void ensurePassageLoaded(passageId).catch(() => undefined);
    }
  };

  const markPassageRead = (passageId: string) => {
    if (learningState.readingRecords[passageId]) return;
    applyLearningAction({ type: 'record-passage-read', passageId });
  };

  const navigateByOffset = (offset: number) => {
    const target = passageCatalog[activePassageIndex + offset];
    if (target) openPassage(target.id);
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

  const exportPassageBatch = async () => {
    flushSync(() => {
      setIsExporting(true);
      setExportMessage('正在加载并生成批量图片...');
    });

    try {
      const allPassages = await ensureAllPassagesLoaded();
      if (allPassages.length === 0) {
        throw new Error('No passages are available to export.');
      }

      const { toBlob } = await import('html-to-image');
      const files: Record<string, Uint8Array> = {};
      for (const passage of allPassages) {
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
        'passages.zip'
      );
      setExportMessage(`${allPassages.length} 篇高清 PNG 图片已打包下载。`);
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
          isLoading={isSearchLoading}
          loadFailed={searchLoadFailed}
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
      {searchLoadFailed && searchQuery.trim() && (
        <p role="alert">查词索引加载失败，请修改搜索内容后重试。</p>
      )}

      {isDirectoryOpen ? (
        <PassageDirectory
          passages={passageCatalog}
          state={learningState}
          masteredItemKeys={masteredItemKeys}
          onOpenPassage={openPassage}
          onMarkPassageRead={markPassageRead}
        />
      ) : (
        <main className="app-main">
          {activePassageEntry && (
            <nav className="passage-reader-navigation" aria-label="短文导航">
              <button
                type="button"
                aria-label="上一篇短文"
                disabled={
                  activePassageIsLoading ||
                  activePassageIndex <= 0 ||
                  loadingPassageIds.has(
                    passageCatalog[activePassageIndex - 1]?.id ?? ''
                  )
                }
                onClick={() => navigateByOffset(-1)}
              >
                上一篇
              </button>
              <span>
                {activePassageEntry.indexLabel} · {activePassageEntry.topic}
              </span>
              <button
                type="button"
                aria-label="下一篇短文"
                disabled={
                  activePassageIsLoading ||
                  activePassageIndex < 0 ||
                  activePassageIndex >= passageCatalog.length - 1 ||
                  loadingPassageIds.has(
                    passageCatalog[activePassageIndex + 1]?.id ?? ''
                  )
                }
                onClick={() => navigateByOffset(1)}
              >
                下一篇
              </button>
            </nav>
          )}
          {activePassageIsLoading && (
            <p role="status">正在加载短文...</p>
          )}
          {activePassageLoadFailed && (
            <div role="alert">
              <p>短文加载失败，请重试。</p>
              <button
                type="button"
                onClick={() =>
                  void ensurePassageLoaded(activeId).catch(() => undefined)
                }
              >
                重试加载
              </button>
            </div>
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
                  onClick={exportPassageBatch}
                >
                  {isExporting ? '正在生成批量图片...' : '批量导出全部短文'}
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
          passages={passageCatalog}
          isLoadingItems={isSearchLoading}
          itemsLoadFailed={searchLoadFailed}
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
