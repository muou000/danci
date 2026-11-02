import {
  getDefaultSyllabusCatalog,
  resolveWordToHeadwords,
  type SyllabusCatalog,
} from '../syllabus';
import { DEMO_PASSAGES } from './demo-passages';
import { toCircledNumber } from './formatting';

export { DEMO_PASSAGES };
export { COMPILED_DEMO_PASSAGES } from './compiled-demos';
export { toCircledNumber } from './formatting';

export type PassageTier = 'cet4-core' | 'cet6-advanced';
export type AnnotationCategory =
  | 'regular'
  | 'high-frequency'
  | 'phrase'
  | 'out-of-syllabus';

export const PASSAGE_TIER_LABELS: Record<PassageTier, string> = {
  'cet4-core': '四级核心篇',
  'cet6-advanced': '六级进阶篇',
};

export interface PassageSentence {
  sentenceNumber: number;
  english: string;
  chinese: string;
}

export interface PassageParagraph {
  paragraphNumber: number;
  sentences: PassageSentence[];
}

export interface WordAnnotationSpec {
  headwordId?: string;
  kind?: 'syllabus' | 'out-of-syllabus';
  surface?: string;
  lemma?: string;
  gloss: string;
}

export interface PhraseAnnotationSpec {
  phrase: string;
  surface: string;
  gloss: string;
}

export interface ExpansionEntry {
  id: string;
  expression: string;
  explanation: string;
}

export interface Passage {
  id: string;
  indexLabel: string;
  tier: PassageTier;
  topic: string;
  titleZh: string;
  titleEn: string;
  paragraphs: PassageParagraph[];
  wordAnnotations: WordAnnotationSpec[];
  phraseAnnotations: PhraseAnnotationSpec[];
  expansionEntries: ExpansionEntry[];
}

export interface PlainTextToken {
  type: 'text';
  text: string;
}

export interface InlineAnnotationToken {
  type: 'annotation';
  category: AnnotationCategory;
  itemKey: string;
  surface: string;
  gloss: string;
  headwordId?: string;
  phrase?: string;
}

export type CompiledToken = PlainTextToken | InlineAnnotationToken;

export interface CompiledSentence {
  sentenceNumber: number;
  circledNumber: string;
  english: string;
  chinese: string;
  tokens: CompiledToken[];
}

export interface CompiledParagraph {
  paragraphNumber: number;
  sentences: CompiledSentence[];
}

export interface CompiledPassage {
  id: string;
  indexLabel: string;
  tier: PassageTier;
  topic: string;
  titleZh: string;
  titleEn: string;
  paragraphs: CompiledParagraph[];
  expansionEntries: ExpansionEntry[];
  coveredHeadwordIds: string[];
  hasOutOfSyllabusWords: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface PhraseMatch {
  start: number;
  end: number;
  spec: PhraseAnnotationSpec;
}

function findPhraseMatches(
  text: string,
  specs: PhraseAnnotationSpec[]
): PhraseMatch[] {
  // Prefer longer surface matches first
  const sortedSpecs = [...specs].sort(
    (a, b) => b.surface.length - a.surface.length
  );
  const candidates: PhraseMatch[] = [];

  for (const spec of sortedSpecs) {
    if (!spec.surface.trim()) continue;
    const pattern = new RegExp(
      `(?<![A-Za-z0-9-])${escapeRegex(spec.surface)}(?![A-Za-z0-9-])`,
      'gi'
    );
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      candidates.push({
        start: m.index,
        end: m.index + m[0].length,
        spec,
      });
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end);

  const accepted: PhraseMatch[] = [];
  let cursor = 0;
  for (const c of candidates) {
    if (c.start >= cursor) {
      accepted.push(c);
      cursor = c.end;
    }
  }
  return accepted;
}

export function compilePassage(
  passage: Passage,
  catalog: SyllabusCatalog = getDefaultSyllabusCatalog()
): CompiledPassage {
  const seenKeys = new Set<string>();
  const coveredHeadwordSet = new Set<string>();
  let hasOutOfSyllabusWords = false;

  const wordByHeadwordId = new Map<string, WordAnnotationSpec>();
  const wordBySurfaceLower = new Map<string, WordAnnotationSpec>();
  for (const w of passage.wordAnnotations) {
    if (w.headwordId) {
      wordByHeadwordId.set(w.headwordId, w);
    }
    if (w.surface) {
      wordBySurfaceLower.set(w.surface.toLowerCase(), w);
    }
  }

  const compilePlainSegment = (segment: string): CompiledToken[] => {
    if (!segment) return [];
    const tokens: CompiledToken[] = [];
    const wordRegex = /[A-Za-z]+(?:[-'’][A-Za-z]+)*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const pushText = (t: string) => {
      if (!t) return;
      const prev = tokens[tokens.length - 1];
      if (prev && prev.type === 'text') {
        prev.text += t;
      } else {
        tokens.push({ type: 'text', text: t });
      }
    };

    while ((match = wordRegex.exec(segment)) !== null) {
      if (match.index > lastIndex) {
        pushText(segment.slice(lastIndex, match.index));
      }
      const word = match[0];
      const lower = word.toLowerCase();

      let matchedSpec: WordAnnotationSpec | undefined;
      const resolved = resolveWordToHeadwords(word, catalog);
      for (const entry of resolved) {
        const candidateSpec = wordByHeadwordId.get(entry.id);
        if (candidateSpec) {
          matchedSpec = candidateSpec;
          break;
        }
      }

      if (!matchedSpec) {
        matchedSpec = wordBySurfaceLower.get(lower);
      }

      if (matchedSpec) {
        const kind =
          matchedSpec.kind ??
          (matchedSpec.headwordId ? 'syllabus' : 'out-of-syllabus');
        const itemKey =
          kind === 'syllabus' && matchedSpec.headwordId
            ? `word:${matchedSpec.headwordId}`
            : `oos:${(matchedSpec.lemma ?? matchedSpec.surface ?? lower).toLowerCase()}`;

        if (!seenKeys.has(itemKey)) {
          seenKeys.add(itemKey);
          if (kind === 'syllabus' && matchedSpec.headwordId) {
            const catEntry = catalog.byId.get(matchedSpec.headwordId);
            const category: AnnotationCategory =
              catEntry?.tier === 'high-frequency'
                ? 'high-frequency'
                : 'regular';
            coveredHeadwordSet.add(matchedSpec.headwordId);
            tokens.push({
              type: 'annotation',
              category,
              itemKey,
              surface: word,
              gloss: matchedSpec.gloss,
              headwordId: matchedSpec.headwordId,
            });
          } else {
            hasOutOfSyllabusWords = true;
            tokens.push({
              type: 'annotation',
              category: 'out-of-syllabus',
              itemKey,
              surface: word,
              gloss: matchedSpec.gloss,
            });
          }
          lastIndex = match.index + word.length;
          continue;
        }
      }

      pushText(word);
      lastIndex = match.index + word.length;
    }

    if (lastIndex < segment.length) {
      pushText(segment.slice(lastIndex));
    }

    return tokens;
  };

  const compiledParagraphs: CompiledParagraph[] = passage.paragraphs.map(
    (para) => ({
      paragraphNumber: para.paragraphNumber,
      sentences: para.sentences.map((sent) => {
        const phraseMatches = findPhraseMatches(
          sent.english,
          passage.phraseAnnotations
        );
        const tokens: CompiledToken[] = [];
        let pos = 0;

        for (const pm of phraseMatches) {
          if (pm.start > pos) {
            tokens.push(...compilePlainSegment(sent.english.slice(pos, pm.start)));
          }
          const surface = sent.english.slice(pm.start, pm.end);
          const itemKey = `phrase:${pm.spec.phrase.toLowerCase().trim()}`;
          if (!seenKeys.has(itemKey)) {
            seenKeys.add(itemKey);
            tokens.push({
              type: 'annotation',
              category: 'phrase',
              itemKey,
              surface,
              gloss: pm.spec.gloss,
              phrase: pm.spec.phrase,
            });
          } else {
            const prev = tokens[tokens.length - 1];
            if (prev && prev.type === 'text') {
              prev.text += surface;
            } else {
              tokens.push({ type: 'text', text: surface });
            }
          }
          pos = pm.end;
        }
        if (pos < sent.english.length) {
          tokens.push(...compilePlainSegment(sent.english.slice(pos)));
        }

        return {
          sentenceNumber: sent.sentenceNumber,
          circledNumber: toCircledNumber(sent.sentenceNumber),
          english: sent.english,
          chinese: sent.chinese,
          tokens,
        };
      }),
    })
  );

  return {
    id: passage.id,
    indexLabel: passage.indexLabel,
    tier: passage.tier,
    topic: passage.topic,
    titleZh: passage.titleZh,
    titleEn: passage.titleEn,
    paragraphs: compiledParagraphs,
    expansionEntries: passage.expansionEntries,
    coveredHeadwordIds: Array.from(coveredHeadwordSet),
    hasOutOfSyllabusWords,
  };
}

export interface CorpusCoverageReport {
  coveredCoreIds: Set<string>;
  uncoveredCoreIds: string[];
  totalCoreCount: number;
  coverageRatio: number;
}

export function computeCorpusCoverage(
  passages: Passage[],
  catalog: SyllabusCatalog = getDefaultSyllabusCatalog()
): CorpusCoverageReport {
  const coreIds = catalog.entries
    .filter((e) => e.tier !== 'exempt')
    .map((e) => e.id);
  const coreSet = new Set<string>(coreIds);
  const coveredCoreIds = new Set<string>();

  for (const passage of passages) {
    const compiled = compilePassage(passage, catalog);
    for (const id of compiled.coveredHeadwordIds) {
      if (coreSet.has(id)) {
        coveredCoreIds.add(id);
      }
    }
  }

  const uncoveredCoreIds = coreIds.filter((id) => !coveredCoreIds.has(id));
  return {
    coveredCoreIds,
    uncoveredCoreIds,
    totalCoreCount: coreIds.length,
    coverageRatio:
      coreIds.length === 0 ? 1 : coveredCoreIds.size / coreIds.length,
  };
}

export type ValidationErrorCode =
  | 'invalid-paragraph-numbering'
  | 'invalid-sentence-numbering'
  | 'empty-sentence-english'
  | 'missing-sentence-translation'
  | 'invalid-expansion-count'
  | 'invalid-expansion-entry'
  | 'invalid-headword-id'
  | 'invalid-word-gloss'
  | 'invalid-phrase'
  | 'invalid-phrase-gloss'
  | 'unused-annotation'
  | 'unmarked-out-of-syllabus'
  | 'unannotated-core-word';

export interface PassageValidationError {
  code: ValidationErrorCode;
  message: string;
}

export interface PassageValidationResult {
  valid: boolean;
  errors: PassageValidationError[];
}

const WORD_GLOSS_REGEX =
  /^(?:n|v|vt|vi|a|adj|ad|adv|prep|conj|pron|num)\.\s*[^；\s][^；]*(?:；\s*[^；\s][^；]*){1,2}$/;
const CJK_REGEX = /[\u4e00-\u9fff]/;

export function validatePassage(
  passage: Passage,
  catalog: SyllabusCatalog = getDefaultSyllabusCatalog()
): PassageValidationResult {
  const errors: PassageValidationError[] = [];

  if (passage.paragraphs.length === 0) {
    errors.push({
      code: 'invalid-paragraph-numbering',
      message: '短文至少需要包含 1 个自然段。',
    });
  }

  passage.paragraphs.forEach((para, pIdx) => {
    if (para.paragraphNumber !== pIdx + 1) {
      errors.push({
        code: 'invalid-paragraph-numbering',
        message: `段落编号必须从 1 连续递增，发现第 ${pIdx + 1} 段编号为 ${para.paragraphNumber}。`,
      });
    }
    if (para.sentences.length === 0 || para.sentences.length > 20) {
      errors.push({
        code: 'invalid-sentence-numbering',
        message: `第 ${para.paragraphNumber} 段句子数量需在 1–20 之间。`,
      });
    }
    para.sentences.forEach((sent, sIdx) => {
      if (sent.sentenceNumber !== sIdx + 1) {
        errors.push({
          code: 'invalid-sentence-numbering',
          message: `第 ${para.paragraphNumber} 段句子编号必须从 1 连续递增。`,
        });
      }
      if (!sent.english.trim()) {
        errors.push({
          code: 'empty-sentence-english',
          message: `第 ${para.paragraphNumber} 段第 ${sent.sentenceNumber} 句缺少英文正文。`,
        });
      }
      if (!sent.chinese.trim() || !CJK_REGEX.test(sent.chinese)) {
        errors.push({
          code: 'missing-sentence-translation',
          message: `第 ${para.paragraphNumber} 段第 ${sent.sentenceNumber} 句缺少完整中文译文。`,
        });
      }
    });
  });

  if (
    passage.expansionEntries.length < 12 ||
    passage.expansionEntries.length > 18
  ) {
    errors.push({
      code: 'invalid-expansion-count',
      message: `右侧拓展条目须为 12–18 条，当前为 ${passage.expansionEntries.length} 条。`,
    });
  }

  const seenExpIds = new Set<string>();
  for (const exp of passage.expansionEntries) {
    if (
      !exp.id.trim() ||
      seenExpIds.has(exp.id) ||
      !exp.expression.trim() ||
      !exp.explanation.trim() ||
      !CJK_REGEX.test(exp.explanation)
    ) {
      errors.push({
        code: 'invalid-expansion-entry',
        message: `拓展条目 "${exp.id}" 存在空字段或重复 ID。`,
      });
    }
    seenExpIds.add(exp.id);
  }

  const declaredHeadwordIds = new Set<string>();
  const declaredSurfacesLower = new Set<string>();
  const oosSurfaceSet = new Set<string>();

  for (const w of passage.wordAnnotations) {
    const kind =
      w.kind ?? (w.headwordId ? 'syllabus' : 'out-of-syllabus');
    if (!WORD_GLOSS_REGEX.test(w.gloss.trim()) || !CJK_REGEX.test(w.gloss)) {
      errors.push({
        code: 'invalid-word-gloss',
        message: `单词释义 "${w.gloss}" 须采用“词性.义项1；义项2（2–3 个常考义项）”格式。`,
      });
    }
    if (kind === 'syllabus') {
      if (!w.headwordId) {
        errors.push({
          code: 'invalid-headword-id',
          message: '大纲词标注缺少 headwordId。',
        });
      } else {
        const entry = catalog.byId.get(w.headwordId);
        if (!entry || entry.tier === 'exempt') {
          errors.push({
            code: 'invalid-headword-id',
            message: `headwordId "${w.headwordId}" 不存在或属于免注基础词。`,
          });
        }
        declaredHeadwordIds.add(w.headwordId);
      }
      if (w.surface) {
        declaredSurfacesLower.add(w.surface.toLowerCase());
      }
    } else {
      if (w.surface) {
        oosSurfaceSet.add(w.surface.toLowerCase());
      }
      if (w.lemma) {
        oosSurfaceSet.add(w.lemma.toLowerCase());
      }
    }
  }

  for (const p of passage.phraseAnnotations) {
    const phraseWords = p.phrase.trim().split(/\s+/).filter(Boolean);
    if (phraseWords.length < 2) {
      errors.push({
        code: 'invalid-phrase',
        message: `短语 "${p.phrase}" 必须由至少 2 个英文单词构成。`,
      });
    }
    const g = p.gloss.trim();
    if (!g || !CJK_REGEX.test(g) || /^[a-z]+\./i.test(g)) {
      errors.push({
        code: 'invalid-phrase-gloss',
        message: `短语 "${p.phrase}" 的释义 "${p.gloss}" 应仅保留精炼中文义，不带词性前缀。`,
      });
    }
  }

  // Verify compiled occurrence: all declared annotations must be matched at least once
  const compiled = compilePassage(passage, catalog);
  const matchedAnnotatedKeys = new Set<string>();
  for (const p of compiled.paragraphs) {
    for (const s of p.sentences) {
      for (const t of s.tokens) {
        if (t.type === 'annotation') {
          matchedAnnotatedKeys.add(t.itemKey);
        }
      }
    }
  }

  for (const w of passage.wordAnnotations) {
    const kind = w.kind ?? (w.headwordId ? 'syllabus' : 'out-of-syllabus');
    const key =
      kind === 'syllabus' && w.headwordId
        ? `word:${w.headwordId}`
        : `oos:${(w.lemma ?? w.surface ?? '').toLowerCase()}`;
    if (!matchedAnnotatedKeys.has(key)) {
      errors.push({
        code: 'unused-annotation',
        message: `声明的单词标注 "${w.surface ?? w.headwordId}" 在正文中未被匹配或未生成行间标注。`,
      });
    }
  }

  for (const p of passage.phraseAnnotations) {
    const key = `phrase:${p.phrase.toLowerCase().trim()}`;
    if (!matchedAnnotatedKeys.has(key)) {
      errors.push({
        code: 'unused-annotation',
        message: `声明的短语标注 "${p.phrase}" 在正文中未被匹配或未生成行间标注。`,
      });
    }
  }

  // Scan every sentence outside phrase spans for unmarked out-of-syllabus or unannotated core words
  const wordRegex = /[A-Za-z]+(?:[-'’][A-Za-z]+)*/g;
  for (const para of passage.paragraphs) {
    for (const sent of para.sentences) {
      const phraseMatches = findPhraseMatches(
        sent.english,
        passage.phraseAnnotations
      );
      const plainSegments: string[] = [];
      let cursor = 0;
      for (const pm of phraseMatches) {
        if (pm.start > cursor) {
          plainSegments.push(sent.english.slice(cursor, pm.start));
        }
        cursor = pm.end;
      }
      if (cursor < sent.english.length) {
        plainSegments.push(sent.english.slice(cursor));
      }

      for (const seg of plainSegments) {
        let m: RegExpExecArray | null;
        wordRegex.lastIndex = 0;
        while ((m = wordRegex.exec(seg)) !== null) {
          const word = m[0];
          const lower = word.toLowerCase();

          if (oosSurfaceSet.has(lower)) {
            continue;
          }

          const resolved = resolveWordToHeadwords(word, catalog);
          if (resolved.length > 0) {
            const hasExempt = resolved.some((e) => e.tier === 'exempt');
            const hasDeclaredCore = resolved.some(
              (e) => e.tier !== 'exempt' && declaredHeadwordIds.has(e.id)
            );
            const isDeclaredSurface = declaredSurfacesLower.has(lower);

            // If the word resolves only to core words (no exempt homographs) and isn't declared
            if (!hasExempt && !hasDeclaredCore && !isDeclaredSurface) {
              errors.push({
                code: 'unannotated-core-word',
                message: `核心大纲词 "${word}"（归属 ${resolved.map((r) => r.id).join('/')}）未配置首现行间标注。`,
              });
            }
            continue;
          }

          // Check hyphenated compound whose parts all resolve to syllabus words (e.g. second-hand, cell-phone)
          if (word.includes('-')) {
            const parts = word.split('-').filter(Boolean);
            const partResolutions = parts.map((pt) =>
              resolveWordToHeadwords(pt, catalog)
            );
            if (partResolutions.every((r) => r.length > 0)) {
              const allPartsExempt = partResolutions.every((r) =>
                r.some((e) => e.tier === 'exempt')
              );
              if (allPartsExempt || declaredSurfacesLower.has(lower)) {
                continue;
              }
            }
          }

          errors.push({
            code: 'unmarked-out-of-syllabus',
            message: `非大纲非免注词 "${word}" 必须显式标记为超纲词。`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
