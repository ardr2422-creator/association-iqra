"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Largeur maximale : 480px par défaut, 640px pour les formulaires à deux colonnes. */
  size?: "md" | "lg";
  children: ReactNode;
};

/**
 * Fenêtre modale basée sur l'élément natif <dialog> : le navigateur gère le
 * piège à focus, la touche Échap et le retour du focus à la fermeture.
 * L'ouverture et la fermeture sont animées en CSS (voir `dialog.modal`).
 *
 * Le composant reste monté quand il est fermé, pour que l'animation de
 * fermeture puisse se jouer.
 */
export function Dialog({ open, onClose, title, description, size = "md", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Le champ marqué `data-autofocus` reçoit le focus (sinon : le premier bouton).
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // La page reste montée en arrière-plan quand on navigue ailleurs :
  // on referme la fenêtre pour ne pas la retrouver ouverte au retour.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Clic sur le fond assombri (l'élément <dialog> lui-même).
        if (event.target === event.currentTarget) onClose();
      }}
      className={`modal m-auto w-[calc(100%-2rem)] ${size === "lg" ? "max-w-[640px]" : "max-w-[480px]"} rounded-card border border-line bg-surface p-0 text-ink shadow-float`}
    >
      <div className="p-6 desk:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[19px] font-semibold leading-snug">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1.5 text-[15px] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-field text-nav transition-[background-color,color,scale] duration-fast ease-soft hover:bg-primary-soft hover:text-ink active:scale-[0.94]"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
