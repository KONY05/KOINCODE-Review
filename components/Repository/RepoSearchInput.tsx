"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";

type RepoSearchInputProps = {
  onSearch: (query: string) => void;
};

export default function RepoSearchInput({ onSearch }: RepoSearchInputProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, onSearch]);

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-(--kc-border) bg-card px-4 py-3.5">
      <SearchIcon className="size-[17px] text-(--kc-text-dim)" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search repositories..."
        className="flex-1 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-(--kc-text-dim)"
      />
    </div>
  );
}
