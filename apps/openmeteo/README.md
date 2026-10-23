# Open-Meteo weather provider

Gets the weather for the Weather app and clocks (for example Retro Watch) directly from
[Open-Meteo](https://open-meteo.com), without a weather app on the phone.

Open-Meteo is free for non-commercial use and needs no account or API key.

## What you get

Temperature, feels like, humidity, wind speed (km/h) and direction, conditions, today's high/low,
UV, sunrise and sunset, and the next 25 hours of temperature, conditions and chance of rain.
The data is stored in the same format as Gadgetbridge weather (`weather.json` and `weather2.json`).
So that apps get the forecast, the Weather app's "Data type" setting is switched to "forecast" if it is "basic".

## Setup

1. Gadgetbridge must allow internet access for the watch
   (Bangle.js device settings in Gadgetbridge -> "Allow internet access").
2. Set your location with the **My Location** app (installed with this app).
3. The weather is fetched 5 seconds after the watch starts and then every 30 minutes
   (only while the phone is connected).
4. Settings -> Apps -> Open-Meteo: turn on/off, change the refresh interval, see when the
   weather was last updated and the last error, or refresh now.

If you also have a weather app on the phone that sends weather through Gadgetbridge, both will
write the weather; the most recent one is shown.

## Data

Weather data by [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0).
