/**
 * Gera os ícones PNG do PWA a partir de public/icons/icon.svg.
 * Uso: npm run icones   (rode de novo sempre que o SVG mudar)
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

// Desenho sem o quadrado arredondado de fundo (id="fundo-icone"): Android e iOS
// recortam o ícone com a forma deles, então o fundo vai cheio até a borda.
const interno = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<rect id="fundo-icone"[^>]*\/>/, '')
const fundo = '<rect width="512" height="512" fill="#141415"/>'

// Versão "maskable": desenho reduzido para caber na zona segura (círculo de 80%).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${fundo}
  <g transform="translate(38.4 38.4) scale(0.85)">${interno}</g>
</svg>`

// Apple: sem cantos arredondados próprios (o iOS arredonda) e sem transparência.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${fundo}
  ${interno}
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
