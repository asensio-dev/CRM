import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });

// Import dinámico: @testing-library necesita `document` ya registrado.
const { cleanup } = await import('@testing-library/react');
afterEach(() => cleanup());
