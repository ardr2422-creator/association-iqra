import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** Ligne discrète au-dessus du titre (la date du jour, par exemple). */
  eyebrow?: ReactNode;
  /** Boutons d'action, à droite. */
  actions?: ReactNode;
};

export function PageHeader({ title, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex animate-rise flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1.5 min-h-[22px] text-[15px] text-muted">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.5px] desk:text-[32px]">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}
