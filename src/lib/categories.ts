import type { BadgeTone } from "@/components/ui/badge";

/** Sens d'une catégorie. Mêmes valeurs que l'énumération `FlowType` de la base. */
export const FLOW_TYPES = ["INCOME", "EXPENSE"] as const;
export type FlowType = (typeof FLOW_TYPES)[number];

export const FLOW_LABELS: Record<FlowType, { singular: string; plural: string }> = {
  INCOME: { singular: "Entrée", plural: "Entrées" },
  EXPENSE: { singular: "Sortie", plural: "Sorties" },
};

/** Couleurs proposées pour les pastilles de catégorie (clé stockée en base). */
export const CATEGORY_COLORS = [
  "bordeaux",
  "vert",
  "ambre",
  "sable",
  "violet",
  "rose",
  "gris",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_COLOR_INFO: Record<CategoryColor, { label: string; tone: BadgeTone }> = {
  bordeaux: { label: "Bordeaux", tone: "primary" },
  vert: { label: "Vert", tone: "income" },
  ambre: { label: "Ambre", tone: "amber" },
  sable: { label: "Sable", tone: "sand" },
  violet: { label: "Violet", tone: "violet" },
  rose: { label: "Rose", tone: "late" },
  gris: { label: "Gris", tone: "neutral" },
};

/** Ton de pastille pour une couleur lue en base (valeur inconnue → gris). */
export function categoryTone(color: string): BadgeTone {
  return CATEGORY_COLOR_INFO[color as CategoryColor]?.tone ?? "neutral";
}

export const CATEGORY_NAME_MAX = 40;

/** Catégorie telle qu'affichée dans l'interface. */
export type CategoryItem = {
  id: string;
  name: string;
  type: FlowType;
  color: string;
  archived: boolean;
  /** Nombre de mouvements et d'échéanciers qui utilisent cette catégorie. */
  usageCount: number;
};
