const STORAGE_KEY = "rello_state_v3";
const DEFAULT_LISTS = [
  { id: "todo", name: "To Do", locked: true },
  { id: "progress", name: "In Progress", locked: true },
  { id: "done", name: "Done", locked: true },
];

const state = loadState();
let activeProjectId = state.projects[0]?.id;
let editTaskId = null;
let contextTaskId = null;
let newTaskDefaultListId = "todo";
let activeTextPromptAction = null;

const projectListEl = document.getElementById("project-list");
const projectNameEl = document.getElementById("active-project-name");
const projectSummaryEl = document.getElementById("active-project-summary");
const boardViewEl = document.getElementById("board-view");
const listViewEl = document.getElementById("list-view");
const progressEl = document.getElementById("project-progress");
const taskModal = document.getElementById("task-modal");
const contextMenu = document.getElementById("context-menu");
const taskTypeEl = document.getElementById("task-type");
const bugFieldsEl = document.getElementById("bug-fields");
const checklistEditorEl = document.getElementById("checklist-editor");
const textPromptModal = document.getElementById("text-prompt-modal");

init();

function init() {
  bindEvents();
  renderAll();
}

function bindEvents() {
  document.getElementById("add-project-btn").addEventListener("click", () => openTextPrompt("Create Project", "Project name", (name) => {
    state.projects.push({ id: crypto.randomUUID(), name, lists: structuredClone(DEFAULT_LISTS), tasks: [] });
    activeProjectId = state.projects[state.projects.length - 1].id;
    saveState();
    renderAll();
  }));

  document.getElementById("add-list-btn").addEventListener("click", () => openTextPrompt("Create List", "New card list name", (name) => {
    activeProject().lists.push({ id: crypto.randomUUID(), name, locked: false });
    saveState();
    renderAll();
  }));

  document.getElementById("board-view-btn").addEventListener("click", () => setView("board"));
  document.getElementById("list-view-btn").addEventListener("click", () => setView("list"));
  document.getElementById("cancel-task").addEventListener("click", closeTaskModal);
  document.getElementById("save-task").addEventListener("click", saveTaskFromModal);
  taskTypeEl.addEventListener("change", syncBugFieldsVisibility);

  document.getElementById("add-checklist-item").addEventListener("click", () => addChecklistEditorItem("", false));

  const editor = document.getElementById("task-description");
  document.querySelectorAll(".editor-tools [data-command]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editor.focus();
      document.execCommand(btn.dataset.command, false, null);
    });
  });

  document.getElementById("insert-image").addEventListener("click", () => {
    openTextPrompt("Insert Image", "Image URL", (url) => {
      editor.focus();
      document.execCommand("insertImage", false, url);
    });
  });

  document.getElementById("insert-code").addEventListener("click", () => {
    openTextPrompt("Insert Luau", "Paste Luau code", (code) => {
      const pre = `<pre class=\"luau\"><code>${escapeHtml(code)}</code></pre>`;
      editor.focus();
      document.execCommand("insertHTML", false, pre);
    });
  });

  document.addEventListener("click", () => contextMenu.classList.add("hidden"));
  contextMenu.addEventListener("click", onContextAction);

  document.getElementById("text-prompt-cancel").addEventListener("click", closeTextPrompt);
  document.getElementById("text-prompt-confirm").addEventListener("click", submitTextPrompt);
  document.getElementById("text-prompt-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitTextPrompt();
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      projects: [{ id: crypto.randomUUID(), name: "Core Roblox Game", lists: structuredClone(DEFAULT_LISTS), tasks: [] }],
    };
  }
  const parsed = JSON.parse(raw);
  parsed.projects.forEach(normalizeProject);
  return parsed;
}

function normalizeProject(project) {
  if (!project.lists?.length) project.lists = structuredClone(DEFAULT_LISTS);

  project.lists = project.lists.map((list) => ({
    locked: DEFAULT_LISTS.some((d) => d.id === list.id) || Boolean(list.locked),
    ...list,
  }));

  project.tasks = (project.tasks || []).map((task) => {
    const checklist = (task.checklist || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      text: item.text || "",
      done: Boolean(item.done),
    }));

    return {
      ...task,
      type: task.type || "feature",
      listId: task.listId || task.status || "todo",
      bugSeverity: task.bugSeverity || "major",
      bugReproSteps: task.bugReproSteps || "",
      checklist,
    };
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeProject() {
  return state.projects.find((p) => p.id === activeProjectId) || state.projects[0];
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

    const addCardBtn = document.createElement("button");
    addCardBtn.className = "icon-btn primary-soft";
    addCardBtn.textContent = "+ Card";
    addCardBtn.onclick = () => openTaskModal(null, list.id);
    tools.appendChild(addCardBtn);

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
  openTextPrompt("Rename List", "List name", (name) => {
    list.name = name;
    saveState();
    renderAll();
  }, list.name);
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

function completionFromChecklist(task) {
  if (!task.checklist?.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return Math.round((done / task.checklist.length) * 100);
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

  const completion = completionFromChecklist(task);
  const completionEl = card.querySelector(".card-progress");
  completionEl.textContent = completion === null ? "No checklist yet" : `Checklist: ${completion}%`;

  card.querySelector(".card-preview").innerHTML = highlightLuau(task.description || "<p class='muted'>No description.</p>");

  const checklistEl = card.querySelector(".card-checklist");
  if (task.checklist?.length) {
    checklistEl.innerHTML = "";
    task.checklist.forEach((item) => {
      const row = document.createElement("label");
      row.className = "check-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.done;
      checkbox.addEventListener("change", () => {
        item.done = checkbox.checked;
        saveState();
        renderAll();
      });
      const text = document.createElement("span");
      text.textContent = item.text;
      row.append(checkbox, text);
      checklistEl.appendChild(row);
    });
  } else {
    checklistEl.innerHTML = "";
  }

  card.querySelector(".edit-card-btn").onclick = () => openTaskModal(task.id);

  card.ondragstart = (e) => e.dataTransfer.setData("text/plain", task.id);
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
  listViewEl.innerHTML = "";

  project.lists.forEach((list) => {
    const section = document.createElement("section");
    section.className = "list-section";
    section.innerHTML = `<h3>${list.name}</h3><table><thead><tr><th>Task</th><th>Type</th><th>Priority</th><th>Checklist</th><th>Actions</th></tr></thead><tbody></tbody></table>`;

    const tbody = section.querySelector("tbody");
    const tasks = project.tasks.filter((task) => task.listId === list.id);

    if (!tasks.length) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="5" class="muted">No cards in this list.</td>`;
      tbody.appendChild(row);
    }

    tasks.forEach((task) => {
      const row = document.createElement("tr");
      const completion = completionFromChecklist(task);
      row.innerHTML = `
        <td>${task.title}</td>
        <td>${task.type}</td>
        <td>${task.priority}</td>
        <td>${completion === null ? "—" : `${completion}%`}</td>
        <td><button class="icon-btn row-edit-btn">Edit</button></td>
      `;
      row.querySelector(".row-edit-btn").onclick = () => openTaskModal(task.id);
      tbody.appendChild(row);
    });

    listViewEl.appendChild(section);
  });
}

function renderStats() {
  const project = activeProject();
  const done = project.tasks.filter((t) => t.listId === "done").length;
  const total = project.tasks.length || 1;
  const percent = Math.round((done / total) * 100);
  const bugs = project.tasks.filter((t) => t.type === "bug").length;
  progressEl.innerHTML = `<p>${done}/${project.tasks.length} completed · ${bugs} bugs</p><progress max="100" value="${percent}"></progress>`;
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

function openTaskModal(taskId = null, defaultListId = null) {
  editTaskId = taskId;
  const task = activeProject().tasks.find((t) => t.id === taskId);

  newTaskDefaultListId = defaultListId || newTaskDefaultListId || "todo";

  document.getElementById("modal-title").textContent = task ? "Edit Card" : "Create Card";
  document.getElementById("task-title").value = task?.title || "";
  taskTypeEl.value = task?.type || "feature";
  fillListPicker(task?.listId || newTaskDefaultListId || "todo");
  document.getElementById("task-priority").value = task?.priority || "medium";
  document.getElementById("bug-severity").value = task?.bugSeverity || "major";
  document.getElementById("bug-repro").value = task?.bugReproSteps || "";
  document.getElementById("task-description").innerHTML = task?.description || "";
  checklistEditorEl.innerHTML = "";
  (task?.checklist || []).forEach((item) => addChecklistEditorItem(item.text, item.done));
  syncBugFieldsVisibility();
  taskModal.classList.remove("hidden");
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
  editTaskId = null;
}

function addChecklistEditorItem(text = "", done = false) {
  const row = document.createElement("div");
  row.className = "check-edit-row";
  row.innerHTML = `
    <input type="checkbox" class="check-edit-done" ${done ? "checked" : ""} />
    <input type="text" class="check-edit-text" placeholder="Checklist item" value="${escapeHtml(text)}" />
    <button type="button" class="icon-btn remove-check-item">Remove</button>
  `;
  row.querySelector(".remove-check-item").addEventListener("click", () => row.remove());
  checklistEditorEl.appendChild(row);
}

function readChecklistFromEditor() {
  return Array.from(checklistEditorEl.querySelectorAll(".check-edit-row"))
    .map((row) => ({
      id: crypto.randomUUID(),
      text: row.querySelector(".check-edit-text").value.trim(),
      done: row.querySelector(".check-edit-done").checked,
    }))
    .filter((item) => item.text.length > 0);
}

function saveTaskFromModal() {
  const title = document.getElementById("task-title").value.trim();
  if (!title) return alert("Title is required");

  const values = {
    title,
    type: taskTypeEl.value,
    listId: document.getElementById("task-list").value,
    priority: document.getElementById("task-priority").value,
    bugSeverity: document.getElementById("bug-severity").value,
    bugReproSteps: document.getElementById("bug-repro").value.trim(),
    description: document.getElementById("task-description").innerHTML,
    checklist: readChecklistFromEditor(),
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
    project.tasks.push({
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title} (Copy)`,
      checklist: (source.checklist || []).map((item) => ({ ...item, id: crypto.randomUUID() })),
    });
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

function openTextPrompt(title, label, onSubmit, defaultValue = "") {
  activeTextPromptAction = onSubmit;
  document.getElementById("text-prompt-title").textContent = title;
  document.getElementById("text-prompt-label").textContent = label;
  const input = document.getElementById("text-prompt-input");
  input.value = defaultValue;
  textPromptModal.classList.remove("hidden");
  input.focus();
}

function submitTextPrompt() {
  const input = document.getElementById("text-prompt-input");
  const value = input.value.trim();
  if (!value || !activeTextPromptAction) return;
  activeTextPromptAction(value);
  closeTextPrompt();
}

function closeTextPrompt() {
  activeTextPromptAction = null;
  textPromptModal.classList.add("hidden");
}

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function highlightLuau(html) {
  return html.replace(/<pre class="luau"><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    const keywords = /(local|function|end|if|then|elseif|else|for|while|do|return|and|or|not|nil|true|false)/g;
    const highlighted = code.replace(keywords, '<span class="kw">$1</span>');
    return `<pre class="luau"><code>${highlighted}</code></pre>`;
  });
}
