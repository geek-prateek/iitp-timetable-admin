const API_URL = "/api/timetable";
const AUTH_URL = "/api/auth";
let data = null;
let resourcesData = [];
let dirty = false;
let resourcesDirty = false;
let toastTimer = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setSaveState(message, state = "") {
  const element = $("#saveState");
  element.lastChild.textContent = message;
  element.classList.remove("dirty", "saved", "error-state");
  if (state) element.classList.add(state);
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error-toast", isError);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}

function markDirty() {
  dirty = true;
  setSaveState("Unpublished changes", "dirty");
  $("#publishBtn").disabled = false;
}

function showLogin(message = "") {
  $("#adminApp").hidden = true;
  $("#loginView").hidden = false;
  $("#loginError").textContent = message;
  $("#loginUsername").value = "admin";
  $("#loginPassword").value = "";
  $("#loginUsername").focus();
}

function showAdmin() {
  $("#loginView").hidden = true;
  $("#adminApp").hidden = false;
}

async function checkSession() {
  try {
    const response = await fetch(AUTH_URL, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    const session = await response.json();
    if (!session.configured) {
      showLogin("ADMIN_PASSWORD is not configured in Vercel.");
      return false;
    }
    return session.authenticated === true;
  } catch (error) {
    showLogin("Could not reach the login service.");
    return false;
  }
}

async function login(username, password) {
  const response = await fetch(AUTH_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Sign in failed.");
}

async function logout() {
  await fetch(AUTH_URL, { method: "DELETE", credentials: "same-origin" });
  data = null;
  dirty = false;
  showLogin();
}

function setValue(collection, index, field, value) {
  data[collection][index][field] = value;
  markDirty();
}

function renderSummary() {
  $("#versionValue").textContent = data.version || 1;
  $("#updatedValue").textContent = data.updatedAt
    ? new Date(data.updatedAt).toLocaleString()
    : "Not published";
  $("#courseCount").textContent = data.COURSES.length;
  $("#classCount").textContent = data.SCHEDULE.length;
  $("#notificationText").value = data.notification || "";
}

function renderCourses() {
  const query = $("#courseSearch").value.trim().toLowerCase();
  const visibleCourses = data.COURSES
    .map((course, index) => ({ course, index }))
    .filter(({ course }) => !query || [course.name, course.shortName, course.code, course.professor]
      .some(value => String(value || "").toLowerCase().includes(query)));

  $("#courseRows").innerHTML = visibleCourses.map(({ course, index }) => `
    <tr>
      <td><div class="course-name-fields">
        <input data-collection="COURSES" data-index="${index}" data-field="name" value="${escapeHtml(course.name)}" aria-label="Course name" />
        <input data-collection="COURSES" data-index="${index}" data-field="shortName" value="${escapeHtml(course.shortName)}" aria-label="Short course name" />
      </div></td>
      <td><input data-collection="COURSES" data-index="${index}" data-field="code" value="${escapeHtml(course.code)}" aria-label="Course code" /></td>
      <td><input data-collection="COURSES" data-index="${index}" data-field="professor" value="${escapeHtml(course.professor || "")}" aria-label="Teacher name" /></td>
      <td><select data-collection="COURSES" data-index="${index}" data-field="type" aria-label="Course type">
        <option value="regular" ${course.type === "regular" ? "selected" : ""}>Regular</option>
        <option value="elective" ${course.type === "elective" ? "selected" : ""}>Elective</option>
      </select></td>
      <td><input class="url-input" type="url" data-collection="COURSES" data-index="${index}" data-field="moodleUrl" value="${escapeHtml(course.moodleUrl || "")}" aria-label="Moodle URL" /></td>
      <td><button class="icon-button delete-course" data-index="${index}" type="button" title="Delete course" aria-label="Delete ${escapeHtml(course.name)}">&times;</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="empty">${query ? "No courses match this search." : "No courses added."}</td></tr>`;
}

function options(values, selected) {
  return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderSchedule() {
  const courseOptions = data.COURSES.map(course => ({ value: course.id, label: course.shortName }));
  $("#scheduleRows").innerHTML = data.SCHEDULE.map((item, index) => `
    <tr>
      <td><select data-collection="SCHEDULE" data-index="${index}" data-field="day">${options(data.DAYS, item.day)}</select></td>
      <td><select data-collection="SCHEDULE" data-index="${index}" data-field="time">${options(data.TIMES, item.time)}</select></td>
      <td><select data-collection="SCHEDULE" data-index="${index}" data-field="course">${courseOptions.map(course => `<option value="${escapeHtml(course.value)}" ${course.value === item.course ? "selected" : ""}>${escapeHtml(course.label)}</option>`).join("")}</select></td>
      <td class="check-cell"><input type="checkbox" data-collection="SCHEDULE" data-index="${index}" data-field="lab" ${item.lab ? "checked" : ""} aria-label="Lab class" /></td>
      <td class="check-cell"><input type="checkbox" data-collection="SCHEDULE" data-index="${index}" data-field="cancelled" ${item.cancelled ? "checked" : ""} aria-label="Cancelled class" /></td>
      <td><button class="icon-button delete-class" data-index="${index}" type="button" title="Delete class" aria-label="Delete class">&times;</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="empty">No classes scheduled.</td></tr>`;
}

function renderTimes() {
  $("#timeRows").innerHTML = data.TIMES.map((time, index) => `
    <div class="simple-row">
      <input class="time-input" data-index="${index}" value="${escapeHtml(time)}" aria-label="Time slot ${index + 1}" />
      <button class="icon-button delete-time" data-index="${index}" type="button" title="Delete time slot" aria-label="Delete ${escapeHtml(time)}">&times;</button>
    </div>
  `).join("") || `<p class="empty">No time slots added.</p>`;
}

function renderPrograms() {
  const electives = data.COURSES.filter(course => course.type === "elective");
  $("#programRows").innerHTML = data.PROGRAMS.map((program, index) => `
    <article class="program-card">
      <div class="program-head">
        <input data-collection="PROGRAMS" data-index="${index}" data-field="name" value="${escapeHtml(program.name)}" aria-label="Program name" />
        <button class="icon-button delete-program" data-index="${index}" type="button" title="Delete program" aria-label="Delete ${escapeHtml(program.name)}">&times;</button>
      </div>
      <div class="elective-grid">
        ${electives.map(course => `<label class="elective-option"><input class="program-elective" type="checkbox" data-program-index="${index}" value="${escapeHtml(course.id)}" ${program.electives.includes(course.id) ? "checked" : ""} />${escapeHtml(course.shortName)}</label>`).join("") || "<span>No elective courses available.</span>"}
      </div>
    </article>
  `).join("") || `<p class="empty">No programs added.</p>`;
}

function renderResourceHub() {
  $("#resourceRows").innerHTML = resourcesData.map((res, index) => `
    <tr>
      <td><a href="${escapeHtml(res.url)}" target="_blank" style="color: var(--blue);">${escapeHtml(res.title)}</a></td>
      <td>${escapeHtml(res.subject)}</td>
      <td>${escapeHtml(res.addedBy)}</td>
      <td class="check-cell"><input type="checkbox" class="approve-resource" data-index="${index}" ${res.approved ? "checked" : ""} /></td>
      <td><button class="icon-button delete-resource" data-index="${index}" type="button" title="Delete">&times;</button></td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="empty">No resources submitted.</td></tr>`;
}

function renderAssignments() {
  const courseOptions = data.COURSES.map(course => ({ value: course.id, label: course.shortName }));
  $("#assignmentRows").innerHTML = (data.ASSIGNMENTS || []).map((assignment, index) => `
    <tr>
      <td><select data-collection="ASSIGNMENTS" data-index="${index}" data-field="courseId">${courseOptions.map(course => `<option value="${escapeHtml(course.value)}" ${course.value === assignment.courseId ? "selected" : ""}>${escapeHtml(course.label)}</option>`).join("")}</select></td>
      <td><input class="name-input" data-collection="ASSIGNMENTS" data-index="${index}" data-field="title" value="${escapeHtml(assignment.title)}" aria-label="Assignment title" placeholder="E.g. Test Lab 3" /></td>
      <td><input class="url-input" type="url" data-collection="ASSIGNMENTS" data-index="${index}" data-field="url" value="${escapeHtml(assignment.url)}" aria-label="Assignment URL" /></td>
      <td><input class="name-input" data-collection="ASSIGNMENTS" data-index="${index}" data-field="deadline" value="${escapeHtml(assignment.deadline)}" aria-label="Deadline" placeholder="E.g. 11 Sept" /></td>
      <td><button class="icon-button delete-assignment" data-index="${index}" type="button" title="Delete assignment">&times;</button></td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="empty">No assignments added.</td></tr>`;
}

function renderAll() {
  renderSummary();
  renderCourses();
  renderSchedule();
  renderTimes();
  renderPrograms();
  renderResourceHub();
  renderAssignments();
}

function nextId(prefix, items) {
  let number = items.length + 1;
  while (items.some(item => item.id === `${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

function validate() {
  if (!data.COURSES.length) return "Add at least one course.";
  if (!data.TIMES.length) return "Add at least one time slot.";
  if (data.COURSES.some(course => !course.name.trim() || !course.shortName.trim() || !course.code.trim())) return "Complete every course name, short name, and code.";
  if (data.PROGRAMS.some(program => !program.name.trim())) return "Complete every program name.";
  if (data.ASSIGNMENTS && data.ASSIGNMENTS.some(a => !a.title.trim() || !a.url.trim())) return "Complete all assignment titles and URLs.";
  return "";
}

async function loadData() {
  try {
    const [response, resResponse] = await Promise.all([
      fetch(API_URL, { cache: "no-store", credentials: "same-origin" }),
      fetch("/api/resources", { cache: "no-store", credentials: "same-origin" })
    ]);
    if (!response.ok) throw new Error("Could not load timetable data.");
    data = await response.json();
    if (!data.ASSIGNMENTS) data.ASSIGNMENTS = [];
    resourcesData = resResponse.ok ? await resResponse.json() : [];
    renderAll();
    dirty = false;
    $("#publishBtn").disabled = true;
    setSaveState("Published data loaded", "saved");
  } catch (error) {
    setSaveState(error.message, "error-state");
    $("#publishBtn").disabled = true;
    showToast(error.message, true);
  }
}

async function publish() {
  const validationError = validate();
  if (validationError) throw new Error(validationError);

  const requests = [
    fetch(API_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    })
  ];

  if (resourcesDirty) {
    requests.push(
      fetch("/api/resources", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resourcesData)
      })
    );
  }

  const responses = await Promise.all(requests);
  const response = responses[0];
  const resResponse = resourcesDirty ? responses[1] : null;

  const result = await response.json();
  if (response.status === 401) {
    showLogin("Your session expired. Sign in again to continue.");
  }
  if (!response.ok) throw new Error(result.error || "Publish failed.");
  if (resourcesDirty && !resResponse.ok) throw new Error("Resource publish failed.");
  
  data = result;
  if (resourcesDirty) {
    resourcesData = await resResponse.json();
  } else {
    const r = await fetch("/api/resources");
    if (r.ok) resourcesData = await r.json();
  }
  
  dirty = false;
  resourcesDirty = false;
  renderSummary();
  $("#publishBtn").disabled = true;
  setSaveState("Published successfully", "saved");
  showToast("Changes are now live.");
}

document.addEventListener("input", event => {
  const target = event.target;
  if (target.id === "notificationText") {
    data.notification = target.value;
    markDirty();
    return;
  }
  if (target.matches("[data-collection][data-field]") && target.type !== "checkbox") {
    setValue(target.dataset.collection, Number(target.dataset.index), target.dataset.field, target.value);
  }
});

document.addEventListener("change", event => {
  const target = event.target;
  if (target.matches('[data-collection="SCHEDULE"][type="checkbox"]')) {
    setValue("SCHEDULE", Number(target.dataset.index), target.dataset.field, target.checked);
  }
  if (target.matches(".program-elective")) {
    const program = data.PROGRAMS[Number(target.dataset.programIndex)];
    program.electives = target.checked
      ? [...new Set([...program.electives, target.value])]
      : program.electives.filter(id => id !== target.value);
    markDirty();
  }
  if (target.matches(".approve-resource")) {
    resourcesData[Number(target.dataset.index)].approved = target.checked;
    markResourcesDirty();
  }
  if (target.matches(".time-input")) {
    const index = Number(target.dataset.index);
    const previous = data.TIMES[index];
    const value = target.value.trim();
    if (!value) { target.value = previous; return; }
    data.TIMES[index] = value;
    data.SCHEDULE.forEach(item => { if (item.time === previous) item.time = value; });
    markDirty();
    renderSchedule();
  }
});

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.matches(".tab")) {
    $$(".tab, .panel").forEach(element => element.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.tab}Panel`).classList.add("active");
  }
  if (button.id === "addCourseBtn") {
    const id = nextId("course", data.COURSES);
    data.COURSES.push({ id, name: "New Course", shortName: "New Course", code: "TBD", type: "regular", moodleUrl: "", professor: "TBD" });
    markDirty(); renderAll();
  }
  if (button.matches(".delete-course")) {
    const course = data.COURSES[Number(button.dataset.index)];
    if (data.SCHEDULE.some(item => item.course === course.id)) {
      alert("Remove this course from the schedule before deleting it."); return;
    }
    data.COURSES.splice(Number(button.dataset.index), 1);
    data.PROGRAMS.forEach(program => { program.electives = program.electives.filter(id => id !== course.id); });
    markDirty(); renderAll();
  }
  if (button.id === "addClassBtn") {
    if (!data.COURSES.length || !data.TIMES.length) { alert("Add a course and time slot first."); return; }
    data.SCHEDULE.push({ day: data.DAYS[0], time: data.TIMES[0], course: data.COURSES[0].id, lab: false });
    markDirty(); renderSchedule(); renderSummary();
  }
  if (button.matches(".delete-class")) {
    data.SCHEDULE.splice(Number(button.dataset.index), 1);
    markDirty(); renderSchedule(); renderSummary();
  }
  if (button.id === "addTimeBtn") {
    data.TIMES.push("9:00 AM - 10:30 AM");
    markDirty(); renderTimes();
  }
  if (button.matches(".delete-time")) {
    const time = data.TIMES[Number(button.dataset.index)];
    if (data.SCHEDULE.some(item => item.time === time)) { alert("Remove classes using this time slot before deleting it."); return; }
    data.TIMES.splice(Number(button.dataset.index), 1);
    markDirty(); renderTimes();
  }
  if (button.id === "addProgramBtn") {
    data.PROGRAMS.push({ id: nextId("program", data.PROGRAMS), name: "New Program", electives: [] });
    markDirty(); renderPrograms(); renderSummary();
  }
  if (button.matches(".delete-program")) {
    data.PROGRAMS.splice(Number(button.dataset.index), 1);
    markDirty(); renderPrograms(); renderSummary();
  }
  if (button.matches(".delete-resource")) {
    resourcesData.splice(Number(button.dataset.index), 1);
    markResourcesDirty(); renderResourceHub();
  }
  if (button.id === "addAssignmentBtn") {
    if (!data.COURSES.length) { alert("Add a course first."); return; }
    if (!data.ASSIGNMENTS) data.ASSIGNMENTS = [];
    data.ASSIGNMENTS.push({ courseId: data.COURSES[0].id, title: "", url: "", deadline: "" });
    markDirty(); renderAssignments();
  }
  if (button.matches(".delete-assignment")) {
    data.ASSIGNMENTS.splice(Number(button.dataset.index), 1);
    markDirty(); renderAssignments();
  }
  if (button.id === "publishBtn") {
    button.disabled = true;
    setSaveState("Publishing...", "dirty");
    publish()
      .catch(error => {
        setSaveState(error.message, "error-state");
        showToast(error.message, true);
      })
      .finally(() => { button.disabled = !dirty; });
  }
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#loginBtn");
  button.disabled = true;
  $("#loginError").textContent = "Signing in...";
  try {
    await login($("#loginUsername").value.trim(), $("#loginPassword").value);
    showAdmin();
    await loadData();
  } catch (error) {
    $("#loginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  if (dirty && !confirm("Discard unpublished changes and log out?")) return;
  await logout();
});

$("#courseSearch").addEventListener("input", renderCourses);

window.addEventListener("beforeunload", event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function initialize() {
  if (await checkSession()) {
    showAdmin();
    await loadData();
  } else if ($("#loginView").hidden) {
    showLogin();
  }
}

initialize();
