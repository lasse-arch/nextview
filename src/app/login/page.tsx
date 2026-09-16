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
        <h1 className="text-xl font-semibold text-slate-900">Nextview360</h1>
        <p className="mt-1 text-sm text-slate-500">Log ind for at fortsætte</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </div>
  );
}
