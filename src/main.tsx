import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {LanguageProvider} from './i18n.tsx';

const root=document.getElementById('root');
if(!root)throw new Error('CivicGuardian root element is missing from index.html.');

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
