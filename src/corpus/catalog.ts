import type { CompiledPassage } from './index';

export interface PassageCatalogEntry {
  id: string;
  indexLabel: string;
  topic: string;
  titleZh: string;
  titleEn: string;
  annotationItemKeys: string[];
}

export function summarizePassage(
  passage: CompiledPassage
): PassageCatalogEntry {
  const annotationItemKeys = new Set<string>();
  for (const paragraph of passage.paragraphs) {
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens) {
        if (token.type === 'annotation') annotationItemKeys.add(token.itemKey);
      }
    }
  }

  return {
    id: passage.id,
    indexLabel: passage.indexLabel,
    topic: passage.topic,
    titleZh: passage.titleZh,
    titleEn: passage.titleEn,
    annotationItemKeys: Array.from(annotationItemKeys),
  };
}
