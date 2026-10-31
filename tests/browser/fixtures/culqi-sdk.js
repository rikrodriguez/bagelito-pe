(() => {
  const state = window.__syntheticCulqi = { instances: [], opens: 0, closes: 0 };
  window.CulqiCheckout = class {
    constructor(publicKey, config) {
      if (publicKey !== "pk_test_synthetic") throw new Error("Only the synthetic public key is allowed");
      this.config = config;
      this.token = null;
      this.order = null;
      state.instances.push(this);
    }
    open() {
      state.opens++;
      const container = document.querySelector(this.config.options.container);
      if (!container) throw new Error("Synthetic checkout container is missing");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "synthetic-culqi-pay";
      button.textContent = "Synthetic Yape token";
      button.addEventListener("click", () => {
        this.token = { id: "ype_test_browser_synthetic" };
        this.culqi?.();
      });
      container.replaceChildren(button);
      this.button = button;
    }
    close() {
      state.closes++;
      if (this.button) this.button.disabled = true;
    }
  };
})();
