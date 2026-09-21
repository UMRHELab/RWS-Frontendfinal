// fetches something from the Python API and gives back the json
async function getJSON(path) {
    const response = await fetch(API_BASE + path);

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
}

// fills a dropdown with a list of options
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

let currentChart = null;

let queriedSeries = [];
const MAX_LINES = 3;
const LINE_COLORS = ["#3b82f6", "#f59e0b", "#22c55e"];

const MAX_TABLE_ROWS = 200;

const COLLAPSED_TABLE_ROWS = 5;

let lastQuery = null;
let tableExpanded = false;

// fills in the average, count, and table under the chart
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

// redraws the results table, collapsed or fully expanded
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

// flips the table between collapsed and expanded
function toggleExplorerTableExpand() {
    tableExpanded = !tableExpanded;
    renderExplorerTable();
}

// downloads the whole query result as a csv file
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

    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = filename;
    a.click();
}

// draws the explorer chart, adding this query as a new line
function drawChart(label, timestamps, values) {

    queriedSeries.push({ label, timestamps, values });
    if (queriedSeries.length > MAX_LINES) {
        queriedSeries.shift();
    }

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(
        document.getElementById("explorer-chart"),
        {
            type: "line",
            data: {
                labels: queriedSeries[queriedSeries.length - 1].timestamps,
                datasets: queriedSeries.map((series, i) => ({
                    label: series.label,
                    data: series.values,
                    borderColor: LINE_COLORS[i],
                    backgroundColor: LINE_COLORS[i],
                    borderWidth: 1.5,
                    pointRadius: series.values.length > 60 ? 0 : 3,
                    pointHoverRadius: 4,
                    tension: 0.15
                }))
            },
            options: {
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 16, bottom: 0, left: 0 } },
                scales: {
                    x: {
                        ticks: {
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

// building picked, so load its rooms into the next dropdown
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

// room picked, so load its sensors into the next dropdown
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

// sensor picked, so load its available data types (metrics)
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

// "Get Data" button clicked, so fetch the query and draw it
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
        labels = result.data.values_x_axis;
        dataValues = result.data.counts_y_axis;
        queriedSeries = [];
    } else {
        labels = result.data.timestamps;
        dataValues = result.data.values;
    }

    const seriesLabel = `${room} / ${sensor} (${metric})`;
    drawChart(seriesLabel, labels, dataValues);
    showResultSummary(building, room, sensor, metric, labels, dataValues);
}

document.addEventListener("DOMContentLoaded", async function () {

    await onBuildingChange();

});
