export const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

export const contrastTextFor = (accent: string) => {
  const rgb = hexToRgb(accent);
  if (!rgb) return "#171717";
  const luminance = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const relativeLuminance =
    0.2126 * luminance[0]! + 0.7152 * luminance[1]! + 0.0722 * luminance[2]!;
  return relativeLuminance > 0.42 ? "#171717" : "#FFFFFF";
};

export const merchantThemeStyle = (accent: string) =>
  ({
    "--merchant-accent": /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#1F3A5F",
    "--merchant-accent-text": contrastTextFor(accent),
  }) as React.CSSProperties;
