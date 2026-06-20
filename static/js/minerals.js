(() => {
  const groups = window.MINERAL_GROUPS || { minerals: [] };
  const boostRulesPayload = window.SFL_HUB_BOOST_RULES || { rules: [] };
  const boostRules = Array.isArray(boostRulesPayload.rules) ? boostRulesPayload.rules : [];
  const priceMap = window.MINERAL_PRICE_MAP || {};
  const MINERAL_COST_CACHE_KEY = "sfl_mineral_unit_costs_v1";

  let openFormulaId = null;

  const tableWrapper = document.getElementById("mineralTableWrapper");
  const search = document.getElementById("mineralSearch");
  const resetInputs = document.getElementById("resetMineralInputs");
  const marketTogglePanel = document.getElementById("mineralMarketToggles");
  const summary = {
    flower: document.getElementById("mineralTotalFlower"),
    gems: document.getElementById("mineralTotalGems"),
    best: document.getElementById("mineralBestItem")
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

  function formatSmart(value, digits = 2) {
    const number = n(value);
    const fixed = number.toFixed(digits);
    if (!fixed.includes(".")) return fixed;
    return fixed
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "");
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

  function formatTime(seconds) {
    seconds = Math.max(0, Math.round(n(seconds)));
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return [hours, minutes, sec].map((part) => String(part).padStart(2, "0")).join(":");
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
      mineralNodes: config.mineralNodes || {},
      mineralBoughtMarket: config.mineralBoughtMarket || {}
    };
  }

  function allowedNodeTiers(item) {
    const tiers = Array.isArray(item.node_tiers) && item.node_tiers.length ? item.node_tiers : ["t1", "t2", "t3"];
    return new Set(tiers.map((tier) => String(tier).toLowerCase()));
  }

  function defaultNodesFor(item) {
    const saved = currentConfig().mineralNodes?.[item.id] || {};
    const tiers = allowedNodeTiers(item);
    return {
      t1: tiers.has("t1") ? Math.max(0, Math.round(n(saved.t1, 1))) : 0,
      t2: tiers.has("t2") ? Math.max(0, Math.round(n(saved.t2, 0))) : 0,
      t3: tiers.has("t3") ? Math.max(0, Math.round(n(saved.t3, 0))) : 0
    };
  }

  function priceFlower(name, fallback = 0) {
    const key = normalize(name);
    return n(priceMap[key], fallback);
  }


  function allMineralItems() {
    return groups.minerals || [];
  }

  function itemByName(name) {
    const key = normalize(name);
    return allMineralItems().find((entry) => normalize(entry.name) === key || normalize(entry.id) === key) || null;
  }

  function isBoughtFromMarket(resourceName, config) {
    const item = itemByName(resourceName);
    const key = item ? item.id : normalize(resourceName);
    return Boolean(config.mineralBoughtMarket?.[key]);
  }

  function saveBoughtFromMarket(resourceId, bought) {
    if (!window.SFLBuildState) return;
    const config = currentConfig();
    const mineralBoughtMarket = { ...(config.mineralBoughtMarket || {}) };
    if (bought) mineralBoughtMarket[resourceId] = true;
    else delete mineralBoughtMarket[resourceId];
    window.SFLBuildState.setConfig({ mineralBoughtMarket });
  }

  function clearBoughtFromMarket() {
    window.SFLBuildState?.setConfig({ mineralBoughtMarket: {} });
  }

  function costModeLabel(resourceName, config) {
    const item = itemByName(resourceName);
    if (!item) return "market";
    return isBoughtFromMarket(resourceName, config) ? "market" : "propio";
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

    const categoryKey = normalize(boost.category);
    const typed = ruleTypeForBoost(boost);
    if (categoryKey && rulesByNameAndCategory.has(`${nameKey}|${categoryKey}`)) {
      return [rulesByNameAndCategory.get(`${nameKey}|${categoryKey}`)];
    }
    if (typed && rulesByNameAndType.has(`${nameKey}|${typed}`)) {
      return rulesByNameAndType.get(`${nameKey}|${typed}`);
    }
    return rulesByName.get(nameKey) || [];
  }

  function boostSourceFromRule(rule, boost) {
    const sourceType = normalize(rule?.sourceType || "");
    const group = normalize(boost?.group || "");
    if (sourceType === "skill" || boost?.category) return "skill";
    if (group === "blacksmith") return "blacksmith";
    if (group === "nfts" || sourceType === "collectible" || sourceType === "nft") return "nft";
    if (group === "wearables" || sourceType === "wearable") return "wearable";
    if (group === "shrines" || sourceType === "shrine") return "shrine";
    return "other";
  }

  function boostSourceLabel(source) {
    if (source === "skill") return "skill";
    if (source === "nft") return "NFT";
    if (source === "blacksmith") return "blacksmith";
    if (source === "wearable") return "wearable";
    if (source === "shrine") return "shrine";
    if (source === "season") return "temporada VIP";
    return "boost";
  }

  function affected(entry, item) {
    const list = entry?.recursoAfetado || [];
    const itemName = normalize(item.name);
    const toolName = normalize(item.tool);
    return list.some((name) => {
      const key = normalize(name);
      return key === itemName || key === toolName;
    });
  }

  function quantityAddFromMultiplier(value) {
    return n(value, 1) - 1;
  }

  function stripWrappingParens(label) {
    const text = String(label || "").trim();
    if (text.startsWith("(") && text.endsWith(")")) return text.slice(1, -1);
    return text;
  }

  function humanEffectLabel(kind, signal, buff, item, target = "resource") {
    const amount = n(buff);
    const name = target === "tool" ? item.tool : item.name;
    if (kind === "quantity") {
      if ((signal === "x" || signal === "xI") && target === "resource") {
        return `(${formatSigned(quantityAddFromMultiplier(amount), 4)} ${name} promedio)`;
      }
      if ((signal === "x" || signal === "xI") && target === "tool") {
        return `(${formatPercentFromMultiplier(amount)} ${name} usado)`;
      }
      if (signal === "+" || signal === "+A") return `(${formatSigned(amount, 4)} ${name})`;
      if (signal === "-") return `(-${formatSmart(amount, 4)} ${name})`;
    }
    if (kind === "time") {
      if (signal === "x") return `(${formatPercentFromMultiplier(amount)} tiempo)`;
      if (signal === "-") return `(-${formatSmart(amount / 1000, 2)}s tiempo)`;
    }
    if (kind === "stock") {
      if (signal === "x") return `(${formatPercentFromMultiplier(amount)} stock ${item.tool})`;
      if (signal === "+") return `(${formatSigned(amount, 2)} stock ${item.tool})`;
    }
    if (kind === "coins") {
      if (signal === "xC") return `(${formatPercentFromMultiplier(amount)} costo ${item.tool})`;
    }
    return `(${signal || "boost"} ${formatSmart(amount, 4)})`;
  }

  function pushBoostLine(rules, ruleName, label, source = "other") {
    const name = ruleName || "Boost";
    const sourceLabel = boostSourceLabel(source);
    const key = `${normalize(name)}|${source}|${sourceLabel}`;
    const effect = stripWrappingParens(label);
    const existing = rules.boostLines.find((line) => line.key === key);
    if (existing) {
      if (effect && !existing.effects.includes(effect)) {
        existing.effects.push(effect);
        existing.label = `(${existing.effects.join(", ")})`;
      }
      return;
    }
    rules.boostLines.push({ key, name, label, effects: effect ? [effect] : [], source, sourceLabel });
  }


  function nativeBoostLineFor(item) {
    const id = normalize(item.id || item.name);
    if (["wood", "stone", "iron", "gold"].includes(id)) {
      return {
        name: "Native",
        label: `(+0.20 ${item.name}; +1 cada 5 digs seguidos = 20%)`,
        source: "native",
        sourceLabel: "nativo"
      };
    }
    if (id === "crimstone") {
      return {
        name: "Native",
        label: "(+2 Crimstone cada 5 digs seguidos)",
        source: "native",
        sourceLabel: "nativo"
      };
    }
    if (id === "oil") {
      return {
        name: "Native",
        label: "(+20 Oil cada 3 digs seguidos)",
        source: "native",
        sourceLabel: "nativo"
      };
    }
    return null;
  }

  function seasonalVipSaltActive(item, config) {
    return normalize(item.id || item.name) === "salt" && config?.vip === true;
  }

  function isSaltItem(item) {
    return normalize(item?.id || item?.name) === "salt";
  }

  function isSaltChargeCapBoost(rule, boost) {
    const text = normalize([
      rule?.idName,
      rule?.name,
      boost?.id,
      boost?.sflHubId,
      boost?.sfl_hub_id,
      boost?.idName,
      boost?.name
    ].filter(Boolean).join(" "));

    return text.includes("saltsculpturelevel3")
      || text.includes("saltsculpturel3")
      || text.includes("saltsculpture3")
      || text.includes("saltsculpturelevel6")
      || text.includes("saltsculpturel6")
      || text.includes("saltsculpture6");
  }

  function buildRules(item, config = currentConfig()) {
    const rules = {
      timeMultiplier: 1,
      timeSubtract: 0,
      yieldMultiplier: 1,
      yieldInstaMultiplier: 1,
      yieldAdd: 0,
      yieldSubtract: 0,
      toolUseMultiplier: 1,
      toolStockMultiplier: 1,
      toolStockAdd: 0,
      toolCostMultiplier: 1,
      saltChargeCapAdd: 0,
      toolResourceOverrides: {},
      boostLines: []
    };

    for (const boost of allSelectedBoosts()) {
      const candidates = findRulesForBoost(boost);
      for (const rule of candidates) {
        const source = boostSourceFromRule(rule, boost);

        for (const entry of rule.quantidade || []) {
          const affectedList = entry.recursoAfetado || [];
          const affectsResource = affectedList.some((name) => normalize(name) === normalize(item.name));
          const affectsTool = affectedList.some((name) => normalize(name) === normalize(item.tool));
          if (!affectsResource && !affectsTool) continue;

          const signal = entry.sinal;
          const buff = n(entry.buff, 0);

          if (affectsResource) {
            if (isSaltItem(item) && isSaltChargeCapBoost(rule, boost)) {
              rules.saltChargeCapAdd += buff;
              pushBoostLine(rules, rule.name, `(+${formatSmart(buff, 2)} carga acumulable ${item.name})`, source);
            } else {
              // In SFL, many resource/yield descriptions use percent wording, but the
              // practical expected value is additive: +20% Wood = +0.20 Wood average.
              // Percentage multipliers remain percentage-based for time, cost, stock,
              // and tool consumption.
              if (signal === "x" || signal === "xI") rules.yieldAdd += quantityAddFromMultiplier(buff);
              if (signal === "+" || signal === "+A") rules.yieldAdd += buff;
              if (signal === "-") rules.yieldSubtract += buff;
              pushBoostLine(rules, rule.name, humanEffectLabel("quantity", signal, buff, item, "resource"), source);
            }
          }

          if (affectsTool) {
            if (signal === "x" || signal === "xI") rules.toolUseMultiplier *= buff;
            pushBoostLine(rules, rule.name, humanEffectLabel("quantity", signal, buff, item, "tool"), source);
          }
        }

        for (const entry of rule.tempo || []) {
          if (!affected(entry, item)) continue;
          const signal = entry.sinal;
          const buff = n(entry.buff, 0);
          if (signal === "x") rules.timeMultiplier *= buff;
          if (signal === "-") rules.timeSubtract += buff / 1000;
          pushBoostLine(rules, rule.name, humanEffectLabel("time", signal, buff, item), source);
        }

        for (const entry of rule.estoque || []) {
          if (!affected(entry, item)) continue;
          const signal = entry.sinal;
          const buff = n(entry.buff, 0);
          if (signal === "x") rules.toolStockMultiplier *= buff;
          if (signal === "+") rules.toolStockAdd += buff;
          pushBoostLine(rules, rule.name, humanEffectLabel("stock", signal, buff, item), source);
        }

        for (const entry of rule.coins || []) {
          if (!affected(entry, item)) continue;
          const signal = entry.sinal;
          const buff = n(entry.buff, 1);
          if (signal === "xC") rules.toolCostMultiplier *= buff;
          pushBoostLine(rules, rule.name, humanEffectLabel("coins", signal, buff, item), source);
        }

        for (const entry of rule.troca || []) {
          if (!affected(entry, item)) continue;
          if (normalize(item.tool) === "oildrill") {
            rules.toolResourceOverrides = { remove: ["Leather"], add: { Wool: 20 } };
            pushBoostLine(rules, rule.name, "(Oil Drill usa 20 Wool en lugar de Leather)", source);
          }
        }

        for (const entry of rule.reset || []) {
          if (!affected(entry, item)) continue;
          pushBoostLine(rules, rule.name, "(efecto manual/de recarga; no cambia el promedio automático)", source);
        }

        for (const entry of rule.insta || []) {
          if (!affected(entry, item)) continue;
          pushBoostLine(rules, rule.name, "(efecto manual/de recarga; no cambia el promedio automático)", source);
        }
      }
    }

    const nativeLine = nativeBoostLineFor(item);
    if (nativeLine) rules.boostLines.unshift(nativeLine);

    if (seasonalVipSaltActive(item, config)) {
      rules.yieldAdd += 2;
      pushBoostLine(rules, "Season VIP", `(+2 ${item.name} por cosecha)`, "season");
    }

    return rules;
  }

  function effectiveNodes(nodes) {
    return n(nodes.t1) + (n(nodes.t2) * 4) + (n(nodes.t3) * 16);
  }

  function tierYieldBonus(nodes) {
    const total = effectiveNodes(nodes);
    if (total <= 0) return 0;
    return ((n(nodes.t2) * 0.5) + (n(nodes.t3) * 2.5)) / total;
  }

  function resourceMarketPrice(item) {
    return priceFlower(item.name, n(item.market_fallback_flower, 0));
  }

  function isDailyAnchorResource(item) {
    return ["gold", "crimstone", "oil"].includes(normalize(item.id || item.name));
  }

  function cyclesPerDayFor(item, activeSeconds, adjustedTime, rules = {}) {
    if (activeSeconds <= 0 || adjustedTime <= 0) {
      return { value: 0, mode: "inactive", activeCycles: 0, offlineCharges: 0, saltChargeCap: 0, offlineHours: 24 };
    }

    const normalCycles = activeSeconds / adjustedTime;

    if (isSaltItem(item)) {
      const offlineSeconds = Math.max(0, (24 * 3600) - activeSeconds);
      const saltChargeCap = Math.max(1, 1 + n(rules.saltChargeCapAdd, 0));
      const offlineCharges = Math.min(saltChargeCap, Math.floor(offlineSeconds / adjustedTime));
      return {
        value: normalCycles + offlineCharges,
        mode: "salt-accumulated",
        activeCycles: normalCycles,
        offlineCharges,
        saltChargeCap,
        offlineHours: offlineSeconds / 3600
      };
    }

    if (isDailyAnchorResource(item) && adjustedTime >= activeSeconds) {
      return { value: 1, mode: "once-daily", activeCycles: normalCycles, offlineCharges: 0, saltChargeCap: 0, offlineHours: Math.max(0, 24 - (activeSeconds / 3600)) };
    }

    return { value: normalCycles, mode: "active-hours", activeCycles: normalCycles, offlineCharges: 0, saltChargeCap: 0, offlineHours: Math.max(0, 24 - (activeSeconds / 3600)) };
  }

  function effectiveToolResources(item, rules) {
    const resources = { ...(item.tool_resources || {}) };
    const overrides = rules?.toolResourceOverrides || {};
    for (const name of overrides.remove || []) {
      delete resources[name];
    }
    for (const [name, qty] of Object.entries(overrides.add || {})) {
      resources[name] = n(qty, 0);
    }
    return resources;
  }

  function baseToolCoinCostFlower(item, config) {
    return config.coinsPerFlower > 0 ? n(item.tool_cost_coins, 0) / config.coinsPerFlower : 0;
  }

  function toolCostBreakdown(item, config, rules, memo = new Map(), stack = new Set()) {
    const coinCost = baseToolCoinCostFlower(item, config);
    const resources = effectiveToolResources(item, rules);
    const ingredients = [];
    let resourceCost = 0;

    for (const [name, qtyRaw] of Object.entries(resources)) {
      const qty = n(qtyRaw, 0);
      const unit = resourceUnitCostFlower(name, config, memo, stack);
      const lineCost = qty * unit.cost;
      resourceCost += lineCost;
      ingredients.push({
        name,
        qty,
        unitCost: unit.cost,
        totalCost: lineCost,
        source: unit.source,
        sourceItem: unit.itemName || name
      });
    }

    const baseTotal = coinCost + resourceCost;
    const finalTotal = baseTotal * rules.toolCostMultiplier;

    return {
      coinCost,
      resourceCost,
      baseTotal,
      finalTotal,
      ingredients
    };
  }

  function productionCostPerUnit(item, config, memo = new Map(), stack = new Set()) {
    const key = normalize(item.id || item.name);
    if (memo.has(key)) return memo.get(key);
    if (stack.has(key)) {
      const fallback = { cost: resourceMarketPrice(item), source: "market-cycle", itemName: item.name, detail: null };
      memo.set(key, fallback);
      return fallback;
    }

    stack.add(key);
    const rules = buildRules(item, config);
    const nodes = defaultNodesFor(item);
    const nodesTotal = Math.max(1, effectiveNodes(nodes));
    const yieldBeforeInsta = (n(item.base_yield_per_node, 1) * rules.yieldMultiplier) + n(item.native_yield_add, 0) + tierYieldBonus(nodes) + rules.yieldAdd - rules.yieldSubtract;
    const yieldPerNode = Math.max(0, yieldBeforeInsta * rules.yieldInstaMultiplier);
    const harvestPerCycle = Math.max(0, yieldPerNode * nodesTotal);
    const toolUsesPerCycle = Math.max(0, nodesTotal * rules.toolUseMultiplier);
    const breakdown = toolCostBreakdown(item, config, rules, memo, stack);
    const toolCostCycleFlower = breakdown.finalTotal * toolUsesPerCycle;
    const cost = harvestPerCycle > 0 ? toolCostCycleFlower / harvestPerCycle : resourceMarketPrice(item);
    const result = {
      cost,
      source: "own",
      itemName: item.name,
      detail: {
        yieldPerNode,
        harvestPerCycle,
        toolUsesPerCycle,
        toolCostCycleFlower,
        unitToolCostFlower: breakdown.finalTotal
      }
    };
    memo.set(key, result);
    stack.delete(key);
    return result;
  }

  function resourceUnitCostFlower(resourceName, config, memo = new Map(), stack = new Set()) {
    const mineralItem = itemByName(resourceName);
    if (!mineralItem) {
      return {
        cost: priceFlower(resourceName, 0),
        source: "market-only",
        itemName: resourceName
      };
    }

    if (isBoughtFromMarket(resourceName, config)) {
      return {
        cost: resourceMarketPrice(mineralItem),
        source: "market",
        itemName: mineralItem.name
      };
    }

    return productionCostPerUnit(mineralItem, config, memo, stack);
  }

  function calculate(item, config) {
    const nodes = defaultNodesFor(item);
    const rules = buildRules(item, config);
    const nodesTotal = effectiveNodes(nodes);
    const adjustedTime = Math.max(1, (n(item.base_time_seconds, 0) * rules.timeMultiplier) - rules.timeSubtract);
    const yieldBeforeInsta = (n(item.base_yield_per_node, 1) * rules.yieldMultiplier) + n(item.native_yield_add, 0) + tierYieldBonus(nodes) + rules.yieldAdd - rules.yieldSubtract;
    const yieldPerNode = Math.max(0, yieldBeforeInsta * rules.yieldInstaMultiplier);
    const harvestPerCycle = yieldPerNode * nodesTotal;
    const toolUsesPerCycle = Math.max(0, nodesTotal * rules.toolUseMultiplier);
    const toolStock = Math.max(0, Math.ceil((n(item.tool_stock, 0) * rules.toolStockMultiplier) + rules.toolStockAdd));
    const costMemo = new Map();
    const toolBreakdown = toolCostBreakdown(item, config, rules, costMemo, new Set([normalize(item.id || item.name)]));
    const baseToolCoinCostFlower = toolBreakdown.coinCost;
    const baseToolResourceCostFlower = toolBreakdown.resourceCost;
    const baseToolCostFlower = toolBreakdown.baseTotal;
    const unitToolCostFlower = toolBreakdown.finalTotal;
    const toolCostCycleFlower = unitToolCostFlower * toolUsesPerCycle;
    const marketPrice = resourceMarketPrice(item);
    const marketGrossCycleFlower = marketPrice * harvestPerCycle;
    const marketAfterFeeCycleFlower = marketGrossCycleFlower * tradeMultiplier(config);
    const netCycleFlower = marketAfterFeeCycleFlower - toolCostCycleFlower;
    const activeSeconds = Math.max(0, config.activeHoursPerDay * 3600);
    const cyclesInfo = cyclesPerDayFor(item, activeSeconds, adjustedTime, rules);
    const cyclesPerDay = cyclesInfo.value;
    const grossDayFlower = netCycleFlower * cyclesPerDay;
    const toolUsesDay = toolUsesPerCycle * cyclesPerDay;
    const resourcesDay = harvestPerCycle * cyclesPerDay;
    const restocksDay = toolStock > 0 ? toolUsesDay / toolStock : 0;
    const gemsDay = restocksDay * config.gemsPerRestock;
    const restockCostFlower = config.includeRestock ? gemsDay * gemCostFlower(config) : 0;
    const netDayFlower = grossDayFlower - restockCostFlower;

    return {
      nodes,
      nodesTotal,
      adjustedTime,
      yieldPerNode,
      harvestPerCycle,
      marketPrice,
      marketGrossCycleFlower,
      marketAfterFeeCycleFlower,
      baseToolCoinCostFlower,
      baseToolResourceCostFlower,
      baseToolCostFlower,
      unitToolCostFlower,
      effectiveToolResources: effectiveToolResources(item, rules),
      toolCostBreakdown: toolBreakdown,
      toolCostCycleFlower,
      toolUsesPerCycle,
      toolStock,
      netCycleFlower,
      activeHoursPerDay: config.activeHoursPerDay,
      cyclesPerDay,
      cycleMode: cyclesInfo.mode,
      activeCycles: cyclesInfo.activeCycles || 0,
      offlineCharges: cyclesInfo.offlineCharges || 0,
      saltChargeCap: cyclesInfo.saltChargeCap || 0,
      offlineHours: cyclesInfo.offlineHours || Math.max(0, 24 - config.activeHoursPerDay),
      resourcesDay,
      toolUsesDay,
      restocksDay,
      gemsDay,
      restockCostFlower,
      grossDayFlower,
      netDayFlower,
      rules
    };
  }

  function saveNodeInput(itemId, tier, value) {
    if (!window.SFLBuildState) return;
    const item = (groups.minerals || []).find((entry) => entry.id === itemId);
    if (item && !allowedNodeTiers(item).has(String(tier).toLowerCase())) return;
    const config = currentConfig();
    const mineralNodes = { ...(config.mineralNodes || {}) };
    mineralNodes[itemId] = { ...(mineralNodes[itemId] || { t1: 0, t2: 0, t3: 0 }), [tier]: Math.max(0, Math.round(n(value, 0))) };
    window.SFLBuildState.setConfig({ mineralNodes });
  }

  function matches(item, term) {
    if (!term) return true;
    return [item.name, item.section, item.tool, ...Object.keys(item.tool_resources || {})]
      .join(" ")
      .toLowerCase()
      .includes(term);
  }

  function persistMineralUnitCosts(config) {
    try {
      const memo = new Map();
      const resources = {};
      for (const item of allMineralItems()) {
        const unit = productionCostPerUnit(item, config, memo, new Set());
        const id = normalize(item.id || item.name);
        resources[id] = {
          name: item.name,
          cost: unit.cost,
          source: unit.source,
          unit: "FLOWER",
          updatedAt: new Date().toISOString()
        };
      }
      window.localStorage?.setItem(MINERAL_COST_CACHE_KEY, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        resources
      }));
    } catch (error) {
      console.warn("No se pudieron guardar los costos escalonados de minerales", error);
    }
  }

  function renderSummary(allResults) {
    const totalFlower = allResults.reduce((sum, row) => sum + row.result.netDayFlower, 0);
    const totalGems = allResults.reduce((sum, row) => sum + row.result.gemsDay, 0);
    const best = [...allResults].sort((a, b) => b.result.netDayFlower - a.result.netDayFlower)[0];
    summary.flower.textContent = `${formatSmart(totalFlower, 3)} FLOWER`;
    summary.gems.textContent = formatSmart(totalGems, 2);
    summary.best.textContent = best ? best.item.name : "—";
  }


  function renderMarketToggles(config) {
    if (!marketTogglePanel) return;
    const marketIds = new Set(["wood", "stone", "iron", "gold", "crimstone"]);
    const items = allMineralItems().filter((item) => marketIds.has(normalize(item.id || item.name)));
    const buttons = items.map((item) => {
      const image = item.image ? window.MINERAL_ASSET_BASE + item.image : window.MINERAL_ASSET_BASE + "minerals/placeholder.svg";
      const bought = isBoughtFromMarket(item.name, config);
      const title = bought
        ? `${item.name}: usando precio de mercado`
        : `${item.name}: usando costo propio escalonado`;
      return `<button class="market-resource-toggle ${bought ? "is-market" : "is-own"}" type="button" data-market-resource="${escapeHtml(item.id)}" title="${escapeHtml(title)}" aria-pressed="${bought ? "true" : "false"}">
        <img src="${escapeHtml(image)}" alt="" loading="lazy"><span>${escapeHtml(item.name)}</span>
      </button>`;
    }).join("");

    marketTogglePanel.innerHTML = `
      <div class="market-toggle-label">Comprado en market:</div>
      <div class="market-toggle-buttons">${buttons}</div>
      <button class="button-secondary market-clear" id="clearMineralMarketToggles" type="button">Usar recursos propios</button>`;
  }

  function groupRows(items) {
    return [{ title: "Recursos y minerales", rows: items }];
  }

  function boostLinesHtml(lines) {
    return (lines || []).map((line) => `
      <li class="boost-line boost-source-${escapeHtml(line.source || "other")}">
        <span><b>${escapeHtml(line.name)}</b> <em>${escapeHtml(line.sourceLabel || "boost")}</em></span>
        <strong>${escapeHtml(line.label || "")}</strong>
      </li>`).join("");
  }

  function resourceCostText(resources) {
    const parts = Object.entries(resources || {}).map(([name, qty]) => `${formatSmart(qty, 2)} ${name}`);
    return parts.length ? parts.join(" + ") : "sin recursos extra";
  }

  function formulaDetails(item, result, config) {
    const tradePct = formatSmart(tradeMultiplier(config) * 100, 1);
    const boostLines = boostLinesHtml(result.rules.boostLines);
    const ingredientRows = (result.toolCostBreakdown?.ingredients || []).map((ingredient) => {
      const sourceText = ingredient.source === "own" ? "costo propio" : ingredient.source === "market" ? "market" : ingredient.source === "market-only" ? "market" : "market";
      return `<li><span>${escapeHtml(ingredient.name)} <em class="cost-source-label">${escapeHtml(sourceText)}</em></span><strong>${formatSmart(ingredient.qty, 2)} × ${formatSmart(ingredient.unitCost, 6)} FLOWER = ${formatSmart(ingredient.totalCost, 6)} FLOWER</strong></li>`;
    }).join("");
    const cycleModeText = result.cycleMode === "salt-accumulated"
      ? `<p>${escapeHtml(item.name)} se calcula con cargas acumuladas: mientras estás offline (${formatSmart(result.offlineHours, 0)} h) puede guardar hasta <strong>${formatSmart(result.saltChargeCap, 0)} carga(s)</strong> por nodo. En este caso despiertas con <strong>${formatSmart(result.offlineCharges, 2)} carga(s)</strong> listas y durante tus ${formatSmart(result.activeHoursPerDay, 0)} h activas generas <strong>${formatSmart(result.activeCycles, 2)} carga(s)</strong> más.</p>`
      : result.cycleMode === "once-daily"
        ? `<p>${escapeHtml(item.name)} tarda <strong>${escapeHtml(formatTime(result.adjustedTime))}</strong>. Aunque tus horas activas sean ${formatSmart(result.activeHoursPerDay, 0)} h, para Gold, Crimstone y Oil se cuenta <strong>1 ciclo completo al día</strong> cuando puedes recogerlo al día siguiente.</p>`
        : result.cycleMode === "inactive"
          ? `<p>No hay horas activas configuradas, por eso no se calculan ciclos diarios.</p>`
          : `<p>${escapeHtml(item.name)} tarda <strong>${escapeHtml(formatTime(result.adjustedTime))}</strong>. En <strong>${formatSmart(result.activeHoursPerDay, 0)} horas</strong> caben <strong>${formatSmart(result.cyclesPerDay, 2)} ciclos</strong>.</p>`;

    return `
      <div class="formula-explainer">
        <div class="formula-explainer-header">
          <div>
            <span class="formula-kicker">Explicación del cálculo</span>
            <h4>${escapeHtml(item.name)}</h4>
          </div>
          <strong class="formula-final ${result.netDayFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.netDayFlower, 4)} FLOWER/día</strong>
        </div>

        <section class="formula-step">
          <h5>1. Tu configuración</h5>
          <ul class="formula-facts">
            <li><span>Nodos configurados</span><strong>${allowedNodeTiers(item).size === 1 ? `T1: ${formatSmart(result.nodes.t1, 0)}` : `${formatSmart(result.nodes.t1, 0)} T1 / ${formatSmart(result.nodes.t2, 0)} T2 / ${formatSmart(result.nodes.t3, 0)} T3`}</strong></li>
            ${allowedNodeTiers(item).size === 1 ? `<li><span>Tipo de nodo</span><strong>${escapeHtml(item.name)} solo usa T1</strong></li>` : ""}
            <li><span>Nodos efectivos</span><strong>${formatSmart(result.nodesTotal, 2)}</strong></li>
            <li><span>Horas activas al día</span><strong>${formatSmart(result.activeHoursPerDay, 0)} h</strong></li>
            ${result.cycleMode === "salt-accumulated" ? `<li><span>Horas offline</span><strong>${formatSmart(result.offlineHours, 0)} h</strong></li><li><span>Cap de cargas Salt</span><strong>${formatSmart(result.saltChargeCap, 0)} carga(s)</strong></li>` : ""}
            <li><span>Tiempo de recuperación</span><strong>${escapeHtml(formatTime(result.adjustedTime))}</strong></li>
            <li><span>Precio market</span><strong>${formatSmart(result.marketPrice, 8)} FLOWER</strong></li>
            <li><span>Fee aplicado</span><strong>recibes ${tradePct}%</strong></li>
            <li><span>Herramienta usada</span><strong>${escapeHtml(item.tool)}</strong></li>
            <li><span>1 FLOWER</span><strong>${formatSmart(config.coinsPerFlower, 0)} coins</strong></li>
            <li><span>Costo de recursos</span><strong>escalonado, salvo los marcados como market</strong></li>
          </ul>
        </section>

        <section class="formula-step">
          <h5>2. Por cada ciclo de minería</h5>
          <p>Recolectas <strong>${formatSmart(result.harvestPerCycle, 4)} ${escapeHtml(item.name)}</strong> por ciclo.</p>
          <ul class="formula-facts">
            <li><span>Yield por nodo</span><strong>${formatSmart(result.yieldPerNode, 4)}</strong></li>
            <li><span>Venta antes del fee</span><strong>${formatSmart(result.marketGrossCycleFlower, 6)} FLOWER</strong></li>
            <li><span>Después del fee</span><strong>${formatSmart(result.marketAfterFeeCycleFlower, 6)} FLOWER</strong></li>
            <li><span>Costo herramienta por unidad</span><strong>${formatSmart(result.unitToolCostFlower, 6)} FLOWER</strong></li>
            <li><span>Herramientas usadas</span><strong>${formatSmart(result.toolUsesPerCycle, 2)} ${escapeHtml(item.tool)}</strong></li>
            <li><span>Costo de herramientas</span><strong>${formatSmart(result.toolCostCycleFlower, 6)} FLOWER</strong></li>
            <li><span>Ganancia por ciclo</span><strong>${formatSmart(result.netCycleFlower, 6)} FLOWER</strong></li>
          </ul>
        </section>

        <section class="formula-step">
          <h5>3. En tus horas activas</h5>
          ${cycleModeText}
          <div class="formula-equation">${formatSmart(result.netCycleFlower, 6)} FLOWER por ciclo × ${formatSmart(result.cyclesPerDay, 2)} ciclos = <strong>${formatSmart(result.grossDayFlower, 4)} FLOWER</strong></div>
        </section>

        <section class="formula-step">
          <h5>4. Herramientas y restock</h5>
          <p>Usas <strong>${formatSmart(result.toolUsesPerCycle, 2)} ${escapeHtml(item.tool)}</strong> por ciclo. ${result.cycleMode === "salt-accumulated" ? `Con cargas offline + activas usas <strong>${formatSmart(result.toolUsesDay, 2)} herramientas</strong>.` : `En tus horas activas usas <strong>${formatSmart(result.toolUsesDay, 2)} herramientas</strong>.`}</p>
          <ul class="formula-facts">
            <li><span>Stock disponible</span><strong>${formatSmart(result.toolStock, 2)} ${escapeHtml(item.tool)}</strong></li>
            <li><span>Restocks necesarios</span><strong>${formatSmart(result.restocksDay, 2)} al día</strong></li>
            <li><span>Gemas por restock</span><strong>${formatSmart(config.gemsPerRestock, 0)} gems</strong></li>
            <li><span>Gemas necesarias</span><strong>${formatSmart(result.gemsDay, 2)} gems</strong></li>
            <li><span>Costo descontado</span><strong>${formatSmart(result.restockCostFlower, 4)} FLOWER</strong></li>
          </ul>
        </section>

        <section class="formula-step">
          <h5>5. Costo de la herramienta</h5>
          <p>${escapeHtml(item.tool)} cuesta <strong>${formatSmart(item.tool_cost_coins, 2)} coins base</strong>${Object.keys(result.effectiveToolResources || {}).length ? ` + ${escapeHtml(resourceCostText(result.effectiveToolResources))}` : ""}. Los recursos se valoran con costo propio escalonado, excepto cuando los marques como comprados en market. Si tienes descuentos de costo, se aplican al final.</p>
          <ul class="formula-facts">
            <li><span>Coins convertidos</span><strong>${formatSmart(item.tool_cost_coins, 2)} / ${formatSmart(config.coinsPerFlower, 0)} = ${formatSmart(result.baseToolCoinCostFlower, 6)} FLOWER</strong></li>
            ${ingredientRows || `<li><span>Recursos extra</span><strong>No aplica</strong></li>`}
            <li><span>Costo base total</span><strong>${formatSmart(result.baseToolCostFlower, 6)} FLOWER</strong></li>
            <li><span>Multiplicador de costo</span><strong>${formatPercentFromMultiplier(result.rules.toolCostMultiplier)}</strong></li>
            <li><span>Costo final por herramienta</span><strong>${formatSmart(result.unitToolCostFlower, 6)} FLOWER</strong></li>
          </ul>
        </section>

        <section class="formula-step">
          <h5>6. Boosts activos</h5>
          ${boostLines ? `<ul class="boost-list">${boostLines}</ul>` : `<p class="muted-line">Sin boosts activos detectados para este recurso.</p>`}
        </section>

        <section class="formula-step formula-result-step">
          <h5>7. Resultado final</h5>
          <div class="formula-equation">${formatSmart(result.grossDayFlower, 4)} FLOWER - ${formatSmart(result.restockCostFlower, 4)} FLOWER = <strong>${formatSmart(result.netDayFlower, 4)} FLOWER/día</strong></div>
        </section>

        <details class="technical-details">
          <summary>Ver fórmula técnica</summary>
          <ul>
            <li><strong>Nodos efectivos:</strong> T1 + T2×4 + T3×16 = ${formatSmart(result.nodesTotal, 2)}</li>
            <li><strong>Yield por nodo:</strong> base + nativo + tiers + boosts de cantidad promedio - restas = ${formatSmart(result.yieldPerNode, 4)}</li>
            <li><strong>Market:</strong> ${formatSmart(result.marketPrice, 8)} × ${formatSmart(result.harvestPerCycle, 4)} × ${formatSmart(tradeMultiplier(config), 3)} = ${formatSmart(result.marketAfterFeeCycleFlower, 6)}</li>
            <li><strong>Costo herramienta:</strong> ${formatSmart(result.unitToolCostFlower, 6)} × ${formatSmart(result.toolUsesPerCycle, 2)} = ${formatSmart(result.toolCostCycleFlower, 6)}</li>
            <li><strong>Ciclos:</strong> ${result.cycleMode === "salt-accumulated" ? `Salt = cargas activas ${formatSmart(result.activeCycles, 4)} + cargas offline ${formatSmart(result.offlineCharges, 4)} = ${formatSmart(result.cyclesPerDay, 4)}` : result.cycleMode === "once-daily" ? `modo una vez al día para Gold/Crimstone/Oil = ${formatSmart(result.cyclesPerDay, 4)}` : `(${formatSmart(result.activeHoursPerDay, 0)}h × 3600) / ${escapeHtml(formatTime(result.adjustedTime))} = ${formatSmart(result.cyclesPerDay, 4)}`}</li>
          </ul>
        </details>
      </div>`;
  }

  function tableHeaders() {
    return `
      <colgroup>
        <col class="col-crop">
        <col class="col-time">
        <col class="col-tool">
        <col class="col-node">
        <col class="col-node">
        <col class="col-node">
        <col class="col-yield">
        <col class="col-harvest">
        <col class="col-cycle-profit">
        <col class="col-cost-wide">
        <col class="col-restocks">
        <col class="col-gems">
        <col class="col-daily">
        <col class="col-sell">
        <col class="col-formula">
      </colgroup>
      <thead>
        <tr>
          <th class="text-left">Recurso</th>
          <th class="text-center">Tiempo</th>
          <th class="text-left">Herramienta</th>
          <th class="number">T1</th>
          <th class="number">T2</th>
          <th class="number">T3</th>
          <th class="number">Yield/nodo</th>
          <th class="number">Por ciclo</th>
          <th class="number">FLOWER/mina</th>
          <th class="number">Costo herramienta</th>
          <th class="number">Restocks</th>
          <th class="number">Gems</th>
          <th class="number">FLOWER/día</th>
          <th class="text-left">Venta</th>
          <th class="formula-cell"></th>
        </tr>
      </thead>`;
  }

  function renderNodeInput(item, tier, value) {
    return `<input class="node-input" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(value)}" data-mineral-id="${escapeHtml(item.id)}" data-node-tier="${escapeHtml(tier)}" aria-label="${escapeHtml(item.name)} ${tier.toUpperCase()}">`;
  }

  function renderNodeCells(item, result) {
    const tiers = allowedNodeTiers(item);
    if (tiers.size === 1 && tiers.has("t1")) {
      return `<td class="number node-t1-only" colspan="3">${renderNodeInput(item, "t1", result.nodes.t1)}<span>Solo T1</span></td>`;
    }
    return `
      <td class="number">${renderNodeInput(item, "t1", result.nodes.t1)}</td>
      <td class="number">${renderNodeInput(item, "t2", result.nodes.t2)}</td>
      <td class="number">${renderNodeInput(item, "t3", result.nodes.t3)}</td>`;
  }

  function renderRow(item, result) {
    const image = item.image ? window.MINERAL_ASSET_BASE + item.image : window.MINERAL_ASSET_BASE + "minerals/placeholder.svg";
    const toolImage = item.tool_image ? window.MINERAL_ASSET_BASE + item.tool_image : "";
    const isOpen = openFormulaId === item.id;
    const mainRow = `
      <tr class="crop-data-row mineral-data-row">
        <td class="crop-name-cell"><div class="crop-name-wrap"><span class="crop-image-mini"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span><strong>${escapeHtml(item.name)}</strong></div></td>
        <td>${escapeHtml(formatTime(result.adjustedTime))}</td>
        <td class="tool-cell"><div class="crop-name-wrap">${toolImage ? `<span class="tool-image-mini"><img src="${escapeHtml(toolImage)}" alt="" loading="lazy"></span>` : ""}<span>${escapeHtml(item.tool)}</span></div></td>
        ${renderNodeCells(item, result)}
        <td class="number">${formatSmart(result.yieldPerNode, 4)}</td>
        <td class="number">${formatSmart(result.harvestPerCycle, 4)}</td>
        <td class="number ${result.netCycleFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.netCycleFlower, 4)}</td>
        <td class="number">${formatSmart(result.unitToolCostFlower, 5)}</td>
        <td class="number">${formatSmart(result.restocksDay, 2)}</td>
        <td class="number">${formatSmart(result.gemsDay, 2)}</td>
        <td class="number ${result.netDayFlower >= 0 ? "positive" : "negative"}">${formatSmart(result.netDayFlower, 3)}</td>
        <td>FLOWER</td>
        <td class="formula-cell"><button class="formula-toggle" type="button" data-formula-id="${escapeHtml(item.id)}" aria-expanded="${isOpen ? "true" : "false"}">!</button></td>
      </tr>`;
    const formulaRow = isOpen ? `<tr class="crop-formula-row"><td colspan="15">${formulaDetails(item, result, currentConfig())}</td></tr>` : "";
    return mainRow + formulaRow;
  }

  function renderSection(section) {
    const rows = section.rows.map(({ item, result }) => renderRow(item, result)).join("");
    return `
      <section class="crop-section-table mineral-section-table">
        <h3>${escapeHtml(section.title || "Minerales")}</h3>
        <div class="table-wrapper crop-table-shell mineral-table-shell">
          <table class="crop-table mineral-table">
            ${tableHeaders()}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  function render() {
    const config = currentConfig();
    const term = search ? search.value.trim().toLowerCase() : "";
    renderMarketToggles(config);
    const sourceItems = groups.minerals || [];
    const allResults = sourceItems.map((item) => ({ item, result: calculate(item, config) }));
    renderSummary(allResults);
    persistMineralUnitCosts(config);

    const items = sourceItems
      .filter((item) => matches(item, term))
      .map((item) => ({ item, result: calculate(item, config) }))
      .sort((a, b) => n(a.item.sort_order, 999) - n(b.item.sort_order, 999));

    tableWrapper.innerHTML = groupRows(items).map(renderSection).join("");
  }

  if (search) search.addEventListener("input", render);

  tableWrapper.addEventListener("change", (event) => {
    const input = event.target.closest("[data-mineral-id][data-node-tier]");
    if (!input) return;
    saveNodeInput(input.dataset.mineralId, input.dataset.nodeTier, input.value);
    render();
  });

  tableWrapper.addEventListener("click", (event) => {
    const button = event.target.closest("[data-formula-id]");
    if (!button) return;
    const id = button.dataset.formulaId;
    openFormulaId = openFormulaId === id ? null : id;
    render();
  });

  if (marketTogglePanel) {
    marketTogglePanel.addEventListener("click", (event) => {
      const marketButton = event.target.closest("[data-market-resource]");
      if (marketButton) {
        const id = marketButton.dataset.marketResource;
        const config = currentConfig();
        saveBoughtFromMarket(id, !Boolean(config.mineralBoughtMarket?.[id]));
        render();
        return;
      }
      if (event.target.closest("#clearMineralMarketToggles")) {
        clearBoughtFromMarket();
        render();
      }
    });
  }

  resetInputs.addEventListener("click", () => {
    const defaults = window.SFLBuildState?.defaults?.() || {};
    window.SFLBuildState?.setConfig({ mineralNodes: defaults.mineralNodes || {} });
    render();
  });

  window.addEventListener("sfl-build-state-change", render);
  render();
})();
