import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSyllabusCatalog,
  getDefaultSyllabusCatalog,
  resolveWordToHeadwords,
} from './index';
import { loadSyllabusFromPdf } from './node-extractor';

const OUTLINE_PDF_PATH = path.resolve(process.cwd(), 'outline.pdf');

describe('Seam 1: syllabus — 大纲词表解析', () => {
  it('从 outline.pdf 完整提取 5,418 个大纲词目（4,153 四级 + 1,265 ★六级），保留独立同形异义词并规范为美式拼写', async () => {
    const headwords = await loadSyllabusFromPdf(OUTLINE_PDF_PATH);

    expect(headwords).toHaveLength(5418);

    const cet6 = headwords.filter((h) => h.level === 'cet6');
    const cet4 = headwords.filter((h) => h.level === 'cet4');
    expect(cet6).toHaveLength(1265);
    expect(cet4).toHaveLength(4153);

    // 全部 id 唯一且无哈希冗余
    const uniqueIds = new Set(headwords.map((h) => h.id));
    expect(uniqueIds.size).toBe(5418);
    for (const id of uniqueIds) {
      expect(id).not.toContain('#');
    }

    // 多词大纲词目空格完整保留
    expect(headwords.find((h) => h.id === 'according to')?.headword).toBe(
      'according to'
    );
    expect(headwords.find((h) => h.id === 'baby boom')?.headword).toBe(
      'baby boom'
    );
    expect(headwords.find((h) => h.id === "coup d'état")?.headword).toBe(
      "coup d'état"
    );

    // 同形异义/异音词独立保留
    expect(headwords.find((h) => h.id === 'lead¹')?.headword).toBe('lead¹');
    expect(headwords.find((h) => h.id === 'lead²')?.headword).toBe('lead²');
    expect(headwords.find((h) => h.id === 'minute¹')?.headword).toBe('minute¹');
    expect(headwords.find((h) => h.id === 'minute²')?.headword).toBe('minute²');
    expect(headwords.find((h) => h.id === 'check¹')?.headword).toBe('check¹');
    expect(headwords.find((h) => h.id === 'check²')?.headword).toBe('check²');
    expect(headwords.find((h) => h.id === 'story¹')?.headword).toBe('story¹');
    expect(headwords.find((h) => h.id === 'story²')?.headword).toBe('story²');
    expect(headwords.find((h) => h.id === 'tire¹')?.headword).toBe('tire¹');
    expect(headwords.find((h) => h.id === 'tire²')?.headword).toBe('tire²');
    expect(headwords.find((h) => h.id === 'appropriate¹')?.level).toBe('cet4');
    expect(headwords.find((h) => h.id === 'appropriate²')?.level).toBe('cet6');
    expect(headwords.find((h) => h.id === 'March')?.headword).toBe('March');
    expect(headwords.find((h) => h.id === 'march')?.headword).toBe('march');

    // 英美并列拼写统一规范为美式拼写
    const canonicalForms = new Set(headwords.map((h) => h.headword));
    expect(canonicalForms.has('color')).toBe(true);
    expect(canonicalForms.has('colour')).toBe(false);
    expect(canonicalForms.has('analyze')).toBe(true);
    expect(canonicalForms.has('analyse')).toBe(false);
    expect(canonicalForms.has('center')).toBe(true);
    expect(canonicalForms.has('centre')).toBe(false);
    expect(canonicalForms.has('skeptical')).toBe(true);
    expect(canonicalForms.has('sceptical')).toBe(false);
    expect(canonicalForms.has('plow')).toBe(true);
    expect(canonicalForms.has('plough')).toBe(false);
    expect(canonicalForms.has('program')).toBe(true);
    expect(canonicalForms.has('programme')).toBe(false);
    expect(canonicalForms.has('story²')).toBe(true);
    expect(canonicalForms.has('storey²')).toBe(false);
    expect(canonicalForms.has('while')).toBe(true);
    expect(canonicalForms.has('whilst')).toBe(false);
    expect(canonicalForms.has('airplane')).toBe(true);
    expect(canonicalForms.has('aeroplane')).toBe(false);
  });

  it('划分 600–800 个免注基础词（不含任何 ★ 六级词目），并将 4,600+ 核心大纲词目按真题考频分为 25%–30% 高频词与其余普通大纲词', async () => {
    const headwords = await loadSyllabusFromPdf(OUTLINE_PDF_PATH);
    const catalog = buildSyllabusCatalog(headwords);

    expect(catalog.entries).toHaveLength(5418);

    const exempt = catalog.entries.filter((e) => e.tier === 'exempt');
    const highFreq = catalog.entries.filter((e) => e.tier === 'high-frequency');
    const regular = catalog.entries.filter((e) => e.tier === 'regular');
    const core = catalog.entries.filter((e) => e.tier !== 'exempt');

    // 免注基础词：600–800 个，且 100% ★ 六级词目不在免注之列
    expect(exempt.length).toBeGreaterThanOrEqual(600);
    expect(exempt.length).toBeLessThanOrEqual(800);
    expect(exempt.filter((e) => e.level === 'cet6')).toHaveLength(0);

    // 核心大纲词目：4,600+，包含全部 1,265 个 ★ 六级词目
    expect(core.length).toBeGreaterThanOrEqual(4618);
    expect(core.filter((e) => e.level === 'cet6')).toHaveLength(1265);
    expect(exempt.length + highFreq.length + regular.length).toBe(5418);

    // 高频词占核心大纲词目的 25%–30%（约 1,200–1,400 个）
    const highFreqRatio = highFreq.length / core.length;
    expect(highFreqRatio).toBeGreaterThanOrEqual(0.25);
    expect(highFreqRatio).toBeLessThanOrEqual(0.3);
    expect(highFreq.length).toBeGreaterThanOrEqual(1200);
    expect(highFreq.length).toBeLessThanOrEqual(1400);

    // 典型免注基础词与同形异义进阶词边界校验
    expect(catalog.byId.get('the')?.tier).toBe('exempt');
    expect(catalog.byId.get('and')?.tier).toBe('exempt');
    expect(catalog.byId.get('people')?.tier).toBe('exempt');
    expect(catalog.byId.get('can¹')?.tier).toBe('exempt');
    expect(catalog.byId.get('can²')?.tier).not.toBe('exempt');
    expect(catalog.byId.get('just¹')?.tier).toBe('exempt');
    expect(catalog.byId.get('just²')?.tier).not.toBe('exempt');
    expect(catalog.byId.get('March')?.tier).toBe('exempt');
    expect(catalog.byId.get('march')?.tier).not.toBe('exempt');

    // 典型历年四六级真题高频词校验
    expect(catalog.byId.get('acknowledge')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('alleviate')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('foster')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('implement¹')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('promote')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('vulnerable')?.tier).toBe('high-frequency');
    expect(catalog.byId.get('sustain')?.tier).toBe('high-frequency');
  });

  it('生成确定性且互不重叠的批次分配清单：四级核心大纲词目均分为 4 批（每批约 850 词目），1,265 个 ★ 六级词目均分为 2 批（每批 630–635 词目）', async () => {
    const headwords = await loadSyllabusFromPdf(OUTLINE_PDF_PATH);
    const catalogA = buildSyllabusCatalog(headwords);
    const catalogB = buildSyllabusCatalog(headwords);

    // 确定性：两次生成的批次清单完全一致
    expect(catalogA.batches).toEqual(catalogB.batches);

    const cet4Batches = catalogA.batches.filter((b) => b.level === 'cet4');
    const cet6Batches = catalogA.batches.filter((b) => b.level === 'cet6');
    expect(cet4Batches).toHaveLength(4);
    expect(cet6Batches).toHaveLength(2);

    // 四级每批约 850 个核心大纲词目（830–880），六级每批 630–635 个 ★ 六级词目
    for (const b of cet4Batches) {
      expect(b.headwordIds.length).toBeGreaterThanOrEqual(830);
      expect(b.headwordIds.length).toBeLessThanOrEqual(880);
    }
    for (const b of cet6Batches) {
      expect(b.headwordIds.length).toBeGreaterThanOrEqual(630);
      expect(b.headwordIds.length).toBeLessThanOrEqual(635);
    }

    // 全部 6 批互不重叠，且并集精确等于全部非免注核心大纲词目（含全部 1,265 个 ★ 六级词目）
    const allBatchIds = catalogA.batches.flatMap((b) => b.headwordIds);
    const uniqueBatchIds = new Set(allBatchIds);
    expect(uniqueBatchIds.size).toBe(allBatchIds.length);

    const expectedCoreIds = catalogA.entries
      .filter((e) => e.tier !== 'exempt')
      .map((e) => e.id);
    expect(allBatchIds.length).toBe(expectedCoreIds.length);
    expect(cet6Batches.reduce((sum, b) => sum + b.headwordIds.length, 0)).toBe(
      1265
    );
    for (const id of expectedCoreIds) {
      expect(uniqueBatchIds.has(id)).toBe(true);
    }
  });

  it('将常规屈折变形、不规则变形、英美拼写及大纲派生词准确归并至大纲词目，且预构建大纲词表目录与 PDF 解析结果完全一致', async () => {
    const headwords = await loadSyllabusFromPdf(OUTLINE_PDF_PATH);
    const pdfCatalog = buildSyllabusCatalog(headwords);
    const staticCatalog = getDefaultSyllabusCatalog();

    expect(staticCatalog.entries).toEqual(pdfCatalog.entries);
    expect(staticCatalog.batches).toEqual(pdfCatalog.batches);

    const resolveIds = (word: string) =>
      resolveWordToHeadwords(word, staticCatalog).map((e) => e.id);

    // 常规屈折变形
    expect(resolveIds('emerged')).toContain('emerge');
    expect(resolveIds('strategies')).toContain('strategy');
    expect(resolveIds('stopped')).toContain('stop');
    expect(resolveIds('bigger')).toContain('big');
    expect(resolveIds('implementing')).toContain('implement¹');
    expect(resolveIds('seriously')).toContain('serious');

    // 不规则词形变化与所有格
    expect(resolveIds('is')).toContain('be');
    expect(resolveIds('went')).toContain('go');
    expect(resolveIds('children')).toContain('child');
    expect(resolveIds('led')).toEqual(expect.arrayContaining(['lead¹']));
    expect(resolveIds("today's")).toContain('today');

    // 英美拼写与大纲同族派生词
    expect(resolveIds('colour')).toContain('color');
    expect(resolveIds('sceptical')).toContain('skeptical');
    expect(resolveIds('expectations')).toContain('expect');
    expect(resolveIds('employees')).toContain('employ');
    expect(resolveIds('anxiety')).toContain('anxious');

    // 非大纲生词返回空数组
    expect(resolveIds('neuroplasticity')).toEqual([]);
  });
});

