// Fallback to full navigation on PJAX errors (e.g., 404 responses).
document.addEventListener("pjax:error", function (event) {
  var href = event && event.triggerElement && event.triggerElement.href;
  if (href) {
    window.location = href;
  }
});
