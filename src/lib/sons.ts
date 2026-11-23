/**
 * Sons dos avisos do Ranking, gerados na hora pelo Web Audio (sem arquivos).
 *
 * Os navegadores só liberam áudio depois de um toque ou tecla na página.
 * `prepararSom()` fica ouvindo o primeiro gesto e libera o áudio nele.
 */

const CHAVE = 'avanzzi.ranking.som'
type Contexto = AudioContext

let ctx: Contexto | null = null
const ouvintes = new Set<() => void>()

function contexto(): Contexto | null {
  if (ctx) return ctx
  const Classe = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Classe) return null
  ctx = new Classe()
  ctx.onstatechange = () => ouvintes.forEach((f) => f())
  return ctx
}

/** Liga o áudio no primeiro toque/tecla da pessoa (exigência dos navegadores). */
export function prepararSom() {
  const c = contexto()
  if (!c) return () => {}
  const liberar = () => {
    void c.resume().catch(() => {})
  }
  window.addEventListener('pointerdown', liberar)
  window.addEventListener('keydown', liberar)
  return () => {
    window.removeEventListener('pointerdown', liberar)
    window.removeEventListener('keydown', liberar)
  }
}

/** true enquanto o navegador ainda não deixou tocar som (falta um toque na tela). */
export function somBloqueado() {
  const c = contexto()
  return !c || c.state !== 'running'
}

export function aoMudarEstadoDoSom(f: () => void) {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}

export function somLigado() {
  try {
    return localStorage.getItem(CHAVE) !== 'desligado'
  } catch {
    return true
  }
}

export function definirSomLigado(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado')
  } catch {
    // sem armazenamento local: vale só nesta visita
  }
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Uma nota com envelope (ataque rápido, queda suave). */
function nota(
  c: Contexto,
  destino: AudioNode,
  midi: number,
  inicio: number,
  duracao: number,
  { tipo = 'sine' as OscillatorType, volume = 0.3, ataque = 0.01, detune = 0 } = {},
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = tipo
  osc.frequency.value = freq(midi)
  osc.detune.value = detune
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.exponentialRampToValueAtTime(volume, inicio + ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao)
  osc.connect(g).connect(destino)
  osc.start(inicio)
  osc.stop(inicio + duracao + 0.05)
}

/** Ruído curto filtrado (prato/brilho). */
function brilho(c: Contexto, destino: AudioNode, inicio: number, duracao: number, volume = 0.12) {
  const tamanho = Math.floor(c.sampleRate * duracao)
  const buffer = c.createBuffer(1, tamanho, c.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < tamanho; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / tamanho) ** 2
  const fonte = c.createBufferSource()
  fonte.buffer = buffer
  const filtro = c.createBiquadFilter()
  filtro.type = 'highpass'
  filtro.frequency.value = 6000
  const g = c.createGain()
  g.gain.value = volume
  fonte.connect(filtro).connect(g).connect(destino)
  fonte.start(inicio)
}

function saida(c: Contexto, volume: number) {
  const mestre = c.createGain()
  mestre.gain.value = volume
  const comp = c.createDynamicsCompressor()
  mestre.connect(comp).connect(c.destination)
  return mestre
}

/** Fanfarra de metais curta: novo 1º lugar. */
export function tocarLideranca() {
  const c = contexto()
  if (!c || c.state !== 'running' || !somLigado()) return
  const t = c.currentTime + 0.05
  const mestre = saida(c, 0.9)
  const filtro = c.createBiquadFilter()
  filtro.type = 'lowpass'
  filtro.frequency.value = 2600
  filtro.connect(mestre)

  // Sol - Dó - Mi - Sol ... Mi - Sol (longo): chamada de vitória em Dó maior
  const frase: [number, number, number][] = [
    [67, 0, 0.16],
    [72, 0.16, 0.16],
    [76, 0.32, 0.16],
    [79, 0.48, 0.42],
    [76, 0.92, 0.16],
    [79, 1.08, 0.9],
  ]
  for (const [m, quando, dur] of frase) {
    // "metal": serra + quadrada levemente desafinadas, com uma terça abaixo de apoio
    nota(c, filtro, m, t + quando, dur + 0.12, { tipo: 'sawtooth', volume: 0.16, ataque: 0.03 })
    nota(c, filtro, m, t + quando, dur + 0.12, { tipo: 'square', volume: 0.07, ataque: 0.03, detune: 8 })
    nota(c, filtro, m - 12, t + quando, dur + 0.12, { tipo: 'triangle', volume: 0.12, ataque: 0.03 })
  }
  // acorde final de Dó maior sustentado + prato
  for (const m of [60, 64, 67, 72]) {
    nota(c, filtro, m, t + 1.08, 1.3, { tipo: 'sawtooth', volume: 0.06, ataque: 0.05 })
  }
  brilho(c, mestre, t + 1.08, 1.2, 0.1)
}

/** Carrilhão subindo com brilho: meta do dia batida. */
export function tocarMeta() {
  const c = contexto()
  if (!c || c.state !== 'running' || !somLigado()) return
  const t = c.currentTime + 0.05
  const mestre = saida(c, 0.85)

  // Dó - Mi - Sol - Dó - Mi (oitava acima), como sinos
  const sinos: [number, number][] = [
    [72, 0],
    [76, 0.11],
    [79, 0.22],
    [84, 0.33],
    [88, 0.5],
  ]
  for (const [m, quando] of sinos) {
    const dur = quando >= 0.5 ? 1.6 : 0.9
    nota(c, mestre, m, t + quando, dur, { tipo: 'sine', volume: 0.22, ataque: 0.005 })
    nota(c, mestre, m + 12, t + quando, dur * 0.6, { tipo: 'sine', volume: 0.07, ataque: 0.005 })
    nota(c, mestre, m + 19, t + quando, dur * 0.35, { tipo: 'triangle', volume: 0.03, ataque: 0.005 })
  }
  // base cheia no final
  for (const m of [48, 55, 60]) nota(c, mestre, m, t + 0.5, 1.4, { tipo: 'triangle', volume: 0.08, ataque: 0.02 })
  brilho(c, mestre, t + 0.5, 0.9, 0.07)
}
