const STORAGE_KEY = "rello_state_v2";
const DEFAULT_LISTS = [
  { id: "todo", name: "To Do", locked: true },
  { id: "progress", name: "In Progress", locked: true },
  { id: "done", name: "Done", locked: true },
];

const state = loadState();
let activeProjectId = state.projects[0]?.id;
let editTaskId = null;
let contextTaskId = null;

const projectListEl = document.getElementById("project-list");
const projectNameEl = document.getElementById("active-project-name");
const projectSummaryEl = document.getElementById("active-project-summary");
const boardViewEl = document.getElementById("board-view");
const listViewEl = document.getElementById("list-view");
const progressEl = document.getElementById("project-progress");
const taskModal = document.getElementById("task-modal");
const contextMenu = document.getElementById("context-menu");
const completionInput = document.getElementById("task-completion");
const completionValue = document.getElementById("completion-value");
const taskTypeEl = document.getElementById("task-type");
const bugFieldsEl = document.getElementById("bug-fields");

init();

function init() {
  bindEvents();
  renderAll();
}

function bindEvents() {
  document.getElementById("add-project-btn").addEventListener("click", createProject);
  document.getElementById("new-task-btn").addEventListener("click", () => openTaskModal());
  document.getElementById("add-list-btn").addEventListener("click", createCardList);
  document.getElementById("board-view-btn").addEventListener("click", () => setView("board"));
  document.getElementById("list-view-btn").addEventListener("click", () => setView("list"));
  document.getElementById("cancel-task").addEventListener("click", closeTaskModal);
  document.getElementById("save-task").addEventListener("click", saveTaskFromModal);
  completionInput.addEventListener("input", () => {
    completionValue.textContent = `${completionInput.value}%`;
  });
  taskTypeEl.addEventListener("change", syncBugFieldsVisibility);

  document.querySelectorAll(".editor-tools [data-command]").forEach((btn) => {
    btn.addEventListener("click", () => document.execCommand(btn.dataset.command, false, null));
  });
  document.getElementById("insert-image").addEventListener("click", () => {
    const url = prompt("Image URL");
    if (url) document.execCommand("insertImage", false, url);
  });
  document.getElementById("insert-code").addEventListener("click", () => {
    const code = prompt("Paste Luau code");
    if (!code) return;
    const pre = `<pre class=\"luau\"><code>${escapeHtml(code)}</code></pre>`;
    document.execCommand("insertHTML", false, pre);
  });

  document.addEventListener("click", () => contextMenu.classList.add("hidden"));
  contextMenu.addEventListener("click", onContextAction);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      projects: [{ id: crypto.randomUUID(), name: "Core Roblox Game", lists: [...DEFAULT_LISTS], tasks: [] }],
    };
  }
  const parsed = JSON.parse(raw);
  parsed.projects.forEach(normalizeProject);
  return parsed;
}

function normalizeProject(project) {
  if (!project.lists?.length) {
    project.lists = [...DEFAULT_LISTS];
  }

  project.lists = project.lists.map((list) => ({
    locked: DEFAULT_LISTS.some((d) => d.id === list.id) || Boolean(list.locked),
    ...list,
  }));

  project.tasks = (project.tasks || []).map((task) => ({
    ...task,
    type: task.type || "feature",
    listId: task.listId || task.status || "todo",
    bugSeverity: task.bugSeverity || "major",
    bugReproSteps: task.bugReproSteps || "",
  }));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeProject() {
  return state.projects.find((p) => p.id === activeProjectId);
}

function createProject() {
  const name = prompt("Project name");
  if (!name) return;
  const project = { id: crypto.randomUUID(), name, lists: [...DEFAULT_LISTS], tasks: [] };
  state.projects.push(project);
  activeProjectId = project.id;
  saveState();
  renderAll();
}

function createCardList() {
  const name = prompt("New card list name");
  if (!name) return;
  activeProject().lists.push({ id: crypto.randomUUID(), name, locked: false });
  saveState();
  renderAll();
}

function renderAll() {
  renderProjects();
  renderBoard();
  renderList();
  renderStats();
}

function renderProjects() {
  projectListEl.innerHTML = "";
  state.projects.forEach((project) => {
    const li = document.createElement("li");
    li.textContent = project.name;
    li.className = project.id === activeProjectId ? "active" : "";
    li.onclick = () => {
      activeProjectId = project.id;
      renderAll();
    };
    projectListEl.appendChild(li);
  });

  const project = activeProject();
  projectNameEl.textContent = project.name;
  projectSummaryEl.textContent = `${project.tasks.length} total cards · ${project.tasks.filter((t) => t.type === "bug").length} bugs`;
}

function renderBoard() {
  boardViewEl.innerHTML = "";
  const project = activeProject();

  project.lists.forEach((list) => {
    const col = document.createElement("section");
    col.className = "column";

    const head = document.createElement("div");
    head.className = "column-head";

    const heading = document.createElement("h3");
    heading.textContent = list.name;
    head.appendChild(heading);

    const tools = document.createElement("div");
    tools.className = "column-tools";
    if (!list.locked) {
      const renameBtn = document.createElement("button");
      renameBtn.className = "icon-btn";
      renameBtn.textContent = "Rename";
      renameBtn.onclick = () => renameList(list.id);
      tools.appendChild(renameBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = () => deleteList(list.id);
      tools.appendChild(deleteBtn);
    }
    head.appendChild(tools);

    const dropzone = document.createElement("div");
    dropzone.className = "dropzone";
    dropzone.dataset.listId = list.id;
    dropzone.ondragover = (e) => e.preventDefault();
    dropzone.ondrop = (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const task = project.tasks.find((t) => t.id === id);
      if (!task) return;
      task.listId = list.id;
      saveState();
      renderAll();
    };

    project.tasks.filter((t) => t.listId === list.id).forEach((task) => {
      dropzone.appendChild(cardFromTask(task));
    });

    col.appendChild(head);
    col.appendChild(dropzone);
    boardViewEl.appendChild(col);
  });
}

function renameList(listId) {
  const list = activeProject().lists.find((l) => l.id === listId);
  if (!list || list.locked) return;
  const name = prompt("Rename list", list.name);
  if (!name) return;
  list.name = name;
  saveState();
  renderAll();
}

function deleteList(listId) {
  const project = activeProject();
  const list = project.lists.find((l) => l.id === listId);
  if (!list || list.locked) return;
  const fallback = project.lists.find((l) => l.id === "todo") || project.lists[0];
  project.tasks.forEach((t) => {
    if (t.listId === listId) t.listId = fallback.id;
  });
  project.lists = project.lists.filter((l) => l.id !== listId);
  saveState();
  renderAll();
}

function cardFromTask(task) {
  const template = document.getElementById("card-template");
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.id = task.id;
  card.querySelector("h4").textContent = task.title;

  const badge = card.querySelector(".badge");
  badge.textContent = task.priority;
  badge.classList.add(task.priority);

  const meta = card.querySelector(".card-meta");
  const severity = task.type === "bug" ? ` · ${task.bugSeverity}` : "";
  meta.innerHTML = `<span class="type-pill ${task.type}">${task.type}</span>${severity}`;

  card.querySelector(".card-progress").textContent = `Completion: ${task.completion}%`;
  card.querySelector(".card-preview").innerHTML = highlightLuau(task.description || "");

  card.ondragstart = (e) => e.dataTransfer.setData("text/plain", task.id);
  card.ondblclick = () => openTaskModal(task.id);
  card.oncontextmenu = (e) => {
    e.preventDefault();
    contextTaskId = task.id;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove("hidden");
  };

  return card;
}

function renderList() {
  const project = activeProject();
  listViewEl.innerHTML = `<table><thead><tr><th>Task</th><th>Type</th><th>List</th><th>Priority</th><th>Completion</th></tr></thead><tbody></tbody></table>`;
  const tbody = listViewEl.querySelector("tbody");

  project.tasks.forEach((task) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${task.title}</td><td>${task.type}</td><td>${listName(task.listId)}</td><td>${task.priority}</td><td>${task.completion}%</td>`;
    row.ondblclick = () => openTaskModal(task.id);
    tbody.appendChild(row);
  });
}

function renderStats() {
  const project = activeProject();
  const doneList = project.lists.find((list) => list.id === "done");
  const done = doneList ? project.tasks.filter((t) => t.listId === doneList.id).length : 0;
  const total = project.tasks.length || 1;
  const percent = Math.round((done / total) * 100);
  const bugs = project.tasks.filter((t) => t.type === "bug").length;
  progressEl.innerHTML = `<p>${done}/${project.tasks.length} completed · ${bugs} bugs</p><progress max="100" value="${percent}"></progress>`;
}

function listName(id) {
  return activeProject().lists.find((l) => l.id === id)?.name || "Unknown";
}

function setView(view) {
  const isBoard = view === "board";
  boardViewEl.classList.toggle("hidden", !isBoard);
  listViewEl.classList.toggle("hidden", isBoard);
  document.getElementById("board-view-btn").classList.toggle("active", isBoard);
  document.getElementById("list-view-btn").classList.toggle("active", !isBoard);
}

function fillListPicker(selectedId) {
  const picker = document.getElementById("task-list");
  picker.innerHTML = "";
  activeProject().lists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = list.name;
    picker.appendChild(option);
  });
  picker.value = selectedId || activeProject().lists[0].id;
}

function syncBugFieldsVisibility() {
  bugFieldsEl.classList.toggle("hidden", taskTypeEl.value !== "bug");
}

function openTaskModal(taskId = null) {
  editTaskId = taskId;
  const task = activeProject().tasks.find((t) => t.id === taskId);

  document.getElementById("modal-title").textContent = task ? "Edit Card" : "Create Card";
  document.getElementById("task-title").value = task?.title || "";
  taskTypeEl.value = task?.type || "feature";
  fillListPicker(task?.listId || "todo");
  document.getElementById("task-priority").value = task?.priority || "medium";
  completionInput.value = task?.completion ?? 0;
  completionValue.textContent = `${completionInput.value}%`;
  document.getElementById("bug-severity").value = task?.bugSeverity || "major";
  document.getElementById("bug-repro").value = task?.bugReproSteps || "";
  document.getElementById("task-description").innerHTML = task?.description || "";
  syncBugFieldsVisibility();
  taskModal.classList.remove("hidden");
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
  editTaskId = null;
}

function saveTaskFromModal() {
  const title = document.getElementById("task-title").value.trim();
  if (!title) return alert("Title is required");

  const values = {
    title,
    type: taskTypeEl.value,
    listId: document.getElementById("task-list").value,
    priority: document.getElementById("task-priority").value,
    completion: Number(completionInput.value),
    bugSeverity: document.getElementById("bug-severity").value,
    bugReproSteps: document.getElementById("bug-repro").value.trim(),
    description: document.getElementById("task-description").innerHTML,
  };

  const project = activeProject();
  if (editTaskId) {
    const task = project.tasks.find((t) => t.id === editTaskId);
    Object.assign(task, values);
  } else {
    project.tasks.push({ id: crypto.randomUUID(), ...values });
  }

  saveState();
  closeTaskModal();
  renderAll();
}

function onContextAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;
  const project = activeProject();
  const index = project.tasks.findIndex((t) => t.id === contextTaskId);
  if (index === -1) return;

  if (action === "edit") openTaskModal(contextTaskId);
  if (action === "duplicate") {
    const source = project.tasks[index];
    project.tasks.push({ ...source, id: crypto.randomUUID(), title: `${source.title} (Copy)` });
    saveState();
    renderAll();
  }
  if (action === "delete") {
    project.tasks.splice(index, 1);
    saveState();
    renderAll();
  }
  contextMenu.classList.add("hidden");
}

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function highlightLuau(html) {
  return html.replace(/<pre class="luau"><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    const keywords = /(local|function|end|if|then|elseif|else|for|while|do|return|and|or|not|nil|true|false)/g;
    const highlighted = code.replace(keywords, '<span class="kw">$1</span>');
    return `<pre class="luau"><code>${highlighted}</code></pre>`;
  });
}
