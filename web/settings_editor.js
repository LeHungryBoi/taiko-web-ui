import {
  COMMANDS,
  SERIAL_BAUD_RATE,
  USB_PRODUCT_ID,
  USB_VENDOR_ID,
  buildFactoryResetCommands,
  buildSettingCommands,
  buildSnapshotCommands,
  isStorageErrorState,
  isStorageWarningState,
  parseBoardLine,
  storageStateLabel,
  storageStateTone,
} from "./serial_protocol.js";

const AXES = [0, 1, 2, 3];

const createSettings = () => ({
  deadzone: 8,
  invert: [0, 0, 0, 0],
  press_threshold: [0, 0, 0, 0],
  press_ticks: [1, 1, 1, 1],
  refractory_ticks: [1, 1, 1, 1],
});

function clampInt(value, min, max) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

export function initSettingsEditor() {
  const dom = {
    serialStatus: document.getElementById("serialStatus"),
    storageAlert: document.getElementById("storageAlert"),
    connectButton: document.getElementById("connectButton"),
    refreshButton: document.getElementById("refreshButton"),
    saveButton: document.getElementById("saveButton"),
    factoryResetButton: document.getElementById("factoryResetButton"),
    deadzone: document.getElementById("currentDeadzone"),
    deadzoneValue: document.getElementById("currentDeadzoneValue"),
    defaultDeadzone: document.getElementById("defaultDeadzone"),
    defaultInvert: document.getElementById("defaultInvert"),
    defaultThresholds: document.getElementById("defaultThresholds"),
    defaultPressTicks: document.getElementById("defaultPressTicks"),
    defaultRefractory: document.getElementById("defaultRefractory"),
  };

  const inputs = {
    invert: AXES.map((axis) => document.getElementById(`currentInvert${axis}`)),
    threshold: AXES.map((axis) => document.getElementById(`currentThreshold${axis}`)),
    pressTicks: AXES.map((axis) => document.getElementById(`currentPressTicks${axis}`)),
    refractory: AXES.map((axis) => document.getElementById(`currentRefractory${axis}`)),
  };

  if (
    !dom.serialStatus ||
    !dom.storageAlert ||
    !dom.connectButton ||
    !dom.refreshButton ||
    !dom.saveButton ||
    !dom.factoryResetButton ||
    !dom.deadzone ||
    !dom.deadzoneValue ||
    !dom.defaultDeadzone ||
    !dom.defaultInvert ||
    !dom.defaultThresholds ||
    !dom.defaultPressTicks ||
    !dom.defaultRefractory
  ) {
    return;
  }

  const currentSettings = createSettings();
  const defaultSettings = createSettings();
  let defaultsLoaded = false;
  let currentLoaded = false;

  let port = null;
  let reader = null;
  let writer = null;
  let readLoopRunning = false;
  let recoverAttemptedForCurrentConnection = false;
  let manualRepairInProgress = false;

  function setSerialStatus(text, tone = "idle") {
    dom.serialStatus.textContent = text;
    dom.serialStatus.className = `status status-${tone}`;
  }

  function updateActionButtons() {
    const connected = Boolean(writer);
    dom.refreshButton.disabled = !connected;
    dom.saveButton.disabled = !connected || !currentLoaded;
    dom.factoryResetButton.disabled = !connected;
  }

  function setStorageAlert(state, text) {
    if (!text) {
      dom.storageAlert.textContent = "";
      dom.storageAlert.className = "alert hidden";
      return;
    }

    dom.storageAlert.textContent = text;
    dom.storageAlert.className = `alert ${state}`;
  }

  function renderCurrentSettings() {
    dom.deadzone.value = String(currentSettings.deadzone);
    dom.deadzoneValue.textContent = String(currentSettings.deadzone);

    AXES.forEach((axis) => {
      const invertEl = inputs.invert[axis];
      const thresholdEl = inputs.threshold[axis];
      const pressEl = inputs.pressTicks[axis];
      const refractoryEl = inputs.refractory[axis];

      if (invertEl) invertEl.checked = currentSettings.invert[axis] === 1;
      if (thresholdEl) thresholdEl.value = String(currentSettings.press_threshold[axis]);
      if (pressEl) pressEl.value = String(currentSettings.press_ticks[axis]);
      if (refractoryEl) refractoryEl.value = String(currentSettings.refractory_ticks[axis]);
    });
  }

  function renderDefaults() {
    if (!defaultsLoaded) {
      dom.defaultDeadzone.textContent = "Loading...";
      dom.defaultInvert.textContent = "Loading...";
      dom.defaultThresholds.textContent = "Loading...";
      dom.defaultPressTicks.textContent = "Loading...";
      dom.defaultRefractory.textContent = "Loading...";
      return;
    }

    dom.defaultDeadzone.textContent = String(defaultSettings.deadzone);
    dom.defaultInvert.textContent = defaultSettings.invert.join(", ");
    dom.defaultThresholds.textContent = defaultSettings.press_threshold.join(", ");
    dom.defaultPressTicks.textContent = defaultSettings.press_ticks.join(", ");
    dom.defaultRefractory.textContent = defaultSettings.refractory_ticks.join(", ");
  }

  function loadCurrentFromForm() {
    currentSettings.deadzone = clampInt(dom.deadzone.value, 0, 255);

    AXES.forEach((axis) => {
      currentSettings.invert[axis] = inputs.invert[axis] && inputs.invert[axis].checked ? 1 : 0;
      currentSettings.press_threshold[axis] = clampInt(inputs.threshold[axis]?.value, 0, 255);
      currentSettings.press_ticks[axis] = clampInt(inputs.pressTicks[axis]?.value, 1, 255);
      currentSettings.refractory_ticks[axis] = clampInt(inputs.refractory[axis]?.value, 1, 255);
    });
  }

  function applyBoardSettings(settings, target) {
    target.deadzone = settings.deadzone;
    target.invert = [...settings.invert];
    target.press_threshold = [...settings.press_threshold];
    target.press_ticks = [...settings.press_ticks];
    target.refractory_ticks = [...settings.refractory_ticks];
  }

  function showStorageState(state) {
    const tone = storageStateTone(state);
    const label = storageStateLabel(state);

    if (state === "ok") {
      setStorageAlert("ok", label);
      recoverAttemptedForCurrentConnection = false;
      return;
    }

    setStorageAlert(tone, label);
  }

  async function openPort() {
    if (!("serial" in navigator)) {
      setSerialStatus("Web Serial unavailable", "error");
      setStorageAlert("error", "Your browser does not support Web Serial.");
      return;
    }

    try {
      port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: USB_VENDOR_ID, usbProductId: USB_PRODUCT_ID }],
      });
      await port.open({ baudRate: SERIAL_BAUD_RATE });
      writer = port.writable.getWriter();
      recoverAttemptedForCurrentConnection = false;
      setSerialStatus("Connected", "ok");
      setStorageAlert("hidden", "");
      updateActionButtons();
      startReadLoop();
      await requestSnapshot();
    } catch (error) {
      setSerialStatus("Disconnected", "idle");
      setStorageAlert("error", `Connection failed: ${error.message}`);
      cleanupPort();
    }
  }

  function cleanupPort() {
    recoverAttemptedForCurrentConnection = false;
    readLoopRunning = false;

    if (reader) {
      try {
        reader.cancel();
      } catch (error) {
        void error;
      }
      try {
        reader.releaseLock();
      } catch (error) {
        void error;
      }
      reader = null;
    }

    if (writer) {
      try {
        writer.releaseLock();
      } catch (error) {
        void error;
      }
      writer = null;
    }

    port = null;
    currentLoaded = false;
    updateActionButtons();
  }

  async function sendLine(line) {
    if (!writer) throw new Error("Serial writer is not ready.");
    await writer.write(new TextEncoder().encode(`${line}\n`));
  }

  async function sendLines(lines) {
    for (const line of lines) {
      await sendLine(line);
    }
  }

  async function requestSnapshot() {
    if (!writer) {
      setStorageAlert("warn", "Connect to the board first.");
      return;
    }
    await sendLines(buildSnapshotCommands());
  }

  async function saveCurrentSettings() {
    if (!writer) {
      setStorageAlert("warn", "Connect to the board first.");
      return;
    }
    if (!currentLoaded) {
      setStorageAlert("warn", "Waiting for the board to send current settings...");
      return;
    }
    loadCurrentFromForm();
    setSerialStatus("Saving...", "warn");
    await sendLines(buildSettingCommands(currentSettings));
    await requestSnapshot();
    setSerialStatus("Connected", "ok");
  }

  async function manualFactoryReset() {
    if (!writer) {
      setStorageAlert("warn", "Connect to the board first.");
      return;
    }
    const confirmed = window.confirm(
      "This will reformat the settings storage and restore the factory defaults. Continue?",
    );
    if (!confirmed) return;

    manualRepairInProgress = true;
    setSerialStatus("Repairing...", "warn");
    setStorageAlert("warn", "Reformatting the settings storage and restoring defaults...");

    try {
      await sendLines(buildFactoryResetCommands());
      setSerialStatus("Connected", "ok");
    } catch (error) {
      setStorageAlert("error", `Repair failed: ${error.message}`);
      setSerialStatus("Repair failed", "error");
    } finally {
      manualRepairInProgress = false;
    }
  }

  async function autoRepair() {
    if (!writer || recoverAttemptedForCurrentConnection || manualRepairInProgress) return;

    recoverAttemptedForCurrentConnection = true;
    setSerialStatus("Repairing storage...", "warn");
    setStorageAlert("warn", "Storage error detected. Reformatting and restoring defaults...");

    try {
      await sendLines(buildFactoryResetCommands());
      setSerialStatus("Connected", "ok");
    } catch (error) {
      setStorageAlert("error", `Automatic repair failed: ${error.message}`);
      setSerialStatus("Repair failed", "error");
    }
  }

  async function onBoardLine(line) {
    const message = parseBoardLine(line);
    if (!message) return;

    switch (message.type) {
      case "settings":
        if (message.scope === "current") {
          applyBoardSettings(message.settings, currentSettings);
          currentLoaded = true;
          renderCurrentSettings();
          updateActionButtons();
        } else if (message.scope === "defaults") {
          applyBoardSettings(message.settings, defaultSettings);
          defaultsLoaded = true;
          renderDefaults();
        }
        break;
      case "storage":
        showStorageState(message.state);
        if (isStorageErrorState(message.state)) {
          await autoRepair();
        } else if (isStorageWarningState(message.state)) {
          setStorageAlert(storageStateTone(message.state), storageStateLabel(message.state));
        }
        break;
      case "ack":
        if (message.command === COMMANDS.SAVE) {
          setSerialStatus("Connected", "ok");
        } else if (message.command === COMMANDS.FACTORY_RESET) {
          setSerialStatus("Connected", "ok");
        }
        break;
      case "error":
        setStorageAlert("error", "Board reported a serial error.");
        setSerialStatus("Error", "error");
        break;
      default:
        break;
    }
  }

  async function startReadLoop() {
    if (readLoopRunning || !port?.readable) return;

    readLoopRunning = true;
    reader = port.readable.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (readLoopRunning) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const rawLine = buffer.slice(0, newlineIndex).replace(/\r/g, "").trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (rawLine) {
            await onBoardLine(rawLine);
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }
    } catch (error) {
      if (readLoopRunning) {
        setStorageAlert("error", `Serial connection ended: ${error.message}`);
        setSerialStatus("Disconnected", "idle");
      }
    } finally {
      readLoopRunning = false;
      cleanupPort();
    }
  }

  dom.deadzone.addEventListener("input", () => {
    dom.deadzoneValue.textContent = dom.deadzone.value;
  });

  dom.connectButton.addEventListener("click", openPort);
  dom.refreshButton.addEventListener("click", requestSnapshot);
  dom.saveButton.addEventListener("click", saveCurrentSettings);
  dom.factoryResetButton.addEventListener("click", manualFactoryReset);

  AXES.forEach((axis) => {
    inputs.invert[axis]?.addEventListener("change", () => {});
    inputs.threshold[axis]?.addEventListener("input", () => {});
    inputs.pressTicks[axis]?.addEventListener("input", () => {});
    inputs.refractory[axis]?.addEventListener("input", () => {});
  });

  renderCurrentSettings();
  renderDefaults();
  setSerialStatus("Disconnected", "idle");
  setStorageAlert("hidden", "");
  updateActionButtons();
}
