(() => {
  "use strict";

  const data = window.DEMO_DATA;
  const app = document.getElementById("demo-app");
  const banner = document.getElementById("demo-preview-label");
  const announcement = document.getElementById("demo-announcement");
  if (!app || !data || !Array.isArray(data.packs) || !Array.isArray(data.flavors)
    || !Array.isArray(data.districts) || !data.packs.length || !data.districts.length) return;

  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const cents = amount => Math.round(Number(amount) * 100);
  const money = amount => (amount / 100).toFixed(2).replace(/\.?0+$/, "");
  const packBySlug = slug => data.packs.find(pack => pack.slug === slug);
  const flavorBySlug = slug => data.flavors.find(flavor => flavor.slug === slug);
  const imageURI = path => {
    const uri = data.images?.[path];
    return typeof uri === "string" && /^data:image\/(?:webp|png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : "";
  };
  const image = (path, alt, className, width, height) => {
    const uri = imageURI(path);
    return uri ? `<img src="${escape(uri)}" alt="${escape(alt)}" class="${escape(className)}" width="${width}" height="${height}">` : "";
  };
  const state = {
    locale: "es", view: "home", step: 1, packSlug: data.packs[0].slug,
    singleFlavor: "", quantities: {}, extra: false, error: "", finished: false,
    details: {
      customerName: "Demo", whatsapp: "999000111", email: "demo@example.invalid",
      deliveryAddress: "Demo", district: data.districts.some(district => district.name === "Miraflores") ? "Miraflores" : data.districts[0].name,
      addressReference: "", deliveryNotes: "", deliveryHandoff: "self",
    },
  };
  const staticCopy = {
    es: {
      label: "Demostración estática · Sin pedidos ni pagos · No introduzcas datos personales reales.",
      blocked: "Este enlace o formulario está deshabilitado en la demostración estática.",
      finished: "No se creó ningún pedido ni pago.",
      finish: amount => `Simular checkout de S/${amount} (sin pagar)`,
    },
    en: {
      label: "Static preview · No orders or payments · Do not enter real personal details.",
      blocked: "This link or form is disabled in the static preview.",
      finished: "No order or payment was created.",
      finish: amount => `Preview S/${amount} checkout (no payment)`,
    },
  };
  const copy = () => data.translations[state.locale];
  const reserve = () => copy().reserve;
  const currentPack = () => packBySlug(state.packSlug) || data.packs[0];
  const localizedPack = () => data.packCopy[state.locale][currentPack().slug];
  const flavorName = slug => data.flavorCopy[state.locale][slug] || flavorBySlug(slug)?.name || "";
  const currentOffer = () => data.extraOffers[currentPack().slug];
  const fee = () => cents(data.districts.find(district => district.name === state.details.district)?.fee ?? data.districts[0].fee);
  const subtotal = () => cents(currentPack().amount) + (state.extra ? cents(currentOffer().discountedAmount) : 0);
  const total = () => subtotal() + fee();
  const selectedItems = () => currentPack().packType === "single"
    ? (state.singleFlavor ? [{ flavorSlug: state.singleFlavor, quantity: currentPack().units }] : [])
    : Object.entries(state.quantities).filter(([, quantity]) => quantity > 0).map(([flavorSlug, quantity]) => ({ flavorSlug, quantity }));
  const flavorSummary = () => selectedItems().map(item => `${item.quantity * (state.extra ? 2 : 1)} × ${flavorName(item.flavorSlug)}`).join(", ");

  function announce(message) {
    if (announcement) announcement.textContent = message;
  }

  function focusElement(element, center = false) {
    if (!element) return;
    element.focus({ preventScroll: true });
    if (center) {
      window.scrollTo({ left: window.scrollX, top: window.scrollY, behavior: "instant" });
      element.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }

  function hydrateAndFence() {
    for (const element of app.querySelectorAll("img[data-asset]")) {
      const uri = imageURI(element.getAttribute("data-asset"));
      element.removeAttribute("srcset");
      element.setAttribute("loading", "eager");
      if (uri) element.setAttribute("src", uri);
      else element.removeAttribute("src");
    }
    for (const anchor of app.querySelectorAll("a")) {
      anchor.removeAttribute("target");
      anchor.removeAttribute("download");
      anchor.removeAttribute("ping");
      const scroll = anchor.getAttribute("data-demo-scroll");
      anchor.setAttribute("href", scroll && /^[A-Za-z][\w-]{0,80}$/.test(scroll) ? `#${scroll}` : "#");
    }
    for (const form of app.querySelectorAll("form")) {
      form.removeAttribute("action");
      for (const control of form.querySelectorAll("input,select,textarea,button")) control.disabled = true;
    }
  }

  function packCards() {
    const r = reserve();
    return `<div class="reserve-card-grid">${data.packs.map(pack => {
      const localized = data.packCopy[state.locale][pack.slug];
      return `<button id="demo-pack-${escape(pack.slug)}" class="reserve-pack-option ${pack.slug === state.packSlug ? "selected" : ""}" type="button" data-demo-pack="${escape(pack.slug)}" aria-pressed="${pack.slug === state.packSlug}">
        ${pack.mostWanted ? `<span class="reserve-value-badge">${escape(copy().conversion.bestValue)}</span>` : ""}
        <span>${pack.units} ${escape(r.bagels)}</span><strong>${escape(localized.name)}</strong><b>S/${money(cents(pack.amount))}</b>
        <small>${escape(localized.typeLabel)}</small><small class="reserve-unit-price">S/${(Number(pack.amount) / pack.units).toFixed(2)} ${escape(copy().packs.perBagel)}</small>
      </button>`;
    }).join("")}</div>`;
  }

  function flavorCards() {
    const r = reserve(), pack = currentPack();
    const quantity = selectedItems().reduce((sum, item) => sum + item.quantity, 0);
    return `<div class="reserve-card"><div class="reserve-step-title"><h2 id="demo-step-title" tabindex="-1">${escape(r.chooseFlavors)}</h2>
      <span>${pack.packType === "mixed" ? `${quantity} / ${pack.units} ${escape(r.selected)}` : state.singleFlavor ? `${pack.units} × ${escape(flavorName(state.singleFlavor))}` : escape(r.chooseOneFlavor)}</span></div>
      <div class="flavor-select-grid">${data.flavors.map(flavor => {
        const name = flavorName(flavor.slug), selected = state.singleFlavor === flavor.slug;
        const path = data.flavorImages?.[flavor.slug] || ({
          "everything-bagel": "/images/bagel-everything.webp", "rainbow-custom-colors": "/images/bagel-rainbow.webp",
        })[flavor.slug] || `/images/bagel-${flavor.slug}.webp`;
        return `<article class="flavor-select-card ${selected ? "selected" : ""}">${image(path, name, "flavor-select-photo", 256, 256)}<h3>${escape(name)}</h3>
          ${pack.packType === "mixed" ? `<div class="quantity-control">
            <button id="demo-remove-${escape(flavor.slug)}" type="button" data-demo-quantity="remove" data-demo-flavor="${escape(flavor.slug)}" aria-label="${escape(`${r.remove} ${name}`)}">−</button>
            <strong>${state.quantities[flavor.slug] || 0}</strong>
            <button id="demo-add-${escape(flavor.slug)}" type="button" data-demo-quantity="add" data-demo-flavor="${escape(flavor.slug)}" aria-label="${escape(`${r.add} ${name}`)}">+</button>
          </div>` : `<button id="demo-flavor-${escape(flavor.slug)}" class="select-flavor-button" type="button" data-demo-flavor="${escape(flavor.slug)}" aria-label="${escape(`${r.select} ${name}`)}" aria-pressed="${selected}">${escape(r.select)}</button>`}
        </article>`;
      }).join("")}</div></div>`;
  }

  function deliveryFields() {
    const r = reserve();
    const field = (key, label, type = "text", required = false) => `<label>${escape(label)}<input id="demo-${({ customerName: "customer-name", deliveryAddress: "address" })[key] || key}" data-demo-field="${key}" type="${type}" maxlength="200" value="${escape(state.details[key])}" ${required ? "required" : ""} aria-invalid="${Boolean(state.error && required && !state.details[key])}" ${state.error && required && !state.details[key] ? 'aria-describedby="demo-error"' : ""}></label>`;
    return `<div class="reserve-card form-card"><h2 id="demo-step-title" tabindex="-1">${escape(r.deliveryDetails)}</h2><div class="form-grid">
      ${field("customerName", r.fields.fullName, "text", true)}${field("whatsapp", r.fields.whatsapp, "text", true)}${field("email", r.fields.email, "email", true)}
      <label>${escape(r.fields.district)}<select id="demo-district">${data.districts.map(district => `<option value="${escape(district.name)}" ${district.name === state.details.district ? "selected" : ""}>${escape(district.name === "Other" ? r.otherDistrict : district.name)}</option>`).join("")}</select></label>
      ${field("deliveryAddress", r.fields.deliveryAddress, "text", true)}
      <div class="handoff-box wide" role="group" aria-label="${escape(r.deliveryHandoff.label)}"><span>${escape(r.deliveryHandoff.label)}</span><div class="handoff-options">
        ${[["self", r.deliveryHandoff.receive], ["porteria", r.deliveryHandoff.porter]].map(([value, label]) => `<button id="demo-handoff-${value}" class="handoff-option ${state.details.deliveryHandoff === value ? "active" : ""}" type="button" data-demo-handoff="${value}" aria-pressed="${state.details.deliveryHandoff === value}"><strong>${escape(label)}</strong></button>`).join("")}
      </div>${field("addressReference", r.fields.addressReference)}
      <label class="wide">${escape(r.fields.deliveryNotes)}<textarea id="demo-notes" data-demo-field="deliveryNotes" rows="3" maxlength="500">${escape(state.details.deliveryNotes)}</textarea></label>
    </div></div>`;
  }

  function extraOffer() {
    const r = reserve(), offer = currentOffer(), pack = localizedPack();
    return `<aside class="checkout-upsell ${state.extra ? "is-added" : ""}" aria-label="${escape(pack.name)}">
      <div class="checkout-upsell-heading"><span>${escape(copy().conversion.upsell.kicker)}</span><strong>${escape(pack.name)}</strong></div>
      <div class="checkout-upsell-content"><span class="checkout-upsell-icon" aria-hidden="true">+</span><div><h3>${escape(`${r.add} ${pack.name}`)}</h3><div class="checkout-upsell-price"><del>S/${money(cents(offer.originalAmount))}</del><strong>S/${money(cents(offer.discountedAmount))}</strong></div></div></div>
      <div class="checkout-upsell-action"><button id="demo-extra" class="${state.extra ? "checkout-upsell-remove" : ""}" type="button" data-demo-extra aria-pressed="${state.extra}">${escape(`${state.extra ? r.remove : r.add} ${pack.name}`)}</button></div>
    </aside>`;
  }

  function reviewCard() {
    const r = reserve(), labels = r.reviewLabels;
    const row = (label, value, wide = false) => `<div${wide ? ' class="wide"' : ""}><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
    return `<div class="checkout-final-stage"><div class="reserve-card review-card checkout-review-card">
      <h2 id="demo-step-title" tabindex="-1">${escape(r.reviewTitle)}</h2><div class="review-grid">
        ${row(labels.pack, `${state.extra ? 2 : 1} × ${localizedPack().name}`)}${row(labels.packSubtotal, `S/${money(subtotal())}`)}
        ${row(labels.deliveryFee, `S/${money(fee())}`)}${row(labels.totalAmount, `S/${money(total())}`)}
        ${row(labels.customer, state.details.customerName)}${row(labels.whatsapp, state.details.whatsapp)}${row(labels.email, state.details.email)}
        ${row(labels.deliveryHandoff, state.details.deliveryHandoff === "porteria" ? r.deliveryHandoff.porter : r.deliveryHandoff.receive)}
        ${row(labels.address, `${state.details.deliveryAddress}, ${state.details.district === "Other" ? r.otherDistrict : state.details.district}`, true)}${row(labels.flavors, flavorSummary(), true)}
      </div>${extraOffer()}
      <div class="checkout-review-banner" role="note">${escape(staticCopy[state.locale].label)}</div>
      <button id="demo-finish" class="pill-button pink culqi-preview-pay" type="button">${escape(staticCopy[state.locale].finish(money(total())))}</button>
      ${state.finished ? `<p id="demo-final-notice" class="checkout-review-banner" role="status" tabindex="-1">${escape(staticCopy[state.locale].finished)}</p>` : ""}
    </div></div>`;
  }

  function summary() {
    const r = reserve(), labels = r.reviewLabels, pack = currentPack(), localized = localizedPack();
    return `<aside class="checkout-order-summary" aria-label="${escape(r.reviewTitle)}"><div class="checkout-summary-heading"><div><span>${escape(r.reviewTitle)}</span><h2>${state.extra ? "2 × " : ""}${escape(localized.name)}</h2></div><button type="button" data-demo-step="1">${escape(r.steps[0])}</button></div>
      <div class="checkout-summary-product"><div class="checkout-summary-image">${image(`/images/pack-${pack.slug}.webp`, localized.trayLabel, "", 960, 540)}</div>
        <div><strong id="demo-bagels">${pack.units * (state.extra ? 2 : 1)} ${escape(r.bagels)}</strong><span>${escape(localized.typeLabel)}</span><small>S/${(Number(pack.amount) / pack.units).toFixed(2)} ${escape(copy().packs.perBagel)}</small></div></div>
      <div class="checkout-summary-totals"><div><span>${escape(labels.packSubtotal)}</span><strong id="demo-subtotal">S/${money(subtotal())}</strong></div>
        <div><span>${escape(labels.deliveryFee)}</span><strong id="demo-fee">S/${money(fee())}</strong></div>
        <div class="checkout-summary-total"><span>${escape(labels.totalAmount)}</span><strong id="demo-total">S/${money(total())}</strong></div></div>
      ${flavorSummary() ? `<p id="demo-flavor-summary">${escape(flavorSummary())}</p>` : ""}
      <p class="checkout-review-banner">${escape(staticCopy[state.locale].finished)}</p>
    </aside>`;
  }

  function checkoutMarkup() {
    const r = reserve();
    const step = state.step === 1 ? packCards() : state.step === 2 ? flavorCards() : state.step === 3 ? deliveryFields() : reviewCard();
    return `${data.views[state.locale].header}<main class="checkout-page"><section class="reserve-shell checkout-flow-shell" data-demo-view="checkout" data-demo-current-step="${state.step}" data-demo-selected-pack="${escape(state.packSlug)}">
      <div class="reserve-herolet"><div><p class="kicker">${escape(r.heroKicker)}</p><h1>${escape(r.heroTitle)}</h1></div></div>
      <div class="checkout-review-banner" role="note">${escape(staticCopy[state.locale].label)}</div>
      <div class="reserve-progress">${r.steps.map((label, index) => `<button type="button" data-demo-step="${index + 1}" class="${state.step === index + 1 ? "active" : ""}" ${state.step === index + 1 ? 'aria-current="step"' : ""} ${index + 1 > state.step ? "disabled" : ""}>${index + 1}. ${escape(label)}</button>`).join("")}</div>
      <div class="checkout-workspace"><div class="checkout-stage">${state.error ? `<div id="demo-error" class="reserve-alert" role="alert" tabindex="-1">${escape(state.error)}</div>` : ""}${step}
        <div class="reserve-nav"><button id="demo-back" class="pill-button outline" type="button" ${state.step === 1 ? "disabled" : ""}>${escape(r.back)}</button>${state.step < 4 ? `<button id="demo-next" class="pill-button pink" type="button">${escape(r.continue)}</button>` : ""}</div>
      </div>${summary()}</div></section></main>${data.views[state.locale].footer}`;
  }

  function render({ focusId, focusStep = false } = {}) {
    document.documentElement.lang = state.locale;
    if (banner) banner.textContent = staticCopy[state.locale].label;
    app.innerHTML = state.view === "home" ? data.views[state.locale].home : checkoutMarkup();
    app.setAttribute("data-demo-view", state.view);
    hydrateAndFence();
    if (state.error) focusElement(document.getElementById("demo-error"), true);
    else if (focusId) focusElement(document.getElementById(focusId));
    else if (focusStep && state.view === "checkout") focusElement(document.getElementById(state.step === 1 ? `demo-pack-${state.packSlug}` : "demo-step-title"), true);
  }

  function openCheckout(slug, flavor) {
    const pack = packBySlug(slug) || data.packs[0];
    state.view = "checkout"; state.step = 1; state.packSlug = pack.slug;
    state.singleFlavor = pack.packType === "single" && flavorBySlug(flavor) ? flavor : "";
    state.quantities = {}; state.extra = false; state.error = ""; state.finished = false;
    announce(""); render({ focusStep: true });
  }

  function followAnchor(anchor) {
    const action = anchor.getAttribute("data-demo-action");
    const original = anchor.getAttribute("data-original") || anchor.getAttribute("data-original-href") || "";
    const path = original.split("?")[0];
    if (action === "checkout" || path === "/checkout" || path === "/reserve") {
      const params = new URLSearchParams(original.includes("?") ? original.slice(original.indexOf("?") + 1) : "");
      const slugs = params.getAll("pack"), flavors = params.getAll("flavor");
      const pack = anchor.getAttribute("data-pack") || (slugs.length === 1 ? slugs[0] : "");
      const flavor = anchor.getAttribute("data-flavor") || (flavors.length === 1 ? flavors[0] : "");
      openCheckout(pack, flavor); return;
    }
    if (action === "home" || original === "/") {
      state.view = "home"; state.error = ""; announce(""); render(); window.scrollTo({ top: 0, behavior: "instant" }); return;
    }
    const scroll = anchor.getAttribute("data-demo-scroll");
    if (scroll && /^[A-Za-z][\w-]{0,80}$/.test(scroll)) {
      if (state.view !== "home") { state.view = "home"; state.error = ""; render(); }
      document.getElementById(scroll)?.scrollIntoView({ block: "start", behavior: "instant" }); return;
    }
    announce(staticCopy[state.locale].blocked);
  }

  function goNext() {
    const r = reserve(), pack = currentPack();
    state.error = "";
    if (state.step === 2 && (pack.packType === "mixed"
      ? selectedItems().reduce((sum, item) => sum + item.quantity, 0) !== pack.units : !state.singleFlavor)) {
      state.error = pack.packType === "mixed" ? r.errors.exactBagels.replace("{units}", String(pack.units)) : r.errors.chooseFlavor;
    } else if (state.step === 3 && !["customerName", "whatsapp", "email", "deliveryAddress"].every(key => state.details[key].trim())) {
      state.error = r.errors.deliveryRequired;
    } else state.step = Math.min(4, state.step + 1);
    render({ focusStep: true });
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (anchor) { event.preventDefault(); event.stopPropagation(); followAnchor(anchor); return; }
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.classList.contains("faq-question")) {
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId && /^faq-panel-\d+$/.test(panelId) ? document.getElementById(panelId) : null;
      if (!panel) return;
      const expand = button.getAttribute("aria-expanded") !== "true";
      for (const other of app.querySelectorAll(".faq-question[aria-controls]")) {
        const otherPanel = document.getElementById(other.getAttribute("aria-controls"));
        other.setAttribute("aria-expanded", String(other === button && expand));
        other.closest(".faq-card")?.classList.toggle("is-open", other === button && expand);
        if (otherPanel) otherPanel.hidden = !(other === button && expand);
      }
      return;
    }
    const locale = button.getAttribute("data-demo-locale");
    if (locale === "es" || locale === "en") {
      state.locale = locale; state.error = ""; announce(state.finished ? staticCopy[locale].finished : ""); render();
      focusElement(app.querySelector(`[data-demo-locale="${locale}"]`)); return;
    }
    if (button.hasAttribute("data-demo-pack")) {
      const pack = packBySlug(button.getAttribute("data-demo-pack"));
      if (!pack || pack.slug === state.packSlug) return;
      state.packSlug = pack.slug; state.singleFlavor = ""; state.quantities = {}; state.extra = false; state.finished = false; state.error = "";
      render({ focusId: button.id }); return;
    }
    if (button.hasAttribute("data-demo-flavor")) {
      const slug = button.getAttribute("data-demo-flavor");
      if (!flavorBySlug(slug)) return;
      const pack = currentPack();
      if (pack.packType === "single") state.singleFlavor = slug;
      else {
        const delta = button.getAttribute("data-demo-quantity") === "add" ? 1 : -1;
        const other = Object.entries(state.quantities).reduce((sum, [flavor, quantity]) => sum + (flavor === slug ? 0 : quantity), 0);
        state.quantities[slug] = Math.max(0, Math.min(pack.units - other, (state.quantities[slug] || 0) + delta));
      }
      state.error = ""; state.finished = false; render({ focusId: button.id }); return;
    }
    if (button.hasAttribute("data-demo-handoff")) {
      const value = button.getAttribute("data-demo-handoff");
      if (value === "self" || value === "porteria") state.details.deliveryHandoff = value;
      render({ focusId: button.id }); return;
    }
    if (button.hasAttribute("data-demo-extra")) { state.extra = !state.extra; state.finished = false; render({ focusId: "demo-extra" }); return; }
    if (button.hasAttribute("data-demo-step")) {
      const step = Number(button.getAttribute("data-demo-step"));
      if (Number.isInteger(step) && step >= 1 && step <= state.step) { state.step = step; state.error = ""; render({ focusStep: true }); }
      return;
    }
    if (button.id === "demo-next") { goNext(); return; }
    if (button.id === "demo-back") { state.step = Math.max(1, state.step - 1); state.error = ""; render({ focusStep: true }); return; }
    if (button.id === "demo-finish") {
      state.finished = true; render({ focusId: "demo-final-notice" }); announce(staticCopy[state.locale].finished);
    }
  }, true);

  document.addEventListener("auxclick", event => {
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
  }, true);
  document.addEventListener("submit", event => { event.preventDefault(); event.stopPropagation(); announce(staticCopy[state.locale].blocked); }, true);
  document.addEventListener("input", event => {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const field = element.getAttribute("data-demo-field");
    if (["customerName", "whatsapp", "email", "deliveryAddress", "addressReference", "deliveryNotes"].includes(field)) {
      state.details[field] = element.value.slice(0, field === "deliveryNotes" ? 500 : 200);
      state.finished = false;
    }
  });
  document.addEventListener("change", event => {
    const element = event.target;
    if (element instanceof HTMLSelectElement && element.id === "demo-district"
      && data.districts.some(district => district.name === element.value)) {
      state.details.district = element.value; state.finished = false; render({ focusId: "demo-district" });
    }
  });

  render();
})();
