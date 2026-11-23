"use client";

import { useId } from "react";
import clsx from "clsx";

type SearchFieldProps = {
  /** Étiquette lue par les lecteurs d'écran (« Rechercher un mouvement »). */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** Champ de recherche des maquettes. La recherche se fait dans la page, jamais dans la base. */
export function SearchField({ label, placeholder, value, onChange, className }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={clsx("w-full desk:w-[280px]", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow] duration-fast ease-soft focus:border-accent focus:outline-none focus:ring-4 focus:ring-primary-soft"
      />
    </div>
  );
}
