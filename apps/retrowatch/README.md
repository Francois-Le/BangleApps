# Retro Watch

A clock face for Bangle.js 2.

## Features

* Time (24h), ISO week number, day of the year and a bar showing how much of the day has passed.
* Day of week, day of the month, month (3 letters) and battery level.
* Seconds dial (updated every second), inspired by the Seiko MGS5 watch.
* Status plate in the centre of the dial: LINK (Bluetooth disconnected), LOCK (locked), PLAY or HOLD (music).
* The last text messages as three cards, one per conversation: app icon, age of the newest message (now, 4m, 2h, 3d), sender and the start of the last message.
  WhatsApp counts such as (2 messages) are ignored. A WhatsApp group chat (Family: Bob) is one line (Family).
* Music: the track across the top of the screen, the artist next to the dial. Long names end with "...".
* Weather, when no music is playing: an icon for today's weather (sun, clouds, rain, snow, storm, fog), temperature, sun position between sunrise and sunset (with the times; at night a moon between sunset and the next sunrise),
  wind speed (km/h) and direction, and a graph of the chance of rain for the next 24 hours.
  The weather comes from Gadgetbridge through the Weather app. For the rain graph, set
  Settings -> Apps -> Weather -> Data type to "forecast". Gadgetbridge needs a weather provider app
  on the phone (for example Breezy Weather).

## Controls

* Tap the dial: play/pause music.
* Swipe left/right: previous/next track.
* Swipe up/down: volume up/down.
* Tap the bottom of the screen: open the messages app.

## Files

* `app.js`: the clock face.
* `app-icon.js`, `app.png`: launcher and App Loader icons.

## Development

The seconds dial and the 60 pointer images are pre-rendered into `dial.bin` so the watch
doesn't compute them at startup. After changing the dial, run `node tools/make-dial.js`.
