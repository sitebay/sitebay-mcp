export type MachineEnvelope = {
  ok: boolean;
  http_status: number;
  result: unknown;
  warnings: string[];
  request?: Record<string, unknown>;
  semantic_checks?: Record<string, unknown>;
};

export function buildMachineEnvelope(envelope: MachineEnvelope): MachineEnvelope;

export function buildMachineToolResponse(envelope: MachineEnvelope): {
  structuredContent: MachineEnvelope;
  content: Array<{ type: 'text'; text: string }>;
};

export function buildWordpressCreatePageEnvelope(opts: {
  request: Record<string, unknown>;
  httpStatus: number;
  result: any;
  warnings?: string[];
}): MachineEnvelope;

export function buildWordpressSettingsEnvelope(opts: {
  request: Record<string, unknown>;
  httpStatus: number;
  result: any;
  warnings?: string[];
}): MachineEnvelope;
