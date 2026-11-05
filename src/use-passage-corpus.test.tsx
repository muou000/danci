import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompiledPassage } from './corpus';
import { usePassageCorpus } from './use-passage-corpus';

const passage = (id: string): CompiledPassage => ({
  id,
  indexLabel: id,
  tier: 'cet4-core',
  topic: '测试',
  titleZh: id,
  titleEn: id,
  paragraphs: [],
  expansionEntries: [],
  coveredHeadwordIds: [],
  hasOutOfSyllabusWords: false,
});

describe('usePassageCorpus', () => {
  it('shares an in-flight load and replaces the initial corpus on success', async () => {
    const initialPassages = [passage('initial')];
    const loadedPassages = [passage('complete')];
    let resolveLoad: (passages: CompiledPassage[]) => void = () => undefined;
    const loadAllPassages = vi.fn(
      () =>
        new Promise<CompiledPassage[]>((resolve) => {
          resolveLoad = resolve;
        })
    );
    const { result } = renderHook(() =>
      usePassageCorpus(initialPassages, loadAllPassages)
    );

    let firstLoad!: Promise<CompiledPassage[]>;
    let secondLoad!: Promise<CompiledPassage[]>;
    act(() => {
      firstLoad = result.current.ensureLoaded();
      secondLoad = result.current.ensureLoaded();
    });

    expect(secondLoad).toBe(firstLoad);
    expect(result.current.isLoading).toBe(true);
    await Promise.resolve();
    expect(loadAllPassages).toHaveBeenCalledOnce();

    await act(async () => {
      resolveLoad(loadedPassages);
      await expect(firstLoad).resolves.toBe(loadedPassages);
    });

    expect(result.current.passages).toBe(loadedPassages);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadFailed).toBe(false);
  });

  it('keeps the current corpus after failure and retries on the next request', async () => {
    const initialPassages = [passage('initial')];
    const loadedPassages = [passage('complete')];
    const loadAllPassages = vi
      .fn<() => Promise<CompiledPassage[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(loadedPassages);
    const { result } = renderHook(() =>
      usePassageCorpus(initialPassages, loadAllPassages)
    );
    let failedLoad!: Promise<CompiledPassage[]>;
    await act(async () => {
      failedLoad = result.current.ensureLoaded();
      await expect(failedLoad).rejects.toThrow('offline');
    });

    expect(result.current.passages).toBe(initialPassages);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadFailed).toBe(true);

    await act(async () => {
      await result.current.ensureLoaded();
    });

    expect(loadAllPassages).toHaveBeenCalledTimes(2);
    expect(result.current.passages).toBe(loadedPassages);
    expect(result.current.loadFailed).toBe(false);
  });
});
