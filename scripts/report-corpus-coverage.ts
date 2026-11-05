import fs from 'node:fs';
import path from 'node:path';
import { PASSAGES, computeCorpusCoverage } from '../src/corpus/index';
import { getDefaultSyllabusCatalog } from '../src/syllabus/index';

function main(): void {
  const catalog = getDefaultSyllabusCatalog();
  const report = computeCorpusCoverage(PASSAGES, catalog);
  const uncoveredEntries = report.uncoveredCoreIds.map((id) => {
    const entry = catalog.byId.get(id);
    if (!entry) throw new Error(`Missing syllabus catalog entry: ${id}`);
    return entry;
  });
  const lines = [
    '# 短文语料待覆盖词目',
    '',
    '> 由 `npm run coverage` 生成。请勿手工编辑；覆盖状态依据短文正文的行间词目标注计算。',
    '',
    `当前覆盖 ${report.coveredCoreIds.size}/${report.totalCoreCount} 个非免注核心大纲词目（${(report.coverageRatio * 100).toFixed(1)}%），尚有 ${uncoveredEntries.length} 个待覆盖。`,
    '',
  ];

  for (const [level, title] of [
    ['cet4', '四级词目'],
    ['cet6', '六级星号词目'],
  ] as const) {
    const entries = uncoveredEntries.filter((entry) => entry.level === level);
    lines.push(`## ${title}（${entries.length}）`, '');
    if (entries.length === 0) {
      lines.push('无', '');
      continue;
    }
    lines.push(...entries.map((entry) => `- \`${entry.id}\``), '');
  }

  const outputPath = path.resolve(
    process.cwd(),
    'docs/corpus/uncovered-headwords.md'
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join('\n').trimEnd()}\n`, 'utf8');
  console.log(
    `Coverage: ${report.coveredCoreIds.size}/${report.totalCoreCount} (${(report.coverageRatio * 100).toFixed(1)}%); ${uncoveredEntries.length} uncovered headwords written to ${path.relative(process.cwd(), outputPath)}`
  );
}

main();
