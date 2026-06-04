import { toast } from "sonner";

export interface ParsedError {
  code: number;
  message: string;
  hint?: string;
  category: 'connection' | 'query' | 'validation' | 'ai' | 'unsupported' | 'internal';
}

/**
 * Parse an AppError string into structured error data.
 * 
 * Expected format: [ERR-XXXX] message (hint)
 * 
 * @example
 * parseError('[ERR-1001] connection refused (check network)')
 * // { code: 1001, message: 'connection refused', hint: 'check network', category: 'connection' }
 */
export function parseError(error: string): ParsedError {
  const match = error.match(/\[ERR-(\d+)\]\s*(.+?)(?:\s*\((.+)\))?$/);
  if (!match) {
    return { code: 0, message: error, category: 'internal' };
  }

  const code = parseInt(match[1]);
  const message = match[2].trim();
  const hint = match[3]?.trim();

  return {
    code,
    message,
    hint,
    category: getErrorCategory(code),
  };
}

/**
 * Get error category from error code.
 */
function getErrorCategory(code: number): ParsedError['category'] {
  if (code >= 1000 && code < 2000) return 'connection';
  if (code >= 2000 && code < 3000) return 'query';
  if (code >= 3000 && code < 4000) return 'validation';
  if (code >= 4000 && code < 5000) return 'ai';
  if (code >= 5000 && code < 5100) return 'unsupported';
  return 'internal';
}

/**
 * Extract error message from unknown error value.
 * Use this in catch blocks instead of `e instanceof Error ? e.message : String(e)`.
 *
 * @example
 * try { ... } catch (e) { console.error(errorMessage(e)); }
 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Get user-friendly error message from error string.
 *
 * @example
 * getFriendlyErrorMessage('[ERR-1001] timeout (check network)')
 * // 'Connection failed: timeout. check network'
 */
export function getFriendlyErrorMessage(error: string): string {
  const parsed = parseError(error);

  switch (parsed.category) {
    case 'connection':
      return `Connection failed: ${parsed.message}${parsed.hint ? `. ${parsed.hint}` : ''}`;
    case 'query':
      return `Query failed: ${parsed.message}`;
    case 'validation':
      return `Validation error: ${parsed.message}`;
    case 'ai':
      return `AI error: ${parsed.message}`;
    case 'unsupported':
      return `Unsupported: ${parsed.message}`;
    default:
      return parsed.message;
  }
}

/**
 * Show a toast error with the translated title and extracted error description.
 *
 * @example
 * handleApiError(t("redis.key.loadFailed"), e);
 */
export function handleApiError(title: string, e: unknown): void {
  toast.error(title, { description: errorMessage(e) });
}
