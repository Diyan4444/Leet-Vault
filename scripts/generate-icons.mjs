import fs from 'fs';
import path from 'path';

// Clean minimal SVG icon
const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#grad)" />
  <!-- Code brackets & sync check icon -->
  <path d="M42 44L24 64L42 84" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M86 44L104 64L86 84" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M54 64L62 72L76 56" stroke="#34d399" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`;

const iconsDir = path.resolve('public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent.trim());
console.log('Saved public/icons/icon.svg');
