import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_PASSAGES,
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
    'compiled-cet4-batch-1-first.json',
    'compiled-cet4-batch-1-rest.json',
    'compiled-demo-cet4.json',
    'compiled-demo-cet6.json',
  ]) {
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }

  const catalog = getDefaultSyllabusCatalog();
  const compiledPassages = ALL_PASSAGES.map((passage) =>
    compilePassage(passage, catalog)
  );
  if (compiledPassages.length === 0) {
    throw new Error('Passages corpus must contain at least one passage.');
  }

  writeJson(outputDir, 'compiled-first-passage.json', compiledPassages[0]);
  writeJson(
    outputDir,
    'compiled-remaining-passages.json',
    compiledPassages.slice(1)
  );
}

main();
