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

function canRedeliver(delivery: RuleDeliveryDto) {
  return delivery.status === "succeeded" || delivery.status === "failed" || delivery.status === "giving_up";
}

function getDeliveryActionLabel(delivery: RuleDeliveryDto) {
  return delivery.status === "succeeded" ? "Redeliver" : "Retry";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle>Rule deliveries</DialogTitle>
          <DialogDescription>
            One matched rule with two actions produces two delivery rows.
          </DialogDescription>
        </DialogHeader>

        {deliveriesRule && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {deliveries.length === 0 ? 0 : (deliveriesPage - 1) * 25 + 1}
              {" - "}
              {Math.min(deliveriesPage * 25, deliveriesTotal)} of {deliveriesTotal}
            </span>
            <span>Page {deliveriesPage} of {deliveriesPageCount}</span>
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>No deliveries yet.</TableCell>
                </TableRow>
              ) : (
                deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <Badge variant={badgeVariantForDeliveryStatus(delivery.status)}>
                        {delivery.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {delivery.eventType}
                    </TableCell>
                    <TableCell>
                      {delivery.actionType} #{delivery.actionIndex + 1}
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell>{formatTimestamp(delivery.processedAt ?? delivery.retryAt)}</TableCell>
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
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deliveriesPage >= deliveriesPageCount}
              onClick={async () => await onFetchDeliveries(deliveriesRule, deliveriesPage + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
