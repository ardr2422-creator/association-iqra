"use client";

import { flushSync } from "react-dom";
import clsx from "clsx";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@/components/icons";

type ThemeToggleProps = {
  /** Version compacte (icône seule) pour la barre du haut sur téléphone. */
  compact?: boolean;
  className?: string;
};

/**
 * Bascule clair / sombre. Le thème courant n'est lu qu'au clic (jamais au
 * rendu) pour éviter tout décalage entre serveur et navigateur ; les icônes
 * et libellés sont permutés en CSS. La page entière passe d'un thème à
 * l'autre en fondu enchaîné quand le navigateur le permet.
 */
export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();

  function toggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const apply = () => flushSync(() => setTheme(next));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) apply();
    else document.startViewTransition(apply);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={compact ? "Changer de thème (clair ou sombre)" : undefined}
      className={clsx(
        "flex items-center gap-3 rounded-field border border-line bg-page text-sm leading-tight text-nav",
        "transition-[background-color,border-color,color,scale] duration-fast ease-soft hover:border-line-strong hover:text-ink active:scale-[0.97]",
        compact ? "size-11 justify-center" : "px-4 py-3",
        className,
      )}
    >
      <MoonIcon size={18} className="shrink-0 dark:hidden" />
      <SunIcon size={18} className="hidden shrink-0 dark:block" />
      {compact ? null : (
        <>
          <span className="dark:hidden">Mode sombre</span>
          <span className="hidden dark:inline">Mode clair</span>
        </>
      )}
    </button>
  );
}
