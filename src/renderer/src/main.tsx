import React from 'react'
import ReactDOM from 'react-dom/client'
import './monaco-setup'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
