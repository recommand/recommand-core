import { PageTemplate } from "@core/components/page-template";
import { rc } from "@recommand/lib/client";
import type { ApiKeys } from "api/api-keys";
import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@core/components/data-table";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { Label } from "@core/components/ui/label";
import { toast } from "@core/components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import type { ApiKey } from "@core/data/api-keys";
import { useActiveTeam } from "@core/hooks/user";
import { Trash2, Loader2, Copy, ChevronDown, AlertCircle } from "lucide-react";
import { ColumnHeader } from "@core/components/data-table/column-header";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@core/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@core/components/ui/alert";
import { useTranslation } from "@core/hooks/use-translation";
import { useDataTableState } from "@core/hooks/use-data-table-state";
import { DataTablePagination } from "@core/components/data-table/pagination";

const client = rc<ApiKeys>("core");

export default function Page() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyType, setKeyType] = useState<"basic" | "jwt">("basic");
  const [expirationDuration, setExpirationDuration] = useState<string>("24");
  const [expirationUnit, setExpirationUnit] = useState<"hours" | "days">("hours");
  const [isLoading, setIsLoading] = useState(true);
  const [newKey, setNewKey] = useState<
    | { key: string; secret: string; type: "basic" }
    | { jwt: string; type: "jwt"; expiresAt: Date }
    | null
  >(null);
  const { paginationState, onPaginationChange, sortingState, onSortingChange } = useDataTableState({ tableId: "core-api-keys" });
  const [isCreationPermitted, setIsCreationPermitted] = useState<boolean | null>(null);
  const activeTeam = useActiveTeam();
  const { t } = useTranslation();

  const fetchApiKeys = useCallback(async () => {
    if (!activeTeam?.id) {
      setApiKeys([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await client[":teamId"]["api-keys"].$get({
        param: { teamId: activeTeam.id },
      });
      const json = await response.json();

      if (!json.success || !Array.isArray(json.apiKeys)) {
        console.error("Invalid API response format:", json);
        toast.error(t`Failed to load API keys`);
        setApiKeys([]);
      } else {
        setApiKeys(
          json.apiKeys.map((key) => ({
            ...key,
            createdAt: new Date(key.createdAt),
            updatedAt: new Date(key.updatedAt),
            expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
      toast.error(t`Failed to load API keys`);
      setApiKeys([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam?.id]);

  const checkCreationPermission = useCallback(async () => {
    if (!activeTeam?.id) {
      setIsCreationPermitted(false);
      return;
    }
    try {
      const response = await client[":teamId"]["api-keys"]["is-creation-permitted"].$get({
        param: { teamId: activeTeam.id },
      });
      const json = await response.json();
      setIsCreationPermitted(json.success && json.isPermitted);
    } catch (error) {
      console.error("Error checking API key creation permission:", error);
      setIsCreationPermitted(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    fetchApiKeys();
    checkCreationPermission();
  }, [fetchApiKeys, checkCreationPermission]);

  const isValidExpirationDuration = () => {
    if (keyType === "basic") return true;
    const trimmed = expirationDuration.trim();
    if (trimmed === "") return false;
    const num = parseInt(trimmed, 10);
    return !isNaN(num) && num > 0 && num.toString() === trimmed;
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam?.id || !newKeyName.trim()) {
      toast.error(t`Please enter a valid name for the API key`);
      return;
    }

    if (keyType === "jwt" && !isValidExpirationDuration()) {
      toast.error(t`Please enter a valid expiration duration`);
      return;
    }

    try {
      let expiresInSeconds: number | undefined;
      if (keyType === "jwt") {
        const durationNum = parseInt(expirationDuration.trim(), 10);
        const hoursPerUnit = {
          hours: 1,
          days: 24,
        };
        expiresInSeconds = durationNum * hoursPerUnit[expirationUnit] * 60 * 60;
      }

      const response = await client[":teamId"]["api-keys"].$post({
        param: { teamId: activeTeam.id },
        json: {
          name: newKeyName,
          type: keyType,
          expiresInSeconds,
        },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error(
          "Could not create API key: " + stringifyActionFailure(json.errors)
        );
      }

      const newApiKey = {
        id: json.apiKey.id,
        name: json.apiKey.name,
        teamId: json.apiKey.teamId,
        userId: json.apiKey.userId,
        secretHash: json.apiKey.secretHash,
        type: json.apiKey.type,
        expiresAt: json.apiKey.expiresAt
          ? new Date(json.apiKey.expiresAt)
          : null,
        createdAt: new Date(json.apiKey.createdAt),
        updatedAt: new Date(json.apiKey.updatedAt),
      };
      setApiKeys((prev) => [...prev, newApiKey]);
      setNewKeyName("");
      if (keyType === "basic" && "secret" in json.apiKey) {
        setNewKey({
          key: json.apiKey.id,
          secret: json.apiKey.secret,
          type: "basic",
        });
      } else if (keyType === "jwt" && "jwt" in json.apiKey && json.apiKey.expiresAt) {
        setNewKey({
          jwt: json.apiKey.jwt,
          type: "jwt",
          expiresAt: new Date(json.apiKey.expiresAt),
        });
      }
      toast.success(t`API key created successfully`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const columns: ColumnDef<ApiKey>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title={t`Name`} />,
      cell: ({ row }) => (row.getValue("name") as string) ?? "N/A",
    },
    {
      accessorKey: "type",
      header: ({ column }) => <ColumnHeader column={column} title={t`Type`} />,
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <span className="uppercase font-mono text-xs">
            {type === "jwt" ? "JWT" : "Basic"}
          </span>
        );
      },
    },
    {
      accessorKey: "id",
      header: ({ column }) => <ColumnHeader column={column} title={t`API Key`} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <pre className="font-mono">{row.getValue("id") as string}</pre>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(row.getValue("id") as string);
              toast.success(t`API Key copied to clipboard`);
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: ({ column }) => (
        <ColumnHeader column={column} title={t`Expires At`} />
      ),
      cell: ({ row }) => {
        const expiresAt = row.getValue("expiresAt") as Date | null;
        if (!expiresAt) return t`Never`;
        const isExpired = new Date(expiresAt) < new Date();
        return (
          <span className={isExpired ? "text-destructive font-medium" : ""}>
            {new Date(expiresAt).toLocaleString()}
          </span>
        );
      },
      sortingFn: "datetime",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <ColumnHeader column={column} title={t`Created At`} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as string;
        return date ? new Date(date).toLocaleDateString() : "N/A";
      },
      sortingFn: "datetime",
    },
    {
      id: "actions",
      header: "",
      size: 100,
      cell: ({ row }) => {
        const id = row.getValue("id") as string;
        if (!id) return null;

        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!activeTeam?.id) return;

                client[":teamId"]["api-keys"][":apiKeyId"]
                  .$delete({
                    param: {
                      teamId: activeTeam.id,
                      apiKeyId: id,
                    },
                  })
                  .then(async (res: Response) => {
                    const json = await res.json();
                    if (json.success) {
                      toast.success(t`API key deleted successfully`);
                      fetchApiKeys();
                    } else {
                      toast.error(stringifyActionFailure(json.errors));
                    }
                  })
                  .catch((error) => {
                    console.error("Error deleting API key:", error);
                    toast.error(t`Failed to delete API key`);
                  });
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: apiKeys,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: onSortingChange,
    onPaginationChange: onPaginationChange,
    autoResetPageIndex: false,
    state: {
      sorting: sortingState,
      pagination: paginationState,
    },
  });

  return (
    <PageTemplate
      breadcrumbs={[{ label: t`User Settings` }, { label: t`API Keys` }]}
    >
      <div className="space-y-6">
        {isCreationPermitted === false ? (
          <Alert variant="default" className="max-w-2xl">
            <AlertCircle />
            <AlertTitle>{t`API Key Creation Not Available`}</AlertTitle>
            <AlertDescription>
              {t`API key creation is currently restricted for security reasons. When the JWT-based token flow with assertion is enabled, keys can only be created via the API using a signed JWT assertion. Contact support if you have any questions.`}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                placeholder={t`New API Key Name`}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateKey(e);
                  }
                }}
              />
              <Select
                value={keyType}
                onValueChange={(value: "basic" | "jwt") => setKeyType(value)}
              >
                <SelectTrigger id="key-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">{t`Basic Authentication`}</SelectItem>
                  <SelectItem value="jwt">{t`JWT Token`}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleCreateKey}
                disabled={
                  !activeTeam?.id ||
                  !newKeyName.trim() ||
                  (keyType === "jwt" && !isValidExpirationDuration())
                }
              >
                {t`Create API Key`}
              </Button>
            </div>
            {keyType === "jwt" && (
              <div className="space-y-2">
                <Label htmlFor="expiration-duration">{t`API Key Expiration in`}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="expiration-duration"
                    type="text"
                    value={expirationDuration}
                    onChange={(e) => setExpirationDuration(e.target.value)}
                    placeholder="24"
                    className="max-w-xs"
                  />
                  <Select
                    value={expirationUnit}
                    onValueChange={(value: "hours" | "days") =>
                      setExpirationUnit(value)
                    }
                  >
                    <SelectTrigger id="expiration-unit" className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">{t`Hours`}</SelectItem>
                      <SelectItem value="days">{t`Days`}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="rounded-lg border p-4 space-y-4 max-w-2xl bg-muted">
          <div className="space-y-2">
            <h3 className="font-medium">{t`Team ID`}</h3>
            <p className="text-sm text-muted-foreground">
              {t`This is your unique team identifier`} (
              <code className="font-mono">teamId</code>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={activeTeam?.id ?? ""}
              readOnly
              className="font-mono"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (activeTeam?.id) {
                  navigator.clipboard.writeText(activeTeam.id);
                  toast.success(t`Team ID copied to clipboard`);
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {newKey && (
          <div className="rounded-lg border p-4 space-y-4 max-w-2xl bg-muted">
            <div className="space-y-2">
              <h3 className="font-medium">{t`New API Key Created`}</h3>
              <p className="text-sm text-muted-foreground">
                {t`Please save these credentials. They will only be shown once.`}
              </p>
            </div>
            <div className="space-y-2">
              {newKey.type === "basic" ? (
                <>
                  <div>
                    <label className="text-sm font-medium">{t`API Key`}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newKey.key}
                        readOnly
                        className="font-mono"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(newKey.key);
                          toast.success(t`API Key copied to clipboard`);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t`Secret`}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newKey.secret}
                        readOnly
                        className="font-mono"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(newKey.secret);
                          toast.success(t`Secret copied to clipboard`);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full font-normal [&[data-state=open]>svg]:rotate-180"
                      >
                        <label className="text-sm font-medium">
                          {t`View Authorization Header`}
                        </label>
                        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-2">
                        <label className="text-sm font-medium">
                          {t`Authorization Header`}
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            value={`Authorization: Basic ${btoa(`${newKey.key}:${newKey.secret}`)}`}
                            readOnly
                            className="font-mono"
                          />
                          <Button
                            variant="outline"
                            onClick={() => {
                              const authHeader = `Authorization: Basic ${btoa(`${newKey.key}:${newKey.secret}`)}`;
                              navigator.clipboard.writeText(authHeader);
                              toast.success(
                                t`Authorization header copied to clipboard`
                              );
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium">{t`JWT Token`}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newKey.jwt}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(newKey.jwt);
                          toast.success(t`JWT token copied to clipboard`);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t`Expires At`}</label>
                    <Input
                      value={newKey.expiresAt.toLocaleString()}
                      readOnly
                      className="font-mono"
                    />
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full font-normal [&[data-state=open]>svg]:rotate-180"
                      >
                        <label className="text-sm font-medium">
                          {t`View Authorization Header`}
                        </label>
                        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-2">
                        <label className="text-sm font-medium">
                          {t`Authorization Header`}
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            value={`Authorization: Bearer ${newKey.jwt}`}
                            readOnly
                            className="font-mono"
                          />
                          <Button
                            variant="outline"
                            onClick={() => {
                              const authHeader = `Authorization: Bearer ${newKey.jwt}`;
                              navigator.clipboard.writeText(authHeader);
                              toast.success(
                                t`Authorization header copied to clipboard`
                              );
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setNewKey(null)}>
              {t`Close`}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DataTable columns={columns} table={table} />
            <DataTablePagination table={table} />
          </>
        )}
      </div>
    </PageTemplate>
  );
}
