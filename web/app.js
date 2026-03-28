// Gamepad diagnostics ---------------------------------
const nameEl = document.getElementById("deviceName");
const statusEl = document.getElementById("gamepadStatus");
const diagnosticsEl = document.getElementById("diagnostics");
const buttonDiagnosticsEl = document.getElementById("buttonDiagnostics");

const PEAK_FALL_SPEED = 0.45;
let gamepadIndex = null;
let axisState = [];

window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
  updateStatus(e.gamepad);
});

window.addEventListener("gamepaddisconnected", (e) => {
  if (gamepadIndex === e.gamepad.index) {
    gamepadIndex = null;
    resetUI();
  }
});

function updateStatus(gp) {
  nameEl.textContent = gp.id;
  statusEl.textContent = `Active (index ${gp.index})`;
  statusEl.className = "pill ok";
}

function resetUI() {
  nameEl.textContent = "No Device Detected";
  statusEl.textContent = "Gamepad disconnected";
  statusEl.className = "pill warn";
  diagnosticsEl.innerHTML = "Waiting for axis data…";
  buttonDiagnosticsEl.innerHTML = "No buttons detected.";
  axisState = [];
}

function renderAxis(i, rawValue, currentPeakPos) {
  const normPos = ((rawValue + 1) / 2) * 100;
  const peakLeft = currentPeakPos.toFixed(2);

  return `
    <div class="axis-entry">
      <div class="axis-header">
        <span>AXIS ${i}</span>
        <span class="muted">${rawValue.toFixed(4)}</span>
      </div>
      <div class="axis-bar">
        <div class="center"></div>
        <div class="peak" style="left:${peakLeft}%;"></div>
        <div class="dot" style="left:${normPos}%;"></div>
      </div>
    </div>
  `;
}

function diagnosticsLoop() {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];

  if (gp) {
    if (axisState.length !== gp.axes.length) {
      axisState = Array.from({ length: gp.axes.length }, (_, i) => ({
        peakPos: ((gp.axes[i] + 1) / 2) * 100,
      }));
    }

    let axisHtml = "";
    gp.axes.forEach((val, i) => {
      const state = axisState[i];
      const currentPos = ((val + 1) / 2) * 100;
      const distActual = Math.abs(currentPos - 50);
      const distPeak = Math.abs(state.peakPos - 50);

      if (distActual > distPeak) {
        state.peakPos = currentPos;
      } else {
        if (state.peakPos > currentPos) {
          state.peakPos = Math.max(currentPos, state.peakPos - PEAK_FALL_SPEED);
        } else if (state.peakPos < currentPos) {
          state.peakPos = Math.min(currentPos, state.peakPos + PEAK_FALL_SPEED);
        }
      }

      axisHtml += renderAxis(i, val, state.peakPos);
    });
    diagnosticsEl.classList.remove("empty");
    diagnosticsEl.innerHTML = axisHtml;

    let btnHtml = "";
    gp.buttons.forEach((btn, i) => {
      const fillHeight = (btn.value * 100).toFixed(0);
      const isPressed = btn.pressed;
      btnHtml += `
        <div class="button-cell">
          <div class="button-fill" style="height:${fillHeight}%;"></div>
          <div class="button-label">${isPressed ? "●" : "○"} B${i} • ${fillHeight}%</div>
        </div>`;
    });
    buttonDiagnosticsEl.classList.remove("empty");
    buttonDiagnosticsEl.innerHTML = btnHtml;
  } else {
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        gamepadIndex = i;
        updateStatus(gamepads[i]);
        break;
      }
    }
  }
  requestAnimationFrame(diagnosticsLoop);
}
requestAnimationFrame(diagnosticsLoop);

// Settings / Web Serial ---------------------------------
const serialStatusEl = document.getElementById("serialStatus");
const connectBtn = document.getElementById("connectBtn");
const refreshBtn = document.getElementById("refreshBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const deadzoneInput = document.getElementById("deadzone");
const deadzoneValue = document.getElementById("deadzoneValue");
const invertToggles = Array.from(document.querySelectorAll("input[data-axis]"));
const thrInputs = Array.from(document.querySelectorAll("input[data-thr]"));
const ptInputs = Array.from(document.querySelectorAll("input[data-pt]"));
const rpInputs = Array.from(document.querySelectorAll("input[data-rp]"));
const defaultDeadzoneEl = document.getElementById("defaultDeadzone");
const defaultInvertEl = document.getElementById("defaultInvert");
const defaultThresholdEl = document.getElementById("defaultThresholds");
const defaultPressEl = document.getElementById("defaultPressTicks");
const defaultRefractoryEl = document.getElementById("defaultRefractory");
const logEl = document.getElementById("log");

let port = null;
let reader = null;
let writer = null;
let readLoopAbort = false;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const currentSettings = {
  deadzone: 8,
  invert: [0, 0, 0, 0],
  thr: [200, 200, 200, 200],
  pt: [2, 2, 2, 2],
  rp: [20, 20, 20, 20],
};

const defaultSettings = {
  deadzone: 8,
  invert: [0, 0, 0, 0],
  thr: [200, 200, 200, 200],
  pt: [2, 2, 2, 2],
  rp: [20, 20, 20, 20],
};

const clamp = (val, min, max) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
};

deadzoneInput.addEventListener("input", () => {
  deadzoneValue.textContent = deadzoneInput.value;
});

connectBtn.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    log("Web Serial not available in this browser.");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    readLoopAbort = false;
    readLoop();
    serialStatusEl.textContent = "Connected";
    serialStatusEl.className = "pill ok";
    log("Connected. Requesting settings…");
    await requestSettings();
  } catch (err) {
    log("Connect failed: " + err.message);
    serialStatusEl.textContent = "Serial idle";
    serialStatusEl.className = "pill neutral";
  }
});

refreshBtn.addEventListener("click", async () => {
  if (!port) {
    log("Connect first.");
    return;
  }
  await requestSettings();
});

saveBtn.addEventListener("click", async () => {
  if (!writer) return log("Not connected.");
  collectFormIntoSettings();
  await pushSettings();
});

resetBtn.addEventListener("click", async () => {
  if (!writer) return log("Not connected.");
  await sendLine("RESET");
});

async function readLoop() {
  reader = port.readable.getReader();
  let pending = "";
  try {
    while (!readLoopAbort) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, idx).replace(/\r/g, "").trim();
        pending = pending.slice(idx + 1);
        if (line.length) handleLine(line);
      }
    }
  } catch (err) {
    log("Serial read stopped: " + err.message);
  } finally {
    reader.releaseLock();
  }
}

function parseSettingsLine(line, target) {
  const parts = line.split(" ");
  const getValue = (key) => {
    const entry = parts.find((p) => p.startsWith(`${key}=`));
    return entry ? entry.split("=")[1] : null;
  };

  const applyList = (value, dest, min, max) => {
    if (!value) return;
    const vals = value.split(",").map((token) => clamp(Number(token), min, max));
    for (let i = 0; i < dest.length; i++) {
      if (vals[i] !== undefined) dest[i] = vals[i];
    }
  };

  const dz = getValue("dz");
  if (dz) target.deadzone = clamp(Number(dz), 0, 50);
  applyList(getValue("inv"), target.invert, 0, 1);
  applyList(getValue("thr"), target.thr, 0, 255);
  applyList(getValue("pt"), target.pt, 1, 250);
  applyList(getValue("rp"), target.rp, 1, 250);
}

function handleLine(line) {
  log("⇽ " + line);
  if (line.startsWith("CFG")) {
    parseSettingsLine(line, currentSettings);
    applySettingsToForm();
  } else if (line.startsWith("DEFAULTS")) {
    parseSettingsLine(line, defaultSettings);
    updateDefaultsPanel();
  }
}

function applySettingsToForm() {
  deadzoneInput.value = currentSettings.deadzone;
  deadzoneValue.textContent = currentSettings.deadzone;
  invertToggles.forEach((chk) => {
    const axis = Number(chk.dataset.axis);
    chk.checked = currentSettings.invert[axis] === 1;
  });
  thrInputs.forEach((input) => {
    const ax = Number(input.dataset.thr);
    input.value = currentSettings.thr[ax];
  });
  ptInputs.forEach((input) => {
    const ax = Number(input.dataset.pt);
    input.value = currentSettings.pt[ax];
  });
  rpInputs.forEach((input) => {
    const ax = Number(input.dataset.rp);
    input.value = currentSettings.rp[ax];
  });
}

function collectFormIntoSettings() {
  currentSettings.deadzone = parseInt(deadzoneInput.value, 10);
  invertToggles.forEach((chk) => {
    currentSettings.invert[Number(chk.dataset.axis)] = chk.checked ? 1 : 0;
  });
  thrInputs.forEach((input) => {
    const ax = Number(input.dataset.thr);
    currentSettings.thr[ax] = clamp(parseInt(input.value, 10), 0, 255);
  });
  ptInputs.forEach((input) => {
    const ax = Number(input.dataset.pt);
    currentSettings.pt[ax] = clamp(parseInt(input.value, 10), 1, 100);
  });
  rpInputs.forEach((input) => {
    const ax = Number(input.dataset.rp);
    currentSettings.rp[ax] = clamp(parseInt(input.value, 10), 1, 255);
  });
}

async function pushSettings() {
  await sendLine(`SET DEADZONE ${currentSettings.deadzone}`);
  for (let i = 0; i < 4; i++) {
    await sendLine(`SET INVERT ${i} ${currentSettings.invert[i]}`);
    await sendLine(`SET THR ${i} ${currentSettings.thr[i]}`);
    await sendLine(`SET PT ${i} ${currentSettings.pt[i]}`);
    await sendLine(`SET RP ${i} ${currentSettings.rp[i]}`);
  }
  await sendLine("SAVE");
}

async function requestSettings() {
  await sendLine("GET");
}

async function sendLine(line) {
  if (!writer) throw new Error("Writer not ready");
  log("⇾ " + line);
  const data = encoder.encode(line + "\n");
  await writer.write(data);
}

function log(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

function updateDefaultsPanel() {
  defaultDeadzoneEl.textContent = defaultSettings.deadzone;
  defaultInvertEl.textContent = defaultSettings.invert.join(",");
  defaultThresholdEl.textContent = defaultSettings.thr.join(",");
  defaultPressEl.textContent = defaultSettings.pt.join(",");
  defaultRefractoryEl.textContent = defaultSettings.rp.join(",");
}

// seed form with defaults
applySettingsToForm();
updateDefaultsPanel();
