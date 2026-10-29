import { Input } from '@core/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@core/components/ui/table';
import { useTranslation } from '@core/hooks/use-translation';
import { cn } from '@core/lib/utils';
import { type ColumnDef, flexRender, type Table as TanstackTable } from '@tanstack/react-table';
import React, { useState } from 'react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  table: TanstackTable<TData>;
  topSummaryRow?: React.ReactNode;
  summaryRow?: React.ReactNode;
  renderSubComponent?: (props: { row: any }) => React.ReactNode;
  enableGlobalFilter?: boolean;
  globalFilterPlaceholder?: string;
  /**
   * Focus the search field on mount. Turn this off on screens that bind the
   * arrow keys themselves (a focused text input swallows them).
   */
  autoFocusGlobalFilter?: boolean;
  rowClassName?: (row: any) => string | undefined;
  rowProps?: (row: any) => React.HTMLAttributes<HTMLTableRowElement>;
  /**
   * How the list sits on the page:
   * - `contained` (the default): in a bordered box with rounded corners;
   * - `gutter`: inside the page gutter without a box, for working through
   *   items one by one with the detail beside the list; a selected row is
   *   rounded;
   * - `edge`: running to the edges of the work area, for scanning many items
   *   with many columns, with the detail in a drawer; a selected row is
   *   square. Place it directly in the page's content, whose gutter it
   *   cancels.
   */
  arrangement?: 'contained' | 'gutter' | 'edge';
}

const arrangementClasses = {
  contained: 'overflow-hidden rounded-xl border',
  gutter:
    '[&_tr[data-state=selected]]:bg-transparent [&_tr[data-state=selected]>td]:bg-active [&_tr[data-state=selected]>td:first-child]:rounded-l-lg [&_tr[data-state=selected]>td:last-child]:rounded-r-lg',
  edge: '-mx-gutter [&_tr>*:first-child]:pl-gutter [&_tr>*:last-child]:pr-gutter',
};

export function DataTable<TData, TValue>({
  columns,
  table,
  topSummaryRow,
  summaryRow,
  renderSubComponent,
  enableGlobalFilter = false,
  globalFilterPlaceholder = 'Zoeken...',
  autoFocusGlobalFilter = true,
  rowClassName,
  rowProps,
  arrangement = 'contained',
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState('');
  const isGlobalFilterEnabled = enableGlobalFilter && table.getState().globalFilter !== undefined;
  const { t } = useTranslation();
  const getColumnStyle = (column: any) => {
    const widthPercent = column.columnDef.meta?.widthPercent;

    if (typeof widthPercent === 'number') {
      return { width: `${widthPercent}%` };
    }

    return column.columnDef.size && column.columnDef.size !== table._getDefaultColumnDef().size
      ? { width: `${column.columnDef.size}px` }
      : undefined;
  };
  const getCellClassName = (cell: any) => {
    const cellClassName = cell.column.columnDef.meta?.cellClassName;

    return typeof cellClassName === 'function' ? cellClassName(cell) : cellClassName;
  };
  const getCellStyle = (cell: any) => {
    const cellStyle = cell.column.columnDef.meta?.cellStyle;
    const resolvedCellStyle = typeof cellStyle === 'function' ? cellStyle(cell) : cellStyle;

    return {
      ...getColumnStyle(cell.column),
      ...resolvedCellStyle,
    };
  };

  return (
    <div className="space-y-4">
      {isGlobalFilterEnabled && (
        <Input
          autoFocus={autoFocusGlobalFilter}
          placeholder={globalFilterPlaceholder}
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            table.setGlobalFilter(e.target.value);
          }}
          className="max-w-sm"
        />
      )}
      <div className={arrangementClasses[arrangement]}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} style={getColumnStyle(header.column)}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
                {table.getRowModel().rows.map((row) => {
                  const resolvedRowProps = rowProps?.(row);

                  return (
                    <React.Fragment key={row.id}>
                      <TableRow
                        {...resolvedRowProps}
                        data-state={row.getIsSelected() && 'selected'}
                        className={cn(rowClassName?.(row), resolvedRowProps?.className)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cn(getCellClassName(cell))}
                            style={getCellStyle(cell)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {row.getIsExpanded() && renderSubComponent && renderSubComponent({ row })}
                    </React.Fragment>
                  );
                })}
                {summaryRow}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t`No results.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
