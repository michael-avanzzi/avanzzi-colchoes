import { LOJA } from '../config'
import type { Horario } from './disponibilidade'

const LARGURA = 1080
const MARGEM = 64
const COLUNAS = 3
const GAP = 20
const ALTURA_CELULA = 104
const FONTE = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

const COR = {
  preto: '#111111',
  marca: '#FAA300',
  fundo: '#fafaf8',
  texto: '#1d1d1b',
  suave: '#6b6b66',
  livreFundo: '#e8f6ee',
  livreBorda: '#1f8f4e',
  livreTexto: '#14663a',
  ocupadoFundo: '#ececea',
  ocupadoTexto: '#9a9a94',
}

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

type Dados = { dia: Date; vendedor: string; horarios: Horario[] }

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Quebra o texto em linhas que caibam na largura. */
function linhas(ctx: CanvasRenderingContext2D, texto: string, largura: number) {
  const palavras = texto.split(' ')
  const res: string[] = []
  let atual = ''
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p
    if (ctx.measureText(teste).width > largura && atual) {
      res.push(atual)
      atual = p
    } else atual = teste
  }
  if (atual) res.push(atual)
  return res
}

function desenharLogo(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number) {
  const s = tamanho / 512
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = COR.marca
  ctx.fill(new Path2D('M256 104 L392 408 H330 L302 342 H210 L182 408 H120 Z M228 296 H284 L256 228 Z'), 'evenodd')
  ctx.restore()
}

/** Desenha a grade de horários do dia num canvas (1080 px de largura). */
export function desenharHorarios({ dia, vendedor, horarios }: Dados): HTMLCanvasElement {
  const linhasGrade = Math.max(1, Math.ceil(horarios.length / COLUNAS))
  const alturaGrade = horarios.length ? linhasGrade * ALTURA_CELULA + (linhasGrade - 1) * GAP : 120
  const topoGrade = 200 + 190 + 64
  const altura = topoGrade + alturaGrade + 190

  const canvas = document.createElement('canvas')
  canvas.width = LARGURA
  canvas.height = altura
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = COR.fundo
  ctx.fillRect(0, 0, LARGURA, altura)

  // Faixa preta com a marca
  ctx.fillStyle = COR.preto
  ctx.fillRect(0, 0, LARGURA, 200)
  desenharLogo(ctx, MARGEM - 14, 44, 112)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 52px ${FONTE}`
  ctx.fillText(LOJA.nome.toUpperCase(), MARGEM + 116, 104)
  ctx.fillStyle = COR.marca
  ctx.font = `600 32px ${FONTE}`
  ctx.fillText('Horários de atendimento', MARGEM + 116, 150)

  // Data e vendedor
  const diaTexto = fmtDia.format(dia)
  ctx.fillStyle = COR.texto
  ctx.font = `800 60px ${FONTE}`
  ctx.fillText(`${diaTexto.charAt(0).toUpperCase()}${diaTexto.slice(1)}`, MARGEM, 290)
  ctx.fillStyle = COR.suave
  ctx.font = `500 34px ${FONTE}`
  ctx.fillText(`Atendimento com ${vendedor}`, MARGEM, 344)

  // Legenda
  const legenda = (x: number, fundo: string, borda: string, texto: string) => {
    retangulo(ctx, x, 372, 28, 28, 6)
    ctx.fillStyle = fundo
    ctx.fill()
    ctx.strokeStyle = borda
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = COR.texto
    ctx.font = `600 28px ${FONTE}`
    ctx.fillText(texto, x + 40, 396)
    return x + 40 + ctx.measureText(texto).width + 40
  }
  const xLeg = legenda(MARGEM, COR.livreFundo, COR.livreBorda, 'Livre')
  legenda(xLeg, COR.ocupadoFundo, COR.ocupadoFundo, 'Ocupado')

  // Grade
  const largCelula = (LARGURA - 2 * MARGEM - (COLUNAS - 1) * GAP) / COLUNAS
  if (!horarios.length) {
    ctx.fillStyle = COR.suave
    ctx.font = `600 34px ${FONTE}`
    ctx.fillText('Não há mais horários neste dia.', MARGEM, topoGrade + 60)
  }
  horarios.forEach((h, i) => {
    const x = MARGEM + (i % COLUNAS) * (largCelula + GAP)
    const y = topoGrade + Math.floor(i / COLUNAS) * (ALTURA_CELULA + GAP)
    retangulo(ctx, x, y, largCelula, ALTURA_CELULA, 18)
    ctx.fillStyle = h.livre ? COR.livreFundo : COR.ocupadoFundo
    ctx.fill()
    if (h.livre) {
      ctx.strokeStyle = COR.livreBorda
      ctx.lineWidth = 3
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = h.livre ? COR.livreTexto : COR.ocupadoTexto
    ctx.font = `800 40px ${FONTE}`
    ctx.fillText(fmtHora.format(h.inicio), x + largCelula / 2, y + 52)
    ctx.font = `600 24px ${FONTE}`
    ctx.fillText(h.livre ? 'Livre' : 'Ocupado', x + largCelula / 2, y + 86)
    ctx.textAlign = 'left'
  })

  // Rodapé
  const yRodape = topoGrade + alturaGrade + 70
  let y = yRodape
  ctx.fillStyle = COR.texto
  ctx.font = `700 30px ${FONTE}`
  ctx.fillText('Escolha um horário livre e responda esta mensagem.', MARGEM + 24, y)
  if (LOJA.endereco) {
    ctx.fillStyle = COR.suave
    ctx.font = `500 26px ${FONTE}`
    for (const l of linhas(ctx, LOJA.endereco, LARGURA - 2 * MARGEM - 24)) {
      y += 40
      ctx.fillText(l, MARGEM + 24, y)
    }
  }
  ctx.fillStyle = COR.marca
  ctx.fillRect(MARGEM, yRodape - 30, 6, y - yRodape + 40)

  return canvas
}

export function canvasParaJpg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/jpeg', 0.92),
  )
}
