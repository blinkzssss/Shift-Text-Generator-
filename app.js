// =============================
// Shift Text Generator - app.js
// =============================

const ROLES = [
  { key: "machine", label: "Machine" },
  { key: "lanes", label: "Lanes" },
  { key: "lane1", label: "Lane 1" },
  { key: "lane2", label: "Lane 2" },

  { key: "backShots", label: "Back Shots" },
  { key: "backMilk", label: "Back Milk" },
  { key: "frontShots", label: "Front Shots" },
  { key: "frontMilk", label: "Front Milk" },

  // 5-person special combined role
  { key: "texterSlayer", label: "Texter / Slayer" },

  // 6+ roles
  { key: "texter", label: "Texter" },
  { key: "slayer", label: "Slayer" },

  { key: "blender", label: "Blender" },
];

// Outside cooldown roles (NOTE: texterSlayer is NOT outside)
const OUTSIDE_ROLES = new Set(["lanes", "lane1", "lane2", "texter"]);

const $ = (id) => document.getElementById(id);

// -----------------------------
// Time helpers
// -----------------------------
function minutesToLabel(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = String(m).padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

// Parses:
// - "8:00 AM", "8 AM"
// - "8:00 PM", "8 PM"
// - "8" (defaults to AM)
function parseTimeLabel(s) {
  if (!s) return null;
  s = String(s).trim().toUpperCase();

  // "8:00 AM" or "8 AM"
  let m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m) {
    let hh = Number(m[1]);
    let mm = Number(m[2] || 0);
    const ap = m[3];
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    if (ap === "AM") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  }

  // "8:30" (assume AM)
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    let hh = Number(m[1]);
    let mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  // "8" (assume AM)
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s);
    if (h < 1 || h > 12) return null;
    return h * 60;
  }

  return null;
}

// Smart parse for times WITHOUT AM/PM using the shift window to infer AM vs PM
function parseTimeLabelSmart(s, shiftStartMin, shiftEndMin) {
  if (!s) return null;
  s = String(s).trim().toUpperCase();

  // If AM/PM explicitly provided, use normal parser
  if (/\b(AM|PM)\b/.test(s)) return parseTimeLabel(s);

  // If 24h format like 15:30, use normal parser
  if (/^\d{1,2}:\d{2}$/.test(s)) return parseTimeLabel(s);

  // If it's just "H" or "H:MM" with no AM/PM, infer based on shift window
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return parseTimeLabel(s);

  let hh = Number(m[1]);
  let mm = Number(m[2] || 0);
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;

  const hourMod = hh % 12; // 12 -> 0
  const am = hourMod * 60 + mm; // 12 -> 0:xx
  const pm = (hourMod + 12) * 60 + mm; // 12 -> 12:xx

  // prefer the candidate that falls inside the shift window; otherwise closest to it
  const distToWindow = (t) => {
    if (t < shiftStartMin) return shiftStartMin - t;
    if (t > shiftEndMin) return t - shiftEndMin;
    return 0;
  };

  return distToWindow(pm) <= distToWindow(am) ? pm : am;
}

function timeToMinutes(t) {
  // input type="time" gives "HH:MM"
  const [hh, mm] = String(t).split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

// -----------------------------
// Parsing people lines
// -----------------------------
function extractNameOnly(line) {
  if (!line) return "";
  line = line.trim();
  if (!line) return "";

  // Pipe format: Name | ...
  if (line.includes("|")) return line.split("|")[0].trim();

  // Dash format: Name 9-5 or Name 8:30-3
  const m = line.match(
    /^(.+?)\s+(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)$/
  );
  if (m) return m[1].trim();

  // Name only
  return line;
}

// ✅ FIXED: ALWAYS uses parseTimeLabelSmart for dash ranges (prevents 1-6 => 1AM-6AM)
function parseDashRange(line, shiftStartMin, shiftEndMin) {
  const m = String(line)
    .trim()
    .match(/^(.+?)\s+(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)$/);
  if (!m) return null;

  const name = m[1].trim();
  const startRaw = m[2].trim();
  const endRaw = m[3].trim();

  const entry = parseTimeLabelSmart(startRaw, shiftStartMin, shiftEndMin);
  let exit = parseTimeLabelSmart(endRaw, shiftStartMin, shiftEndMin);

  if (entry == null || exit == null) return null;

  // If exit <= entry, assume it ends later (typical "1-6" meaning 1PM-6PM)
  if (exit <= entry) exit += 12 * 60;

  return { name, entry, exit };
}

function getMasterPeopleNamesOnly() {
  return $("peopleList").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(extractNameOnly)
    .filter(Boolean);
}

// Converts the raw peopleList text into availability windows
// Supports:
// - Name only (full shift)
// - Name | 9 AM | 5 PM
// - Name 9-5
function parsePeopleAvailability(shiftStartMin, shiftEndMin) {
  const rawLines = $("peopleList").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const avail = rawLines
    .map((line) => {
      // Pipe format
      if (line.includes("|")) {
        const parts = line.split("|").map((x) => x.trim()).filter(Boolean);
        const name = parts[0];
        if (!name) return null;

        // If no time fields, full shift
        if (parts.length < 3) return { name, start: shiftStartMin, end: shiftEndMin };

        const entry = parseTimeLabelSmart(parts[1], shiftStartMin, shiftEndMin);
        const exit = parseTimeLabelSmart(parts[2], shiftStartMin, shiftEndMin);

        if (entry == null || exit == null || !(exit > entry)) {
          alert(`Invalid entry/exit for:\n${line}\n\nUse: Name | 9 AM | 5 PM`);
          return null;
        }

        return { name, start: entry, end: exit };
      }

      // Dash format ✅
      const dash = parseDashRange(line, shiftStartMin, shiftEndMin);
      if (dash) return { name: dash.name, start: dash.entry, end: dash.exit };

      // Name only
      return { name: line.trim(), start: shiftStartMin, end: shiftEndMin };
    })
    .filter(Boolean);

  // If duplicates exist, keep the FIRST one
  const seen = new Set();
  const uniq = [];
  for (const p of avail) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    uniq.push(p);
  }
  return uniq;
}

// -----------------------------
// Auto roles by headcount (your rules)
// -----------------------------
function emptyToggles() {
  const t = {};
  for (const r of ROLES) t[r.key] = false;
  return t;
}

function autoTogglesForCount(n) {
  const t = emptyToggles();
  if (n <= 1) return t;

  // 2 people: Machine + Lanes
  if (n === 2) {
    t.machine = true;
    t.lanes = true;
    return t;
  }

  // 3 people: Shots + Milk + Lanes (no split)
  if (n === 3) {
    t.frontShots = true; // display as Shots
    t.frontMilk = true;  // display as Milk
    t.lanes = true;
    return t;
  }

  // 4 people: Shots + Milk + Lane1 + Lane2
  if (n === 4) {
    t.frontShots = true;
    t.frontMilk = true;
    t.lane1 = true;
    t.lane2 = true;
    return t;
  }

  // 5 people: Texter/Slayer combined
  if (n === 5) {
    t.frontShots = true;
    t.frontMilk = true;
    t.lane1 = true;
    t.lane2 = true;
    t.texterSlayer = true;
    return t;
  }

  // 6 people: Texter + Slayer
  if (n === 6) {
    t.frontShots = true;
    t.frontMilk = true;
    t.lane1 = true;
    t.lane2 = true;
    t.texter = true;
    t.slayer = true;
    return t;
  }

  // 7 people: same as 6; extra person becomes extra Texter/Slayer assignment automatically
  if (n === 7) {
    t.frontShots = true;
    t.frontMilk = true;
    t.lane1 = true;
    t.lane2 = true;
    t.texter = true;
    t.slayer = true;
    return t;
  }

  // 8+ people: full split
  if (n >= 8) {
    t.frontShots = true;
    t.frontMilk = true;
    t.backShots = true;
    t.backMilk = true;
    t.lane1 = true;
    t.lane2 = true;
    t.texter = true;
    t.slayer = true;
    return t;
  }

  return t;
}

function baseRoleLabel(roleKey) {
  const r = ROLES.find((x) => x.key === roleKey);
  return r ? r.label : roleKey;
}

// Dynamic labels: if NO split, show Shots/Milk
function roleLabelForBlock(roleKey, blk) {
  const hasSplit = !!blk?.toggles?.backShots || !!blk?.toggles?.backMilk;
  if (!hasSplit) {
    if (roleKey === "frontShots") return "Shots";
    if (roleKey === "frontMilk") return "Milk";
  }
  return baseRoleLabel(roleKey);
}

// -----------------------------
// Draft state
// -----------------------------
function persistDraft(blocks) {
  window.__blocks = blocks;
}

// -----------------------------
// Build blocks
// -----------------------------
function buildBlocks() {
  const start = timeToMinutes($("startTime").value);
  const end = timeToMinutes($("endTime").value);
  const rot = Number($("rotation").value);

  if (!Number.isFinite(rot) || rot < 1) {
    alert("Rotation must be a positive number of minutes.");
    return;
  }
  if (start == null || end == null || !(end > start)) {
    alert("End time must be after start time.");
    return;
  }

  // Build time blocks
  const blocks = [];
  for (let t = start; t < end; t += rot) {
    const a = minutesToLabel(t);
    const b = minutesToLabel(Math.min(t + rot, end));
    blocks.push({
      start: a,
      end: b,
      people: [],
      toggles: emptyToggles(),
    });
  }

  // Build roster per block from availability windows
  const peopleAvail = parsePeopleAvailability(start, end);
  for (const blk of blocks) {
    const blkStart = parseTimeLabel(blk.start);
    const blkEnd = parseTimeLabel(blk.end);
    blk.people = peopleAvail
      .filter((p) => p.start < blkEnd && p.end > blkStart)
      .map((p) => p.name);

    blk.toggles = autoTogglesForCount(blk.people.length);
  }

  renderBlocks(blocks);
  persistDraft(blocks);
}

// -----------------------------
// Render blocks (chips + auto roles display)
// -----------------------------
function uniq(arr) {
  return [...new Set(arr)];
}

function renderBlocks(blocks) {
  const root = $("blocks");
  root.innerHTML = "";

  const masterPeople = getMasterPeopleNamesOnly();

  blocks.forEach((blk, idx) => {
    // Keep block people in sync with master list (remove deleted names)
    blk.people = (blk.people || []).filter((p) => masterPeople.includes(p));
    blk.people = uniq(blk.people);

    // Auto roles for current headcount
    blk.toggles = autoTogglesForCount(blk.people.length);

    const el = document.createElement("div");
    el.className = "block";
    el.innerHTML = `
      <h3>Block ${idx + 1}: ${blk.start} - ${blk.end}</h3>

      <div class="twoCol">
        <div>
          <label>People in this block (click ✕ to remove / + to add)</label>

          <div class="row" style="margin-bottom:10px">
            <button class="btn ghost" data-copy-prev="${idx}" ${idx === 0 ? "disabled" : ""}>
              Copy previous roster
            </button>
            <button class="btn ghost" data-all-on="${idx}">All on</button>
            <button class="btn ghost" data-all-off="${idx}">All off</button>
          </div>

          <div data-people-chips="${idx}" class="row"></div>

          <div class="muted" style="margin-top:8px">
            Auto roles update based on how many people are in this block.
          </div>
        </div>

        <div>
          <label>Enabled roles for this block (auto)</label>
          <div data-auto-roles="${idx}" class="row"></div>
          <div class="muted">Tip: at 7 people, the extra person becomes an extra Texter/Slayer assignment automatically.</div>
        </div>
      </div>
    `;
    root.appendChild(el);

    const chipsWrap = el.querySelector(`[data-people-chips="${idx}"]`);
    const rolesWrap = el.querySelector(`[data-auto-roles="${idx}"]`);

    function renderAutoRoles() {
      rolesWrap.innerHTML = "";

      const enabledKeys = ROLES.map((r) => r.key).filter((k) => !!blk.toggles[k]);

      if (!enabledKeys.length) {
        const span = document.createElement("div");
        span.className = "muted";
        span.textContent = "(no roles – add people)";
        rolesWrap.appendChild(span);
        return;
      }

      for (const key of enabledKeys) {
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.style.opacity = "0.95";
        pill.style.cursor = "default";
        pill.textContent = roleLabelForBlock(key, blk);
        rolesWrap.appendChild(pill);
      }
    }

    function renderPeopleChips() {
      chipsWrap.innerHTML = "";

      for (const person of masterPeople) {
        const active = blk.people.includes(person);
        const chip = document.createElement("button");
        chip.className = "btn";
        chip.type = "button";
        chip.style.width = "auto";
        chip.style.padding = "8px 12px";
        chip.style.borderRadius = "999px";
        chip.style.border = "1px solid #374151";
        chip.style.background = active ? "#1f2937" : "transparent";
        chip.style.color = active ? "#e5e7eb" : "#9ca3af";
        chip.style.display = "inline-flex";
        chip.style.alignItems = "center";
        chip.style.gap = "8px";
        chip.innerHTML = `
          <span>${person}</span>
          <strong style="opacity:${active ? 1 : 0.4}">${active ? "✕" : "+"}</strong>
        `;

        chip.onclick = () => {
          if (active) blk.people = blk.people.filter((p) => p !== person);
          else blk.people = uniq([...blk.people, person]);

          blk.toggles = autoTogglesForCount(blk.people.length);
          persistDraft(blocks);
          renderPeopleChips();
          renderAutoRoles();
        };

        chipsWrap.appendChild(chip);
      }
    }

    renderPeopleChips();
    renderAutoRoles();

    // Buttons
    const copyBtn = el.querySelector(`[data-copy-prev="${idx}"]`);
    if (copyBtn) {
      copyBtn.onclick = () => {
        blk.people = [...(blocks[idx - 1].people || [])];
        blk.people = uniq(blk.people);
        blk.toggles = autoTogglesForCount(blk.people.length);
        persistDraft(blocks);
        renderPeopleChips();
        renderAutoRoles();
      };
    }

    el.querySelector(`[data-all-on="${idx}"]`).onclick = () => {
      blk.people = uniq([...masterPeople]);
      blk.toggles = autoTogglesForCount(blk.people.length);
      persistDraft(blocks);
      renderPeopleChips();
      renderAutoRoles();
    };

    el.querySelector(`[data-all-off="${idx}"]`).onclick = () => {
      blk.people = [];
      blk.toggles = autoTogglesForCount(0);
      persistDraft(blocks);
      renderPeopleChips();
      renderAutoRoles();
    };
  });

  persistDraft(blocks);
}

// -----------------------------
// Assignment logic
// -----------------------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoleSlotsForBlock(blk) {
  const hasLanes = !!blk.toggles.lanes;
  const hasLane1 = !!blk.toggles.lane1;
  const hasLane2 = !!blk.toggles.lane2;

  if (hasLanes && (hasLane1 || hasLane2)) {
    throw new Error('Enable either "Lanes" OR ("Lane 1" + "Lane 2"), not both.');
  }
  if (!hasLanes && (hasLane1 !== hasLane2)) {
    throw new Error('If using Lane 1/2, you must enable BOTH Lane 1 and Lane 2.');
  }

  const hasTexterSlayer = !!blk.toggles.texterSlayer;
  const hasTexter = !!blk.toggles.texter;
  const hasSlayer = !!blk.toggles.slayer;
  if (hasTexterSlayer && (hasTexter || hasSlayer)) {
    throw new Error('Invalid roles: "Texter / Slayer" cannot be enabled with "Texter" or "Slayer".');
  }

  const machineOn = !!blk.toggles.machine;
  const milkShotsOn =
    !!blk.toggles.frontShots ||
    !!blk.toggles.frontMilk ||
    !!blk.toggles.backShots ||
    !!blk.toggles.backMilk;

  if (machineOn && milkShotsOn) {
    throw new Error('Invalid roles: If "Machine" is enabled, you cannot enable Shots/Milk roles in the same block.');
  }

  const enabled = ROLES.map((r) => r.key).filter((k) => !!blk.toggles[k]);
  let slots = [...enabled];

  const peopleCount = blk.people.length;
  const baseSlotsCount = slots.length;

  if (peopleCount < baseSlotsCount) {
    throw new Error(`Not enough people: ${peopleCount} people for ${baseSlotsCount} enabled roles.`);
  }

  const extra = peopleCount - baseSlotsCount;

  // Extras can only go to texter/slayer (NOT texterSlayer)
  if (extra > 0) {
    const canAbsorb = [];
    if (blk.toggles.texter) canAbsorb.push("texter");
    if (blk.toggles.slayer) canAbsorb.push("slayer");

    if (canAbsorb.length === 0) {
      throw new Error(
        `Too many people (${peopleCount}) for enabled roles (${baseSlotsCount}), and Texter/Slayer are OFF so extras can’t be assigned.`
      );
    }

    for (let i = 0; i < extra; i++) {
      const role = canAbsorb[i % canAbsorb.length];
      slots.push(role);
    }
  }

  return slots;
}

function assignBlock(people, roleSlots, state) {
  const used = new Set();
  const assignmentByRole = {}; // roleKey -> array of names

  function slotCandidates(roleKey) {
    return people.filter((p) => {
      if (used.has(p)) return false;
      if ((state.lastRole[p] || null) === roleKey) return false;
      if (OUTSIDE_ROLES.has(roleKey) && state.outsideCooldown.has(p)) return false;
      return true;
    });
  }

  function pickNextSlot(slotsLeft) {
    return [...slotsLeft].sort((a, b) => {
      const ao = OUTSIDE_ROLES.has(a) ? 0 : 1;
      const bo = OUTSIDE_ROLES.has(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return slotCandidates(a).length - slotCandidates(b).length;
    })[0];
  }

  function backtrack(slotsLeft) {
    if (slotsLeft.length === 0) return true;

    const roleKey = pickNextSlot(slotsLeft);

    const remaining = [];
    let removed = false;
    for (const s of slotsLeft) {
      if (!removed && s === roleKey) removed = true;
      else remaining.push(s);
    }

    const candidates = shuffle(slotCandidates(roleKey));
    for (const person of candidates) {
      used.add(person);

      if (!assignmentByRole[roleKey]) assignmentByRole[roleKey] = [];
      assignmentByRole[roleKey].push(person);

      if (backtrack(remaining)) return true;

      assignmentByRole[roleKey].pop();
      if (assignmentByRole[roleKey].length === 0) delete assignmentByRole[roleKey];
      used.delete(person);
    }

    return false;
  }

  const ok = backtrack([...roleSlots]);
  if (!ok) {
    throw new Error("No valid assignment found (outside cooldown or repeat-role rule). Try adjusting roster.");
  }

  return assignmentByRole;
}

// -----------------------------
// Generate output
// -----------------------------
function generateText() {
  const blocks = window.__blocks || [];
  if (!blocks.length) {
    alert("Build blocks first.");
    return;
  }

  const state = {
    lastRole: {},
    outsideCooldown: new Set(),
  };

  const OUTPUT_ORDER = [
    "machine",
    "lanes",
    "lane1",
    "lane2",
    "backShots",
    "backMilk",
    "frontShots",
    "frontMilk",
    "blender",
    "texterSlayer",
    "texter",
    "slayer",
  ];

  let out = "";

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];

    if (!blk.people || blk.people.length === 0) {
      alert(`Block ${i + 1} (${blk.start} - ${blk.end}) has no people.`);
      return;
    }

    blk.toggles = autoTogglesForCount(blk.people.length);

    let roleSlots;
    try {
      roleSlots = buildRoleSlotsForBlock(blk);
    } catch (e) {
      alert(`Block ${i + 1} (${blk.start} - ${blk.end}) error:\n${e.message}`);
      return;
    }

    let assignmentByRole;
    try {
      assignmentByRole = assignBlock(blk.people, roleSlots, state);
    } catch (e) {
      alert(`Block ${i + 1} (${blk.start} - ${blk.end}) error:\n${e.message}`);
      return;
    }

    out += ` ${blk.start} - ${blk.end} \n`;

    for (const roleKey of OUTPUT_ORDER) {
      const enabled = !!blk.toggles[roleKey];
      const assigned = assignmentByRole[roleKey] || [];
      if (!enabled && assigned.length === 0) continue;
      out += `${roleLabelForBlock(roleKey, blk)}: ${assigned.join(", ")}\n`;
    }

    out += `\n`;

    const newOutside = new Set();
    for (const [roleKey, peopleArr] of Object.entries(assignmentByRole)) {
      for (const person of peopleArr) {
        state.lastRole[person] = roleKey;
        if (OUTSIDE_ROLES.has(roleKey)) newOutside.add(person);
      }
    }
    state.outsideCooldown = newOutside;
  }

  $("output").textContent = out.trim() || "(empty)";
}

async function copyOutput() {
  const text = $("output").textContent;
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied!");
  } catch {
    alert("Copy failed. Select and copy manually.");
  }
}

// -----------------------------
// Save / Load / Clear
// -----------------------------
function saveLocal() {
  const blocks = window.__blocks || [];
  const data = {
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    rotation: $("rotation").value,
    peopleList: $("peopleList").value,
    blocks,
  };
  localStorage.setItem("shift_text_pwa", JSON.stringify(data));
  alert("Saved on this device.");
}

function loadLocal() {
  const raw = localStorage.getItem("shift_text_pwa");
  if (!raw) return alert("No saved data found.");

  const data = JSON.parse(raw);
  $("startTime").value = data.startTime || "12:00";
  $("endTime").value = data.endTime || "18:00";
  $("rotation").value = data.rotation || "60";
  $("peopleList").value = data.peopleList || "";

  const blocks = data.blocks || [];
  for (const blk of blocks) {
    blk.toggles = autoTogglesForCount((blk.people || []).length);
  }

  renderBlocks(blocks);
  persistDraft(blocks);
  alert("Loaded.");
}

function clearNames() {
  $("peopleList").value = "";
  $("blocks").innerHTML = "";
  $("output").textContent = "(nothing yet)";
  window.__blocks = [];
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "UPDATED") {
      alert(`App updated (${event.data.version}) — reloading...`);
      window.location.reload();
    }
  });
}

// -----------------------------
// Wire up buttons
// -----------------------------
$("buildBlocks")?.addEventListener("click", buildBlocks);
$("generate")?.addEventListener("click", generateText);
$("copy")?.addEventListener("click", copyOutput);
$("saveLocal")?.addEventListener("click", saveLocal);
$("loadLocal")?.addEventListener("click", loadLocal);
$("clearPeople")?.addEventListener("click", clearNames);

