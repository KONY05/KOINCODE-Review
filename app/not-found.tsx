import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-(--kc-bg)">
      <Logo />

      <p className="font-mono text-[80px] font-bold tracking-tight text-kc-amber mt-10 leading-none">
        404
      </p>
      <h1 className="text-xl font-semibold mt-4">Page not found</h1>
      <p className="text-(--kc-text-secondary) text-sm mt-2 text-center max-w-[380px]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <Link
        href="/"
        className="mt-8 inline-flex h-10 items-center rounded-md bg-(--kc-cream) px-6 text-sm font-medium text-(--kc-cream-text) hover:bg-(--kc-cream-hover) transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
