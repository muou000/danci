import { useCallback, useRef, useState } from 'react';
import type { CompiledPassage, PassageCatalogEntry } from './corpus';
import {
  buildPassageSearchIndex,
  type PassageSearchIndex,
} from './passage-library';

export interface PassageContentRepository {
  catalog: PassageCatalogEntry[];
  loadPassage: (passageId: string) => Promise<CompiledPassage>;
  loadSearchIndex: () => Promise<PassageSearchIndex>;
}

export interface PassageContentState {
  passages: CompiledPassage[];
  loadingPassageIds: ReadonlySet<string>;
  failedPassageIds: ReadonlySet<string>;
  searchIndex: PassageSearchIndex | null;
  isSearchLoading: boolean;
  searchLoadFailed: boolean;
  isComplete: boolean;
  ensurePassageLoaded: (
    passageId: string,
    options?: { quiet?: boolean }
  ) => Promise<CompiledPassage>;
  ensureLoaded: () => Promise<CompiledPassage[]>;
  ensureSearchIndex: () => Promise<PassageSearchIndex>;
}

export function usePassageCorpus(
  initialPassages: CompiledPassage[],
  catalog: PassageCatalogEntry[],
  repository?: PassageContentRepository
): PassageContentState {
  const [passages, setPassages] = useState(initialPassages);
  const passagesRef = useRef(initialPassages);
  const passageRequests = useRef(
    new Map<string, Promise<CompiledPassage>>()
  );
  const [loadingPassageIds, setLoadingPassageIds] = useState<Set<string>>(
    new Set()
  );
  const [failedPassageIds, setFailedPassageIds] = useState<Set<string>>(
    new Set()
  );
  const [searchIndex, setSearchIndex] = useState<PassageSearchIndex | null>(
    null
  );
  const searchIndexRef = useRef<PassageSearchIndex | null>(null);
  const searchRequest = useRef<Promise<PassageSearchIndex> | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchLoadFailed, setSearchLoadFailed] = useState(false);

  const ensurePassageLoaded = useCallback(
    (passageId: string, options?: { quiet?: boolean }) => {
      const loaded = passagesRef.current.find((passage) => passage.id === passageId);
      if (loaded) return Promise.resolve(loaded);

      const pending = passageRequests.current.get(passageId);
      if (pending) {
        if (!options?.quiet) {
          setLoadingPassageIds((ids) => new Set(ids).add(passageId));
          setFailedPassageIds((ids) => {
            const next = new Set(ids);
            next.delete(passageId);
            return next;
          });
        }
        return pending;
      }
      if (!repository) {
        return Promise.reject(new Error(`Passage ${passageId} is unavailable.`));
      }

      if (!options?.quiet) {
        setLoadingPassageIds((ids) => new Set(ids).add(passageId));
      }
      setFailedPassageIds((ids) => {
        const next = new Set(ids);
        next.delete(passageId);
        return next;
      });

      const request = Promise.resolve()
        .then(() => repository.loadPassage(passageId))
        .then((passage) => {
          const byId = new Map(
            passagesRef.current.map((item) => [item.id, item])
          );
          byId.set(passage.id, passage);
          const order = new Map(catalog.map((item, index) => [item.id, index]));
          const next = Array.from(byId.values()).sort(
            (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
          );
          passagesRef.current = next;
          setPassages(next);
          return passage;
        })
        .catch((error: unknown) => {
          if (!options?.quiet) {
            setFailedPassageIds((ids) => new Set(ids).add(passageId));
          }
          throw error;
        })
        .finally(() => {
          passageRequests.current.delete(passageId);
          setLoadingPassageIds((ids) => {
            if (!ids.has(passageId)) return ids;
            const next = new Set(ids);
            next.delete(passageId);
            return next;
          });
        });
      passageRequests.current.set(passageId, request);
      return request;
    },
    [catalog, repository]
  );

  const ensureLoaded = useCallback(
    async () =>
      Promise.all(catalog.map((entry) => ensurePassageLoaded(entry.id))),
    [catalog, ensurePassageLoaded]
  );

  const ensureSearchIndex = useCallback(() => {
    if (searchIndexRef.current) return Promise.resolve(searchIndexRef.current);
    if (searchRequest.current) return searchRequest.current;

    setIsSearchLoading(true);
    setSearchLoadFailed(false);
    const request = Promise.resolve()
      .then(() =>
        repository
          ? repository.loadSearchIndex()
          : buildPassageSearchIndex(passagesRef.current)
      )
      .then((index) => {
        searchIndexRef.current = index;
        setSearchIndex(index);
        return index;
      })
      .catch((error: unknown) => {
        searchRequest.current = null;
        setSearchLoadFailed(true);
        throw error;
      })
      .finally(() => setIsSearchLoading(false));
    searchRequest.current = request;
    return request;
  }, [repository]);

  return {
    passages,
    loadingPassageIds,
    failedPassageIds,
    searchIndex,
    isSearchLoading,
    searchLoadFailed,
    isComplete: passages.length >= catalog.length,
    ensurePassageLoaded,
    ensureLoaded,
    ensureSearchIndex,
  };
}
