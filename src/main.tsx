import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { ErrorBoundary } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outer boundary: App's own inner boundary can't catch errors thrown by App itself. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
