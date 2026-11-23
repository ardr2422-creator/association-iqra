/**
 * Validation de tout ce qui vient du navigateur. Une action serveur est une
 * adresse publique : ses arguments sont de type `unknown` tant que zod ne les
 * a pas vérifiés.
 */
import { z } from "zod";
import { isIsoDay } from "@/lib/days";
import { MAX_AMOUNT_CENTS, parseAmount } from "@/lib/payments";

/** Identifiant d'une ligne (cuid ou identifiant généré) : lettres, chiffres, tiret bas. */
export const idSchema = z.string().regex(/^[a-z0-9_]{1,64}$/i);

/** Caractères invisibles ou trompeurs : contrôle, formatage (zéro-largeur, sens d'écriture), usage privé, « lettres » vides. */
export const DECEPTIVE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}ᅟᅠ⠀ㅤﾠ]/u;
/** Comme ci-dessus, mais le retour à la ligne est permis (adresses, notes). */
const DECEPTIVE_EXCEPT_NEWLINE = /(?!\n)[\p{Cc}\p{Cf}\p{Co}ᅟᅠ⠀ㅤﾠ]/u;

const FORBIDDEN = "Ce texte contient un caractère non autorisé.";

/** Forme Unicode canonique, espaces réduits, bords nettoyés. */
export function cleanLine(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Clé de comparaison : deux textes qui ne diffèrent que par la casse ou la forme Unicode sont « les mêmes ». */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("fr");
}

type LineMessages = { required: string; tooLong?: string };

/** Texte obligatoire sur une ligne (nom, libellé). */
export function requiredLine(max: number, messages: LineMessages) {
  return z
    .string({ error: messages.required })
    .transform(cleanLine)
    .pipe(
      z
        .string()
        .min(1, messages.required)
        .max(max, messages.tooLong ?? `${max} caractères au maximum.`)
        .refine((value) => !DECEPTIVE_CHARACTERS.test(value), FORBIDDEN)
        .refine((value) => /[\p{L}\p{N}]/u.test(value), messages.required),
    );
}

/** Texte facultatif sur une ligne : vide, absent ou `null` donnent `null`. */
export function optionalLine(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? cleanLine(value) : ""))
    .pipe(
      z
        .string()
        .max(max, `${max} caractères au maximum.`)
        .refine((value) => !DECEPTIVE_CHARACTERS.test(value), FORBIDDEN),
    )
    .transform((value) => (value === "" ? null : value));
}

/** Texte facultatif sur plusieurs lignes (adresse, notes). */
export function optionalText(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? cleanMultiline(value) : ""))
    .pipe(
      z
        .string()
        .max(max, `${max} caractères au maximum.`)
        .refine((value) => !DECEPTIVE_EXCEPT_NEWLINE.test(value), FORBIDDEN),
    )
    .transform((value) => (value === "" ? null : value));
}

/** Adresse email facultative. */
export const optionalEmail = optionalLine(120).refine(
  (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
  "Cette adresse email n'est pas valide.",
);

/** Jour civil « AAAA-MM-JJ », entre 2000 et 2100. */
export const daySchema = z
  .string({ error: "Indiquez une date." })
  .refine((value) => isIsoDay(value) && value >= "2000-01-01" && value <= "2100-12-31", "Cette date n'est pas valide.");

/**
 * Montant en centimes. Accepte un nombre entier de centimes ou un texte saisi
 * (« 12,50 »). Toujours strictement positif.
 */
export const amountSchema = z
  .union([z.number(), z.string()], { error: "Indiquez un montant." })
  .transform((value) => (typeof value === "number" ? value : parseAmount(value)))
  .pipe(
    z
      .number({ error: "Ce montant n'est pas valide (exemple : 120 ou 120,50)." })
      .int("Ce montant n'est pas valide.")
      .positive("Le montant doit être supérieur à zéro.")
      .max(MAX_AMOUNT_CENTS, "Ce montant est trop élevé."),
  );

/** Comme `amountSchema`, mais zéro est accepté (solde de départ). */
export const signedAmountSchema = z
  .union([z.number(), z.string()], { error: "Indiquez un montant." })
  .transform((value) => {
    if (typeof value === "number") return value;
    const text = value.trim();
    const negative = /^[-−]/.test(text);
    const cents = parseAmount(text.replace(/^[-−+]\s*/, "") || "0");
    return cents === null ? null : negative ? -cents : cents;
  })
  .pipe(
    z
      .number({ error: "Ce montant n'est pas valide (exemple : 1500 ou 1500,50)." })
      .int("Ce montant n'est pas valide.")
      .min(-MAX_AMOUNT_CENTS, "Ce montant est trop bas.")
      .max(MAX_AMOUNT_CENTS, "Ce montant est trop élevé."),
  );

/** Résultat commun des actions serveur. */
export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Transforme une erreur zod en messages par champ (premier message de chaque champ). */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    errors[key] ??= issue.message;
  }
  return errors;
}

export const INVALID_FORM = "Certains champs sont à corriger.";
export const UNEXPECTED = "L'enregistrement a échoué. Réessayez dans un instant.";
