/** Adresses internes de l'application, à un seul endroit. */

export function memberHref(memberId: string): string {
  return `/adherents/${memberId}`;
}

/** Le reçu en PDF (s'ouvre dans un nouvel onglet). */
export function receiptPdfHref(receiptId: string): string {
  return `/recus/${receiptId}/pdf`;
}

/** Ouvre le formulaire « Nouvel encaissement », éventuellement pour un adhérent précis. */
export function newIncomeHref(memberId?: string): string {
  return memberId ? `/mouvements?nouveau=encaissement&adherent=${memberId}` : "/mouvements?nouveau=encaissement";
}

/** Ouvre le formulaire « Nouvelle dépense ». */
export const NEW_EXPENSE_HREF = "/mouvements?nouveau=depense";
