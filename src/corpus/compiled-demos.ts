import compiledDemosJson from '../data/compiled-demos.json';
import type { CompiledPassage } from './index';

export const COMPILED_DEMO_PASSAGES: CompiledPassage[] =
  compiledDemosJson as CompiledPassage[];
