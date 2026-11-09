import { Checkbox } from "@core/components/ui/checkbox";
import { Label } from "@core/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@core/components/ui/tooltip";
import { useTranslation } from "@core/hooks/use-translation";
import { Loader2 } from "lucide-react";
import type { FunctionComponent } from "react";

export type KeyPermission = { description?: string; id: string; name: string; resource?: string };

type Props = {
  disabled?: boolean;
  idPrefix: string;
  onChange: (permissionIds: string[]) => void;
  pendingIds?: string[];
  permissions: KeyPermission[];
  selectedIds: string[];
};

// Within a resource, reading comes first, then changing, the other actions, and deleting last
const actionRank = (permissionId: string) => {
  const action = permissionId.slice(permissionId.lastIndexOf(".") + 1);

  return { delete: 3, read: 0, write: 1 }[action] ?? 2;
};

/** The permissions a key or member can hold, as checkboxes grouped per resource. */
export const PermissionChecklist: FunctionComponent<Props> = ({
  disabled = false,
  idPrefix,
  onChange,
  pendingIds = [],
  permissions,
  selectedIds,
}) => {
  const { t, language } = useTranslation();

  if (permissions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t`No permissions are available to manage.`}</p>;
  }

  // Alphabetical by name in the user's language, with permissions without a resource last
  const resourceName = (resource: string) => (resource ? t(resource) : t`Other`);
  const resources = [...new Set(permissions.map((permission) => permission.resource ?? ""))].toSorted(
    (a, b) => Number(a === "") - Number(b === "") || resourceName(a).localeCompare(resourceName(b), language)
  );

  return (
    <div className="space-y-5">
      {resources.map((resource) => {
        const group = permissions
          .filter((permission) => (permission.resource ?? "") === resource)
          .toSorted((a, b) => actionRank(a.id) - actionRank(b.id));
        const groupIds = group.map((permission) => permission.id);
        const selectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
        const allSelected = selectedCount === groupIds.length;
        const resourceId = `${idPrefix}-${resource || "other"}`;

        return (
          <div className="space-y-2" key={resource}>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                disabled={disabled}
                id={resourceId}
                onCheckedChange={() =>
                  onChange(
                    allSelected
                      ? selectedIds.filter((id) => !groupIds.includes(id))
                      : [...new Set([...selectedIds, ...groupIds])]
                  )
                }
              />

              <Label className="text-sm font-semibold cursor-pointer" htmlFor={resourceId}>
                {resourceName(resource)}
              </Label>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 pl-6">
              {group.map((permission) => {
                const checked = selectedIds.includes(permission.id);
                const id = `${idPrefix}-${permission.id}`;
                const label = (
                  <Label className="text-sm font-normal cursor-pointer" htmlFor={id}>
                    {t(permission.name)}
                  </Label>
                );

                return (
                  <div className="flex items-center gap-2" key={permission.id}>
                    {pendingIds.includes(permission.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        id={id}
                        onCheckedChange={() =>
                          onChange(checked ? selectedIds.filter((selected) => selected !== permission.id) : [...selectedIds, permission.id])
                        }
                      />
                    )}

                    {permission.description ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{label}</TooltipTrigger>

                        <TooltipContent>{t(permission.description)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      label
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
