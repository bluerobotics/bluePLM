import './app/pinBackend'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applySavedTheme } from './features/account/theme'
import './index.css'

applySavedTheme()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
