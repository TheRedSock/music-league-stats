"use client";

import { useEffect } from "react";

/** Client navigation uses pushState, which does not reliably update CSS :target. */
export function FaqAnchorTarget() {
  useEffect(() => {
    function highlight(hash = window.location.hash) {
      document.querySelectorAll(".faq-topic[data-anchor-target]").forEach(topic => topic.removeAttribute("data-anchor-target"));
      const topic = document.getElementById(hash.slice(1));
      if (topic?.classList.contains("faq-topic")) topic.setAttribute("data-anchor-target", "true");
    }
    const onHistory = () => highlight();
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname) highlight(url.hash);
    };
    // Next updates browser history after committing the new route.
    const frame = requestAnimationFrame(onHistory);
    window.addEventListener("hashchange", onHistory);
    window.addEventListener("popstate", onHistory);
    document.addEventListener("click", onClick, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", onHistory);
      window.removeEventListener("popstate", onHistory);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
