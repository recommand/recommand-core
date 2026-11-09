import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { OAuthAuthorize } from "@core/api/oauth/authorize";
import { PermissionChecklist } from "@core/components/api-keys/permission-checklist";
import { AsyncButton } from "@core/components/async-button";
import { Alert, AlertDescription, AlertTitle } from "@core/components/ui/alert";
import { Badge } from "@core/components/ui/badge";
import { Button } from "@core/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@core/components/ui/card";
import { Label } from "@core/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@core/components/ui/radio-group";
import { Skeleton } from "@core/components/ui/skeleton";
import { toast } from "@core/components/ui/sonner";
import { useTranslation } from "@core/hooks/use-translation";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";

const client = rc<OAuthAuthorize>("core");

type Consent = {
  client: { host: string | null; name: string | null; uri: string | null };
  isLoopbackRedirect: boolean;
  permissions: { delegation: string; description: string | null; id: string; name: string; resource: string | null }[];
  redirectHost: string;
  teams: { id: string; name: string; permissionIds: string[] }[];
};

type Parameters = Record<string, string | string[]>;

// The request exactly as the client sent it; `resource` can be repeated
const readParameters = (searchParams: URLSearchParams): Parameters => {
  const resources = searchParams.getAll("resource");

  return {
    ...Object.fromEntries([...searchParams].filter(([name]) => name !== "resource")),
    ...(resources.length > 0 ? { resource: resources } : {}),
  };
};

const AuthorizePage: FunctionComponent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An error to tell the client about, after the user chose to go back to it
  const [errorRedirect, setErrorRedirect] = useState<URL | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { t } = useTranslation();
  const parameters = useMemo(() => readParameters(searchParams), [searchParams]);

  // Choosing a team ticks what the app can get there, except what the user grants deliberately
  const chooseTeam = (choice: Consent["teams"][number] | null, permissions: Consent["permissions"]) => {
    setTeamId(choice?.id ?? null);
    setSelectedIds(
      permissions
        .filter((permission) => choice?.permissionIds.includes(permission.id) && permission.delegation !== "opt_in")
        .map((permission) => permission.id)
    );
  };

  useEffect(() => {
    const load = async () => {
      const response = await client.oauth.authorize.$get({ query: parameters });
      const data = await response.json();
      if (response.status === 401) {
        // Only someone signed in to the dashboard can consent
        navigate(`/login?${new URLSearchParams({ returnTo: `${window.location.pathname}${window.location.search}` })}`);

        return;
      }
      if (!data.success) {
        setError(stringifyActionFailure(data.errors));

        return;
      }
      // Anyone can register a client with any redirect URI, so it isn't followed without the user (RFC 9700, section 4.11.2)
      if (data.redirectTo) {
        setErrorRedirect(new URL(data.redirectTo));

        return;
      }
      setConsent(data.consent);
      if (data.consent) {
        chooseTeam(data.consent.teams.find((team) => team.permissionIds.length > 0) ?? null, data.consent.permissions);
      }
    };
    load().catch(() => setError(t`An unexpected error occurred`));
  }, [parameters]);

  const decide = async (decision: string | null) => {
    const response = await client.oauth.authorize.$post({
      json: { parameters, permissionIds: decision ? selectedIds : undefined, teamId: decision },
    });
    const data = await response.json();
    if (!data.success) {
      toast.error(stringifyActionFailure(data.errors));

      return;
    }
    window.location.assign(data.redirectTo);
  };

  const team = consent?.teams.find((choice) => choice.id === teamId) ?? null;
  // The permissions the user grants deliberately, which start unticked
  const optInNames = (consent?.permissions ?? [])
    .filter((permission) => team?.permissionIds.includes(permission.id) && permission.delegation === "opt_in")
    .map((permission) => t(permission.name));
  const clientName = consent?.client.name ?? consent?.client.host ?? t`An app`;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-xl">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />

            <AlertTitle>{t`This request can't be handled`}</AlertTitle>

            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : errorRedirect ? (
          <Alert variant="destructive">
            <AlertTriangle />

            <AlertTitle>{t`This request can't be handled`}</AlertTitle>

            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{errorRedirect.searchParams.get("error_description") ?? errorRedirect.searchParams.get("error")}</span>

              <Button onClick={() => window.location.assign(errorRedirect.href)} variant="outline">
                {t`Back to ${errorRedirect.host}`}
              </Button>
            </AlertDescription>
          </Alert>
        ) : consent ? (
          <Card>
            <CardHeader>
              <div>
                <Badge variant="outline">{t`Unverified app`}</Badge>
              </div>

              <CardTitle className="text-2xl">{t`${clientName} wants access to a team`}</CardTitle>

              <CardDescription className="flex flex-col gap-1">
                {consent.client.host ? <span>{t`Identified by ${consent.client.host}`}</span> : null}

                <span>{t`You'll be sent back to ${consent.redirectHost}`}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              {consent.isLoopbackRedirect ? (
                <Alert>
                  <AlertTriangle />

                  <AlertTitle>{t`Only continue if you started this yourself`}</AlertTitle>

                  <AlertDescription>
                    {t`This app returns to a program on your own computer. Any program can claim to be this app.`}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium leading-none" id="consent-teams">
                  {t`Team`}
                </span>

                {consent.teams.length > 0 ? (
                  <RadioGroup
                    aria-labelledby="consent-teams"
                    onValueChange={(value) => chooseTeam(consent.teams.find((choice) => choice.id === value) ?? null, consent.permissions)}
                    value={teamId ?? undefined}
                  >
                    {consent.teams.map((choice) => (
                      <div className="flex items-center gap-2" key={choice.id}>
                        <RadioGroupItem
                          disabled={choice.permissionIds.length === 0}
                          id={`team-${choice.id}`}
                          value={choice.id}
                        />

                        <Label className="font-normal" htmlFor={`team-${choice.id}`}>
                          {choice.name}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-muted-foreground">{t`You're not a member of any team.`}</p>
                )}
              </div>

              {team ? (
                <div aria-labelledby="consent-permissions" className="flex flex-col gap-3" role="group">
                  <span className="text-sm font-medium leading-none" id="consent-permissions">
                    {t`Choose what ${clientName} can do`}
                  </span>

                  {optInNames.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t`These start unticked, so ${clientName} only gets them if you choose to: ${optInNames.join(", ")}.`}
                    </p>
                  ) : null}
                  <PermissionChecklist
                    idPrefix={`consent-${team.id}`}
                    onChange={setSelectedIds}
                    permissions={consent.permissions
                      .filter((permission) => team.permissionIds.includes(permission.id))
                      .map(({ description, id, name, resource }) => ({
                        description: description ?? undefined,
                        id,
                        name,
                        resource: resource ?? undefined,
                      }))}
                    selectedIds={selectedIds}
                  />
                </div>
              ) : null}
            </CardContent>

            <CardFooter className="flex justify-end gap-2">
              <AsyncButton onClick={() => decide(null)} variant="outline">
                {t`Cancel`}
              </AsyncButton>

              <AsyncButton disabled={!team || selectedIds.length === 0} onClick={() => decide(team!.id)}>
                {t`Allow`}
              </AsyncButton>
            </CardFooter>
          </Card>
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </div>
    </div>
  );
};

export default AuthorizePage;
