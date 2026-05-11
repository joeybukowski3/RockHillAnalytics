import { loadEnv } from "../lib/env.js";

loadEnv();

function encodeActorId(actorId: string): string {
  return actorId.replace("/", "~");
}

export function getApifyToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Missing APIFY_TOKEN. Add it to .env.local before running Apify-backed enrichment scripts."
    );
  }

  return token;
}

async function fetchApifyJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getApifyToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify request failed with ${response.status} ${response.statusText}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function runApifyActor(actorId: string, input: unknown): Promise<{
  defaultDatasetId: string;
  runId: string;
}> {
  const encodedActorId = encodeActorId(actorId);
  const payload = await fetchApifyJson<{
    data?: {
      id?: string;
      defaultDatasetId?: string;
      status?: string;
    };
  }>(`https://api.apify.com/v2/acts/${encodedActorId}/runs?waitForFinish=300`, {
    method: "POST",
    body: JSON.stringify(input)
  });

  const runId = payload.data?.id;
  const defaultDatasetId = payload.data?.defaultDatasetId;

  if (!runId || !defaultDatasetId) {
    throw new Error(`Apify actor ${actorId} did not return a run ID and default dataset ID.`);
  }

  return {
    runId,
    defaultDatasetId
  };
}

export async function fetchApifyDatasetItems<T = unknown>(datasetId: string): Promise<T[]> {
  return fetchApifyJson<T[]>(
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`
  );
}
