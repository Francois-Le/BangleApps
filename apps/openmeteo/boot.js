{
  let st = require("Storage").readJSON("openmeteo.json", 1) || {};
  if (st.enabled !== false) {
    let t, busy = false;
    let every = (st.refresh || 30) * 60000;
    let check = function() {
      if (t) clearTimeout(t);
      t = undefined;
      let s = require("Storage").readJSON("openmeteo.json", 1) || {};
      let wait = (s.updated || 0) + every - Date.now();
      if (wait <= 0 && !busy && NRF.getSecurityStatus().connected) {
        busy = true;
        require("openmeteo").pull(function(err) {
          busy = false;
          // on error, try again in 5 minutes
          t = setTimeout(check, err ? 300000 : every);
        });
      } else {
        t = setTimeout(check, Math.max(wait, 60000));
      }
    };
    setTimeout(check, 5000);
    NRF.on("connect", function(){ setTimeout(check, 3000); });
  }
}
