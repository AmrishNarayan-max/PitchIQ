// ---------- State ----------
const STORAGE_KEY = "pitchiq-entries";
let entries = loadEntries();
let sentimentPipeline = null;

const form = document.getElementById("entry-form");
const submitBtn = document.getElementById("submit-btn");
const modelStatus = document.getElementById("model-status");
const gaugeScoreEl = document.getElementById("gauge-score");
const gaugeLabelEl = document.getElementById("gauge-label");
const gaugeFill = document.getElementById("gauge-fill");
const gaugeNeedle = document.getElementById("gauge-needle");
const breakdownPanel = document.getElementById("breakdown-panel");
const breakdownList = document.getElementById("breakdown-list");
const feed = document.getElementById("feed");
const feedEmpty = document.getElementById("feed-empty");

renderFeed();

// ---------- Storage ----------
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
  // Map raw sentiment confidence into a "conviction / assertiveness of tone" read.
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
  breakdownPanel.hidden = false;
}

// ---------- Feed rendering ----------
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

// ---------- Form handling ----------
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = document.getElementById("pitch-text").value.trim();
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

    setGauge(overall);
    renderBreakdown(items);

    entries.unshift({
      name,
      snippet: text.length > 60 ? text.slice(0, 60) + "…" : text,
      score: overall,
      level: levelFor(overall),
      timestamp: Date.now(),
    });
    saveEntries();
    renderFeed();

    form.reset();
  } catch (err) {
    modelStatus.textContent = "Something went wrong loading the AI model — check your connection and try again.";
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.removeAttribute("data-loading");
  }
});
