"use strict";

const COLUMNS = [
  { id: "todo",   title: "Por hacer",    color: "#6366f1" },
  { id: "doing",  title: "En progreso",  color: "#f59e0b" },
  { id: "review", title: "En revisión",  color: "#8b5cf6" },
  { id: "done",   title: "Hecho",        color: "#10b981" },
];
const PRIO_LABEL = { high: "Alta", medium: "Media", low: "Baja" };
const STORE_KEY = "kanbanboard.tasks.v1";
const THEME_KEY = "kanbanboard.theme";

const $ = (s) => document.querySelector(s);
const board = $("#board");
const modal = $("#modal");
const form = $("#form");

let tasks = load();
let editingId = null;
let dragId = null;

/* ---------- Datos ---------- */
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch (_) { /* ignorar */ }
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  return [
    { id: uid(), title: "Definir alcance del proyecto", desc: "Reunir requisitos con el equipo.", status: "done", priority: "high", due: day(-2), tag: "Planificación" },
    { id: uid(), title: "Diseñar la interfaz", desc: "Wireframes y paleta de colores.", status: "review", priority: "medium", due: day(1), tag: "Diseño" },
    { id: uid(), title: "Implementar el login", desc: "Formulario, validación y sesión.", status: "doing", priority: "high", due: day(3), tag: "Desarrollo" },
    { id: uid(), title: "Escribir pruebas", desc: "", status: "todo", priority: "medium", due: day(7), tag: "QA" },
    { id: uid(), title: "Preparar documentación", desc: "README y guía de uso.", status: "todo", priority: "low", due: "", tag: "Docs" },
  ];
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(tasks)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- Utilidades ---------- */
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function isLate(t) {
  if (!t.due || t.status === "done") return false;
  const today = new Date().toISOString().slice(0, 10);
  return t.due < today;
}
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- Render ---------- */
function visible(t) {
  const q = $("#search").value.trim().toLowerCase();
  const p = $("#filterPriority").value;
  if (p !== "all" && t.priority !== p) return false;
  if (!q) return true;
  return [t.title, t.desc, t.tag].some((v) => (v || "").toLowerCase().includes(q));
}

function render() {
  board.innerHTML = "";
  for (const col of COLUMNS) {
    const list = tasks.filter((t) => t.status === col.id);
    const shown = list.filter(visible);

    const el = document.createElement("section");
    el.className = "column";
    el.dataset.col = col.id;
    el.innerHTML = `
      <div class="col-head">
        <span class="dot" style="--c:${col.color}"></span>
        <span class="col-title">${col.title}</span>
        <span class="count">${list.length}</span>
        <button class="add-quick" title="Añadir a ${col.title}" aria-label="Añadir tarea a ${col.title}">+</button>
      </div>
      <div class="cards"></div>`;

    const cards = el.querySelector(".cards");
    if (!shown.length) {
      cards.innerHTML = `<div class="empty">${list.length ? "Sin resultados" : "Arrastra tareas aquí"}</div>`;
    }
    shown.forEach((t) => cards.appendChild(cardEl(t)));

    el.querySelector(".add-quick").addEventListener("click", () => openModal(null, col.id));
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("over"); });
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); dropOn(col.id, e.clientY, cards); });

    board.appendChild(el);
  }
  updateStats();
}

function cardEl(t) {
  const el = document.createElement("article");
  el.className = "card" + (t.status === "done" ? " done" : "");
  el.draggable = true;
  el.dataset.id = t.id;
  el.dataset.priority = t.priority;
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="card-actions">
      <button data-act="edit" title="Editar" aria-label="Editar">✎</button>
      <button data-act="del" title="Eliminar" aria-label="Eliminar">🗑</button>
    </div>
    <h3>${esc(t.title)}</h3>
    ${t.desc ? `<p>${esc(t.desc)}</p>` : ""}
    <div class="meta">
      <span class="chip prio">${PRIO_LABEL[t.priority]}</span>
      ${t.tag ? `<span class="chip">${esc(t.tag)}</span>` : ""}
      ${t.due ? `<span class="chip date${isLate(t) ? " late" : ""}">📅 ${fmtDate(t.due)}</span>` : ""}
    </div>`;

  el.addEventListener("dragstart", (e) => {
    dragId = t.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", t.id);
    setTimeout(() => el.classList.add("dragging"), 0);
  });
  el.addEventListener("dragend", () => { dragId = null; el.classList.remove("dragging"); });
  el.addEventListener("dblclick", () => openModal(t.id));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") openModal(t.id); });
  el.querySelector('[data-act="edit"]').addEventListener("click", () => openModal(t.id));
  el.querySelector('[data-act="del"]').addEventListener("click", () => removeTask(t.id));
  return el;
}

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("#statTotal").textContent = total;
  $("#statDoing").textContent = tasks.filter((t) => t.status === "doing").length;
  $("#statLate").textContent = tasks.filter(isLate).length;
  $("#statPct").textContent = pct + "%";
  $("#barFill").style.width = pct + "%";
}

/* ---------- Arrastrar y soltar ---------- */
function dropOn(status, y, cardsEl) {
  if (!dragId) return;
  const task = tasks.find((t) => t.id === dragId);
  if (!task) return;

  // Posición: antes de la primera tarjeta cuyo centro queda por debajo del cursor
  const others = [...cardsEl.querySelectorAll(".card")].filter((c) => c.dataset.id !== dragId);
  const before = others.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });

  const moved = task.status !== status;
  tasks = tasks.filter((t) => t.id !== dragId);
  task.status = status;
  if (before) {
    const idx = tasks.findIndex((t) => t.id === before.dataset.id);
    tasks.splice(idx, 0, task);
  } else {
    tasks.push(task);
  }
  save();
  render();
  if (moved) toast(`Movida a «${COLUMNS.find((c) => c.id === status).title}»`);
}

/* ---------- Modal ---------- */
function openModal(id = null, status = "todo") {
  editingId = id;
  const t = id ? tasks.find((x) => x.id === id) : null;
  $("#modalTitle").textContent = t ? "Editar tarea" : "Nueva tarea";
  $("#deleteBtn").style.display = t ? "" : "none";
  $("#fTitle").value = t?.title ?? "";
  $("#fDesc").value = t?.desc ?? "";
  $("#fStatus").value = t?.status ?? status;
  $("#fPriority").value = t?.priority ?? "medium";
  $("#fDue").value = t?.due ?? "";
  $("#fTag").value = t?.tag ?? "";
  modal.showModal();
  $("#fTitle").focus();
}
function closeModal() { modal.close(); }

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#fTitle").value.trim(),
    desc: $("#fDesc").value.trim(),
    status: $("#fStatus").value,
    priority: $("#fPriority").value,
    due: $("#fDue").value,
    tag: $("#fTag").value.trim(),
  };
  if (!data.title) return;
  if (editingId) {
    Object.assign(tasks.find((t) => t.id === editingId), data);
    toast("Tarea actualizada");
  } else {
    tasks.push({ id: uid(), ...data });
    toast("Tarea creada");
  }
  save();
  closeModal();
  render();
});

function removeTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t || !confirm(`¿Eliminar «${t.title}»?`)) return;
  tasks = tasks.filter((x) => x.id !== id);
  save();
  render();
  toast("Tarea eliminada");
}

/* ---------- Eventos ---------- */
$("#newBtn").addEventListener("click", () => openModal());
$("#closeBtn").addEventListener("click", closeModal);
$("#cancelBtn").addEventListener("click", closeModal);
$("#deleteBtn").addEventListener("click", () => { const id = editingId; closeModal(); removeTask(id); });
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
$("#search").addEventListener("input", render);
$("#filterPriority").addEventListener("change", render);

$("#fStatus").innerHTML = COLUMNS.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");

/* Tema */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}
setTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeBtn").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

/* Cielo estrellado */
(function sky() {
  const cv = $("#sky");
  const ctx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [], shooting = null, W = 0, H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(320, Math.round((W * H) / 5500));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * Math.PI * 2,
      s: Math.random() * 0.02 + 0.005,
      hue: Math.random() < 0.15 ? 40 : Math.random() < 0.2 ? 210 : 0,
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.a += s.s;
      const o = 0.55 + 0.45 * Math.sin(s.a);
      ctx.fillStyle = s.hue ? `hsla(${s.hue},90%,85%,${o})` : `rgba(255,255,255,${o})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    if (!still) {
      if (!shooting && Math.random() < 0.004) {
        shooting = { x: Math.random() * W * 0.8, y: Math.random() * H * 0.4, vx: 9, vy: 4, life: 1 };
      }
      if (shooting) {
        const g = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x - shooting.vx * 9, shooting.y - shooting.vy * 9);
        g.addColorStop(0, `rgba(255,255,255,${shooting.life})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(shooting.x, shooting.y);
        ctx.lineTo(shooting.x - shooting.vx * 9, shooting.y - shooting.vy * 9); ctx.stroke();
        shooting.x += shooting.vx; shooting.y += shooting.vy; shooting.life -= 0.015;
        if (shooting.life <= 0 || shooting.x > W) shooting = null;
      }
      requestAnimationFrame(frame);
    }
  }

  addEventListener("resize", () => { resize(); if (still) frame(); });
  resize();
  frame();
})();

render();
