function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  avatarUrl,
  size = 20,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const px = `${size}px`;
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-900 font-semibold text-white"
      style={{ width: px, height: px, fontSize: size * 0.42 }}
    >
      {initialsOf(name)}
    </span>
  );
}
