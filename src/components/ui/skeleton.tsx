import type { ComponentProps } from "react";
import clsx from "clsx";

/**
 * Bloc d'attente. Il n'apparaît qu'après un court délai : si les données
 * arrivent vite, on ne voit aucun clignotement.
 */
export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={clsx("block animate-skeleton rounded-lg bg-neutral-soft", className)}
      {...props}
    />
  );
}
