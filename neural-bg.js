// Gold neural-network canvas background.
// Nodes drift slowly; connections draw between nearby nodes.
// Scroll position modulates brightness, connection reach, and a subtle parallax drift —
// the network reads as "more awake" the further you scroll into the page.

(function () {
  const canvas = document.getElementById("neural-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const GOLD = [242, 193, 78]; // matches --gold
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width, height, dpr;
  let nodes = [];
  let scrollProgress = 0;
  let rafId = null;

  function nodeCountFor(w) {
    if (w < 560) return 26;
    if (w < 1000) return 40;
    return 58;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedNodes();
  }

  function seedNodes() {
    const count = nodeCountFor(width);
    nodes = new Array(count).fill(0).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 1.1 + Math.random() * 1.6,
    }));
  }

  function updateScrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    const baseAlpha = 0.12 + scrollProgress * 0.28;
    const reach = 110 + scrollProgress * 70;
    const parallax = scrollProgress * -36;

    // update positions
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }

    // connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < reach) {
          const lineAlpha = baseAlpha * (1 - dist / reach) * 0.9;
          ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${lineAlpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + parallax);
          ctx.lineTo(b.x, b.y + parallax);
          ctx.stroke();
        }
      }
    }

    // nodes
    for (const n of nodes) {
      ctx.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${Math.min(1, baseAlpha * 2.6)})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y + parallax, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(step);
    }
  }

  function onScroll() {
    updateScrollProgress();
    if (prefersReducedMotion) step(); // redraw once per scroll tick, no loop
  }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!document.hidden && !prefersReducedMotion && !rafId) {
      step();
    }
  });

  resize();
  updateScrollProgress();
  step();
})();
