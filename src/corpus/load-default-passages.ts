import passageCatalogJson from '../generated/compiled-passage-catalog.json';
import passageSearchIndexUrl from '../generated/compiled-search-index.json?url';
import type { CompiledPassage, PassageCatalogEntry } from './index';
import type { PassageContentRepository } from '../use-passage-corpus';
import type { PassageSearchIndex } from '../passage-library';
import { COMPILED_FIRST_PASSAGE } from './compiled-initial';

const passageUrls = import.meta.glob<string>(
  '../generated/passages/passage-*.json',
  { query: '?url', import: 'default', eager: true }
);
const passageUrlById = new Map(
  Object.entries(passageUrls).map(([path, url]) => [
    path.split('/').at(-1)?.replace(/\.json$/, '') ?? '',
    url,
  ])
);

async function fetchJson<T>(url: string, description: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${description} (${response.status}).`);
  }
  return (await response.json()) as T;
}

export const DEFAULT_PASSAGE_CATALOG =
  passageCatalogJson as PassageCatalogEntry[];

export const defaultPassageRepository: PassageContentRepository = {
  catalog: DEFAULT_PASSAGE_CATALOG,
  loadPassage(passageId) {
    if (passageId === COMPILED_FIRST_PASSAGE.id) {
      return Promise.resolve(COMPILED_FIRST_PASSAGE);
    }
    const url = passageUrlById.get(passageId);
    if (!url) return Promise.reject(new Error(`Unknown passage: ${passageId}`));
    return fetchJson<CompiledPassage>(url, `passage ${passageId}`);
  },
  loadSearchIndex() {
    return fetchJson<PassageSearchIndex>(
      passageSearchIndexUrl,
      'passage search index'
    );
  },
};

export async function loadDefaultPassages(): Promise<CompiledPassage[]> {
  return Promise.all(
    DEFAULT_PASSAGE_CATALOG.map((passage) =>
      defaultPassageRepository.loadPassage(passage.id)
    )
  );
}
