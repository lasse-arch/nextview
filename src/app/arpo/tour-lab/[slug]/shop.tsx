"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "../tours/api";
import { useT } from "../tours/i18n-react";

/*
 * "Vælg datoer" on a point's card (TourPoint.shop): the customer's webshop
 * product as a small booking sheet - the days that can be booked (the shop's
 * own calendar, through /api/tour-shop), how many guests, the shop's own price
 * for the stay, and Book, which opens the product in the shop (the guest books
 * and pays there - nothing is put in a basket from here).
 */

type Product = { name: string; dates: string[]; basePrice: number | null; guests: { id: string; label: string; price: number | null; max: number }[] };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const money = (n: number) => `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n)} kr.`;

export function ShopSheet({ slug, point, title, url, onBook, onClose }: { slug: string; point: string; title: string; url: string; onBook: (label: string, href: string) => void; onClose: () => void }) {
  const tr = useT();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [guests, setGuests] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<{ ok: boolean; price: number | null } | "busy" | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    let dead = false;
    fetch(apiUrl(`/api/tour-shop/${encodeURIComponent(slug)}?${new URLSearchParams({ punkt: point })}`))
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as Product & { error?: string };
        if (dead) return;
        if (!r.ok || !data.dates) return setError(data.error ?? tr("Bookingen svarer ikke lige nu - prøv igen om lidt."));
        setProduct(data);
        // The first guest kind (adults) starts at 2 - the usual stay.
        if (data.guests[0]) setGuests({ [data.guests[0].id]: Math.min(2, data.guests[0].max) });
        const first = data.dates[0];
        if (first) setMonth({ y: Number(first.slice(0, 4)), m: Number(first.slice(5, 7)) - 1 });
      })
      .catch(() => !dead && setError(tr("Bookingen svarer ikke lige nu - prøv igen om lidt.")));
    return () => {
      dead = true;
    };
  }, [slug, point, tr]);

  const free = useMemo(() => new Set(product?.dates ?? []), [product]);

  // The shop's price for the stay, once both days and the guests are set.
  useEffect(() => {
    if (!from || !to || !product) return;
    const n = ++asked.current;
    const t = window.setTimeout(() => {
      setQuote("busy");
      fetch(apiUrl(`/api/tour-shop/${encodeURIComponent(slug)}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ punkt: point, fra: from, til: to, gaester: guests }) })
        .then((r) => r.json())
        .then((d: { ok?: boolean; price?: number | null; error?: string }) => n === asked.current && setQuote(d.error ? null : { ok: Boolean(d.ok), price: d.price ?? null }))
        .catch(() => n === asked.current && setQuote(null));
    }, 250);
    return () => window.clearTimeout(t);
  }, [from, to, guests, product, slug, point]);

  function pick(day: string) {
    if (!free.has(day)) return;
    if (!from || to || day <= from) {
      setFrom(day);
      setTo(null);
      setQuote(null);
      return;
    }
    setTo(day);
  }

  const cells = useMemo(() => {
    if (!month) return [];
    const first = new Date(Date.UTC(month.y, month.m, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(month.y, month.m, i + 1))] as (string | null)[];
  }, [month]);
  const monthName = month ? new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const shift = (d: number) => setMonth((x) => (x ? { y: x.y + Math.floor((x.m + d) / 12), m: (((x.m + d) % 12) + 12) % 12 } : x));
  const lastDay = product?.dates[product.dates.length - 1];
  const canBack = Boolean(month && product && iso(month.y, month.m, 1) > `${product.dates[0].slice(0, 7)}-01`);
  const nextMonth = month ? (month.m === 11 ? iso(month.y + 1, 0, 1) : iso(month.y, month.m + 1, 1)) : null;
  const canOn = Boolean(nextMonth && lastDay && nextMonth <= lastDay);
  const nights = from && to ? nightsBetween(from, to) : 0;

  return (
    <div className="sh" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sh-head">
          <div>
            <b>{title}</b>
            {product?.basePrice != null && <small>{tr("Fra {pris} pr. nat", { pris: money(product.basePrice) })}</small>}
          </div>
          <button type="button" aria-label={tr("Luk")} onClick={onClose}>
            ×
          </button>
        </div>
        {error && <p className="sh-note">{error}</p>}
        {!product && !error && <p className="sh-note">{tr("Henter ledige datoer …")}</p>}
        {product && month && (
          <>
            <div className="sh-month">
              <button type="button" aria-label={tr("Forrige")} disabled={!canBack} onClick={() => shift(-1)}>
                ‹
              </button>
              <b>{monthName}</b>
              <button type="button" aria-label={tr("Næste")} disabled={!canOn} onClick={() => shift(1)}>
                ›
              </button>
            </div>
            <div className="sh-days">
              {["ma", "ti", "on", "to", "fr", "lø", "sø"].map((d) => (
                <i key={d}>{d}</i>
              ))}
              {cells.map((d, i) =>
                d ? (
                  <button
                    key={d}
                    type="button"
                    disabled={!free.has(d)}
                    className={`${d === from || d === to ? "valgt" : ""} ${from && to && d > from && d < to ? "imellem" : ""}`}
                    onClick={() => pick(d)}
                  >
                    {Number(d.slice(8))}
                  </button>
                ) : (
                  <span key={`t${i}`} />
                )
              )}
            </div>
            <p className="sh-hint">{!from ? tr("Vælg ankomst") : !to ? tr("Vælg afrejse") : `${tr("{n} nætter", { n: String(nights) })}`}</p>
            {product.guests.length > 0 && (
              <div className="sh-guests">
                {product.guests.map((g) => (
                  <div key={g.id}>
                    <span>{g.label}</span>
                    <span className="sh-step">
                      <button type="button" aria-label="-" disabled={!guests[g.id]} onClick={() => setGuests((x) => ({ ...x, [g.id]: Math.max(0, (x[g.id] ?? 0) - 1) }))}>
                        −
                      </button>
                      <b>{guests[g.id] ?? 0}</b>
                      <button type="button" aria-label="+" disabled={(guests[g.id] ?? 0) >= g.max} onClick={() => setGuests((x) => ({ ...x, [g.id]: Math.min(g.max, (x[g.id] ?? 0) + 1) }))}>
                        +
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="sh-foot">
              <span>
                {quote === "busy"
                  ? tr("Henter pris …")
                  : quote && !quote.ok
                    ? tr("Ikke ledigt i hele perioden")
                    : quote?.price != null
                      ? money(quote.price)
                      : ""}
              </span>
              <button type="button" className="hv-btn hv-primary" onClick={() => onBook(tr("Book"), url)}>
                {tr("Book")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const SHOP_CSS = `
.sh{position:absolute;inset:0;z-index:36;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.35);animation:hvFade .2s ease}
.sh-sheet{width:min(420px,100%);max-height:92%;overflow-y:auto;margin:0 0 16px;padding:16px 18px 18px;border-radius:18px;background:var(--c-soft,#fff);color:#1d2a30;box-shadow:0 18px 50px rgba(0,0,0,.35);animation:hvUp .3s cubic-bezier(.2,.7,.2,1) both}
.sh-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.sh-head b{display:block;font-size:19px;font-weight:900;color:var(--c-main)}
.sh-head small{display:block;margin-top:2px;font-size:13px;color:#5d6b72}
.sh-head button{flex:none;width:30px;height:30px;border:0;border-radius:50%;background:rgba(0,0,0,.06);font-size:18px;line-height:1;cursor:pointer}
.sh-note{margin:14px 0 4px;font-size:14px;color:#5d6b72}
.sh-month{display:flex;align-items:center;justify-content:space-between;margin:14px 0 6px}
.sh-month b{font-size:15px;text-transform:capitalize}
.sh-month button{width:32px;height:32px;border:0;border-radius:50%;background:rgba(0,0,0,.05);font-size:20px;line-height:1;cursor:pointer}
.sh-month button:disabled{opacity:.3;cursor:default}
.sh-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}
.sh-days i{font-style:normal;font-size:11px;font-weight:700;color:#8a979c;padding:2px 0}
.sh-days button{height:36px;border:0;border-radius:9px;background:none;font:inherit;font-size:14px;font-weight:600;color:#1d2a30;cursor:pointer}
.sh-days button:disabled{color:#c3cbce;text-decoration:line-through;cursor:default}
.sh-days button:not(:disabled):hover{background:rgba(0,0,0,.05)}
.sh-days button.imellem,.sh-days button.imellem:hover{background:color-mix(in srgb,var(--c-accent) 16%,transparent)}
.sh-days button.valgt,.sh-days button.valgt:hover{background:var(--c-accent);color:#fff}
.sh-hint{margin:8px 0 0;font-size:13px;color:#5d6b72;text-align:center}
.sh-guests{margin-top:12px;border-top:1px solid rgba(0,0,0,.08)}
.sh-guests>div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:14px}
.sh-step{display:flex;align-items:center;gap:10px}
.sh-step button{width:30px;height:30px;border:1.5px solid rgba(0,0,0,.15);border-radius:50%;background:#fff;font-size:17px;line-height:1;cursor:pointer}
.sh-step button:disabled{opacity:.35;cursor:default}
.sh-step b{min-width:16px;text-align:center}
.sh-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.sh-foot span{font-size:17px;font-weight:900;color:var(--c-main)}
.sh-foot .hv-btn{flex:none;margin:0;padding-left:26px;padding-right:26px}
@media (max-width:760px){.sh-sheet{margin:0;border-radius:18px 18px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}}
`;
