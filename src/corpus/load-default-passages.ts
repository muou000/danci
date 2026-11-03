import remainingBatchUrl from '../data/compiled-cet4-batch-1-rest.json?url';
import type { CompiledPassage } from './index';
import { COMPILED_CET4_BATCH_1_FIRST_PASSAGE } from './compiled-initial';
import { COMPILED_DEMO_PASSAGES } from './compiled-demos';

export async function loadDefaultPassages(): Promise<CompiledPassage[]> {
  const response = await fetch(remainingBatchUrl);
  if (!response.ok) {
    throw new Error(`Unable to load passage corpus (${response.status}).`);
  }

  const remainingPassages = (await response.json()) as CompiledPassage[];
  return [
    COMPILED_CET4_BATCH_1_FIRST_PASSAGE,
    ...remainingPassages,
    ...COMPILED_DEMO_PASSAGES.filter(
      (passage) => passage.tier === 'cet6-advanced'
    ),
  ];
}
