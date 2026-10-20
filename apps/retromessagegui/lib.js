/**
 * Listener set up in boot.js, calls into here to keep boot.js short
 */
exports.listener = function(type, msg) {
  // Gadgetbridge sends no date: record the time of arrival (used to merge bursts of messages)
  if (msg.t==="add" && msg.date===undefined) msg.date = Date.now();
  // Default handler: Launch the GUI for all unhandled messages (except music if disabled in settings)
  if (msg.handled || (global.__FILE__ && __FILE__.startsWith('retromessagegui.'))) return; // already handled or app open

  // if no new messages now, make sure we don't load the messages app
  if (exports.messageTimeout && !msg.new && require("messages").status(msg) !== "new") {
    clearTimeout(exports.messageTimeout);
    delete exports.messageTimeout;
  }
  if (type==="clearAll") {
    require("messages").stopBuzz();
    return;
  }
  if (msg.t==="remove") {
    // we won't open the UI for removed messages, so make sure to delete it from flash
    if (Bangle.MESSAGES) {
      // we were waiting for exports.messageTimeout
      require("messages").apply(msg, Bangle.MESSAGES);
      if (!Bangle.MESSAGES.length) delete Bangle.MESSAGES;
    }
    if(type!=="music")
      require("messages").stopBuzz();
    return require("messages").save(msg); // always write removal to flash
  }

  const appSettings = require("Storage").readJSON("messages.settings.json", 1) || {};
  const autoOpen = appSettings.autoOpen ?? 1;
  const autoOpenFor = m => (
    (autoOpen === 1 && Bangle.CLOCK) || (autoOpen === 2 && (Bangle.isLocked() || Bangle.CLOCK)) || autoOpen === 3 ||
      m.important
  );
  let loadMessages = autoOpenFor(msg); // should we load the messages app?
  if (type==="music")
    loadMessages = Bangle.CLOCK && msg.state && msg.title && appSettings.openMusic;

  // Write the message to Bangle.MESSAGES. We'll deal with it in messageTimeout below
  if (!Bangle.MESSAGES) Bangle.MESSAGES = [];
  require("messages").apply(msg, Bangle.MESSAGES);
  // apply() puts new messages first, but getMessages() applies Bangle.MESSAGES one by one (each
  // new one first), which reverses them. Keep Bangle.MESSAGES oldest first so the result is newest first.
  if (Bangle.MESSAGES[0]===msg) Bangle.MESSAGES.push(Bangle.MESSAGES.shift());
  if (!Bangle.MESSAGES.length) delete Bangle.MESSAGES;
  else if (!Bangle.MESSAGES_KILL_HANDLER) { // ensure we save on exit now
    Bangle.MESSAGES_KILL_HANDLER = function() {
      if (!Bangle.MESSAGES || !Bangle.MESSAGES.length) return;
      // all messages are in Bangle.MESSAGES already. (messagegui passes the first `msg` here, which
      // moves that message back to the top of the list, before newer messages)
      let messages = require("messages").getMessages();
      require("messages").write(messages);
      delete Bangle.MESSAGES;
    };
    E.on("kill", Bangle.MESSAGES_KILL_HANDLER);
  }
  msg.handled = true;
  if (!msg.new) return; //  if it's not new, we don't do anything - just save on exit
  const quiet = (require("Storage").readJSON("setting.json", 1) || {}).quiet;
  const unlockWatch = appSettings.unlockWatch;
  // don't auto-open messages in quiet mode if quietNoAutOpn is true
  if (quiet && appSettings.quietNoAutOpn)
    loadMessages = false;
  // after a delay load the app, to ensure we have all the messages
  if (exports.messageTimeout) clearTimeout(exports.messageTimeout);
  exports.messageTimeout = setTimeout(function() {
    delete exports.messageTimeout;
    if (!Bangle.MESSAGES) return; // message was removed during the delay
    if (!Bangle.MESSAGES.some(m => m.id==msg.id)) { // msg was removed: use the newest pending new message
      if (type==="music") return;
      let pending = Bangle.MESSAGES.filter(m => m.new && m.id!=="music");
      if (!pending.length) return;
      msg = pending[pending.length-1]; // Bangle.MESSAGES is oldest first
      loadMessages = autoOpenFor(msg) && !(quiet && appSettings.quietNoAutOpn);
    }
    if (!loadMessages) { // not opening the app, just buzz
      if (type!=="music") require("messages").buzz(msg.src); // buzz ignores quiet mode
    } else {
      if (!quiet && unlockWatch) {
        Bangle.setLocked(false);
        Bangle.setLCDPower(1); // turn screen on
      }
      // now open the GUI
      exports.open(msg);
    }
  }, 500);
};

/**
 * Launch GUI app with given message
 * @param {object} msg
 */
exports.open = function(msg) {
  // force a display by setting it as new and ensuring it ends up at the beginning of messages list
  // (Bangle.MESSAGES is oldest first, see listener)
  if (msg && msg.id) {
    msg.new = 1;
    if (!Bangle.MESSAGES) Bangle.MESSAGES=[];
    Bangle.MESSAGES = Bangle.MESSAGES.filter(m => m.id!=msg.id)
    Bangle.MESSAGES.push(msg);
  }
  // load the app
  Bangle.load((msg && msg.new && msg.id!=="music") ? "retromessagegui.new.js" : "retromessagegui.app.js");
};