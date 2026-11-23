"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { endDemo, loadDemoData } from "@/app/(app)/parametres/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FIELD_CLASSES } from "@/components/ui/field";
import { Field, FormAlert, Spinner } from "@/components/ui/form";

const CONFIRMATION = "EFFACER";

/**
 * Données de démonstration : à charger dans une base vide pour découvrir
 * l'application, puis à effacer (mot de confirmation exigé) pour commencer la
 * vraie comptabilité.
 */
export function DemoSection({ demoMode, empty }: { demoMode: boolean; empty: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justLoaded, setJustLoaded] = useState(false);
  const [justCleared, setJustCleared] = useState(false);
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  const load = () => {
    if (pending) return;
    setError(null);
    setJustCleared(false);
    startTransition(async () => {
      const result = await loadDemoData();
      if (result.ok) setJustLoaded(true);
      else setError(result.message);
    });
  };

  return (
    <Card
      as="section"
      id="demonstration"
      aria-labelledby="titre-demonstration"
      className="animate-rise scroll-mt-6 stagger-4 target:border-amber-line"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle id="titre-demonstration">Démonstration</CardTitle>
        {demoMode ? <Badge tone="amber">En cours</Badge> : null}
      </div>

      {demoMode ? (
        <>
          <p className="mt-1 text-[15px] text-muted">
            L&apos;application contient des données fictives. Quand vous êtes prête à commencer la vraie
            comptabilité, terminez la démonstration :{" "}
            <strong className="font-medium text-ink">
              tous les adhérents, mouvements, chèques et reçus seront effacés
            </strong>
            , y compris ceux que vous auriez saisis pendant l&apos;essai. Les catégories et les
            informations de l&apos;association sont conservées, et la numérotation des reçus repart à
            0001.
          </p>
          <div role="status" className="empty:hidden">
            {justLoaded ? (
              <p className="mt-3 animate-fade rounded-field bg-income-soft px-4 py-3 text-[15px] text-income-strong">
                Les données de démonstration sont chargées.{" "}
                <Link href="/" className="font-medium text-income-strong underline underline-offset-2 hover:text-income-strong">
                  Voir le tableau de bord
                </Link>
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setInstance((value) => value + 1);
                setOpen(true);
              }}
            >
              Terminer la démonstration…
            </Button>
          </div>
        </>
      ) : empty ? (
        <>
          <p className="mt-1 text-[15px] text-muted">
            Pour découvrir l&apos;application, vous pouvez la remplir avec des données fictives : 11
            familles, des encaissements, des chèques à venir ou en retard, des dépenses et leurs
            reçus. Vous pourrez tout effacer ensuite.
          </p>
          <div role="status" className="empty:hidden">
            {justCleared ? (
              <p className="mt-3 animate-fade rounded-field bg-income-soft px-4 py-3 text-[15px] text-income-strong">
                La démonstration est terminée : l&apos;application est vide, prête pour vos vraies données.
              </p>
            ) : null}
          </div>
          <div className="mt-3">
            <FormAlert message={error} />
          </div>
          <div className="mt-4">
            <Button onClick={load} aria-disabled={pending}>
              {pending ? <Spinner /> : null}
              {pending ? "Chargement en cours…" : "Charger les données de démonstration"}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-[15px] text-muted">
          Les données de démonstration ne peuvent être chargées que dans une application vide. Des
          adhérents ou des mouvements existent déjà : rien ne sera modifié.
        </p>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Terminer la démonstration">
        <EndDemoForm
          key={instance}
          onCancel={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setJustLoaded(false);
            setJustCleared(true);
          }}
        />
      </Dialog>
    </Card>
  );
}

function EndDemoForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ready = word.trim().toLocaleUpperCase("fr") === CONFIRMATION;

  const submit = () => {
    if (pending || !ready) return;
    setError(null);
    startTransition(async () => {
      const result = await endDemo(word);
      if (result.ok) onDone();
      else setError(result.message);
    });
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-4 flex flex-col gap-5"
    >
      <p className="text-[15px] text-muted">
        Tous les adhérents, mouvements, chèques et reçus vont être{" "}
        <strong className="font-medium text-ink">effacés définitivement</strong>. Les catégories et
        les informations de l&apos;association sont conservées.
      </p>
      <Field label={`Pour confirmer, saisissez ${CONFIRMATION}`}>
        {(control) => (
          <input
            {...control}
            name="confirmation"
            type="text"
            data-autofocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={word}
            onChange={(event) => setWord(event.target.value)}
            className={FIELD_CLASSES}
          />
        )}
      </Field>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" aria-disabled={pending || !ready}>
          {pending ? <Spinner /> : null}
          Tout effacer
        </Button>
      </div>
    </form>
  );
}
