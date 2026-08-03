import { AsyncButton } from "@core/components/async-button";
import { Badge } from "@core/components/ui/badge";
import { Button } from "@core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@core/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@core/components/ui/table";
import {
  badgeVariantForDeliveryStatus,
  formatTimestamp,
} from "./rule-helpers";
import type { RuleDeliveryDto, RuleDto } from "./types";
import { useTranslation } from "@core/hooks/use-translation";

function canRedeliver(delivery: RuleDeliveryDto) {
  return delivery.status === "succeeded" || delivery.status === "failed" || delivery.status === "giving_up";
}

type RuleDeliveriesDialogProps = {
  open: boolean;
  deliveriesRule: RuleDto | null;
  deliveries: RuleDeliveryDto[];
  deliveriesPage: number;
  deliveriesPageCount: number;
  deliveriesTotal: number;
  onOpenChange: (open: boolean) => void;
  onFetchDeliveries: (rule: RuleDto, page?: number) => Promise<void>;
  onRetryDelivery: (ruleId: string, deliveryId: string) => Promise<void>;
};

export function RuleDeliveriesDialog({
  open,
  deliveriesRule,
  deliveries,
  deliveriesPage,
  deliveriesPageCount,
  deliveriesTotal,
  onOpenChange,
  onFetchDeliveries,
  onRetryDelivery,
}: RuleDeliveriesDialogProps) {
  const { t, language } = useTranslation();

  const getDeliveryActionLabel = (delivery: RuleDeliveryDto) =>
    delivery.status === "succeeded" ? t`Redeliver` : t`Retry`;

  const getDeliveryStatusLabel = (status: RuleDeliveryDto["status"]) => {
    switch (status) {
      case "pending":
        return t`Pending`;
      case "in_flight":
        return t`In flight`;
      case "succeeded":
        return t`Succeeded`;
      case "failed":
        return t`Failed`;
      case "giving_up":
        return t`Giving up`;
    }
  };

  const getActionTypeLabel = (actionType: RuleDeliveryDto["actionType"]) =>
    actionType === "webhook" ? t`Webhook` : t`Email`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle>{t`Rule deliveries`}</DialogTitle>
          <DialogDescription>
            {t`One matched rule with two actions produces two delivery rows.`}
          </DialogDescription>
        </DialogHeader>

        {deliveriesRule && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t`Showing ${deliveries.length === 0 ? 0 : (deliveriesPage - 1) * 25 + 1} - ${Math.min(deliveriesPage * 25, deliveriesTotal)} of ${deliveriesTotal}`}
            </span>
            <span>{t`Page ${deliveriesPage} of ${deliveriesPageCount}`}</span>
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t`Status`}</TableHead>
                <TableHead>{t`Triggered by`}</TableHead>
                <TableHead>{t`Action`}</TableHead>
                <TableHead>{t`Attempts`}</TableHead>
                <TableHead>{t`Processed`}</TableHead>
                <TableHead>{t`Last error`}</TableHead>
                <TableHead className="text-right">{t`Actions`}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>{t`No deliveries yet.`}</TableCell>
                </TableRow>
              ) : (
                deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <Badge variant={badgeVariantForDeliveryStatus(delivery.status)}>
                        {getDeliveryStatusLabel(delivery.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {delivery.eventType}
                    </TableCell>
                    <TableCell>
                      {t`${getActionTypeLabel(delivery.actionType)} #${delivery.actionIndex + 1}`}
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell>{formatTimestamp(delivery.processedAt ?? delivery.retryAt, t, language)}</TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {delivery.lastError ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRedeliver(delivery) && deliveriesRule && (
                        <AsyncButton
                          variant="outline"
                          size="sm"
                          onClick={async () =>
                            await onRetryDelivery(deliveriesRule.id, delivery.id)
                          }
                        >
                          {getDeliveryActionLabel(delivery)}
                        </AsyncButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {deliveriesRule && deliveriesPageCount > 1 && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={deliveriesPage <= 1}
              onClick={async () => await onFetchDeliveries(deliveriesRule, deliveriesPage - 1)}
            >
              {t`Previous`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deliveriesPage >= deliveriesPageCount}
              onClick={async () => await onFetchDeliveries(deliveriesRule, deliveriesPage + 1)}
            >
              {t`Next`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
