/**
 * Generates placeholder PWA icons (192x192, 512x512, maskable variants).
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install -D sharp
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'icons')

const createSquare = (size, padding = 0) => {
  const inner = size - padding * 2
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#000000"/>
      <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" fill="#333333" rx="8"/>
    </svg>
  `
  return Buffer.from(svg.trim())
}

await mkdir(outDir, { recursive: true })

const sizes = [
  { name: 'icon-192', size: 192, padding: 0 },
  { name: 'icon-512', size: 512, padding: 0 },
  { name: 'icon-maskable-192', size: 192, padding: 24 },
  { name: 'icon-maskable-512', size: 512, padding: 64 },
]

for (const { name, size, padding } of sizes) {
  const svg = createSquare(size, padding)
  const png = await sharp(svg).png().toBuffer()
  await writeFile(path.join(outDir, `${name}.png`), png)
  console.log(`Wrote ${name}.png`)
}

console.log('Done.')
