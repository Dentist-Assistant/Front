export type Arch = "maxillary" | "mandibular";
export type Side = "right" | "left";
export type ToothClass =
  | "central incisor"
  | "lateral incisor"
  | "canine"
  | "first premolar"
  | "second premolar"
  | "first molar"
  | "second molar"
  | "third molar";
export type PrimaryToothClass =
  | "primary central incisor"
  | "primary lateral incisor"
  | "primary canine"
  | "primary first molar"
  | "primary second molar";
export type PalmerQuadrant = "UR" | "UL" | "LL" | "LR";
export type UniversalPrimary = "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|"K"|"L"|"M"|"N"|"O"|"P"|"Q"|"R"|"S"|"T";
export type UniversalIndex = number | UniversalPrimary;

export type Tooth = {
  fdi: string;
  universal?: UniversalIndex;
  palmer: `${PalmerQuadrant}${1|2|3|4|5|6|7|8|1|2|3|4|5}`;
  arch: Arch;
  side: Side;
  name: string;
  className: ToothClass | PrimaryToothClass;
  isPrimary: boolean;
  position: 1|2|3|4|5|6|7|8|1|2|3|4|5;
};

const permClassByPos: Record<number, ToothClass> = {
  1: "central incisor",
  2: "lateral incisor",
  3: "canine",
  4: "first premolar",
  5: "second premolar",
  6: "first molar",
  7: "second molar",
  8: "third molar"
};

const primaryClassByPos: Record<number, PrimaryToothClass> = {
  1: "primary central incisor",
  2: "primary lateral incisor",
  3: "primary canine",
  4: "primary first molar",
  5: "primary second molar"
};

const quadrantMeta = (q: number): { arch: Arch; side: Side; palmer: PalmerQuadrant } => {
  if (q === 1 || q === 5) return { arch: "maxillary", side: "right", palmer: "UR" };
  if (q === 2 || q === 6) return { arch: "maxillary", side: "left", palmer: "UL" };
  if (q === 3 || q === 7) return { arch: "mandibular", side: "left", palmer: "LL" };
  return { arch: "mandibular", side: "right", palmer: "LR" };
};

const universalPermanentByFDI: Record<string, number> = {
  "18": 1, "17": 2, "16": 3, "15": 4, "14": 5, "13": 6, "12": 7, "11": 8,
  "21": 9, "22": 10, "23": 11, "24": 12, "25": 13, "26": 14, "27": 15, "28": 16,
  "38": 17, "37": 18, "36": 19, "35": 20, "34": 21, "33": 22, "32": 23, "31": 24,
  "41": 25, "42": 26, "43": 27, "44": 28, "45": 29, "46": 30, "47": 31, "48": 32
};

const universalPrimaryByFDI: Record<string, UniversalPrimary> = {
  "55": "A", "54": "B", "53": "C", "52": "D", "51": "E",
  "61": "F", "62": "G", "63": "H", "64": "I", "65": "J",
  "75": "K", "74": "L", "73": "M", "72": "N", "71": "O",
  "81": "P", "82": "Q", "83": "R", "84": "S", "85": "T"
};

const TEETH: Record<string, Tooth> = buildTeethIndex();

function buildTeethIndex() {
  const map: Record<string, Tooth> = {};
  for (const q of [1, 2, 3, 4]) {
    for (let p = 1 as 1|2|3|4|5|6|7|8; p <= 8; p++) {
      const code = `${q}${p}`;
      const { arch, side, palmer } = quadrantMeta(q);
      const className = permClassByPos[p];
      const name = `${capitalize(arch)} ${side} ${className}`;
      map[code] = {
        fdi: code,
        universal: universalPermanentByFDI[code],
        palmer: `${palmer}${p}`,
        arch,
        side,
        name,
        className,
        isPrimary: false,
        position: p
      };
    }
  }
  for (const q of [5, 6, 7, 8]) {
    for (let p = 1 as 1|2|3|4|5; p <= 5; p++) {
      const code = `${q}${p}`;
      const { arch, side, palmer } = quadrantMeta(q);
      const className = primaryClassByPos[p];
      const name = `${capitalize(arch)} ${side} ${className}`;
      map[code] = {
        fdi: code,
        universal: universalPrimaryByFDI[code],
        palmer: `${palmer}${p}`,
        arch,
        side,
        name,
        className,
        isPrimary: true,
        position: p
      };
    }
  }
  return map;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const fdiRegex = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/i;

export function isValidFDI(code: unknown): code is string {
  return typeof code === "string" && fdiRegex.test(code);
}

export function getToothByFDI(code: string): Tooth | undefined {
  if (!isValidFDI(code)) return undefined;
  return TEETH[code];
}

export function fdiToUniversal(code: string): UniversalIndex | undefined {
  const t = getToothByFDI(code);
  return t?.universal;
}

export function fdiToPalmer(code: string): string | undefined {
  const t = getToothByFDI(code);
  return t?.palmer;
}

export function getQuadrantLabel(code: string): PalmerQuadrant | undefined {
  const t = getToothByFDI(code);
  if (!t) return undefined;
  return t.palmer.slice(0, 2) as PalmerQuadrant;
}

export function universalToFDI(value: UniversalIndex): string | undefined {
  if (typeof value === "number") {
    for (const [k, v] of Object.entries(universalPermanentByFDI)) {
      if (v === value) return k;
    }
    return undefined;
    }
  for (const [k, v] of Object.entries(universalPrimaryByFDI)) {
    if (v === value) return k;
  }
  return undefined;
}

export function normalizeToFDI(input: string | number): string | undefined {
  if (typeof input === "string") {
    const clean = input.trim().toUpperCase();
    if (isValidFDI(clean)) return clean;
    if (/^[A-T]$/.test(clean)) return universalToFDI(clean as UniversalPrimary);
  } else {
    if (input >= 1 && input <= 32) return universalToFDI(input);
  }
  return undefined;
}

export function formatToothShort(code: string): string {
  const t = getToothByFDI(code);
  if (!t) return "";
  if (t.isPrimary) return `${t.palmer} • ${t.universal}`;
  return `${t.palmer} • #${t.universal}`;
}

export function listFDI(range: "permanent" | "primary" | "all" = "all"): Tooth[] {
  const all = Object.values(TEETH).sort((a, b) => a.fdi.localeCompare(b.fdi));
  if (range === "permanent") return all.filter((t) => !t.isPrimary);
  if (range === "primary") return all.filter((t) => t.isPrimary);
  return all;
}

export const FDI = {
  isValid: isValidFDI,
  get: getToothByFDI,
  toUniversal: fdiToUniversal,
  toPalmer: fdiToPalmer,
  toQuadrant: getQuadrantLabel,
  fromUniversal: universalToFDI,
  normalize: normalizeToFDI,
  formatShort: formatToothShort,
  list: listFDI
};
