// Building → Room → Sensor → Metric → Time Range → Chart

const API_BASE = "http://127.0.0.1:5001/api"; // 5000 collides with macOS AirPlay Receiver

async function getJSON(path) {
    const response = await fetch(API_BASE + path);

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
}

function fillSelect(id, items) {

    const select = document.getElementById(id);

    select.innerHTML = "";

    for (let i = 0; i < items.length; i++) {

        const option = document.createElement("option");

        option.value = items[i];
        option.textContent = items[i];

        select.appendChild(option);
    }

    select.disabled = false;
}

// the chart on screen right now
let currentChart = null;

// counts can return 100k+ points, so cap how many rows we actually load
const MAX_TABLE_ROWS = 200;

// table starts collapsed to this many rows, "show more" expands it
const COLLAPSED_TABLE_ROWS = 5;

// last query's data, reused by expand + csv export so we don't refetch
let lastQuery = null;
let tableExpanded = false;

// fills in the average/count/table under the chart, no-ops if not on this page
function showResultSummary(building, room, sensor, metric, labels, values) {
    const resultsBox = document.getElementById("explorer-results");
    if (!resultsBox) return;

    resultsBox.classList.remove("hidden");

    const titleEl = document.getElementById("explorer-chart-title");
    if (titleEl) {
        titleEl.textContent = `${building} — Room ${room} — ${sensor} (${metric})`;
    }

    const numericValues = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v !== null && v !== undefined && !isNaN(v)) {
            numericValues.push(v);
        }
    }

    let average = null;
    if (numericValues.length > 0) {
        let sum = 0;
        for (let i = 0; i < numericValues.length; i++) {
            sum += numericValues[i];
        }
        average = sum / numericValues.length;
    }

    const averageEl = document.getElementById("explorer-average");
    if (averageEl) {
        averageEl.textContent = average !== null ? average.toFixed(3) : "—";
    }

    const countEl = document.getElementById("explorer-count");
    if (countEl) {
        countEl.textContent = labels.length.toLocaleString();
    }

    // counts = energy vs counts, everything else = time vs value
    const col1 = metric === "counts" ? "Energy" : "Timestamp";
    const col2 = metric === "counts" ? "Counts" : "Value";
    const col1El = document.getElementById("explorer-table-col1");
    const col2El = document.getElementById("explorer-table-col2");
    if (col1El) col1El.textContent = col1;
    if (col2El) col2El.textContent = col2;

    lastQuery = { building, room, sensor, metric, labels, values, col1, col2 };
    tableExpanded = false;
    renderExplorerTable();
}

// redraws the table body, collapsed or expanded
function renderExplorerTable() {
    if (!lastQuery) return;
    const labels = lastQuery.labels;
    const values = lastQuery.values;

    const cappedLen = Math.min(labels.length, MAX_TABLE_ROWS);
    const visibleCount = tableExpanded ? cappedLen : Math.min(COLLAPSED_TABLE_ROWS, cappedLen);

    const tableBody = document.getElementById("explorer-table-body");
    if (tableBody) {
        let rowsHtml = "";
        for (let i = 0; i < visibleCount; i++) {
            rowsHtml += `<tr><td>${labels[i]}</td><td>${values[i]}</td></tr>`;
        }
        tableBody.innerHTML = rowsHtml;
    }

    const noteEl = document.getElementById("explorer-table-note");
    if (noteEl) {
        noteEl.textContent = labels.length > MAX_TABLE_ROWS
            ? `Showing ${visibleCount} of ${labels.length.toLocaleString()} rows (capped at ${MAX_TABLE_ROWS}).`
            : `Showing ${visibleCount} of ${labels.length} row${labels.length === 1 ? "" : "s"}.`;
    }

    const expandBtn = document.getElementById("explorer-expand-btn");
    if (expandBtn) {
        if (cappedLen <= COLLAPSED_TABLE_ROWS) {
            expandBtn.classList.add("hidden");
        } else {
            expandBtn.classList.remove("hidden");
            expandBtn.textContent = tableExpanded ? "Show less ▲" : "Show more ▾";
        }
    }
}

function toggleExplorerTableExpand() {
    tableExpanded = !tableExpanded;
    renderExplorerTable();
}

// downloads the full query as a csv, not just the visible table rows
function exportExplorerCSV() {
    if (!lastQuery || !lastQuery.labels.length) {
        alert("No data to export yet - run a query first.");
        return;
    }

    const building = lastQuery.building;
    const room = lastQuery.room;
    const sensor = lastQuery.sensor;
    const metric = lastQuery.metric;
    const labels = lastQuery.labels;
    const values = lastQuery.values;
    const col1 = lastQuery.col1;
    const col2 = lastQuery.col2;

    const rows = [[col1, col2]];
    for (let i = 0; i < labels.length; i++) {
        rows.push([labels[i], values[i]]);
    }

    let csv = "";
    for (let i = 0; i < rows.length; i++) {
        csv += rows[i].join(",");
        if (i < rows.length - 1) csv += "\n";
    }

    const filename = `RWS_${building}_${room}_${sensor}_${metric}_${new Date().toISOString().slice(0, 10)}.csv`
        .replace(/\s+/g, "_");

    // fake link click to trigger the download
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = filename;
    a.click();
}

function drawChart(timestamps, values) {

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(
        document.getElementById("explorer-chart"),
        {
            type: "line",
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: "Sensor Data",
                        data: values,
                        borderWidth: 1.5,
                        // hide dots once there's too many points, looks cleaner
                        pointRadius: values.length > 60 ? 0 : 3,
                        pointHoverRadius: 4,
                        tension: 0.15
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 16, bottom: 0, left: 0 } },
                scales: {
                    x: {
                        ticks: {
                            // let chart.js skip labels instead of cramming them all in
                            autoSkip: true,
                            maxTicksLimit: 12,
                            maxRotation: 0
                        }
                    }
                }
            }
        }
    );
}

// building picked → load its rooms
async function onBuildingChange() {

    const building =
        document.getElementById("building").value;


    const result = await getJSON(
        "/rooms?building_name=" +
        encodeURIComponent(building)
    );


    fillSelect(
        "room",
        result.rooms || []
    );
}

// room picked → load its sensors
async function onRoomChange() {

    const building =
        document.getElementById("building").value;

    const room =
        document.getElementById("room").value;


    const result = await getJSON(
        "/sensors?building_name=" +
        encodeURIComponent(building) +
        "&room_number=" +
        encodeURIComponent(room)
    );


    fillSelect(
        "sensor",
        result.sensors || []
    );
}

// sensor picked → load its data types
async function onSensorChange() {

    const sensor =
        document.getElementById("sensor").value;


    const result = await getJSON(
        "/sensor-columns?sensor_type=" +
        encodeURIComponent(sensor)
    );


    fillSelect(
        "metric",
        result.columns || []
    );
}

// get data button → fetch and draw
async function onSubmit() {

    const building =
        document.getElementById("building").value;

    const room =
        document.getElementById("room").value;

    const sensor =
        document.getElementById("sensor").value;

    const metric =
        document.getElementById("metric").value;

    const timeRange =
        document.getElementById("time-range").value;


    const path =
        "/sensor-data?" +
        "building_name=" + encodeURIComponent(building) +
        "&room_number=" + encodeURIComponent(room) +
        "&sensor=" + encodeURIComponent(sensor) +
        "&data_column=" + encodeURIComponent(metric) +
        "&time_range=" + encodeURIComponent(timeRange);


    const result = await getJSON(path);


    let labels, dataValues;
    if (metric === "counts") {
        // counts = spectrum chart, not a timeline
        labels = result.data.values_x_axis;
        dataValues = result.data.counts_y_axis;
    } else {
        labels = result.data.timestamps;
        dataValues = result.data.values;
    }

    drawChart(labels, dataValues);
    showResultSummary(building, room, sensor, metric, labels, dataValues);
}

// load rooms as soon as the page opens
document.addEventListener("DOMContentLoaded", async function () {

    await onBuildingChange();

});
