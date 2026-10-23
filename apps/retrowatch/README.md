# Retro Watch

A clock face for Bangle.js 2.

## Features

* Time, day of week, date, month and battery level.
* Seconds dial (updated every second), inspired by the Seiko MGS5 watch.
* Status icon in the centre of the dial: Bluetooth disconnected, locked, or music play/pause.
* The last text messages, one line per conversation with the number of messages, for example Al (3).
  WhatsApp counts such as (2 messages) are ignored. A WhatsApp group chat (Family: Bob) is one line (Family).
* Music: the track across the top of the screen, the artist next to the dial. Long names end with "...".
* Weather, when no music is playing: temperature, sun position between sunrise and sunset (with the times),
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
