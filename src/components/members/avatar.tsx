import clsx from "clsx";

/** Mots qui ne distinguent pas un adhérent d'un autre (« Famille Benali » → « B »). */
const TITLES = new Set(["famille", "fam", "m", "mr", "mme", "mlle", "monsieur", "madame", "mademoiselle", "et"]);

/** Initiale affichée dans la vignette : première lettre du premier mot parlant du nom. */
export function memberInitial(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const word = words.find((candidate) => !TITLES.has(candidate.toLocaleLowerCase("fr"))) ?? words[0] ?? "";
  const first = Array.from(word)[0];
  return first ? first.toLocaleUpperCase("fr") : "?";
}

type AvatarProps = {
  name: string;
  /** `lg` : vignette de 64px de la fiche (maquette) ; `md` : 44px dans la liste. */
  size?: "md" | "lg";
  /** Adhérent archivé : vignette neutre. */
  muted?: boolean;
  className?: string;
};

/** Vignette carrée arrondie avec l'initiale de l'adhérent. Décorative : le nom est toujours écrit à côté. */
export function Avatar({ name, size = "md", muted = false, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "flex shrink-0 select-none items-center justify-center font-semibold",
        size === "lg" ? "size-16 rounded-card text-2xl" : "size-11 rounded-control text-[17px]",
        muted ? "bg-neutral-soft text-nav" : "bg-primary-soft text-accent",
        className,
      )}
    >
      {memberInitial(name)}
    </span>
  );
}
