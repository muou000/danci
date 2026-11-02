import fs from 'node:fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  parseSyllabusRows,
  type RawSyllabusRow,
  type SyllabusHeadword,
} from './index';

const SUPERSCRIPT_MAP: Record<string, string> = {
  '１': '¹',
  '２': '²',
  '３': '³',
  '1': '¹',
  '2': '²',
  '3': '³',
};

interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
  width?: number;
}

export async function loadSyllabusFromPdf(
  pdfPath: string
): Promise<SyllabusHeadword[]> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, password: '' }).promise;

  const rawRows: RawSyllabusRow[] = [];

  for (let p = 21; p <= 149; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (
      tc.items as Array<PdfTextItem | Record<string, unknown>>
    ).filter(
      (it): it is PdfTextItem =>
        'str' in it &&
        typeof it.str === 'string' &&
        it.str !== '' &&
        Array.isArray(it.transform) &&
        it.transform[5] > 75 &&
        it.transform[5] < 685 &&
        it.transform[4] < 495
    );

    const ys: number[] = [];
    for (const it of items) {
      if (it.height < 7 || !it.str.trim()) continue;
      if (!ys.some((y) => Math.abs(y - it.transform[5]) < 4)) {
        ys.push(it.transform[5]);
      }
    }
    ys.sort((a, b) => b - a);

    for (const ry of ys) {
      const rItems = items
        .filter((it) =>
          it.height < 7
            ? it.transform[5] >= ry && it.transform[5] - ry < 7.5
            : Math.abs(it.transform[5] - ry) < 4
        )
        .sort((a, b) => a.transform[4] - b.transform[4]);

      const rawJoin = rItems.map((i) => i.str).join('');
      if (p === 149 && rawJoin.includes('５４１８')) continue;

      const hasStar = rItems.some((i) => i.str === '★');
      const cells: string[] = [];
      let cur = '';
      let prevRight: number | null = null;

      for (const it of rItems) {
        if (it.str === '★') continue;
        if (it.str.includes(' ')) {
          if (it.str === ' ' && (it.width || 0) < 5 && it.transform[4] < 150) {
            cur += ' ';
            prevRight = it.transform[4] + (it.width || 3);
            continue;
          }
          const parts = it.str.split(' ');
          for (let k = 0; k < parts.length; k++) {
            if (k > 0 && cur) {
              cells.push(cur.trim());
              cur = '';
              prevRight = null;
            }
            if (parts[k]) {
              cur += parts[k];
              prevRight = it.transform[4] + (it.width || 5);
            }
          }
          continue;
        }

        const gap = prevRight !== null ? it.transform[4] - prevRight : 0;
        if (gap > 3.5 && cur) {
          cells.push(cur.trim());
          cur = '';
        }

        const ch = (
          it.height < 7 ? SUPERSCRIPT_MAP[it.str] ?? it.str : it.str
        )
          .replace(/Ｇ/g, '-')
          .replace(/．/g, '.')
          .replace(/[\uDBC0-\uDBFF][\uDC00-\uDFFF]/g, "'");
        cur += ch;
        prevRight = it.transform[4] + (it.width || 4.5);
      }
      if (cur.trim()) cells.push(cur.trim());

      if (cells.length > 0) {
        let headwordRaw = cells[0];
        const derivedRaw = cells.slice(1);

        // Normalize known multi-word spacing collapsed during font-box extraction
        if (headwordRaw === 'accordingto') {
          headwordRaw = 'according to';
        } else if (headwordRaw === 'babyboom') {
          headwordRaw = 'baby boom';
        } else if (headwordRaw === "coup(d'état)" || headwordRaw === 'coup(détat)') {
          headwordRaw = "coup (d'état)";
        } else if (headwordRaw.endsWith(' e') && headwordRaw.startsWith('esthetic')) {
          headwordRaw = headwordRaw.slice(0, -2);
          derivedRaw.unshift('esthetics/aesthetics');
        } else if (headwordRaw.endsWith(' r') && headwordRaw.startsWith('refrigerator')) {
          headwordRaw = headwordRaw.slice(0, -2);
        }

        rawRows.push({
          page: p,
          hasStar,
          headwordRaw,
          derivedRaw,
        });
      }
    }
  }

  return parseSyllabusRows(rawRows);
}
