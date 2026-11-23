/**
 * Refus « métier » : la demande est bien formée mais ne peut pas être
 * appliquée (chèque déjà encaissé, catégorie archivée…). Lancée dans une
 * transaction, l'erreur annule tout ce qui a été écrit.
 */
export const DOMAIN_MESSAGES = {
  CATEGORY_UNAVAILABLE: "Cette catégorie n'est plus disponible. Choisissez-en une autre.",
  MEMBER_UNAVAILABLE: "Cet adhérent n'existe plus ou a été archivé.",
  MEMBER_REQUIRED: "Choisissez un adhérent pour un paiement en plusieurs fois ou encaissé plus tard.",
  PAYER_REQUIRED: "Indiquez qui a payé.",
  FUTURE_DAY: "La date d'un encaissement ne peut pas être dans le futur.",
  DAYS_ORDER: "Les dates des versements doivent se suivre.",
  INSTALLMENT_GONE: "Cette échéance n'existe plus. Rechargez la page.",
  ALREADY_CASHED: "Cette échéance est déjà encaissée.",
  NOT_PENDING: "Cette échéance n'est plus en attente.",
  TRANSACTION_GONE: "Ce mouvement n'existe plus. Rechargez la page.",
  ALREADY_CANCELLED: "Ce mouvement est déjà annulé.",
  PLAN_GONE: "Ce paiement n'existe plus. Rechargez la page.",
  PLAN_HAS_CASHED: "Ce paiement a déjà des versements encaissés : annulez-les d'abord dans « Entrées & sorties ».",
  DEMO_NOT_EMPTY: "Les données de démonstration ne peuvent être chargées que dans une base vide.",
  DEMO_NOT_ACTIVE: "La démonstration n'est pas en cours.",
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_MESSAGES;

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(DOMAIN_MESSAGES[code]);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
