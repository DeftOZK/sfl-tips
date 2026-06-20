(() => {
  const KEY = "sfl_build_state_v1";

  const DEFAULT_CONFIG = () => ({
    islandType: "Desert",
    season: "Autumn",
    vip: true,
    gemPack: "1350-9.09",
    coinsPerFlower: 2500,
    activeHoursPerDay: 12,
    flowerUsd: 0.071,
    includeRestock: true,
    gemsPerRestock: 20,
    plots: {
      crops: 57,
      fruits: 14,
      greenhouse: 4
    },
    mineralNodes: {
      wood: { t1: 1, t2: 0, t3: 0 },
      stone: { t1: 1, t2: 0, t3: 0 },
      iron: { t1: 1, t2: 0, t3: 0 },
      gold: { t1: 1, t2: 0, t3: 0 },
      crimstone: { t1: 1, t2: 0, t3: 0 },
      oil: { t1: 1, t2: 0, t3: 0 },
      salt: { t1: 1, t2: 0, t3: 0 }
    }
  });

  const EMPTY = () => ({
    version: 1,
    skills: [],
    assets: {
      nfts: [],
      wearables: [],
      blacksmith: [],
      shrines: []
    },
    config: DEFAULT_CONFIG(),
    updatedAt: null
  });

  function mergeConfig(config = {}) {
    const defaults = DEFAULT_CONFIG();
    return {
      ...defaults,
      ...config,
      plots: { ...defaults.plots, ...(config.plots || {}) },
      mineralNodes: { ...defaults.mineralNodes, ...(config.mineralNodes || {}) },
      vip: config.vip === undefined ? defaults.vip : Boolean(config.vip),
      coinsPerFlower: Number(config.coinsPerFlower || defaults.coinsPerFlower),
      flowerUsd: Number(config.flowerUsd || defaults.flowerUsd),
      activeHoursPerDay: Math.min(24, Math.max(0, Math.round(Number(config.activeHoursPerDay ?? defaults.activeHoursPerDay)))),
      gemsPerRestock: [5, 10, 15, 20].includes(Number(config.gemsPerRestock)) ? Number(config.gemsPerRestock) : defaults.gemsPerRestock,
      includeRestock: config.includeRestock === undefined ? defaults.includeRestock : Boolean(config.includeRestock)
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return EMPTY();
      const parsed = JSON.parse(raw);
      const empty = EMPTY();
      const assets = { ...empty.assets, ...(parsed.assets || {}) };
      return {
        ...empty,
        ...parsed,
        assets: {
          nfts: assets.nfts || [],
          wearables: assets.wearables || [],
          blacksmith: assets.blacksmith || [],
          shrines: assets.shrines || []
        },
        config: mergeConfig(parsed.config || {})
      };
    } catch (_error) {
      return EMPTY();
    }
  }

  function save(state) {
    const next = { ...state, config: mergeConfig(state.config || {}), updatedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("sfl-build-state-change", { detail: next }));
    return next;
  }

  function byId(items) {
    return new Map((items || []).map((item) => [item.id, item]));
  }

  window.SFLBuildState = {
    key: KEY,
    defaults: DEFAULT_CONFIG,
    load,
    save,
    clear() {
      const state = EMPTY();
      return save(state);
    },
    setConfig(config) {
      const state = load();
      state.config = mergeConfig({ ...(state.config || {}), ...(config || {}) });
      return save(state);
    },
    getConfig() {
      return load().config;
    },
    setPlots(group, value) {
      const state = load();
      state.config = mergeConfig(state.config || {});
      state.config.plots[group] = Number(value) || 0;
      return save(state);
    },
    setSkills(skills) {
      const state = load();
      state.skills = Array.isArray(skills) ? skills : [];
      return save(state);
    },
    getSkills() {
      return load().skills || [];
    },
    getSkillIds() {
      return new Set(this.getSkills().map((skill) => skill.id));
    },
    setAsset(group, item, selected) {
      const state = load();
      if (!state.assets[group]) state.assets[group] = [];
      const map = byId(state.assets[group]);
      if (selected) map.set(item.id, item);
      else map.delete(item.id);
      state.assets[group] = [...map.values()];
      return save(state);
    },
    getAssets(group) {
      return load().assets[group] || [];
    },
    getAllAssets() {
      const state = load();
      return Object.values(state.assets || {}).flat();
    },
    getAssetIds(group) {
      return new Set(this.getAssets(group).map((item) => item.id));
    },
    clearAssets() {
      const state = load();
      state.assets = EMPTY().assets;
      return save(state);
    }
  };
})();
