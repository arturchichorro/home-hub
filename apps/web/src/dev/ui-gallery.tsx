import {
  Button,
  Field,
  FieldControl,
  FieldTextarea,
  IconButton,
  InlineAlert,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  Panel,
  SelectItem,
  SelectPopup,
  SelectRoot,
  SelectTrigger,
  StatusIndicator,
} from "@home-hub/ui-web";
import { type ReactNode, useState } from "react";

type GallerySectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function GallerySection({ title, description, children }: GallerySectionProps) {
  return (
    <section className="grid gap-5 border-t border-border pt-8">
      <header>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}

function ArchiveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 7h16M6 7v12h12V7M9 11h6M5 3h14l1 4H4l1-4Z" />
    </svg>
  );
}

export function UiGallery() {
  const [clicks, setClicks] = useState(0);
  const [connected, setConnected] = useState(true);
  const [household, setHousehold] = useState("Rue des Mimosas");
  const [imageTarget, setImageTarget] = useState("recipe");

  return (
    <main className="min-h-screen bg-canvas px-5 py-10 font-sans text-foreground sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-12">
        <header>
          <p className="text-sm font-medium text-primary">Development only</p>
          <h1 className="mt-2 text-2xl font-semibold">Home Hub UI gallery</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Review visual variants, keyboard focus, disabled behavior, and live
            states before adopting these primitives in feature screens.
          </p>
        </header>

        <GallerySection
          title="Buttons"
          description="Variants, sizes, disabled behavior, busy presentation, and icon-only actions."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setClicks((value) => value + 1)}>
              Primary ({clicks})
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="compact">Compact</Button>
            <Button disabled>Disabled</Button>
            <Button busy>Saving changes</Button>
            <IconButton aria-label="Archive item">
              <ArchiveIcon />
            </IconButton>
            <IconButton aria-label="Delete item" variant="danger">
              <span aria-hidden="true">×</span>
            </IconButton>
          </div>
        </GallerySection>

        <GallerySection
          title="Selects"
          description="Selects choose a value used by a form; they are distinct from command and navigation menus."
        >
          <div className="max-w-sm">
            <Field label="Attach image to">
              <SelectRoot
                name="gallery-image-target"
                value={imageTarget}
                onValueChange={(value) => setImageTarget(value ?? "recipe")}
              >
                <SelectTrigger>
                  {imageTarget === "recipe"
                    ? "Recipe in general"
                    : "2 Aug 2026 cooking"}
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="recipe">Recipe in general</SelectItem>
                  <SelectItem value="cooking-log">
                    2 Aug 2026 cooking
                  </SelectItem>
                </SelectPopup>
              </SelectRoot>
            </Field>
          </div>
        </GallerySection>

        <GallerySection
          title="Menus"
          description="Menus combine selectable destinations with related commands."
        >
          <div className="flex flex-wrap items-center gap-3">
            <MenuRoot>
              <MenuTrigger>
                {household}
                <span aria-hidden="true">⌄</span>
              </MenuTrigger>
              <MenuPopup>
                <MenuRadioGroup value={household} onValueChange={setHousehold}>
                  <MenuRadioItem value="Rue des Mimosas">
                    Rue des Mimosas
                  </MenuRadioItem>
                  <MenuRadioItem value="Weekend house">
                    Weekend house
                  </MenuRadioItem>
                  <MenuRadioItem disabled value="Unavailable household">
                    Unavailable household
                  </MenuRadioItem>
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuItem>Create household…</MenuItem>
                <MenuItem variant="danger">Leave household…</MenuItem>
              </MenuPopup>
            </MenuRoot>
          </div>
        </GallerySection>

        <GallerySection
          title="Fields"
          description="Persistent labels and descriptions remain separate from application validation state."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Email" description="Used to sign in to Home Hub.">
              <FieldControl
                name="gallery-email"
                type="email"
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="Password"
              error="Password must contain at least 12 characters."
            >
              <FieldControl
                name="gallery-password"
                type="password"
                defaultValue="short"
              />
            </Field>
            <Field disabled label="Disabled field">
              <FieldControl defaultValue="Unavailable" />
            </Field>
            <Field label="Read-only field">
              <FieldControl readOnly defaultValue="Rue des Mimosas" />
            </Field>
            <Field
              label="Cooking notes"
              description="Optional notes about this preparation."
              className="md:col-span-2"
            >
              <FieldTextarea
                name="gallery-notes"
                rows={4}
                placeholder="What changed this time?"
              />
            </Field>
          </div>
        </GallerySection>

        <GallerySection
          title="Panels"
          description="Static content surfaces; panels do not open, close, select, or fetch anything."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Default panel"
              description="A grouped section of related content."
            >
              <p className="text-sm text-muted">Panel body content.</p>
            </Panel>
            <Panel
              title="Raised panel"
              description="Suitable for authentication and floating surfaces."
              actions={<Button size="compact">Action</Button>}
              footer={<p className="text-sm text-muted">Optional footer</p>}
              variant="raised"
            >
              <p className="text-sm text-muted">Raised panel body content.</p>
            </Panel>
          </div>
        </GallerySection>

        <GallerySection
          title="Inline alerts"
          description="Callers choose whether feedback is static, a polite status, or an urgent alert."
        >
          <div className="grid gap-3">
            <InlineAlert title="Information">
              Household changes synchronize across signed-in devices.
            </InlineAlert>
            <InlineAlert title="Saved" variant="success">
              The household name was updated.
            </InlineAlert>
            <InlineAlert title="Connection interrupted" variant="warning">
              Local data remains readable while Home Hub reconnects.
            </InlineAlert>
            <InlineAlert role="alert" title="Could not save" variant="danger">
              Check the connection and try again.
            </InlineAlert>
          </div>
        </GallerySection>

        <GallerySection
          title="Status indicators"
          description="Color is always accompanied by visible text; live announcements are opt-in."
        >
          <div className="flex flex-wrap items-center gap-5">
            <StatusIndicator label="Neutral" />
            <StatusIndicator label="Connected" variant="success" />
            <StatusIndicator label="Connecting…" variant="warning" />
            <StatusIndicator label="Offline" variant="danger" />
            <StatusIndicator label="Compact" size="compact" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="compact"
              variant="secondary"
              onClick={() => setConnected((value) => !value)}
            >
              Change live connection state
            </Button>
            <StatusIndicator
              live
              label={connected ? "Connected" : "Offline"}
              variant={connected ? "success" : "danger"}
            />
          </div>
        </GallerySection>
      </div>
    </main>
  );
}
