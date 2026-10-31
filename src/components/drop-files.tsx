"use client";

import { useEffect } from "react";

/*
 * Drag a file in from the computer, anywhere in Arpo: every place that takes a
 * file (any <input type="file">) lights up, and the file dropped on one goes
 * into it exactly as if it had been picked with a click - so every upload
 * (tour pictures, logos, sound, attachments, imports …) takes drops without
 * each one being built for it. Only files that fit what the place accepts.
 */

/** The file input a drop on this element is meant for: its label's, or the one input in the nearest box around it. */
function inputFor(el: Element | null): HTMLInputElement | null {
  for (let at = el, depth = 0; at && depth < 6; at = at.parentElement, depth++) {
    const inputs = at.querySelectorAll<HTMLInputElement>('input[type="file"]:not(:disabled)');
    if (inputs.length === 1) return inputs[0];
    if (inputs.length > 1) return null;
  }
  return null;
}

/** Does the file fit the input's accept list ("image/*,.mp3" …)? */
function accepts(input: HTMLInputElement, file: File): boolean {
  const list = input.accept.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return list.some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}

const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer && [...e.dataTransfer.types].includes("Files"));

export function DropFiles() {
  useEffect(() => {
    let depth = 0;
    let target: HTMLElement | null = null;
    const mark = (el: HTMLElement | null) => {
      if (target === el) return;
      target?.classList.remove("drop-her");
      target = el;
      target?.classList.add("drop-her");
    };
    const zoneOf = (input: HTMLInputElement | null) => (input ? ((input.closest("label") as HTMLElement | null) ?? input.parentElement) : null);
    const end = () => {
      depth = 0;
      document.body.classList.remove("drop-aktiv");
      mark(null);
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      document.body.classList.add("drop-aktiv");
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) end();
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Never let the browser open the file instead (it would leave the page and lose what isn't saved).
      e.preventDefault();
      const input = inputFor(e.target as Element);
      mark(zoneOf(input));
      if (e.dataTransfer) e.dataTransfer.dropEffect = input ? "copy" : "none";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const input = inputFor(e.target as Element);
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => input && accepts(input, f));
      end();
      if (!input || !files.length) return;
      const dt = new DataTransfer();
      for (const f of input.multiple ? files : files.slice(0, 1)) dt.items.add(f);
      input.files = dt.files;
      // React listens for the input's own change event - as when a file is picked.
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return (
    <style>{`
      body.drop-aktiv label:has(> input[type="file"]:not(:disabled)), body.drop-aktiv :has(> input[type="file"]:not(:disabled)) {outline:2px dashed #0071e3;outline-offset:3px;border-radius:12px}
      body.drop-aktiv .drop-her{outline-style:solid !important;background:rgba(0,113,227,.08) !important}
    `}</style>
  );
}
