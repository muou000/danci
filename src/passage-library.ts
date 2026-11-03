import type {
  CompiledPassage,
  InlineAnnotationToken,
  PassageTier,
} from './corpus';

export type PassageTierFilter = 'all' | PassageTier;

export const PASSAGE_TOPIC_CATEGORIES = [
  '社会心理',
  '科技人工智能',
  '生态环境',
  '教育文化',
  '职场经济',
] as const;

export type PassageTopicCategory = (typeof PASSAGE_TOPIC_CATEGORIES)[number];

const topicCategoryKeywords: Record<PassageTopicCategory, string[]> = {
  社会心理: ['社会', '心理', '认知', '行为', '习惯', '个体', '人际', '自主'],
  科技人工智能: ['科技', '人工智能', '算法', '数字', '数据', '网络', '技术', '智能'],
  生态环境: ['生态', '环境', '绿色', '可持续', '气候', '能源', '污染', '资源'],
  教育文化: ['教育', '文化', '校园', '学术', '学习', '学校', '交流', '阅读'],
  职场经济: ['职场', '经济', '消费', '工作', '就业', '企业', '商业', '市场', '金融'],
};

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
  allowsDegreeInflections: boolean;
}

export type PassageSearchIndex = PassageSearchDocument[];

function* annotationTokensIn(
  passage: CompiledPassage
): Iterable<InlineAnnotationToken> {
  for (const paragraph of passage.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'annotation') yield token;
      }
    }
  }
}

export function filterPassages(
  passages: CompiledPassage[],
  tier: PassageTierFilter,
  topic: string
): CompiledPassage[] {
  return passages.filter(
    (passage) =>
      (tier === 'all' || passage.tier === tier) &&
      matchesTopicFilter(passage, topic)
  );
}

export function getPassageTopicCategories(
  topic: string
): PassageTopicCategory[] {
  return PASSAGE_TOPIC_CATEGORIES.filter((category) =>
    topicCategoryKeywords[category].some((keyword) => topic.includes(keyword))
  );
}

function matchesTopicFilter(passage: CompiledPassage, topic: string): boolean {
  if (topic === 'all') return true;
  if (topic.startsWith('topic:')) {
    return passage.topic === topic.slice('topic:'.length);
  }

  const category = topic.startsWith('category:')
    ? topic.slice('category:'.length)
    : topic;
  if (
    PASSAGE_TOPIC_CATEGORIES.includes(category as PassageTopicCategory)
  ) {
    return getPassageTopicCategories(passage.topic).includes(
      category as PassageTopicCategory
    );
  }
  return passage.topic === topic;
}

export function getPassageProgress(
  passage: CompiledPassage,
  masteredItemKeys: ReadonlySet<string>
): PassageProgress {
  const itemKeys = new Set<string>();
  for (const token of annotationTokensIn(passage)) itemKeys.add(token.itemKey);

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

function englishWordForms(word: string, allowsDegreeInflections: boolean): Set<string> {
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
  if (allowsDegreeInflections) addDegreeForms(word, forms);

  return forms;
}

function addDegreeForms(word: string, forms: Set<string>): void {
  if (word.endsWith('iest')) {
    forms.add(`${word.slice(0, -4)}y`);
  } else if (word.endsWith('ier')) {
    forms.add(`${word.slice(0, -3)}y`);
  } else if (word.endsWith('est')) {
    addDegreeBase(word.slice(0, -3), forms);
  } else if (word.endsWith('er')) {
    addDegreeBase(word.slice(0, -2), forms);
  } else if (/[^aeiou]y$/.test(word)) {
    const stem = word.slice(0, -1);
    forms.add(`${stem}ier`);
    forms.add(`${stem}iest`);
  } else if (word.endsWith('e')) {
    forms.add(`${word}r`);
    forms.add(`${word}st`);
  } else if (/[^aeiou][aeiou][^aeiouwxy]$/.test(word)) {
    const doubled = `${word}${word.slice(-1)}`;
    forms.add(`${doubled}er`);
    forms.add(`${doubled}est`);
  } else {
    forms.add(`${word}er`);
    forms.add(`${word}est`);
  }
}

function addDegreeBase(base: string, forms: Set<string>): void {
  forms.add(base);
  forms.add(`${base}e`);
  if (/(.)\1$/.test(base)) forms.add(base.slice(0, -1));
}

function makeSearchDocument(
  result: PassageSearchResult,
  searchFields: string[],
  allowsDegreeInflections = false
): PassageSearchDocument {
  const searchText = normalizeSearchText(searchFields.join(' '));
  const englishWords = searchText.match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  return { result, searchText, englishWords, allowsDegreeInflections };
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
    for (const token of annotationTokensIn(passage)) {
      if (seenAnnotationKeys.has(token.itemKey)) continue;
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
        makeSearchDocument(
          result,
          annotationSearchFields(token),
          /^(?:a|adj|ad|adv)\./i.test(token.gloss.trim())
        )
      );
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
    const queryForms = englishWordForms(
      queryWord,
      document.allowsDegreeInflections
    );
    return document.englishWords.some((documentWord) => {
      const documentForms = englishWordForms(
        documentWord,
        document.allowsDegreeInflections
      );
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
