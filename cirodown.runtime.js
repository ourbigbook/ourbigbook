// https://cirosantilli.com/cirodown#insane-link-parsing-rules#build-sass

// tablesort
window.onload = function() {
  const tables = document.getElementsByTagName('table');
  for(let i = 0; i < tables.length; ++i) {
    const table = tables[i];
    new Tablesort(table);
  }
}
