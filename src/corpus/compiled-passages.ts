import compiledFirstPassageJson from '../generated/compiled-first-passage.json';
import compiledRemainingPassagesJson from '../generated/compiled-remaining-passages.json';
import type { CompiledPassage } from './index';

export const COMPILED_PASSAGES: CompiledPassage[] = [
  compiledFirstPassageJson as CompiledPassage,
  ...(compiledRemainingPassagesJson as CompiledPassage[]),
];
