export function normalizeProxyPayloadArgs(
  args: Record<string, unknown>,
): string | undefined;

export function resolveProxyPayloadArgs(args: Record<string, unknown>): {
  payload: string | undefined;
  warnings: string[];
};
