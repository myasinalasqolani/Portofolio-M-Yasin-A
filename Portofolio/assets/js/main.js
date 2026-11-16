const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector(".nav-links");
menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Buka menu" : "Tutup menu");
  navLinks.classList.toggle("open", !isOpen);
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Buka menu");
    navLinks.classList.remove("open");
  });
});

const profilePanel = document.querySelector(".profile-panel");
const profileToggle = document.querySelector(".profile-toggle");
const profileToggleIcon = profileToggle.querySelector(".profile-toggle-icon");
profileToggle.addEventListener("click", () => {
  const isExpanded = profileToggle.getAttribute("aria-expanded") === "true";
  profilePanel.classList.toggle("is-collapsed", isExpanded);
  document
    .querySelector(".hero")
    .classList.toggle("profile-collapsed", isExpanded);
  profileToggle.setAttribute("aria-expanded", String(!isExpanded));
  profileToggle.setAttribute(
    "aria-label",
    isExpanded ? "Tampilkan kartu identitas" : "Tutup kartu identitas",
  );
  profileToggleIcon.textContent = isExpanded ? "+" : "−";
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    const category = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((filter) => {
      filter.setAttribute("aria-pressed", String(filter === button));
    });
    document.querySelectorAll(".project").forEach((project) => {
      project.hidden =
        category !== "all" && project.dataset.category !== category;
    });
  });
});

document.querySelector("#year").textContent = new Date().getFullYear();
const zuluTime = document.querySelector("#zulu-time");
const updateZuluTime = () => {
  zuluTime.textContent = `UTC ${new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date())}`;
};
updateZuluTime();
window.setInterval(updateZuluTime, 1000);

const globeCanvas = document.querySelector(".globe-canvas");
const globeContext = globeCanvas.getContext("2d");
const landmasses = window.globeLandmasses;
const countryBoundaries = window.globeCountryBoundaries;
if (!Array.isArray(landmasses) || !Array.isArray(countryBoundaries)) {
  throw new Error("Globe geographic data failed to load.");
}
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
let enhancedMapReady = false;
let viewLongitude = 108;
let viewLatitude = 12;
let dragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let lastFrameTime = 0;

function resizeGlobe() {
  const bounds = globeCanvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvasWidth = bounds.width;
  canvasHeight = bounds.height;
  globeCanvas.width = Math.round(canvasWidth * pixelRatio);
  globeCanvas.height = Math.round(canvasHeight * pixelRatio);
  globeContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawGlobe();
}

function projectPoint(longitude, latitude, centerX, centerY, radius) {
  const radians = Math.PI / 180;
  const lon = (((longitude - viewLongitude + 540) % 360) - 180) * radians;
  const lat = latitude * radians;
  const centerLat = viewLatitude * radians;
  const depth =
    Math.sin(centerLat) * Math.sin(lat) +
    Math.cos(centerLat) * Math.cos(lat) * Math.cos(lon);
  return {
    x: centerX + radius * Math.cos(lat) * Math.sin(lon),
    y:
      centerY -
      radius *
        (Math.cos(centerLat) * Math.sin(lat) -
          Math.sin(centerLat) * Math.cos(lat) * Math.cos(lon)),
    depth,
  };
}

function horizonPoint(start, end) {
  let low = 0;
  let high = 1;
  const startDepth = projectPoint(start[0], start[1], 0, 0, 1).depth > 0;
  for (let step = 0; step < 14; step += 1) {
    const middle = (low + high) / 2;
    const longitude = start[0] + (end[0] - start[0]) * middle;
    const latitude = start[1] + (end[1] - start[1]) * middle;
    const middleVisible = projectPoint(longitude, latitude, 0, 0, 1).depth > 0;
    if (middleVisible === startDepth) low = middle;
    else high = middle;
  }
  const fraction = (low + high) / 2;
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
  ];
}

function sampleCoordinates(coordinates, closed) {
  const samples = [];
  const edgeCount = closed ? coordinates.length : coordinates.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const start = coordinates[index];
    const end = coordinates[(index + 1) % coordinates.length];
    let longitudeDelta = end[0] - start[0];
    if (longitudeDelta > 180) longitudeDelta -= 360;
    if (longitudeDelta < -180) longitudeDelta += 360;
    const latitudeDelta = end[1] - start[1];
    const divisions = Math.max(
      1,
      Math.ceil(
        Math.max(Math.abs(longitudeDelta), Math.abs(latitudeDelta)) / 4,
      ),
    );
    for (let step = 0; step < divisions; step += 1) {
      const fraction = step / divisions;
      samples.push([
        start[0] + longitudeDelta * fraction,
        start[1] + latitudeDelta * fraction,
      ]);
    }
  }
  if (!closed) samples.push(coordinates[coordinates.length - 1]);
  return samples;
}

function traceVisibleSegments(coordinates, closed, centerX, centerY, radius) {
  const samples = sampleCoordinates(coordinates, closed);
  const segments = [];
  let segment = null;
  let previous = null;
  let previousVisible = false;

  samples.forEach((point) => {
    const projected = projectPoint(
      point[0],
      point[1],
      centerX,
      centerY,
      radius,
    );
    const visible = projected.depth > 0;
    if (visible && !previousVisible && previous) {
      const boundary = horizonPoint(previous, point);
      const projectedBoundary = projectPoint(
        boundary[0],
        boundary[1],
        centerX,
        centerY,
        radius,
      );
      segment = [[projectedBoundary.x, projectedBoundary.y]];
    }
    if (visible) {
      if (!segment) segment = [];
      segment.push([projected.x, projected.y]);
    } else if (previousVisible && previous) {
      const boundary = horizonPoint(previous, point);
      const projectedBoundary = projectPoint(
        boundary[0],
        boundary[1],
        centerX,
        centerY,
        radius,
      );
      if (segment) {
        segment.push([projectedBoundary.x, projectedBoundary.y]);
        segments.push(segment);
      }
      segment = null;
    }
    previous = point;
    previousVisible = visible;
  });
  if (segment) segments.push(segment);
  return segments;
}

function drawGeoLine(
  coordinates,
  closed,
  centerX,
  centerY,
  radius,
  color,
  lineWidth,
  fillColor,
  dash,
) {
  const segments = traceVisibleSegments(
    coordinates,
    closed,
    centerX,
    centerY,
    radius,
  );
  globeContext.strokeStyle = color;
  globeContext.lineWidth = lineWidth;
  globeContext.setLineDash(dash || []);
  segments.forEach((segment) => {
    if (segment.length < 2) return;
    globeContext.beginPath();
    globeContext.moveTo(segment[0][0], segment[0][1]);
    segment
      .slice(1)
      .forEach((point) => globeContext.lineTo(point[0], point[1]));
    if (fillColor) {
      globeContext.closePath();
      globeContext.fillStyle = fillColor;
      globeContext.fill();
    }
    globeContext.stroke();
  });
  globeContext.setLineDash([]);
}

function drawGlobe() {
  if (!canvasWidth || !canvasHeight) return;
  const centerX = canvasWidth * (window.innerWidth <= 760 ? 0.5 : 0.43);
  const centerY = canvasHeight * 0.52;
  const radius = Math.min(canvasWidth * 0.43, canvasHeight * 0.43);
  const sphereGradient = globeContext.createRadialGradient(
    centerX - radius * 0.34,
    centerY - radius * 0.38,
    radius * 0.08,
    centerX,
    centerY,
    radius * 1.15,
  );
  sphereGradient.addColorStop(0, "rgba(27, 39, 64, .97)");
  sphereGradient.addColorStop(0.68, "rgba(12, 21, 38, .98)");
  sphereGradient.addColorStop(1, "rgba(3, 7, 16, 1)");

  globeContext.clearRect(0, 0, canvasWidth, canvasHeight);
  globeContext.save();
  globeContext.shadowColor = "rgba(75, 135, 214, .2)";
  globeContext.shadowBlur = 34;
  globeContext.beginPath();
  globeContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  globeContext.fillStyle = sphereGradient;
  globeContext.fill();
  globeContext.shadowBlur = 0;
  globeContext.clip();

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const line = [];
    for (let longitude = -180; longitude <= 180; longitude += 4) {
      line.push([longitude, latitude]);
    }
    drawGeoLine(
      line,
      false,
      centerX,
      centerY,
      radius,
      "rgba(96, 148, 212, .2)",
      0.7,
    );
  }
  for (let longitude = -180; longitude < 180; longitude += 30) {
    const line = [];
    for (let latitude = -88; latitude <= 88; latitude += 4) {
      line.push([longitude, latitude]);
    }
    drawGeoLine(
      line,
      false,
      centerX,
      centerY,
      radius,
      "rgba(83, 134, 198, .17)",
      0.7,
    );
  }

  landmasses.forEach((landmass) => {
    drawGeoLine(
      landmass,
      true,
      centerX,
      centerY,
      radius,
      "rgba(104, 145, 197, .62)",
      0.8,
      "rgba(8, 14, 27, .96)",
    );
  });
  countryBoundaries.forEach((boundary) => {
    drawGeoLine(
      boundary,
      false,
      centerX,
      centerY,
      radius,
      "rgba(77, 116, 164, .48)",
      0.55,
    );
  });

  const route = [
    [107.1, -6.8],
    [121, 12],
    [139.7, 35.7],
  ];
  drawGeoLine(
    route,
    false,
    centerX,
    centerY,
    radius,
    "rgba(59, 157, 255, .86)",
    1.3,
    null,
    [3, 5],
  );
  route.forEach((point, index) => {
    const projected = projectPoint(
      point[0],
      point[1],
      centerX,
      centerY,
      radius,
    );
    if (projected.depth <= 0) return;
    globeContext.beginPath();
    globeContext.arc(
      projected.x,
      projected.y,
      index === 0 ? 3 : 2,
      0,
      Math.PI * 2,
    );
    globeContext.fillStyle = "#69d5ff";
    globeContext.shadowColor = "#318dff";
    globeContext.shadowBlur = 12;
    globeContext.fill();
    globeContext.shadowBlur = 0;
  });

  const edgeGradient = globeContext.createRadialGradient(
    centerX,
    centerY,
    radius * 0.62,
    centerX,
    centerY,
    radius,
  );
  edgeGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  edgeGradient.addColorStop(1, "rgba(0, 5, 8, .64)");
  globeContext.fillStyle = edgeGradient;
  globeContext.fillRect(
    centerX - radius,
    centerY - radius,
    radius * 2,
    radius * 2,
  );
  globeContext.restore();

  globeContext.beginPath();
  globeContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  globeContext.strokeStyle = "rgba(112, 174, 241, .58)";
  globeContext.lineWidth = 1.2;
  globeContext.shadowColor = "rgba(71, 139, 221, .32)";
  globeContext.shadowBlur = 16;
  globeContext.stroke();
  globeContext.shadowBlur = 0;
}

const heroSection = document.querySelector(".hero");
heroSection.addEventListener("pointerdown", (event) => {
  if (event.target.closest("a, button, .maplibre-map")) return;
  dragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  heroSection.setPointerCapture(event.pointerId);
  event.preventDefault();
});
heroSection.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  viewLongitude =
    (viewLongitude - (event.clientX - lastPointerX) * 0.4 + 360) % 360;
  viewLatitude = Math.max(
    -65,
    Math.min(65, viewLatitude + (event.clientY - lastPointerY) * 0.25),
  );
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  drawGlobe();
});
const stopDragging = () => {
  dragging = false;
};
heroSection.addEventListener("pointerup", stopDragging);
heroSection.addEventListener("pointercancel", stopDragging);
globeCanvas.addEventListener("keydown", (event) => {
  const adjustments = {
    ArrowLeft: [-10, 0],
    ArrowRight: [10, 0],
    ArrowUp: [0, 8],
    ArrowDown: [0, -8],
  };
  if (event.key === "Home") {
    viewLongitude = 108;
    viewLatitude = 12;
  } else if (adjustments[event.key]) {
    viewLongitude = (viewLongitude + adjustments[event.key][0] + 360) % 360;
    viewLatitude = Math.max(
      -65,
      Math.min(65, viewLatitude + adjustments[event.key][1]),
    );
  } else {
    return;
  }
  event.preventDefault();
  drawGlobe();
});
window.addEventListener("resize", resizeGlobe);
resizeGlobe();

function animateGlobe(timestamp) {
  if (enhancedMapReady) return;
  window.requestAnimationFrame(animateGlobe);
  if (timestamp - lastFrameTime < 33) return;
  if (!dragging && !reducedMotion) {
    viewLongitude =
      (viewLongitude + (timestamp - lastFrameTime) * 0.002 + 360) % 360;
    drawGlobe();
  }
  lastFrameTime = timestamp;
}
window.requestAnimationFrame(animateGlobe);

const mapStatus = document.querySelector("#map-status");
const mapHint = document.querySelector("#map-hint");
const projectionButtons = document.querySelectorAll("[data-map-projection]");
const mapStyleButtons = document.querySelectorAll("[data-map-style]");
const mapResetButton = document.querySelector(".map-reset");

if (!window.maplibregl) {
  mapStatus.textContent =
    "Pustaka peta gagal dimuat. Globe dasar tersedia; periksa koneksi internet.";
} else {
  let selectedMapStyle = "map";
  let satelliteFailed = false;
  let worldMap;
  try {
    worldMap = new maplibregl.Map({
      container: "world-map",
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [107.1428, -6.8175],
      zoom: 1.15,
      minZoom: 0.6,
      maxZoom: 18,
      maxPitch: 60,
      projection: { type: "globe" },
      renderWorldCopies: false,
      attributionControl: true,
    });
  } catch (error) {
    mapStatus.textContent =
      "Peta interaktif tidak dapat dijalankan di browser ini.";
    console.error("World map initialization failed:", error);
  }

  if (worldMap) {
    worldMap.addControl(
      new maplibregl.NavigationControl({
        showZoom: true,
        showCompass: true,
      }),
      "bottom-right",
    );
    worldMap.on("error", (event) => {
      if (!enhancedMapReady || selectedMapStyle === "satellite") {
        if (selectedMapStyle === "satellite") satelliteFailed = true;
        mapStatus.textContent =
          selectedMapStyle === "satellite"
            ? "Lapisan satelit tidak dapat dimuat. Periksa koneksi, atau pilih MAP."
            : "Peta dunia gagal dimuat. Periksa koneksi internet.";
        mapStatus.hidden = false;
        if (event.error) console.error("World map error:", event.error);
      }
    });
    worldMap.on("idle", () => {
      if (selectedMapStyle === "satellite" && !satelliteFailed) {
        mapStatus.hidden = true;
      }
    });
    worldMap.once("load", () => {
      enhancedMapReady = true;
      document.querySelector(".hero-map").classList.add("map-loaded");
      mapStatus.hidden = true;
      [...projectionButtons, ...mapStyleButtons, mapResetButton].forEach(
        (button) => {
          button.disabled = false;
        },
      );

      worldMap.getStyle().layers.forEach((layer) => {
        if (layer.type === "symbol" && layer.layout?.["text-field"]) {
          worldMap.setPaintProperty(layer.id, "text-color", "#b8d5ca");
          worldMap.setPaintProperty(layer.id, "text-halo-color", "#10191c");
          worldMap.setPaintProperty(layer.id, "text-halo-width", 1.2);
        }
      });

      ["boundary_country_z0-4", "boundary_country_z5-"].forEach((layerId) => {
        if (worldMap.getLayer(layerId)) {
          worldMap.setPaintProperty(layerId, "line-color", "#426b60");
        }
      });

      worldMap.addSource("satellite-imagery", {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          "Tiles © Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
      });
      const firstSymbolLayer = worldMap
        .getStyle()
        .layers.find((layer) => layer.type === "symbol");
      const satelliteLayer = {
        id: "satellite-imagery",
        type: "raster",
        source: "satellite-imagery",
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.96 },
      };
      if (firstSymbolLayer) {
        worldMap.addLayer(satelliteLayer, firstSymbolLayer.id);
      } else {
        worldMap.addLayer(satelliteLayer);
      }

      const cianjurPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
      }).setText("Cianjur, Jawa Barat, Indonesia");
      new maplibregl.Marker({ color: "#a4f0a3", scale: 0.72 })
        .setLngLat([107.1428, -6.8175])
        .setPopup(cianjurPopup)
        .addTo(worldMap);
    });

    projectionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const projection = button.dataset.mapProjection;
        worldMap.setProjection({ type: projection });
        projectionButtons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        mapHint.textContent =
          projection === "globe"
            ? "3D · SERET UNTUK MEMUTAR · ZOOM UNTUK LABEL NEGARA/KOTA"
            : "2D · SERET UNTUK MENJELAJAH · ZOOM UNTUK LABEL NEGARA/KOTA";
      });
    });

    mapStyleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectedMapStyle = button.dataset.mapStyle;
        satelliteFailed = false;
        worldMap.setLayoutProperty(
          "satellite-imagery",
          "visibility",
          selectedMapStyle === "satellite" ? "visible" : "none",
        );
        mapStyleButtons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        mapStatus.hidden = selectedMapStyle !== "satellite";
        if (selectedMapStyle === "satellite") {
          mapStatus.textContent = "MEMUAT CITRA SATELIT…";
        }
      });
    });

    mapResetButton.addEventListener("click", () => {
      worldMap.setProjection({ type: "globe" });
      worldMap.easeTo({
        center: [107.1428, -6.8175],
        zoom: 1.15,
        bearing: 0,
        pitch: 0,
      });
      worldMap.setLayoutProperty("satellite-imagery", "visibility", "none");
      selectedMapStyle = "map";
      mapStatus.hidden = true;
      mapHint.textContent =
        "3D · SERET UNTUK MEMUTAR · ZOOM UNTUK LABEL NEGARA/KOTA";
      [...projectionButtons, ...mapStyleButtons].forEach((button) => {
        const selected =
          button.dataset.mapProjection === "globe" ||
          button.dataset.mapStyle === "map";
        button.setAttribute("aria-pressed", String(selected));
      });
    });
  }
}
