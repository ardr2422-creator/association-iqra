"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createExpense } from "@/app/(app)/mouvements/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { FIELD_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";
import type { CategoryItem } from "@/lib/categories";
import { isIsoDay } from "@/lib/days";
import { METHOD_LABELS, parseAmount, type PaymentMethod } from "@/lib/payments";
import { INVALID_FORM } from "@/lib/validation";
import { Notice, Reveal, Select } from "./form-parts";

type ExpenseFormProps = {
  /** Catégories de sortie actives. */
  categories: CategoryItem[];
  today: string;
  onDone: () => void;
};

type Errors = Record<string, string>;

/** Ordre du formulaire : les dépenses se règlent le plus souvent en espèces ou par carte. */
const EXPENSE_METHODS: PaymentMethod[] = ["CASH", "CHEQUE", "TRANSFER", "CARD"];

const FIELD_FALLBACKS: Errors = {
  categoryId: "Choisissez une catégorie.",
  method: "Choisissez un moyen de paiement.",
};

export function ExpenseForm({ categories, today, onDone }: ExpenseFormProps) {
  const [day, setDay] = useState(today);
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(categories.length === 1 ? categories[0].id : "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bank, setBank] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusErrors, setFocusErrors] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const cheque = method === "CHEQUE";

  // Après un refus, le focus va sur le premier champ à corriger.
  useEffect(() => {
    if (focusErrors === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusErrors]);

  const clearError = (key: string) => {
    if (!(key in errors)) return;
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const validate = (): Errors => {
    const found: Errors = {};
    if (!isIsoDay(day)) found.day = "Indiquez une date.";
    else if (day > today) found.day = "La date d'une dépense ne peut pas être dans le futur.";
    if (label.trim() === "") found.label = "Indiquez à quoi correspond cette dépense.";
    if (!categoryId) found.categoryId = FIELD_FALLBACKS.categoryId;
    if (amount.trim() === "") found.amount = "Indiquez un montant.";
    else if (parseAmount(amount) === null) found.amount = "Ce montant n'est pas valide (exemple : 120 ou 120,50).";
    return found;
  };

  const submit = () => {
    if (pending) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setMessage(INVALID_FORM);
      setFocusErrors((value) => value + 1);
      return;
    }
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await createExpense({
        day,
        label,
        categoryId,
        amount,
        method,
        chequeNumber: cheque ? chequeNumber : null,
        bank: cheque ? bank : null,
        notes,
      });
      if (result.ok) {
        onDone();
        return;
      }
      const localized: Errors = {};
      for (const [key, text] of Object.entries(result.fieldErrors ?? {})) {
        localized[key] = FIELD_FALLBACKS[key] ?? text;
      }
      setErrors(localized);
      setMessage(result.message);
      setFocusErrors((value) => value + 1);
    });
  };

  if (categories.length === 0) {
    return (
      <div className="mt-4 flex flex-col gap-5">
        <Notice>
          Aucune catégorie de sortie n&apos;est disponible. Créez-en une (« Fournitures », « Loyer »…) ou restaurez
          une catégorie archivée, puis revenez enregistrer la dépense.
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Libellé" error={errors.label} className="sm:col-span-2">
          {(control) => (
            <input
              {...control}
              type="text"
              name="label"
              data-autofocus
              autoComplete="off"
              maxLength={80}
              placeholder="Ex. Location minibus"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                clearError("label");
              }}
              className={FIELD_CLASSES}
            />
          )}
        </Field>

        <Field label="Date" error={errors.day}>
          {(control) => (
            <input
              {...control}
              type="date"
              name="day"
              required
              max={today}
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                clearError("day");
              }}
              className={FIELD_CLASSES}
            />
          )}
        </Field>

        <Field label="Catégorie" error={errors.categoryId}>
          {(control) => (
            <Select
              {...control}
              name="categoryId"
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

        <Field label="Montant" error={errors.amount}>
          {(control) => (
            <input
              {...control}
              type="text"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00 €"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                clearError("amount");
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
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              {EXPENSE_METHODS.map((option) => (
                <option key={option} value={option}>
                  {METHOD_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Reveal show={cheque}>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <Field label="N° du chèque (facultatif)" error={errors.chequeNumber}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="chequeNumber"
                inputMode="numeric"
                autoComplete="off"
                maxLength={30}
                value={chequeNumber}
                onChange={(event) => {
                  setChequeNumber(event.target.value);
                  clearError("chequeNumber");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
          <Field label="Banque (facultatif)" error={errors.bank}>
            {(control) => (
              <input
                {...control}
                type="text"
                name="bank"
                autoComplete="off"
                maxLength={60}
                value={bank}
                onChange={(event) => {
                  setBank(event.target.value);
                  clearError("bank");
                }}
                className={FIELD_CLASSES}
              />
            )}
          </Field>
        </div>
      </Reveal>

      <Field label="Notes (facultatif)" error={errors.notes} className="mt-4">
        {(control) => (
          <textarea
            {...control}
            name="notes"
            rows={2}
            maxLength={500}
            placeholder="Ex. Facture n° 2026-118, remboursée à Mme Diallo"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              clearError("notes");
            }}
            className={`${FIELD_CLASSES} resize-y`}
          />
        )}
      </Field>

      <div className="mt-6 flex flex-col gap-4">
        <FormAlert message={message} />
        <Button type="submit" size="lg" className="w-full" aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          Enregistrer la dépense
        </Button>
      </div>
    </form>
  );
}
