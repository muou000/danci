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

export type PassageTopicFilter =
  | { kind: 'all' }
  | { kind: 'category'; value: PassageTopicCategory }
  | { kind: 'topic'; value: string };

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

function* uniqueAnnotationTokensIn(
  passage: CompiledPassage
): Iterable<InlineAnnotationToken> {
  const seenItemKeys = new Set<string>();
  for (const token of annotationTokensIn(passage)) {
    if (seenItemKeys.has(token.itemKey)) continue;
    seenItemKeys.add(token.itemKey);
    yield token;
  }
}

export function filterPassages(
  passages: CompiledPassage[],
  tier: PassageTierFilter,
  topic: PassageTopicFilter
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
  const hasTechnologyTerm = topicCategoryKeywords['科技人工智能'].some(
    (keyword) => topic.includes(keyword)
  );
  return PASSAGE_TOPIC_CATEGORIES.filter((category) =>
    topicCategoryKeywords[category].some(
      (keyword) =>
        topic.includes(keyword) &&
        !(category === '生态环境' && keyword === '生态' && hasTechnologyTerm)
    )
  );
}

function matchesTopicFilter(
  passage: CompiledPassage,
  topic: PassageTopicFilter
): boolean {
  switch (topic.kind) {
    case 'all':
      return true;
    case 'category':
      return getPassageTopicCategories(passage.topic).includes(topic.value);
    case 'topic':
      return passage.topic === topic.value;
  }
}

export function getPassageProgress(
  passage: CompiledPassage,
  masteredItemKeys: ReadonlySet<string>
): PassageProgress {
  const itemKeys = new Set<string>();
  for (const token of uniqueAnnotationTokensIn(passage)) {
    itemKeys.add(token.itemKey);
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

const irregularInflectionGroups = [
  ['be', 'am', 'is', 'are', 'was', 'were', 'been'],
  ['become', 'became'],
  ['begin', 'began', 'begun'],
  ['break', 'broke', 'broken'],
  ['bring', 'brought'],
  ['buy', 'bought'],
  ['catch', 'caught'],
  ['choose', 'chose', 'chosen'],
  ['come', 'came'],
  ['do', 'does', 'did', 'done'],
  ['drink', 'drank', 'drunk'],
  ['drive', 'drove', 'driven'],
  ['eat', 'ate', 'eaten'],
  ['fall', 'fell', 'fallen'],
  ['feel', 'felt'],
  ['find', 'found'],
  ['fly', 'flew', 'flown'],
  ['forget', 'forgot', 'forgotten'],
  ['get', 'got', 'gotten'],
  ['give', 'gave', 'given'],
  ['go', 'goes', 'went', 'gone'],
  ['grow', 'grew', 'grown'],
  ['have', 'has', 'had'],
  ['hear', 'heard'],
  ['keep', 'kept'],
  ['know', 'knew', 'known'],
  ['leave', 'left'],
  ['lose', 'lost'],
  ['make', 'made'],
  ['meet', 'met'],
  ['pay', 'paid'],
  ['put'],
  ['run', 'ran'],
  ['say', 'said'],
  ['see', 'saw', 'seen'],
  ['sell', 'sold'],
  ['send', 'sent'],
  ['sit', 'sat'],
  ['sleep', 'slept'],
  ['speak', 'spoke', 'spoken'],
  ['spend', 'spent'],
  ['stand', 'stood'],
  ['take', 'took', 'taken'],
  ['teach', 'taught'],
  ['tell', 'told'],
  ['think', 'thought'],
  ['understand', 'understood'],
  ['wear', 'wore', 'worn'],
  ['win', 'won'],
  ['write', 'wrote', 'written'],
  ['good', 'better', 'best'],
  ['well', 'better', 'best'],
  ['bad', 'worse', 'worst'],
  ['far', 'farther', 'farthest', 'further', 'furthest'],
  ['much', 'more', 'most'],
  ['many', 'more', 'most'],
  ['little', 'less', 'least'],
];

const irregularFormsByWord = new Map<string, Set<string>>();
for (const group of irregularInflectionGroups) {
  const forms = new Set(group);
  for (const word of group) irregularFormsByWord.set(word, forms);
}

function englishWordForms(word: string, allowsDegreeInflections: boolean): Set<string> {
  const forms = new Set([word, ...(irregularFormsByWord.get(word) ?? [])]);
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
  if (allowsDegreeInflections && !irregularFormsByWord.has(word)) {
    addDegreeForms(word, forms);
  }

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
  const root = /(.)\1$/.test(base) ? base.slice(0, -1) : base;
  if (irregularFormsByWord.has(root)) return;

  forms.add(base);
  forms.add(`${base}e`);
  if (/(.)\1$/.test(base)) forms.add(base.slice(0, -1));
}

function makeSearchDocument(
  result: PassageSearchResult,
  searchFields: string[],
  allowsDegreeInflections = false,
  englishFields = searchFields
): PassageSearchDocument {
  const searchText = normalizeSearchText(searchFields.join(' '));
  const englishWords =
    normalizeSearchText(englishFields.join(' ')).match(/[a-z]+(?:['-][a-z]+)*/g) ??
    [];
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
    for (const token of uniqueAnnotationTokensIn(passage)) {
      const searchFields = annotationSearchFields(token);
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
          searchFields.all,
          /^(?:a|adj|ad|adv)\./i.test(token.gloss.trim()),
          searchFields.english
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
        makeSearchDocument(
          result,
          [entry.expression, entry.explanation],
          false,
          [entry.expression]
        )
      );
    }
  }
  return index;
}

function annotationSearchFields(token: InlineAnnotationToken): {
  all: string[];
  english: string[];
} {
  const english = [token.surface, token.headwordId ?? '', token.phrase ?? ''];
  return { all: [...english, token.gloss], english };
}

function matchesEnglishWords(
  query: string,
  document: PassageSearchDocument
): boolean {
  const queryWords = query.match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  if (queryWords.length === 0) return false;

  return document.englishWords.some((_, startIndex) => {
    if (startIndex + queryWords.length > document.englishWords.length) {
      return false;
    }
    return queryWords.every((queryWord, queryIndex) => {
      const documentWord = document.englishWords[startIndex + queryIndex];
      const queryForms = englishWordForms(queryWord, document.allowsDegreeInflections);
      const documentForms = englishWordForms(
        documentWord,
        document.allowsDegreeInflections
      );
      return Array.from(queryForms).some((form) => documentForms.has(form));
    });
  });
}

function matchesSearchQuery(
  query: string,
  document: PassageSearchDocument
): boolean {
  const chineseTerms = query.match(/[\u3400-\u9fff]+/g) ?? [];
  const englishTerms = query.match(/[a-z]+(?:['-][a-z]+)*/g) ?? [];
  if (chineseTerms.length === 0 && englishTerms.length === 0) return false;

  return (
    chineseTerms.every((term) => document.searchText.includes(term)) &&
    (englishTerms.length === 0 || matchesEnglishWords(query, document))
  );
}

export function searchPassages(
  index: PassageSearchIndex,
  query: string
): PassageSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return index
    .filter((document) => matchesSearchQuery(normalizedQuery, document))
    .map((document) => document.result);
}
