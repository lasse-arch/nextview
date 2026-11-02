"use client";

import { useState } from "react";
import { NewTour } from "../../new-tour";
import type { TourCustomer } from "@/lib/actions/tour-ai";
import { Group, input } from "./ui";

/**
 * "Start forfra": the tour built anew through "Ny tour" (space, branch, layout,
 * nextviewAI's plan) for the same customer and under the same address. The
 * old one goes to the papirkurv - only when the new one is made, so nothing is
 * lost if it's stopped half-way - and can be restored for 30 days. Never a
 * tour out on the net; the name typed to be sure.
 */
export function RestartTour({ slug, name, published, deal }: { slug: string; name: string; published: boolean; deal: { id: string; name: string } | null }) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const customer: TourCustomer | undefined = deal ? { id: deal.id, name: deal.name, address: null, website: null, stage: "", contractSignedAt: null, tours: 1, hasModel: true } : undefined;
  return (
    <Group title="Byg touren forfra">
      <p className="text-[12px] leading-snug text-[#8e8e93]">
        Byg touren helt forfra med Ny tour - for samme kunde og på samme adresse. Den gamle flyttes til papirkurven, først når den nye er bygget, og kan gendannes i 30 dage. Kundens links (gennemgang, rapport) virker videre og viser den nye.
      </p>
      {published ? (
        <p className="text-[13px] text-[#6e6e73]">Touren er udgivet. Tag den af nettet under Del og udgiv først - en kundes hjemmeside kan vise den.</p>
      ) : (
        <>
          <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Skriv "${name}" for at bygge forfra`} />
          <button type="button" disabled={!ok} className="w-full rounded-xl bg-[#ff9500] py-2 text-[14px] font-medium text-white disabled:opacity-30" onClick={() => setOpen(true)}>
            Byg touren forfra
          </button>
        </>
      )}
      {open && <NewTour tours={[]} forDeal={customer} replaces={{ slug, name }} onClose={() => setOpen(false)} />}
    </Group>
  );
}
