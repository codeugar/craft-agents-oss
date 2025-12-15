import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Verify electronAPI is available
if (!window.electronAPI) {
  console.error('electronAPI not available')
  document.getElementById('root')!.innerHTML = `
    <div style="padding: 40px; color: #ef4444; font-family: system-ui; background: #1a1a1a; height: 100vh;">
      <h1>Error: Electron API not available</h1>
      <p>The preload script may not have loaded correctly.</p>
    </div>
  `
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
