"use client";

import { useState } from "react";
import { titleCase } from "@/lib/text";

export function DisplayNameInput({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <input
      name="displayName"
      value={value}
      onChange={(e) => setValue(titleCase(e.target.value))}
      placeholder="Udfyld hvis kunden kaldes noget andet end CVR-navnet"
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
    />
  );
}
