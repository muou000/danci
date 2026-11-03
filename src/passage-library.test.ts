import { describe, expect, it } from 'vitest';
import type {
  CompiledPassage,
  InlineAnnotationToken,
} from './corpus';
import {
  buildPassageSearchIndex,
  filterPassages,
  getPassageProgress,
  searchPassages,
} from './passage-library';

function annotation(itemKey: string): InlineAnnotationToken {
  return {
    type: 'annotation',
    category: 'regular',
    itemKey,
    surface: itemKey,
    gloss: 'n.测试；示例',
  };
}

function passage(
  id: string,
  tier: CompiledPassage['tier'],
  topic: string,
  tokens: InlineAnnotationToken[]
): CompiledPassage {
  return {
    id,
    indexLabel: id,
    tier,
    topic,
    titleZh: id,
    titleEn: id,
    paragraphs: [
      {
        paragraphNumber: 1,
        sentences: [
          {
            sentenceNumber: 1,
            circledNumber: '①',
            english: 'Example.',
            chinese: '示例。',
            tokens,
          },
        ],
      },
    ],
    expansionEntries: [],
    coveredHeadwordIds: [],
    hasOutOfSyllabusWords: false,
  };
}

describe('passage library discovery', () => {
  const passages = [
    passage('cet4-ecology', 'cet4-core', '绿色校园与消费转型', [annotation('word:habit')]),
    passage('cet6-ai', 'cet6-advanced', '算法生态与认知自主', [annotation('word:study')]),
  ];

  it('filters by shared topic family and exact passage topic together', () => {
    expect(filterPassages(passages, 'cet6-advanced', '科技人工智能')).toEqual([
      passages[1],
    ]);
    expect(filterPassages(passages, 'cet4-core', '科技人工智能')).toEqual([]);
    expect(
      filterPassages(passages, 'cet4-core', 'topic:绿色校园与消费转型')
    ).toEqual([passages[0]]);
    expect(filterPassages(passages, 'all', 'all')).toEqual(passages);
  });

  it('counts unique inline annotation keys against the mastered set', () => {
    const item = passage('progress', 'cet4-core', '测试', [
      annotation('word:habit'),
      annotation('word:habit'),
      annotation('phrase:daily habit'),
      annotation('word:study'),
    ]);

    expect(getPassageProgress(item, new Set(['word:habit']))).toEqual({
      masteredCount: 1,
      remainingCount: 2,
      totalCount: 3,
    });
  });

  it('finds annotation inflections and Chinese expansion glosses across the corpus', () => {
    const searchablePassage = passage(
      'searchable',
      'cet6-advanced',
      '科技人工智能',
      [
        {
          ...annotation('word:study'),
          surface: 'studied',
          gloss: 'v.学习；研究',
          headwordId: 'study',
        },
        {
          ...annotation('word:fast'),
          surface: 'fast',
          gloss: 'a.快速的；迅速的',
          headwordId: 'fast',
        },
      ]
    );
    searchablePassage.expansionEntries = [
      {
        id: 'exp-1',
        expression: 'take into account',
        explanation: '考虑；重视',
      },
    ];
    const index = buildPassageSearchIndex([searchablePassage]);

    expect(searchPassages(index, 'studies').map((result) => result.expression)).toContain(
      'study'
    );
    expect(searchPassages(index, 'faster').map((result) => result.expression)).toContain(
      'fast'
    );
    expect(searchPassages(index, 'fastest').map((result) => result.expression)).toContain(
      'fast'
    );
    expect(searchPassages(index, '研究').map((result) => result.expression)).toContain(
      'study'
    );
    expect(searchPassages(index, '考虑').map((result) => result.kind)).toContain(
      'expansion'
    );
    expect(
      searchPassages(index, 'take into account').map((result) => result.expression)
    ).toContain('take into account');
  });
});
