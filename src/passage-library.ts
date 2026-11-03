import type {
  CompiledPassage,
  InlineAnnotationToken,
  PassageTier,
} from './corpus';

export type PassageTierFilter = 'all' | PassageTier;

export interface PassageProgress {
  masteredCount: number;
  remainingCount: number;
  totalCount: number;
}

export type PassageSearchResultKind = 'annotation' | 'expansion';

export interface PassageSearchResult {
  key: string;
  passageId: string;
  indexLabel: string;
  tier: PassageTier;
  topic: string;
  titleZh: string;
  titleEn: string;
  kind: PassageSearchResultKind;
  expression: string;
  surface?: string;
  summary: string;
}

interface PassageSearchDocument {
  result: PassageSearchResult;
  searchText: string;
  englishWords: string[];
}

export type PassageSearchIndex = PassageSearchDocument[];

export function filterPassages(
  passages: CompiledPassage[],
  tier: PassageTierFilter,
  topic: string
): CompiledPassage[] {
  return passages.filter(
    (passage) =>
      (tier === 'all' || passage.tier === tier) &&
      (topic === 'all' || passage.topic === topic)
  );
}

export function getPassageProgress(
  passage: CompiledPassage,
  masteredItemKeys: ReadonlySet<string>
): PassageProgress {
  const itemKeys = new Set<string>();
  for (const paragraph of passage.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'annotation') itemKeys.add(token.itemKey);
      }
    }
  }

  let masteredCount = 0;
  for (const itemKey of itemKeys) {
    if (masteredItemKeys.has(itemKey)) masteredCount += 1;
  }

  return {
    masteredCount,
    remainingCount: itemKeys.size - masteredCount,
    totalCount: itemKeys.size,
  };
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").trim();
}

function englishWordForms(word: string): Set<string> {
  const forms = new Set([word]);
  if (word.length < 4) return forms;

  if (word.endsWith('ies')) {
    forms.add(`${word.slice(0, -3)}y`);
  }
  if (word.endsWith('ied')) {
    forms.add(`${word.slice(0, -3)}y`);
  }
  if (word.endsWith('ing')) {
    const base = word.slice(0, -3);
    forms.add(base);
    forms.add(`${base}e`);
    if (/(.)\1$/.test(base)) forms.add(base.slice(0, -1));
  }
  if (word.endsWith('ed')) {
    const base = word.slice(0, -2);
    forms.add(base);
    forms.add(`${base}e`);
    if (/(.)\1$/.test(base)) forms.add(base.slice(0, -1));
  }
  if (word.endsWith('es')) {
    forms.add(word.slice(0, -2));
  }
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    forms.add(word.slice(0, -1));
  }

  return forms;
}

function makeSearchDocument(
  result: PassageSearchResult,
  searchFields: string[]
): PassageSearchDocument {
  const searchText = normalizeSearchText(searchFields.join(' '));
  const englishWords = searchText.match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  return { result, searchText, englishWords };
}

function passageSearchContext(
  passage: CompiledPassage
): Pick<
  PassageSearchResult,
  'passageId' | 'indexLabel' | 'tier' | 'topic' | 'titleZh' | 'titleEn'
> {
  return {
    passageId: passage.id,
    indexLabel: passage.indexLabel,
    tier: passage.tier,
    topic: passage.topic,
    titleZh: passage.titleZh,
    titleEn: passage.titleEn,
  };
}

export function buildPassageSearchIndex(
  passages: CompiledPassage[]
): PassageSearchIndex {
  const index: PassageSearchIndex = [];
  for (const passage of passages) {
    const seenAnnotationKeys = new Set<string>();
    for (const paragraph of passage.paragraphs) {
      for (const sentence of paragraph.sentences) {
        for (const token of sentence.tokens) {
          if (
            token.type !== 'annotation' ||
            seenAnnotationKeys.has(token.itemKey)
          ) {
            continue;
          }
          seenAnnotationKeys.add(token.itemKey);
          const result: PassageSearchResult = {
            key: `${passage.id}:annotation:${token.itemKey}`,
            ...passageSearchContext(passage),
            kind: 'annotation',
            expression: token.phrase ?? token.headwordId ?? token.surface,
            surface: token.surface,
            summary: token.gloss,
          };
          index.push(
            makeSearchDocument(result, annotationSearchFields(token))
          );
        }
      }
    }

    for (const entry of passage.expansionEntries) {
      const result: PassageSearchResult = {
        key: `${passage.id}:expansion:${entry.id}`,
        ...passageSearchContext(passage),
        kind: 'expansion',
        expression: entry.expression,
        summary: entry.explanation,
      };
      index.push(
        makeSearchDocument(result, [entry.expression, entry.explanation])
      );
    }
  }
  return index;
}

function annotationSearchFields(token: InlineAnnotationToken): string[] {
  return [token.surface, token.headwordId ?? '', token.phrase ?? '', token.gloss];
}

function matchesEnglishWords(
  query: string,
  document: PassageSearchDocument
): boolean {
  const queryWords = query.match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  const meaningfulQueryWords = queryWords.filter((word) => word.length >= 3);
  if (meaningfulQueryWords.length === 0) return false;

  return meaningfulQueryWords.every((queryWord) => {
    const queryForms = englishWordForms(queryWord);
    return document.englishWords.some((documentWord) => {
      const documentForms = englishWordForms(documentWord);
      return Array.from(queryForms).some((form) => documentForms.has(form));
    });
  });
}

export function searchPassages(
  index: PassageSearchIndex,
  query: string
): PassageSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return index
    .filter(
      (document) =>
        document.searchText.includes(normalizedQuery) ||
        matchesEnglishWords(normalizedQuery, document)
    )
    .map((document) => document.result);
}
