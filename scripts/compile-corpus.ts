import fs from 'node:fs';
import path from 'node:path';
import {
  PASSAGES,
  compilePassage,
  summarizePassage,
} from '../src/corpus/index';
import { getDefaultSyllabusCatalog } from '../src/syllabus/index';
import { buildPassageSearchIndex } from '../src/passage-library';

function writeJson(outputDir: string, filename: string, value: unknown): void {
  fs.writeFileSync(
    path.join(outputDir, filename),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function main(): void {
  const outputDir = path.resolve(process.cwd(), 'src/generated');
  fs.rmSync(outputDir, { recursive: true, force: true });
  const passagesDir = path.join(outputDir, 'passages');
  fs.mkdirSync(passagesDir, { recursive: true });

  const catalog = getDefaultSyllabusCatalog();
  const compiledPassages = PASSAGES.map((passage) =>
    compilePassage(passage, catalog)
  );
  if (compiledPassages.length === 0) {
    throw new Error('Passages corpus must contain at least one passage.');
  }

  writeJson(outputDir, 'compiled-first-passage.json', compiledPassages[0]);
  for (const passage of compiledPassages.slice(1)) {
    writeJson(passagesDir, `${passage.id}.json`, passage);
  }
  writeJson(
    outputDir,
    'compiled-passage-catalog.json',
    compiledPassages.map(summarizePassage)
  );
  writeJson(
    outputDir,
    'compiled-search-index.json',
    buildPassageSearchIndex(compiledPassages)
  );
}

main();
