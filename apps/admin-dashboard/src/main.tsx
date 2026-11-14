import React from 'react';
import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';

// Keep the public static demo separate from the gateway-connected console.
// Optional runtime imports prevent the demo from mounting API/socket effects.
const App =
  import.meta.env.VITE_FIDUSGATE_DEMO === 'true'
    ? lazy(() => import('./ReceiptConsole.tsx'))
    : lazy(() => import('./LiveConsole.tsx'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<p>Opening FidusGate…</p>}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
