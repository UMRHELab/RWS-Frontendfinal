const CHARTS = {
    temp:     { chart: null, labels: [], data: [], color: '--dashboard-chart-temp',     baseline: 55.5, blLabel: '55.5°F' },
    humidity: { chart: null, labels: [], data: [], color: '--dashboard-chart-humidity', baseline: 50,   blLabel: '50%'    },
    wind:     { chart: null, labels: [], data: [], color: '--dashboard-chart-wind',     baseline: 3.5,  blLabel: '3.5mph' },
    rain:     { chart: null, labels: [], data: [], color: '--dashboard-chart-rain',     baseline: 0,    blLabel: 'Dry'    },
    solar:    { chart: null, labels: [], data: [], color: '--dashboard-chart-solar',    baseline: 450,  blLabel: '450lx'  },
    radon:    { chart: null, labels: [], data: [], color: '--dashboard-chart-radon',    baseline: 1.2,  blLabel: '1.2pCi' },
};
const MAX_POINTS = 30;

// draws that dashed baseline line on a chart
function buildBaselineAnnotation(cfg) {
    const annotationPlugin = window['chartjs-plugin-annotation'] || window.ChartAnnotation;
    if (!annotationPlugin) return {};

    return {
        annotation: {
            annotations: {
                baseline: {
                    type: 'line',
                    yMin: cfg.baseline,
                    yMax: cfg.baseline,
                    borderColor: cssVar('--dashboard-annotation-border'),
                    borderWidth: 1,
                    borderDash: [4, 4],
                    label: {
                        display: true,
                        content: cfg.blLabel,
                        position: 'end',
                        backgroundColor: cssVar('--dashboard-annotation-bg'),
                        color: cssVar('--dashboard-annotation-label-color'),
                        font: { size: 8, weight: 'bold' },
                        padding: { x: 4, y: 2 }
                    }
                }
            }
        }
    };
}

// sets up how the hover tooltip looks on a chart
function buildTooltipConfig(color) {
    return {
        mode: 'index',
        intersect: false,
        backgroundColor: cssVar('--dashboard-tooltip-bg'),
        borderColor: color + '40',
        borderWidth: 1,
        titleColor: color,
        bodyColor: cssVar('--dashboard-tooltip-body-color'),
        padding: 8,
        callbacks: {
            title: function (items) {
                return items[0].label;
            }
        }
    };
}

// checks if this x-axis tick is the most recent reading
function isLastTick(ctx) {
    return ctx.tick.value === ctx.scale.getLabels().length - 1;
}

// makes the newest tick stand out in a brighter color
function xTickColor(ctx) {
    return isLastTick(ctx) ? cssVar('--dashboard-tick-color-active') : cssVar('--dashboard-tick-color');
}

// makes the newest tick bold and a little bigger
function xTickFont(ctx) {
    return isLastTick(ctx) ? { size: 11, weight: 'bold' } : { size: 8 };
}

// labels the newest tick "Now" instead of its actual time
function xTickLabel(value, index) {
    const label = this.getLabelForValue(value);
    return index === this.getLabels().length - 1 ? 'Now · ' + label : label;
}

// makes sure the newest tick never gets skipped when space is tight
function keepLastTickVisible(axis) {
    const lastIndex = axis.getLabels().length - 1;
    if (lastIndex < 0) return;

    let found = false;
    for (let i = 0; i < axis.ticks.length; i++) {
        if (axis.ticks[i].value === lastIndex) {
            found = true;
            break;
        }
    }
    if (!found) {
        axis.ticks.push({ value: lastIndex });
    }
}

// sets up the x and y axis settings for a chart
function buildScalesConfig() {
    return {
        x: {
            grid: { display: false },
            ticks: {
                maxTicksLimit: 5,
                maxRotation: 0,
                color: xTickColor,
                font: xTickFont,
                callback: xTickLabel
            },
            afterBuildTicks: keepLastTickVisible
        },
        y: {
            grid: { color: cssVar('--dashboard-grid-color') },
            ticks: {
                color: cssVar('--dashboard-tick-color-y'),
                font: { size: 8 },
                maxTicksLimit: 4
            }
        }
    };
}

// builds one sparkline chart for a given metric (temp, humidity, etc)
function buildChart(key) {
    const cfg = CHARTS[key];
    const ctx = document.getElementById('chart-' + key);
    if (!ctx) return;

    const color = cssVar(cfg.color);
    ctx.setAttribute('role', 'img');
    ctx.setAttribute('aria-label', 'Line chart of recent ' + key + ' readings');

    const plugins = {
        legend: { display: false },
        tooltip: buildTooltipConfig(color)
    };
    Object.assign(plugins, buildBaselineAnnotation(cfg));

    cfg.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: cfg.labels,
            datasets: [{
                data: cfg.data,
                borderColor: color,
                backgroundColor: color + '12',
                borderWidth: 1.5,
                tension: 0.4,
                pointRadius: 0,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            transitions: {
                active: { animation: { duration: 400, easing: 'linear' } }
            },
            plugins: plugins,
            scales: buildScalesConfig()
        }
    });
}

// builds all six homepage charts at once
function initAllCharts() {
    const keys = Object.keys(CHARTS);
    for (let i = 0; i < keys.length; i++) {
        buildChart(keys[i]);
    }
}
