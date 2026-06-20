(() => {
  const FLOWER_USD_DEFAULT = 0.071;
  const RESTOCK_OPTIONS = [5, 10, 15, 20];
  const GEMS_PER_RESTOCK_DEFAULT = 20;
  const GEM_PACKS = [
    { value: "100-0.90", gems: 100, usd: 0.90, label: "100 Gems - $0.90" },
    { value: "650-4.54", gems: 650, usd: 4.54, label: "650 Gems - $4.54" },
    { value: "1350-9.09", gems: 1350, usd: 9.09, label: "1350 Gems - $9.09" },
    { value: "2800-18.19", gems: 2800, usd: 18.19, label: "2800 Gems - $18.19" },
    { value: "7400-45.49", gems: 7400, usd: 45.49, label: "7400 Gems - $45.49" },
    { value: "15500-90.99", gems: 15500, usd: 90.99, label: "15500 Gems - $90.99" },
    { value: "200000-909.99", gems: 200000, usd: 909.99, label: "200000 Gems - $909.99" }
  ];

  function packFromValue(value) {
    return GEM_PACKS.find((pack) => pack.value === value) || GEM_PACKS[2];
  }

  function validRestockGems(value) {
    const next = Number(value);
    return RESTOCK_OPTIONS.includes(next) ? next : GEMS_PER_RESTOCK_DEFAULT;
  }

  function gemMetrics(config) {
    const pack = packFromValue(config.gemPack);
    const usdPerGem = pack.usd / pack.gems;
    const flowerUsd = Number(config.flowerUsd || FLOWER_USD_DEFAULT);
    const flowerPerGem = flowerUsd > 0 ? usdPerGem / flowerUsd : 0;
    return { pack, usdPerGem, flowerPerGem, gemsPerRestock: validRestockGems(config.gemsPerRestock) };
  }

  function fillForm(config) {
    const byId = (id) => document.getElementById(id);
    byId("globalIslandType").value = config.islandType;
    byId("globalSeason").value = config.season;
    byId("globalVip").value = config.vip ? "true" : "false";
    byId("globalGemPack").value = config.gemPack;
    byId("globalGemsPerRestock").value = validRestockGems(config.gemsPerRestock);
    byId("globalCoinsPerFlower").value = config.coinsPerFlower;
    byId("globalActiveHoursPerDay").value = Math.round(Number(config.activeHoursPerDay ?? 12));
    byId("globalIncludeRestock").checked = Boolean(config.includeRestock);
  }

  function readForm() {
    const byId = (id) => document.getElementById(id);
    return {
      islandType: byId("globalIslandType").value,
      season: byId("globalSeason").value,
      vip: byId("globalVip").value === "true",
      gemPack: byId("globalGemPack").value,
      gemsPerRestock: validRestockGems(byId("globalGemsPerRestock").value),
      coinsPerFlower: Number(byId("globalCoinsPerFlower").value || 2500),
      activeHoursPerDay: Math.min(24, Math.max(0, Math.round(Number(byId("globalActiveHoursPerDay").value || 0)))),
      flowerUsd: FLOWER_USD_DEFAULT,
      includeRestock: byId("globalIncludeRestock").checked
    };
  }

  function openModal() {
    const modal = document.getElementById("globalSettingsModal");
    if (!modal) return;
    fillForm(window.SFLBuildState.getConfig());
    modal.removeAttribute("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    const modal = document.getElementById("globalSettingsModal");
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.classList.remove("modal-open");
  }

  function init() {
    if (!window.SFLBuildState) return;
    const open = document.getElementById("openGlobalSettings");
    const close = document.getElementById("closeGlobalSettings");
    const cancel = document.getElementById("cancelGlobalSettings");
    const form = document.getElementById("globalSettingsForm");

    open?.addEventListener("click", openModal);
    close?.addEventListener("click", closeModal);
    cancel?.addEventListener("click", closeModal);
    document.getElementById("globalSettingsBackdrop")?.addEventListener("click", closeModal);

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      window.SFLBuildState.setConfig(readForm());
      closeModal();
    });

    window.SFLGemPacks = { all: GEM_PACKS, packFromValue, gemMetrics, restockOptions: RESTOCK_OPTIONS, validRestockGems };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
