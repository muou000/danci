import { type ReactNode, type Ref, useState } from 'react';
import {
  PASSAGE_TIER_LABELS,
  toCircledNumber,
  type CompiledPassage,
  type CompiledSentence,
  type InlineAnnotationToken,
} from '../corpus';

export interface PassageCardProps {
  passage: CompiledPassage;
  masteredItemKeys: Set<string>;
  onToggleMastered: (itemKey: string) => void;
  onMarkMastered: (itemKeys: string[]) => void;
  hiddenExpansionIds: string[];
  onHideExpansion: (entryId: string) => void;
  onRestoreExpansion: (entryId: string) => void;
  exportMode?: boolean;
  exportRef?: Ref<HTMLElement>;
}

interface InlineAnnotationProps {
  token: InlineAnnotationToken;
  isMastered: boolean;
  onToggleMastered: (itemKey: string) => void;
  exportMode: boolean;
}

function InlineAnnotation({
  token,
  isMastered,
  onToggleMastered,
  exportMode,
}: InlineAnnotationProps) {
  const surfaceClassName = `inline-annotation__surface${
    isMastered ? ' inline-annotation__surface--mastered' : ''
  }`;

  return (
    <span
      className={`inline-annotation inline-annotation--${token.category}${
        isMastered ? ' inline-annotation--mastered' : ''
      }`}
      data-category={token.category}
      data-item-key={token.itemKey}
    >
      {exportMode ? (
        <span className={surfaceClassName}>{token.surface}</span>
      ) : (
        <button
          type="button"
          className={surfaceClassName}
          aria-label={token.surface}
          aria-pressed={isMastered}
          title={isMastered ? '点击恢复行间标注' : '点击标记为已掌握'}
          onClick={() => onToggleMastered(token.itemKey)}
        >
          {token.surface}
        </button>
      )}
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

function getUnmasteredItemKeys(
  sentences: CompiledSentence[],
  masteredItemKeys: Set<string>
): string[] {
  const itemKeys = new Set<string>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      if (token.type === 'annotation' && !masteredItemKeys.has(token.itemKey)) {
        itemKeys.add(token.itemKey);
      }
    }
  }
  return Array.from(itemKeys);
}

interface MasteryScopeActionProps {
  itemKeys: string[];
  label: string;
  title: string;
  disabledTitle: string;
  className?: string;
  onMarkMastered: (itemKeys: string[]) => void;
  children: ReactNode;
}

function MasteryScopeAction({
  itemKeys,
  label,
  title,
  disabledTitle,
  className,
  onMarkMastered,
  children,
}: MasteryScopeActionProps) {
  const isUnavailable = itemKeys.length === 0;
  return (
    <button
      type="button"
      className={`mastery-scope-action${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-disabled={isUnavailable}
      title={isUnavailable ? disabledTitle : title}
      onClick={() => {
        if (!isUnavailable) onMarkMastered(itemKeys);
      }}
    >
      {children}
    </button>
  );
}

export function PassageCard({
  passage,
  masteredItemKeys,
  onToggleMastered,
  onMarkMastered,
  hiddenExpansionIds,
  onHideExpansion,
  onRestoreExpansion,
  exportMode = false,
  exportRef,
}: PassageCardProps) {
  const [showHiddenExpansions, setShowHiddenExpansions] = useState(false);
  const hiddenSet = new Set(hiddenExpansionIds);
  const visibleExpansions = passage.expansionEntries.filter(
    (entry) => !hiddenSet.has(entry.id)
  );
  const hiddenExpansions = passage.expansionEntries.filter((entry) =>
    hiddenSet.has(entry.id)
  );
  const passageItemKeys = getUnmasteredItemKeys(
    passage.paragraphs.flatMap((paragraph) => paragraph.sentences),
    masteredItemKeys
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

  const expansionRecovery = !exportMode && hiddenExpansions.length > 0 && (
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
    <article
      ref={exportRef}
      className={`passage-card${exportMode ? ' passage-card--export' : ''}`}
    >
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

      {!exportMode && (
        <div className="passage-bulk-toolbar">
          <MasteryScopeAction
            itemKeys={passageItemKeys}
            label="标熟整篇短文"
            title="标熟整篇短文"
            disabledTitle="整篇短文已全部标熟"
            onMarkMastered={onMarkMastered}
          >
            标熟整篇
          </MasteryScopeAction>
        </div>
      )}

      <div
        className={`passage-card__body${
          visibleExpansions.length === 0
            ? ' passage-card__body--full-width'
            : ''
        }`}
      >
        <div className="passage-main">
          {passage.paragraphs.map((para) => {
            const paragraphItemKeys = getUnmasteredItemKeys(
              para.sentences,
              masteredItemKeys
            );

            return (
              <section
                key={para.paragraphNumber}
                className="passage-paragraph"
                aria-label={`第${para.paragraphNumber}段`}
              >
                <div className="passage-paragraph__en" lang="en">
                  {exportMode ? (
                    <span className="paragraph-label">
                      （第{para.paragraphNumber}段）
                    </span>
                  ) : (
                    <MasteryScopeAction
                      itemKeys={paragraphItemKeys}
                      label={`标熟第${para.paragraphNumber}段`}
                      title={`标熟第${para.paragraphNumber}段`}
                      disabledTitle={`第${para.paragraphNumber}段已全部标熟`}
                      className="paragraph-label paragraph-label--action"
                      onMarkMastered={onMarkMastered}
                    >
                      （第{para.paragraphNumber}段）
                    </MasteryScopeAction>
                  )}
                  {para.sentences.map((sent, sIdx) => (
                    <span key={sent.sentenceNumber} className="passage-sentence">
                      {exportMode ? (
                        <span className="sentence-number">
                          {sent.circledNumber}
                        </span>
                      ) : (
                        <MasteryScopeAction
                          itemKeys={getUnmasteredItemKeys(
                            [sent],
                            masteredItemKeys
                          )}
                          label={`标熟第${para.paragraphNumber}段第${sent.sentenceNumber}句`}
                          title={`标熟第${para.paragraphNumber}段第${sent.sentenceNumber}句`}
                          disabledTitle={`第${para.paragraphNumber}段第${sent.sentenceNumber}句已全部标熟`}
                          className="sentence-number sentence-number--action"
                          onMarkMastered={onMarkMastered}
                        >
                          {sent.circledNumber}
                        </MasteryScopeAction>
                      )}
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
                            exportMode={exportMode}
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
            );
          })}
          {visibleExpansions.length === 0 && expansionRecovery}
        </div>

        {visibleExpansions.length > 0 && (
          <aside className="passage-expansion" aria-label="熟词僻义及拓展汇总">
            <h2 className="passage-expansion__title">熟词僻义及拓展汇总：</h2>
            <ol className="passage-expansion__list">
              {visibleExpansions.map((entry, idx) => {
                const content = (
                  <>
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
                  </>
                );

                return (
                  <li
                    key={entry.id}
                    className="passage-expansion__item"
                    data-expansion-id={entry.id}
                  >
                    {exportMode ? (
                      <span className="passage-expansion__entry">{content}</span>
                    ) : (
                      <button
                        type="button"
                        className="passage-expansion__hide-entry"
                        aria-label={`隐藏拓展条目 ${entry.expression}`}
                        onClick={() => onHideExpansion(entry.id)}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            {expansionRecovery}
          </aside>
        )}
      </div>
    </article>
  );
}
