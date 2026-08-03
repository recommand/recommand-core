import { Input } from "@core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import { wildcardEventType } from "./rule-constants";
import { useTranslation } from "@core/hooks/use-translation";
import type { EventTypeDto } from "./types";

type RulesFiltersProps = {
  globalFilter: string;
  eventTypeFilter: string;
  actionTypeFilter: string;
  statusFilter: string;
  eventTypes: EventTypeDto[];
  wildcardAvailable: boolean;
  onGlobalFilterChange: (value: string) => void;
  onEventTypeFilterChange: (value: string) => void;
  onActionTypeFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
};

export function RulesFilters({
  globalFilter,
  eventTypeFilter,
  actionTypeFilter,
  statusFilter,
  eventTypes,
  wildcardAvailable,
  onGlobalFilterChange,
  onEventTypeFilterChange,
  onActionTypeFilterChange,
  onStatusFilterChange,
}: RulesFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Input
        value={globalFilter}
        onChange={(event) => onGlobalFilterChange(event.target.value)}
        placeholder={t`Search rules`}
      />
      <Select value={eventTypeFilter} onValueChange={onEventTypeFilterChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t`Event type`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t`All event types`}</SelectItem>
          {wildcardAvailable && (
            <SelectItem value={wildcardEventType}>
              {t`All supported webhook events`}
            </SelectItem>
          )}
          {eventTypes.map((eventType) => (
            <SelectItem key={eventType.type} value={eventType.type}>
              {eventType.ui?.label ?? eventType.type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={actionTypeFilter} onValueChange={onActionTypeFilterChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t`Action type`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t`All action types`}</SelectItem>
          <SelectItem value="webhook">{t`Webhook`}</SelectItem>
          <SelectItem value="email">{t`Email`}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t`Status`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t`Enabled and disabled`}</SelectItem>
          <SelectItem value="enabled">{t`Enabled`}</SelectItem>
          <SelectItem value="disabled">{t`Disabled`}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
