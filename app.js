const CHANNEL_ID = 3318002;
const API_KEY = "EF1GSQD4KCOWGHD4";
const REFRESH_MS = 60 * 1000;

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
  // Dnešná polnoc v lokálnom čase -> "YYYY-MM-DD 00:00:00".
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const start = `${y}-${m}-${d} 00:00:00`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // start + timezone => ThingSpeak vráti len dáta od dnešnej polnoci v našom pásme.
  return (
    `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json` +
    `?api_key=${API_KEY}` +
    `&start=${encodeURIComponent(start)}` +
    `&timezone=${encodeURIComponent(tz)}`
  );
}

function fmt(value, decimals) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : "--";
}

function isToday(date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
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

// Hodina dňa ako desatinné číslo (napr. 6:30 -> 6.5) z lokálneho času.
function hourOfDay(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function hourLabel(h) {
  const hh = String(Math.floor(h)).padStart(2, "0");
  const mm = String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Zvislé prerušované sivé čiary na 6:00 a 22:00 (spoločné pre oba grafy).
const dayMarkersPlugin = {
  id: "dayMarkers",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    [6, 22].forEach((h) => {
      const px = x.getPixelForValue(h);
      if (px < x.left || px > x.right) return;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
    });
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
          title: (items) => hourLabel(items[0].parsed.x),
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
          maxRotation: 0,
          callback: (v) => hourLabel(v),
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
    elNode.textContent = "Žiadne dáta pre dnešok";
  }
}

function updateCharts(feeds) {
  const todays = feeds.filter(
    (f) => f.field1 != null && isToday(new Date(f.created_at))
  );

  const tempPoints = todays.map((f) => ({
    x: hourOfDay(new Date(f.created_at)),
    y: Number(f.field1),
  }));
  const humPoints = todays.map((f) => ({
    x: hourOfDay(new Date(f.created_at)),
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
      plugins: [dayMarkersPlugin],
    });
  } else {
    tempChart.data.datasets[0].data = tempPoints;
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
      plugins: [dayMarkersPlugin, humidityBandsPlugin],
    });
  } else {
    humChart.data.datasets[0].data = humPoints;
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

load();
setInterval(load, REFRESH_MS);
