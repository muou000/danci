import { useEffect, useMemo, useState } from 'react';
import type { PassageCatalogEntry } from '../corpus';
import type { LearningState } from '../learning-state';
import {
  filterPassages,
  getPassageProgress,
  getPassageTopicCategories,
  PASSAGE_TOPIC_CATEGORIES,
  type PassageTopicFilter,
  type PassageSearchResult,
} from '../passage-library';

interface GlobalPassageSearchProps {
  query: string;
  results: PassageSearchResult[];
  isLoading?: boolean;
  loadFailed?: boolean;
  onQueryChange: (query: string) => void;
  onSelectResult: (passageId: string) => void;
}

export function GlobalPassageSearch({
  query,
  results,
  isLoading = false,
  loadFailed = false,
  onQueryChange,
  onSelectResult,
}: GlobalPassageSearchProps) {
  const [visibleCount, setVisibleCount] = useState(12);
  useEffect(() => setVisibleCount(12), [query]);
  const visibleResults = results.slice(0, visibleCount);

  return (
    <div className="corpus-search">
      <label className="corpus-search__label">
        <span className="visually-hidden">全局查词</span>
        <input
          type="search"
          aria-label="全局查词"
          placeholder="查英文词形、短语或中文释义"
          value={query}
          onChange={(event) =>
            onQueryChange(event.currentTarget.value)
          }
        />
      </label>
      {query.trim() && (
        <section
          className="corpus-search__results"
          role="region"
          aria-label="全局查词结果"
        >
          <p className="corpus-search__count" aria-live="polite">
            {isLoading
              ? '正在加载查词索引...'
              : loadFailed
                ? '查词索引加载失败，请修改搜索内容后重试。'
              : results.length > 0
                ? `匹配 ${results.length} 条${
                    results.length > visibleResults.length
                      ? '，显示前 12 条'
                      : ''
                  }`
                : '没有匹配条目'}
          </p>
          {visibleResults.length > 0 && (
            <ul>
              {visibleResults.map((result) => (
                <li key={result.key}>
                  <button
                    type="button"
                    aria-label={[
                      result.expression,
                      result.surface,
                      result.summary,
                      result.titleZh,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectResult(result.passageId)}
                  >
                    <span className="corpus-search__entry">
                      <strong lang="en">{result.expression}</strong>
                      {result.surface &&
                        result.surface !== result.expression && (
                          <span lang="en">{result.surface}</span>
                        )}
                      <span>{result.summary}</span>
                    </span>
                    <span className="corpus-search__context">
                      {result.indexLabel} · {result.titleZh} · {result.topic}
                    </span>
                    <span className="corpus-search__source">
                      {result.kind === 'annotation' ? '行间标注' : '拓展条目'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > visibleResults.length && (
            <button
              type="button"
              className="corpus-search__show-more"
              onClick={() => setVisibleCount((count) => count + 12)}
            >
              显示更多结果（剩余 {results.length - visibleResults.length} 条）
            </button>
          )}
        </section>
      )}
    </div>
  );
}

interface PassageDirectoryProps {
  passages: PassageCatalogEntry[];
  state: LearningState;
  masteredItemKeys: ReadonlySet<string>;
  onOpenPassage: (passageId: string) => void;
  onMarkPassageRead: (passageId: string) => void;
}

function serializeTopicFilter(filter: PassageTopicFilter): string {
  if (filter.kind === 'all') return 'all';
  return `${filter.kind}:${filter.value}`;
}

function parseTopicFilter(value: string): PassageTopicFilter {
  if (value === 'all') return { kind: 'all' };
  if (value.startsWith('category:')) {
    const valueCategory = value.slice('category:'.length);
    const category = PASSAGE_TOPIC_CATEGORIES.find(
      (item) => item === valueCategory
    );
    return category ? { kind: 'category', value: category } : { kind: 'all' };
  }
  if (value.startsWith('topic:')) {
    return { kind: 'topic', value: value.slice('topic:'.length) };
  }
  return { kind: 'all' };
}

export function PassageDirectory({
  passages,
  state,
  masteredItemKeys,
  onOpenPassage,
  onMarkPassageRead,
}: PassageDirectoryProps) {
  const [topicFilter, setTopicFilter] = useState<PassageTopicFilter>({
    kind: 'all',
  });
  const topics = useMemo(
    () =>
      Array.from(new Set(passages.map((passage) => passage.topic))).sort(
        (a, b) => a.localeCompare(b, 'zh-CN')
      ),
    [passages]
  );
  const topicCategories = useMemo(
    () =>
      PASSAGE_TOPIC_CATEGORIES.filter((category) =>
        passages.some((passage) =>
          getPassageTopicCategories(passage.topic).includes(category)
        )
      ),
    [passages]
  );
  const filteredPassages = useMemo(
    () => filterPassages(passages, topicFilter),
    [passages, topicFilter]
  );

  return (
    <main className="passage-directory">
      <header className="passage-directory__header">
        <div>
          <h1>短文目录</h1>
          <p>{passages.length} 篇短文</p>
        </div>
        <span className="passage-directory__result-count" role="status">
          显示 {filteredPassages.length} 篇
        </span>
      </header>

      <div className="passage-directory__filters">
        <label className="passage-directory__topic-filter">
          <span>题材</span>
          <select
            aria-label="按题材筛选"
            value={serializeTopicFilter(topicFilter)}
            onChange={(event) =>
              setTopicFilter(parseTopicFilter(event.currentTarget.value))
            }
          >
            <option value="all">全部题材</option>
            {topicCategories.length > 0 && (
              <optgroup label="常考题材">
                {topicCategories.map((category) => (
                  <option
                    key={category}
                    value={serializeTopicFilter({
                      kind: 'category',
                      value: category,
                    })}
                  >
                    {category}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="具体题材">
              {topics.map((topic) => (
                <option
                  key={topic}
                  value={serializeTopicFilter({
                    kind: 'topic',
                    value: topic,
                  })}
                >
                  {topic}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <ul className="passage-directory__entries" aria-label="短文列表">
        {filteredPassages.map((passage) => {
          const progress = getPassageProgress(passage, masteredItemKeys);
          const readingRecord = state.readingRecords[passage.id];
          const readStatus = readingRecord
            ? `已读 · ${readingRecord.visits} 次`
            : '未读';
          const accessibleLabel = [
            passage.indexLabel,
            passage.titleZh,
            passage.topic,
            `待背词条 ${progress.remainingCount} / ${progress.totalCount}`,
            readStatus,
          ].join(' ');

          return (
            <li className="passage-directory__item" key={passage.id}>
              <button
                type="button"
                className="passage-directory__entry"
                aria-label={accessibleLabel}
                onClick={() => onOpenPassage(passage.id)}
              >
                <span className="passage-directory__entry-meta">
                  <span className="passage-directory__index">
                    {passage.indexLabel}
                  </span>
                  <span className="passage-directory__topic">
                    {passage.topic}
                  </span>
                </span>
                <strong className="passage-directory__title">
                  {passage.titleZh}
                </strong>
                <span className="passage-directory__title-en" lang="en">
                  {passage.titleEn}
                </span>
                <span className="passage-directory__entry-footer">
                  <span>
                    待背词条 {progress.remainingCount} / {progress.totalCount}
                  </span>
                  <span>{readStatus}</span>
                </span>
              </button>
              {!readingRecord && (
                <button
                  type="button"
                  className="passage-directory__mark-read"
                  aria-label={`标记已读 ${passage.indexLabel} ${passage.titleZh}`}
                  onClick={() => onMarkPassageRead(passage.id)}
                >
                  标记已读
                </button>
              )}
            </li>
          );
        })}
        {filteredPassages.length === 0 && (
          <li className="passage-directory__empty">没有符合条件的短文</li>
        )}
      </ul>
    </main>
  );
}
