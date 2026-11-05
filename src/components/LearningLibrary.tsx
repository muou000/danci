import { useEffect, useRef, useState } from 'react';
import {
  parseLearningStateJson,
  type LearningState,
} from '../learning-state';
import type { PassageCatalogEntry } from '../corpus';

export interface LearningItemSummary {
  key: string;
  label: string;
  surfaces: string[];
  glosses: string[];
}

interface LearningLibraryProps {
  state: LearningState;
  items: LearningItemSummary[];
  passages: PassageCatalogEntry[];
  isLoadingItems?: boolean;
  itemsLoadFailed?: boolean;
  onClose: () => void;
  onRestoreItems: (itemKeys: string[]) => void;
  onImportState: (state: LearningState) => void;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('无法读取所选文件。'));
    reader.readAsText(file);
  });
}

function formatReadTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function saveJsonFile(state: LearningState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `danci-learning-state-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function LearningLibrary({
  state,
  items,
  passages,
  isLoadingItems = false,
  itemsLoadFailed = false,
  onClose,
  onRestoreItems,
  onImportState,
}: LearningLibraryProps) {
  const [query, setQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;

      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !dialog.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || focusIsOutside)
      ) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const masteredItems = state.masteredItemKeys.map((key) => {
    const item = itemByKey.get(key);
    const label =
      item?.label ?? key.replace(/^(?:word|phrase|oos):/, '');
    return {
      key,
      label,
      surfaces: item?.surfaces ?? [],
      glosses: item?.glosses ?? [],
    };
  });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = masteredItems.filter((item) =>
    [item.key, item.label, ...item.surfaces, ...item.glosses]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedKeys.has(item.key));

  const toggleItemSelected = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const toggleFilteredSelection = () => {
    const next = new Set(selectedKeys);
    if (allFilteredSelected) {
      filteredItems.forEach((item) => next.delete(item.key));
    } else {
      filteredItems.forEach((item) => next.add(item.key));
    }
    setSelectedKeys(next);
  };

  const restoreItems = (keys: string[]) => {
    const restored = new Set(keys);
    setSelectedKeys((selected) => {
      const next = new Set(selected);
      restored.forEach((key) => next.delete(key));
      return next;
    });
    onRestoreItems(keys);
  };

  const handleImport = async (file: File) => {
    try {
      const state = parseLearningStateJson(await readFileText(file));
      onImportState(state);
      setSelectedKeys(new Set());
      setMessage('学习记录已导入。');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '学习记录文件格式无效。'
      );
    }
  };

  const handleExport = () => {
    try {
      saveJsonFile(state);
      setMessage('JSON 备份已导出。');
    } catch {
      setMessage('无法创建 JSON 备份文件。');
    }
  };

  const readingRecords = Object.entries(state.readingRecords).sort((a, b) =>
    b[1].lastReadAt.localeCompare(a[1].lastReadAt)
  );

  return (
    <div className="learning-library__backdrop">
      <section
        ref={dialog}
        className="learning-library"
        role="dialog"
        aria-modal="true"
        aria-label="已掌握词库"
      >
        <header className="learning-library__header">
          <div>
            <h2>已掌握词库</h2>
            <p>{state.masteredItemKeys.length} 个已掌握词条</p>
          </div>
          <button
            type="button"
            className="learning-library__close"
            aria-label="关闭已掌握词库"
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        <div className="learning-library__tools">
          <label className="learning-library__search-label">
            <span>搜索已掌握词条</span>
            <input
              type="search"
              aria-label="搜索已掌握词条"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="learning-library__actions">
            <button
              type="button"
              onClick={() => restoreItems(Array.from(selectedKeys))}
              disabled={selectedKeys.size === 0}
            >
              恢复所选（{selectedKeys.size}）
            </button>
            <label className="learning-library__file-label">
              导入 JSON
              <input
                type="file"
                accept="application/json,.json"
                aria-label="导入学习记录 JSON"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void handleImport(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <button type="button" onClick={handleExport}>
              导出 JSON
            </button>
          </div>
        </div>

        <label className="learning-library__select-all">
          <input
            type="checkbox"
            aria-label="选择全部筛选结果"
            checked={allFilteredSelected}
            onChange={toggleFilteredSelection}
            disabled={filteredItems.length === 0}
          />
          选择筛选结果
        </label>

        <ul className="learning-library__items">
          {filteredItems.map((item) => (
            <li className="learning-library__item" key={item.key}>
              <label className="learning-library__item-check">
                <input
                  type="checkbox"
                  aria-label={`选择 ${item.label}`}
                  checked={selectedKeys.has(item.key)}
                  onChange={() => toggleItemSelected(item.key)}
                />
                <span className="learning-library__item-label">
                  {item.label}
                </span>
              </label>
              <div className="learning-library__item-detail">
                {item.surfaces.length > 0 && (
                  <span lang="en">{item.surfaces.join(', ')}</span>
                )}
                {item.glosses.length > 0 && <span>{item.glosses.join('；')}</span>}
              </div>
              <button
                type="button"
                aria-label={`恢复 ${item.label}`}
                onClick={() => restoreItems([item.key])}
              >
                恢复
              </button>
            </li>
          ))}
          {filteredItems.length === 0 && (
            <li className="learning-library__empty">
              {isLoadingItems
                ? '正在加载词条...'
                : itemsLoadFailed
                  ? '词条加载失败，请关闭后重试。'
                  : masteredItems.length === 0
                ? '暂无已掌握词条'
                : '没有匹配的已掌握词条'}
            </li>
          )}
        </ul>

        <section className="learning-library__reading" aria-label="阅读记录">
          <h3>阅读记录</h3>
          {readingRecords.length === 0 ? (
            <p>暂无阅读记录</p>
          ) : (
            <ul>
              {readingRecords.map(([passageId, record]) => {
                const passage = passages.find((item) => item.id === passageId);
                return (
                  <li key={passageId}>
                    <span>
                      {passage
                        ? `${passage.indexLabel} · ${passage.topic}`
                        : passageId}
                    </span>
                    <span>
                      {formatReadTime(record.lastReadAt)} · {record.visits} 次
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p className="learning-library__message" role="status">
          {message}
        </p>
      </section>
    </div>
  );
}
