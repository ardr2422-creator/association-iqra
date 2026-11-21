import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <p className="animate-rise text-[26px] font-semibold tracking-[-0.5px] text-accent">Iqra</p>
      <div className="animate-rise stagger-1">
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">Cette page n&apos;existe pas</h1>
        <p className="mt-2 text-muted">L&apos;adresse est peut-être incomplète ou la page a été déplacée.</p>
      </div>
      <ButtonLink href="/" className="animate-rise stagger-2">
        Revenir au tableau de bord
      </ButtonLink>
    </main>
  );
}
