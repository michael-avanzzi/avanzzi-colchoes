import { supabase } from './supabase'

const BUCKET = 'avatares'
const TAMANHO = 256

/** Endereço público da foto (null quando o usuário não tem foto). */
export function urlDaFoto(path: string | null | undefined) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Recorta a imagem no centro (quadrado) e reduz para 256 px em WebP.
 * A foto original do celular (vários MB) nunca sai do aparelho.
 */
export async function prepararFoto(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  if (arquivo.size > 15 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 15 MB).')

  const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  const lado = Math.min(imagem.width, imagem.height)
  const canvas = document.createElement('canvas')
  canvas.width = TAMANHO
  canvas.height = TAMANHO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    imagem,
    (imagem.width - lado) / 2,
    (imagem.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    TAMANHO,
    TAMANHO,
  )
  imagem.close()

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85))
  if (!blob) throw new Error('Não foi possível processar a imagem.')
  return blob
}

/** Envia a nova foto, grava no perfil e apaga a anterior. Devolve o novo caminho. */
export async function trocarFoto(perfilId: string, arquivo: File, caminhoAnterior: string | null) {
  const blob = await prepararFoto(arquivo)
  const caminho = `${perfilId}/${Date.now()}.webp`

  const { error: envio } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false })
  if (envio) throw envio

  const { error } = await supabase.rpc('rpc_definir_foto', { p_perfil_id: perfilId, p_path: caminho })
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho])
    throw error
  }

  if (caminhoAnterior) await supabase.storage.from(BUCKET).remove([caminhoAnterior])
  return caminho
}

export async function removerFoto(perfilId: string, caminhoAtual: string | null) {
  const { error } = await supabase.rpc('rpc_definir_foto', { p_perfil_id: perfilId, p_path: null })
  if (error) throw error
  if (caminhoAtual) await supabase.storage.from(BUCKET).remove([caminhoAtual])
}
