import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  COMPILED_CET4_BATCH_1_PASSAGES,
  COMPILED_DEMO_PASSAGES,
} from './corpus';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const defaultPassages = [
  ...COMPILED_CET4_BATCH_1_PASSAGES,
  ...COMPILED_DEMO_PASSAGES.filter((p) => p.tier === 'cet6-advanced'),
];

createRoot(rootElement).render(
  <StrictMode>
    <App passages={defaultPassages} />
  </StrictMode>
);

