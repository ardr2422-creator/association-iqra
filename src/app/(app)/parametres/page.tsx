import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsBoard } from "@/components/settings/settings-board";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Paramètres" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <PageHeader
        title="Paramètres"
        description="Les informations de l'association, le solde de départ et les rappels de chèques."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const settings = await getSettings();
  return <SettingsBoard settings={settings} />;
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <span role="status" className="sr-only">
        Chargement des paramètres…
      </span>
      <Skeleton className="h-[620px] rounded-card" />
      <Skeleton className="h-[190px] rounded-card" />
      <Skeleton className="h-[230px] rounded-card" />
    </div>
  );
}
