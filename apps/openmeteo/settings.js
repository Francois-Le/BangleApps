(function(back) {
  const FILE = "openmeteo.json";
  let st = require("Storage").readJSON(FILE, 1) || {};
  function save() { require("Storage").writeJSON(FILE, st); }
  function ago(t) {
    if (!t) return "never";
    let m = Math.round((Date.now()-t)/60000);
    return m<60 ? m+" min ago" : Math.round(m/60)+" h ago";
  }
  const REFRESH = [15, 30, 60, 120];
  function menu() {
    let loc = require("Storage").readJSON("mylocation.json", 1);
    E.showMenu({
      "": {title:"Open-Meteo"},
      "< Back": back,
      "Enabled": {value: st.enabled!==false, onchange: v => { st.enabled = v; save(); }},
      "Refresh every": {
        value: Math.max(0, REFRESH.indexOf(st.refresh||30)), min:0, max:REFRESH.length-1,
        format: v => REFRESH[v]+" min",
        onchange: v => { st.refresh = REFRESH[v]; save(); }
      },
      "Location": {value: loc && loc.lat!==undefined ? (loc.location || loc.lat.toFixed(2)+","+loc.lon.toFixed(2)) : "not set"},
      "Updated": {value: ago(st.updated)},
      "Last error": {value: st.error || "none"},
      "Refresh now": () => {
        E.showMessage("Fetching...", "Open-Meteo");
        require("openmeteo").pull(err => {
          st = require("Storage").readJSON(FILE, 1) || {};
          E.showAlert(err ? ""+err : "Weather updated", "Open-Meteo").then(menu);
        });
      }
    });
  }
  menu();
})
