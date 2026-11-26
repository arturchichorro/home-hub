import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppHeaderRightComponentContext } from "../app-header-right-component";
import { CalendarMedia } from "../calendar/calendar-media";
import { ContactMedia } from "../contacts/contact-media";
import { MoodboardUploads } from "../lists/moodboard-uploads";
import { RecipeImageUploadForm } from "../recipes/recipe-image-upload-form";
import { ExerciseMedia } from "../workouts/exercise-media";
import { MediaSessionProvider } from "./session";

vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => ({ status: "idle" }),
}));

const id = crypto.randomUUID();
const session = { accessToken: "test", userId: id, onSessionExpired: vi.fn() };
const common = {
  householdId: id,
  itemId: id,
  name: "Audit",
  saved: true,
  disabled: false,
  onBusyChange: vi.fn(),
};

function render(content: ReactNode) {
  return renderToStaticMarkup(
    <AppHeaderRightComponentContext.Provider value={vi.fn()}>
      <MediaSessionProvider value={session}>{content}</MediaSessionProvider>
    </AppHeaderRightComponentContext.Provider>,
  );
}

it.each([
  [
    "calendar",
    <CalendarMedia key="calendar" {...common}>
      {({ upload }) => upload}
    </CalendarMedia>,
  ],
  [
    "contact",
    <ContactMedia key="contact" {...common} kind="profile">
      {({ upload }) => upload}
    </ContactMedia>,
  ],
  [
    "exercise",
    <ExerciseMedia
      key="exercise"
      householdId={id}
      exerciseId={id}
      name="Audit"
    />,
  ],
  [
    "recipe",
    <RecipeImageUploadForm
      key="recipe"
      {...session}
      householdId={id}
      recipeId={id}
    />,
  ],
  [
    "cooking entry",
    <RecipeImageUploadForm
      key="cooking"
      {...session}
      householdId={id}
      recipeId={id}
      cookLogId={id}
    />,
  ],
  [
    "moodboard",
    <MoodboardUploads
      key="moodboard"
      householdId={id}
      listId={id}
      session={session}
      onBusy={vi.fn()}
    />,
  ],
])(
  "%s upload input is named without adding an invisible tab stop",
  (_name, component) => {
    const html = render(component);
    const input = html.match(/<input[^>]*type="file"[^>]*>/)?.[0];
    expect(input).toBeDefined();
    expect(input).toMatch(/aria-label="Choose [^"]+"/);
    expect(input).toContain('tabindex="-1"');
  },
);
