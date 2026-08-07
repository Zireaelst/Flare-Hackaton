import type { CSSProperties } from "react";

type Item = { name: string; style: CSSProperties };

/**
 * An infinite wordmark row.
 *
 * The list is rendered twice and the track translates by exactly -50%, so the
 * second copy arrives where the first started and the loop has no seam. The
 * duplicate is hidden from assistive tech — one reading of the names is enough.
 */
export function Marquee({
  items,
  trackClassName,
  itemClassName,
  muted = false,
}: {
  items: Item[];
  trackClassName: string;
  itemClassName: string;
  muted?: boolean;
}) {
  const tone = muted ? "text-black/50" : "text-black/60";

  return (
    <div className={trackClassName}>
      {[0, 1].map((copy) => (
        <div key={copy} className="flex" aria-hidden={copy === 1 || undefined}>
          {items.map((item) => (
            <span
              key={`${copy}-${item.name}`}
              className={`${itemClassName} shrink-0 whitespace-nowrap ${tone}`}
              style={item.style}
            >
              {item.name}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
