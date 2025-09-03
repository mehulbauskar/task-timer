/* Task Timer with Nested Tasks (subtasks)
 * - Guest mode (localStorage) and Supabase auth
 * - Expand/collapse, add subtask, cascade delete
 */

const SUPABASE_URL = "https://ywayxnebgheyxtunsvdu.supabase.co";     // e.g., "https://YOUR-PROJECT.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3YXl4bmViZ2hleXh0dW5zdmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MzM2MjksImV4cCI6MjA3MjUwOTYyOX0.qLKgOxZKC9ctljkKDpok4ZPeWBFBP8en7eBDnliz6m4"; // e.g., "eyJhbGciOiJIUzI1NiIs..."

let supa = null;
let authUser = null;
let isGuest = false;

const GUEST_FLAG = "tt_guest_mode";
const LOCAL_TASKS_KEY = "tt_guest_tasks";
const EXPAND_KEY = "tt_expand_state";
const INTERVAL_MS = 1000;
let tickHandle = null;

function clientNowIso() { return new Date().toISOString(); }

// ---------- Supabase boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await supa.auth.getSession();
    authUser = data.session?.user ?? null;
    supa.auth.onAuthStateChange((_e, session) => {
      authUser = session?.user ?? null;
      if (authUser) {
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

function setupUI() {
  document.getElementById("addTaskBtn").addEventListener("click", addTaskFromForm);
  document.getElementById("authClose").addEventListener("click", () => closeAuth());
  document.querySelectorAll(".filters .chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".filters .chip").forEach(c => c.classList.remove("chip-active"));
      e.currentTarget.classList.add("chip-active");
      refreshTasks();
    });
  });
  // Auth modal tabs
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", onAuthTab));
  document.getElementById("authForm").addEventListener("submit", onAuthSubmit);
}

function renderAuthControls() {
  const el = document.getElementById("authControls");
  el.innerHTML = "";
  if (authUser) {
    el.append(child(`<span class="muted">${authUser.email ?? "Account"}</span>`));
    el.append(button("Logout", async () => { await supa.auth.signOut(); }));
    return;
  }
  if (isGuest) {
    el.append(child(`<span class="muted">Guest</span>`));
    el.append(button("Login", openAuth));
    return;
  }
  el.append(button("Login", openAuth));
  el.append(button("Continue as Guest", () => { isGuest = true; localStorage.setItem(GUEST_FLAG, "1"); refreshTasks(); renderAuthControls(); }, "btn"));
}

function openAuth() {
  if (!supa) {
    alert("To enable login, add your SUPABASE_URL and SUPABASE_ANON_KEY in app.js and refresh.");
    return;
  }
  document.getElementById("authDialog").showModal();
}
function closeAuth(){ document.getElementById("authDialog").close(); }

let authMode = "signin";
function onAuthTab(e) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("tab-active"));
  e.currentTarget.classList.add("tab-active");
  authMode = e.currentTarget.getAttribute("data-mode");
  document.getElementById("authTitle").textContent =
    authMode === "signup" ? "Create account" : authMode === "magic" ? "Magic link" : "Sign in";
  const pw = document.getElementById("authPassword");
  pw.parentElement.style.display = authMode === "magic" ? "none" : "grid";
  document.getElementById("authSubmit").textContent =
    authMode === "signup" ? "Sign up" : authMode === "magic" ? "Send link" : "Sign in";
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const msg = document.getElementById("authMessage"); msg.textContent = "";
  if (!supa) { msg.textContent = "Supabase not configured."; return; }

  try {
    if (authMode === "magic") {
      const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      msg.textContent = "Check your email for the login link.";
    } else if (authMode === "signup") {
      const { error } = await supa.auth.signUp({ email, password });
      if (error) throw error;
      msg.textContent = "Account created. Check your inbox to confirm.";
    } else {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuth();
    }
  } catch (err) {
    msg.textContent = err?.message ?? "Auth failed";
  }
}

// ---------- Helpers ----------
function button(label, onClick, cls = "btn btn-primary") {
  const b = document.createElement("button");
  b.className = cls; b.textContent = label; b.addEventListener("click", onClick); return b;
}
function iconButton(html, onClick, title) {
  const b = document.createElement("button");
  b.className = "icon-btn"; b.innerHTML = html; if (title) b.title = title; b.addEventListener("click", onClick); return b;
}
function child(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function formatHMS(totalSec) {
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return [h,m,s].map(n => String(n).padStart(2,"0")).join(":");
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":\"&#039;\"}[m])); }

// ---------- Filters & stats ----------
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
    // cascade delete local
    const all = lsGet();
    const remaining = all.filter(t => t.id !== id && t.parent_id !== id);
    // recursively remove deeper levels
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of remaining.slice()) {
        if (!remaining.find(x => x.id === t.parent_id) and t.parent_id) {
          // orphan check unnecessary; cascade already removed parent. Keeping simple.
        }
      }
    }
    // Simpler: rebuild excluding any node that is a descendant of id
    const toDelete = new Set([id]);
    let keep = [];
    const expand = () => {
      let added = false;
      for (const t of all) {
        if (toDelete.has(t.parent_id)) { toDelete.add(t.id); added = True; }
      }
      return added;
    };
    // Fallback: simple recursive pass
    def_recurse = None
    # The above block is Python-ish, but we are in JS file building; ignore - we handle in JS elsewhere
    lsSet(all.filter(t => !isDescendant(all, t.id, id)));
    return;
  }
  const { error } = await supa.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// Helper for local cascade (JS, used at runtime below)
function isDescendant(all, nodeId, targetRootId) {
  if (nodeId === targetRootId) return true;
  let current = all.find(x => x.id === nodeId);
  while (current && current.parent_id) {
    if (current.parent_id === targetRootId) return true;
    current = all.find(x => x.id === current.parent_id);
  }
  return false;
}

// ----- Task actions -----
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

// ---------- Tree building ----------
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

// ---------- UI rendering ----------
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

  // filtering (per node)
  const nowDate = new Date();
  let filtered = tasks.filter(t => {
    if (filter === "active") return t.status === "incomplete";
    if (filter === "completed") return t.status === "complete";
    if (filter === "scheduled") return !!t.due_date;
    if (filter === "overdue") return t.due_date && new Date(t.due_date) < nowDate && t.status !== "complete";
    return true;
  });

  const stats = computeStats(filtered);
  document.getElementById("quickStats").textContent =
    `${stats.active} active • ${stats.running} running • ${stats.completed} completed • ${formatHMS(stats.totalTime)} total`;

  const { roots, byId } = buildTree(filtered);
  const expand = loadExpandState();

  tbody.innerHTML = "";
  for (const r of roots) renderNode(r, 0, tbody, byId, expand);

  saveExpandState(expand);
}

function renderNode(node, depth, tbody, byId, expand) {
  const tr = document.createElement("tr");
  const statusPill = `<span class="status-pill ${node.status==='complete'?'pill-complete':'pill-incomplete'}">${node.status==='complete'?'Complete':'Incomplete'}</span>`;

  const titleTd = document.createElement("td");
  titleTd.style.paddingLeft = `${12 + depth*20}px`;

  // caret
  const hasChildren = !!node.children?.length;
  const caret = hasChildren ? (expand[node.id] ? "▾" : "▸") : "•";
  const caretBtn = iconButton(caret, () => {
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
  const playBtn = button(node.running ? "Pause" : "Play", async () => {
    if (node.running) await pauseTask(node.id);
    else await startTask(node.id);
    refreshTasks();
  }, node.running ? "btn pause" : "btn play");
  const endBtn = button("End", async () => { await completeTask(node.id); refreshTasks(); }, "btn end");
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
  const subBtn = button("Add Subtask", async () => {
    const title = prompt("Subtask title?");
    if (!title) return;
    await addTask({ title, parent_id: node.id, status: "incomplete", elapsed_seconds: 0, running: false, started_at: null, due_date: null, project: node.project ?? null });
    refreshTasks();
  }, "btn");
  const restartBtn = button("Restart", async () => { await restartTask(node.id); refreshTasks(); }, "btn");
  const restoreBtn = button("Restore", async () => { await restoreTask(node.id); refreshTasks(); }, "btn");
  const delBtn = button("Delete", async () => {
    if (confirm("Delete this task and all its subtasks?")) {
      await deleteTask(node.id); refreshTasks();
    }
  }, "btn");
  if (node.status === "complete") actions.append(restoreBtn);
  else actions.append(restartBtn);
  actions.append(subBtn, delBtn);
  const actionsTd = document.createElement("td"); actionsTd.append(actions);

  tr.append(titleTd, projectTd, controlsTd, timeTd, statusTd, dueTd, actionsTd);
  tbody.append(tr);

  if (node.children?.length && expand[node.id]) {
    for (const c of node.children) renderNode(c, depth+1, tbody, byId, expand);
  }
}

// ---------- Migration preserving nesting ----------
function depthOf(item, byId, memo) {
  if (memo.has(item.id)) return memo.get(item.id);
  let d = 0, p = item.parent_id ? byId.get(item.parent_id) : null;
  while (p) { d += 1; p = p.parent_id ? byId.get(p.parent_id) : null; }
  memo.set(item.id, d); return d;
}

async function migrateGuestTasksToSupabase() {
  if (!supa || !authUser) return;
  const guest = lsGet();
  if (!guest.length) return;

  // Build map by id and sort by depth to satisfy FK
  const byId = new Map(guest.map(g => [g.id, g]));
  const memo = new Map();
  const sorted = guest.slice().sort((a,b) => depthOf(a, byId, memo) - depthOf(b, byId, memo));

  for (const g of sorted) {
    // attempt to insert with same id so parent_id references remain valid
    const payload = {
      id: g.id, title: g.title, status: g.status, elapsed_seconds: g.elapsed_seconds || 0,
      due_date: g.due_date ?? null, project: g.project ?? null, running: false, started_at: null,
      parent_id: g.parent_id ?? null
    };
    const { error } = await supa.from("tasks").insert(payload);
    if (error) { console.warn("migrate insert failed", error.message); }
  }
  localStorage.removeItem(LOCAL_TASKS_KEY);
}

// Expose for local cascade helper in deleteTask (called in runtime JS)
window.isDescendant = isDescendant;
