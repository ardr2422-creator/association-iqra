import type { ComponentProps } from "react";
import clsx from "clsx";

export type BadgeTone = "amber" | "late" | "income" | "neutral" | "primary" | "sand" | "violet";

const TONES: Record<BadgeTone, string> = {
  amber: "bg-amber-soft text-amber-strong",
  late: "bg-late-soft text-accent",
  income: "bg-income-soft text-income-strong",
  neutral: "bg-neutral-soft text-nav",
  primary: "bg-primary-soft text-accent",
  sand: "bg-tag-sand text-tag-sand-ink",
  violet: "bg-tag-violet text-tag-violet-ink",
};

type BadgeProps = ComponentProps<"span"> & { tone?: BadgeTone };

/** Pastille arrondie (dates d'encaissement, statuts, catégories). */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium leading-tight",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
