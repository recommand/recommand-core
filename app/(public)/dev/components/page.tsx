import { Badge } from '@core/components/ui/badge';
import { Button } from '@core/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@core/components/ui/card';
import { Checkbox } from '@core/components/ui/checkbox';
import { Input } from '@core/components/ui/input';
import { Label } from '@core/components/ui/label';
import { Switch } from '@core/components/ui/switch';
import { Textarea } from '@core/components/ui/textarea';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Navigate } from 'react-router';

/**
 * A gallery of the core components, in light and dark side by side, for
 * reviewing them under the deployment's theme. Only available in development.
 */
export default function ComponentGalleryPage() {
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="flex h-topbar items-center border-b px-6">
        <h1 className="text-base font-title">Components</h1>
        <span className="ml-3 text-sm text-muted-foreground">
          Light on the left, dark on the right. Development only.
        </span>
      </header>
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
      <Choices />
      <Badges />
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
