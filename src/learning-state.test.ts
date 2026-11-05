import { describe, expect, it } from 'vitest';
import {
  createEmptyLearningState,
  transitionLearningState,
} from './learning-state';

describe('transitionLearningState', () => {
  it('toggles one mastered item without changing other state', () => {
    const state = {
      ...createEmptyLearningState(),
      masteredItemKeys: ['word:known'],
    };

    const added = transitionLearningState(state, {
      type: 'toggle-mastered-item',
      itemKey: 'word:new',
    });
    const restored = transitionLearningState(added.state, {
      type: 'toggle-mastered-item',
      itemKey: 'word:known',
    });

    expect(added.state.masteredItemKeys).toEqual(['word:known', 'word:new']);
    expect(restored.state.masteredItemKeys).toEqual(['word:new']);
  });

  it('returns only newly mastered unique keys and preserves identity for a no-op', () => {
    const state = {
      ...createEmptyLearningState(),
      masteredItemKeys: ['word:known'],
    };

    const result = transitionLearningState(state, {
      type: 'mark-mastered-items',
      itemKeys: ['word:known', 'phrase:new', 'phrase:new', 'oos:new'],
    });
    const noOp = transitionLearningState(result.state, {
      type: 'mark-mastered-items',
      itemKeys: ['phrase:new', 'oos:new'],
    });

    expect(result.addedItemKeys).toEqual(['phrase:new', 'oos:new']);
    expect(result.state.masteredItemKeys).toEqual([
      'word:known',
      'phrase:new',
      'oos:new',
    ]);
    expect(noOp.state).toBe(result.state);
    expect(noOp.addedItemKeys).toEqual([]);
  });

  it('restores only the requested mastered items', () => {
    const state = {
      ...createEmptyLearningState(),
      masteredItemKeys: ['word:one', 'word:two', 'word:three'],
    };

    const result = transitionLearningState(state, {
      type: 'restore-mastered-items',
      itemKeys: ['word:two', 'missing'],
    });

    expect(result.state.masteredItemKeys).toEqual(['word:one', 'word:three']);
  });

  it('adds and removes expansion visibility state, deleting empty passage entries', () => {
    const state = createEmptyLearningState();
    const hidden = transitionLearningState(state, {
      type: 'set-expansion-hidden',
      passageId: 'passage-1',
      entryId: 'entry-1',
      hidden: true,
    });
    const visible = transitionLearningState(hidden.state, {
      type: 'set-expansion-hidden',
      passageId: 'passage-1',
      entryId: 'entry-1',
      hidden: false,
    });

    expect(hidden.state.hiddenExpansionIds).toEqual({
      'passage-1': ['entry-1'],
    });
    expect(visible.state.hiddenExpansionIds).toEqual({});
  });

  it('records first and subsequent passage reads with the supplied timestamp', () => {
    const first = transitionLearningState(createEmptyLearningState(), {
      type: 'record-passage-read',
      passageId: 'passage-1',
      lastReadAt: '2026-11-05T00:00:00.000Z',
    });
    const second = transitionLearningState(first.state, {
      type: 'record-passage-read',
      passageId: 'passage-1',
      lastReadAt: '2026-11-06T00:00:00.000Z',
    });

    expect(first.state.readingRecords['passage-1']).toEqual({
      lastReadAt: '2026-11-05T00:00:00.000Z',
      visits: 1,
    });
    expect(second.state.readingRecords['passage-1']).toEqual({
      lastReadAt: '2026-11-06T00:00:00.000Z',
      visits: 2,
    });
  });

  it('replaces imported state as a whole', () => {
    const importedState = {
      ...createEmptyLearningState(),
      masteredItemKeys: ['word:imported'],
    };

    const result = transitionLearningState(
      {
        ...createEmptyLearningState(),
        masteredItemKeys: ['word:existing'],
      },
      { type: 'replace-state', state: importedState }
    );

    expect(result.state).toBe(importedState);
    expect(result.state.masteredItemKeys).toEqual(['word:imported']);
  });
});
