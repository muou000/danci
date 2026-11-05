import fs from 'node:fs';
import path from 'node:path';
import {
  CET4_BATCH_1_PASSAGES,
  DEMO_PASSAGES,
  compilePassage,
} from '../src/corpus/index';
import { getDefaultSyllabusCatalog } from '../src/syllabus/index';

function writeJson(outputDir: string, filename: string, value: unknown): void {
  fs.writeFileSync(
    path.join(outputDir, filename),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function main(): void {
  const outputDir = path.resolve(process.cwd(), 'src/generated');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const filename of [
    'compiled-cet4-batch-1-rest.json',
    'compiled-demo-cet4.json',
    'compiled-demo-cet6.json',
  ]) {
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }

  const catalog = getDefaultSyllabusCatalog();
  const compiledPassages = CET4_BATCH_1_PASSAGES.map((passage) =>
    compilePassage(passage, catalog)
  );
  if (compiledPassages.length === 0) {
    throw new Error('CET-4 batch 1 must contain at least one passage.');
  }

  const cet6DemoSource = DEMO_PASSAGES.find(
    (passage) => passage.id === 'demo-cet6-002'
  );
  if (!cet6DemoSource) {
    throw new Error('The CET-6 demo passage must be present.');
  }
  const cet6Demo = compilePassage(cet6DemoSource, catalog);

  writeJson(outputDir, 'compiled-cet4-batch-1-first.json', compiledPassages[0]);
  writeJson(outputDir, 'compiled-remaining-passages.json', [
    ...compiledPassages.slice(1),
    cet6Demo,
  ]);
}

main();
