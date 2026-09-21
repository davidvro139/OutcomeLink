import { decryptSecret } from "./secrets";

/**
 * A thin client for Microsoft Dataverse's OData Web API (used by Dynamics
 * 365/Power Platform apps, including OneWorld SIS) — Azure AD client-
 * credentials OAuth2 for a token, then a standard OData GET against the
 * configured entity set, paginated via `@odata.nextLink`.
 *
 * This is built against Microsoft's published, versioned public API
 * contracts (Azure AD v2 token endpoint, Dataverse Web API v9.2), which are
 * stable regardless of what any particular Dataverse-based product puts in
 * its own tables — but this app has no live Dataverse/OneWorld tenant to
 * test against, so it has only ever been exercised against mocked HTTP
 * responses shaped like those documented contracts, never a real
 * environment. The first real use against an actual tenant should expect to
 * need debugging, most likely around the connection's `entityLogicalName`
 * and column names actually existing as configured.
 */

export interface DataverseConnectionConfig {
  environmentUrl: string;
  tenantId: string;
  clientId: string;
  clientSecretEncrypted: string;
  entityLogicalName: string;
}

export class DataverseError extends Error {}

function normalizeEnvironmentUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function getAccessToken(config: DataverseConnectionConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: decryptSecret(config.clientSecretEncrypted),
    scope: `${normalizeEnvironmentUrl(config.environmentUrl)}/.default`,
  });

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    throw new DataverseError(`Could not reach Azure AD token endpoint: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DataverseError(`Azure AD authentication failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new DataverseError("Azure AD token response had no access_token");
  return json.access_token;
}

/** Dataverse's OData JSON values for non-string fields (dates, lookups, money) all coerce cleanly through String(). */
function odataValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function isODataMetadataKey(key: string): boolean {
  return key.startsWith("@odata") || key.startsWith("@Microsoft") || key.startsWith("_");
}

/**
 * Fetches every row of the configured entity set, following pagination, and
 * flattens it into the same {headers, rows} shape parseCsv()/readXlsxRows()
 * produce — so everything downstream (mapping, validate, preview, commit)
 * treats a live Dataverse pull exactly like an uploaded file, including
 * reusing the file-based import pipeline's own column-mapping UI.
 *
 * Excludes Dataverse's own metadata/lookup-shadow columns (`@odata.*` and
 * `_fieldname_value` lookup columns) from the header set — a real
 * institution mapping this entity's columns has no use for Dataverse's
 * internal bookkeeping fields, only its real business columns.
 */
export async function fetchEntityRows(
  config: DataverseConnectionConfig,
  options: { top?: number } = {},
): Promise<{ headers: string[]; rows: string[][] }> {
  const token = await getAccessToken(config);
  const baseUrl = `${normalizeEnvironmentUrl(config.environmentUrl)}/api/data/v9.2/${config.entityLogicalName}`;
  const query = options.top ? `?$top=${options.top}` : "";

  const records: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = `${baseUrl}${query}`;

  while (nextUrl) {
    let res: Response;
    try {
      res = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });
    } catch (err) {
      throw new DataverseError(`Could not reach Dataverse environment: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new DataverseError(`Dataverse request failed (${res.status}): ${detail.slice(0, 500)}`);
    }

    const json = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    records.push(...(json.value ?? []));
    nextUrl = options.top ? undefined : json["@odata.nextLink"];
  }

  const headerSet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!isODataMetadataKey(key)) headerSet.add(key);
    }
  }
  const headers = [...headerSet];
  const rows = records.map((record) => headers.map((h) => odataValueToString(record[h])));

  return { headers, rows };
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  sampleColumns?: string[];
}

/** Cheap connectivity + entity-existence check — fetches at most 1 row rather than the whole table. */
export async function testConnection(config: DataverseConnectionConfig): Promise<TestConnectionResult> {
  try {
    const { headers } = await fetchEntityRows(config, { top: 1 });
    return { success: true, sampleColumns: headers };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
