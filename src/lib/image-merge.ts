import sharp from "sharp";

/*
 * An image model gives back a small picture (1-2 megapixels), so a big photo
 * - above all a 360° one - would come back blurred all over. Instead the
 * model's picture is only used where it actually changed something: both are
 * compared small and soft, and where they differ the new picture is laid in
 * with a soft edge; everywhere else the original keeps its full sharpness.
 */

const COMPARE_W = 640;
/** Differences below LOW are "the same", above HIGH "changed" (sum over r, g, b, 0-765). */
const LOW = 30;
const HIGH = 90;

export async function keepSharpWhereUnchanged(original: Buffer, edited: Buffer): Promise<{ data: Buffer; w: number; h: number }> {
  const meta = await sharp(original).rotate().metadata();
  const w = meta.autoOrient?.width ?? meta.width!;
  const h = meta.autoOrient?.height ?? meta.height!;
  const ch = Math.max(1, Math.round((COMPARE_W * h) / w));
  // Small and soft, so noise and fine detail don't count as changes.
  const small = (b: Buffer) => sharp(b).rotate().resize(COMPARE_W, ch, { fit: "fill" }).blur(1.5).removeAlpha().raw().toBuffer();
  const [a, b] = await Promise.all([small(original), small(edited)]);
  const mask = Buffer.alloc(COMPARE_W * ch);
  for (let i = 0, p = 0; p < mask.length; p++, i += 3) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    mask[p] = d <= LOW ? 0 : d >= HIGH ? 255 : Math.round(((d - LOW) / (HIGH - LOW)) * 255);
  }
  // A little wider and softer, so a change has no hard edge.
  const full = (b: Buffer, channels: 1 | 3) =>
    channels === 1
      ? sharp(b, { raw: { width: COMPARE_W, height: ch, channels: 1 } }).dilate(2).blur(3).resize(w, h, { fit: "fill" }).extractChannel(0).raw().toBuffer()
      : sharp(b).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [m, o, e] = await Promise.all([full(mask, 1), full(original, 3), full(edited, 3)]);
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const k = m[p] / 255;
    out[i] = o[i] + (e[i] - o[i]) * k;
    out[i + 1] = o[i + 1] + (e[i + 1] - o[i + 1]) * k;
    out[i + 2] = o[i + 2] + (e[i + 2] - o[i + 2]) * k;
  }
  return { data: out, w, h };
}

/** Where two pictures of the same size (raw RGB) differ, as a soft mask (one byte per pixel, 0-255) - compared small and soft like above. */
export async function changeMask(a: Buffer, b: Buffer, w: number, h: number): Promise<Buffer> {
  const ch = Math.max(1, Math.round((COMPARE_W * h) / w));
  const small = (x: Buffer) => sharp(x, { raw: { width: w, height: h, channels: 3 } }).resize(COMPARE_W, ch, { fit: "fill" }).blur(1.5).raw().toBuffer();
  const [sa, sb] = await Promise.all([small(a), small(b)]);
  const mask = Buffer.alloc(COMPARE_W * ch);
  for (let i = 0, p = 0; p < mask.length; p++, i += 3) {
    const d = Math.abs(sa[i] - sb[i]) + Math.abs(sa[i + 1] - sb[i + 1]) + Math.abs(sa[i + 2] - sb[i + 2]);
    mask[p] = d <= LOW ? 0 : d >= HIGH ? 255 : Math.round(((d - LOW) / (HIGH - LOW)) * 255);
  }
  return sharp(mask, { raw: { width: COMPARE_W, height: ch, channels: 1 } }).dilate(2).blur(3).resize(w, h, { fit: "fill" }).extractChannel(0).raw().toBuffer();
}
