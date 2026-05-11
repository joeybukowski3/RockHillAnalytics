export function getApifyToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Missing APIFY_TOKEN. Add it to .env.local before running Apify-backed enrichment scripts."
    );
  }

  return token;
}

export async function runActorPlaceholder(actorName: string): Promise<void> {
  const token = getApifyToken();
  void token;

  // TODO: Implement public Facebook Page enrichment actor invocation.
  // TODO: Implement public Instagram profile enrichment actor invocation.
  // TODO: Implement Google Reviews actor fallback if needed later.
  console.log(`Apify placeholder invoked for actor: ${actorName}`);
}
