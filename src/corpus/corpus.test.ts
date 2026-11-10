import { describe, expect, it } from 'vitest';
import { getDefaultSyllabusCatalog } from '../syllabus';
import {
  compilePassage,
  computeCorpusCoverage,
  validatePassage,
  type CompiledPassage,
  type ExpansionEntry,
  type InlineAnnotationToken,
  type Passage,
} from './index';
import { PASSAGES } from './passages';

const catalog = getDefaultSyllabusCatalog();

function annotationTokensIn(passage: CompiledPassage): InlineAnnotationToken[] {
  const tokens: InlineAnnotationToken[] = [];
  for (const paragraph of passage.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'annotation') tokens.push(token);
      }
    }
  }
  return tokens;
}

function coveredHeadwordIdsIn(passage: CompiledPassage): string[] {
  return Array.from(
    new Set(
      annotationTokensIn(passage).flatMap((token) =>
        token.headwordId ? [token.headwordId] : []
      )
    )
  );
}

function hasOutOfSyllabusWordsIn(passage: CompiledPassage): boolean {
  return annotationTokensIn(passage).some(
    (token) => token.category === 'out-of-syllabus'
  );
}

describe('Seam 2: corpus — 短文行间标注编译与语料校验', () => {
  it('同一篇短文内同一目标词或短语（含屈折变形）仅在首次出现处生成行间标注，跨不同短文首次出现时重新标注', () => {
    const passageA: Passage = {
      id: 'test-p1',
      indexLabel: 'NO. 01',
      topic: '社会生活',
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
    expect(compiledA).not.toHaveProperty('coveredHeadwordIds');
    expect(compiledA).not.toHaveProperty('hasOutOfSyllabusWords');
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
      topic: '社会生活',
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
    expect(coveredHeadwordIdsIn(compiledWrapped)).not.toContain('lead¹');
    expect(coveredHeadwordIdsIn(compiledWrapped)).toEqual(
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
      topic: '教育文化',
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
    expect(coveredHeadwordIdsIn(compiled)).toContain('according to');
    expect(coveredHeadwordIdsIn(compiled)).toContain('baby boom');

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
      topic: '科技',
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

  it('示范短文整合至正式短文列表（NO. 21 与 NO. 22）100% 通过自动化语料规则校验', () => {
    const cet4Demo = PASSAGES.find((p) => p.id === 'passage-021');
    const cet6Demo = PASSAGES.find((p) => p.id === 'passage-022');
    expect(cet4Demo).toBeDefined();
    expect(cet6Demo).toBeDefined();

    for (const demo of [cet4Demo!, cet6Demo!]) {
      const result = validatePassage(demo, catalog);
      expect(result.errors).toEqual([]);
      expect(demo.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(demo.expansionEntries.length).toBeGreaterThanOrEqual(12);
      expect(demo.expansionEntries.length).toBeLessThanOrEqual(18);
    }

    const compiledCet4 = compilePassage(cet4Demo!, catalog);
    expect(hasOutOfSyllabusWordsIn(compiledCet4)).toBe(false);
    expect(coveredHeadwordIdsIn(compiledCet4).length).toBeGreaterThanOrEqual(20);

    const compiledCet6 = compilePassage(cet6Demo!, catalog);
    expect(hasOutOfSyllabusWordsIn(compiledCet6)).toBe(true);
    const coveredCet6Stars = coveredHeadwordIdsIn(compiledCet6).filter(
      (id) => catalog.byId.get(id)?.level === 'cet6'
    );
    expect(coveredCet6Stars.length).toBeGreaterThanOrEqual(12);
  });

  it('CET-4 核心篇 NO. 01 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 01');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ache');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('acid');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ace');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('acre');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('abolish');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('accuse');

    // 验证场景逻辑、地道选词及语法搭配改进
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'acquaint themselves with safety procedures'
    );
    expect(passage!.paragraphs[1].sentences[0].english).not.toContain(
      'library rules'
    );
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'visit an international university'
    );
    expect(passage!.paragraphs[0].sentences[0].english).not.toContain(
      'visit an international academy'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'guide young researchers through difficult challenges'
    );
    expect(passage!.paragraphs[1].sentences[3].english).not.toContain(
      'accompany learners'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'accustom themselves to community life'
    );
    expect(passage!.paragraphs[2].sentences[0].english).not.toContain(
      'accustom them to'
    );

    // 验证解除过度修饰机械堆砌
    expect(passage!.paragraphs[0].sentences[0].english).not.toContain(
      'acute curiosity'
    );
    expect(passage!.paragraphs[0].sentences[1].english).not.toContain(
      'abundant knowledge'
    );
    expect(passage!.paragraphs[0].sentences[3].english).not.toContain(
      'strange accent'
    );
  });

  it('CET-4 核心篇 NO. 02 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 02');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Civil Aviation Passenger Services and In-Flight Health Safeguards'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('adjective');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('adverb');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('album');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('agriculture');

    // 验证修正地道搭配与拓展条目疏漏
    expect(passage!.paragraphs[0].sentences[1].english).toContain('great comfort');
    expect(passage!.paragraphs[0].sentences[1].english).not.toContain('obvious comfort');
    expect(passage!.paragraphs[1].sentences[1].english).toContain('an elderly passenger');
    expect(passage!.paragraphs[1].sentences[1].english).not.toContain('an elder passenger');
    expect(passage!.paragraphs[1].sentences[3].english).toContain('ground medical personnel');
    expect(passage!.paragraphs[1].sentences[3].english).not.toContain('ground medical agents');
    expect(passage!.expansionEntries.map((e) => e.expression)).not.toContain(
      'take advantage of/make use of'
    );
    expect(passage!.expansionEntries.map((e) => e.expression)).toContain(
      'advanced aircraft/cutting-edge'
    );
  });

  it('CET-4 核心篇 NO. 03 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 03');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('历史文化');
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('algebra');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ambulance');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('angel');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ant');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ambassador');

    // 验证常识因果逻辑修正与熟词僻义/同义替换拓展质量
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'thin air sharply reduced available oxygen'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'drained their strength'
    );
    expect(coveredHeadwordIdsIn(compiled)).toContain('thin');
    expect(coveredHeadwordIdsIn(compiled)).toContain('drain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('strong');
    expect(passage!.expansionEntries.map((e) => e.expression)).not.toContain(
      'soil layer'
    );
    expect(passage!.expansionEntries.map((e) => e.expression)).toContain(
      'deep layer/stratum/tier'
    );
    expect(passage!.expansionEntries.map((e) => e.expression)).toContain(
      'remote/distant/isolated'
    );
    expect(passage!.expansionEntries.map((e) => e.expression)).toContain(
      'physical evidence vs mental'
    );
  });

  it('CET-4 核心篇 NO. 04 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 04');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词及修饰不当词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('arithmetic');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('apparatus');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('antique');

    // 验证地道修饰与核心词覆盖
    expect(coveredHeadwordIdsIn(compiled)).toContain('classic');
    const p1s2Historic = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'history'
    );
    expect(p1s2Historic).toBeDefined();
    if (p1s2Historic && p1s2Historic.type === 'annotation') {
      expect(p1s2Historic.surface).toBe('historic');
      expect(p1s2Historic.gloss).toBe('a.历史性的；有历史意义的');
    }
  });

  it('CET-4 核心篇 NO. 05 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 05');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('科技');
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词与不地道词汇
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ass');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('attic');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('avenue');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('automobile');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('athlete');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('attorney');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('asleep');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ashore');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('attack');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('assume');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('attain');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('authority');

    // 验证核心目标词自然覆盖与语境词性匹配
    expect(coveredHeadwordIdsIn(compiled)).toContain('orbit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('impact');
    expect(coveredHeadwordIdsIn(compiled)).toContain('agent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('expect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('yield');
    const p1s1Astro = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'astronomy'
    );
    expect(p1s1Astro).toBeDefined();
    if (p1s1Astro && p1s1Astro.type === 'annotation') {
      expect(p1s1Astro.gloss.startsWith('n.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 06 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 06');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Household Budgeting, Smart Spending, and Financial Resilience'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词与荒诞搭配
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('baby boom');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bacon');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bake');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bacteria');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('badminton');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('balloon');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bamboo');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('fence');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bang');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('baggage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('badge');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ballet');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('balcony');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('axe');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('timber');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bandage');

    // 验证核心目标词自然覆盖与语境词性匹配
    expect(coveredHeadwordIdsIn(compiled)).toContain('bachelor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('budget');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bait');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bankrupt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('banknote');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cushion');
    expect(coveredHeadwordIdsIn(compiled)).toContain('withstand');
    expect(coveredHeadwordIdsIn(compiled)).toContain('backup');
    expect(coveredHeadwordIdsIn(compiled)).toContain('setback');
    expect(coveredHeadwordIdsIn(compiled)).toContain('reward');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('award');

    // 验证地道选词、消除语境割裂与名词强行堆叠
    expect(passage!.paragraphs[0].sentences[0].english).toContain("bachelor's degree");
    expect(passage!.paragraphs[0].sentences[0].english).not.toContain('young bachelor leaves');
    expect(passage!.paragraphs[0].sentences[1].english).not.toContain('household expenses');
    expect(passage!.paragraphs[1].sentences[1].english).not.toContain('commercial awards');
    expect(passage!.paragraphs[1].sentences[1].english).not.toContain('bargain value');

    // 验证各句法位置词性匹配
    const p3s1Household = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'household'
    );
    expect(p3s1Household).toBeDefined();
    if (p3s1Household && p3s1Household.type === 'annotation') {
      expect(p3s1Household.gloss.startsWith('n.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 07 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 07');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Coastal Wetland Restoration and Migratory Habitat Conservation'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次单一字母拼凑词与不地道搭配
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('barber');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('beard');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('baseball');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('barrel');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('beast');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('belly');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bargain');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('battalion');

    // 验证核心目标词自然覆盖与语境词性匹配
    expect(coveredHeadwordIdsIn(compiled)).toContain('marsh');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tide');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shelter');
    expect(coveredHeadwordIdsIn(compiled)).toContain('migrate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('breed');
    expect(coveredHeadwordIdsIn(compiled)).toContain('survey');
    expect(coveredHeadwordIdsIn(compiled)).toContain('soil');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sample');
    expect(coveredHeadwordIdsIn(compiled)).toContain('track');
    expect(coveredHeadwordIdsIn(compiled)).toContain('thrive');
    expect(coveredHeadwordIdsIn(compiled)).toContain('harmony');

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Scenic = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'scene'
    );
    expect(p1s1Scenic).toBeDefined();
    if (p1s1Scenic && p1s1Scenic.type === 'annotation') {
      expect(p1s1Scenic.gloss.startsWith('a.')).toBe(true);
    }

    const p1s1Vital = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'vital'
    );
    expect(p1s1Vital).toBeDefined();
    if (p1s1Vital && p1s1Vital.type === 'annotation') {
      expect(p1s1Vital.gloss.startsWith('a.')).toBe(true);
      expect(p1s1Vital.gloss).toContain('至关重要');
    }
  });

  it('CET-4 核心篇 NO. 08 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 08');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('健康医疗');
    expect(passage!.titleEn).toBe(
      'Biomedical Innovation, Gene Research, and Ethical Governance'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次拼凑词及不自然词汇
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bitch');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blade');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bleed');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blanket');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bench');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('beverage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('biscuit');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blackboard');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blast');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bin');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('berry');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('Bible');

    // 验证核心目标词自然覆盖与语境词性匹配
    expect(coveredHeadwordIdsIn(compiled)).toContain('biology');
    expect(coveredHeadwordIdsIn(compiled)).toContain('biochemistry');
    expect(coveredHeadwordIdsIn(compiled)).toContain('biotechnology');
    expect(coveredHeadwordIdsIn(compiled)).toContain('gene');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bind');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dignity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bias');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dilemma');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hazard');
    expect(coveredHeadwordIdsIn(compiled)).toContain('supervise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('blend');
    expect(coveredHeadwordIdsIn(compiled)).toContain('insight');

    // 验证语境词性与句法功能匹配
    const p2s2Clinical = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'clinic'
    );
    expect(p2s2Clinical).toBeDefined();
    if (p2s2Clinical && p2s2Clinical.type === 'annotation') {
      expect(p2s2Clinical.surface).toBe('clinical');
      expect(p2s2Clinical.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Regulatory = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'regulate'
    );
    expect(p3s1Regulatory).toBeDefined();
    if (p3s1Regulatory && p3s1Regulatory.type === 'annotation') {
      expect(p3s1Regulatory.surface).toBe('regulatory');
      expect(p3s1Regulatory.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 09 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 09');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('历史文化');
    expect(passage!.titleEn).toBe(
      'Revitalizing Traditional Rural Crafts Through Brand Innovation'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧版拼凑词与荒诞搭配
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bomb');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bowel');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('boxing');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('brandy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blouse');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('blond');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('boast');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('brag');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bounce');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bonus');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('brake');

    // 验证核心目标词自然覆盖与语境词性匹配
    expect(coveredHeadwordIdsIn(compiled)).toContain('valley');
    expect(coveredHeadwordIdsIn(compiled)).toContain('timber');
    expect(coveredHeadwordIdsIn(compiled)).toContain('weave');
    expect(coveredHeadwordIdsIn(compiled)).toContain('craft');
    expect(coveredHeadwordIdsIn(compiled)).toContain('master');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dye');
    expect(coveredHeadwordIdsIn(compiled)).toContain('brass');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bolt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('durable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('brand');
    expect(coveredHeadwordIdsIn(compiled)).toContain('booth');
    expect(coveredHeadwordIdsIn(compiled)).toContain('revenue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('flourish');

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Provincial = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'province'
    );
    expect(p1s1Provincial).toBeDefined();
    if (p1s1Provincial && p1s1Provincial.type === 'annotation') {
      expect(p1s1Provincial.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Daily = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'daily'
    );
    expect(p1s2Daily).toBeDefined();
    if (p1s2Daily && p1s2Daily.type === 'annotation') {
      expect(p1s2Daily.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Production = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'produce'
    );
    expect(p2s1Production).toBeDefined();
    if (p2s1Production && p2s1Production.type === 'annotation') {
      expect(p2s1Production.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Cotton = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'cotton'
    );
    expect(p2s2Cotton).toBeDefined();
    if (p2s2Cotton && p2s2Cotton.type === 'annotation') {
      expect(p2s2Cotton.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 10 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 10');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Youth Entrepreneurship and Financial Budget Management'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bride');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bridegroom');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('broom');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bucket');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bull');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('buffet');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('brunch');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bribe');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('brutal');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bulb');

    // 验证创业与财务预算管理主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'disciplined financial budget management'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'severe cash deficit'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'speculative market bubbles'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'bulk discounts on computer hardware'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'transparent accounting methods'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('budget');
    expect(coveredHeadwordIdsIn(compiled)).toContain('venture');
    expect(coveredHeadwordIdsIn(compiled)).toContain('capital');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deficit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bulk');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bubble');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hardware');
    expect(coveredHeadwordIdsIn(compiled)).toContain('transparent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sustain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('reputation');

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Commercial = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'commerce'
    );
    expect(p1s1Commercial).toBeDefined();
    if (p1s1Commercial && p1s1Commercial.type === 'annotation') {
      expect(p1s1Commercial.surface).toBe('commercial');
      expect(p1s1Commercial.gloss.startsWith('a.')).toBe(true);
    }

    const p1s1Budget = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'budget'
    );
    expect(p1s1Budget).toBeDefined();
    if (p1s1Budget && p1s1Budget.type === 'annotation') {
      expect(p1s1Budget.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 11 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 11');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Urban Canal Ecological Restoration and Youth Volunteer Campaign'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次单一字母拼凑词与不自然搭配
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cabbage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cabinet');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cab');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bumper');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bully');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bystander');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('butcher');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('calf');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('camel');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('bullet');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('calorie');

    // 验证运河生态修复与志愿行动主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'severe neglect, as thick mud and floating trash choked the narrow channel'
    );
    expect(passage!.paragraphs[0].sentences[3].english).toContain(
      'bypass the wait and seek initial help from generous merchants'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'tied recyclable plastics into tidy bundles'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'inspect dissolved oxygen'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'delicate wild plants flourish in the renewed habitat'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'watching water birds soar into flight'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'Neither harsh weather nor physical fatigue'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('canal');
    expect(coveredHeadwordIdsIn(compiled)).toContain('restore');
    expect(coveredHeadwordIdsIn(compiled)).toContain('channel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('mud');
    expect(coveredHeadwordIdsIn(compiled)).toContain('steep');
    expect(coveredHeadwordIdsIn(compiled)).toContain('task');
    expect(coveredHeadwordIdsIn(compiled)).toContain('rubbish');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sample');
    expect(coveredHeadwordIdsIn(compiled)).toContain('oxygen');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dissolve');
    expect(coveredHeadwordIdsIn(compiled)).toContain('monitor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('flourish');
    expect(coveredHeadwordIdsIn(compiled)).toContain('habitat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('butterfly');
    expect(coveredHeadwordIdsIn(compiled)).toContain('soar');
    expect(coveredHeadwordIdsIn(compiled)).toContain('calling');
    expect(coveredHeadwordIdsIn(compiled)).toContain('heritage');

    // 验证修饰名词的形容词语境词性匹配
    const p1s2Ecological = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'ecology'
    );
    expect(p1s2Ecological).toBeDefined();
    if (p1s2Ecological && p1s2Ecological.type === 'annotation') {
      expect(p1s2Ecological.gloss.startsWith('a.')).toBe(true);
    }

    const p1s4Administrative = compiled.paragraphs[0].sentences[3].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'administer'
    );
    expect(p1s4Administrative).toBeDefined();
    if (p1s4Administrative && p1s4Administrative.type === 'annotation') {
      expect(p1s4Administrative.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 12 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 12');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Climate-Resilient Agriculture and Green Cold-Chain Logistics'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('carpenter');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('ceiling');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('castle');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('candle');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cellar');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cartoon');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('carriage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('captain');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cave');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cell');

    // 验证气候适应型农业与冷链物流主题的地道选词与自然搭配（消除 cease damage、cold carriers 生造与 packing 重复）
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'temperatures exceed forty degrees Celsius'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'To protect vulnerable crops from continuous heat damage'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'modern storage facility capable of capturing clean solar energy'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'preserves freshly harvested produce from severe field heat'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'placing them into durable cardboard cases'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'transferred swiftly into chilled cargo vans'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'Transport teams from the regional carrier monitor temperature data'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'caters to university canteens'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'agricultural career both sustainable and rewarding'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('Celsius');
    expect(coveredHeadwordIdsIn(compiled)).toContain('caution');
    expect(coveredHeadwordIdsIn(compiled)).toContain('carbon');
    expect(coveredHeadwordIdsIn(compiled)).toContain('drought');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cancel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('capital');
    expect(coveredHeadwordIdsIn(compiled)).toContain('solar');
    expect(coveredHeadwordIdsIn(compiled)).toContain('capacity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('warehouse');
    expect(coveredHeadwordIdsIn(compiled)).toContain('preserve');
    expect(coveredHeadwordIdsIn(compiled)).toContain('carrot');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cardboard');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cargo');
    expect(coveredHeadwordIdsIn(compiled)).toContain('van');
    expect(coveredHeadwordIdsIn(compiled)).toContain('carrier');
    expect(coveredHeadwordIdsIn(compiled)).toContain('region');
    expect(coveredHeadwordIdsIn(compiled)).toContain('canteen');
    expect(coveredHeadwordIdsIn(compiled)).toContain('catalog');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cater');
    expect(coveredHeadwordIdsIn(compiled)).toContain('revenue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('career');
    expect(coveredHeadwordIdsIn(compiled)).toContain('celebrate');

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Carbon = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'carbon'
    );
    expect(p1s1Carbon).toBeDefined();
    if (p1s1Carbon && p1s1Carbon.type === 'annotation') {
      expect(p1s1Carbon.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Solar = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'solar'
    );
    expect(p1s2Solar).toBeDefined();
    if (p1s2Solar && p1s2Solar.type === 'annotation') {
      expect(p1s2Solar.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Cardboard = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'cardboard'
    );
    expect(p2s1Cardboard).toBeDefined();
    if (p2s1Cardboard && p2s1Cardboard.type === 'annotation') {
      expect(p2s1Cardboard.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Commercial = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'commerce'
    );
    expect(p3s3Commercial).toBeDefined();
    if (p3s3Commercial && p3s3Commercial.type === 'annotation') {
      expect(p3s3Commercial.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 13 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 13');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('历史文化');
    expect(passage!.titleEn).toBe(
      'Industrial Heritage Regeneration and Low-Carbon Community Renewal'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词（消除 chalk、cereal 等拼凑）
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chalk');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cereal');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chew');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chef');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cheap');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cheat');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cheek');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('champagne');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chess');

    // 验证工业建筑遗产更新与低碳社区活化主题的地道选词与自然搭配（消除 chaotic destruction、chalk、并列空间割裂及 cheer chapter 语病）
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'durable brick architecture and a towering chimney'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'the threat of structural collapse and permanent ruin'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'drafted a historic restoration charter'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'reinforce aging brick walls without altering their historic appearance'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'heating test samples in experimental ovens to verify chemical stability and structural strength'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'chart down to the centimeter'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'creative design workshops, dynamic studios, and spacious exhibition galleries'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'seal out the winter chill'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'local citizens cheered the transformation and celebrated an encouraging new community chapter'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('century');
    expect(coveredHeadwordIdsIn(compiled)).toContain('industry');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pioneer');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chimney');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cease');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collapse');
    expect(coveredHeadwordIdsIn(compiled)).toContain('ruin');
    expect(coveredHeadwordIdsIn(compiled)).toContain('charter');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chairperson');
    expect(coveredHeadwordIdsIn(compiled)).toContain('charm');
    expect(coveredHeadwordIdsIn(compiled)).toContain('character');
    expect(coveredHeadwordIdsIn(compiled)).toContain('reinforce');
    expect(coveredHeadwordIdsIn(compiled)).toContain('alter');
    expect(coveredHeadwordIdsIn(compiled)).toContain('laboratory');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cement');
    expect(coveredHeadwordIdsIn(compiled)).toContain('centigrade');
    expect(coveredHeadwordIdsIn(compiled)).toContain('centimeter');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chart');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chemistry');
    expect(coveredHeadwordIdsIn(compiled)).toContain('certificate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('workshop');
    expect(coveredHeadwordIdsIn(compiled)).toContain('gallery');
    expect(coveredHeadwordIdsIn(compiled)).toContain('channel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cherish');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chill');
    expect(coveredHeadwordIdsIn(compiled)).toContain('ceremony');
    expect(coveredHeadwordIdsIn(compiled)).toContain('champion');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pride');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cheer');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chapter');

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Industrial = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'industry'
    );
    expect(p1s1Industrial).toBeDefined();
    if (p1s1Industrial && p1s1Industrial.type === 'annotation') {
      expect(p1s1Industrial.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Permanent = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'permanent'
    );
    expect(p1s2Permanent).toBeDefined();
    if (p1s2Permanent && p1s2Permanent.type === 'annotation') {
      expect(p1s2Permanent.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Testing = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'test'
    );
    expect(p2s1Testing).toBeDefined();
    if (p2s1Testing && p2s1Testing.type === 'annotation') {
      expect(p2s1Testing.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Chemical = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'chemistry'
    );
    expect(p2s2Chemical).toBeDefined();
    if (p2s2Chemical && p2s2Chemical.type === 'annotation') {
      expect(p2s2Chemical.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Design = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'design'
    );
    expect(p3s1Design).toBeDefined();
    if (p3s1Design && p3s1Design.type === 'annotation') {
      expect(p3s1Design.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Spacious = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'space'
    );
    expect(p3s1Spacious).toBeDefined();
    if (p3s1Spacious && p3s1Spacious.type === 'annotation') {
      expect(p3s1Spacious.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 14 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 14');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Civil Contract Dispute Mediation and Community Legal Clinic Services'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cholesterol');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chopstick');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cigar');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cigarette');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('choke');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('circuit');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chore');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chin');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('china');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clay');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('circus');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clap');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('claw');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chorus');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('Christ');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('climb');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cliff');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('climate');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('climax');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('chip');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('civilian');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clever');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('absolute');

    // 验证民商事合同纠纷调解与社区法律诊所便民服务主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'frequently click electronic contract terms'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'merchant cancellation policies clash with consumer expectations'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'community legal clinic'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'classifying disputed claims according to established civil laws'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'examine transaction records and message histories for factual clues'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'clear-cut administrative standards'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'balanced compromise'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'mutually binding agreement that settles outstanding damages'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'throughout the local community'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('clause');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clarity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clash');
    expect(coveredHeadwordIdsIn(compiled)).toContain('claim');
    expect(coveredHeadwordIdsIn(compiled)).toContain('client');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clerk');
    expect(coveredHeadwordIdsIn(compiled)).toContain('classify');
    expect(coveredHeadwordIdsIn(compiled)).toContain('classic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clear-cut');
    expect(coveredHeadwordIdsIn(compiled)).toContain('circumstance');
    expect(coveredHeadwordIdsIn(compiled)).toContain('court¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contract¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('civil');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clinic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('clue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('choice');
    expect(coveredHeadwordIdsIn(compiled)).toContain('competent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dispute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('arise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('party');
    expect(coveredHeadwordIdsIn(compiled)).toContain('arbitrary');
    expect(coveredHeadwordIdsIn(compiled)).toContain('resort¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compromise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bind');
    expect(coveredHeadwordIdsIn(compiled)).toContain('settle');
    expect(coveredHeadwordIdsIn(compiled)).toContain('damage');
    expect(coveredHeadwordIdsIn(compiled)).toContain('certain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('trial');
    expect(coveredHeadwordIdsIn(compiled)).toContain('public');
    expect(coveredHeadwordIdsIn(compiled)).toContain('welfare');
    expect(coveredHeadwordIdsIn(compiled)).toContain('harmony');
    expect(coveredHeadwordIdsIn(compiled)).toContain('local');

    // 验证修饰名词的形容词语境词性匹配
    const p3s2Competent = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'competent'
    );
    expect(p3s2Competent).toBeDefined();
    if (p3s2Competent && p3s2Competent.type === 'annotation') {
      expect(p3s2Competent.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Public = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'public'
    );
    expect(p3s3Public).toBeDefined();
    if (p3s3Public && p3s3Public.type === 'annotation') {
      expect(p3s3Public.gloss.startsWith('a.')).toBe(true);
    }

    const p1s1Electronic = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'electron'
    );
    expect(p1s1Electronic).toBeDefined();
    if (p1s1Electronic && p1s1Electronic.type === 'annotation') {
      expect(p1s1Electronic.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Corporate = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'corporation'
    );
    expect(p2s2Corporate).toBeDefined();
    if (p2s2Corporate && p2s2Corporate.type === 'annotation') {
      expect(p2s2Corporate.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Admin = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'administer'
    );
    expect(p2s3Admin).toBeDefined();
    if (p2s3Admin && p2s3Admin.type === 'annotation') {
      expect(p2s3Admin.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Economic = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'economy'
    );
    expect(p2s3Economic).toBeDefined();
    if (p2s3Economic && p2s3Economic.type === 'annotation') {
      expect(p2s3Economic.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Binding = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'bind'
    );
    expect(p3s2Binding).toBeDefined();
    if (p3s2Binding && p3s2Binding.type === 'annotation') {
      expect(p3s2Binding.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('CET-4 核心篇 NO. 15 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 15');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Modern Port Commerce, Maritime Logistics, and Regional Economic Cooperation'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('coarse');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cloth');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('collar');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clothe');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('coil');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('comma');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('colon');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clone');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clown');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('comedy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('coach');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('comb');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clumsy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clip');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('clockwise');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cock');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cling');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('code');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('conduct');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('column');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('collapse');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('comfort');

    // 验证现代化港口商贸、海运物流与区域多边合作主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'international commerce flourishes as massive cargo vessels dock'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'cranes lift heavy container boxes with steady precision'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'digital management systems to track continuous freight flows and prevent sudden warehouse breakdowns'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'At a nearby conference center, a regional trade commission holds regular meetings'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'commence duty talks and remove artificial trade barriers'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'collect accurate statistics and deliver insightful comments'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'combining financial resources is vital to combat severe market risks'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'These collective efforts strengthen regional cohesion, bringing sustained economic stability and genuine security'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'ensure transparent customs inspections and minimize schedule delays'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'establishing a durable pillar of shared growth'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('coast');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commerce');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commodity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collaborate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collective');
    expect(coveredHeadwordIdsIn(compiled)).toContain('committee');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commission');
    expect(coveredHeadwordIdsIn(compiled)).toContain('combine');
    expect(coveredHeadwordIdsIn(compiled)).toContain('combat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('coherent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cohesion');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commence');
    expect(coveredHeadwordIdsIn(compiled)).toContain('command');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('comment');
    expect(coveredHeadwordIdsIn(compiled)).toContain('crane');
    expect(coveredHeadwordIdsIn(compiled)).toContain('coal');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bulk');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dock');
    expect(coveredHeadwordIdsIn(compiled)).toContain('colleague');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cargo');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vessel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deliver');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vital');
    expect(coveredHeadwordIdsIn(compiled)).toContain('steady');
    expect(coveredHeadwordIdsIn(compiled)).toContain('precise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('authority');
    expect(coveredHeadwordIdsIn(compiled)).toContain('maintain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('order');
    expect(coveredHeadwordIdsIn(compiled)).toContain('freight');
    expect(coveredHeadwordIdsIn(compiled)).toContain('flow');
    expect(coveredHeadwordIdsIn(compiled)).toContain('warehouse');
    expect(coveredHeadwordIdsIn(compiled)).toContain('system');
    expect(coveredHeadwordIdsIn(compiled)).toContain('track');
    expect(coveredHeadwordIdsIn(compiled)).toContain('breakdown');
    expect(coveredHeadwordIdsIn(compiled)).toContain('effort');
    expect(coveredHeadwordIdsIn(compiled)).toContain('secure');
    expect(coveredHeadwordIdsIn(compiled)).toContain('customs');
    expect(coveredHeadwordIdsIn(compiled)).toContain('policy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('delegate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('mutual');
    expect(coveredHeadwordIdsIn(compiled)).toContain('duty');
    expect(coveredHeadwordIdsIn(compiled)).toContain('barrier');
    expect(coveredHeadwordIdsIn(compiled)).toContain('statistic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('economy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('finance');
    expect(coveredHeadwordIdsIn(compiled)).toContain('resource');
    expect(coveredHeadwordIdsIn(compiled)).toContain('risk');
    expect(coveredHeadwordIdsIn(compiled)).toContain('disrupt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('stable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('inspect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('schedule');
    expect(coveredHeadwordIdsIn(compiled)).toContain('terminal');
    expect(coveredHeadwordIdsIn(compiled)).toContain('network');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confidence');
    expect(coveredHeadwordIdsIn(compiled)).toContain('establish');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pillar');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'mass'],
      [0, 0, 'cargo'],
      [0, 0, 'bulk'],
      [0, 0, 'commodity'],
      [0, 1, 'contain'],
      [0, 2, 'port'],
      [0, 2, 'order'],
      [0, 2, 'digit'],
      [0, 2, 'manage'],
      [0, 2, 'freight'],
      [0, 2, 'warehouse'],
      [1, 0, 'conference'],
      [1, 0, 'customs'],
      [1, 3, 'economy'],
      [1, 3, 'finance'],
      [2, 0, 'collective'],
      [2, 2, 'connect'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 16 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 16');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('科技');
    expect(passage!.titleEn).toBe(
      'Modern Engineering Collaboration, Systems Innovation, and Professional Ethics'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('commune');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('compass');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('concert');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('comrade');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('condemn');

    // 验证现代工程团队协作、系统研发与职业操守主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'competent team collaborates to advance a comprehensive technological program'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'design a compact device compatible with mobile systems'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'assemble each essential component with steady precision'
    );
    expect(passage!.paragraphs[0].sentences[3].english).toContain(
      'winning positive comments from respected industry experts'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'never conceal defect warnings or compromise on safety standards'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'strictly comply with concrete regulations and complete compulsory test procedures'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'concentrate on core design concepts and communicate with clarity'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'comprehend complex user needs and complete demanding tasks together'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'condense extensive testing feedback into a coherent summary report'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'technical competence and moral conduct together comprise the true foundation'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'commonplace reality that benefits the daily life of our community'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('compound²');
    expect(coveredHeadwordIdsIn(compiled)).toContain('competent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('comprehensive');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collaborate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hardware');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compact');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compatible');
    expect(coveredHeadwordIdsIn(compiled)).toContain('component');
    expect(coveredHeadwordIdsIn(compiled)).toContain('complicate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conference');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conceal');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compromise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('comply');
    expect(coveredHeadwordIdsIn(compiled)).toContain('concrete');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compulsory');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compensate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('concentrate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('concept');
    expect(coveredHeadwordIdsIn(compiled)).toContain('communicate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('complain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compete');
    expect(coveredHeadwordIdsIn(compiled)).toContain('comprehend');
    expect(coveredHeadwordIdsIn(compiled)).toContain('complete');
    expect(coveredHeadwordIdsIn(compiled)).toContain('condense');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conduct');
    expect(coveredHeadwordIdsIn(compiled)).toContain('comprise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('commonplace');
    expect(coveredHeadwordIdsIn(compiled)).toContain('community');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'engineer'],
      [0, 0, 'research'],
      [0, 0, 'technology'],
      [0, 1, 'hardware'],
      [0, 1, 'experiment'],
      [0, 1, 'mobile'],
      [0, 2, 'essence'],
      [0, 2, 'manufacture'],
      [0, 3, 'industry'],
      [1, 0, 'deliver'],
      [1, 0, 'defect¹'],
      [1, 0, 'safe'],
      [1, 1, 'test'],
      [1, 3, 'peer'],
      [1, 3, 'use'],
      [2, 0, 'project¹'],
      [2, 0, 'summary'],
      [2, 2, 'daily'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 17 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 17');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Modern Social Ethics, Confucian Heritage, and Civic Consensus'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证不再强行包含旧批次与语境割裂的拼凑词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('congratulate');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('contest');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('contempt');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('confess');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('conquer');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('confuse');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('contaminate');

    // 验证现代社会伦理、儒家思想与公共协商共识主题的地道选词与自然搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'traditional Confucian values connect with contemporary society'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'conscientious leaders consult historical wisdom to consolidate public consensus'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'conservative and progressive voices converse with sincere respect'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'refusing to let bitter hostility disrupt rational debate'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'agreeing to confine narrow disputes for the common good'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'moral integrity constitutes the inner foundation of good citizenship'
    );
    expect(passage!.paragraphs[2].sentences[3].english).toContain(
      'turning moral consensus into a durable pillar of collective flourishing'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('congress');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consider');
    expect(coveredHeadwordIdsIn(compiled)).toContain('Confucian');
    expect(coveredHeadwordIdsIn(compiled)).toContain('connect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contemporary');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confront');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conflict');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conscientious');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consult');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consolidate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consensus');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conscious');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consequence');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consume');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conjunction');
    expect(coveredHeadwordIdsIn(compiled)).toContain('constitution');
    expect(coveredHeadwordIdsIn(compiled)).toContain('construct');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consistent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confine');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confirm');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contend');
    expect(coveredHeadwordIdsIn(compiled)).toContain('consist');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conservative');
    expect(coveredHeadwordIdsIn(compiled)).toContain('converse¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('constant');
    expect(coveredHeadwordIdsIn(compiled)).toContain('constitute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conscience');
    expect(coveredHeadwordIdsIn(compiled)).toContain('conform');
    expect(coveredHeadwordIdsIn(compiled)).toContain('context');
    expect(coveredHeadwordIdsIn(compiled)).toContain('considerable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confidence');
    expect(coveredHeadwordIdsIn(compiled)).toContain('controversy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cooperate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collaborate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cohesion');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'ethic'],
      [0, 1, 'public'],
      [1, 0, 'panel'],
      [1, 1, 'constitution'],
      [2, 1, 'continue'],
      [2, 1, 'educate'],
      [0, 3, 'culture'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 18 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 18');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Corporate Governance, Contract Integrity, and Legal Compliance'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证彻底剔除旧版拼凑的割裂生硬词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cottage');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cotton');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('copper');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cord');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cop');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('couch');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cough');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cookie');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('corn');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('corps');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('costume');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cosmos');

    // 验证跨国企业合规治理与商业契约诚信的地道搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'councils to coordinate commercial activities'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'counsel carefully reviews commercial contracts'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'supervise corporate transactions to prevent corrupt bribery'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'threaten quarterly revenue'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'cope with commercial controversies'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'convey timely risk assessments'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'strengthen overall control'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'settle differences peacefully'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'core cornerstone of sustainable cooperation'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'culture of compliance and mutual trust'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('corporation');
    expect(coveredHeadwordIdsIn(compiled)).toContain('counsel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contract¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('coordinate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('council');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convention');
    expect(coveredHeadwordIdsIn(compiled)).toContain('corrupt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bribe');
    expect(coveredHeadwordIdsIn(compiled)).toContain('copyright');
    expect(coveredHeadwordIdsIn(compiled)).toContain('copy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('correspond');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contradict');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cope');
    expect(coveredHeadwordIdsIn(compiled)).toContain('controversy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contrast');
    expect(coveredHeadwordIdsIn(compiled)).toContain('transparent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convey');
    expect(coveredHeadwordIdsIn(compiled)).toContain('client');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convenient');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convert');
    expect(coveredHeadwordIdsIn(compiled)).toContain('correct');
    expect(coveredHeadwordIdsIn(compiled)).toContain('control');
    expect(coveredHeadwordIdsIn(compiled)).toContain('resolve');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dispute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('compromise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convince');
    expect(coveredHeadwordIdsIn(compiled)).toContain('core');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cornerstone');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cooperate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('contribute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('reputation');
    expect(coveredHeadwordIdsIn(compiled)).toContain('flourish');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'govern'],
      [0, 0, 'commerce'],
      [0, 3, 'operate'],
      [1, 0, 'quarter'],
      [1, 1, 'manage'],
      [1, 1, 'risk'],
      [2, 1, 'business'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 19 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 19');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Polar Marine Expeditions, Ecological Crisis Response, and Empirical Scientific Assessment'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证彻底剔除旧版拼凑的割裂生硬词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cracker');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cream');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cowboy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('coupon');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crocodile');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crab');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crawl');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('creep');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crane');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('coward');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crazy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crown');

    // 验证极地海洋科考、生态危机应对与科研实证评估的地道搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'launches an ambitious marine cruise'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'research craft equipped with vital sailing gear'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'survey shallow bays and cross deep polar zones'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'triggers sudden ecological disruptions'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'ice shelves crack along the coast'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'falling ice blocks crash violently into the freezing ocean'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'maintain professional courage'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'apply strict objective criteria to assess oceanic fluctuations'
    );
    expect(passage!.paragraphs[2].sentences[1].english).toContain(
      'collaborating closely with international counterparts'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'crucial to overcome global ecological challenges and sustain marine heritage'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('crew');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cruise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('course');
    expect(coveredHeadwordIdsIn(compiled)).toContain('craft');
    expect(coveredHeadwordIdsIn(compiled)).toContain('creature');
    expect(coveredHeadwordIdsIn(compiled)).toContain('crack');
    expect(coveredHeadwordIdsIn(compiled)).toContain('crash');
    expect(coveredHeadwordIdsIn(compiled)).toContain('courage');
    expect(coveredHeadwordIdsIn(compiled)).toContain('crisis');
    expect(coveredHeadwordIdsIn(compiled)).toContain('criterion');
    expect(coveredHeadwordIdsIn(compiled)).toContain('criticize');
    expect(coveredHeadwordIdsIn(compiled)).toContain('crucial');
    expect(coveredHeadwordIdsIn(compiled)).toContain('counterpart');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cross');
    expect(coveredHeadwordIdsIn(compiled)).toContain('create');
    expect(coveredHeadwordIdsIn(compiled)).toContain('credit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('marine');
    expect(coveredHeadwordIdsIn(compiled)).toContain('harbor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('adventure');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vital');
    expect(coveredHeadwordIdsIn(compiled)).toContain('gear');
    expect(coveredHeadwordIdsIn(compiled)).toContain('survey');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shallow');
    expect(coveredHeadwordIdsIn(compiled)).toContain('delicate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('specimen');
    expect(coveredHeadwordIdsIn(compiled)).toContain('strict');
    expect(coveredHeadwordIdsIn(compiled)).toContain('environment');
    expect(coveredHeadwordIdsIn(compiled)).toContain('guideline');
    expect(coveredHeadwordIdsIn(compiled)).toContain('observe');
    expect(coveredHeadwordIdsIn(compiled)).toContain('rare');
    expect(coveredHeadwordIdsIn(compiled)).toContain('habitat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('regulate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vulnerable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('species');
    expect(coveredHeadwordIdsIn(compiled)).toContain('rapid');
    expect(coveredHeadwordIdsIn(compiled)).toContain('climate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('disrupt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('alarm');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sensitive');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shelf');
    expect(coveredHeadwordIdsIn(compiled)).toContain('threat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('emergency');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deck');
    expect(coveredHeadwordIdsIn(compiled)).toContain('discipline');
    expect(coveredHeadwordIdsIn(compiled)).toContain('protect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hazard');
    expect(coveredHeadwordIdsIn(compiled)).toContain('collaborate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('overcome');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sustain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('heritage');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'coast'],
      [0, 0, 'science'],
      [0, 0, 'marine'],
      [0, 1, 'research'],
      [0, 1, 'sail'],
      [0, 1, 'pole'],
      [0, 2, 'environment'],
      [1, 0, 'ecology'],
      [1, 2, 'protect'],
      [2, 1, 'international'],
      [2, 3, 'joint'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 20 重写后满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 20');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('健康医疗');
    expect(passage!.titleEn).toBe(
      'Digital Health Technologies, Everyday Preventive Care, and Well-being'
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(30);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证彻底剔除旧版拼凑的割裂生硬词
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cucumber');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cupboard');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cushion');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('curve');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('crush');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cute');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('curl');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('dam');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('darling');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('curse');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('dash');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cry');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('lace');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('dairy');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('cube');
    expect(coveredHeadwordIdsIn(compiled)).not.toContain('damn');

    // 验证现代数字健康管理与预防医疗的地道搭配
    expect(passage!.paragraphs[0].sentences[0].english).toContain(
      'heavy desk duties often disrupt natural biological cycles'
    );
    expect(passage!.paragraphs[0].sentences[1].english).toContain(
      'creating persistent health deficits that curb daily vitality'
    );
    expect(passage!.paragraphs[0].sentences[2].english).toContain(
      'dizzy spells, digestive disorders, or severe stress'
    );
    expect(passage!.paragraphs[0].sentences[3].english).toContain(
      'demonstrate the urgent necessity of defining preventive health habits'
    );
    expect(passage!.paragraphs[1].sentences[0].english).toContain(
      'devise intelligent platforms and digital devices'
    );
    expect(passage!.paragraphs[1].sentences[1].english).toContain(
      'detect sudden fluctuations and deliver timely cues'
    );
    expect(passage!.paragraphs[1].sentences[2].english).toContain(
      'diagnose potential health risks, prescribe balanced diet plans'
    );
    expect(passage!.paragraphs[1].sentences[3].english).toContain(
      'converting complex records into direct, practical insights'
    );
    expect(passage!.paragraphs[2].sentences[0].english).toContain(
      'requires a deliberate shift in perspective'
    );
    expect(passage!.paragraphs[2].sentences[2].english).toContain(
      'defend against sudden illness, defeat bodily decay'
    );
    expect(passage!.paragraphs[2].sentences[3].english).toContain(
      'durable foundation for human dignity'
    );

    expect(coveredHeadwordIdsIn(compiled)).toContain('digit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('disrupt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cycle');
    expect(coveredHeadwordIdsIn(compiled)).toContain('fatigue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('distress');
    expect(coveredHeadwordIdsIn(compiled)).toContain('confront');
    expect(coveredHeadwordIdsIn(compiled)).toContain('irregular');
    expect(coveredHeadwordIdsIn(compiled)).toContain('diet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deficit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('curb');
    expect(coveredHeadwordIdsIn(compiled)).toContain('daily');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vital');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dizzy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('digest');
    expect(coveredHeadwordIdsIn(compiled)).toContain('disorder');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deteriorate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('demonstrate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('urgent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('necessity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('define');
    expect(coveredHeadwordIdsIn(compiled)).toContain('prevent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('exhaust');
    expect(coveredHeadwordIdsIn(compiled)).toContain('disease');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dilemma');
    expect(coveredHeadwordIdsIn(compiled)).toContain('devise');
    expect(coveredHeadwordIdsIn(compiled)).toContain('intelligent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('platform');
    expect(coveredHeadwordIdsIn(compiled)).toContain('device');
    expect(coveredHeadwordIdsIn(compiled)).toContain('database');
    expect(coveredHeadwordIdsIn(compiled)).toContain('detect');
    expect(coveredHeadwordIdsIn(compiled)).toContain('fluctuate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deliver');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('diagnose');
    expect(coveredHeadwordIdsIn(compiled)).toContain('prescribe');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dynamic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('convert');
    expect(coveredHeadwordIdsIn(compiled)).toContain('insight');
    expect(coveredHeadwordIdsIn(compiled)).toContain('deliberate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shift');
    expect(coveredHeadwordIdsIn(compiled)).toContain('perspective');
    expect(coveredHeadwordIdsIn(compiled)).toContain('devote');
    expect(coveredHeadwordIdsIn(compiled)).toContain('discourage');
    expect(coveredHeadwordIdsIn(compiled)).toContain('discipline');
    expect(coveredHeadwordIdsIn(compiled)).toContain('defend');
    expect(coveredHeadwordIdsIn(compiled)).toContain('defeat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('decay');
    expect(coveredHeadwordIdsIn(compiled)).toContain('decrease');
    expect(coveredHeadwordIdsIn(compiled)).toContain('durable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('dignity');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'digit'],
      [0, 0, 'biology'],
      [0, 1, 'screen'],
      [0, 2, 'digest'],
      [0, 3, 'clinic'],
      [0, 3, 'prevent'],
      [1, 2, 'balance'],
      [2, 0, 'deliberate'],
      [2, 1, 'support'],
      [2, 2, 'discipline'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 23 满足主题自然度、词量及行间标注校验规范，且大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 23');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe('Getting Home After the Night Shift');
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(70);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证包含 Issue #33 初始规划核心目标词
    expect(coveredHeadwordIdsIn(compiled)).toContain('commute');
    expect(coveredHeadwordIdsIn(compiled)).toContain('traffic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('railway');
    expect(coveredHeadwordIdsIn(compiled)).toContain('subway');
    expect(coveredHeadwordIdsIn(compiled)).toContain('fare');
    expect(coveredHeadwordIdsIn(compiled)).toContain('district');
    expect(coveredHeadwordIdsIn(compiled)).toContain('afford');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wage');

    // 验证大幅拓展纳入的高契合未覆盖词目
    expect(coveredHeadwordIdsIn(compiled)).toContain('outskirts');
    expect(coveredHeadwordIdsIn(compiled)).toContain('avenue');
    expect(coveredHeadwordIdsIn(compiled)).toContain('carriage');
    expect(coveredHeadwordIdsIn(compiled)).toContain('halt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('coach');
    expect(coveredHeadwordIdsIn(compiled)).toContain('destination');
    expect(coveredHeadwordIdsIn(compiled)).toContain('toll');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pinch');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wallet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('suburb');
    expect(coveredHeadwordIdsIn(compiled)).toContain('struggle');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shuttle');
    expect(coveredHeadwordIdsIn(compiled)).toContain('corridor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('solve');
    expect(coveredHeadwordIdsIn(compiled)).toContain('fleet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('seldom');
    expect(coveredHeadwordIdsIn(compiled)).toContain('weigh');
    expect(coveredHeadwordIdsIn(compiled)).toContain('feasible');
    expect(coveredHeadwordIdsIn(compiled)).toContain('integrate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('indispensable');
    expect(coveredHeadwordIdsIn(compiled)).toContain('remedy');
    expect(coveredHeadwordIdsIn(compiled)).toContain('livelihood');
    expect(coveredHeadwordIdsIn(compiled)).toContain('outcome');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'industry'],
      [0, 1, 'main'],
      [0, 2, 'punctual'],
      [1, 0, 'modest'],
      [1, 0, 'cab'],
      [1, 0, 'sharp'],
      [1, 1, 'cheap'],
      [1, 2, 'transit'],
      [2, 0, 'common'],
      [2, 1, 'pilot'],
      [3, 0, 'operate'],
      [3, 0, 'feasible'],
      [3, 1, 'indispensable'],
      [3, 2, 'significant'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('CET-4 核心篇 NO. 24 满足主题自然度、词量及行间标注校验规范，且大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 24');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
    expect(passage!.titleEn).toBe(
      'Digital Access Should Not Be the Library’s Only Door'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(75);

    for (const id of coveredHeadwordIdsIn(compiled)) {
      const entry = catalog.byId.get(id);
      expect(entry?.level).not.toBe('cet6');
    }

    // 验证包含 Issue #34 初始规划核心目标词
    expect(coveredHeadwordIdsIn(compiled)).toContain('mayor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('equal');
    expect(coveredHeadwordIdsIn(compiled)).toContain('discriminate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('vote');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tax');
    expect(coveredHeadwordIdsIn(compiled)).toContain('grant');
    expect(coveredHeadwordIdsIn(compiled)).toContain('permit');

    // 验证大幅拓展纳入的高契合未覆盖词目
    expect(coveredHeadwordIdsIn(compiled)).toContain('county');
    expect(coveredHeadwordIdsIn(compiled)).toContain('undertake');
    expect(coveredHeadwordIdsIn(compiled)).toContain('worthwhile');
    expect(coveredHeadwordIdsIn(compiled)).toContain('upgrade');
    expect(coveredHeadwordIdsIn(compiled)).toContain('furnish');
    expect(coveredHeadwordIdsIn(compiled)).toContain('high-tech');
    expect(coveredHeadwordIdsIn(compiled)).toContain('desktop');
    expect(coveredHeadwordIdsIn(compiled)).toContain('online');
    expect(coveredHeadwordIdsIn(compiled)).toContain('poor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('civilian');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pension');
    expect(coveredHeadwordIdsIn(compiled)).toContain('laptop');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tablet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wary');
    expect(coveredHeadwordIdsIn(compiled)).toContain('fear');
    expect(coveredHeadwordIdsIn(compiled)).toContain('worry');
    expect(coveredHeadwordIdsIn(compiled)).toContain('browse');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cyberspace');
    expect(coveredHeadwordIdsIn(compiled)).toContain('download');
    expect(coveredHeadwordIdsIn(compiled)).toContain('handicap');
    expect(coveredHeadwordIdsIn(compiled)).toContain('forum');
    expect(coveredHeadwordIdsIn(compiled)).toContain('reluctant');
    expect(coveredHeadwordIdsIn(compiled)).toContain('express');
    expect(coveredHeadwordIdsIn(compiled)).toContain('doubt');
    expect(coveredHeadwordIdsIn(compiled)).toContain('oppose');
    expect(coveredHeadwordIdsIn(compiled)).toContain('exclude');
    expect(coveredHeadwordIdsIn(compiled)).toContain('insist');
    expect(coveredHeadwordIdsIn(compiled)).toContain('counter');
    expect(coveredHeadwordIdsIn(compiled)).toContain('agenda');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cord');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wire');
    expect(coveredHeadwordIdsIn(compiled)).toContain('plug');
    expect(coveredHeadwordIdsIn(compiled)).toContain('sum');
    expect(coveredHeadwordIdsIn(compiled)).toContain('persuade');
    expect(coveredHeadwordIdsIn(compiled)).toContain('declare');
    expect(coveredHeadwordIdsIn(compiled)).toContain('blueprint');
    expect(coveredHeadwordIdsIn(compiled)).toContain('privilege');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wealth');
    expect(coveredHeadwordIdsIn(compiled)).toContain('retain');
    expect(coveredHeadwordIdsIn(compiled)).toContain('print');
    expect(coveredHeadwordIdsIn(compiled)).toContain('handbook');
    expect(coveredHeadwordIdsIn(compiled)).toContain('brochure');
    expect(coveredHeadwordIdsIn(compiled)).toContain('volume');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cast');
    expect(coveredHeadwordIdsIn(compiled)).toContain('final');
    expect(coveredHeadwordIdsIn(compiled)).toContain('ballot');
    expect(coveredHeadwordIdsIn(compiled)).toContain('parallel');
    expect(coveredHeadwordIdsIn(compiled)).toContain('suit¹');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tall');
    expect(coveredHeadwordIdsIn(compiled)).toContain('cabinet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('invite');
    expect(coveredHeadwordIdsIn(compiled)).toContain('borrow');
    expect(coveredHeadwordIdsIn(compiled)).toContain('article');
    expect(coveredHeadwordIdsIn(compiled)).toContain('neat');
    expect(coveredHeadwordIdsIn(compiled)).toContain('keyboard');
    expect(coveredHeadwordIdsIn(compiled)).toContain('input');
    expect(coveredHeadwordIdsIn(compiled)).toContain('search');
    expect(coveredHeadwordIdsIn(compiled)).toContain('diligent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('act');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tutor');
    expect(coveredHeadwordIdsIn(compiled)).toContain('lesson');
    expect(coveredHeadwordIdsIn(compiled)).toContain('teach');
    expect(coveredHeadwordIdsIn(compiled)).toContain('app');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hesitate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('pass');
    expect(coveredHeadwordIdsIn(compiled)).toContain('subsequent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('result');
    expect(coveredHeadwordIdsIn(compiled)).toContain('triumph');
    expect(coveredHeadwordIdsIn(compiled)).toContain('grateful');
    expect(coveredHeadwordIdsIn(compiled)).toContain('obstacle');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'county'],
      [0, 0, 'desktop'],
      [0, 2, 'digit'],
      [1, 1, 'staff'],
      [1, 1, 'serve'],
      [1, 2, 'build'],
      [1, 3, 'wealth'],
      [1, 3, 'print'],
      [2, 2, 'search'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('主题短文 NO. 25 满足主题自然度、词量及行间标注校验规范，且大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 25');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Community Evacuation and Emergency Rescue in a Disaster'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(75);

    // 验证包含 Issue #35 初始规划核心目标词
    expect(coveredHeadwordIdsIn(compiled)).toContain('disaster');
    expect(coveredHeadwordIdsIn(compiled)).toContain('evacuate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('victim');
    expect(coveredHeadwordIdsIn(compiled)).toContain('respond');
    expect(coveredHeadwordIdsIn(compiled)).toContain('casualty');
    expect(coveredHeadwordIdsIn(compiled)).toContain('panic');
    expect(coveredHeadwordIdsIn(compiled)).toContain('wound');

    // 验证大幅拓展纳入的高契合未覆盖词目
    expect(coveredHeadwordIdsIn(compiled)).toContain('quake');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tremble');
    expect(coveredHeadwordIdsIn(compiled)).toContain('loud');
    expect(coveredHeadwordIdsIn(compiled)).toContain('broadcast');
    expect(coveredHeadwordIdsIn(compiled)).toContain('drill');
    expect(coveredHeadwordIdsIn(compiled)).toContain('stair');
    expect(coveredHeadwordIdsIn(compiled)).toContain('exit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('chaos');
    expect(coveredHeadwordIdsIn(compiled)).toContain('smoke');
    expect(coveredHeadwordIdsIn(compiled)).toContain('squad');
    expect(coveredHeadwordIdsIn(compiled)).toContain('ambulance');
    expect(coveredHeadwordIdsIn(compiled)).toContain('aide');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bleed');
    expect(coveredHeadwordIdsIn(compiled)).toContain('bandage');
    expect(coveredHeadwordIdsIn(compiled)).toContain('mild');
    expect(coveredHeadwordIdsIn(compiled)).toContain('medicine');
    expect(coveredHeadwordIdsIn(compiled)).toContain('agony');
    expect(coveredHeadwordIdsIn(compiled)).toContain('unit');
    expect(coveredHeadwordIdsIn(compiled)).toContain('waterproof');
    expect(coveredHeadwordIdsIn(compiled)).toContain('tent');
    expect(coveredHeadwordIdsIn(compiled)).toContain('safeguard');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shield');
    expect(coveredHeadwordIdsIn(compiled)).toContain('allocate');
    expect(coveredHeadwordIdsIn(compiled)).toContain('blanket');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hygiene');
    expect(coveredHeadwordIdsIn(compiled)).toContain('packet');
    expect(coveredHeadwordIdsIn(compiled)).toContain('battery');
    expect(coveredHeadwordIdsIn(compiled)).toContain('torch');
    expect(coveredHeadwordIdsIn(compiled)).toContain('stove');
    expect(coveredHeadwordIdsIn(compiled)).toContain('kettle');
    expect(coveredHeadwordIdsIn(compiled)).toContain('shock');
    expect(coveredHeadwordIdsIn(compiled)).toContain('grief');
    expect(coveredHeadwordIdsIn(compiled)).toContain('solidarity');
    expect(coveredHeadwordIdsIn(compiled)).toContain('nightmare');
    expect(coveredHeadwordIdsIn(compiled)).toContain('brave');
    expect(coveredHeadwordIdsIn(compiled)).toContain('rehearse');
    expect(coveredHeadwordIdsIn(compiled)).toContain('peril');
    expect(coveredHeadwordIdsIn(compiled)).toContain('hope');
    expect(coveredHeadwordIdsIn(compiled)).toContain('debris');
    expect(coveredHeadwordIdsIn(compiled)).toContain('resume');

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'brick'],
      [0, 2, 'concrete'],
      [1, 0, 'rescue'],
      [1, 3, 'clinic'],
      [2, 0, 'waterproof'],
      [2, 1, 'hygiene'],
      [2, 2, 'metal'],
      [3, 1, 'bulletin'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('主题短文 NO. 26 满足主题自然度、词量及行间标注校验规范，且大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 26');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('科技');
    expect(passage!.titleEn).toBe(
      'Testing Simulated Lunar Soil and Reporting Findings Cautiously'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    expect(coveredHeadwordIdsIn(compiled).length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #36 初始规划核心目标词
    expect(coveredHeadwordIdsIn(compiled)).toContain('hypothesis');
    expect(coveredHeadwordIdsIn(compiled)).toContain('apparatus');
    expect(coveredHeadwordIdsIn(compiled)).toContain('lunar');
    expect(coveredHeadwordIdsIn(compiled)).toContain('microscope');
    expect(coveredHeadwordIdsIn(compiled)).toContain('result');
    expect(coveredHeadwordIdsIn(compiled)).toContain('journal');

    // 验证大幅拓展纳入的高契合未覆盖词目
    for (const id of [
      'geology',
      'lab',
      'undergraduate',
      'faculty',
      'mentor',
      'propose',
      'specific',
      'empirical',
      'predict',
      'dry',
      'friction',
      'fine¹',
      'powder',
      'simulate',
      'dust',
      'cling',
      'tilt',
      'aluminum',
      'surface',
      'coarse',
      'grain',
      'scarce',
      'crush',
      'volcano',
      'ash',
      'mine²',
      'fragment',
      'analogue',
      'bake',
      'batch',
      'furnace',
      'expel',
      'moist',
      'fill',
      'jar¹',
      'portion',
      'fasten',
      'lid',
      'custom',
      'pump',
      'chamber',
      'valve',
      'gauge',
      'thermometer',
      'rub',
      'tray',
      'exact',
      'angle',
      'slide',
      'minute²',
      'trace',
      'optic',
      'lens',
      'magnify',
      'edge',
      'scan',
      'rough',
      'texture',
      'diameter',
      'fraction',
      'millimeter',
      'log',
      'numerical',
      'parameter',
      'sketch',
      'diagram',
      'session',
      'puzzle',
      'discrepancy',
      'presume',
      'spot',
      'faint',
      'stain',
      'scratch',
      'repeat',
      'consecutive',
      'ascertain',
      'duplicate',
      'phenomenon',
      'frank',
      'concede',
      'inevitable',
      'shortcoming',
      'gravity',
      'slight',
      'vapor',
      'humid',
      'constrain',
      'submit',
      'manuscript',
      'earnest',
      'author',
      'revise',
      'proofread',
      'paragraph',
      'omit',
      'vague',
      'remark',
      'refrain',
      'exaggerate',
      'overstate',
      'preliminary',
      'proof',
      'justify',
      'add',
      'explicit',
      'appendix',
      'margin',
      'senior',
      'edit',
      'commend',
      'humble',
      'meticulous',
      'endeavor',
      'note',
      'valid',
      'premature',
      'boast',
      'thorough',
      'limit',
    ]) {
      expect(coveredHeadwordIdsIn(compiled)).toContain(id);
    }

    // 验证修饰名词的形容词语境词性匹配
    const attributiveChecks: [number, number, string][] = [
      [0, 0, 'campus'],
      [0, 0, 'geology'],
      [0, 0, 'faculty'],
      [0, 1, 'tilt'],
      [0, 1, 'aluminum'],
      [0, 2, 'mine²'],
      [1, 0, 'custom'],
      [1, 1, 'minute²'],
    ];

    for (const [pIdx, sIdx, headwordId] of attributiveChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith('a.')).toBe(true);
      }
    }
  });

  it('主题短文 NO. 27 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 27');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
    expect(passage!.titleEn).toBe(
      'Adapting a Local Legend for the Community Arts Festival'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(130);

    // 验证包含 Issue #37 初始规划的全部 7 个核心目标词目
    for (const targetId of [
      'theater',
      'legend',
      'script',
      'costume',
      'perform',
      'festival',
      'manuscript',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证大幅拓展纳入的高契合戏剧改编与社区会演大纲词目
    for (const id of [
      'archive',
      'happen',
      'fragile',
      'handwriting',
      'fade',
      'ink',
      'narrate',
      'steer',
      'ferry',
      'fog',
      'tale',
      'live²',
      'play',
      'revive',
      'outdated',
      'prose',
      'vivid',
      'tedious',
      'episode',
      'obscure',
      'idiom',
      'youngster',
      'twist',
      'intact',
      'heroine',
      'humor',
      'portray',
      'saint',
      'lavish',
      'second-hand',
      'fabric',
      'sew',
      'linen',
      'carve',
      'oar',
      'prop',
      'venue',
      'timid',
      'nerve',
      'refine',
      'vocal',
      'tone',
      'gesture',
      'tempo',
      'recite',
      'speech',
      'aloud',
      'spotlight',
      'dim',
      'curtain',
      'evoke',
      'row¹',
      'seat',
      'debut',
      'crisp',
      'grace',
      'motion',
      'arouse',
      'sympathy',
      'wonder',
      'silent',
      'climax',
      'nod',
      'delight',
      'lean',
      'fascinate',
      'witness',
      'folklore',
      'alive',
      'heartfelt',
      'applaud',
      'greet',
      'bow¹',
      'passion',
      'breathe',
      'vigor',
      'legacy',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证语境词性匹配（名词前作定语标为 a.，被修饰名词标为 n.，副词标为 ad.）
    const posChecks: [number, number, string, string][] = [
      [0, 0, 'amateur', 'a.'],
      [0, 0, 'theater', 'a.'],
      [0, 0, 'club', 'n.'],
      [0, 2, 'live²', 'a.'],
      [0, 2, 'play', 'n.'],
      [0, 2, 'community', 'a.'],
      [0, 2, 'art', 'a.'],
      [0, 2, 'festival', 'n.'],
      [2, 0, 'linen', 'a.'],
      [2, 0, 'costume', 'n.'],
      [2, 1, 'faculty', 'a.'],
      [2, 1, 'mentor', 'n.'],
      [2, 2, 'aloud', 'ad.'],
      [3, 2, 'forward', 'ad.'],
    ];

    for (const [pIdx, sIdx, headwordId, prefix] of posChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith(prefix)).toBe(true);
      }
    }
  });

  it('主题短文 NO. 28 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并规范标注超纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 28');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Teamwork and Growth in a Regional Amateur League'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(130);

    // 验证包含 Issue #38 初始规划的全部 9 个核心目标词目
    for (const targetId of [
      'athlete',
      'tournament',
      'coach',
      'referee',
      'stadium',
      'medal',
      'victory',
      'league',
      'Olympic',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证拓展纳入的高契合赛场与团队成长大纲词目
    for (const id of [
      'dream',
      'keen',
      'join',
      'amateur',
      'soccer',
      'club',
      'outset',
      'shine',
      'solo',
      'impress',
      'recruit',
      'overlook',
      'clumsy',
      'shot',
      'wet',
      'mistake',
      'attack',
      'whole',
      'frustrate',
      'countdown',
      'important',
      'scold',
      'workout',
      'dusk',
      'jog',
      'fit',
      'stretch',
      'stiff',
      'limb',
      'crisp',
      'smart',
      'tactic',
      'sweat',
      'soak',
      'uniform',
      'instruct',
      'huddle',
      'guard',
      'lane',
      'persevere',
      'willpower',
      'realize',
      'loyal',
      'companion',
      'multiple',
      'rhythm',
      'faith',
      'unfold',
      'lively',
      'sunshine',
      'spectator',
      'stand',
      'clap',
      'flag',
      'tough',
      'slide',
      'foul',
      'stern',
      'blow',
      'whistle',
      'award',
      'penalty',
      'uphold',
      'fair¹',
      'protest',
      'rage',
      'excuse',
      'obey',
      'call',
      'courtesy',
      'restrain',
      'impulse',
      'bruise',
      'polite',
      'apology',
      'score',
      'morale',
      'spark',
      'momentum',
      'goal',
      'aside',
      'send',
      'sideways',
      'fellow',
      'kick',
      'dive',
      'net',
      'announce',
      'thrill',
      'joy',
      'hug',
      'roar',
      'aim',
      'quest',
      'mature',
      'worthy',
      'splendid',
      'prize',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证足球必要超纲词显式规范标注
    const oosSurfaces: string[] = [];
    for (const p of compiled.paragraphs) {
      for (const s of p.sentences) {
        for (const t of s.tokens) {
          if (t.type === 'annotation' && t.category === 'out-of-syllabus') {
            oosSurfaces.push(t.surface);
          }
        }
      }
    }
    expect(oosSurfaces).toEqual(['teammates', 'keeper']);

    // 验证语境词性匹配（名词前作定语标为 a.，被修饰名词标为 n.，副词标为 ad.）
    const posChecks: [number, number, string, string][] = [
      [0, 0, 'soccer', 'a.'],
      [0, 1, 'solo', 'a.'],
      [0, 2, 'repeat', 'a.'],
      [3, 1, 'aside', 'ad.'],
      [3, 1, 'sideways', 'ad.'],
      [3, 1, 'fellow', 'a.'],
      [3, 1, 'forward', 'n.'],
      [3, 1, 'dive', 'a.'],
    ];

    for (const [pIdx, sIdx, headwordId, prefix] of posChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith(prefix)).toBe(true);
      }
    }
  });

  it('主题短文 NO. 29 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 29');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Trial Preparation and Nutritional Refinement of a Campus Breakfast Menu'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #39 规划的全部目标词目
    for (const targetId of [
      'recipe',
      'ingredient',
      'wheat',
      'dairy',
      'fiber',
      'vitamin',
      'appetite',
      'calorie',
      'portion',
      'spice',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合校园餐饮与营养改良大纲词目
    for (const id of [
      'cafeteria',
      'cereal',
      'flour',
      'flavor',
      'protein',
      'wholesome',
      'delicious',
      'pour',
      'pan',
      'chew',
      'honey',
      'berry',
      'snack',
      'chef',
      'taste',
      'hunger',
      'bean',
      'steam',
      'stir',
      'menu',
      'smell',
      'scent',
      'improve',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证语境词性匹配（形容词以“的”结尾，副词以“地”结尾）
    const posChecks: [number, number, string, string][] = [
      [0, 0, 'crowd', 'a.'],
      [0, 0, 'hurry', 'a.'],
      [0, 2, 'determine', 'a.'],
      [1, 0, 'dairy', 'a.'],
      [1, 0, 'steam', 'a.'],
      [1, 2, 'grease', 'a.'],
      [2, 0, 'heat', 'a.'],
      [2, 1, 'nature', 'a.'],
      [2, 3, 'slight', 'ad.'],
      [3, 0, 'modify', 'a.'],
      [3, 2, 'hunger', 'a.'],
    ];

    for (const [pIdx, sIdx, headwordId, prefix] of posChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith(prefix)).toBe(true);
      }
    }
  });

  it('短文库前 20 篇全量通过语料体例校验且词目无六级超纲（按 ADR 0004 解除批次固定绑定）', () => {
    const first20 = PASSAGES.slice(0, 20);
    expect(first20).toHaveLength(20);

    for (const [idx, passage] of first20.entries()) {
      expect(passage.id).toBe(`passage-${String(idx + 1).padStart(3, '0')}`);
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
      for (const id of coveredHeadwordIdsIn(compiled)) {
        const entry = catalog.byId.get(id);
        expect(entry?.level).not.toBe('cet6');
      }
    }
  });

  it('主题短文 NO. 30 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并大幅增加未覆盖大纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 30');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
    expect(passage!.titleEn).toBe(
      'Pre-trip Preparation and Summiting Experience of a Cross-border Mountain Expedition'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #40 规划的全部目标词目
    for (const targetId of [
      'destination',
      'hike',
      'summit',
      'expedition',
      'passport',
      'terrain',
      'luggage',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合跨境徒步与登山考察大纲词目
    for (const id of [
      'frontier',
      'visa',
      'orient¹',
      'lead¹',
      'mentor',
      'recruit',
      'verify',
      'stamp¹',
      'identity',
      'document',
      'trim',
      'compass',
      'ration',
      'compact',
      'parcel',
      'garment',
      'sturdy',
      'boot',
      'wool',
      'thermal',
      'raincoat',
      'trace',
      'route',
      'fragrant',
      'pine',
      'meadow',
      'chill',
      'mist',
      'veil',
      'gorge',
      'tread',
      'caution',
      'challenge',
      'trek',
      'vegetation',
      'stride',
      'ascend',
      'plateau',
      'glacier',
      'incline',
      'exert',
      'weary',
      'pause',
      'breath',
      'cheer',
      'mate',
      'sip',
      'proceed',
      'unite',
      'conquer',
      'ridge',
      'attain',
      'milestone',
      'viewpoint',
      'sweep',
      'glance',
      'wilderness',
      'gaze',
      'plain',
      'glad',
      'triumph',
      'companion',
      'congratulate',
      'elevate',
      'spirit',
      'height',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证语境词性匹配（名词前作定语标为 a.，形容词以“的”结尾）
    const posChecks: [number, number, string, string][] = [
      [0, 0, 'research', 'a.'],
      [0, 1, 'visa', 'a.'],
      [0, 1, 'identity', 'a.'],
      [1, 0, 'wool', 'a.'],
      [1, 0, 'thermal', 'a.'],
      [1, 1, 'pine', 'a.'],
      [1, 1, 'detail', 'a.'],
      [2, 1, 'steady', 'a.'],
      [2, 2, 'weary', 'a.'],
      [3, 1, 'sweep', 'a.'],
      [3, 2, 'glad', 'a.'],
    ];

    for (const [pIdx, sIdx, headwordId, prefix] of posChecks) {
      const token = compiled.paragraphs[pIdx].sentences[sIdx].tokens.find(
        (t) => t.type === 'annotation' && t.headwordId === headwordId
      );
      expect(token).toBeDefined();
      if (token && token.type === 'annotation') {
        expect(token.gloss.startsWith(prefix)).toBe(true);
      }
    }
  });

  it('主题短文 NO. 31 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并规范标注超纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 31');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
    expect(passage!.titleEn).toBe(
      'How the Campus Radio Team Verified an Event Rumor'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(125);

    // 验证包含 Issue #41 初始规划的全部 6 个核心目标词目
    for (const targetId of [
      'broadcast',
      'rumor',
      'journalism',
      'interview',
      'publish',
      'editorial',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合新闻采编与流言核实大纲词目
    for (const id of [
      'anchor',
      'microphone',
      'leak',
      'allege',
      'concert',
      'pause',
      'probe',
      'source',
      'fiction',
      'mislead',
      'tape',
      'officer',
      'dean',
      'calendar',
      'disclose',
      'mere',
      'postpone',
      'deny',
      'total',
      'truth',
      'brief',
      'notify',
      'listen',
      'rectify',
      'tune',
      'quote',
      'soothe',
      'differentiate',
      'merge',
      'segment',
      'column',
      'discern',
      'credible',
      'remind',
      'sound²',
      'distort',
      'prestige',
      'dubious',
      'anonymous',
      'escalate',
      'amplify',
      'fabricate',
      'inquire',
      'protocol',
      'transcript',
      'assert',
      'audit',
      'outlet',
      'testify',
      'subjective',
      'manipulate',
      'rhetoric',
      'topic',
      'medium',
      'verdict',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 32 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并规范标注超纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 32');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Worker Security and Retraining During Factory Automation'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(125);

    // 验证包含 Issue #42 规划的核心目标词目及替换词目（首字母各不相同）与 pension
    for (const targetId of [
      'union',
      'pledge',
      'occupation',
      'layoff',
      'hire',
      'resign',
      'pension',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合职场经济与自动化转型大纲词目
    for (const id of [
      'deploy',
      'spokesman',
      'convene',
      'shift',
      'streamline',
      'redundant',
      'nevertheless',
      'workshop',
      'intervene',
      'terminate',
      'accord',
      'safeguard',
      'reassure',
      'operative',
      'payroll',
      'allowance',
      'transition',
      'qualify',
      'certify',
      'polytechnic',
      'institute',
      'supervise',
      'expertise',
      'decent',
      'prefer',
      'vocation',
      'bonus',
      'opportunity',
      'output',
      'optimism',
      'progress',
      'dignity',
      'drastic',
      'quota',
      'deadlock',
      'adverse',
      'buffer',
      'pact',
      'stipulate',
      'aptitude',
      'cylinder',
      'viable',
      'surplus',
      'diminish',
      'rigid',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 33 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并规范标注超纲词', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 33');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('职场经济');
    expect(passage!.titleEn).toBe(
      'Understanding Market Cycles and Personal Investment'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(135);

    // 验证包含 Issue #43 规划的核心目标词目及替换词目（首字母各不相同）
    for (const targetId of [
      'economics',
      'boom',
      'recession',
      'interest',
      'stock',
      'dividend',
      'profit',
      'wealth',
      'gamble',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合职场经济与市场周期大纲词目
    for (const id of [
      'clerk',
      'curious',
      'finance',
      'attend',
      'community',
      'seminar',
      'cycle',
      'instruct',
      'lecture',
      'introduce',
      'principle',
      'explain',
      'nation',
      'economy',
      'experience',
      'perpetual',
      'amateur',
      'participate',
      'mistake',
      'treat',
      'equity',
      'quick',
      'hope',
      'sudden',
      'rich',
      'headline',
      'announce',
      'business',
      'speak',
      'illustrate',
      'period',
      'rapid',
      'expand',
      'inevitable',
      'correct',
      'consume',
      'confidence',
      'climb',
      'corporation',
      'revenue',
      'prompt',
      'surge',
      'blind',
      'optimism',
      'conceal',
      'underlie',
      'hazard',
      'haste',
      'buy',
      'active',
      'enter',
      'asset',
      'value',
      'plunge',
      'care',
      'individual',
      'distress',
      'gain',
      'shrink',
      'clarity',
      'essence',
      'mechanic',
      'mentor',
      'help',
      'audience',
      'distinguish',
      'differ',
      'source',
      'return',
      'firm²',
      'generate',
      'annual',
      'commerce',
      'operate',
      'distribute',
      'earn',
      'contrast',
      'deposit',
      'yield',
      'fix',
      'provide',
      'modest',
      'stable',
      'drama',
      'grasp',
      'distinct',
      'prevent',
      'household',
      'confuse',
      'fluctuate',
      'guarantee',
      'conclude',
      'emphasis',
      'establish',
      'genuine',
      'term',
      'involve',
      'easy',
      'magic',
      'formula',
      'believe',
      'trend',
      'prosper',
      'danger',
      'illusion',
      'sense',
      'maintain',
      'sober',
      'perspective',
      'diverse',
      'save',
      'resist',
      'tempt',
      'reckless',
      'speculate',
      'respect',
      'caution',
      'decide',
      'ordinary',
      'citizen',
      'safeguard',
      'well-being',
      'discipline',
      'portfolio',
      'volatile',
      'compound¹',
      'principal',
      'slump',
      'appreciate',
      'depreciate',
      'inflate',
      'downward',
      'upward',
      'liquid',
      'naive',
      'pyramid',
      'foresee',
      'lucrative',
      'stagnate',
      'hedge',
      'index',
      'spiral',
      'dip',
      'reap',
      'ratio',
      'rally',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 34 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 34');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('教育文化');
    expect(passage!.titleEn).toBe('Adult Literacy and Vocational Renewal');
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(125);

    // 验证包含 Issue #44 规划的全部 9 个核心目标词目（首字母各不相同）
    for (const targetId of [
      'illiterate',
      'enroll',
      'tuition',
      'curriculum',
      'mentor',
      'diploma',
      'qualify',
      'apprentice',
      'faculty',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合成人识字与职业技术核心大纲词目
    for (const id of [
      'formal',
      'youth',
      'ashamed',
      'intimidate',
      'complex',
      'text',
      'confront',
      'stumble',
      'rapid',
      'change',
      'economy',
      'struggle',
      'comprehend',
      'technical',
      'handbook',
      'function',
      'shame',
      'routine',
      'assign',
      'encourage',
      'support',
      'colleague',
      'decide',
      'program',
      'host¹',
      'local',
      'community',
      'eligible',
      'civic',
      'fund',
      'cover',
      'full',
      'fee',
      'finance',
      'worry',
      'deter',
      'resolve',
      'study',
      'design',
      'link',
      'literary',
      'lesson',
      'practical',
      'vocation',
      'skill',
      'incentive',
      'dedicate',
      'treat',
      'learn',
      'patient¹',
      'volunteer',
      'offer',
      'steady',
      'individual',
      'guide',
      'classmate',
      'alongside',
      'basic',
      'exercise',
      'essay',
      'calculate',
      'daily',
      'arithmetic',
      'complete',
      'regular',
      'homework',
      'diligent',
      'encounter',
      'harsh',
      'criticize',
      'humiliate',
      'find',
      'compassion',
      'help',
      'overcome',
      'linger',
      'doubt',
      'workshop',
      'translate',
      'tangible',
      'manual',
      'competent',
      'interpret',
      'diagram',
      'safe',
      'instruct',
      'measure',
      'dimension',
      'assemble',
      'copper',
      'pipe',
      'handle',
      'hammer',
      'screw',
      'nut',
      'wrench',
      'correct',
      'confidence',
      'grow',
      'realize',
      'read',
      'align',
      'valve',
      'dismantle',
      'aspire',
      'trade',
      'plumber',
      'progress',
      'motivate',
      'persist',
      'demand',
      'session',
      'undergo',
      'rigor',
      'specialty',
      'success',
      'earn',
      'equip',
      'credential',
      'milestone',
      'prove',
      'chance',
      'illuminate',
      'transform',
      'verify',
      'license',
      'fluent',
      'liberate',
      'vulnerable',
      'fulfill',
      'ambition',
      'secure',
      'promise',
      'path',
      'dignity',
      'stable',
      'career',
      'pave',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 35 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 35');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Resolving Plumbing Leaks in an Aging Tenancy'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #45 规划的核心目标词目
    for (const targetId of [
      'tenant',
      'landlord',
      'rent',
      'utility',
      'sanitation',
      'plumbing',
      'burst',
      'ceiling',
      'downstairs',
      'mend',
      'overflow',
      'interim',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合公寓与管道维修核心大纲词目
    for (const id of [
      'lobby',
      'shabby',
      'estate',
      'notice',
      'drip',
      'corrode',
      'joint',
      'cause',
      'splash',
      'staircase',
      'spill',
      'carpet',
      'fear',
      'rot',
      'spread',
      'foul',
      'odor',
      'fetch',
      'bucket',
      'mop',
      'contain',
      'mess',
      'report',
      'incident',
      'immediate',
      'superintendent',
      'prevent',
      'trouble',
      'alert',
      'nuisance',
      'dispatch',
      'technical',
      'premise',
      'act',
      'negligent',
      'shut',
      'main',
      'tap',
      'halt',
      'flood',
      'inspect',
      'rust',
      'pipe',
      'basement',
      'adjacent',
      'flat²',
      'decide',
      'property',
      'patch',
      'authorize',
      'overhaul',
      'insulate',
      'bare',
      'tube',
      'replace',
      'damage',
      'hose',
      'clog',
      'sink',
      'tight',
      'loose',
      'repair',
      'suspend',
      'maintain',
      'basic',
      'challenge',
      'occupy',
      'build',
      'assist',
      'reside',
      'duration',
      'supply',
      'domestic',
      'sponge',
      'soap',
      'broom',
      'scrub',
      'wet',
      'step',
      'cleanse',
      'corridor',
      'ventilate',
      'damp',
      'vicinity',
      'inhibit',
      'mold',
      'grow',
      'test',
      'prove',
      'restore',
      'contract¹',
      'provide',
      'warranty',
      'certify',
      'safe',
      'operate',
      'review',
      'expense',
      'agree',
      'incur',
      'bear',
      'liable',
      'lease',
      'deduct',
      'split',
      'cordial',
      'reciprocal',
      'respect',
      'reconcile',
      'concern',
      'cozy',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('短文 NO.36 正文行间词义标注完备、拓展条目丰富且通过语料校验', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-036');
    expect(passage).toBeDefined();

    const result = validatePassage(passage!, catalog);
    expect(result.errors).toEqual([]);

    const compiled = compilePassage(passage!, catalog);
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #46 规划的核心目标词目
    for (const targetId of [
      'dialect',
      'oral',
      'translate',
      'idiom',
      'pronounce',
      'misunderstand',
      'vocabulary',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合方言口述史与翻译核心大纲词目
    for (const id of [
      'visit',
      'remote',
      'countryside',
      'document',
      'history',
      'volunteer',
      'arrive',
      'elder',
      'peasant',
      'cottage',
      'welcome',
      'porch',
      'hospitable',
      'host¹',
      'brew',
      'herb',
      'beverage',
      'pad',
      'activate',
      'audio',
      'gadget',
      'miniature',
      'record',
      'disc',
      'capture',
      'speak',
      'chronicle',
      'discourse',
      'listen',
      'intend',
      'ancient',
      'anecdote',
      'narrate',
      'distinct',
      'murmur',
      'say',
      'mutter',
      'local',
      'proverb',
      'articulate',
      'strange',
      'phrase',
      'peculiar',
      'perplex',
      'struggle',
      'copy',
      'bizarre',
      'riddle',
      'cause',
      'ambiguous',
      'mean¹',
      'literal',
      'warn',
      'frost',
      'ponder',
      'puzzle',
      'feel',
      'baffle',
      'whisper',
      'subtle',
      'humor',
      'perceive',
      'awkward',
      'confuse',
      'proficient',
      'step',
      'forward',
      'broad',
      'grin',
      'elaborate',
      'context',
      'explain',
      'denote',
      'harsh',
      'signify',
      'mutual',
      'solidarity',
      'folk',
      'isolate',
      'noun',
      'verb',
      'express',
      'carry',
      'live¹',
      'culture',
      'mechanic',
      'grammar',
      'convey',
      'adjective',
      'adverb',
      'reflect',
      'collective',
      'wise',
      'serve',
      'emotion',
      'metaphor',
      'endure',
      'rejoice',
      'sudden',
      'insight',
      'compile',
      'verify',
      'organize',
      'manuscript',
      'accurate',
      'heading',
      'compose',
      'thought',
      'preface',
      'render',
      'standard',
      'prose',
      'regard',
      'dust',
      'relic',
      'indispensable',
      'repertoire',
      'heritage',
      'heartfelt',
      'gratitude',
      'offer',
      'tribute',
      'community',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 37 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-037');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Evidence and Fair Trial in a Community Fund Dispute'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(120);

    // 验证包含 Issue #47 规划的核心目标词目
    for (const targetId of [
      'jury',
      'fraud',
      'innocent',
      'attorney',
      'prosecute',
      'crime',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合司法审判与财务凭证核心大纲词目
    for (const id of [
      'scandal',
      'accuse',
      'theft',
      'currency',
      'treasury',
      'plaintiff',
      'indict',
      'suspect',
      'forge',
      'check²',
      'grave',
      'uneasy',
      'cashier',
      'summon',
      'bail',
      'jail',
      'briefcase',
      'refute',
      'allege',
      'malice',
      'cheat',
      'steal',
      'lawyer',
      'stack',
      'voucher',
      'drawer',
      'blunder',
      'routine',
      'oversight',
      'apparent',
      'deficit',
      'upright',
      'deputy',
      'affirm',
      'amount',
      'refund',
      'oath',
      'bar',
      'bystander',
      'swear',
      'truth',
      'interrogate',
      'testimony',
      'clarity',
      'illegal',
      'motive',
      'default',
      'warrant',
      'guilt',
      'standpoint',
      'misfortune',
      'arise',
      'disorder',
      'corrupt',
      'scheme',
      'deliberate',
      'solemn',
      'proclaim',
      'verdict',
      'convict',
      'vague',
      'suspicion',
      'dismiss',
      'suit²',
      'plea',
      'decree',
      'sorrow',
      'lawsuit',
      'just²',
      'fair¹',
      'clearance',
      'discharge',
      'imprison',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 38 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-038');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Reservoir Storage and Ecological Balance in a River Valley'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #48 规划的核心目标词目
    for (const targetId of [
      'dam',
      'reservoir',
      'ecosystem',
      'predator',
      'prey',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合水坝蓄水、野生生态与环境平衡核心大纲词目
    for (const id of [
      'basin',
      'submerge',
      'immerse',
      'fertile',
      'artery',
      'inland',
      'harness',
      'augment',
      'obstruct',
      'depth',
      'rim',
      'steep',
      'bluff',
      'beast',
      'mammal',
      'eagle',
      'hawk',
      'perch',
      'branch',
      'glide',
      'overhead',
      'patrol',
      'snatch',
      'herd',
      'hardy',
      'deer',
      'wander',
      'slope',
      'graze',
      'shrub',
      'haven',
      'reproduce',
      'offspring',
      'vital',
      'lest',
      'disperse',
      'perish',
      'census',
      'vary',
      'salmon',
      'discreet',
      'scope',
      'attribute',
      'population',
      'decline',
      'tentative',
      'deduce',
      'cumulative',
      'correlate',
      'concurrent',
      'irrigate',
      'withdraw',
      'deplete',
      'disturb',
      'counteract',
      'curtail',
      'sanctuary',
      'rehabilitate',
      'coexist',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 39 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-039');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('健康医疗');
    expect(passage!.titleEn).toBe(
      'Recovery, Daily Care, and Autonomy After a Fracture'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #49 规划的核心目标词目
    for (const targetId of [
      'senior',
      'fracture',
      'rehabilitate',
      'medicine',
      'dose',
      'pharmacy',
      'heal',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合骨折康复、配药照护与生活自理核心大纲词目
    for (const id of [
      'loose',
      'indoor',
      'rug',
      'slide',
      'smooth',
      'tile',
      'reside',
      'awkward',
      'tumble',
      'feel',
      'sharp',
      'snap',
      'wrist',
      'clinic',
      'ward',
      'attention',
      'physician',
      'practitioner',
      'examine',
      'sore',
      'flesh',
      'severe',
      'swell',
      'refuse',
      'view',
      'advance',
      'feeble',
      'weak',
      'staff',
      'show',
      'genuine',
      'esteem',
      'assure',
      'moderate',
      'care',
      'cure',
      'ache',
      'converse¹',
      'confer',
      'suit¹',
      'medication',
      'ease',
      'distress',
      'numb',
      'rely',
      'potent',
      'drug',
      'impair',
      'balance',
      'hinder',
      'agree',
      'modest',
      'relieve',
      'capsule',
      'dispense',
      'label',
      'promise',
      'abide',
      'precaution',
      'regarding',
      'fluid',
      'intake',
      'gentle',
      'exercise',
      'regime',
      'steady',
      'recover',
      'phase',
      'avoid',
      'stagger',
      'limp',
      'install',
      'firm¹',
      'rail',
      'corridor',
      'handy',
      'cane',
      'couch',
      'stool',
      'brace',
      'learn',
      'rotate',
      'muscle',
      'grip',
      'fold',
      'towel',
      'brief',
      'span',
      'complete',
      'faint',
      'scar',
      'robust',
      'stroll',
      'tranquil',
      'balcony',
      'wash',
      'dish',
      'fetch',
      'mug',
      'cupboard',
      'call',
      'kin',
      'relative',
      'handle',
      'routine',
      'chore',
      'errand',
      'tempo',
      'prove',
      'old',
      'remain',
      'apt',
      'able',
      'maintain',
      'full',
      'autonomous',
    ]) {
      expect(coveredIds).toContain(id);
    }
  });

  it('主题短文 NO. 40 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-040');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Coastal Geographic Expedition, Orientation, and Gulf Survey'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #50 规划的核心目标词目
    for (const targetId of [
      'peninsula',
      'strait',
      'gulf',
      'mainland',
      'atlas',
      'compass',
      'navigate',
      'latitude',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合沿海考察、航向辨认与海湾测绘核心大纲词目
    for (const id of [
      'embark',
      'harbor',
      'wharf',
      'prepare',
      'coast',
      'geography',
      'expedition',
      'consult',
      'detail',
      'examine',
      'coordinate',
      'grid',
      'calculate',
      'approximate',
      'longitude',
      'alongside',
      'bearing',
      'wear',
      'protect',
      'overcoat',
      'monitor',
      'compact',
      'barometer',
      'secure',
      'watertight',
      'diary',
      'register',
      'noteworthy',
      'landmark',
      'brisk',
      'daylight',
      'crew',
      'scout',
      'irregular',
      'prominent',
      'extend',
      'outward',
      'continent',
      'fringe',
      'sunlight',
      'penetrate',
      'haze',
      'tower',
      'cape',
      'distance',
      'strip',
      'visible',
      'observe',
      'binoculars',
      'brief',
      'glimpse',
      'horizon',
      'skyline',
      'verify',
      'chart',
      'symbol',
      'actual',
      'terrain',
      'vessel',
      'approach',
      'turbulent',
      'narrow',
      'channel',
      'swift',
      'tide',
      'demand',
      'caution',
      'counteract',
      'peril',
      'drift',
      'pilot',
      'care',
      'maneuver',
      'cruise',
      'velocity',
      'knot',
      'heavy',
      'swell',
      'heave',
      'beneath',
      'deck',
      'discipline',
      'steer',
      'propel',
      'craft',
      'safe',
      'intermediate',
      'tow',
      'glide',
      'tranquil',
      'border',
      'broad',
      'tract',
      'shelter',
      'shore',
      'find',
      'visual',
      'measure',
      'depth',
      'coincide',
      'ashore',
      'camp',
      'look',
      'surround',
      'territory',
      'document',
      'route',
      'confidence',
      'practical',
      'survey',
      'inspire',
      'prospect',
      'study',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Mainland = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'mainland'
    );
    expect(p1s1Mainland).toBeDefined();
    if (p1s1Mainland && p1s1Mainland.type === 'annotation') {
      expect(p1s1Mainland.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Grid = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'grid'
    );
    expect(p1s2Grid).toBeDefined();
    if (p1s2Grid && p1s2Grid.type === 'annotation') {
      expect(p1s2Grid.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Compass = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'compass'
    );
    expect(p1s2Compass).toBeDefined();
    if (p1s2Compass && p1s2Compass.type === 'annotation') {
      expect(p1s2Compass.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Horizon = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'horizon'
    );
    expect(p2s3Horizon).toBeDefined();
    if (p2s3Horizon && p2s3Horizon.type === 'annotation') {
      expect(p2s3Horizon.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('主题短文 NO. 41 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-041');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('历史文化');
    expect(passage!.titleEn).toBe(
      'Fossils and Artifacts in the Natural History Museum'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #51 规划的核心目标词目
    for (const targetId of [
      'fossil',
      'dinosaur',
      'skeleton',
      'artifact',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合博物馆参访、古生物骨骼与早期人类手工艺核心大纲词目
    for (const id of [
      'enter',
      'exhibit',
      'wing',
      'flock',
      'enormous',
      'marvel',
      'ancient',
      'spectacle',
      'frame',
      'reveal',
      'stout',
      'rib',
      'arch',
      'spine',
      'hollow',
      'skull',
      'fierce',
      'jaw',
      'sharp',
      'claw',
      'heavy',
      'tail',
      'show',
      'extinct',
      'monster',
      'live¹',
      'disappear',
      'guide',
      'explain',
      'nature',
      'distance',
      'geology',
      'epoch',
      'organic',
      'tissue',
      'decay',
      'remnant',
      'bury',
      'deep',
      'underground',
      'pit',
      'beneath',
      'crust',
      'dissolve',
      'mine²',
      'slow',
      'embed',
      'press²',
      'chemistry',
      'element',
      'preserve',
      'outline',
      'spontaneous',
      'physical',
      'process',
      'conscious',
      'design',
      'forward',
      'inspect',
      'showcase',
      'display',
      'authentic',
      'pattern',
      'clay',
      'pottery',
      'primitive',
      'axe',
      'hunt',
      'blade',
      'ivory',
      'spear',
      'arrow',
      'care',
      'fashion',
      'tribe',
      'clan',
      'scrape',
      'grind',
      'raw',
      'material',
      'cunning',
      'handicraft',
      'produce',
      'practical',
      'weapon',
      'prove',
      'mankind',
      'apply',
      'intellect',
      'contrast',
      'illustrate',
      'fundamental',
      'differ',
      'invent',
      'trait',
      'force',
      'manifest',
      'purpose',
      'observe',
      'learn',
      'identify',
      'recognize',
      'imply',
      'biology',
      'whereas',
      'craft',
      'relic',
      'hint',
      'culture',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证修饰名词的形容词语境词性匹配
    const p1s1Exhibit = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'exhibit'
    );
    expect(p1s1Exhibit).toBeDefined();
    if (p1s1Exhibit && p1s1Exhibit.type === 'annotation') {
      expect(p1s1Exhibit.gloss.startsWith('a.')).toBe(true);
    }

    const p1s1Dinosaur = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'dinosaur'
    );
    expect(p1s1Dinosaur).toBeDefined();
    if (p1s1Dinosaur && p1s1Dinosaur.type === 'annotation') {
      expect(p1s1Dinosaur.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Arch = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'arch'
    );
    expect(p1s2Arch).toBeDefined();
    if (p1s2Arch && p1s2Arch.type === 'annotation') {
      expect(p1s2Arch.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Geology = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'geology'
    );
    expect(p2s1Geology).toBeDefined();
    if (p2s1Geology && p2s1Geology.type === 'annotation') {
      expect(p2s1Geology.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Hunt = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'hunt'
    );
    expect(p3s2Hunt).toBeDefined();
    if (p3s2Hunt && p3s2Hunt.type === 'annotation') {
      expect(p3s2Hunt.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Ivory = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'ivory'
    );
    expect(p3s2Ivory).toBeDefined();
    if (p3s2Ivory && p3s2Ivory.type === 'annotation') {
      expect(p3s2Ivory.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Arrow = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'arrow'
    );
    expect(p3s2Arrow).toBeDefined();
    if (p3s2Arrow && p3s2Arrow.type === 'annotation') {
      expect(p3s2Arrow.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('主题短文 NO. 42 满足主题自然度、词量及行间标注校验规范，覆盖全部规划目标词并实现零超纲词纯大纲覆盖', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-042');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Power Grids and Energy Storage in a Remote Community'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #52 规划的核心目标词目
    for (const targetId of [
      'grid',
      'battery',
      'fuel',
      'utility',
      'meter',
      'insulate',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合偏远微网与储能改造核心大纲词目
    for (const id of [
      'remote',
      'valley',
      'reside',
      'inhabit',
      'bleak',
      'dwell',
      'severe',
      'power',
      'eve',
      'gloom',
      'arrive',
      'household',
      'switch',
      'appliance',
      'cause',
      'sudden',
      'drop',
      'interrupt',
      'local',
      'diesel',
      'engine',
      'consume',
      'shed',
      'resolve',
      'recur',
      'challenge',
      'engineer',
      'administrate',
      'municipal',
      'formulate',
      'ongoing',
      'reform',
      'modern',
      'subsidy',
      'trial',
      'crew',
      'install',
      'auxiliary',
      'store²',
      'outfit',
      'transmit',
      'junction',
      'add',
      'sensitive',
      'relay',
      'protect',
      'fuse',
      'buffer',
      'intermittent',
      'surge',
      'steady',
      'pulse',
      'current',
      'eliminate',
      'supply',
      'lag',
      'meanwhile',
      'practical',
      'act',
      'fortify',
      'expose',
      'manage',
      'finite',
      'resource',
      'seal',
      'hole',
      'gap',
      'attic',
      'damp',
      'cellar',
      'foam',
      'wrap',
      'heat',
      'pipe',
      'radiate',
      'fit',
      'flexible',
      'partition',
      'vent',
      'restrict',
      'inward',
      'chill',
      'retain',
      'interior',
      'comfort',
      'overnight',
      'digit',
      'test',
      'dial',
      'help',
      'technical',
      'quantify',
      'collective',
      'benefit',
      'needle',
      'fluctuate',
      'observe',
      'stable',
      'volt',
      'level',
      'reduce',
      'maximum',
      'watt',
      'peak',
      'measure',
      'tank',
      'stall',
      'prove',
      'effect',
      'curb',
      'waste',
      'achieve',
      'optimum',
      'efficient',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 语境词性匹配专项校验：作定语的名词标注为 a. 形容词；副词以“地”结尾
    const p1s1Power = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'power'
    );
    expect(p1s1Power).toBeDefined();
    if (p1s1Power && p1s1Power.type === 'annotation') {
      expect(p1s1Power.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Diesel = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'diesel'
    );
    expect(p1s2Diesel).toBeDefined();
    if (p1s2Diesel && p1s2Diesel.type === 'annotation') {
      expect(p1s2Diesel.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Battery = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'battery'
    );
    expect(p2s2Battery).toBeDefined();
    if (p2s2Battery && p2s2Battery.type === 'annotation') {
      expect(p2s2Battery.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Storage = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'store²'
    );
    expect(p2s2Storage).toBeDefined();
    if (p2s2Storage && p2s2Storage.type === 'annotation') {
      expect(p2s2Storage.gloss.startsWith('a.')).toBe(true);
    }

    const p4s2Volt = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'volt'
    );
    expect(p4s2Volt).toBeDefined();
    if (p4s2Volt && p4s2Volt.type === 'annotation') {
      expect(p4s2Volt.gloss.startsWith('a.')).toBe(true);
    }

    const p4s2Watt = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'watt'
    );
    expect(p4s2Watt).toBeDefined();
    if (p4s2Watt && p4s2Watt.type === 'annotation') {
      expect(p4s2Watt.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 43《震后山地隧道的安全检查》（passage-043），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-043');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('科技');
    expect(passage!.titleEn).toBe(
      'Post-Earthquake Safety Inspection of a Mountain Tunnel'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #53 规划的核心目标词目
    for (const targetId of ['tunnel', 'steel', 'earthquake', 'blueprint']) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合震后隧道排查与钢构评估核心大纲词目
    for (const id of [
      'grim',
      'aftermath',
      'violent',
      'danger',
      'magnitude',
      'transport',
      'official',
      'motorway',
      'public',
      'safe',
      'appoint',
      'inspect',
      'crew',
      'wear',
      'protect',
      'helmet',
      'sturdy',
      'boot',
      'descend',
      'warn',
      'barrier',
      'passage',
      'steady',
      'glow',
      'emergency',
      'sharp',
      'ray',
      'electricity',
      'flash',
      'pierce',
      'gloom',
      'scatter',
      'dirt',
      'cover',
      'vibrate',
      'shake',
      'enter',
      'carry',
      'old',
      'version',
      'origin',
      'engineer',
      'evaluate',
      'internal',
      'layout',
      'arch',
      'profile',
      'observe',
      'shift',
      'halfway',
      'corridor',
      'special',
      'check¹',
      'mass',
      'beam',
      'curve',
      'arc',
      'reinforce',
      'rod',
      'remain',
      'stable',
      'heavy',
      'bracket',
      'bolt',
      'clamp',
      'grip',
      'ceiling',
      'framework',
      'metal',
      'wedge',
      'slip',
      'inch',
      'prove',
      'intense',
      'press²',
      'deviate',
      'slight',
      'calculate',
      'distinguish',
      'conspicuous',
      'cosmetic',
      'crack',
      'decorate',
      'layer',
      'deep',
      'structure',
      'defect¹',
      'surface',
      'concrete',
      'crumble',
      'detach',
      'fragment',
      'threat',
      'shatter',
      'technical',
      'measure',
      'cavity',
      'depth',
      'drain',
      'ditch',
      'mud',
      'trickle',
      'assume',
      'immediate',
      'analyze',
      'infer',
      'local',
      'displace',
      'factor',
      'explain',
      'disintegrate',
      'emerge',
      'brief',
      'civic',
      'lead¹',
      'act',
      'strict',
      'accordance',
      'code',
      'recommend',
      'temporary',
      'vehicle',
      'ban',
      'advise',
      'amend',
      'damage',
      'implement¹',
      'task',
      'accordingly',
      'underline',
      'preliminary',
      'absolute',
      'guarantee',
      'admit',
      'secondary',
      'shock',
      'endanger',
      'traffic',
      'demand',
      'round',
      'test',
      'series',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证词性依语境准确判定（定语修饰作形容词，副词带“地”等）
    const p1s1Motorway = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'motorway'
    );
    expect(p1s1Motorway).toBeDefined();
    if (p1s1Motorway && p1s1Motorway.type === 'annotation') {
      expect(p1s1Motorway.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Protective = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'protect'
    );
    expect(p1s2Protective).toBeDefined();
    if (p1s2Protective && p1s2Protective.type === 'annotation') {
      expect(p1s2Protective.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Halfway = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'halfway'
    );
    expect(p2s2Halfway).toBeDefined();
    if (p2s2Halfway && p2s2Halfway.type === 'annotation') {
      expect(p2s2Halfway.gloss.startsWith('ad.')).toBe(true);
    }

    const p2s2Steel = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'steel'
    );
    expect(p2s2Steel).toBeDefined();
    if (p2s2Steel && p2s2Steel.type === 'annotation') {
      expect(p2s2Steel.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Ceiling = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'ceiling'
    );
    expect(p2s3Ceiling).toBeDefined();
    if (p2s3Ceiling && p2s3Ceiling.type === 'annotation') {
      expect(p2s3Ceiling.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Slightly = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'slight'
    );
    expect(p2s3Slightly).toBeDefined();
    if (p2s3Slightly && p2s3Slightly.type === 'annotation') {
      expect(p2s3Slightly.gloss.startsWith('ad.')).toBe(true);
    }

    const p3s1Conspicuous = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'conspicuous'
    );
    expect(p3s1Conspicuous).toBeDefined();
    if (p3s1Conspicuous && p3s1Conspicuous.type === 'annotation') {
      expect(p3s1Conspicuous.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Cosmetic = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'cosmetic'
    );
    expect(p3s1Cosmetic).toBeDefined();
    if (p3s1Cosmetic && p3s1Cosmetic.type === 'annotation') {
      expect(p3s1Cosmetic.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Drainage = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'drain'
    );
    expect(p3s2Drainage).toBeDefined();
    if (p3s2Drainage && p3s2Drainage.type === 'annotation') {
      expect(p3s2Drainage.gloss.startsWith('a.')).toBe(true);
    }

    const p4s2Accordingly = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'accordingly'
    );
    expect(p4s2Accordingly).toBeDefined();
    if (p4s2Accordingly && p4s2Accordingly.type === 'annotation') {
      expect(p4s2Accordingly.gloss.startsWith('ad.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 44《家庭遗产与代际传承》（passage-044），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-044');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Family Heritage and Generational Continuity'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(100);

    // 验证包含 Issue #54 规划的核心目标词目
    for (const targetId of ['widow', 'inherit', 'spouse', 'grandchild']) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合家庭遗产、工坊工具与代际传承核心大纲词目
    for (const id of [
      'midst',
      'grief',
      'elder',
      'widow',
      'continue',
      'mourn',
      'spouse',
      'inherit',
      'rural',
      'barn',
      'workshop',
      'oak',
      'bench',
      'carve',
      'timber',
      'weep',
      'soft',
      'recall',
      'fond',
      'memory',
      'stifle',
      'sorrow',
      'sob',
      'adolescent',
      'grandchild',
      'approach',
      'console',
      'tender',
      'affection',
      'listen',
      'release',
      'weary',
      'sigh',
      'nephew',
      'impatient',
      'niece',
      'arrive',
      'deliberate',
      'complex',
      'estate',
      'survey',
      'scatter',
      'heap',
      'iron',
      'nail',
      'thick',
      'pile',
      'dry',
      'glue',
      'wax',
      'paint',
      'urge',
      'sell',
      'property',
      'auction',
      'bitter',
      'quarrel',
      'threat',
      'erupt',
      'anxious',
      'heir',
      'clash',
      'dispose',
      'deem',
      'trouble',
      'possess',
      'hold',
      'token',
      'yearn',
      'preserve',
      'antique',
      'tool',
      'deep',
      'reminiscent',
      'carpenter',
      'fine¹',
      'masterpiece',
      'deliver',
      'eloquent',
      'plea',
      'youth',
      'praise',
      'ingenious',
      'manual',
      'technique',
      'remark',
      'precise',
      'aesthetic',
      'worth',
      'relish',
      'raw',
      'board',
      'argue',
      'create',
      'heritage',
      'sacred',
      'treasure',
      'temporary',
      'commodity',
      'heartfelt',
      'sentiment',
      'step',
      'forward',
      'mediate',
      'dispute',
      'undoubtedly',
      'calm',
      'relative',
      'reach',
      'unanimous',
      'accord',
      'convert',
      'history',
      'live¹',
      'memorial',
      'studio',
      'kin',
      'reunite',
      'celebrate',
      'tradition',
      'craft',
      'vow',
      'oversee',
      'restore',
      'entrust',
      'community',
      'apprentice',
      'impart',
      'skill',
      'acknowledge',
      'owe',
      'mutual',
      'harmony',
      'endure',
      'virtue',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义规范：形容词以“的”结尾，副词以“地”结尾，名词前置修饰标为形容词
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性（定语位置标注为形容词）
    const p1s1Barn = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'barn'
    );
    expect(p1s1Barn).toBeDefined();
    if (p1s1Barn && p1s1Barn.type === 'annotation') {
      expect(p1s1Barn.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Oak = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'oak'
    );
    expect(p1s2Oak).toBeDefined();
    if (p1s2Oak && p1s2Oak.type === 'annotation') {
      expect(p1s2Oak.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Softly = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'soft'
    );
    expect(p1s2Softly).toBeDefined();
    if (p1s2Softly && p1s2Softly.type === 'annotation') {
      expect(p1s2Softly.gloss.startsWith('ad.')).toBe(true);
    }

    const p2s2Iron = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'iron'
    );
    expect(p2s2Iron).toBeDefined();
    if (p2s2Iron && p2s2Iron.type === 'annotation') {
      expect(p2s2Iron.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Antique = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'antique'
    );
    expect(p3s1Antique).toBeDefined();
    if (p3s1Antique && p3s1Antique.type === 'annotation') {
      expect(p3s1Antique.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Manual = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'manual'
    );
    expect(p3s2Manual).toBeDefined();
    if (p3s2Manual && p3s2Manual.type === 'annotation') {
      expect(p3s2Manual.gloss.startsWith('a.')).toBe(true);
    }

    const p4s1Undoubtedly = compiled.paragraphs[3].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'undoubtedly'
    );
    expect(p4s1Undoubtedly).toBeDefined();
    if (p4s1Undoubtedly && p4s1Undoubtedly.type === 'annotation') {
      expect(p4s1Undoubtedly.gloss.startsWith('ad.')).toBe(true);
    }

    const p4s3Community = compiled.paragraphs[3].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'community'
    );
    expect(p4s3Community).toBeDefined();
    if (p4s3Community && p4s3Community.type === 'annotation') {
      expect(p4s3Community.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 45《社区菜园的水位提醒装置》（passage-045），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-045');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'Water Level Indicator for the Community Garden'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(80);

    // 验证包含 Issue #55 规划的核心目标词目
    for (const targetId of ['patent']) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合社区菜园、机械零件、电路指示与开放分享核心大纲词目
    for (const id of [
      'acre',
      'spade',
      'backyard',
      'lawn',
      'nurture',
      'cabbage',
      'garlic',
      'slender',
      'stalk',
      'dew',
      'evaporate',
      'wither',
      'barrel',
      'teenager',
      'junior',
      'crude',
      'prototype',
      'rack',
      'elastic',
      'hang',
      'hook',
      'alloy',
      'shaft',
      'lever',
      'hinge',
      'axis',
      'pin',
      'sway',
      'groove',
      'slot',
      'peg',
      'magnet',
      'coil',
      'transistor',
      'socket',
      'bulb',
      'horn',
      'signal',
      'tick',
      'heavy',
      'saturate',
      'affix',
      'foil',
      'lubricate',
      'revolve',
      'undo',
      'apt',
      'afterward',
      'suggest',
      'patent',
      'monopoly',
      'nonetheless',
      'namely',
      'matter',
      'knowhow',
      'pamphlet',
      'leaflet',
      'propagate',
      'imitate',
      'anew',
      'thereby',
      'invaluable',
      'merit',
      'altogether',
      'alike',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义规范：形容词以“的”结尾，副词以“地”结尾，名词前置修饰标为形容词
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性（定语位置标注为形容词）
    const p1s1Community = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'community'
    );
    expect(p1s1Community).toBeDefined();
    if (p1s1Community && p1s1Community.type === 'annotation') {
      expect(p1s1Community.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Alloy = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'alloy'
    );
    expect(p2s2Alloy).toBeDefined();
    if (p2s2Alloy && p2s2Alloy.type === 'annotation') {
      expect(p2s2Alloy.gloss.startsWith('a.')).toBe(true);
    }

    const p2s4Transistor = compiled.paragraphs[1].sentences[3].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'transistor'
    );
    expect(p2s4Transistor).toBeDefined();
    if (p2s4Transistor && p2s4Transistor.type === 'annotation') {
      expect(p2s4Transistor.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Revolving = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'revolve'
    );
    expect(p3s2Revolving).toBeDefined();
    if (p3s2Revolving && p3s2Revolving.type === 'annotation') {
      expect(p3s2Revolving.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Warn = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'warn'
    );
    expect(p3s3Warn).toBeDefined();
    if (p3s3Warn && p3s3Warn.type === 'annotation') {
      expect(p3s3Warn.gloss.startsWith('a.')).toBe(true);
    }

    const p4s1Afterward = compiled.paragraphs[3].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'afterward'
    );
    expect(p4s1Afterward).toBeDefined();
    if (p4s1Afterward && p4s1Afterward.type === 'annotation') {
      expect(p4s1Afterward.gloss.startsWith('ad.')).toBe(true);
    }

    const p4s2Nonetheless = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'nonetheless'
    );
    expect(p4s2Nonetheless).toBeDefined();
    if (p4s2Nonetheless && p4s2Nonetheless.type === 'annotation') {
      expect(p4s2Nonetheless.gloss.startsWith('ad.')).toBe(true);
    }

    const p4s2Namely = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'namely'
    );
    expect(p4s2Namely).toBeDefined();
    if (p4s2Namely && p4s2Namely.type === 'annotation') {
      expect(p4s2Namely.gloss.startsWith('ad.')).toBe(true);
    }

    const p4s4Alike = compiled.paragraphs[3].sentences[3].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'alike'
    );
    expect(p4s4Alike).toBeDefined();
    if (p4s4Alike && p4s4Alike.type === 'annotation') {
      expect(p4s4Alike.gloss.startsWith('ad.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 46《帝国地图与边疆行政边界》（passage-046），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-046');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('历史文化');
    expect(passage!.titleEn).toBe(
      'Imperial Maps and Frontier Administrative Boundaries'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(80);

    // 验证包含 Issue #56 规划的核心目标词目
    for (const targetId of [
      'colony',
      'empire',
      'imperial',
      'territory',
      'frontier',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合帝国统治、官僚管辖、边疆反抗与历史反思核心大纲词目
    for (const id of [
      'monarchy',
      'sovereign',
      'crown',
      'unify',
      'realm',
      'military',
      'troop',
      'fort',
      'court²',
      'army',
      'battalion',
      'unprecedented',
      'zeal',
      'metropolitan',
      'bureaucrat',
      'magistrate',
      'wield',
      'jurisdiction',
      'statute',
      'treaty',
      'shrewd',
      'diplomat',
      'ally',
      'tariff',
      'foreign',
      'annex',
      'subordinate',
      'overseas',
      'legitimate',
      'behalf',
      'throne',
      'hierarchy',
      'stance',
      'indigenous',
      'homeland',
      'nominal',
      'subject¹',
      'mandate',
      'suppress',
      'dissident',
      'rebel',
      'revolt',
      'surrender',
      'domain',
      'transcend',
      'popular',
      'myth',
      'retrospect',
      'pretext',
      'paradox',
      'abstract',
      'notion',
      'subject²',
      'doctrine',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义规范：形容词以“的”结尾，副词以“地”结尾，名词前置修饰标为形容词
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性与同形异义词目
    const p1s1Territorial = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'territory'
    );
    expect(p1s1Territorial).toBeDefined();
    if (p1s1Territorial && p1s1Territorial.type === 'annotation') {
      expect(p1s1Territorial.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Military = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'military'
    );
    expect(p1s2Military).toBeDefined();
    if (p1s2Military && p1s2Military.type === 'annotation') {
      expect(p1s2Military.gloss.startsWith('a.')).toBe(true);
    }

    const p1s3Court = compiled.paragraphs[0].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'court²'
    );
    expect(p1s3Court).toBeDefined();
    if (p1s3Court && p1s3Court.type === 'annotation') {
      expect(p1s3Court.gloss.startsWith('n.')).toBe(true);
    }

    const p1s3Army = compiled.paragraphs[0].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'army'
    );
    expect(p1s3Army).toBeDefined();
    if (p1s3Army && p1s3Army.type === 'annotation') {
      expect(p1s3Army.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Metropolitan = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'metropolitan'
    );
    expect(p2s1Metropolitan).toBeDefined();
    if (p2s1Metropolitan && p2s1Metropolitan.type === 'annotation') {
      expect(p2s1Metropolitan.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Annexed = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'annex'
    );
    expect(p2s3Annexed).toBeDefined();
    if (p2s3Annexed && p2s3Annexed.type === 'annotation') {
      expect(p2s3Annexed.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Purely = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'pure'
    );
    expect(p3s2Purely).toBeDefined();
    if (p3s2Purely && p3s2Purely.type === 'annotation') {
      expect(p3s2Purely.gloss.startsWith('ad.')).toBe(true);
    }

    const p3s2Subjects = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'subject¹'
    );
    expect(p3s2Subjects).toBeDefined();
    if (p3s2Subjects && p3s2Subjects.type === 'annotation') {
      expect(p3s2Subjects.gloss.startsWith('n.')).toBe(true);
    }

    const p4s3Subject = compiled.paragraphs[3].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'subject²'
    );
    expect(p4s3Subject).toBeDefined();
    if (p4s3Subject && p4s3Subject.type === 'annotation') {
      expect(p4s3Subject.gloss.startsWith('v.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 47《使馆协商与跨境河流条约》（passage-047），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-047');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'Embassy Negotiations and the Cross-Border River Treaty'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(80);

    // 验证包含 Issue #57 规划的核心目标词目
    for (const targetId of [
      'embassy',
      'ambassador',
      'treaty',
      'sanction',
      'overseas',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合外交谈判、河流治理、条约履约与民生保障核心大纲词目
    for (const id of [
      'disarm',
      'avert',
      'turmoil',
      'discord',
      'haul',
      'unilateral',
      'retaliate',
      'eminent',
      'preside',
      'bilateral',
      'accompany',
      'envoy',
      'contingent',
      'congregate',
      'premier',
      'salon',
      'etiquette',
      'faction',
      'levy',
      'embargo',
      'adversary',
      'statesman',
      'appraise',
      'situation',
      'crackdown',
      'paralyze',
      'devastate',
      'cripple',
      'subsistence',
      'boycott',
      'inflict',
      'detriment',
      'toil',
      'barge',
      'plead',
      'jeopardize',
      'punish',
      'futile',
      'arbitrate',
      'forthcoming',
      'allot',
      'prohibit',
      'illicit',
      'surveillance',
      'adhere',
      'breach',
      'forfeit',
      'substance',
      'fine²',
      'tact',
      'poise',
      'humane',
      'foresight',
      'memorandum',
      'press¹',
      'spokeswoman',
      'parliament',
      'endorse',
      'ratify',
      'conducive',
      'bolster',
      'salvage',
      'imminent',
      'plight',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义体例规范：形容词以“的”结尾，副词以“地”结尾
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性与同形异义词目精准对齐
    const p1s1Border = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'border'
    );
    expect(p1s1Border).toBeDefined();
    if (p1s1Border && p1s1Border.type === 'annotation') {
      expect(p1s1Border.gloss.startsWith('a.')).toBe(true);
    }

    const p1s1Tension = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'tense¹'
    );
    expect(p1s1Tension).toBeDefined();
    if (p1s1Tension && p1s1Tension.type === 'annotation') {
      expect(p1s1Tension.gloss.startsWith('n.')).toBe(true);
    }

    const p1s3Premier = compiled.paragraphs[0].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'premier'
    );
    expect(p1s3Premier).toBeDefined();
    if (p1s3Premier && p1s3Premier.type === 'annotation') {
      expect(p1s3Premier.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Carefully = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'care'
    );
    expect(p2s2Carefully).toBeDefined();
    if (p2s2Carefully && p2s2Carefully.type === 'annotation') {
      expect(p2s2Carefully.gloss.startsWith('ad.')).toBe(true);
    }

    const p2s3Cargo = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'cargo'
    );
    expect(p2s3Cargo).toBeDefined();
    if (p2s3Cargo && p2s3Cargo.type === 'annotation') {
      expect(p2s3Cargo.gloss.startsWith('a.')).toBe(true);
    }

    const p3s1Punishing = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'punish'
    );
    expect(p3s1Punishing).toBeDefined();
    if (p3s1Punishing && p3s1Punishing.type === 'annotation') {
      expect(p3s1Punishing.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Breeding = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'breed'
    );
    expect(p3s2Breeding).toBeDefined();
    if (p3s2Breeding && p3s2Breeding.type === 'annotation') {
      expect(p3s2Breeding.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Inspection = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'inspect'
    );
    expect(p3s3Inspection).toBeDefined();
    if (p3s3Inspection && p3s3Inspection.type === 'annotation') {
      expect(p3s3Inspection.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Fine = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'fine²'
    );
    expect(p3s3Fine).toBeDefined();
    if (p3s3Fine && p3s3Fine.type === 'annotation') {
      expect(p3s3Fine.gloss.startsWith('n.')).toBe(true);
    }

    const p4s1Finally = compiled.paragraphs[3].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'final'
    );
    expect(p4s1Finally).toBeDefined();
    if (p4s1Finally && p4s1Finally.type === 'annotation') {
      expect(p4s1Finally.gloss.startsWith('ad.')).toBe(true);
    }

    const p4s2Press = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'press¹'
    );
    expect(p4s2Press).toBeDefined();
    if (p4s2Press && p4s2Press.type === 'annotation') {
      expect(p4s2Press.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 48《老裁缝修补旧毛料外衣》（passage-048），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-048');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe('A Veteran Tailor Mends an Old Wool Coat');
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(80);

    // 验证包含 Issue #58 规划的核心目标词目
    for (const targetId of [
      'tailor',
      'garment',
      'wool',
      'sew',
      'fashion',
      'alternative',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合服装修补、织物结构、长效品质与消费反思核心大纲词目
    for (const id of [
      'old-fashioned',
      'patron',
      'dump',
      'scrap',
      'tear²',
      'sleeve',
      'waist',
      'reckon',
      'casual',
      'vogue',
      'canvas',
      'apron',
      'clothe',
      'textile',
      'merchandise',
      'stuff',
      'dent',
      'wrinkle',
      'mar',
      'exterior',
      'liner',
      'underneath',
      'extravagant',
      'straightforward',
      'prolong',
      'longevity',
      'scissors',
      'trim',
      'tangle',
      'strand',
      'extract',
      'stitch',
      'silk',
      'split',
      'tack',
      'tuck',
      'elbow',
      'button',
      'wax',
      'string',
      'compress',
      'straight',
      'collar',
      'invisible',
      'exquisite',
      'content²',
      'confess',
      'throw',
      'rash',
      'wardrobe',
      'brand-new',
      'substitute',
      'considerate',
      'mindset',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义体例规范：形容词以“的”结尾，副词以“地”结尾
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性与同形异义词目精准对齐
    const p1s1Wool = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'wool'
    );
    expect(p1s1Wool).toBeDefined();
    if (p1s1Wool && p1s1Wool.type === 'annotation') {
      expect(p1s1Wool.gloss.startsWith('a.')).toBe(true);
    }

    const p1s2Tear = compiled.paragraphs[0].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'tear²'
    );
    expect(p1s2Tear).toBeDefined();
    if (p1s2Tear && p1s2Tear.type === 'annotation') {
      expect(p1s2Tear.gloss.startsWith('a.')).toBe(true);
    }

    const p1s3Canvas = compiled.paragraphs[0].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'canvas'
    );
    expect(p1s3Canvas).toBeDefined();
    if (p1s3Canvas && p1s3Canvas.type === 'annotation') {
      expect(p1s3Canvas.gloss.startsWith('a.')).toBe(true);
    }

    const p2s2Underneath = compiled.paragraphs[1].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'underneath'
    );
    expect(p2s2Underneath).toBeDefined();
    if (p2s2Underneath && p2s2Underneath.type === 'annotation') {
      expect(p2s2Underneath.gloss.startsWith('ad.')).toBe(true);
    }

    const p3s2Fine = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'fine¹'
    );
    expect(p3s2Fine).toBeDefined();
    if (p3s2Fine && p3s2Fine.type === 'annotation') {
      expect(p3s2Fine.gloss.startsWith('a.')).toBe(true);
    }

    const p3s2Silk = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'silk'
    );
    expect(p3s2Silk).toBeDefined();
    if (p3s2Silk && p3s2Silk.type === 'annotation') {
      expect(p3s2Silk.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Collar = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'collar'
    );
    expect(p3s3Collar).toBeDefined();
    if (p3s3Collar && p3s3Collar.type === 'annotation') {
      expect(p3s3Collar.gloss.startsWith('a.')).toBe(true);
    }

    const p4s1Content = compiled.paragraphs[3].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'content²'
    );
    expect(p4s1Content).toBeDefined();
    if (p4s1Content && p4s1Content.type === 'annotation') {
      expect(p4s1Content.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('收录主题短文 NO. 49《果园生态防虫与蜜蜂授粉》（passage-049），覆盖核心大纲词目并符合各项编纂指标', () => {
    const passage = PASSAGES.find((p) => p.id === 'passage-049');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('生态环境');
    expect(passage!.titleEn).toBe(
      'An Orchardist Fosters Bees and Natural Insect Balance'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(80);

    // 验证包含 Issue #59 规划的核心目标词目
    for (const targetId of [
      'bee',
      'pesticide',
      'blossom',
      'insect',
      'parasite',
      'spray',
    ]) {
      expect(coveredIds).toContain(targetId);
    }

    // 验证纳入的高契合生态农业、授粉昆虫、生物多样性与自然共生核心大纲词目
    for (const id of [
      'beset',
      'pest',
      'bud',
      'despair',
      'peach',
      'toxic',
      'eradicate',
      'beetle',
      'snail',
      'deadly',
      'kill',
      'benign',
      'degrade',
      'clearing',
      'desolate',
      'deprive',
      'barren',
      'better',
      'botany',
      'contrive',
      'brutal',
      'fence',
      'stump',
      'sow',
      'seed',
      'beckon',
      'dilute',
      'sprinkle',
      'stem¹',
      'bark',
      'repel',
      'bacteria',
      'position',
      'hive',
      'hay',
      'hum',
      'buzz',
      'hover',
      'amid',
      'sting',
      'ant',
      'creep',
      'spider',
      'crawl',
      'sprawl',
      'crouch',
      'devour',
      'invade',
      'mosquito',
      'worm',
      'ample',
      'cluster',
      'bunch',
      'edible',
      'flutter',
      'greenhouse',
      'stray',
      'converge',
      'stubborn',
      'derive',
      'excel',
      'warfare',
      'ensue',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义体例规范：形容词以“的”结尾，副词以“地”结尾
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性与同形异义词目精准对齐
    const p1s1Peach = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'peach'
    );
    expect(p1s1Peach).toBeDefined();
    if (p1s1Peach && p1s1Peach.type === 'annotation') {
      expect(p1s1Peach.gloss.startsWith('a.')).toBe(true);
    }

    const p2s3Stem = compiled.paragraphs[1].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'stem¹'
    );
    expect(p2s3Stem).toBeDefined();
    if (p2s3Stem && p2s3Stem.type === 'annotation') {
      expect(p2s3Stem.gloss.startsWith('n.')).toBe(true);
    }

    const p3s1Bee = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'bee'
    );
    expect(p3s1Bee).toBeDefined();
    if (p3s1Bee && p3s1Bee.type === 'annotation') {
      expect(p3s1Bee.gloss.startsWith('a.')).toBe(true);
    }

    const p3s3Creep = compiled.paragraphs[2].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'creep'
    );
    expect(p3s3Creep).toBeDefined();
    if (p3s3Creep && p3s3Creep.type === 'annotation') {
      expect(p3s3Creep.gloss.startsWith('a.')).toBe(true);
    }

    const p4s3Patient = compiled.paragraphs[3].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'patient¹'
    );
    expect(p4s3Patient).toBeDefined();
    if (p4s3Patient && p4s3Patient.type === 'annotation') {
      expect(p4s3Patient.gloss.startsWith('a.')).toBe(true);
    }
  });

  it('主题短文 NO. 50 满足主题自然度、词量及行间标注校验规范', () => {
    const passage = PASSAGES.find((p) => p.indexLabel === 'NO. 50');
    expect(passage).toBeDefined();
    expect(passage!.topic).toBe('社会生活');
    expect(passage!.titleEn).toBe(
      'A Traveling Circus Brings Awe and Acrobatics to the Town Fair'
    );
    expect(passage!.paragraphs.length).toBe(4);
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
    expect(hasOutOfSyllabusWordsIn(compiled)).toBe(false);

    const coveredIds = coveredHeadwordIdsIn(compiled);
    expect(coveredIds.length).toBeGreaterThanOrEqual(50);

    // 重点验证 Issue #60 规划目标词目
    for (const id of [
      'circus',
      'balloon',
      'parade',
      'amuse',
      'fair²',
      'trumpet',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 重点验证主要新覆盖词目
    for (const id of [
      'caravan',
      'wagon',
      'beloved',
      'grand',
      'dash',
      'banner',
      'merry',
      'band',
      'bang',
      'drum',
      'chorus',
      'chant',
      'melody',
      'pat',
      'tame',
      'camel',
      'rabbit',
      'cage',
      'aerial',
      'feat',
      'leap',
      'rope',
      'clever',
      'ballet',
      'astonish',
      'scream',
      'shout',
      'comic',
      'clown',
      'makeup',
      'rag',
      'cloak',
      'bounce',
      'comedy',
      'bamboo',
      'giggle',
      'laugh',
      'badge',
      'ribbon',
      'thrust',
      'fireworks',
      'blast',
      'glitter',
      'flame',
      'shadow',
      'brilliant',
      'thunder',
      'bow²',
      'toast',
      'awe',
      'awesome',
      'fairy',
      'miracle',
      'beauty',
    ]) {
      expect(coveredIds).toContain(id);
    }

    // 验证行间词义体例规范：形容词以“的”结尾，副词以“地”结尾
    passage!.wordAnnotations.forEach((wa) => {
      if (wa.gloss.startsWith('a.')) {
        const senses = wa.gloss.replace(/^a\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('的')).toBe(true);
        });
      }
      if (wa.gloss.startsWith('ad.')) {
        const senses = wa.gloss.replace(/^ad\.\s*/, '').split('；');
        senses.forEach((s) => {
          expect(s.trim().endsWith('地')).toBe(true);
        });
      }
    });

    // 重点验证特定语境词性与同形异义词目精准对齐
    const p1s1Fair = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'fair²'
    );
    expect(p1s1Fair).toBeDefined();
    if (p1s1Fair && p1s1Fair.type === 'annotation') {
      expect(p1s1Fair.gloss.startsWith('n.')).toBe(true);
    }

    const p1s1Circus = compiled.paragraphs[0].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'circus'
    );
    expect(p1s1Circus).toBeDefined();
    if (p1s1Circus && p1s1Circus.type === 'annotation') {
      expect(p1s1Circus.gloss.startsWith('a.')).toBe(true);
    }

    const p1s3Brass = compiled.paragraphs[0].sentences[2].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'brass'
    );
    expect(p1s3Brass).toBeDefined();
    if (p1s3Brass && p1s3Brass.type === 'annotation') {
      expect(p1s3Brass.gloss.startsWith('a.')).toBe(true);
    }

    const p2s1Rest = compiled.paragraphs[1].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'rest¹'
    );
    expect(p2s1Rest).toBeDefined();
    if (p2s1Rest && p2s1Rest.type === 'annotation') {
      expect(p2s1Rest.gloss.startsWith('v.')).toBe(true);
    }

    const p3s1Stage = compiled.paragraphs[2].sentences[0].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'stage'
    );
    expect(p3s1Stage).toBeDefined();
    if (p3s1Stage && p3s1Stage.type === 'annotation') {
      expect(p3s1Stage.gloss.startsWith('v.')).toBe(true);
    }

    const p3s2Bamboo = compiled.paragraphs[2].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'bamboo'
    );
    expect(p3s2Bamboo).toBeDefined();
    if (p3s2Bamboo && p3s2Bamboo.type === 'annotation') {
      expect(p3s2Bamboo.gloss.startsWith('a.')).toBe(true);
    }

    const p4s2Bow = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'bow²'
    );
    expect(p4s2Bow).toBeDefined();
    if (p4s2Bow && p4s2Bow.type === 'annotation') {
      expect(p4s2Bow.gloss.startsWith('v.')).toBe(true);
    }

    const p4s2Host = compiled.paragraphs[3].sentences[1].tokens.find(
      (t) => t.type === 'annotation' && t.headwordId === 'host¹'
    );
    expect(p4s2Host).toBeDefined();
    if (p4s2Host && p4s2Host.type === 'annotation') {
      expect(p4s2Host.gloss.startsWith('n.')).toBe(true);
    }
  });

  it('PASSAGES 统一收录全部短文（至少 26 篇），ID 与编号格式规范且唯一', () => {
    expect(PASSAGES.length).toBeGreaterThanOrEqual(26);
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();

    PASSAGES.forEach((passage) => {
      expect(passage.id).toMatch(/^passage-\d{3}$/);
      expect(passage.indexLabel).toMatch(/^NO\. \d{2}$/);

      const numFromId = Number(passage.id.replace('passage-', ''));
      const numFromLabel = Number(passage.indexLabel.replace('NO. ', ''));
      expect(numFromId).toBe(numFromLabel);

      expect(seenIds.has(passage.id)).toBe(false);
      expect(seenLabels.has(passage.indexLabel)).toBe(false);
      seenIds.add(passage.id);
      seenLabels.add(passage.indexLabel);
    });
  });
});
