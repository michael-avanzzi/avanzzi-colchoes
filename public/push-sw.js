/* Avanzzi Agendamentos — notificações push (importado pelo service worker gerado pelo Workbox). */

self.addEventListener('push', (evento) => {
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { body: evento.data ? evento.data.text() : '' }
  }

  const titulo = dados.title || 'Avanzzi Agendamentos'
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.body || '',
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      icon: '/icons/pwa-192.png',
      badge: '/icons/favicon-32.png',
      lang: 'pt-BR',
      data: { url: dados.url || '/' },
      requireInteraction: true,
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href

  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin) {
          await janela.focus()
          if ('navigate' in janela) await janela.navigate(destino)
          return
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
