import { defineConfig } from 'vitest/config';
import { vitestExecArgv } from './vitest.shared.ts';

export default defineConfig({
  test: {
    execArgv: vitestExecArgv,
    include: ['scripts/__tests__/**/*.test.mjs', 'skills/__tests__/**/*.test.{ts,mjs}'],
  },
});
