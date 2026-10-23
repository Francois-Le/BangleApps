/* Open-Meteo weather provider: fetches the weather through Gadgetbridge's
   internet access (Bangle.http) and stores it like Gadgetbridge weather does
   (weather.json + weather2.json), so the Weather app and clocks can use it. */
const SETTINGS_FILE = "openmeteo.json";

// WMO weather code (Open-Meteo) -> OpenWeatherMap condition code (used by the Weather app) + text
function owm(c) {
  if (c==0) return [800,"Clear"];
  if (c==1) return [801,"Mainly clear"];
  if (c==2) return [802,"Partly cloudy"];
  if (c==3) return [804,"Overcast"];
  if (c==45||c==48) return [741,"Fog"];
  if (c==51) return [300,"Light drizzle"];
  if (c==53) return [301,"Drizzle"];
  if (c==55) return [302,"Heavy drizzle"];
  if (c==56||c==57||c==66||c==67) return [511,"Freezing rain"];
  if (c==61) return [500,"Light rain"];
  if (c==63) return [501,"Rain"];
  if (c==65) return [502,"Heavy rain"];
  if (c==71) return [600,"Light snow"];
  if (c==73) return [601,"Snow"];
  if (c==75) return [602,"Heavy snow"];
  if (c==77) return [600,"Snow grains"];
  if (c==80) return [520,"Showers"];
  if (c==81) return [521,"Showers"];
  if (c==82) return [522,"Heavy showers"];
  if (c==85||c==86) return [620+(c-85),"Snow showers"];
  if (c==95) return [211,"Thunderstorm"];
  if (c==96||c==99) return [202,"Thunderstorm"];
  return [800,""];
}

function wrose(deg) {
  return ["n","ne","e","se","s","sw","w","nw","n"][Math.floor(((deg%360)+22.5)/45)];
}

exports.url = function(loc) {
  return "https://api.open-meteo.com/v1/forecast?latitude="+loc.lat.toFixed(2)+"&longitude="+loc.lon.toFixed(2)+
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability"+
    "&hourly=temperature_2m,precipitation_probability,weather_code"+
    "&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max"+
    "&forecast_hours=25&forecast_days=1&timezone=auto&timeformat=unixtime";
};

/** Convert an Open-Meteo response and store it. Returns the stored weather. */
exports.store = function(d, locName) {
  const S = require("Storage");
  let c = d.current, day = d.daily, h = d.hourly, code = owm(c.weather_code);
  let now = Date.now();
  let w2 = {
    t:"weather2", v:2, time:now,
    temp:Math.round(c.temperature_2m), hum:c.relative_humidity_2m,
    rain:c.precipitation_probability|0, uv:day.uv_index_max[0],
    code:code[0], txt:code[1],
    wind:Math.round(c.wind_speed_10m), wdir:c.wind_direction_10m, wrose:wrose(c.wind_direction_10m),
    loc:locName,
    hi:Math.round(day.temperature_2m_max[0]), lo:Math.round(day.temperature_2m_min[0]),
    feels:Math.round(c.apparent_temperature),
    sunrise:day.sunrise[0], sunset:day.sunset[0],
    hourfcast:{
      time:h.time,
      temp:h.temperature_2m.map(Math.round),
      code:h.weather_code.map(x=>owm(x)[0]),
      rain:h.precipitation_probability.map(x=>x|0)
    }
  };
  // v1 format (temperatures in Kelvin) for apps that read weather.json
  let w1 = {
    time:now, temp:w2.temp+273, hi:w2.hi+273, lo:w2.lo+273, feels:w2.feels+273,
    hum:w2.hum, rain:w2.rain, uv:w2.uv, code:w2.code, txt:w2.txt,
    wind:w2.wind, wdir:w2.wdir, wrose:w2.wrose, loc:locName
  };
  S.writeJSON("weather2.json", w2);
  // the Weather app only returns the forecast part when its data type is not "basic"
  let ws = S.readJSON("weatherSetting.json", 1) || {};
  if ((ws.dataType || "basic") == "basic") { ws.dataType = "forecast"; S.writeJSON("weatherSetting.json", ws); }
  S.writeJSON("weather.json", {t:"weather", weather:w1});
  if (S.read("weather")!==undefined) {
    let wl = require("weather");
    wl.emit("update", w1);
    wl.emit("update2");
  }
  return w2;
};

/** Fetch the weather. Calls done(err) when finished (err undefined on success). */
exports.pull = function(done) {
  const S = require("Storage");
  let st = S.readJSON(SETTINGS_FILE, 1) || {};
  let fin = function(err) {
    st = S.readJSON(SETTINGS_FILE, 1) || {};
    st.tried = Date.now();
    if (err) st.error = ""+err; else { st.updated = Date.now(); delete st.error; }
    S.writeJSON(SETTINGS_FILE, st);
    if (done) done(err);
  };
  let loc = S.readJSON("mylocation.json", 1);
  if (!loc || loc.lat===undefined) return fin("No location: set it in My Location");
  if (!Bangle.http) return fin("No internet access (Gadgetbridge)");
  Bangle.http(exports.url(loc), {timeout:20000}).then(ev => {
    let d;
    try { d = JSON.parse(ev.resp); } catch (e) { return fin("Bad response"); }
    if (!d || !d.current) return fin(d && d.reason ? d.reason : "Bad response");
    exports.store(d, loc.location || "");
    d = undefined;
    fin();
  }).catch(e => fin(e));
};
