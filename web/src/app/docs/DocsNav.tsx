"use client";

import { useEffect, useState } from "react";

/**
 * Sticky section list that tracks the reader.
 *
 * Deliberately not IntersectionObserver. That only reports headings inside the
 * observed band, so a heading scrolled *above* it stops being reported at all
 * and the highlight sticks on whatever was last seen — which is wrong for
 * exactly the section you are reading. Asking every heading where it is gives
 * one answer that is always defined: the last one to have passed the top.
 */
export function DocsNav({ sections }: { sections: readonly { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const threshold = 120;
      let current = sections[0]?.id ?? "";

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= threshold) {
          current = section.id;
        }
      }

      // At the very bottom the last section may never cross the threshold,
      // so anchor to it rather than leaving the highlight short.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 80) {
        current = sections[sections.length - 1]?.id ?? current;
      }

      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-12 space-y-1">
        <p className="mb-3 text-[11px] uppercase tracking-[0.15em] text-black/40">On this page</p>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "location" : undefined}
            className={`block rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 ${
              active === section.id
                ? "bg-black/[0.06] font-medium text-black"
                : "text-black/55 hover:text-black"
            }`}
          >
            {section.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
