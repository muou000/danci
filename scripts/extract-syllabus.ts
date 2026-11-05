import fs from 'node:fs';
import path from 'node:path';
import { buildSyllabusCatalog } from '../src/syllabus/index';
import { loadSyllabusFromPdf } from '../src/syllabus/node-extractor';

async function main() {
  const rootDir = process.cwd();
  const pdfPath = path.resolve(rootDir, 'outline.pdf');
  const dataDir = path.resolve(rootDir, 'src/data');
  fs.mkdirSync(dataDir, { recursive: true });

  const headwords = await loadSyllabusFromPdf(pdfPath);
  const catalog = buildSyllabusCatalog(headwords);

  const catalogOutPath = path.join(dataDir, 'syllabus-catalog.json');

  fs.writeFileSync(
    catalogOutPath,
    JSON.stringify({ entries: catalog.entries, batches: catalog.batches }, null, 2) + '\n',
    'utf8'
  );
  const cet6Count = catalog.entries.filter((e) => e.level === 'cet6').length;
  const exemptCount = catalog.entries.filter((e) => e.tier === 'exempt').length;
  const highCount = catalog.entries.filter((e) => e.tier === 'high-frequency').length;
  const regularCount = catalog.entries.filter((e) => e.tier === 'regular').length;

  console.log(
    `Extracted ${catalog.entries.length} headwords (${cet6Count} ★ CET-6): exempt=${exemptCount}, high-frequency=${highCount}, regular=${regularCount}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
