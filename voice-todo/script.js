// Advanced Voice To-Do App
// Features: SpeechRecognition, SpeechSynthesis, Hindi/English toggle, waveform, reminders, deadlines, offline AI suggestions.~

// ----------------- Utilities -----------------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function speak(text, lang = currentLang, force=false){
  if (!voiceReplyEnabled && !force) return;
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = lang;
  speechSynthesis.speak(ut);
}

// Format datetime nicely
function formatDateTime(dtStr){
  if(!dtStr) return "";
  const d = new Date(dtStr);
  return d.toLocaleString();
}

// ----------------- State -----------------
let tasks = JSON.parse(localStorage.getItem("tasks_v2") || "[]");
let remindersFired = JSON.parse(localStorage.getItem("remFired_v2") || "[]"); // store fired reminder ids
let currentLang = localStorage.getItem("lang") || "en-US";
let voiceReplyEnabled = (localStorage.getItem("voiceReply") ?? "true") === "true";

// ----------------- Elements -----------------
const speakBtn = $("#speakBtn");
const status = $("#status");
const taskList = $("#taskList");
const manualText = $("#manualText");
const addBtn = $("#addBtn");
const deadlineInput = $("#deadlineInput");
const reminderInput = $("#reminderInput");
const aiBtn = $("#aiBtn");
const langSelect = $("#langSelect");
const darkToggle = $("#darkToggle");
const voiceReplyToggle = $("#voiceReplyToggle");
const summaryText = $("#summaryText");
const upcomingList = $("#upcomingList");
const notifyPermBtn = $("#notifyPermBtn");
const clearAllBtn = $("#clearAllBtn");
const waveCanvas = $("#wave");
const waveCtx = waveCanvas.getContext("2d");

// Initialize UI from state
langSelect.value = currentLang;
voiceReplyToggle.checked = voiceReplyEnabled;
if (localStorage.getItem("dark") === "true") {
  document.body.classList.add("dark");
  darkToggle.checked = true;
}

// ----------------- Rendering -----------------
function saveState(){
  localStorage.setItem("tasks_v2", JSON.stringify(tasks));
  localStorage.setItem("remFired_v2", JSON.stringify(remindersFired));
}

function renderTasks(){
  taskList.innerHTML = "";
  tasks.sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  for(const t of tasks){
    const li = document.createElement("li");
    li.className = "task-item";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${t.text}</strong><div class="meta">${t.deadline ? formatDateTime(t.deadline) : ""} ${t.reminderMinutes? " • Remind "+t.reminderMinutes+"m before":""}</div>`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "Delete";
    del.onclick = ()=> { deleteTask(t.id); };
    const snooze = document.createElement("button");
    snooze.className = "snooze";
    snooze.textContent = "Remind later";
    snooze.onclick = ()=> { snoozeTask(t.id); };
    actions.appendChild(snooze); actions.appendChild(del);
    li.appendChild(left);
    li.appendChild(actions);
    taskList.appendChild(li);
  }
  const pending = tasks.length;
  summaryText.textContent = `${pending} task(s) pending`;
  renderUpcoming();
}

function renderUpcoming(){
  upcomingList.innerHTML = "";
  const upcoming = tasks
    .filter(t=>t.deadline)
    .map(t=>({...t, when: new Date(t.deadline)}))
    .filter(t=>t.when>new Date())
    .sort((a,b)=>a.when-b.when)
    .slice(0,6);

  for(const u of upcoming){
    const li = document.createElement("li");
    li.className = "upcoming-list-item";
    li.textContent = `${u.text} — ${formatDateTime(u.deadline)}`;
    upcomingList.appendChild(li);
  }
}

// ----------------- Task operations -----------------
function addTask(text, deadline=null, reminderMinutes=0, silent=false){
  if(!text || !text.trim()) return;
  const id = "t_"+Date.now()+"_"+Math.floor(Math.random()*1000);
  const task = { id, text: text.trim(), createdAt: new Date().toISOString(), deadline: deadline || null, reminderMinutes: Number(reminderMinutes)||0 };
  tasks.push(task);
  saveState();
  renderTasks();
  if(!silent){
    const reply = currentLang.startsWith("hi") ? `Task jod diya: ${task.text}` : `Task added: ${task.text}`;
    speak(reply, currentLang);
    status.textContent = reply;
  }
}

function deleteTask(id){
  const t = tasks.find(x=>x.id===id);
  tasks = tasks.filter(x=>x.id!==id);
  // remove any fired reminders for it
  remindersFired = remindersFired.filter(r => r.taskId !== id);
  saveState();
  renderTasks();
  const reply = currentLang.startsWith("hi") ? `Task delete kar diya` : `Task deleted`;
  speak(reply, currentLang);
}

function snoozeTask(id){
  // push reminder 5 minutes later
  const t = tasks.find(x=>x.id===id);
  if(!t) return;
  let base = t.deadline ? new Date(t.deadline) : new Date();
  base = new Date(base.getTime() + 5*60000);
  t.deadline = base.toISOString();
  t.reminderMinutes = 0; // clear pre reminder
  saveState(); renderTasks();
  const reply = currentLang.startsWith("hi") ? `5 minute baad yaad dilaunga` : `Will remind in 5 minutes`;
  speak(reply, currentLang);
}

// ----------------- Reminders loop -----------------
function checkReminders(){
  const now = new Date();
  for(const t of tasks){
    if(t.deadline){
      const dl = new Date(t.deadline);
      // reminder moment = deadline - reminderMinutes
      const remAt = new Date(dl.getTime() - (Number(t.reminderMinutes)||0)*60000);
      // if reminder time passed and not fired
      if(remAt <= now && now - remAt < 60000){ // within the last 60s
        const firedKey = `${t.id}_rem`;
        if(!remindersFired.includes(firedKey)){
          // fire
          fireReminder(t);
          remindersFired.push(firedKey);
        }
      }
      // also, if deadline reached exactly
      if(Math.abs(now - dl) < 30000){ // within 30s of deadline
        const firedKey2 = `${t.id}_dl`;
        if(!remindersFired.includes(firedKey2)){
          fireDeadlineAlert(t);
          remindersFired.push(firedKey2);
        }
      }
    }
  }
  saveState();
  renderUpcoming();
}

function fireReminder(t){
  const text = currentLang.startsWith("hi") ? `Yaad dila raha hu: ${t.text}` : `Reminder: ${t.text}`;
  // Browser notification
  if (Notification.permission === "granted") {
    new Notification("Reminder", { body: t.text });
  }
  // Visual + audio
  speak(text, currentLang);
  status.textContent = text;
  // highlight UI briefly
  flashTask(t.id);
}

function fireDeadlineAlert(t){
  const text = currentLang.startsWith("hi") ? `Deadline ho gaya: ${t.text}` : `Deadline reached: ${t.text}`;
  if (Notification.permission === "granted") {
    new Notification("Deadline", { body: t.text });
  }
  speak(text, currentLang);
  status.textContent = text;
  flashTask(t.id);
}

function flashTask(id){
  // briefly highlight
  const items = [...document.querySelectorAll(".task-item")];
  for(const el of items){
    if(el.querySelector("strong") && el.querySelector("strong").textContent === tasks.find(t=>t.id===id)?.text){
      el.style.boxShadow = "0 0 0 4px rgba(255,206,0,0.18)";
      setTimeout(()=> el.style.boxShadow = "", 4000);
    }
  }
}

// check every 20s
setInterval(checkReminders, 20000);
checkReminders();

// ----------------- Speech Recognition -----------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.lang = currentLang;
} else {
  status.textContent = "Speech Recognition not supported in this browser.";
}

// Waveform animation while listening
let waveAnimId = null;
function startWave(){
  let t = 0;
  function draw(){
    waveCtx.clearRect(0,0,waveCanvas.width,waveCanvas.height);
    const w = waveCanvas.width, h = waveCanvas.height;
    for(let i=0;i<20;i++){
      const x = (i/20)*w;
      const amp = (Math.sin(t + i*0.4) + 1) / 2; // 0..1
      const barH = 10 + amp*40;
      waveCtx.fillStyle = "#bfe0ff";
      waveCtx.fillRect(x, h/2 - barH/2, w/22, barH);
    }
    t += 0.15;
    waveAnimId = requestAnimationFrame(draw);
  }
  draw();
}
function stopWave(){ cancelAnimationFrame(waveAnimId); waveCtx.clearRect(0,0,waveCanvas.width,waveCanvas.height); }

// Start listening on button
speakBtn.onclick = ()=>{
  if(!recognition){
    alert("Speech Recognition not supported. Use Chrome-based browser.");
    return;
  }
  recognition.lang = currentLang;
  try { recognition.start(); } catch(e){ /* ignore */ }
  status.textContent = currentLang.startsWith("hi") ? "Listening..." : "Listening...";
  startWave();
};

// Recognition results
if(recognition){
  recognition.addEventListener("result", (ev)=>{
    stopWave();
    const cmd = ev.results[0][0].transcript.toLowerCase().trim();
    handleCommand(cmd);
  });

  recognition.addEventListener("end", ()=>{
    stopWave();
  });

  recognition.addEventListener("error", (e)=>{
    stopWave();
    status.textContent = "Speech error: " + e.error;
  });
}

// ----------------- Command Parser -----------------
function handleCommand(command){
  status.textContent = (currentLang.startsWith("hi") ? "You said: " : "You said: ") + command;

  // Recognize patterns
  if(command.startsWith("add task") || command.startsWith("add")){
    // possible forms:
    // "add task buy milk at 2025-11-22 18:00 remind 10 minutes"
    // For simplicity, we parse: add task <text> [at YYYY-MM-DDTHH:MM] [remind N minutes]
    let text = command.replace(/^add(task)?\s*/, "").trim();
    // check for " at " ISO-ish or " on "
    let deadline = null, reminderM = 0;
    // try to detect " at " with time phrases like " at 6 pm " - we won't parse human time reliably; we accept "at YYYY-MM-DDTHH:MM"
    const atMatch = text.match(/ at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if(atMatch){
      deadline = atMatch[1];
      text = text.replace(atMatch[0], "").trim();
    }
    const remMatch = text.match(/remind (\d+)\s*(min|minute|minutes)?/);
    if(remMatch){
      reminderM = Number(remMatch[1]);
      text = text.replace(remMatch[0],"").trim();
    }
    addTask(text, deadline, reminderM);
    return;
  }

  if(command.startsWith("delete task") || command.startsWith("delete remove remove task")){
    let text = command.replace(/^(delete task|delete|remove task|remove)\s*/,"").trim();
    // delete first matching task by text
    const t = tasks.find(x => x.text.toLowerCase() === text.toLowerCase());
    if(t){ deleteTask(t.id); status.textContent = currentLang.startsWith("hi") ? "Task delete kar diya" : "Task deleted"; }
    else { status.textContent = currentLang.startsWith("hi") ? "Task nahi mila" : "Task not found"; speak(status.textContent, currentLang); }
    return;
  }

  if(command.includes("clear all tasks") || command.includes("clear tasks") || command.includes("clear all")){
    tasks = [];
    remindersFired = [];
    saveState(); renderTasks();
    const r = currentLang.startsWith("hi") ? "Sab tasks hat gaye" : "All tasks cleared";
    speak(r, currentLang); status.textContent = r; return;
  }

  if(command.includes("show tasks") || command.includes("list tasks") || command.includes("what tasks")){
    renderTasks();
    const r = currentLang.startsWith("hi") ? `Aapke ${tasks.length} tasks` : `You have ${tasks.length} tasks`;
    speak(r, currentLang); status.textContent = r; return;
  }

  // AI suggestion command: "what should I do today" or "what should i do"
  if(command.includes("what should i do") || command.includes("what to do") || command.includes("kya karu") || command.includes("kya karna chahiye")){
    const sug = aiSuggestion();
    speak(sug, currentLang);
    status.textContent = sug;
    return;
  }

  // fallback
  const fallback = currentLang.startsWith("hi") ? "Command samjha nahi. Try: Add task ..." : "Command not recognized. Try: Add task ...";
  status.textContent = fallback;
  speak(fallback, currentLang);
}

// ----------------- AI Suggestion (offline rule-based) -----------------
function aiSuggestion(){
  const now = new Date();
  const hour = now.getHours();
  // simple rules
  let suggestion = "";
  if(tasks.length === 0){
    suggestion = currentLang.startsWith("hi") ? "Aaj koi kaam scheduled nahi hai. Aaj ka primary kaam: Learn a new topic for 30 minutes." : "You have no tasks. Suggestion: Learn something new for 30 minutes.";
  } else {
    // prioritize nearest deadline
    const withDeadline = tasks.filter(t=>t.deadline).map(t=>({...t, when:new Date(t.deadline)}));
    if(withDeadline.length){
      withDeadline.sort((a,b)=>a.when-b.when);
      const soon = withDeadline[0];
      suggestion = currentLang.startsWith("hi") ? `Sabse pehle: ${soon.text}. Deadline: ${new Date(soon.deadline).toLocaleString()}` : `First: ${soon.text}. Deadline: ${new Date(soon.deadline).toLocaleString()}`;
    } else {
      // pick shortest task (heuristic: shortest text)
      const short = tasks.slice().sort((a,b)=>a.text.length - b.text.length)[0];
      suggestion = currentLang.startsWith("hi") ? `Start karo: ${short.text}` : `Start with: ${short.text}`;
    }
  }
  // time-based nudge
  if(hour >= 6 && hour < 12) suggestion += currentLang.startsWith("hi") ? " — Subah ka acha time hai focus karne ke liye." : " — Morning is great for focused work.";
  else if(hour >= 18) suggestion += currentLang.startsWith("hi") ? " — Shaam hai, light tasks complete kar lo." : " — Evening — consider light tasks or review.";
  return suggestion;
}

// ----------------- Manual form handlers -----------------
addBtn.onclick = ()=>{
  const text = manualText.value.trim();
  if(!text) return;
  const dl = deadlineInput.value ? new Date(deadlineInput.value).toISOString() : null;
  const rem = reminderInput.value ? Number(reminderInput.value) : 0;
  addTask(text, dl, rem);
  manualText.value = ""; deadlineInput.value = ""; reminderInput.value = ""; reminderInput.value = "";
};

clearAllBtn.onclick = ()=>{
  if(confirm("Clear all tasks?")) {
    tasks = []; remindersFired = []; saveState(); renderTasks();
  }
};

// ----------------- Language, dark mode, voiceReply toggles -----------------
langSelect.onchange = (e)=>{
  currentLang = e.target.value;
  localStorage.setItem("lang", currentLang);
  if(recognition) recognition.lang = currentLang;
  speak(currentLang.startsWith("hi") ? "भाषा बदल दी गई" : "Language changed", currentLang);
};

darkToggle.onchange = (e)=>{
  if(e.target.checked){ document.body.classList.add("dark"); localStorage.setItem("dark","true"); }
  else { document.body.classList.remove("dark"); localStorage.setItem("dark","false"); }
};

voiceReplyToggle.onchange = (e)=>{
  voiceReplyEnabled = e.target.checked;
  localStorage.setItem("voiceReply", voiceReplyEnabled?"true":"false");
};

// ----------------- Notifications permission -----------------
notifyPermBtn.onclick = async ()=>{
  if(!("Notification" in window)){ alert("Notifications not supported"); return; }
  const p = await Notification.requestPermission();
  if(p === "granted"){ notifyPermBtn.textContent = "Notifications Enabled"; speak(currentLang.startsWith("hi") ? "Notifications enabled" : "Notifications enabled", currentLang); }
};

// ----------------- Helper functions -----------------
function deleteTaskByText(text){
  const t = tasks.find(x => x.text.toLowerCase() === text.toLowerCase());
  if(t) deleteTask(t.id);
}

function parseAndAddSimpleVoiceAdd(command){
  // shorthand when user says "add buy milk tomorrow 6pm" - not implemented: keep simple
  addTask(command);
}

// simple snooze: add 5 min to deadline if exists
function snoozeByText(text){
  const t = tasks.find(x=>x.text.toLowerCase()===text.toLowerCase());
  if(t){ snoozeTask(t.id); }
}

// ----------------- Init -----------------
renderTasks();
status.textContent = currentLang.startsWith("hi") ? "Ready. Bol kar try karein." : "Ready. Try speaking.";

// expose some helpers for console debugging
window.__vtd = { addTask, deleteTask, tasks };

// ----------------- Wave canvas size responsive -----------------
function resizeWave(){ waveCanvas.width = Math.min(220, Math.max(180, Math.floor(window.innerWidth*0.18))); }
resizeWave();
window.addEventListener("resize", resizeWave);