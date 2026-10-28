import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ReadinessApp from './readiness/ReadinessApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('view')?.startsWith('readiness') ? <ReadinessApp /> : <App />}
  </React.StrictMode>
);
