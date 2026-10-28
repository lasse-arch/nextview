"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTour } from "@/lib/actions/tours";
import { Group, input } from "./ui";

/** "Slet tour": to the papirkurv (restorable for 30 days) - the tour's name typed to be sure, and only once it's off the net. */
export function DeleteTour({ slug, name, published }: { slug: string; name: string; published: boolean }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Group title="Slet touren">
      <p className="text-[12px] leading-snug text-[#8e8e93]">
        Touren flyttes til papirkurven nederst på Tours-siden og kan gendannes i 30 dage - med alle versioner. Statistikken bliver liggende.
      </p>
      {published ? (
        <p className="text-[13px] text-[#6e6e73]">Touren er udgivet. Tag den af nettet under Del og udgiv først - så forsvinder den ikke fra en kundes hjemmeside uden varsel.</p>
      ) : (
        <>
          <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Skriv "${name}" for at slette`} />
          <button
            type="button"
            disabled={pending || typed.trim().toLowerCase() !== name.trim().toLowerCase()}
            className="w-full rounded-xl bg-[#ff3b30] py-2 text-[14px] font-medium text-white disabled:opacity-30"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await deleteTour(slug, typed);
                if (!r.ok) return setError(r.error);
                router.push("/arpo/tour-lab");
              })
            }
          >
            {pending ? "Sletter…" : "Slet touren"}
          </button>
        </>
      )}
      {error && <p className="text-[12px] text-[#ff3b30]">{error}</p>}
    </Group>
  );
}
