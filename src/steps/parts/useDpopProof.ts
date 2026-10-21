import { useEffect, useState } from "react";
import { createDpopProof } from "../../protocol/dpop";
import type { DpopState } from "../../types";

// Live-sign a real DPoP proof so the actual proof JWT shows in the request
// preview — re-signed with a fresh jti/iat at send time, the same way the
// jwt-bearer assertion and JAR request object are previewed. Returns null when
// DPoP is off, no key exists yet, or the endpoint isn't known.
export function useDpopProof(
  dpop: DpopState,
  htm: "POST" | "GET",
  htu: string | null | undefined,
): string | null {
  const [proof, setProof] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dpop.enabled || !dpop.privateJwk || !htu) {
        if (!cancelled) setProof(null);
        return;
      }
      try {
        const jwt = await createDpopProof({
          privateJwk: dpop.privateJwk,
          htm,
          htu,
          nonce: dpop.nonce,
        });
        if (!cancelled) setProof(jwt);
      } catch {
        if (!cancelled) setProof(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dpop.enabled, dpop.privateJwk, dpop.nonce, htm, htu]);
  return proof;
}
