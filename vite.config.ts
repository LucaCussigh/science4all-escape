import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/science4all-escape/', // <--- AGGIUNGI QUESTA RIGA (sostituisci "accademia-suricati" con il nome esatto del tuo repo)
})