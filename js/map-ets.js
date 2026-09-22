/**
 * APEX OmniERP - Employee Tracking System (ETS) & GIS Map Engine
 * Enhanced with Interactive Precision Pin Recalibration for Davao Del Norte
 */

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

  createSvgIcon(color, glyphText, isDraggable = false) {
    return L.divIcon({
      className: 'custom-ets-marker',
      html: `
        <div style="
          background: ${color};
          color: #ffffff;
          width: 32px;
          height: 32px;
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
            left: 10px;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid ${color};
          "></div>
        </div>
      `,
      iconSize: [32, 38],
      iconAnchor: [16, 38],
      popupAnchor: [0, -36]
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
      let color = '#10b981';
      let glyph = '🏪';
      let targetLayer = this.markers.tellers;

      const roleUpper = (emp.role || '').toUpperCase();
      if (roleUpper.includes('SUPERVISOR')) {
        color = '#7c3aed';
        glyph = '⭐';
        targetLayer = this.markers.supervisors;
      } else if (roleUpper.includes('COLLECTOR')) {
        color = '#f59e0b';
        glyph = '🛵';
        targetLayer = this.markers.collectors;
      } else if (roleUpper.includes('RELIEVER')) {
        color = '#0284c7';
        glyph = '🔄';
        targetLayer = this.markers.tellers;
      }

      const icon = this.createSvgIcon(color, glyph, isDraggable);
      const marker = L.marker([emp.lat, emp.lng], { 
        icon,
        draggable: isDraggable
      });

      // Handle dragend when in calibration mode
      marker.on('dragend', (event) => {
        const newLatLng = event.target.getLatLng();
        this.promptSaveCalibration(emp.id, emp.name, newLatLng.lat, newLatLng.lng);
      });

      marker.bindPopup(`
        <div style="font-family: inherit; min-width: 230px;">
          <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px;">
            ${emp.name}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">
            ${emp.role} • <code>${emp.id}</code>
          </div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>Station / Booth:</strong> <code>${emp.boothCode}</code></div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>Address:</strong> ${emp.address || emp.area}</div>
          <div style="font-size: 12px; margin-bottom: 3px;"><strong>GPS:</strong> <span style="font-family: monospace; font-weight: 600;">${emp.lat.toFixed(6)}, ${emp.lng.toFixed(6)}</span></div>
          <div style="font-size: 12px; margin-bottom: 6px;"><strong>Status:</strong> <span style="font-weight: 600; color: #16a34a;">${emp.status}</span></div>
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
      alert('🎯 [PIN RECALIBRATION MODE ACTIVATED]\nYou can now:\n1. Drag any employee/booth pin directly on the map to place their exact location.\n2. Or click "Set Exact Coordinates" on any employee in the fleet list to type coordinates.');
    }
  }

  promptSaveCalibration(id, name, lat, lng) {
    const formattedLat = parseFloat(lat.toFixed(6));
    const formattedLng = parseFloat(lng.toFixed(6));

    if (confirm(`Save updated GPS Pin Location for:\n${name} (${id})?\n\nNew Coordinates:\nLatitude: ${formattedLat}\nLongitude: ${formattedLng}`)) {
      window.appStore.updateCoordinates(id, formattedLat, formattedLng);
      if (window.sfx) window.sfx.playChime();
      alert(`✅ GPS Coordinates for ${name} successfully pinned to [${formattedLat}, ${formattedLng}]!`);
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
