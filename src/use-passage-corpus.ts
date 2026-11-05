import { useCallback, useRef, useState } from 'react';
import type { CompiledPassage } from './corpus';

export type LoadAllPassages = () => Promise<CompiledPassage[]>;

export interface PassageCorpusState {
  passages: CompiledPassage[];
  isLoading: boolean;
  loadFailed: boolean;
  ensureLoaded: () => Promise<CompiledPassage[]>;
}

export function usePassageCorpus(
  initialPassages: CompiledPassage[],
  loadAllPassages?: LoadAllPassages
): PassageCorpusState {
  const [passages, setPassages] = useState(initialPassages);
  const passagesRef = useRef(initialPassages);
  const loadPromise = useRef<Promise<CompiledPassage[]> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const ensureLoaded = useCallback(() => {
    if (!loadAllPassages) return Promise.resolve(passagesRef.current);
    if (loadPromise.current) return loadPromise.current;

    setIsLoading(true);
    setLoadFailed(false);
    const pendingLoad = Promise.resolve()
      .then(loadAllPassages)
      .then((loadedPassages) => {
        passagesRef.current = loadedPassages;
        setPassages(loadedPassages);
        return loadedPassages;
      })
      .catch((error: unknown) => {
        loadPromise.current = null;
        setLoadFailed(true);
        throw error;
      })
      .finally(() => setIsLoading(false));
    loadPromise.current = pendingLoad;
    return pendingLoad;
  }, [loadAllPassages]);

  return { passages, isLoading, loadFailed, ensureLoaded };
}
