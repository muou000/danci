import { useState } from 'react';
import {
  PASSAGE_TIER_LABELS,
  toCircledNumber,
  type CompiledPassage,
  type InlineAnnotationToken,
} from '../corpus';

export interface PassageCardProps {
  passage: CompiledPassage;
  masteredItemKeys: Set<string>;
  onToggleMastered: (itemKey: string) => void;
  hiddenExpansionIds: string[];
  onHideExpansion: (entryId: string) => void;
  onRestoreExpansion: (entryId: string) => void;
}

interface InlineAnnotationProps {
  token: InlineAnnotationToken;
  isMastered: boolean;
  onToggleMastered: (itemKey: string) => void;
}

function InlineAnnotation({
  token,
  isMastered,
  onToggleMastered,
}: InlineAnnotationProps) {
  return (
    <span
      className={`inline-annotation inline-annotation--${token.category}${
        isMastered ? ' inline-annotation--mastered' : ''
      }`}
      data-category={token.category}
      data-item-key={token.itemKey}
    >
      <button
        type="button"
        className={`inline-annotation__surface${
          isMastered ? ' inline-annotation__surface--mastered' : ''
        }`}
        aria-label={token.surface}
        aria-pressed={isMastered}
        title={isMastered ? '点击恢复行间标注' : '点击标记为已掌握'}
        onClick={() => onToggleMastered(token.itemKey)}
      >
        {token.surface}
      </button>
      {!isMastered && (
        <span
          className="inline-annotation__gloss"
          lang="zh-CN"
          style={
            token.shiftX
              ? {
                  transform: `translateX(calc(-50% + ${token.shiftX}px))`,
                }
              : undefined
          }
        >
          {token.gloss}
        </span>
      )}
    </span>
  );
}

export function PassageCard({
  passage,
  masteredItemKeys,
  onToggleMastered,
  hiddenExpansionIds,
  onHideExpansion,
  onRestoreExpansion,
}: PassageCardProps) {
  const [showHiddenExpansions, setShowHiddenExpansions] = useState(false);
  const hiddenSet = new Set(hiddenExpansionIds);
  const visibleExpansions = passage.expansionEntries.filter(
    (entry) => !hiddenSet.has(entry.id)
  );
  const hiddenExpansions = passage.expansionEntries.filter((entry) =>
    hiddenSet.has(entry.id)
  );
  const hasVisibleOutOfSyllabusWords = passage.paragraphs.some((paragraph) =>
    paragraph.sentences.some((sentence) =>
      sentence.tokens.some(
        (token) =>
          token.type === 'annotation' &&
          token.category === 'out-of-syllabus' &&
          !masteredItemKeys.has(token.itemKey)
      )
    )
  );

  const expansionRecovery = hiddenExpansions.length > 0 && (
    <div className="passage-expansion__recovery">
      <button
        type="button"
        className="passage-expansion__recovery-toggle"
        aria-expanded={showHiddenExpansions}
        onClick={() => setShowHiddenExpansions((show) => !show)}
      >
        已隐藏拓展条目（{hiddenExpansions.length}）
      </button>
      {showHiddenExpansions && (
        <ul className="passage-expansion__hidden-list" aria-label="已隐藏拓展条目">
          {hiddenExpansions.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="passage-expansion__restore-entry"
                aria-label={`恢复拓展条目 ${entry.expression}`}
                onClick={() => onRestoreExpansion(entry.id)}
              >
                <span lang="en">{entry.expression}</span>
                <span>：{entry.explanation}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <article className="passage-card">
      <header className="passage-card__header">
        <section className="passage-legend" aria-label="标注图例">
          <div className="passage-legend__item">
            <span className="passage-legend__label">单词</span>
            <span
              className="passage-legend__swatch passage-legend__swatch--regular"
              aria-hidden="true"
            />
          </div>
          <div className="passage-legend__item">
            <span className="passage-legend__label">短语</span>
            <span
              className="passage-legend__swatch passage-legend__swatch--phrase"
              aria-hidden="true"
            />
          </div>
          <div className="passage-legend__item">
            <span className="passage-legend__label">高频词</span>
            <span
              className="passage-legend__swatch passage-legend__swatch--high-frequency"
              aria-hidden="true"
            />
          </div>
          {hasVisibleOutOfSyllabusWords && (
            <div className="passage-legend__item">
              <span className="passage-legend__label">超纲词</span>
              <span
                className="passage-legend__swatch passage-legend__swatch--out-of-syllabus"
                aria-hidden="true"
              />
            </div>
          )}
        </section>

        <div className="passage-banner">
          <h1 className="passage-banner__zh">{passage.titleZh}</h1>
          <p className="passage-banner__en">{passage.titleEn}</p>
        </div>

        <section className="passage-meta" aria-label="篇目信息">
          <div className="passage-meta__top">
            <span className="passage-meta__index">{passage.indexLabel}</span>
            <span
              className={`passage-meta__tier passage-meta__tier--${passage.tier}`}
            >
              {PASSAGE_TIER_LABELS[passage.tier]}
            </span>
          </div>
          <div className="passage-meta__topic">{passage.topic}</div>
        </section>
      </header>

      <div
        className={`passage-card__body${
          visibleExpansions.length === 0
            ? ' passage-card__body--full-width'
            : ''
        }`}
      >
        <div className="passage-main">
          {passage.paragraphs.map((para) => (
            <section
              key={para.paragraphNumber}
              className="passage-paragraph"
              aria-label={`第${para.paragraphNumber}段`}
            >
              <div className="passage-paragraph__en" lang="en">
                <span className="paragraph-label">
                  （第{para.paragraphNumber}段）
                </span>
                {para.sentences.map((sent, sIdx) => (
                  <span key={sent.sentenceNumber} className="passage-sentence">
                    <span className="sentence-number">
                      {sent.circledNumber}
                    </span>
                    {sent.tokens.map((token, tIdx) => {
                      if (token.type === 'text') {
                        return <span key={tIdx}>{token.text}</span>;
                      }

                      return (
                        <InlineAnnotation
                          key={`${token.itemKey}-${tIdx}`}
                          token={token}
                          isMastered={masteredItemKeys.has(token.itemKey)}
                          onToggleMastered={onToggleMastered}
                        />
                      );
                    })}
                    {sIdx < para.sentences.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </div>

              <p className="passage-paragraph__zh">
                <span className="paragraph-label">
                  （第{para.paragraphNumber}段）
                </span>
                {para.sentences.map((sent) => (
                  <span key={sent.sentenceNumber}>
                    {sent.circledNumber}
                    {sent.chinese}
                  </span>
                ))}
              </p>
            </section>
          ))}
          {visibleExpansions.length === 0 && expansionRecovery}
        </div>

        {visibleExpansions.length > 0 && (
          <aside className="passage-expansion" aria-label="熟词僻义及拓展汇总">
            <h2 className="passage-expansion__title">熟词僻义及拓展汇总：</h2>
            <ol className="passage-expansion__list">
              {visibleExpansions.map((entry, idx) => (
                <li
                  key={entry.id}
                  className="passage-expansion__item"
                  data-expansion-id={entry.id}
                >
                  <button
                    type="button"
                    className="passage-expansion__hide-entry"
                    aria-label={`隐藏拓展条目 ${entry.expression}`}
                    onClick={() => onHideExpansion(entry.id)}
                  >
                    <span className="passage-expansion__num">
                      {toCircledNumber(idx + 1)}
                    </span>
                    <span className="passage-expansion__expr" lang="en">
                      {entry.expression}
                    </span>
                    <span className="passage-expansion__sep">: </span>
                    <span className="passage-expansion__desc">
                      {entry.explanation}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {expansionRecovery}
          </aside>
        )}
      </div>
    </article>
  );
}
