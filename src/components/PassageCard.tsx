import {
  PASSAGE_TIER_LABELS,
  toCircledNumber,
  type CompiledPassage,
} from '../corpus';

export interface PassageCardProps {
  passage: CompiledPassage;
}

export function PassageCard({ passage }: PassageCardProps) {
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
          {passage.hasOutOfSyllabusWords && (
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

      <div className="passage-card__body">
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
                    {sent.tokens.map((token, tIdx) =>
                      token.type === 'text' ? (
                        <span key={tIdx}>{token.text}</span>
                      ) : (
                        <span
                          key={`${token.itemKey}-${tIdx}`}
                          className={`inline-annotation inline-annotation--${token.category}`}
                          data-category={token.category}
                          data-item-key={token.itemKey}
                        >
                          <span className="inline-annotation__surface">
                            {token.surface}
                          </span>
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
                        </span>
                      )
                    )}
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
        </div>

        <aside className="passage-expansion" aria-label="熟词僻义及拓展汇总">
          <h2 className="passage-expansion__title">熟词僻义及拓展汇总：</h2>
          <ol className="passage-expansion__list">
            {passage.expansionEntries.map((entry, idx) => (
              <li
                key={entry.id}
                className="passage-expansion__item"
                data-expansion-id={entry.id}
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
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </article>
  );
}
