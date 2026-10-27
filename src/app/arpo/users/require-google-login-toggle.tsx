"use client";

import { useTransition } from "react";
import { setRequireGoogleLogin } from "@/lib/actions/integrations";
import { useToast } from "@/components/toast";

export function RequireGoogleLoginToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const on = e.target.checked;
          if (on && !confirm("Slå adgangskoder fra? Alle skal derefter logge ind med Google, og dem der er logget ind med adgangskode bliver logget ud.")) return;
          startTransition(async () => {
            const result = await setRequireGoogleLogin(on);
            showToast(result.ok ? (on ? "Google-login er nu påkrævet" : "Adgangskoder virker igen") : result.error);
          });
        }}
      />
      <span className={enabled ? "font-medium text-emerald-700" : "text-slate-600"}>
        {pending ? "Gemmer…" : "Kræv Google-login (slå adgangskoder fra)"}
      </span>
    </label>
  );
}
