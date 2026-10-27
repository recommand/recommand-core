import { AppSidebar } from '@core/components/app-sidebar';
import { DataTable } from '@core/components/data-table';
import { DataTableToolbar } from '@core/components/data-table/toolbar';
import { PageTemplate } from '@core/components/page-template';
import { SectionCard } from '@core/components/section-card';
import { StatTile, StatTileGrid } from '@core/components/stat-tile';
import { Button } from '@core/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@core/components/ui/input-group';
import { Kbd } from '@core/components/ui/kbd';
import { SidebarInset, SidebarProvider } from '@core/components/ui/sidebar';
import { StatusLabel, StatusPixel } from '@core/components/ui/status-pixel';
import type { Team } from '@core/data/teams';
import { useUIConfigActions } from '@core/lib/ui-config-store';
import { useUserStore } from '@core/lib/user-store';
import {
  type ColumnDef,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';

const teams = [
  { id: 'team_dev_1', name: 'Northwind Logistics', logoUrl: null },
  { id: 'team_dev_2', name: 'Northwind Playground', logoUrl: null },
  { id: 'team_dev_3', name: 'Harbour Freight', logoUrl: null },
] as unknown as Team[];

/**
 * The app frame (sidebar, work area, top bar and page head) with the apps'
 * navigation and a sample user and teams, for reviewing it under the deployment's theme
 * without a backend. `?sidebar=<theme>` sets the sidebar theme. Only
 * available in development.
 */
export default function FramePreviewPage() {
  const [params] = useSearchParams();
  const { setUIConfig } = useUIConfigActions();

  useEffect(() => {
    const seed = () =>
      useUserStore.setState({
        user: { id: 'user_dev', email: 'els.vermeulen@example.com' } as never,
        teams,
        activeTeam: teams[0],
        teamsAreLoaded: true,
        isLoading: false,
      });
    seed();
    // The app tries to load the signed-in user on start; put the sample back.
    return useUserStore.subscribe((state) => {
      if (!state.user) seed();
    });
  }, []);

  useEffect(() => {
    setUIConfig(
      'sidebar.logo',
      <span className="text-lg font-title text-sidebar-accent-foreground">Acme</span>,
    );
    setUIConfig('team-switcher.meta', (team: Team, place: 'sidebar' | 'panel') => {
      const playground = team.name.includes('Playground');
      return (
        <span
          className={
            place === 'sidebar'
              ? 'flex items-center gap-1.5 text-table-head text-sidebar-muted-foreground [text-transform:var(--table-head-transform)]'
              : 'text-xs text-muted-foreground'
          }
        >
          {place === 'sidebar' && (
            <StatusPixel size="xs" tone="positive" shape={playground ? 'outline' : 'filled'} />
          )}
          {playground ? 'Playground' : 'Production'}
        </span>
      );
    });
    setUIConfig(
      'topbar.actions',
      <>
        <InputGroup className="w-64 border-transparent bg-muted">
          <InputGroupInput placeholder="Search documents and IDs" />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <Button>Send document</Button>
      </>,
    );
  }, [setUIConfig]);

  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  return (
    <SidebarProvider theme={params.get('sidebar') ?? undefined}>
      <AppSidebar />
      <SidebarInset>
        <PageTemplate
          breadcrumbs={[{ label: 'Overview' }]}
          description="24 companies on the network through your integration."
          buttons={[
            <Button key="companies" variant="outline">
              All companies <ChevronDown />
            </Button>,
            <Button key="period" variant="outline">
              Last 30 days <ChevronDown />
            </Button>,
          ]}
        >
          <StatTileGrid>
            <StatTile label="Sent · 30 days" value="3,812" detail="+12% vs previous 30" />
            <StatTile label="Received · 30 days" value="1,204" detail="+4% vs previous 30" />
            <StatTile label="Delivered first try" value="99.6%" detail="15 retried · 2 failed" />
            <StatTile label="Failed" value="2" tone="danger" detail="Receiver unreachable" />
          </StatTileGrid>
          <SectionCard title="Recent documents" description="The last documents sent and received.">
            <p className="px-5 pb-5 text-sm text-muted-foreground">Sample content.</p>
          </SectionCard>
          <DocumentsTable arrangement={(params.get('table') as never) ?? 'edge'} />
        </PageTemplate>
      </SidebarInset>
    </SidebarProvider>
  );
}

type Row = {
  status: 'positive' | 'attention' | 'normal';
  label: string;
  number: string;
  party: string;
  amount: string;
};

const rows: Row[] = [
  {
    status: 'attention',
    label: 'Failed',
    number: 'INV-2026-0910',
    party: 'Hotel Ardennes',
    amount: '€ 1.980,00',
  },
  {
    status: 'positive',
    label: 'Delivered',
    number: 'INV-2026-0912',
    party: 'Atelier Verbeke',
    amount: '€ 4.120,00',
  },
  {
    status: 'normal',
    label: 'Received',
    number: '2026/1187',
    party: 'Meulemans Staal',
    amount: '€ 12.940,00',
  },
  {
    status: 'positive',
    label: 'Delivered',
    number: 'CN-2026-0031',
    party: 'Drukkerij Kempen',
    amount: '€ 310,00',
  },
];

const columns: ColumnDef<Row>[] = [
  {
    id: 'status',
    accessorKey: 'label',
    header: 'Status',
    cell: ({ row }) => <StatusLabel tone={row.original.status}>{row.original.label}</StatusLabel>,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'number',
    header: 'Document',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span>,
  },
  {
    accessorKey: 'party',
    header: 'Counterparty',
    cell: ({ row }) => <span className="font-medium">{row.original.party}</span>,
  },
  {
    accessorKey: 'amount',
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => <div className="text-right">{row.original.amount}</div>,
  },
];

function DocumentsTable({ arrangement }: { arrangement: 'contained' | 'gutter' | 'edge' }) {
  const [selected, setSelected] = useState('INV-2026-0910');
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getRowId: (row) => row.number,
    state: { rowSelection: { [selected]: true } },
  });
  return (
    <>
      <DataTableToolbar
        table={table}
        enableGlobalSearch
        searchPlaceholder="Number, party or Peppol ID"
        filterColumns={[
          {
            id: 'status',
            title: 'Status',
            options: ['Delivered', 'Received', 'Failed'].map((label) => ({ label, value: label })),
          },
        ]}
      />
      <DataTable
        columns={columns}
        table={table}
        arrangement={arrangement}
        rowProps={(row) => ({ onClick: () => setSelected(row.original.number) })}
      />
    </>
  );
}
