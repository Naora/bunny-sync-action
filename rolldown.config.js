import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: {
    format: 'es',
    file: 'dist/index.js',
  },
});
