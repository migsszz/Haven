// Checks text contrast in every daisyUI theme defined under src (styles.css and src/designs/*.css).
// Run with `npm run check:contrast`. Fails if any pair that is used for text or button labels drops below 4.5:1 (WCAG AA).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = ['src/styles.css', ...readdirSync('src/designs').map((f) => join('src/designs', f))];
const themes = {};
for (const file of files) {
  const css = readFileSync(file, 'utf8');
  for (const block of css.matchAll(/@plugin 'daisyui\/theme' \{([^}]*)\}/g)) {
    const vars = Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const name = block[1].match(/name:\s*'([^']+)'/)[1];
    themes[name] = vars;
  }
}

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Colours used as text on the page and card backgrounds.
const TEXT = ['base-content', 'haven-muted', 'color-accent', 'color-success', 'color-error', 'color-info', 'color-warning', 'color-primary'];
// Labels on filled buttons, badges and tags.
const FILLED = ['primary', 'accent', 'secondary', 'error', 'success', 'info', 'warning', 'neutral'];
// Text colours a design never uses as text, only as a fill with its own label colour.
const NOT_TEXT = { bold: ['color-accent'], 'bold-dark': [] };

let failures = 0;
const names = Object.keys(themes);
for (const name of names) {
  const t = themes[name];
  const get = (key) => t[key.startsWith('color-') || key === 'haven-muted' ? key : `color-${key}`];
  const surfaces = ['color-base-100', 'color-base-200', 'haven-surface'];
  const skip = NOT_TEXT[name] ?? [];
  for (const fg of TEXT) {
    if (skip.includes(fg)) continue;
    for (const bg of surfaces) {
      // A design's primary is its button colour; it is only used as text where it is also the ink.
      if (fg === 'color-primary' && !['haven', 'haven-dark', 'bold', 'bold-dark', 'friendly', 'friendly-dark'].includes(name)) continue;
      if (!t[fg] || !t[bg]) continue;
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) { failures++; console.log(`FAIL ${name}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)}`); }
    }
  }
  for (const f of FILLED) {
    const fill = t[`color-${f}`], label = t[`color-${f}-content`];
    if (!fill || !label) continue;
    const r = ratio(fill, label);
    if (r < 4.5) { failures++; console.log(`FAIL ${name}: ${f} button label ${label} on ${fill} = ${r.toFixed(2)}`); }
  }
}
console.log(`${names.length} themes checked (${names.join(', ')}).`);
if (failures) { console.log(`${failures} contrast problem(s).`); process.exit(1); }
console.log('All text pairs are at least 4.5:1.');
