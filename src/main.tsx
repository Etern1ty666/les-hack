import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts'
import './styles/global.css'
import { Root } from './App'
import { useAppStore } from './state/store'

// В dev-режиме стор доступен из консоли: useAppStore.getState().selectRegion('RU-IRK')
if (import.meta.env.DEV) Object.assign(window, { useAppStore })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
