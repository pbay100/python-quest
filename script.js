// --------------------
// Python Quest (Monaco + Pyodide)
// --------------------

let pyodide = null;
let pyodideReady = false;

const LS_KEY = "pythonQuestProgress_v1";

// XP model: simple, predictable
function xpNeededForLevel(level) {
  // Level 1->2: 100, 2->3: 140, 3->4: 180 ...
  return 100 + (level - 1) * 40;
}

const lessons = [
  {
    id: "variables",
    title: "Lesson 1: Variables",
    desc: "Store data in a variable, then print it. Variables are named containers for values.",
    starterCode:
`# Lesson 1: Variables
name = "Python Hero"
print("Hello", name)
`,
    check: (stdout, _code) => stdout.trim() === "Hello Python Hero",
    xpReward: 30
  },
  {
    id: "numbers",
    title: "Lesson 2: Numbers",
    desc: "Use numbers and basic maths. Add two numbers and print the result.",
    starterCode:
`# Lesson 2: Numbers
a = 10
b = 5
print(a + b)
`,
    check: (stdout, _code) => stdout.trim() === "15",
    xpReward: 40
  },
  {
    id: "strings",
    title: "Lesson 3: Strings",
    desc: "Combine strings. Create a greeting and print it exactly.",
    starterCode:
`# Lesson 3: Strings
first = "Pete"
last = "Baynham"
print("Hello " + first + " " + last)
`,
    check: (stdout, _code) => stdout.trim() === "Hello Pete Baynham",
    xpReward: 50
  }
];

// Progress state
let state = {
  currentLessonIndex: 0,
  xp: 0,
  level: 1,
  completed: {} // { lessonId: true }
};

// DOM
const lessonListEl = document.getElementById("lessonList");
const lessonTitleEl = document.getElementById("lessonTitle");
const lessonDescEl = document.getElementById("lessonDesc");
const outputEl = document.getElementById("output");
const runBtn = document.getElementById("runBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");
const pyStatusEl = document.getElementById("pyStatus");
const evalBadgeEl = document.getElementById("evalBadge");

const levelValueEl = document.getElementById("levelValue");
const xpValueEl = document.getElementById("xpValue");
const xpFillEl = document.getElementById("xpFill");
const xpTextEl = document.getElementById("xpText");

let editor = null;

// --------------------
// Storage
// --------------------
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    state = {
      currentLessonIndex: Number.isFinite(parsed.currentLessonIndex) ? parsed.currentLessonIndex : 0,
      xp: Number.isFinite(parsed.xp) ? parsed.xp : 0,
      level: Number.isFinite(parsed.level) ? parsed.level : 1,
      completed: parsed.completed && typeof parsed.completed === "object" ? parsed.completed : {}
    };

    // Clamp
    if (state.currentLessonIndex < 0) state.currentLessonIndex = 0;
    if (state.currentLessonIndex >= lessons.length) state.currentLessonIndex = lessons.length - 1;
    if (state.level < 1) state.level = 1;
    if (state.xp < 0) state.xp = 0;
  } catch {
    // ignore
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function resetState() {
  state = {
    currentLessonIndex: 0,
    xp: 0,
    level: 1,
    completed: {}
  };
  saveState();
}

// --------------------
// UI
// --------------------
function renderStats() {
  const need = xpNeededForLevel(state.level);
  const current = Math.min(state.xp, need);
  const pct = Math.max(0, Math.min(100, (current / need) * 100));

  levelValueEl.textContent = String(state.level);
  xpValueEl.textContent = String(state.xp);
  xpFillEl.style.width = `${pct}%`;
  xpTextEl.textContent = `${current} / ${need}`;
}

function setBadge(status) {
  // status: "neutral" | "ok" | "bad" | "warn"
  evalBadgeEl.className = `badge ${status}`;
  if (status === "neutral") evalBadgeEl.textContent = "Not run";
  if (status === "ok") evalBadgeEl.textContent = "Passed";
  if (status === "bad") evalBadgeEl.textContent = "Try again";
  if (status === "warn") evalBadgeEl.textContent = "Python loading";
}

function renderLessonList() {
  lessonListEl.innerHTML = "";

  lessons.forEach((l, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lessonItem" + (idx === state.currentLessonIndex ? " active" : "");

    const meta = document.createElement("div");
    meta.className = "lessonMeta";

    const name = document.createElement("div");
    name.className = "lessonName";
    name.textContent = l.title;

    const small = document.createElement("div");
    small.className = "lessonSmall";
    small.textContent = `${l.xpReward} XP`;

    meta.appendChild(name);
    meta.appendChild(small);

    const pill = document.createElement("div");
    pill.className = "pill" + (state.completed[l.id] ? " done" : "");
    pill.textContent = state.completed[l.id] ? "Done" : "New";

    btn.appendChild(meta);
    btn.appendChild(pill);

    btn.addEventListener("click", () => {
      state.currentLessonIndex = idx;
      saveState();
      loadLesson();
    });

    lessonListEl.appendChild(btn);
  });
}

function loadLesson() {
  const lesson = lessons[state.currentLessonIndex];
  lessonTitleEl.textContent = lesson.title;
  lessonDescEl.textContent = lesson.desc;

  if (editor) {
    editor.setValue(lesson.starterCode);
    // Force focus so caret becomes obvious after click
    setTimeout(() => editor.focus(), 0);
  }

  outputEl.textContent = "Press “Run Code”.";
  setBadge(pyodideReady ? "neutral" : "warn");

  renderLessonList();
  renderStats();
}

function goNextLesson() {
  if (state.currentLessonIndex < lessons.length - 1) {
    state.currentLessonIndex += 1;
    saveState();
    loadLesson();
  }
}

// --------------------
// XP / Leveling
// --------------------
function awardXP(amount) {
  state.xp += amount;

  // Level up as many times as needed
  while (state.xp >= xpNeededForLevel(state.level)) {
    state.xp -= xpNeededForLevel(state.level);
    state.level += 1;
  }

  saveState();
  renderStats();
}

// --------------------
// Pyodide execution
// --------------------
async function initPython() {
  try {
    pyStatusEl.textContent = "Python loading…";
    pyStatusEl.classList.remove("ready");
    pyStatusEl.classList.add("loading");

    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
    });

    pyodideReady = true;

    pyStatusEl.textContent = "Python ready";
    pyStatusEl.classList.remove("loading");
    pyStatusEl.classList.add("ready");

    setBadge("neutral");
  } catch (err) {
    pyodideReady = false;
    pyStatusEl.textContent = "Python failed to load";
    setBadge("bad");
    outputEl.textContent = String(err);
  }
}

async function runPython(code) {
  if (!pyodideReady || !pyodide) {
    setBadge("warn");
    return { stdout: "", stderr: "Python is still loading…" };
  }

  // Capture stdout/stderr inside Python
  const wrapped = `
import sys, io, traceback
_stdout = io.StringIO()
_stderr = io.StringIO()
_old_out, _old_err = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _stdout, _stderr
try:
${code.split("\n").map(line => "    " + line).join("\n")}
except Exception:
    traceback.print_exc()
finally:
    sys.stdout, sys.stderr = _old_out, _old_err

(_stdout.getvalue(), _stderr.getvalue())
`;

  try {
    const result = await pyodide.runPythonAsync(wrapped);
    const stdout = result[0] || "";
    const stderr = result[1] || "";
    return { stdout, stderr };
  } catch (err) {
    return { stdout: "", stderr: String(err) };
  }
}

// --------------------
// Monaco
// --------------------
function initEditor() {
  // Monaco is AMD loaded via loader.min.js
  require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" }
  });

  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor"), {
      value: "",
      language: "python",
      theme: "vs-dark",
      fontSize: 16,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: "on"
    });

    // Make sure caret is visible by forcing focus on click
    editor.onMouseDown(() => setTimeout(() => editor.focus(), 0));

    loadLesson();
  });
}

// --------------------
// Evaluation
// --------------------
async function onRun() {
  const lesson = lessons[state.currentLessonIndex];
  const code = editor ? editor.getValue() : "";

  setBadge("neutral");
  outputEl.textContent = "Running…";

  const { stdout, stderr } = await runPython(code);

  if (stderr && stderr.trim()) {
    setBadge("bad");
    outputEl.textContent = stderr.trim();
    return;
  }

  outputEl.textContent = (stdout && stdout.trim()) ? stdout.trim() : "(no output)";

  const passed = lesson.check(stdout, code);

  if (passed) {
    setBadge("ok");

    // Award XP only once per lesson completion
    if (!state.completed[lesson.id]) {
      state.completed[lesson.id] = true;
      saveState();
      awardXP(lesson.xpReward);
      renderLessonList();
    }
  } else {
    setBadge("bad");
  }
}

// --------------------
// Wire up
// --------------------
loadState();
renderStats();
renderLessonList();
setBadge("warn");

runBtn.addEventListener("click", onRun);
nextBtn.addEventListener("click", goNextLesson);

resetBtn.addEventListener("click", () => {
  resetState();
  loadLesson();
});

initEditor();
initPython();