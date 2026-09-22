/**
 * APEX OmniERP - Expenses & Payment Module Controller
 * Core Daily Financial Tracking, Running CA Balance, Shortage Monitoring & OCR Integration
 */

class ExpensesPaymentController {
  constructor() {
    this.currentTab = 'tab-main-table';
    this.searchQuery = '';
    this.classificationFilter = 'ALL';
    this.statusFilter = 'ALL';
    this.targetDailyDate = '2024-09-06';
    this.targetMonthlyDate = '2024-09';
    this.currentPage = 1;
    this.rowsPerPage = 15;
    this.pendingOcrItems = [];
    this.pendingOcrMetadata = null;
    this.editingTransactionId = null;
  }

  init() {
    this.renderTabs();
    this.renderCurrentTab();
  }

  switchTab(tabId) {
    if (window.sfx) window.sfx.playClick();
    this.currentTab = tabId;
    this.renderTabs();
    this.renderCurrentTab();
  }

  renderTabs() {
    const tabs = [
      { id: 'tab-main-table', label: '📋 Main Expenses & Payment Table' },
      { id: 'tab-daily-monitoring', label: '📊 Daily Payment Monitoring' },
      { id: 'tab-monthly-summary', label: '📅 Monthly Summary & Expenses' },
      { id: 'tab-transaction-log', label: '📑 Transaction Log' },
      { id: 'tab-ocr-archive', label: '🗄️ OCR Document Archive' }
    ];

    const container = document.getElementById('ep-tab-buttons');
    if (!container) return;

    container.innerHTML = tabs.map(tab => `
      <button class="btn ${this.currentTab === tab.id ? 'btn-primary' : 'btn-secondary'}"
        style="padding: 8px 16px; font-weight: 700; font-size: 13px;"
        onclick="window.expensesPayment.switchTab('${tab.id}')">
        ${tab.label}
      </button>
    `).join('');
  }

  renderCurrentTab() {
    const panels = ['tab-main-table', 'tab-daily-monitoring', 'tab-monthly-summary', 'tab-transaction-log', 'tab-ocr-archive'];
    panels.forEach(p => {
      const el = document.getElementById(`ep-${p}`);
      if (el) el.style.display = (this.currentTab === p) ? 'block' : 'none';
    });

    if (this.currentTab === 'tab-main-table') this.renderMainTable();
    else if (this.currentTab === 'tab-daily-monitoring') this.renderDailyMonitoring();
    else if (this.currentTab === 'tab-monthly-summary') this.renderMonthlySummary();
    else if (this.currentTab === 'tab-transaction-log') this.renderTransactionLog();
    else if (this.currentTab === 'tab-ocr-archive') this.renderOcrArchive();
  }

  // =========================================================================
  // SUB-VIEW 1: MAIN EXPENSES & PAYMENT TABLE
  // Primary Columns: | DATE | AMOUNT | DESCRIPTION | NAME | BOOTH CODE | LOCATION | DATE PERIOD COVER | NOTE |
  // =========================================================================
  renderMainTable() {
    const tbody = document.getElementById('ep-main-table-tbody');
    if (!tbody) return;

    const store = window.appStore;
    const txns = store.getTransactions();

    let filtered = txns.filter(t => {
      // Classification filter
      if (this.classificationFilter !== 'ALL' && t.classification !== this.classificationFilter) {
        return false;
      }
      // Status filter
      if (this.statusFilter !== 'ALL' && t.verificationStatus !== this.statusFilter) {
        return false;
      }
      // Search query
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const fullStr = `${t.date} ${t.amount} ${t.description} ${t.name} ${t.boothCode} ${t.location} ${t.datePeriodCover} ${t.note} ${t.employeeId}`.toLowerCase();
        return fullStr.includes(q);
      }
      return true;
    });

    // Pagination
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.rowsPerPage));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIdx = (this.currentPage - 1) * this.rowsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + this.rowsPerPage);

    // Update pagination labels
    const pageInfo = document.getElementById('ep-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${this.currentPage} of ${totalPages} (${totalCount} records)`;

    const controls = document.getElementById('ep-pagination-controls');
    if (controls) {
      controls.innerHTML = `
        <button class="btn btn-secondary btn-sm" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="window.expensesPayment.changePage(${this.currentPage - 1})">Prev</button>
        <span style="font-weight: 700; font-size: 12px; margin: 0 6px;">${this.currentPage}</span>
        <button class="btn btn-secondary btn-sm" ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="window.expensesPayment.changePage(${this.currentPage + 1})">Next</button>
      `;
    }

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 13.5px;">
            🔍 No expense or payment transactions match the selected criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageItems.map(t => {
      // Classification styling
      let classBadge = 'badge-neutral';
      let amountColor = 'color: var(--text-main);';
      if (t.classification === 'OTHER') {
        classBadge = 'badge-info';
      } else if (t.classification === 'CA') {
        classBadge = 'badge-warning';
        amountColor = 'color: #f59e0b; font-weight: 700;';
      } else if (t.classification === 'SHORT') {
        classBadge = 'badge-danger';
        amountColor = 'color: #ef4444; font-weight: 700;';
      } else if (t.classification === 'PAYMENT') {
        classBadge = 'badge-success';
        amountColor = 'color: #10b981; font-weight: 700;';
      }

      // Verification Badge
      let verifyBadge = '<span class="badge badge-success" style="font-size: 10px;">VERIFIED</span>';
      if (t.verificationStatus === 'PENDING VERIFICATION') {
        verifyBadge = '<span class="badge badge-warning" style="font-size: 10px; background: rgba(245, 158, 11, 0.15); color: #f59e0b;">PENDING</span>';
      } else if (t.verificationStatus === 'REJECTED') {
        verifyBadge = '<span class="badge badge-danger" style="font-size: 10px;">REJECTED</span>';
      }

      // Collector Rule: Collectors NEVER have Booth Codes
      const isCollector = (t.role || '').toUpperCase() === 'COLLECTOR';
      const displayBooth = isCollector ? '-' : (t.boothCode || '-');

      const isPersonnel = t.employeeId && (t.classification === 'CA' || t.classification === 'SHORT' || t.classification === 'PAYMENT' || isCollector);

      return `
        <tr style="cursor: ${isPersonnel ? 'pointer' : 'default'};" onclick="${isPersonnel ? `window.expensesPayment.openPersonnelDrilldown('${t.employeeId}')` : ''}">
          <td style="font-family: monospace; font-size: 12px; font-weight: 700; color: var(--text-muted);">${t.date}</td>
          <td style="text-align: right; ${amountColor} font-size: 13.5px;">₱${Number(t.amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge ${classBadge}" style="font-size: 10px; padding: 2px 6px;">${t.classification}</span>
              <strong style="color: var(--text-main); font-size: 12.5px;">${t.description}</strong>
            </div>
            ${t.applyToCA && t.classification === 'PAYMENT' ? '<span style="font-size: 10.5px; color: #10b981; font-weight: 600;">✓ Applied to CA</span>' : ''}
          </td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${t.name || '-'}</div>
            ${t.role ? `<span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${t.role}</span>` : ''}
          </td>
          <td style="text-align: center;">
            <code style="font-size: 12px; font-weight: 700; color: ${displayBooth !== '-' ? 'var(--primary)' : 'var(--text-dim)'};">${displayBooth}</code>
          </td>
          <td style="font-size: 12px; color: var(--text-main); font-weight: 600;">${t.location || '-'}</td>
          <td style="font-size: 12px; font-family: monospace; color: var(--text-muted);">${t.datePeriodCover || '-'}</td>
          <td style="font-size: 12px; color: var(--text-muted); max-width: 200px;">${t.note || '-'}</td>
          <td style="text-align: center;" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
              ${verifyBadge}
              <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 11px;" onclick="window.expensesPayment.openEditModal('${t.id}')" title="Edit Entry">✏️</button>
              <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 11px; color: #ef4444;" onclick="window.expensesPayment.deleteEntry('${t.id}')" title="Delete Entry">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  changePage(newPage) {
    this.currentPage = newPage;
    this.renderMainTable();
  }

  setClassificationFilter(val) {
    this.classificationFilter = val;
    this.currentPage = 1;
    this.renderMainTable();
  }

  setStatusFilter(val) {
    this.statusFilter = val;
    this.currentPage = 1;
    this.renderMainTable();
  }

  setSearchQuery(val) {
    this.searchQuery = val.trim();
    this.currentPage = 1;
    this.renderMainTable();
  }

  // =========================================================================
  // SUB-VIEW 2: DAILY PAYMENT MONITORING
  // Top 5 Metric Cards + Grouped Personnel Table
  // | EMPLOYEE | ROLE | CA | SHORT | PAYMENT | CA BALANCE |
  // =========================================================================
  renderDailyMonitoring() {
    const dateInput = document.getElementById('ep-daily-date-picker');
    if (dateInput && !dateInput.value) {
      dateInput.value = this.targetDailyDate;
    }
    const targetDate = (dateInput && dateInput.value) ? dateInput.value : this.targetDailyDate;
    this.targetDailyDate = targetDate;

    const data = window.appStore.getDailyPaymentMonitoring(targetDate);
    const summary = data.summary;

    // Update Top 5 Cards
    const cardCA = document.getElementById('ep-card-total-ca');
    const cardShort = document.getElementById('ep-card-total-short');
    const cardPay = document.getElementById('ep-card-total-pay');
    const cardNetCA = document.getElementById('ep-card-net-recovered');
    const cardBal = document.getElementById('ep-card-pending-ca-bal');

    if (cardCA) cardCA.textContent = `₱${summary.totalCA.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardShort) cardShort.textContent = `₱${summary.totalShort.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardPay) cardPay.textContent = `₱${summary.totalPayments.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardNetCA) cardNetCA.textContent = `₱${summary.netRecoveredCA.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardBal) cardBal.textContent = `₱${summary.pendingCABalance.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;

    const tbody = document.getElementById('ep-daily-monitoring-tbody');
    if (!tbody) return;

    if (data.records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 13.5px;">
            ℹ️ No personnel payment, advance, or shortage activity recorded on <strong>${targetDate}</strong>.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.records.map(rec => {
      const roleUpper = (rec.role || '').toUpperCase();
      let roleBadge = 'badge-info';
      if (roleUpper.includes('COLLECTOR')) roleBadge = 'badge-warning';
      else if (roleUpper.includes('RELIEVER')) roleBadge = 'badge-neutral';

      return `
        <tr style="cursor: pointer;" onclick="window.expensesPayment.openPersonnelDrilldown('${rec.employeeId}')">
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${rec.name}</div>
            <div style="font-size: 11px; font-family: monospace; color: var(--text-muted);">${rec.employeeId}</div>
          </td>
          <td>
            <span class="badge ${roleBadge}" style="font-size: 11px; font-weight: 700;">${rec.role}</span>
          </td>
          <td style="text-align: right; font-weight: 700; color: ${rec.ca > 0 ? '#f59e0b' : 'var(--text-dim)'};">
            ${rec.ca > 0 ? `₱${rec.ca.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}
          </td>
          <td style="text-align: right; font-weight: 700; color: ${rec.short > 0 ? '#ef4444' : 'var(--text-dim)'};">
            ${rec.short > 0 ? `₱${rec.short.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}
          </td>
          <td style="text-align: right; font-weight: 700; color: ${rec.payment > 0 ? '#10b981' : 'var(--text-dim)'};">
            ${rec.payment > 0 ? `₱${rec.payment.toLocaleString('en-PH', {minimumFractionDigits: 2})}` : '-'}
            ${rec.caAppliedPayment > 0 ? `<div style="font-size: 10px; color: #10b981;">(₱${rec.caAppliedPayment.toLocaleString('en-PH', {minimumFractionDigits: 2})} applied to CA)</div>` : ''}
          </td>
          <td style="text-align: right; font-weight: 800; font-size: 14px; color: ${rec.caBalance > 0 ? 'var(--primary)' : '#10b981'};">
            ₱${rec.caBalance.toLocaleString('en-PH', {minimumFractionDigits: 2})}
          </td>
          <td style="text-align: center;" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 10px; font-weight: 700;" onclick="window.expensesPayment.openPersonnelDrilldown('${rec.employeeId}')">
              🔍 Drilldown
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  onDailyDateChange(newDate) {
    this.targetDailyDate = newDate;
    this.renderDailyMonitoring();
  }

  // =========================================================================
  // SUB-VIEW 3: MONTHLY SUMMARY & EXPENSES
  // 1. OTHER General Operating Expenses Breakdown Table
  // 2. Personnel Category Totals (Collector, Teller, Reliever)
  // =========================================================================
  renderMonthlySummary() {
    const picker = document.getElementById('ep-monthly-picker');
    if (picker && !picker.value) picker.value = this.targetMonthlyDate;
    const yearMonth = (picker && picker.value) ? picker.value : this.targetMonthlyDate;
    this.targetMonthlyDate = yearMonth;

    const data = window.appStore.getMonthlySummary(yearMonth);

    // 1. Render OTHER Expenses Breakdown
    const otherTbody = document.getElementById('ep-monthly-other-tbody');
    const totalOtherEl = document.getElementById('ep-monthly-total-other');
    if (totalOtherEl) totalOtherEl.textContent = `₱${data.totalOtherExpenses.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;

    if (otherTbody) {
      const items = Object.entries(data.otherExpensesByType);
      if (items.length === 0) {
        otherTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted);">No operating expenses found for ${yearMonth}.</td></tr>`;
      } else {
        otherTbody.innerHTML = items.map(([desc, total]) => {
          const pct = data.totalOtherExpenses > 0 ? ((total / data.totalOtherExpenses) * 100).toFixed(1) : '0.0';
          return `
            <tr>
              <td style="font-weight: 700; color: var(--text-main); font-size: 13px;">${desc}</td>
              <td style="text-align: right; font-weight: 700; font-size: 13px; color: var(--primary);">₱${total.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
              <td style="text-align: right; font-size: 12px; color: var(--text-muted); font-weight: 600;">${pct}%</td>
            </tr>
          `;
        }).join('');
      }
    }

    // 2. Render Personnel Role Breakdown
    const roleTbody = document.getElementById('ep-monthly-role-tbody');
    if (roleTbody) {
      const roles = ['Collector', 'Teller', 'Reliever'];
      roleTbody.innerHTML = roles.map(role => {
        const rData = data.roleSummary[role] || { ca: 0, short: 0, payment: 0, caBalance: 0 };
        return `
          <tr>
            <td style="font-weight: 700; font-size: 13px; color: var(--text-main); text-transform: uppercase;">
              ${role}s
            </td>
            <td style="text-align: right; font-weight: 700; color: #f59e0b;">₱${rData.ca.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; font-weight: 700; color: #ef4444;">₱${rData.short.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; font-weight: 700; color: #10b981;">₱${rData.payment.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; font-weight: 800; font-size: 14px; color: var(--primary);">₱${rData.caBalance.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
          </tr>
        `;
      }).join('');
    }
  }

  onMonthlyDateChange(newVal) {
    this.targetMonthlyDate = newVal;
    this.renderMonthlySummary();
  }

  // =========================================================================
  // SUB-VIEW 4: TRANSACTION LOG (Financial Ledger)
  // Focused on CA, SHORT, PAYMENT movements with running balance
  // =========================================================================
  renderTransactionLog() {
    const tbody = document.getElementById('ep-txn-log-tbody');
    if (!tbody) return;

    const txns = window.appStore.getTransactions()
      .filter(t => t.classification === 'CA' || t.classification === 'SHORT' || t.classification === 'PAYMENT');

    if (txns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">No personnel financial transactions logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = txns.map(t => {
      let classBadge = 'badge-info';
      if (t.classification === 'CA') classBadge = 'badge-warning';
      if (t.classification === 'SHORT') classBadge = 'badge-danger';
      if (t.classification === 'PAYMENT') classBadge = 'badge-success';

      const caBal = window.appStore.getEmployeeCABalance(t.employeeId, t.date);

      return `
        <tr>
          <td style="font-family: monospace; font-size: 12px;">${t.id}</td>
          <td style="font-family: monospace; font-size: 12px; font-weight: 600;">${t.date}</td>
          <td><span class="badge ${classBadge}" style="font-weight: 700; font-size: 10.5px;">${t.classification}</span></td>
          <td>
            <strong style="color: var(--text-main); font-size: 12.5px;">${t.name}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${t.role} • ${t.employeeId}</div>
          </td>
          <td>${t.description}</td>
          <td style="text-align: right; font-weight: 700; font-size: 13px;">₱${Number(t.amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
          <td style="text-align: center;">
            ${t.classification === 'PAYMENT' ? (t.applyToCA ? '<span class="badge badge-success" style="font-size: 10px;">YES (-CA)</span>' : '<span class="badge badge-neutral" style="font-size: 10px;">NO</span>') : '-'}
          </td>
          <td style="text-align: right; font-weight: 800; font-size: 13px; color: var(--primary);">₱${caBal.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // SUB-VIEW 5: OCR DOCUMENT ARCHIVE
  // =========================================================================
  renderOcrArchive() {
    const tbody = document.getElementById('ep-ocr-archive-tbody');
    if (!tbody) return;

    const docs = window.appStore.getOcrDocuments();
    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">No OCR documents archived yet. Upload yellow pad or receipt scans to view archive.</td></tr>`;
      return;
    }

    tbody.innerHTML = docs.map(d => `
      <tr>
        <td><code>${d.id}</code></td>
        <td style="font-weight: 700; color: var(--text-main);">${d.filename}</td>
        <td style="font-family: monospace; font-size: 12px;">${d.reportDate}</td>
        <td style="font-family: monospace; font-size: 11.5px; color: var(--text-muted);">${d.uploadedAt}</td>
        <td style="text-align: center;"><span class="badge badge-info" style="font-weight: 700;">${d.itemsCount} Items</span></td>
        <td style="text-align: center;"><span class="badge badge-success" style="font-weight: 700;">${d.status}</span></td>
        <td style="text-align: center;">
          <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 3px 8px;" onclick="window.expensesPayment.viewOcrSnapshot('${d.id}')">
            👁️ View Snapshot
          </button>
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // PERSONNEL FINANCIAL PROFILE DRILLDOWN MODAL
  // =========================================================================
  openPersonnelDrilldown(employeeId) {
    if (!employeeId) return;
    if (window.sfx) window.sfx.playClick();

    const store = window.appStore;
    const allStaff = [...store.getEmployees(), ...(store.data.relievers || [])];
    const staff = allStaff.find(s => s.id === employeeId || s.name.toLowerCase() === employeeId.toLowerCase());

    const summary = store.getEmployeeSummary(employeeId);

    const nameEl = document.getElementById('ep-drill-name');
    const idEl = document.getElementById('ep-drill-id');
    const roleEl = document.getElementById('ep-drill-role');
    const boothEl = document.getElementById('ep-drill-booth');
    const locEl = document.getElementById('ep-drill-location');

    const cardCA = document.getElementById('ep-drill-ca-total');
    const cardPay = document.getElementById('ep-drill-pay-total');
    const cardBal = document.getElementById('ep-drill-ca-balance');
    const cardShort = document.getElementById('ep-drill-short-total');

    const roleName = staff ? staff.role : 'Personnel';
    const isCollector = roleName.toUpperCase() === 'COLLECTOR';

    if (nameEl) nameEl.textContent = staff ? staff.name : employeeId;
    if (idEl) idEl.textContent = staff ? staff.id : employeeId;
    if (roleEl) roleEl.textContent = roleName;
    if (boothEl) boothEl.textContent = isCollector ? 'NONE (Collector Rule)' : (staff ? staff.boothCode || '-' : '-');
    if (locEl) locEl.textContent = staff ? (staff.municipality || staff.address || '-') : '-';

    if (cardCA) cardCA.textContent = `₱${summary.totalCA.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardPay) cardPay.textContent = `₱${summary.caAppliedPayments.toLocaleString('en-PH', {minimumFractionDigits: 2})} (of ₱${summary.totalPayments.toLocaleString('en-PH', {minimumFractionDigits: 2})})`;
    if (cardBal) cardBal.textContent = `₱${summary.currentCABalance.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    if (cardShort) cardShort.textContent = `₱${summary.totalShort.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;

    const tbody = document.getElementById('ep-drill-ledger-tbody');
    if (tbody) {
      if (summary.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No recorded transactions for this personnel.</td></tr>`;
      } else {
        // Calculate running CA balance
        let running = 0;
        const sorted = [...summary.transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        tbody.innerHTML = sorted.map(t => {
          let classBadge = 'badge-info';
          if (t.classification === 'CA') {
            classBadge = 'badge-warning';
            running += Number(t.amount);
          } else if (t.classification === 'SHORT') {
            classBadge = 'badge-danger';
            // SHORT does NOT change running CA balance
          } else if (t.classification === 'PAYMENT') {
            classBadge = 'badge-success';
            if (t.applyToCA) running -= Number(t.amount);
          }

          return `
            <tr>
              <td style="font-family: monospace; font-size: 11.5px;">${t.date}</td>
              <td><span class="badge ${classBadge}" style="font-size: 10px; font-weight: 700;">${t.classification}</span></td>
              <td style="font-size: 12px; font-weight: 600;">${t.description}</td>
              <td style="text-align: right; font-weight: 700; font-size: 12.5px;">₱${Number(t.amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
              <td style="text-align: center; font-size: 11px;">
                ${t.classification === 'PAYMENT' ? (t.applyToCA ? '<span style="color: #10b981; font-weight: 700;">YES</span>' : '<span style="color: var(--text-muted);">NO</span>') : '-'}
              </td>
              <td style="text-align: right; font-weight: 800; font-size: 13px; color: var(--primary);">₱${Math.max(0, running).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
              <td style="font-size: 11.5px; color: var(--text-muted);">${t.note || '-'}</td>
            </tr>
          `;
        }).join('');
      }
    }

    document.getElementById('modal-ep-drilldown').classList.add('active');
  }

  // =========================================================================
  // OCR RECOGNITION & EXTRACTION MODAL WORKFLOW
  // =========================================================================
  openOcrWorkflowModal() {
    if (window.sfx) window.sfx.playClick();
    const modal = document.getElementById('modal-ep-ocr');
    if (!modal) return;

    // Reset review container
    document.getElementById('ep-ocr-review-section').style.display = 'none';
    document.getElementById('ep-ocr-upload-section').style.display = 'block';
    modal.classList.add('active');
  }

  // Load the Realistic Yellow Pad Reference (Image 1) and Run Recognition
  loadYellowPadSample() {
    if (window.sfx) window.sfx.playClick();
    const canvas = window.ocrEngine.generateYellowPadSampleCanvas();
    this.processOcrImage(canvas, 'Yellow_Pad_Ledger_2024-09-06.jpg');
  }

  handleOcrFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.processOcrImage(img, file.name);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async processOcrImage(imgSource, filename) {
    const progressEl = document.getElementById('ep-ocr-progress-container');
    const progressBar = document.getElementById('ep-ocr-progress-bar');
    const progressText = document.getElementById('ep-ocr-progress-text');

    if (progressEl) progressEl.style.display = 'block';
    if (progressBar) progressBar.style.width = '20%';
    if (progressText) progressText.textContent = 'Pre-processing document image (Binarization & Contrast)...';

    setTimeout(async () => {
      try {
        if (progressBar) progressBar.style.width = '60%';
        if (progressText) progressText.textContent = 'Executing handwriting OCR and text segmentation...';

        // Preprocess image
        const processed = window.ocrEngine.preprocessImage(imgSource);

        // Run OCR Engine
        const ocrRes = await window.ocrEngine.recognize(processed, (pct) => {
          if (progressBar) progressBar.style.width = `${Math.min(95, pct)}%`;
          if (progressText) progressText.textContent = `Recognizing text: ${pct}%...`;
        });

        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'Smart Field Extraction & System Sync Complete!';

        setTimeout(() => {
          if (progressEl) progressEl.style.display = 'none';
          this.displayOcrReview(ocrRes, filename, processed);
        }, 300);

      } catch (err) {
        console.error('OCR Processing error:', err);
        if (progressEl) progressEl.style.display = 'none';
        alert('OCR Processing failed. Please check the image format and try again.');
      }
    }, 250);
  }

  displayOcrReview(ocrRes, filename, processedCanvas) {
    const reportData = ocrRes.reportData || {};
    const items = reportData.items || [];
    this.pendingOcrItems = JSON.parse(JSON.stringify(items));

    // Calculate total expenses and payments
    let totalExp = 0;
    let totalPay = 0;
    items.forEach(i => {
      if (i.classification === 'OTHER' || i.classification === 'CA') totalExp += Number(i.amount);
      if (i.classification === 'PAYMENT') totalPay += Number(i.amount);
    });

    this.pendingOcrMetadata = {
      filename: filename,
      reportDate: reportData.date || '2024-09-06',
      fingerprint: `fp_${filename}_${totalExp}`,
      rawTextSnapshot: ocrRes.rawText || '',
      itemsCount: items.length,
      totalExpenses: totalExp,
      totalPayments: totalPay
    };

    // Check for Duplicate Document
    const isDup = window.appStore.checkDuplicateDocument(
      this.pendingOcrMetadata.fingerprint,
      filename,
      this.pendingOcrMetadata.reportDate,
      totalExp
    );

    if (isDup) {
      if (window.sfx) window.sfx.playAlert();
      document.getElementById('modal-ep-duplicate').classList.add('active');
      return;
    }

    this.showOcrReviewUI(processedCanvas);
  }

  showOcrReviewUI(processedCanvas) {
    document.getElementById('ep-ocr-upload-section').style.display = 'none';
    const reviewSection = document.getElementById('ep-ocr-review-section');
    reviewSection.style.display = 'block';

    // Image preview
    const previewContainer = document.getElementById('ep-ocr-preview-container');
    if (previewContainer && processedCanvas) {
      previewContainer.innerHTML = '';
      processedCanvas.style.maxWidth = '100%';
      processedCanvas.style.height = 'auto';
      processedCanvas.style.borderRadius = '6px';
      processedCanvas.style.border = '1px solid var(--border-color)';
      previewContainer.appendChild(processedCanvas);
    }

    // Raw text pane
    const rawPane = document.getElementById('ep-ocr-raw-pane');
    if (rawPane && this.pendingOcrMetadata) {
      rawPane.textContent = this.pendingOcrMetadata.rawTextSnapshot;
    }

    this.renderPendingOcrItemsTable();
  }

  renderPendingOcrItemsTable() {
    const tbody = document.getElementById('ep-ocr-items-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.pendingOcrItems.map((item, idx) => {
      const isPayment = item.classification === 'PAYMENT';
      const isCollector = (item.role || '').toUpperCase() === 'COLLECTOR';

      return `
        <tr>
          <td style="font-size: 11px; font-family: monospace;">${item.ocrRawText || item.description}</td>
          <td>
            <select class="form-select" style="padding: 2px 6px; font-size: 11px; font-weight: 700;" onchange="window.expensesPayment.updatePendingItem(${idx}, 'classification', this.value)">
              <option value="OTHER" ${item.classification === 'OTHER' ? 'selected' : ''}>OTHER</option>
              <option value="CA" ${item.classification === 'CA' ? 'selected' : ''}>CASH ADVANCE (CA)</option>
              <option value="SHORT" ${item.classification === 'SHORT' ? 'selected' : ''}>SHORT</option>
              <option value="PAYMENT" ${item.classification === 'PAYMENT' ? 'selected' : ''}>PAYMENT</option>
            </select>
          </td>
          <td>
            <input type="number" step="0.01" class="form-input" style="padding: 3px 6px; font-size: 12px; font-weight: 700; width: 90px; text-align: right;" value="${item.amount}" onchange="window.expensesPayment.updatePendingItem(${idx}, 'amount', parseFloat(this.value))">
          </td>
          <td>
            <input type="text" class="form-input" style="padding: 3px 6px; font-size: 11.5px; width: 150px;" value="${item.name || ''}" placeholder="Staff Name" onchange="window.expensesPayment.updatePendingItem(${idx}, 'name', this.value)">
          </td>
          <td>
            <input type="text" class="form-input" style="padding: 3px 6px; font-size: 11.5px; width: 80px;" value="${isCollector ? '' : (item.boothCode || '')}" ${isCollector ? 'disabled placeholder="No Booth"' : 'placeholder="Booth Code"'} onchange="window.expensesPayment.updatePendingItem(${idx}, 'boothCode', this.value)">
          </td>
          <td style="text-align: center;">
            ${isPayment ? `
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <label style="font-size: 11px; font-weight: 700; cursor: pointer; color: ${item.applyToCA ? '#10b981' : 'var(--text-muted)'};">
                  <input type="checkbox" ${item.applyToCA ? 'checked' : ''} onchange="window.expensesPayment.updatePendingItem(${idx}, 'applyToCA', this.checked)">
                  Apply to CA?
                </label>
              </div>
            ` : `<span style="font-size: 11px; color: var(--text-dim);">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  updatePendingItem(idx, field, val) {
    if (this.pendingOcrItems[idx]) {
      this.pendingOcrItems[idx][field] = val;
      if (field === 'classification' && val === 'PAYMENT') {
        this.pendingOcrItems[idx].applyToCA = true;
      }
      this.renderPendingOcrItemsTable();
    }
  }

  // Save OCR Copy (Snapshot archive only, without committing)
  saveOcrCopyOnly() {
    if (!this.pendingOcrMetadata) return;
    if (window.sfx) window.sfx.playChime();

    const doc = {
      id: `DOC-SNAP-${Date.now().toString().slice(-6)}`,
      filename: this.pendingOcrMetadata.filename,
      uploadedAt: new Date().toLocaleString(),
      reportDate: this.pendingOcrMetadata.reportDate,
      fingerprint: this.pendingOcrMetadata.fingerprint,
      rawTextSnapshot: this.pendingOcrMetadata.rawTextSnapshot,
      itemsCount: this.pendingOcrItems.length,
      status: 'OCR_SNAPSHOT_SAVED',
      totalExpenses: this.pendingOcrMetadata.totalExpenses,
      totalPayments: this.pendingOcrMetadata.totalPayments
    };

    window.appStore.addOcrDocument(doc);
    window.appStore.addAuditLog({
      eventType: 'OCR_SNAPSHOT_SAVED',
      user: 'PJC (Supervisor)',
      details: `Saved immutable OCR snapshot for ${doc.filename}`,
      recordId: doc.id
    });

    alert('✅ OCR Copy & Raw Interpretation Snapshot saved to Document Archive!');
    window.closeModals();
    this.switchTab('tab-ocr-archive');
  }

  // Approve & Verify into System
  approveAndVerifyOcrItems() {
    if (!this.pendingOcrItems || this.pendingOcrItems.length === 0) {
      alert('No items to verify.');
      return;
    }

    if (window.sfx) window.sfx.playChime();

    const store = window.appStore;
    const docId = `DOC-YPAD-${Date.now().toString().slice(-6)}`;

    // 1. Archive OCR Document
    if (this.pendingOcrMetadata) {
      store.addOcrDocument({
        id: docId,
        filename: this.pendingOcrMetadata.filename,
        uploadedAt: new Date().toLocaleString(),
        reportDate: this.pendingOcrMetadata.reportDate,
        fingerprint: this.pendingOcrMetadata.fingerprint,
        rawTextSnapshot: this.pendingOcrMetadata.rawTextSnapshot,
        itemsCount: this.pendingOcrItems.length,
        status: 'VERIFIED',
        totalExpenses: this.pendingOcrMetadata.totalExpenses,
        totalPayments: this.pendingOcrMetadata.totalPayments
      });
    }

    // 2. Insert transactions into store
    this.pendingOcrItems.forEach((item, i) => {
      const isCollector = (item.role || '').toUpperCase() === 'COLLECTOR';
      const txn = {
        id: `TXN-${Date.now().toString().slice(-4)}-${i + 1}`,
        date: item.date || this.pendingOcrMetadata.reportDate || '2024-09-06',
        amount: Number(item.amount),
        description: item.description,
        name: item.name || '-',
        employeeId: item.employeeId || 'DDN005-GEN',
        role: item.role || 'General',
        boothCode: isCollector ? '' : (item.boothCode || ''),
        location: item.location || 'Davao Del Norte',
        datePeriodCover: item.datePeriodCover || '-',
        note: item.note || 'Verified from OCR extraction',
        classification: item.classification || 'OTHER',
        applyToCA: item.applyToCA === true,
        verificationStatus: 'VERIFIED',
        ocrDocId: docId,
        ocrRawText: item.ocrRawText || item.description
      };
      store.addTransaction(txn);
    });

    store.addAuditLog({
      eventType: 'OCR_BATCH_VERIFIED',
      user: 'PJC (Supervisor)',
      details: `Batch approved & verified ${this.pendingOcrItems.length} transactions from OCR extraction`,
      recordId: docId
    });

    alert(`🎉 Successfully approved and verified ${this.pendingOcrItems.length} transactions into system master ledger!`);
    window.closeModals();
    this.switchTab('tab-main-table');
  }

  // Duplicate Modal Handlers
  proceedDuplicateOcr() {
    document.getElementById('modal-ep-duplicate').classList.remove('active');
    this.showOcrReviewUI(null);
  }

  cancelDuplicateOcr() {
    document.getElementById('modal-ep-duplicate').classList.remove('active');
    window.closeModals();
  }

  // View OCR Snapshot from Archive
  viewOcrSnapshot(docId) {
    const doc = window.appStore.getOcrDocuments().find(d => d.id === docId);
    if (!doc) return;
    alert(`📄 OCR Snapshot for ${doc.filename}\nReport Date: ${doc.reportDate}\nStatus: ${doc.status}\n\nRaw Text:\n${doc.rawTextSnapshot.slice(0, 500)}...`);
  }

  // =========================================================================
  // MANUAL ADD & EDIT TRANSACTION MODAL
  // =========================================================================
  openAddModal() {
    if (window.sfx) window.sfx.playClick();
    this.editingTransactionId = null;
    document.getElementById('ep-form-title').textContent = 'Record Financial Transaction';

    const empSelect = document.getElementById('ep-form-emp');
    const allStaff = [...window.appStore.getEmployees(), ...(window.appStore.data.relievers || [])];
    empSelect.innerHTML = `
      <option value="">-- Select Personnel (or leave for General) --</option>
      ${allStaff.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('')}
    `;

    document.getElementById('ep-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ep-form-amount').value = '';
    document.getElementById('ep-form-desc').value = '';
    document.getElementById('ep-form-class').value = 'OTHER';
    document.getElementById('ep-form-booth').value = '';
    document.getElementById('ep-form-loc').value = '';
    document.getElementById('ep-form-cover').value = '';
    document.getElementById('ep-form-note').value = '';
    document.getElementById('ep-form-apply-ca').checked = false;

    this.onFormClassChange();
    document.getElementById('modal-ep-form').classList.add('active');
  }

  openEditModal(id) {
    if (window.sfx) window.sfx.playClick();
    const txn = window.appStore.getTransactions().find(t => t.id === id);
    if (!txn) return;

    this.editingTransactionId = id;
    document.getElementById('ep-form-title').textContent = `Edit Transaction (${id})`;

    const empSelect = document.getElementById('ep-form-emp');
    const allStaff = [...window.appStore.getEmployees(), ...(window.appStore.data.relievers || [])];
    empSelect.innerHTML = `
      <option value="">-- Select Personnel (or leave for General) --</option>
      ${allStaff.map(s => `<option value="${s.id}" ${s.id === txn.employeeId ? 'selected' : ''}>${s.name} (${s.role})</option>`).join('')}
    `;

    document.getElementById('ep-form-date').value = txn.date || '';
    document.getElementById('ep-form-amount').value = txn.amount || '';
    document.getElementById('ep-form-desc').value = txn.description || '';
    document.getElementById('ep-form-class').value = txn.classification || 'OTHER';
    document.getElementById('ep-form-booth').value = txn.boothCode || '';
    document.getElementById('ep-form-loc').value = txn.location || '';
    document.getElementById('ep-form-cover').value = txn.datePeriodCover || '';
    document.getElementById('ep-form-note').value = txn.note || '';
    document.getElementById('ep-form-apply-ca').checked = txn.applyToCA === true;

    this.onFormClassChange();
    document.getElementById('modal-ep-form').classList.add('active');
  }

  onFormClassChange() {
    const classVal = document.getElementById('ep-form-class').value;
    const applyCaContainer = document.getElementById('ep-form-apply-ca-container');
    if (applyCaContainer) {
      applyCaContainer.style.display = (classVal === 'PAYMENT') ? 'block' : 'none';
    }

    // Role check for Collector rule
    this.onFormEmpChange();
  }

  onFormEmpChange() {
    const empId = document.getElementById('ep-form-emp').value;
    const boothInput = document.getElementById('ep-form-booth');
    const locInput = document.getElementById('ep-form-loc');
    const allStaff = [...window.appStore.getEmployees(), ...(window.appStore.data.relievers || [])];
    const staff = allStaff.find(s => s.id === empId);

    if (staff) {
      const isCollector = (staff.role || '').toUpperCase() === 'COLLECTOR';
      if (isCollector) {
        boothInput.value = '';
        boothInput.disabled = true;
        boothInput.placeholder = 'N/A (Collector Rule: No Booth Code)';
      } else {
        boothInput.disabled = false;
        boothInput.placeholder = 'e.g. DDN-762';
        if (!boothInput.value) boothInput.value = staff.boothCode || '';
      }
      if (!locInput.value) {
        locInput.value = staff.municipality || staff.address || '';
      }
    } else {
      boothInput.disabled = false;
      boothInput.placeholder = 'e.g. DDN-762';
    }
  }

  saveTransactionForm() {
    const amount = parseFloat(document.getElementById('ep-form-amount').value);
    const desc = document.getElementById('ep-form-desc').value.trim();
    const date = document.getElementById('ep-form-date').value;
    const classification = document.getElementById('ep-form-class').value;
    const empId = document.getElementById('ep-form-emp').value;

    if (!amount || isNaN(amount) || !desc || !date) {
      alert('Please fill in Date, Amount, and Description.');
      return;
    }

    const allStaff = [...window.appStore.getEmployees(), ...(window.appStore.data.relievers || [])];
    const staff = allStaff.find(s => s.id === empId);
    const isCollector = staff ? (staff.role || '').toUpperCase() === 'COLLECTOR' : false;

    const payload = {
      date: date,
      amount: amount,
      description: desc,
      classification: classification,
      employeeId: empId || (staff ? staff.id : 'DDN005-GEN'),
      name: staff ? staff.name : (empId ? empId : 'General Operating'),
      role: staff ? staff.role : 'General',
      boothCode: isCollector ? '' : (document.getElementById('ep-form-booth').value.trim()),
      location: document.getElementById('ep-form-loc').value.trim() || 'Davao Del Norte',
      datePeriodCover: document.getElementById('ep-form-cover').value.trim() || date,
      note: document.getElementById('ep-form-note').value.trim() || '-',
      applyToCA: classification === 'PAYMENT' ? document.getElementById('ep-form-apply-ca').checked : false,
      verificationStatus: 'VERIFIED'
    };

    if (this.editingTransactionId) {
      window.appStore.updateTransaction(this.editingTransactionId, payload);
    } else {
      window.appStore.addTransaction(payload);
    }

    if (window.sfx) window.sfx.playChime();
    window.closeModals();
    this.renderCurrentTab();
  }

  deleteEntry(id) {
    if (confirm(`Are you sure you want to delete transaction ${id}?`)) {
      if (window.sfx) window.sfx.playClick();
      window.appStore.deleteTransaction(id);
      this.renderCurrentTab();
    }
  }

  // =========================================================================
  // EXPORT TO EXCEL (Accounting Spreadsheet via ExcelJS)
  // =========================================================================
  async exportToExcel() {
    if (typeof ExcelJS === 'undefined') {
      alert('Excel export engine is initializing. Please retry in a few seconds.');
      return;
    }

    if (window.sfx) window.sfx.playClick();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'APEX OmniERP - Expenses & Payment Engine';
    workbook.created = new Date();

    // Sheet 1: Main Expenses & Payment
    const sheet1 = workbook.addWorksheet('Expenses & Payment', {
      views: [{ showGridLines: true }]
    });

    sheet1.columns = [
      { header: 'DATE', key: 'date', width: 14 },
      { header: 'AMOUNT (PHP)', key: 'amount', width: 18 },
      { header: 'CLASSIFICATION', key: 'class', width: 16 },
      { header: 'DESCRIPTION', key: 'desc', width: 35 },
      { header: 'NAME', key: 'name', width: 25 },
      { header: 'BOOTH CODE', key: 'booth', width: 16 },
      { header: 'LOCATION', key: 'loc', width: 22 },
      { header: 'DATE PERIOD COVER', key: 'cover', width: 22 },
      { header: 'NOTE', key: 'note', width: 30 },
      { header: 'STATUS', key: 'status', width: 14 }
    ];

    // Style headers
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };

    const txns = window.appStore.getTransactions();
    txns.forEach(t => {
      const isCollector = (t.role || '').toUpperCase() === 'COLLECTOR';
      const row = sheet1.addRow({
        date: t.date,
        amount: Number(t.amount),
        class: t.classification,
        desc: t.description,
        name: t.name,
        booth: isCollector ? '' : (t.boothCode || ''),
        loc: t.location,
        cover: t.datePeriodCover,
        note: t.note,
        status: t.verificationStatus
      });
      row.getCell('amount').numFmt = '₱#,##0.00';
    });

    // Sheet 2: Daily Payment Monitoring Summary
    const sheet2 = workbook.addWorksheet('Daily Payment Monitoring');
    sheet2.columns = [
      { header: 'EMPLOYEE', key: 'name', width: 25 },
      { header: 'ROLE', key: 'role', width: 16 },
      { header: 'CASH ADVANCE (CA)', key: 'ca', width: 20 },
      { header: 'SHORT', key: 'short', width: 18 },
      { header: 'PAYMENT', key: 'pay', width: 18 },
      { header: 'RUNNING CA BALANCE', key: 'bal', width: 22 }
    ];

    sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet2.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }
    };

    const daily = window.appStore.getDailyPaymentMonitoring(this.targetDailyDate);
    daily.records.forEach(r => {
      const row = sheet2.addRow({
        name: r.name,
        role: r.role,
        ca: r.ca,
        short: r.short,
        pay: r.payment,
        bal: r.caBalance
      });
      row.getCell('ca').numFmt = '₱#,##0.00';
      row.getCell('short').numFmt = '₱#,##0.00';
      row.getCell('pay').numFmt = '₱#,##0.00';
      row.getCell('bal').numFmt = '₱#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Expenses_and_Payment_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Open Technical Audit History Modal
  openAuditModal() {
    if (window.sfx) window.sfx.playClick();
    const tbody = document.getElementById('ep-audit-tbody');
    if (tbody) {
      const logs = window.appStore.getAuditLogs();
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-family: monospace; font-size: 11.5px;">${l.timestamp}</td>
          <td><span class="badge badge-info" style="font-size: 10px;">${l.eventType}</span></td>
          <td style="font-weight: 600; font-size: 12px;">${l.user}</td>
          <td style="font-size: 12px;">${l.details}</td>
          <td style="font-family: monospace; font-size: 11px;"><code>${l.recordId || '-'}</code></td>
        </tr>
      `).join('');
    }
    document.getElementById('modal-ep-audit').classList.add('active');
  }
}

window.expensesPayment = new ExpensesPaymentController();
