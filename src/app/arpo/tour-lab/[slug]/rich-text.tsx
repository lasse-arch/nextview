"use client";

/*
 * A text from the setup with a little form: a blank line = a new paragraph, a
 * line break stays a line break, and lines like "Mandag - torsdag: 8-12 og
 * 14-19" (a day, a colon, the time) are set as a small table - days on the
 * left, times on the right. Everything is inline-level (spans), so it can sit
 * inside a <p>. Plain text without any of it looks exactly as before.
 */

const DAY = /(man|tir|ons|tor|fre|lør|lor|søn|son|hverdag|weekend|helligdag|alle dage|dagligt|mon|tue|wed|thu|fri|sat|sun|weekday|holiday|daily)/i;
const HOURS_LINE = /^\s*([^:\n]{2,40}?)\s*:\s*(.+?)\s*$/;

function isHoursLine(line: string): [string, string] | null {
  const m = HOURS_LINE.exec(line);
  return m && DAY.test(m[1]) && /\d|lukket|closed/i.test(m[2]) ? [m[1], m[2]] : null;
}

export function RichText({ text }: { text: string }) {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {paragraphs.map((p, i) => {
        // Runs of lines: plain lines, and runs of hours lines as one table.
        const parts: ({ kind: "line"; text: string } | { kind: "hours"; rows: [string, string][] })[] = [];
        for (const line of p.split("\n")) {
          const h = isHoursLine(line);
          const last = parts[parts.length - 1];
          if (h && last?.kind === "hours") last.rows.push(h);
          else if (h) parts.push({ kind: "hours", rows: [h] });
          else if (line.trim()) parts.push({ kind: "line", text: line.trim() });
        }
        return (
          <span key={i} className="rt-afsnit">
            {parts.map((part, j) =>
              part.kind === "line" ? (
                <span key={j} className="rt-linje">
                  {part.text}
                </span>
              ) : (
                <span key={j} className="rt-tider">
                  {part.rows.map(([days, time], k) => (
                    <span key={k} className="rt-tid">
                      <span>{days}</span>
                      <b>{time}</b>
                    </span>
                  ))}
                </span>
              )
            )}
          </span>
        );
      })}
    </>
  );
}

export const RICH_TEXT_CSS = `
.rt-afsnit{display:block}
.rt-afsnit+.rt-afsnit{margin-top:.6em}
.rt-linje{display:block}
.rt-tider{display:grid;grid-template-columns:auto auto;justify-content:start;column-gap:18px;row-gap:3px;margin:.45em 0 .2em;padding:8px 12px;border-radius:12px;background:color-mix(in srgb,var(--c-main) 6%,transparent);font-size:.95em}
.rt-tid{display:contents}
.rt-tid>span{opacity:.85}
.rt-tid>b{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
`;
