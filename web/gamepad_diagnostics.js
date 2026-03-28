const PEAK_FALL_SPEED = 0.45;

export function initGamepadDiagnostics() {
  const nameEl = document.getElementById("deviceName");
  const statusEl = document.getElementById("gamepadStatus");
  const diagnosticsEl = document.getElementById("diagnostics");
  const buttonDiagnosticsEl = document.getElementById("buttonDiagnostics");

  if (!nameEl || !statusEl || !diagnosticsEl || !buttonDiagnosticsEl) return;

  let gamepadIndex = null;
  let axisState = [];

  function updateStatus(gp) {
    nameEl.textContent = gp.id;
    statusEl.textContent = `Active: Index ${gp.index}`;
    statusEl.className = "status status-ok";
  }

  function resetUI() {
    nameEl.textContent = "No Device Detected";
    statusEl.textContent = "Gamepad Disconnected.";
    statusEl.className = "status status-error";
    diagnosticsEl.innerHTML = '<p class="empty">Waiting for axis data...</p>';
    buttonDiagnosticsEl.innerHTML = '<p class="empty">No buttons detected.</p>';
    axisState = [];
  }

  function generateAxisHtml(i, rawValue, currentPeakPos) {
    const normPos = ((rawValue + 1) / 2) * 100;
    const peakLeft = `${currentPeakPos.toFixed(2)}%`;

    return `
      <div class="axis-entry">
        <div class="axis-row">
          <span>AXIS ${i}</span>
          <span>${rawValue.toFixed(4)}</span>
        </div>
        <div class="axis-track">
          <div class="axis-center"></div>
          <div class="axis-peak" style="left:${peakLeft}"></div>
          <div class="axis-dot" style="left:${normPos}%"></div>
        </div>
      </div>
    `;
  }

  function updateLoop() {
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

        axisHtml += generateAxisHtml(i, val, state.peakPos);
      });
      diagnosticsEl.classList.remove("empty");
      diagnosticsEl.innerHTML = axisHtml;

      let btnHtml = "";
      gp.buttons.forEach((btn, i) => {
        const fillHeight = (btn.value * 100).toFixed(0);
        const isPressed = btn.pressed;
        btnHtml += `
          <div class="button-cell">
            <div class="button-fill" style="height:${fillHeight}%"></div>
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

    requestAnimationFrame(updateLoop);
  }

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

  requestAnimationFrame(updateLoop);
}
