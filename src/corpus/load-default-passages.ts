import remainingPassagesUrl from '../generated/compiled-remaining-passages.json?url';
import type { CompiledPassage } from './index';
import { COMPILED_CET4_BATCH_1_FIRST_PASSAGE } from './compiled-initial';

export async function loadDefaultPassages(): Promise<CompiledPassage[]> {
  const response = await fetch(remainingPassagesUrl);
  if (!response.ok) {
    throw new Error(`Unable to load passage corpus (${response.status}).`);
  }

  const remainingPassages = (await response.json()) as CompiledPassage[];
  return [COMPILED_CET4_BATCH_1_FIRST_PASSAGE, ...remainingPassages];
}
