/**
 * Montant en toutes lettres pour les reçus : 12 050 centimes →
 * « cent vingt euros et cinquante centimes ».
 */
const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. `final` : le nombre termine le mot (« quatre-vingts » prend alors son s). */
function belowHundred(value: number, final: boolean): string {
  if (value < 20) return UNITS[value];
  if (value < 70) {
    const ten = TENS[Math.floor(value / 10)];
    const unit = value % 10;
    if (unit === 0) return ten;
    return unit === 1 ? `${ten} et un` : `${ten}-${UNITS[unit]}`;
  }
  if (value < 80) {
    // soixante-dix… soixante et onze… soixante-dix-neuf
    const rest = value - 60;
    return rest === 11 ? "soixante et onze" : `soixante-${UNITS[rest]}`;
  }
  const rest = value - 80;
  if (rest === 0) return final ? "quatre-vingts" : "quatre-vingt";
  return `quatre-vingt-${UNITS[rest]}`;
}

/** 0 à 999. */
function belowThousand(value: number, final: boolean): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds === 0) return belowHundred(rest, final);
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;
  // « deux cents », mais « deux cent un » et « deux cent mille ».
  if (rest === 0) return hundreds > 1 && final ? `${head}s` : head;
  return `${head} ${belowHundred(rest, final)}`;
}

/** Nombre entier en toutes lettres, de 0 à 999 999 999. */
export function numberInWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999) return String(value);
  if (value === 0) return UNITS[0];

  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const rest = value % 1000;
  const parts: string[] = [];

  // « million » est un nom : « quatre-vingts millions », « deux cents millions ».
  if (millions > 0) parts.push(`${belowThousand(millions, true)} ${millions > 1 ? "millions" : "million"}`);
  // « mille » est invariable et ne s'accorde pas : « quatre-vingt mille », « mille ».
  if (thousands > 0) parts.push(thousands === 1 ? "mille" : `${belowThousand(thousands, false)} mille`);
  if (rest > 0) parts.push(belowThousand(rest, true));
  return parts.join(" ");
}

/** « cent vingt euros », « un euro et cinq centimes », « deux millions d'euros ». */
export function amountInWords(cents: number): string {
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;

  const roundMillions = euros >= 1_000_000 && euros % 1_000_000 === 0;
  const euroWord = roundMillions ? "d'euros" : euros > 1 ? "euros" : "euro";
  const eurosText = `${numberInWords(euros)} ${euroWord}`;
  if (rest === 0) return eurosText;

  const centsText = `${numberInWords(rest)} ${rest > 1 ? "centimes" : "centime"}`;
  return euros === 0 ? centsText : `${eurosText} et ${centsText}`;
}
