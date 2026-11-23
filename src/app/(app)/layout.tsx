import { Suspense } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/shell/sidebar";
import { requireUser } from "@/lib/auth/dal";
import { isDemoMode } from "@/lib/data/settings";
import { SETTINGS_HREF } from "@/lib/navigation";

/**
 * Coquille de l'application : menu + contenu. Elle reste synchrone pour
 * s'afficher immédiatement ; tout ce qui dépend de la session est chargé
 * dans des <Suspense>.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh desk:pl-[260px]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-surface focus:px-4 focus:py-3 focus:shadow-float"
      >
        Aller au contenu
      </a>
      <Sidebar />
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <main
        id="contenu"
        className="w-full max-w-[1180px] px-5 py-7 desk:px-12 desk:py-10"
      >
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

/** Rappel permanent tant que la base contient les données de démonstration. */
async function DemoBanner() {
  if (!(await isDemoMode())) return null;
  return (
    <p
      role="status"
      className="mb-6 flex animate-fade flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control bg-amber-soft px-4 py-3 text-sm text-amber-strong"
    >
      <span>
        <strong className="font-semibold">Mode démonstration.</strong> Les familles et les montants
        affichés sont fictifs.
      </span>
      <Link href={`${SETTINGS_HREF}#demonstration`} className="font-medium text-amber-strong underline underline-offset-2 hover:text-amber-strong">
        Terminer la démonstration
      </Link>
    </p>
  );
}

/** Deuxième vérification (après le proxy) lors d'un chargement complet de page. */
async function AuthGate() {
  await requireUser();
  return null;
}
