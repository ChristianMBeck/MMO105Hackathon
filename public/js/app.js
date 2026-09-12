document.querySelectorAll(".toast-banner").forEach((el) => {
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .4s ease";
    setTimeout(() => el.remove(), 400);
  }, 4200);
});
