// makeclient hosts a CIMD document and, for private_key_jwt, mints the keypair —
// returning the private key (the one thing a static SPA can't self-host).
// Host overridable with VITE_MAKECLIENT_URL.

export const MAKECLIENT_URL = (
  import.meta.env.VITE_MAKECLIENT_URL ?? "https://makeclient.vercel.app"
).replace(/\/+$/, "");

export interface ConfidentialClient {
  clientId: string;
  privateJwk: Record<string, unknown>;
}

/** Create a confidential (private_key_jwt) CIMD client. The redirect_uri must be
 * this playground's callback so the hosted document accepts it. */
export async function createConfidentialClient(
  redirectUri: string,
): Promise<ConfidentialClient> {
  const res = await fetch(`${MAKECLIENT_URL}/api/clients`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token_endpoint_auth_method: "private_key_jwt",
      redirect_uris: [redirectUri],
    }),
  });
  if (!res.ok) {
    throw new Error(`makeclient returned ${res.status} from /api/clients.`);
  }
  const data = (await res.json()) as {
    client_id?: string;
    private_key?: Record<string, unknown>;
  };
  if (!data.client_id || !data.private_key) {
    throw new Error("makeclient response is missing client_id or private_key.");
  }
  return { clientId: data.client_id, privateJwk: data.private_key };
}
