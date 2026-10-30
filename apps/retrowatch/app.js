{
// Retro Watch - clock face with a seconds dial, messages and music controls
require("Font5x9Numeric7Seg").add(Graphics);
require("Font8x12").add(Graphics);
require("Font8x16").add(Graphics);



// ---- Layout ----
const DIAL = {x:0, y:19, s:75};          // seconds dial, 75x75 so it has an exact centre pixel
const DCX = DIAL.x+37, DCY = DIAL.y+37;  // dial centre
const TIME = {x:76, y:46, x2:175, y2:93}; // time box (1px black gap to the dial and to the info bar)
const ARTIST_X = 78, ARTIST_W = 175-ARTIST_X;

let isMusicActive = false;
let isMusicPlaying = false;
let musicTrack = "";
let musicArtist = "";
let drawTimeout;
let musicIdleTimeout;


/** Cut text to fit width w, ending with "..." when it doesn't fit (uses the current font) */
let ellipsis = function(t, w) {
  if (g.stringWidth(t) <= w) return t;
  while (t.length && g.stringWidth(t+"...") > w) t = t.slice(0,-1);
  return t.trim()+"...";
};


// The dial (frame + 60 ticks, 75x75 1 bpp) and the 60 seconds-pointer images are
// pre-rendered by tools/make-dial.js into retrowatch.dial.bin, so nothing is computed at startup.
// Format: dial image, then per second [x, y, y2 (int8, from the dial centre), len, image].
let dialBin = require("Storage").read("retrowatch.dial.bin");
let dialImg = dialBin.substr(0, 3+Math.ceil(DIAL.s*DIAL.s/8));


let currentIcon = function() {
  if (!NRF.getSecurityStatus().connected) return "bt";
  if (Bangle.isLocked()) return "lock";
  if (isMusicActive) return isMusicPlaying ? "play" : "pause";
};

// ---- Status plate in the centre of the dial: octagon, small symbol, label ----
const STATUS = {
  play:  {col:"#0ff", lab:"PLAY"},
  pause: {col:"#0ff", lab:"HOLD"},
  lock:  {col:"#ff0", lab:"LOCK"},
  bt:    {col:"#f00", lab:"LINK"}
};
let drawStatus = function(st) {
  var cx = DCX, cy = DCY, s = 15, k = 5, c = STATUS[st].col;
  var oct = function(d){ return [cx-s+k+d,cy-s+d, cx+s-k-d,cy-s+d, cx+s-d,cy-s+k+d, cx+s-d,cy+s-k-d,
                                 cx+s-k-d,cy+s-d, cx-s+k+d,cy+s-d, cx-s+d,cy+s-k-d, cx-s+d,cy-s+k+d]; };
  g.setColor(c).fillPoly(oct(0)).setColor(0,0,0).fillPoly(oct(1));
  var y = cy-3;
  g.setColor(c);
  if (st == "play") g.fillPoly([cx-3,y-5, cx-3,y+5, cx+5,y]);
  else if (st == "pause") g.fillRect(cx-4,y-5,cx-2,y+5).fillRect(cx+2,y-5,cx+4,y+5);
  else if (st == "lock") {
    g.fillCircle(cx, y-2, 4).setColor(0,0,0).fillCircle(cx, y-2, 2).fillRect(cx-4, y-2, cx+4, y);
    g.setColor(c).fillRect(cx-4, y, cx+4, y+5).setColor(0,0,0).fillRect(cx, y+2, cx, y+3);
  } else if (st == "bt") {
    // bluetooth rune (1px lines), crossed out by a slash with a black edge
    g.drawLine(cx,y-5, cx,y+5).drawLine(cx,y-5, cx+3,y-2).drawLine(cx+3,y-2, cx-3,y+3)
     .drawLine(cx,y+5, cx+3,y+2).drawLine(cx+3,y+2, cx-3,y-3);
    g.setColor(0,0,0).drawLine(cx-6,y+5, cx+5,y-6).drawLine(cx-5,y+6, cx+6,y-5);
    g.setColor(c).drawLine(cx-6,y+6, cx+6,y-6);
  }
  g.setColor(1,1,0).setBgColor(0,0,0).setFont("4x6").setFontAlign(0,-1).drawString(STATUS[st].lab, cx+1, cy+6).setFontAlign(-1,-1);
};

let POINTER = [];
(function() {
  var o = dialImg.length;
  for (var sec=0; sec<60; sec++) {
    var i8 = function(v){ return v>127 ? v-256 : v; };
    var len = dialBin.charCodeAt(o+3);
    POINTER.push({img:dialBin.substr(o+4, len), x:DCX+i8(dialBin.charCodeAt(o)),
                  y:DCY+i8(dialBin.charCodeAt(o+1)), y2:DCY+i8(dialBin.charCodeAt(o+2))});
    o += 4+len;
  }
})();

let lastIcon, lastSec = -1;
/** Draw the dial. With partial=true (the per-second update) and no icon change, only the
 rows of the old and new pointer are redrawn, so less of the screen is sent to the LCD. */
let drawDial = function(sec, partial) {
  var icon = currentIcon();
  g.reset().setColor(0,1,1).setBgColor(0,0,0);
  if (partial && icon === lastIcon && lastSec >= 0) {
    var a = POINTER[lastSec], b = POINTER[sec];
    g.setClipRect(DIAL.x, Math.min(a.y, b.y), DIAL.x+DIAL.s-1, Math.max(a.y2, b.y2));
  }
  g.drawImage(dialImg, DIAL.x, DIAL.y);
  // pointer: a long bold yellow tick on the current second
  var pt = POINTER[sec];
  g.setColor(1,1,0).drawImage(pt.img, pt.x, pt.y);
  if (icon) drawStatus(icon);
  g.setClipRect(0, 0, g.getWidth()-1, g.getHeight()-1);
  lastIcon = icon; lastSec = sec;
};

// ---- Time panel and info bar, "mission clock" style (redrawn once a minute) ----
let isoWeek = function(d) {
  var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()+3-((d.getDay()+6)%7));
  var f = new Date(t.getFullYear(), 0, 4);
  return 1+Math.round(((t.getTime()-f.getTime())/86400000-3+((f.getDay()+6)%7))/7);
};
let dayOfYear = function(d) {
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()-new Date(d.getFullYear(), 0, 1).getTime())/86400000)+1;
};
let frame = function(x, y, x2, y2, r) {   // cyan rounded frame, black inside
  r = r || 6;
  g.setColor(0,1,1).fillRect({x:x, y:y, x2:x2, y2:y2, r:r});
  g.setColor(0,0,0).fillRect({x:x+1, y:y+1, x2:x2-1, y2:y2-1, r:r-1});
};
let dotsH = function(x1, x2, y) { for (var x=x1; x<=x2; x+=2) g.setPixel(x, y); };
let dotsV = function(x, y1, y2) { for (var y=y1; y<=y2; y+=2) g.setPixel(x, y); };

let drawTime = function(d) {
  var l = require("locale"), h = d.getHours(), m = d.getMinutes();
  var time = ("0"+h).substr(-2) + ":" + ("0"+m).substr(-2);   // leading zero keeps the time centred
  g.reset().setBgColor(0,0,0);
  // time panel: label, week number and day of year, time, day progress bar
  frame(TIME.x, TIME.y, TIME.x2, TIME.y2);
  g.setFont("4x6").setFontAlign(-1,-1).setColor(1,1,0).drawString("LOCAL", 81, 49);
  g.setColor(0,1,1).setFontAlign(1,-1).drawString("WK "+isoWeek(d)+"  DAY "+dayOfYear(d), 171, 49);
  g.setFont("5x9Numeric7Seg",3).setFontAlign(0,-1).drawString(time, 126, 57);
  var ex = 80+Math.round((h*60+m)/1440*91);
  dotsH(80, 171, 88);
  g.fillRect(80, 87, ex, 89).setColor(1,1,0).fillRect(ex-1, 86, ex+1, 90);
  // info bar: day | date | month | battery, labels sit in the top border (y=95..119)
  var l2 = require("locale");
  var cells = [
    [0,   "DAY",  l2.dow(d,1).toUpperCase().substr(0,3)],
    [42,  "DATE", ""+d.getDate()],
    [78,  "MON",  l2.month(d,1).toUpperCase().substr(0,3)],
    [120, "PWR",  E.getBattery()+"%"]
  ];
  g.reset().setBgColor(0,0,0).clearRect(0, 95, 175, 119);
  frame(0, 97, 175, 119);
  g.setColor(0,1,1);
  dotsV(41, 100, 116); dotsV(77, 100, 116); dotsV(119, 100, 116);
  cells.forEach(function(c) {
    g.setFont("4x6").setFontAlign(-1,-1);
    var w = g.stringWidth(c[1]);
    g.setColor(0,0,0).fillRect(c[0]+5, 95, c[0]+7+w, 100);   // gap in the border for the label
    g.setColor(1,1,0).drawString(c[1], c[0]+7, 95);
    g.setColor(0,1,1).setFont("8x16").drawString(c[2], c[0]+6, 101);
  });
  // small battery icon, filled to the battery level (1px gap between fill and outline)
  var bat = E.getBattery(), fh = Math.round(11*bat/100);
  g.setColor(0,1,1).drawRect(164, 102, 170, 116).fillRect(166, 100, 168, 101);
  if (fh > 0) g.fillRect(166, 114-fh+1, 168, 114);
};

let drawBackground = function() {
  g.reset().setBgColor(0,0,0).clear();
};

// ---- Weather panel (shown in the music area when no music is playing) ----
// Data comes from the "weather" app (Gadgetbridge). The rain graph needs
// Weather app settings -> Data type = "forecast".
let weatherLib;
try { weatherLib = require("weather"); } catch (e) {}

// The weather files are read only when new weather arrives (the "update2" event),
// not every 5 minutes; the rain graph start is recomputed from the cached data.
let weatherRaw, weatherRead = false;
let getWeather = function() {
  if (!weatherLib) return;
  if (!weatherRead) {
    weatherRead = true;
    try { weatherRaw = weatherLib.getWeather(true); } catch (e) { weatherRaw = undefined; }
  }
  var w = weatherRaw;
  if (!w || w.temp === undefined) return;
  var r = {
    temp: Math.round(w.v==2 ? w.temp : w.temp-273),   // v1 is in Kelvin
    // weather for the whole day (set by the Open-Meteo app), else the current weather
    daycode: w.daycode!==undefined ? w.daycode : w.code,
    wind: Math.round(w.wind||0), wdir: w.wdir
  };
  if (w.sunrise && w.sunset) { r.rise = w.sunrise*1000; r.set = w.sunset*1000; }
  var hf = w.hourfcast;
  if (hf && hf.rain && hf.time) {               // next 24 h of rain chance, from now
    var now = Date.now()/1000, i0 = 0;
    while (i0 < hf.time.length-1 && hf.time[i0+1] <= now) i0++;
    r.rain = [];
    for (var i=i0; i<hf.rain.length && r.rain.length<24; i++) r.rain.push(hf.rain[i]);
    r.rainStart = hf.time[i0]*1000;
    if (r.rain.length < 2) delete r.rain;
  }
  return r;
};

/** 16x16 icon in the top left corner for an OpenWeatherMap condition code */
let drawWxIcon = function(code) {
  var K="#000", Y="#ff0", W="#fff", C="#0ff";
  function sun(cx, cy, r) {
    g.setColor(Y).fillCircle(cx, cy, r);
    for (var k=0; k<8; k++) { var a=k*Math.PI/4;
      g.drawLine(cx+Math.round(Math.cos(a)*(r+2)), cy+Math.round(Math.sin(a)*(r+2)), cx+Math.round(Math.cos(a)*(r+3)), cy+Math.round(Math.sin(a)*(r+3))); }
  }
  function cloud(ox, oy, col) {   // 14x8 cloud with a black outline, top-left ox,oy
    g.setColor(K).fillCircle(ox+4,oy+4,4).fillCircle(ox+8,oy+3,5).fillCircle(ox+11,oy+5,3).fillRect(ox+1,oy+5,ox+14,oy+9);
    g.setColor(col).fillCircle(ox+4,oy+4,3).fillCircle(ox+8,oy+3,4).fillCircle(ox+11,oy+5,2).fillRect(ox+2,oy+5,ox+13,oy+8);
  }
  function drops(n, len) {        // slanted rain drops under the cloud
    g.setColor(C);
    for (var i=0; i<n; i++) { var dx = 3+i*Math.round(9/(n-1)); g.drawLine(dx+len-1, 11, dx, 10+len); }
  }
  var grp = Math.floor(code/100);
  if (code == 801 || code == 802) { sun(10, 5, 3); cloud(0, 6, W); }                 // partly cloudy
  else if (code == 803 || code == 804) { cloud(2, 1, C); cloud(0, 5, W); }           // cloudy
  else if (grp == 7) { g.setColor(C); [3,6,9,12].forEach(function(r,i){ g.fillRect(1+(i%2)*2, r, 14-((i+1)%2)*2, r); }); } // fog
  else if (grp == 2) { cloud(0, 0, W); g.setColor(Y).fillPoly([8,9, 5,13, 7,13, 6,16, 10,11, 8,11, 9,9]); }               // thunder
  else if (grp == 6) { cloud(0, 0, W); g.setColor(W); [[3,12],[8,14],[12,11],[6,10],[11,15]].forEach(function(p){ g.fillRect(p[0],p[1],p[0]+1,p[1]+1); }); } // snow
  else if (grp == 3) { cloud(0, 0, W); g.setColor(C); [[3,11],[7,13],[11,11],[5,15],[9,15]].forEach(function(p){ g.setPixel(p[0],p[1]); }); } // drizzle
  else if (grp == 5) { cloud(0, 0, W); drops(code>=502 ? 4 : 3, code>=502 ? 5 : 4); } // rain / heavy rain
  else sun(7, 7, 4);                                                                   // clear
};

let hhmm = function(t) { var d = new Date(t); return ("0"+d.getHours()).substr(-2)+":"+("0"+d.getMinutes()).substr(-2); };

let drawWeather = function() {
  var w = getWeather();
  if (!w) return;
  g.reset().setBgColor(0,0,0).setColor(0,1,1).setFontAlign(-1,-1);
  // weather icon for the day + temperature (top left)
  if (w.daycode !== undefined) drawWxIcon(w.daycode);
  g.setColor(0,1,1).setBgColor(0,0,0).setFont("8x16").drawString(w.temp, 18, 1);
  var tw = 18+g.stringWidth(""+w.temp);
  g.drawRect(tw+2, 2, tw+4, 4);
  g.setFont("8x12").drawString("C", tw+6, 3);
  var tempEnd = tw+6+g.stringWidth("C");
  // wind (top right): speed, tiny unit, compass arrow pointing where the wind blows to
  g.setFont("8x16").setFontAlign(1,-1).drawString(w.wind, 147, 1).setFontAlign(-1,-1);
  g.setFont("4x6").drawString("KM", 149, 3).drawString("/H", 149, 10);
  var cx = 167, cy = 8;
  g.drawCircle(cx, cy, 8);
  [0,90,180,270].forEach(function(d){ var a=d*Math.PI/180; g.setPixel(cx+Math.round(Math.sin(a)*6), cy-Math.round(Math.cos(a)*6)); });
  if (w.wdir !== undefined && w.wind > 0) {
    var a = (w.wdir+180)*Math.PI/180, sn = Math.sin(a), cs = -Math.cos(a);
    g.setColor(1,1,0).fillPoly([cx+sn*7,cy+cs*7, cx-sn*2-cs*4,cy-cs*2+sn*4, cx-sn*2+cs*4,cy-cs*2-sn*4])
     .drawLine(cx, cy, cx-sn*6, cy-cs*6);
  }
  // sun track (day: sunrise -> sunset) or night track (sunset -> next sunrise)
  if (w.rise) {
    var x0 = tempEnd+6, x1 = 124, by = 5;   // bar starts right after the temperature
    var now = Date.now(), DAY = 86400000, a, b, night;
    if (now < w.rise) { night = true; a = w.set-DAY; b = w.rise; }         // early morning
    else if (now > w.set) { night = true; a = w.set; b = w.rise+DAY; }     // evening
    else { night = false; a = w.rise; b = w.set; }
    var f = E.clip((now-a)/(b-a), 0, 1), sx = x0+Math.round(f*(x1-x0));
    g.setColor(0,1,1);
    for (var x=x0; x<=x1; x+=3) g.setPixel(x, by);
    g.fillRect(x0, by-1, sx, by+1).fillRect(x0, by-3, x0, by+4).fillRect(x1, by-3, x1, by+4)
     .fillRect((x0+x1)>>1, by-2, (x0+x1)>>1, by+2);
    if (night) {
      // crescent moon: white disc with a black disc cut out of it
      g.setColor(0,0,0).fillCircle(sx, by, 5);
      g.setColor(1,1,1).fillCircle(sx, by, 4);
      g.setColor(0,0,0).fillCircle(sx+2, by-1, 3);
    } else {
      g.setColor(1,1,0).fillCircle(sx, by, 3);
      for (var k=0; k<8; k++) { var r=k*Math.PI/4; g.setPixel(sx+Math.round(Math.cos(r)*5), by+Math.round(Math.sin(r)*5)); }
    }
    g.setColor(0,1,1).setFont("4x6").drawString(hhmm(a), x0, 11)
     .setFontAlign(1,-1).drawString(hhmm(b), x1, 11).setFontAlign(-1,-1);
  }
  // rain chance for the next 24 h: line graph using the whole box, fixed 0..100% scale
  if (w.rain) {
    g.setColor(0,1,1).fillRect({x:76, y:18, x2:175, y2:44, r:5});
    g.setColor(0,0,0).fillRect({x:77, y:19, x2:174, y2:43, r:4});
    var px = function(i){ return 80+i*4; }, py = function(r){ return 41-Math.round(r*20/100); };  // 0% = y41, 100% = y21
    g.setColor(0,1,1);
    for (var y=21; y<=41; y+=10) for (var x=80; x<=172; x+=4) g.setPixel(x, y);   // 0, 50, 100%
    for (var i=0; i<w.rain.length; i++) {
      var h = new Date(w.rainStart+i*3600000).getHours();
      if (h%6 == 0) g.fillRect(px(i), 42, px(i), 43);   // ticks at 0h, 6h, 12h, 18h
    }
    for (var i=1; i<w.rain.length; i++)
      g.drawLine(px(i-1), py(w.rain[i-1]), px(i), py(w.rain[i])).drawLine(px(i-1), py(w.rain[i-1])-1, px(i), py(w.rain[i])-1);
    var im = 0;
    w.rain.forEach(function(r, i){ if (r > w.rain[im]) im = i; });
    g.setColor(1,1,0).fillRect(px(0)-1, py(w.rain[0])-2, px(0)+1, py(w.rain[0])+1);   // now
    if (w.rain[im] > 0) g.fillRect(px(im)-1, py(w.rain[im])-2, px(im)+1, py(w.rain[im])+1);   // peak
    g.setFont("4x6").drawString("RAIN", 80, 20);
  }
};

// ---- Music: title across the top, artist on the right of the dial ----
let drawMusicInfo = function() {
  g.reset().setBgColor(0,0,0).setColor(0,1,1);
  g.clearRect(0, 0, 175, DIAL.y-1);
  g.clearRect(DIAL.x+DIAL.s, DIAL.y, 175, TIME.y-1);
  if (!isMusicActive) return drawWeather();
  g.setFont("8x16").drawString(ellipsis(musicTrack, 174), 1, 1);
  g.setFont("8x12");
  var lines = g.wrapString(musicArtist, ARTIST_W);
  if (lines.length > 2) lines = [lines[0], ellipsis(lines.slice(1).join(" "), ARTIST_W)];
  var y = lines.length > 1 ? 20 : 26;
  lines.forEach(function(t, i){ g.drawString(t, ARTIST_X, y+i*12); });
};

// ---- Music controls ----
const dragDetectionThreshold = 40;
const dragDetectionRejectionRatio = 0.3;
let dragState = {startX:0, startY:0, started:false};

let musicCmd = function(n) { Bluetooth.println(JSON.stringify({t:"music", n:n})); };
let musicTogglePlay = function() { musicCmd(isMusicPlaying ? "pause" : "play"); };

// ---- Messages ----
/** Remove message counts that WhatsApp adds: "Bob (2 messages)", "Family (3 messages): Bob".
 Same rule as in retromessagegui. */
let normTitle = function(t) {
  return (t||"").split(": ").map(p => p.replace(/\s\(\d+ [^()]*\)$/, "").trim()).join(": ");
};

/** Conversation name: the chat name for WhatsApp group chats ("chat: sender"), else the title */
let convLabel = function(m) {
  var t = normTitle(m.title);
  if ((m.src||"").toLowerCase().includes("whatsapp")) {
    var i = t.lastIndexOf(": ");
    if (i > 0) t = t.substr(0, i);
  }
  return t;
};

/** Snap an app colour ("#4c5") to the nearest of the screen's 8 colours, so icons aren't dithered */
let snapColor = function(c) {
  if (typeof c != "string" || c[0] != "#") return "#0ff";
  var h = c.length==4 ? [c[1],c[2],c[3]] : [c[1],c[3],c[5]];
  var r = parseInt(h[0],16)>=8, gr = parseInt(h[1],16)>=8, b = parseInt(h[2],16)>=8;
  if (!r && !gr && !b) return "#0ff";
  return "#"+(r?"f":"0")+(gr?"f":"0")+(b?"f":"0");
};

/** Message cards: one card per conversation (newest first), y=121..175 */
const CARDS_Y = 121;
/** Age of a message: "now", "4m", "2h", "3d" (undefined if the message has no date) */
let msgAge = function(d) {
  if (d === undefined) return;
  var t = "number"==typeof d ? d : new Date(d).getTime();
  if (!isFinite(t)) return;
  var m = Math.floor((Date.now()-t)/60000);
  if (m < 1) return "now";
  if (m < 60) return m+"m";
  if (m < 1440) return Math.floor(m/60)+"h";
  return Math.floor(m/1440)+"d";
};
/** Text for the cards: removes the images that Gadgetbridge embeds in messages for
 characters it can't send as text (emojis, symbols like the euro sign: "\0" + image),
 and any other character the card fonts can't draw. A malformed (cut off) image
 removes the rest of the text instead of being drawn as garbage. */
let plainText = function(t) {
  t = ""+(t||"");
  var o = "", i = 0;
  while (i < t.length) {
    var c = t.charCodeAt(i);
    if (c == 0) {   // embedded image: \0, width, height, bpp, [transparent], [palette], data
      if (i+3 >= t.length) break;
      var b = t.charCodeAt(i+3), bpp = b&31, n = 3;
      if (b&128) n++;
      if (b&64) n += (1<<bpp)*2;
      n += Math.ceil(t.charCodeAt(i+1)*t.charCodeAt(i+2)*bpp/8);
      if (!bpp || i+1+n > t.length) break;   // malformed: drop the rest
      i += 1+n;
      if (o.length && o[o.length-1]!=" ") o += " ";
      continue;
    }
    if (c==10 || c==13 || c==9) c = 32;
    if ((c>=32 && c<127) || (c>=160 && c<256)) o += String.fromCharCode(c);
    i++;
  }
  return o.replace(/  +/g," ").trim();
};

let updateMessages = function(message)
{
  g.reset().setBgColor(0,0,0).clearRect(0, CARDS_Y, 175, 175);
  var entries = [];
  for (const m of require("messages").getMessages(message))
  {
    if (m.title == "Music") continue;
    // one card per conversation
    var label = plainText(convLabel(m)) || plainText(m.body);
    var key = (m.src || "") + "|" + label;
    var existingEntry = entries.find(e => e.key == key);
    if (existingEntry) existingEntry.count++;
    else entries.push({
      key: key,
      msg: label,
      body: plainText(m.body),
      img: require("messageicons").getImage(m),
      col: snapColor(require("messageicons").getColor(m, {default:"#0ff"})),
      count: 1,
      date: m.date   // the newest message of the conversation comes first
    });
  }
  for (var i=0; i<3 && i<entries.length; i++) try
  {
    var e = entries[i], x = i*59, x2 = x+57, y = CARDS_Y;
    frame(x, y, x2, 175, 5);
    g.setColor(e.col).setBgColor(0,0,0).drawImage(e.img, x+4, y+4, {scale:0.5});
    var age = msgAge(e.date);   // age of the newest message, plain yellow text
    if (age) g.setColor(1,1,0).setBgColor(0,0,0).setFont("6x8").setFontAlign(1,-1).drawString(age, x2-4, y+4).setFontAlign(-1,-1);
    g.setColor(0,1,1).setFont("6x8").drawString(ellipsis(e.msg, 50), x+4, y+19);
    // start of the last message, 3 lines, "..." if longer
    g.setFont("4x6").setColor(1,1,1);
    var l = g.wrapString(e.body, 50);
    for (var j=0; j<3 && j<l.length; j++)
      g.drawString(j==2 && l.length>3 ? ellipsis(l[2]+" "+l[3], 50) : l[j], x+4, y+29+j*7);
  } catch (err) {   // never let one message stop the clock from drawing
    g.reset().setBgColor(0,0,0).clearRect(i*59+1, CARDS_Y+1, i*59+56, 174);
  }
};


// ---- Main loop: dial every second, time once a minute ----
let lastMinute = -1;
let tick = function() {
  // schedule the next tick first, so an error below can never freeze the clock
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = setTimeout(function(){ drawTimeout = undefined; tick(); }, 1000 - (Date.now() % 1000));
  var d = new Date();
  if (d.getMinutes() != lastMinute) {
    lastMinute = d.getMinutes();
    try { drawTime(d); } catch (e) { print("retrowatch time", e); }
    try { updateMessages(); } catch (e) { print("retrowatch msgs", e); }   // refresh the message ages
    if (!isMusicActive && lastMinute%5 == 0) try { drawMusicInfo(); } catch (e) { print("retrowatch top", e); }
  }
  drawDial(d.getSeconds(), true);
};
let redrawDial = function() { drawDial(new Date().getSeconds()); };

let onMessage = function(type, message) {
  if (type == "text") {
    try { updateMessages(message); } catch (e) { print("retrowatch msgs", e); }
    message.handled = true; // Prevent default message app from launching.
  }
};

// We eat music events and pass on the others. The previous GB is restored on unload.
let oldGB = global.GB;
let onGB = function(e) {
  switch(e.t) {
    case "musicinfo":
      isMusicActive = true;
      isMusicPlaying = true;
      musicTrack = e.track || "";
      musicArtist = e.artist || "";
      drawMusicInfo();
      redrawDial();
      break;
    case "musicstate":
      isMusicPlaying = e.state == "play";
      if (musicIdleTimeout) clearTimeout(musicIdleTimeout);
      musicIdleTimeout = undefined;
      if (e.state == "stop") {
        isMusicActive = false;
      } else {
        isMusicActive = true;
        // paused for 10 minutes: show the weather again
        if (!isMusicPlaying) musicIdleTimeout = setTimeout(function(){
          musicIdleTimeout = undefined; isMusicActive = false; drawMusicInfo(); redrawDial();
        }, 10*60000);
      }
      drawMusicInfo();
      redrawDial();
      break;
    default:
      if (oldGB) setTimeout(oldGB, 0, e);
  }
};
global.GB = onGB;

let onTouch = function(zone,e) {
  // tap on the dial: play/pause
  if (e.x < DIAL.x+DIAL.s && e.y >= DIAL.y && e.y < DIAL.y+DIAL.s && isMusicActive) musicTogglePlay();
  // tap on the messages: open the messages app
  if (e.y >= CARDS_Y) require("messages").openGUI();
};

let onDrag = function(e) {
  if (e.b > 0) {
    if (!dragState.started) {
      dragState.startX = e.x;
      dragState.startY = e.y;
      dragState.started = true;
    }
  } else {
    var dx = e.x - dragState.startX;
    var dy = e.y - dragState.startY;
    var r = dragDetectionRejectionRatio, t = dragDetectionThreshold;
    if (dx > t && Math.abs(dy/dx) < r) musicCmd("next");
    if (dx < -t && Math.abs(dy/dx) < r) musicCmd("previous");
    if (dy > t && Math.abs(dx/dy) < r) musicCmd("volumedown");
    if (dy < -t && Math.abs(dx/dy) < r) musicCmd("volumeup");
    dragState.started = false;
  }
};

let onWeather = function(){ weatherRead = false; if (!isMusicActive) drawMusicInfo(); };

Bangle.on("message", onMessage);
Bangle.on("touch", onTouch);
Bangle.on("drag", onDrag);
Bangle.on("lock", redrawDial);
NRF.on("connect", redrawDial);
NRF.on("disconnect", redrawDial);
if (weatherLib) weatherLib.on("update2", onWeather);

// Fast load: this removes everything the clock allocated, so the next app (launcher,
// messages...) can be loaded without a full reset, and the clock can be loaded back fast.
Bangle.setUI({mode:"clock", remove:function() {
  if (drawTimeout) clearTimeout(drawTimeout);
  if (musicIdleTimeout) clearTimeout(musicIdleTimeout);
  drawTimeout = musicIdleTimeout = undefined;
  Bangle.removeListener("message", onMessage);
  Bangle.removeListener("touch", onTouch);
  Bangle.removeListener("drag", onDrag);
  Bangle.removeListener("lock", redrawDial);
  NRF.removeListener("connect", redrawDial);
  NRF.removeListener("disconnect", redrawDial);
  if (weatherLib) weatherLib.removeListener("update2", onWeather);
  if (global.GB === onGB) global.GB = oldGB;
  delete Graphics.prototype.setFont5x9Numeric7Seg;
  delete Graphics.prototype.setFont8x12;
  delete Graphics.prototype.setFont8x16;
  require("widget_utils").show();
}});

// Widgets are loaded (needed for fast loading between apps) but hidden: the face uses the whole screen
Bangle.loadWidgets();
require("widget_utils").hide();

drawBackground();
try { drawMusicInfo(); } catch (e) { print("retrowatch top", e); }
try { updateMessages(); } catch (e) { print("retrowatch msgs", e); }
tick();
}
