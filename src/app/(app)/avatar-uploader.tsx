"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOwnAvatar, removeOwnAvatar } from "@/lib/actions/profile";
import { useToast } from "@/components/toast";

const AVATAR_SIZE = 160;

function resizeToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunne ikke læse billedet."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Kunne ikke læse billedet."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Kunne ikke behandle billedet."));

        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarUploader({
  currentAvatarUrl,
  targetUserId,
  size = 80,
}: {
  currentAvatarUrl: string | null;
  /** Whose avatar this edits - omit to edit your own. Only an admin may pass someone else's id. */
  targetUserId?: string;
  size?: number;
}) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const showToast = useToast();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeToSquareDataUrl(file);
      setPreview(dataUrl);
      startTransition(async () => {
        try {
          await updateOwnAvatar(dataUrl, targetUserId);
          showToast("Profilbillede opdateret");
          router.refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Kunne ikke gemme billedet.");
        }
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunne ikke behandle billedet.");
    }
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeOwnAvatar(targetUserId);
        setPreview(null);
        showToast("Profilbillede fjernet");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke fjerne billedet.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Profilbillede"
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full bg-slate-200 text-slate-400"
          style={{ width: size, height: size, fontSize: size / 3 }}
        >
          ?
        </div>
      )}
      <div className="space-y-1">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {preview ? "Skift billede" : "Upload billede"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Fjern
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
