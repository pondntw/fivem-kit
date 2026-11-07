import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isBrowser } from './nui';
import './styles.css';

if (isBrowser) {
  // Browser preview: show a background and fake the Lua side.
  document.body.classList.add('browser');
  void import('./browser-mock');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
