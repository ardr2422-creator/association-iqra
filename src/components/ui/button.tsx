import type { ComponentProps } from "react";
import Link from "next/link";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium leading-tight no-underline " +
  "transition-[background-color,border-color,color,scale,opacity] duration-fast ease-soft " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60";

const VARIANTS: Record<Variant, string> = {
  primary: "border border-transparent bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-accent hover:border-line-strong hover:bg-primary-soft",
  ghost: "border border-transparent text-nav hover:bg-primary-soft hover:text-ink",
};

const SIZES: Record<Size, string> = {
  md: "px-[22px] py-[13px] text-base",
  lg: "px-6 py-[15px] text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
