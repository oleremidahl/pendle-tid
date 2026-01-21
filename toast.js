(function () {
  window.showTransitToast = function (minutes) {
  const existing = document.getElementById("finn-transit-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "finn-transit-toast";

  toast.innerHTML = `
    <span style="flex:1">🕒 ${minutes} min til jobb (Man. 08:00)</span>
    <button id="finn-toast-close">✕</button>
  `;

  toast.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 999999;
    background: #0b1020;
    color: white;
    padding: 12px 14px;
    border-radius: 16px;
    box-shadow: 0 12px 35px rgba(0,0,0,0.3);
    font-size: 14px;
    font-weight: 700;
    display: flex;
    gap: 10px;
    align-items: center;
    max-width: 340px;
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 200ms ease, transform 200ms ease;
  `;

  const closeBtn = toast.querySelector("#finn-toast-close");
  closeBtn.style.cssText = `
    background: transparent;
    border: none;
    color: #9aa3ff;
    font-size: 16px;
    cursor: pointer;
  `;

  closeBtn.onclick = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 200);
  };

  document.documentElement.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
}
})();
