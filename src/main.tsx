import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { game } from './engine/game';

// handy for debugging / automated tests in development
if (import.meta.env.DEV) (window as unknown as { game: typeof game }).game = game;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
