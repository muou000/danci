import syllabusCatalogJson from '../data/syllabus-catalog.json';
import {
  EXEMPT_HEADWORD_IDS,
  HIGH_FREQUENCY_HEADWORD_IDS,
} from './grading-data';

export type SyllabusLevel = 'cet4' | 'cet6';
export type VocabTier = 'exempt' | 'high-frequency' | 'regular';

export interface CatalogEntry extends SyllabusHeadword {
  tier: VocabTier;
}

export interface SyllabusCatalog {
  entries: CatalogEntry[];
  byId: Map<string, CatalogEntry>;
}

export interface RawSyllabusRow {
  page: number;
  hasStar: boolean;
  headwordRaw: string;
  derivedRaw: string[];
}

export interface SyllabusHeadword {
  id: string;
  headword: string;
  baseWord: string;
  homographIndex?: number;
  level: SyllabusLevel;
  raw: string;
  page: number;
  variants: string[];
  derivedWords: string[];
}

const DUAL_HEADWORD_EXPANSIONS: Record<
  string,
  Array<{ headword: string; variants: string[] }>
> = {
  // ★ CET-6 dual entries (+2)
  "coup (d'état)": [
    { headword: 'coup', variants: ['coup'] },
    { headword: "coup d'état", variants: ["coup d'état", "coup d'etat"] },
  ],
  "coup(d'état)": [
    { headword: 'coup', variants: ['coup'] },
    { headword: "coup d'état", variants: ["coup d'état", "coup d'etat"] },
  ],
  'steward(ess)': [
    { headword: 'steward', variants: ['steward'] },
    { headword: 'stewardess', variants: ['stewardess'] },
  ],
  // CET-4 dual entries (+39)
  'a/an': [
    { headword: 'a', variants: ['a'] },
    { headword: 'an', variants: ['an'] },
  ],
  'administer/administrate': [
    { headword: 'administer', variants: ['administer'] },
    { headword: 'administrate', variants: ['administrate'] },
  ],
  'afterward(s)': [
    { headword: 'afterward', variants: ['afterward'] },
    { headword: 'afterwards', variants: ['afterwards'] },
  ],
  'amid(st)': [
    { headword: 'amid', variants: ['amid'] },
    { headword: 'amidst', variants: ['amidst'] },
  ],
  'among(st)': [
    { headword: 'among', variants: ['among'] },
    { headword: 'amongst', variants: ['amongst'] },
  ],
  'anybody/anyone': [
    { headword: 'anybody', variants: ['anybody'] },
    { headword: 'anyone', variants: ['anyone'] },
  ],
  'apartment/apt.': [
    { headword: 'apartment', variants: ['apartment'] },
    { headword: 'apt.', variants: ['apt.', 'apt'] },
  ],
  'auto(mobile)': [
    { headword: 'auto', variants: ['auto'] },
    { headword: 'automobile', variants: ['automobile'] },
  ],
  'ax(e)': [
    { headword: 'ax', variants: ['ax'] },
    { headword: 'axe', variants: ['axe'] },
  ],
  'barbecue/BBQ': [
    { headword: 'barbecue', variants: ['barbecue'] },
    { headword: 'BBQ', variants: ['BBQ', 'bbq'] },
  ],
  'bicycle/bike': [
    { headword: 'bicycle', variants: ['bicycle'] },
    { headword: 'bike', variants: ['bike'] },
  ],
  'blond(e)': [
    { headword: 'blond', variants: ['blond'] },
    { headword: 'blonde', variants: ['blonde'] },
  ],
  'chairman/chairperson': [
    { headword: 'chairman', variants: ['chairman'] },
    { headword: 'chairperson', variants: ['chairperson'] },
  ],
  'dad(dy)': [
    { headword: 'dad', variants: ['dad'] },
    { headword: 'daddy', variants: ['daddy'] },
  ],
  'disk/disc': [
    { headword: 'disk', variants: ['disk'] },
    { headword: 'disc', variants: ['disc'] },
  ],
  'dormitory/dorm': [
    { headword: 'dormitory', variants: ['dormitory'] },
    { headword: 'dorm', variants: ['dorm'] },
  ],
  'gym(nasium)': [
    { headword: 'gym', variants: ['gym'] },
    { headword: 'gymnasium', variants: ['gymnasium'] },
  ],
  'hamburger/burger': [
    { headword: 'hamburger', variants: ['hamburger'] },
    { headword: 'burger', variants: ['burger'] },
  ],
  'hero/heroine': [
    { headword: 'hero', variants: ['hero'] },
    { headword: 'heroine', variants: ['heroine'] },
  ],
  'homosexual/homo': [
    { headword: 'homosexual', variants: ['homosexual'] },
    { headword: 'homo', variants: ['homo'] },
  ],
  'influenza/flu': [
    { headword: 'influenza', variants: ['influenza'] },
    { headword: 'flu', variants: ['flu'] },
  ],
  'kilogram(me)/kilo': [
    { headword: 'kilogram', variants: ['kilogram', 'kilogramme'] },
    { headword: 'kilo', variants: ['kilo'] },
  ],
  'laboratory/lab': [
    { headword: 'laboratory', variants: ['laboratory'] },
    { headword: 'lab', variants: ['lab'] },
  ],
  'landlord/landlady': [
    { headword: 'landlord', variants: ['landlord'] },
    { headword: 'landlady', variants: ['landlady'] },
  ],
  'math(ematics)/maths': [
    { headword: 'math', variants: ['math', 'maths'] },
    { headword: 'mathematics', variants: ['mathematics'] },
  ],
  'memorandum/memo': [
    { headword: 'memorandum', variants: ['memorandum'] },
    { headword: 'memo', variants: ['memo'] },
  ],
  'mom(my)': [
    { headword: 'mom', variants: ['mom'] },
    { headword: 'mommy', variants: ['mommy'] },
  ],
  'often/oftentimes': [
    { headword: 'often', variants: ['often'] },
    { headword: 'oftentimes', variants: ['oftentimes'] },
  ],
  'photo(graph)': [
    { headword: 'photo', variants: ['photo'] },
    { headword: 'photograph', variants: ['photograph'] },
  ],
  'prince/princess': [
    { headword: 'prince', variants: ['prince'] },
    { headword: 'princess', variants: ['princess'] },
  ],
  'railway/railroad': [
    { headword: 'railway', variants: ['railway'] },
    { headword: 'railroad', variants: ['railroad'] },
  ],
  'refrigerator/fridge': [
    { headword: 'refrigerator', variants: ['refrigerator'] },
    { headword: 'fridge', variants: ['fridge'] },
  ],
  'spaceship/spacecraft': [
    { headword: 'spaceship', variants: ['spaceship'] },
    { headword: 'spacecraft', variants: ['spacecraft'] },
  ],
  'spokesman/spokeswoman': [
    { headword: 'spokesman', variants: ['spokesman'] },
    { headword: 'spokeswoman', variants: ['spokeswoman'] },
  ],
  'sportsman/sportswoman': [
    { headword: 'sportsman', variants: ['sportsman'] },
    { headword: 'sportswoman', variants: ['sportswoman'] },
  ],
  'technology/tech': [
    { headword: 'technology', variants: ['technology'] },
    { headword: 'tech', variants: ['tech'] },
  ],
  'telephone/phone': [
    { headword: 'telephone', variants: ['telephone'] },
    { headword: 'phone', variants: ['phone'] },
  ],
  'television/TV': [
    { headword: 'television', variants: ['television'] },
    { headword: 'TV', variants: ['TV', 'tv'] },
  ],
  'toward(s)': [
    { headword: 'toward', variants: ['toward'] },
    { headword: 'towards', variants: ['towards'] },
  ],
};

const SINGLE_SPELLING_NORMALIZATIONS: Record<
  string,
  { headword: string; variants: string[] }
> = {
  'airplane/aeroplane': { headword: 'airplane', variants: ['airplane', 'aeroplane'] },
  'alumin(i)um': { headword: 'aluminum', variants: ['aluminum', 'aluminium'] },
  'appal(l)': { headword: 'appall', variants: ['appall', 'appal'] },
  'armo(u)r': { headword: 'armor', variants: ['armor', 'armour'] },
  'catalog(ue)': { headword: 'catalog', variants: ['catalog', 'catalogue'] },
  'check²/cheque': { headword: 'check²', variants: ['check', 'cheque'] },
  'cigaret(te)': { headword: 'cigarette', variants: ['cigarette', 'cigaret'] },
  'colo(u)r': { headword: 'color', variants: ['color', 'colour'] },
  'dialog(ue)': { headword: 'dialog', variants: ['dialog', 'dialogue'] },
  'dispatch/despatch': { headword: 'dispatch', variants: ['dispatch', 'despatch'] },
  'distil(l)': { headword: 'distill', variants: ['distill', 'distil'] },
  'encyclop(a)edia': { headword: 'encyclopedia', variants: ['encyclopedia', 'encyclopaedia'] },
  'endeavo(u)r': { headword: 'endeavor', variants: ['endeavor', 'endeavour'] },
  'enrol(l)': { headword: 'enroll', variants: ['enroll', 'enrol'] },
  'esthetic/aesthetic': { headword: 'esthetic', variants: ['esthetic', 'aesthetic'] },
  'favo(u)r': { headword: 'favor', variants: ['favor', 'favour'] },
  'flavo(u)r': { headword: 'flavor', variants: ['flavor', 'flavour'] },
  'fulfil(l)': { headword: 'fulfill', variants: ['fulfill', 'fulfil'] },
  'gasoline/petrol': { headword: 'gasoline', variants: ['gasoline', 'petrol'] },
  'glamo(u)r': { headword: 'glamor', variants: ['glamor', 'glamour'] },
  'gram(me)': { headword: 'gram', variants: ['gram', 'gramme'] },
  'gray/grey': { headword: 'gray', variants: ['gray', 'grey'] },
  'harbo(u)r': { headword: 'harbor', variants: ['harbor', 'harbour'] },
  'hono(u)r': { headword: 'honor', variants: ['honor', 'honour'] },
  'humo(u)r': { headword: 'humor', variants: ['humor', 'humour'] },
  'inquire/enquire': { headword: 'inquire', variants: ['inquire', 'enquire'] },
  'instal(l)': { headword: 'install', variants: ['install', 'instal'] },
  'instal(l)ment': { headword: 'installment', variants: ['installment', 'instalment'] },
  'insure/ensure': { headword: 'insure', variants: ['insure', 'ensure'] },
  'Internet/internet': { headword: 'Internet', variants: ['Internet', 'internet'] },
  'jail/gaol': { headword: 'jail', variants: ['jail', 'gaol'] },
  'labo(u)r': { headword: 'labor', variants: ['labor', 'labour'] },
  'maneuver/manoeuvre': { headword: 'maneuver', variants: ['maneuver', 'manoeuvre'] },
  'mo(u)ld': { headword: 'mold', variants: ['mold', 'mould'] },
  'neighbo(u)r': { headword: 'neighbor', variants: ['neighbor', 'neighbour'] },
  'odo(u)r': { headword: 'odor', variants: ['odor', 'odour'] },
  'plough/plow': { headword: 'plow', variants: ['plow', 'plough'] },
  'practise/-ice': { headword: 'practice', variants: ['practice', 'practise'] },
  'program(me)': { headword: 'program', variants: ['program', 'programme'] },
  'rigo(u)r': { headword: 'rigor', variants: ['rigor', 'rigour'] },
  'rumo(u)r': { headword: 'rumor', variants: ['rumor', 'rumour'] },
  'skeptical/sceptical': { headword: 'skeptical', variants: ['skeptical', 'sceptical'] },
  'specialty/speciality': { headword: 'specialty', variants: ['specialty', 'speciality'] },
  'stor(e)y²': { headword: 'story²', variants: ['story', 'storey'] },
  'sulfur/sulphur': { headword: 'sulfur', variants: ['sulfur', 'sulphur'] },
  'tumo(u)r': { headword: 'tumor', variants: ['tumor', 'tumour'] },
  'tyre/tire': { headword: 'tire²', variants: ['tire', 'tyre'] },
  'vapo(u)r': { headword: 'vapor', variants: ['vapor', 'vapour'] },
  'wag(g)on': { headword: 'wagon', variants: ['wagon', 'waggon'] },
  'while/whilst': { headword: 'while', variants: ['while', 'whilst'] },
};

function expandCellForms(cell: string): string[] {
  const clean = stripSuperscript(cell);
  if (clean.includes('/-')) {
    const [us, suffixRaw] = clean.split('/-');
    const suffix = suffixRaw;
    let uk = us;
    if (us.endsWith('yze') && suffix === 'yse') uk = us.slice(0, -3) + 'yse';
    else if (us.endsWith('ize') && suffix === 'ise') uk = us.slice(0, -3) + 'ise';
    else if (us.endsWith('ization') && suffix === 'sation') uk = us.slice(0, -6) + 'sation';
    else if (us.endsWith('izational') && suffix === 'sational') uk = us.slice(0, -8) + 'sational';
    else if (us.endsWith('izer') && suffix === 'iser') uk = us.slice(0, -4) + 'iser';
    else if (us.endsWith('ter') && suffix === 'tre') uk = us.slice(0, -3) + 'tre';
    else if (us.endsWith('ber') && suffix === 'bre') uk = us.slice(0, -3) + 'bre';
    else if (us.endsWith('er') && suffix === 're') uk = us.slice(0, -2) + 're';
    else if (us.endsWith('se') && suffix === 'ce') uk = us.slice(0, -2) + 'ce';
    else if (us.endsWith('ce') && suffix === 'se') uk = us.slice(0, -2) + 'se';
    else if (us.endsWith('zy') && suffix === 'sy') uk = us.slice(0, -2) + 'sy';
    else if (us.endsWith('or') && suffix === 'er') uk = us.slice(0, -2) + 'er';
    else if (us.endsWith('ction') && suffix === 'xion') uk = us.slice(0, -5) + 'xion';
    else if (us.endsWith('sius') && suffix === 'cius') uk = us.slice(0, -4) + 'cius';
    return Array.from(new Set([us, uk]));
  }
  if (clean.includes('/')) {
    return clean.split('/').flatMap((part) => expandCellForms(part));
  }
  const parenMatch = clean.match(/^([^(]+)\(([^)]+)\)(.*)$/);
  if (parenMatch) {
    const [, pre, mid, post] = parenMatch;
    return Array.from(new Set([`${pre}${post}`, `${pre}${mid}${post}`]));
  }
  return [clean];
}

function stripSuperscript(word: string): string {
  return word.replace(/[¹²³]/g, '');
}

function extractHomographIndex(word: string): number | undefined {
  if (word.endsWith('¹')) return 1;
  if (word.endsWith('²')) return 2;
  if (word.endsWith('³')) return 3;
  return undefined;
}

export function parseSyllabusRows(rows: RawSyllabusRow[]): SyllabusHeadword[] {
  const result: SyllabusHeadword[] = [];
  const usedIds = new Map<string, number>();

  for (const row of rows) {
    const level: SyllabusLevel = row.hasStar ? 'cet6' : 'cet4';
    const derivedWords = Array.from(
      new Set(row.derivedRaw.flatMap((d) => expandCellForms(d)))
    );

    let entries: Array<{ headword: string; variants: string[] }>;
    const dual = DUAL_HEADWORD_EXPANSIONS[row.headwordRaw];
    if (dual) {
      entries = dual;
    } else if (SINGLE_SPELLING_NORMALIZATIONS[row.headwordRaw]) {
      entries = [SINGLE_SPELLING_NORMALIZATIONS[row.headwordRaw]];
    } else if (row.headwordRaw.includes('/-')) {
      const forms = expandCellForms(row.headwordRaw);
      entries = [{ headword: forms[0], variants: forms }];
    } else if (row.headwordRaw === 'check' && row.page === 41) {
      entries = [{ headword: 'check¹', variants: ['check'] }];
    } else if (row.headwordRaw === 'story' && row.page === 130) {
      entries = [{ headword: 'story¹', variants: ['story'] }];
    } else if (row.headwordRaw === 'tire' && row.page === 137) {
      entries = [{ headword: 'tire¹', variants: ['tire'] }];
    } else {
      entries = [
        {
          headword: row.headwordRaw,
          variants: [stripSuperscript(row.headwordRaw)],
        },
      ];
    }

    for (const entry of entries) {
      let id = entry.headword;
      if (usedIds.has(id)) {
        const count = (usedIds.get(id) ?? 1) + 1;
        usedIds.set(id, count);
        id = `${entry.headword}#${row.headwordRaw}`;
      } else {
        usedIds.set(id, 1);
      }

      const homographIndex = extractHomographIndex(entry.headword);
      const baseWord = stripSuperscript(entry.headword);

      result.push({
        id,
        headword: entry.headword,
        baseWord,
        ...(homographIndex !== undefined ? { homographIndex } : {}),
        level,
        raw: row.headwordRaw,
        page: row.page,
        variants: Array.from(new Set([baseWord, ...entry.variants])),
        derivedWords,
      });
    }
  }

  return result;
}

const EXEMPT_SET = new Set<string>(EXEMPT_HEADWORD_IDS);
const HIGH_FREQ_SET = new Set<string>(HIGH_FREQUENCY_HEADWORD_IDS);

export function buildSyllabusCatalog(
  headwords: SyllabusHeadword[]
): SyllabusCatalog {
  const entries: CatalogEntry[] = headwords.map((h) => {
    const tier: VocabTier =
      h.level === 'cet4' && EXEMPT_SET.has(h.id)
        ? 'exempt'
        : HIGH_FREQ_SET.has(h.id)
          ? 'high-frequency'
          : 'regular';
    return { ...h, tier };
  });

  const byId = new Map<string, CatalogEntry>(entries.map((e) => [e.id, e]));
  return { entries, byId };
}

let cachedDefaultCatalog: SyllabusCatalog | null = null;

export function getDefaultSyllabusCatalog(): SyllabusCatalog {
  if (cachedDefaultCatalog) return cachedDefaultCatalog;
  const raw = syllabusCatalogJson as {
    entries: CatalogEntry[];
  };
  const byId = new Map<string, CatalogEntry>(
    raw.entries.map((e) => [e.id, e])
  );
  cachedDefaultCatalog = {
    entries: raw.entries,
    byId,
  };
  return cachedDefaultCatalog;
}

const IRREGULAR_LEMMAS: Record<string, string[]> = {
  am: ['be'],
  is: ['be'],
  are: ['be'],
  was: ['be'],
  were: ['be'],
  been: ['be'],
  being: ['be'],
  has: ['have'],
  had: ['have'],
  having: ['have'],
  does: ['do'],
  did: ['do'],
  done: ['do'],
  doing: ['do'],
  went: ['go'],
  gone: ['go'],
  going: ['go'],
  led: ['lead¹'],
  children: ['child'],
  men: ['man'],
  women: ['woman'],
  feet: ['foot'],
  teeth: ['tooth'],
  mice: ['mouse'],
  geese: ['goose'],
  oxen: ['ox'],
  lives: ['life', 'live¹'],
  leaves: ['leaf', 'leave'],
  wives: ['wife'],
  knives: ['knife'],
  wolves: ['wolf'],
  halves: ['half'],
  selves: ['self'],
  ourselves: ['ourselves'],
  themselves: ['themselves'],
  yourselves: ['yourself'],
  took: ['take'],
  taken: ['take'],
  gave: ['give'],
  given: ['give'],
  knew: ['know'],
  known: ['know'],
  wrote: ['write'],
  written: ['write'],
  spoke: ['speak'],
  spoken: ['speak'],
  broke: ['break'],
  broken: ['break'],
  chose: ['choose'],
  chosen: ['choose'],
  rose: ['rise'],
  risen: ['rise'],
  arose: ['arise'],
  arisen: ['arise'],
  fell: ['fall¹'],
  fallen: ['fall¹'],
  held: ['hold'],
  kept: ['keep'],
  left: ['leave'],
  lost: ['lose'],
  made: ['make'],
  meant: ['mean¹'],
  met: ['meet'],
  paid: ['pay'],
  said: ['say'],
  saw: ['see'],
  seen: ['see'],
  sent: ['send'],
  sat: ['sit'],
  slept: ['sleep'],
  spent: ['spend'],
  stood: ['stand'],
  taught: ['teach'],
  thought: ['think'],
  told: ['tell'],
  understood: ['understand'],
  won: ['win'],
  built: ['build'],
  bought: ['buy'],
  brought: ['bring'],
  caught: ['catch'],
  fought: ['fight'],
  found: ['find'],
  felt: ['feel'],
  began: ['begin'],
  begun: ['begin'],
  ran: ['run'],
  came: ['come'],
  became: ['become'],
  overcame: ['overcome'],
  grew: ['grow'],
  grown: ['grow'],
  threw: ['throw'],
  thrown: ['throw'],
  drew: ['draw'],
  drawn: ['draw'],
  flew: ['fly¹'],
  flown: ['fly¹'],
  wore: ['wear'],
  worn: ['wear'],
  tore: ['tear²'],
  torn: ['tear²'],
  bore: ['bear', 'bore¹'],
  borne: ['bear'],
  born: ['bear', 'born'],
  sought: ['seek'],
  dealt: ['deal¹'],
  laid: ['lay'],
  lain: ['lie¹'],
  underwent: ['undergo'],
  undergone: ['undergo'],
  undertook: ['undertake'],
  undertaken: ['undertake'],
  withdrew: ['withdraw'],
  withdrawn: ['withdraw'],
  withstood: ['withstand'],
  strove: ['strive'],
  striven: ['strive'],
  shrank: ['shrink'],
  shrunk: ['shrink'],
  sank: ['sink'],
  sunk: ['sink'],
  sprang: ['spring'],
  sprung: ['spring'],
  forbade: ['forbid'],
  forbidden: ['forbid'],
  forgave: ['forgive'],
  forgiven: ['forgive'],
  froze: ['freeze'],
  frozen: ['freeze'],
  hid: ['hide'],
  hidden: ['hide'],
  shook: ['shake'],
  shaken: ['shake'],
  stole: ['steal'],
  stolen: ['steal'],
  struck: ['strike'],
  swore: ['swear'],
  sworn: ['swear'],
  woke: ['wake'],
  woken: ['wake'],
  wove: ['weave'],
  woven: ['weave'],
  hung: ['hang'],
  dug: ['dig'],
  fed: ['feed'],
  fled: ['flee'],
  bled: ['bleed'],
  sped: ['speed'],
  bred: ['breed'],
  shot: ['shoot'],
  shut: ['shut'],
  hurt: ['hurt'],
  put: ['put'],
  cut: ['cut'],
  hit: ['hit'],
  let: ['let'],
  set: ['set'],
  spread: ['spread'],
  cost: ['cost'],
  cast: ['cast'],
  broadcast: ['broadcast'],
  burst: ['burst'],
  split: ['split'],
  quit: ['quit'],
  rid: ['rid'],
  shed: ['shed'],
  slid: ['slide'],
  bound: ['bind', 'bound¹', 'bound²', 'bound³'],
  wound: ['wind²', 'wound'],
  ground: ['grind', 'ground'],
  criteria: ['criterion'],
  phenomena: ['phenomenon'],
  analyses: ['analyze'],
  crises: ['crisis'],
  theses: ['thesis'],
  hypotheses: ['hypothesis'],
  stimuli: ['stimulus'],
  fungi: ['fungus'],
  curricula: ['curriculum'],
  bacteria: ['bacterium'],
  media: ['medium', 'media'],
  better: ['good', 'well²', 'better'],
  best: ['good', 'well²', 'best'],
  worse: ['bad', 'ill', 'worse'],
  worst: ['bad', 'ill', 'worst'],
  further: ['far', 'further'],
  furthest: ['far'],
  farther: ['far'],
  farthest: ['far'],
  elder: ['old', 'elder'],
  eldest: ['old'],
  less: ['little', 'less'],
  least: ['little', 'least'],
};

const CONTRACTION_BASE: Record<string, string> = {
  "won't": 'will',
  "can't": 'can',
  "cannot": 'can',
  "shan't": 'shall',
  "don't": 'do',
  "doesn't": 'do',
  "didn't": 'do',
  "isn't": 'be',
  "aren't": 'be',
  "wasn't": 'be',
  "weren't": 'be',
  "hasn't": 'have',
  "haven't": 'have',
  "hadn't": 'have',
  "wouldn't": 'would',
  "shouldn't": 'should',
  "couldn't": 'could',
  "mustn't": 'must',
  "mightn't": 'might',
  "needn't": 'need',
  "let's": 'let',
  "i'm": 'i',
  "you're": 'you',
  "we're": 'we',
  "they're": 'they',
  "i've": 'i',
  "you've": 'you',
  "we've": 'we',
  "they've": 'they',
  "i'll": 'i',
  "you'll": 'you',
  "he'll": 'he',
  "she'll": 'she',
  "we'll": 'we',
  "they'll": 'they',
  "it'll": 'it',
  "i'd": 'i',
  "you'd": 'you',
  "he'd": 'he',
  "she'd": 'she',
  "we'd": 'we',
  "they'd": 'they',
  "it's": 'it',
  "that's": 'that',
  "there's": 'there',
  "here's": 'here',
  "what's": 'what',
  "who's": 'who',
  "where's": 'where',
};

interface CatalogIndex {
  lowerMap: Map<string, CatalogEntry[]>;
  exactIdMap: Map<string, CatalogEntry>;
}

const catalogIndexCache = new WeakMap<SyllabusCatalog, CatalogIndex>();

function getCatalogIndex(catalog: SyllabusCatalog): CatalogIndex {
  const cached = catalogIndexCache.get(catalog);
  if (cached) return cached;

  const lowerMap = new Map<string, CatalogEntry[]>();
  const addForm = (form: string, entry: CatalogEntry) => {
    const key = form.toLowerCase();
    const list = lowerMap.get(key);
    if (!list) {
      lowerMap.set(key, [entry]);
    } else if (!list.some((x) => x.id === entry.id)) {
      list.push(entry);
    }
  };

  for (const entry of catalog.entries) {
    addForm(entry.baseWord, entry);
    for (const v of entry.variants) addForm(v, entry);
    for (const d of entry.derivedWords) addForm(d, entry);
  }

  const built: CatalogIndex = { lowerMap, exactIdMap: catalog.byId };
  catalogIndexCache.set(catalog, built);
  return built;
}

function generateCandidateStems(lower: string): string[] {
  const candidates = new Set<string>([lower]);

  const addWithUkUs = (stem: string) => {
    if (!stem || stem.length < 1) return;
    candidates.add(stem);
    if (stem.endsWith('our') && stem.length > 4) {
      candidates.add(stem.slice(0, -3) + 'or');
    }
    if (stem.endsWith('ise') && stem.length > 4) {
      candidates.add(stem.slice(0, -3) + 'ize');
    }
    if (stem.endsWith('yse') && stem.length > 4) {
      candidates.add(stem.slice(0, -3) + 'yze');
    }
    if (stem.endsWith('isation') && stem.length > 8) {
      candidates.add(stem.slice(0, -7) + 'ization');
    }
    if (stem.endsWith('re') && stem.length > 4 && !stem.endsWith('ere')) {
      candidates.add(stem.slice(0, -2) + 'er');
    }
  };

  addWithUkUs(lower);

  // Plurals & 3rd-person singulars
  if (lower.endsWith('ies') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ves') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -3) + 'f');
    addWithUkUs(lower.slice(0, -3) + 'fe');
  }
  if (/(?:ses|zes|xes|ches|shes|oes)$/.test(lower) && lower.length > 4) {
    addWithUkUs(lower.slice(0, -2));
  }
  if (lower.endsWith('s') && !/(?:ss|us|is)$/.test(lower) && lower.length > 2) {
    addWithUkUs(lower.slice(0, -1));
  }

  // -ed past / participle
  if (lower.endsWith('ied') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ed') && lower.length > 3) {
    const noEd = lower.slice(0, -2);
    const noD = lower.slice(0, -1);
    addWithUkUs(noEd);
    addWithUkUs(noD);
    addWithUkUs(noEd + 'e');
    if (noEd.length >= 3 && noEd[noEd.length - 1] === noEd[noEd.length - 2]) {
      addWithUkUs(noEd.slice(0, -1));
    }
  }

  // -ing progressive / gerund
  if (lower.endsWith('ying') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -4) + 'ie');
  }
  if (lower.endsWith('ing') && lower.length > 4) {
    const noIng = lower.slice(0, -3);
    addWithUkUs(noIng);
    addWithUkUs(noIng + 'e');
    if (
      noIng.length >= 3 &&
      noIng[noIng.length - 1] === noIng[noIng.length - 2]
    ) {
      addWithUkUs(noIng.slice(0, -1));
    }
  }

  // -er / -est comparatives & superlatives
  if (lower.endsWith('ier') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('iest') && lower.length > 5) {
    addWithUkUs(lower.slice(0, -4) + 'y');
  }
  if (lower.endsWith('er') && lower.length > 4) {
    const noEr = lower.slice(0, -2);
    addWithUkUs(noEr);
    addWithUkUs(lower.slice(0, -1));
    if (noEr.length >= 3 && noEr[noEr.length - 1] === noEr[noEr.length - 2]) {
      addWithUkUs(noEr.slice(0, -1));
    }
  }
  if (lower.endsWith('est') && lower.length > 5) {
    const noEst = lower.slice(0, -3);
    addWithUkUs(noEst);
    addWithUkUs(lower.slice(0, -2));
    if (
      noEst.length >= 3 &&
      noEst[noEst.length - 1] === noEst[noEst.length - 2]
    ) {
      addWithUkUs(noEst.slice(0, -1));
    }
  }

  // Productive transparent -ly (per outline.pdf p.20 notes)
  if (lower.endsWith('ily') && lower.length > 4) {
    addWithUkUs(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ally') && lower.length > 6) {
    addWithUkUs(lower.slice(0, -4) + 'al');
    addWithUkUs(lower.slice(0, -4));
  }
  if (lower.endsWith('ly') && lower.length > 4) {
    const noLy = lower.slice(0, -2);
    addWithUkUs(noLy);
    if (lower.endsWith('bly') || lower.endsWith('ply') || lower.endsWith('tly')) {
      addWithUkUs(lower.slice(0, -1) + 'e');
    }
  }

  return Array.from(candidates);
}

export function resolveWordToHeadwords(
  token: string,
  catalog: SyllabusCatalog = getDefaultSyllabusCatalog()
): CatalogEntry[] {
  const normalized = token
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9'.]+$/g, '');
  if (!normalized) return [];

  const { lowerMap, exactIdMap } = getCatalogIndex(catalog);
  const matched = new Map<string, CatalogEntry>();

  const collect = (entries: CatalogEntry[] | undefined, preserveCase: string) => {
    if (!entries) return;
    const isCapitalized = /^[A-Z]/.test(preserveCase);
    for (const entry of entries) {
      if (
        !isCapitalized &&
        /^[A-Z]/.test(entry.baseWord) &&
        entry.baseWord !== 'Internet' &&
        entry.baseWord !== 'TV' &&
        entry.baseWord !== 'BBQ'
      ) {
        continue;
      }
      matched.set(entry.id, entry);
    }
  };

  let working = normalized;
  const lowerFull = working.toLowerCase();

  if (CONTRACTION_BASE[lowerFull]) {
    working = CONTRACTION_BASE[lowerFull];
  } else if (working.endsWith("'s") || working.endsWith("'S")) {
    working = working.slice(0, -2);
  } else if (working.endsWith("s'") || working.endsWith("S'")) {
    working = working.slice(0, -1);
  }

  const lower = working.toLowerCase();

  // Irregular lookup
  const irregTargets = IRREGULAR_LEMMAS[lower];
  if (irregTargets) {
    for (const target of irregTargets) {
      const exact = exactIdMap.get(target);
      if (exact) {
        matched.set(exact.id, exact);
      } else {
        collect(lowerMap.get(target.toLowerCase()), working);
      }
    }
  }

  // Stem lookup
  for (const stem of generateCandidateStems(lower)) {
    collect(lowerMap.get(stem), working);
  }

  return Array.from(matched.values());
}
