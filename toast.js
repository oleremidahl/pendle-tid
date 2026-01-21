(function () {
  window.showTransitToast = function ({ header, subheader, lines }) {
    const existing = document.getElementById("finn-transit-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "finn-transit-toast";

    const body = [
      `<div style="font-size:16px; font-weight:800">${header}</div>`,
      subheader ? `<div style="font-size:13px; opacity:0.9">${subheader}</div>` : "",
      `<div style="height:10px"></div>`,
      ...(lines || []).map(l => {
        const opacity = l.tone === "muted" ? "0.75" : "0.92";
        return `<div style="font-size:13px; height:18px; opacity:${opacity}">${l.text}</div>`;
      })
    ].join("");

    toast.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column">
        ${body}
      </div>
      <button id="finn-toast-close">✕</button>
    `;

    toast.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      background: #0b1020;
      color: white;
      padding: 14px 14px;
      border-radius: 16px;
      box-shadow: 0 12px 35px rgba(0,0,0,0.3);
      font-weight: 700;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      width: 360px;
      max-height: 70vh;
      overflow: auto;
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
      padding: 2px 6px;
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
  };
})();
