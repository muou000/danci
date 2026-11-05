import compiledBatch1FirstJson from '../generated/compiled-cet4-batch-1-first.json';
import compiledRemainingPassagesJson from '../generated/compiled-remaining-passages.json';
import type { CompiledPassage } from './index';

export const COMPILED_CET4_BATCH_1_PASSAGES: CompiledPassage[] =
  [
    compiledBatch1FirstJson as CompiledPassage,
    ...(compiledRemainingPassagesJson as CompiledPassage[]).filter(
      (passage) => passage.tier === 'cet4-core'
    ),
  ];

