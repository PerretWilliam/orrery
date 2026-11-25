const HEX = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

const channel = (value: number) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/**
 * The project's accent color (`project.color` of `.hub.yml`) as CSS variables, with a text color that stays readable on
 * it. Only a plain `#rrggbb` is ever used: anything else gives no style, so no CSS can come from a repository.
 */
export function accentStyle(color: string | null | undefined): React.CSSProperties | undefined {
  const found = color == null ? null : HEX.exec(color);
  if (!found) return undefined;
  const [r, g, b] = [found[1], found[2], found[3]].map((hex) => channel(Number.parseInt(hex, 16)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Black text on the accent has the better contrast above this luminance (the point where both ratios are equal).
  const text = luminance > 0.179 ? "#000000" : "#ffffff";
  return { "--primary": color, "--primary-foreground": text, "--ring": color } as React.CSSProperties;
}
