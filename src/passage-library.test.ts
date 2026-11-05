import { describe, expect, it } from 'vitest';
import type {
  CompiledPassage,
  InlineAnnotationToken,
  PassageTopicCategory,
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
  topic: PassageTopicCategory,
  tokens: InlineAnnotationToken[]
): CompiledPassage {
  return {
    id,
    indexLabel: id,
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
  };
}

describe('passage library discovery', () => {
  const passages = [
    passage('cet4-ecology', '生态环境', [annotation('word:habit')]),
    passage('cet6-ai', '科技', [annotation('word:study')]),
  ];

  it('filters by the normalized topic category', () => {
    expect(
      filterPassages(passages, {
        kind: 'category',
        value: '科技',
      })
    ).toEqual([passages[1]]);
    expect(
      filterPassages([passages[0]], {
        kind: 'category',
        value: '科技',
      })
    ).toEqual([]);
    expect(filterPassages(passages, { kind: 'all' })).toEqual(passages);
  });

  it('counts unique inline annotation keys against the mastered set', () => {
    const item = passage('progress', '社会生活', [
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
      '科技',
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
        {
          ...annotation('word:box'),
          surface: 'box',
          gloss: 'n.盒子；箱子',
          headwordId: 'box',
        },
        {
          ...annotation('word:start'),
          surface: 'start',
          gloss: 'v.开始；启动',
          headwordId: 'start',
        },
        {
          ...annotation('word:part'),
          surface: 'part',
          gloss: 'n.部分；零件',
          headwordId: 'part',
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
    expect(searchPassages(index, 'boxes').map((result) => result.expression)).toContain(
      'box'
    );
    expect(searchPassages(index, 'art')).toEqual([]);
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

  it('matches common irregular forms to their annotated headword', () => {
    const item = passage('irregular-forms', '社会生活', [
      {
        ...annotation('word:good'),
        surface: 'good',
        gloss: 'a.好的；优良的',
        headwordId: 'good',
      },
      {
        ...annotation('word:go'),
        surface: 'go',
        gloss: 'v.去；前往',
        headwordId: 'go',
      },
    ]);
    const index = buildPassageSearchIndex([item]);

    expect(
      searchPassages(index, 'better').map((result) => result.expression)
    ).toContain('good');
    expect(
      searchPassages(index, 'best').map((result) => result.expression)
    ).toContain('good');
    expect(searchPassages(index, 'gooder')).toEqual([]);
    expect(searchPassages(index, 'went').map((result) => result.expression)).toContain(
      'go'
    );
  });
});
