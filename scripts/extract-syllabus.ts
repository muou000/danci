import fs from 'node:fs';
import path from 'node:path';
import {
  DEMO_PASSAGES,
  CET4_BATCH_1_PASSAGES,
  compilePassage,
} from '../src/corpus/index';
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
  const batchesOutPath = path.join(dataDir, 'batch-manifests.json');
  const compiledDemosOutPath = path.join(dataDir, 'compiled-demos.json');
  const compiledB1OutPath = path.join(dataDir, 'compiled-cet4-batch-1.json');
  const compiledB1FirstOutPath = path.join(
    dataDir,
    'compiled-cet4-batch-1-first.json'
  );
  const compiledB1RestOutPath = path.join(
    dataDir,
    'compiled-cet4-batch-1-rest.json'
  );

  fs.writeFileSync(
    catalogOutPath,
    JSON.stringify({ entries: catalog.entries, batches: catalog.batches }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    batchesOutPath,
    JSON.stringify(catalog.batches, null, 2) + '\n',
    'utf8'
  );

  const compiledDemos = DEMO_PASSAGES.map((p) => compilePassage(p, catalog));
  fs.writeFileSync(
    compiledDemosOutPath,
    JSON.stringify(compiledDemos, null, 2) + '\n',
    'utf8'
  );

  const compiledB1 = CET4_BATCH_1_PASSAGES.map((p) => compilePassage(p, catalog));
  if (compiledB1.length === 0) {
    throw new Error('CET-4 batch 1 must contain at least one passage.');
  }
  fs.writeFileSync(
    compiledB1OutPath,
    JSON.stringify(compiledB1, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    compiledB1FirstOutPath,
    JSON.stringify(compiledB1[0], null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    compiledB1RestOutPath,
    JSON.stringify(compiledB1.slice(1), null, 2) + '\n',
    'utf8'
  );

  const cet6Count = catalog.entries.filter((e) => e.level === 'cet6').length;
  const exemptCount = catalog.entries.filter((e) => e.tier === 'exempt').length;
  const highCount = catalog.entries.filter((e) => e.tier === 'high-frequency').length;
  const regularCount = catalog.entries.filter((e) => e.tier === 'regular').length;

  console.log(
    `Extracted ${catalog.entries.length} headwords (${cet6Count} ★ CET-6): exempt=${exemptCount}, high-frequency=${highCount}, regular=${regularCount}`
  );
  console.log(`Precompiled ${compiledDemos.length} demo passages to compiled-demos.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
