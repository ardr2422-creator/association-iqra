import type { ComponentProps, ElementType } from "react";
import clsx from "clsx";

type CardProps<T extends ElementType> = {
  as?: T;
  /** Carte pleine bordeaux (solde actuel). */
  tone?: "default" | "primary";
} & Omit<ComponentProps<T>, "as">;

/** Grosse carte arrondie des maquettes : fond blanc, bordure fine, rayon 20px. */
export function Card<T extends ElementType = "div">({
  as,
  tone = "default",
  className,
  ...props
}: CardProps<T>) {
  const Component: ElementType = as ?? "div";
  return (
    <Component
      className={clsx(
        "rounded-card border p-6 desk:p-7",
        tone === "primary"
          ? "border-primary bg-primary text-on-primary"
          : "border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={clsx("text-[19px] font-semibold leading-snug", className)} {...props} />;
}
