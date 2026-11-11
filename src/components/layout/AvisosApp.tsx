import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, WifiOff } from 'lucide-react'

import { registrarErro } from '../../lib/erros'

/** Faixas fixas: sem conexão e nova versão do aplicativo disponível. */
export function AvisosApp() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const ligar = () => setOnline(true)
    const desligar = () => setOnline(false)
    window.addEventListener('online', ligar)
    window.addEventListener('offline', desligar)
    return () => {
      window.removeEventListener('online', ligar)
      window.removeEventListener('offline', desligar)
    }
  }, [])

  const {
    needRefresh: [novaVersao, setNovaVersao],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Procura atualização a cada hora enquanto o app fica aberto.
      if (registro) window.setInterval(() => void registro.update(), 60 * 60 * 1000)
    },
    onRegisterError(erro) {
      registrarErro(erro, 'service worker')
    },
  })

  return (
    <div className="avisos-app" aria-live="polite">
      {!online && (
        <div className="aviso-app aviso-offline" role="status">
          <WifiOff size={18} aria-hidden />
          Sem conexão. As alterações não serão salvas até a internet voltar.
        </div>
      )}
      {novaVersao && (
        <div className="aviso-app aviso-versao" role="status">
          <RefreshCw size={18} aria-hidden />
          Nova versão disponível.
          <button type="button" className="botao botao-primario botao-pequeno" onClick={() => void updateServiceWorker(true)}>
            Atualizar
          </button>
          <button type="button" className="botao-link" onClick={() => setNovaVersao(false)}>
            Depois
          </button>
        </div>
      )}
    </div>
  )
}
