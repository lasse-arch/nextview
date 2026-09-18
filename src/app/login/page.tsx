import Image from "next/image";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <Image src="/logo.png" alt="Nextview360" width={942} height={219} className="h-8 w-auto" priority />
        <p className="mt-3 text-sm text-slate-500">Log ind for at fortsætte</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </div>
  );
}
