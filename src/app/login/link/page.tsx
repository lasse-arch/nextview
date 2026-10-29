import type { Metadata } from "next";
import { loginWithLinkAction } from "@/lib/actions/customer-login";

export const metadata: Metadata = { title: "Log ind - Nextview360" };

/*
 * Where the link in the login e-mail lands. Logging in takes a press on the
 * button (a POST), not just opening the page: mail programs and virus
 * scanners open links in e-mails by themselves, and would otherwise use up
 * the one-time link before the customer gets to it.
 */
export default async function LoginLinkPage({ searchParams }: { searchParams: Promise<{ t?: string; til?: string }> }) {
  const { t, til } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
      <form action={loginWithLinkAction} className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/[.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Nextview360" className="mx-auto h-8 w-auto" />
        <p className="mt-6 text-[17px] font-semibold text-[#1d1d1f]">Velkommen</p>
        <p className="mt-1 text-sm text-[#6e6e73]">Tryk for at logge ind på jeres side.</p>
        <input type="hidden" name="t" value={t ?? ""} />
        <input type="hidden" name="til" value={til ?? ""} />
        <button type="submit" className="mt-6 w-full rounded-xl bg-[#0071e3] px-3 py-2.5 text-[15px] font-semibold text-white hover:bg-[#0077ed]">
          Log ind
        </button>
      </form>
    </div>
  );
}
