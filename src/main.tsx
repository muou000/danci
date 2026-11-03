import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { COMPILED_DEMO_PASSAGES } from './corpus/compiled-demos';
import { COMPILED_CET4_BATCH_1_FIRST_PASSAGE } from './corpus/compiled-initial';
import { loadDefaultPassages } from './corpus/load-default-passages';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const initialPassages = [
  COMPILED_CET4_BATCH_1_FIRST_PASSAGE,
  ...COMPILED_DEMO_PASSAGES.filter((p) => p.tier === 'cet6-advanced'),
];

createRoot(rootElement).render(
  <StrictMode>
    <App passages={initialPassages} loadAllPassages={loadDefaultPassages} />
  </StrictMode>
);

