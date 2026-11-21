"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotionConfig,
  useTransform,
} from "motion/react";
import { formatEuros } from "@/lib/format";

type CountUpProps = {
  /** Valeur finale : des centimes pour `euros`, un entier pour `integer`. */
  value: number;
  format: "euros" | "integer";
  className?: string;
};

function render(value: number, format: CountUpProps["format"]): string {
  return format === "euros" ? formatEuros(Math.round(value)) : String(Math.round(value));
}

/**
 * Nombre qui « monte » jusqu'à sa valeur à l'arrivée sur la page, puis qui
 * glisse de l'ancienne valeur à la nouvelle quand elle change (après un
 * encaissement, par exemple). Les lecteurs d'écran lisent directement la
 * valeur finale.
 */
export function CountUp({ value, format, className }: CountUpProps) {
  const current = useMotionValue(0);
  const text = useTransform(current, (latest) => render(latest, format));
  const reduceMotion = useReducedMotionConfig();

  useEffect(() => {
    if (reduceMotion) {
      current.jump(value);
      return;
    }
    const controls = animate(current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [current, value, reduceMotion]);

  return (
    <span className={className}>
      <span className="sr-only">{render(value, format)}</span>
      <motion.span aria-hidden="true" className="tabular-nums">
        {text}
      </motion.span>
    </span>
  );
}
