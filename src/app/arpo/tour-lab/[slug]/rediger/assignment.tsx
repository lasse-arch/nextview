"use client";

import { useState, useTransition } from "react";
import { assignTour } from "@/lib/actions/tours";
import { Field, Group, input } from "./ui";

export type Assignment = {
  /** Admins give the tour to a developer; a developer sees who has it and the deadline. */
  canAssign: boolean;
  developers: { id: string; name: string }[];
  assignedToId: string | null;
  assignedToName: string | null;
  deadline: string | null;
};

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });

/** "Udvikler og deadline" in Generelt: who builds the tour and by when. */
export function AssignmentGroup({ slug, a }: { slug: string; a: Assignment }) {
  const [who, setWho] = useState(a.assignedToId ?? "");
  const [deadline, setDeadline] = useState(a.deadline ?? "");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (!a.canAssign)
    return a.deadline ? (
      <Group title="Deadline">
        <p className="px-1 text-[14px] text-[#1d1d1f]">Touren skal være færdig {day(a.deadline)}.</p>
      </Group>
    ) : null;
  const changed = who !== (a.assignedToId ?? "") || deadline !== (a.deadline ?? "");
  return (
    <Group title="Udvikler og deadline">
      <Field title="Udvikler" hint="En udvikler ser kun de tours, der er givet til dem.">
        <select className={`${input} bg-white`} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Ingen - kun admin</option>
          {a.developers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field title="Deadline">
        <input type="date" className={`${input} bg-white`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <button
        type="button"
        disabled={!changed || pending}
        className="self-start rounded-full bg-[#0071e3] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        onClick={() =>
          start(async () => {
            const r = await assignTour(slug, who || null, deadline || null).catch(() => ({ ok: false as const, error: "Kunne ikke gemme - prøv igen." }));
            setNote(r.ok ? { text: "Gemt.", error: false } : { text: r.error, error: true });
          })
        }
      >
        {pending ? "Gemmer…" : "Gem"}
      </button>
      {note && <p className={`px-1 text-[12px] ${note.error ? "text-[#ff3b30]" : "text-[#34c759]"}`}>{note.text}</p>}
    </Group>
  );
}
