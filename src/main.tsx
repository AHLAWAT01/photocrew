import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/host-grotesk';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './index.css';

// StrictMode is intentionally omitted: its double-mounted effects would join and
// immediately leave the WebRTC room, causing a visible reconnect on startup.
createRoot(document.getElementById('root')!).render(<App />);
