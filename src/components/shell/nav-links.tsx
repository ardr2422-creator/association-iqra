"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { motion } from "motion/react";
import { SettingsIcon } from "@/components/icons";
import { isActivePath, NAV_ITEMS, SETTINGS_HREF, type NavItem } from "@/lib/navigation";

const SETTINGS_ITEM: NavItem = { href: SETTINGS_HREF, label: "Paramètres", icon: SettingsIcon };

type NavListProps = {
  /** `null` : rendu d'attente, sans entrée active. */
  pathname: string | null;
};

/**
 * Liens du menu. Une seule « pastille » (layoutId) glisse d'une entrée à
 * l'autre quand on change de page.
 */
export function NavList({ pathname }: NavListProps) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <NavLink item={SETTINGS_ITEM} pathname={pathname} className="desk:mt-auto" />
    </>
  );
}

function NavLink({
  item,
  pathname,
  className,
}: {
  item: NavItem;
  pathname: string | null;
  className?: string;
}) {
  const active = pathname !== null && isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative flex shrink-0 items-center gap-2.5 rounded-field px-3.5 py-2.5 text-sm leading-tight no-underline",
        "desk:gap-3 desk:px-4 desk:py-3 desk:text-[15px]",
        "transition-colors duration-fast ease-soft",
        active ? "font-medium text-accent" : "text-nav hover:text-ink",
        className,
      )}
    >
      {active ? (
        <motion.span
          layoutId="nav-pill"
          aria-hidden="true"
          className="absolute inset-0 rounded-field bg-primary-soft will-change-transform"
          transition={{ type: "spring", visualDuration: 0.34, bounce: 0.16 }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-field bg-primary-soft opacity-0 transition-opacity duration-fast ease-soft group-hover:opacity-60"
        />
      )}
      <Icon className="relative shrink-0" />
      <span className="relative whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

/**
 * Version « vivante » : lit l'adresse courante. À placer dans un <Suspense>.
 *
 * Sur téléphone, le menu est une ligne d'onglets défilante : l'onglet actif
 * est ramené au centre à chaque changement de page.
 */
export function ActiveNavList() {
  const pathname = usePathname();
  const markerRef = useRef<HTMLSpanElement>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const row = markerRef.current?.parentElement;
    const active = row?.querySelector<HTMLElement>('a[aria-current="page"]');
    const instant = firstRun.current;
    firstRun.current = false;
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;

    const rowBox = row.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const offset = activeBox.left - rowBox.left - (rowBox.width - activeBox.width) / 2;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({
      left: Math.max(0, row.scrollLeft + offset),
      behavior: instant || reduceMotion ? "auto" : "smooth",
    });
  }, [pathname]);

  return (
    <>
      <span ref={markerRef} hidden />
      <NavList pathname={pathname} />
    </>
  );
}
