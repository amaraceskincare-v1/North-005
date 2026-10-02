/**
 * NORTH-005 OmniERP — Employee Documents & Compliance Repository Module
 * Master Registry Synchronization (Searchable Employee Selector),
 * 3 Document Types Only (RESUME, PHOTOCOPY OF VALID ID, BARANGAY CLEARANCE/POLICE CLEARANCE),
 * 3 Separate Image Upload Fields with Live Previews & Base64 storage,
 * Upload & Replace Confirmation Modals, Expiry tracking, and Filtering.
 */

(function () {
  'use strict';

  const DOCS_STORAGE_KEY = 'north005_employee_documents_v4';

  class EmployeeDocumentsModule {
    constructor() {
      this.searchQuery = '';
      this.typeFilter = 'all';
      this.statusFilter = 'all';
      this.activeKpiTab = 'all'; // 'all', 'Complete', 'Expiring Soon', 'Expired', 'Missing'

      // Pagination
      this.currentPage = 1;
      this.pageSize = 10;

      // Pending upload state (for confirmation and replace modals)
      this.pendingUpload = {
        employeeId: null,
        employeeName: null,
        employeeRole: null,
        documentType: 'RESUME',
        fileName: null,
        fileSize: null,
        fileDataUrl: null,
        dateUploaded: null,
        expiryDate: null,
        notes: null
      };

      // Temporary in-modal file buffer for the 3 fields
      this.fileBuffers = {
        'RESUME': null,
        'PHOTOCOPY OF VALID ID': null,
        'BARANGAY CLEARANCE/POLICE CLEARANCE': null
      };

      this.documents = this.loadDocuments();
    }

    init() {
      this.syncWithEmployees();
      this.populateDatalist();
      this.render();

      // Close employee search dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.searchable-select-wrapper');
        const results = document.getElementById('doc-emp-search-results');
        if (wrapper && results && !wrapper.contains(e.target)) {
          results.classList.remove('active');
        }
      });
    }

    loadDocuments() {
      try {
        const stored = localStorage.getItem(DOCS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch (e) {
        return [];
      }
    }

    saveDocuments() {
      localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(this.documents));
    }

    getEmployees() {
      const store = window.appStore;
      if (!store) return [];
      const emps = (typeof store.getEmployees === 'function') ? store.getEmployees() : (store.data ? (store.data.employees || []) : []);
      return emps.filter(e => e && e.name && !e.name.includes('Buffer Reliever'));
    }

    populateDatalist() {
      const datalist = document.getElementById('docs-search-datalist');
      if (!datalist) return;
      const emps = this.getEmployees();
      datalist.innerHTML = emps.map(e => `
        <option value="${e.name}">
        <option value="${e.id}">
        <option value="${e.role || ''}">
      `).concat([
        '<option value="RESUME">',
        '<option value="PHOTOCOPY OF VALID ID">',
        '<option value="BARANGAY CLEARANCE/POLICE CLEARANCE">'
      ]).join('');
    }

    syncWithEmployees() {
      const emps = this.getEmployees();

      if (this.documents.length === 0 && emps.length > 0) {
        const docTypes = [
          'RESUME',
          'PHOTOCOPY OF VALID ID',
          'BARANGAY CLEARANCE/POLICE CLEARANCE'
        ];

        const seeded = [];
        emps.forEach((emp, idx) => {
          const type = docTypes[idx % docTypes.length];
          let status = 'Complete';
          let expDate = '2027-08-15';
          let fileName = `${emp.id}_${type.replace(/[\/\s]+/g, '_')}.png`;

          if (idx % 7 === 0) {
            status = 'Expiring Soon';
            expDate = '2026-10-20'; // within 30 days of 2026-09-30
          } else if (idx % 13 === 0) {
            status = 'Expired';
            expDate = '2026-08-15'; // before 2026-09-30
          } else if (idx % 17 === 0) {
            status = 'Missing';
            expDate = '—';
            fileName = null;
          }

          seeded.push({
            id: `DOC-${emp.id}-${idx}`,
            employeeId: emp.id,
            employeeName: emp.name,
            position: emp.role || 'Sales Representative',
            documentType: type,
            status,
            dateUploaded: status === 'Missing' ? '—' : '2026-01-15',
            expiryDate: expDate,
            fileName,
            fileDataUrl: null,
            notes: status === 'Missing' ? 'Required compliance record pending physical submission' : 'Verified official document on file.'
          });
        });

        this.documents = seeded;
        this.saveDocuments();
      }
    }

    setKpiTab(tabKey) {
      this.activeKpiTab = tabKey;
      this.currentPage = 1;

      // Update card active classes
      const cardMap = {
        'all': 'doc-tab-all',
        'Complete': 'doc-tab-valid',
        'Expiring Soon': 'doc-tab-expiring',
        'Expired': 'doc-tab-expired',
        'Missing': 'doc-tab-missing'
      };

      document.querySelectorAll('#view-employee-documents .kpi-card-tab').forEach(c => c.classList.remove('active'));
      const activeCard = document.getElementById(cardMap[tabKey]);
      if (activeCard) activeCard.classList.add('active');

      // Sync status dropdown
      const statusEl = document.getElementById('docs-filter-status');
      if (statusEl) {
        statusEl.value = tabKey === 'all' ? 'all' : tabKey;
        this.statusFilter = statusEl.value;
      }

      this.render();
    }

    filterDocuments() {
      const searchEl = document.getElementById('docs-search-input');
      const typeEl = document.getElementById('docs-filter-type');
      const statusEl = document.getElementById('docs-filter-status');

      if (searchEl) this.searchQuery = searchEl.value.trim().toLowerCase();
      if (typeEl) this.typeFilter = typeEl.value;
      if (statusEl) {
        this.statusFilter = statusEl.value;
        this.activeKpiTab = statusEl.value;
      }

      this.currentPage = 1;
      this.render();
    }

    setPage(page) {
      this.currentPage = page;
      this.render();
    }

    setPageSize(size) {
      this.pageSize = parseInt(size, 10) || 10;
      this.currentPage = 1;
      this.render();
    }

    render() {
      const tbody = document.getElementById('employee-documents-tbody');
      if (!tbody) return;

      const isAdmin = window.authManager && window.authManager.isAdmin();

      // Update upload button permissions
      const uploadBtns = document.querySelectorAll('.admin-only-action');
      uploadBtns.forEach(btn => {
        btn.style.display = isAdmin ? 'inline-flex' : 'none';
      });

      // Update KPI counters
      const totalDocs = this.documents.length;
      const validCount = this.documents.filter(d => d.status === 'Complete').length;
      const expiringCount = this.documents.filter(d => d.status === 'Expiring Soon').length;
      const expiredCount = this.documents.filter(d => d.status === 'Expired').length;
      const missingCount = this.documents.filter(d => d.status === 'Missing').length;

      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('kpi-docs-total', totalDocs);
      setTxt('kpi-docs-valid', validCount);
      setTxt('kpi-docs-expiring', expiringCount);
      setTxt('kpi-docs-expired', expiredCount);
      setTxt('kpi-docs-missing', missingCount);

      // Filter documents
      const filtered = this.documents.filter(doc => {
        // KPI Tab Filter
        if (this.activeKpiTab !== 'all' && doc.status !== this.activeKpiTab) {
          return false;
        }

        // Dropdown filters
        if (this.typeFilter !== 'all' && doc.documentType !== this.typeFilter) return false;
        if (this.statusFilter !== 'all' && doc.status !== this.statusFilter) return false;

        // Search Query
        if (this.searchQuery) {
          const target = `${doc.employeeName} ${doc.employeeId} ${doc.position} ${doc.documentType} ${doc.notes || ''}`.toLowerCase();
          if (!target.includes(this.searchQuery)) return false;
        }

        return true;
      });

      // Pagination Calculation
      const totalRecords = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalRecords / this.pageSize));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;

      const startIndex = (this.currentPage - 1) * this.pageSize;
      const endIndex = Math.min(startIndex + this.pageSize, totalRecords);
      const paginated = filtered.slice(startIndex, endIndex);

      this.renderPagination(totalRecords, totalPages);

      if (paginated.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
              <div style="font-size: 32px; margin-bottom: 8px; opacity: 0.6;">📁</div>
              <div style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">No Document Records Found</div>
              <div style="font-size: 12px;">No employee compliance records match your search query, filters, or active card tab.</div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = paginated.map(doc => {
        let badgeHtml = '';
        if (doc.status === 'Complete') {
          badgeHtml = `<span class="badge badge-success" style="padding:3px 8px;font-size:11px;">✓ Complete / Valid</span>`;
        } else if (doc.status === 'Expiring Soon') {
          badgeHtml = `<span class="badge badge-warning" style="background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid #f59e0b;padding:3px 8px;font-size:11px;font-weight:700;">⏰ Expiring Soon</span>`;
        } else if (doc.status === 'Expired') {
          badgeHtml = `<span class="badge badge-danger" style="padding:3px 8px;font-size:11px;">⚠️ Expired</span>`;
        } else {
          badgeHtml = `<span class="badge badge-neutral" style="background:rgba(239,68,68,0.12);color:#fca5a5;padding:3px 8px;font-size:11px;">❌ Missing</span>`;
        }

        const filePill = doc.fileName
          ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#60a5fa;background:rgba(96,165,250,0.1);padding:2px 8px;border-radius:4px;font-family:monospace;">🖼️ ${doc.fileName}</span>`
          : `<span style="font-size:11.5px;color:var(--text-muted);font-style:italic;">No attachment</span>`;

        let actionBtns = `
          <button class="btn btn-xs btn-secondary" onclick="window.employeeDocumentsModule.viewDocument('${doc.id}')" style="padding:3px 8px;font-size:11px;margin-right:4px;" title="View Document Info">
            👁️ View
          </button>
        `;

        if (isAdmin) {
          actionBtns += `
            <button class="btn btn-xs btn-secondary" onclick="window.employeeDocumentsModule.deleteDocument('${doc.id}')" style="color:#ef4444;padding:3px 8px;font-size:11px;" title="Delete Document Record">
              🗑️ Delete
            </button>
          `;
        }

        return `
          <tr>
            <td><code style="font-size:11.5px;color:var(--accent-gold);font-weight:700;">${doc.employeeId}</code></td>
            <td>
              <div style="font-weight: 700; color: var(--text-main); font-size: 13px;">${doc.employeeName}</div>
            </td>
            <td><div style="font-size: 12px;">${doc.position || 'Staff'}</div></td>
            <td><div style="font-size: 12px; font-weight: 700; color: #e2e8f0;">${doc.documentType}</div></td>
            <td style="text-align: center;">${badgeHtml}</td>
            <td style="font-size: 11.5px; color: var(--text-muted);">${doc.dateUploaded || '-'}</td>
            <td style="font-size: 11.5px; color: ${doc.status === 'Expired' ? '#f87171' : (doc.status === 'Expiring Soon' ? '#fbbf24' : 'var(--text-muted)')}; font-weight: ${doc.status === 'Expired' || doc.status === 'Expiring Soon' ? '700' : '400'};">
              ${doc.expiryDate || '—'}
            </td>
            <td>${filePill}</td>
            <td style="font-size: 11.5px; color: var(--text-muted); max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${doc.notes || '-'}
            </td>
            <td style="text-align: center; white-space: nowrap;">${actionBtns}</td>
          </tr>
        `;
      }).join('');
    }

    renderPagination(totalRecords, totalPages) {
      const container = document.getElementById('employee-documents-pagination');
      if (!container) return;

      let pagesHtml = '';
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
          pagesHtml += `
            <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" onclick="window.employeeDocumentsModule.setPage(${i})">
              ${i}
            </button>
          `;
        } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
          pagesHtml += `<span style="color:var(--text-muted);padding:0 2px;">...</span>`;
        }
      }

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:12px;color:var(--text-muted);font-weight:600;">
            Rows per page:
            <select class="form-select" onchange="window.employeeDocumentsModule.setPageSize(this.value)" style="padding:2px 8px;font-size:12px;width:auto;display:inline-block;margin-left:4px;">
              <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="15" ${this.pageSize === 15 ? 'selected' : ''}>15</option>
              <option value="20" ${this.pageSize === 20 ? 'selected' : ''}>20</option>
              <option value="25" ${this.pageSize === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:600;">
            Page ${this.currentPage} of ${totalPages} <span style="opacity:0.6;">(${totalRecords} documents)</span>
          </div>
        </div>
        <div class="pagination-controls">
          <button class="pagination-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="window.employeeDocumentsModule.setPage(${this.currentPage - 1})">
            Previous
          </button>
          ${pagesHtml}
          <button class="pagination-btn" ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="window.employeeDocumentsModule.setPage(${this.currentPage + 1})">
            Next
          </button>
        </div>
      `;
    }

    /* --- SEARCHABLE MASTER REGISTRY EMPLOYEE SELECTOR --- */
    handleEmpSearchInput(query) {
      this.renderEmpSearchResults(query);
    }

    showEmpDropdown() {
      const input = document.getElementById('doc-emp-search-input');
      this.renderEmpSearchResults(input ? input.value : '');
    }

    renderEmpSearchResults(filter = '') {
      const resultsContainer = document.getElementById('doc-emp-search-results');
      if (!resultsContainer) return;

      const emps = this.getEmployees();
      const q = (filter || '').trim().toLowerCase();

      const matched = emps.filter(e => {
        if (!q) return true;
        return e.name.toLowerCase().includes(q) ||
               e.id.toLowerCase().includes(q) ||
               (e.role || '').toLowerCase().includes(q) ||
               (e.boothCode || '').toLowerCase().includes(q);
      });

      if (matched.length === 0) {
        resultsContainer.innerHTML = `
          <div style="padding:10px 14px; font-size:12px; color:var(--text-muted);">
            No matching Master Registry staff found.
          </div>
        `;
        resultsContainer.classList.add('active');
        return;
      }

      resultsContainer.innerHTML = matched.slice(0, 30).map(e => `
        <div class="searchable-select-item" onclick="window.employeeDocumentsModule.selectEmployee('${e.id}')">
          <span>${e.id}</span> — <strong>${e.name}</strong> <small style="color:var(--text-muted);">(${e.role || 'Sales Rep'})</small>
        </div>
      `).join('');

      resultsContainer.classList.add('active');
    }

    selectEmployee(empId) {
      const emps = this.getEmployees();
      const emp = emps.find(e => e.id === empId);
      if (!emp) return;

      document.getElementById('doc-selected-emp-id').value = emp.id;
      document.getElementById('doc-selected-emp-name').value = emp.name;
      document.getElementById('doc-selected-emp-role').value = emp.role || 'Staff';

      document.getElementById('doc-badge-id').textContent = emp.id;
      document.getElementById('doc-badge-name').textContent = emp.name;
      document.getElementById('doc-badge-role').textContent = emp.role || 'Staff';

      document.getElementById('doc-selected-emp-badge').style.display = 'flex';
      document.getElementById('doc-emp-search-input').style.display = 'none';

      const resultsContainer = document.getElementById('doc-emp-search-results');
      if (resultsContainer) resultsContainer.classList.remove('active');
    }

    clearSelectedEmployee() {
      document.getElementById('doc-selected-emp-id').value = '';
      document.getElementById('doc-selected-emp-name').value = '';
      document.getElementById('doc-selected-emp-role').value = '';

      document.getElementById('doc-selected-emp-badge').style.display = 'none';
      const input = document.getElementById('doc-emp-search-input');
      if (input) {
        input.value = '';
        input.style.display = 'block';
        input.focus();
      }
    }

    /* --- THREE SEPARATE IMAGE UPLOAD FIELDS LOGIC --- */
    getFieldKey(docType) {
      if (docType === 'RESUME') return 'resume';
      if (docType === 'PHOTOCOPY OF VALID ID') return 'validid';
      return 'clearance';
    }

    onDocTypeChanged(type) {
      // Highlight corresponding upload field
      const key = this.getFieldKey(type);
      document.querySelectorAll('.doc-upload-field-card').forEach(card => card.style.borderColor = 'var(--border-color)');
      const activeCard = document.getElementById(`doc-card-${key}`);
      if (activeCard) activeCard.style.borderColor = 'var(--accent-cyan)';
    }

    handleFileSelected(docType, inputEl) {
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        alert('Validation Error: Only image files (JPG, JPEG, PNG, WEBP) are supported.');
        inputEl.value = '';
        return;
      }

      const key = this.getFieldKey(docType);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        this.fileBuffers[docType] = {
          fileName: file.name,
          fileSize: `${Math.round(file.size / 1024)} KB`,
          fileDataUrl: dataUrl
        };

        // Update UI
        const statusEl = document.getElementById(`doc-status-${key}`);
        if (statusEl) {
          statusEl.textContent = 'Ready to save';
          statusEl.style.color = '#4ade80';
        }

        const previewImg = document.getElementById(`doc-preview-img-${key}`);
        if (previewImg) previewImg.src = dataUrl;

        const filenameEl = document.getElementById(`doc-filename-${key}`);
        if (filenameEl) filenameEl.textContent = file.name;

        const filesizeEl = document.getElementById(`doc-filesize-${key}`);
        if (filesizeEl) filesizeEl.textContent = `${Math.round(file.size / 1024)} KB`;

        const previewBox = document.getElementById(`doc-preview-box-${key}`);
        if (previewBox) previewBox.style.display = 'flex';

        const removeBtn = document.getElementById(`doc-remove-${key}`);
        if (removeBtn) removeBtn.style.display = 'inline-block';

        // Also sync doc type dropdown to this type
        const typeSelect = document.getElementById('doc-upload-type');
        if (typeSelect) typeSelect.value = docType;
        this.onDocTypeChanged(docType);
      };

      reader.readAsDataURL(file);
    }

    removeFile(docType) {
      const key = this.getFieldKey(docType);
      this.fileBuffers[docType] = null;

      const fileInput = document.getElementById(`doc-file-${key}`);
      if (fileInput) fileInput.value = '';

      const statusEl = document.getElementById(`doc-status-${key}`);
      if (statusEl) {
        statusEl.textContent = 'No file selected';
        statusEl.style.color = 'var(--text-muted)';
      }

      const previewBox = document.getElementById(`doc-preview-box-${key}`);
      if (previewBox) previewBox.style.display = 'none';

      const removeBtn = document.getElementById(`doc-remove-${key}`);
      if (removeBtn) removeBtn.style.display = 'none';
    }

    openUploadModal() {
      if (!window.authManager || !window.authManager.isAdmin()) {
        alert('Permission Denied: Only Administrators can upload compliance documents.');
        return;
      }

      this.clearSelectedEmployee();
      this.removeFile('RESUME');
      this.removeFile('PHOTOCOPY OF VALID ID');
      this.removeFile('BARANGAY CLEARANCE/POLICE CLEARANCE');

      document.getElementById('doc-upload-type').value = 'RESUME';
      document.getElementById('doc-upload-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('doc-upload-expiry').value = '';
      document.getElementById('doc-upload-notes').value = '';

      this.onDocTypeChanged('RESUME');

      const modal = document.getElementById('modal-upload-document');
      if (modal) modal.classList.add('active');
    }

    closeUploadModal() {
      const modal = document.getElementById('modal-upload-document');
      if (modal) modal.classList.remove('active');
    }

    /* --- INITIATE SAVE & CONFIRMATION FLOW (SECTION 20, 21, 22) --- */
    initiateSaveDocument() {
      if (!window.authManager || !window.authManager.isAdmin()) return;

      const empId = document.getElementById('doc-selected-emp-id').value;
      const empName = document.getElementById('doc-selected-emp-name').value;
      const empRole = document.getElementById('doc-selected-emp-role').value || 'Staff';
      const docType = document.getElementById('doc-upload-type').value;

      // 1. Validation: Employee selected
      if (!empId) {
        alert('Validation Error: Please search and select an employee from Master Registry.');
        return;
      }

      // 2. Validation: Image file selected for the chosen document type
      const fileData = this.fileBuffers[docType];
      if (!fileData || !fileData.fileDataUrl) {
        alert(`Validation Error: Please select an image file for [${docType}].`);
        return;
      }

      const dateUploaded = document.getElementById('doc-upload-date').value || new Date().toISOString().split('T')[0];
      const expiryDate = document.getElementById('doc-upload-expiry').value || '—';
      const notes = document.getElementById('doc-upload-notes').value.trim() || `Verified ${docType} by Operations Admin.`;

      // Determine status
      let status = 'Complete';
      if (expiryDate && expiryDate !== '—') {
        const exp = new Date(expiryDate);
        const now = new Date('2026-09-30');
        const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) status = 'Expired';
        else if (diffDays <= 30) status = 'Expiring Soon';
      }

      this.pendingUpload = {
        employeeId: empId,
        employeeName: empName,
        employeeRole: empRole,
        documentType: docType,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileDataUrl: fileData.fileDataUrl,
        dateUploaded,
        expiryDate,
        status,
        notes
      };

      // Check if employee already has a document of this type
      const existingDoc = this.documents.find(d => d.employeeId === empId && d.documentType === docType);
      if (existingDoc) {
        // Show Replace confirmation modal
        document.getElementById('doc-replace-emp-name').textContent = `${empName} (${empId})`;
        document.getElementById('doc-replace-type').textContent = docType;
        document.getElementById('doc-replace-modal-title').textContent = `Replace Existing ${docType}?`;

        const replaceModal = document.getElementById('modal-doc-confirm-replace');
        if (replaceModal) replaceModal.classList.add('active');
      } else {
        // Show Standard Save confirmation modal
        document.getElementById('doc-confirm-emp-name').textContent = `${empName} (${empId})`;
        document.getElementById('doc-confirm-type').textContent = docType;
        document.getElementById('doc-confirm-filename').textContent = fileData.fileName;

        const confirmModal = document.getElementById('modal-doc-confirm-upload');
        if (confirmModal) confirmModal.classList.add('active');
      }
    }

    cancelUploadConfirmation() {
      const modal = document.getElementById('modal-doc-confirm-upload');
      if (modal) modal.classList.remove('active');
    }

    cancelReplaceConfirmation() {
      const modal = document.getElementById('modal-doc-confirm-replace');
      if (modal) modal.classList.remove('active');
    }

    executeUpload() {
      this.cancelUploadConfirmation();
      this.commitDocumentSave(false);
    }

    executeReplace() {
      this.cancelReplaceConfirmation();
      this.commitDocumentSave(true);
    }

    commitDocumentSave(isReplace = false) {
      const p = this.pendingUpload;
      if (!p || !p.employeeId) return;

      if (isReplace) {
        // Remove existing document record for this employee and document type
        this.documents = this.documents.filter(d => !(d.employeeId === p.employeeId && d.documentType === p.documentType));
      }

      const newDoc = {
        id: `DOC-${p.employeeId}-${Date.now()}`,
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        position: p.employeeRole,
        documentType: p.documentType,
        status: p.status,
        dateUploaded: p.dateUploaded,
        expiryDate: p.expiryDate,
        fileName: p.fileName,
        fileDataUrl: p.fileDataUrl,
        notes: p.notes
      };

      this.documents.unshift(newDoc);
      this.saveDocuments();
      this.closeUploadModal();
      this.render();

      const actionWord = isReplace ? 'replaced' : 'uploaded';
      alert(`Success: ${p.documentType} for ${p.employeeName} (${p.employeeId}) ${actionWord} successfully.`);
    }

    viewDocument(id) {
      const doc = this.documents.find(d => d.id === id);
      if (!doc) return;

      document.getElementById('view-doc-title').textContent = `${doc.documentType} — ${doc.employeeName}`;
      const contentEl = document.getElementById('view-doc-content');
      if (contentEl) {
        const imagePreviewHtml = doc.fileDataUrl
          ? `<div style="margin-top:14px; text-align:center;">
               <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:6px; font-weight:700;">DOCUMENT IMAGE PREVIEW:</div>
               <img src="${doc.fileDataUrl}" style="max-width:100%; max-height:260px; border-radius:8px; border:1px solid var(--accent-cyan); object-fit:contain; background:#000;" alt="${doc.documentType}">
             </div>`
          : `<div style="margin-top:10px; font-size:12px; color:var(--text-muted); font-style:italic;">No live image buffer available (Standard certified copy verified).</div>`;

        contentEl.innerHTML = `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
              <div>
                <div style="font-size: 15px; font-weight: 800; color: #fff;">${doc.employeeName}</div>
                <div style="font-size: 12px; color: var(--accent-gold); font-family: monospace;">Master Registry ID: ${doc.employeeId} • ${doc.position || 'Staff'}</div>
              </div>
              <span class="badge ${doc.status === 'Complete' ? 'badge-success' : (doc.status === 'Expiring Soon' ? 'badge-warning' : 'badge-danger')}">
                ${doc.status}
              </span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12.5px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">
              <div>
                <span style="color:var(--text-muted);">Document Type:</span><br>
                <strong style="color:#fff;">${doc.documentType}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);">Uploaded Date:</span><br>
                <strong>${doc.dateUploaded || '-'}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);">Expiration Date:</span><br>
                <strong>${doc.expiryDate || '—'}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);">Attachment File:</span><br>
                <code style="color:var(--accent-cyan);">${doc.fileName || 'None'}</code>
              </div>
            </div>
            ${imagePreviewHtml}
          </div>
          <div style="font-size: 12.5px; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 10px 14px; border-radius: 6px;">
            <strong>Verification Notes:</strong><br>
            ${doc.notes || 'No special notes recorded.'}
          </div>
        `;
      }

      const modal = document.getElementById('modal-view-document');
      if (modal) modal.classList.add('active');
    }

    closeViewModal() {
      const modal = document.getElementById('modal-view-document');
      if (modal) modal.classList.remove('active');
    }

    deleteDocument(id) {
      if (!window.authManager || !window.authManager.isAdmin()) return;
      if (confirm('Are you sure you want to permanently delete this document record?')) {
        this.documents = this.documents.filter(d => d.id !== id);
        this.saveDocuments();
        this.render();
      }
    }
  }

  window.employeeDocumentsModule = new EmployeeDocumentsModule();
})();
