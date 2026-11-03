import { describe, expect, it } from 'vitest';
import { getDefaultSyllabusCatalog } from '../syllabus';
import {
  compilePassage,
  computeCorpusCoverage,
  DEMO_PASSAGES,
  validatePassage,
  type ExpansionEntry,
  type Passage,
} from './index';
import { CET4_BATCH_1_PASSAGES } from './cet4-batch-1';

const catalog = getDefaultSyllabusCatalog();

describe('Seam 2: corpus — 短文行间标注编译与语料校验', () => {
  it('同一篇短文内同一目标词或短语（含屈折变形）仅在首次出现处生成行间标注，跨不同短文首次出现时重新标注', () => {
    const passageA: Passage = {
      id: 'test-p1',
      indexLabel: 'NO. 01',
      tier: 'cet4-core',
      topic: '测试题材',
      titleZh: '测试短文一',
      titleEn: 'Test Passage One',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            {
              sentenceNumber: 1,
              english:
                'Mental health emerged first, and mental health can emerge again when strategies and strategy shift.',
              chinese:
                '心理健康首先浮现，而当策略发生转变时，心理健康还会再次浮现。',
            },
          ],
        },
      ],
      wordAnnotations: [
        { headwordId: 'emerge', gloss: 'v.浮现；出现；显露' },
        { headwordId: 'strategy', gloss: 'n.策略；战略；规划' },
        { headwordId: 'shift', gloss: 'v.转变；转移；更替' },
      ],
      phraseAnnotations: [
        {
          phrase: 'mental health',
          surface: 'mental health',
          gloss: '心理健康',
        },
      ],
      expansionEntries: [],
    };

    const passageB: Passage = {
      ...passageA,
      id: 'test-p2',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            {
              sentenceNumber: 1,
              english: 'New strategies emerge in mental health.',
              chinese: '新的策略在心理健康领域浮现。',
            },
          ],
        },
      ],
    };

    const compiledA = compilePassage(passageA, catalog);
    const tokensA = compiledA.paragraphs[0].sentences[0].tokens;
    const annotatedA = tokensA.filter((t) => t.type === 'annotation');

    // mental health 出现 2 次，仅第 1 次生成短语标注
    const phraseHitsA = annotatedA.filter((t) => t.category === 'phrase');
    expect(phraseHitsA).toHaveLength(1);
    expect(phraseHitsA[0].surface).toBe('Mental health');

    // emerge（emerged / emerge）出现 2 次，仅首次 emerged 标注
    const emergeHitsA = annotatedA.filter((t) => t.headwordId === 'emerge');
    expect(emergeHitsA).toHaveLength(1);
    expect(emergeHitsA[0].surface).toBe('emerged');

    // strategy（strategies / strategy）出现 2 次，仅首次 strategies 标注
    const strategyHitsA = annotatedA.filter((t) => t.headwordId === 'strategy');
    expect(strategyHitsA).toHaveLength(1);
    expect(strategyHitsA[0].surface).toBe('strategies');

    // 另一篇短文首次出现时重新生成行间标注
    const compiledB = compilePassage(passageB, catalog);
    const annotatedB = compiledB.paragraphs[0].sentences[0].tokens.filter(
      (t) => t.type === 'annotation'
    );
    expect(annotatedB.map((t) => t.surface)).toEqual([
      'strategies',
      'emerge',
      'mental health',
    ]);
  });

  it('多词短语与单词重合时优先整体标为黄色短语，且大纲词目仅在作为独立单词出现行间标注时才计入考纲覆盖率', () => {
    const passageWrappedOnly: Passage = {
      id: 'test-overlap-1',
      indexLabel: 'NO. 01',
      tier: 'cet4-core',
      topic: '测试题材',
      titleZh: '短语覆盖优先级测试',
      titleEn: 'Phrase Priority Test',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            {
              sentenceNumber: 1,
              english:
                'Stress is leading to anxiety, leading to deeper fatigue.',
              chinese: '压力正导致焦虑，并导致更深的疲惫。',
            },
          ],
        },
      ],
      wordAnnotations: [
        { headwordId: 'stress', gloss: 'n.压力；强调；重音' },
        { headwordId: 'lead¹', gloss: 'v.导致；引领；通向' },
        { headwordId: 'anxious', gloss: 'n.焦虑；忧虑；渴望' },
        { headwordId: 'fatigue', gloss: 'n.疲劳；劳累；厌倦' },
      ],
      phraseAnnotations: [
        { phrase: 'lead to', surface: 'leading to', gloss: '导致；引起' },
      ],
      expansionEntries: [],
    };

    const compiledWrapped = compilePassage(passageWrappedOnly, catalog);
    const tokens1 = compiledWrapped.paragraphs[0].sentences[0].tokens.filter(
      (t) => t.type === 'annotation'
    );

    // 第 1 处 leading to 整体标为短语，第 2 处重复短语不再拆出单词标注
    expect(
      tokens1.map((t) => ({ category: t.category, surface: t.surface }))
    ).toEqual([
      { category: 'high-frequency', surface: 'Stress' },
      { category: 'phrase', surface: 'leading to' },
      { category: 'regular', surface: 'anxiety' },
      { category: 'regular', surface: 'fatigue' },
    ]);

    // lead¹ 仅包裹在黄色短语内，不得计入考纲词目覆盖率
    expect(compiledWrapped.coveredHeadwordIds).not.toContain('lead¹');
    expect(compiledWrapped.coveredHeadwordIds).toEqual(
      expect.arrayContaining(['stress', 'anxious', 'fatigue'])
    );

    // 当另一句中 lead¹ 作为独立单词出现行间标注时，才计入考纲覆盖率
    const passageWithIndependentWord: Passage = {
      ...passageWrappedOnly,
      id: 'test-overlap-2',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            ...passageWrappedOnly.paragraphs[0].sentences,
            {
              sentenceNumber: 2,
              english: 'Clear goals lead teams forward.',
              chinese: '清晰的目标引领团队前行。',
            },
          ],
        },
      ],
    };

    const coverage = computeCorpusCoverage(
      [passageWrappedOnly, passageWithIndependentWord],
      catalog
    );
    expect(
      computeCorpusCoverage([passageWrappedOnly], catalog).coveredCoreIds.has(
        'lead¹'
      )
    ).toBe(false);
    expect(coverage.coveredCoreIds.has('lead¹')).toBe(true);
  });

  it('大纲词表中含空格的词目（如 according to、baby boom）可作为独立单词行间标注匹配，计入大纲词目覆盖率并通过语料校验', () => {
    const passage: Passage = {
      id: 'test-multiword-headword',
      indexLabel: 'NO. 01',
      tier: 'cet4-core',
      topic: '测试多词大纲词目',
      titleZh: '测试大纲词目匹配',
      titleEn: 'Test Multiword Syllabus Headwords',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            {
              sentenceNumber: 1,
              english:
                'According to recent data, the baby boom altered consumer habits.',
              chinese: '根据近期数据，婴儿潮改变了消费习惯。',
            },
          ],
        },
      ],
      wordAnnotations: [
        { headwordId: 'according to', gloss: 'prep.根据；按照' },
        { headwordId: 'recent', gloss: 'a.近期的；最新的' },
        { headwordId: 'data', gloss: 'n.数据；资料' },
        { headwordId: 'baby boom', gloss: 'n.婴儿潮；生育高峰' },
        { headwordId: 'alter', gloss: 'v.改变；更改' },
        { headwordId: 'consume', surface: 'consumer', gloss: 'a.消费者的；消费的' },
        { headwordId: 'habit', surface: 'habits', gloss: 'n.习惯；习性' },
      ],
      phraseAnnotations: [],
      expansionEntries: Array.from({ length: 12 }, (_, idx) => ({
        id: `exp-${idx + 1}`,
        expression: `term${idx + 1}`,
        explanation: `释义 ${idx + 1}`,
      })),
    };

    const result = validatePassage(passage, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage, catalog);
    expect(compiled.coveredHeadwordIds).toContain('according to');
    expect(compiled.coveredHeadwordIds).toContain('baby boom');

    const tokens = compiled.paragraphs[0].sentences[0].tokens;
    const accordingToken = tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'according to'
    );
    expect(accordingToken).toBeDefined();
    if (accordingToken && accordingToken.type === 'annotation') {
      expect(accordingToken.category).toBe('regular');
      expect(accordingToken.surface).toBe('According to');
    }
  });

  it('强制校验：非大纲非免注词必须显式标为超纲词，且严格检查分段句号、逐段译文、12–18 条拓展条目及词/短语释义体例', () => {
    const validExpansions: ExpansionEntry[] = Array.from(
      { length: 12 },
      (_, idx) => ({
        id: `exp-${idx + 1}`,
        expression: `term${idx + 1}/synonym${idx + 1}`,
        explanation: `重点拓展释义 ${idx + 1}`,
      })
    );

    const baseValidPassage: Passage = {
      id: 'test-validate-ok',
      indexLabel: 'NO. 01',
      tier: 'cet6-advanced',
      topic: '认知科学',
      titleZh: '大脑可塑性与深度学习',
      titleEn: 'Brain Plasticity and Deep Learning',
      paragraphs: [
        {
          paragraphNumber: 1,
          sentences: [
            {
              sentenceNumber: 1,
              english:
                'Today people foster neuroplasticity in daily life.',
              chinese: '如今人们在日常生活中培养神经可塑性。',
            },
          ],
        },
      ],
      wordAnnotations: [
        { headwordId: 'foster', gloss: 'v.培养；促进；助长' },
        {
          kind: 'out-of-syllabus',
          surface: 'neuroplasticity',
          lemma: 'neuroplasticity',
          gloss: 'n.神经可塑性；大脑重塑能力',
        },
      ],
      phraseAnnotations: [
        { phrase: 'in daily life', surface: 'in daily life', gloss: '在日常生活中' },
      ],
      expansionEntries: validExpansions,
    };

    expect(validatePassage(baseValidPassage, catalog).errors).toEqual([]);

    // 1. 漏标非大纲非免注生词 neuroplasticity -> 报错 unmarked-out-of-syllabus
    const missingOosResult = validatePassage(
      {
        ...baseValidPassage,
        wordAnnotations: [{ headwordId: 'foster', gloss: 'v.培养；促进；助长' }],
      },
      catalog
    );
    expect(missingOosResult.errors.map((e) => e.code)).toContain(
      'unmarked-out-of-syllabus'
    );

    // 2. 单词释义缺少词性或不足 2–3 个义项，或短语释义误带词性前缀 -> 报错
    const badGlossResult = validatePassage(
      {
        ...baseValidPassage,
        wordAnnotations: [
          { headwordId: 'foster', gloss: '培养' },
          {
            kind: 'out-of-syllabus',
            surface: 'neuroplasticity',
            lemma: 'neuroplasticity',
            gloss: 'n.神经可塑性',
          },
        ],
        phraseAnnotations: [
          {
            phrase: 'in daily life',
            surface: 'in daily life',
            gloss: 'phr.在日常生活中',
          },
        ],
      },
      catalog
    );
    expect(badGlossResult.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['invalid-word-gloss', 'invalid-phrase-gloss'])
    );

    // 3. 缺失中文译文 & 拓展条目不足 12 条 -> 报错
    const badStructureResult = validatePassage(
      {
        ...baseValidPassage,
        paragraphs: [
          {
            paragraphNumber: 1,
            sentences: [
              {
                sentenceNumber: 1,
                english: 'Today people foster neuroplasticity in daily life.',
                chinese: '',
              },
            ],
          },
        ],
        expansionEntries: validExpansions.slice(0, 8),
      },
      catalog
    );
    expect(badStructureResult.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'missing-sentence-translation',
        'invalid-expansion-count',
      ])
    );
  });

  it('内置示范短文（四级核心篇与含超纲词的六级进阶篇）100% 通过自动化语料规则校验', () => {
    expect(DEMO_PASSAGES.length).toBeGreaterThanOrEqual(2);

    const cet4Demo = DEMO_PASSAGES.find((p) => p.tier === 'cet4-core');
    const cet6Demo = DEMO_PASSAGES.find((p) => p.tier === 'cet6-advanced');
    expect(cet4Demo).toBeDefined();
    expect(cet6Demo).toBeDefined();

    for (const demo of DEMO_PASSAGES) {
      const result = validatePassage(demo, catalog);
      expect(result.errors).toEqual([]);
      expect(demo.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(demo.expansionEntries.length).toBeGreaterThanOrEqual(12);
      expect(demo.expansionEntries.length).toBeLessThanOrEqual(18);
    }

    const compiledCet4 = compilePassage(cet4Demo!, catalog);
    expect(compiledCet4.hasOutOfSyllabusWords).toBe(false);
    expect(compiledCet4.coveredHeadwordIds.length).toBeGreaterThanOrEqual(20);

    const compiledCet6 = compilePassage(cet6Demo!, catalog);
    expect(compiledCet6.hasOutOfSyllabusWords).toBe(true);
    const coveredCet6Stars = compiledCet6.coveredHeadwordIds.filter(
      (id) => catalog.byId.get(id)?.level === 'cet6'
    );
    expect(coveredCet6Stars.length).toBeGreaterThanOrEqual(12);
  });

  it('CET-4 核心篇 NO. 01 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = CET4_BATCH_1_PASSAGES.find((p) => p.indexLabel === 'NO. 01');
    expect(passage).toBeDefined();
    expect(passage!.tier).toBe('cet4-core');
    expect(passage!.topic).toBe('国际学术交流与跨文化适应');
    expect(passage!.titleEn).toBe(
      'Academic Exploration and Cultural Adaptation Abroad'
    );
    expect(passage!.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(passage!.paragraphs.length).toBeLessThanOrEqual(4);
    expect(passage!.expansionEntries.length).toBeGreaterThanOrEqual(12);
    expect(passage!.expansionEntries.length).toBeLessThanOrEqual(18);

    const wordCount = passage!.paragraphs.reduce(
      (sum, p) =>
        sum +
        p.sentences.reduce(
          (sSum, s) => sSum + s.english.trim().split(/\s+/).length,
          0
        ),
      0
    );
    expect(wordCount).toBeGreaterThanOrEqual(190);
    expect(wordCount).toBeLessThanOrEqual(280);

    const result = validatePassage(passage!, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage!, catalog);
    expect(compiled.hasOutOfSyllabusWords).toBe(false);
    expect(compiled.coveredHeadwordIds.length).toBeGreaterThanOrEqual(30);

    for (const id of compiled.coveredHeadwordIds) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(compiled.coveredHeadwordIds).not.toContain('ache');
    expect(compiled.coveredHeadwordIds).not.toContain('acid');
    expect(compiled.coveredHeadwordIds).not.toContain('ace');
    expect(compiled.coveredHeadwordIds).not.toContain('acre');
    expect(compiled.coveredHeadwordIds).not.toContain('abolish');
    expect(compiled.coveredHeadwordIds).not.toContain('accuse');
  });

  it('CET-4 核心篇 NO. 03 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = CET4_BATCH_1_PASSAGES.find((p) => p.indexLabel === 'NO. 03');
    expect(passage).toBeDefined();
    expect(passage!.tier).toBe('cet4-core');
    expect(passage!.topic).toBe('远古遗址考古与高海拔考察');
    expect(passage!.titleEn).toBe(
      'Ancient Ruins and Alpine Trail Exploration'
    );
    expect(passage!.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(passage!.paragraphs.length).toBeLessThanOrEqual(4);
    expect(passage!.expansionEntries.length).toBeGreaterThanOrEqual(12);
    expect(passage!.expansionEntries.length).toBeLessThanOrEqual(18);

    const wordCount = passage!.paragraphs.reduce(
      (sum, p) =>
        sum +
        p.sentences.reduce(
          (sSum, s) => sSum + s.english.trim().split(/\s+/).length,
          0
        ),
      0
    );
    expect(wordCount).toBeGreaterThanOrEqual(190);
    expect(wordCount).toBeLessThanOrEqual(280);

    const result = validatePassage(passage!, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage!, catalog);
    expect(compiled.hasOutOfSyllabusWords).toBe(false);
    expect(compiled.coveredHeadwordIds.length).toBeGreaterThanOrEqual(30);

    for (const id of compiled.coveredHeadwordIds) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(compiled.coveredHeadwordIds).not.toContain('algebra');
    expect(compiled.coveredHeadwordIds).not.toContain('ambulance');
    expect(compiled.coveredHeadwordIds).not.toContain('angel');
    expect(compiled.coveredHeadwordIds).not.toContain('ant');
    expect(compiled.coveredHeadwordIds).not.toContain('ambassador');
  });

  it('CET-4 核心篇 NO. 04 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = CET4_BATCH_1_PASSAGES.find((p) => p.indexLabel === 'NO. 04');
    expect(passage).toBeDefined();
    expect(passage!.tier).toBe('cet4-core');
    expect(passage!.topic).toBe('城市更新与宜居社区空间');
    expect(passage!.titleEn).toBe('Urban Renewal and Livable Community Spaces');
    expect(passage!.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(passage!.paragraphs.length).toBeLessThanOrEqual(4);
    expect(passage!.expansionEntries.length).toBeGreaterThanOrEqual(12);
    expect(passage!.expansionEntries.length).toBeLessThanOrEqual(18);

    const wordCount = passage!.paragraphs.reduce(
      (sum, p) =>
        sum +
        p.sentences.reduce(
          (sSum, s) => sSum + s.english.trim().split(/\s+/).length,
          0
        ),
      0
    );
    expect(wordCount).toBeGreaterThanOrEqual(190);
    expect(wordCount).toBeLessThanOrEqual(280);

    const result = validatePassage(passage!, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage!, catalog);
    expect(compiled.hasOutOfSyllabusWords).toBe(false);
    expect(compiled.coveredHeadwordIds.length).toBeGreaterThanOrEqual(30);

    for (const id of compiled.coveredHeadwordIds) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(compiled.coveredHeadwordIds).not.toContain('arithmetic');
    expect(compiled.coveredHeadwordIds).not.toContain('apparatus');
  });

  it('CET-4 核心篇 NO. 05 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = CET4_BATCH_1_PASSAGES.find((p) => p.indexLabel === 'NO. 05');
    expect(passage).toBeDefined();
    expect(passage!.tier).toBe('cet4-core');
    expect(passage!.topic).toBe('现代航天探索与天文普及');
    expect(passage!.titleEn).toBe('Deep Space Exploration and Astronomical Education');
    expect(passage!.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(passage!.paragraphs.length).toBeLessThanOrEqual(4);
    expect(passage!.expansionEntries.length).toBeGreaterThanOrEqual(12);
    expect(passage!.expansionEntries.length).toBeLessThanOrEqual(18);

    const wordCount = passage!.paragraphs.reduce(
      (sum, p) =>
        sum +
        p.sentences.reduce(
          (sSum, s) => sSum + s.english.trim().split(/\s+/).length,
          0
        ),
      0
    );
    expect(wordCount).toBeGreaterThanOrEqual(190);
    expect(wordCount).toBeLessThanOrEqual(280);

    const result = validatePassage(passage!, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage!, catalog);
    expect(compiled.hasOutOfSyllabusWords).toBe(false);
    expect(compiled.coveredHeadwordIds.length).toBeGreaterThanOrEqual(30);

    for (const id of compiled.coveredHeadwordIds) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(compiled.coveredHeadwordIds).not.toContain('ass');
    expect(compiled.coveredHeadwordIds).not.toContain('attic');
    expect(compiled.coveredHeadwordIds).not.toContain('avenue');
    expect(compiled.coveredHeadwordIds).not.toContain('automobile');
    expect(compiled.coveredHeadwordIds).not.toContain('athlete');
    expect(compiled.coveredHeadwordIds).not.toContain('attorney');
    expect(compiled.coveredHeadwordIds).not.toContain('asleep');
    expect(compiled.coveredHeadwordIds).not.toContain('ashore');
  });

  it('CET-4 核心短文库全量通过语料体例校验且词目无六级超纲（按 ADR 0004 解除批次固定绑定）', () => {
    expect(CET4_BATCH_1_PASSAGES).toHaveLength(20);

    for (const [idx, passage] of CET4_BATCH_1_PASSAGES.entries()) {
      expect(passage.tier).toBe('cet4-core');
      expect(passage.id).toBe(`cet4-b1-${String(idx + 1).padStart(3, '0')}`);
      expect(passage.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(passage.paragraphs.length).toBeLessThanOrEqual(4);
      expect(passage.expansionEntries.length).toBeGreaterThanOrEqual(12);
      expect(passage.expansionEntries.length).toBeLessThanOrEqual(18);

      const wordCount = passage.paragraphs.reduce(
        (sum, p) =>
          sum +
          p.sentences.reduce(
            (sSum, s) => sSum + s.english.trim().split(/\s+/).length,
            0
          ),
        0
      );
      expect(wordCount).toBeGreaterThanOrEqual(190);
      expect(wordCount).toBeLessThanOrEqual(280);

      const result = validatePassage(passage, catalog);
      if (result.errors.length > 0) {
        console.error(`Passage ${passage.id} validation errors:`, result.errors);
      }
      expect(result.errors).toEqual([]);

      const compiled = compilePassage(passage, catalog);
      for (const id of compiled.coveredHeadwordIds) {
        const entry = catalog.byId.get(id);
        expect(entry?.level).not.toBe('cet6');
      }
    }
  });
});
