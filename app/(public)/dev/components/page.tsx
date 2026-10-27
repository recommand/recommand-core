import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@core/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@core/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@core/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@core/components/ui/avatar';
import { Badge } from '@core/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@core/components/ui/breadcrumb';
import { Button } from '@core/components/ui/button';
import { Calendar } from '@core/components/ui/calendar';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@core/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@core/components/ui/chart';
import { Checkbox } from '@core/components/ui/checkbox';
import { Combobox } from '@core/components/ui/combobox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@core/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@core/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@core/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@core/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@core/components/ui/field';
import { Input } from '@core/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@core/components/ui/input-group';
import { Kbd } from '@core/components/ui/kbd';
import { Label } from '@core/components/ui/label';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@core/components/ui/navigation-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@core/components/ui/pagination';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@core/components/ui/popover';
import { Progress } from '@core/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@core/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@core/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@core/components/ui/sheet';
import { Skeleton } from '@core/components/ui/skeleton';
import { toast } from '@core/components/ui/sonner';
import { Spinner } from '@core/components/ui/spinner';
import { StatusLabel, StatusPixel } from '@core/components/ui/status-pixel';
import { Switch } from '@core/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@core/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@core/components/ui/tabs';
import { Textarea } from '@core/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@core/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@core/components/ui/tooltip';
import { StatusHero, StatusMessage } from '@recommand/components/status-feedback';
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Info,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { Navigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

/**
 * A gallery of the core components, in light and dark side by side, for
 * reviewing them under the deployment's theme. Only available in development.
 */
export default function ComponentGalleryPage() {
  const { resolvedTheme, setTheme } = useTheme();
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="flex h-topbar items-center border-b px-6">
        <h1 className="text-base font-title">Components</h1>
        <span className="ml-3 text-sm text-muted-foreground">
          The left panel follows the app theme, the right one is always dark. Overlays follow the
          app theme. Development only.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
          {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>
      <div className="border-b p-6">
        <Overlays />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2">
        <Panel />
        <div className="dark border-l bg-background text-foreground">
          <Panel />
        </div>
      </div>
    </div>
  );
}

function Panel() {
  return (
    <div className="flex flex-col gap-10 p-6">
      <Buttons />
      <Fields />
      <FieldParts />
      <Choices />
      <Menus />
      <Badges />
      <Status />
      <Data />
      <Notices />
      <Misc />
      <Navigation />
      <Dates />
      <Charts />
      <Cards />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-table-head text-muted-foreground [text-transform:var(--table-head-transform)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Buttons() {
  return (
    <Section title="Buttons">
      <Row>
        <Button>Send document</Button>
        <Button variant="outline">Park</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">
          <Trash2 /> Revoke
        </Button>
        <Button variant="destructive-solid">Delete</Button>
        <Button variant="link">
          Read the docs <ArrowRight />
        </Button>
      </Row>
      <Row>
        <Button size="sm">Resend</Button>
        <Button size="sm" variant="outline">
          Send by email instead
        </Button>
        <Button size="sm" variant="destructive">
          Revoke
        </Button>
        <Button size="lg">Log in</Button>
        <Button size="icon" variant="outline" aria-label="Add">
          <Plus />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Add">
          <Plus />
        </Button>
      </Row>
      <Row>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href="#buttons" />}>
          Link as button
        </Button>
      </Row>
    </Section>
  );
}

function Fields() {
  return (
    <Section title="Fields">
      <div className="grid max-w-md gap-4">
        <div className="grid gap-2">
          <Label htmlFor="gallery-name">Company name</Label>
          <Input id="gallery-name" placeholder="Atelier Verbeke BV" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gallery-peppol">Peppol ID</Label>
          <Input id="gallery-peppol" defaultValue="0208:079831234" aria-invalid />
          <p className="text-sm text-warning-foreground">A company number has 10 digits.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gallery-readonly">Read-only</Label>
          <Input id="gallery-readonly" defaultValue="key_01JA9R2W7T" readOnly />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gallery-disabled">Disabled</Label>
          <Input id="gallery-disabled" placeholder="Not available" disabled />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gallery-note">Note</Label>
          <Textarea id="gallery-note" placeholder="Visible to your team only" />
        </div>
      </div>
    </Section>
  );
}

function Choices() {
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  return (
    <Section title="Checkbox and switch">
      <Row>
        <Label>
          <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value)} />
          Send a copy to me
        </Label>
        <Label>
          <Checkbox indeterminate />
          Some selected
        </Label>
        <Label>
          <Checkbox disabled />
          Disabled
        </Label>
      </Row>
      <Row>
        <Label>
          <Switch checked={enabled} onCheckedChange={(value) => setEnabled(value)} />
          Notify on failure
        </Label>
        <Label>
          <Switch size="sm" />
          Small
        </Label>
        <Label>
          <Switch disabled />
          Disabled
        </Label>
      </Row>
    </Section>
  );
}

function Badges() {
  return (
    <Section title="Badges">
      <Row>
        <Badge>Default</Badge>
        <Badge variant="secondary">Invoice</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="success">Paid</Badge>
        <Badge variant="warning">Under query</Badge>
        <Badge variant="destructive">Revoked</Badge>
        <Badge variant="tag">Webhook</Badge>
        <Badge variant="counter">12</Badge>
        <Badge variant="counter-action">3</Badge>
      </Row>
    </Section>
  );
}

function Cards() {
  return (
    <Section title="Cards">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Peppol registration</CardTitle>
            <CardDescription>Receiving since 2 Sep 2026</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Invoices and credit notes reach this company on 0208:0456123987.
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>Up to 2,000 documents a month</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size="sm">Change plan</Button>
          </CardFooter>
        </Card>
      </div>
    </Section>
  );
}

function Overlays() {
  return (
    <Section title="Overlays">
      <Row>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename the API key</DialogTitle>
              <DialogDescription>The key keeps working; only its name changes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="gallery-key-name">Name</Label>
              <Input id="gallery-key-name" defaultValue="erp-sync" />
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke erp-sync?</AlertDialogTitle>
              <AlertDialogDescription>
                Systems using this key can no longer send or read documents. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive-solid">Revoke key</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>Drawer</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>INV-2026-0912</SheetTitle>
              <SheetDescription>Invoice to Atelier Verbeke, delivered on 14 Oct.</SheetDescription>
            </SheetHeader>
            <div className="px-4 text-muted-foreground">Delivery details go here.</div>
            <SheetFooter>
              <Button size="sm">Resend</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Popover</PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader>
              <PopoverTitle>Receiving on Peppol</PopoverTitle>
              <PopoverDescription>Since 2 Sep 2026, as 0208:0456123987.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon" aria-label="More information" />}
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent>Delivered over Peppol</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          variant="outline"
          onClick={() => toast.success('Invoice delivered to Atelier Verbeke')}
        >
          Success toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error('Delivery failed', {
              description: 'The receiving access point did not answer.',
            })
          }
        >
          Error toast
        </Button>
      </Row>
    </Section>
  );
}

function Menus() {
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [view, setView] = useState(['all']);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <Section title="Menus and choices">
      <Row>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Actions <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Document</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                Resend <DropdownMenuShortcut>R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>Download UBL</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={showArchived} onCheckedChange={setShowArchived}>
                Show archived
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {['Delivered', 'Sent', 'Received', 'Failed'].map((label) => (
              <SelectItem key={label} value={label.toLowerCase()}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-56">
          <Combobox
            value={company}
            onValueChange={setCompany}
            placeholder="Choose a company"
            options={[
              { value: 'verbeke', label: 'Atelier Verbeke BV' },
              { value: 'ardennes', label: 'Hotel Ardennes' },
              { value: 'meulemans', label: 'Meulemans Staal' },
            ]}
          />
        </div>
      </Row>

      <Row>
        <ToggleGroup
          variant="segmented"
          value={view}
          onValueChange={(value) => value.length && setView(value)}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="sent">Sent</ToggleGroupItem>
          <ToggleGroupItem value="received">Received</ToggleGroupItem>
        </ToggleGroup>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
        </Tabs>
      </Row>

      <Tabs defaultValue="documents" className="max-w-xl">
        <TabsList variant="line">
          <TabsTrigger value="documents">
            Documents <span className="text-micro text-muted-foreground">5,016</span>
          </TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="text-muted-foreground">
          Underlined tabs switch the page; segmented tabs switch a view inside it.
        </TabsContent>
      </Tabs>

      <Command className="max-w-md border">
        <CommandInput placeholder="Search documents and IDs" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem>
              Send document <CommandShortcut>S</CommandShortcut>
            </CommandItem>
            <CommandItem>Verify a recipient</CommandItem>
            <CommandItem>Open API keys</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </Section>
  );
}

function Status() {
  return (
    <Section title="Status">
      <Row>
        <StatusLabel shape="outline">Planned</StatusLabel>
        <StatusLabel shape="half">Sending</StatusLabel>
        <StatusLabel>Received</StatusLabel>
        <StatusLabel tone="positive">Delivered</StatusLabel>
        <StatusLabel tone="attention">Failed</StatusLabel>
        <StatusLabel shape="unknown">Unknown</StatusLabel>
      </Row>
      <Row>
        <StatusPixel size="xs" tone="positive" />
        <StatusPixel />
        <StatusPixel size="lg" shape="half" />
        <StatusPixel size="xl" tone="positive" />
      </Row>
    </Section>
  );
}

const rows = [
  {
    status: 'positive',
    label: 'Delivered',
    number: 'INV-2026-0912',
    party: 'Atelier Verbeke',
    amount: '€ 4.120,00',
  },
  {
    status: 'attention',
    label: 'Failed',
    number: 'INV-2026-0910',
    party: 'Hotel Ardennes',
    amount: '€ 1.980,00',
  },
  {
    status: 'normal',
    label: 'Received',
    number: '2026/1187',
    party: 'Meulemans Staal',
    amount: '€ 12.940,00',
  },
] as const;

function Data() {
  const [selected, setSelected] = useState('INV-2026-0910');
  return (
    <Section title="Table">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.number}
                data-state={selected === row.number ? 'selected' : undefined}
                onClick={() => setSelected(row.number)}
              >
                <TableCell>
                  <StatusLabel tone={row.status}>{row.label}</StatusLabel>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.number}</TableCell>
                <TableCell className="font-medium">{row.party}</TableCell>
                <TableCell className="text-right">{row.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid max-w-md gap-3">
        <Progress value={64} />
        <div className="flex items-center gap-3">
          <Skeleton className="size-8" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Notices() {
  return (
    <Section title="Notices">
      <div className="grid max-w-xl gap-3">
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Receiver access point unreachable</AlertTitle>
          <AlertDescription>
            We retry for 24 hours. After that you can send by email instead.
          </AlertDescription>
        </Alert>
        <Alert variant="info">
          <Info />
          <AlertTitle>Playground</AlertTitle>
          <AlertDescription>Nothing you send here leaves Recommand.</AlertDescription>
        </Alert>
        <Alert variant="success">
          <AlertTitle>Company verified</AlertTitle>
          <AlertDescription>Invoices can now be received on 0208:0456123987.</AlertDescription>
        </Alert>
        <StatusMessage
          tone="error"
          icon={TriangleAlert}
          title="Verification failed"
          description="The register does not list this person as a director."
        />
        <StatusMessage
          tone="success"
          icon={Info}
          title="Mandate signed"
          description="We start the verification now."
        />
        <StatusHero
          tone="success"
          icon={Info}
          title="Verification complete"
          description="The company can now send and receive on the network."
        />
      </div>
    </Section>
  );
}

function Misc() {
  return (
    <Section title="Other">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#documents">Documents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>INV-2026-0912</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Row>
        <Avatar>
          <AvatarFallback>EV</AvatarFallback>
        </Avatar>
        <Kbd>⌘K</Kbd>
        <Spinner />
        <RadioGroup defaultValue="director" className="flex w-auto gap-4">
          <Label>
            <RadioGroupItem value="director" /> Director
          </Label>
          <Label>
            <RadioGroupItem value="contract" /> By contract
          </Label>
        </RadioGroup>
      </Row>
      <Accordion className="max-w-md">
        <AccordionItem value="what">
          <AccordionTrigger>What does Peppol cost?</AccordionTrigger>
          <AccordionContent>Sending and receiving are included in every plan.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="how">
          <AccordionTrigger>How long does verification take?</AccordionTrigger>
          <AccordionContent>
            Usually a few minutes; manual checks within a working day.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyTitle>No documents yet</EmptyTitle>
          <EmptyDescription>Send your first invoice from the playground.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Section>
  );
}

function FieldParts() {
  const [method, setMethod] = useState('peppol');
  return (
    <Section title="Field and input group">
      <FieldGroup className="max-w-md">
        <Field>
          <FieldLabel htmlFor="g-vat">VAT number</FieldLabel>
          <Input id="g-vat" defaultValue="BE0456123987" />
          <FieldDescription>We look the company up in the national register.</FieldDescription>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="g-email">Billing email</FieldLabel>
          <Input id="g-email" defaultValue="finance@" aria-invalid />
          <FieldError>Enter a complete email address.</FieldError>
        </Field>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search documents" />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput defaultValue="erp.example.com/webhooks/peppol" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Copy">
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldSet>
          <FieldLegend variant="label">Delivery method</FieldLegend>
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as string)}>
            <FieldLabel htmlFor="g-peppol">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Peppol</FieldTitle>
                  <FieldDescription>
                    Straight into the receiver's accounting software.
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value="peppol" id="g-peppol" />
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor="g-mail">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Email</FieldTitle>
                  <FieldDescription>A PDF with the structured invoice attached.</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="email" id="g-mail" />
              </Field>
            </FieldLabel>
          </RadioGroup>
        </FieldSet>
      </FieldGroup>
    </Section>
  );
}

function Navigation() {
  return (
    <Section title="Navigation">
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Product</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-72 gap-1">
                <li>
                  <NavigationMenuLink href="#exchange">
                    <div className="grid gap-0.5">
                      <span className="font-medium">Exchange</span>
                      <span className="text-muted-foreground">The Peppol API</span>
                    </div>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink href="#console">
                    <div className="grid gap-0.5">
                      <span className="font-medium">Console</span>
                      <span className="text-muted-foreground">Send and receive in the browser</span>
                    </div>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#pricing" className={navigationMenuTriggerStyle()}>
              Pricing
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <Pagination className="justify-start">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#page-1" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#page-1">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#page-2" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#page-3">3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#page-3" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Section>
  );
}

function Dates() {
  const [range, setRange] = useState<{ from: Date | undefined; to?: Date }>({
    from: new Date(2026, 9, 6),
    to: new Date(2026, 9, 10),
  });
  return (
    <Section title="Calendar">
      <Row>
        <Calendar
          mode="single"
          selected={new Date(2026, 9, 14)}
          defaultMonth={new Date(2026, 9)}
          className="rounded-xl border"
        />
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => r && setRange(r)}
          defaultMonth={new Date(2026, 9)}
          className="rounded-xl border"
        />
      </Row>
    </Section>
  );
}

const volume = [
  { month: 'May', sent: 1840, failed: 22 },
  { month: 'Jun', sent: 2210, failed: 31 },
  { month: 'Jul', sent: 1990, failed: 18 },
  { month: 'Aug', sent: 1620, failed: 12 },
  { month: 'Sep', sent: 2480, failed: 40 },
  { month: 'Oct', sent: 2730, failed: 27 },
];

const volumeConfig = {
  sent: { label: 'Delivered', color: 'var(--chart-1)' },
  failed: { label: 'Failed', color: 'var(--chart-5)' },
} satisfies ChartConfig;

function Charts() {
  return (
    <Section title="Chart">
      <ChartContainer config={volumeConfig} className="h-56 w-full max-w-xl">
        <BarChart data={volume} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="sent" stackId="a" fill="var(--color-sent)" />
          <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" />
        </BarChart>
      </ChartContainer>
    </Section>
  );
}
