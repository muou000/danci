export const LEARNING_STATE_STORAGE_KEY = 'danci:learning-state:v1';

export interface ReadingRecord {
  lastReadAt: string;
  visits: number;
}

export interface LearningState {
  version: 1;
  masteredItemKeys: string[];
  hiddenExpansionIds: Record<string, string[]>;
  readingRecords: Record<string, ReadingRecord>;
}

export type LearningStateAction =
  | { type: 'toggle-mastered-item'; itemKey: string }
  | { type: 'mark-mastered-items'; itemKeys: string[] }
  | { type: 'restore-mastered-items'; itemKeys: string[] }
  | {
      type: 'set-expansion-hidden';
      passageId: string;
      entryId: string;
      hidden: boolean;
    }
  | { type: 'record-passage-read'; passageId: string; lastReadAt?: string }
  | { type: 'replace-state'; state: LearningState };

export interface LearningStateTransition {
  state: LearningState;
  addedItemKeys: string[];
}

export function createEmptyLearningState(): LearningState {
  return {
    version: 1,
    masteredItemKeys: [],
    hiddenExpansionIds: {},
    readingRecords: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseLearningStateJson(json: string): LearningState {
  const value: unknown = JSON.parse(json);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.masteredItemKeys) ||
    !value.masteredItemKeys.every(
      (key) => typeof key === 'string' && key.trim().length > 0
    ) ||
    !isRecord(value.hiddenExpansionIds) ||
    !isRecord(value.readingRecords)
  ) {
    throw new Error('学习记录文件格式无效。');
  }

  const hiddenExpansionIds: Record<string, string[]> = {};
  for (const [passageId, entryIds] of Object.entries(value.hiddenExpansionIds)) {
    if (
      !passageId.trim() ||
      !Array.isArray(entryIds) ||
      !entryIds.every((id) => typeof id === 'string' && id.trim().length > 0)
    ) {
      throw new Error('学习记录文件格式无效。');
    }
    hiddenExpansionIds[passageId] = Array.from(new Set(entryIds));
  }

  const readingRecords: Record<string, ReadingRecord> = {};
  for (const [passageId, record] of Object.entries(value.readingRecords)) {
    if (
      !passageId.trim() ||
      !isRecord(record) ||
      typeof record.lastReadAt !== 'string' ||
      !Number.isSafeInteger(record.visits) ||
      (record.visits as number) < 1
    ) {
      throw new Error('学习记录文件格式无效。');
    }
    readingRecords[passageId] = {
      lastReadAt: record.lastReadAt,
      visits: record.visits as number,
    };
  }

  return {
    version: 1,
    masteredItemKeys: Array.from(new Set(value.masteredItemKeys)),
    hiddenExpansionIds,
    readingRecords,
  };
}

export function readLearningState(): LearningState {
  if (typeof window === 'undefined') return createEmptyLearningState();

  try {
    const saved = window.localStorage.getItem(LEARNING_STATE_STORAGE_KEY);
    return saved ? parseLearningStateJson(saved) : createEmptyLearningState();
  } catch {
    return createEmptyLearningState();
  }
}

export function writeLearningState(state: LearningState): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LEARNING_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The current session remains usable when browser storage is unavailable.
  }
}

export function recordPassageRead(
  state: LearningState,
  passageId: string,
  lastReadAt = new Date().toISOString()
): LearningState {
  const previous = state.readingRecords[passageId];
  return {
    ...state,
    readingRecords: {
      ...state.readingRecords,
      [passageId]: {
        lastReadAt,
        visits: (previous?.visits ?? 0) + 1,
      },
    },
  };
}

export function transitionLearningState(
  state: LearningState,
  action: LearningStateAction
): LearningStateTransition {
  switch (action.type) {
    case 'toggle-mastered-item': {
      const masteredItemKeys = new Set(state.masteredItemKeys);
      if (masteredItemKeys.has(action.itemKey)) {
        masteredItemKeys.delete(action.itemKey);
      } else {
        masteredItemKeys.add(action.itemKey);
      }
      return {
        state: { ...state, masteredItemKeys: Array.from(masteredItemKeys) },
        addedItemKeys: [],
      };
    }
    case 'mark-mastered-items': {
      const masteredItemKeys = new Set(state.masteredItemKeys);
      const addedItemKeys = Array.from(new Set(action.itemKeys)).filter(
        (itemKey) => !masteredItemKeys.has(itemKey)
      );
      if (addedItemKeys.length === 0) return { state, addedItemKeys };

      return {
        state: {
          ...state,
          masteredItemKeys: [...state.masteredItemKeys, ...addedItemKeys],
        },
        addedItemKeys,
      };
    }
    case 'restore-mastered-items': {
      const itemKeysToRestore = new Set(action.itemKeys);
      const masteredItemKeys = state.masteredItemKeys.filter(
        (itemKey) => !itemKeysToRestore.has(itemKey)
      );
      if (masteredItemKeys.length === state.masteredItemKeys.length) {
        return { state, addedItemKeys: [] };
      }
      return {
        state: { ...state, masteredItemKeys },
        addedItemKeys: [],
      };
    }
    case 'set-expansion-hidden': {
      const hiddenEntries = new Set(
        state.hiddenExpansionIds[action.passageId] ?? []
      );
      const alreadyHidden = hiddenEntries.has(action.entryId);
      if (alreadyHidden === action.hidden) return { state, addedItemKeys: [] };

      if (action.hidden) {
        hiddenEntries.add(action.entryId);
      } else {
        hiddenEntries.delete(action.entryId);
      }
      const hiddenExpansionIds = { ...state.hiddenExpansionIds };
      if (hiddenEntries.size > 0) {
        hiddenExpansionIds[action.passageId] = Array.from(hiddenEntries);
      } else {
        delete hiddenExpansionIds[action.passageId];
      }
      return {
        state: { ...state, hiddenExpansionIds },
        addedItemKeys: [],
      };
    }
    case 'record-passage-read':
      return {
        state: recordPassageRead(state, action.passageId, action.lastReadAt),
        addedItemKeys: [],
      };
    case 'replace-state':
      return { state: action.state, addedItemKeys: [] };
  }
}
