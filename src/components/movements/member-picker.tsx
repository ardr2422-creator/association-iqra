"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { FIELD_CLASSES } from "@/components/ui/field";
import { matchesSearch, searchKey } from "@/lib/search";
import type { MemberOption } from "@/lib/views";

/** Qui paie : un adhérent, quelqu'un d'autre, ou pas encore choisi. */
export type Payer = { kind: "member"; id: string } | { kind: "other" } | null;

export const OTHER_PAYER_LABEL = "Autre payeur (non adhérent)";

type Option = { key: string; label: string; payer: Exclude<Payer, null> };

type MemberPickerProps = {
  members: MemberOption[];
  value: Payer;
  /** `typed` : ce qui était saisi au moment du choix (sert à préremplir le nom d'un payeur de passage). */
  onChange: (value: Payer, typed: string) => void;
  /** Attributs fournis par `Field` (`id`, `aria-invalid`, `aria-describedby`). */
  control: { id: string; "aria-invalid": true | undefined; "aria-describedby": string | undefined };
  autoFocus?: boolean;
};

function labelOf(value: Payer, members: MemberOption[]): string {
  if (!value) return "";
  if (value.kind === "other") return OTHER_PAYER_LABEL;
  return members.find((member) => member.id === value.id)?.name ?? "";
}

/**
 * Choix de l'adhérent : on tape quelques lettres, la liste se réduit
 * (recherche dans la page, sans accents ni majuscules). La dernière ligne
 * permet de saisir un payeur qui n'est pas adhérent.
 *
 * Clavier : ↓ ↑ pour parcourir, Entrée pour choisir, Échap pour refermer la liste.
 */
export function MemberPicker({ members, value, onChange, control, autoFocus }: MemberPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedLabel = labelOf(value, members);
  const [text, setText] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Tant que le texte est celui du choix en cours, on montre toute la liste.
  const filtering = text.trim() !== "" && text !== selectedLabel;
  const matches = filtering ? members.filter((member) => matchesSearch(text, member.name)) : members;
  const options: Option[] = [
    ...matches.map((member) => ({
      key: member.id,
      label: member.name,
      payer: { kind: "member" as const, id: member.id },
    })),
    { key: "other", label: OTHER_PAYER_LABEL, payer: { kind: "other" as const } },
  ];
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  // La ligne parcourue au clavier reste visible dans la liste.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (option: Option) => {
    const typed = filtering ? text.trim() : "";
    setText(option.label);
    setOpen(false);
    onChange(option.payer, typed);
  };

  const openList = () => {
    const selected = options.findIndex(
      (option) =>
        value !== null &&
        option.payer.kind === value.kind &&
        (option.payer.kind === "other" || (value.kind === "member" && option.payer.id === value.id)),
    );
    setActive(selected === -1 ? 0 : selected);
    setOpen(true);
  };

  return (
    <div className="relative">
      <input
        {...control}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-autofocus={autoFocus ? "" : undefined}
        placeholder="Rechercher…"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setActive(0);
          setOpen(true);
          // Le texte ne correspond plus au choix précédent : il faut choisir à nouveau.
          if (value !== null && next !== selectedLabel) onChange(null, "");
        }}
        onClick={() => (open ? undefined : openList())}
        onFocus={(event) => event.target.select()}
        onBlur={() => {
          setOpen(false);
          if (value !== null) {
            setText(selectedLabel);
            return;
          }
          // Nom tapé en entier sans passer par la liste : on le reconnaît.
          const exact = members.filter((member) => searchKey(member.name) === searchKey(text));
          if (exact.length === 1) {
            setText(exact[0].name);
            onChange({ kind: "member", id: exact[0].id }, "");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openList();
              return;
            }
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + options.length) % options.length);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(options[activeIndex]);
          } else if (event.key === "Escape" && open) {
            // Échap referme d'abord la liste, pas toute la fenêtre.
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className={clsx(FIELD_CLASSES, "pr-10")}
      />
      <ChevronDownIcon
        size={18}
        className={clsx(
          "pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-faint transition-[rotate] duration-fast ease-soft",
          open && "rotate-180",
        )}
      />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Payeurs proposés"
        hidden={!open}
        className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 animate-fade overflow-y-auto overscroll-contain rounded-field border border-line bg-surface p-1.5 shadow-float"
      >
        {filtering && matches.length === 0 ? (
          <li role="presentation" className="px-3 py-2.5 text-sm text-muted">
            Aucun adhérent ne correspond à «&nbsp;{text.trim()}&nbsp;».
          </li>
        ) : null}
        {options.map((option, index) => {
          const selected =
            value !== null &&
            option.payer.kind === value.kind &&
            (option.payer.kind === "other" || (value.kind === "member" && option.payer.id === value.id));
          const other = option.payer.kind === "other";
          return (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={selected}
              data-active={index === activeIndex}
              // Garde le focus dans le champ : le clic ne doit pas le faire perdre.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={clsx(
                "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[15px] leading-snug transition-colors duration-fast ease-soft",
                index === activeIndex ? "bg-primary-soft text-accent" : other ? "text-nav" : "text-ink",
                // Filet de séparation au-dessus de « Autre payeur ».
                other && "relative mt-3 before:absolute before:inset-x-1 before:-top-1.5 before:h-px before:bg-divider first:mt-0 first:before:hidden",
              )}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {selected ? <CheckIcon size={16} strokeWidth={2.2} className="shrink-0" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
