// ---------- State ----------
const STORAGE_KEY = "pitchiq-entries";
const API_BASE = "/api/evaluations";
const SAMPLE_PITCH = "College students across India struggle to find verified, affordable tutors for competitive exam prep. We're building an AI-matching platform that connects students with vetted tutors in under two minutes, unlike existing platforms that rely on slow manual browsing. Our target market is India's tutoring industry, worth crores and growing fast. We are the only platform combining real-time AI matching with verified tutor credentials. We're seeking ₹25 lakh in pre-seed funding to scale to 10 campuses in the next six months.";

let entries = loadEntries();
let sentimentPipeline = null;
let lastItems = [];
let lastOverall = 0;

const form = document.getElementById("entry-form");
const submitBtn = document.getElementById("submit-btn");
const sampleBtn = document.getElementById("sample-btn");
const modelStatus = document.getElementById("model-status");
const pitchText = document.getElementById("pitch-text");
const charCount = document.getElementById("char-count");
const gaugeScoreEl = document.getElementById("gauge-score");
const gaugeLabelEl = document.getElementById("gauge-label");
const gaugeFill = document.getElementById("gauge-fill");
const gaugeNeedle = document.getElementById("gauge-needle");
const gaugePanel = document.getElementById("gauge-panel");
const breakdownPanel = document.getElementById("breakdown-panel");
const breakdownList = document.getElementById("breakdown-list");
const priorityTip = document.getElementById("priority-tip");
const copyBtn = document.getElementById("copy-btn");
const clearBtn = document.getElementById("clear-btn");
const feed = document.getElementById("feed");
const feedEmpty = document.getElementById("feed-empty");
const communityFeed = document.getElementById("community-feed");
const communityEmpty = document.getElementById("community-empty");
const communityStatus = document.getElementById("community-status");

renderFeed();
loadCommunityFeed();

// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver((observedEntries) => {
  observedEntries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => revealObserver.observe(el));

// ---------- Character counter ----------
pitchText.addEventListener("input", () => {
  const len = pitchText.value.length;
  charCount.textContent = `${len} / 900`;
  charCount.classList.toggle("limit-near", len > 800);
});

// ---------- Sample pitch ----------
sampleBtn.addEventListener("click", () => {
  pitchText.value = SAMPLE_PITCH;
  pitchText.dispatchEvent(new Event("input"));
  pitchText.focus();
});

// ---------- Storage (this browser) ----------
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 30)));
  } catch { /* storage unavailable, ignore */ }
}

// ---------- Rule-based structural checks ----------
function scoreClarity(text) {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const avgLen = sentences.length ? words.length / sentences.length : 0;

  let score = 100;
  let note = "Good length and sentence rhythm.";

  if (sentences.length < 2) {
    score = 30; note = "Too short to read as a full pitch — aim for 3–6 sentences.";
  } else if (sentences.length > 9) {
    score = 55; note = "Quite long. Investors skim — tighten to the essentials.";
  } else if (avgLen > 32) {
    score = 50; note = "Sentences run long. Break them up for a punchier read.";
  } else if (avgLen < 6) {
    score = 60; note = "Sentences are very short/fragmented — add connective detail.";
  }
  return { score, note };
}

function scoreKeywordGroup(text, patterns, presentNote, absentNote) {
  const hit = patterns.some(p => p.test(text));
  return hit
    ? { score: 85, note: presentNote }
    : { score: 25, note: absentNote };
}

function scoreProblem(text) {
  return scoreKeywordGroup(
    text,
    [/\b(problem|pain point|struggl\w*|frustrat\w*|lack of|difficult\w*|challenge\w*|currently (can't|cannot|struggle))\b/i],
    "Names a concrete problem — good, that's what pulls a reader in first.",
    "No clear problem statement found. Open with the pain point before the solution."
  );
}

function scoreMarket(text) {
  const hasAudience = /\b(students?|users?|customers?|people|founders?|teams?|businesses?|hostel|campus|shoppers?|drivers?|farmers?)\b/i.test(text);
  const hasScale = /\b(market|industry|demand|segment|TAM|\d+[kK%]|\d+\s?(crore|lakh|million|billion))\b/i.test(text);
  if (hasAudience && hasScale) return { score: 90, note: "Names both a specific audience and a market/scale signal." };
  if (hasAudience) return { score: 55, note: "Names a target audience, but no sense of market size or demand." };
  return { score: 20, note: "No named audience or market signal — investors will ask 'who exactly, and how many?'" };
}

function scoreDifferentiation(text) {
  return scoreKeywordGroup(
    text,
    [/\b(unlike|unlike existing|better than|instead of|first to|no one|nobody|only platform|only app|only company|unique)\b/i],
    "Draws a line against alternatives — this answers 'why you, why now'.",
    "Doesn't say what makes this different from what already exists. Add a direct comparison."
  );
}

function scoreAsk(text) {
  const hasMoney = /(₹|\$|rs\.?\s?\d|inr)/i.test(text) || /\b\d+\s?(crore|lakh|million|k)\b/i.test(text);
  const hasAskWord = /\b(seeking|raise|raising|funding|invest\w*|equity)\b/i.test(text);
  if (hasMoney && hasAskWord) return { score: 90, note: "Clear ask, with a number attached — exactly what a pitch needs to close on." };
  if (hasAskWord) return { score: 50, note: "Mentions funding but no concrete number. Add an amount or range." };
  return { score: 15, note: "No ask at all. Even an early pitch should say what you want from the room." };
}

function levelFor(score) {
  if (score >= 70) return "good";
  if (score >= 45) return "neutral";
  return "bad";
}

// ---------- ML tone/conviction ----------
async function ensureModel() {
  if (sentimentPipeline) return sentimentPipeline;
  modelStatus.textContent = "Loading AI model in your browser (first time only)…";
  const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
  sentimentPipeline = await pipeline("sentiment-analysis", "Xenova/distilbert-base-uncased-finetuned-sst-2-english");
  modelStatus.textContent = "AI model loaded and cached in this browser.";
  return sentimentPipeline;
}

async function scoreConviction(text) {
  const pipe = await ensureModel();
  const [result] = await pipe(text);
  const score = Math.round(result.score * 100);
  const note = result.label === "POSITIVE"
    ? `Tone reads confident and assertive (model confidence ${score}%).`
    : `Tone reads hesitant or negative-leaning (model confidence ${score}%) — watch your framing.`;
  return { score: result.label === "POSITIVE" ? score : 100 - score, note };
}

// ---------- Gauge ----------
function setGauge(score) {
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = 314 - (clamped / 100) * 314;
  const angle = -90 + (clamped / 100) * 180;
  gaugeFill.style.strokeDashoffset = dashOffset;
  gaugeNeedle.style.transform = `rotate(${angle}deg)`;

  const level = levelFor(clamped);
  const color = level === "good" ? "var(--good)" : level === "neutral" ? "var(--neutral)" : "var(--bad)";
  gaugeFill.style.stroke = color;

  gaugeScoreEl.textContent = clamped;
  gaugeLabelEl.textContent =
    level === "good" ? "reads investor-ready" :
    level === "neutral" ? "solid start, needs sharpening" :
    "needs real rework before pitching";

  if (level === "good") burstConfetti();
}

// ---------- Confetti ----------
function burstConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const pieceCount = 16;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 90;
    piece.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    piece.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
    piece.style.setProperty("--rot", `${Math.random() * 360}deg`);
    piece.style.background = Math.random() > 0.5 ? "var(--gold)" : "var(--good)";
    gaugePanel.appendChild(piece);
    setTimeout(() => piece.remove(), 1200);
  }
}

// ---------- Breakdown rendering ----------
function renderBreakdown(items) {
  breakdownList.innerHTML = "";
  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "breakdown-item";
    li.innerHTML = `
      <span class="breakdown-dot dot-${levelFor(item.score)}"></span>
      <span>
        <p class="breakdown-title">${item.title}</p>
        <p class="breakdown-note">${item.note}</p>
      </span>
      <span class="breakdown-score">${item.score}/100</span>
    `;
    breakdownList.appendChild(li);
  });

  const weakest = items.reduce((min, i) => (i.score < min.score ? i : min), items[0]);
  priorityTip.innerHTML = `<strong>Fix this first:</strong> ${weakest.title} — ${weakest.note}`;
  priorityTip.hidden = false;

  breakdownPanel.hidden = false;
  breakdownPanel.classList.add("is-visible");
}

// ---------- Copy summary ----------
copyBtn.addEventListener("click", async () => {
  if (!lastItems.length) return;
  const lines = [
    `PitchIQ score: ${lastOverall}/100`,
    ...lastItems.map(i => `- ${i.title}: ${i.score}/100 — ${i.note}`),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy summary";
      copyBtn.classList.remove("copied");
    }, 1800);
  } catch {
    copyBtn.textContent = "Couldn't copy";
  }
});

// ---------- Clear this browser's history ----------
clearBtn.addEventListener("click", () => {
  if (entries.length === 0) return;
  if (!confirm("Clear this browser's pitch history? This can't be undone.")) return;
  entries = [];
  saveEntries();
  renderFeed();
});

// ---------- Feed rendering (this browser) ----------
function renderFeed() {
  feed.innerHTML = "";
  if (entries.length === 0) {
    feed.appendChild(feedEmpty);
    return;
  }
  entries.forEach(e => {
    const li = document.createElement("li");
    li.className = "feed-item";
    li.innerHTML = `
      <span class="feed-dot" style="background:${e.level === 'good' ? 'var(--good)' : e.level === 'neutral' ? 'var(--neutral)' : 'var(--bad)'}"></span>
      <span class="feed-main">
        <div class="feed-name">${e.name || "Anonymous"}</div>
        <div class="feed-snippet">${e.snippet}</div>
      </span>
      <span class="feed-score">${e.score}/100</span>
    `;
    feed.appendChild(li);
  });
}

// ---------- Community feed (backend) ----------
async function loadCommunityFeed() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("bad response");
    const rows = await res.json();
    renderCommunityFeed(rows);
    communityStatus.textContent = "live";
    communityStatus.classList.add("is-live");
  } catch {
    communityStatus.textContent = "backend not connected yet";
    communityStatus.classList.add("is-error");
    communityEmpty.textContent = "Community feed needs the /api backend deployed — see the setup guide.";
  }
}

function renderCommunityFeed(rows) {
  communityFeed.innerHTML = "";
  if (!rows || rows.length === 0) {
    communityEmpty.textContent = "No pitches scored by the community yet — be the first.";
    communityFeed.appendChild(communityEmpty);
    return;
  }
  rows.forEach(r => {
    const li = document.createElement("li");
    li.className = "feed-item";
    li.innerHTML = `
      <span class="feed-dot" style="background:${r.level === 'good' ? 'var(--good)' : r.level === 'neutral' ? 'var(--neutral)' : 'var(--bad)'}"></span>
      <span class="feed-main">
        <div class="feed-name">${r.name || "Anonymous"}</div>
        <div class="feed-snippet">${r.snippet}</div>
      </span>
      <span class="feed-score">${r.score}/100</span>
    `;
    communityFeed.appendChild(li);
  });
}

async function publishToCommunity(entry) {
  try {
    await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    loadCommunityFeed();
  } catch {
    // backend not deployed yet — fail silently, local history still works
  }
}

// ---------- Form handling ----------
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = pitchText.value.trim();
  const name = document.getElementById("founder-name").value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  submitBtn.setAttribute("data-loading", "true");

  try {
    const clarity = scoreClarity(text);
    const problem = scoreProblem(text);
    const market = scoreMarket(text);
    const diff = scoreDifferentiation(text);
    const ask = scoreAsk(text);
    const conviction = await scoreConviction(text);

    const items = [
      { title: "Clarity & structure", ...clarity },
      { title: "Problem framing", ...problem },
      { title: "Market signal", ...market },
      { title: "Differentiation", ...diff },
      { title: "The ask", ...ask },
      { title: "Tone & conviction (AI)", ...conviction },
    ];

    const overall = Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length);
    lastItems = items;
    lastOverall = overall;

    setGauge(overall);
    renderBreakdown(items);

    const snippet = text.length > 60 ? text.slice(0, 60) + "…" : text;
    const newEntry = {
      name,
      snippet,
      score: overall,
      level: levelFor(overall),
      timestamp: Date.now(),
    };

    entries.unshift(newEntry);
    saveEntries();
    renderFeed();
    publishToCommunity(newEntry);

    form.reset();
    charCount.textContent = "0 / 900";
  } catch (err) {
    modelStatus.textContent = "Something went wrong loading the AI model — check your connection and try again.";
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.removeAttribute("data-loading");
  }
});
