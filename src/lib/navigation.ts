import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  CategoriesIcon,
  ChequeIcon,
  DashboardIcon,
  MembersIcon,
  ReceiptIcon,
  TransfersIcon,
} from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
};

/** Menu principal, dans l'ordre des maquettes. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: DashboardIcon },
  { href: "/mouvements", label: "Entrées & sorties", icon: TransfersIcon },
  { href: "/adherents", label: "Adhérents", icon: MembersIcon },
  { href: "/cheques", label: "Chèques", icon: ChequeIcon },
  { href: "/calendrier", label: "Calendrier", icon: CalendarIcon },
  { href: "/recus", label: "Reçus", icon: ReceiptIcon },
  { href: "/categories", label: "Catégories", icon: CategoriesIcon },
];

export const SETTINGS_HREF = "/parametres";
export const LOGIN_HREF = "/connexion";

/** Vrai si `pathname` correspond à l'entrée de menu (ou à l'une de ses sous-pages). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
