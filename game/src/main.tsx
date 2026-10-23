import '@fontsource/roboto-condensed/cyrillic-400.css'
import '@fontsource/roboto-condensed/latin-400.css'
import '@fontsource/roboto-condensed/cyrillic-700.css'
import '@fontsource/roboto-condensed/latin-700.css'
import '@fontsource/roboto-condensed/cyrillic-800.css'
import '@fontsource/roboto-condensed/latin-800.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
