/**
 * Google Fonts addresses for a tour's font. Google answers a whole request
 * with an error when one of the weights asked for doesn't exist (Bebas Neue,
 * Anton … have only one) - and then the font is missing and the browser's
 * Times shows instead. So the font is always asked for plainly (its normal
 * weight, which every font has), and the weights in a second request that
 * may fail on its own without taking the font with it.
 */
export function fontHrefs(family: string, weights: number[]): string[] {
  const f = family.trim().replace(/ /g, "+");
  if (!f) return [];
  return [`https://fonts.googleapis.com/css2?family=${f}&display=swap`, `https://fonts.googleapis.com/css2?family=${f}:wght@${weights.join(";")}&display=swap`];
}
