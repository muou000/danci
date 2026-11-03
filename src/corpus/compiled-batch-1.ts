import compiledBatch1FirstJson from '../data/compiled-cet4-batch-1-first.json';
import compiledBatch1RestJson from '../data/compiled-cet4-batch-1-rest.json';
import type { CompiledPassage } from './index';

export const COMPILED_CET4_BATCH_1_PASSAGES: CompiledPassage[] =
  [compiledBatch1FirstJson, ...compiledBatch1RestJson] as CompiledPassage[];

