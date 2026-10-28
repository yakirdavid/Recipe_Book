(() => {
  "use strict";

  const recipes = Array.isArray(window.RECIPES) ? window.RECIPES : [];
  const app = document.getElementById("app");

  // ---------- storage (best-effort) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  let favorites = new Set(store.get("favorites", []));
  const state = { query: "", category: "הכל", sub: "הכל" };
  let wakeLock = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  const icons = {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>'
  };

  function formatTime(min) {
    if (!min) return "";
    if (min < 60) return `${min} דק׳`;
    const h = Math.floor(min / 60), m = min % 60;
    const hours = h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
    return m ? `${hours} ו־${m} דק׳` : hours;
  }

  const FRACTIONS = [[0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [1, ""]];
  function formatAmount(n) {
    if (n == null || n === "") return "";
    if (typeof n !== "number") return String(n);
    if (n >= 20) return String(Math.round(n));
    const whole = Math.floor(n);
    const frac = n - whole;
    let best = FRACTIONS[0], diff = Infinity;
    for (const f of FRACTIONS) {
      const d = Math.abs(frac - f[0]);
      if (d < diff) { diff = d; best = f; }
    }
    if (diff > 0.06) return String(Math.round(n * 10) / 10);
    const w = best[0] === 1 ? whole + 1 : whole;
    if (!best[1]) return String(w);
    return w ? `${w}${best[1]}` : best[1];
  }

  // Normalise "list or list of groups" into [{group, items}]
  function groups(list) {
    if (!Array.isArray(list) || !list.length) return [];
    if (list[0] && typeof list[0] === "object" && Array.isArray(list[0].items)) return list;
    return [{ group: "", items: list }];
  }

  function ingredientText(item) {
    return typeof item === "string" ? item : [item.name, item.note].filter(Boolean).join(" ");
  }

  function searchText(r) {
    const ings = groups(r.ingredients).flatMap((g) => g.items.map(ingredientText));
    return [r.title, r.description, r.category, r.subcategory, ...(r.tags || []), ...ings].join(" ").toLowerCase();
  }

  function toggleFavorite(id) {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    store.set("favorites", [...favorites]);
    return favorites.has(id);
  }

  function media(r, cls = "") {
    return r.image
      ? `<img src="${esc(r.image)}" alt="${esc(r.title)}" loading="lazy" class="${cls}">`
      : `<span class="emoji" aria-hidden="true">${esc(r.emoji || "🍽️")}</span>`;
  }

  // ---------- list view ----------
  function renderList(onlyFavorites) {
    const categories = ["הכל", ...new Set(recipes.map((r) => r.category).filter(Boolean))];
    if (!categories.includes(state.category)) state.category = "הכל";

    app.innerHTML = `
      <div class="container">
        <section class="hero">
          <h1>${onlyFavorites ? "המועדפים שלי" : "מה מבשלים היום?"}</h1>
          <p>${onlyFavorites ? "המתכונים שסימנת בלב" : `${recipes.length} מתכונים בספר`}</p>
        </section>
        <div class="search">
          ${icons.search}
          <input type="search" id="q" placeholder="חיפוש לפי שם, מצרך או תגית…" value="${esc(state.query)}" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="chips" role="tablist">
          ${categories.map((c) => `<button type="button" class="chip${c === state.category ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
        <div class="chips subchips" id="subchips" role="tablist" hidden></div>
        <div class="grid" id="grid"></div>
      </div>`;

    const grid = app.querySelector("#grid");
    const subBar = app.querySelector("#subchips");

    // Second row of chips for categories whose recipes have a subcategory
    const drawSubs = () => {
      const subs = state.category === "הכל" ? [] : [...new Set(recipes
        .filter((r) => r.category === state.category).map((r) => r.subcategory).filter(Boolean))];
      // Biggest groups first
      const count = (sub) => recipes.filter((r) => r.category === state.category && r.subcategory === sub).length;
      subs.sort((a, b) => count(b) - count(a));
      if (!subs.includes(state.sub)) state.sub = "הכל";
      subBar.hidden = subs.length < 2;
      subBar.innerHTML = subBar.hidden ? "" : ["הכל", ...subs].map((c) =>
        `<button type="button" class="chip${c === state.sub ? " active" : ""}" data-sub="${esc(c)}">${esc(c)}</button>`).join("");
    };

    const draw = () => {
      const q = state.query.trim().toLowerCase();
      const list = recipes.filter((r) =>
        (!onlyFavorites || favorites.has(r.id)) &&
        (state.category === "הכל" || r.category === state.category) &&
        (state.sub === "הכל" || r.subcategory === state.sub) &&
        (!q || searchText(r).includes(q))
      );

      if (!list.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
          <div class="big">${onlyFavorites && !q ? "🤍" : "🔍"}</div>
          ${onlyFavorites && !q ? "עוד לא סימנת מתכונים מועדפים.<br>לוחצים על הלב בכרטיס המתכון." : "לא נמצאו מתכונים מתאימים."}
        </div>`;
        return;
      }

      grid.innerHTML = list.map((r, i) => {
        const total = (r.prepTime || 0) + (r.cookTime || 0);
        return `
        <a class="card" href="#/recipe/${encodeURIComponent(r.id)}" style="animation-delay:${Math.min(i, 12) * 30}ms">
          <div class="thumb">${media(r)}</div>
          <button type="button" class="fav-btn${favorites.has(r.id) ? " on" : ""}" data-fav="${esc(r.id)}" aria-label="מועדף">${icons.heart}</button>
          <div class="card-body">
            ${r.category ? `<span class="card-cat">${esc(r.subcategory || r.category)}</span>` : ""}
            <h2 class="card-title">${esc(r.title)}</h2>
            <div class="card-meta">
              ${total ? `<span>⏱ ${formatTime(total)}</span>` : ""}
              ${r.servings ? `<span>🍽 ${r.servings} מנות</span>` : ""}
            </div>
          </div>
        </a>`;
      }).join("");
    };

    drawSubs();
    draw();

    app.querySelector("#q").addEventListener("input", (e) => { state.query = e.target.value; draw(); });
    app.querySelector(".chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.category = chip.dataset.cat;
      state.sub = "הכל";
      app.querySelectorAll(".chips:not(.subchips) .chip").forEach((c) => c.classList.toggle("active", c === chip));
      drawSubs();
      draw();
    });
    subBar.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.sub = chip.dataset.sub;
      subBar.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      draw();
    });
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".fav-btn");
      if (!btn) return;
      e.preventDefault();
      const on = toggleFavorite(btn.dataset.fav);
      btn.classList.toggle("on", on);
      if (onlyFavorites && !on) draw();
    });
  }

  // ---------- recipe view ----------
  function renderRecipe(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) {
      app.innerHTML = `<div class="container"><div class="empty"><div class="big">🤷</div>המתכון לא נמצא.<br><br><a class="btn" href="#/">חזרה לכל המתכונים</a></div></div>`;
      return;
    }
    document.title = `${r.title} · ספר המתכונים`;

    const baseServings = r.servings || 0;
    let servings = baseServings;
    let multiplier = 1; // used when the recipe has no servings count
    const variants = Array.isArray(r.variants) ? r.variants : [];
    let variant = variants[0];
    const ingGroups = groups(r.ingredients);
    const stepGroups = groups(r.steps);
    const inVariant = (g) => !g.variant || g.variant === variant;
    const scaleLabel = () => baseServings ? `${servings} מנות` : `כמות ×${formatAmount(multiplier)}`;
    const total = (r.prepTime || 0) + (r.cookTime || 0);

    const stats = [
      r.prepTime ? ["הכנה", formatTime(r.prepTime)] : null,
      r.cookTime ? ["בישול", formatTime(r.cookTime)] : null,
      total && r.prepTime && r.cookTime ? ["סה״כ", formatTime(total)] : null,
      r.yield ? ["כמות", r.yield] : null,
      r.difficulty ? ["רמת קושי", r.difficulty] : null
    ].filter(Boolean);

    const ingredientsHtml = () => ingGroups.filter(inVariant).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="ing-list">
        ${g.items.map((it) => {
          let text;
          if (typeof it === "string") {
            text = esc(it);
          } else {
            const factor = baseServings ? servings / baseServings : multiplier;
            const qtyOf = (amt, unit) => [
              typeof amt === "number" ? `<span class="num">${formatAmount(amt * factor)}</span>`
                : Array.isArray(amt) ? `<span class="num">${amt.map((a) => formatAmount(a * factor)).join("–")}</span>`
                : esc(amt || ""),
              esc(unit || "")
            ].filter(Boolean).join(" ");
            const qty = qtyOf(it.amount, it.unit);
            const alt = it.alt ? ` <span class="ing-note">(${qtyOf(it.alt.amount, it.alt.unit)})</span>` : "";
            text = `${qty ? `<span class="ing-amount">${qty}</span>${alt} ` : ""}${esc(it.name)}${it.note ? ` <span class="ing-note">(${esc(it.note)})</span>` : ""}`;
          }
          return `<li><span class="check">${icons.check}</span><span class="ing-text">${text}</span></li>`;
        }).join("")}
      </ul>`).join("");

    const stepsHtml = () => stepGroups.filter(inVariant).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ol class="step-list">${g.items.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`).join("");

    app.innerHTML = `
      <article class="recipe">
        <div class="recipe-hero${r.image ? " has-image" : ""}"><div class="media">${media(r)}</div></div>
        <div class="container">
          <header class="recipe-head">
            <a href="#/" class="back-link">→ כל המתכונים</a>
            ${r.category ? `<div class="card-cat">${esc([r.category, r.subcategory].filter(Boolean).join(" · "))}</div>` : ""}
            <h1>${esc(r.title)}</h1>
            <p class="print-only print-meta" id="print-meta"></p>
            ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ""}
            ${r.tags && r.tags.length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
            ${stats.length ? `<div class="stats">${stats.map(([l, v]) => `<div class="stat"><div class="label">${l}</div><div class="value">${esc(v)}</div></div>`).join("")}</div>` : ""}
            <div class="actions">
              <button type="button" class="btn${favorites.has(r.id) ? " on" : ""}" id="fav">${icons.heart}<span>מועדף</span></button>
              ${"wakeLock" in navigator ? `<button type="button" class="btn" id="wake">${icons.sun}<span>מסך דולק</span></button>` : ""}
              ${navigator.share ? `<button type="button" class="btn" id="share">${icons.share}<span>שיתוף</span></button>` : ""}
              <button type="button" class="btn" id="print">${icons.print}<span>הדפסה / PDF</span></button>
            </div>
          </header>

          <div class="recipe-body">
            <section class="panel ingredients-panel">
              <h2>מצרכים
                <span class="scaler">
                  <button type="button" data-step="1" aria-label="הגדלת כמות">+</button>
                  <span id="serv">${scaleLabel()}</span>
                  <button type="button" data-step="-1" aria-label="הקטנת כמות">−</button>
                </span>
              </h2>
              ${variants.length > 1 ? `<div class="variants" role="tablist" aria-label="גרסה">
                ${variants.map((v) => `<button type="button" class="chip${v === variant ? " active" : ""}" data-variant="${esc(v)}">${esc(v)}</button>`).join("")}
              </div>` : ""}
              <p class="hint">לחיצה על מצרך מסמנת אותו</p>
              <div id="ings">${ingredientsHtml()}</div>
            </section>

            <section class="panel">
              <h2>אופן ההכנה</h2>
              ${r.video ? videoHtml(r.video) : ""}
              <p class="hint">לחיצה על שלב מסמנת שסיימת אותו</p>
              <div id="steps">${stepsHtml()}</div>
              ${r.notes ? `<div class="notes"><strong>💡 טיפים והערות</strong><p>${esc(r.notes)}</p></div>` : ""}
              ${relatedHtml(r)}
              ${r.source && (r.source.url || r.source.name) ? `<div class="source">מקור: ${r.source.url
                ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.name || r.source.url)}</a>`
                : esc(r.source.name)}</div>` : ""}
            </section>
          </div>
        </div>
      </article>`;

    const ings = app.querySelector("#ings");
    ings.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li) li.classList.toggle("done");
    });
    const steps = app.querySelector("#steps");

    // Shown only on paper: which version and quantity was printed
    const updatePrintMeta = () => {
      const parts = [];
      if (variants.length > 1) parts.push(`גרסת ${variant}`);
      if (baseServings) parts.push(`${servings} מנות`);
      else if (multiplier !== 1) parts.push(`כמות ×${formatAmount(multiplier)}`);
      else if (r.yield) parts.push(r.yield);
      app.querySelector("#print-meta").textContent = parts.join(" · ");
    };
    updatePrintMeta();
    steps.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li) li.classList.toggle("done");
    });

    const variantBar = app.querySelector(".variants");
    if (variantBar) variantBar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-variant]");
      if (!b) return;
      variant = b.dataset.variant;
      variantBar.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      ings.innerHTML = ingredientsHtml();
      steps.innerHTML = stepsHtml();
      updatePrintMeta();
    });

    const scaler = app.querySelector(".scaler");
    if (scaler) scaler.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const dir = Number(b.dataset.step);
      if (baseServings) servings = Math.max(1, servings + dir);
      else multiplier = Math.min(10, Math.max(0.5, multiplier + dir * 0.5));
      app.querySelector("#serv").textContent = scaleLabel();
      ings.innerHTML = ingredientsHtml();
      updatePrintMeta();
    });

    app.querySelector("#fav").addEventListener("click", (e) => {
      e.currentTarget.classList.toggle("on", toggleFavorite(r.id));
    });

    const wakeBtn = app.querySelector("#wake");
    if (wakeBtn) wakeBtn.addEventListener("click", async () => {
      if (wakeLock) { await releaseWakeLock(); wakeBtn.classList.remove("on"); return; }
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeBtn.classList.add("on");
        wakeLock.addEventListener("release", () => { wakeLock = null; wakeBtn.classList.remove("on"); });
      } catch { /* not allowed */ }
    });

    const shareBtn = app.querySelector("#share");
    if (shareBtn) shareBtn.addEventListener("click", () => {
      navigator.share({ title: r.title, text: r.description || r.title, url: location.href }).catch(() => {});
    });

    app.querySelector("#print").addEventListener("click", () => window.print());
  }

  function relatedHtml(r) {
    const list = (r.related || []).map((id) => recipes.find((x) => x.id === id)).filter(Boolean);
    if (!list.length) return "";
    return `<div class="related"><h3>מתכונים קשורים</h3><div class="related-list">
      ${list.map((x) => `<a class="chip" href="#/recipe/${encodeURIComponent(x.id)}">${esc(x.emoji || "🍽️")} ${esc(x.title)}</a>`).join("")}
    </div></div>`;
  }

  // YouTube / video file / any other link
  function videoHtml(video) {
    const v = typeof video === "string" ? { url: video } : video;
    const title = esc(v.title || "סרטון הדגמה");
    const yt = String(v.url).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
    let body;
    if (yt) {
      body = `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="${title}" loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    } else if (/\.(mp4|webm|mov)(\?|$)/i.test(v.url)) {
      body = `<div class="video-frame"><video src="${esc(v.url)}" controls playsinline preload="metadata"></video></div>`;
    } else {
      body = `<a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">▶ צפייה בסרטון</a>`;
    }
    return `<div class="video"><h3>🎬 ${title}</h3>${body}</div>`;
  }

  async function releaseWakeLock() {
    if (wakeLock) { try { await wakeLock.release(); } catch { /* ignore */ } wakeLock = null; }
  }

  // ---------- router ----------
  function route() {
    releaseWakeLock();
    const hash = location.hash.replace(/^#\/?/, "");
    const [page, param] = hash.split("/");
    document.title = "ספר המתכונים";

    document.querySelectorAll(".tabs a").forEach((a) => {
      a.classList.toggle("active", (a.dataset.tab === "favorites") === (page === "favorites") && page !== "recipe");
    });

    if (page === "recipe" && param) renderRecipe(decodeURIComponent(param));
    else renderList(page === "favorites");

    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  route();

  // ---------- PWA: service worker + install hint ----------
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // Reload once when a new version takes over, so the update is visible immediately
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
        // Home-screen apps can stay open for days; check for updates when brought back
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          reg.update().catch(() => {});
          reloadIfRecipesChanged();
        });
      }).catch(() => {});
    });
  }

  // A home-screen app resumed from the background keeps the old page in memory.
  // When it comes back, compare the recipes on the server with the ones shown and
  // reload only if they differ, so ticked ingredients survive a quick app switch.
  const shownRecipes = JSON.stringify(recipes);
  async function reloadIfRecipesChanged() {
    if (!navigator.onLine) return;
    try {
      const res = await fetch("data/recipes.js", { cache: "reload" });
      if (!res.ok) return;
      const sandbox = {};
      new Function("window", await res.text())(sandbox);
      if (Array.isArray(sandbox.RECIPES) && JSON.stringify(sandbox.RECIPES) !== shownRecipes) location.reload();
    } catch { /* offline or bad response: keep what is shown */ }
  }

  const hint = document.getElementById("install-hint");
  const hintText = document.getElementById("install-text");
  const installBtn = document.getElementById("install-btn");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const dismissed = store.get("installDismissed", false);
  let deferredPrompt = null;

  document.getElementById("install-close").addEventListener("click", () => {
    hint.hidden = true;
    store.set("installDismissed", true);
  });

  if (!standalone && !dismissed) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      hintText.innerHTML = "להתקנה באייפון: לוחצים על <b>שיתוף</b> ואז <b>הוספה למסך הבית</b>";
      setTimeout(() => { hint.hidden = false; }, 1500);
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      hintText.textContent = "אפשר להתקין את ספר המתכונים כאפליקציה";
      installBtn.hidden = false;
      hint.hidden = false;
    });
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      hint.hidden = true;
    });
  }
})();
