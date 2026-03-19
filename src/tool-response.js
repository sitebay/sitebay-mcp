function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveWordpressTitle(result) {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.title === 'string') return normalizeText(result.title);
  if (result.title && typeof result.title === 'object') {
    if (typeof result.title.raw === 'string' && result.title.raw.trim()) {
      return normalizeText(result.title.raw);
    }
    if (typeof result.title.rendered === 'string' && result.title.rendered.trim()) {
      return normalizeText(result.title.rendered);
    }
  }
  return '';
}

function coerceFrontPageId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function compactWarnings(warnings) {
  return warnings.filter((warning) => typeof warning === 'string' && warning.trim().length > 0);
}

export function buildMachineEnvelope(envelope) {
  const {
    ok = true,
    http_status,
    result,
    warnings = [],
    request,
    semantic_checks,
  } = envelope;
  const structured = {
    ok,
    http_status,
    result,
    warnings: compactWarnings(warnings),
  };
  if (request !== undefined) structured.request = request;
  if (semantic_checks !== undefined) structured.semantic_checks = semantic_checks;
  return structured;
}

export function buildMachineToolResponse(envelope) {
  const structuredContent = buildMachineEnvelope(envelope);
  return {
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
  };
}

export function buildWordpressCreatePageEnvelope({ request, httpStatus, result, warnings = [] }) {
  const requestedStatus = normalizeText(request?.status).toLowerCase();
  const actualStatus = normalizeText(result?.status).toLowerCase();
  const requestedTitle = normalizeText(request?.title);
  const actualTitle = resolveWordpressTitle(result);

  const semantic_checks = {
    status_matches_request: requestedStatus ? actualStatus === requestedStatus : true,
    title_matches_request: requestedTitle ? actualTitle === requestedTitle : true,
  };

  const semanticWarnings = [...warnings];
  if (!semantic_checks.status_matches_request) {
    semanticWarnings.push(
      `requested status "${requestedStatus}" but WordPress returned "${actualStatus || 'unknown'}"`,
    );
  }
  if (!semantic_checks.title_matches_request) {
    semanticWarnings.push(
      `requested title "${requestedTitle}" but WordPress returned "${actualTitle || ''}"`,
    );
  }

  return buildMachineEnvelope({
    ok: Object.values(semantic_checks).every(Boolean),
    http_status: httpStatus,
    request,
    result,
    warnings: semanticWarnings,
    semantic_checks,
  });
}

export function buildWordpressSettingsEnvelope({ request, httpStatus, result, warnings = [] }) {
  const requestedShowOnFront = normalizeText(request?.show_on_front).toLowerCase();
  const actualShowOnFront = normalizeText(result?.show_on_front).toLowerCase();
  const requestedPageOnFront = coerceFrontPageId(request?.page_on_front);
  const actualPageOnFront = coerceFrontPageId(result?.page_on_front);

  const semantic_checks = {
    show_on_front_matches_request: requestedShowOnFront
      ? actualShowOnFront === requestedShowOnFront
      : true,
    page_on_front_matches_request:
      requestedPageOnFront !== null ? actualPageOnFront === requestedPageOnFront : true,
  };

  const semanticWarnings = [...warnings];
  if (!semantic_checks.show_on_front_matches_request) {
    semanticWarnings.push(
      `requested show_on_front "${requestedShowOnFront}" but WordPress returned "${actualShowOnFront || 'unknown'}"`,
    );
  }
  if (!semantic_checks.page_on_front_matches_request) {
    semanticWarnings.push(
      `requested page_on_front "${requestedPageOnFront}" but WordPress returned "${actualPageOnFront ?? 'unknown'}"`,
    );
  }

  return buildMachineEnvelope({
    ok: Object.values(semantic_checks).every(Boolean),
    http_status: httpStatus,
    request,
    result,
    warnings: semanticWarnings,
    semantic_checks,
  });
}
