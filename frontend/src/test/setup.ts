import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not enable globals here, so unmount rendered trees between tests explicitly.
afterEach(() => {
  cleanup();
});
