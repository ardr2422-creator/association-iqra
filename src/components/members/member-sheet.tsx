"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { deleteMember, restoreMember } from "@/app/(app)/adherents/actions";
import { deletePaymentPlan } from "@/app/(app)/cheques/actions";
import { RestoreIcon } from "@/components/icons";
import { useInstallmentActions } from "@/components/installments/installment-actions";
import { Avatar } from "@/components/members/avatar";
import { MemberForm } from "@/components/members/member-form";
import { PaymentHistory } from "@/components/members/payment-history";
import { PlanCard } from "@/components/members/plan-card";
import { CountUp } from "@/components/motion/count-up";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormAlert, Spinner } from "@/components/ui/form";
import { formatEuros, parseIsoDay, plural, TIME_ZONE } from "@/lib/format";
import { newIncomeHref } from "@/lib/routes";
import type { MemberDetail, PlanView } from "@/lib/views";

type DialogContent = { kind: "edit" } | { kind: "delete" } | { kind: "deletePlan"; plan: PlanView };

const CARD_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;

/** Arrivée en cascade des échéanciers, après les cartes du haut. */
const PLAN_STAGGER = ["stagger-4", "stagger-5", "stagger-6"];

const sinceFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: TIME_ZONE });

/** Boutons de l'en-tête : marges réduites sur téléphone. */
const HEADER_BUTTON = "whitespace-nowrap max-sm:px-4";

/** Grand chiffre des cartes du haut : 32px comme sur la maquette, réduit si la carte est étroite. */
const FIGURE = "mt-2.5 whitespace-nowrap text-[clamp(24px,13cqw,32px)] font-semibold leading-[1.2]";

/** La fiche d'un adhérent (maquette 03) : chiffres, échéanciers, historique. */
export function MemberSheet({ member }: { member: MemberDetail }) {
  const gestures = useInstallmentActions(member.today);
  // Le contenu est conservé pendant l'animation de fermeture ; `instance`
  // remet la fenêtre à zéro à chaque ouverture.
  const [content, setContent] = useState<DialogContent | null>(null);
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const [restoring, startRestore] = useTransition();
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const show = (next: DialogContent) => {
    setContent(next);
    setInstance((value) => value + 1);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const restore = () => {
    if (restoring) return;
    setRestoreError(null);
    startRestore(async () => {
      const result = await restoreMember(member.id);
      if (!result.ok) setRestoreError(result.message);
    });
  };

  // Un paiement en une fois déjà encaissé n'a pas d'échéancier : il est dans l'historique.
  const schedules = member.plans.filter((plan) => plan.installmentCount > 1 || plan.remainingCents > 0);
  const enrolments = [
    ...new Set(
      member.plans
        .filter((plan) => plan.participants)
        .map((plan) => `${plural(plan.participants ?? 0, "inscrit")} · ${plan.label}`),
    ),
  ];
  const contact = [member.phone, member.email].filter(Boolean);
  const removal = member.deletable ? "Supprimer" : "Archiver";

  const title =
    content?.kind === "edit"
      ? "Modifier l'adhérent"
      : content?.kind === "deletePlan"
        ? "Supprimer ce paiement"
        : member.deletable
          ? "Supprimer l'adhérent"
          : "Archiver l'adhérent";

  return (
    <>
      <header className="flex animate-rise flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-[18px]">
          <Avatar name={member.name} size="lg" muted={member.archived} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.5px] [overflow-wrap:anywhere] desk:text-[30px]">
                {member.name}
              </h1>
              {member.archived ? <Badge tone="neutral">Archivé</Badge> : null}
            </div>
            <p className="mt-1 text-[15px] text-muted">
              <span className="whitespace-nowrap">
                Adhérent depuis {sinceFormatter.format(parseIsoDay(member.joinedDay))}
              </span>
              {contact.map((value, index) => (
                <Fragment key={index}>
                  {" · "}
                  <span className="inline-block max-w-full truncate align-bottom">{value}</span>
                </Fragment>
              ))}
            </p>
          </div>
        </div>
        {/* Sur téléphone, les trois boutons tiennent sur une ligne et l'action principale s'étire. */}
        <div className="flex w-full items-center gap-2.5 sm:w-auto sm:gap-3">
          {!member.archived || member.deletable ? (
            <Button variant="ghost" className={HEADER_BUTTON} onClick={() => show({ kind: "delete" })}>
              {removal}
            </Button>
          ) : null}
          <Button variant="secondary" className={HEADER_BUTTON} onClick={() => show({ kind: "edit" })}>
            Modifier
          </Button>
          {member.archived ? (
            <Button className={`${HEADER_BUTTON} flex-1 sm:flex-none`} onClick={restore} aria-disabled={restoring}>
              {restoring ? <Spinner /> : <RestoreIcon size={18} />}
              Restaurer
            </Button>
          ) : (
            <ButtonLink href={newIncomeHref(member.id)} className={`${HEADER_BUTTON} flex-1 sm:flex-none`}>
              + Encaisser
            </ButtonLink>
          )}
        </div>
        {restoreError ? (
          <div className="w-full">
            <FormAlert message={restoreError} />
          </div>
        ) : null}
      </header>

      <section aria-label="Chiffres clés" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
        <Card className="@container animate-rise stagger-1">
          <p className="text-[15px] leading-snug text-muted">Total versé en {member.year}</p>
          <p className={`${FIGURE} text-income`}>
            <CountUp value={member.paidThisYearCents} format="euros" />
          </p>
        </Card>
        <Card className="@container animate-rise stagger-2">
          <p className="text-[15px] leading-snug text-muted">Reste à payer</p>
          <p className={`${FIGURE} text-accent`}>
            <CountUp value={member.remainingCents} format="euros" />
          </p>
        </Card>
        <Card className="animate-rise stagger-3 sm:col-span-2 xl:col-span-1">
          <p className="text-[15px] leading-snug text-muted">Inscrits</p>
          {enrolments.length === 0 ? (
            <p className="mt-2.5 text-lg font-medium leading-snug text-faint">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Aucune inscription</span>
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-1 text-lg font-medium leading-snug">
              {enrolments.map((line) => (
                <li key={line} className="text-balance">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {member.address || member.notes ? (
        <Card
          as="section"
          aria-label="Coordonnées"
          className="grid animate-rise gap-x-10 gap-y-3 stagger-3 xl:grid-cols-[180px_minmax(0,1fr)]"
        >
          <CardTitle>Coordonnées</CardTitle>
          <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {member.address ? (
              <div className="min-w-0">
                <dt className="text-sm leading-snug text-muted">Adresse</dt>
                <dd className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{member.address}</dd>
              </div>
            ) : null}
            {member.notes ? (
              <div className="min-w-0">
                <dt className="text-sm leading-snug text-muted">Notes</dt>
                <dd className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{member.notes}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {/* Les marges sont dans les enveloppes animées : une carte supprimée se replie sans à-coup. */}
      <div className="-mb-6 flex flex-col">
        <AnimatePresence initial={false}>
          {schedules.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={CARD_TRANSITION}
              className="overflow-hidden"
            >
              <div className="pb-6">
                <PlanCard
                  plan={plan}
                  today={member.today}
                  gestures={gestures}
                  onDelete={() => show({ kind: "deletePlan", plan })}
                  className={clsx("animate-rise", PLAN_STAGGER[Math.min(index, PLAN_STAGGER.length - 1)])}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <PaymentHistory
        payments={member.payments}
        year={member.year}
        className="animate-rise stagger-5"
        emptyAction={
          member.archived ? undefined : (
            <ButtonLink href={newIncomeHref(member.id)} size="sm" className="min-h-10">
              Enregistrer un encaissement
            </ButtonLink>
          )
        }
      />

      <Dialog open={open} onClose={close} title={title} size={content?.kind === "edit" ? "lg" : "md"}>
        {content?.kind === "edit" ? (
          <MemberForm key={instance} member={member} today={member.today} onDone={close} />
        ) : null}
        {content?.kind === "delete" ? <DeleteMember key={instance} member={member} onDone={close} /> : null}
        {content?.kind === "deletePlan" ? <DeletePlan key={instance} plan={content.plan} onDone={close} /> : null}
      </Dialog>
      {gestures.dialogs}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmations                                                       */
/* ------------------------------------------------------------------ */

function DeleteMember({ member, onDone }: { member: MemberDetail; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMember(member.id);
      if (!result.ok) setError(result.message);
      else if (result.archived) onDone();
      // La fiche n'existe plus : retour à la liste.
      else router.replace("/adherents");
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex items-center gap-3.5 rounded-field bg-page px-4 py-3">
        <Avatar name={member.name} />
        <p className="min-w-0 truncate font-medium">{member.name}</p>
      </div>
      <p className="text-[15px] text-muted">
        {member.deletable ? (
          <>
            Aucun paiement n&apos;est enregistré pour cet adhérent. Sa fiche sera{" "}
            <strong className="font-medium text-ink">supprimée définitivement</strong>.
          </>
        ) : (
          <>
            Cet adhérent a des paiements enregistrés. Il sera{" "}
            <strong className="font-medium text-ink">archivé</strong> : il disparaît de la liste et
            des formulaires, mais sa fiche, ses paiements et ses reçus sont conservés. Vous pourrez
            le restaurer à tout moment.
          </>
        )}
      </p>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} data-autofocus>
          Annuler
        </Button>
        <Button onClick={confirm} aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {member.deletable ? "Supprimer" : "Archiver"}
        </Button>
      </div>
    </div>
  );
}

function DeletePlan({ plan, onDone }: { plan: PlanView; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePaymentPlan(plan.id);
      if (result.ok) onDone();
      else setError(result.message);
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 rounded-field bg-page px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium leading-snug">{plan.label}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {plan.installmentCount > 1 ? `Paiement en ${plan.installmentCount} fois` : "Paiement en une fois"}
          </p>
        </div>
        <p className="shrink-0 text-[17px] font-semibold">{formatEuros(plan.totalCents)}</p>
      </div>
      <p className="text-[15px] text-muted">
        Aucun versement de ce paiement n&apos;a été encaissé. Le paiement et{" "}
        {plan.installmentCount > 1 ? `ses ${plan.installmentCount} échéances` : "son échéance"} seront{" "}
        <strong className="font-medium text-ink">supprimés définitivement</strong> : à utiliser pour un
        paiement saisi par erreur.
      </p>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} data-autofocus>
          Annuler
        </Button>
        <Button onClick={confirm} aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          Supprimer
        </Button>
      </div>
    </div>
  );
}
