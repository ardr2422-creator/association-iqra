"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { logout } from "@/app/connexion/actions";
import { LogoutIcon } from "@/components/icons";
import { LOGIN_HREF } from "@/lib/navigation";

type LogoutButtonProps = { compact?: boolean; className?: string };

export function LogoutButton({ compact = false, className }: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await logout();
      } finally {
        // Rechargement complet : rien de l'ancienne session ne reste en mémoire.
        window.location.assign(LOGIN_HREF);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={compact ? "Se déconnecter" : undefined}
      className={clsx(
        "flex items-center gap-3 rounded-field text-[15px] leading-tight text-nav",
        "transition-[background-color,color,scale,opacity] duration-fast ease-soft hover:bg-primary-soft/60 hover:text-ink active:scale-[0.97] disabled:opacity-60",
        compact ? "size-11 justify-center" : "px-4 py-3",
        className,
      )}
    >
      <LogoutIcon size={compact ? 18 : 20} className="shrink-0" />
      {compact ? null : <span>{pending ? "Déconnexion…" : "Se déconnecter"}</span>}
    </button>
  );
}
