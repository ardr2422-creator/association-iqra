import type { ComponentType, ReactNode, SVGProps } from "react";

type EmptyStateProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  title: string;
  description?: ReactNode;
  /** Bouton ou lien proposé pour commencer. */
  action?: ReactNode;
};

/** Message affiché quand une liste est vide : dit quoi faire ensuite. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex animate-rise flex-col items-center gap-3 px-4 py-10 text-center">
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-card bg-primary-soft text-accent"
        >
          <Icon size={26} />
        </span>
      ) : null}
      <p className="text-[17px] font-medium leading-snug">{title}</p>
      {description ? <p className="max-w-[440px] text-[15px] text-muted">{description}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
