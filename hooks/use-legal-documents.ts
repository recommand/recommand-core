import { useManifest } from "@core/hooks/use-manifest";

export function useLegalDocuments() {
  const { manifest, isLoaded } = useManifest();
  const legal = manifest?.legal ?? [];

  const termsOfUseUrls = legal.filter((d) => !!d.termsOfUse).map((d) => d.termsOfUse!);
  const privacyPolicyUrls = legal.filter((d) => !!d.privacyPolicy).map((d) => d.privacyPolicy!);

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
