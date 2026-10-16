import { useLayoutEffect, useRef, useState } from "react";
import { HabitMemberMark } from "./habit-member-mark";

type CompletionFade = "none" | "left" | "right" | "both";
export function completionFade(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): CompletionFade {
  const left = scrollLeft > 0.5;
  const right = scrollWidth - clientWidth - scrollLeft > 0.5;
  return left ? (right ? "both" : "left") : right ? "right" : "none";
}

const masks: Record<CompletionFade, string | undefined> = {
  none: undefined,
  left: "linear-gradient(to right, transparent, #000 0.5rem)",
  right:
    "linear-gradient(to right, #000, #000 calc(100% - 0.5rem), transparent)",
  both: "linear-gradient(to right, transparent, #000 0.5rem, #000 calc(100% - 0.5rem), transparent)",
};

export function HabitCompletionMarks({
  members,
  colors,
}: {
  members: readonly { userId: string }[];
  colors: ReadonlyMap<string, string>;
}) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const marksRef = useRef<HTMLSpanElement>(null);
  const [fade, setFade] = useState<CompletionFade>("none");

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const marks = marksRef.current;
    if (!viewport || !marks) return;
    const update = () =>
      setFade(
        members.length
          ? completionFade(
              viewport.scrollLeft,
              viewport.clientWidth,
              viewport.scrollWidth,
            )
          : "none",
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(marks);
    viewport.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, [members.length]);

  return (
    <span
      ref={viewportRef}
      aria-hidden="true"
      data-overflow={fade}
      className="flex h-4 w-full min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: masks[fade], WebkitMaskImage: masks[fade] }}
    >
      <span
        ref={marksRef}
        className="mx-auto flex w-max shrink-0 gap-0.5 [&>svg]:size-3.5"
      >
        {members.map((member) => (
          <HabitMemberMark
            key={member.userId}
            color={colors.get(member.userId)}
          />
        ))}
      </span>
    </span>
  );
}
