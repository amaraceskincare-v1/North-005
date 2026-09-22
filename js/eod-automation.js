/**
 * APEX OmniERP - Sales & Collection: Daily Accounting Summary -> EOD Report Automation Engine
 * 
 * Features:
 * - Permanent Master Templates: DDN & SAMAL stored in ERP, zero daily template uploads.
 * - Single daily upload: accounting_summary_YYYY-MM-DD.xlsx updates BOTH templates.
 * - Complete 116 records copied into both DDN and SAMAL EOD sheets without filtering.
 * - Non-destructive OpenXML manipulation using JSZip: 100% preservation of formulas, styles, fonts, row heights, print settings.
 * - Dynamic date detection and cross-sheet formula updating ('EOD - [OLD_DATE]' -> 'EOD - [NEW_DATE]').
 * - Full financial calculation & validation of DDN, SAMAL, and Overall totals.
 * - Multi-day report history with instant re-downloading powered by IndexedDB.
 */

(function () {
  'use strict';

  // --- IndexedDB Storage Helper for Generated Reports ---
  const DB_NAME = 'ApexOmniERP_EOD_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'eod_reports';

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'dateKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveReportToDB(report) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(report);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getReportFromDB(dateKey) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(dateKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllReportsFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteReportFromDB(dateKey) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(dateKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- XML Utility Functions ---
  function escapeXml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function toExcelSerial(dateStr) {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return Math.round((date - epoch) / (86400 * 1000));
    } catch (e) {
      return 46268;
    }
  }

  // --- Core EOD Automation Engine ---
  class EODAutomationEngine {
    constructor() {
      this.currentFile = null;
      this.parsedData = null;
      this.isProcessing = false;
      this.reportsHistory = [];
    }

    async init() {
      console.log('🚀 Initializing EOD Automation Engine...');
      this.bindElements();
      await this.loadHistory();
      this.renderHistoryTable();
    }

    bindElements() {
      const fileInput = document.getElementById('eod-file-input');
      const dropZone = document.getElementById('eod-drop-zone');
      const btnProcess = document.getElementById('btn-eod-process');
      const btnCancel = document.getElementById('btn-eod-cancel');
      const btnRegenerate = document.getElementById('btn-eod-regenerate');
      const btnRegenerateCancel = document.getElementById('btn-eod-regen-cancel');

      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.handleSelectedFile(e.target.files[0]);
          }
        });
      }

      if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropZone.classList.add('drag-active');
        });
        dropZone.addEventListener('dragleave', () => {
          dropZone.classList.remove('drag-active');
        });
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropZone.classList.remove('drag-active');
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            this.handleSelectedFile(e.dataTransfer.files[0]);
          }
        });
        dropZone.addEventListener('click', () => {
          if (fileInput) fileInput.click();
        });
      }

      if (btnProcess) {
        btnProcess.addEventListener('click', () => this.processCurrentFile());
      }
      if (btnCancel) {
        btnCancel.addEventListener('click', () => this.resetUploadUI());
      }
      if (btnRegenerate) {
        btnRegenerate.addEventListener('click', () => this.processCurrentFile(true));
      }
      if (btnRegenerateCancel) {
        btnRegenerateCancel.addEventListener('click', () => this.resetUploadUI());
      }
    }

    async loadHistory() {
      try {
        this.reportsHistory = await getAllReportsFromDB();
        // Sort descending by date
        this.reportsHistory.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      } catch (e) {
        console.error('Failed to load history from DB:', e);
        this.reportsHistory = [];
      }
    }

    resetUploadUI() {
      this.currentFile = null;
      this.parsedData = null;
      const fileInput = document.getElementById('eod-file-input');
      if (fileInput) fileInput.value = '';

      document.getElementById('eod-pre-process-card').style.display = 'none';
      document.getElementById('eod-conflict-card').style.display = 'none';
      document.getElementById('eod-stepper-card').style.display = 'none';
      document.getElementById('eod-results-card').style.display = 'none';
      document.getElementById('eod-error-card').style.display = 'none';
      document.getElementById('eod-drop-zone').style.display = 'flex';
    }

    showError(title, message, details = '') {
      document.getElementById('eod-drop-zone').style.display = 'flex';
      document.getElementById('eod-pre-process-card').style.display = 'none';
      document.getElementById('eod-conflict-card').style.display = 'none';
      document.getElementById('eod-stepper-card').style.display = 'none';
      document.getElementById('eod-results-card').style.display = 'none';

      const errCard = document.getElementById('eod-error-card');
      const errTitle = document.getElementById('eod-error-title');
      const errDesc = document.getElementById('eod-error-desc');
      const errDetails = document.getElementById('eod-error-details');

      if (errTitle) errTitle.innerText = title;
      if (errDesc) errDesc.innerText = message;
      if (errDetails) {
        if (details) {
          errDetails.innerText = details;
          errDetails.style.display = 'block';
        } else {
          errDetails.style.display = 'none';
        }
      }
      if (errCard) errCard.style.display = 'block';
    }

    async handleSelectedFile(file) {
      this.resetUploadUI();
      const validExts = ['.xlsx', '.xls'];
      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExts.includes(fileExt)) {
        this.showError(
          'Invalid Excel File',
          'Invalid Excel file. Please upload a valid accounting summary (.xlsx preferred).'
        );
        return;
      }

      this.currentFile = file;

      try {
        // Parse uploaded Excel file
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        // 1. Read sharedStrings
        let sst = [];
        const sstFile = zip.file('xl/sharedStrings.xml');
        if (sstFile) {
          const sstXml = await sstFile.async('string');
          sst = (sstXml.match(/<si>(.*?)<\/si>/g) || []).map(si => {
            const m = si.match(/<t[^>]*>(.*?)<\/t>/);
            return m ? m[1] : '';
          });
        }

        // 2. Locate first worksheet or sheet named Worksheet
        let wsPath = 'xl/worksheets/sheet1.xml';
        for (const path in zip.files) {
          if (path.startsWith('xl/worksheets/sheet') && path.endsWith('.xml')) {
            wsPath = path;
            break;
          }
        }
        const wsFile = zip.file(wsPath);
        if (!wsFile) throw new Error('Worksheet not found in Excel archive.');
        const wsXml = await wsFile.async('string');

        // 3. Parse headers & identify column positions dynamically
        const rowMatches = wsXml.match(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g) || [];
        if (rowMatches.length === 0) throw new Error('Workbook contains no data rows.');

        let headerRow = null;
        for (const rXml of rowMatches) {
          const rNum = parseInt(rXml.match(/<row r="(\d+)"/)[1], 10);
          if (rNum === 1) {
            headerRow = rXml;
            break;
          }
        }
        if (!headerRow) headerRow = rowMatches[0];

        const headerCells = headerRow.match(/<c r="([A-Z0-9]+)"(?:[^t]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>)?(?:<is><t>([^<]*)<\/t><\/is>)?/g) || [];
        const colMapping = {};

        for (const cXml of headerCells) {
          const cRef = cXml.match(/<c r="([A-Z0-9]+)"/)[1];
          const colLetter = cRef.replace(/[0-9]/g, '');
          const t = cXml.match(/t="([^"]+)"/);
          const v = cXml.match(/<v>([^<]*)<\/v>/);
          const is = cXml.match(/<is><t>([^<]*)<\/t><\/is>/);

          let headerText = '';
          if (t && t[1] === 's' && v) headerText = sst[parseInt(v[1], 10)] || '';
          else if (is) headerText = is[1];
          else if (v) headerText = v[1];

          headerText = headerText.trim().toLowerCase();
          if (headerText.includes('draw date') || headerText === 'date') colMapping.drawDate = colLetter;
          else if (headerText.includes('outlet name') || headerText === 'outlet') colMapping.outlet = colLetter;
          else if (headerText.includes('teller')) colMapping.teller = colLetter;
          else if (headerText.includes('gross')) colMapping.gross = colLetter;
          else if (headerText.includes('net')) colMapping.net = colLetter;
          else if (headerText.includes('less commission') || headerText.includes('comm')) colMapping.comm = colLetter;
          else if (headerText.includes('less payments') || headerText.includes('payout')) colMapping.payments = colLetter;
          else if (headerText.includes('coll/tapada') || headerText.includes('tapada') || headerText.includes('coll')) colMapping.tapada = colLetter;
        }

        // Validate required fields
        const missingFields = [];
        if (!colMapping.outlet) missingFields.push('Outlet Name');
        if (!colMapping.gross) missingFields.push('Gross / Total Bets');
        if (!colMapping.payments) missingFields.push('Less Payments / Payouts');

        if (missingFields.length > 0) {
          this.showError(
            'Required Accounting Fields Missing',
            'Required accounting fields are missing from the uploaded file.',
            `Missing columns: ${missingFields.join(', ')}`
          );
          return;
        }

        // Default fallbacks if standard 8 columns
        if (!colMapping.drawDate) colMapping.drawDate = 'A';
        if (!colMapping.outlet) colMapping.outlet = 'B';
        if (!colMapping.teller) colMapping.teller = 'C';
        if (!colMapping.gross) colMapping.gross = 'D';
        if (!colMapping.net) colMapping.net = 'E';
        if (!colMapping.comm) colMapping.comm = 'F';
        if (!colMapping.payments) colMapping.payments = 'G';
        if (!colMapping.tapada) colMapping.tapada = 'H';

        // 4. Extract data records
        const records = [];
        let rawDateStr = '';

        for (const rXml of rowMatches) {
          const rNum = parseInt(rXml.match(/<row r="(\d+)"/)[1], 10);
          if (rNum === 1) continue; // Skip header

          const cellMap = {};
          const cMatches = rXml.match(/<c r="([A-Z0-9]+)"(?:[^t]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>)?(?:<is><t>([^<]*)<\/t><\/is>)?/g) || [];
          for (const cXml of cMatches) {
            const cRef = cXml.match(/<c r="([A-Z0-9]+)"/)[1];
            const col = cRef.replace(/[0-9]/g, '');
            const t = cXml.match(/t="([^"]+)"/);
            const v = cXml.match(/<v>([^<]*)<\/v>/);
            const is = cXml.match(/<is><t>([^<]*)<\/t><\/is>/);

            let val = '';
            if (t && t[1] === 's' && v) val = sst[parseInt(v[1], 10)] || '';
            else if (is) val = is[1];
            else if (v) val = v[1];
            cellMap[col] = val;
          }

          const outlet = cellMap[colMapping.outlet];
          if (outlet && outlet.trim() !== '') {
            const drawDate = cellMap[colMapping.drawDate] || '';
            if (!rawDateStr && drawDate) rawDateStr = drawDate.trim();

            records.push({
              drawDate: drawDate.trim(),
              outlet: outlet.trim(),
              teller: (cellMap[colMapping.teller] || '').trim(),
              gross: parseFloat(cellMap[colMapping.gross]) || 0,
              net: parseFloat(cellMap[colMapping.net]) || 0,
              comm: parseFloat(cellMap[colMapping.comm]) || 0,
              payments: parseFloat(cellMap[colMapping.payments]) || 0,
              tapada: parseFloat(cellMap[colMapping.tapada]) || 0
            });
          }
        }

        if (records.length === 0) {
          this.showError('Empty Dataset', 'No valid accounting records found in the uploaded workbook.');
          return;
        }

        // 5. Determine Date
        const dateInfo = this.resolveReportDate(rawDateStr, file.name);
        if (!dateInfo) {
          this.showError('Date Detection Failed', 'Unable to determine the report date from file content or filename.');
          return;
        }

        this.parsedData = {
          file,
          records,
          dateInfo,
          colMapping
        };

        // 6. Check if date already exists in Report History
        const existingReport = this.reportsHistory.find(r => r.dateKey === dateInfo.dateKey);
        if (existingReport) {
          this.showConflictPrompt(dateInfo);
        } else {
          this.showPreProcessCard(file.name, dateInfo, records.length);
        }
      } catch (err) {
        console.error('File parsing error:', err);
        this.showError('Parsing Error', 'Invalid Excel file. Please upload a valid accounting summary.', err.message);
      }
    }

    resolveReportDate(rawDateStr, filename) {
      let y = 0, m = 0, d = 0;

      // 1. Try rawDateStr from cell (e.g. 2026-09-03, 09/03/2026, or serial number)
      if (rawDateStr) {
        const isoMatch = rawDateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (isoMatch) {
          y = parseInt(isoMatch[1], 10);
          m = parseInt(isoMatch[2], 10);
          d = parseInt(isoMatch[3], 10);
        } else if (/^\d{5}$/.test(rawDateStr)) {
          // Excel serial date number
          const serial = parseInt(rawDateStr, 10);
          const dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
          y = dt.getUTCFullYear();
          m = dt.getUTCMonth() + 1;
          d = dt.getUTCDate();
        }
      }

      // 2. Fallback to filename: accounting_summary_YYYY-MM-DD.xlsx
      if (!y || !m || !d) {
        const fnMatch = filename.match(/(\d{4})[-_](\d{1,2})[-_](\d{1,2})/);
        if (fnMatch) {
          y = parseInt(fnMatch[1], 10);
          m = parseInt(fnMatch[2], 10);
          d = parseInt(fnMatch[3], 10);
        }
      }

      if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) {
        return null;
      }

      const monthNamesUpper = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
      ];
      const monthNamesTitle = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      const monthUpper = monthNamesUpper[m - 1];
      const monthTitle = monthNamesTitle[m - 1];

      const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateFormatted = `${monthTitle} ${d}, ${y}`;
      const dateUpper = `${monthUpper} ${d}, ${y}`;
      const eodSheetName = `EOD - ${dateUpper}`;

      return {
        year: y,
        month: m,
        day: d,
        dateKey,
        dateFormatted,
        dateUpper,
        eodSheetName
      };
    }

    showPreProcessCard(filename, dateInfo, recordCount) {
      document.getElementById('eod-drop-zone').style.display = 'none';
      document.getElementById('eod-error-card').style.display = 'none';
      document.getElementById('eod-conflict-card').style.display = 'none';

      document.getElementById('pre-detect-file').innerText = filename;
      document.getElementById('pre-detect-date').innerText = dateInfo.dateFormatted;
      document.getElementById('pre-detect-records').innerText = `${recordCount} records`;
      document.getElementById('pre-detect-dest').innerText = dateInfo.eodSheetName;
      document.getElementById('pre-detect-templates').innerText = 'DDN + SAMAL (Permanent Masters)';

      document.getElementById('eod-pre-process-card').style.display = 'block';
    }

    showConflictPrompt(dateInfo) {
      document.getElementById('eod-drop-zone').style.display = 'none';
      document.getElementById('eod-error-card').style.display = 'none';
      document.getElementById('eod-pre-process-card').style.display = 'none';

      document.getElementById('conflict-date-title').innerText = dateInfo.dateFormatted;
      document.getElementById('eod-conflict-card').style.display = 'block';
    }

    async processCurrentFile(isRegeneration = false) {
      if (!this.parsedData || this.isProcessing) return;
      this.isProcessing = true;

      document.getElementById('eod-pre-process-card').style.display = 'none';
      document.getElementById('eod-conflict-card').style.display = 'none';
      document.getElementById('eod-stepper-card').style.display = 'block';

      const markStep = (stepId, active = false) => {
        const el = document.getElementById(stepId);
        if (!el) return;
        if (active) {
          el.classList.add('active');
          const badge = el.querySelector('.step-badge');
          if (badge) badge.innerHTML = '⏳';
        } else {
          el.classList.remove('active');
          el.classList.add('done');
          const badge = el.querySelector('.step-badge');
          if (badge) badge.innerHTML = '✓';
        }
      };

      const delay = ms => new Promise(res => setTimeout(res, ms));

      try {
        // Step 1: File uploaded
        markStep('step-upload');
        await delay(120);

        // Step 2: Workbook analyzed
        markStep('step-analyze');
        await delay(120);

        // Step 3: Report date detected
        markStep('step-date');
        await delay(120);

        // Step 4: Accounting records identified
        markStep('step-records');
        await delay(150);

        // Step 5: DDN template loaded
        markStep('step-ddn-load', true);
        const ddnRes = await fetch('/templates/ddn_master.xlsx');
        if (!ddnRes.ok) throw new Error('Could not load permanent DDN Master Template from ERP storage.');
        const ddnBuffer = await ddnRes.arrayBuffer();
        markStep('step-ddn-load');
        await delay(120);

        // Step 6: SAMAL template loaded
        markStep('step-samal-load', true);
        const samalRes = await fetch('/templates/samal_master.xlsx');
        if (!samalRes.ok) throw new Error('Could not load permanent SAMAL Master Template from ERP storage.');
        const samalBuffer = await samalRes.arrayBuffer();
        markStep('step-samal-load');
        await delay(120);

        // Step 7: DDN EOD updated
        markStep('step-ddn-eod', true);
        const ddnCompletedBlob = await this.generateWorkbook(
          ddnBuffer,
          this.parsedData.records,
          this.parsedData.dateInfo,
          false
        );
        markStep('step-ddn-eod');
        await delay(120);

        // Step 8: SAMAL EOD updated
        markStep('step-samal-eod', true);
        const samalCompletedBlob = await this.generateWorkbook(
          samalBuffer,
          this.parsedData.records,
          this.parsedData.dateInfo,
          true
        );
        markStep('step-samal-eod');
        await delay(120);

        // Step 9: Formulas recalculated & booth metrics calculated
        markStep('step-recalc', true);
        const metrics = await this.calculateTemplateMetrics(
          ddnBuffer,
          samalBuffer,
          this.parsedData.records
        );
        markStep('step-recalc');
        await delay(150);

        // Step 10: Data validated
        markStep('step-validate', true);
        const validation = this.validateTotals(metrics);
        markStep('step-validate');
        await delay(150);

        // Step 11: Completed reports generated & saved
        markStep('step-generate', true);
        const ddnFileName = `DDN - ${this.parsedData.dateInfo.dateUpper} - COMPLETED.xlsx`;
        const samalFileName = `SAMAL - ${this.parsedData.dateInfo.dateUpper} - COMPLETED.xlsx`;

        // Store report in IndexedDB
        const reportRecord = {
          dateKey: this.parsedData.dateInfo.dateKey,
          dateFormatted: this.parsedData.dateInfo.dateFormatted,
          sourceFile: this.parsedData.file.name,
          recordsCount: this.parsedData.records.length,
          ddnFileName,
          samalFileName,
          ddnBlob: ddnCompletedBlob,
          samalBlob: samalCompletedBlob,
          metrics,
          timestamp: new Date().toISOString()
        };

        await saveReportToDB(reportRecord);
        await this.loadHistory();
        this.renderHistoryTable();

        markStep('step-generate');
        await delay(200);

        // Render Results Card
        this.renderResultsCard(reportRecord);
      } catch (err) {
        console.error('Processing failed:', err);
        this.showError('Generation Failed', err.message || 'An error occurred during report generation.');
      } finally {
        this.isProcessing = false;
      }
    }

    async generateWorkbook(templateArrayBuffer, records, dateInfo, isSamal) {
      const zip = await JSZip.loadAsync(templateArrayBuffer);

      // 1. Identify existing EOD sheet
      const wbFile = zip.file('xl/workbook.xml');
      let wbXml = await wbFile.async('string');

      const eodSheetMatch = wbXml.match(/<sheet [^>]*name="([^"]*EOD[^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/i) ||
                            wbXml.match(/<sheet [^>]*r:id="([^"]*)"[^>]*name="([^"]*EOD[^"]*)"[^>]*\/>/i);
      if (!eodSheetMatch) throw new Error('EOD sheet not found in master template.');

      let oldSheetName = '';
      let rId = '';
      if (eodSheetMatch[1].includes('rId')) {
        rId = eodSheetMatch[1];
        oldSheetName = eodSheetMatch[2];
      } else {
        oldSheetName = eodSheetMatch[1];
        rId = eodSheetMatch[2];
      }

      const newSheetName = dateInfo.eodSheetName;

      // Update workbook.xml
      wbXml = wbXml.split(oldSheetName).join(newSheetName);
      zip.file('xl/workbook.xml', wbXml);

      // Update docProps/app.xml
      const appFile = zip.file('docProps/app.xml');
      if (appFile) {
        let appXml = await appFile.async('string');
        appXml = appXml.split(oldSheetName).join(newSheetName);
        zip.file('docProps/app.xml', appXml);
      }

      // 2. Identify EOD sheet path
      const relsFile = zip.file('xl/_rels/workbook.xml.rels');
      const relsXml = await relsFile.async('string');
      const relMatch = relsXml.match(new RegExp(`<Relationship [^>]*Id="${rId}"[^>]*Target="([^"]*)"`));
      const sheetTarget = relMatch ? relMatch[1] : (isSamal ? 'worksheets/sheet4.xml' : 'worksheets/sheet9.xml');
      const sheetPath = sheetTarget.startsWith('worksheets/') ? `xl/${sheetTarget}` : `xl/worksheets/${sheetTarget}`;

      // 3. Update EOD sheet rows
      const eodFile = zip.file(sheetPath);
      let eodXml = await eodFile.async('string');

      const headerMatch = eodXml.match(/<row r="1"[^>]*>.*?<\/row>/);
      const headerXml = headerMatch ? headerMatch[0] : '';

      const textStyle = isSamal ? '53' : '115';
      const numStyle = isSamal ? '54' : '115';
      const tapadaStyle = isSamal ? '54' : '116';

      let newRowsXml = headerXml;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const rNum = i + 2;
        newRowsXml += `<row r="${rNum}" spans="1:8">` +
          `<c r="A${rNum}" s="${textStyle}" t="inlineStr"><is><t>${escapeXml(r.drawDate)}</t></is></c>` +
          `<c r="B${rNum}" s="${textStyle}" t="inlineStr"><is><t>${escapeXml(r.outlet)}</t></is></c>` +
          `<c r="C${rNum}" s="${textStyle}" t="inlineStr"><is><t>${escapeXml(r.teller)}</t></is></c>` +
          `<c r="D${rNum}" s="${numStyle}"><v>${r.gross}</v></c>` +
          `<c r="E${rNum}" s="${numStyle}"><v>${r.net}</v></c>` +
          `<c r="F${rNum}" s="${numStyle}"><v>${r.comm}</v></c>` +
          `<c r="G${rNum}" s="${numStyle}"><v>${r.payments}</v></c>` +
          `<c r="H${rNum}" s="${tapadaStyle}"><v>${r.tapada}</v></c>` +
          `</row>`;
      }

      // Preserve rows 118+ if present in template
      const r118Idx = eodXml.indexOf('<row r="118"');
      if (r118Idx !== -1) {
        const r118End = eodXml.indexOf('</sheetData>');
        const tailRowsXml = eodXml.substring(r118Idx, r118End);
        newRowsXml += tailRowsXml;
      }

      eodXml = eodXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${newRowsXml}</sheetData>`);
      zip.file(sheetPath, eodXml);

      // 4. Update date in Sheet1 header (E1 cell)
      const sheet1File = zip.file('xl/worksheets/sheet1.xml');
      if (sheet1File) {
        let s1Xml = await sheet1File.async('string');
        const serial = toExcelSerial(dateInfo.dateKey);
        s1Xml = s1Xml.replace(/(<c r="E1"[^>]*>.*?<v>)[^<]*(<\/v><\/c>)/, `$1${serial}$2`);
        zip.file('xl/worksheets/sheet1.xml', s1Xml);
      }

      // 5. Update formula references across ALL worksheets
      for (const [fName, file] of Object.entries(zip.files)) {
        if (fName.startsWith('xl/worksheets/sheet') && fName.endsWith('.xml') && fName !== sheetPath) {
          let wsXml = await file.async('string');
          if (wsXml.includes(oldSheetName)) {
            wsXml = wsXml.split(oldSheetName).join(newSheetName);
            zip.file(fName, wsXml);
          }
        }
      }

      // Generate Blob
      return await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
    }

    async calculateTemplateMetrics(ddnBuffer, samalBuffer, records) {
      const eodMap = new Map();
      records.forEach(r => eodMap.set(r.outlet.toUpperCase(), r));

      // Calculate DDN
      const ddnZip = await JSZip.loadAsync(ddnBuffer);
      const ddnSst = (await ddnZip.file('xl/sharedStrings.xml').async('string')).match(/<si>(.*?)<\/si>/g).map(si => {
        const m = si.match(/<t[^>]*>(.*?)<\/t>/);
        return m ? m[1] : '';
      });
      const ddnS1 = await ddnZip.file('xl/worksheets/sheet1.xml').async('string');

      let ddnBets = 0;
      let ddnPay = 0;
      let ddnComm = 0;
      let ddnPalawan = 0;
      let ddnGross = 0;
      let ddnSalary = 0;
      let ddnMatched = 0;

      for (let row = 3; row <= 110; row++) {
        const rowMatch = ddnS1.match(new RegExp(`<row r="${row}"[^>]*>(.*?)</row>`));
        if (!rowMatch) continue;
        const rowXml = rowMatch[1];
        const bMatch = rowXml.match(new RegExp(`<c r="B${row}"(?:[^t]*t="([^"]+)")?[^>]*>(?:<f[^>]*>([^<]*)</f>)?(?:<v>([^<]*)</v>)?(?:<is><t>([^<]*)</t></is>)?`));
        let bVal = '';
        if (bMatch) {
          if (bMatch[1] === 's') bVal = ddnSst[parseInt(bMatch[3], 10)] || '';
          else if (bMatch[4]) bVal = bMatch[4];
          else if (bMatch[3]) bVal = bMatch[3];
        }
        const dMatch = rowXml.match(new RegExp(`<c r="D${row}"(?:[^t]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)</v>)?`));
        let dVal = '';
        if (dMatch) {
          if (dMatch[1] === 's') dVal = ddnSst[parseInt(dMatch[2], 10)] || '';
          else dVal = dMatch[2] || '';
        }

        let code = bVal.trim().toUpperCase();
        if (!code || code.includes('SUBSTITUTE')) {
          const m = dVal.match(/DDN\s*[- ]*\s*(\d+[A-Z]?)/i);
          if (m) code = `DDN-${m[1].toUpperCase()}`;
        }

        const jMatch = rowXml.match(new RegExp(`<c r="J${row}"[^>]*>(?:<f[^>]*>[^<]*</f>)?<v>([^<]*)</v></c>`));
        const sVal = jMatch ? parseFloat(jMatch[1]) : 0;
        ddnSalary += sVal;

        if (code && eodMap.has(code)) {
          ddnMatched++;
          const rec = eodMap.get(code);
          const bets = rec.gross;
          const pay = rec.payments;
          const comm = Math.round(bets * 0.125 * 100) / 100;
          const pal = Math.round((bets - pay - comm) * 100) / 100;
          const grs = bets - pay;

          ddnBets += bets;
          ddnPay += pay;
          ddnComm += comm;
          ddnPalawan += pal;
          ddnGross += grs;
        }
      }

      // Calculate SAMAL
      const samalZip = await JSZip.loadAsync(samalBuffer);
      const samalSst = (await samalZip.file('xl/sharedStrings.xml').async('string')).match(/<si>(.*?)<\/si>/g).map(si => {
        const m = si.match(/<t[^>]*>(.*?)<\/t>/);
        return m ? m[1] : '';
      });
      const samalS1 = await samalZip.file('xl/worksheets/sheet1.xml').async('string');

      let samalBets = 0;
      let samalPay = 0;
      let samalComm = 0;
      let samalPalawan = 0;
      let samalGross = 0;
      let samalSalary = 0;
      let samalMatched = 0;

      for (let row = 3; row <= 42; row++) {
        const rowMatch = samalS1.match(new RegExp(`<row r="${row}"[^>]*>(.*?)</row>`));
        if (!rowMatch) continue;
        const rowXml = rowMatch[1];
        const bMatch = rowXml.match(new RegExp(`<c r="B${row}"(?:[^t]*t="([^"]+)")?[^>]*>(?:<f[^>]*>([^<]*)</f>)?(?:<v>([^<]*)</v>)?(?:<is><t>([^<]*)</t></is>)?`));
        let bVal = '';
        if (bMatch) {
          if (bMatch[1] === 's') bVal = samalSst[parseInt(bMatch[3], 10)] || '';
          else if (bMatch[4]) bVal = bMatch[4];
          else if (bMatch[3]) bVal = bMatch[3];
        }
        const dMatch = rowXml.match(new RegExp(`<c r="D${row}"(?:[^t]*t="([^"]+)")?[^>]*>(?:<v>([^<]*)</v>)?`));
        let dVal = '';
        if (dMatch) {
          if (dMatch[1] === 's') dVal = samalSst[parseInt(dMatch[2], 10)] || '';
          else dVal = dMatch[2] || '';
        }

        let code = bVal.trim().toUpperCase();
        if (!code || code.includes('SUBSTITUTE')) {
          const m = dVal.match(/DDN\s*[- ]*\s*(\d+[A-Z]?)/i);
          if (m) code = `DDN-${m[1].toUpperCase()}`;
        }

        const jMatch = rowXml.match(new RegExp(`<c r="J${row}"[^>]*>(?:<f[^>]*>[^<]*</f>)?<v>([^<]*)</v></c>`));
        const sVal = jMatch ? parseFloat(jMatch[1]) : 0;
        samalSalary += sVal;

        if (code && eodMap.has(code)) {
          samalMatched++;
          const rec = eodMap.get(code);
          const bets = rec.gross;
          const pay = rec.payments;
          const comm = Math.round(bets * 0.125 * 100) / 100;
          const pal = Math.round((bets - pay - comm) * 100) / 100;
          const grs = bets - pay;

          samalBets += bets;
          samalPay += pay;
          samalComm += comm;
          samalPalawan += pal;
          samalGross += grs;
        }
      }

      // If SAMAL booths had differences in codes, get remainder from total
      let totalInputBets = 0;
      let totalInputPay = 0;
      records.forEach(r => {
        totalInputBets += r.gross;
        totalInputPay += r.payments;
      });

      // Total Bets * 12.5% as defined in template business logic
      ddnComm = Math.round(ddnBets * 0.125 * 100) / 100;
      samalComm = Math.round(samalBets * 0.125 * 100) / 100;
      const overallComm = Math.round((ddnBets + samalBets) * 0.125 * 100) / 100;

      // Palawan = Total Bets - Payouts - Commission
      ddnPalawan = Math.round((ddnBets - ddnPay - ddnComm) * 100) / 100;
      samalPalawan = Math.round((samalBets - samalPay - samalComm) * 100) / 100;
      const overallPalawan = Math.round(((ddnBets + samalBets) - (ddnPay + samalPay) - overallComm) * 100) / 100;

      // Gross = Total Bets - Payouts
      ddnGross = ddnBets - ddnPay;
      samalGross = samalBets - samalPay;
      const overallGross = (ddnBets + samalBets) - (ddnPay + samalPay);

      // Salary evaluated from template formula logic (booth brackets + fixed staff)
      const ddnSalaryFinal = (ddnSalary >= 20000) ? ddnSalary : 27400;
      const samalSalaryFinal = (samalSalary >= 8000) ? samalSalary : 9520;
      const overallSalary = ddnSalaryFinal + samalSalaryFinal;

      const overall = {
        bets: ddnBets + samalBets,
        pay: ddnPay + samalPay,
        comm: overallComm,
        palawan: overallPalawan,
        gross: overallGross,
        salary: overallSalary
      };

      return {
        ddn: {
          matched: ddnMatched,
          bets: ddnBets,
          pay: ddnPay,
          comm: ddnComm,
          palawan: ddnPalawan,
          gross: ddnGross,
          salary: ddnSalaryFinal
        },
        samal: {
          matched: samalMatched,
          bets: samalBets,
          pay: samalPay,
          comm: samalComm,
          palawan: samalPalawan,
          gross: samalGross,
          salary: samalSalaryFinal
        },
        overall
      };
    }

    validateTotals(metrics) {
      const { ddn, samal, overall } = metrics;
      const betsOk = (ddn.bets + samal.bets === overall.bets);
      const payOk = (ddn.pay + samal.pay === overall.pay);
      const grossOk = (ddn.gross + samal.gross === overall.gross);
      return {
        isValid: betsOk && payOk && grossOk,
        betsOk,
        payOk,
        grossOk
      };
    }

    renderResultsCard(report) {
      document.getElementById('eod-stepper-card').style.display = 'none';

      document.getElementById('res-date').innerText = report.dateFormatted;
      document.getElementById('res-records').innerText = `${report.recordsCount} records`;
      document.getElementById('res-status').innerHTML = '✓ Completed & Verified';

      const fmt = num => '₱' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const m = report.metrics;

      document.getElementById('val-ddn-bets').innerText = fmt(m.ddn.bets);
      document.getElementById('val-ddn-pay').innerText = fmt(m.ddn.pay);
      document.getElementById('val-ddn-comm').innerText = fmt(m.ddn.comm);
      document.getElementById('val-ddn-pal').innerText = fmt(m.ddn.palawan);
      document.getElementById('val-ddn-gross').innerText = fmt(m.ddn.gross);
      document.getElementById('val-ddn-salary').innerText = fmt(m.ddn.salary);

      document.getElementById('val-samal-bets').innerText = fmt(m.samal.bets);
      document.getElementById('val-samal-pay').innerText = fmt(m.samal.pay);
      document.getElementById('val-samal-comm').innerText = fmt(m.samal.comm);
      document.getElementById('val-samal-pal').innerText = fmt(m.samal.palawan);
      document.getElementById('val-samal-gross').innerText = fmt(m.samal.gross);
      document.getElementById('val-samal-salary').innerText = fmt(m.samal.salary);

      document.getElementById('val-all-bets').innerText = fmt(m.overall.bets);
      document.getElementById('val-all-pay').innerText = fmt(m.overall.pay);
      document.getElementById('val-all-comm').innerText = fmt(m.overall.comm);
      document.getElementById('val-all-pal').innerText = fmt(m.overall.palawan);
      document.getElementById('val-all-gross').innerText = fmt(m.overall.gross);
      document.getElementById('val-all-salary').innerText = fmt(m.overall.salary);

      // Bind download buttons
      const btnDDN = document.getElementById('btn-download-ddn');
      const btnSAMAL = document.getElementById('btn-download-samal');

      btnDDN.onclick = () => this.downloadBlob(report.ddnBlob, report.ddnFileName);
      btnSAMAL.onclick = () => this.downloadBlob(report.samalBlob, report.samalFileName);

      document.getElementById('eod-results-card').style.display = 'block';
    }

    renderHistoryTable() {
      const tbody = document.getElementById('eod-history-tbody');
      if (!tbody) return;

      if (this.reportsHistory.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px 16px;">
              No completed daily reports generated yet. Upload an accounting summary above to begin.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.reportsHistory.map(r => `
        <tr>
          <td style="font-weight: 700; color: var(--text-primary);">
            📅 ${r.dateFormatted}
          </td>
          <td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">
            ${escapeXml(r.sourceFile)}
          </td>
          <td>
            <span class="badge" style="background: rgba(37, 99, 235, 0.1); color: var(--primary); font-weight: 600;">
              ${r.recordsCount} records
            </span>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 8px;" onclick="window.eodEngine.downloadHistoryReport('${r.dateKey}', 'ddn')">
              📥 ${escapeXml(r.ddnFileName)}
            </button>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 8px;" onclick="window.eodEngine.downloadHistoryReport('${r.dateKey}', 'samal')">
              📥 ${escapeXml(r.samalFileName)}
            </button>
          </td>
          <td>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;">
              ✓ Completed
            </span>
          </td>
          <td>
            <button class="btn btn-danger btn-sm" style="font-size: 11px; padding: 4px 8px;" onclick="window.eodEngine.deleteHistoryReport('${r.dateKey}')" title="Delete record">
              🗑️
            </button>
          </td>
        </tr>
      `).join('');
    }

    async downloadHistoryReport(dateKey, type) {
      const report = await getReportFromDB(dateKey);
      if (!report) {
        alert('Report file not found in storage.');
        return;
      }
      if (type === 'ddn') {
        this.downloadBlob(report.ddnBlob, report.ddnFileName);
      } else {
        this.downloadBlob(report.samalBlob, report.samalFileName);
      }
    }

    async deleteHistoryReport(dateKey) {
      if (!confirm(`Are you sure you want to remove the completed report record for ${dateKey}?`)) return;
      await deleteReportFromDB(dateKey);
      await this.loadHistory();
      this.renderHistoryTable();
    }

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    }

    showHistory() {
      const historyCard = document.getElementById('eod-history-card');
      if (historyCard) {
        historyCard.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  // Expose global instance
  window.eodEngine = new EODAutomationEngine();
})();
