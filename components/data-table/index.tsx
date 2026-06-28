import React, { useState } from "react";
import { type ColumnDef, flexRender } from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@core/components/ui/table";
import { Input } from "@core/components/ui/input";
import { type Table as TanstackTable } from "@tanstack/react-table";
import { TableContainer } from "../table-container";
import { useTranslation } from "@core/hooks/use-translation";
import { cn } from "@core/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  table: TanstackTable<TData>;
  topSummaryRow?: React.ReactNode;
  summaryRow?: React.ReactNode;
  renderSubComponent?: (props: { row: any }) => React.ReactNode;
  enableGlobalFilter?: boolean;
  globalFilterPlaceholder?: string;
  rowClassName?: (row: any) => string | undefined;
}

export function DataTable<TData, TValue>({
  columns,
  table,
  topSummaryRow,
  summaryRow,
  renderSubComponent,
  enableGlobalFilter = false,
  globalFilterPlaceholder = "Zoeken...",
  rowClassName,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const isGlobalFilterEnabled = enableGlobalFilter && table.getState().globalFilter !== undefined;
  const { t } = useTranslation();
  const getColumnStyle = (column: any) => {
    const widthPercent = column.columnDef.meta?.widthPercent;

    if (typeof widthPercent === "number") {
      return { width: `${widthPercent}%` };
    }

    return column.columnDef.size &&
      column.columnDef.size !== table._getDefaultColumnDef().size
      ? { width: `${column.columnDef.size}px` }
      : undefined;
  };

  return (
    <div className="space-y-4">
      {isGlobalFilterEnabled && (
        <Input
          autoFocus={true}
          placeholder={globalFilterPlaceholder}
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            table.setGlobalFilter(e.target.value);
          }}
          className="max-w-sm"
        />
      )}
      <TableContainer>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={getColumnStyle(header.column)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              <>
                {topSummaryRow}
                {table.getRowModel().rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() && "selected"}
                      className={cn(rowClassName?.(row))}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={getColumnStyle(cell.column)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && renderSubComponent && (
                      renderSubComponent({ row })
                    )}
                  </React.Fragment>
                ))}
                {summaryRow}
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t`No results.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
