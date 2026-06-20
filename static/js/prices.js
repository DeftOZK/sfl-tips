(() => {
  const input = document.getElementById("priceSearch");
  const table = document.getElementById("priceTable");
  const empty = document.getElementById("priceEmptyState");
  if (!input || !table) return;

  const rows = [...table.querySelectorAll("tbody tr[data-search]")];

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function filter() {
    const term = normalize(input.value);
    let visible = 0;
    rows.forEach((row) => {
      const match = !term || normalize(row.dataset.search).includes(term);
      row.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  input.addEventListener("input", filter);
  filter();
})();
