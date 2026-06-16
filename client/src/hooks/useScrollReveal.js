import { useEffect, useRef } from "react";

/**
 * useScrollReveal — attaches IntersectionObserver to all children
 * with `.scroll-reveal`, `.scroll-reveal-left`, or `.scroll-reveal-right`
 * inside the returned containerRef. Adds `.revealed` class when in view.
 *
 * @param {Object} options - IntersectionObserver options
 * @returns {React.RefObject} containerRef
 */
export function useScrollReveal(options = {}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const defaultOptions = {
      threshold: 0.12,
      rootMargin: "0px 0px -48px 0px",
      ...options,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    }, defaultOptions);

    const elements = container.querySelectorAll(
      ".scroll-reveal, .scroll-reveal-left, .scroll-reveal-right"
    );
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return containerRef;
}
