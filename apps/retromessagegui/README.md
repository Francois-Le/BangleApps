# Retro Messages

A messages app for Bangle.js 2 in the style of the [Retro Watch](../retrowatch) clock.
It is a fork of the default Messages UI (`messagegui`) and replaces it.

## Differences with Messages UI

* **Retro style**: cyan on black, retro bitmap fonts. Text with accents or emoji uses the
  built-in fonts (or the font library, if installed).
* **Compact header** (30 px), always on screen:
  * line 1: app icon and name, age of the message, lock icon, current time
  * line 2: the sender. In a WhatsApp group chat the sender comes first, then `@group name`,
    so a long group name never hides the sender.
* **Merged messages**: when a person sends several messages in a row, they show as one
  message, oldest first, with a dotted line between them. A message is merged with the
  previous one from the same sender if:
  * it came at most the *merge window* later (default 30 s, see settings), and
  * nobody else wrote in the same conversation in between.

  WhatsApp adds counts to titles (`Al (2 messages)`, `Family (3 messages): Al`). The app
  removes them before it compares senders. At most 10 messages are merged into one,
  and only the 40 newest messages can be merged.
* When a merged message opens, it scrolls to the first unread part. When a new
  message is added to the message on screen, the text you are reading does not move,
  unless the new part is not visible.

## Usage

* Drag up/down to scroll. At the top/bottom, swipe up/down to go to the next/previous message.
* Swipe right: reply, actions or open on phone. Swipe left: dismiss.
  The arrows at the end of the message show which ones are available.
* Tap the header: message menu (delete, mark unread, ...).
* Button: back to the message list or the clock.

Actions (reply, dismiss, ...) apply to the newest message of a merged message, because that is
the notification that is still on the phone. Read/unread and delete apply to all of its messages.

## Settings

* `Settings > App Settings > Retro Messages > Merge window`: Off, 10s, 30s, 1m, 2m or 5m.
* All other settings are in `Settings > App Settings > Messages` (shared with Messages UI).

## Install (Espruino Web IDE)

1. Uninstall **Messages UI** (`messagegui`) from the App Loader, or delete its files:
   `messagegui.app.js`, `messagegui.new.js`, `messagegui.boot.js`, `messagegui.img`, `messagegui.info`.
   Two message UIs installed at the same time both handle each message.
2. Upload the files listed in `metadata.json` (`storage`) with their storage names.
   `lib.js` is stored as `messagegui`: the Messages library and other apps use this name.
3. Write `retromessagegui.info`, for example:

   ```js
   require("Storage").writeJSON("retromessagegui.info",{id:"retromessagegui",name:"Retro Messages",src:"retromessagegui.app.js",icon:"retromessagegui.img",type:"app",version:"0.01",sortorder:-9,files:"retromessagegui.info,messagegui,retromessagegui.app.js,retromessagegui.new.js,retromessagegui.boot.js,retromessagegui.settings.js,retromessagegui.img",data:"retromessagegui.json"});
   ```
4. Restart the watch (long press on the button) so that the boot file runs.

Works with released firmware (it does not need the `rect` option of `E.showScroller`). Needs the `messages`,
`messageicons` and (optional) `reply` modules, which come with Android Integration.

## Tests

* `node test/grouping.test.js`: tests of the merge logic.

## Credits

Based on Messages UI by Gordon Williams and contributors
([BangleApps](https://github.com/espruino/BangleApps), MIT licence).
Icons from Messages UI are from https://icons8.com.
