/**
 * APEX OmniERP - Employee Tracking System (ETS) & GIS Map Engine
 * Enhanced with Interactive Precision Pin Recalibration & Municipality-Based STL BOOTH Pin Colors
 */

// Section 7 & 8: Centralized Municipality -> Color Mapping Configuration
// Panabo City = GREEN, Sto. Tomas = YELLOW, Carmen = RED, Kapalong = BLUE
const DEFAULT_MUNICIPALITY_COLORS = {
  'Panabo City': '#10b981',  // GREEN
  'Panabo': '#10b981',
  'Sto. Tomas': '#eab308',   // YELLOW
  'Santo Tomas': '#eab308',
  'Carmen': '#ef4444',       // RED
  'Kapalong': '#3b82f6',     // BLUE
  'Tagum City': '#8b5cf6',   // PURPLE
  'Tagum': '#8b5cf6',
  'Talaingod': '#ec4899',    // PINK
  'Samal': '#06b6d4',        // CYAN / TEAL
  'Island Garden City of Samal': '#06b6d4',
  'Asuncion': '#f97316',     // ORANGE
  'New Corella': '#14b8a6',  // TEAL
  'San Isidro': '#6366f1',   // INDIGO
  'Braulio E. Dujali': '#84cc16' // LIME
};

const MUNICIPALITY_FALLBACK_PALETTE = [
  '#10b981', '#eab308', '#ef4444', '#3b82f6', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#84cc16', '#d97706', '#059669'
];

function getStoredMunicipalityColorMap() {
  try {
    const raw = localStorage.getItem('NORTH005_MUNI_COLORS');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not parse stored muni colors', e);
  }
  return { ...DEFAULT_MUNICIPALITY_COLORS };
}

function saveMunicipalityColorMap(map) {
  try {
    localStorage.setItem('NORTH005_MUNI_COLORS', JSON.stringify(map));
  } catch (e) {
    console.warn('Could not persist muni colors', e);
  }
}

function resolveMunicipalityColor(muni) {
  if (!muni) return '#3b82f6';
  const cleanMuni = muni.trim();
  const map = getStoredMunicipalityColorMap();
  
  // Exact or case-insensitive match
  for (const [key, color] of Object.entries(map)) {
    if (key.toLowerCase() === cleanMuni.toLowerCase()) {
      return color;
    }
  }

  // Substring match (e.g. "Panabo" in "Panabo City")
  for (const [key, color] of Object.entries(map)) {
    if (cleanMuni.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cleanMuni.toLowerCase())) {
      map[cleanMuni] = color;
      saveMunicipalityColorMap(map);
      return color;
    }
  }

  // Dynamic persistent assignment of unused color from palette
  const usedColors = Object.values(map);
  const available = MUNICIPALITY_FALLBACK_PALETTE.find(c => !usedColors.includes(c)) || '#64748b';
  map[cleanMuni] = available;
  saveMunicipalityColorMap(map);
  return available;
}

window.getMunicipalityColor = resolveMunicipalityColor;
window.getMunicipalityColorMap = getStoredMunicipalityColorMap;

class EtsMapEngine {
  constructor() {
    this.map = null;
    this.markers = {
      booths: L.layerGroup(),
      collectors: L.layerGroup(),
      tellers: L.layerGroup(),
      supervisors: L.layerGroup()
    };
    this.allMarkerInstances = {}; // mapped by id -> L.marker
    this.routeLine = null;
    this.initialized = false;
    this.calibrationMode = false;
    this.pendingCalibration = null; // { id, name, lat, lng }
  }

  init(containerId = 'ets-map-container') {
    if (this.initialized && this.map) {
      setTimeout(() => this.map.invalidateSize(), 200);
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    // Center on Davao Del Norte (Tagum / Sto. Tomas / Panabo sector)
    const ddnCenter = [7.4475, 125.8078];
    this.map = L.map(containerId, {
      center: ddnCenter,
      zoom: 11,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors | APEX Davao Del Norte Operations'
    }).addTo(this.map);

    // Click map listener for pin dropping during precision calibration
    this.map.on('click', (e) => {
      if (this.calibrationTargetId) {
        this.setCoordinateForTarget(this.calibrationTargetId, e.latlng.lat, e.latlng.lng);
      }
    });

    Object.values(this.markers).forEach(layer => layer.addTo(this.map));

    this.initialized = true;
    this.renderAllMarkers();
    setTimeout(() => this.map.invalidateSize(), 300);
  }

  // Marker icon representing an STL BOOTH with municipality color
  createSvgIcon(color, glyphText, isDraggable = false, title = 'STL BOOTH') {
    return L.divIcon({
      className: 'custom-ets-marker',
      html: `
        <div title="${title}" style="
          background: ${color};
          color: #ffffff;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          border: 2px solid ${isDraggable ? '#f59e0b' : '#ffffff'};
          font-weight: 700;
          font-size: 13px;
          position: relative;
          cursor: ${isDraggable ? 'grab' : 'pointer'};
          ${isDraggable ? 'animation: pulse-border 1.5s infinite;' : ''}
        ">
          ${glyphText}
          <div style="
            position: absolute;
            bottom: -6px;
            left: 11px;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid ${color};
          "></div>
        </div>
      `,
      iconSize: [34, 40],
      iconAnchor: [17, 40],
      popupAnchor: [0, -38]
    });
  }

  renderAllMarkers() {
    if (!this.map) return;
    const store = window.appStore;
    if (!store) return;

    Object.values(this.markers).forEach(layer => layer.clearLayers());
    this.allMarkerInstances = {};

    const employees = store.getEmployees();
    const relievers = store.data.relievers || [];
    const allStaff = [...employees, ...relievers.filter(r => !employees.some(e => e.id === r.id))];
    const isDraggable = this.calibrationMode;

    allStaff.forEach(emp => {
      // Master Registry is the SOURCE OF TRUTH:
      // Only plot marker if employee has valid GPS coordinates (lat -90..90, lng -180..180)
      if (!window.hasValidGpsCoordinates(emp)) {
        return; // Skip staff without valid GPS coordinates in Master Registry
      }

      const lat = Number(emp.lat !== undefined && emp.lat !== null && emp.lat !== '' ? emp.lat : emp.coordinates.lat);
      const lng = Number(emp.lng !== undefined && emp.lng !== null && emp.lng !== '' ? emp.lng : emp.coordinates.lng);

      // Determine Municipality for pin color coding
      let muni = emp.municipality || '';
      if (!muni || muni === '-') {
        const addr = (emp.address || emp.area || emp.purok || '').toLowerCase();
        if (addr.includes('panabo')) muni = 'Panabo City';
        else if (addr.includes('tomas')) muni = 'Sto. Tomas';
        else if (addr.includes('carmen')) muni = 'Carmen';
        else if (addr.includes('kapalong')) muni = 'Kapalong';
        else if (addr.includes('tagum')) muni = 'Tagum City';
        else if (addr.includes('talaingod')) muni = 'Talaingod';
        else if (addr.includes('samal')) muni = 'Samal';
        else muni = 'Sto. Tomas';
      }

      // Municipality-based STL BOOTH Pin Color
      const color = resolveMunicipalityColor(muni);

      let glyph = '🏪';
      let targetLayer = this.markers.tellers;

      const roleUpper = (emp.role || '').toUpperCase();
      if (roleUpper.includes('SUPERVISOR')) {
        glyph = '⭐';
        targetLayer = this.markers.supervisors;
      } else if (roleUpper.includes('COLLECTOR')) {
        glyph = '🛵';
        targetLayer = this.markers.collectors;
      } else if (roleUpper.includes('RELIEVER')) {
        glyph = '🔄';
        targetLayer = this.markers.tellers;
      } else if (roleUpper.includes('TEAM LEADER')) {
        glyph = '👔';
        targetLayer = this.markers.supervisors;
      }

      const boothDisplay = emp.boothCode || emp.booth || '-';
      const icon = this.createSvgIcon(color, glyph, isDraggable, `STL BOOTH: ${boothDisplay} (${muni})`);
      const marker = L.marker([lat, lng], { 
        icon,
        draggable: isDraggable
      });

      // Marker Tooltip (STL BOOTH)
      marker.bindTooltip(`<strong>STL BOOTH</strong>: ${boothDisplay} • ${emp.name} (${muni})`, { direction: 'top' });

      // Handle dragend when in calibration mode
      marker.on('dragend', (event) => {
        const newLatLng = event.target.getLatLng();
        this.promptSaveCalibration(emp.id, emp.name, newLatLng.lat, newLatLng.lng);
      });

      // Role display normalization
      let displayRole = emp.role;
      if (roleUpper === 'TELLER' || roleUpper === 'STATION TELLER') displayRole = 'Sales Representative';
      else if (roleUpper === 'RELIVER') displayRole = 'Reliever';

      marker.bindPopup(`
        <div style="font-family: inherit; min-width: 240px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; background: ${color}; color: #ffffff; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px;">
              STL BOOTH
            </span>
            <span style="font-size: 11.5px; font-weight: 700; color: ${color};">
              ● ${muni}
            </span>
          </div>
          <div style="font-weight: 800; font-size: 15px; color: #0f172a; margin-bottom: 2px;">
            ${emp.name}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">
            ${displayRole} • <code>${emp.id}</code>
          </div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>Outlet / Booth Location:</strong> <code>${boothDisplay}</code></div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>Municipality:</strong> <span style="font-weight: 700; color: ${color};">${muni}</span></div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>Address:</strong> ${emp.address || emp.area || '-'}</div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>GPS:</strong> <span style="font-family: monospace; font-weight: 600;">${emp.lat ? emp.lat.toFixed(6) : '-'}, ${emp.lng ? emp.lng.toFixed(6) : '-'}</span></div>
          <div style="font-size: 12px; margin-bottom: 6px;"><strong>Status:</strong> <span style="font-weight: 600; color: #16a34a;">${emp.status || 'Active'}</span></div>
          <div style="margin-top: 8px; display: flex; gap: 6px;">
            <button onclick="window.openPrecisionCalibrateModal('${emp.id}')" style="flex: 1; padding: 6px 10px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11.5px; font-weight: 700;">
              ✏️ Edit
            </button>
            <button onclick="window.requestDeleteEmployee('${emp.id}')" style="flex: 1; padding: 6px 10px; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11.5px; font-weight: 700;">
              🗑️ Delete
            </button>
          </div>
        </div>
      `);

      this.allMarkerInstances[emp.id] = marker;
      targetLayer.addLayer(marker);
    });
  }

  // Toggle Draggable Calibration Mode
  toggleCalibrationMode() {
    this.calibrationMode = !this.calibrationMode;
    this.renderAllMarkers();

    const banner = document.getElementById('ets-calibration-banner');
    if (banner) {
      banner.style.display = this.calibrationMode ? 'flex' : 'none';
    }

    if (this.calibrationMode) {
      alert('🎯 [STL BOOTH RECALIBRATION MODE ACTIVATED]\nYou can now:\n1. Drag any STL BOOTH marker directly on the map to place its exact location.\n2. Or click "Edit" on any staff member in the fleet list to type coordinates.');
    }
  }

  promptSaveCalibration(id, name, lat, lng) {
    const formattedLat = parseFloat(lat.toFixed(6));
    const formattedLng = parseFloat(lng.toFixed(6));

    if (confirm(`Save updated GPS Location for STL BOOTH:\n${name} (${id})?\n\nNew Coordinates:\nLatitude: ${formattedLat}\nLongitude: ${formattedLng}`)) {
      window.appStore.updateCoordinates(id, formattedLat, formattedLng);
      if (window.sfx) window.sfx.playChime();
      alert(`✅ GPS Coordinates for STL BOOTH (${name}) successfully saved to [${formattedLat}, ${formattedLng}]!`);
    } else {
      this.renderAllMarkers();
    }
  }

  setCoordinateForTarget(id, lat, lng) {
    const formattedLat = parseFloat(Number(lat).toFixed(6));
    const formattedLng = parseFloat(Number(lng).toFixed(6));

    window.appStore.updateCoordinates(id, formattedLat, formattedLng);
    this.renderAllMarkers();
    this.focusCoordinates(formattedLat, formattedLng, 16);

    const marker = this.allMarkerInstances[id];
    if (marker) {
      marker.openPopup();
    }

    this.calibrationTargetId = null;
    document.body.style.cursor = 'default';
  }

  focusCoordinates(lat, lng, zoom = 15) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom);
  }

  showRoute(empId) {
    if (!this.map) return;
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }

    // Realistic routes across Davao Del Norte
    const sampleRoutes = {
      'DDN005-SC001': [
        [7.5303, 125.6264], // Sto Tomas Poblacion
        [7.5350, 125.6320], // Feeder Road 3
        [7.5400, 125.6400], // New Katipunan
        [7.5250, 125.6150]  // Tibal-og
      ],
      'DDN005-SC002': [
        [7.4475, 125.8078], // Tagum City Hall
        [7.4600, 125.8150], // Mankilam
        [7.5855, 125.7072], // Kapalong
        [7.6536, 125.6417]  // Talaingod
      ],
      'DDN005-SC003': [
        [7.3586, 125.7061], // Carmen Market
        [7.3650, 125.7120], // Tuganay
        [7.4475, 125.8078]  // Tagum Junction
      ],
      'DDN005-SC004': [
        [7.3078, 125.6833], // Panabo City Gredu
        [7.3150, 125.6900], // San Vicente
        [7.3000, 125.6750]  // Cacao Panabo
      ]
    };

    const route = sampleRoutes[empId] || [
      [7.4475, 125.8078],
      [7.4520, 125.8120],
      [7.4600, 125.8180]
    ];

    this.routeLine = L.polyline(route, {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(this.map);

    this.map.fitBounds(this.routeLine.getBounds(), { padding: [40, 40] });
  }
}

window.etsMap = new EtsMapEngine();
