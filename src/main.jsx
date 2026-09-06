import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installChunkReloadHandler } from './lib/chunkReload';

// Self-heal: if a stale/old-tab browser fails to load a lazy chunk after a deploy,
// reload once to fetch the fresh (no-cache) index instead of crashing.
installChunkReloadHandler();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
