document.querySelectorAll(".toast-banner:not(.d-none)").forEach((el) => {
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .4s ease";
    setTimeout(() => el.remove(), 400);
  }, 4200);
});

function bindChoiceRow(selector) {
  document.querySelectorAll(selector).forEach((chip) => {
    const input = chip.querySelector("input");
    if (!input) return;
    const sync = () => {
      chip.parentElement.querySelectorAll(selector).forEach((item) => item.classList.remove("active"));
      if (input.checked) chip.classList.add("active");
    };
    input.addEventListener("change", sync);
    sync();
  });
}

bindChoiceRow(".sport-chip");
bindChoiceRow(".privacy-chip");

const timerDisplay = document.getElementById("live-timer");
const startBtn = document.getElementById("timer-start");
const stopBtn = document.getElementById("timer-stop");
const hoursInput = document.getElementById("timer-hours");
const minutesInput = document.getElementById("timer-minutes");
const secondsInput = document.getElementById("timer-seconds");
const startTimeInput = document.getElementById("timer-start-time");

if (timerDisplay && startBtn && stopBtn) {
  let elapsedMs = 0;
  let startedAt = null;
  let tick = null;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parts(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    return {
      hours: Math.floor(total / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    };
  }

  function render() {
    const running = startedAt ? Date.now() - startedAt : 0;
    const split = parts(elapsedMs + running);
    timerDisplay.textContent = `${pad(split.hours)}:${pad(split.minutes)}:${pad(split.seconds)}`;
    if (hoursInput) hoursInput.value = split.hours;
    if (minutesInput) minutesInput.value = split.minutes;
    if (secondsInput) secondsInput.value = split.seconds;
  }

  startBtn.addEventListener("click", () => {
    if (startedAt) return;
    if (!elapsedMs && startTimeInput) {
      const now = new Date();
      startTimeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    startedAt = Date.now();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    timerDisplay.classList.add("running");
    tick = setInterval(render, 250);
    render();
  });

  stopBtn.addEventListener("click", () => {
    if (!startedAt) return;
    elapsedMs += Date.now() - startedAt;
    startedAt = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    startBtn.textContent = "Resume";
    timerDisplay.classList.remove("running");
    clearInterval(tick);
    render();
  });

  document.getElementById("record-form")?.addEventListener("submit", render);
}

document.querySelectorAll("[data-moment-swap]").forEach((frame) => {
  frame.addEventListener("click", () => {
    const main = frame.querySelector(".moment-main");
    const inset = frame.querySelector(".moment-inset img");
    if (!main || !inset) return;
    const next = inset.getAttribute("src");
    inset.setAttribute("src", main.getAttribute("src"));
    main.setAttribute("src", next);
  });
});

function bindMomentPreview(inputId, imgId, pickSelector) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);
  const pick = document.querySelector(pickSelector);
  if (!input || !img || !pick) return;
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    const url = URL.createObjectURL(file);
    img.dataset.url = url;
    img.src = url;
    img.hidden = false;
    pick.classList.add("has-photo");
  });
}

bindMomentPreview("moment-photo", "moment-photo-preview", ".moment-pick-main");
bindMomentPreview("moment-selfie", "moment-selfie-preview", ".moment-pick-inset");

