"use client";

import { useRef, useState, useTransition } from "react";
import { addDealItem, removeDealItem, updateDealItemUrl, updateDealItemImageAction } from "@/lib/actions/deal-items";
import { formatDKK, needsDeliveryLink as needsLink, needsImage } from "@/lib/labels";
import { useToast } from "@/components/toast";

type DealItem = {
  id: string;
  location: string | null;
  productType: string;
  amount: number | null;
  isFree: boolean;
  url: string | null;
  imageUrl: string | null;
};

// Shown full-screen on /kunder-live when presenting to customers, so this
// needs to hold up a lot better than a small thumbnail would.
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.85;

/** Downscales/recompresses a photo client-side before it's stored as a data URI - a
 * phone camera shot can be 5-10MB, far more than needed for a hover preview. */
function readImageFileAsCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Kunne ikke behandle billedet."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Kunne ikke læse billedet."));
    };
    img.src = objectUrl;
  });
}

const PRODUCT_SUGGESTIONS = ["Visitkort", "Drone-optagelse", "Nextview360 Tour", "Hjemmeside"];

function RemoveItemButton({ dealId, itemId }: { dealId: string; itemId: string }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await removeDealItem(dealId, itemId);
            showToast("Fjernet");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
          }
        })
      }
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "…" : "Fjern"}
    </button>
  );
}

function ItemLink({ dealId, item }: { dealId: string; item: DealItem }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.url ?? "");
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  if (!needsLink(item.productType) && !item.url) return null;

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              await updateDealItemUrl(dealId, item.id, value);
              showToast("Link gemt");
              setEditing(false);
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
            }
          });
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
          autoFocus
          className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button type="submit" disabled={pending} className="text-xs font-medium text-slate-600 hover:text-slate-900">
          Gem
        </button>
      </form>
    );
  }

  return item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-medium text-blue-600 hover:underline"
    >
      Åbn link
    </a>
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-amber-600 hover:underline">
      + Tilføj link
    </button>
  );
}

function ItemImage({ dealId, item }: { dealId: string; item: DealItem }) {
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();

  if (!needsImage(item.productType)) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      try {
        const dataUrl = await readImageFileAsCompressedDataUrl(file);
        const result = await updateDealItemImageAction(dealId, item.id, dataUrl);
        if (!result.ok) {
          showToast(result.error);
          return;
        }
        showToast("Billede gemt");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-8 w-12 rounded border border-slate-200 object-cover" />
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <button
        type="button"
        disabled={pending}
        onClick={() => fileInputRef.current?.click()}
        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Uploader…" : item.imageUrl ? "Skift billede" : "+ Upload billede"}
      </button>
    </div>
  );
}

export function DealItemsSection({ dealId, items }: { dealId: string; items: DealItem[] }) {
  const [adding, setAdding] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [productType, setProductType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  const total = items.filter((i) => !i.isFree).reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const freeCount = items.filter((i) => i.isFree).length;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await addDealItem(dealId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        form.reset();
        setIsFree(false);
        setProductType("");
        setAdding(false);
        showToast("Tilføjelse gemt");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Der opstod en fejl.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Ydelser</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {adding ? "Annullér" : "+ Tilføj"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Hvilke ydelser denne deal har — fyldes automatisk ud fra kontrakten, når den underskrives (inkl. hvad
        der er givet gratis). Tilføj selv hvis noget mangler.
      </p>

      {adding && (
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sted (valgfri)</label>
            <input
              name="location"
              placeholder="F.eks. Hovedkontor"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ydelse/produkt *</label>
            <input
              name="productType"
              list="product-suggestions"
              required
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="F.eks. Drone"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <datalist id="product-suggestions">
              {PRODUCT_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Beløb (DKK)</label>
            <input
              name="amount"
              type="number"
              min="0"
              step="1"
              disabled={isFree}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              name="isFree"
              id="item-is-free"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
            />
            <label htmlFor="item-is-free" className="text-xs font-medium text-slate-600">
              Givet gratis
            </label>
          </div>
          {needsLink(productType) && (
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Link til {productType.trim()} (så vi kan finde den igen og vise kunden)
              </label>
              <input
                name="url"
                type="url"
                placeholder="https://…"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}
          {error && <p className="col-span-2 text-xs text-red-600 sm:col-span-4">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="col-span-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:col-span-4"
          >
            {pending ? "Gemmer…" : "Tilføj"}
          </button>
        </form>
      )}

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium text-slate-800">{item.productType}</span>
              {item.location && <span className="ml-2 text-xs text-slate-400">{item.location}</span>}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-right">
                <ItemLink dealId={dealId} item={item} />
              </div>
              <ItemImage dealId={dealId} item={item} />
              <div className="w-16 shrink-0 text-right">
                {item.isFree ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Gratis
                  </span>
                ) : (
                  <span className="money text-slate-600">{formatDKK(item.amount)}</span>
                )}
              </div>
              <RemoveItemButton dealId={dealId} itemId={item.id} />
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Ingen tilføjelser endnu.</p>}
      </ul>

      {items.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          I alt: <span className="money">{formatDKK(total)}</span>
          {freeCount > 0 ? ` · ${freeCount} givet gratis` : ""}
        </p>
      )}
    </section>
  );
}
