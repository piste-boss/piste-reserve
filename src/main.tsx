import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LP from './LP.tsx'

const isLP = window.location.pathname === '/lp' || window.location.search.includes('lp=true');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLP ? <LP /> : <App />}
  </StrictMode>,
)
