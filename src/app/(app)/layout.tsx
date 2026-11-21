import { Suspense } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { requireUser } from "@/lib/auth/dal";

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
        {children}
      </main>
    </div>
  );
}

/** Deuxième vérification (après le proxy) lors d'un chargement complet de page. */
async function AuthGate() {
  await requireUser();
  return null;
}
