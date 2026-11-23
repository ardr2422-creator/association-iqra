"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { createIncome } from "@/app/(app)/mouvements/actions";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FIELD_CLASSES, LABEL_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";
import type { CategoryItem } from "@/lib/categories";
import { isIsoDay } from "@/lib/days";
import { formatEuros } from "@/lib/format";
import {
  amountInputValue,
  defaultDueDays,
  INCOME_METHODS,
  MAX_INSTALLMENTS,
  METHOD_LABELS,
  parseAmount,
  splitAmount,
  type IncomeMethod,
} from "@/lib/payments";
import { memberHref, receiptPdfHref } from "@/lib/routes";
import { INVALID_FORM } from "@/lib/validation";
import type { MemberOption, ReceiptRef } from "@/lib/views";
import { Notice, Reveal, Select } from "./form-parts";
import { IncomeSchedule, scheduleSum, type ScheduleLine } from "./income-schedule";
import { MemberPicker, type Payer } from "./member-picker";

type IncomeFormProps = {
  members: MemberOption[];
  /** Catégories d'entrée actives. */
  categories: CategoryItem[];
  today: string;
  /** Adhérent présélectionné (lien « + Encaissement » d'une fiche adhérent). */
  initialMemberId: string | null;
  onDone: () => void;
  /** Rouvre un formulaire vide pour saisir l'encaissement suivant. */
  onAgain: () => void;
};

type Errors = Record<string, string>;

type Done = {
  receipt: ReceiptRef | null;
  memberId: string | null;
  payerLabel: string;
  count: number;
  cashed: boolean;
};

const COUNTS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => index + 1);

const AMOUNT_REQUIRED = "Indiquez un montant.";
const AMOUNT_INVALID = "Ce montant n'est pas valide (exemple : 120 ou 120,50).";
const FUTURE_DAY = "La date d'un encaissement ne peut pas être dans le futur.";

/**
 * Les messages par défaut du serveur pour ces champs ne sont pas rédigés pour
 * la trésorière : on les remplace par une consigne claire.
 */
const FIELD_FALLBACKS: Errors = {
  memberId: "Choisissez un adhérent dans la liste.",
  categoryId: "Choisissez une catégorie.",
  participants: "Indiquez un nombre entre 1 et 50.",
  method: "Choisissez un moyen de paiement.",
};

function localize(fieldErrors: Errors | undefined): Errors {
  const errors: Errors = {};
  for (const [key, message] of Object.entries(fieldErrors ?? {})) {
    errors[key] = FIELD_FALLBACKS[key] ?? message;
  }
  return errors;
}

function amountError(raw: string): string | null {
  if (raw.trim() === "") return AMOUNT_REQUIRED;
  return parseAmount(raw) === null ? AMOUNT_INVALID : null;
}

export function IncomeForm({ members, categories, today, initialMemberId, onDone, onAgain }: IncomeFormProps) {
  const initialMember = members.find((member) => member.id === initialMemberId) ?? null;

  const [payer, setPayer] = useState<Payer>(
    initialMember ? { kind: "member", id: initialMember.id } : members.length === 0 ? { kind: "other" } : null,
  );
  const [payerName, setPayerName] = useState("");
  const [categoryId, setCategoryId] = useState(categories.length === 1 ? categories[0].id : "");
  const [total, setTotal] = useState("");
  const [method, setMethod] = useState<IncomeMethod>("CHEQUE");
  const [day, setDay] = useState(today);
  const [label, setLabel] = useState("");
  const [participants, setParticipants] = useState("");
  const [count, setCount] = useState(1);
  const [firstCashed, setFirstCashed] = useState(true);
  // Échéancier : `null` = calculé automatiquement à partir du total et de la date.
  const [manualAmounts, setManualAmounts] = useState<string[] | null>(null);
  const [manualDays, setManualDays] = useState<string[] | null>(null);
  const [numbers, setNumbers] = useState<string[]>(() => COUNTS.map(() => ""));
  // Banque : `null` = la même que celle du premier chèque.
  const [banks, setBanks] = useState<(string | null)[]>(() => COUNTS.map((_, index) => (index === 0 ? "" : null)));

  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusErrors, setFocusErrors] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const payerNameRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const payLabelId = useId();
  const payHintId = useId();
  const cashedId = useId();

  const other = payer?.kind === "other";
  const cheque = method === "CHEQUE";
  const multiple = count > 1;
  /** Un mouvement (et son reçu) est créé tout de suite. */
  const cashedNow = other || firstCashed;

  const totalCents = parseAmount(total);
  const amounts =
    manualAmounts ??
    (totalCents !== null && totalCents > 0
      ? splitAmount(totalCents, count).map(amountInputValue)
      : COUNTS.slice(0, count).map(() => ""));
  const days = manualDays
    ? [day, ...manualDays.slice(1)]
    : isIsoDay(day)
      ? defaultDueDays(day, count)
      : COUNTS.slice(0, count).map(() => "");
  /** Les versements tels qu'affichés (et envoyés) : un seul pour un paiement en une fois. */
  const lines: ScheduleLine[] = amounts.map((amount, index) => ({
    amount,
    day: days[index],
    chequeNumber: numbers[index],
    bank: banks[index] ?? banks[0] ?? "",
  }));
  const sumCents = scheduleSum(lines);

  // Formulaire rouvert dans une fenêtre déjà ouverte (« Saisir un autre
  // encaissement ») : le focus revient sur le premier champ.
  useEffect(() => {
    const form = formRef.current;
    if (form && !form.contains(document.activeElement)) {
      form.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
  }, []);

  // Après un refus, le focus va sur le premier champ à corriger.
  useEffect(() => {
    if (focusErrors === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusErrors]);

  // Une fois enregistré, le focus va sur les boutons de la confirmation.
  useEffect(() => {
    if (done) doneRef.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
  }, [done]);

  const clearError = (...keys: string[]) => {
    if (!keys.some((key) => key in errors)) return;
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of keys) delete next[key];
      return next;
    });
  };

  const choosePayer = (next: Payer, typed: string) => {
    setPayer(next);
    clearError("memberId", "payerName");
    if (next?.kind === "other") {
      // Un payeur de passage règle en une fois, encaissée tout de suite.
      setCount(1);
      setFirstCashed(true);
      setManualAmounts(null);
      setManualDays(null);
      if (typed && payerName.trim() === "") setPayerName(typed);
      requestAnimationFrame(() => payerNameRef.current?.focus());
    }
  };

  const chooseCount = (next: number) => {
    setCount(next);
    setManualAmounts(null);
    setManualDays(null);
    setMessage(null);
    setErrors((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith("installments.") && key !== "total")),
    );
  };

  const editLine = (index: number, field: keyof ScheduleLine, value: string) => {
    clearError(`installments.${index}.${field}`);
    if (field === "amount") {
      // Première retouche : on fige la répartition affichée, puis on applique la saisie.
      setManualAmounts(amounts.map((amount, position) => (position === index ? value : amount)));
    } else if (field === "day") {
      // La date du premier versement est celle du formulaire : les suivantes la suivent.
      if (index === 0) setDay(value);
      else setManualDays(days.map((item, position) => (position === index ? value : item)));
    } else if (field === "chequeNumber") {
      setNumbers((previous) => previous.map((item, position) => (position === index ? value : item)));
    } else {
      setBanks((previous) => previous.map((item, position) => (position === index ? value : item)));
    }
  };

  /** Revient à la répartition automatique (montants égaux, une date par mois). */
  const resetSchedule = () => {
    setManualAmounts(null);
    setManualDays(null);
    setMessage(null);
    setErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => !key.startsWith("installments.") || key === "installments.0.day"),
      ),
    );
  };

  const validate = (): { errors: Errors; message: string } => {
    const found: Errors = {};
    let summary = INVALID_FORM;

    if (!payer) found.memberId = "Choisissez un adhérent dans la liste, ou «\u00a0Autre payeur\u00a0».";
    if (other && payerName.trim() === "") found.payerName = "Indiquez qui a payé.";
    if (!categoryId) found.categoryId = FIELD_FALLBACKS.categoryId;

    const totalProblem = amountError(total);
    if (totalProblem) found.total = totalProblem;

    if (!isIsoDay(day)) found["installments.0.day"] = "Indiquez une date.";
    else if (cashedNow && day > today) found["installments.0.day"] = FUTURE_DAY;

    if (!other && participants.trim() !== "") {
      const value = Number(participants.trim());
      if (!/^\d{1,2}$/.test(participants.trim()) || value < 1 || value > 50) {
        found.participants = FIELD_FALLBACKS.participants;
      }
    }

    if (multiple) {
      lines.forEach((line, index) => {
        const problem = amountError(line.amount);
        if (problem) found[`installments.${index}.amount`] = problem;
        if (index === 0) return;
        const previous = lines[index - 1].day;
        if (!isIsoDay(line.day)) found[`installments.${index}.day`] = "Indiquez une date.";
        else if (isIsoDay(previous) && line.day < previous) {
          found[`installments.${index}.day`] = "Cette date doit suivre celle du versement précédent.";
        }
      });
      if (Object.keys(found).length === 0 && totalCents !== null && sumCents !== null && sumCents !== totalCents) {
        found.schedule = "mismatch";
        summary =
          `Les versements font ${formatEuros(sumCents)}, pas ${formatEuros(totalCents)}. ` +
          "Corrigez un montant, ou répartissez à nouveau le total.";
      }
    }
    return { errors: found, message: summary };
  };

  const submit = () => {
    if (pending) return;
    const check = validate();
    if (Object.keys(check.errors).length > 0) {
      setErrors(check.errors);
      setMessage(check.message);
      setFocusErrors((value) => value + 1);
      return;
    }
    setErrors({});
    setMessage(null);

    const member = payer?.kind === "member" ? members.find((item) => item.id === payer.id) : undefined;
    // En une fois : un seul versement, du montant total, à la date du formulaire.
    const installments = (multiple ? lines : [{ ...lines[0], amount: total, day }]).map((line) => ({
      amount: line.amount,
      day: line.day,
      chequeNumber: cheque ? line.chequeNumber : null,
      bank: cheque ? line.bank : null,
    }));

    startTransition(async () => {
      const result = await createIncome({
        memberId: member?.id ?? null,
        payerName: other ? payerName : null,
        categoryId,
        label,
        participants: other ? null : participants,
        method,
        installments,
        firstCashed: cashedNow,
        notes: null,
      });
      if (result.ok) {
        setDone({
          receipt: result.receipt,
          memberId: result.memberId,
          payerLabel: member?.name ?? payerName.trim(),
          count,
          cashed: cashedNow,
        });
      } else {
        setErrors(localize(result.fieldErrors));
        setMessage(result.message);
        setFocusErrors((value) => value + 1);
      }
    });
  };

  /* ---------------------------------------------------------------- */
  /* Rien à choisir : on explique quoi faire                           */
  /* ---------------------------------------------------------------- */
  if (categories.length === 0) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <Notice>
          Aucune catégorie d&apos;entrée n&apos;est disponible. Créez-en une (« Cours d&apos;arabe », « Dons »…) ou
          restaurez une catégorie archivée, puis revenez enregistrer l&apos;encaissement.
        </Notice>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDone}>
            Fermer
          </Button>
          <ButtonLink href="/categories" data-autofocus>
            Gérer les catégories
          </ButtonLink>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Confirmation                                                      */
  /* ---------------------------------------------------------------- */
  if (done) {
    const planned = done.cashed ? done.count - 1 : done.count;
    return (
      <div ref={doneRef} className="mt-4 flex flex-col gap-5">
        <p role="status" className="animate-fade rounded-field bg-income-soft px-4 py-3 text-[15px] text-income-strong">
          {done.receipt
            ? `Encaissement enregistré. Reçu n° ${done.receipt.number}.`
            : done.count > 1
              ? `Échéancier enregistré : ${done.count} versements prévus.`
              : "Paiement prévu enregistré."}
        </p>
        {planned > 0 ? (
          <p className="text-[15px] text-muted">
            {done.cashed
              ? planned > 1
                ? `Les ${planned} versements suivants sont prévus : ils apparaissent dans le calendrier et sur la fiche de ${done.payerLabel}.`
                : `Le versement suivant est prévu : il apparaît dans le calendrier et sur la fiche de ${done.payerLabel}.`
              : `Rien n'est encaissé pour l'instant : le reçu sera créé quand vous marquerez ${
                  planned > 1 ? "chaque versement" : "le paiement"
                } comme encaissé.`}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="secondary" onClick={onDone} data-primary={done.receipt || done.memberId ? undefined : ""}>
            Fermer
          </Button>
          <Button variant="secondary" onClick={onAgain}>
            Saisir un autre
          </Button>
          {done.receipt ? (
            <a
              href={receiptPdfHref(done.receipt.id)}
              target="_blank"
              rel="noopener"
              data-primary=""
              className={buttonClasses("primary")}
            >
              Ouvrir le reçu (PDF)
            </a>
          ) : done.memberId ? (
            <ButtonLink href={memberHref(done.memberId)} data-primary="">
              Voir la fiche de l&apos;adhérent
            </ButtonLink>
          ) : null}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Formulaire                                                        */
  /* ---------------------------------------------------------------- */
  const totalError = errors.total ?? (multiple ? undefined : errors["installments.0.amount"]);
  const dayError = errors["installments.0.day"];

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-5 flex flex-col"
    >
      {members.length === 0 ? (
        <div className="mb-5">
          <Notice>
            Aucun adhérent n&apos;est encore enregistré : vous pouvez saisir un payeur de passage ci-dessous, ou{" "}
            <Link href="/adherents" className="underline underline-offset-2">
              ajouter d&apos;abord un adhérent
            </Link>{" "}
            pour suivre ses paiements et payer en plusieurs fois.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Adhérent" error={errors.memberId}>
          {(control) => (
            <MemberPicker
              members={members}
              value={payer}
              onChange={choosePayer}
              control={control}
              autoFocus={!initialMember && members.length > 0}
            />
          )}
        </Field>

        {other ? (
          <Field label="Nom du payeur" error={errors.payerName} className="animate-fade">
            {(control) => (
              <input
                {...control}
                ref={payerNameRef}
                type="text"
                name="payerName"
                autoComplete="off"
                maxLength={80}
                data-autofocus={members.length === 0 ? "" : undefined}
                placeholder="Ex. M. et Mme Martin"
                value={payerName}
                onChange={(event) => {
                  setPayerName(event.target.value);
                  clearError("payerName");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
        ) : null}

        <Field label="Catégorie" error={errors.categoryId}>
          {(control) => (
            <Select
              {...control}
              name="categoryId"
              data-autofocus={initialMember ? "" : undefined}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                clearError("categoryId");
              }}
            >
              {categories.length > 1 ? <option value="">Choisir…</option> : null}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Montant total" error={totalError}>
          {(control) => (
            <input
              {...control}
              type="text"
              name="total"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00 €"
              value={total}
              onChange={(event) => {
                setTotal(event.target.value);
                clearError("total", "installments.0.amount", "schedule");
              }}
              className={FIELD_CLASSES}
            />
          )}
        </Field>

        <Field label="Moyen de paiement" error={errors.method}>
          {(control) => (
            <Select
              {...control}
              name="method"
              value={method}
              onChange={(event) => setMethod(event.target.value as IncomeMethod)}
            >
              {INCOME_METHODS.map((option) => (
                <option key={option} value={option}>
                  {METHOD_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={multiple ? "Date du premier versement" : cashedNow ? "Date" : "Date prévue"}
          error={dayError}
        >
          {(control) => (
            <input
              {...control}
              type="date"
              name="day"
              required
              max={cashedNow ? today : undefined}
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                clearError("installments.0.day");
              }}
              className={FIELD_CLASSES}
            />
          )}
        </Field>

        {other ? null : (
          <Field label="Nombre d'inscrits (facultatif)" error={errors.participants}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="participants"
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                placeholder="Ex. 2"
                value={participants}
                onChange={(event) => {
                  setParticipants(event.target.value);
                  clearError("participants");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
        )}

        <Field label="Libellé (facultatif)" error={errors.label} className="sm:col-span-2">
          {(control) => (
            <input
              {...control}
              type="text"
              name="label"
              autoComplete="off"
              maxLength={80}
              placeholder="Ex. Cours d'arabe 2026-2027"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                clearError("label");
              }}
              className={FIELD_CLASSES}
            />
          )}
        </Field>
      </div>

      <p id={payLabelId} className={clsx(LABEL_CLASSES, "mb-2.5 mt-5")}>
        Payer en
      </p>
      <div
        role="group"
        aria-labelledby={payLabelId}
        aria-describedby={other ? payHintId : undefined}
        className="flex flex-wrap gap-2.5"
      >
        {COUNTS.map((option) => (
          <Chip
            key={option}
            selected={count === option}
            disabled={other && option > 1}
            onClick={() => chooseCount(option)}
            className="disabled:pointer-events-none disabled:opacity-45 max-sm:px-3.5"
          >
            {option} fois
          </Chip>
        ))}
      </div>
      {other ? (
        <p id={payHintId} className="mt-3 animate-fade text-[13px] text-muted">
          Le paiement en plusieurs fois est réservé aux adhérents : choisissez un adhérent pour créer un échéancier.
        </p>
      ) : null}
      <Reveal show={multiple}>
        <p className="pt-3 text-[13px] text-muted">
          Les {count} dates d&apos;encaissement sont créées et apparaissent dans le calendrier.
        </p>
      </Reveal>

      {/* Paiement en une fois par chèque : numéro et banque. */}
      <Reveal show={!multiple && cheque}>
        <div className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label="N° du chèque (facultatif)" error={errors["installments.0.chequeNumber"]}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="chequeNumber"
                inputMode="numeric"
                autoComplete="off"
                maxLength={30}
                value={numbers[0]}
                onChange={(event) => {
                  const value = event.target.value;
                  setNumbers((previous) => previous.map((item, index) => (index === 0 ? value : item)));
                  clearError("installments.0.chequeNumber");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
          <Field label="Banque (facultatif)" error={errors["installments.0.bank"]}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="bank"
                autoComplete="off"
                maxLength={60}
                value={lines[0].bank}
                onChange={(event) => {
                  const value = event.target.value;
                  setBanks((previous) => previous.map((item, index) => (index === 0 ? value : item)));
                  clearError("installments.0.bank");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
        </div>
      </Reveal>

      {/* Paiement en plusieurs fois : une ligne par versement. */}
      <Reveal show={multiple}>
        <div className="pt-5">
          <IncomeSchedule
            lines={lines}
            method={method}
            firstCashed={cashedNow}
            today={today}
            totalCents={totalCents}
            errors={errors}
            edited={manualAmounts !== null || manualDays !== null}
            onChange={editLine}
            onReset={resetSchedule}
          />
        </div>
      </Reveal>

      <Reveal show={!other}>
        <div className="pt-5">
          <label htmlFor={cashedId} className="flex min-h-10 cursor-pointer items-center gap-3 text-[15px]">
            <input
              id={cashedId}
              type="checkbox"
              name="firstCashed"
              checked={firstCashed}
              onChange={(event) => {
                setFirstCashed(event.target.checked);
                clearError("installments.0.day");
              }}
              className="size-5 shrink-0 accent-primary"
            />
            {multiple ? "Le premier versement est encaissé à cette date" : "Le paiement est encaissé à cette date"}
          </label>
          <Reveal show={!firstCashed}>
            <p className="pt-1 text-[13px] text-muted">
              Rien n&apos;est encaissé pour l&apos;instant : aucun reçu n&apos;est créé et le solde ne change pas.
              Vous marquerez {multiple ? "chaque versement" : "le paiement"} comme encaissé le moment venu.
            </p>
          </Reveal>
        </div>
      </Reveal>

      <div className="mt-6 flex flex-col gap-4">
        <FormAlert message={message} />
        <Button type="submit" size="lg" className="w-full" aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {cashedNow ? "Enregistrer et générer le reçu" : "Enregistrer l'échéancier"}
        </Button>
      </div>
    </form>
  );
}
