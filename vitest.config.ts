import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["proof/**/*.test.ts", "api/**/*.test.ts", "scripts/**/*.test.ts", "web/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
