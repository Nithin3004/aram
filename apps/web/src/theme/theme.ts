import { colors, fonts, radii, space, tones } from '@aram/shared';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/**
 * Turns the shared design tokens into CSS custom properties.
 * Every stylesheet in the web app reads these variables — no raw colours in screens.
 */
export function themeCss(): string {
  const v: string[] = [];
  for (const [k, val] of Object.entries(colors)) v.push(`--c-${kebab(k)}:${val}`);
  for (const [k, val] of Object.entries(tones)) v.push(`--tone-${k}-bg:${val.bg}`, `--tone-${k}-fg:${val.fg}`);
  for (const [k, val] of Object.entries(radii)) v.push(`--r-${k}:${val}px`);
  for (const [k, val] of Object.entries(space)) v.push(`--s-${k}:${val}px`);
  v.push(`--f-latin:'${fonts.latin}',system-ui,sans-serif`, `--f-tamil:'${fonts.tamil}','${fonts.latin}',system-ui,sans-serif`, `--f-mono:'${fonts.mono}',ui-monospace,monospace`);
  return `:root{${v.join(';')}}`;
}

export const googleFontsHref =
  'https://fonts.googleapis.com/css2?family=Anek+Latin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Anek+Tamil:wght@400;500;600;700&display=swap';
