import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="font-mono font-bold text-[21px] tracking-[0.06em]">
      KOIN
      <span className="text-kc-amber">CODE</span>{" "}
      <span className="text-(--kc-text-faint) font-medium text-sm">
        Review
      </span>
    </Link>
  );
}