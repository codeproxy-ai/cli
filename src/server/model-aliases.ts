export function applyModelAliasesToBody(
  body: Buffer | undefined,
  modelAliases: Record<string, string> | undefined,
): Buffer | undefined {
  if (!body || !modelAliases || Object.keys(modelAliases).length === 0) {
    return body;
  }

  const parsed = parseJsonObject(body.toString('utf8'));
  if (!parsed || typeof parsed.model !== 'string') {
    return body;
  }

  const aliasedModel = modelAliases[parsed.model];
  if (!aliasedModel) {
    return body;
  }

  return Buffer.from(JSON.stringify({ ...parsed, model: aliasedModel }), 'utf8');
}

function parseJsonObject(str: string): Record<string, unknown> | null {
  // eslint-disable-next-line no-restricted-syntax -- request body parsing must tolerate invalid JSON
  try {
    const parsed: unknown = JSON.parse(str);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return Object.fromEntries(Object.entries(parsed));
  } catch {
    return null;
  }
}
