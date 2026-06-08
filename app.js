const CHANNEL_ID = 3318002;
const API_KEY = "EF1GSQD4KCOWGHD4";
const REFRESH_MS = 60 * 1000;

// Stiahneme širšie okno (senzor meria ~každé 2 min => 8000 pokryje > 10 dní),
// rozsah pre grafy (dnes / 7 dní) si filtrujeme na strane klienta.
const RESULTS = 8000;
const HOUR_MS = 3600000;

// Aktuálne zvolený rozsah a posledné stiahnuté dáta (pre okamžité prepnutie).
let currentRange = "today"; // "today" | "week"
let lastFeeds = [];

// Začiatok a počet dní aktuálne zobrazeného rozsahu.
let view = { start: new Date(), days: 1 };

const el = {
  temp: document.getElementById("temp"),
  humidity: document.getElementById("humidity"),
  pressure: document.getElementById("pressure"),
  updated: document.getElementById("updated"),
  room: document.getElementById("room-name"),
  statusDot: document.getElementById("status-dot"),
  tempStats: document.getElementById("temp-stats"),
  humStats: document.getElementById("hum-stats"),
};

let tempChart;
let humChart;

function apiUrl() {
  return `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${API_KEY}&results=${RESULTS}`;
}

function fmt(value, decimals) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : "--";
}

// Vypočíta začiatok a počet dní podľa zvoleného rozsahu.
function computeView() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (currentRange === "week") {
    start.setDate(start.getDate() - 6);
    return { start, days: 7 };
  }
  return { start, days: 1 };
}

function setStatus(lastEntryDate) {
  const dot = el.statusDot;
  dot.classList.remove("live", "stale");
  if (!lastEntryDate) return;
  const ageMin = (Date.now() - lastEntryDate.getTime()) / 60000;
  dot.classList.add(ageMin < 10 ? "live" : "stale");
}

function updateCurrent(feed) {
  el.temp.innerHTML = `${fmt(feed.field1, 1)}<span class="unit">°C</span>`;
  el.humidity.innerHTML = `${fmt(feed.field2, 0)}<span class="unit">%</span>`;
  el.pressure.innerHTML = `${fmt(feed.field3, 0)}<span class="unit">hPa</span>`;

  const d = new Date(feed.created_at);
  el.updated.textContent = "Aktualizované " +
    d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  setStatus(d);
}

// X hodnota = počet hodín od začiatku zobrazeného rozsahu.
function xValue(date) {
  return (date.getTime() - view.start.getTime()) / HOUR_MS;
}

function hourLabel(h) {
  const hh = String(Math.floor(h)).padStart(2, "0");
  const mm = String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Popisok osi X aj titulok tooltipu (závisí od rozsahu).
function xTickLabel(v) {
  if (view.days === 1) return hourLabel(v);
  if (Math.abs(v % 24) > 0.01) return ""; // v týždni značíme len polnoci
  const d = new Date(view.start);
  d.setDate(d.getDate() + Math.round(v / 24));
  return d.toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "numeric" });
}

function xTooltipTitle(v) {
  const d = new Date(view.start.getTime() + v * HOUR_MS);
  if (view.days === 1) {
    return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Podfarbenie noci (22:00–06:00) jemným chladným pásom na pozadí grafu.
const nightShadingPlugin = {
  id: "nightShading",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const days = Math.max(1, Math.round(x.max / 24));
    const height = bottom - top;
    ctx.save();
    ctx.fillStyle = "rgba(120, 150, 220, 0.12)";

    const shade = (h0, h1) => {
      const a = Math.max(0, Math.min(x.max, h0));
      const b = Math.max(0, Math.min(x.max, h1));
      if (b <= a) return;
      const px0 = x.getPixelForValue(a);
      const px1 = x.getPixelForValue(b);
      ctx.fillRect(px0, top, px1 - px0, height);
    };

    for (let d = 0; d < days; d++) {
      shade(d * 24, d * 24 + 6); // 00:00–06:00
      shade(d * 24 + 22, d * 24 + 24); // 22:00–24:00
    }
    ctx.restore();
  },
};

// Vodorovné slabo modré čiary na 40 % a 60 % (len graf vlhkosti).
const humidityBandsPlugin = {
  id: "humidityBands",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea: { left, right }, scales: { y } } = chart;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(77, 208, 225, 0.4)";
    [40, 60].forEach((v) => {
      const py = y.getPixelForValue(v);
      if (py < y.top || py > y.bottom) return;
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();
    });
    ctx.restore();
  },
};

function baseOptions(unit) {
  return {
    parsing: false,
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#121a33",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: (items) => xTooltipTitle(items[0].parsed.x),
          label: (c) => ` ${c.parsed.y.toFixed(1)}${unit}`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        min: 0,
        max: 24,
        grid: { display: false },
        ticks: {
          color: "#8b93b0",
          stepSize: 3,
          autoSkip: false,
          maxRotation: 0,
          callback: (v) => xTickLabel(v),
        },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "#8b93b0" },
      },
    },
  };
}

function setStats(elNode, values, unit) {
  if (values.length) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    elNode.textContent = `min ${min.toFixed(1)}${unit}  ·  max ${max.toFixed(1)}${unit}  ·  ${values.length} meraní`;
  } else {
    elNode.textContent = "Žiadne dáta v rozsahu";
  }
}

function configureXScale(chart) {
  const x = chart.options.scales.x;
  x.max = view.days * 24;
  x.ticks.stepSize = view.days === 1 ? 3 : 24;
}

function updateCharts(feeds) {
  view = computeView();

  let inRange = feeds.filter(
    (f) => f.field1 != null && new Date(f.created_at) >= view.start
  );

  // V týždennom pohľade preriedime dáta (každý druhý bod), nech graf nie je prehustený.
  if (view.days > 1) {
    inRange = inRange.filter((_, i) => i % 2 === 0);
  }

  const tempPoints = inRange.map((f) => ({
    x: xValue(new Date(f.created_at)),
    y: Number(f.field1),
  }));
  const humPoints = inRange.map((f) => ({
    x: xValue(new Date(f.created_at)),
    y: Number(f.field2),
  }));

  setStats(el.tempStats, tempPoints.map((p) => p.y), "°");
  setStats(el.humStats, humPoints.map((p) => p.y), "%");

  // --- Graf teploty ---
  if (!tempChart) {
    const ctx = document.getElementById("tempChart").getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, "rgba(255, 138, 61, 0.35)");
    grad.addColorStop(1, "rgba(255, 138, 61, 0)");

    const opts = baseOptions(" °C");
    opts.scales.y.ticks.callback = (v) => v + "°";

    tempChart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Teplota",
            data: tempPoints,
            borderColor: "#ff8a3d",
            backgroundColor: grad,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#ff8a3d",
          },
        ],
      },
      options: opts,
      plugins: [nightShadingPlugin],
    });
    configureXScale(tempChart);
  } else {
    tempChart.data.datasets[0].data = tempPoints;
    configureXScale(tempChart);
    tempChart.update();
  }

  // --- Graf vlhkosti ---
  if (!humChart) {
    const ctx = document.getElementById("humChart").getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, "rgba(77, 208, 225, 0.3)");
    grad.addColorStop(1, "rgba(77, 208, 225, 0)");

    const opts = baseOptions(" %");
    opts.scales.y.ticks.callback = (v) => v + "%";

    humChart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Vlhkosť",
            data: humPoints,
            borderColor: "#4dd0e1",
            backgroundColor: grad,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#4dd0e1",
          },
        ],
      },
      options: opts,
      plugins: [nightShadingPlugin, humidityBandsPlugin],
    });
    configureXScale(humChart);
  } else {
    humChart.data.datasets[0].data = humPoints;
    configureXScale(humChart);
    humChart.update();
  }
}

async function load() {
  try {
    const res = await fetch(apiUrl());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    if (json.channel?.description) {
      el.room.textContent =
        json.channel.description.charAt(0).toUpperCase() +
        json.channel.description.slice(1);
    }

    const feeds = json.feeds || [];
    lastFeeds = feeds;
    if (feeds.length) {
      updateCurrent(feeds[feeds.length - 1]);
      updateCharts(feeds);
    }
  } catch (err) {
    el.updated.textContent = "Chyba načítania dát";
    el.statusDot.classList.remove("live");
    el.statusDot.classList.add("stale");
    console.error(err);
  }
}

document.querySelectorAll("#range-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentRange = btn.dataset.range;
    document
      .querySelectorAll("#range-toggle button")
      .forEach((b) => b.classList.toggle("active", b === btn));
    if (lastFeeds.length) updateCharts(lastFeeds);
  });
});

load();
setInterval(load, REFRESH_MS);
