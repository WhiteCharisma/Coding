import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { hasSignedInHint, preloadSignedInApp } from './app/preload';

// Returning users: start fetching the signed-in app while the session is being checked.
if (hasSignedInHint()) preloadSignedInApp();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
