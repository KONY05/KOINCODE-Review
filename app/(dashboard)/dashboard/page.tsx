import { SignOutButton } from "@clerk/nextjs";

export default function DashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <SignOutButton redirectUrl="/">
        <button className="px-4 py-2 rounded-lg bg-(--kc-cream) text-(--kc-cream-text) font-semibold cursor-pointer">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
