"use client";

import type { ComponentProps, ReactNode, SVGProps } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDownIcon } from "@/components/icons";
import { FIELD_CLASSES } from "@/components/ui/field";

/** Même courbe que le reste de l'application (`ease-soft`). */
export const SOFT_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

/** Liste déroulante native, habillée comme les champs des maquettes. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={clsx(FIELD_CLASSES, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon
        size={18}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}

/**
 * Bloc de formulaire qui apparaît ou disparaît en douceur (hauteur + fondu).
 * La marge intérieure laisse la place au halo de focus des champs, que
 * `overflow: hidden` couperait sinon.
 */
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SOFT_TRANSITION}
          className="-mx-1.5 -mb-1.5 overflow-hidden px-1.5 pb-1.5"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Encadré d'information dans un formulaire (rien à corriger, juste à savoir). */
export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-field bg-page px-4 py-3 text-[15px] text-muted">{children}</p>;
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Cercle barré : annuler un mouvement. */
export function CancelIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.2 6.2l11.6 11.6" />
    </svg>
  );
}
