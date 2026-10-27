"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { detachToursFromMpskins } from "@/lib/actions/tours";

/** The tours still on MPSkins - moved onto Matterport alone in one go (each gets a new version, so it can be undone). */
export function DetachAll({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#ff9500]/10 px-4 py-3">
      <p className="flex-1 text-[14px] text-[#a05a00]">
        {count === 1 ? "1 tour bruger" : `${count} tours bruger`} stadig MPSkins til scanpunkter. Flyt dem over til kun at bruge Matterport - links, skjulte punkter og farvefilter kommer med.
      </p>
      <button
        type="button"
        disabled={pending}
        className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await detachToursFromMpskins();
            if (!r.ok) return setMsg(r.error);
            setMsg(`${r.moved} flyttet.${r.failed.length ? ` Kunne ikke: ${r.failed.join("; ")}` : ""}`);
            router.refresh();
          })
        }
      >
        {pending ? "Flytter…" : "Flyt til Matterport"}
      </button>
      {msg && <p className="w-full text-[13px] text-[#6e6e73]">{msg}</p>}
    </div>
  );
}
