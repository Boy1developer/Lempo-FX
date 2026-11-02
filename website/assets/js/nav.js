/* Lempo Particle FX docs — nav + lightbox (no dependencies) */
(function () {
  "use strict";

  // Highlight the current page in the sidebar
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar a").forEach(function (a) {
    var href = (a.getAttribute("href") || "").split("#")[0];
    if (href === here) {
      a.classList.add("active");
      // keep it visible in a scrolled sidebar
      var group = a.closest(".nav-group");
      if (group) group.classList.toggle("open", true);
    }
  });

  // Mobile sidebar toggle
  var toggle = document.querySelector(".nav-toggle");
  var sidebar = document.getElementById("sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      sidebar.classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });
  }

  // Image lightbox (click a screenshot to zoom)
  var box = document.createElement("div");
  box.className = "lightbox";
  var boxImg = document.createElement("img");
  boxImg.alt = "screenshot";
  box.appendChild(boxImg);
  document.body.appendChild(box);

  document.querySelectorAll("figure img").forEach(function (img) {
    img.addEventListener("click", function () {
      boxImg.src = img.currentSrc || img.src;
      box.classList.add("open");
    });
  });
  box.addEventListener("click", function () {
    box.classList.remove("open");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") box.classList.remove("open");
  });
})();
