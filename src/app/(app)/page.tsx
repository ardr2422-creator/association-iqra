import type { CSSProperties } from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CountUp } from "@/components/motion/count-up";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/data/dashboard";
import {
  formatDayMonth,
  formatEurosCompact,
  formatLongDate,
  formatMonthYear,
  formatShortDay,
  parseIsoDay,
} from "@/lib/format";
import { memberHref, NEW_EXPENSE_HREF, newIncomeHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 desk:gap-7">
      <PageHeader
        eyebrow={
          <Suspense fallback={<Skeleton className="mt-0.5 h-[18px] w-52" />}>
            <Today />
          </Suspense>
        }
        title="Bonjour, voici l'état des comptes"
        actions={
          <>
            <ButtonLink href={NEW_EXPENSE_HREF} variant="secondary">
              + Dépense
            </ButtonLink>
            <ButtonLink href={newIncomeHref()}>+ Encaissement</ButtonLink>
          </>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function Today() {
  await connection();
  return formatLongDate(new Date());
}

/** Lien d'en-tête de carte : zone de toucher de 40px sans déplacer le texte. */
const CARD_LINK =
  "-my-2.5 inline-flex min-h-10 items-center text-sm underline underline-offset-2";

/** Position dans une liste, pour l'apparition en cascade des lignes. */
function cascade(index: number, baseMs: number): CSSProperties {
  return { "--i": index, "--stagger-base": `${baseMs}ms` } as CSSProperties;
}

async function DashboardContent() {
  const data = await getDashboard();

  const chartData = data.monthly.map((entry) => ({
    label: entry.label,
    monthName: formatMonthYear(parseIsoDay(entry.month)),
    income: entry.incomeCents,
    expense: entry.expenseCents,
  }));

  const chequesHint = [
    `dont ${data.chequesNext7Days} dans les 7 jours`,
    data.chequesLate > 0 ? `${data.chequesLate} en retard` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {data.empty ? (
        <Card as="section" className="animate-rise border-dashed">
          <CardTitle>Bienvenue dans Iqra Compta</CardTitle>
          <p className="mt-1.5 max-w-[640px] text-[15px] text-muted">
            Rien n&apos;est encore enregistré. Commencez par ajouter un adhérent ou un premier
            mouvement. Pour découvrir l&apos;application sans risque, vous pouvez aussi charger des
            données de démonstration (familles fictives), puis les effacer en un clic.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/adherents" size="sm">
              Ajouter un adhérent
            </ButtonLink>
            <ButtonLink href="/parametres#demonstration" variant="secondary" size="sm">
              Charger la démonstration
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      <section
        aria-label="Chiffres clés"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr] xl:gap-5"
      >
        <Card tone="primary" className="@container animate-rise sm:col-span-2 xl:col-span-1">
          <p className="text-[15px] leading-snug text-on-primary-muted">Solde actuel</p>
          <p className="mb-1 mt-3 text-[clamp(30px,14cqw,44px)] font-semibold leading-[1.2] tracking-[-1px]">
            <CountUp value={data.balanceCents} format="euros" />
          </p>
          <p className="text-sm leading-snug text-on-primary-muted">
            Caisse + banque, chèques encaissés
          </p>
        </Card>

        <Card className="@container animate-rise stagger-1">
          <p className="text-[15px] leading-snug text-muted">Chèques à encaisser</p>
          <p className="mb-1 mt-3 whitespace-nowrap text-[clamp(26px,15cqw,36px)] font-semibold leading-[1.2] text-amber">
            <CountUp value={data.chequesToCash} format="integer" />{" "}
            {data.chequesToCash > 1 ? "chèques" : "chèque"}
          </p>
          <p className="text-sm leading-snug text-muted">{chequesHint}</p>
        </Card>

        <Card className="@container animate-rise stagger-2">
          <p className="text-[15px] leading-snug text-muted">Cours impayés</p>
          <p className="mb-1 mt-3 whitespace-nowrap text-[clamp(26px,15cqw,36px)] font-semibold leading-[1.2] text-accent">
            <CountUp value={data.unpaidFamilies} format="integer" />{" "}
            {data.unpaidFamilies > 1 ? "familles" : "famille"}
          </p>
          <p className="text-sm leading-snug text-muted">
            {formatEurosCompact(data.unpaidCents)} restant dû
          </p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:gap-5">
        <Card className="flex animate-rise flex-col stagger-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <CardTitle>Entrées et sorties</CardTitle>
            <ul className="flex gap-[18px] text-[13px] text-muted" aria-label="Légende">
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-income" />
                Entrées
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-accent" />
                Sorties
              </li>
            </ul>
          </div>
          <CashflowChart data={chartData} />
          <p className="mt-2 text-xs text-muted">Montants réellement encaissés et dépensés, par mois.</p>
        </Card>

        <Card className="animate-rise stagger-3">
          <div className="mb-2 flex items-center justify-between gap-4">
            <CardTitle>À encaisser bientôt</CardTitle>
            <Link href="/calendrier" className={CARD_LINK}>
              Calendrier
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <p className="border-t border-divider py-4 text-[15px] text-muted">
              Aucun chèque en attente d&apos;encaissement.
            </p>
          ) : null}
          <ul>
            {data.upcoming.map((cheque, index) => {
              const late = cheque.dueDay < data.today;
              const dueDate = parseIsoDay(cheque.dueDay);
              return (
                <li
                  key={cheque.id}
                  style={cascade(index, 300)}
                  className="flex animate-rise items-center justify-between gap-3 border-t border-divider py-4 stagger-i"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium leading-snug">
                      <Link href={memberHref(cheque.memberId)} className="text-ink no-underline hover:text-accent">
                        {cheque.family}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{cheque.detail}</p>
                  </div>
                  {late ? (
                    <Badge tone="late">
                      En retard
                      <span className="sr-only"> (prévu le {formatDayMonth(dueDate)})</span>
                    </Badge>
                  ) : (
                    <Badge tone="amber">{formatShortDay(dueDate)}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <Card as="section" className="animate-rise stagger-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <CardTitle>Cours impayés</CardTitle>
          <Link href="/adherents" className={CARD_LINK}>
            Voir tout
          </Link>
        </div>
        {data.unpaid.length === 0 ? (
          <p className="border-t border-divider py-4 text-[15px] text-muted">
            Tous les paiements enregistrés sont réglés.
          </p>
        ) : null}
        <ul>
          {data.unpaid.map((item, index) => (
            <li
              key={item.id}
              style={cascade(index, 380)}
              className="grid animate-rise grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 border-t border-divider py-4 stagger-i xl:flex xl:items-center"
            >
              <p className="font-medium xl:flex-1">
                <Link href={memberHref(item.memberId)} className="text-ink no-underline hover:text-accent">
                  {item.family}
                </Link>
              </p>
              <p className="order-last col-span-2 text-[15px] text-muted xl:order-none xl:flex-1 xl:text-base">
                {item.course}
              </p>
              <p className="order-last col-span-2 text-[15px] text-muted xl:order-none xl:flex-1 xl:text-base">
                {item.progress}
              </p>
              <p className="font-semibold text-accent">{formatEurosCompact(item.dueCents)} dus</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/**
 * Blocs d'attente aux dimensions des vraies cartes (mesurées avec les données
 * d'exemple) : rien ne saute quand le contenu arrive.
 */
function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr] xl:gap-5">
        <span role="status" className="sr-only">
          Chargement des comptes…
        </span>
        <Skeleton className="h-[156px] rounded-card sm:col-span-2 sm:h-[167px] xl:col-span-1" />
        <Skeleton className="h-[149px] rounded-card sm:h-[157px] xl:h-[167px]" />
        <Skeleton className="h-[149px] rounded-card sm:h-[157px] xl:h-[167px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:gap-5">
        <Skeleton className="h-[384px] rounded-card sm:h-[348px] xl:h-[392px]" />
        <Skeleton className="h-[384px] rounded-card sm:h-[392px]" />
      </div>
      <Skeleton className="h-[402px] rounded-card xl:h-[263px]" />
    </>
  );
}
