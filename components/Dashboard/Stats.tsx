import { LucideProps } from "lucide-react";
import { ForwardRefExoticComponent, RefAttributes } from "react";

type StatsType = {
  label: string;
  value: string;
  sub: string;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  accent: boolean;
};

export default function Stats({ stats }: { stats: StatsType[] }) {
  return (
    <div className="mt-8 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="min-w-[200px] shrink-0 rounded-2xl border border-(--kc-border-subtle) bg-card p-5 sm:min-w-0 sm:shrink"
        >
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-medium text-(--kc-text-muted)">
              {s.label}
            </span>
            <s.icon
              className={`size-[17px] text-(--kc-text-dim) ${s.accent ? "text-kc-amber" : ""}`}
            />
          </div>
          <div
            className={`mt-5 font-mono text-[30px] font-bold ${
              s.accent ? "text-kc-amber" : ""
            }`}
          >
            {s.value}
          </div>
          <div className="mt-1 text-[12px] text-(--kc-text-dim)">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
