"use client";

import { useTransition } from "react";
import { toggleIntegration } from "@/lib/actions/integrations";
import type { IntegrationKey } from "@/lib/integration-settings";

export function IntegrationToggle({
  integrationKey,
  enabled,
  disabled,
}: {
  integrationKey: IntegrationKey;
  enabled: boolean;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending || disabled}
        onChange={(e) => startTransition(() => toggleIntegration(integrationKey, e.target.checked))}
      />
      <span className={enabled ? "text-emerald-700" : "text-slate-500"}>
        {pending ? "Gemmer…" : enabled ? "Slået til" : "Slået fra"}
      </span>
    </label>
  );
}
