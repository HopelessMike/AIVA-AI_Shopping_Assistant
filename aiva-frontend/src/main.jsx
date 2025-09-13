// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Import polyfills first
import './polyfills.js'

// usa StrictMode solo in dev
const Root = import.meta.env.DEV ? React.StrictMode : React.Fragment

ReactDOM.createRoot(document.getElementById('root')).render(
  <Root>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Root>,
)