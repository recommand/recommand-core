import { useState, useEffect } from "react";
import { rc } from "@recommand/lib/client";
import type { Manifest, ManifestData } from "@core/api/manifest";

const client = rc<Manifest>("core");

// The manifest is static public configuration, so it is fetched at most once
// per page load and shared between every hook instance.
let manifestPromise: Promise<ManifestData | null> | null = null;
let cachedManifest: ManifestData | null = null;

function loadManifest(): Promise<ManifestData | null> {
  if (!manifestPromise) {
    manifestPromise = client.manifest
      .$get()
      .then(async (res) => {
        const data = await res.json();
        if (!data.success) return null;
        cachedManifest = { legal: data.legal, publicSignupEnabled: data.publicSignupEnabled };
        return cachedManifest;
      })
      .catch(() => {
        // Allow a retry on the next mount instead of caching the failure
        manifestPromise = null;
        return null;
      });
  }
  return manifestPromise;
}

/**
 * Loads the public app manifest (GET /api/core/manifest): per-package legal
 * document URLs and public configuration such as whether signup is enabled.
 */
export function useManifest() {
  const [manifest, setManifest] = useState<ManifestData | null>(cachedManifest);
  const [isLoaded, setIsLoaded] = useState(cachedManifest !== null);

  useEffect(() => {
    if (cachedManifest) return;
    let cancelled = false;

    loadManifest().then((result) => {
      if (cancelled) return;
      setManifest(result);
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, isLoaded };
}

export function usePublicSignupEnabled() {
  const { manifest, isLoaded } = useManifest();
  return { publicSignupEnabled: manifest?.publicSignupEnabled ?? true, isLoaded };
}
