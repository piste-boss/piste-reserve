11import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LP from './LP.tsx'
import AdminDashboard from './components/AdminDashboard.tsx'

const path = window.location.pathname;
const isLP = path === '/lp' || window.location.search.includes('lp=true');
const isAdmin = path === '/admin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? <AdminDashboard /> : (isLP ? <LP /> : <App />)}
  </StrictMode>,
)
