/* Retro Messages: a fork of the Messages UI app ("messagegui", BangleApps, MIT licence,
   Gordon Williams and contributors).

   Differences with messagegui:
   * cyan/black retro style (like the Retro Watch clock)
   * compact fixed header: app icon + name, age, lock and clock on line 1, sender on line 2
   * a burst of messages from the same sender (each one less than "mergeGap" seconds after the
     previous one, see settings) is shown as one message

   MESSAGES is a list of:
  {id:int,
    src,
    title,
    subject,
    body,
    sender,
    tel:string,
    reply:bool,
    positive:bool,
    negative:bool,
    actions: [{title:string}],
    date: number|string, // time of arrival (set by our lib.js if not given)
    new:true // not read yet
  }
*/

/* For example:

require("messages").pushMessage({"t":"add","id":1575479849,"src":"WhatsApp","title":"My Friend","body":"Hey! Can you do something for me?",reply:1,negative:1})
require("messages").pushMessage({"t":"add","id":1575479850,"src":"WhatsApp","title":"My Friend (2 messages)","body":"thanks",reply:1,negative:1})
require("messages").pushMessage({"t":"add","id":1575479851,"src":"WhatsApp","title":"Family group (3 messages): Al","body":"xx",reply:1,negative:1})
require("messages").pushMessage({"t":"add","id":23232,"src":"Skype","title":"Mr. Bobby McBobFace","body":"Boopedy-boop",positive:1,negative:1})
// maps
GB({t:"nav",src:"maps",title:"Navigation",instr:"High St towards Tollgate Rd",distance:"966m",action:"continue",eta:"08:39"})
// call
require("messages").pushMessage({"t":"add","id":"call","src":"Phone","title":"Bob","body":"12421312",positive:true,negative:true})
*/
var Layout = require("Layout");
/* Globals present before this app ran: everything else this app defines is deleted
 on exit, so the clock can be fast-loaded without leaking memory. */
var RMG_GLOBALS = Object.keys(global);
require("Font8x16").add(Graphics);
require("Font8x12").add(Graphics);
require("Font7x11Numeric7Seg").add(Graphics);
var layout; // global var containing the layout for the currently displayed message
var settings = require('Storage').readJSON("messages.settings.json", true) || {};
var rsettings = Object.assign({mergeGap:30}, require('Storage').readJSON("retromessagegui.json", true) || {});
var reply;
try { reply = require("reply"); } catch (e) {}

// Retro Watch colors. The theme is used by menus, prompts, widgets and the music/map screens.
// Restored (savedTheme) when going back to the clock.
var savedTheme = g.theme;
g.setTheme({fg:"#0ff", bg:"#000", fg2:"#000", bg2:"#0ff", fgH:"#000", bgH:"#0ff", fgW:"#0ff", bgW:"#000", dark:true});

var fontList = g.getFonts();
var fontSmall = fontList.includes("14")?"14":"6x8";
var fontMedium = fontList.includes("17")?"17":(fontList.includes("6x15")?"6x15":"6x8:2");
var fontBig = fontList.includes("22")?"22":(fontList.includes("12x20")?"12x20":"6x8:2");
var fontLarge = fontList.includes("28")?"28":(fontList.includes("6x15")?"6x15:2":"6x8:4");
var fontVLarge = fontList.includes("22")?"22:2":(fontList.includes("6x15")?"12x20:2":"6x8:5");
var redrawMsgInterval;
// Fonts for text that the retro fonts (ASCII only) can not show
var fbNormal = fontList.includes("6x15")?"6x15":"6x8:2";
var fbLarge = fontList.includes("12x20")?"12x20":"6x8:3";
var hasIntl = !!Graphics.prototype.setFontIntl;
var intlLarge = "Intl:2";
// If a font library is installed, just switch to using that for everything in messages
if (hasIntl) {
  fontSmall = "Intl";
  fontMedium = "Intl";
  fontBig = "Intl";
  /* 2v21 and before have a bug where the scale factor for PBF fonts wasn't
  taken into account in metrics, so we can't have big fonts on those firmwares.
  Having 'PBF' listed as a font was a bug fixed at the same time so we check for that. */
  let noScale = g.getFonts().includes("PBF");
  fontLarge = noScale?"Intl":"Intl:2";
  fontVLarge = noScale?"Intl":"Intl:3";
  intlLarge = noScale?"Intl":"Intl:2";
}

var HDR_H = 32; // height of the message header
var MAX_LINES = 60; // max wrapped lines shown for a merged message (older members are left out)
var MAX_BODY = 600; // max characters of one message body that we wrap

var active; // active screen (undefined/"list"/"music"/"map"/"message"/"scroller"/"settings")
var openMusic = false; // go back to music screen after we handle something else?
var replying = false; // If we're replying to a message, don't interrupt

/** this is a timeout if the app has started and is showing a single message
but the user hasn't seen it (eg no user input) - in which case
we should start a timeout for settings.unreadTimeout to return
to the clock. */
var unreadTimeout;
/// List of all our messages
var MESSAGES = require("messages").getMessages();
delete Bangle.MESSAGES; // now we're storing all messages and handling them ourselves
if (Bangle.MESSAGES_KILL_HANDLER) {
  E.removeListener("kill", Bangle.MESSAGES_KILL_HANDLER);
  delete Bangle.MESSAGES_KILL_HANDLER;
}
var onKill = function() { // now ensure we write messages on exit
  // if we write the exact same data it's ok - Bangle.js won't create a new file
  require("messages").write(MESSAGES, true/*force*/);
};
E.on("kill", onKill);

// <grouping> Pure functions, also loaded by test/grouping.test.js
var MAX_GROUP_MSGS = 40; // only the newest messages are merged (limits memory)
var MAX_MEMBERS = 10; // max messages in one merged group

/** Time of a message in ms, or undefined */
function msgTime(m) {
  var t = m.date;
  if (t===undefined || t===null || t==="") return;
  if ("number"!=typeof t) t = new Date(t).getTime();
  return isFinite(t) ? t : undefined;
}
/** Remove message counts that WhatsApp adds: "Bob (2 messages)", "Family (3 messages): Bob" */
function normTitle(t) {
  return (t||"").split(": ").map(p => p.replace(/\s\(\d+ [^()]*\)$/, "").trim()).join(": ");
}
function isWhatsApp(m) {
  return (m.src||"").toLowerCase().includes("whatsapp");
}
/** {sender, chat}: chat is only set for WhatsApp group chats ("chat: sender") */
function splitTitle(m) {
  var t = normTitle(m.title), i = isWhatsApp(m) ? t.lastIndexOf(": ") : -1;
  return i>0 ? {sender:t.substr(i+2), chat:t.substr(0,i)} : {sender:t};
}
/** Identity of the sender (in its chat) */
function msgKey(m) {
  return (m.src||"").toLowerCase()+"|"+normTitle(m.title);
}
/** Identity of the conversation */
function convKey(m) {
  var p = splitTitle(m);
  return p.chat!==undefined ? (m.src||"").toLowerCase()+"|#"+p.chat : msgKey(m);
}
function canMerge(m) {
  var s = (m.src||"").toLowerCase();
  return !!m.title && msgTime(m)!==undefined && ["music","nav","call"].indexOf(m.id)<0 &&
    s!="phone" && !s.startsWith("alarm");
}
/** Merge bursts of messages. msgs: newest first. Returns {groups:[{msgs:[newest..oldest]}], n}
 where n is the number of messages of msgs that are in groups (the others are not grouped).
 A message joins the group of the next newer message from the same sender if no other sender
 wrote in that conversation between them, and it is at most gapSecs older. */
function buildGroups(msgs, gapSecs) {
  var gap = gapSecs*1000, open = {}, lastKey = {}, groups = [], n = Math.min(msgs.length, MAX_GROUP_MSGS);
  for (var i=0; i<n; i++) {
    var m = msgs[i], grp = undefined;
    var k = m.title ? msgKey(m) : undefined, c = k && convKey(m);
    if (gap>0 && canMerge(m)) {
      var o = open[k];
      if (o && lastKey[c]===k && o.msgs.length<MAX_MEMBERS) {
        var d = msgTime(o.msgs[o.msgs.length-1]) - msgTime(m);
        if (d>=0 && d<=gap) grp = o;
      }
      lastKey[c] = k;
      if (grp) { grp.msgs.push(m); continue; }
      grp = {msgs:[m]};
      open[k] = grp;
    } else {
      if (c) lastKey[c] = k; // breaks a burst of another sender in this conversation
      grp = {msgs:[m]};
    }
    groups.push(grp);
  }
  return {groups:groups, n:n};
}
/** Length of an inline image ("\0"+image) that starts at s[p] (after the "\0") */
function imgLen(s, p) {
  var b = s.charCodeAt(p+2), bpp = b&31, l = 3;
  if (b&128) l++; // transparent color
  if (b&64) l += (1<<bpp)*2; // palette
  return l + Math.ceil(s.charCodeAt(p)*s.charCodeAt(p+1)*bpp/8);
}
/** First n chars of s, but never cut an inline image */
function safeCut(s, n) {
  if (s.length<=n) return s;
  var i = 0;
  while ((i = s.indexOf("\0", i))>=0 && i<n) {
    var e = i+1+imgLen(s, i+1);
    if (e>n) return s.substr(0, i);
    i = e;
  }
  return s.substr(0, n);
}
// </grouping>

var GROUPS, GROUPED_N; // see rebuildGroups
function rebuildGroups() {
  var r = buildGroups(MESSAGES, rsettings.mergeGap);
  GROUPS = r.groups;
  GROUPED_N = r.n;
}
function groupCount() {
  return GROUPS.length + Math.max(0, MESSAGES.length-GROUPED_N);
}
/** Group at index i. Messages after the merged ones are returned as new one-message groups */
function groupAt(i) {
  if (i<0) return;
  if (i<GROUPS.length) return GROUPS[i];
  var m = MESSAGES[GROUPED_N+i-GROUPS.length];
  return m ? {msgs:[m]} : undefined;
}
function groupIndexOf(id) {
  for (var i=0; i<GROUPS.length; i++)
    if (GROUPS[i].msgs.some(m => m.id==id)) return i;
  var j = MESSAGES.findIndex(m => m.id==id);
  return j>=GROUPED_N ? GROUPS.length+j-GROUPED_N : -1;
}
function groupOf(msg) {
  return groupAt(groupIndexOf(msg.id)) || {msgs:[msg]};
}
/** Newest message in the group that has the property (reply/positive/negative/actions) */
function memberWith(grp, prop) {
  return grp.msgs.find(m => m[prop] && (prop!="actions" || m.actions.length));
}
function markGroupRead(msg) {
  groupOf(msg).msgs.forEach(m => m.new = false);
}
function deleteGroup(msg) {
  var ids = groupOf(msg).msgs.map(m => m.id);
  MESSAGES = MESSAGES.filter(m => !ids.includes(m.id));
  rebuildGroups();
}
rebuildGroups();

function isAscii(s) {
  for (var i=0; i<s.length; i++) {
    var c = s.charCodeAt(i);
    if ((c<32 && c!=10) || c>126) return false;
  }
  return true;
}
/** Retro font if the text is plain ASCII, else a font that can show it */
function pickFont(s, retro, fallback) {
  return hasIntl ? "Intl" : (isAscii(s) ? retro : fallback);
}
/** setFont with a "name:scale" string (works for custom fonts too) */
function setF(f) {
  var p = f.split(":");
  return g.setFont(p[0], p[1]?+p[1]:1);
}
/** Cut s with ".." to fit in w pixels with the current font. Returns "" if nothing fits */
function fit(s, w) {
  if (g.stringWidth(s)<=w) return s;
  var lo = 0, hi = s.length;
  while (lo<hi) {
    var mid = (lo+hi+1)>>1;
    if (g.stringWidth(safeCut(s, mid)+"..")<=w) lo = mid; else hi = mid-1;
  }
  var c = safeCut(s, lo);
  return c ? c+".." : "";
}
function timeAgo(m) {
  var t = msgTime(m);
  if (t===undefined) return "";
  var min = Math.floor((Date.now()-t)/60000);
  if (min<1) return "now";
  if (min<60) return min+"m";
  if (min<1440) return Math.floor(min/60)+"h";
  return Math.floor(min/1440)+"d";
}

var onMessagesModified = function(type,msg) {
  if (msg.handled) return;
  msg.handled = true;
  if (msg.t==="add" && msg.date===undefined) msg.date = Date.now();
  require("messages").apply(msg, MESSAGES);
  rebuildGroups();
  if (msg && msg.id!=="music" && msg.id!=="nav" && msg.new &&
      !((require('Storage').readJSON('setting.json', 1) || {}).quiet)) {
    require("messages").buzz(msg.src);
  }
  if (msg && msg.id=="music") {
    if (msg.state && msg.state!="play") openMusic = false; // no longer playing music to go back to
    if ((active!=undefined) && (active!="list") && (active!="music")) return; // don't open music over other screens (but do if we're in the main menu)
  }
  if (msg && msg.id=="nav" && msg.t=="modify" && active!="map")
    return; // don't show an updated nav message if we're just in the menu
  if (msg.t=="add" && msg.new && msg.id!="music" && msg.id!="nav")
    return showMessage(msg.id, false, msg.id); // show the (maybe merged) new message
  if (active=="message" && SHOWN) {
    // keep the message on screen if it still exists (eg. an older message of the group was removed)
    var keep = SHOWN.ids.find(id => groupIndexOf(id)>=0);
    if (keep!==undefined) return showMessage(keep, true);
  }
  showMessage(msg&&msg.id, false);
};
Bangle.on("message", onMessagesModified);


/* Listens to drag events to allow the user to swipe up/down to change message on Bangle.js 2
returns dragHandler which should then be removed with Bangle.removeListener("drag", dragHandler); on exit.
idx is a group index. */
function addDragHandlerToChangeMessage(idx, scroller) {
  // save the scroll pos when finger pressed
  let lastTouched=false, lastScrollPos=0, scrollY=0;
  let dragHandler = (e) => {
    let scrollPos = scroller?scroller.scroll:0;
    if (e.b) {
      if (!lastTouched) lastScrollPos = scrollPos;
      scrollY += e.dy;
    }
    lastTouched = e.b;
    // swipe up down to prev/next but ONLY when finger released and if we're already at the top/bottom => scroller hasn't moved
    if (!e.b && scrollPos==lastScrollPos) {
      if (scrollY<-50 && idx<groupCount()-1) {
        Bangle.buzz(30);
        showMessage(groupAt(idx+1).msgs[0].id, true);
      }
      if (scrollY>50 && idx>0) {
        Bangle.buzz(30);
        showMessage(groupAt(idx-1).msgs[0].id, true);
      }
      scrollY = 0;
    }
  };
  Bangle.on("drag", dragHandler);
  return dragHandler;
}

function showMapMessage(msg) {
  active = "map";
  require("messages").stopBuzz(); // stop repeated buzzing while the map is showing
  var m, distance, street, target, img;
  if ("string"==typeof msg.distance) // new gadgetbridge
    distance = msg.distance;
  else if ("number"==typeof msg.distance) // 0.74 gadgetbridge
    distance = require("locale").distance(msg.distance);
  if (msg.instr) {
    var instr = msg.instr.replace(/\s*\/\s*/g," \/\n"); // convert slashes to newlines
    m = instr.split(/towards|toward/);
    if (m.length>1) {
      target = m[0].trim();
      street = m[1].trim();
    }else
      target = instr;
  }
  var carIsRHD = !!settings.carIsRHD;
  switch (msg.action) {
  case "continue": img = "EBgBAIABwAPgD/Af+D/8f/773/PPY8cDwAPAA8ADwAPAA8AAAAPAA8ADwAAAA8ADwAPA";break;
  case "left": img = "GhcBAYAAAPAAAHwAAD4AAB8AAA+AAAf//8P///x///+PAAPx4AA8fAAHD4ABwfAAcDwAHAIABwAAAcAAAHAAABwAAAcAAAHAAABwAAAc";break;
  case "right": img = "GhcBAABgAAA8AAAPgAAB8AAAPgAAB8D///j///9///+/AAPPAAHjgAD44AB8OAA+DgAPA4ABAOAAADgAAA4AAAOAAADgAAA4AAAOAAAA";break;
  case "left_slight": img = "ERgB//B/+D/8H4AP4Af4A74Bz4Dj4HD4OD4cD4AD4ADwADwADgAHgAPAAOAAcAA4ABwADgAH";break;
  case "right_slight": img = "ERgBB/+D/8H/4APwA/gD/APuA+cD44Phw+Dj4HPgAeAB4ADgAPAAeAA4ABwADgAHAAOAAcAA";break;
  case "left_sharp": img = "GBaBAAAA+AAB/AAH/gAPjgAeBwA8BwB4B+DwB+HgB+PAB+eAB+8AB+4AB/wAB/gAB//gB//gB//gBwAABwAABwAABwAABw=="; break;
  case "right_sharp": img = "GBaBAB8AAD+AAH/gAHHwAOB4AOA8AOAeAOAPB+AHh+ADx+AB5+AA9+AAd+AAP+AAH+AH/+AH/+AH/+AAAOAAAOAAAOAAAA==";break;
  case "keep_left": img = "ERmBAACAAOAB+AD+AP+B/+H3+PO+8c8w4wBwADgAHgAPAAfAAfAAfAAfAAeAAeAAcAA8AA4ABwADgA==";break;
  case "keep_right": img = "ERmBAACAAOAA/AD+AP+A//D/fPueeceY4YBwADgAPAAeAB8AHwAfAB8ADwAPAAcAB4ADgAHAAOAAAA==";break;
  case "uturn_left": img = "GRiBAAAH4AAP/AAP/wAPj8APAfAPAHgHgB4DgA8BwAOA4AHAcADsOMB/HPA7zvgd9/gOf/gHH/gDh/gBwfgA4DgAcBgAOAAAHAAADgAABw==";break;
  case "uturn_right": img = "GRiBAAPwAAf+AAf/gAfj4AfAeAPAHgPADwHgA4DgAcBwAOA4AHAcBjhuB5x/A+57gP99wD/84A/8cAP8OAD8HAA4DgAMBwAAA4AAAcAAAA==";break;
  case "finish": img = "HhsBAcAAAD/AAAH/wAAPB4AAeA4AAcAcAAYIcAA4cMAA48MAA4cMAAYAcAAcAcAAcA4AAOA4AAOBxjwHBzjwHjj/4Dnn/4B3P/4B+Pj4A8fj8Acfj8AI//8AA//+AA/j+AB/j+AB/j/A";break;
  case "roundabout_left": img = carIsRHD ? "HBaCAAADwAAAAAAAD/AAAVUAAD/wABVVUAD/wABVVVQD/wAAVABUD/wAAVAAFT/////wABX/////8AAF//////AABT/////wABUP/AAD/AAVA/8AA/8AVAD/wAD//VQAP/AAP/1QAA/wAA/9AAADwAAD/AAAAAAAA/wAAAAAAAP8AAAAAAAD/AAAAAAAA/wAAAAAAAP8AAAAAAAD/AA=" : "HRYCAAPAAAAAAAAD/AAD//AAA/8AD///AAP/AA////AD/wAD/wP/A/8AA/wAP8P/////AAP//////8AA///////AAD/P////8AAP8P/AABUAD/AP/AAFUA/8AP/AAFX//AAP/AAFf/wAAP8AAB/8AAAPAAAD8AAAAAAAAPwAAAAAAAA/AAAAAAAAD8AAAAAAAAPwAAAAAAAA/AAAAAAAAD8AAA==";break;
  case "roundabout_right": img = carIsRHD ? "HRaCAAAAAAAA8AAAP/8AAP8AAD///AA/8AA////AA/8AP/A/8AA/8A/wAP8AA/8P8AA/////8/wAD///////AAD//////8AAP////8P8ABUAAP/A/8AVQAD/wA//1UAA/8AA//VAAP/AAA/9AAA/wAAAPwAAA8AAAA/AAAAAAAAD8AAAAAAAAPwAAAAAAAA/AAAAAAAAD8AAAAAAAAPwAAAAAAA=" : "HBYCAAAAAAPAAABVQAAP8AAFVVQAD/wAFVVVAAP/ABUAFQAA/8BUAAVAAD/wVAAP/////FAAD/////9QAA//////VAAP/////FQAP8AAP/AVAP/AAP/AFX//AAP/AAV//AAP/AAAf/AAD/AAAD/AAAPAAAA/wAAAAAAAP8AAAAAAAD/AAAAAAAA/wAAAAAAAP8AAAAAAAD/AAAAAAA==";break;
  case "roundabout_straight": img = carIsRHD ? "EBuCAAADwAAAD/AAAD/8AAD//wAD///AD///8D/P8/z/D/D//A/wPzAP8AwA//UAA//1QA//9VA/8AFUP8AAVD8AAFQ/AABUPwAAVD8AAFQ/wABUP/ABVA//9VAD//VAAP/1AAAP8AAAD/AAAA/wAA==" : "EBsCAAPAAAAP8AAAP/wAAP//AAP//8AP///wP8/z/P8P8P/8D/A/MA/wDABf/wABX//ABV//8BVAD/wVAAP8FQAA/BUAAPwVAAD8FQAA/BUAA/wVQA/8BV//8AFf/8AAX/8AAA/wAAAP8AAAD/AA";break;
  case "roundabout_uturn": img = carIsRHD ? "ICCBAAAAAAAAAAAAAAAAAAAP4AAAH/AAAD/4AAB4fAAA8DwAAPAcAADgHgAA4B4AAPAcAADwPAAAeHwAADz4AAAc8AAABPAAAADwAAAY8YAAPPPAAD73gAAf/4AAD/8AABf8AAAb+AAAHfAAABzwAAAcYAAAAAAAAAAAAAAAAAAAAAAA" : "ICABAAAAAAAAAAAAAAAAAAfwAAAP+AAAH/wAAD4eAAA8DwAAOA8AAHgHAAB4BwAAOA8AADwPAAA+HgAAHzwAAA84AAAPIAAADwAAAY8YAAPPPAAB73wAAf/4AAD/8AAAP+gAAB/YAAAPuAAADzgAAAY4AAAAAAAAAAAAAAAAAAAAAAA=";break;
  }

  layout = new Layout({ type:"v", c: [
    {type:"txt", font:street?fontMedium:fontLarge, label:target, bgCol:g.theme.bg2, col: g.theme.fg2, fillx:1, pad:3 },
    street?{type:"h", bgCol:g.theme.bg2, col: g.theme.fg2,  fillx:1, c: [
      {type:"txt", font:fontSmall, label:"Towards" },
      {type:"txt", font:fontLarge, label:street }
    ]}:{type:""},
    {type:"h",fillx:1, filly:1, c: [
      img?{type:"img",src:atob(img), scale:2, pad:6}:{type:""},
      {type:"v", fillx:1, c: [
        {type:"txt", font:fontVLarge, label:distance||"" }
      ]},
    ]},
    {type:"txt", font:fontMedium, label:msg.eta?`ETA ${msg.eta}`:"" }
  ]}, { back : function() { // mark as not new and return to menu
    msg.new = false;
    layout = undefined;
    checkMessages({clockIfNoMsg:1,clockIfAllRead:1,ignoreUnread:settings.ignoreUnread,openMusic:0});
  }, remove : function() {
    Bangle.removeListener("drag", dragHandler);
  }});
  g.reset().clearRect(Bangle.appRect);
  layout.render();
  // handle up/down to drag to new message
  let dragHandler = addDragHandlerToChangeMessage(groupIndexOf(msg.id));
}



function showMusicMessage(msg) {
  active = "music";
  // defaults, so e.g. msg.xyz.length doesn't error. `msg` should contain up to date info
  msg.artist = msg.artist||"";
  msg.album = msg.album||"";
  msg.track = msg.track||"Music";
  openMusic = msg.state=="play";
  var trackScrollOffset = 0;
  var artistScrollOffset = 0;
  var albumScrollOffset = 0;
  var trackName = '';
  var artistName = '';
  var albumName = '';
  var updateLabelsInterval;

  function fmtTime(s) {
    var m = Math.floor(s/60);
    s = (parseInt(s%60)).toString().padStart(2,0);
    return m+":"+s;
  }
  function reduceStringAndPad(text, offset, maxLen) {
    var sliceLength = offset + maxLen > text.length ? text.length - offset : maxLen;
    return text.substr(offset, sliceLength).padEnd(maxLen, " ");
  }
  function unload() {
    if (updateLabelsInterval)
      clearInterval(updateLabelsInterval);
    updateLabelsInterval = undefined;
    Bangle.removeListener("drag", dragHandler);
  }
  function back() {
    unload();
    openMusic = false;
    var wasNew = msg.new;
    msg.new = false;
    layout = undefined;
    if (wasNew) checkMessages({clockIfNoMsg:1,clockIfAllRead:1,ignoreUnread:1,openMusic:0});
    else returnToMain();
  }
  function updateLabels() {
    trackName = reduceStringAndPad(msg.track, trackScrollOffset, 13);
    artistName = reduceStringAndPad(msg.artist, artistScrollOffset, 21);
    albumName = reduceStringAndPad(msg.album, albumScrollOffset, 21);

    trackScrollOffset++;
    artistScrollOffset++;
    albumScrollOffset++;

    if ((trackScrollOffset + 13) > msg.track.length) trackScrollOffset = 0;
    if ((artistScrollOffset + 21) > msg.artist.length) artistScrollOffset = 0;
    if ((albumScrollOffset + 21) > msg.album.length) albumScrollOffset = 0;
  }
  updateLabels();

  layout = new Layout({ type:"v", c: [
    {type:"h", fillx:1, bgCol:g.theme.bg2, col: g.theme.fg2,  c: [
      { type:"v", fillx:1, c: [
        { type:"txt", font:fontMedium, bgCol:g.theme.bg2, label:artistName, pad:2, id:"artist" },
        { type:"txt", font:fontMedium, bgCol:g.theme.bg2, label:albumName, pad:2, id:"album" }
      ]},
      { type:"img", pad:4, src:require("messageicons").getImage(msg),
        cb:()=>{
          unload();
          showMessageSettings(msg);
        }
      }
    ]},
    {type:"txt", font:fontLarge, bgCol:g.theme.bg, label:trackName, fillx:1, filly:1, pad:2, id:"track" },
    Bangle.musicControl?{type:"h",fillx:1, c: [
      {type:"btn", pad:8, label:atob("ABYYgQDAAAPAAA/AAD/AAP+AA/+AD/+AP/+A//+D//+P//8//////////8///j//4P/+A//gD/4AP+AA/wAD8AAPAAAwAAA="), cb:()=>Bangle.musicControl("play")}, // play
      {type:"btn", pad:8, label:atob("ABIWgQB4B78D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D/8D94B4A=="), cb:()=>Bangle.musicControl("pause")}, // pause
      {type:"btn", pad:8, label:atob("ABISgQDAAfgAf4Af8Af/Af/gf/wf/8f/+f/+f/8f/wf/gf/Af8Af4AfgAfAAcA=="), cb:()=>Bangle.musicControl("next")}, // next
    ]}:{},
    {type:"txt", font:"6x8:2", label:msg.dur?fmtTime(msg.dur):"--:--" }
  ]}, { back : back, remove : unload
  });
  g.reset().clearRect(Bangle.appRect);
  layout.render();

  // handle up/down to drag to new message
  let dragHandler = addDragHandlerToChangeMessage(groupIndexOf(msg.id));

  updateLabelsInterval = setInterval(function() {
    updateLabels();
    layout.artist.label = artistName;
    layout.album.label = albumName;
    layout.track.label = trackName;
    layout.render();
  }, 400);
}

function showActionsMenu(msg) {
  cancelReloadTimeout();
  var menu = {"":{ title:/*LANG*/"Actions", back:() => showMessage(msg.id, true) }};
  if (msg.reply && reply)
    menu[/*LANG*/"Reply"] = () => {
      markGroupRead(msg);
      replying = true;
      reply.reply({msg:msg})
        .then(r => {
          Bluetooth.println(JSON.stringify(r));
          replying=false;
          returnToCheckMessages();
        })
        .catch(() => { 
          replying=false; 
          showMessage(msg.id); 
        });
    };  
  // Custom actions
  if (msg.actions) 
    msg.actions.forEach((action, idx) => {
      menu[action.title] = () => {
        markGroupRead(msg);
        Bluetooth.println("");
        Bluetooth.println(JSON.stringify({t:"notify",n:"INVOKE_ACTION",id:msg.id,action:idx}));
        returnToCheckMessages();
      };
    });
  if (msg.positive)
    menu[/*LANG*/"Open"] = () => {
      markGroupRead(msg); 
      cancelReloadTimeout(); 
      Bangle.messageResponse(msg,true); 
      returnToCheckMessages();
    };
  E.showMenu(menu);
}


function showMessageSettings(msg) {
  active = "settings";
  var grp = groupOf(msg);
  msg = grp.msgs[0];
  var menu = {"":{
      "title":/*LANG*/"Message",
      back:() => showMessage(msg.id, true)
    },
  };

  var actMsg = memberWith(grp, "actions");
  if (actMsg) {
    menu[/*LANG*/"Actions"] = ()=>{ showActionsMenu(actMsg); };
  }

  var repMsg = reply && memberWith(grp, "reply");
  if (repMsg)
    menu[/*LANG*/"Reply"] = () => {
      replying = true;
      reply.reply({msg: repMsg})
        .then(result => {
          Bluetooth.println(JSON.stringify(result));
          replying = false;
          showMessage(msg.id);
        })
        .catch(() => {
          replying = false;
          showMessage(msg.id);
        });
    };

  menu[/*LANG*/"Delete"] = () => {
    deleteGroup(msg);
    returnToMain();
  };

  if (Bangle.messageIgnore && msg.src)
    menu[/*LANG*/"Ignore"] = () => {
      E.showPrompt(/*LANG*/"Ignore all messages from "+E.toJS(msg.src)+"?", {title:/*LANG*/"Ignore"}).then(isYes => {
        if (isYes) {
          Bangle.messageIgnore(msg);
          deleteGroup(msg);
        }
        returnToMain();
      });
    };

  menu = Object.assign(menu, {
    /*LANG*/"Mark Unread" : () => {
      msg.new = true;
      returnToMain();
    },
    /*LANG*/"Mark all read" : () => {
      MESSAGES.forEach(msg => msg.new = false);
      returnToMain();
    },
    /*LANG*/"Delete all messages" : () => {
      E.showPrompt(/*LANG*/"Are you sure?", {title:/*LANG*/"Delete All Messages"}).then(isYes => {
        if (isYes) {
          MESSAGES = [];
          rebuildGroups();
        }
        returnToMain();
      });
    },
  });
  E.showMenu(menu);
}

/* State of the message screen on display:
 {grp, ids:[member ids], starts:{id:first line}, lh:line height, scroller, R:app rect} */
var SHOWN;
var headerTimeout;

/** Draw text in bold, right-aligned at xr: each character is drawn twice 1px apart,
 with 1px more spacing so the characters don't merge. Returns the width used. */
function drawBold(t, xr, y) {
  g.setFont("7x11Numeric7Seg").setFontAlign(-1,-1);
  let w = 0;
  for (let i=0; i<t.length; i++) w += g.stringWidth(t[i])+1;
  let x = xr-w;
  for (let i=0; i<t.length; i++) {
    g.drawString(t[i], x, y).drawString(t[i], x+1, y);
    x += g.stringWidth(t[i])+1;
  }
  return w;
}
/** Draw the compact header: icon, app, age, lock, time / sender, chat */
function drawHeader() {
  if (!SHOWN) return;
  let msg = SHOWN.grp.msgs[0], R = SHOWN.R, x2 = R.x2, y = R.y;
  g.reset().setColor(g.theme.bg2).fillRect(R.x, y, x2, y+HDR_H-2)
   .setColor(g.theme.bg).fillRect(R.x, y+HDR_H-1, x2, y+HDR_H-1)
   .setColor(g.theme.fg2).setBgColor(g.theme.bg2);
  // line 1
  let icon = require("messageicons").getImage(msg);
  if (icon) g.drawImage(icon, R.x+1, y+2, {scale:0.5});
  let d = new Date();
  let time = (" "+d.getHours()).substr(-2) + ":" + ("0"+d.getMinutes()).substr(-2);
  // time: 4px from the top, 2px from the right edge, bold
  let tw = drawBold(time, x2-1, y+4);
  let left = R.x+15, right = x2-1-tw-4;
  if (Bangle.isLocked()) { // small lock
    right -= 7;
    g.drawRect(right+2, y+3, right+5, y+6).fillRect(right+1, y+7, right+6, y+12);
    right -= 4;
  }
  let age = timeAgo(msg);
  g.setFont("8x12");
  if (age && right-g.stringWidth(age)-left>=16) {
    g.setFontAlign(1,-1).drawString(age, right, y+2);
    right -= g.stringWidth(age)+6;
  }
  let src = msg.src||/*LANG*/"Message";
  setF(pickFont(src, "8x12", "6x8"));
  src = fit(src, right-left);
  if (src.length>2) g.setFontAlign(-1,-1).drawString(src, left, y+2);
  // line 2: the sender is never cut to show the chat name
  let p = splitTitle(msg), sender = p.sender || msg.src || /*LANG*/"Message", ly = y+15;
  setF(pickFont(sender, "8x16", fbNormal));
  sender = fit(sender, R.w-2);
  g.setFontAlign(-1,-1).drawString(sender, R.x+1, ly);
  let sx = R.x+1+g.stringWidth(sender)+5;
  if (p.chat && x2-1-sx>=24) {
    setF(pickFont(p.chat, "8x12", "6x8"));
    let c = fit("@"+p.chat, x2-1-sx);
    if (c.length>3) g.drawString(c, sx, ly+16-g.getFontHeight());
  }
}
function headerTimer() {
  if (headerTimeout) clearTimeout(headerTimeout);
  headerTimeout = setTimeout(() => {
    headerTimeout = undefined;
    drawHeader();
    headerTimer();
  }, 60000 - (Date.now() % 60000));
}

/** Text of a message body, cut to MAX_BODY chars and MAX_LINES lines (limits memory) */
function memberText(m) {
  let t = m.body || m.title || "", cut = t.length>MAX_BODY ? MAX_BODY : t.length, p = -1;
  for (let i=0; i<MAX_LINES && p<cut; i++) {
    p = t.indexOf("\n", p+1);
    if (p<0) break;
  }
  if (p>=0 && p<cut) cut = p;
  return cut<t.length ? safeCut(t, cut)+"..." : t;
}
/** Wrap the members of a group (newest first in msgs). Newest members are kept first if there
 are more than MAX_LINES lines. Result is in time order: {lines, starts:{id:line}, sep:{line:1}} */
function buildLines(msgs, texts, font, w) {
  setF(font);
  let sel = [], used = 0, omitted = false;
  for (let i=0; i<msgs.length; i++) {
    let l;
    try {
      l = g.wrapString(texts[i], w);
    } catch (e) {
      console.log("Invalid message body", e);
      l = ["[Invalid message]"];
    }
    if (l.length>MAX_LINES) l = l.slice(0, MAX_LINES);
    if (sel.length && used+l.length>MAX_LINES) { omitted = true; break; }
    sel.unshift({id:msgs[i].id, l:l});
    used += l.length;
  }
  let lines = [], starts = {}, sep = {};
  if (omitted) lines.push("...");
  sel.forEach((s, j) => {
    starts[s.id] = lines.length;
    if (j || omitted) sep[lines.length] = 1;
    s.l.forEach(l => lines.push(l));
  });
  return {lines:lines, starts:starts, sep:sep};
}
function lineHeight(font) {
  setF(font);
  return g.getFontHeight()+1;
}

/** Like E.showScroller on Bangle.js 2, but draws in o.rect (only Espruino after 2v29 has this).
 o = {h, c, rect, scroll, draw(idx, r), back, remove}. Returns {scroll} */
function showScroller(o) {
  let R = o.rect, max = Math.max(0, o.h*o.c - R.h), s = {scroll:E.clip(0|o.scroll, 0, max)};
  let drawBand = (y1, y2) => { // redraw screen lines y1..y2
    g.reset().setClipRect(R.x, y1, R.x2, y2);
    let a = Math.floor((y1-R.y+s.scroll)/o.h), b = Math.floor((y2-R.y+s.scroll)/o.h);
    for (let i=a; i<=b; i++) {
      let r = {x:R.x, y:R.y+i*o.h-s.scroll, w:R.w, h:o.h};
      if (i<o.c) o.draw(i, r);
      else g.setBgColor(g.theme.bg).clearRect(r.x, r.y, R.x2, r.y+r.h-1);
    }
    g.setClipRect(0, 0, g.getWidth()-1, g.getHeight()-1);
  };
  let draw = () => drawBand(R.y, R.y2);
  Bangle.setUI({mode:"custom", back:o.back, remove:o.remove, redraw:draw, drag:e => {
    let n = E.clip(s.scroll-e.dy, 0, max), d = s.scroll-n;
    if (!d) return;
    s.scroll = n;
    g.reset().setClipRect(R.x, R.y, R.x2, R.y2).scroll(0, d);
    if (d<0) drawBand(Math.max(R.y, R.y2+d+1), R.y2);
    else drawBand(R.y, Math.min(R.y2, R.y+d-1));
  }});
  draw();
  return s;
}

/** Show the group that contains message msgid. newId: id of a message that just arrived */
function showMessage(msgid, persist, newId) {
  if (replying) { return; }
  if(!persist) resetReloadTimeout();
  let grp = groupAt(groupIndexOf(msgid));
  let msg = grp && grp.msgs[0];
  if(redrawMsgInterval){
    clearInterval(redrawMsgInterval);
    redrawMsgInterval=null;
  }
  if (!msg) return returnToClockIfEmpty(); // go home if no message found
  if (msg.id=="music") {
    cancelReloadTimeout(); // don't auto-reload to clock now
    return showMusicMessage(msg);
  }
  if (msg.id=="nav") {
    cancelReloadTimeout(); // don't auto-reload to clock now
    return showMapMessage(msg);
  }
  // Is this the group already on screen? Then keep the same text at the top
  let prev = (active=="message" && SHOWN && grp.msgs.some(m => SHOWN.ids.includes(m.id))) ? SHOWN : undefined;
  let anchor;
  if (prev) {
    let top = Math.floor(prev.scroller.scroll/prev.lh), best = -1;
    for (let id in prev.starts)
      if (prev.starts[id]<=top && prev.starts[id]>best) { best = prev.starts[id]; anchor = {id:id, off:top-best}; }
  }
  // remove widgets here as we need to check the height when choosing a font
  Bangle.setUI(); // force last UI to be removed (will call require("widget_utils").show(); if last displaying a message)
  if (!settings.showWidgets) require("widget_utils").hide();
  active = "message";
  let R = Bangle.appRect;
  let body = {x:R.x, y:R.y+HDR_H, w:R.w, h:R.h-HDR_H, x2:R.x2, y2:R.y2};

  let negMsg = memberWith(grp, "negative"), actMsg = memberWith(grp, "actions"),
    repMsg = reply && memberWith(grp, "reply"), posMsg = memberWith(grp, "positive");
  let negHandler, posHandler, posImg;
  if (negMsg) {
    negHandler = ()=>{
      markGroupRead(msg);
      cancelReloadTimeout(); // don't auto-reload to clock now
      Bangle.messageResponse(negMsg,false);
      returnToCheckMessages();
    };
  }
  if (actMsg) {
    posHandler = ()=>{ showActionsMenu(actMsg); };
    posImg = "QRABAAAAAAAABwAAAAAAAMAHwAAAAAAAcAPgAAAAAAA8AOAAAAAAAB8AAAAAAAAAD8AAAH//////8BwAP//////8HwAf//////4PgA///////gOAAAAAAAB+AAAAAAAAAD4AAAAAAAAAHgBwAAAAAAAOAHwAAAAAAAYAPgAAAAAAAAAOAA==";
  } else if (repMsg) {
    posHandler = ()=>{
      replying = true;
      markGroupRead(msg);
      cancelReloadTimeout(); // don't auto-reload to clock now
      reply.reply({msg: repMsg})
        .then(result => {
          Bluetooth.println(JSON.stringify(result));
          replying = false;
          returnToCheckMessages();
        })
        .catch(() => {
          replying = false;
          showMessage(msg.id);
        });
    };
    posImg = "QRABAAAAAAAH//+AAAAABgP//8AAAAADgf//4AAAAAHg4ABwAAAAAPh8APgAAAAAfj+B////////geHv///////hf+f///////GPw///////8cGBwAAAAAPx/gDgAAAAAfD/gHAAAAAA8DngOAAAAABwDHP8AAAAADACGf4AAAAAAAAM/w==";
  } else if (posMsg) {
    posHandler = ()=>{
      markGroupRead(msg);
      cancelReloadTimeout(); // don't auto-reload to clock now
      Bangle.messageResponse(posMsg,true);
      returnToCheckMessages();
    };
    posImg = "QRABAAAAAAAAAAOAAAAABgAAA8AAAAADgAAD4AAAAAHgAAPgAAAAAPgAA+AAAAAAfgAD4///////gAPh///////gA+D///////AD4H//////8cPgAAAAAAPw8+AAAAAAAfB/4AAAAAAA8B/gAAAAAABwB+AAAAAAADAB4AAAAAAAAABgAA==";
  }
  let hasBar = negHandler || posHandler;

  // Choose the font: large if the message is short and fits, else normal
  let texts = grp.msgs.map(memberText), total = 0;
  texts.forEach(t => total += t.length);
  let ascii = !hasIntl && texts.every(isAscii);
  let font = hasIntl ? "Intl" : (ascii ? "8x16" : fbNormal);
  let bigFont = hasIntl ? intlLarge : (ascii ? "8x16:2" : fbLarge);
  let L, w = body.w-4;
  if (total<120) {
    L = buildLines(grp.msgs, texts, bigFont, w);
    let lh = lineHeight(bigFont);
    if ((L.lines.length+(hasBar?1:0))*lh <= body.h) font = bigFont;
    else L = undefined;
  }
  if (!L) L = buildLines(grp.msgs, texts, font, w);
  let lh = lineHeight(font);
  texts = undefined;

  // Scroll position
  let scroll = 0;
  if (prev) {
    scroll = prev.scroller.scroll;
    if (anchor && L.starts[anchor.id]!==undefined) scroll = (L.starts[anchor.id]+anchor.off)*lh;
    if (newId!==undefined && L.starts[newId]!==undefined) { // show the new message if it isn't visible
      let ny = L.starts[newId]*lh;
      if (ny<scroll || ny+lh>scroll+body.h) scroll = ny;
    }
  } else { // first time: start at the oldest unread message of the group
    for (let i=grp.msgs.length-1; i>=0; i--)
      if (grp.msgs[i].new && L.starts[grp.msgs[i].id]!==undefined) {
        scroll = L.starts[grp.msgs[i].id]*lh;
        break;
      }
  }

  let scroller = showScroller({
    h : lh, // height of each line in pixels
    c : L.lines.length + (hasBar?1:0), // number of lines
    rect : body,
    scroll : scroll,
    draw : function(idx, r) { "ram";
      g.setBgColor(g.theme.bg).clearRect(r.x, r.y, r.x+r.w-1, r.y+r.h-1).setColor(g.theme.fg);
      if (idx<L.lines.length) {
        setF(font);
        g.setFontAlign(0,-1).drawString(L.lines[idx], r.x+r.w/2, r.y+1);
        if (L.sep[idx]) for (let x=r.x+8; x<r.x+r.w-8; x+=3) g.setPixel(x, r.y); // dotted line between messages
      } else { // swipe hints for the actions
        let y = r.y+(r.h-16)/2;
        if (negHandler) g.drawImage(atob("PhAB4A8AAAAAAAPAfAMAAAAAD4PwHAAAAAA/H4DwAAAAAH78B8AAAAAA/+A/AAAAAAH/Af//////w/gP//////8P4D///////H/Af//////z/4D8AAAAAB+/AfAAAAAA/H4DwAAAAAPg/AcAAAAADwHwDAAAAAA4A8AAAAAAAA=="), r.x+2, y);
        if (posImg) g.drawImage(atob(posImg), r.x+r.w-67, y);
      }
    },
    remove : function() {
      Bangle.removeListener("drag", dragHandler);
      Bangle.removeListener("swipe", swipeHandler);
      Bangle.removeListener("lock", lockHandler);
      Bangle.removeListener("touch", touchHandler);
      if (headerTimeout) clearTimeout(headerTimeout);
      headerTimeout = undefined;
      SHOWN = undefined;
      if (!settings.showWidgets) require("widget_utils").show();
    },
    back : function() {
      markGroupRead(msg); // read mail
      cancelReloadTimeout(); // don't auto-reload to clock now
      returnToClockIfEmpty();
    }
  });
  SHOWN = {grp:grp, ids:grp.msgs.map(m => m.id), starts:L.starts, lh:lh, scroller:scroller, R:R};
  drawHeader();
  headerTimer();

  let dragHandler = addDragHandlerToChangeMessage(groupIndexOf(msg.id), scroller);
  // handle swipes
  let swipeHandler = (lr,ud) => {
    // left/right accept/reject
    if (lr>0 && posHandler) {
      Bangle.buzz(30);
      posHandler();
    }
    if (lr<0 && negHandler) {
      Bangle.buzz(30);
      negHandler();
    }
    /* handle up/down in drag handler because we want to
    move message only when the finger is released, or subsequent
    finger movement will end up dragging the new message */
  };
  Bangle.on("swipe", swipeHandler);
  let lockHandler = () => drawHeader();
  Bangle.on("lock",lockHandler); // redraw the lock icon
  // tap on the header: message menu
  let touchHandler = (_,e) => {
    if (e.y<body.y) {
      cancelReloadTimeout(); // don't auto-reload to clock now
      showMessageSettings(msg);
    }
  };
  Bangle.on("touch", touchHandler);
}


/* options = {
  clockIfNoMsg : bool
  clockIfAllRead : bool
  ignoreUnread : bool   // don't automatically navigate to the first unread message
  openMusic : bool      // open music if it's playing
  dontStopBuzz : bool   // don't stuf buzzing (any time other than the first this is undefined/false)
}
*/
function checkMessages(options) {
  options=options||{};
  // If there's been some user interaction, it's time to stop repeated buzzing
  if (!options.dontStopBuzz)
    require("messages").stopBuzz();
  // If no messages, just show 'no messages' and return
  if (!MESSAGES.length) {
    active=undefined; // no messages
    if (!options.clockIfNoMsg) return E.showPrompt(/*LANG*/"No Messages",{
      title:/*LANG*/"Messages",
      img:require("heatshrink").decompress(atob("kkk4UBrkc/4AC/tEqtACQkBqtUDg0VqAIGgoZFDYQIIM1sD1QAD4AIBhnqA4WrmAIBhc6BAWs8AIBhXOBAWz0AIC2YIC5wID1gkB1c6BAYFBEQPqBAYXBEQOqBAnDAIQaEnkAngaEEAPDFgo+IKA5iIOhCGIAFb7RqAIGgtUBA0VqobFgNVA")),
      buttons : {/*LANG*/"Ok":1},
      back: () => exitToClock()
    }).then(() => exitToClock());
    return;
  }
  // we have >0 messages
  var newMessages = MESSAGES.filter(m=>m.new&&m.id!="music");
  // If we have a new message, show it (the newest one, with the messages merged with it)
  if (!options.ignoreUnread && newMessages.length) {
    delete newMessages[0].show; // stop us getting stuck here if we're called a second time
    showMessage(newMessages[0].id, false);
    // buzz after showMessage, so being busy during layout doesn't affect the buzz pattern
    if (global.BUZZ_ON_NEW_MESSAGE) {
      // this is set if we entered the messages app by loading `retromessagegui.new.js`
      // ... but only buzz the first time we view a new message
      global.BUZZ_ON_NEW_MESSAGE = false;
      // messages.buzz respects quiet mode - no need to check here
      require("messages").buzz(newMessages[0].src);
    }
    return;
  }
  // no new messages: show playing music? Only if we have playing music, or state=="show" (set by messagesmusic)
  if (options.openMusic && MESSAGES.some(m=>m.id=="music" && ((m.track && m.state=="play") || m.state=="show")))
    return showMessage('music', true);
  // no new messages - go to clock?
  if (options.clockIfAllRead && newMessages.length==0)
    return exitToClock();
  active = "list";
  // Otherwise show a list of messages (merged messages are one item)
  E.showScroller({
    h : 50,
    c : Math.max(groupCount(),3), // workaround for 2v10.219 firmware (min 3 not needed for 2v11)
    draw : function(idx, r) {"ram"
      var grp = groupAt(idx), msg = grp && grp.msgs[0];
      if (grp && grp.msgs.some(m => m.new)) g.setBgColor(g.theme.bgH).setColor(g.theme.fgH);
      else g.setBgColor(g.theme.bg).setColor(g.theme.fg);
      g.clearRect(r.x,r.y,r.x+r.w, r.y+r.h);
      if (!msg) return;
      var x = r.x+2, title = normTitle(msg.title), body = msg.body;
      var img = require("messageicons").getImage(msg);
      if (msg.id=="music") {
        title = msg.artist || /*LANG*/"Music";
        body = msg.track;
      }
      if (grp.msgs.length>1) title += " ("+grp.msgs.length+")";
      if (img) {
        g.drawImage(img, x+20, r.y+24, {rotate:0}); // force centering
        x += 40;
      }
      if (title) {
        setF(pickFont(title, "8x16", fbNormal));
        g.setFontAlign(-1,-1).drawString(fit(title, r.x+r.w-x-2), x, r.y+2);
      }
      var longBody = false;
      if (body) {
        setF(pickFont(body, "8x12", "6x8"));
        g.setFontAlign(-1,0);
        // if the body includes an image, it probably won't be small enough to allow>1 line
        let maxLines = Math.floor(30/g.getFontHeight());
        if (body.includes("\0")) { maxLines=1; }
        var l;
        try {
          l = g.wrapString(safeCut(body, 200), r.w-(x+8));
        } catch(e) {
          console.log("Invalid message body", e);
          l = ["[Invalid message]"];
        }
        if (l.length>maxLines) {
          l = l.slice(0,maxLines);
          l[l.length-1]+="..";
        }
        longBody = l.length>1;
        // draw the body
        g.drawString(l.join("\n"), x, r.y+19+l.length*g.getFontHeight()/2);
      }
      if (!longBody && msg.src) g.setFontAlign(1,1).setFont("6x8").drawString(msg.src, r.x+r.w-2, r.y+r.h-2);
      g.setColor(g.theme.fg).fillRect(r.x,r.y+r.h-1,r.x+r.w-1,r.y+r.h-1); // dividing line between items
    },
    select : idx => {
      var grp = groupAt(idx);
      if (grp) showMessage(grp.msgs[0].id, true);
    },
    back : () => exitToClock()
  });
}

function returnToCheckMessages(clock) {
  checkMessages({clockIfNoMsg:1,clockIfAllRead:1,ignoreUnread:settings.ignoreUnread,openMusic});
}

function returnToMain() {
  checkMessages({clockIfNoMsg:0,clockIfAllRead:0,ignoreUnread:1,openMusic:0});
}

function returnToClockIfEmpty() {
  checkMessages({clockIfNoMsg:1,clockIfAllRead:0,ignoreUnread:1,openMusic});
}

/** Go back to the clock. Frees everything this app allocated (timers, listeners, the
 kill handler) and uses Bangle.showClock(), which fast-loads the clock when the clock
 supports it, instead of a full reset with load(). */
function exitToClock() {
  if (exiting) return;
  exiting = true;
  cancelReloadTimeout();
  if (redrawMsgInterval) clearInterval(redrawMsgInterval);
  if (headerTimeout) clearTimeout(headerTimeout);
  redrawMsgInterval = headerTimeout = undefined;
  // This setUI first runs the remove handler of the screen on show (removing its listeners).
  // Bangle.showClock() -> Bangle.load() then runs the remove handler below, which frees the
  // rest of the app, and fast-loads the clock.
  Bangle.setUI({mode:"custom", remove:function() {
    Bangle.removeListener("message", onMessagesModified);
    Bangle.removeListener("lock", onLock);
    E.removeListener("kill", onKill);
    require("messages").write(MESSAGES, true/*force*/); // what the kill handler did
    require("messages").toggleWidget(true);
    delete Graphics.prototype.setFont8x16;
    delete Graphics.prototype.setFont8x12;
    delete Graphics.prototype.setFont7x11Numeric7Seg;
    g.setTheme(savedTheme);
    var keep = RMG_GLOBALS;
    Object.keys(global).forEach(function(k) { if (keep.indexOf(k)<0 && k!="BUZZ_ON_NEW_MESSAGE") delete global[k]; });
    delete global.RMG_GLOBALS;
  }});
  Bangle.showClock();
}
var exiting = false;

function cancelReloadTimeout() {
  if (!unreadTimeout) return;
  clearTimeout(unreadTimeout);
  unreadTimeout = undefined;
}

function resetReloadTimeout(){
  cancelReloadTimeout();
  if (!isFinite(settings.unreadTimeout)) settings.unreadTimeout=60;
  if (settings.unreadTimeout)
    unreadTimeout = setTimeout(exitToClock, settings.unreadTimeout*1000);
}

g.clear();

Bangle.loadWidgets();
require("messages").toggleWidget(false);
Bangle.drawWidgets();

setTimeout(() => {
  // only openMusic on launch if music is new, or state=="show" (set by messagesmusic)
  var musicMsg = MESSAGES.find(m => m.id === "music");
  checkMessages({
    clockIfNoMsg: 0, clockIfAllRead: 0, ignoreUnread: settings.ignoreUnread,
    openMusic: ((musicMsg&&musicMsg.new) && settings.openMusic) || (musicMsg&&musicMsg.state=="show"),
    dontStopBuzz: 1 });
}, 10); // if checkMessages wants to 'load', do that

/* If the Bangle is unlocked by the user, treat that
as a queue to stop repeated buzzing */
var onLock = function(locked) {
  if (!locked)
    require("messages").stopBuzz();
};
Bangle.on('lock', onLock);
