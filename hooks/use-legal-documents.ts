import { useState, useEffect } from "react";
import { rc } from "@recommand/lib/client";
import type { Manifest } from "@core/api/manifest";

const client = rc<Manifest>("core");

export function useLegalDocuments() {
  const [termsOfUseUrls, setTermsOfUseUrls] = useState<string[]>([]);
  const [privacyPolicyUrls, setPrivacyPolicyUrls] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const res = await client.manifest.$get();
        const data = await res.json();
        if (!cancelled && data.success) {
          setTermsOfUseUrls(
            data.legal
              .filter((d) => !!d.termsOfUse)
              .map((d) => d.termsOfUse!)
          );
          setPrivacyPolicyUrls(
            data.legal
              .filter((d) => !!d.privacyPolicy)
              .map((d) => d.privacyPolicy!)
          );
        }
      } catch {
        // Silently fail — checkbox won't appear
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasTermsOfUse = termsOfUseUrls.length > 0;
  const hasPrivacyPolicy = privacyPolicyUrls.length > 0;
  const hasLegalDocuments = hasTermsOfUse || hasPrivacyPolicy;

  return {
    isLoaded,
    hasLegalDocuments,
    hasTermsOfUse,
    hasPrivacyPolicy,
    termsOfUseUrls,
    privacyPolicyUrls,
  };
}
