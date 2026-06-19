"use client";

type Tab = "all" | "connected";

type RepoTabsProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export default function RepoTabs({ activeTab, onTabChange }: RepoTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-(--kc-border) bg-card p-1">
      <button
        onClick={() => onTabChange("all")}
        className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
          activeTab === "all"
            ? "bg-[rgba(245,166,35,0.1)] text-kc-amber"
            : "text-(--kc-text-muted) hover:text-foreground"
        }`}
      >
        All
      </button>
      <button
        onClick={() => onTabChange("connected")}
        className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
          activeTab === "connected"
            ? "bg-[rgba(245,166,35,0.1)] text-kc-amber"
            : "text-(--kc-text-muted) hover:text-foreground"
        }`}
      >
        Connected
      </button>
    </div>
  );
}
