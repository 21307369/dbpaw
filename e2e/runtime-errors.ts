import type { Page } from "@playwright/test";

const IGNORED_CONSOLE_PATTERNS = [/Download the React DevTools/i, /\[vite\]/i];

export function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;

    const text = message.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) {
      return;
    }

    errors.push(`console.error: ${text}`);
  });

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    errors.push(
      `requestfailed: ${request.method()} ${request.url()} ${failure?.errorText ?? ""}`.trim(),
    );
  });

  return {
    assertClean(label: string) {
      if (errors.length > 0) {
        throw new Error(`${label}\n${errors.join("\n")}`);
      }
    },
  };
}
