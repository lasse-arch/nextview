import type { Metadata } from "next";
import { openInvite } from "@/lib/customer-invite";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Bliv tilføjet - Nextview360", robots: { index: false, follow: false } };

/*
 * An invitation link's page (public - under /login): the customer's people
 * write their name and e-mail, and a login link goes to that e-mail. Only the
 * company's name is shown, and only while the link works.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await openInvite(token);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Nextview360" className="mx-auto h-8 w-auto" />
        {link ? (
          <>
            <p className="mt-6 text-center text-[17px] font-semibold text-[#1d1d1f]">Bliv tilføjet til {link.company}s side</p>
            <p className="mt-1 text-center text-sm text-[#6e6e73]">Skriv dit navn og din e-mail. Så sender vi dig et link, du logger ind med.</p>
            <InviteForm token={token} />
          </>
        ) : (
          <>
            <p className="mt-6 text-center text-[17px] font-semibold text-[#1d1d1f]">Linket virker ikke længere</p>
            <p className="mt-1 text-center text-sm text-[#6e6e73]">Det er udløbet, brugt op eller stoppet. Bed den, der sendte det, om et nyt - eller log ind, hvis du allerede har adgang.</p>
            <a href="/login" className="mt-6 block w-full rounded-xl bg-[#0071e3] px-3 py-2.5 text-center text-[15px] font-semibold text-white hover:bg-[#0077ed]">
              Til login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
