import { useState, useEffect, useRef } from "react";
import "./App.css";

// WMO weather codes used by Open-Meteo
const WEATHER_CODES = {
  0: { label: "Clear sky", icon: "☀️", night: "🌙" },
  1: { label: "Mainly clear", icon: "🌤️", night: "🌙" },
  2: { label: "Partly cloudy", icon: "⛅", night: "☁️" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Freezing fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌦️" },
  56: { label: "Freezing drizzle", icon: "🌧️" },
  57: { label: "Freezing drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌧️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🌧️" },
  67: { label: "Freezing rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Light showers", icon: "🌦️" },
  81: { label: "Showers", icon: "🌧️" },
  82: { label: "Heavy showers", icon: "⛈️" },
  85: { label: "Snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "🌨️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm with hail", icon: "⛈️" },
  99: { label: "Thunderstorm with hail", icon: "⛈️" },
};

function getWeather(code, isDay = true) {
  const w = WEATHER_CODES[code] ?? { label: "Unknown", icon: "❔" };
  return { label: w.label, icon: !isDay && w.night ? w.night : w.icon };
}

// Picks the colour theme for the whole page from the current conditions
function getTheme(code, isDay) {
  let sky;
  if (code <= 1) sky = "clear";
  else if (code <= 3) sky = "cloudy";
  else if (code <= 48) sky = "fog";
  else if (code <= 67 || (code >= 80 && code <= 82)) sky = "rain";
  else if (code <= 86) sky = "snow";
  else sky = "storm";

  // Only clear and cloudy skies get a separate night look
  if ((sky === "clear" || sky === "cloudy") && !isDay) return `${sky}-night`;
  return sky;
}

// Maps a temperature to a colour: icy blue → teal → green → yellow → orange → pink
const TEMP_STOPS = [
  [-10, [77, 124, 254]],
  [0, [63, 193, 201]],
  [12, [124, 214, 109]],
  [20, [255, 210, 63]],
  [28, [255, 123, 57]],
  [36, [232, 63, 111]],
];

function tempColor(t) {
  if (t <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1]})`;
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      const mix = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${mix})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1]})`;
}

function formatDay(dateString, index) {
  if (index === 0) return "Today";
  // "T12:00" avoids the date shifting a day in some timezones
  return new Date(dateString + "T12:00").toLocaleDateString("en-GB", {
    weekday: "short",
  });
}

function App() {
  const [city, setCity] = useState("");
  const [searchText, setSearchText] = useState("");
  const [current, setCurrent] = useState(null);
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Tracks the latest search so older, slower responses are ignored
  const latestRequest = useRef(0);

  async function searchCity(name) {
    const query = (name ?? searchText).trim();
    if (query === "") return;

    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");

    try {
      // Step 1: Find the city
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          query
        )}&count=1&language=en&format=json`
      );
      if (!geoResponse.ok) throw new Error("Geocoding request failed");

      const geoData = await geoResponse.json();
      if (requestId !== latestRequest.current) return;

      if (!geoData.results || geoData.results.length === 0) {
        setError(`No city called "${query}" was found. Check the spelling and try again.`);
        return;
      }

      const place = geoData.results[0];

      // Step 2: Get current weather and the 7-day forecast in one request
      const params = new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        current:
          "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: 7,
      });

      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`
      );
      if (!weatherResponse.ok) throw new Error("Weather request failed");

      const weatherData = await weatherResponse.json();
      if (requestId !== latestRequest.current) return;

      // Only update the city once everything has loaded successfully
      setCity(place.name);
      setCurrent({ ...weatherData.current, country: place.country });
      setDaily(weatherData.daily);
      setSearchText("");
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError("Couldn't load the weather. Check your connection and try again.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  // Load the default city when the page opens
  useEffect(() => {
    searchCity("Hannover");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDay = current ? current.is_day === 1 : true;
  const theme = current ? getTheme(current.weather_code, isDay) : "clear";
  const today = current ? getWeather(current.weather_code, isDay) : null;

  // The whole week's temperature range, so every bar shares one scale
  const weekLow = daily ? Math.min(...daily.temperature_2m_min) : 0;
  const weekHigh = daily ? Math.max(...daily.temperature_2m_max) : 1;
  const weekSpan = Math.max(weekHigh - weekLow, 1);

  return (
    <div className="App" data-theme={theme}>
      <main className="shell">
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            searchCity();
          }}
        >
          <input
            type="text"
            placeholder="Search another city"
            aria-label="City name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {current && (
          <section className={`now ${loading ? "is-loading" : ""}`}>
            <h1 className="city">
              {city}
              <span className="country">{current.country}</span>
            </h1>

            <div className="hero">
              <span className="hero-icon" aria-hidden="true">
                {today.icon}
              </span>
              <p className="hero-temp">
                {Math.round(current.temperature_2m)}
                <span className="deg">°</span>
              </p>
            </div>

            <p className="condition">{today.label}</p>

            <ul className="chips">
              <li className="chip">
                Feels like <strong>{Math.round(current.apparent_temperature)}°</strong>
              </li>
              <li className="chip">
                Humidity <strong>{current.relative_humidity_2m}%</strong>
              </li>
              <li className="chip">
                Wind <strong>{Math.round(current.wind_speed_10m)} km/h</strong>
              </li>
            </ul>
          </section>
        )}

        {daily && (
          <section className={`week ${loading ? "is-loading" : ""}`}>
            <h2 className="week-title">Next 7 days</h2>
            <ul className="forecast">
              {daily.time.map((date, i) => {
                const day = getWeather(daily.weather_code[i]);
                const min = daily.temperature_2m_min[i];
                const max = daily.temperature_2m_max[i];
                const left = ((min - weekLow) / weekSpan) * 100;
                const width = Math.max(((max - min) / weekSpan) * 100, 4);

                return (
                  <li key={date} className="forecast-day">
                    <span className="forecast-name">{formatDay(date, i)}</span>
                    <span className="forecast-icon" title={day.label} aria-label={day.label}>
                      {day.icon}
                    </span>
                    <span className="forecast-min">{Math.round(min)}°</span>
                    <span className="range" aria-hidden="true">
                      <span
                        className="range-fill"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: `linear-gradient(90deg, ${tempColor(min)}, ${tempColor(max)})`,
                        }}
                      />
                    </span>
                    <span className="forecast-max">{Math.round(max)}°</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;