require("Font7x11Numeric7Seg").add(Graphics);
require("Font6x8").add(Graphics);
require("Font8x12").add(Graphics);
require("Font8x16").add(Graphics);

const lock_img = require("heatshrink").decompress(atob("mMxgP/ACX+gAFD/EAh4FC+EAEQYFBgF/AoPgAoISC8EH+EDAoUf/4lC+AFB4AYB+E/FgIIBAoX+g4ID/4eBAofA//8AoXwv/+GYX4n4aCB4IJBAoQDCwYFCAYPBAoQDB8AFCAYImBFQYmBFQZmCAAMDOQQABgKEBAAf8Aol+Aok/AokfwAFDh/AAocHGH4wbToQAIwA="));

const play_img = require("heatshrink").decompress(atob("mMxgP/+//AAf5Aon8v4FD/0fBgkHAomBAonADAngDAnwDAn4HIIwDgAYD/0ADAkADAmADAnADAngDAnwDAn4gAYDGAIYDGAIYEAoIYDwAYEGAIYDGAIYDGAIYDGAIFDGAQFCGAQqDGA4FDGAIFDGAIFDMI4FDGAIFDGAKMESQwFE4AFE8AFEYYwFE/gFE/zuFAouHAonHAonnAon3I4g"));

const pause_img = require("heatshrink").decompress(atob("mMxgP/ACUD/+BAoQDB4AFCAYPgv4FBAYPwn4FBAYP4j4FBAYP8h4FBAYP+g4FBAYQsBGH4w/GH4wXACGAA=="));

const bluetooth_img = atob("MTEB////////////////////////////x///////wf//////4H//////8B//////+Af//////AH//////hB//////wwf/////4cH/////8PB////z+Hwf///w/D8H///4Ph/D///+Dw+D////g4eD////4MOD////+CGD/////gCD/////4AD/////+AD//////gD//////4D//////8B//////8Af/////8AH/////8AB/////8AQf////8EMH////8GHB////8HDwf///8Hh8H///8Hw/B///+H4fg////n8Pg/////+Hg//////Dg//////hg//////wg//////4A//////8A//////+A///////A///////g///////4////////////////////gA==");

function drawBackground() {
  var img = require("heatshrink").decompress(atob("2Gw4n//8HEbsRAH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4AYiEAAH4AQgJW/LDRC/ACqu/WDBX/K65A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/iIA/ACx1diAbagLN6K/5X/K/5X/K5EBiJX/K6yyZK/w+YK/5XcgLOYDYYdYK8ERK7EBiIAED6pXCHDI8EK+8RczKuDDzIAcRrBXFSYQeZV7hXdGy4eEdYIBEK6ztDK66SCK/5XUcwTOaDoQACK66RZgI5FD66veiBX/K6o7CK7ADCK4QeYOoh2WK4I+EK647CZzKvdK74dXK7w2YK4iuaOYYADK+wfaADbHBHwZXXSQJ3bK/ZW2K4IBBSTBXCV25XeAHJUBHrJXdZTpX4gJX/Di8RZvBXciMRWDhX3VwJYdK+xWDAH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4A/AH4AW"))
  g.drawImage(img, 0, 0);
}

var isMusicActive = false;
var isMusicPlaying = false;
var musicTrack = "";
var musicArtist = "";


function updateIcon()
{
  //print("update icon");
  g.reset();
  g.setColor(0, 1, 1);
  g.setBgColor(0, 0, 0);
  
  if (!NRF.getSecurityStatus().connected)
  {
    g.setBgColor(1, 0, 0);
    g.drawImage(bluetooth_img, 6, 39);
  }
  else if(Bangle.isLocked())
  {
    //print("show lock");
    g.drawImage(lock_img, 6, 39);
  }
  else if(isMusicActive)
  {
    if(isMusicPlaying)
    {
      //print("show play");
      g.drawImage(play_img, 6, 39);
    }
    else
    {
      //print("show pause");
      g.drawImage(pause_img, 6, 39);
    }
  }
  else
  {    
    g.fillRect(6, 39, 6+49, 39+49);
  }
}

const dragDetectionThreshold = 40;
const dragDetectonRejectionRatio = 0.3;
var dragState = {startX:0, startY:0, started:false};

function musicTogglePlay()
{
  Bluetooth.println(JSON.stringify({t:"music", n:(isMusicPlaying ? "pause" : "play")}));
}

function musicNext()
{
  Bluetooth.println(JSON.stringify({t:"music", n:"next"}));
}

function musicPrev()
{
  Bluetooth.println(JSON.stringify({t:"music", n:"previous"}));
}

function musicVolUp()
{
  Bluetooth.println(JSON.stringify({t:"music", n:"volumeup"}));
}

function musicVolDown()
{
  Bluetooth.println(JSON.stringify({t:"music", n:"volumedown"}));
}

function draw() {
  // work out how to display the current time
  var d = new Date();
  var h = d.getHours(), m = d.getMinutes();
  var time = (" "+h).substr(-2) + ":" + m.toString().padStart(2,0);
  
  var l = require("locale");
  
  g.reset();
  g.setBgColor(0, 1, 1);
  
  g.setFont("7x11Numeric7Seg",3);
  g.drawString(time, 60, 47, true);
  
  g.setFont("8x12", 2);
  g.drawString(l.dow(d,1), 20, 100, true);
  g.drawString(""+d.getDate(), 81, 103, true);
  
  g.setFont("6x8", 1);
  g.drawString(l.month(d,1), 84, 96, true);
  
  
  g.setFont("7x11Numeric7Seg",2);
  g.drawString(E.getBattery(), 139, 101, true);
}

function findFirstDiffPos(a, b) {
  var i = 0;
  while (a[i] === b[i] && i < a.length && i < b.length) i++;
  return i;
}

function updateMessages(message)
{
  //console.log("updateMessages");
  //console.log("All messages:", require("messages").getMessages(message));
 
  const messageMatchingLen = 8;
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
    
    var entry = { 
      msg: m.title || m.body, 
      img: require("messageicons").getImage(m),
      count: 1
    };
    
    var foundAnyMatch = false;
    for (var existingEntry of entries)
    {
      var matchLen = findFirstDiffPos(entry.msg, existingEntry.msg);
      
      if (matchLen >= messageMatchingLen)
      {
        foundAnyMatch = true;
        existingEntry.msg = existingEntry.msg.substring(0, matchLen);
        existingEntry.count++;
      }
    }
    
    if(!foundAnyMatch) entries.push(entry);
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

function drawMusicInfo()
{
  g.reset();
  g.setBgColor(0, 0, 0);
  g.setColor(0, 1, 1);
  g.clearRect(0, 0, 175, 30);

  g.setFont("8x16", 1);
  g.drawString(musicTrack, 1, 1);
  g.setFont("8x12", 1);
  g.drawString(musicArtist, 1, 18);
}

drawBackground();
draw();
var secondInterval = setInterval(draw, 1000*60);

myMessageListener = Bangle.on("message", (type, message)=>{
  //if (message.handled) return; // another app already handled this message
  //print("on message");
  
  if (type == "text")
  {
    updateMessages(message);
    //E.showMessage(`${message.title}\n${message.body}`, `${message.t} ${type} message`);
    message.handled = true; // Prevend default message app from launching.
  }
});

global.GB = (_GB => e => {
      // we eat music events!
      switch(e.t) 
      {
        case "musicinfo":
          //print(e);
          isMusicActive = true;
          isMusicPlaying = true;
          musicTrack = e.track || "";
          musicArtist = (e.artist || "") + ((" - " +e.album) || "");
          drawMusicInfo();
          updateIcon();
          break;
        case "musicstate":
          //print(e);
          isMusicActive = true;
          isMusicPlaying = e.state == "play";
          updateIcon();
          break;
        default:
          // pass on other events
          if (_GB) setTimeout(_GB, 0, e);
      }
    })(global.GB);

Bangle.on('touch', function(zone,e) { 
  //print(e.x + " " + e.y);
  if (e.x < 62 && e.y > 32 && e.y < 95 && isMusicActive) musicTogglePlay();
  if(e.y > 130) require("messages").openGUI();
});

Bangle.on('drag', function(e) {
  if (e.b > 0)
  {
    if (!dragState.started)
    {
      dragState.startX = e.x;
      dragState.startY = e.y;
      dragState.started = true;
    }
  }
  else
  {
    var dx = e.x - dragState.startX;
    var dy = e.y - dragState.startY;
    //print(`${dx} ${dy}`);
    
    if (dx > dragDetectionThreshold && Math.abs(dy/dx) < dragDetectonRejectionRatio) musicNext();
    if (dx < -dragDetectionThreshold && Math.abs(dy/dx) < dragDetectonRejectionRatio) musicPrev();
    if (dy > dragDetectionThreshold && Math.abs(dx/dy) < dragDetectonRejectionRatio) musicVolDown();
    if (dy < -dragDetectionThreshold && Math.abs(dx/dy) < dragDetectonRejectionRatio) musicVolUp();
    
    dragState.started = false;
  }
});

Bangle.on('lock', function(on) { updateIcon(); });
NRF.on('connect',updateIcon);
NRF.on('disconnect',updateIcon);

updateMessages();
updateIcon();

Bangle.setUI("clock");

// Bangle.emit("message", "text", {body:"xxx"});
