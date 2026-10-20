(function(back) {
  const FILE = "retromessagegui.json";
  const settings = Object.assign({mergeGap:30}, require("Storage").readJSON(FILE, true) || {});
  const gaps = [0, 10, 30, 60, 120, 300];
  E.showMenu({
    "" : { "title" : "Retro Messages" },
    "< Back" : back,
    /*LANG*/"Merge window" : {
      value : Math.max(0, gaps.indexOf(settings.mergeGap)),
      min : 0, max : gaps.length-1,
      format : v => gaps[v] ? (gaps[v]<60 ? gaps[v]+"s" : gaps[v]/60+"m") : /*LANG*/"Off",
      onchange : v => {
        settings.mergeGap = gaps[v];
        require("Storage").writeJSON(FILE, settings);
      }
    }
  });
})
