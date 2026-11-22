// Weather from Open-Meteo (free, no account or key needed)
import { S, esc, household, run, openSheet, actions, hooks } from './core.js';

const CODES = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly sunny'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'], 56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
  61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorms'], 96: ['⛈️', 'Storms & hail'], 99: ['⛈️', 'Storms & hail'],
};
export const wx = (code, isDay = true) => {
  const [icon, text] = CODES[code] || ['🌡️', ''];
  return [!isDay && code <= 1 ? '🌙' : icon, text];
};

export async function loadWeather(force = false) {
  const h = household();
  if (!h) return;
  const key = `${h.weather_lat},${h.weather_lon}`;
  if (!force && S.weather && S.weather.key === key && Date.now() - S.weather.at < 30 * 60e3) return;
  if (S.api.demo) {
    const today = new Date();
    S.weather = { key, at: Date.now(), current: { temp: 78, feels: 80, code: 1, isDay: true },
      daily: [0, 1, 2, 3, 4, 5].map((i) => ({ date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
        code: [1, 2, 61, 0, 3, 95][i], hi: [81, 79, 74, 77, 80, 83][i], lo: [66, 65, 63, 61, 64, 68][i], pop: [5, 10, 70, 0, 15, 60][i] })) };
    hooks.render(); return;
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${h.weather_lat}&longitude=${h.weather_lon}`
      + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + '&temperature_unit=fahrenheit&timezone=auto&forecast_days=6';
    const d = await (await fetch(url)).json();
    S.weather = {
      key, at: Date.now(),
      current: { temp: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature), code: d.current.weather_code, isDay: !!d.current.is_day },
      daily: d.daily.time.map((t, i) => {
        const [y, m, dd] = t.split('-').map(Number);
        return { date: new Date(y, m - 1, dd), code: d.daily.weather_code[i], hi: Math.round(d.daily.temperature_2m_max[i]),
          lo: Math.round(d.daily.temperature_2m_min[i]), pop: d.daily.precipitation_probability_max?.[i] ?? 0 };
      }),
    };
    hooks.render();
  } catch (e) { console.warn('weather', e); }
}
setInterval(() => { if (S.user && !document.hidden) loadWeather(); }, 10 * 60e3);

export function weatherPill() {
  const w = S.weather; if (!w) return '';
  return `<button class="wx-pill" data-act="wx-location" title="${esc(household()?.weather_place)}">${wx(w.current.code, w.current.isDay)[0]} ${w.current.temp}°</button>`;
}

export function weatherNowHtml() {
  const w = S.weather;
  if (!w) return '<div class="wx-now muted">Loading weather…</div>';
  const [icon, text] = wx(w.current.code, w.current.isDay);
  const t = w.daily[0];
  return `<div class="wx-now">
    <span class="wx-icon">${icon}</span>
    <div><div class="wx-temp">${w.current.temp}°</div>
      <div class="wx-desc">${esc(text)} · H ${t.hi}° L ${t.lo}°</div>
      <div class="wx-place">${esc(household()?.weather_place || '')}</div></div>
  </div>`;
}

export function forecastHtml(days = 5) {
  const w = S.weather; if (!w) return '';
  return `<div class="wx-days">${w.daily.slice(1, days + 1).map((d) => `
    <div class="wx-day"><span>${d.date.toLocaleDateString([], { weekday: 'short' })}</span>
      <b>${wx(d.code)[0]}</b><span>${d.hi}°<small> ${d.lo}°</small></span>
      ${d.pop >= 30 ? `<small class="pop">💧${d.pop}%</small>` : '<small class="pop">&nbsp;</small>'}</div>`).join('')}</div>`;
}

function sheetLocation() {
  openSheet(`
    <h2>Weather location</h2>
    <p class="muted small">Now: ${esc(household()?.weather_place)}</p>
    <div class="row"><input id="wx-q" placeholder="City or town, e.g. Lakewood Ranch" autocomplete="off"><button class="btn" type="button" data-act="wx-search">Search</button></div>
    <div id="wx-results" class="stack-sm"></div>
    <button class="btn ghost" type="button" data-act="sheet-close">Close</button>`);
  const q = document.getElementById('wx-q');
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions['wx-search'](); } });
  setTimeout(() => q.focus(), 250);
}

Object.assign(actions, {
  'wx-location': () => sheetLocation(),
  'wx-search': async () => {
    const name = document.getElementById('wx-q').value.split(',')[0].trim();
    const box = document.getElementById('wx-results');
    if (!name) return;
    box.innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=en&format=json`)).json();
      box.innerHTML = (r.results || []).map((p) => `
        <button type="button" class="btn ghost wx-result" data-act="wx-pick" data-lat="${p.latitude}" data-lon="${p.longitude}"
          data-place="${esc(`${p.name}${p.admin1 ? ', ' + p.admin1 : ''}${p.country_code && p.country_code !== 'US' ? ', ' + p.country_code : ''}`)}">
          📍 ${esc(p.name)}<small class="muted"> ${esc([p.admin1, p.country].filter(Boolean).join(', '))}</small></button>`).join('')
        || '<p class="muted small">No matches.</p>';
    } catch { box.innerHTML = '<p class="muted small">Couldn\'t search right now.</p>'; }
  },
  'wx-pick': async (el) => {
    await run(() => S.api.update('households', household().id, {
      weather_place: el.dataset.place, weather_lat: +el.dataset.lat, weather_lon: +el.dataset.lon,
    }), 'Weather location updated');
    document.querySelector('[data-act=sheet-close]')?.click();
    await hooks.loadAll(); await loadWeather(true);
  },
});
