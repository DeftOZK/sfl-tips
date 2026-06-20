(() => {
  const groups = window.NFT_ASSET_GROUPS || { nfts: [], wearables: [], blacksmith: [], shrines: [] };
  const labels = {
    nfts: "NFTs",
    wearables: "Wearables",
    blacksmith: "Blacksmith",
    shrines: "Shrines"
  };
  let activeTab = "nfts";

  const grid = document.getElementById("assetGrid");
  const search = document.getElementById("assetSearch");
  const clear = document.getElementById("clearAssets");
  const emptyState = document.getElementById("assetEmptyState");
  const tabs = [...document.querySelectorAll(".asset-tab")];
  const counters = {
    total: document.getElementById("assetTotalSelected"),
    nfts: document.getElementById("assetCountNfts"),
    wearables: document.getElementById("assetCountWearables"),
    blacksmith: document.getElementById("assetCountBlacksmith"),
    shrines: document.getElementById("assetCountShrines")
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function assetPayload(item) {
    return {
      id: item.id,
      name: item.name,
      group: item.group,
      section: item.section,
      effect_text: item.effect_text,
      effect_values: item.effect_values || [],
      image: item.image,
      sflHubId: item.sflHubId || item.sfl_hub_id || item.idName || item.id_name || "",
      idName: item.idName || item.id_name || item.sflHubId || item.sfl_hub_id || "",
      source_sheet: item.source_sheet,
      source_cell: item.source_cell
    };
  }

  function selectedIds(group) {
    return window.SFLBuildState ? window.SFLBuildState.getAssetIds(group) : new Set();
  }

  function updateCounters() {
    const counts = Object.fromEntries(Object.keys(labels).map((group) => [group, selectedIds(group).size]));
    counters.nfts.textContent = counts.nfts;
    counters.wearables.textContent = counts.wearables;
    counters.blacksmith.textContent = counts.blacksmith;
    counters.shrines.textContent = counts.shrines;
    counters.total.textContent = Object.values(counts).reduce((sum, value) => sum + value, 0);
  }

  function matches(item, term) {
    if (!term) return true;
    return [item.name, item.effect_text, item.section, item.source_sheet]
      .join(" ")
      .toLowerCase()
      .includes(term);
  }

  function renderTabs() {
    tabs.forEach((tab) => {
      const group = tab.dataset.tab;
      const total = (groups[group] || []).length;
      const selected = selectedIds(group).size;
      tab.classList.toggle("is-active", group === activeTab);
      tab.textContent = `${labels[group]} · ${selected}/${total}`;
    });
  }

  function render() {
    const term = search.value.trim().toLowerCase();
    const ids = selectedIds(activeTab);
    const items = (groups[activeTab] || []).filter((item) => matches(item, term));
    grid.innerHTML = items.map((item) => {
      const selected = ids.has(item.id);
      const effect = item.effect_text || "Sin boost registrado";
      return `
        <button class="asset-card ${selected ? "is-selected" : ""}" type="button" data-id="${escapeHtml(item.id)}" aria-pressed="${selected ? "true" : "false"}">
          <span class="asset-image-wrap"><img src="${item.image && item.image.startsWith('http') ? escapeHtml(item.image) : window.NFT_ASSET_BASE + escapeHtml(item.image || 'nfts/blacksmith/salt_sculpture_01.png')}" alt="" loading="lazy"></span>
          <span class="asset-card-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.section || labels[activeTab])}</small>
            <span>${escapeHtml(effect)}</span>
          </span>
        </button>`;
    }).join("");
    emptyState.hidden = items.length > 0;
    renderTabs();
    updateCounters();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      render();
    });
  });

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".asset-card");
    if (!card) return;
    const item = (groups[activeTab] || []).find((asset) => asset.id === card.dataset.id);
    if (!item || !window.SFLBuildState) return;
    const selected = !selectedIds(activeTab).has(item.id);
    window.SFLBuildState.setAsset(activeTab, assetPayload(item), selected);
    render();
  });

  search.addEventListener("input", render);
  clear.addEventListener("click", () => {
    if (!window.SFLBuildState) return;
    window.SFLBuildState.clearAssets();
    render();
  });

  render();
})();
