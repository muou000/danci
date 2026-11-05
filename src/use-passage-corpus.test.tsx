import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompiledPassage } from './corpus';
import { summarizePassage } from './corpus';
import {
  usePassageCorpus,
  type PassageContentRepository,
} from './use-passage-corpus';

const passage = (id: string): CompiledPassage => ({
  id,
  indexLabel: id,
  topic: '社会生活',
  titleZh: id,
  titleEn: id,
  paragraphs: [],
  expansionEntries: [],
  coveredHeadwordIds: [],
  hasOutOfSyllabusWords: false,
});

function repositoryFor(
  passages: CompiledPassage[],
  loadPassage = vi.fn(async (id: string) => {
    const loaded = passages.find((item) => item.id === id);
    if (!loaded) throw new Error(`Unknown passage: ${id}`);
    return loaded;
  })
): PassageContentRepository {
  return {
    catalog: passages.map(summarizePassage),
    loadPassage,
    loadSearchIndex: vi.fn(async () => []),
  };
}

describe('usePassageCorpus', () => {
  it('loads a requested passage once and loads the rest only when asked', async () => {
    const first = passage('first');
    const second = passage('second');
    const third = passage('third');
    const repository = repositoryFor([first, second, third]);
    const { result } = renderHook(() =>
      usePassageCorpus([first], repository.catalog, repository)
    );

    expect(result.current.passages).toEqual([first]);
    expect(result.current.isComplete).toBe(false);
    expect(repository.loadPassage).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.ensurePassageLoaded('second');
      await result.current.ensurePassageLoaded('second');
    });

    expect(repository.loadPassage).toHaveBeenCalledOnce();
    expect(result.current.passages).toEqual([first, second]);
    expect(result.current.isComplete).toBe(false);

    await act(async () => {
      await result.current.ensureLoaded();
    });

    expect(result.current.passages).toEqual([first, second, third]);
    expect(result.current.isComplete).toBe(true);
    expect(repository.loadPassage).toHaveBeenCalledTimes(2);
  });

  it('shares a quiet prefetch, promotes it for user navigation, and retries failures', async () => {
    const first = passage('first');
    const second = passage('second');
    let resolveLoad: (value: CompiledPassage) => void = () => undefined;
    const loadPassage = vi
      .fn<(id: string) => Promise<CompiledPassage>>()
      .mockImplementationOnce(
        () => new Promise<CompiledPassage>((resolve) => (resolveLoad = resolve))
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(second);
    const repository = repositoryFor([first, second], loadPassage);
    const { result } = renderHook(() =>
      usePassageCorpus([first], repository.catalog, repository)
    );

    let prefetch!: Promise<CompiledPassage>;
    let foregroundLoad!: Promise<CompiledPassage>;
    act(() => {
      prefetch = result.current.ensurePassageLoaded('second', { quiet: true });
    });
    await Promise.resolve();
    expect(loadPassage).toHaveBeenCalledOnce();
    expect(result.current.loadingPassageIds.has('second')).toBe(false);

    act(() => {
      foregroundLoad = result.current.ensurePassageLoaded('second');
    });
    expect(foregroundLoad).toBe(prefetch);
    expect(result.current.loadingPassageIds.has('second')).toBe(true);

    await act(async () => {
      resolveLoad(second);
      await prefetch;
    });
    expect(result.current.passages).toContain(second);
    expect(result.current.loadingPassageIds.has('second')).toBe(false);

    const third = passage('third');
    const retryRepository = repositoryFor([first, third]);
    const retryLoader = vi
      .fn<(id: string) => Promise<CompiledPassage>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(third);
    const retrySource = repositoryFor([first, third], retryLoader);
    const retryHook = renderHook(() =>
      usePassageCorpus([first], retrySource.catalog, retrySource)
    );
    await act(async () => {
      await expect(
        retryHook.result.current.ensurePassageLoaded('third')
      ).rejects.toThrow('offline');
    });
    expect(retryHook.result.current.failedPassageIds.has('third')).toBe(true);
    await act(async () => {
      await retryHook.result.current.ensurePassageLoaded('third');
    });
    expect(retryHook.result.current.passages).toContain(third);
    expect(retryHook.result.current.failedPassageIds.has('third')).toBe(false);
    expect(retryLoader).toHaveBeenCalledTimes(2);
    expect(retryRepository.loadPassage).not.toHaveBeenCalled();
  });

  it('loads the search index on demand and caches it', async () => {
    const first = passage('first');
    const repository = repositoryFor([first]);
    const { result } = renderHook(() =>
      usePassageCorpus([first], repository.catalog, repository)
    );

    expect(repository.loadSearchIndex).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.ensureSearchIndex();
      await result.current.ensureSearchIndex();
    });

    expect(repository.loadSearchIndex).toHaveBeenCalledOnce();
    expect(result.current.searchIndex).toEqual([]);
    expect(result.current.searchLoadFailed).toBe(false);
  });
});
