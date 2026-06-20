(() => {
  const groups = window.CROP_GROUPS || { crops: [], fruits: [], greenhouse: [] };
  const boostRulesPayload = window.SFL_HUB_BOOST_RULES || { rules: [] };
  const boostRules = Array.isArray(boostRulesPayload.rules) ? boostRulesPayload.rules : [];
  const priceMap = window.CROP_PRICE_MAP || {};
  const labels = { crops: "Crops", fruits: "Frutas", greenhouse: "Invernadero" };
  const MINERAL_COST_CACHE_KEY = "sfl_mineral_unit_costs_v1";

  let activeTab = "crops";
  let openFormulaId = null;

  const tableWrapper = document.getElementById("cropTableWrapper");
  const search = document.getElementById("cropSearch");
  const tabs = [...document.querySelectorAll(".crop-tab")];
  const emptyState = document.getElementById("cropEmptyState");
  const resetInputs = document.getElementById("resetCropInputs");
  const plotInputs = {
    crops: document.getElementById("plotsCrops"),
    fruits: document.getElementById("plotsFruits"),
    greenhouse: document.getElementById("plotsGreenhouse")
  };
  const summary = {
    flower: document.getElementById("cropTotalFlower"),
    gems: document.getElementById("cropTotalGems"),
    best: document.getElementById("cropBestItem")
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function n(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function formatFlower(value, digits = 3) {
    return `${n(value).toFixed(digits)}`;
  }

  function formatSmart(value, digits = 2) {
    const number = n(value);
    const fixed = number.toFixed(digits);

    if (!fixed.includes(".")) return fixed;

    return fixed
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "");
  }

  function formatCoins(value) {
    return formatSmart(value, 2);
  }

  function formatSigned(value, digits = 4) {
    const number = n(value);
    const sign = number > 0 ? "+" : "";
    return `${sign}${formatSmart(number, digits)}`;
  }

  function formatPercentFromMultiplier(value) {
    const number = n(value, 1);
    const percent = (number - 1) * 100;
    return `${percent > 0 ? "+" : ""}${formatSmart(percent, 2)}%`;
  }

  function humanEffectLabel(kind, signal, buff, item) {
    const amount = n(buff);
    const cropName = item?.name || "crop";
    if (kind === "quantity") {
      if (signal === "x" || signal === "xI") return `(${formatPercentFromMultiplier(amount)} ${cropName})`;
      if (signal === "+" || signal === "+A") return `(${formatSigned(amount, 4)} ${cropName})`;
      if (signal === "-") return `(-${formatSmart(amount, 4)} ${cropName})`;
      if (signal === "+S") return `(${formatSigned(amount, 4)} semillas usadas)`;
    }
    if (kind === "time") {
      if (signal === "x" || signal === "xCM") return `(${formatPercentFromMultiplier(amount)} tiempo)`;
      if (signal === "-") return `(-${formatSmart(amount / 1000, 2)}s tiempo)`;
    }
    if (kind === "coins") {
      if (signal === "xV") return `(${formatPercentFromMultiplier(amount)} venta en coins)`;
      if (signal === "xC") return `(${formatPercentFromMultiplier(amount)} costo de semilla)`;
    }
    if (kind === "stock") {
      if (signal === "x") return `(${formatPercentFromMultiplier(amount)} stock)`;
      if (signal === "+") return `(${formatSigned(amount, 2)} stock)`;
    }
    if (kind === "duration") return `(+${formatSmart(amount, 2)} cosechas del árbol)`;
    return `(${signal || "boost"} ${formatSmart(amount, 4)})`;
  }

  function pushBoostLine(rules, ruleName, label) {
    rules.boostLines.push({ name: ruleName || "Boost", label });
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.round(n(seconds)));
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return [hours, minutes, sec].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function currentConfig() {
    const config = window.SFLBuildState?.getConfig() || {};
    return {
      islandType: config.islandType || "Desert",
      season: config.season || "Autumn",
      vip: config.vip !== false,
      gemPack: config.gemPack || "1350-9.09",
      coinsPerFlower: n(config.coinsPerFlower, 2500),
      flowerUsd: n(config.flowerUsd, 0.071),
      activeHoursPerDay: clamp(Math.round(n(config.activeHoursPerDay, 12)), 0, 24),
      includeRestock: config.includeRestock !== false,
      gemsPerRestock: [5, 10, 15, 20].includes(n(config.gemsPerRestock)) ? n(config.gemsPerRestock) : 20,
      plots: {
        crops: n(config.plots?.crops, 57),
        fruits: n(config.plots?.fruits, 14),
        greenhouse: 4
      }
    };
  }

  function baseHarvestRounds(item, rules = null) {
    const base = Math.max(1, n(item.base_harvests, item.group === "fruits" ? 4 : 1));
    return Math.max(1, base + n(rules?.fruitHarvestRoundsAdd, 0));
  }

  function baseTimeSeconds(item, rules = null) {
    const baseTime = n(item.base_time_seconds, 0);
    if (item.group === "fruits" && n(item.base_harvests, 0) > 1) {
      return baseTime * baseHarvestRounds(item, rules);
    }
    return baseTime;
  }

  function baseYieldPerPlot(item) {
    return n(item.base_yield_per_plot, 1);
  }

  function baseStock(item) {
    return n(item.base_stock, 0);
  }

  function baseSeedCostCoins(item) {
    return n(item.base_seed_cost_coins, 0);
  }

  function baseSellCoins(item) {
    return n(item.base_sell_coins, 0);
  }

  function tradeMultiplier(config) {
    const vipRates = { Basic: 0, Spring: 0.75, Desert: 0.9, Volcano: 0.925 };
    const normalRates = { Basic: 0, Spring: 0.5, Desert: 0.8, Volcano: 0.85 };
    return (config.vip ? vipRates : normalRates)[config.islandType] ?? 0.9;
  }

  function gemCostFlower(config) {
    if (window.SFLGemPacks) return window.SFLGemPacks.gemMetrics(config).flowerPerGem;
    const [gems, usd] = String(config.gemPack || "1350-9.09").split("-").map(Number);
    return config.flowerUsd > 0 && gems > 0 ? (usd / gems) / config.flowerUsd : 0;
  }

  function priceFlower(name) {
    return n(priceMap[normalize(name)], 0);
  }

  function oilOutputPerCraft() {
    // The oil tool is consumed every day. The 3-day output pattern is 10, 10, 30,
    // so the average output per daily tool is 16.67 oil.
    return (10 + 10 + 30) / 3;
  }

  function cachedMineralOilCostFlower() {
    try {
      const raw = window.localStorage?.getItem(MINERAL_COST_CACHE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      const value = Number(payload?.resources?.oil?.cost);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  function fallbackOilUnitCostFlower(config) {
    const craftCostFlower =
      (20 * priceFlower("Wood")) +
      (9 * priceFlower("Iron")) +
      (10 * priceFlower("Leather")) +
      (config.coinsPerFlower > 0 ? 100 / config.coinsPerFlower : 0);
    const oilOutput = oilOutputPerCraft();
    return oilOutput > 0 ? craftCostFlower / oilOutput : 0;
  }

  function oilUnitCostFlower(config) {
    // Prefer the stepped Oil production cost saved by the Minerals tab.
    // It includes own-vs-market resource choices and mineral boosts.
    return cachedMineralOilCostFlower() ?? fallbackOilUnitCostFlower(config);
  }

  function allSelectedBoosts() {
    const state = window.SFLBuildState?.load?.() || { skills: [], assets: {} };
    return [
      ...(state.skills || []),
      ...Object.values(state.assets || {}).flat()
    ].filter(Boolean);
  }

  const rulesById = new Map();
  const rulesByName = new Map();
  const rulesByNameAndCategory = new Map();
  const rulesByNameAndType = new Map();

  for (const rule of boostRules) {
    const idKey = normalize(rule.idName);
    const nameKey = normalize(rule.name);
    const categoryKey = normalize(rule.category);
    const typeKey = normalize(rule.sourceType);
    if (idKey) rulesById.set(idKey, rule);
    if (nameKey) {
      if (!rulesByName.has(nameKey)) rulesByName.set(nameKey, []);
      rulesByName.get(nameKey).push(rule);
      if (categoryKey) rulesByNameAndCategory.set(`${nameKey}|${categoryKey}`, rule);
      if (typeKey) {
        if (!rulesByNameAndType.has(`${nameKey}|${typeKey}`)) rulesByNameAndType.set(`${nameKey}|${typeKey}`, []);
        rulesByNameAndType.get(`${nameKey}|${typeKey}`).push(rule);
      }
    }
  }

  const aliases = new Map([
    ["timewarptotem", "supertotem"]
  ]);

  function ruleTypeForBoost(boost) {
    if (boost.category) return "skill";
    if (boost.group === "wearables") return "wearable";
    if (boost.group === "shrines") return "shrine";
    if (boost.group === "blacksmith" || boost.group === "nfts") return "collectible";
    return "";
  }

  function findRulesForBoost(boost) {
    const explicitId = normalize(boost.sflHubId || boost.sfl_hub_id || boost.idName || "");
    if (explicitId && rulesById.has(explicitId)) return [rulesById.get(explicitId)];

    const nameKey = normalize(boost.name);
    if (!nameKey) return [];
    const aliasId = aliases.get(nameKey);
    if (aliasId && rulesById.has(aliasId)) return [rulesById.get(aliasId)];

    const categoryKey = normalize(boost.category);
    const typed = ruleTypeForBoost(boost);
    if (categoryKey && rulesByNameAndCategory.has(`${nameKey}|${categoryKey}`)) {
      return [rulesByNameAndCategory.get(`${nameKey}|${categoryKey}`)];
    }
    if (typed && rulesByNameAndType.has(`${nameKey}|${normalize(typed)}`)) {
      return rulesByNameAndType.get(`${nameKey}|${normalize(typed)}`);
    }
    return rulesByName.get(nameKey) || [];
  }

  function selectedHubRules() {
    const selected = allSelectedBoosts();
    const entries = [];
    const seen = new Set();
    for (const boost of selected) {
      for (const rule of findRulesForBoost(boost)) {
        const key = rule.idName || `${rule.sourceType}:${rule.name}:${rule.category}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ boost, rule });
        }
      }
    }
    return entries;
  }

  function selectedHubIds(entries) {
    return new Set(entries.map(({ rule }) => normalize(rule.idName)).filter(Boolean));
  }

  function seasonAllowed(rule, config) {
    if (!rule.estacao || !Array.isArray(rule.estacao)) return true;
    return rule.estacao.map(normalize).includes(normalize(config.season));
  }

  function affectedBy(effect, item) {
    const affected = effect?.recursoAfetado;
    if (!Array.isArray(affected)) return false;
    const itemName = normalize(item.name);
    return affected.some((resource) => normalize(resource) === itemName);
  }

  function effectiveBuff(effect, selectedIds) {
    let buff = n(effect.buff, n(effect.buffBase, 0));
    if (effect.condicionalSkill && selectedIds.has(normalize(effect.condicionalSkill.dependeDe))) {
      buff = n(effect.condicionalSkill.novoBuff, buff);
    }
    if (effect.condicionalNft && selectedIds.has(normalize(effect.condicionalNft.dependeDe))) {
      buff = n(effect.condicionalNft.novoBuff, buff);
    }
    return buff;
  }

  function effectiveAffected(effect, selectedIds) {
    let affected = Array.isArray(effect.recursoAfetado) ? [...effect.recursoAfetado] : [];
    if (effect.condicionalSkill2 && selectedIds.has(normalize(effect.condicionalSkill2.dependeDe)) && Array.isArray(effect.condicionalSkill2.novoRecursoAfetado)) {
      affected = effect.condicionalSkill2.novoRecursoAfetado;
    }
    return affected;
  }

  function applyQuantity(effect, item, rules, selectedIds, ruleName) {
    const affected = effectiveAffected(effect, selectedIds);
    if (!affected.some((resource) => normalize(resource) === normalize(item.name))) return;
    const buff = effectiveBuff(effect, selectedIds);
    if (effect.sinal === "x") rules.quantityMultiplier *= buff;
    if (effect.sinal === "+") rules.quantityAdd += buff;
    if (effect.sinal === "-") rules.quantitySubtract += buff;
    if (effect.sinal === "+A") rules.areaQuantityAdd += buff;
    if (effect.sinal === "xI") rules.quantityInstantMultiplier *= buff;
    if (effect.sinal === "+S") rules.seedUseMultiplier += buff;
    rules.notes.push(`${ruleName}: cantidad ${effect.sinal} ${buff}`);
    pushBoostLine(rules, ruleName, humanEffectLabel("quantity", effect.sinal, buff, item));
  }

  function applyTime(effect, item, rules, selectedIds, ruleName) {
    if (!affectedBy(effect, item)) return;
    const buff = effectiveBuff(effect, selectedIds);
    if (effect.sinal === "x" || effect.sinal === "xCM") rules.timeMultiplier *= buff;
    if (effect.sinal === "-") rules.timeSubtract += buff / 1000;
    rules.notes.push(`${ruleName}: tiempo ${effect.sinal} ${buff}`);
    pushBoostLine(rules, ruleName, humanEffectLabel("time", effect.sinal, buff, item));
  }

  function applyCoins(effect, item, rules, selectedIds, ruleName) {
    if (!affectedBy(effect, item)) return;
    const buff = effectiveBuff(effect, selectedIds);
    if (effect.sinal === "xV") rules.sellMultiplier *= buff;
    if (effect.sinal === "xC") rules.seedCostMultiplier *= buff;
    rules.notes.push(`${ruleName}: coins ${effect.sinal} ${buff}`);
    pushBoostLine(rules, ruleName, humanEffectLabel("coins", effect.sinal, buff, item));
  }

  function applyStock(effect, item, rules, selectedIds, ruleName) {
    if (!affectedBy(effect, item)) return;
    const buff = effectiveBuff(effect, selectedIds);
    if (effect.sinal === "x") rules.stockMultiplier *= buff;
    if (effect.sinal === "+") rules.stockAdd += buff;
    rules.notes.push(`${ruleName}: stock ${effect.sinal} ${buff}`);
    pushBoostLine(rules, ruleName, humanEffectLabel("stock", effect.sinal, buff, item));
  }

  function applyDuration(effect, item, rules, selectedIds, ruleName) {
    if (item.group !== "fruits") return;
    if (!affectedBy(effect, item)) return;
    const buff = effectiveBuff(effect, selectedIds);
    if (effect.sinal === "+") rules.fruitHarvestRoundsAdd += buff;
    rules.notes.push(`${ruleName}: rondas de fruta +${buff}`);
    pushBoostLine(rules, ruleName, humanEffectLabel("duration", effect.sinal, buff, item));
  }

  function buildRules(item, config) {
    const rules = {
      timeMultiplier: 1,
      timeSubtract: 0,
      stockMultiplier: 1,
      stockAdd: 0,
      seedCostMultiplier: 1,
      sellMultiplier: 1,
      quantityMultiplier: 1,
      quantityAdd: 0,
      quantitySubtract: 0,
      areaQuantityAdd: 0,
      quantityInstantMultiplier: 1,
      seedUseMultiplier: 1,
      fruitHarvestRoundsAdd: 0,
      matchedRules: [],
      notes: [],
      boostLines: []
    };

    const entries = selectedHubRules();
    const ids = selectedHubIds(entries);
    for (const { rule } of entries) {
      if (!seasonAllowed(rule, config)) continue;
      const ruleName = rule.name || rule.idName || "Boost";
      let appliedBefore = rules.notes.length;
      (rule.quantidade || []).forEach((effect) => applyQuantity(effect, item, rules, ids, ruleName));
      (rule.quantidade2 || []).forEach((effect) => applyQuantity(effect, item, rules, ids, ruleName));
      (rule.tempo || []).forEach((effect) => applyTime(effect, item, rules, ids, ruleName));
      (rule.coins || []).forEach((effect) => applyCoins(effect, item, rules, ids, ruleName));
      (rule.estoque || []).forEach((effect) => applyStock(effect, item, rules, ids, ruleName));
      (rule.duracao || []).forEach((effect) => applyDuration(effect, item, rules, ids, ruleName));
      if (rules.notes.length > appliedBefore) rules.matchedRules.push(ruleName);
    }

    return rules;
  }

  function calculate(item, config) {
    const plots = item.group === "greenhouse" ? 4 : Math.max(0, n(config.plots[item.group], 0));
    const rules = buildRules(item, config);
    const harvestRounds = baseHarvestRounds(item, rules);
    const baseTime = baseTimeSeconds(item, rules);
    const adjustedTime = Math.max(1, (baseTime * rules.timeMultiplier) - rules.timeSubtract);
    const seedCost = Math.max(0, baseSeedCostCoins(item) * rules.seedCostMultiplier);
    const sellCoins = Math.max(0, baseSellCoins(item) * rules.sellMultiplier);
    const stock = Math.max(0, baseStock(item) * rules.stockMultiplier + rules.stockAdd);
    let yieldPerPlot = ((baseYieldPerPlot(item) * rules.quantityMultiplier) + rules.quantityAdd - rules.quantitySubtract + (plots > 0 ? rules.areaQuantityAdd / plots : 0)) * rules.quantityInstantMultiplier;
    if (item.group === "fruits") yieldPerPlot *= harvestRounds;
    yieldPerPlot = Math.max(0, yieldPerPlot);

    const activeSeconds = Math.max(0, config.activeHoursPerDay * 3600);
    const cyclesPerDay = adjustedTime > 0 ? activeSeconds / adjustedTime : 0;
    const harvestedPerCycle = yieldPerPlot * plots;
    const seedUsesPerCycle = plots * rules.seedUseMultiplier;
    const seedCostCycleCoins = seedCost * seedUsesPerCycle;
    const seedCostCycleFlower = config.coinsPerFlower > 0 ? seedCostCycleCoins / config.coinsPerFlower : 0;
    const oilPerSeed = item.group === "greenhouse" ? n(item.base_oil_per_seed, 0) : 0;
    const oilCostPerUnitFlower = item.group === "greenhouse" ? oilUnitCostFlower(config) : 0;
    const oilCostCycleFlower = oilPerSeed * seedUsesPerCycle * oilCostPerUnitFlower;
    const coinsProfitCycle = (sellCoins * harvestedPerCycle) - seedCostCycleCoins;
    const coinsProfitCycleFlower = (config.coinsPerFlower > 0 ? coinsProfitCycle / config.coinsPerFlower : 0) - oilCostCycleFlower;
    const marketGrossCycleFlower = n(item.market_price_flower, 0) * harvestedPerCycle;
    const marketAfterFeeCycleFlower = marketGrossCycleFlower * tradeMultiplier(config);
    const marketProfitCycleFlower = marketAfterFeeCycleFlower - seedCostCycleFlower - oilCostCycleFlower;
    const bestSell = marketProfitCycleFlower > coinsProfitCycleFlower ? "FLOWER" : "Coins";
    const bestCycleFlower = Math.max(coinsProfitCycleFlower, marketProfitCycleFlower);
    const grossDayFlower = bestCycleFlower * cyclesPerDay;
    const restocksDay = stock > 0 && seedUsesPerCycle > 0 ? (cyclesPerDay * seedUsesPerCycle) / stock : 0;
    const gemsDay = restocksDay * config.gemsPerRestock;
    const restockCostFlower = config.includeRestock ? gemsDay * gemCostFlower(config) : 0;
    const netDayFlower = grossDayFlower - restockCostFlower;

    return {
      plots,
      activeHoursPerDay: config.activeHoursPerDay,
      adjustedTime,
      seedCost,
      sellCoins,
      stock,
      yieldPerPlot,
      harvestRounds,
      cyclesPerDay,
      harvestedPerCycle,
      seedUsesPerCycle,
      seedCostCycleFlower,
      oilPerSeed,
      oilCostPerUnitFlower,
      oilCostCycleFlower,
      coinsProfitCycle,
      marketGrossCycleFlower,
      marketAfterFeeCycleFlower,
      marketProfitCycleFlower,
      coinsProfitCycleFlower,
      bestSell,
      bestCycleFlower,
      grossDayFlower,
      restocksDay,
      gemsDay,
      restockCostFlower,
      netDayFlower,
      notes: rules.notes,
      boostLines: rules.boostLines,
      rules
    };
  }

  function setInputsFromState() {
    const config = currentConfig();
    if (plotInputs.crops) plotInputs.crops.value = config.plots.crops;
    if (plotInputs.fruits) plotInputs.fruits.value = config.plots.fruits;
    if (plotInputs.greenhouse) plotInputs.greenhouse.value = 4;
  }

  function updateInputState() {
    if (!window.SFLBuildState) return;
    const config = currentConfig();
    config.plots = {
      crops: n(plotInputs.crops?.value, 57),
      fruits: n(plotInputs.fruits?.value, 14),
      greenhouse: 4
    };
    window.SFLBuildState.setConfig(config);
  }

  function matches(item, term) {
    if (!term) return true;
    return [item.name, item.group, item.section, item.table_section, ...(item.seasons || [])]
      .join(" ")
      .toLowerCase()
      .includes(term);
  }

  function renderTabs() {
    tabs.forEach((tab) => {
      const group = tab.dataset.tab;
      tab.classList.toggle("is-active", group === activeTab);
      tab.textContent = `${labels[group]} · ${(groups[group] || []).length}`;
    });
  }

  function renderSummary(allResults) {
    const totalFlower = allResults.reduce((sum, row) => sum + row.result.netDayFlower, 0);
    const totalGems = allResults.reduce((sum, row) => sum + row.result.gemsDay, 0);
    const best = [...allResults].sort((a, b) => b.result.netDayFlower - a.result.netDayFlower)[0];
    summary.flower.textContent = `${formatSmart(totalFlower, 2)} FLOWER`;
    if (summary.gems) summary.gems.textContent = formatSmart(totalGems, 2);
    summary.best.textContent = best ? best.item.name : "—";
  }

  function formulaDetails(item, result, config) {
    const itemLabel = item.group === "greenhouse" ? "invernadero" : item.group === "fruits" ? "fruta" : "crop";
    const baseRounds = Math.max(1, n(item.base_harvests, item.group === "fruits" ? 4 : 1));
    const tradePct = (tradeMultiplier(config) * 100).toFixed(0);
    const marketPrice = n(item.market_price_flower, 0);
    const seedsPerDay = result.seedUsesPerCycle * result.cyclesPerDay;
    const seedCostCoins = result.seedCost * result.seedUsesPerCycle;
    const seedCostDayCoins = seedCostCoins * result.cyclesPerDay;
    const seedCostDayFlower = result.seedCostCycleFlower * result.cyclesPerDay;
    const harvestsWord = result.cyclesPerDay === 1 ? "cosecha" : "cosechas";
    const boostLines = (result.boostLines || []).map((boost) => `
      <li class="boost-line"><span>${escapeHtml(boost.name)}</span><strong>${escapeHtml(boost.label)}</strong></li>`).join("");
    const isFruit = item.group === "fruits";
    const cycleLabel = isFruit ? "ciclo completo" : "harvest";
    const cyclePluralLabel = isFruit ? "ciclos completos" : "harvests";
    const harvestTitle = isFruit ? "2. Por ciclo completo de planta" : "2. Por cada cosecha";
    const harvestIntro = isFruit
      ? `Cosechas <strong>${formatSmart(result.harvestedPerCycle, 4)} ${escapeHtml(item.name)}</strong> por ciclo completo de planta.`
      : `Cosechas <strong>${formatSmart(result.harvestedPerCycle, 4)} ${escapeHtml(item.name)}</strong> por harvest.`;
    const profitPerCycleLabel = isFruit ? "Ganancia por ciclo completo" : "Ganancia por cosecha";
    const timeConfigLabel = isFruit ? "Tiempo del ciclo completo" : "Tiempo de crecimiento";
    const fruitSingleHarvestTime = result.harvestRounds > 0 ? result.adjustedTime / result.harvestRounds : result.adjustedTime;
    const fruitNote = isFruit ? `
      <p>Esta fruta se calcula como <strong>ciclo completo de planta</strong>. Cada cosecha individual da 1 fruta por planta y tarda aproximadamente <strong>${escapeHtml(formatTime(fruitSingleHarvestTime))}</strong>. Como usamos <strong>${formatSmart(result.harvestRounds, 2)} cosechas promedio por planta</strong>, el ciclo completo tarda <strong>${escapeHtml(formatTime(result.adjustedTime))}</strong> y da <strong>${formatSmart(result.harvestedPerCycle, 4)} ${escapeHtml(item.name)}</strong> en total.</p>
      <p>El juego puede dar entre 3 y 5 cosechas antes de que la planta se marchite; aquí usamos <strong>${formatSmart(baseRounds, 2)}</strong> como promedio base.</p>` : "";
    const greenhouseNote = item.group === "greenhouse" ? `
      <p>El invernadero usa <strong>4 plots fijos</strong> y rendimiento 1:1. También descuenta el oil como costo de producción. Si ya abriste la pestaña Minerales, se usa el <strong>costo escalonado del Oil</strong> calculado ahí; si no, se usa la receta base <strong>20 wood + 9 iron + 10 leather + 100 coins</strong> con producción promedio <strong>16.67 oil</strong>.</p>` : "";
    const oilUsedPerCycle = result.oilPerSeed * result.seedUsesPerCycle;
    const oilLine = item.group === "greenhouse" ? `
      <li><span>Oil usado</span><strong>${formatSmart(result.oilPerSeed, 2)} oil por plot × ${formatSmart(result.seedUsesPerCycle, 0)} plots = ${formatSmart(oilUsedPerCycle, 2)} oil</strong></li>
      <li><span>Costo de 1 oil</span><strong>${formatSmart(result.oilCostPerUnitFlower, 6)} FLOWER</strong></li>
      <li><span>Costo de oil usado</span><strong>${formatSmart(result.oilCostCycleFlower, 6)} FLOWER por harvest</strong></li>` : "";

    return `
      <div class="formula-row-box formula-explainer">
        <header class="formula-explainer-header">
          <div>
            <span class="formula-kicker">Explicación del cálculo</span>
            <h4>${escapeHtml(item.name)}</h4>
          </div>
          <strong class="formula-final ${result.netDayFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.netDayFlower, 4)} FLOWER/día</strong>
        </header>

        <section class="formula-step">
          <h5>1. Tu configuración</h5>
          <ul class="formula-facts">
            <li><span>Plots usados</span><strong>${formatSmart(result.plots, 0)}</strong></li>
            <li><span>Horas activas al día</span><strong>${formatSmart(result.activeHoursPerDay, 0)} h</strong></li>
            <li><span>${timeConfigLabel}</span><strong>${escapeHtml(formatTime(result.adjustedTime))}</strong></li>
            <li><span>Precio market</span><strong>${formatSmart(marketPrice, 8)} FLOWER</strong></li>
            <li><span>Fee aplicado</span><strong>recibes ${tradePct}%</strong></li>
            <li><span>1 FLOWER</span><strong>${formatSmart(config.coinsPerFlower, 0)} coins</strong></li>
          </ul>
          ${fruitNote}
          ${greenhouseNote}
        </section>

        <section class="formula-step">
          <h5>${harvestTitle}</h5>
          <p>${harvestIntro}</p>
          <ul class="formula-facts">
            <li><span>Venta en market antes del fee</span><strong>${formatSmart(result.marketGrossCycleFlower, 6)} FLOWER</strong></li>
            <li><span>Después del fee</span><strong>${formatSmart(result.marketAfterFeeCycleFlower, 6)} FLOWER</strong></li>
            <li><span>Costo de semillas</span><strong>${formatSmart(seedCostCoins, 4)} coins = ${formatSmart(result.seedCostCycleFlower, 6)} FLOWER</strong></li>
            ${oilLine}
            <li><span>${profitPerCycleLabel}</span><strong>${formatSmart(result.bestCycleFlower, 6)} FLOWER</strong></li>
          </ul>
          <p>La herramienta compara vender por coins contra vender en market y usa la mejor opción: <strong>${escapeHtml(result.bestSell)}</strong>.</p>
        </section>

        <section class="formula-step">
          <h5>3. En tus horas activas</h5>
          <p>${isFruit ? `${escapeHtml(item.name)} completa su ciclo en` : `${escapeHtml(item.name)} tarda`} <strong>${escapeHtml(formatTime(result.adjustedTime))}</strong>. En <strong>${formatSmart(result.activeHoursPerDay, 0)} horas</strong> caben <strong>${formatSmart(result.cyclesPerDay, 2)} ${isFruit ? cyclePluralLabel : harvestsWord}</strong>.</p>
          <div class="formula-equation">${formatSmart(result.bestCycleFlower, 6)} FLOWER por ${cycleLabel} × ${formatSmart(result.cyclesPerDay, 2)} ${cyclePluralLabel} = <strong>${formatSmart(result.grossDayFlower, 4)} FLOWER</strong></div>
        </section>

        <section class="formula-step">
          <h5>4. Restock</h5>
          <p>Usas <strong>${formatSmart(result.seedUsesPerCycle, 2)} semillas</strong> por ${cycleLabel}. En tus horas activas usas <strong>${formatSmart(seedsPerDay, 2)} semillas</strong>.</p>
          <ul class="formula-facts">
            <li><span>Stock disponible</span><strong>${formatSmart(result.stock, 2)} semillas</strong></li>
            <li><span>Restocks necesarios</span><strong>${formatSmart(result.restocksDay, 2)} al día</strong></li>
            <li><span>Gemas por restock</span><strong>${formatSmart(config.gemsPerRestock, 0)} gems</strong></li>
            <li><span>Gemas necesarias</span><strong>${formatSmart(result.gemsDay, 2)} gems</strong></li>
            <li><span>Costo descontado</span><strong>${formatSmart(result.restockCostFlower, 4)} FLOWER</strong></li>
          </ul>
        </section>

        <section class="formula-step">
          <h5>5. Boosts activos</h5>
          ${boostLines ? `<ul class="boost-list">${boostLines}</ul>` : `<p class="muted-line">Sin boosts activos detectados para este ${itemLabel}.</p>`}
        </section>

        <section class="formula-step formula-result-step">
          <h5>6. Resultado final</h5>
          <div class="formula-equation">${formatSmart(result.grossDayFlower, 4)} FLOWER - ${formatSmart(result.restockCostFlower, 4)} FLOWER = <strong>${formatSmart(result.netDayFlower, 4)} FLOWER/día</strong></div>
        </section>

        <details class="technical-details">
          <summary>Ver fórmula técnica</summary>
          <ul>
            <li><strong>Harvest total:</strong> ${formatSmart(result.harvestedPerCycle, 4)} = ${formatSmart(result.yieldPerPlot, 4)} yield/plot × ${formatSmart(result.plots, 0)} plots</li>
            <li><strong>Market:</strong> (${formatSmart(marketPrice, 8)} × ${formatSmart(result.harvestedPerCycle, 4)} × ${formatSmart(tradeMultiplier(config), 3)}) - ${formatSmart(result.seedCostCycleFlower, 6)} seed cost${item.group === "greenhouse" ? ` - ${formatSmart(result.oilCostCycleFlower, 6)} oil` : ""}</li>
            ${item.group === "greenhouse" ? `<li><strong>Oil:</strong> ${formatSmart(result.oilPerSeed, 2)} oil × ${formatSmart(result.seedUsesPerCycle, 0)} plots × ${formatSmart(result.oilCostPerUnitFlower, 6)} FLOWER = ${formatSmart(result.oilCostCycleFlower, 6)} FLOWER</li>` : ""}
            <li><strong>Coins:</strong> (${formatCoins(result.sellCoins)} × ${formatSmart(result.harvestedPerCycle, 4)}) - (${formatCoins(result.seedCost)} × ${formatSmart(result.seedUsesPerCycle, 2)}) = ${formatCoins(result.coinsProfitCycle)} coins</li>
            <li><strong>Ciclos:</strong> (${formatSmart(result.activeHoursPerDay, 0)}h × 3600) / ${escapeHtml(formatTime(result.adjustedTime))} = ${formatSmart(result.cyclesPerDay, 4)}</li>
            <li><strong>Restock:</strong> (${formatSmart(result.cyclesPerDay, 4)} × ${formatSmart(result.seedUsesPerCycle, 2)}) / ${formatSmart(result.stock, 2)} = ${formatSmart(result.restocksDay, 4)}</li>
            <li><strong>Gemas:</strong> ${formatSmart(result.restocksDay, 4)} restocks × ${formatSmart(config.gemsPerRestock, 0)} gems = ${formatSmart(result.gemsDay, 2)} gems</li>
          </ul>
        </details>
      </div>`;
  }

  function groupRows(items) {
    if (activeTab === "crops") {
      const sections = [];
      for (const title of ["Basic crops", "Medium crops", "Advanced crops", "Other crops"]) {
        const rows = items.filter(({ item }) => (item.table_section || item.level || item.section) === title);
        if (rows.length) sections.push({ title, rows });
      }
      return sections;
    }

    if (activeTab === "fruits") {
      const order = ["Fruits", "Special Fruits"];
      const sections = [];
      for (const title of order) {
        const rows = items.filter(({ item }) => (item.section || "Fruits") === title);
        if (rows.length) sections.push({ title, rows });
      }
      const known = new Set(order);
      const otherTitles = [...new Set(items.map(({ item }) => item.section || "Fruits").filter((title) => !known.has(title)))];
      for (const title of otherTitles) {
        const rows = items.filter(({ item }) => (item.section || "Fruits") === title);
        if (rows.length) sections.push({ title, rows });
      }
      return sections;
    }

    return [{ title: "Greenhouse", rows: items }];
  }

  function tableHeaders() {
    return `
      <colgroup>
        <col class="col-crop">
        <col class="col-time">
        <col class="col-cost">
        <col class="col-yield">
        <col class="col-harvest">
        <col class="col-flower-harvest">
        <col class="col-stock">
        <col class="col-restocks">
        <col class="col-gems">
        <col class="col-daily">
        <col class="col-sell">
        <col class="col-formula">
      </colgroup>
      <thead>
        <tr>
          <th class="text-left">Cultivo</th>
          <th class="text-center">Tiempo</th>
          <th class="number">Costo</th>
          <th class="number">Yield</th>
          <th class="number">Cosecha</th>
          <th class="number">FLOWER/cosecha</th>
          <th class="number">Stock</th>
          <th class="number">Restocks</th>
          <th class="number">Gems</th>
          <th class="number">FLOWER/día</th>
          <th class="text-left">Venta</th>
          <th class="formula-cell"></th>
        </tr>
      </thead>`;
  }

  function renderRow(item, result) {
    const image = item.image ? window.CROP_ASSET_BASE + item.image : window.CROP_ASSET_BASE + "crops/placeholder.svg";
    const isOpen = openFormulaId === item.id;
    const mainRow = `
      <tr class="crop-data-row">
        <td class="crop-name-cell"><div class="crop-name-wrap"><span class="crop-image-mini"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span><strong>${escapeHtml(item.name)}</strong></div></td>
        <td>${escapeHtml(formatTime(result.adjustedTime))}</td>
        <td class="number">${formatCoins(result.seedCost)}</td>
        <td class="number">${formatSmart(result.yieldPerPlot, 2)}</td>
        <td class="number">${formatSmart(result.harvestedPerCycle, 2)}</td>
        <td class="number ${result.bestCycleFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.bestCycleFlower, 4)}</td>
        <td class="number">${formatSmart(result.stock, 2)}</td>
        <td class="number">${formatSmart(result.restocksDay, 2)}</td>
        <td class="number">${formatSmart(result.gemsDay, 2)}</td>
        <td class="number ${result.netDayFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.netDayFlower, 3)}</td>
        <td>${escapeHtml(result.bestSell)}</td>
        <td class="formula-cell"><button class="formula-toggle" type="button" data-formula-id="${escapeHtml(item.id)}" aria-expanded="${isOpen ? "true" : "false"}">!</button></td>
      </tr>`;
    const formulaRow = isOpen ? `<tr class="crop-formula-row"><td colspan="12">${formulaDetails(item, result, currentConfig())}</td></tr>` : "";
    return mainRow + formulaRow;
  }

  function renderSection(section) {
    const rows = section.rows.map(({ item, result }) => renderRow(item, result)).join("");
    return `
      <section class="crop-section-table">
        <h3>${escapeHtml(section.title || labels[activeTab])}</h3>
        <div class="table-wrapper crop-table-shell">
          <table class="crop-table">
            ${tableHeaders()}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  function render() {
    const config = currentConfig();
    const term = search.value.trim().toLowerCase();
    const allResults = Object.values(groups).flat().map((item) => ({ item, result: calculate(item, config) }));
    renderSummary(allResults);

    const items = (groups[activeTab] || [])
      .filter((item) => matches(item, term))
      .map((item) => ({ item, result: calculate(item, config) }))
      .sort((a, b) => n(a.item.sort_order, 999) - n(b.item.sort_order, 999));

    tableWrapper.innerHTML = groupRows(items).map(renderSection).join("");
    emptyState.hidden = items.length > 0;
    renderTabs();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    openFormulaId = null;
    render();
  }));

  search.addEventListener("input", render);
  Object.values(plotInputs).filter(Boolean).forEach((input) => input.addEventListener("change", () => { updateInputState(); render(); }));
  Object.values(plotInputs).filter(Boolean).forEach((input) => input.addEventListener("input", () => { updateInputState(); render(); }));

  resetInputs.addEventListener("click", () => {
    const defaults = window.SFLBuildState?.defaults?.() || { plots: { crops: 57, fruits: 14, greenhouse: 4 }, gemsPerRestock: 20 };
    const config = currentConfig();
    config.plots = { ...defaults.plots, greenhouse: 4 };
    window.SFLBuildState?.setConfig(config);
    setInputsFromState();
    render();
  });

  tableWrapper.addEventListener("click", (event) => {
    const button = event.target.closest("[data-formula-id]");
    if (!button) return;
    const id = button.dataset.formulaId;
    openFormulaId = openFormulaId === id ? null : id;
    render();
  });

  window.addEventListener("sfl-build-state-change", () => {
    setInputsFromState();
    render();
  });

  setInputsFromState();
  render();
})();
