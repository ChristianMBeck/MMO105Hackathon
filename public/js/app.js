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
