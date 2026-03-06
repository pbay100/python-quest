/* =========================
   Python Quest - Learn + Test
   Full script with:
   - Robust Pyodide init + retry
   - Learn/Test tabs
   - Unlimited generated tests
   - Learn completion -> sidebar shows Done
========================= */

let editor = null;
let pyodide = null;
let pyodideLoading = false;

const ui = {
  lessonList: document.getElementById("lessonList"),
  lessonTitle: document.getElementById("lessonTitle"),
  lessonDesc: document.getElementById("lessonDesc"),
  tabLearn: document.getElementById("tabLearn"),
  tabTest: document.getElementById("tabTest"),
  modeBadge: document.getElementById("modeBadge"),

  runBtn: document.getElementById("runBtn"),
  output: document.getElementById("output"),
  evalBadge: document.getElementById("evalBadge"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  pyStatus: document.getElementById("pyStatus"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn"),

  testPanel: document.getElementById("testPanel"),
  testPrompt: document.getElementById("testPrompt"),
  testDifficultyText: document.getElementById("testDifficultyText"),
  newTestBtn: document.getElementById("newTestBtn"),
  revealBtn: document.getElementById("revealBtn"),
  hintWrap: document.getElementById("hintWrap"),
  hintText: document.getElementById("hintText"),
  revealWrap: document.getElementById("revealWrap"),
  answerBox: document.getElementById("answerBox"),

  levelValue: document.getElementById("levelValue"),
  xpValue: document.getElementById("xpValue"),
  xpFill: document.getElementById("xpFill"),
  xpText: document.getElementById("xpText"),
};

/* =========================
   Add Retry Python button
========================= */
function ensureRetryButton() {
  if (document.getElementById("retryPyBtn")) return;

  const btn = document.createElement("button");
  btn.id = "retryPyBtn";
  btn.type = "button";
  btn.className = "btn secondary";
  btn.textContent = "Retry Python";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "999px";
  btn.style.fontSize = "12px";

  btn.addEventListener("click", async () => {
    ui.output.textContent = "Retrying Python runtime…";
    await initPython(true);
  });

  ui.pyStatus.parentElement?.appendChild(btn);
}

/* =========================
   Lessons Data
========================= */

const lessons = [
  {
    id: 1,
    title: "Lesson 1: Variables",
    description: "Store data in a variable, then print it. Variables are named containers for values.",
    starterCode: `# Lesson 1: Variables
name = "Python Hero"
print("Hello", name)
`,
    learnExpectedOutput: "Hello Python Hero",
    learnHint: `Make sure you create a variable called name, then print using: print("Hello", name)`,
    xp: 30,
    generators: {
      easy: genVariablesEasy,
      medium: genVariablesMedium,
      hard: genVariablesHard,
    }
  },
  {
    id: 2,
    title: "Lesson 2: Numbers",
    description: "Work with numbers and basic arithmetic. Use +, -, *, / and print results.",
    starterCode: `# Lesson 2: Numbers
a = 10
b = 5
print(a + b)
`,
    learnExpectedOutput: "15",
    learnHint: `Create variables a = 10 and b = 5, then use: print(a + b)`,
    xp: 40,
    generators: {
      easy: genNumbersEasy,
      medium: genNumbersMedium,
      hard: genNumbersHard,
    }
  },
  {
    id: 3,
    title: "Lesson 3: Strings",
    description: "Strings are text. You can join strings, format them, and print results.",
    starterCode: `# Lesson 3: Strings
first = "Python"
second = "Quest"
print(first + " " + second)
`,
    learnExpectedOutput: "Python Quest",
    learnHint: `Print with a space between the two words. Example: print(first + " " + second)`,
    xp: 50,
    generators: {
      easy: genStringsEasy,
      medium: genStringsMedium,
      hard: genStringsHard,
    }
  }
];

/* =========================
   State
========================= */

const state = {
  currentLessonId: 1,
  mode: "learn",
  currentTest: null,
  completedLessons: {},
  learnCompletedLessons: {},
};

function loadState(){
  try{
    const raw = localStorage.getItem("pythonQuestState");
    if(!raw) return;
    const parsed = JSON.parse(raw);

    if(typeof parsed.currentLessonId === "number") {
      state.currentLessonId = parsed.currentLessonId;
    }

    if(parsed.completedLessons && typeof parsed.completedLessons === "object") {
      state.completedLessons = parsed.completedLessons;
    }

    if(parsed.learnCompletedLessons && typeof parsed.learnCompletedLessons === "object") {
      state.learnCompletedLessons = parsed.learnCompletedLessons;
    }
  }catch(e){
    // ignore bad local state
  }
}

function saveState(){
  const payload = {
    currentLessonId: state.currentLessonId,
    completedLessons: state.completedLessons,
    learnCompletedLessons: state.learnCompletedLessons
  };
  localStorage.setItem("pythonQuestState", JSON.stringify(payload));
}

/* =========================
   Monaco Editor
========================= */

function initEditor(){
  return new Promise((resolve, reject) => {
    window.require(["vs/editor/editor.main"], () => {
      editor = monaco.editor.create(document.getElementById("editor"), {
        value: "",
        language: "python",
        theme: "vs-dark",
        minimap: { enabled: false },
        fontSize: 14,
        automaticLayout: true,
      });
      resolve();
    }, reject);
  });
}

/* =========================
   Pyodide
========================= */

function setPyStatus(kind, text){
  ui.pyStatus.textContent = text;
  ui.pyStatus.className = `pyStatus ${kind}`;
}

function friendlyPyodideError(err){
  const msg = String(err || "");
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return `Pyodide failed to download required files (network/CDN blocked).

Likely causes:
- Ad blocker / privacy protection
- Corporate or ISP filtering
- Temporary CDN issue

Try disabling blockers for localhost or click Retry Python.`;
  }
  return msg;
}

async function initPython(force = false){
  ensureRetryButton();

  if (pyodideLoading) return;
  if (pyodide && !force) {
    setPyStatus("ready", "Python ready");
    return;
  }

  pyodideLoading = true;
  pyodide = null;

  try{
    setPyStatus("loading", "Python loading…");
    ui.output.textContent = "Loading Python (Pyodide)…";

    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
    });

    setPyStatus("ready", "Python ready");
    ui.output.textContent = "Python ready. Press “Run Code”.";
  }catch(err){
    setPyStatus("error", "Python error");
    ui.output.textContent = `PYTHON LOAD ERROR:\n\n${friendlyPyodideError(err)}`;
  }finally{
    pyodideLoading = false;
  }
}

/* =========================
   Rendering
========================= */

function getCurrentLesson(){
  return lessons.find(l => l.id === state.currentLessonId) || lessons[0];
}

function renderLessonList(){
  ui.lessonList.innerHTML = "";

  lessons.forEach(lesson => {
    const card = document.createElement("div");
    card.className = "lessonCard";
    card.dataset.lessonId = String(lesson.id);

    const done =
      !!state.completedLessons[lesson.id] ||
      !!state.learnCompletedLessons[lesson.id];

    card.innerHTML = `
      <div class="lessonRow">
        <div>
          <div class="lessonTitle">${lesson.title}</div>
          <div class="lessonXP">${lesson.xp} XP</div>
        </div>
        <div class="pill ${done ? "done" : "new"}">${done ? "Done" : "New"}</div>
      </div>
    `;

    card.addEventListener("click", () => {
      state.currentLessonId = lesson.id;
      saveState();
      loadLesson();
    });

    ui.lessonList.appendChild(card);
  });
}

function setMode(mode){
  state.mode = mode;

  if(mode === "learn"){
    ui.tabLearn.classList.add("active");
    ui.tabTest.classList.remove("active");
    ui.modeBadge.textContent = "Learn";
    ui.testPanel.style.display = "none";
    ui.difficultyBadge.style.display = "none";
    ui.hintWrap.style.display = "none";
    ui.revealWrap.style.display = "none";
    ui.evalBadge.textContent = "Not run";
    ui.evalBadge.className = "smallBadge neutral";
  }else{
    ui.tabTest.classList.add("active");
    ui.tabLearn.classList.remove("active");
    ui.modeBadge.textContent = "Test";
    ui.testPanel.style.display = "block";
    ui.evalBadge.textContent = "Not run";
    ui.evalBadge.className = "smallBadge neutral";
    ui.hintWrap.style.display = "none";
    ui.revealWrap.style.display = "none";
    ui.difficultyBadge.style.display = "inline-flex";
    generateNewTest();
  }
}

function loadLesson(){
  const lesson = getCurrentLesson();

  ui.lessonTitle.textContent = lesson.title;
  ui.lessonDesc.textContent = lesson.description;

  if(state.mode === "learn"){
    editor.setValue(lesson.starterCode);
  }else{
    generateNewTest();
  }

  renderLessonList();
}

function renderDifficulty(difficulty){
  ui.testDifficultyText.textContent = difficulty[0].toUpperCase() + difficulty.slice(1);
  ui.difficultyBadge.textContent = ui.testDifficultyText.textContent;

  ui.difficultyBadge.classList.remove("easy","medium","hard");
  ui.difficultyBadge.classList.add(difficulty);
}

/* =========================
   Test Generation
========================= */

function pickDifficulty(){
  const r = Math.random();
  if(r < 0.45) return "easy";
  if(r < 0.80) return "medium";
  return "hard";
}

function generateNewTest(){
  const lesson = getCurrentLesson();
  const difficulty = pickDifficulty();
  const gen = lesson.generators[difficulty];

  const test = gen();
  state.currentTest = { ...test, difficulty };

  renderDifficulty(difficulty);

  ui.testPrompt.textContent = test.prompt;
  ui.hintWrap.style.display = "none";
  ui.revealWrap.style.display = "none";
  ui.answerBox.textContent = "";
  ui.output.textContent = "Press “Run Code”.";
  ui.evalBadge.textContent = "Not run";
  ui.evalBadge.className = "smallBadge neutral";

  editor.setValue(test.starterCode || "# Write your solution here\n");
}

function revealAnswer(){
  if(!state.currentTest) return;
  ui.revealWrap.style.display = "block";
  ui.answerBox.textContent = state.currentTest.solution;
}

/* =========================
   Python Runner
========================= */

async function runPython(code){
  if(!pyodide){
    return { ok:false, stdout:"", error:"Python not ready yet. Click Retry Python or refresh." };
  }

  const wrapped = `
import sys
from io import StringIO

_buf = StringIO()
_old = sys.stdout
sys.stdout = _buf

try:
${indentPython(code, 4)}
finally:
  sys.stdout = _old

_buf.getvalue()
`;

  try{
    const result = await pyodide.runPythonAsync(wrapped);
    const stdout = String(result ?? "");
    return { ok:true, stdout, error:null };
  }catch(err){
    return { ok:false, stdout:"", error:String(err) };
  }
}

function indentPython(code, spaces){
  const pad = " ".repeat(spaces);
  return code
    .split("\n")
    .map(line => (line.trim().length ? pad + line : pad))
    .join("\n");
}

/* =========================
   Evaluation
========================= */

function normalizeOutput(s){
  return String(s).replace(/\r\n/g, "\n").trim();
}

function showIncorrect(hint){
  ui.evalBadge.textContent = "Incorrect";
  ui.evalBadge.className = "smallBadge hard";
  ui.hintWrap.style.display = "block";
  ui.hintText.textContent = hint || "Try again.";
}

function showPassed(){
  ui.evalBadge.textContent = "Passed";
  ui.evalBadge.className = "smallBadge easy";
  ui.hintWrap.style.display = "none";
  ui.revealWrap.style.display = "none";

  state.completedLessons[state.currentLessonId] = true;
  saveState();
  renderLessonList();

  setTimeout(() => generateNewTest(), 450);
}

/* =========================
   Wire Up
========================= */

ui.tabLearn.addEventListener("click", () => {
  setMode("learn");
  loadLesson();
});

ui.tabTest.addEventListener("click", () => {
  setMode("test");
  loadLesson();
});

ui.newTestBtn.addEventListener("click", () => generateNewTest());
ui.revealBtn.addEventListener("click", () => revealAnswer());

ui.nextBtn.addEventListener("click", () => {
  const idx = lessons.findIndex(l => l.id === state.currentLessonId);
  const next = lessons[idx + 1] || lessons[0];
  state.currentLessonId = next.id;
  saveState();
  loadLesson();
});

ui.resetBtn.addEventListener("click", () => {
  if(!confirm("Reset all progress? This will clear completed lessons.")) return;
  state.completedLessons = {};
  state.learnCompletedLessons = {};
  saveState();
  renderLessonList();
  loadLesson();
});

ui.runBtn.addEventListener("click", async () => {
  const code = editor.getValue();

  ui.output.textContent = "Running…";
  ui.evalBadge.textContent = "Running";
  ui.evalBadge.className = "smallBadge neutral";

  const res = await runPython(code);

  if(!res.ok){
    ui.output.textContent = res.error || "Error";
    showIncorrect("Your code errored or Python isn't ready. Fix the message above and run again.");
    return;
  }

  ui.output.textContent = res.stdout.length ? res.stdout : "(no output)";

  if(state.mode === "learn"){
    const lesson = getCurrentLesson();
    const actual = normalizeOutput(res.stdout);
    const expected = normalizeOutput(lesson.learnExpectedOutput || "");

    if(expected && actual === expected){
      state.learnCompletedLessons[state.currentLessonId] = true;
      saveState();
      renderLessonList();

      ui.evalBadge.textContent = "Complete";
      ui.evalBadge.className = "smallBadge easy";
      ui.hintWrap.style.display = "none";
    } else {
      ui.evalBadge.textContent = "Not complete";
      ui.evalBadge.className = "smallBadge hard";

      if(lesson.learnHint){
        ui.output.textContent =
          (res.stdout.length ? res.stdout : "(no output)") +
          `\n\nHINT:\n${lesson.learnHint}\n\nExpected output:\n${lesson.learnExpectedOutput}`;
      }
    }
    return;
  }

  const t = state.currentTest;
  if(!t){
    showIncorrect("No test loaded. Click New Test.");
    return;
  }

  const actual = normalizeOutput(res.stdout);
  const expected = normalizeOutput(t.expectedOutput);

  if(actual === expected){
    showPassed();
  }else{
    showIncorrect(t.hint);
  }
});

/* =========================
   Test Generators
========================= */

function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

/* VARIABLES */
function genVariablesEasy(){
  const names = ["Python Hero","Code Wizard","Space Captain","Data Ninja","Luke"];
  const n = pick(names);
  return {
    prompt: `Create a variable called name with the value "${n}" then print: Hello <name>\n\nExpected:\nHello ${n}`,
    starterCode: `# Create name, then print Hello <name>\n`,
    solution: `name = "${n}"\nprint("Hello", name)\n`,
    expectedOutput: `Hello ${n}`,
    hint: `Create name = "..." then: print("Hello", name)`,
  };
}

function genVariablesMedium(){
  const item = pick(["lightsaber","blaster","droid","ship","helmet"]);
  const qty = randInt(2, 9);
  return {
    prompt: `Create item="${item}" and qty=${qty}. Print:\nI have <qty> <item>\nExample:\nI have 3 droid`,
    starterCode: `# Create item and qty, then print the sentence\n`,
    solution: `item = "${item}"\nqty = ${qty}\nprint("I have", qty, item)\n`,
    expectedOutput: `I have ${qty} ${item}`,
    hint: `Use: print("I have", qty, item)`,
  };
}

function genVariablesHard(){
  const a = randInt(3, 12);
  const b = randInt(3, 12);
  return {
    prompt: `Create a=${a} and b=${b}. Print:\nSum: <result>`,
    starterCode: `# Create a and b, then print "Sum: <result>"\n`,
    solution: `a = ${a}\nb = ${b}\nprint("Sum:", a + b)\n`,
    expectedOutput: `Sum: ${a + b}`,
    hint: `Try: print("Sum:", a + b)`,
  };
}

/* NUMBERS */
function genNumbersEasy(){
  const a = randInt(1, 20);
  const b = randInt(1, 20);
  return {
    prompt: `Print the result of ${a} + ${b}`,
    starterCode: `# Print the result\n`,
    solution: `print(${a} + ${b})\n`,
    expectedOutput: `${a + b}`,
    hint: `Use print(${a} + ${b}).`,
  };
}

function genNumbersMedium(){
  const a = randInt(2, 20);
  const b = randInt(2, 20);
  return {
    prompt: `Create a=${a}, b=${b}. Print a*b.`,
    starterCode: `# Create a and b, then print a*b\n`,
    solution: `a = ${a}\nb = ${b}\nprint(a * b)\n`,
    expectedOutput: `${a * b}`,
    hint: `Multiplication is *`,
  };
}

function genNumbersHard(){
  const a = randInt(10, 99);
  const b = randInt(2, 9);
  return {
    prompt: `Create a=${a}, b=${b}. Print:\n1) a // b\n2) a % b\n(each on new line)`,
    starterCode: `# Print integer division then remainder\n`,
    solution: `a = ${a}\nb = ${b}\nprint(a // b)\nprint(a % b)\n`,
    expectedOutput: `${Math.floor(a / b)}\n${a % b}`,
    hint: `Use // then % (two print lines).`,
  };
}

/* STRINGS */
function genStringsEasy(){
  const w1 = pick(["Python","Space","Retro","VHS","Horror"]);
  const w2 = pick(["Quest","Hero","Runner","Coder","Wizard"]);
  return {
    prompt: `Create word1="${w1}" and word2="${w2}". Print them with a space.\nExample:\nPython Quest`,
    starterCode: `# Create word1 and word2, then print them with a space\n`,
    solution: `word1 = "${w1}"\nword2 = "${w2}"\nprint(word1, word2)\n`,
    expectedOutput: `${w1} ${w2}`,
    hint: `print(word1, word2) adds a space automatically.`,
  };
}

function genStringsMedium(){
  const name = pick(["Felipe","Pete","Cindy","Volt","Millie"]);
  return {
    prompt: `Create name="${name}". Print:\nWelcome, <name>!`,
    starterCode: `# Create name and print the welcome line\n`,
    solution: `name = "${name}"\nprint("Welcome,", name + "!")\n`,
    expectedOutput: `Welcome, ${name}!`,
    hint: `Make sure the ! touches the name (name + "!").`,
  };
}

function genStringsHard(){
  const animal = pick(["cockapoo","droid","dragon","monster","robot"]);
  const n = randInt(2, 6);
  return {
    prompt: `Create thing="${animal}" and n=${n}. Print:\nI saw <n> <thing>s`,
    starterCode: `# Print plural by adding 's'\n`,
    solution: `thing = "${animal}"\nn = ${n}\nprint("I saw", n, thing + "s")\n`,
    expectedOutput: `I saw ${n} ${animal}s`,
    hint: `Plural by thing + "s".`,
  };
}

/* =========================
   Boot
========================= */

async function boot(){
  loadState();

  await initEditor();
  renderLessonList();

  setMode("learn");
  loadLesson();

  await initPython(false);
}

boot();