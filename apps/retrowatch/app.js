// Retro Watch - clock face with a seconds dial, messages and music controls
require("Font5x9Numeric7Seg").add(Graphics);
require("Font7x11Numeric7Seg").add(Graphics);
require("Font8x12").add(Graphics);
require("Font8x16").add(Graphics);

const lock_img = require("heatshrink").decompress(atob("mMxgP/ACX+gAFD/EAh4FC+EAEQYFBgF/AoPgAoISC8EH+EDAoUf/4lC+AFB4AYB+E/FgIIBAoX+g4ID/4eBAofA//8AoXwv/+GYX4n4aCB4IJBAoQDCwYFCAYPBAoQDB8AFCAYImBFQYmBFQZmCAAMDOQQABgKEBAAf8Aol+Aok/AokfwAFDh/AAocHGH4wbToQAIwA="));
const play_img = require("heatshrink").decompress(atob("mMxgP/+//AAf5Aon8v4FD/0fBgkHAomBAonADAngDAnwDAn4HIIwDgAYD/0ADAkADAmADAnADAngDAnwDAn4gAYDGAIYDGAIYEAoIYDwAYEGAIYDGAIYDGAIYDGAIFDGAQFCGAQqDGA4FDGAIFDGAIFDMI4FDGAIFDGAKMESQwFE4AFE8AFEYYwFE/gFE/zuFAouHAonHAonnAon3I4g"));
const pause_img = require("heatshrink").decompress(atob("mMxgP/ACUD/+BAoQDB4AFCAYPgv4FBAYPwn4FBAYP4j4FBAYP8h4FBAYP+g4FBAYQsBGH4w/GH4wXACGAA=="));
const bluetooth_img = atob("MTEB////////////////////////////x///////wf//////4H//////8B//////+Af//////AH//////hB//////wwf/////4cH/////8PB////z+Hwf///w/D8H///4Ph/D///+Dw+D////g4eD////4MOD////+CGD/////gCD/////4AD/////+AD//////gD//////4D//////8B//////8Af/////8AH/////8AB/////8AQf////8EMH////8GHB////8HDwf///8Hh8H///8Hw/B///+H4fg////n8Pg/////+Hg//////Dg//////hg//////wg//////4A//////8A//////+A///////A///////g///////4////////////////////gA==");

// Background: the info bar (day / date / battery) at y=95..127
const bg_img = require("heatshrink").decompress(atob("2Gw4n//8HEbsRAH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4AYiEAAH4AQgJW/LDRC/ACqu/WDBX/K65A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/iIA/ACx1diAbagLN6K/5X/K/5X/K5EBiJX/K6yyZK/w+YK/5XcgLOYDYYdYK8ERK7EBiIAED6pXCHDI8EK+8RczKuDDzIAcRrBXFSYQeZV7hXdGy4eEdYIBEK6ztDK66SCK/5XUcwTOaDoQACK66RZgI5FD66veiBX/K6o7CK7ADCK4QeYOoh2WK4I+EK647CZzKvdK74dXK7w2YK4iuaOYYADK+wfaADbHBHwZXXSQJ3bK/ZW2K4IBBSTBXCV25XeAHJUBHrJXdZTpX4gJX/Di8RZvBXciMRWDhX3VwJYdK+xWDAH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4AW"));

// ---- Layout ----
const DIAL = {x:0, y:19, s:75};          // seconds dial, 75x75 so it has an exact centre pixel
const DCX = DIAL.x+37, DCY = DIAL.y+37;  // dial centre
const TIME = {x:76, y:46, x2:175, y2:93}; // time box (1px black gap to the dial and to the info bar)
const ARTIST_X = 78, ARTIST_W = 175-ARTIST_X;

var isMusicActive = false;
var isMusicPlaying = false;
var musicTrack = "";
var musicArtist = "";
var drawTimeout;

/** Same image, with colour 0 transparent (so the icon is drawn on the dial without a box) */
function transparent(img) {
  var s = E.toString(img);
  return String.fromCharCode(s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2)|128, 1) + s.substr(3);
}
const ICONS = {
  lock: transparent(lock_img), play: transparent(play_img),
  pause: transparent(pause_img), bt: transparent(bluetooth_img)
};

/** Cut text to fit width w, ending with "..." when it doesn't fit (uses the current font) */
function ellipsis(t, w) {
  if (g.stringWidth(t) <= w) return t;
  while (t.length && g.stringWidth(t+"...") > w) t = t.slice(0,-1);
  return t.trim()+"...";
}

// ---- Seconds dial ----
// Ticks for 0..7 s are rasterised once, every other second is an exact mirror/rotation
// of them, so all 60 ticks have the same shape and the dial is pixel-symmetric.
function tickPixels(s, rIn, rOut, thick) {
  s = (s+60)%60;
  var q = Math.floor(s/15), r = s%15, base = r<=7 ? r : 15-r;
  var k = Math.tan(base*Math.PI/30), pts = [];
  for (var y=rIn; y<=rOut; y++) {
    var x = Math.round(y*k);
    for (var o=-thick; o<=thick; o++) {
      var px = x+o, py = -y;
      if (r>7) { var t = px; px = -py; py = -t; }          // mirror on the diagonal
      for (var i=0; i<q; i++) { var u = px; px = -py; py = u; } // rotate 90 deg clockwise
      pts.push(px, py);
    }
  }
  return pts;
}

// The static dial (rounded square + 60 ticks) is drawn once into a 1 bit image:
// 0 = cyan face, 1 = black (ticks and the corners outside the rounded square)
var dialImg = (function() {
  var b = Graphics.createArrayBuffer(DIAL.s, DIAL.s, 1, {msb:true});
  b.setColor(1).fillRect(0, 0, DIAL.s-1, DIAL.s-1);
  b.setColor(0).fillRect({x:0, y:0, x2:DIAL.s-1, y2:DIAL.s-1, r:11});
  b.setColor(1);
  for (var s=0; s<60; s++) {
    var p = s%5==0 ? tickPixels(s, 26, 34, 1) : tickPixels(s, 30, 34, 0);
    for (var i=0; i<p.length; i+=2) b.setPixel(37+p[i], 37+p[i+1]);
  }
  return b.asImage("string");
})();

function currentIcon() {
  if (!NRF.getSecurityStatus().connected) return "bt";
  if (Bangle.isLocked()) return "lock";
  if (isMusicActive) return isMusicPlaying ? "play" : "pause";
}

function drawDial(sec) {
  g.reset().setColor(0,0,0).setBgColor(0,1,1);
  g.drawImage(dialImg, DIAL.x, DIAL.y);
  // pointer: a long bold tick on the current second
  var p = tickPixels(sec, 19, 34, 1);
  for (var i=0; i<p.length; i+=2) g.setPixel(DCX+p[i], DCY+p[i+1]);
  var icon = currentIcon();
  if (icon) {
    // the icon shapes are colour 0 of the image, which is drawn with the background colour
    g.setBgColor(icon=="bt" ? "#f00" : "#000");
    g.drawImage(ICONS[icon], DCX-14, DCY-14, {scale:0.6});
  }
}

// ---- Time and info bar (once a minute) ----
function drawTime(d) {
  var l = require("locale");
  var time = (" "+d.getHours()).substr(-2) + ":" + d.getMinutes().toString().padStart(2,0);
  g.reset().setColor(0,1,1).fillRect({x:TIME.x, y:TIME.y, x2:TIME.x2, y2:TIME.y2, r:8});
  g.setColor(0,0,0).setBgColor(0,1,1);
  g.setFont("5x9Numeric7Seg",3).drawString(time, 88, 56);

  g.setFont("8x12", 2);
  g.drawString(l.dow(d,1), 20, 100, true);
  g.drawString(""+d.getDate(), 81, 103, true);
  g.setFont("6x8", 1);
  g.drawString(l.month(d,1), 84, 96, true);
  g.setFont("7x11Numeric7Seg",2);
  g.drawString(E.getBattery(), 139, 101, true);
}

function drawBackground() {
  g.reset().setBgColor(0,0,0).clear();
  g.drawImage(bg_img, 0, 0);
  g.setColor(0,0,0).fillRect(0, 0, 175, 94);
  // round the top corners of the info bar (same shape as its bottom corners)
  [5,3,2,1,1].forEach(function(n,i){ g.fillRect(0,95+i,n-1,95+i); g.fillRect(176-n,95+i,175,95+i); });
}

// ---- Music: title across the top, artist on the right of the dial ----
function drawMusicInfo() {
  g.reset().setBgColor(0,0,0).setColor(0,1,1);
  g.clearRect(0, 0, 175, DIAL.y-1);
  g.clearRect(DIAL.x+DIAL.s, DIAL.y, 175, TIME.y-1);
  if (!isMusicActive) return;
  g.setFont("8x16").drawString(ellipsis(musicTrack, 174), 1, 1);
  g.setFont("8x12");
  var lines = g.wrapString(musicArtist, ARTIST_W);
  if (lines.length > 2) lines = [lines[0], ellipsis(lines.slice(1).join(" "), ARTIST_W)];
  var y = lines.length > 1 ? 20 : 26;
  lines.forEach(function(t, i){ g.drawString(t, ARTIST_X, y+i*12); });
}

// ---- Music controls ----
const dragDetectionThreshold = 40;
const dragDetectionRejectionRatio = 0.3;
var dragState = {startX:0, startY:0, started:false};

function musicCmd(n) { Bluetooth.println(JSON.stringify({t:"music", n:n})); }
function musicTogglePlay() { musicCmd(isMusicPlaying ? "pause" : "play"); }

// ---- Messages ----
/** Remove message counts that WhatsApp adds: "Bob (2 messages)", "Family (3 messages): Bob".
 Same rule as in retromessagegui. */
function normTitle(t) {
  return (t||"").split(": ").map(p => p.replace(/\s\(\d+ [^()]*\)$/, "").trim()).join(": ");
}

/** Conversation name: the chat name for WhatsApp group chats ("chat: sender"), else the title */
function convLabel(m) {
  var t = normTitle(m.title);
  if ((m.src||"").toLowerCase().includes("whatsapp")) {
    var i = t.lastIndexOf(": ");
    if (i > 0) t = t.substr(0, i);
  }
  return t;
}

function updateMessages(message)
{
  //console.log("updateMessages");
  //console.log("All messages:", require("messages").getMessages(message));
 
  const numLines = 3;
  const lineHeight = 16;
  
  var y = 175 - numLines * lineHeight;
  var count = 0;
  
  g.reset();
  //g.setColor(0, 1, 1);
  g.setColor(0, 0, 0);
  g.fillRect(0, y, 175, 175);
  
  g.reset();
  g.setFont("8x16", 1);
  g.setColor(0, 1, 1);
  
  var entries = [];
  
  /*var testMessages = [
    {title: "test aaa: 1"},
    {title: "test aaa: 2"},
    {title: "test b"},
    ];
  for (const m of testMessages)*/
  
  for(const m of require("messages").getMessages(message))
  {
    if(m.title == "Music") continue;
    
    // one line per conversation
    var label = convLabel(m) || m.body || "";
    var key = (m.src || "") + "|" + label;
    var existingEntry = entries.find(e => e.key == key);
    if (existingEntry) existingEntry.count++;
    else entries.push({ 
      key: key,
      msg: label, 
      img: require("messageicons").getImage(m),
      count: 1
    });
  }
  
  for (const entry of entries)
  {
    g.drawImage(entry.img, 0, y+1, {scale:0.5});
    if (entry.count > 1)
    {
      g.drawString(`${entry.msg} (${entry.count})`, 13, y);
    }
    else
    {
      g.drawString(entry.msg, 13, y);
    }
    
    y += lineHeight;
    count++;
    
    if(count >= 5) break;
  }
}


// ---- Main loop: dial every second, time once a minute ----
var lastMinute = -1;
function tick() {
  var d = new Date();
  if (d.getMinutes() != lastMinute) { lastMinute = d.getMinutes(); drawTime(d); }
  drawDial(d.getSeconds());
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = setTimeout(function(){ drawTimeout = undefined; tick(); }, 1000 - (Date.now() % 1000));
}
function redrawDial() { drawDial(new Date().getSeconds()); }

Bangle.on("message", (type, message)=>{
  if (type == "text") {
    updateMessages(message);
    message.handled = true; // Prevent default message app from launching.
  }
});

global.GB = (_GB => e => {
  // we eat music events!
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
      isMusicActive = true;
      isMusicPlaying = e.state == "play";
      redrawDial();
      break;
    default:
      // pass on other events
      if (_GB) setTimeout(_GB, 0, e);
  }
})(global.GB);

Bangle.on('touch', function(zone,e) {
  // tap on the dial: play/pause
  if (e.x < DIAL.x+DIAL.s && e.y >= DIAL.y && e.y < DIAL.y+DIAL.s && isMusicActive) musicTogglePlay();
  // tap on the messages: open the messages app
  if (e.y > 130) require("messages").openGUI();
});

Bangle.on('drag', function(e) {
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
});

Bangle.on('lock', redrawDial);
NRF.on('connect', redrawDial);
NRF.on('disconnect', redrawDial);

drawBackground();
drawMusicInfo();
updateMessages();
tick();

Bangle.setUI("clock");
