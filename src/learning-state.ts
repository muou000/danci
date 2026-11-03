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
