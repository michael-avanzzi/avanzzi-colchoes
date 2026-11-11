/**
 * Gera os ícones PNG do PWA a partir de public/icons/icon.svg.
 * Uso: npm run icones   (rode de novo quando o logo oficial substituir o SVG)
 *
 * - pwa-192.png / pwa-512.png: ícone normal
 * - pwa-maskable-512.png: com margem de segurança (Android recorta em círculo/forma)
 * - apple-touch-icon.png (180): iPhone/iPad, sem transparência
 * - favicon-32.png
 */
import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const pasta = new URL('../public/icons/', import.meta.url)
const svg = await readFile(new URL('icon.svg', pasta), 'utf8')

// Versão "maskable": fundo cheio e o desenho reduzido para 70% (zona segura de 80%).
const interno = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111111"/>
  <g transform="translate(76.8 76.8) scale(0.7)">${interno}</g>
</svg>`

// Apple: sem cantos arredondados próprios (o iOS arredonda) e sem transparência.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111111"/>
  <g transform="translate(25.6 25.6) scale(0.9)">${interno}</g>
</svg>`

const saidas = [
  ['pwa-192.png', svg, 192],
  ['pwa-512.png', svg, 512],
  ['pwa-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', apple, 180],
  ['favicon-32.png', svg, 32],
]

for (const [nome, fonte, tamanho] of saidas) {
  const png = new Resvg(fonte, { fitTo: { mode: 'width', value: tamanho } }).render().asPng()
  await writeFile(new URL(nome, pasta), png)
  console.log(`✓ public/icons/${nome} (${tamanho}px)`)
}
