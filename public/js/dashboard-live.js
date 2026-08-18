// homepage script - keeps the cards/charts updated, handles the popups

// tick the clock every second
function updateClock() {
    const el = document.getElementById('top-bar-clock');
    if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);

// set text on an element if it exists
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// good morning/afternoon/evening + today's date
function setGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good Evening!';
    if (hour < 12) {
        greeting = 'Good Morning!';
    } else if (hour < 17) {
        greeting = 'Good Afternoon!';
    }
    setElementText('greeting-text', greeting);
    setElementText('greeting-date', new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }));
}
setGreeting();

// radiation card status, based on the epa action level of 4 pci/l
// (colors live in index.css, this just picks the label/text)
const RADON_LEVELS = [
    { below: 2, cls: 'rad-normal', label: 'Normal', title: 'Safe range.', text: 'Below the EPA action level of 4 pCi/L.' },
    { below: 4, cls: 'rad-elevated', label: 'Elevated', title: 'Elevated.', text: 'Approaching the EPA action level of 4 pCi/L.' },
    { below: Infinity, cls: 'rad-high', label: 'High', title: 'High level.', text: 'Above the EPA action level of 4 pCi/L. Expected in the lab when sources are present.' }
];

function setRadiationStatus(pci) {
    if (pci == null || isNaN(pci)) return;

    let lvl = null;
    for (let i = 0; i < RADON_LEVELS.length; i++) {
        if (pci < RADON_LEVELS[i].below) {
            lvl = RADON_LEVELS[i];
            break;
        }
    }

    setElementText('rad-status-text', lvl.label);
    setElementText('rad-info-title', lvl.title);
    setElementText('rad-info-text', lvl.text);

    let rangeText = 'Higher than typical background';
    if (pci < 4) {
        rangeText = 'Typical background radiation';
    }
    setElementText('rad-range-text', rangeText);

    const panel = document.querySelector('.rad-panel');
    if (panel) {
        panel.classList.remove('rad-normal', 'rad-elevated', 'rad-high', 'rad-unavailable');
        panel.classList.add(lvl.cls);
    }
}

// shown when no radon sensor is currently reporting
function setRadiationUnavailable() {
    setElementText('current-rad', '—');
    setElementText('rad-status-text', 'No data');
    setElementText('rad-info-title', 'No reading available.');
    setElementText('rad-info-text', 'Waiting for a radon sensor to report.');
    setElementText('rad-range-text', 'No radon sensor is currently reporting');

    const panel = document.querySelector('.rad-panel');
    if (panel) {
        panel.classList.remove('rad-normal', 'rad-elevated', 'rad-high');
        panel.classList.add('rad-unavailable');
    }
}

// turn a sql datetime string into a real Date
function parseDbTime(raw) {
    if (raw == null) return null;
    const d = new Date(String(raw).trim().replace(' ', 'T'));
    return isNaN(d) ? null : d;
}

function setLiveBadge(text) {
    setElementText('live-badge-text', text);
}

// last good reading, shown if a poll fails
let lastGoodSensor = null;

// stops us from plotting the same reading twice
let lastPlottedSignature = null;

// returns readings grouped by sensor type (rad8, cr1000), not one flat object
const HOMEPAGE_API_URL = "http://127.0.0.1:5001/api/presentation-data";

// rounds a number into an element, skips it if null
function setReadout(id, val, dec) {
    if (val != null) setElementText(id, Number(val).toFixed(dec));
}

// updates every number on the page
function updateReadouts(sensor) {
    setReadout('current-temp', sensor.indoor_temp, 1);
    setReadout('current-humidity', sensor.indoor_humidity, 1);
    setReadout('current-wind', sensor.wind_speed, 1);
    setReadout('current-rain', sensor.rainfall, 2);
    setReadout('current-solar', sensor.lux, 0);
    setReadout('current-radon', sensor.radon_level, 2);
    // header pill keeps its °F suffix
    if (sensor.indoor_temp != null) {
        setElementText('nav-temp', Number(sensor.indoor_temp).toFixed(0) + '°F');
        // hero banner has its own static °F unit span, just needs the number
        setElementText('weather-temp', Number(sensor.indoor_temp).toFixed(0));
    }

    if (sensor.radiation != null) {
        setReadout('current-rad', sensor.radiation, 0);
        setRadiationStatus(Number(sensor.radiation));
    } else {
        setRadiationUnavailable();
    }
}

// adds a point, drops the oldest once full - missing data stays a gap, never faked
function pushChartPoint(key, label, value) {
    const cfg = CHARTS[key];
    if (!cfg) return;

    // a single point renders as nothing (Chart.js needs two to draw a
    // line), so seed the very first reading with a duplicate lead-in point
    // - same real value, not faked data, just enough geometry to draw
    if (cfg.labels.length === 0 && value != null) {
        cfg.labels.push('');
        cfg.data.push(value);
    }

    cfg.labels.push(label);
    cfg.data.push(value == null ? null : value);
    if (cfg.labels.length > MAX_POINTS) {
        cfg.labels.shift();
        cfg.data.shift();
    }
    if (cfg.chart) cfg.chart.update();
}

// only plots when there's an actually new reading, not every poll.
// dedupes on the actual values rather than the reading's own timestamp -
// on this DB the values can change while the timestamp column doesn't move,
// so a timestamp-only check was silently dropping genuinely new readings
function plotNewReading(sensor) {
    const signature = JSON.stringify([
        sensor.indoor_temp, sensor.indoor_humidity, sensor.wind_speed,
        sensor.rainfall, sensor.lux, sensor.radon_level
    ]);
    if (signature === lastPlottedSignature) return;
    lastPlottedSignature = signature;

    // still prefer the reading's own timestamp for the x-axis label when
    // it's usable, but fall back to "now" so a point never gets skipped
    // just because parseDbTime() couldn't make sense of it
    const readingTime = parseDbTime(sensor.timestamp) || new Date();

    const label = readingTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    pushChartPoint('temp', label, sensor.indoor_temp);
    pushChartPoint('humidity', label, sensor.indoor_humidity);
    pushChartPoint('wind', label, sensor.wind_speed);
    pushChartPoint('rain', label, sensor.rainfall);
    pushChartPoint('solar', label, sensor.lux);
    pushChartPoint('radon', label, sensor.radon_level);
}

// fetches the latest reading - throws on failure so updateLiveChart()
// below can fall back to the last good reading instead of blanking the page
async function fetchHomepageReading() {
    const res = await fetch(HOMEPAGE_API_URL);
    if (!res.ok) throw new Error(`Homepage API error: ${res.status}`);
    const payload = await res.json();

    // rad8 = temp/humidity/radon, cr1000 = wind/rain
    const data = payload.data || {};
    const rad8 = data.rad8 || {};
    const cr1000 = data.cr1000 || {};

    // ambient_temp is in Celsius, every readout on this page is °F
    const ambientTempF = rad8.ambient_temp != null ? (rad8.ambient_temp * 9 / 5 + 32) : null;

    let timestamp = null;
    if (rad8.timestamp != null) {
        timestamp = rad8.timestamp;
    } else if (cr1000.timestamp != null) {
        timestamp = cr1000.timestamp;
    }

    return {
        // prefer rad8's timestamp, it covers most of the readouts
        timestamp: timestamp,
        indoor_temp: ambientTempF,
        indoor_humidity: rad8.relative_humidity != null ? rad8.relative_humidity : null,
        radiation: rad8.radon_pci_l != null ? rad8.radon_pci_l : null,
        radon_level: rad8.radon_pci_l != null ? rad8.radon_pci_l : null,
        wind_speed: cr1000.WindVel != null ? cr1000.WindVel : null,
        rainfall: cr1000.RainTotal != null ? cr1000.RainTotal : null,
        lux: null, // not returned by this endpoint yet
    };
}

// "Live" or "Live • last reading 3:45 PM" depending on the timestamp
function updateLiveBadgeFromReading(sensor) {
    const readAt = parseDbTime(sensor.timestamp);
    if (readAt) {
        setLiveBadge('Live: last reading ' + readAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } else {
        setLiveBadge('Live');
    }
}

// runs every minute: fetch the latest reading, update the page
async function updateLiveChart() {
    let sensor;
    try {
        sensor = await fetchHomepageReading();
        updateLiveBadgeFromReading(sensor);
        lastGoodSensor = sensor;
    } catch (e) {
        // poll failed - show the last good reading instead of clearing the page
        if (!lastGoodSensor) {
            console.warn('Sensor fetch failed, no data to show yet:', e);
            return;
        }
        sensor = lastGoodSensor;
    }

    updateReadouts(sensor);
    plotNewReading(sensor);
}

// kick everything off once the page loads
window.onload = function () {
    initAllCharts();
    updateLiveChart();
    setInterval(updateLiveChart, 10000); // poll every 10 seconds
};
