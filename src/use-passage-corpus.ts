import { useCallback, useRef, useState } from 'react';
import type { CompiledPassage } from './corpus';

export type LoadAllPassages = () => Promise<CompiledPassage[]>;

export interface PassageCorpusState {
  passages: CompiledPassage[];
  isComplete: boolean;
  isLoading: boolean;
  loadFailed: boolean;
  ensureLoaded: (options?: { quiet?: boolean }) => Promise<CompiledPassage[]>;
}

export function usePassageCorpus(
  initialPassages: CompiledPassage[],
  loadAllPassages?: LoadAllPassages
): PassageCorpusState {
  const [passages, setPassages] = useState(initialPassages);
  const passagesRef = useRef(initialPassages);
  const loadPromise = useRef<Promise<CompiledPassage[]> | null>(null);
  const foregroundRequested = useRef(false);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const ensureLoaded = useCallback((options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    if (!loadAllPassages) return Promise.resolve(passagesRef.current);
    if (loadPromise.current) {
      if (!quiet) {
        foregroundRequested.current = true;
        setIsLoading(true);
        setLoadFailed(false);
      }
      return loadPromise.current;
    }

    foregroundRequested.current = !quiet;
    if (!quiet) {
      setIsLoading(true);
      setLoadFailed(false);
    }
    const pendingLoad = Promise.resolve()
      .then(loadAllPassages)
      .then((loadedPassages) => {
        passagesRef.current = loadedPassages;
        setPassages(loadedPassages);
        setHasLoadedAll(true);
        return loadedPassages;
      })
      .catch((error: unknown) => {
        loadPromise.current = null;
        if (foregroundRequested.current) setLoadFailed(true);
        throw error;
      })
      .finally(() => {
        if (foregroundRequested.current) setIsLoading(false);
        foregroundRequested.current = false;
      });
    loadPromise.current = pendingLoad;
    return pendingLoad;
  }, [loadAllPassages]);

  return {
    passages,
    isComplete: !loadAllPassages || hasLoadedAll,
    isLoading,
    loadFailed,
    ensureLoaded,
  };
}
