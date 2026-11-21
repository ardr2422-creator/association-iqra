"use client";

import { AlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ErrorProps = { error: unknown; retry: () => void };

export default function AppError({ retry }: ErrorProps) {
  return (
    <Card role="alert" className="flex max-w-[620px] animate-rise flex-col items-start gap-4">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-card bg-late-soft text-accent"
      >
        <AlertIcon size={24} />
      </span>
      <div>
        <h1 className="text-[19px] font-semibold">Un problème est survenu</h1>
        <p className="mt-1.5 text-muted">
          La page n&apos;a pas pu s&apos;afficher. Vos données ne sont pas touchées. Si votre
          session a expiré, rechargez la page pour vous reconnecter.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Réessayer</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recharger la page
        </Button>
      </div>
    </Card>
  );
}
