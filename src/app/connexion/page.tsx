import type { Metadata } from "next";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-10">
      <main className="w-full max-w-[420px] animate-rise rounded-card border border-line bg-surface p-7 desk:p-9">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.5px] text-accent">
          Iqra
          <span className="ml-2 text-base font-normal tracking-normal text-faint">compta</span>
        </p>
        <h1 className="mt-7 text-[22px] font-semibold leading-tight tracking-[-0.3px]">
          Connexion
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Espace réservé à la trésorerie de l&apos;association.
        </p>
        <LoginForm />
      </main>
      <ThemeToggle className="animate-fade stagger-3" />
    </div>
  );
}
