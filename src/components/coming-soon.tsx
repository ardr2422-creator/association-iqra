import type { ComponentType, CSSProperties, SVGProps } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type ComingSoonProps = {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Une phrase sur ce que la page permettra de faire. */
  description: string;
  /** Ce que la page contiendra, point par point. */
  features: string[];
};

/** Page provisoire : la section existe dans le menu, son contenu arrive à une étape suivante. */
export function ComingSoon({ title, icon: Icon, description, features }: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <Card className="flex max-w-[720px] animate-rise flex-col gap-5 stagger-1">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-card bg-primary-soft text-accent"
          >
            <Icon size={26} />
          </span>
          <div className="flex flex-col items-start gap-2">
            <Badge tone="amber">Prochaine étape</Badge>
            <p className="text-[17px] font-medium leading-snug">{description}</p>
          </div>
        </div>
        <ul className="flex flex-col">
          {features.map((feature, index) => (
            <li
              key={feature}
              style={{ "--i": index, "--stagger-base": "220ms" } as CSSProperties}
              className="flex animate-rise items-start gap-3 border-t border-divider py-3.5 text-muted stagger-i"
            >
              <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />
              {feature}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
