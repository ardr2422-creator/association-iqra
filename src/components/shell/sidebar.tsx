import { Suspense } from "react";
import Link from "next/link";
import * as motion from "motion/react-client";
import { LogoutButton } from "./logout-button";
import { ActiveNavList, NavList } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

/**
 * Menu principal. Colonne fixe à gauche sur ordinateur ; en dessous de 900px
 * il passe en haut de page, avec les entrées sur une ligne défilante.
 *
 * `layoutScroll` permet à la pastille active de glisser correctement même
 * quand la page (ou la ligne d'onglets) a défilé.
 */
export function Sidebar() {
  return (
    <motion.aside
      layoutScroll
      className="flex flex-col gap-3 border-b border-line bg-surface px-4 pb-3 pt-4 desk:fixed desk:inset-y-0 desk:left-0 desk:z-20 desk:w-[260px] desk:gap-1.5 desk:overflow-y-auto desk:border-b-0 desk:border-r desk:px-5 desk:py-8"
    >
      <div className="flex items-center justify-between gap-3 desk:px-4 desk:pb-7">
        <Link
          href="/"
          className="-my-2 rounded-md py-2 text-[26px] font-semibold leading-none tracking-[-0.5px] text-accent no-underline"
        >
          Iqra
          <span className="ml-2 text-[15px] font-normal tracking-normal text-faint">compta</span>
        </Link>
        <div className="flex items-center gap-1.5 desk:hidden">
          <ThemeToggle compact />
          <LogoutButton compact />
        </div>
      </div>

      <motion.nav
        layoutScroll
        aria-label="Menu principal"
        className="-mx-4 -my-1 flex gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] desk:m-0 desk:flex-1 desk:flex-col desk:overflow-visible desk:p-0 [&::-webkit-scrollbar]:hidden"
      >
        <Suspense fallback={<NavList pathname={null} />}>
          <ActiveNavList />
        </Suspense>
      </motion.nav>

      <div className="hidden flex-col gap-1.5 pt-1.5 desk:flex">
        <ThemeToggle />
        <LogoutButton />
      </div>
    </motion.aside>
  );
}
