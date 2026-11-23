/**
 * Recherche dans la page, en JavaScript : insensible à la casse et aux
 * accents. Le texte saisi n'est jamais envoyé à la base comme motif.
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si chaque mot de la recherche apparaît dans l'un des textes. */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchKey(texts.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}
