const STORAGE_KEY = "qr-manager:v1";
const SETTINGS_KEY = "qr-manager:settings";
const QUIET_ZONE = 4;
const PREVIEW_SCALE = 6;

const defaultState = {
  counter: 0,
  items: {}
};

const defaultSettings = {
  baseThickness: 1.6,
  moduleHeight: 1.4,
  moduleSize: 1.6
};

const listEl = document.getElementById("qrList");
const emptyEl = document.getElementById("emptyState");
const countEl = document.getElementById("qrCount");
const createBtn = document.getElementById("createQrBtn");
const template = document.getElementById("qrCardTemplate");

let state = normalizeState(loadState());
let settings = loadSettings();

setupSettingsUI();
render();

createBtn.addEventListener("click", () => {
  const id = createNextId(state);
  state.items[id] = state.items[id] || "";
  saveState(state);
  render();
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { ...defaultState };
  } catch (err) {
    return { ...defaultState };
  }
}

function saveState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function normalizeState(next) {
  if (!next || typeof next !== "object") {
    return { ...defaultState };
  }

  if (!next.items || typeof next.items !== "object") {
    next.items = {};
  }

  if (typeof next.counter !== "number") {
    next.counter = 0;
  }

  const maxId = Object.keys(next.items).reduce((max, id) => {
    const num = Number.parseInt(id.replace("qr", ""), 10);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0);

  next.counter = Math.max(next.counter, maxId);
  return next;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw);
    return {
      baseThickness: Number(parsed.baseThickness || defaultSettings.baseThickness),
      moduleHeight: Number(parsed.moduleHeight || defaultSettings.moduleHeight),
      moduleSize: Number(parsed.moduleSize || defaultSettings.moduleSize)
    };
  } catch (err) {
    return { ...defaultSettings };
  }
}

function saveSettings(next) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

function setupSettingsUI() {
  const baseInput = document.getElementById("baseThickness");
  const moduleInput = document.getElementById("moduleHeight");
  const sizeInput = document.getElementById("moduleSize");
  const baseValue = document.getElementById("baseThicknessValue");
  const moduleValue = document.getElementById("moduleHeightValue");
  const sizeValue = document.getElementById("moduleSizeValue");

  baseInput.value = settings.baseThickness;
  moduleInput.value = settings.moduleHeight;
  sizeInput.value = settings.moduleSize;

  const update = () => {
    settings = {
      baseThickness: Number(baseInput.value),
      moduleHeight: Number(moduleInput.value),
      moduleSize: Number(sizeInput.value)
    };
    baseValue.textContent = `${settings.baseThickness.toFixed(1)} mm`;
    moduleValue.textContent = `${settings.moduleHeight.toFixed(1)} mm`;
    sizeValue.textContent = `${settings.moduleSize.toFixed(1)} mm`;
    saveSettings(settings);
  };

  baseInput.addEventListener("input", update);
  moduleInput.addEventListener("input", update);
  sizeInput.addEventListener("input", update);

  update();
}

function createNextId(next) {
  next.counter += 1;
  return `qr${next.counter}`;
}

function render() {
  listEl.innerHTML = "";
  const ids = Object.keys(state.items).sort(sortIds);

  emptyEl.hidden = ids.length > 0;
  countEl.textContent = String(ids.length);

  ids.forEach((id) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".qr-card");
    const titleEl = node.querySelector("[data-qr-title]");
    const pathEl = node.querySelector("[data-qr-path]");
    const destInput = node.querySelector("[data-destination]");
    const destText = node.querySelector("[data-qr-destination]");
    const canvas = node.querySelector("[data-qr-canvas]");
    const copyBtn = node.querySelector("[data-copy]");
    const saveBtn = node.querySelector("[data-save]");
    const pngBtn = node.querySelector("[data-download-png]");
    const threeMfBtn = node.querySelector("[data-download-3mf]");
    const redirectBtn = node.querySelector("[data-download-redirect]");

    const link = getQrLink(id);
    const destination = state.items[id] || "";

    titleEl.textContent = id.toUpperCase();
    pathEl.textContent = link;
    destInput.value = destination;
    destText.textContent = destination ? `Current: ${destination}` : "No destination set";

    const matrix = buildQrMatrix(link);
    renderQrCanvas(canvas, matrix);

    copyBtn.addEventListener("click", () => {
      copyText(link);
    });

    saveBtn.addEventListener("click", () => {
      updateDestination(id, destInput.value, destText);
    });

    destInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        updateDestination(id, destInput.value, destText);
      }
    });

    pngBtn.addEventListener("click", () => {
      const dataUrl = canvas.toDataURL("image/png");
      downloadDataUrl(`${id}.png`, dataUrl);
    });

    threeMfBtn.addEventListener("click", () => {
      const threeMf = build3mf(matrix, settings, id);
      downloadBlob(`${id}.3mf`, threeMf);
    });

    redirectBtn.addEventListener("click", () => {
      const html = buildRedirectHtml(id, state.items[id] || "");
      downloadText(`${id}-index.html`, html);
    });

    card.dataset.qrId = id;
    listEl.appendChild(node);
  });
}

function sortIds(a, b) {
  const numA = Number.parseInt(a.replace("qr", ""), 10);
  const numB = Number.parseInt(b.replace("qr", ""), 10);
  return numA - numB;
}

function updateDestination(id, value, labelEl) {
  const trimmed = value.trim();
  state.items[id] = trimmed;
  saveState(state);
  labelEl.textContent = trimmed ? `Current: ${trimmed}` : "No destination set";
}

function getQrLink(id) {
  return new URL(`${id}/`, window.location.href).toString();
}

function buildQrMatrix(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  const modules = [];

  for (let row = 0; row < size; row += 1) {
    const line = [];
    for (let col = 0; col < size; col += 1) {
      line.push(qr.isDark(row, col));
    }
    modules.push(line);
  }

  return { size, modules };
}

function renderQrCanvas(canvas, matrix) {
  const cells = matrix.size + QUIET_ZONE * 2;
  const pixelSize = cells * PREVIEW_SCALE;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = pixelSize * ratio;
  canvas.height = pixelSize * ratio;
  canvas.style.width = `${pixelSize}px`;
  canvas.style.height = `${pixelSize}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, pixelSize, pixelSize);

  ctx.fillStyle = "#fefcf9";
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  ctx.fillStyle = "#111111";
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.modules[row][col]) {
        const x = (col + QUIET_ZONE) * PREVIEW_SCALE;
        const y = (row + QUIET_ZONE) * PREVIEW_SCALE;
        ctx.fillRect(x, y, PREVIEW_SCALE, PREVIEW_SCALE);
      }
    }
  }
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function downloadText(filename, text) {
  downloadBlob(filename, new Blob([text], { type: "text/plain" }));
}

function buildRedirectHtml(id, fallbackUrl) {
  const cleanFallback = fallbackUrl.trim();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${id} redirect</title>
  <style>
    body {
      margin: 0;
      font-family: "Candara", "Trebuchet MS", sans-serif;
      background: #f7f4ef;
      color: #1a1a1a;
      display: grid;
      place-items: center;
      min-height: 100vh;
    }

    .card {
      background: #fff;
      border: 1px solid #e3ddd2;
      padding: 24px 28px;
      border-radius: 18px;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
      max-width: 520px;
    }

    .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #6c655c;
    }

    .target {
      margin-top: 8px;
      word-break: break-all;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">Redirecting</div>
    <div class="target" id="redirect-target">Checking destination...</div>
  </div>
  <script>
    (function() {
      var STORAGE_KEY = "qr-manager:v1";
      var QR_ID = ${JSON.stringify(id)};
      var FALLBACK_URL = ${JSON.stringify(cleanFallback)};
      var url = FALLBACK_URL;

      try {
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          var data = JSON.parse(stored);
          if (data && data.items && data.items[QR_ID]) {
            url = data.items[QR_ID];
          }
        }
      } catch (err) {}

      var target = document.getElementById("redirect-target");
      if (target) {
        target.textContent = url ? url : "No destination set";
      }

      if (url) {
        window.location.replace(url);
      }
    })();
  </script>
</body>
</html>`;
}

function build3mf(matrix, options) {
  const moduleSize = clampNumber(options.moduleSize, 0.5, 10);
  const baseThickness = clampNumber(options.baseThickness, 0.2, 10);
  const moduleHeight = clampNumber(options.moduleHeight, 0.2, 10);

  const cells = matrix.size + QUIET_ZONE * 2;
  const totalSize = cells * moduleSize;

  const baseMesh = createMesh();
  addBoxToMesh(baseMesh, 0, 0, 0, totalSize, totalSize, baseThickness);

  const moduleMesh = createMesh();
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.modules[row][col]) {
        continue;
      }
      const x0 = (col + QUIET_ZONE) * moduleSize;
      const y0 = (row + QUIET_ZONE) * moduleSize;
      const x1 = x0 + moduleSize;
      const y1 = y0 + moduleSize;
      const z0 = baseThickness;
      const z1 = baseThickness + moduleHeight;
      addBoxToMesh(moduleMesh, x0, y0, z0, x1, y1, z1);
    }
  }

  const modelXml = build3mfModelXml(baseMesh, moduleMesh);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>
</Relationships>
`;

  const files = [
    { name: "[Content_Types].xml", data: encodeUtf8(contentTypes) },
    { name: "_rels/.rels", data: encodeUtf8(rels) },
    { name: "3D/3dmodel.model", data: encodeUtf8(modelXml) }
  ];

  return buildZipBlob(files, "application/3mf");
}

function build3mfModelXml(baseMesh, moduleMesh) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <m:basematerials id="1">
      <m:base name="white" displaycolor="#FFFFFF"/>
      <m:base name="black" displaycolor="#000000"/>
    </m:basematerials>
    <object id="1" type="model" pid="1" pindex="0">
${meshToXml(baseMesh)}    </object>
    <object id="2" type="model" pid="1" pindex="1">
${meshToXml(moduleMesh)}    </object>
  </resources>
  <build>
    <item objectid="1"/>
    <item objectid="2"/>
  </build>
</model>
`;
}

function meshToXml(mesh) {
  const vertices = mesh.vertices.map((vertex) =>
    `          <vertex x="${fmt(vertex[0])}" y="${fmt(vertex[1])}" z="${fmt(vertex[2])}"/>`
  );
  const triangles = mesh.triangles.map((triangle) =>
    `          <triangle v1="${triangle[0]}" v2="${triangle[1]}" v3="${triangle[2]}"/>`
  );

  return `      <mesh>
        <vertices>
${vertices.join("\n")}
        </vertices>
        <triangles>
${triangles.join("\n")}
        </triangles>
      </mesh>
`;
}

function createMesh() {
  return { vertices: [], triangles: [] };
}

function addBoxToMesh(mesh, x0, y0, z0, x1, y1, z1) {
  const v0 = addVertex(mesh, x0, y0, z0);
  const v1 = addVertex(mesh, x1, y0, z0);
  const v2 = addVertex(mesh, x1, y1, z0);
  const v3 = addVertex(mesh, x0, y1, z0);
  const v4 = addVertex(mesh, x0, y0, z1);
  const v5 = addVertex(mesh, x1, y0, z1);
  const v6 = addVertex(mesh, x1, y1, z1);
  const v7 = addVertex(mesh, x0, y1, z1);

  mesh.triangles.push(
    [v0, v2, v1],
    [v0, v3, v2],
    [v4, v5, v6],
    [v4, v6, v7],
    [v0, v1, v5],
    [v0, v5, v4],
    [v3, v6, v2],
    [v3, v7, v6],
    [v0, v4, v7],
    [v0, v7, v3],
    [v1, v6, v5],
    [v1, v2, v6]
  );
}

function addVertex(mesh, x, y, z) {
  mesh.vertices.push([x, y, z]);
  return mesh.vertices.length - 1;
}

const ZIP_ENCODER = new TextEncoder();
const CRC_TABLE = createCrcTable();

function encodeUtf8(text) {
  return ZIP_ENCODER.encode(text);
}

function buildZipBlob(entries, mimeType) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = buildLocalHeader(nameBytes.length, data.length, crc);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = buildCentralHeader(nameBytes.length, data.length, crc, offset);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  });

  const centralSize = sumByteLength(centralParts);
  const centralOffset = offset;
  const endRecord = buildEndRecord(entries.length, centralSize, centralOffset);

  return new Blob(
    [...localParts, ...centralParts, endRecord],
    { type: mimeType || "application/zip" }
  );
}

function buildLocalHeader(nameLength, size, crc) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);
  return header;
}

function buildCentralHeader(nameLength, size, crc, offset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function buildEndRecord(count, size, offset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true);
  return header;
}

function sumByteLength(parts) {
  return parts.reduce((total, part) => total + part.length, 0);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return min;
  }
  return Math.min(Math.max(num, min), max);
}

function fmt(value) {
  return Number(value).toFixed(4);
}
