"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNewsPost } from "@/lib/actions/news";
import { useToast } from "@/components/toast";

// Same idea as the profile avatar uploader, just not cropped to a square and
// capped wider - a feature screenshot needs to stay readable, an avatar doesn't.
const MAX_WIDTH = 1000;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunne ikke læse billedet."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Kunne ikke læse billedet."));
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Kunne ikke behandle billedet."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function NewsPostForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const showToast = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setScreenshot(await resizeToDataUrl(file));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunne ikke behandle billedet.");
    }
  }

  function submit() {
    startTransition(async () => {
      const result = await createNewsPost({ title, body, screenshotUrl: screenshot });
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setTitle("");
      setBody("");
      setScreenshot(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Nyhed udgivet");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Skriv en nyhed</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder='Titel, fx "Ny funktion: Ringeliste"'
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Hvad er nyt, og hvordan bruger man det?"
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="text-xs" />
        {screenshot && (
          <button type="button" onClick={() => setScreenshot(null)} className="text-xs text-slate-400 hover:text-slate-600">
            Fjern billede
          </button>
        )}
      </div>
      {screenshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={screenshot} alt="" className="mt-2 max-h-48 rounded-lg border border-slate-200" />
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Udgiver…" : "Udgiv nyhed"}
      </button>
    </section>
  );
}
