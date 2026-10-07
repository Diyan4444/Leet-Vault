import fs from 'fs';
import path from 'path';

// Copy manifest.json to dist/manifest.json
fs.copyFileSync('manifest.json', 'dist/manifest.json');

// Copy public directory to dist if it exists
if (fs.existsSync('public')) {
  fs.cpSync('public', 'dist', { recursive: true });
}

console.log('Successfully copied manifest.json and public assets to dist/');
