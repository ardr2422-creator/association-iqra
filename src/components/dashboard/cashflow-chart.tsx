"use client";

import { useEffect, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatEurosCompact } from "@/lib/format";

export type CashflowPoint = {
  label: string;
  /** Mois complet pour l'infobulle : « novembre 2026 ». */
  monthName: string;
  income: number;
  expense: number;
};

const SERIES = {
  income: { name: "Entrées", color: "var(--income)" },
  expense: { name: "Sorties", color: "var(--accent)" },
} as const;

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as CashflowPoint | undefined;
  if (!active || !point) return null;

  return (
    <div className="rounded-field border border-line bg-surface px-3.5 py-3 text-[13px] shadow-float">
      <p className="mb-2 font-medium capitalize text-ink">{point.monthName}</p>
      <dl className="grid grid-cols-[auto_auto] items-center gap-x-5 gap-y-1">
        {(["income", "expense"] as const).map((key) => (
          <div key={key} className="contents">
            <dt className="flex items-center gap-2 text-muted">
              <span
                aria-hidden="true"
                className="h-[3px] w-3.5 rounded-full"
                style={{ backgroundColor: SERIES[key].color }}
              />
              {SERIES[key].name}
            </dt>
            <dd className="text-right font-semibold tabular-nums text-ink">
              {formatEurosCompact(point[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Courbes des entrées et des sorties par mois. Les couleurs viennent des
 * variables CSS du thème : le graphique suit le mode clair / sombre sans
 * se redessiner. Les courbes se tracent de gauche à droite à l'arrivée
 * (désactivé automatiquement si le système demande moins de mouvement).
 */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Recharts rend ses calques internes atteignables au clavier (sans nom ni
  // contour utile) : on ne garde que le graphique lui-même dans l'ordre de tabulation.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const removeLayerTabStops = () => {
      wrapper
        .querySelectorAll('g[class^="recharts-zIndex-layer"]:not([tabindex])')
        .forEach((layer) => layer.setAttribute("tabindex", "-1"));
    };
    removeLayerTabStops();
    const observer = new MutationObserver(removeLayerTabStops);
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="min-h-[220px] w-full flex-1">
      {/* Les mêmes chiffres en texte, pour les lecteurs d'écran. */}
      <table className="sr-only">
        <caption>Entrées et sorties par mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Entrées</th>
            <th scope="col">Sorties</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.monthName}>
              <th scope="row">{point.monthName}</th>
              <td>{formatEurosCompact(point.income)}</td>
              <td>{formatEurosCompact(point.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <LineChart
        responsive
        data={data}
        margin={{ top: 12, right: 14, bottom: 0, left: 14 }}
        style={{ width: "100%", height: "100%" }}
        accessibilityLayer
        role="img"
        aria-label="Courbes des entrées et des sorties par mois. Flèches gauche et droite pour parcourir les mois."
      >
        <CartesianGrid vertical={false} stroke="var(--divider)" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tickMargin={14}
          interval="preserveStartEnd"
          tick={{ fill: "var(--muted)", fontSize: 12 }}
        />
        <YAxis hide domain={[0, "auto"]} />
        <Tooltip
          content={ChartTooltip}
          cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
          animationDuration={160}
          animationEasing="ease-out"
        />
        {(["income", "expense"] as const).map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={SERIES[key].name}
            stroke={SERIES[key].color}
            strokeWidth={3}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)", fill: SERIES[key].color }}
            animationBegin={250 + index * 140}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </div>
  );
}
