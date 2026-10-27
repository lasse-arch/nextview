"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { text: string; lat: number | null; lon: number | null };

/**
 * Address field with live suggestions from Denmark's official (free, key-less)
 * address service - the same one used to geocode the customer map, so picking
 * a suggestion here also submits its coordinates and skips a later geocode.
 */
export function AddressAutocomplete({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(newValue: string) {
    setValue(newValue);
    setCoords(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newValue.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(newValue)}`);
        const data = (await res.json()) as Suggestion[];
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  function selectSuggestion(s: Suggestion) {
    setValue(s.text);
    if (s.lat != null && s.lon != null) setCoords({ lat: s.lat, lon: s.lon });
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        name="address"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {coords && <input type="hidden" name="addressLat" value={coords.lat} />}
      {coords && <input type="hidden" name="addressLon" value={coords.lon} />}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {suggestions.map((s) => (
            <li key={s.text}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
