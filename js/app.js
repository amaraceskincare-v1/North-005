/**
 * APEX OmniERP - Master Application Controller
 * High-performance, modular ERP frontend controller
 */

// Sound Engine using Web Audio API (Zero external assets, 100% reliable)
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) { }
  }

  playChime() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.25);
      });
    } catch (e) { }
  }

  playAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      osc.frequency.setValueAtTime(440, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) { }
  }
}

const sfx = new SoundFX();

// State variables
let revenueChart = null;
let boothShareChart = null;
let currentSampleCanvas = null;

// Currency Formatter (Philippine Peso)
function formatPHP(num) {
  return '₱' + Number(num || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPHPShort(num) {
  return '₱' + Number(num || 0).toLocaleString('en-PH', {
    maximumFractionDigits: 0
  });
}

// Initialization on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Universal Router FIRST so the target module is activated immediately
  initRouter();

  // 2. Initialize Core Shell Components
  initLiveClock();
  initTheme();
  initNavigation();
  initModals();
  initOcrStudio();
  
  // 3. Populate module data
  renderAll();

  // 4. Subscribe to store updates
  window.appStore.subscribe(() => {
    renderAll();
  });
});

function renderAll() {
  renderDashboard();
  renderEmployeesTable();
  renderFleetTrackingList();
  renderPipelines();
  renderFinance();
  renderRestDays();
  renderInventory();
  renderOrganization();
  renderEodReport();
  updateSidebarBadges();
}

// 1. Digital Live Clock
function initLiveClock() {
  const clockEl = document.getElementById('clock-display');
  function updateTime() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    clockEl.textContent = `${dateStr} ${timeStr} PST`;
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// 2. Multi-Theme Engine
function initTheme() {
  const picker = document.getElementById('theme-picker');
  const store = window.appStore;
  const currentTheme = store.getSettings().theme || 'corporate';
  
  document.documentElement.setAttribute('data-theme', currentTheme);
  picker.value = currentTheme;

  picker.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    document.documentElement.setAttribute('data-theme', newTheme);
    store.setTheme(newTheme);
    sfx.playClick();
    if (revenueChart) renderCharts();
  });

  const soundBtn = document.getElementById('sound-toggle-btn');
  soundBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    soundBtn.textContent = sfx.enabled ? '🔔' : '🔕';
    soundBtn.title = sfx.enabled ? 'Sound Enabled' : 'Sound Muted';
    if (sfx.enabled) sfx.playClick();
  });
}

// 3. Navigation View Switching & Universal Router
const ROUTE_MAP = {
  '/dashboard': 'view-dashboard',
  '/': 'view-dashboard',
  '/master-registry': 'view-employees',
  '/employees': 'view-employees',
  '/live-tracking': 'view-tracking',
  '/tracking': 'view-tracking',
  '/ets': 'view-tracking',
  '/sales-collection': 'view-pipelines',
  '/pipelines': 'view-pipelines',
  '/expenses': 'view-finance',
  '/purchasing': 'view-finance',
  '/finance': 'view-finance',
  '/inventory': 'view-inventory',
  '/reports': 'view-reports',
  '/eod-reports': 'view-reports',
  '/rest-days': 'view-restdays',
  '/organization': 'view-organization',
  '/teams': 'view-organization',
  '/ocr': 'view-ocr'
};

const VIEW_TO_ROUTE = {
  'view-dashboard': '/dashboard',
  'view-employees': '/master-registry',
  'view-tracking': '/live-tracking',
  'view-pipelines': '/sales-collection',
  'view-finance': '/expenses',
  'view-inventory': '/inventory',
  'view-reports': '/reports',
  'view-restdays': '/rest-days',
  'view-organization': '/organization',
  'view-ocr': '/ocr'
};

function resolveCurrentRoute() {
  let path = window.location.pathname.replace(/\/$/, '') || '/';

  // Check URL hash if present (e.g. #/live-tracking or #live-tracking)
  if (window.location.hash) {
    const hashClean = window.location.hash.replace(/^#\/?/, '/');
    if (ROUTE_MAP[hashClean]) return ROUTE_MAP[hashClean];
  }

  // Check search params fallback (?view=view-tracking or ?route=/live-tracking)
  const params = new URLSearchParams(window.location.search);
  if (params.get('route') && ROUTE_MAP[params.get('route')]) {
    return ROUTE_MAP[params.get('route')];
  }
  if (params.get('view') && VIEW_TO_ROUTE[params.get('view')]) {
    return params.get('view');
  }

  if (ROUTE_MAP[path]) {
    return ROUTE_MAP[path];
  }

  // If root '/', check if previously visited route exists in storage
  if (path === '/' || path === '') {
    try {
      const stored = localStorage.getItem('NORTH005_CURRENT_ROUTE');
      if (stored && ROUTE_MAP[stored]) return ROUTE_MAP[stored];
    } catch (e) {}
    return 'view-dashboard';
  }

  return 'view-dashboard';
}

function initRouter() {
  // Handle browser Back / Forward buttons
  window.addEventListener('popstate', (event) => {
    let targetView = null;
    if (event.state && event.state.viewId) {
      targetView = event.state.viewId;
    } else {
      targetView = resolveCurrentRoute();
    }
    if (targetView) {
      window.switchView(targetView, false);
    }
  });

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const targetView = resolveCurrentRoute();
    if (targetView) {
      window.switchView(targetView, false);
    }
  });

  // Resolve and activate initial route from current URL or pre-activated view
  const initialView = window.__INITIAL_ROUTE_VIEW__ || resolveCurrentRoute();
  window.switchView(initialView, false);

  // Clean up early route style now that class="active" is applied to initialView
  const earlyStyle = document.getElementById('early-route-style');
  if (earlyStyle) earlyStyle.remove();

  const initialPath = VIEW_TO_ROUTE[initialView] || '/dashboard';
  if (window.location.protocol.startsWith('http') && window.location.pathname !== initialPath) {
    window.history.replaceState({ viewId: initialView }, '', initialPath);
  }
}

function initNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.getAttribute('data-view');
      switchView(viewId, true);
    });
  });
}

window.switchView = function(viewId, updateHistory = true) {
  if (window.sfx) sfx.playClick();
  
  // Update sidebar active classes
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update view panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(viewId);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // View specific handlers
  if (viewId === 'view-tracking') {
    if (window.etsMap) {
      window.etsMap.init('ets-map-container');
      renderFleetTrackingList();
      if (window.etsMap.renderAllMarkers) window.etsMap.renderAllMarkers();
    }
    setTimeout(() => {
      if (window.etsMap && window.etsMap.map) window.etsMap.map.invalidateSize();
    }, 100);
  } else if (viewId === 'view-dashboard') {
    setTimeout(() => {
      renderCharts();
    }, 100);
  } else if (viewId === 'view-finance') {
    setTimeout(() => {
      if (window.expensesPayment) window.expensesPayment.init();
    }, 50);
  }

  // Update URL route and browser history
  const routePath = VIEW_TO_ROUTE[viewId] || '/dashboard';
  try {
    localStorage.setItem('NORTH005_CURRENT_ROUTE', routePath);
  } catch (e) {}

  if (updateHistory && window.location.protocol.startsWith('http')) {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    if (currentPath !== routePath) {
      window.history.pushState({ viewId }, '', routePath);
    }
  }
};

function updateSidebarBadges() {
  const store = window.appStore;
  const emps = store.getEmployees();
  const restDays = store.getRestDays().filter(r => r.status.includes('Pending'));
  const inv = store.getInventory();
  const lowPaper = inv.filter(i => i.type === 'THERMAL PAPER' && (i.quantity < 25 || i.status === 'Low Stock Alert'));

  const empBadge = document.getElementById('sidebar-emp-count');
  if (empBadge) empBadge.textContent = emps.length;

  const rdBadge = document.getElementById('sidebar-rd-count');
  if (rdBadge) rdBadge.textContent = restDays.length;

  const invAlert = document.getElementById('sidebar-inv-alert');
  if (invAlert) {
    invAlert.style.display = lowPaper.length > 0 ? 'inline-block' : 'none';
  }
}

// =========================================================================
// VIEW 1: EXECUTIVE DASHBOARD
// =========================================================================
// =========================================================================
// VIEW 1: OPERATIONS CONTROL CENTER & EXECUTIVE DASHBOARD
// =========================================================================
function renderDashboard() {
  const store = window.appStore;
  const summary = store.getFinancialSummary();
  const employees = store.getEmployees();
  const booths = store.getBooths();
  const inv = store.getInventory(false);

  // 1. Update 8 Summary Cards (Live Connected with Modules)
  const elTotalEmps = document.getElementById('dash-total-employees');
  if (elTotalEmps) elTotalEmps.textContent = `${employees.length} Active`;

  const elActiveBooths = document.getElementById('dash-active-booths');
  if (elActiveBooths) elActiveBooths.textContent = `${booths.length} Stations`;

  const elTotalProps = document.getElementById('dash-total-properties');
  if (elTotalProps) elTotalProps.textContent = `${inv.length} Registered`;

  const elAssignedProps = document.getElementById('dash-assigned-properties');
  if (elAssignedProps) {
    const assignedCount = inv.filter(i => i.status === 'Assigned' || i.status === 'Deployed').length;
    elAssignedProps.textContent = `${assignedCount} Assigned`;
  }

  const elTodayExp = document.getElementById('dash-today-expenses');
  if (elTodayExp) elTodayExp.textContent = formatPHP(summary.totalExpenses);

  const elTodayColl = document.getElementById('dash-today-collection');
  if (elTodayColl) elTodayColl.textContent = formatPHP(summary.totalIncome);

  const elLiveEts = document.getElementById('dash-live-ets');
  if (elLiveEts) elLiveEts.textContent = `${booths.length} / ${booths.length} Online`;

  const elEodStatus = document.getElementById('dash-eod-status');
  if (elEodStatus) elEodStatus.textContent = 'Balancing';

  // 2. Section 5.A: Live Operations (Booth Activity Table)
  renderDashboardLiveOperations();

  // 3. Section 5.D: Financial Snapshot
  const snapColl = document.getElementById('dash-snap-collections');
  if (snapColl) snapColl.textContent = formatPHP(summary.totalIncome);

  const snapExp = document.getElementById('dash-snap-expenses');
  if (snapExp) snapExp.textContent = formatPHP(summary.totalExpenses);

  const snapNet = document.getElementById('dash-snap-net');
  if (snapNet) snapNet.textContent = formatPHP(summary.netCashFlow);

  // 4. Section 5.B: Recent Activity Chronological Feed
  renderDashboardActivityFeed();

  // 5. Section 5.C: Inventory & Hardware Alerts
  renderDashboardInventoryAlerts();

  // 6. Interactive Charts
  renderCharts();
}

function renderDashboardLiveOperations() {
  const tbody = document.getElementById('dash-live-operations-tbody');
  if (!tbody) return;

  const store = window.appStore;
  const booths = store.getBooths().slice(0, 8); // Top sector representative stations

  tbody.innerHTML = booths.map((b, idx) => {
    const sampleIntakes = [42850, 38200, 51400, 31900, 46100, 39500, 48250, 44100];
    const intake = sampleIntakes[idx % sampleIntakes.length];

    return `
      <tr>
        <td><strong><code>${b.id}</code></strong></td>
        <td>
          <div style="font-weight: 600;">${b.assignedTellerName || 'Buffer Teller'}</div>
          <div style="font-size: 10.5px; color: var(--text-dim);">POS-${b.id}</div>
        </td>
        <td>
          <div style="font-size: 11.5px; color: var(--text-muted); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${b.area || b.municipality}">
            ${b.area || b.municipality}
          </div>
        </td>
        <td style="text-align: right; font-weight: 700; color: var(--success); font-family: var(--font-mono);">
          ₱${intake.toLocaleString()}
        </td>
        <td style="text-align: center;">
          <span class="badge badge-success" style="font-size: 10.5px; padding: 2px 6px;">● Online</span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderDashboardActivityFeed() {
  const tbody = document.getElementById('dash-activity-feed-tbody');
  if (!tbody) return;

  const activities = [
    {
      time: '14:45 PST',
      event: 'Davilyn Gelito assigned POS Machine (Sunmi V2 #003)',
      person: 'Davilyn Gelito',
      role: 'Teller',
      module: 'Inventory',
      view: 'view-inventory',
      badge: 'badge-purple'
    },
    {
      time: '14:20 PST',
      event: 'Fuel & Motor Lease recorded for Field Route (₱1,200.00)',
      person: 'JOHN',
      role: 'Collector',
      module: 'Expenses',
      view: 'view-finance',
      badge: 'badge-danger'
    },
    {
      time: '13:50 PST',
      event: 'Station DDN-352 Salvacion location re-verified',
      person: 'Jehramea Marte',
      role: 'Teller',
      module: 'Registry',
      view: 'view-employees',
      badge: 'badge-info'
    },
    {
      time: '13:15 PST',
      event: 'Sunmi V2 (#010) reported print error, marked Under Repair',
      person: 'Trexy Echaverie',
      role: 'Hardware Bench',
      module: 'Inventory',
      view: 'view-inventory',
      badge: 'badge-warning'
    },
    {
      time: '12:30 PST',
      event: 'Midday Collection Batch remitted for Sto. Tomas (₱74,776.50)',
      person: 'JOHN & Davilyn',
      role: 'Field Ops',
      module: 'Collection',
      view: 'view-pipelines',
      badge: 'badge-success'
    },
    {
      time: '11:10 PST',
      event: 'EOD Daily Report Initial Balancing check completed',
      person: 'Peter John Carrillo',
      role: 'Supervisor',
      module: 'EOD Report',
      view: 'view-reports',
      badge: 'badge-neutral'
    }
  ];

  tbody.innerHTML = activities.map(a => `
    <tr>
      <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${a.time}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-main);">${a.event}</div>
      </td>
      <td>
        <span style="font-size: 12px; font-weight: 500;">${a.person}</span>
        <span style="font-size: 10px; color: var(--text-dim); display: block;">${a.role}</span>
      </td>
      <td style="text-align: center;">
        <span class="badge ${a.badge} clickable" onclick="window.switchView('${a.view}')" style="cursor: pointer;" title="Jump to ${a.module} module">
          ${a.module} →
        </span>
      </td>
    </tr>
  `).join('');
}

function renderDashboardInventoryAlerts() {
  const container = document.getElementById('dash-inventory-alerts-container');
  if (!container) return;

  const store = window.appStore;
  const inv = store.getInventory(false);

  // Surface items requiring attention: Under Repair, Missing, Damaged, Available buffer
  const alertItems = inv.filter(i => 
    i.status === 'Under Repair' || 
    i.status === 'Missing' || 
    i.condition === 'Damaged' || 
    i.condition === 'For Repair' || 
    i.condition === 'Lost' ||
    i.status === 'Available'
  );

  if (alertItems.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted);">
        <div style="font-size: 24px; margin-bottom: 6px;">✅</div>
        <div>All registered properties are assigned and operational</div>
      </div>
    `;
    return;
  }

  container.innerHTML = alertItems.map(item => {
    let severityBorder = 'var(--warning)';
    let badgeClass = 'badge-warning';
    let alertLabel = 'Action Required';

    if (item.status === 'Under Repair' || item.condition === 'Damaged') {
      severityBorder = 'var(--warning)';
      badgeClass = 'badge-warning';
      alertLabel = 'Under Repair / Bench';
    } else if (item.status === 'Missing' || item.condition === 'Lost') {
      severityBorder = 'var(--danger)';
      badgeClass = 'badge-danger';
      alertLabel = 'Missing / Lost Flag';
    } else if (item.status === 'Available') {
      severityBorder = 'var(--info)';
      badgeClass = 'badge-info';
      alertLabel = 'Depot Buffer Ready';
    }

    return `
      <div style="background: var(--bg-surface-elevated); padding: 12px 14px; border-radius: var(--radius-sm); border-left: 3px solid ${severityBorder}; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 6px;">${alertLabel}</span>
            <strong style="font-size: 12.5px; color: var(--text-main);">No. ${item.no} • ${item.brandModel}</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Type: <strong>${item.type}</strong> • Serial: <code>${item.serial}</code>
          </div>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
            Assigned: ${item.assignedTo} [${item.boothCode}] • Condition: <strong>${item.condition}</strong>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.jumpToInventoryProperty('${item.no}')" style="white-space: nowrap; font-size: 11.5px;">
          View in Inventory →
        </button>
      </div>
    `;
  }).join('');
}

window.jumpToInventoryProperty = function(propertyNo) {
  window.switchView('view-inventory');
  setTimeout(() => {
    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) {
      searchInput.value = propertyNo;
      window.filterInventoryTable();
    }
  }, 100);
};

function renderCharts() {
  const ctxRevenue = document.getElementById('chart-revenue-expenses');
  const ctxBooth = document.getElementById('chart-booth-share');
  if (!ctxRevenue || !ctxBooth) return;

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'corporate';
  const isLight = currentTheme === 'light' || currentTheme === 'vintage' || currentTheme === 'material';
  const textColor = isLight ? '#334155' : '#94a3b8';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

  // 1. Hourly Revenue vs Expense Chart
  if (revenueChart) revenueChart.destroy();

  const labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '21:30'];
  const collectionsData = [35000, 68000, 94000, 112000, 89000, 125000, 140000, 78000];
  const expensesData = [1200, 2400, 850, 7500, 1500, 800, 1200, 450];

  revenueChart = new Chart(ctxRevenue, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Collection Inflow (₱)',
          data: collectionsData,
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Operating Expenses (₱)',
          data: expensesData,
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor, font: { family: 'Inter', size: 12 } }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor },
          grid: { color: gridColor }
        },
        y: {
          ticks: {
            color: textColor,
            callback: (val) => '₱' + (val / 1000) + 'k'
          },
          grid: { color: gridColor }
        }
      }
    }
  });

  // 2. Booth Distribution Doughnut Chart
  if (boothShareChart) boothShareChart.destroy();

  const boothLabels = ['Sto. Tomas', 'Tagum City', 'Carmen', 'Panabo City', 'Kapalong'];
  const boothData = [145000, 95000, 85000, 62000, 25000];

  boothShareChart = new Chart(ctxBooth, {
    type: 'doughnut',
    data: {
      labels: boothLabels,
      datasets: [{
        data: boothData,
        backgroundColor: [
          '#3b82f6',
          '#10b981',
          '#f59e0b',
          '#8b5cf6',
          '#06b6d4'
        ],
        borderWidth: 2,
        borderColor: isLight ? '#ffffff' : '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, font: { family: 'Inter', size: 11 } }
        }
      },
      cutout: '65%'
    }
  });
}

window.refreshDashboard = function() {
  sfx.playChime();
  renderDashboard();
};

// =========================================================================
// =========================================================================
// VIEW 2: MASTER DATA REGISTRY (DAVAO DEL NORTE - DDN005)
// =========================================================================
let currentRegistryCategory = 'all';
let registryCurrentPage = 1;
let registryRowsPerPage = 15;

function parseAddressHelper(rawAddress) {
  if (!rawAddress || rawAddress.trim() === '' || rawAddress.trim() === '-') {
    return { purok: '-', municipality: '-' };
  }
  const addr = rawAddress.trim();
  const knownMunicipalities = [
    'Sto. Tomas', 'Sto Tomas', 'St. Tomas',
    'Tagum City', 'Tagum',
    'Panabo City', 'Panabo',
    'Carmen', 'Kapalong',
    'Sto. Nino Talaingod', 'Sto. Niño Talaingod', 'Talaingod',
    'Davao Del Norte', 'Asuncion'
  ];

  for (const m of knownMunicipalities) {
    const re = new RegExp('(?:,\\s*|\\s+)' + m.replace('.', '\\.') + '\\s*$', 'i');
    if (re.test(addr)) {
      const match = addr.match(re);
      const purokPart = addr.substring(0, match.index).trim().replace(/,\s*$/, '');
      return {
        purok: purokPart || '-',
        municipality: m
      };
    }
  }

  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    const muni = parts.pop();
    return {
      purok: parts.join(', ') || '-',
      municipality: muni
    };
  } else if (parts.length === 1) {
    return {
      purok: '-',
      municipality: parts[0]
    };
  }
  return { purok: '-', municipality: '-' };
}

window.filterRegistryCategory = function(cat) {
  sfx.playClick();
  currentRegistryCategory = cat;
  registryCurrentPage = 1;

  ['all', 'supervisors', 'collectors', 'tellers', 'relievers', 'inactive-booths'].forEach(c => {
    const btn = document.getElementById(`tab-btn-${c}`);
    if (btn) {
      if (c === cat) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });

  renderEmployeesTable();
};

window.changeRowsPerPage = function(val) {
  sfx.playClick();
  registryRowsPerPage = parseInt(val, 10) || 15;
  registryCurrentPage = 1;
  renderEmployeesTable();
};

window.goToRegistryPage = function(page) {
  sfx.playClick();
  registryCurrentPage = page;
  renderEmployeesTable();
};

window.updateEmployeeStatus = function(id, newStatus) {
  if (window.sfx) sfx.playClick();
  const normStatus = (newStatus || 'ACTIVE').toUpperCase();
  window.appStore.updateEmployee(id, { status: normStatus });
  renderEmployeesTable();
  if (typeof renderFleetTrackingList === 'function') renderFleetTrackingList();
  if (window.etsMap && typeof window.etsMap.renderAllMarkers === 'function') window.etsMap.renderAllMarkers();
};

window.updateEmployeePrinter = function(id, newPrinter) {
  if (window.sfx) sfx.playClick();
  const val = newPrinter === 'WITH PORTABLE PRINTER' ? 'WITH PORTABLE PRINTER' : 'N/A';
  window.appStore.updateEmployee(id, { printerName: val, printerSerial: val });
  renderEmployeesTable();
  if (typeof renderFleetTrackingList === 'function') renderFleetTrackingList();
};

window.handleRoleChangeInModal = function(role) {
  const rUpper = (role || '').toUpperCase();
  const deptSelect = document.getElementById('emp-form-dept');
  if (!deptSelect) return;
  if (rUpper.includes('COLLECTOR')) {
    deptSelect.value = 'dept-col';
  } else if (rUpper.includes('SUPERVISOR') || rUpper.includes('TEAM LEADER')) {
    deptSelect.value = 'dept-sup';
  } else if (rUpper.includes('TELLER') || rUpper.includes('SALES REPRESENTATIVE')) {
    deptSelect.value = 'dept-tel';
  }
};

let pendingDeleteEmployeeId = null;

window.requestDeleteEmployee = function(id) {
  sfx.playAlert();
  pendingDeleteEmployeeId = id;
  const store = window.appStore;
  const emp = store.getEmployees().find(e => e.id === id) || 
              (store.data.relievers && store.data.relievers.find(r => r.id === id));
  const empName = emp ? `${emp.name} (${emp.id})` : id;

  const msgEl = document.getElementById('delete-confirm-message');
  if (msgEl) {
    const roleBadge = emp && emp.role ? `<span class="badge badge-info" style="font-size: 10px; text-transform: uppercase; margin-left: 6px;">${emp.role}</span>` : '';
    msgEl.innerHTML = `
      You are about to permanently delete <strong>${empName}</strong> ${roleBadge} from the system registry.<br>
      <span style="font-size: 12.5px; color: var(--text-muted); margin-top: 8px; display: block; line-height: 1.5;">
        ⚠️ This action cannot be undone. All assigned booth data, GPS tracking markers, and terminal linkages will be erased.
      </span>
    `;
  }
  document.getElementById('modal-delete-confirm').classList.add('active');
};

window.confirmDeleteEmployee = function() {
  if (!pendingDeleteEmployeeId) return;
  sfx.playChime();
  window.appStore.deleteEmployee(pendingDeleteEmployeeId);
  pendingDeleteEmployeeId = null;
  document.getElementById('modal-delete-confirm').classList.remove('active');
  renderEmployeesTable();
  renderFleetTrackingList();
  if (window.etsMap && window.etsMap.renderAllMarkers) {
    window.etsMap.renderAllMarkers();
  }
};

window.cancelDeleteEmployee = function() {
  sfx.playClick();
  pendingDeleteEmployeeId = null;
  document.getElementById('modal-delete-confirm').classList.remove('active');
};

function renderEmployeesTable(customList = null) {
  const tbody = document.getElementById('employee-table-tbody');
  if (!tbody) return;

  const store = window.appStore;
  if (store.sanitizeEmployeeIds) {
    store.sanitizeEmployeeIds();
  }
  const rawEmployees = store.getEmployees() || [];
  // Permanently filter out any fake buffer relievers
  const allStaff = rawEmployees.filter(e => !e.name || !e.name.includes('Buffer Reliever'));

  // Strictly categorize by role:
  const supervisors = allStaff.filter(e => (e.role || '').toUpperCase().includes('SUPERVISOR') || (e.role || '').toUpperCase().includes('TEAM LEADER'));
  const collectors = allStaff.filter(e => (e.role || '').toUpperCase().includes('COLLECTOR'));
  const relieversList = allStaff.filter(e => (e.role || '').toUpperCase().includes('RELIEVER') || (e.role || '').toUpperCase().includes('RELIVER'));

  // Section 4: 3. Sales Representatives Registry must count ACTIVE Sales Representatives only.
  // Inactive Sales Representatives must NOT be included in this count.
  const tellers = allStaff.filter(e => {
    const r = (e.role || '').toUpperCase();
    const isOtherRole = r.includes('RELIEVER') || r.includes('RELIVER') || r.includes('SUPERVISOR') || r.includes('COLLECTOR') || r.includes('TEAM LEADER');
    if (isOtherRole) return false;
    const statusUpper = (e.status || 'ACTIVE').toUpperCase();
    const isNameMissing = !e.name || e.name.trim() === '' || e.name.trim().toUpperCase() === 'N/A' || e.name.trim() === '-';
    return statusUpper === 'ACTIVE' && !isNameMissing;
  });

  // Section 3: 5. Inactive Booths must include both:
  // 1. Sales Representative records with STATUS = INACTIVE
  // 2. Booth records where the Sales Representative name is missing/blank
  // If an inactive Sales Representative has a Booth Code, count that booth only once. Do not duplicate.
  const seenBoothCodes = new Set();
  const seenRecordIds = new Set();
  const inactiveBooths = [];

  // A. Candidate employee records
  allStaff.forEach(emp => {
    const r = (emp.role || '').toUpperCase();
    const isOtherRole = r.includes('SUPERVISOR') || r.includes('TEAM LEADER') || r.includes('COLLECTOR') || r.includes('RELIEVER') || r.includes('RELIVER');
    if (isOtherRole) return;

    const statusUpper = (emp.status || '').toUpperCase();
    const isInactive = statusUpper === 'INACTIVE' || statusUpper === 'TERMINATED';
    const isNameMissing = !emp.name || emp.name.trim() === '' || emp.name.trim().toUpperCase() === 'N/A' || emp.name.trim() === '-';

    if (isInactive || isNameMissing) {
      const bCode = (emp.boothCode && emp.boothCode !== '-') ? emp.boothCode.trim().toUpperCase() : (emp.booth && emp.booth !== '-' ? emp.booth.trim().toUpperCase() : null);
      if (bCode) {
        if (!seenBoothCodes.has(bCode)) {
          seenBoothCodes.add(bCode);
          seenRecordIds.add(emp.id);
          inactiveBooths.push(emp);
        }
      } else {
        if (!seenRecordIds.has(emp.id)) {
          seenRecordIds.add(emp.id);
          inactiveBooths.push(emp);
        }
      }
    }
  });

  // B. Candidate standalone booth records with missing sales rep or inactive status
  const allBooths = (store.data && store.data.booths) ? store.data.booths : [];
  allBooths.forEach(b => {
    const bCode = (b.id || b.code || '').trim().toUpperCase();
    if (!bCode || bCode === '-') return;
    if (seenBoothCodes.has(bCode)) return;

    const tellerName = b.assignedTellerName || b.activeTeller || '';
    const isNameMissing = !tellerName || tellerName.trim() === '' || tellerName.trim().toUpperCase() === 'N/A' || tellerName.trim() === '-';
    const isInactive = (b.status || '').toUpperCase() === 'INACTIVE';

    let isAssignedTellerInactive = false;
    if (b.assignedTellerId) {
      const assignedEmp = allStaff.find(e => e.id === b.assignedTellerId);
      if (assignedEmp && (assignedEmp.status || '').toUpperCase() === 'INACTIVE') {
        isAssignedTellerInactive = true;
      }
    }

    if (isNameMissing || isInactive || isAssignedTellerInactive) {
      seenBoothCodes.add(bCode);
      inactiveBooths.push({
        id: b.assignedTellerId || `BOOTH-${bCode}`,
        name: isNameMissing ? 'N/A' : tellerName,
        role: isNameMissing ? 'N/A' : 'SALES REPRESENTATIVE',
        department: 'dept-tel',
        purok: b.purok || '-',
        municipality: b.municipality || 'Sto. Tomas',
        address: b.area || `${b.purok || '-'}, ${b.municipality || 'Sto. Tomas'}`,
        area: b.area || b.municipality,
        boothCode: bCode,
        booth: bCode,
        lat: b.lat,
        lng: b.lng,
        coordinates: (b.lat && b.lng) ? { lat: b.lat, lng: b.lng } : null,
        phone: b.phone || 'N/A',
        status: 'INACTIVE',
        posSerial: b.posSerial || `POS-${bCode}`,
        printerName: b.printerSerial ? 'WITH PORTABLE PRINTER' : 'N/A',
        printerSerial: b.printerSerial || 'N/A'
      });
    }
  });

  // Update dynamic counter badges
  if (document.getElementById('count-all')) document.getElementById('count-all').textContent = allStaff.length;
  if (document.getElementById('count-supervisors')) document.getElementById('count-supervisors').textContent = supervisors.length;
  if (document.getElementById('count-collectors')) document.getElementById('count-collectors').textContent = collectors.length;
  if (document.getElementById('count-tellers')) document.getElementById('count-tellers').textContent = tellers.length;
  if (document.getElementById('count-relievers')) document.getElementById('count-relievers').textContent = relieversList.length;
  if (document.getElementById('count-inactive-booths')) document.getElementById('count-inactive-booths').textContent = inactiveBooths.length;

  let list = customList;
  if (!list) {
    if (currentRegistryCategory === 'supervisors') {
      list = supervisors;
    } else if (currentRegistryCategory === 'collectors') {
      list = collectors;
    } else if (currentRegistryCategory === 'tellers') {
      list = tellers;
    } else if (currentRegistryCategory === 'relievers') {
      list = relieversList;
    } else if (currentRegistryCategory === 'inactive-booths') {
      list = inactiveBooths;
    } else {
      list = allStaff;
    }
  }

  // Pagination calculation
  const totalCount = list.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / registryRowsPerPage));
  if (registryCurrentPage > totalPages) registryCurrentPage = totalPages;
  if (registryCurrentPage < 1) registryCurrentPage = 1;

  const startIndex = (registryCurrentPage - 1) * registryRowsPerPage;
  const pageItems = list.slice(startIndex, startIndex + registryRowsPerPage);

  // Render Table Body for All 11 Exact Columns:
  // | ID No. | Full Name | Role | Purok / Street / Barangay | Municipality | Booth Code | GPS Coordinates | Contact Phone | Status | POS Serial No. | PORTABLE PRINTER NAME | Actions |
  tbody.innerHTML = pageItems.map(emp => {
    let roleUpper = (emp.role || 'SALES REPRESENTATIVE').toUpperCase();
    if (roleUpper === 'TELLER' || roleUpper === 'STATION TELLER') roleUpper = 'SALES REPRESENTATIVE';
    else if (roleUpper === 'RELIVER') roleUpper = 'RELIEVER';

    let roleBadge = 'badge-info';
    if (roleUpper.includes('SUPERVISOR')) roleBadge = 'badge-purple';
    else if (roleUpper.includes('TEAM LEADER')) roleBadge = 'badge-teal';
    else if (roleUpper.includes('COLLECTOR')) roleBadge = 'badge-warning';
    else if (roleUpper.includes('RELIEVER')) roleBadge = 'badge-neutral';

    // 1. Purok / Street / Barangay & 2. Municipality
    let purok = emp.purok;
    let muni = emp.municipality;
    if (!purok || purok === '-' || !muni || muni === '-') {
      const parsed = parseAddressHelper(emp.address || emp.area || '');
      if (!purok || purok === '-') purok = parsed.purok;
      if (!muni || muni === '-') muni = parsed.municipality;
    }

    // 3. Booth Code (Checks boothCode or booth)
    const displayBooth = (emp.boothCode && emp.boothCode !== '-') ? emp.boothCode : (emp.booth && emp.booth !== '-' ? emp.booth : '-');

    // 4. GPS Coordinates (Checks lat/lng or coordinates object)
    let latVal = (emp.lat !== undefined && emp.lat !== null && emp.lat !== '' && !isNaN(emp.lat)) ? Number(emp.lat) : (emp.coordinates && emp.coordinates.lat !== undefined && emp.coordinates.lat !== null && emp.coordinates.lat !== '' && !isNaN(emp.coordinates.lat) ? Number(emp.coordinates.lat) : null);
    let lngVal = (emp.lng !== undefined && emp.lng !== null && emp.lng !== '' && !isNaN(emp.lng)) ? Number(emp.lng) : (emp.coordinates && emp.coordinates.lng !== undefined && emp.coordinates.lng !== null && emp.coordinates.lng !== '' && !isNaN(emp.coordinates.lng) ? Number(emp.coordinates.lng) : null);
    const gpsDisplay = (latVal !== null && lngVal !== null) ? `${latVal.toFixed(6)}, ${lngVal.toFixed(6)}` : '-';

    // 5. Contact Phone
    const phoneDisplay = emp.phone || emp.contact || '-';

    // 6. POS Serial No.
    const posDisplay = emp.posSerial || emp.pos || (displayBooth !== '-' ? `POS-${displayBooth}` : '-');

    // 7. PORTABLE PRINTER NAME (Dropdown: WITH PORTABLE PRINTER or N/A)
    const rawPr = (emp.printerName || emp.printerSerial || '').toUpperCase().trim();
    const isWithPrinter = rawPr.includes('WITH') || rawPr.includes('PRT-') || rawPr.includes('PRINTER') || rawPr.includes('PORTABLE');
    const printerVal = isWithPrinter ? 'WITH PORTABLE PRINTER' : 'N/A';

    // 8. Status styling
    const statusUpper = (emp.status || 'ACTIVE').toUpperCase();
    let statusStyle = 'border: 1px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.15); color: #10b981;';
    if (statusUpper === 'INACTIVE') {
      statusStyle = 'border: 1px solid rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.15); color: #f59e0b;';
    } else if (statusUpper === 'TERMINATED') {
      statusStyle = 'border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.15); color: #ef4444;';
    }

    return `
      <tr>
        <td><code style="font-weight: 700; color: var(--primary); font-size: 12px;">${emp.id}</code></td>
        <td>
          <span style="font-weight: 600; color: var(--text-main);">${emp.name}</span>
        </td>
        <td>
          <span class="badge ${roleBadge}" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${roleUpper}</span>
        </td>
        <td><strong style="font-size: 12px; color: var(--text-main); font-weight: 700;">${purok || '-'}</strong></td>
        <td><strong style="font-size: 12.5px; color: var(--text-main); font-weight: 700;">${muni || '-'}</strong></td>
        <td><code style="font-weight: 700; font-size: 12px; color: ${displayBooth !== '-' ? 'var(--primary)' : 'var(--text-dim)'};">${displayBooth}</code></td>
        <td style="font-family: monospace; font-size: 11px;">
          <strong style="font-weight: 700; color: var(--text-main);">${gpsDisplay}</strong>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 11.5px; color: var(--text-main);">${phoneDisplay}</span>
        </td>
        <td style="text-align: center;">
          <select class="form-select" style="padding: 3px 8px; font-size: 11px; font-weight: 700; width: auto; border-radius: 4px; display: inline-block; margin: 0 auto; ${statusStyle}" onchange="window.updateEmployeeStatus('${emp.id}', this.value)">
            <option value="ACTIVE" ${statusUpper === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="INACTIVE" ${statusUpper === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
            <option value="TERMINATED" ${statusUpper === 'TERMINATED' ? 'selected' : ''}>TERMINATED</option>
          </select>
        </td>
        <td>
          <code style="font-weight: 700; font-size: 11.5px; color: var(--text-main);">${posDisplay}</code>
        </td>
        <td style="text-align: center;">
          <select class="form-select" style="padding: 3px 8px; font-size: 11px; font-weight: 700; width: auto; border-radius: 4px; display: inline-block; margin: 0 auto; ${isWithPrinter ? 'border-color: rgba(16, 185, 129, 0.4); color: #10b981; background: rgba(16, 185, 129, 0.1);' : 'color: var(--text-muted);'}" onchange="window.updateEmployeePrinter('${emp.id}', this.value)">
            <option value="WITH PORTABLE PRINTER" ${isWithPrinter ? 'selected' : ''}>WITH PORTABLE PRINTER</option>
            <option value="N/A" ${!isWithPrinter ? 'selected' : ''}>N/A</option>
          </select>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
            <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px;" onclick="window.editEmployee('${emp.id}')" title="Edit Staff Member">
              ✏️ Edit
            </button>
            <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px; color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" onclick="window.requestDeleteEmployee('${emp.id}')" title="Delete Record">
              🗑️ Delete
            </button>
            <button class="btn btn-primary btn-sm" style="padding: 3px 8px; font-size: 11px;" onclick="window.showQrPass('${emp.id}')" title="View Digital Pass">
              🪪 Pass
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Render Pagination Controls
  renderRegistryPagination(totalCount, totalPages);
}

function renderRegistryPagination(totalCount, totalPages) {
  const pageInfo = document.getElementById('registry-page-info');
  const controls = document.getElementById('registry-pagination-controls');
  if (!pageInfo || !controls) return;

  pageInfo.textContent = `Page ${registryCurrentPage} of ${totalPages}`;

  let html = '';

  // Previous button
  const prevDisabled = registryCurrentPage <= 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';
  html += `<button class="btn btn-secondary btn-sm" ${prevDisabled} onclick="window.goToRegistryPage(${registryCurrentPage - 1})">Previous</button>`;

  // Numbered page buttons (1, 2, 3, 4, 5, etc.)
  for (let p = 1; p <= totalPages; p++) {
    const isActive = p === registryCurrentPage;
    const btnClass = isActive ? 'btn-primary' : 'btn-secondary';
    html += `<button class="btn ${btnClass} btn-sm" style="min-width: 32px; padding: 4px 8px; font-weight: 700;" onclick="window.goToRegistryPage(${p})">${p}</button>`;
  }

  // Next button
  const nextDisabled = registryCurrentPage >= totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';
  html += `<button class="btn btn-secondary btn-sm" ${nextDisabled} onclick="window.goToRegistryPage(${registryCurrentPage + 1})">Next</button>`;

  controls.innerHTML = html;
}

window.filterEmployees = function() {
  const query = document.getElementById('employee-search-input').value.toLowerCase();
  const store = window.appStore;
  registryCurrentPage = 1;
  const employees = store.getEmployees();
  const relievers = store.data.relievers || [];
  const allStaff = [...employees, ...relievers.filter(r => !employees.some(e => e.id === r.id))];
  const filtered = allStaff.filter(e => {
    return (e.name && e.name.toLowerCase().includes(query)) ||
           (e.id && e.id.toLowerCase().includes(query)) ||
           (e.boothCode && e.boothCode.toLowerCase().includes(query)) ||
           (e.address && e.address.toLowerCase().includes(query)) ||
           (e.purok && e.purok.toLowerCase().includes(query)) ||
           (e.municipality && e.municipality.toLowerCase().includes(query)) ||
           (e.phone && e.phone.toLowerCase().includes(query)) ||
           (e.role && e.role.toLowerCase().includes(query)) ||
           (e.posSerial && e.posSerial.toLowerCase().includes(query)) ||
           (e.printerSerial && e.printerSerial.toLowerCase().includes(query)) ||
           (e.area && e.area.toLowerCase().includes(query));
  });
  renderEmployeesTable(filtered);
};

window.showQrPass = function(id) {
  sfx.playClick();
  const store = window.appStore;
  const emp = store.getEmployees().find(e => e.id === id) || 
              (store.data.relievers && store.data.relievers.find(r => r.id === id));
  if (!emp) {
    alert('Employee record not found: ' + id);
    return;
  }

  const roleUpper = (emp.role || 'STAFF').toUpperCase();
  const boothDisplay = (emp.boothCode && emp.boothCode !== '-') ? emp.boothCode : (emp.booth || '-');
  const muniDisplay = emp.municipality || emp.area || 'Davao Del Norte';
  const qrData = encodeURIComponent(`APEX-DDN005|${emp.id}|${emp.name}|${roleUpper}|${boothDisplay}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrData}`;

  const content = document.getElementById('qr-modal-content');
  content.innerHTML = `
    <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #fff; padding: 18px; border-radius: 8px; margin-bottom: 16px; text-align: left; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.35);">
      <div style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85;">Apex Mindanao Operations • Davao Del Norte</div>
      <div style="font-size: 18px; font-weight: 800; margin-top: 4px; letter-spacing: -0.5px;">${emp.name}</div>
      <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
        <span style="font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.22); padding: 2px 8px; border-radius: 4px;">${roleUpper}</span>
        <span style="font-size: 12px; font-family: monospace; opacity: 0.9;">${emp.id}</span>
      </div>
      <div style="font-size: 11.5px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px; opacity: 0.95; display: flex; flex-direction: column; gap: 3px;">
        <div><strong>Assigned Booth:</strong> <code>${boothDisplay}</code></div>
        <div><strong>Municipality:</strong> ${muniDisplay}</div>
        <div><strong>Contact Phone:</strong> ${emp.phone || '-'}</div>
        <div><strong>POS Serial No.:</strong> ${emp.posSerial || '-'}</div>
        <div><strong>PORTABLE PRINTER NAME:</strong> ${emp.printerSerial || emp.printerName || 'N/A'}</div>
        <div><strong>GPS Location:</strong> ${emp.lat ? `${emp.lat.toFixed(4)}, ${emp.lng.toFixed(4)}` : 'Outlet Anchored'}</div>
      </div>
    </div>
    <div style="display: inline-block; padding: 12px; background: #ffffff; border: 2px solid var(--border-color); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <img src="${qrUrl}" alt="QR ID Pass" style="width: 160px; height: 160px; display: block;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'160\\' viewBox=\\'0 0 100 100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23fff\\'/><rect x=\\'10\\' y=\\'10\\' width=\\'30\\' height=\\'30\\' fill=\\'%23000\\'/><rect x=\\'15\\' y=\\'15\\' width=\\'20\\' height=\\'20\\' fill=\\'%23fff\\'/><rect x=\\'60\\' y=\\'10\\' width=\\'30\\' height=\\'30\\' fill=\\'%23000\\'/><rect x=\\'65\\' y=\\'15\\' width=\\'20\\' height=\\'20\\' fill=\\'%23fff\\'/><rect x=\\'10\\' y=\\'60\\' width=\\'30\\' height=\\'30\\' fill=\\'%23000\\'/><rect x=\\'15\\' y=\\'65\\' width=\\'20\\' height=\\'20\\' fill=\\'%23fff\\'/><rect x=\\'45\\' y=\\'45\\' width=\\'15\\' height=\\'15\\' fill=\\'%23000\\'/><text x=\\'50\\' y=\\'92\\' font-size=\\'7\\' text-anchor=\\'middle\\'>OFFICIAL PASS</text></svg>'">
    </div>
    <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 12px;">
      Official Employee Identification Card • Verified by Davao Del Norte Sector Command.
    </div>
  `;
  document.getElementById('modal-qr').classList.add('active');
};

window.updateEmployeePrinter = function(empId, printerStatus) {
  const store = window.appStore;
  const emp = store.data.employees.find(e => e.id === empId) ||
              (store.data.relievers && store.data.relievers.find(r => r.id === empId));
  if (!emp) return;

  const finalVal = printerStatus === 'WITH PORTABLE PRINTER' ? 'WITH PORTABLE PRINTER' : 'N/A';
  emp.printerName = finalVal;
  emp.printerSerial = finalVal;

  if (store.data.relievers) {
    const rel = store.data.relievers.find(r => r.id === empId);
    if (rel) {
      rel.printerName = finalVal;
      rel.printerSerial = finalVal;
    }
  }

  store.save();
  if (window.sfx) window.sfx.playChime();
  renderEmployeesTable();
};

window.openAddEmployeeModal = function() {
  if (window.sfx) sfx.playClick();
  document.getElementById('modal-employee-title').textContent = 'Register New Staff Member';
  document.getElementById('emp-form-id').value = '';
  const idDisplay = document.getElementById('emp-form-id-display');
  if (idDisplay) idDisplay.value = '';
  document.getElementById('emp-form-name').value = '';
  document.getElementById('emp-form-role').value = 'SALES REPRESENTATIVE';
  document.getElementById('emp-form-dept').value = 'dept-tel';
  document.getElementById('emp-form-purok').value = '';
  document.getElementById('emp-form-muni').value = 'Sto. Tomas';
  document.getElementById('emp-form-booth').value = '';
  document.getElementById('emp-form-phone').value = '';
  const statusEl = document.getElementById('emp-form-status');
  if (statusEl) statusEl.value = 'ACTIVE';
  document.getElementById('emp-form-pos').value = '';
  document.getElementById('emp-form-printer').value = 'WITH PORTABLE PRINTER';
  document.getElementById('emp-form-lat').value = '';
  document.getElementById('emp-form-lng').value = '';
  document.getElementById('modal-employee').classList.add('active');
};

window.editEmployee = function(id) {
  if (window.sfx) sfx.playClick();
  const store = window.appStore;
  let emp = store.getEmployees().find(e => e.id === id) || 
            (store.data.relievers && store.data.relievers.find(r => r.id === id));

  // If not found in employees or relievers, check booths (e.g. Inactive Booths or booth-keyed items)
  if (!emp && store.data.booths) {
    const cleanBoothCode = id.replace(/^BOOTH-/, '');
    const b = store.data.booths.find(b => b.id === id || b.id === cleanBoothCode || b.assignedTellerId === id);
    if (b) {
      emp = {
        id: b.assignedTellerId || `BOOTH-${b.id}`,
        name: b.assignedTellerName || b.activeTeller || '',
        role: 'SALES REPRESENTATIVE',
        department: 'dept-tel',
        purok: b.purok || '',
        municipality: b.municipality || 'Sto. Tomas',
        address: b.area || `${b.purok || ''}, ${b.municipality || 'Sto. Tomas'}`,
        boothCode: b.id,
        phone: b.phone || '',
        status: b.status || 'INACTIVE',
        posSerial: b.posSerial || `POS-${b.id}`,
        printerSerial: b.printerSerial || 'N/A',
        lat: b.lat,
        lng: b.lng
      };
    }
  }

  if (!emp) {
    alert(`Staff record with ID "${id}" could not be found.`);
    return;
  }

  const parsed = parseAddressHelper(emp.address || emp.area || '');

  document.getElementById('modal-employee-title').textContent = `Edit Staff: ${emp.id}`;
  document.getElementById('emp-form-id').value = emp.id;
  const idDisplay = document.getElementById('emp-form-id-display');
  if (idDisplay) idDisplay.value = emp.id;
  document.getElementById('emp-form-name').value = (emp.name && emp.name !== 'N/A' && emp.name !== '-') ? emp.name : (emp.name === 'N/A' ? 'N/A' : '');
  
  // Standardize Role dropdown selection
  const rUpper = (emp.role || 'SALES REPRESENTATIVE').toUpperCase();
  let normalizedRole = 'SALES REPRESENTATIVE';
  if (rUpper === 'N/A' || rUpper === 'BLANK' || rUpper === '-') normalizedRole = 'N/A';
  else if (rUpper.includes('SUPERVISOR')) normalizedRole = 'SUPERVISOR';
  else if (rUpper.includes('COLLECTOR')) normalizedRole = 'COLLECTOR';
  else if (rUpper.includes('RELIEVER') || rUpper.includes('RELIVER')) normalizedRole = 'RELIEVER';
  else if (rUpper.includes('TEAM LEADER')) normalizedRole = 'TEAM LEADER';
  else normalizedRole = 'SALES REPRESENTATIVE';
  document.getElementById('emp-form-role').value = normalizedRole;

  // Department normalization
  const dVal = (emp.department || '').toLowerCase();
  const deptEl = document.getElementById('emp-form-dept');
  if (deptEl) {
    if (dVal === 'dept-col' || dVal.includes('collector')) deptEl.value = 'dept-col';
    else if (dVal === 'dept-sup' || dVal.includes('supervisor')) deptEl.value = 'dept-sup';
    else if (dVal === 'dept-exec' || dVal.includes('executive')) deptEl.value = 'dept-exec';
    else if (dVal === 'dept-aud' || dVal.includes('audit')) deptEl.value = 'dept-aud';
    else if (dVal === 'dept-log' || dVal.includes('logistic')) deptEl.value = 'dept-log';
    else deptEl.value = 'dept-tel';
  }

  // Purok / Street / Barangay
  let rawPurok = emp.purok && emp.purok !== '-' ? emp.purok : parsed.purok;
  if (rawPurok === '-') rawPurok = '';
  document.getElementById('emp-form-purok').value = rawPurok || '';

  // Municipality
  let rawMuni = emp.municipality && emp.municipality !== '-' ? emp.municipality : parsed.municipality;
  if (rawMuni === '-') rawMuni = '';
  document.getElementById('emp-form-muni').value = rawMuni || '';

  // Assigned Booth Code
  const boothVal = (emp.boothCode && emp.boothCode !== '-') ? emp.boothCode : (emp.booth && emp.booth !== '-' ? emp.booth : '');
  document.getElementById('emp-form-booth').value = boothVal || '';

  // Contact Phone
  const phoneVal = (emp.phone && emp.phone !== '0917-000-0000' && emp.phone !== '-' && emp.phone !== 'N/A') ? emp.phone : (emp.contact && emp.contact !== '-' && emp.contact !== 'N/A' ? emp.contact : '');
  document.getElementById('emp-form-phone').value = phoneVal || '';

  // POS Machine S/N
  document.getElementById('emp-form-pos').value = (emp.posSerial && emp.posSerial !== '-') ? emp.posSerial : (emp.pos && emp.pos !== '-' ? emp.pos : '');
  
  // Status dropdown selection (ACTIVE / INACTIVE / TERMINATED)
  const statusUpper = (emp.status || 'ACTIVE').toUpperCase();
  const statusEl = document.getElementById('emp-form-status');
  if (statusEl) {
    if (statusUpper === 'TERMINATED') {
      statusEl.value = 'TERMINATED';
    } else if (statusUpper === 'INACTIVE') {
      statusEl.value = 'INACTIVE';
    } else {
      statusEl.value = 'ACTIVE';
    }
  }

  // Standardize Portable Printer dropdown selection
  const rawPr = (emp.printerName || emp.printerSerial || '').toUpperCase().trim();
  const isWithPr = rawPr.includes('WITH') || rawPr.includes('PRT-') || rawPr.includes('PRINTER') || rawPr.includes('PORTABLE');
  document.getElementById('emp-form-printer').value = isWithPr ? 'WITH PORTABLE PRINTER' : 'N/A';

  // Extract coordinate values from direct lat/lng or coordinates object
  let latVal = null;
  if (emp.lat !== undefined && emp.lat !== null && emp.lat !== '' && !isNaN(emp.lat)) {
    latVal = Number(emp.lat);
  } else if (emp.coordinates && emp.coordinates.lat !== undefined && emp.coordinates.lat !== null && emp.coordinates.lat !== '' && !isNaN(emp.coordinates.lat)) {
    latVal = Number(emp.coordinates.lat);
  }

  let lngVal = null;
  if (emp.lng !== undefined && emp.lng !== null && emp.lng !== '' && !isNaN(emp.lng)) {
    lngVal = Number(emp.lng);
  } else if (emp.coordinates && emp.coordinates.lng !== undefined && emp.coordinates.lng !== null && emp.coordinates.lng !== '' && !isNaN(emp.coordinates.lng)) {
    lngVal = Number(emp.coordinates.lng);
  }

  document.getElementById('emp-form-lat').value = latVal !== null ? latVal : '';
  document.getElementById('emp-form-lng').value = lngVal !== null ? lngVal : '';
  document.getElementById('modal-employee').classList.add('active');
};

window.saveEmployeeForm = function() {
  const origId = document.getElementById('emp-form-id').value;
  const idDisplay = document.getElementById('emp-form-id-display');
  const customId = idDisplay ? idDisplay.value.trim() : '';
  const finalId = customId || origId || undefined;

  let name = document.getElementById('emp-form-name').value.trim();
  const role = document.getElementById('emp-form-role').value;
  const statusEl = document.getElementById('emp-form-status');
  const selectedStatus = statusEl ? statusEl.value.toUpperCase() : 'ACTIVE';

  // Allow blank/N/A name if status is INACTIVE or role is N/A
  if (!name) {
    if (selectedStatus === 'INACTIVE' || role === 'N/A') {
      name = 'N/A';
    } else {
      alert('Please enter staff name');
      return;
    }
  }

  const purok = document.getElementById('emp-form-purok').value.trim() || '-';
  const muni = document.getElementById('emp-form-muni').value.trim() || '-';
  const fullAddress = purok !== '-' ? `${purok}, ${muni}` : muni;
  const boothCode = document.getElementById('emp-form-booth').value.trim() || '-';
  
  // Contact phone: preserve number if provided, otherwise N/A (never invent)
  const rawPhone = document.getElementById('emp-form-phone').value.trim();
  const phone = (rawPhone && rawPhone !== '0917-000-0000' && rawPhone !== '-') ? rawPhone : 'N/A';

  // Standardized Portable Printer
  const printerVal = document.getElementById('emp-form-printer').value === 'WITH PORTABLE PRINTER' ? 'WITH PORTABLE PRINTER' : 'N/A';

  // Validate GPS Coordinates
  const rawLat = document.getElementById('emp-form-lat').value.trim();
  const rawLng = document.getElementById('emp-form-lng').value.trim();

  let finalLat = null;
  let finalLng = null;

  if (rawLat !== '') {
    const numLat = Number(rawLat);
    if (isNaN(numLat) || numLat < -90 || numLat > 90) {
      alert('Invalid latitude. Please enter a value between -90 and 90.');
      document.getElementById('emp-form-lat').focus();
      return;
    }
    finalLat = numLat;
  }

  if (rawLng !== '') {
    const numLng = Number(rawLng);
    if (isNaN(numLng) || numLng < -180 || numLng > 180) {
      alert('Invalid longitude. Please enter a value between -180 and 180.');
      document.getElementById('emp-form-lng').focus();
      return;
    }
    finalLng = numLng;
  }

  // If one is given and the other is blank, prompt user
  if ((finalLat !== null && finalLng === null) || (finalLat === null && finalLng !== null)) {
    alert('Please enter both Latitude and Longitude, or leave both blank to clear GPS coordinates.');
    return;
  }

  const payload = {
    id: finalId,
    name: name,
    role: role,
    department: document.getElementById('emp-form-dept').value,
    area: muni,
    address: fullAddress,
    purok: purok,
    municipality: muni,
    boothCode: boothCode,
    booth: boothCode,
    phone: phone,
    contact: phone,
    status: selectedStatus,
    posSerial: document.getElementById('emp-form-pos').value || (boothCode !== '-' ? `POS-${boothCode}` : 'POS-N9-GEN'),
    printerName: printerVal,
    printerSerial: printerVal,
    lat: finalLat,
    lng: finalLng,
    coordinates: (finalLat !== null && finalLng !== null) ? { lat: finalLat, lng: finalLng } : null,
    etsStatus: (selectedStatus === 'ACTIVE' && finalLat !== null && finalLng !== null) ? 'Active' : 'Offline'
  };

  try {
    let savedRecord = null;
    if (origId) {
      if (customId && customId !== origId) {
        payload.id = customId;
      }
      savedRecord = window.appStore.updateEmployee(origId, payload);
      if (!savedRecord) {
        alert(`Failed to update record. Staff member "${origId}" could not be found.`);
        return;
      }
    } else {
      savedRecord = window.appStore.addEmployee(payload);
      if (!savedRecord) {
        alert('Failed to register employee. Please try again.');
        return;
      }
    }

    if (window.sfx) window.sfx.playChime();
    window.closeModals();
    renderEmployeesTable();
    if (typeof renderFleetTrackingList === 'function') renderFleetTrackingList();
    if (window.etsMap && typeof window.etsMap.renderAllMarkers === 'function') window.etsMap.renderAllMarkers();

    alert(origId ? 'Staff member record updated successfully.' : 'Staff member registered successfully.');
  } catch (err) {
    console.error('Error saving employee record:', err);
    alert(`Unable to save record: ${err.message || err}`);
  }
};

// =========================================================================
// VIEW 3: EMPLOYEE TRACKING SYSTEM (ETS) & PIN RECALIBRATION ENGINE
// =========================================================================
let fleetSearchQuery = '';

window.filterFleetActivityList = function(query) {
  fleetSearchQuery = (query || '').toLowerCase().trim();
  renderFleetTrackingList();

  // If user searched for a specific booth code, coordinates, or name, focus map on first match
  if (fleetSearchQuery.length >= 3) {
    const store = window.appStore;
    const employees = store.getEmployees();
    const relievers = store.data.relievers || [];
    const allStaff = [...employees, ...relievers.filter(r => !employees.some(e => e.id === r.id))];
    const match = allStaff.find(e => 
      (e.boothCode && e.boothCode.toLowerCase().includes(fleetSearchQuery)) ||
      (e.name && e.name.toLowerCase().includes(fleetSearchQuery)) ||
      (e.id && e.id.toLowerCase().includes(fleetSearchQuery)) ||
      (`${e.lat}, ${e.lng}`.includes(fleetSearchQuery))
    );
    if (match && window.etsMap && match.lat && match.lng) {
      window.etsMap.focusCoordinates(match.lat, match.lng, 15);
      const marker = window.etsMap.allMarkerInstances[match.id];
      if (marker) marker.openPopup();
    }
  }
};

function renderFleetTrackingList() {
  const container = document.getElementById('ets-fleet-list');
  if (!container) return;

  const store = window.appStore;
  const employees = store.getEmployees();
  const relievers = store.data.relievers || [];
  const allStaff = [...employees, ...relievers.filter(r => !employees.some(e => e.id === r.id))];

  // Master Registry is the SOURCE OF TRUTH:
  // Strictly filter only employees with valid GPS Coordinates (Lat -90 to 90, Lng -180 to 180)
  // If invalid, blank, null, or missing -> DO NOT SHOW in Fleet Activity Monitor!
  const gpsEligibleStaff = allStaff.filter(emp => window.hasValidGpsCoordinates(emp));

  let list = gpsEligibleStaff;
  if (fleetSearchQuery) {
    list = gpsEligibleStaff.filter(emp => {
      const lat = Number(emp.lat !== undefined && emp.lat !== null && emp.lat !== '' ? emp.lat : emp.coordinates.lat);
      const lng = Number(emp.lng !== undefined && emp.lng !== null && emp.lng !== '' ? emp.lng : emp.coordinates.lng);
      const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      return (emp.name && emp.name.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.id && emp.id.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.boothCode && emp.boothCode.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.role && emp.role.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.address && emp.address.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.purok && emp.purok.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.municipality && emp.municipality.toLowerCase().includes(fleetSearchQuery)) ||
             (emp.area && emp.area.toLowerCase().includes(fleetSearchQuery)) ||
             (coordStr.includes(fleetSearchQuery)) ||
             (emp.lat && emp.lat.toString().includes(fleetSearchQuery)) ||
             (emp.lng && emp.lng.toString().includes(fleetSearchQuery));
    });
  }

  if (list.length === 0) {
    const emptyMsg = fleetSearchQuery 
      ? `🔍 No GPS-enabled staff found matching "<strong>${fleetSearchQuery}</strong>"`
      : `📍 No active staff with valid GPS coordinates in Master Registry.`;
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 12px;">
        ${emptyMsg}
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(emp => {
    let statusBg = '#dcfce7; color: #166534;';
    const roleUpper = (emp.role || '').toUpperCase();
    if (roleUpper.includes('COLLECTOR')) statusBg = '#fef3c7; color: #b45309;';
    else if (roleUpper.includes('SUPERVISOR')) statusBg = '#f3e8ff; color: #7e22ce;';
    else if (roleUpper.includes('TEAM LEADER')) statusBg = '#ccfbf1; color: #0f766e;';
    else if (roleUpper.includes('RELIEVER') || roleUpper.includes('RELIVER')) statusBg = '#e2e8f0; color: #334155;';

    // True Master Registry coordinates (never fake or fallback)
    const latVal = Number(emp.lat !== undefined && emp.lat !== null && emp.lat !== '' ? emp.lat : emp.coordinates.lat);
    const lngVal = Number(emp.lng !== undefined && emp.lng !== null && emp.lng !== '' ? emp.lng : emp.coordinates.lng);
    const latStr = latVal.toFixed(6);
    const lngStr = lngVal.toFixed(6);

    let displayRole = emp.role;
    if (roleUpper === 'TELLER' || roleUpper === 'STATION TELLER') displayRole = 'Sales Representative';
    else if (roleUpper === 'RELIVER') displayRole = 'Reliever';

    return `
      <div style="padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-surface); border: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s;" onclick="window.focusEmployeeCoords(${latVal}, ${lngVal}, '${emp.id}')" title="Click to locate on STL BOOTH map">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${emp.name}</div>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${statusBg}">${displayRole}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          Outlet: <code>${emp.boothCode || '-'}</code> • ${emp.municipality || emp.address || emp.area || '-'}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span style="font-size: 10.5px; font-family: monospace; color: var(--primary); font-weight: 700;">📍 ${latStr}, ${lngStr}</span>
          <span style="font-size: 10px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); padding: 1px 6px; border-radius: 3px;">GPS ACTIVE</span>
        </div>
      </div>
    `;
  }).join('');
}

// Precision GPS Pin Calibration Modal Logic
window.openPrecisionCalibrateModal = function(preselectedId = null) {
  sfx.playClick();
  const select = document.getElementById('calib-select-target');
  const store = window.appStore;
  const employees = store.getEmployees();
  const relievers = store.data.relievers || [];
  const allStaff = [...employees, ...relievers.filter(r => !employees.some(e => e.id === r.id))];

  select.innerHTML = allStaff.map(e => {
    let rName = e.role;
    const rU = (e.role || '').toUpperCase();
    if (rU === 'TELLER' || rU === 'STATION TELLER') rName = 'Sales Representative';
    else if (rU === 'RELIVER') rName = 'Reliever';
    return `
      <option value="${e.id}" ${e.id === preselectedId ? 'selected' : ''}>
        ${rName}: ${e.name} (${e.id}) - Outlet: ${e.boothCode || '-'}
      </option>
    `;
  }).join('');

  if (preselectedId) {
    select.value = preselectedId;
  }

  window.onCalibTargetSelected();
  document.getElementById('modal-precision-calibrate').classList.add('active');
};

window.onCalibTargetSelected = function() {
  const targetId = document.getElementById('calib-select-target').value;
  const store = window.appStore;
  const emp = store.getEmployees().find(e => e.id === targetId) ||
              (store.data.relievers && store.data.relievers.find(r => r.id === targetId));
  if (!emp) return;

  document.getElementById('calib-input-lat').value = emp.lat ? emp.lat.toFixed(6) : '7.530300';
  document.getElementById('calib-input-lng').value = emp.lng ? emp.lng.toFixed(6) : '125.626400';
  document.getElementById('calib-address-preview').innerHTML = `
    <strong>Registered Address:</strong> ${emp.address || emp.area || '-'} | <strong>Outlet / Booth Location:</strong> <code>${emp.boothCode || '-'}</code>
  `;
};

window.savePrecisionCalibration = function() {
  const targetId = document.getElementById('calib-select-target').value;
  const latVal = document.getElementById('calib-input-lat').value.trim();
  const lngVal = document.getElementById('calib-input-lng').value.trim();
  const lat = parseFloat(latVal);
  const lng = parseFloat(lngVal);

  if (isNaN(lat) || isNaN(lng)) {
    alert('Please enter valid latitude and longitude numbers');
    return;
  }

  window.appStore.updateCoordinates(targetId, lat, lng);
  if (window.etsMap && window.etsMap.renderAllMarkers) {
    window.etsMap.renderAllMarkers();
    window.etsMap.focusCoordinates(lat, lng, 16);
    const marker = window.etsMap.allMarkerInstances[targetId];
    if (marker) {
      marker.openPopup();
    }
  }
  renderFleetTrackingList();
  renderEmployeesTable();
  sfx.playChime();
  window.closeModals();
};

window.focusEmployeeCoords = function(lat, lng, empId = null) {
  sfx.playClick();
  if (window.etsMap) {
    window.etsMap.focusCoordinates(lat, lng, 16);
    if (empId && window.etsMap.allMarkerInstances[empId]) {
      window.etsMap.allMarkerInstances[empId].openPopup();
    }
  }
};

window.focusEmployeeRoute = function(empId) {
  sfx.playClick();
  window.etsMap.showRoute(empId);
};

window.focusBoothInView = function(boothId) {
  sfx.playClick();
  window.switchView('view-finance');
};

window.pingEmployee = function(empId) {
  sfx.playChime();
  alert(`Telemetry Ping sent to unit ${empId}. GPS location synchronized successfully.`);
};

window.refreshEtsMap = function() {
  sfx.playClick();
  window.etsMap.renderAllMarkers();
};

window.triggerEmergencyBroadcast = function() {
  sfx.playAlert();
  alert('🚨 [EMERGENCY DRILL TRIGGERED] Broadcast dispatched to all Team Davao Del Norte Supervisors and Field Collectors: Check-in verified.');
};


// =========================================================================
// VIEW 4: SALES & COLLECTION — DAILY ACCOUNTING SUMMARY → EOD AUTOMATION
// =========================================================================
function renderPipelines() {
  if (window.eodEngine && typeof window.eodEngine.init === 'function') {
    window.eodEngine.init();
  }
}

// =========================================================================
// VIEW 5: EXPENSES & PAYMENT
// =========================================================================
function renderFinance(filteredList = null) {
  if (window.expensesPayment) {
    window.expensesPayment.init();
  }
}



// =========================================================================
// VIEW 6: REST DAY / DAY OFF MANAGEMENT
// =========================================================================
function renderRestDays() {
  const manningTbody = document.getElementById('manning-table-tbody');
  const rdTbody = document.getElementById('restday-table-tbody');
  if (!manningTbody || !rdTbody) return;

  const store = window.appStore;
  const manning = store.getManningCoverage();
  const restDays = store.getRestDays();

  manningTbody.innerHTML = manning.map(m => `
    <tr>
      <td><strong>${m.day}</strong></td>
      <td style="font-weight: 700; color: #f59e0b;">${m.collectorsOnDuty} Field Collectors</td>
      <td style="font-weight: 700; color: #10b981;">${m.tellersOnDuty} Booth Tellers</td>
      <td><span class="badge ${m.status.includes('Full') ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
      <td style="font-size: 12px; color: var(--text-muted);">Optimal for scheduled Davao draw shifts</td>
    </tr>
  `).join('');

  rdTbody.innerHTML = restDays.map(rd => {
    const isPending = rd.status.includes('Pending');
    const isToday = rd.status.includes('Active Today');

    let badgeClass = 'badge-success';
    if (isPending) badgeClass = 'badge-warning';
    if (isToday) badgeClass = 'badge-purple';

    return `
      <tr>
        <td><code>${rd.id}</code></td>
        <td><strong>${rd.employeeName}</strong></td>
        <td><span class="badge badge-info">${rd.role}</span></td>
        <td><code>${rd.boothCode}</code></td>
        <td><strong>${rd.fixedRestDay}</strong></td>
        <td style="font-family: monospace;">${rd.currentWeekDate}</td>
        <td>${rd.replacementEmployeeName || 'Designated Shift Buffer'}</td>
        <td style="font-size: 12px;">${rd.reason}</td>
        <td><span class="badge ${badgeClass}">${rd.status}</span></td>
        <td>
          ${isPending ? `
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-success btn-sm" onclick="window.approveRestDay('${rd.id}')">
                Approve
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.rejectRestDay('${rd.id}')">
                Decline
              </button>
            </div>
          ` : `
            <span style="font-size: 11px; color: var(--text-dim);">Signed: ${rd.approvedBy}</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

window.openRestDayModal = function() {
  sfx.playClick();
  const empSelect = document.getElementById('rd-form-emp');
  const relieverSelect = document.getElementById('rd-form-reliever');
  const emps = window.appStore.getEmployees();

  empSelect.innerHTML = emps.map(e => `<option value="${e.id}">${e.name} (${e.role} - ${e.boothCode})</option>`).join('');
  relieverSelect.innerHTML = emps.map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join('');

  document.getElementById('rd-form-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rd-form-reason').value = '';
  document.getElementById('modal-restday').classList.add('active');
};

window.saveRestDayForm = function() {
  const store = window.appStore;
  const empId = document.getElementById('rd-form-emp').value;
  const relieverId = document.getElementById('rd-form-reliever').value;
  const reason = document.getElementById('rd-form-reason').value.trim();

  const emp = store.getEmployees().find(e => e.id === empId);
  const reliever = store.getEmployees().find(e => e.id === relieverId);

  if (!reason) {
    alert('Please specify the reason for this rest day or swap request');
    return;
  }

  store.addRestDayRequest({
    employeeId: empId,
    employeeName: emp ? emp.name : 'Staff Member',
    role: emp ? emp.role : 'Teller',
    boothCode: emp ? emp.boothCode : 'BTH-DVO-101',
    fixedRestDay: 'Flexible Day Off',
    currentWeekDate: document.getElementById('rd-form-date').value,
    replacementEmployeeId: relieverId,
    replacementEmployeeName: reliever ? reliever.name : 'Buffer Staff',
    reason: reason,
    status: 'Pending Supervisor Approval'
  });

  sfx.playChime();
  window.closeModals();
};

window.approveRestDay = function(id) {
  sfx.playChime();
  window.appStore.updateRestDayStatus(id, 'Approved', 'Rodrigo S. Morales (Supervisor)');
};

window.rejectRestDay = function(id) {
  sfx.playClick();
  window.appStore.updateRestDayStatus(id, 'Declined (Coverage Tight)', 'Rodrigo S. Morales (Supervisor)');
};

// =========================================================================
// VIEW 7: INVENTORY & COMPANY PROPERTY MANAGEMENT
// =========================================================================
// =========================================================================
// VIEW 7: INVENTORY & COMPANY PROPERTY MANAGEMENT (REBUILT)
// =========================================================================
let currentInventoryTab = 'active'; // 'active' or 'archived'
window.targetArchivePropertyId = null;

// Approved make & models mapping
const APPROVED_MODELS = {
  'POS MACHINE': ['Sunmi V2', 'Sunmi V2s Pro', 'Newland N910', 'Pax A930'],
  'CELLPHONE': ['Vivo Y93'],
  'THERMAL PAPER': ['Thermal Roll 57mm'],
  'VEST': ['Official DDN Collector Vest']
};

window.onPropertyTypeChange = function(selectedType) {
  const modelSelect = document.getElementById('prop-form-model');
  if (!modelSelect) return;
  const models = APPROVED_MODELS[selectedType] || ['Sunmi V2'];
  modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
};

function renderInventory(filteredList = null) {
  const tbody = document.getElementById('inventory-table-tbody');
  if (!tbody) return;

  const store = window.appStore;
  const activeItems = store.getInventory(false);
  const archivedItems = store.getArchivedInventory();

  // 1. Update Section 25 Counters at the top
  const elTotal = document.getElementById('inv-stat-total');
  if (elTotal) elTotal.textContent = activeItems.length;

  const elAssigned = document.getElementById('inv-stat-assigned');
  if (elAssigned) {
    const assignedCount = activeItems.filter(i => i.status === 'Assigned' || i.status === 'Deployed').length;
    elAssigned.textContent = assignedCount;
  }

  const elAvailable = document.getElementById('inv-stat-available');
  if (elAvailable) {
    const availableCount = activeItems.filter(i => i.status === 'Available' || i.status === 'In-Stock').length;
    elAvailable.textContent = availableCount;
  }

  const elRepair = document.getElementById('inv-stat-repair');
  if (elRepair) {
    const repairCount = activeItems.filter(i => 
      i.status === 'Under Repair' || i.status === 'In-Repair' || 
      i.condition === 'Damaged' || i.condition === 'For Repair'
    ).length;
    elRepair.textContent = repairCount;
  }

  const elMissing = document.getElementById('inv-stat-missing');
  if (elMissing) {
    const missingCount = activeItems.filter(i => i.status === 'Missing' || i.condition === 'Lost').length;
    elMissing.textContent = missingCount;
  }

  // Tab count badges
  const elActiveTabCount = document.getElementById('inv-tab-active-count');
  if (elActiveTabCount) elActiveTabCount.textContent = activeItems.length;

  const elArchivedTabCount = document.getElementById('inv-tab-archived-count');
  if (elArchivedTabCount) elArchivedTabCount.textContent = archivedItems.length;

  // 2. Select active vs archived data source
  let baseList = currentInventoryTab === 'active' ? activeItems : archivedItems;
  const list = filteredList || baseList;

  // Update status summary text
  const statusText = document.getElementById('inv-table-status-text');
  if (statusText) {
    statusText.textContent = currentInventoryTab === 'active' 
      ? `Displaying ${list.length} active registered properties` 
      : `Displaying ${list.length} archived properties (historical audit mode)`;
  }
  const rowCount = document.getElementById('inv-table-row-count');
  if (rowCount) rowCount.textContent = `${list.length} items`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 36px; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">📦</div>
          <div style="font-size: 14px; font-weight: 600;">No property records found matching current criteria</div>
          <div style="font-size: 12px; margin-top: 4px;">Try clearing filters or click "+ Add Property" to register a new asset.</div>
        </td>
      </tr>
    `;
    return;
  }

  // 3. Render exact 9 columns:
  // No. | Property Type | Make & Model | Serial / Batch No. | Assigned To | Booth Code | Condition / Health | Status | Actions
  tbody.innerHTML = list.map(item => {
    // Type Badge
    let typeBadge = 'badge-purple';
    if (item.type === 'CELLPHONE') typeBadge = 'badge-info';
    if (item.type === 'THERMAL PAPER') typeBadge = 'badge-warning';
    if (item.type === 'VEST') typeBadge = 'badge-success';

    // Condition Badge (Physical Condition)
    let condBadge = 'badge-neutral';
    if (item.condition === 'Brand New') condBadge = 'badge-success';
    if (item.condition === 'Good') condBadge = 'badge-info';
    if (item.condition === 'Used') condBadge = 'badge-neutral';
    if (item.condition === 'Damaged' || item.condition === 'For Repair') condBadge = 'badge-warning';
    if (item.condition === 'For Replacement' || item.condition === 'Lost') condBadge = 'badge-danger';

    // Status Badge (Operational State)
    let statusBadge = 'badge-neutral';
    if (item.status === 'Assigned' || item.status === 'Deployed') statusBadge = 'badge-success';
    if (item.status === 'Available' || item.status === 'In-Stock') statusBadge = 'badge-info';
    if (item.status === 'Under Repair' || item.status === 'In-Repair') statusBadge = 'badge-warning';
    if (item.status === 'Missing') statusBadge = 'badge-danger';
    if (item.status === 'Returned' || item.status === 'Retired') statusBadge = 'badge-neutral';

    // Booth Location lookup from Master Registry if not present
    let locationText = item.boothLocation || '';
    if (!locationText && item.boothCode) {
      const b = store.getBooths().find(x => x.id === item.boothCode);
      if (b) locationText = b.area || b.municipality;
    }

    const isArchived = item.isArchived === true;

    return `
      <tr id="prop-row-${item.no}" style="${isArchived ? 'opacity: 0.75; background: rgba(0,0,0,0.05);' : ''}">
        <!-- 1. No. (Auto-generated 3-digit number) -->
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700; font-size: 13.5px; color: var(--primary);">
            ${item.no || item.id}
          </span>
        </td>

        <!-- 2. Property Type -->
        <td>
          <span class="badge ${typeBadge}" style="font-weight: 700; font-size: 11px;">${item.type}</span>
        </td>

        <!-- 3. Make & Model (Combined field) -->
        <td>
          <strong style="color: var(--text-main); font-size: 13px;">${item.brandModel}</strong>
        </td>

        <!-- 4. Serial / Batch No. -->
        <td>
          <code style="font-size: 12px; padding: 2px 6px; background: var(--bg-surface-elevated); border-radius: 4px;">
            ${item.serial || 'N/A'}
          </code>
        </td>

        <!-- 5. Assigned To (Master Registry employee) -->
        <td>
          <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
            ${item.assignedTo && item.assignedTo !== 'Unassigned' 
              ? `<span style="color: var(--success); font-size: 10px;">●</span> <span>${item.assignedTo}</span>`
              : `<span style="color: var(--text-dim); font-style: italic;">Unassigned (Depot Buffer)</span>`
            }
          </div>
          ${item.employeeId ? `<div style="font-size: 10.5px; font-family: var(--font-mono); color: var(--text-dim);">${item.employeeId}</div>` : ''}
        </td>

        <!-- 6. Booth Code (Master Registry booth) -->
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <code style="font-weight: 700; font-size: 12px;">${item.boothCode || 'HQ-BUFFER'}</code>
          </div>
          ${locationText ? `
            <div style="font-size: 11px; color: var(--text-muted); max-width: 170px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${locationText}">
              ${locationText}
            </div>` : ''}
        </td>

        <!-- 7. Condition / Health -->
        <td>
          <span class="badge ${condBadge}" style="font-size: 11px;">${item.condition}</span>
        </td>

        <!-- 8. Status -->
        <td>
          <span class="badge ${statusBadge}" style="font-size: 11px;">${item.status}</span>
        </td>

        <!-- 9. Actions -->
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            ${!isArchived ? `
              <!-- Edit -->
              <button class="btn btn-secondary btn-sm" onclick="window.openEditPropertyModal('${item.id}')" title="Edit Property Details" style="padding: 4px 8px; font-size: 12px;">
                ✏️
              </button>
              <!-- History -->
              <button class="btn btn-secondary btn-sm" onclick="window.openPropertyHistoryModal('${item.id}')" title="View Assignment History" style="padding: 4px 8px; font-size: 12px;">
                📜
              </button>
              <!-- Delete = Archive -->
              <button class="btn btn-secondary btn-sm" onclick="window.openArchivePropertyModal('${item.id}')" title="Archive Property" style="padding: 4px 8px; font-size: 12px; color: var(--warning);">
                📦
              </button>
            ` : `
              <!-- History -->
              <button class="btn btn-secondary btn-sm" onclick="window.openPropertyHistoryModal('${item.id}')" title="View Assignment History" style="padding: 4px 8px; font-size: 12px;">
                📜 History
              </button>
              <!-- Restore -->
              <button class="btn btn-primary btn-sm" onclick="window.restoreArchivedProperty('${item.id}')" title="Restore to Active Inventory" style="padding: 4px 8px; font-size: 12px;">
                🔄 Restore
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.filterInventoryTable = function() {
  const query = (document.getElementById('inv-search-input')?.value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('inv-filter-type')?.value || 'ALL';
  const condFilter = document.getElementById('inv-filter-condition')?.value || 'ALL';
  const statusFilter = document.getElementById('inv-filter-status')?.value || 'ALL';
  const assignFilter = document.getElementById('inv-filter-assigned')?.value || 'ALL';

  const store = window.appStore;
  const baseList = currentInventoryTab === 'active' ? store.getInventory(false) : store.getArchivedInventory();

  const filtered = baseList.filter(item => {
    // 1. Search Query
    if (query) {
      const matchNo = (item.no || item.id || '').toLowerCase().includes(query);
      const matchType = (item.type || '').toLowerCase().includes(query);
      const matchModel = (item.brandModel || '').toLowerCase().includes(query);
      const matchSerial = (item.serial || '').toLowerCase().includes(query);
      const matchEmp = (item.assignedTo || '').toLowerCase().includes(query);
      const matchBooth = (item.boothCode || '').toLowerCase().includes(query);
      const matchLoc = (item.boothLocation || '').toLowerCase().includes(query);
      if (!matchNo && !matchType && !matchModel && !matchSerial && !matchEmp && !matchBooth && !matchLoc) {
        return false;
      }
    }

    // 2. Type Filter
    if (typeFilter !== 'ALL' && item.type !== typeFilter) {
      return false;
    }

    // 3. Condition Filter
    if (condFilter !== 'ALL' && item.condition !== condFilter) {
      return false;
    }

    // 4. Status Filter
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }

    // 5. Assignment Filter
    if (assignFilter === 'ASSIGNED') {
      if (!item.assignedTo || item.assignedTo === 'Unassigned') return false;
    } else if (assignFilter === 'UNASSIGNED') {
      if (item.assignedTo && item.assignedTo !== 'Unassigned') return false;
    }

    return true;
  });

  renderInventory(filtered);
};

window.switchInventoryTab = function(tab) {
  currentInventoryTab = tab;
  sfx.playClick();

  const btnActive = document.getElementById('inv-tab-btn-active');
  const btnArchived = document.getElementById('inv-tab-btn-archived');

  if (tab === 'active') {
    if (btnActive) {
      btnActive.className = 'btn btn-primary btn-sm';
      btnActive.style.background = '';
    }
    if (btnArchived) {
      btnArchived.className = 'btn btn-secondary btn-sm';
      btnArchived.style.background = 'transparent';
      btnArchived.style.border = 'none';
    }
  } else {
    if (btnArchived) {
      btnArchived.className = 'btn btn-primary btn-sm';
      btnArchived.style.background = '';
    }
    if (btnActive) {
      btnActive.className = 'btn btn-secondary btn-sm';
      btnActive.style.background = 'transparent';
      btnActive.style.border = 'none';
    }
  }

  window.filterInventoryTable();
};

function populatePropertyDropdowns(selectedEmpId = '', selectedBoothCode = '') {
  const store = window.appStore;
  const emps = store.getEmployees();
  const booths = store.getBooths();
  const relievers = store.data.relievers || [];

  // 1. Populate Assigned To dropdown directly from Master Registry
  const assignedSelect = document.getElementById('prop-form-assigned');
  if (assignedSelect) {
    let options = `<option value="Unassigned">-- Unassigned (Buffer Stock / Depot) --</option>`;
    
    // Tellers
    options += `<optgroup label="Registered Tellers (Master Registry)">`;
    emps.filter(e => e.role === 'TELLER').forEach(e => {
      const isSel = (e.name === selectedEmpId || e.id === selectedEmpId) ? 'selected' : '';
      options += `<option value="${e.name}" data-empid="${e.id}" data-booth="${e.boothCode || ''}" ${isSel}>${e.name} (${e.boothCode || 'No Station'})</option>`;
    });
    options += `</optgroup>`;

    // Collectors & Officers
    options += `<optgroup label="Field Collectors & Supervisors">`;
    emps.filter(e => e.role !== 'TELLER').forEach(e => {
      const isSel = (e.name === selectedEmpId || e.id === selectedEmpId) ? 'selected' : '';
      options += `<option value="${e.name}" data-empid="${e.id}" data-booth="${e.boothCode || ''}" ${isSel}>${e.name} (${e.role})</option>`;
    });
    options += `</optgroup>`;

    // Relievers
    options += `<optgroup label="Reliever Pool">`;
    relievers.forEach(r => {
      const isSel = (r.name === selectedEmpId || r.id === selectedEmpId) ? 'selected' : '';
      options += `<option value="${r.name}" data-empid="${r.id}" data-booth="${r.boothCode || ''}" ${isSel}>${r.name}</option>`;
    });
    options += `</optgroup>`;

    assignedSelect.innerHTML = options;
  }

  // 2. Populate Booth Code dropdown directly from Master Registry
  const boothSelect = document.getElementById('prop-form-booth');
  if (boothSelect) {
    let boothOptions = `
      <option value="HQ-BUFFER" data-loc="Sto. Tomas Logistics Depot Buffer">HQ-BUFFER (Sto. Tomas Logistics Depot)</option>
      <option value="HQ-WHSE" data-loc="Central Warehouse Sto. Tomas HQ">HQ-WHSE (Central Logistics Warehouse)</option>
    `;

    boothOptions += `<optgroup label="Registered Stations (Master Registry)">`;
    booths.forEach(b => {
      const isSel = b.id === selectedBoothCode ? 'selected' : '';
      boothOptions += `<option value="${b.id}" data-loc="${b.area || b.municipality}" ${isSel}>${b.id} - ${b.area || b.municipality}</option>`;
    });
    boothOptions += `</optgroup>`;

    boothSelect.innerHTML = boothOptions;
  }
}

window.onPropAssignedChange = function(empName) {
  const assignedSelect = document.getElementById('prop-form-assigned');
  const boothSelect = document.getElementById('prop-form-booth');
  const statusSelect = document.getElementById('prop-form-status');
  const assignedHint = document.getElementById('prop-form-assigned-hint');
  const boothHint = document.getElementById('prop-form-booth-hint');

  if (!assignedSelect) return;

  if (empName === 'Unassigned') {
    if (statusSelect) statusSelect.value = 'Available';
    if (boothSelect) boothSelect.value = 'HQ-BUFFER';
    if (assignedHint) assignedHint.innerHTML = `<span style="color: var(--text-dim);">Available for deployment from buffer pool</span>`;
    if (boothHint) boothHint.innerHTML = `<span style="color: var(--text-dim);">HQ Logistics Buffer</span>`;
    return;
  }

  const opt = assignedSelect.options[assignedSelect.selectedIndex];
  const linkedBooth = opt?.getAttribute('data-booth');
  const empId = opt?.getAttribute('data-empid');

  if (statusSelect) statusSelect.value = 'Assigned';

  if (assignedHint) {
    assignedHint.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ Master Registry Record: ${empId || empName}</span>`;
  }

  if (linkedBooth && boothSelect) {
    for (let i = 0; i < boothSelect.options.length; i++) {
      if (boothSelect.options[i].value === linkedBooth) {
        boothSelect.selectedIndex = i;
        const bOpt = boothSelect.options[i];
        const loc = bOpt.getAttribute('data-loc');
        if (boothHint) {
          boothHint.innerHTML = `<span style="color: var(--primary); font-weight: 600;">✓ Auto-assigned Station: ${loc}</span>`;
        }
        return;
      }
    }
  }
};

window.onPropBoothChange = function(boothCode) {
  const boothSelect = document.getElementById('prop-form-booth');
  const boothHint = document.getElementById('prop-form-booth-hint');
  if (!boothSelect || !boothHint) return;

  const opt = boothSelect.options[boothSelect.selectedIndex];
  const loc = opt?.getAttribute('data-loc') || 'Davao Del Norte Operations Base';
  boothHint.innerHTML = `<span style="color: var(--primary); font-weight: 600;">Station Location: ${loc}</span>`;
};

window.openAddPropertyModal = function() {
  sfx.playClick();
  const store = window.appStore;
  const nextNo = store.getNextPropertyNo();

  document.getElementById('prop-modal-title').textContent = `+ Add Property (Next: No. ${nextNo})`;
  document.getElementById('prop-form-id').value = '';
  document.getElementById('prop-form-type').value = 'POS MACHINE';
  window.onPropertyTypeChange('POS MACHINE');
  document.getElementById('prop-form-serial').value = `SN-DDN-${Math.floor(10000 + Math.random() * 90000)}`;
  document.getElementById('prop-form-condition').value = 'Good';
  document.getElementById('prop-form-status').value = 'Assigned';
  document.getElementById('prop-form-note').value = 'Initial Registration in Davao Del Norte HQ Registry';

  populatePropertyDropdowns();
  document.getElementById('modal-property-form').classList.add('active');
};

window.openEditPropertyModal = function(id) {
  sfx.playClick();
  const store = window.appStore;
  const item = store.data.inventory.find(i => i.id === id || i.no === id);
  if (!item) return;

  document.getElementById('prop-modal-title').textContent = `Edit Property [No. ${item.no}]`;
  document.getElementById('prop-form-id').value = item.id;
  document.getElementById('prop-form-type').value = item.type;
  window.onPropertyTypeChange(item.type);
  
  // Select make & model
  const modelSelect = document.getElementById('prop-form-model');
  if (modelSelect) modelSelect.value = item.brandModel;

  document.getElementById('prop-form-serial').value = item.serial || '';
  document.getElementById('prop-form-condition').value = item.condition;
  document.getElementById('prop-form-status').value = item.status;
  document.getElementById('prop-form-note').value = '';

  populatePropertyDropdowns(item.assignedTo, item.boothCode);

  const assignedSelect = document.getElementById('prop-form-assigned');
  if (assignedSelect) assignedSelect.value = item.assignedTo;

  const boothSelect = document.getElementById('prop-form-booth');
  if (boothSelect) boothSelect.value = item.boothCode;

  window.onPropBoothChange(item.boothCode);

  document.getElementById('modal-property-form').classList.add('active');
};

window.savePropertyForm = function() {
  const store = window.appStore;
  const id = document.getElementById('prop-form-id').value;
  const type = document.getElementById('prop-form-type').value;
  const brandModel = document.getElementById('prop-form-model').value;
  const serial = document.getElementById('prop-form-serial').value.trim();
  const assignedTo = document.getElementById('prop-form-assigned').value;
  const boothCode = document.getElementById('prop-form-booth').value;
  const condition = document.getElementById('prop-form-condition').value;
  const status = document.getElementById('prop-form-status').value;
  const note = document.getElementById('prop-form-note').value.trim();

  if (!serial) {
    alert('Please provide a Serial / Batch No. (use N/A if not applicable).');
    document.getElementById('prop-form-serial').focus();
    return;
  }

  const boothOpt = document.getElementById('prop-form-booth')?.selectedOptions[0];
  const boothLoc = boothOpt?.getAttribute('data-loc') || 'Davao Del Norte Operations Base';

  const empOpt = document.getElementById('prop-form-assigned')?.selectedOptions[0];
  const empId = empOpt?.getAttribute('data-empid') || '';

  if (id) {
    // Edit existing property
    store.updateInventoryProperty(id, {
      type,
      brandModel,
      serial,
      assignedTo,
      employeeId: empId,
      boothCode,
      boothLocation: boothLoc,
      condition,
      status
    }, note || 'Property details updated');
  } else {
    // Add new property
    store.addInventoryProperty({
      type,
      brandModel,
      serial,
      assignedTo,
      employeeId: empId,
      boothCode,
      boothLocation: boothLoc,
      condition,
      status,
      note: note || 'New property registered'
    });
  }

  sfx.playChime();
  window.closeModals();
  renderInventory();
  renderDashboard();
};

window.openPropertyHistoryModal = function(id) {
  sfx.playClick();
  const store = window.appStore;
  const item = store.data.inventory.find(i => i.id === id || i.no === id);
  if (!item) return;

  const subtitle = document.getElementById('prop-hist-subtitle');
  if (subtitle) {
    subtitle.textContent = `Property No. ${item.no} • ${item.type} (${item.brandModel}) • Serial: ${item.serial}`;
  }

  const summaryCard = document.getElementById('prop-hist-summary-card');
  if (summaryCard) {
    summaryCard.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 12px;">
        <div>
          <span style="color: var(--text-dim); display: block; font-size: 10px; text-transform: uppercase;">Current Assignment</span>
          <strong style="color: var(--text-main); font-size: 13px;">${item.assignedTo}</strong>
        </div>
        <div>
          <span style="color: var(--text-dim); display: block; font-size: 10px; text-transform: uppercase;">Current Booth</span>
          <strong style="color: var(--text-main); font-size: 13px;">${item.boothCode}</strong>
        </div>
        <div>
          <span style="color: var(--text-dim); display: block; font-size: 10px; text-transform: uppercase;">Physical Condition</span>
          <strong style="color: var(--warning); font-size: 13px;">${item.condition}</strong>
        </div>
        <div>
          <span style="color: var(--text-dim); display: block; font-size: 10px; text-transform: uppercase;">Operational Status</span>
          <strong style="color: var(--success); font-size: 13px;">${item.status}</strong>
        </div>
      </div>
    `;
  }

  const timelineContainer = document.getElementById('prop-hist-timeline');
  if (timelineContainer) {
    const history = item.assignmentHistory || [];
    if (history.length === 0) {
      timelineContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No previous assignment history recorded.</div>`;
    } else {
      timelineContainer.innerHTML = history.map((h, i) => `
        <div style="background: var(--bg-surface-elevated); padding: 12px 14px; border-radius: var(--radius-sm); border-left: 3px solid var(--primary); position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge badge-info" style="font-size: 10px;">${h.action || 'Assignment'}</span>
              <strong style="color: var(--text-main); font-size: 13px;">${h.assignedTo || 'Unassigned'} [${h.boothCode || 'HQ'}]</strong>
            </div>
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${h.date || 'Historical'}</span>
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px;">
            Location: <strong>${h.boothLocation || 'Davao Del Norte HQ'}</strong> • Condition: <strong>${h.condition}</strong> • Status: <strong>${h.status}</strong>
          </div>
          ${h.note ? `<div style="font-size: 11px; color: var(--text-main); font-style: italic; background: var(--bg-surface); padding: 4px 8px; border-radius: 4px;">"${h.note}"</div>` : ''}
        </div>
      `).join('');
    }
  }

  document.getElementById('modal-property-history').classList.add('active');
};

window.openArchivePropertyModal = function(id) {
  sfx.playClick();
  const store = window.appStore;
  const item = store.data.inventory.find(i => i.id === id || i.no === id);
  if (!item) return;

  window.targetArchivePropertyId = item.id;

  const box = document.getElementById('archive-property-details-box');
  if (box) {
    box.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div><strong>Property No:</strong> <span style="color: var(--primary); font-family: var(--font-mono);">#${item.no}</span></div>
        <div><strong>Type:</strong> ${item.type}</div>
        <div><strong>Make & Model:</strong> ${item.brandModel}</div>
        <div><strong>Serial:</strong> <code>${item.serial}</code></div>
        <div><strong>Assigned To:</strong> ${item.assignedTo}</div>
        <div><strong>Booth Code:</strong> <code>${item.boothCode}</code></div>
      </div>
    `;
  }

  document.getElementById('modal-property-archive').classList.add('active');
};

window.confirmArchiveProperty = function() {
  if (!window.targetArchivePropertyId) return;

  const store = window.appStore;
  store.archiveInventoryProperty(window.targetArchivePropertyId, 'Archived by Operator Carrillo');

  sfx.playClick();
  window.closeModals();
  window.targetArchivePropertyId = null;

  renderInventory();
  renderDashboard();
};

window.restoreArchivedProperty = function(id) {
  const store = window.appStore;
  store.restoreInventoryProperty(id);

  sfx.playChime();
  renderInventory();
  renderDashboard();
};

// =========================================================================
// VIEW 8: ORGANIZATION DEPARTMENTS & TEAMS/ROLES
// =========================================================================
function renderOrganization() {
  const container = document.getElementById('org-departments-list');
  if (!container) return;

  const store = window.appStore;
  const depts = store.data.departments;
  const emps = store.getEmployees();

  container.innerHTML = depts.map(d => {
    const deptEmps = emps.filter(e => e.department === d.id);

    return `
      <div style="padding: 14px 18px; border-radius: var(--radius-sm); background: var(--bg-surface-elevated); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 14.5px; font-weight: 700; color: var(--text-main);">${d.name}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
            Unit Lead: <strong>${d.head}</strong>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-info">${deptEmps.length} Staff Members</span>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================================
// VIEW 9: REPORTS & ANALYTICS (EOD DAILY REPORT)
// =========================================================================
function renderEodReport() {
  const tbody = document.getElementById('eod-table-tbody');
  if (!tbody) return;

  const store = window.appStore;
  const ledger = store.getEodLedger();

  let totalGross = 0;
  let totalPayouts = 0;
  let totalExpenses = 0;
  let totalNet = 0;

  tbody.innerHTML = ledger.map(entry => {
    totalGross += Number(entry.grossSales) || 0;
    totalPayouts += Number(entry.payoutsClaims) || 0;
    totalExpenses += Number(entry.expenses) || 0;
    totalNet += Number(entry.netRemittance) || 0;

    const isOver = entry.variance > 0;
    const isShort = entry.variance < 0;
    let badgeClass = 'badge-success';
    if (isOver) badgeClass = 'badge-info';
    if (isShort) badgeClass = 'badge-danger';

    return `
      <tr>
        <td><strong>${entry.boothCode}</strong></td>
        <td>${entry.teller}</td>
        <td><code>${entry.posSerial}</code></td>
        <td style="font-weight: 600;">${formatPHP(entry.grossSales)}</td>
        <td style="color: #ef4444;">${formatPHP(entry.payoutsClaims)}</td>
        <td style="color: #f59e0b;">${formatPHP(entry.expenses)}</td>
        <td style="font-weight: 700; color: #10b981;">${formatPHP(entry.expectedCash)}</td>
        <td>
          <input type="number" value="${entry.actualCash}" style="width: 110px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-main); font-family: monospace; font-weight: 600;" onchange="window.updateEodCash('${entry.boothCode}', this.value)">
        </td>
        <td style="font-weight: 700; ${isOver ? 'color: #0284c7;' : (isShort ? 'color: #dc2626;' : 'color: #16a34a;')}">${isOver ? '+' : ''}${formatPHP(entry.variance)}</td>
        <td><span class="badge ${badgeClass}">${entry.status}</span></td>
      </tr>
    `;
  }).join('');

  document.getElementById('eod-summary-gross').textContent = formatPHP(totalGross);
  document.getElementById('eod-summary-payouts').textContent = formatPHP(totalPayouts);
  document.getElementById('eod-summary-expenses').textContent = formatPHP(totalExpenses);
  document.getElementById('eod-summary-net').textContent = formatPHP(totalNet);
}

window.updateEodCash = function(boothCode, val) {
  sfx.playClick();
  window.appStore.updateEodEntry(boothCode, { actualCash: parseFloat(val) || 0 });
  renderEodReport();
};

window.printEodReport = function() {
  sfx.playClick();
  window.print();
};

window.exportEodToExcel = async function() {
  sfx.playChime();
  if (typeof ExcelJS === 'undefined') {
    alert('ExcelJS library is loading, please try again in a moment.');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'APEX OmniERP Enterprise';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('EOD Balancing Sheet', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // Headers
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'APEX MINDANAO OPERATIONS & GAMING SERVICES CORP. - DAVAO SECTOR';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells('A2:J2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `Official End of the Day (EOD) Operations Report - Date: ${new Date().toISOString().split('T')[0]}`;
  subtitleCell.font = { name: 'Arial', size: 11, italic: true };
  subtitleCell.alignment = { horizontal: 'center' };

  sheet.addRow([]);

  // Table Column Headers
  const headerRow = sheet.addRow([
    'Booth Code',
    'Assigned Teller',
    'POS Serial No.',
    'Gross Sales (₱)',
    'Payouts/Claims (₱)',
    'Expenses (₱)',
    'Expected Remittance (₱)',
    'Actual Cash Remitted (₱)',
    'Variance (Over/Short)',
    'Status'
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const ledger = window.appStore.getEodLedger();
  ledger.forEach(row => {
    sheet.addRow([
      row.boothCode,
      row.teller,
      row.posSerial,
      row.grossSales,
      row.payoutsClaims,
      row.expenses,
      row.expectedCash,
      row.actualCash,
      row.variance,
      row.status
    ]);
  });

  // Auto column widths
  sheet.columns.forEach(col => {
    col.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `APEX-Davao-EOD-Report-${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// =========================================================================
// VIEW 10: STEP 2 REPORT DETAILS & OCR RECOGNITION STUDIO
// =========================================================================

// Step 2 Report Details State Structure (matching Image 2)
let step2ReportData = {
  date: 'September 06, 2024',
  commission: 74776.50,
  salary: 28200.00,
  expenses: [
    { amount: 1200.00, desc: 'FUEL MOTOR', name: '', booth: '', loc: 'Davao Del Norte', dateCover: '', note: 'Motorcycle Gas Allowance' },
    { amount: 400.00, desc: 'RENT MOTOR', name: '', booth: '', loc: 'Field Route', dateCover: '', note: 'Motor Rental' },
    { amount: 20.00, desc: 'WIFI DDN 1477', name: 'MELANIE SARAWI', booth: 'DDN-1477', loc: 'TAGUM', dateCover: '', note: 'Wifi Allowance' },
    { amount: 30.00, desc: 'WIFI DDN 1782', name: 'MARYJANE FERNANDEZ', booth: 'DDN-1782', loc: 'CARMEN', dateCover: '', note: 'Wifi Allowance' },
    { amount: 834.00, desc: 'DOOR BOLT 10PCS, DOOR HASH 5PCS, PADLOCK 5PCS', name: '', booth: 'DDN BOOTHS', loc: '', dateCover: '', note: 'FOR BOOTH' },
    { amount: 4600.00, desc: 'THERMAL PAPER 300 ROLLS', name: '', booth: 'CENTRAL BUFFER', loc: 'Warehouse', dateCover: '', note: 'Consumables' },
    { amount: 15.00, desc: 'WIFI DDN 1475', name: 'LUZVIMINDA GALASATAN', booth: 'DDN-1475', loc: 'PANABO', dateCover: '', note: 'Wifi Allowance' },
    { amount: 20.00, desc: 'WIFI DDN 768', name: 'ALMERA DIGAMON', booth: 'DDN-768', loc: 'PANABO', dateCover: '', note: 'Wifi Allowance' },
    { amount: 1800.00, desc: 'RENT FEE SABONGAN NI NENE TIBAL-OG ST. TOMAS', name: 'Davilyn Gelito', booth: 'DDN-762', loc: 'Sto. Tomas', dateCover: 'AUG. 7, 2024 - SEP. 7, 2024', note: 'Monthly Stall Rent' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Nobelyn Baya', booth: 'DDN-428', loc: 'Carmen', dateCover: 'Sep 2024', note: 'Data Plan' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Mary Lovelyn Ramos', booth: 'DDN-350', loc: 'Tagum', dateCover: 'Sep 2024', note: 'Data Plan' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Marnie Royo', booth: 'DDN-427', loc: 'Carmen', dateCover: 'Sep 2024', note: 'Data Plan' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Amerita Hipos', booth: 'DDN-422', loc: 'Tagum', dateCover: 'Sep 2024', note: 'Data Plan' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Beverly Alao', booth: 'DDN-351', loc: 'Tagum', dateCover: 'Sep 2024', note: 'Data Plan' },
    { amount: 330.00, desc: 'POS LOAD /MONTH', name: 'Lenie Orillo', booth: 'DDN-1591', loc: 'Tagum', dateCover: 'Sep 2024', note: 'Data Plan (1781)' },
    { amount: 5000.00, desc: 'C.A. COLL. JASON', name: 'JASON (DDN005-SC003)', booth: 'HQ-DDN', loc: 'Carmen / Tagum', dateCover: '', note: 'APPROVED BY: SIR JUNDY' }
  ],
  collectorPayments: [
    { amount: 200.00, desc: 'PAYMENT COLL. MARK ANTHONY', booth: 'HQ-DDN-PANABO', collector: 'MARK ANTHONY (MAC2) - DDN005-SC004', tellerReliever: 'Panabo Hub Remittance', note: 'Collector Field Payment' }
  ],
  others: [
    { amount: 29878.25, desc: 'COMM. SEP. 05, 2024 (Prior day commission carried over into deposit)' }
  ]
};

function initOcrStudio() {
  window.loadStep2SampleFromYellowPad();
}

window.loadStep2SampleFromYellowPad = function() {
  sfx.playClick();
  currentSampleCanvas = window.ocrEngine.generateYellowPadSampleCanvas();
  window.applyOcrFilters();
  renderStep2Report();
  calculateStep2Totals();
};

window.handleOcrFileUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      currentSampleCanvas = canvas;
      window.applyOcrFilters();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

window.applyOcrFilters = function() {
  if (!currentSampleCanvas) return;

  const contrast = parseFloat(document.getElementById('ocr-slider-contrast').value);
  const threshold = parseInt(document.getElementById('ocr-slider-threshold').value);
  const invert = document.getElementById('ocr-check-invert').checked;

  const processed = window.ocrEngine.preprocessImage(currentSampleCanvas, {
    contrast: contrast,
    threshold: threshold,
    invert: invert
  });

  const previewCanvas = document.getElementById('ocr-canvas');
  previewCanvas.width = processed.width;
  previewCanvas.height = processed.height;
  const ctx = previewCanvas.getContext('2d');
  ctx.drawImage(processed, 0, 0);
};

window.executeOcrRecognition = async function() {
  sfx.playClick();
  const previewCanvas = document.getElementById('ocr-canvas');
  if (!previewCanvas) return;

  const btn = document.getElementById('ocr-run-btn');
  const progressContainer = document.getElementById('ocr-progress-container');
  const progressBar = document.getElementById('ocr-progress-bar');
  const progressPercent = document.getElementById('ocr-progress-percent');

  btn.disabled = true;
  btn.textContent = '⏳ Processing OCR...';
  progressContainer.style.display = 'block';

  try {
    const result = await window.ocrEngine.recognize(previewCanvas, (pct) => {
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
    });

    sfx.playChime();
    document.getElementById('ocr-raw-text').value = result.rawText;

    if (result.reportData) {
      step2ReportData = result.reportData;
      document.getElementById('step2-date').value = step2ReportData.date;
      document.getElementById('step2-commission').value = step2ReportData.commission;
      document.getElementById('step2-salary').value = step2ReportData.salary;
      renderStep2Report();
      calculateStep2Totals();
      alert('✅ Smart Field Extraction Complete! Form populated following Step 2 Report Details template.');
    }
  } catch (err) {
    console.error('OCR Error:', err);
    alert('OCR recognition encountered an error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Run OCR Recognition';
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1500);
  }
};

// Render Step 2 Report Tables
function renderStep2Report() {
  const expTbody = document.getElementById('step2-expenses-tbody');
  const payTbody = document.getElementById('step2-payments-tbody');
  const othTbody = document.getElementById('step2-others-tbody');

  if (!expTbody || !payTbody || !othTbody) return;

  // 1. Expenses Rows
  expTbody.innerHTML = step2ReportData.expenses.map((row, idx) => `
    <tr>
      <td>
        <input type="number" step="0.01" class="step2-table-input" value="${row.amount}" onchange="window.updateStep2Expense(${idx}, 'amount', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.desc || ''}" onchange="window.updateStep2Expense(${idx}, 'desc', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.name || ''}" placeholder="Teller / Payee" onchange="window.updateStep2Expense(${idx}, 'name', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.booth || ''}" placeholder="DDN-xxx" onchange="window.updateStep2Expense(${idx}, 'booth', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.loc || ''}" placeholder="Municipality" onchange="window.updateStep2Expense(${idx}, 'loc', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.dateCover || ''}" placeholder="e.g. Aug 7 - Sep 7" onchange="window.updateStep2Expense(${idx}, 'dateCover', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.note || ''}" placeholder="Notes" onchange="window.updateStep2Expense(${idx}, 'note', this.value)">
      </td>
      <td style="text-align: center;">
        <button type="button" style="background: none; border: none; cursor: pointer; color: #dc2626;" onclick="window.deleteStep2ExpenseRow(${idx})">✕</button>
      </td>
    </tr>
  `).join('');

  // 2. Collector Payments Rows
  payTbody.innerHTML = step2ReportData.collectorPayments.map((row, idx) => `
    <tr>
      <td>
        <input type="number" step="0.01" class="step2-table-input" value="${row.amount}" onchange="window.updateStep2Payment(${idx}, 'amount', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.desc || ''}" onchange="window.updateStep2Payment(${idx}, 'desc', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.booth || ''}" placeholder="Station / HQ" onchange="window.updateStep2Payment(${idx}, 'booth', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.collector || ''}" placeholder="Collector Name" onchange="window.updateStep2Payment(${idx}, 'collector', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.tellerReliever || ''}" placeholder="Teller / Remitter" onchange="window.updateStep2Payment(${idx}, 'tellerReliever', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.note || ''}" placeholder="Notes" onchange="window.updateStep2Payment(${idx}, 'note', this.value)">
      </td>
      <td style="text-align: center;">
        <button type="button" style="background: none; border: none; cursor: pointer; color: #dc2626;" onclick="window.deleteStep2PaymentRow(${idx})">✕</button>
      </td>
    </tr>
  `).join('');

  // 3. Others Rows
  othTbody.innerHTML = step2ReportData.others.map((row, idx) => `
    <tr>
      <td>
        <input type="number" step="0.01" class="step2-table-input" value="${row.amount}" onchange="window.updateStep2Other(${idx}, 'amount', this.value)">
      </td>
      <td>
        <input type="text" class="step2-table-input" value="${row.desc || ''}" onchange="window.updateStep2Other(${idx}, 'desc', this.value)">
      </td>
      <td style="text-align: center;">
        <button type="button" style="background: none; border: none; cursor: pointer; color: #dc2626;" onclick="window.deleteStep2OtherRow(${idx})">✕</button>
      </td>
    </tr>
  `).join('');
}

// Interactive Updates and Live Math Engine (Matching Image 2)
window.updateStep2Expense = function(idx, field, val) {
  if (field === 'amount') val = parseFloat(val) || 0;
  step2ReportData.expenses[idx][field] = val;
  calculateStep2Totals();
};

window.updateStep2Payment = function(idx, field, val) {
  if (field === 'amount') val = parseFloat(val) || 0;
  step2ReportData.collectorPayments[idx][field] = val;
  calculateStep2Totals();
};

window.updateStep2Other = function(idx, field, val) {
  if (field === 'amount') val = parseFloat(val) || 0;
  step2ReportData.others[idx][field] = val;
  calculateStep2Totals();
};

window.addStep2ExpenseRow = function() {
  sfx.playClick();
  step2ReportData.expenses.push({ amount: 0, desc: '', name: '', booth: '', loc: '', dateCover: '', note: '' });
  renderStep2Report();
  calculateStep2Totals();
};

window.deleteStep2ExpenseRow = function(idx) {
  sfx.playClick();
  step2ReportData.expenses.splice(idx, 1);
  renderStep2Report();
  calculateStep2Totals();
};

window.addStep2PaymentRow = function() {
  sfx.playClick();
  step2ReportData.collectorPayments.push({ amount: 0, desc: '', booth: '', collector: '', tellerReliever: '', note: '' });
  renderStep2Report();
  calculateStep2Totals();
};

window.deleteStep2PaymentRow = function(idx) {
  sfx.playClick();
  step2ReportData.collectorPayments.splice(idx, 1);
  renderStep2Report();
  calculateStep2Totals();
};

window.addStep2OtherRow = function() {
  sfx.playClick();
  step2ReportData.others.push({ amount: 0, desc: '' });
  renderStep2Report();
  calculateStep2Totals();
};

window.deleteStep2OtherRow = function(idx) {
  sfx.playClick();
  step2ReportData.others.splice(idx, 1);
  renderStep2Report();
  calculateStep2Totals();
};

// Summary Formula Engine:
// Sub-total = commission less (expenses + salary)
// Grand total for deposit = sub-total plus payments plus others
window.calculateStep2Totals = function() {
  const comm = parseFloat(document.getElementById('step2-commission').value) || 0;
  const sal = parseFloat(document.getElementById('step2-salary').value) || 0;

  const totalExp = step2ReportData.expenses.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalPay = step2ReportData.collectorPayments.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalOth = step2ReportData.others.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const expPlusSal = totalExp + sal;
  const subTotal = comm - expPlusSal;
  const grandTotal = subTotal + totalPay + totalOth;

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  document.getElementById('calc-total-expenses').textContent = fmt(totalExp);
  document.getElementById('calc-salary').textContent = fmt(sal);
  document.getElementById('calc-exp-salary').textContent = fmt(expPlusSal);
  document.getElementById('calc-commission').textContent = fmt(comm);
  document.getElementById('calc-subtotal').textContent = fmt(subTotal);
  document.getElementById('calc-total-payments').textContent = fmt(totalPay);
  document.getElementById('calc-total-others').textContent = fmt(totalOth);
  document.getElementById('calc-grandtotal').textContent = fmt(grandTotal);
};

// Commit Step 2 Report to ERP System Ledger & EOD
window.commitStep2ToSystem = function() {
  const comm = parseFloat(document.getElementById('step2-commission').value) || 0;
  const sal = parseFloat(document.getElementById('step2-salary').value) || 0;
  const dateStr = document.getElementById('step2-date').value || '2024-09-06';

  const store = window.appStore;

  // Add Commission as Verified Income
  store.addTransaction({
    date: dateStr,
    time: '12:00',
    type: 'Income',
    category: 'Daily Collection',
    boothCode: 'DDN-ALL',
    description: `Gross Daily Commission (${dateStr})`,
    amount: comm,
    employeeId: 'DDN005-SC001',
    status: 'Verified',
    voucherRef: `COMM-${dateStr.replace(/[^0-9]/g, '').slice(-4)}`
  });

  // Add Salary as Approved Expense
  store.addTransaction({
    date: dateStr,
    time: '12:15',
    type: 'Expense',
    category: 'Salary & Payroll',
    boothCode: 'DDN-ALL',
    description: `Daily Salary Payroll (${dateStr})`,
    amount: sal,
    employeeId: 'DDN005-SUP01',
    status: 'Approved',
    voucherRef: `SAL-${dateStr.replace(/[^0-9]/g, '').slice(-4)}`
  });

  // Add all individual expenses to Ledger
  step2ReportData.expenses.forEach(exp => {
    if (exp.amount > 0) {
      store.addTransaction({
        date: dateStr,
        time: '12:30',
        type: 'Expense',
        category: exp.desc.includes('FUEL') ? 'Transportation & Fuel' : (exp.desc.includes('WIFI') ? 'Booth Rental & Utility' : (exp.desc.includes('THERMAL') ? 'Thermal Paper Supply' : 'General Expense')),
        boothCode: exp.booth || 'HQ-DDN',
        description: `${exp.desc} ${exp.name ? '- ' + exp.name : ''} ${exp.note ? '(' + exp.note + ')' : ''}`,
        amount: exp.amount,
        employeeId: exp.booth ? `TELLER-${exp.booth}` : 'DDN005-SC001',
        status: 'Approved',
        voucherRef: `EXP-${Math.floor(1000 + Math.random() * 9000)}`
      });
    }
  });

  sfx.playChime();
  alert(`✅ Report successfully synchronized! Income, Salary, and all ${step2ReportData.expenses.length} expenses committed to the Financial Ledger and EOD Audit Sheet.`);
  window.switchView('view-finance');
};

// Export Step 2 Report to Excel matching Template Format
window.exportStep2ToExcel = async function() {
  sfx.playChime();
  if (typeof ExcelJS === 'undefined') {
    alert('ExcelJS is loading, please try again in a moment');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Step 2 - Report Details');

  // Title Plate
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'STEP 2 – REPORT DETAILS (DAVAO DEL NORTE OPERATIONS)';
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF234160' } };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.addRow([]);
  sheet.addRow(['DATE', document.getElementById('step2-date').value, '', 'COMMISSION', parseFloat(document.getElementById('step2-commission').value) || 0, 'SALARY', parseFloat(document.getElementById('step2-salary').value) || 0]);

  sheet.addRow([]);
  const expHead = sheet.addRow(['AMOUNT', 'DESCRIPTION', 'NAME', 'BOOTH CODE', 'LOCATION', 'DATE PERIOD COVER', 'NOTE']);
  expHead.font = { bold: true };
  expHead.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE2C4' } });

  step2ReportData.expenses.forEach(r => {
    sheet.addRow([r.amount, r.desc, r.name, r.booth, r.loc, r.dateCover, r.note]);
  });

  sheet.addRow([]);
  const payHead = sheet.addRow(['COLLECTOR PAYMENTS']);
  payHead.font = { bold: true };
  sheet.addRow(['AMOUNT', 'DESCRIPTION', 'BOOTH CODE', 'COLLECTOR', 'TELLER / RELIEVER', 'NOTE']);
  step2ReportData.collectorPayments.forEach(r => {
    sheet.addRow([r.amount, r.desc, r.booth, r.collector, r.tellerReliever, r.note]);
  });

  sheet.addRow([]);
  const othHead = sheet.addRow(['OTHERS']);
  othHead.font = { bold: true };
  sheet.addRow(['AMOUNT', 'DESCRIPTION']);
  step2ReportData.others.forEach(r => {
    sheet.addRow([r.amount, r.desc]);
  });

  sheet.addRow([]);
  sheet.addRow(['SUMMARY TOTALS']);
  sheet.addRow(['Total Expenses', document.getElementById('calc-total-expenses').textContent]);
  sheet.addRow(['+ Salary', document.getElementById('calc-salary').textContent]);
  sheet.addRow(['= Expenses + Salary', document.getElementById('calc-exp-salary').textContent]);
  sheet.addRow(['Commission', document.getElementById('calc-commission').textContent]);
  sheet.addRow(['Sub-total', document.getElementById('calc-subtotal').textContent]);
  sheet.addRow(['Total Collector Payments', document.getElementById('calc-total-payments').textContent]);
  sheet.addRow(['Total Others', document.getElementById('calc-total-others').textContent]);
  sheet.addRow(['Grand Total for Deposit', document.getElementById('calc-grandtotal').textContent]);

  sheet.columns.forEach(c => c.width = 20);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Step2-Report-Details-${document.getElementById('step2-date').value.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Database Backup & Restore
window.backupDatabaseJson = function() {
  sfx.playChime();
  const data = window.appStore.data;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `APEX-DDN005-OmniERP-Backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
};

window.restoreDatabaseJson = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const data = JSON.parse(event.target.result);
      window.appStore.save(data);
      sfx.playChime();
      alert('Database successfully restored from JSON backup!');
    } catch (err) {
      alert('Invalid backup JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
};

// Modal helpers
function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        window.closeModals();
      }
    });
  });
}

window.closeModals = function() {
  sfx.playClick();
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
};

