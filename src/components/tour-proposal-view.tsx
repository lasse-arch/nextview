import type { ProposalData } from "@/lib/tour-proposal";
import { textOn } from "@/app/arpo/tour-lab/tours/contrast";

/*
 * A tour idea as a page (Generator → "Få et oplæg til touren"): one picture -
 * the tour's welcome on a phone, in the customer's own colours and logo, with
 * their own places on the tiles - and the idea beside it in a few sentences
 * with three features. Shown in Arpo and on the customer's read-only link.
 * No hooks - plain HTML.
 */

const hex = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : fallback);
const fontName = (v: string | undefined) => (v && /^[A-Za-z0-9 ]{2,40}$/.test(v.trim()) ? v.trim() : "");

export function proposalFonts(d: ProposalData): string | null {
  const fams = [...new Set([fontName(d.design?.font), fontName(d.design?.fontHeading)].filter(Boolean))];
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700;800`).join("&")}&display=swap` : null;
}

export function TourProposalView({ d }: { d: ProposalData }) {
  const main = hex(d.design?.main, "#1f4d36");
  const accent = hex(d.design?.accent, "#e0773a");
  const soft = hex(d.design?.soft, "#eef2e9");
  const body = fontName(d.design?.font);
  const head = fontName(d.design?.fontHeading) || body;
  const tiles = (d.welcome?.tiles ?? []).slice(0, 4);
  const style = {
    "--main": main,
    "--accent": accent,
    "--on-accent": textOn(accent, "#1d2a30"),
    "--on-main": textOn(main, "#1d2a30"),
    "--soft": soft,
    "--display": `${head ? `'${head}', ` : ""}system-ui, -apple-system, sans-serif`,
    "--body": `${body ? `'${body}', ` : ""}system-ui, -apple-system, sans-serif`,
  } as React.CSSProperties;
  const host = d.website ? new URL(d.website).hostname.replace(/^www\./, "") : null;
  return (
    <div className="op" style={style}>
      <style>{OP_CSS}</style>
      <section className="op-card">
        <div className="op-idea">
          <span className="op-eyebrow">En idé til jeres tour · {d.customer}</span>
          <h1>{d.headline}</h1>
          <p className="op-lead">{d.idea}</p>
          <ul className="op-hl">
            {(d.highlights ?? []).slice(0, 3).map((h, i) => (
              <li key={i}>
                <b>{h.name}</b>
                <span>{h.use}</span>
              </li>
            ))}
          </ul>
          <p className="op-note">Billedet er en skitse i jeres farver - touren bygges på jeres egne {d.start === "luft" ? "dronebilleder og scanninger" : "scanninger"}.</p>
        </div>
        <div className="op-phone" aria-label={`Velkomsten i touren på en telefon: ${tiles.map((t) => t.title).join(", ")}`}>
          <div className="op-screen">
            <Sketch inside={d.start === "indenfor"} />
            <div className="op-top">
              <span className="op-brand">
                {d.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.logo} alt={d.customer} referrerPolicy="no-referrer" />
                ) : (
                  d.customer
                )}
              </span>
              <span className="op-menubtn">MENU</span>
            </div>
            <div className="op-welcome">
              <h4>{d.welcome?.title}</h4>
              <p>{d.welcome?.text}</p>
              <span className="op-go">▶ Vis mig rundt</span>
            </div>
            <div className="op-tiles">
              {tiles.map((t, i) => (
                <div key={i} className={`op-tile ${i === tiles.length - 1 ? "cta" : `t${i}`}`}>
                  <small>{t.kicker}</small>
                  {t.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <p className="op-foot">Nextview360 · nextview360.dk{host ? ` · Bygget ud fra ${host}` : ""}</p>
    </div>
  );
}

/** A drawn place behind the phone: an aerial landscape for a big area, a room for one building. The customer's own pictures come with the filming. */
function Sketch({ inside }: { inside: boolean }) {
  if (inside)
    return (
      <svg className="op-sketch" viewBox="0 0 300 640" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="300" height="640" fill="#d9d2c4" />
        <path d="M0 0 H300 V250 L210 300 H90 L0 250Z" fill="#ece6da" />
        <path d="M0 640 L90 300 H210 L300 640Z" fill="#b9a98d" />
        <rect x="110" y="150" width="80" height="120" rx="4" fill="#9fc3d3" />
        <rect x="30" y="330" width="60" height="90" rx="6" fill="#8a6d4b" />
        <rect x="215" y="330" width="55" height="110" rx="6" fill="#6f8a5c" />
      </svg>
    );
  return (
    <svg className="op-sketch" viewBox="0 0 300 640" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="300" height="640" fill="#8fb87a" />
      <path d="M0 420 C60 380 120 450 190 410 S300 380 300 420 V640 H0Z" fill="#7aa767" />
      <path d="M20 200 Q150 160 280 220" stroke="#efe6cc" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M40 480 Q150 430 260 500" stroke="#efe6cc" strokeWidth="9" fill="none" strokeLinecap="round" />
      <ellipse cx="80" cy="300" rx="68" ry="38" fill="#dcc583" />
      <ellipse cx="220" cy="250" rx="56" ry="34" fill="#9cc7d6" />
      <rect x="110" y="330" width="70" height="44" rx="10" fill="#b98a4b" />
      <g fill="#4f7d43">
        <circle cx="20" cy="30" r="22" />
        <circle cx="260" cy="120" r="24" />
        <circle cx="200" cy="560" r="22" />
        <circle cx="60" cy="570" r="18" />
      </g>
    </svg>
  );
}

const OP_CSS = `
.op{--ink:#18241c;--muted:#5d6b61;--line:#e1e6df;min-height:100vh;background:#f4f6f2;color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.55;padding:40px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px))}
.op *{box-sizing:border-box}
.op-card{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:48px;align-items:center;padding:clamp(22px,4vw,44px);border-radius:28px;background:#fff;border:1px solid var(--line);box-shadow:0 24px 60px rgba(10,30,18,.08)}
@media (max-width:820px){.op-card{grid-template-columns:1fr;gap:30px}}
.op-idea{display:flex;flex-direction:column;gap:14px;min-width:0}
.op h1,.op h4{font-family:var(--display);text-wrap:balance;margin:0;letter-spacing:-.01em}
.op h1{font-size:clamp(30px,4.6vw,48px);line-height:1.06;font-weight:800;color:var(--ink)}
.op p{margin:0}
.op-eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--main)}
.op-lead{font-size:17.5px;color:var(--muted);max-width:60ch}
.op-hl{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.op-hl li{display:flex;flex-direction:column;gap:2px;padding:11px 14px;border-radius:14px;background:var(--soft)}
.op-hl b{font-size:15px;color:var(--main)}
.op-hl span{font-size:14.5px;color:var(--ink)}
.op-note{font-size:12.5px;color:var(--muted)}
.op .op-foot{max-width:1000px;margin:16px auto 0;font-size:12.5px;color:var(--muted);text-align:center}
.op-phone{width:min(290px,100%);aspect-ratio:9/19;margin:0 auto;border-radius:42px;background:#0d120f;padding:10px;box-shadow:0 30px 60px rgba(10,30,18,.26)}
.op-screen{position:relative;width:100%;height:100%;border-radius:33px;overflow:hidden;background:#2f4a35}
.op-sketch{position:absolute;inset:0;width:100%;height:100%}
.op-top{position:absolute;top:14px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;z-index:2}
.op-brand{max-width:65%;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.96);font-family:var(--display);font-weight:800;font-size:12px;color:var(--main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-brand img{display:block;height:22px;width:auto;max-width:130px;object-fit:contain}
.op-menubtn{padding:7px 13px;border-radius:999px;background:var(--main);color:var(--on-main);font-size:11px;font-weight:800;letter-spacing:.08em}
.op-welcome{position:absolute;left:10px;right:10px;top:60px;z-index:2;padding:14px;border-radius:18px;background:rgba(255,255,255,.97)}
.op-welcome h4{font-size:18px;line-height:1.12;font-weight:800;color:var(--ink)}
.op-welcome p{font-size:11.5px;color:var(--muted);margin-top:5px;line-height:1.4}
.op-go{display:inline-block;margin-top:9px;padding:7px 12px;border-radius:999px;background:var(--main);color:var(--on-main);font-size:11.5px;font-weight:700}
.op-tiles{position:absolute;left:10px;right:10px;bottom:12px;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:7px}
.op-tile{height:66px;border-radius:13px;padding:8px 9px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;font-family:var(--display);font-weight:700;font-size:12px;line-height:1.1;background:linear-gradient(160deg,color-mix(in srgb,var(--main) 70%,#fff),var(--main))}
.op-tile.t1{background:linear-gradient(160deg,color-mix(in srgb,var(--main) 45%,#c9a24f),color-mix(in srgb,var(--main) 70%,#000))}
.op-tile.t2{background:linear-gradient(160deg,color-mix(in srgb,var(--main) 50%,#6fb3c9),color-mix(in srgb,var(--main) 80%,#000))}
.op-tile.cta{background:var(--accent);color:var(--on-accent)}
.op-tile small{font-family:var(--body);font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.8}
`;
