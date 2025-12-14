const ROLES = [
  { key: "machine", label: "Machine" },
  { key: "lanes", label: "Lanes" },
  { key: "lane1", label: "Lane 1" },
  { key: "lane2", label: "Lane 2" },
  { key: "backShots", label: "Back Shots" },
  { key: "backMilk", label: "Back Milk" },
  { key: "frontShots", label: "Front Shots" },
  { key: "frontMilk", label: "Front Milk" },
  { key: "texter", label: "Texter" },
  { key: "slayer", label: "Slayer" },
  { key: "blender", label: "Blender" },
];

const $ = (id) => document.getElementById(id);

function minutesToLabel(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;

  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  const mm = String(m).padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}


function timeToMinutes(t) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function renderRoleDefaults() {
  const wrap = $("roleDefaults");
  wrap.innerHTML = "";
  for (const r of ROLES) {
    const pill = document.createElement("label");
    pill.className = "pill";
    pill.innerHTML = `<input type="checkbox" data-role="${r.key}"> <span>${r.label}</span>`;
    wrap.appendChild(pill);
  }
  // sensible defaults: machine + lanes + texter
  wrap.querySelector('[data-role="frontShots"]').checked = true;
  wrap.querySelector('[data-role="frontMilk"]').checked = true;
  wrap.querySelector('[data-role="lane1"]').checked = true;
  wrap.querySelector('[data-role="lane2"]').checked = true;
}

function getDefaultToggles() {
  const toggles = {};
  document.querySelectorAll("#roleDefaults input[type=checkbox]").forEach(cb => {
    toggles[cb.dataset.role] = cb.checked;
  });
  return toggles;
}

function buildBlocks() {
  const start = timeToMinutes($("startTime").value);
  const end = timeToMinutes($("endTime").value);
  const rot = Number($("rotation").value);
if (!Number.isFinite(rot) || rot < 1) {
  alert("Rotation must be a positive number of minutes.");
  return;
}

  if (!(end > start)) {
    alert("End time must be after start time.");
    return;
  }
  const defaults = getDefaultToggles();

  const blocks = [];
  for (let t = start; t < end; t += rot) {
    const a = minutesToLabel(t);
    const b = minutesToLabel(Math.min(t + rot, end));
    blocks.push({
      start: a,
      end: b,
      people: [], // set per block
      toggles: { ...defaults },
    });
  }

  // prefill people list into first block (optional)
  const people = $("peopleList").value.split("\n").map(s => s.trim()).filter(Boolean);
  // Default EVERY block to everyone in master list (you can remove per block fast)
for (const b of blocks) b.people = [...people];


  renderBlocks(blocks);
  persistDraft(blocks);
}

function persistDraft(blocks) {
  window.__blocks = blocks;
}

function getMasterPeople() {
  return $("peopleList").value
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr)];
}

function renderBlocks(blocks) {
  const root = $("blocks");
  root.innerHTML = "";

  const masterPeople = getMasterPeople();

  blocks.forEach((blk, idx) => {
    // Default block people to master list
    if (!blk.people || blk.people.length === 0) {
      blk.people = [...masterPeople];
    } else {
      // Sync with master list
      blk.people = blk.people.filter(p => masterPeople.includes(p));
      for (const p of masterPeople) {
        if (!blk.people.includes(p)) blk.people.push(p);
      }
      blk.people = uniq(blk.people);
    }

    const el = document.createElement("div");
    el.className = "block";

    el.innerHTML = `
      <h3>Block ${idx + 1}: ${blk.start} – ${blk.end}</h3>

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
        </div>

        <div>
  <label>Enabled roles for this block</label>

  <div class="row" style="margin-bottom:10px">
    <button class="btn ghost" data-copy-roles-prev="${idx}" ${idx === 0 ? "disabled" : ""}>
  Copy previous roles
</button>

  </div>

  <div data-toggles="${idx}"></div>
  <div class="muted">Tip: use Lanes OR Lane1+Lane2 (not both).</div>
</div>




    `;

    root.appendChild(el);
// Copy previous roles button
const copyRolesBtn = el.querySelector(`[data-copy-roles-prev="${idx}"]`);
if (copyRolesBtn) {
  copyRolesBtn.onclick = () => {
    if (idx === 0) return;
    blk.toggles = { ...(blocks[idx - 1]?.toggles || {}) };
    persistDraft(blocks);
    renderBlocks(blocks); // redraw so checkboxes update
  };
}

    // --- People chips ---
    const chipsWrap = el.querySelector(`[data-people-chips="${idx}"]`);

    function renderPeopleChips() {
      chipsWrap.innerHTML = "";

      masterPeople.forEach(person => {
        const active = blk.people.includes(person);

        const chip = document.createElement("button");
        chip.className = "btn";
        chip.type = "button";
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
          <strong>${active ? "✕" : "+"}</strong>
        `;

        chip.onclick = () => {
          if (active) blk.people = blk.people.filter(p => p !== person);
          else blk.people = uniq([...blk.people, person]);
          persistDraft(blocks);
          renderPeopleChips();
        };

        chipsWrap.appendChild(chip);
      });
    }

    renderPeopleChips();

    // Buttons
    const copyBtn = el.querySelector(`[data-copy-prev="${idx}"]`);
    if (copyBtn) {
      copyBtn.onclick = () => {
        blk.people = [...(blocks[idx - 1].people || [])];
        persistDraft(blocks);
        renderPeopleChips();
      };
    }

    el.querySelector(`[data-all-on="${idx}"]`).onclick = () => {
      blk.people = [...masterPeople];
      persistDraft(blocks);
      renderPeopleChips();
    };

    el.querySelector(`[data-all-off="${idx}"]`).onclick = () => {
      blk.people = [];
      persistDraft(blocks);
      renderPeopleChips();
    };

    // --- Role toggles ---
    const toggWrap = el.querySelector(`[data-toggles="${idx}"]`);
    ROLES.forEach(r => {
      const pill = document.createElement("label");
      pill.className = "pill";
      pill.innerHTML = `<input type="checkbox"> <span>${r.label}</span>`;
      const cb = pill.querySelector("input");
      cb.checked = !!blk.toggles[r.key];
      cb.onchange = () => {
        blk.toggles[r.key] = cb.checked;
        persistDraft(blocks);
      };
      toggWrap.appendChild(pill);
    });
  });

  persistDraft(blocks);
}




const OUTSIDE_ROLES = new Set(["lanes", "lane1", "lane2", "texter"]);

function roleLabel(roleKey) {
  const r = ROLES.find(x => x.key === roleKey);
  return r ? r.label : roleKey;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoleSlotsForBlock(blk) {
  // Validate lanes vs lane1/lane2
  const hasLanes = !!blk.toggles.lanes;
  const hasLane1 = !!blk.toggles.lane1;
  const hasLane2 = !!blk.toggles.lane2;
  if (hasLanes && (hasLane1 || hasLane2)) {
    throw new Error(`Enable either "Lanes" OR ("Lane 1" + "Lane 2"), not both. Same thing applies for machine: select shots and milk if there are enough people`);
  }
  if (!hasLanes && (hasLane1 !== hasLane2)) {
    throw new Error(`If using Lane 1/2, you must enable BOTH Lane 1 and Lane 2.`);
  }
    // Validate: Machine cannot be enabled with any shots/milk roles
  const machineOn = !!blk.toggles.machine;
  const milkShotsOn =
    !!blk.toggles.frontShots ||
    !!blk.toggles.frontMilk ||
    !!blk.toggles.backShots ||
    !!blk.toggles.backMilk;

  if (machineOn && milkShotsOn) {
    throw new Error(
      `Invalid roles: If "Machine" is enabled, you cannot enable Front Shots, Front Milk, Back Shots, or Back Milk in the same block.`
    );
  }


  // Base enabled roles (1 slot each), including texter/slayer if enabled
  const enabled = ROLES
    .map(r => r.key)
    .filter(k => !!blk.toggles[k]);

  // Make 1 slot per enabled role
  let slots = [...enabled];

  const peopleCount = blk.people.length;
  const baseSlotsCount = slots.length;

  if (peopleCount < baseSlotsCount) {
    throw new Error(`Not enough people: ${peopleCount} people for ${baseSlotsCount} enabled roles.`);
  }

  const extra = peopleCount - baseSlotsCount;

  if (extra > 0) {
    const canAbsorb = [];
    if (blk.toggles.texter) canAbsorb.push("texter");
    if (blk.toggles.slayer) canAbsorb.push("slayer");

    if (canAbsorb.length === 0) {
      throw new Error(
        `Too many people (${peopleCount}) for enabled roles (${baseSlotsCount}), and Texter/Slayer are OFF so extras can’t be assigned.`
      );
    }

    // Distribute extra slots across texter/slayer (balanced)
    for (let i = 0; i < extra; i++) {
      const role = canAbsorb[i % canAbsorb.length];
      slots.push(role);
    }
  }

  // If texter/slayer are ON they already have 1 slot; extras add more
  // Everyone will be assigned exactly once.
  return slots;
}

// Backtracking assignment for one block
function assignBlock(people, roleSlots, state) {
  const used = new Set();
  const assignmentByRole = {}; // roleKey -> array of names

  // Precompute candidates per slot (depends on used set, so we’ll compute dynamically)
  function slotCandidates(roleKey) {
    return people.filter(p => {
      if (used.has(p)) return false;
      if ((state.lastRole[p] || null) === roleKey) return false; // no same role consecutive blocks
      if (OUTSIDE_ROLES.has(roleKey) && state.outsideCooldown.has(p)) return false; // outside cooldown
      return true;
    });
  }

  // Sort slots by “tightness” each recursion
  function pickNextSlot(slotsLeft) {
    // Prefer outside roles first (harder), then others
    return [...slotsLeft].sort((a, b) => {
      const ao = OUTSIDE_ROLES.has(a) ? 0 : 1;
      const bo = OUTSIDE_ROLES.has(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      // Next: fewer candidates first
      return slotCandidates(a).length - slotCandidates(b).length;
    })[0];
  }

  function backtrack(slotsLeft) {
    if (slotsLeft.length === 0) return true;

    const roleKey = pickNextSlot(slotsLeft);
    const remaining = [];
    let picked = false;
    for (const s of slotsLeft) {
      if (!picked && s === roleKey) {
        picked = true;
      } else {
        remaining.push(s);
      }
    }

    const candidates = shuffle(slotCandidates(roleKey));
    for (const person of candidates) {
      used.add(person);
      if (!assignmentByRole[roleKey]) assignmentByRole[roleKey] = [];
      assignmentByRole[roleKey].push(person);

      if (backtrack(remaining)) return true;

      // undo
      assignmentByRole[roleKey].pop();
      if (assignmentByRole[roleKey].length === 0) delete assignmentByRole[roleKey];
      used.delete(person);
    }

    return false;
  }

  const ok = backtrack([...roleSlots]);
  if (!ok) {
    // Give a helpful message
    throw new Error(
      `No valid assignment found (likely due to outside cooldown or repeat-role rule). Try adjusting toggles/roster for this block.`
    );
  }

  return assignmentByRole;
}


function generateText() {
  const blocks = window.__blocks || [];
  if (!blocks.length) {
    alert("Build blocks first.");
    return;
  }

  // State tracked across blocks
  const state = {
    lastRole: {},               // person -> last roleKey
    outsideCooldown: new Set()  // people who were outside last block
  };

  // role order in output (only enabled roles will show)
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
    "texter",
    "slayer",
  ];

  let out = "";
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];

    // Basic roster validation
    if (!blk.people || blk.people.length === 0) {
      alert(`Block ${i + 1} (${blk.start}–${blk.end}) has no people.`);
      return;
    }

    let roleSlots;
    try {
      roleSlots = buildRoleSlotsForBlock(blk);
    } catch (e) {
      alert(`Block ${i + 1} (${blk.start}–${blk.end}) error:\n${e.message}`);
      return;
    }

    let assignmentByRole;
    try {
      assignmentByRole = assignBlock(blk.people, roleSlots, state);
    } catch (e) {
      alert(`Block ${i + 1} (${blk.start}–${blk.end}) error:\n${e.message}`);
      return;
    }

    // Build text for this block
    out += `${blk.start} – ${blk.end} \n`;

    // Only show roles that are enabled OR have assigned people (texter/slayer extras)
    for (const roleKey of OUTPUT_ORDER) {
      const enabled = !!blk.toggles[roleKey];
      const assigned = assignmentByRole[roleKey] || [];
      if (!enabled && assigned.length === 0) continue;

      const names = assigned.join(", ");
      out += `${roleLabel(roleKey)}: ${names}\n`;
    }

    out += `\n`;

    // Update state for next block
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

function saveLocal() {
  const blocks = window.__blocks || [];
  const data = {
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    rotation: $("rotation").value,
    peopleList: $("peopleList").value,
    roleDefaults: getDefaultToggles(),
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

  renderRoleDefaults();
  // restore defaults
  const defaults = data.roleDefaults || {};
  document.querySelectorAll("#roleDefaults input[type=checkbox]").forEach(cb => {
    cb.checked = !!defaults[cb.dataset.role];
  });

  renderBlocks(data.blocks || []);
  alert("Loaded.");
}

renderRoleDefaults();
$("buildBlocks").addEventListener("click", buildBlocks);
$("generate").addEventListener("click", generateText);
$("copy").addEventListener("click", copyOutput);
$("saveLocal").addEventListener("click", saveLocal);
$("loadLocal").addEventListener("click", loadLocal);
