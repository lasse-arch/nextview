"use client";

import { useState } from "react";

const POCKET_PREFIX = "Pocket-mødereferat: ";

/**
 * A Pocket-expanded AI-mødenote can run to several thousand characters
 * (summary + to-dos + full transcript) - dumping all of that inline in the
 * notes feed drowns out every other note on the deal. Shown instead as one
 * compact line with a button that opens the full text in a modal, so the
 * whole report is still one click away without having to go through
 * creating/opening a task first.
 */
export function NoteBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);

  if (!body.startsWith(POCKET_PREFIX)) {
    return <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{body}</p>;
  }

  const title = body.slice(POCKET_PREFIX.length).split("\n")[0].trim();

  return (
    <>
      <div className="mt-1 flex items-center justify-between gap-3 rounded-md bg-indigo-50/60 px-3 py-2">
        <span className="truncate text-sm text-slate-700">
          <span className="font-medium">Pocket-mødereferat</span>
          {title && title !== "Pocket" && <span className="text-slate-500"> · {title}</span>}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Åbn hele referatet
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Pocket-mødereferat</h2>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{body}</p>
          </div>
        </div>
      )}
    </>
  );
}
