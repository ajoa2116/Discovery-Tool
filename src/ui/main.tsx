import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ApplicationErrorBoundary } from './components/ApplicationErrorBoundary.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApplicationErrorBoundary><App /></ApplicationErrorBoundary>
  </React.StrictMode>
);
