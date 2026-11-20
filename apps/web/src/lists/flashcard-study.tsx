import { Button } from "@home-hub/ui-web";
import { useEffect, useRef, useState } from "react";

export type PracticeCard = { id: string; front: string; back: string };

export function FlashcardStudy({
  cards,
  onExit,
  onRestart,
}: {
  cards: readonly PracticeCard[];
  onExit: () => void;
  onRestart: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const revealButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const finish = useRef<HTMLHeadingElement>(null);
  const card = cards[index];

  useEffect(() => {
    if (!card) {
      finish.current?.focus();
    } else if (revealed) {
      nextButton.current?.focus();
    } else {
      revealButton.current?.focus();
    }
  }, [card, revealed]);

  if (!card) {
    return (
      <section aria-label="Practice finished" className="grid gap-4 py-8">
        <h2
          ref={finish}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          Finished
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRestart}>Practice again</Button>
          <Button variant="ghost" onClick={onExit}>
            Back to cards
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Flashcard practice" className="grid min-w-0 gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="compact" onClick={onExit}>
          Back to cards
        </Button>
        <span
          role="status"
          aria-label="Card position"
          className="text-sm text-muted"
        >
          {index + 1} / {cards.length}
        </span>
      </div>
      <div className="grid min-h-56 min-w-0 content-center gap-6 rounded-lg border border-border p-5 sm:p-8">
        <p
          className="max-h-[40dvh] overflow-y-auto wrap-anywhere text-lg whitespace-pre-wrap"
          data-practice-front
        >
          {card.front}
        </p>
        {revealed && (
          <p
            className="max-h-[40dvh] overflow-y-auto border-t border-border pt-5 wrap-anywhere text-lg whitespace-pre-wrap"
            data-practice-back
          >
            {card.back}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={index === 0}
          onClick={() => {
            setIndex((n) => n - 1);
            setRevealed(false);
          }}
        >
          Previous
        </Button>
        {!revealed && (
          <Button ref={revealButton} onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
        <Button
          ref={nextButton}
          disabled={!revealed}
          onClick={() => {
            if (revealed) {
              setIndex((n) => n + 1);
              setRevealed(false);
            }
          }}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
