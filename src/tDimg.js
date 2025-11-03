var tdImg = document.querySelector(".td-img");
var originX = 50;
var originY = 50;

function updatePerspectiveOrigin() {
  tdImg.style.perspectiveOrigin = originX + "% " + originY + "%";
}

// perspective with mouse wheel on tdImg (min: 100px, max: 1000px)
var currentPerspective = (function () {
  var v =
    tdImg &&
    (tdImg.style.perspective || window.getComputedStyle(tdImg).perspective);
  if (!v || v === "none") return 900;
  var n = parseFloat(v);
  return isNaN(n) ? 900 : n;
})();

function perspectiveClamp(v) {
  if (v < 900) return 900;
  if (v > 1000) return 1000;
  return v;
}

function applyPerspective() {
  if (!tdImg) return;
  if (currentPerspective >= 1000) {
    tdImg.style.perspective = "none";
  } else {
    tdImg.style.perspective = currentPerspective + "px";
  }
}

applyPerspective();

// listen wheel only inside tdImg
if (tdImg) {
  tdImg.addEventListener(
    "wheel",
    function (e) {
      // wheel up (deltaY < 0): +, wheel down: -
      var step = 20;
      if (e.deltaY < 0) {
        currentPerspective = perspectiveClamp(currentPerspective + step);
      } else if (e.deltaY > 0) {
        currentPerspective = perspectiveClamp(currentPerspective - step);
      }
      applyPerspective();
      e.preventDefault();
    },
    { passive: false }
  );
}

var lastMouseX = null;
var lastMouseY = null;
var animationScale = 0.2; // px -> percent scaling
var inactivityTimer = null; // timer to reset perspectiveOrigin after inactivity
var transitionCleanupTimer = null; // timer to remove smooth transition after reset
var resetDurationMs = 300; // smooth reset duration

function animationClamp(v) {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}
// track mouse move on whole document
document.addEventListener("mousemove", function (e) {
  // cancel smooth transition while user is actively moving
  if (transitionCleanupTimer) {
    clearTimeout(transitionCleanupTimer);
    transitionCleanupTimer = null;
  }
  if (tdImg && tdImg.style.transition !== "none") {
    tdImg.style.transition = "none";
  }
  if (lastMouseX === null || lastMouseY === null) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    // start/reset inactivity timer on first movement
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function () {
      if (tdImg)
        tdImg.style.transition =
          "perspective-origin " + resetDurationMs + "ms ease";
      originX = 50;
      originY = 50;
      updatePerspectiveOrigin();
      // remove transition after animation completes
      transitionCleanupTimer = setTimeout(function () {
        if (tdImg) tdImg.style.transition = "none";
        transitionCleanupTimer = null;
      }, resetDurationMs);
    }, 3000);
    return;
  }
  var dx = e.clientX - lastMouseX; // right: +, left: -
  var dy = e.clientY - lastMouseY; // down: +, up: -
  originX = animationClamp(originX - dx * animationScale);
  originY = animationClamp(originY - dy * animationScale);
  updatePerspectiveOrigin();
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  // reset inactivity timer on every movement
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(function () {
    if (tdImg)
      tdImg.style.transition =
        "perspective-origin " + resetDurationMs + "ms ease";
    originX = 50;
    originY = 50;
    updatePerspectiveOrigin();
    // remove transition after animation completes
    transitionCleanupTimer = setTimeout(function () {
      if (tdImg) tdImg.style.transition = "none";
      transitionCleanupTimer = null;
    }, resetDurationMs);
  }, 3000);
});

// reset when mouse leaves the window
window.addEventListener("mouseout", function (e) {
  if (!e.relatedTarget && !e.toElement) {
    lastMouseX = null;
    lastMouseY = null;
  }
});
