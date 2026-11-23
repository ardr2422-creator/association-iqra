"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TransactionView } from "@/lib/views";

/** Ce que la fenêtre de la page peut afficher. */
export type MovementDialog =
  | { kind: "income"; memberId: string | null }
  | { kind: "expense" }
  | { kind: "cancel"; transaction: TransactionView };

type DialogState = {
  /** Conservé pendant l'animation de fermeture. */
  content: MovementDialog | null;
  open: boolean;
  /** Change à chaque ouverture : remet le formulaire à zéro. */
  instance: number;
};

type MovementsContextValue = DialogState & {
  show: (content: MovementDialog) => void;
  close: () => void;
};

const MovementsContext = createContext<MovementsContextValue | null>(null);

/**
 * État de la fenêtre « Nouvel encaissement / Nouvelle dépense / Annuler ».
 * Il vit au-dessus du <Suspense> de la page : les boutons de l'en-tête
 * répondent tout de suite, même si le tableau est encore en chargement (la
 * fenêtre s'ouvre alors dès que les données arrivent).
 */
export function MovementsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({ content: null, open: false, instance: 0 });

  const show = useCallback((content: MovementDialog) => {
    setState((previous) => ({ content, open: true, instance: previous.instance + 1 }));
  }, []);
  const close = useCallback(() => {
    setState((previous) => (previous.open ? { ...previous, open: false } : previous));
  }, []);

  const value = useMemo(() => ({ ...state, show, close }), [state, show, close]);
  return <MovementsContext.Provider value={value}>{children}</MovementsContext.Provider>;
}

export function useMovementsDialog(): MovementsContextValue {
  const value = useContext(MovementsContext);
  if (!value) throw new Error("useMovementsDialog doit être utilisé sous <MovementsProvider>.");
  return value;
}

/** Boutons de l'en-tête : « + Dépense » et « + Encaissement ». */
export function MovementsHeaderActions() {
  const { show } = useMovementsDialog();
  return (
    <>
      <Button variant="secondary" onClick={() => show({ kind: "expense" })}>
        + Dépense
      </Button>
      <Button onClick={() => show({ kind: "income", memberId: null })}>+ Encaissement</Button>
    </>
  );
}
