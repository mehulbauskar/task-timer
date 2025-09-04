/* Task Timer with Nested Tasks — FIXED JS
   - Works as Guest (localStorage) or with Supabase login
   - Subtasks (parent_id), expand/collapse, cascade delete
*/

const SUPABASE_URL = "https://ywayxnebgheyxtunsvdu.supabase.co";     // e.g., "https://YOUR-PROJECT.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3YXl4bmViZ2hleXh0dW5zdmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MzM2MjksImV4cCI6MjA3MjUwOTYyOX0.qLKgOxZKC9ctljkKDpok4ZPeWBFBP8en7eBDnliz6m4"; // e.g., "eyJhbGciOiJIUzI1NiIs..."

let supa = null;
let authUser = null;
let isGuest = false;

const GUEST_FLAG     = "tt_guest_mode";
const LOCAL_TASKS_KEY= "tt_guest_tasks";
const EXPAND_KEY     = "tt_expand_state";
const INTERVAL_MS    = 1000;
let tickHandle = null;

const clientNowIso = () => new Date().toISOString();

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  // Supabase (optional)
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await supa.auth.getSession();
    authUser = data.session?.user ?? null;
    supa.auth.onAuthStateChange((_e, session) => {
      authUser = session?.user ?? null;
      if (authUser) {
        // migrate guest → account then refresh
        if (localStorage.getItem(GUEST_FLAG) === "1") {
          migrateGuestTasksToSupabase().then(() => {
            localStorage.removeItem(GUEST_FLAG);
            isGuest = false;
            renderAuthControls();
            refreshTasks();
          });
        } else {
          isGuest = false;
          renderAuthControls();
          refreshTasks();
        }
      } else {
        renderAuthControls();
        refreshTasks();
      }
    });
  }

  isGuest = localStorage.getItem(GUEST_FLAG) === "1" && !authUser;

  setupUI();
  renderAuthControls();
  refreshTasks();
  startTicker();
});

// ---------- UI wires ----------
function setupUI() {
  const addBtn = document.getElementById("addTaskBtn");
  if (addBtn) addBtn.addEventListener("click", addTaskFromForm);
  const closeBtn = document.getElementById("authClose");
  if (closeBtn) closeBtn.addEventListener("click", () => closeAuth());

  document.querySelectorAll(".filters .chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".filters .chip").forEach(c => c.classList.remove("chip-active"));
      e.currentTarget.classList.add("chip-active");
      refreshTasks();
    });
  });

  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", onAuthTab));
  const af = document.getElementById("authForm");
  if (af) af.addEventListener("submit", onAuthSubmit);
}

function renderAuthControls() {
  const el = document.getElementById("authControls");
  if (!el) return;
  el.innerHTML = "";

  if (authUser) {
    el.append(child(`<span class="muted">${authUser.email ?? "Account"}</span>`));
    el.append(btn("Logout", async () => { await supa.auth.signOut(); }));
    return;
  }
  if (isGuest) {
    el.append(child(`<span class="muted">Guest</span>`));
    el.append(btn("Login", openAuth));
    return;
  }
  el.append(btn("Login", openAuth));
  el.append(btn("Continue as Guest", () => {
    isGuest = true;
    localStorage.setItem(GUEST_FLAG, "1");
    refreshTasks();
    renderAuthControls();
  }, "btn"));
}

function openAuth() {
  if (!supa) {
    alert("To enable login, set SUPABASE_URL and SUPABASE_ANON_KEY in app.js and reload.");
    return;
  }
  const d = document.getElementById("authDialog");
  if (d?.showModal) d.showModal();
}
function closeAuth(){ document.getElementById("authDialog")?.close?.(); }

let authMode = "signin";
function onAuthTab(e) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("tab-active"));
  e.currentTarget.classList.add("tab-active");
  authMode = e.currentTarget.getAttribute("data-mode");

  const title  = document.getElementById("authTitle");
  const pwWrap = document.getElementById("authPassword")?.parentElement;
  const submit = document.getElementById("authSubmit");

  if (title)  title.textContent = authMode === "signup" ? "Create account" : authMode === "magic" ? "Magic link" : "Sign in";
  if (pwWrap) pwWrap.style.display = authMode === "magic" ? "none" : "grid";
  if (submit) submit.textContent = authMode === "signup" ? "Sign up" : authMode === "magic" ? "Send link" : "Sign in";
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const msg = document.getElementById("authMessage"); if (msg) msg.textContent = "";
  if (!supa) { if (msg) msg.textContent = "Supabase not configured."; return; }

  try {
    if (authMode === "magic") {
      const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('#')[0] } });
      if (error) throw error;
      if (msg) msg.textContent = "Check your email for the login link.";
    } else if (authMode === "signup") {
      const { error } = await supa.auth.signUp({ email, password });
      if (error) throw error;
      if (msg) msg.textContent = "Account created. Check your inbox to confirm.";
    } else {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuth();
    }
  } catch (err) {
    if (msg) msg.textContent = err?.message ?? "Auth failed";
  }
}

// ---------- Helpers ----------
function btn(label, onClick, cls = "btn btn-primary") {
  const b = document.createElement("button");
  b.className = cls; b.textContent = label; b.addEventListener("click", onClick);
  return b;
}
function iconBtn(html, onClick, title) {
  const b = document.createElement("button");
  b.className = "icon-btn"; b.innerHTML = html; if (title) b.title = title;
  b.addEventListener("click", onClick); return b;
}
function child(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function formatHMS(totalSec) {
  const s = totalSec % 60, m = Math.floor(totalSec / 60) % 60, h = Math.floor(totalSec / 3600);
  return [h,m,s].map(n => String(n).padStart(2,"0")).join(":");
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, (m) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  })[m]);
}

// ---------- Filters / stats ----------
function getFilter() {
  const active = document.querySelector(".filters .chip-active");
  return active?.dataset.filter ?? "all";
}
function computeStats(tasks) {
  return {
    active: tasks.filter(t => t.status === "incomplete").length,
    running: tasks.filter(t => t.running).length,
    completed: tasks.filter(t => t.status === "complete").length,
    totalTime: tasks.reduce((a,t)=>a+(t.elapsed_seconds||0),0)
  };
}

// ---------- Timer ticker ----------
function startTicker() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    document.querySelectorAll("[data-running='true']").forEach(el => {
      const startedAt = new Date(el.getAttribute("data-started-at"));
      const base = parseInt(el.getAttribute("data-base"), 10) || 0;
      const diff = Math.floor((Date.now() - startedAt.getTime())/1000);
      el.textContent = formatHMS(base + diff);
    });
  }, INTERVAL_MS);
}

// ---------- Data (local vs supabase) ----------
function lsGet(){ try{ return JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]'); } catch { return []; } }
function lsSet(v){ localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(v)); }

async function listTasks() {
  if (!authUser && !supa) isGuest = true;
  if (isGuest || !supa || !authUser) return lsGet();
  const { data, error } = await supa.from("tasks").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function addTask(task) {
  if (isGuest || !supa || !authUser) {
    const cur = lsGet();
    task.id = crypto.randomUUID();
    cur.push(task); lsSet(cur); return task;
  }
  const { data, error } = await supa.from("tasks").insert(task).select().single();
  if (error) throw error; return data;
}
async function updateTask(id, patch) {
  if (isGuest || !supa || !authUser) {
    const cur = lsGet().map(t => t.id===id ? { ...t, ...patch } : t);
    lsSet(cur); return;
  }
  const { error } = await supa.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}
async function deleteTask(id) {
  if (isGuest || !supa || !authUser) {
    const all = lsGet();
    const keep = all.filter(t => !isDescendant(all, t.id, id)); // cascade local
    lsSet(keep); return;
  }
  const { error } = await supa.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
function isDescendant(all, nodeId, rootId) {
  if (nodeId === rootId) return true;
  let cur = all.find(x => x.id === nodeId);
  while (cur && cur.parent_id) {
    if (cur.parent_id === rootId) return true;
    cur = all.find(x => x.id === cur.parent_id);
  }
  return false;
}

// ---------- Task actions ----------
async function startTask(id) {
  const t = (await listTasks()).find(x => x.id===id);
  if (!t || t.running) return;
  await updateTask(id, { running: true, started_at: clientNowIso() });
}
async function pauseTask(id) {
  const t = (await listTasks()).find(x => x.id===id);
  if (!t || !t.running || !t.started_at) return;
  const delta = Math.floor((Date.now() - new Date(t.started_at).getTime())/1000);
  const newElapsed = (t.elapsed_seconds || 0) + delta;
  await updateTask(id, { running: false, started_at: null, elapsed_seconds: newElapsed });
}
async function completeTask(id) {
  const t = (await listTasks()).find(x => x.id===id);
  if (!t) return;
  if (t.running) await pauseTask(id);
  await updateTask(id, { status: "complete" });
}
async function restartTask(id) {
  await updateTask(id, { elapsed_seconds: 0, running: false, started_at: null, status: "incomplete" });
}
async function restoreTask(id) {
  await updateTask(id, { status: "incomplete" });
}

// ---------- Tree + render ----------
function buildTree(tasks) {
  const byId = new Map(tasks.map(t => [t.id, { ...t, children: [] }]));
  const roots = [];
  for (const t of byId.values()) {
    if (t.parent_id && byId.has(t.parent_id)) {
      byId.get(t.parent_id).children.push(t);
    } else {
      roots.push(t);
    }
  }
  return { roots, byId };
}

function loadExpandState() {
  try { return JSON.parse(localStorage.getItem(EXPAND_KEY) || "{}"); } catch { return {}; }
}
function saveExpandState(state) {
  localStorage.setItem(EXPAND_KEY, JSON.stringify(state));
}

async function addTaskFromForm() {
  const title = document.getElementById("newTaskTitle").value.trim();
  const due = document.getElementById("newTaskDue").value || null;
  const project = document.getElementById("newTaskProject").value || null;
  if (!title) return;
  await addTask({ title, due_date: due, project, status: "incomplete", elapsed_seconds: 0, running: false, started_at: null, parent_id: null });
  document.getElementById("newTaskTitle").value = "";
  refreshTasks();
}

function formatDisplayTime(t) {
  if (t.running && t.started_at) {
    const base = t.elapsed_seconds || 0;
    const diff = Math.floor((Date.now() - new Date(t.started_at).getTime())/1000);
    return formatHMS(base + diff);
  }
  return formatHMS(t.elapsed_seconds || 0);
}

async function refreshTasks() {
  const filter = getFilter();
  const tbody = document.getElementById("taskTbody");
  const tasks = await listTasks();

  const nowDate = new Date();
  const filtered = tasks.filter(t => {
    if (filter === "active")    return t.status === "incomplete";
    if (filter === "completed") return t.status === "complete";
    if (filter === "scheduled") return !!t.due_date;
    if (filter === "overdue")   return t.due_date && new Date(t.due_date) < nowDate && t.status !== "complete";
    return true;
  });

  const stats = computeStats(filtered);
  const qs = document.getElementById("quickStats");
  if (qs) qs.textContent = `${stats.active} active • ${stats.running} running • ${stats.completed} completed • ${formatHMS(stats.totalTime)} total`;

  const { roots } = buildTree(filtered);
  const expand = loadExpandState();

  if (tbody) tbody.innerHTML = "";
  for (const r of roots) renderNode(r, 0, tbody, expand, filtered);

  saveExpandState(expand);
}

function renderNode(node, depth, tbody, expand, all) {
  const tr = document.createElement("tr");
  const statusPill = `<span class="status-pill ${node.status==='complete'?'pill-complete':'pill-incomplete'}">${node.status==='complete'?'Complete':'Incomplete'}</span>`;

  const titleTd = document.createElement("td");
  titleTd.style.paddingLeft = `${12 + depth*20}px`;

  const hasChildren = all.some(t => t.parent_id === node.id);
  const caret = hasChildren ? (expand[node.id] ? "▾" : "▸") : "•";
  const caretBtn = iconBtn(caret, () => {
    if (!hasChildren) return;
    expand[node.id] = !expand[node.id];
    refreshTasks();
  }, hasChildren ? "Expand/Collapse" : "Leaf");
  caretBtn.style.marginRight = "6px";

  const titleSpan = child(`<span>${escapeHtml(node.title)}</span>`);
  titleTd.append(caretBtn, titleSpan);

  const projectTd = child(`<td>${node.project ? escapeHtml(node.project) : "—"}</td>`);

  // controls
  const controls = document.createElement("div"); controls.className = "controls";
  const playBtn = btn(node.running ? "Pause" : "Play", async () => {
    if (node.running) await pauseTask(node.id);
    else await startTask(node.id);
    refreshTasks();
  }, node.running ? "btn pause" : "btn play");
  const endBtn = btn("End", async () => { await completeTask(node.id); refreshTasks(); }, "btn end");
  controls.append(playBtn, endBtn);
  const controlsTd = document.createElement("td"); controlsTd.append(controls);

  // time cell
  const timeSpan = child(`<span class="muted"></span>`);
  timeSpan.textContent = formatDisplayTime(node);
  if (node.running && node.started_at) {
    timeSpan.dataset.running = "true";
    timeSpan.dataset.startedAt = node.started_at;
    timeSpan.dataset.base = String(node.elapsed_seconds || 0);
    timeSpan.setAttribute("data-started-at", node.started_at);
  }
  const timeTd = document.createElement("td"); timeTd.append(timeSpan);

  const statusTd = child(`<td>${statusPill}</td>`);
  const dueTd = child(`<td>${node.due_date ? new Date(node.due_date).toISOString().slice(0,10) : "—"}</td>`);

  // actions
  const actions = document.createElement("div"); actions.className = "controls";
  const subBtn = btn("Add Subtask", async () => {
    const title = prompt("Subtask title?");
    if (!title) return;
    await addTask({ title, parent_id: node.id, status: "incomplete", elapsed_seconds: 0, running: false, started_at: null, due_date: null, project: node.project ?? null });
    refreshTasks();
  }, "btn");
  const restartBtn = btn("Restart", async () => { await restartTask(node.id); refreshTasks(); }, "btn");
  const restoreBtn = btn("Restore", async () => { await restoreTask(node.id); refreshTasks(); }, "btn");
  const delBtn = btn("Delete", async () => {
    if (confirm("Delete this task and all its subtasks?")) {
      await deleteTask(node.id); refreshTasks();
    }
  }, "btn");
  if (node.status === "complete") actions.append(restoreBtn);
  else actions.append(restartBtn);
  actions.append(subBtn, delBtn);
  const actionsTd = document.createElement("td"); actionsTd.append(actions);

  tr.append(titleTd, projectTd, controlsTd, timeTd, statusTd, dueTd, actionsTd);
  if (tbody) tbody.append(tr);

  if (expand[node.id]) {
    const children = all.filter(t => t.parent_id === node.id);
    for (const c of children) renderNode(c, depth+1, tbody, expand, all);
  }
}

// ---------- Guest → Supabase migration ----------
async function migrateGuestTasksToSupabase() {
  if (!supa || !authUser) return;
  const guest = lsGet();
  if (!guest.length) return;

  // Insert parents first, then children (keep same ids)
  const byId = new Map(guest.map(g => [g.id, g]));
  const memo = new Map();
  const depthOf = (item) => {
    if (memo.has(item.id)) return memo.get(item.id);
    let d = 0, p = item.parent_id ? byId.get(item.parent_id) : null;
    while (p) { d += 1; p = p.parent_id ? byId.get(p.parent_id) : null; }
    memo.set(item.id, d); return d;
  };
  const sorted = guest.slice().sort((a,b) => depthOf(a) - depthOf(b));

  for (const g of sorted) {
    const payload = {
      id: g.id, title: g.title, status: g.status, elapsed_seconds: g.elapsed_seconds || 0,
      due_date: g.due_date ?? null, project: g.project ?? null, running: false, started_at: null,
      parent_id: g.parent_id ?? null
    };
    const { error } = await supa.from("tasks").insert(payload);
    if (error) console.warn("migrate insert failed", error.message);
  }
  localStorage.removeItem(LOCAL_TASKS_KEY);
}
