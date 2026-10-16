import { useLayoutEffect, useRef, useState } from "react";
import { HabitMemberMark } from "./habit-member-mark";

export function hiddenMarksToRight(
  rightEdges: readonly number[],
  viewportRight: number,
): number {
  return rightEdges.filter((edge) => edge > viewportRight + 0.5).length;
}

export function HabitCompletionMarks({
  members,
  colors,
}: {
  members: readonly { userId: string }[];
  colors: ReadonlyMap<string, string>;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const viewportRef = useRef<HTMLSpanElement>(null);
  const marksRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [hidden, setHidden] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    const marks = marksRef.current;
    if (!container || !viewport || !marks) return;
    const update = () => {
      // Compare against the whole container, not the badge-reduced viewport,
      // so resizing can remove the badge when all marks fit again.
      const overflowing =
        members.length > 0 && marks.scrollWidth > container.clientWidth;
      setOverflow(overflowing);
      setHidden(
        overflow && overflowing
          ? hiddenMarksToRight(
              Array.from(
                marks.children,
                (mark) => mark.getBoundingClientRect().right,
              ),
              viewport.getBoundingClientRect().right,
            )
          : 0,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(viewport);
    observer.observe(marks);
    viewport.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, [members.length, overflow]);

  return (
    <span
      ref={containerRef}
      aria-hidden="true"
      className="flex h-4 w-full min-w-0 items-center"
    >
      <span
        ref={viewportRef}
        className="flex h-4 min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span ref={marksRef} className="mx-auto flex w-max shrink-0 gap-1">
          {members.map((member) => (
            <HabitMemberMark
              key={member.userId}
              color={colors.get(member.userId)}
            />
          ))}
        </span>
      </span>
      {overflow ? (
        <span
          className={`shrink-0 text-right text-[10px] leading-none font-medium text-muted tabular-nums ${hidden === 0 ? "invisible" : ""}`}
          style={{ width: `${String(members.length).length + 1}ch` }}
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
