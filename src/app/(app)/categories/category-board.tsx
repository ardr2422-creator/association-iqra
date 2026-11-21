"use client";

import { useActionState, useId, useState, useTransition } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { AlertIcon, CheckIcon, PencilIcon, RestoreIcon, TrashIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FIELD_CLASSES, LABEL_CLASSES } from "@/components/ui/field";
import {
  CATEGORY_COLOR_INFO,
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX,
  categoryTone,
  FLOW_LABELS,
  FLOW_TYPES,
  type CategoryColor,
  type CategoryItem,
  type FlowType,
} from "@/lib/categories";
import { plural } from "@/lib/format";
import {
  deleteCategory,
  restoreCategory,
  saveCategory,
  type CategoryFormState,
} from "./actions";

type DialogContent =
  | { kind: "create"; type: FlowType }
  | { kind: "edit"; category: CategoryItem }
  | { kind: "delete"; category: CategoryItem };

const ROW_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

const ICON_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-field text-nav " +
  "transition-[background-color,color,scale] duration-fast ease-soft hover:bg-primary-soft hover:text-accent active:scale-[0.94]";

function usageLabel(count: number): string {
  return count === 0 ? "Pas encore utilisée" : plural(count, "mouvement");
}

export function CategoryBoard({ categories }: { categories: CategoryItem[] }) {
  // Le contenu est conservé pendant l'animation de fermeture ; `instance`
  // remet le formulaire à zéro à chaque ouverture.
  const [content, setContent] = useState<DialogContent | null>(null);
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  const show = (next: DialogContent) => {
    setContent(next);
    setInstance((value) => value + 1);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  const title =
    content?.kind === "create"
      ? content.type === "INCOME"
        ? "Nouvelle catégorie d'entrée"
        : "Nouvelle catégorie de sortie"
      : content?.kind === "edit"
        ? "Modifier la catégorie"
        : content?.category.usageCount
          ? "Archiver la catégorie"
          : "Supprimer la catégorie";

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
        {FLOW_TYPES.map((type, index) => (
          <CategoryColumn
            key={type}
            type={type}
            items={active.filter((category) => category.type === type)}
            className={index === 0 ? "stagger-1" : "stagger-2"}
            onCreate={() => show({ kind: "create", type })}
            onEdit={(category) => show({ kind: "edit", category })}
            onDelete={(category) => show({ kind: "delete", category })}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {archived.length > 0 ? (
          <motion.div
            key="archived"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={ROW_TRANSITION}
          >
            <ArchivedCategories items={archived} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog open={open} onClose={close} title={title ?? ""}>
        {content?.kind === "delete" ? (
          <DeleteConfirmation key={instance} category={content.category} onDone={close} />
        ) : content ? (
          <CategoryForm key={instance} content={content} onDone={close} />
        ) : null}
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Colonne « Entrées » ou « Sorties »                                  */
/* ------------------------------------------------------------------ */

function CategoryColumn({
  type,
  items,
  className,
  onCreate,
  onEdit,
  onDelete,
}: {
  type: FlowType;
  items: CategoryItem[];
  className?: string;
  onCreate: () => void;
  onEdit: (category: CategoryItem) => void;
  onDelete: (category: CategoryItem) => void;
}) {
  const label = FLOW_LABELS[type];
  return (
    <Card as="section" className={clsx("animate-rise", className)}>
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={clsx("size-2.5 rounded-full", type === "INCOME" ? "bg-income" : "bg-accent")}
            />
            {label.plural}
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            {items.length === 0 ? "Aucune catégorie" : plural(items.length, "catégorie")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCreate}>
          + Ajouter
          <span className="sr-only">
            {type === "INCOME" ? " une catégorie d'entrée" : " une catégorie de sortie"}
          </span>
        </Button>
      </div>

      <ul>
        <AnimatePresence initial={false}>
          {items.map((category) => (
            <motion.li
              key={category.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={ROW_TRANSITION}
              className="-mx-1 overflow-hidden px-1"
            >
              <div className="flex items-center gap-3 border-t border-divider py-2">
                <Badge tone={categoryTone(category.color)} className="max-w-[60%]">
                  <span className="truncate">{category.name}</span>
                </Badge>
                <span className="hidden truncate text-sm text-muted sm:inline">
                  {usageLabel(category.usageCount)}
                </span>
                <div className="ml-auto flex gap-0.5">
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Modifier « ${category.name} »`}
                    onClick={() => onEdit(category)}
                  >
                    <PencilIcon size={18} />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Supprimer « ${category.name} »`}
                    onClick={() => onDelete(category)}
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {items.length === 0 ? (
        <p className="border-t border-divider py-5 text-[15px] text-muted">
          Ajoutez votre première catégorie avec le bouton ci-dessus.
        </p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Formulaire de création / modification                               */
/* ------------------------------------------------------------------ */

function CategoryForm({
  content,
  onDone,
}: {
  content: Extract<DialogContent, { kind: "create" | "edit" }>;
  onDone: () => void;
}) {
  const editing = content.kind === "edit" ? content.category : null;
  const type = editing ? editing.type : content.kind === "create" ? content.type : "INCOME";
  const initialColor: CategoryColor =
    editing && (CATEGORY_COLORS as readonly string[]).includes(editing.color)
      ? (editing.color as CategoryColor)
      : type === "INCOME"
        ? "bordeaux"
        : "rose";

  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<CategoryColor>(initialColor);
  const nameId = useId();
  const errorId = useId();

  const [state, formAction, pending] = useActionState(
    async (previous: CategoryFormState, formData: FormData) => {
      const result = await saveCategory(previous, formData);
      if (result?.ok) onDone();
      return result;
    },
    undefined,
  );

  const nameError = state && !state.ok ? state.fieldErrors?.name : undefined;
  const formError = state && !state.ok ? state.message : undefined;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="mt-5 flex flex-col gap-5"
    >
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="type" value={type} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={LABEL_CLASSES}>
          Nom
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          data-autofocus
          required
          maxLength={CATEGORY_NAME_MAX}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={type === "INCOME" ? "Ex. Stages d'été" : "Ex. Assurance"}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? errorId : undefined}
          className={FIELD_CLASSES}
        />
        <div role="alert" id={errorId}>
          {nameError ? <p className="animate-fade text-sm text-accent">{nameError}</p> : null}
        </div>
      </div>

      <fieldset>
        <legend className={LABEL_CLASSES}>Couleur de la pastille</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((option) => (
            <label key={option} className="relative cursor-pointer">
              <input
                type="radio"
                name="color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="peer sr-only"
              />
              <Badge
                tone={CATEGORY_COLOR_INFO[option].tone}
                className="gap-1.5 border-2 border-transparent py-2 transition-[border-color,scale] duration-fast ease-soft peer-checked:border-current peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent active:scale-[0.96]"
              >
                {color === option ? <CheckIcon size={14} strokeWidth={2.4} /> : null}
                {CATEGORY_COLOR_INFO[option].label}
              </Badge>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 rounded-field bg-page px-4 py-3">
        <span className="text-sm text-muted">
          Aperçu · {FLOW_LABELS[type].singular.toLowerCase()}
        </span>
        <Badge tone={CATEGORY_COLOR_INFO[color].tone} className="max-w-[65%]">
          <span className="truncate">{name.trim() || "Nom de la catégorie"}</span>
        </Badge>
      </div>

      <div role="alert" className="empty:hidden">
        {formError ? (
          <p className="flex animate-fade items-start gap-2.5 rounded-field bg-late-soft px-3.5 py-3 text-sm text-accent">
            <AlertIcon size={18} className="mt-px shrink-0" />
            {formError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {editing ? "Enregistrer" : "Créer la catégorie"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation de suppression / d'archivage                           */
/* ------------------------------------------------------------------ */

function DeleteConfirmation({ category, onDone }: { category: CategoryItem; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inUse = category.usageCount > 0;

  const confirm = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (result.ok) onDone();
      else setError(result.message);
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3">
        <Badge tone={categoryTone(category.color)} className="max-w-full">
          <span className="truncate">{category.name}</span>
        </Badge>
        <p className="text-[15px] text-muted">
          {inUse ? (
            <>
              Cette catégorie est utilisée par {plural(category.usageCount, "mouvement")}. Elle sera{" "}
              <strong className="font-medium text-ink">archivée</strong> : elle disparaît des
              formulaires mais reste visible sur les mouvements existants. Vous pourrez la restaurer
              à tout moment.
            </>
          ) : (
            <>
              Cette catégorie n&apos;est utilisée par aucun mouvement. Elle sera{" "}
              <strong className="font-medium text-ink">supprimée définitivement</strong>.
            </>
          )}
        </p>
      </div>

      <div role="alert" className="empty:hidden">
        {error ? (
          <p className="flex animate-fade items-start gap-2.5 rounded-field bg-late-soft px-3.5 py-3 text-sm text-accent">
            <AlertIcon size={18} className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} data-autofocus>
          Annuler
        </Button>
        <Button onClick={confirm} aria-disabled={pending}>
          {pending ? <Spinner /> : null}
          {inUse ? "Archiver" : "Supprimer"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Catégories archivées                                                */
/* ------------------------------------------------------------------ */

function ArchivedCategories({ items }: { items: CategoryItem[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const restore = (category: CategoryItem) => {
    if (pendingId) return;
    setPendingId(category.id);
    setError(null);
    startTransition(async () => {
      const result = await restoreCategory(category.id);
      if (!result.ok) setError(result.message);
      setPendingId(null);
    });
  };

  return (
    <Card as="section">
      <CardTitle>Catégories archivées</CardTitle>
      <p className="mb-2 mt-0.5 text-sm text-muted">
        Masquées des formulaires, conservées sur les mouvements déjà enregistrés.
      </p>
      <div role="alert" className="empty:hidden">
        {error ? <p className="animate-fade pb-2 text-sm text-accent">{error}</p> : null}
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {items.map((category) => (
            <motion.li
              key={category.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={ROW_TRANSITION}
              className="-mx-1 overflow-hidden px-1"
            >
              <div className="flex items-center gap-3 border-t border-divider py-2">
                <Badge tone="neutral" className="max-w-[50%]">
                  <span className="truncate">{category.name}</span>
                </Badge>
                <span className="truncate text-sm text-muted">
                  {FLOW_LABELS[category.type].singular} · {usageLabel(category.usageCount)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  aria-disabled={pendingId !== null}
                  aria-label={`Restaurer « ${category.name} »`}
                  onClick={() => restore(category)}
                >
                  {pendingId === category.id ? <Spinner /> : <RestoreIcon size={16} />}
                  Restaurer
                </Button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin-slow rounded-full border-2 border-current/30 border-t-current"
    />
  );
}
