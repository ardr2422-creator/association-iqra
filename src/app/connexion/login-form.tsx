"use client";

import { Suspense, useActionState, useEffect, useId, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AlertIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { login, type LoginState } from "./actions";

const FIELD =
  "w-full rounded-field border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-fast ease-soft " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-primary-soft";

/** Page à rouvrir après connexion. `useSearchParams` impose le <Suspense>. */
function NextField() {
  return <input type="hidden" name="next" value={useSearchParams().get("next") ?? "/"} />;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  // Petit « non » de la tête quand la connexion est refusée.
  useEffect(() => {
    if (!state?.error) return;
    const form = formRef.current;
    if (!form || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    form.animate(
      [
        { translate: "0" },
        { translate: "-7px" },
        { translate: "6px" },
        { translate: "-4px" },
        { translate: "2px" },
        { translate: "0" },
      ],
      { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [state]);

  // La page reste montée en arrière-plan après connexion : on efface le mot de passe.
  useEffect(() => {
    const form = formRef.current;
    return () => form?.reset();
  }, []);

  return (
    <form
      ref={formRef}
      action={formAction}
      // Le bouton reste focalisable pendant l'envoi (aria-disabled) : on bloque
      // simplement un second envoi.
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="mt-6 flex flex-col gap-4"
    >
      <Suspense fallback={null}>
        <NextField />
      </Suspense>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm text-nav">
          Adresse email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state?.email}
          aria-describedby={state?.error ? errorId : undefined}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm text-nav">
          Mot de passe
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? errorId : undefined}
          className={FIELD}
        />
      </div>

      <div role="alert" id={errorId}>
        {state?.error ? (
          <p
            // Une nouvelle clé à chaque refus : le message est relu et réapparaît.
            key={state.attempt}
            className="flex animate-fade items-start gap-2.5 rounded-field bg-late-soft px-3.5 py-3 text-sm text-accent"
          >
            <AlertIcon size={18} className="mt-px shrink-0" />
            {state.error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        aria-disabled={pending}
        className={buttonClasses("primary", "lg", "mt-1 w-full")}
      >
        {pending ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin-slow rounded-full border-2 border-on-primary/40 border-t-on-primary"
            />
            Connexion…
          </>
        ) : (
          "Se connecter"
        )}
      </button>
    </form>
  );
}
