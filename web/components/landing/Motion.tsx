import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// One controller for the whole landing. Markup opts in with data attributes:
//   data-split   headline lines rise from a mask     data-reveal  fade up on enter
//   data-line    rule draws left to right            data-count   number counts up
//   data-fill    words light up while scrolling      data-parallax="-20"  yPercent scrub
export default function Motion() {
  useGSAP((_, contextSafe) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("js");

    const lenis = reduced ? undefined : new Lenis({ lerp: 0.08, wheelMultiplier: 0.9, anchors: true });
    const tick = (t: number) => lenis?.raf(t * 1000);
    if (lenis) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    if (reduced) {
      gsap.set("[data-split],[data-reveal],[data-line]", { clearProps: "all", opacity: 1 });
      return () => document.documentElement.classList.remove("js");
    }

    // contextSafe records the async splits in this context, so cleanup reverts them too.
    document.fonts.ready.then(contextSafe!(() => {
      gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
        const split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "split-line" });
        gsap.set(el, { opacity: 1 });
        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1.1,
          ease: "expo.out",
          stagger: 0.08,
          delay: el.dataset.split === "now" ? 0.15 : 0,
          scrollTrigger: el.dataset.split === "now" ? undefined : { trigger: el, start: "top 88%" },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-fill]").forEach((el) => {
        const split = SplitText.create(el, { type: "words" });
        gsap.fromTo(
          split.words,
          { opacity: 0.14 },
          { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: true } },
        );
      });
      ScrollTrigger.refresh();
      // Pinned sections change the layout after load, so the browser's own jump to /#section misses.
      const target = window.location.hash.length > 1 ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
      if (target) lenis?.scrollTo(target, { immediate: true, force: true });
    }));

    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 32 },
        { opacity: 1, y: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } },
      );
    });

    gsap.utils.toArray<HTMLElement>("[data-line]").forEach((el) => {
      gsap.fromTo(
        el,
        { scaleX: 0 },
        { scaleX: 1, duration: 1.4, ease: "expo.inOut", scrollTrigger: { trigger: el, start: "top 95%" } },
      );
    });

    gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      const state = { v: 0 };
      gsap.to(state, {
        v: target,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%" },
        onUpdate: () => {
          el.textContent = Math.round(state.v).toLocaleString("en-US");
        },
      });
    });

    gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
      gsap.to(el, {
        yPercent: Number(el.dataset.parallax),
        ease: "none",
        scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
      });
    });

    // Pause the figures' looping CSS animations while they are off screen.
    const io = new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle("is-off", !e.isIntersecting)), { rootMargin: "100px" });
    document.querySelectorAll(".hero-fig").forEach(el => io.observe(el));

    return () => {
      io.disconnect();
      if (lenis) gsap.ticker.remove(tick);
      lenis?.destroy();
      document.documentElement.classList.remove("js");
    };
  });

  return null;
}
