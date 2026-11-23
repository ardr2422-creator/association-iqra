import type { ComponentProps } from "react";
import clsx from "clsx";

type ChipProps = Omit<ComponentProps<"button">, "type"> & {
  /** Filtre sélectionné : pastille pleine bordeaux, comme sur les maquettes. */
  selected?: boolean;
};

/**
 * Pastille de filtre ou de choix (« Tout », « Dons », « 4 fois »…).
 * Dans un groupe, envelopper les pastilles dans un élément `role="group"`
 * avec un `aria-label`.
 */
export function Chip({ selected = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        "shrink-0 select-none whitespace-nowrap rounded-full border px-[18px] py-2.5 text-sm leading-tight",
        "transition-[background-color,border-color,color,scale] duration-fast ease-soft active:scale-[0.96]",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-line-strong bg-surface text-nav hover:bg-primary-soft hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
