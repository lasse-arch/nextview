"use client";

/* The editor's building blocks - Apple-style fields, switches and groups. */

export const input =
  "w-full rounded-[10px] border-0 bg-[#f2f2f7] px-3 py-2 text-[15px] text-[#1d1d1f] placeholder:text-[#8e8e93] transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]";
export const label = "block text-[13px] font-medium text-[#6e6e73]";

export function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} dangerouslySetInnerHTML={{ __html: d }} />;
}

/** A white, rounded group of settings - like a section in the iPhone's Settings. */
export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-[#6e6e73]">{title}</h3>}
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] ring-1 ring-black/[.04]">{children}</div>
    </section>
  );
}

export function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className={label}>{title}</span>
      {children}
      {hint && <p className="text-[12px] leading-snug text-[#8e8e93]">{hint}</p>}
    </div>
  );
}

/** An iOS-style switch with its label on the left. */
export function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (on: boolean) => void; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] text-[#1d1d1f]">{title}</span>
        {hint && <span className="block text-[12px] leading-snug text-[#8e8e93]">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-[#34c759]" : "bg-[#e9e9eb]"}`}
      >
        <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-all duration-200 ${on ? "left-[22px]" : "left-[2px]"}`} />
      </button>
    </div>
  );
}

/** A segmented control. */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[9px] bg-[#e9e9eb] p-[2px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[7px] px-3 py-[5px] text-[13px] font-medium transition ${v === value ? "bg-white text-[#1d1d1f] shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)]" : "text-[#1d1d1f]/70 hover:text-[#1d1d1f]"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}


/** The live preview, as the editors use it: where it stands, a photo of what it shows, and showing a place. */
export type PreviewApi = {
  view: () => Promise<{ href?: string; room?: string | null; error?: string }>;
  shot: () => Promise<{ image?: string; error?: string }>;
  go: (name: string, href: string) => void;
};

/** The scan point number (ss) of a link to a place in the tour. */
export const ssOfHref = (href: string) => {
  const ss = Number(new URLSearchParams(href.split("?")[1] ?? "").get("ss"));
  return Number.isFinite(ss) && ss > 0 ? ss : null;
};
