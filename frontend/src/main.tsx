import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { applyInitialTheme } from './hooks/useTheme.js';
import './index.css';

// Apply persisted theme before React mounts to avoid a light-mode flash.
applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
