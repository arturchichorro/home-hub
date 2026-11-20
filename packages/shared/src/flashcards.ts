import * as z from "zod";

export const flashcardTextLimit = 10_000;
export const flashcardPreviewLimit = 4;

const side = z
  .string()
  .max(flashcardTextLimit)
  .refine((value) => value.trim().length > 0, "Both sides need text");

export const flashcardFieldsSchema = z
  .object({ front: side, back: side })
  .strict();
export type FlashcardFields = z.infer<typeof flashcardFieldsSchema>;

export const flashcardDeckSchema = z
  .object({ householdId: z.uuid(), listId: z.uuid() })
  .strict();
export const flashcardScopeSchema = flashcardDeckSchema
  .extend({
    cardId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const createFlashcardSchema = flashcardScopeSchema
  .extend(flashcardFieldsSchema.shape)
  .strict();
export const updateFlashcardSchema = flashcardScopeSchema
  .extend({
    changes: flashcardFieldsSchema
      .partial()
      .refine((changes) => Object.keys(changes).length > 0, "Empty patch"),
  })
  .strict();
export const reorderFlashcardsSchema = flashcardScopeSchema
  .extend({
    orderedIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs"),
  })
  .strict()
  .refine(
    (args) => args.orderedIds.includes(args.cardId),
    "Moved card missing",
  );

export function flashcardChanges(
  next: FlashcardFields,
  previous: FlashcardFields,
): Partial<FlashcardFields> {
  const changes: Partial<FlashcardFields> = {};

  if (next.front !== previous.front) {
    changes.front = next.front;
  }
  if (next.back !== previous.back) {
    changes.back = next.back;
  }

  return changes;
}

export function practiceSnapshot<
  T extends { id: string; front: string; back: string },
>(
  cards: readonly T[],
  shuffle: boolean,
  random: () => number = Math.random,
): { id: string; front: string; back: string }[] {
  const result = cards.map(({ id, front, back }) => ({ id, front, back }));

  if (shuffle) {
    for (let index = result.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      const current = result[index];
      const replacement = result[target];

      if (current && replacement) {
        result[index] = replacement;
        result[target] = current;
      }
    }
  }

  return result;
}
