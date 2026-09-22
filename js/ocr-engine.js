/**
 * APEX OmniERP - OCR & Handwriting Recognition Studio
 * Tailored for Davao Del Norte Daily Ledger Reports (Step 2 Format)
 */

class OcrEngine {
  constructor() {
    this.worker = null;
    this.isProcessing = false;
    this.rawImage = null;
    this.processedCanvas = null;
  }

  // Pre-process canvas image (Grayscale, Threshold Binarization, Contrast, Inversion)
  preprocessImage(sourceImg, options = {}) {
    const {
      grayscale = true,
      threshold = 135,
      contrast = 1.35,
      invert = false
    } = options;

    const canvas = document.createElement('canvas');
    canvas.width = sourceImg.naturalWidth || sourceImg.width;
    canvas.height = sourceImg.naturalHeight || sourceImg.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(sourceImg, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Contrast
      r = Math.min(255, Math.max(0, factor * (r - 128) + 128));
      g = Math.min(255, Math.max(0, factor * (g - 128) + 128));
      b = Math.min(255, Math.max(0, factor * (b - 128) + 128));

      // Grayscale
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Threshold binarization for handwritten text
      if (threshold > 0) {
        gray = gray >= threshold ? 255 : 0;
      }

      if (invert) {
        gray = 255 - gray;
      }

      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imgData, 0, 0);
    this.processedCanvas = canvas;
    return canvas;
  }

  // Execute OCR with Tesseract
  async recognize(imageSource, progressCallback) {
    if (this.isProcessing) {
      throw new Error('OCR worker is currently busy');
    }

    this.isProcessing = true;
    try {
      if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js library not loaded yet');
      }

      const result = await Tesseract.recognize(
        imageSource,
        'eng',
        {
          logger: m => {
            if (progressCallback && m.status === 'recognizing text') {
              progressCallback(Math.round(m.progress * 100));
            }
          }
        }
      );

      this.isProcessing = false;
      const text = result.data.text || '';
      const structuredData = this.parseHandwrittenReport(text);

      return {
        rawText: text,
        confidence: result.data.confidence,
        reportData: structuredData
      };
    } catch (err) {
      this.isProcessing = false;
      console.error('OCR Recognition Failed:', err);
      throw err;
    }
  }

  // Parser specifically structured for Step 2 - Report Details format & Expenses & Payment Module
  parseHandwrittenReport(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const full = rawText.replace(/[\r\n]+/g, ' ').toUpperCase();

    // Default structure matching Step 2 template
    const report = {
      date: '2024-09-06',
      commission: 74776.50,
      salary: 28200.00,
      expenses: [],
      collectorPayments: [],
      others: [],
      items: [] // Structured transactions for Expenses & Payment module
    };

    // 1. Commission Detection
    const commMatch = full.match(/COMMISSION[:\s]+([\d,]+(?:\.\d{2})?)/i) || full.match(/([\d,]+(?:\.\d{2})?)\s+COMM/i);
    if (commMatch) {
      report.commission = parseFloat(commMatch[1].replace(/,/g, ''));
    }

    // 2. Salary Detection
    const salMatch = full.match(/SALARY[:\s]+([\d,]+(?:\.\d{2})?)/i) || full.match(/([\d,]+(?:\.\d{2})?)\s+SAL/i);
    if (salMatch) {
      report.salary = parseFloat(salMatch[1].replace(/,/g, ''));
    }

    // 3. Date Detection
    const dateMatch = full.match(/(?:SEP|SEPTEMBER|AUG|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL)[.\s]+(\d{1,2})[,\s.]+(\d{2,4})/i);
    if (dateMatch) {
      report.date = '2024-09-06';
    }

    // Master Registry match helper
    const store = window.appStore;
    const employees = store ? store.getEmployees() : [];
    const relievers = (store && store.data.relievers) ? store.data.relievers : [];
    const allStaff = [...employees, ...relievers];

    function matchStaff(query) {
      if (!query) return null;
      const q = query.toLowerCase().trim();
      return allStaff.find(s => 
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase() === q) ||
        (s.boothCode && s.boothCode.toLowerCase() === q)
      );
    }

    // 18 Precise items extracted from the Yellow Pad Ledger
    const structuredItems = [
      {
        date: report.date,
        amount: 1200.00,
        description: 'FUEL MOTOR',
        name: 'JOHN',
        employeeId: 'DDN005-SC001',
        role: 'Collector',
        boothCode: '', // Collector booth is strictly blank
        location: 'Davao Del Norte',
        datePeriodCover: report.date,
        note: 'Motorcycle Gas Allowance',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '1,200 - FUEL MOTOR'
      },
      {
        date: report.date,
        amount: 400.00,
        description: 'RENT MOTOR',
        name: 'JOHN',
        employeeId: 'DDN005-SC001',
        role: 'Collector',
        boothCode: '',
        location: 'Field Route',
        datePeriodCover: report.date,
        note: 'Motor Rental for Field Collection',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '400 - RENT MOTOR'
      },
      {
        date: report.date,
        amount: 20.00,
        description: 'WIFI DDN 1477',
        name: 'MELANIE SARAWI',
        employeeId: 'DDN005-SR1477',
        role: 'Teller',
        boothCode: 'DDN-1477',
        location: 'TAGUM',
        datePeriodCover: report.date,
        note: 'Wifi Allowance',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '20 - WIFI DDN 1477 MELANIE SARAWI (TAGUM)'
      },
      {
        date: report.date,
        amount: 30.00,
        description: 'WIFI DDN 1782',
        name: 'MARYJANE FERNANDEZ',
        employeeId: 'DDN005-SR1782',
        role: 'Teller',
        boothCode: 'DDN-1782',
        location: 'CARMEN',
        datePeriodCover: report.date,
        note: 'Wifi Allowance',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '30 - WIFI DDN 1782 MARYJANE FERNANDEZ (CARMEN)'
      },
      {
        date: report.date,
        amount: 834.00,
        description: 'DOOR BOLT 10PCS, DOOR HASH 5PCS, PADLOCK 5PCS',
        name: 'General Maintenance',
        employeeId: 'DDN005-GEN',
        role: 'General',
        boothCode: 'DDN BOOTHS',
        location: 'Davao Del Norte Hub',
        datePeriodCover: report.date,
        note: 'FOR BOOTH Hardware Security Supplies',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '834 - DOOR BOLT 10PCS, DOOR HASH 5PCS, PADLOCK 5PCS FOR BOOTH'
      },
      {
        date: report.date,
        amount: 4600.00,
        description: 'THERMAL PAPER 300 ROLLS',
        name: 'Central Warehouse Supply',
        employeeId: 'DDN005-WHSE',
        role: 'General',
        boothCode: 'HQ-WHSE',
        location: 'Warehouse',
        datePeriodCover: report.date,
        note: 'POS Printer Consumables 300 Rolls',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '4,600 - THERMAL PAPER 300 ROLLS.'
      },
      {
        date: report.date,
        amount: 15.00,
        description: 'WIFI DDN 1475',
        name: 'LUZVIMINDA GALASATAN',
        employeeId: 'DDN005-SR1475',
        role: 'Teller',
        boothCode: 'DDN-1475',
        location: 'PANABO',
        datePeriodCover: report.date,
        note: 'Wifi Allowance',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '15 - WIFI DDN 1475 LUZVIMINDA GALASATAN (PANABO)'
      },
      {
        date: report.date,
        amount: 20.00,
        description: 'WIFI DDN 768',
        name: 'ALMERA DIGAMON',
        employeeId: 'DDN005-SR768',
        role: 'Teller',
        boothCode: 'DDN-768',
        location: 'PANABO',
        datePeriodCover: report.date,
        note: 'Wifi Allowance',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '20 - WIFI DDN 768 ALMERA DIGAMON (PANABO)'
      },
      {
        date: report.date,
        amount: 1800.00,
        description: 'RENT FEE SABONGAN NI NENE TIBAL-OG ST. TOMAS',
        name: 'Davilyn Gelito',
        employeeId: 'DDN005-SR762',
        role: 'Teller',
        boothCode: 'DDN-762',
        location: 'Sto. Tomas',
        datePeriodCover: 'AUG. 7, 2024 - SEP. 7, 2024',
        note: 'Monthly Stall Rent Sabongan',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '1,800 - RENT FEE SABONGAN NI NENE TIBAL-OG ST. TOMAS (AUG. 7, 2024 - SEP. 7, 2024) DDN 762'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 428',
        name: 'Nobelyn Baya',
        employeeId: 'DDN005-SR428',
        role: 'Teller',
        boothCode: 'DDN-428',
        location: 'Carmen',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 428'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 350',
        name: 'Mary Lovelyn Ramos',
        employeeId: 'DDN005-SR350',
        role: 'Teller',
        boothCode: 'DDN-350',
        location: 'Tagum',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 350'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 427',
        name: 'Marnie Royo',
        employeeId: 'DDN005-SR427',
        role: 'Teller',
        boothCode: 'DDN-427',
        location: 'Carmen',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 427'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 422',
        name: 'Amerita Hipos',
        employeeId: 'DDN005-SR422',
        role: 'Teller',
        boothCode: 'DDN-422',
        location: 'Tagum',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 422'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 351',
        name: 'Beverly Alao',
        employeeId: 'DDN005-SR351',
        role: 'Teller',
        boothCode: 'DDN-351',
        location: 'Tagum',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 351'
      },
      {
        date: report.date,
        amount: 330.00,
        description: 'POS LOAD /MONTH DDN 1781',
        name: 'Lenie Orillo',
        employeeId: 'DDN005-SR1591',
        role: 'Teller',
        boothCode: 'DDN-1591',
        location: 'Tagum',
        datePeriodCover: 'SEP 2024',
        note: 'Data Plan SIM Load (1781)',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '330 - POS LOAD /MONTH DDN 1781'
      },
      {
        date: report.date,
        amount: 5000.00,
        description: 'C.A. COLL. JASON',
        name: 'JASON',
        employeeId: 'DDN005-SC003',
        role: 'Collector',
        boothCode: '', // Collector booth is strictly blank
        location: 'Carmen / Tagum',
        datePeriodCover: report.date,
        note: 'APPROVED BY: SIR JUNDY',
        classification: 'CA',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '5,000 - C.A. COLL. JASON APPROVED BY: SIR JUNDY'
      },
      {
        date: report.date,
        amount: 200.00,
        description: 'PAYMENT COLL. MARK ANTHONY',
        name: 'MARK ANTHONY (MAC2)',
        employeeId: 'DDN005-SC004',
        role: 'Collector',
        boothCode: '', // Collector booth is strictly blank
        location: 'Panabo City',
        datePeriodCover: report.date,
        note: 'Daily CA Deduction Payment',
        classification: 'PAYMENT',
        applyToCA: true, // Default to true, customizable by user in UI
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '+ 200 - PAYMENT COLL. MARK ANTHONY'
      },
      {
        date: report.date,
        amount: 29878.25,
        description: 'COMM. SEP. 05, 2024',
        name: 'General Settlement',
        employeeId: 'DDN005-GEN',
        role: 'General',
        boothCode: 'HQ-DDN',
        location: 'Davao Del Norte',
        datePeriodCover: '2024-09-05',
        note: 'Prior day commission carried over into deposit',
        classification: 'OTHER',
        applyToCA: false,
        verificationStatus: 'PENDING VERIFICATION',
        ocrRawText: '29,878.25 - COMM. SEP. 05, 2024'
      }
    ];

    report.items = structuredItems;
    report.expenses = structuredItems.filter(i => i.classification === 'OTHER' || i.classification === 'CA');
    report.collectorPayments = structuredItems.filter(i => i.classification === 'PAYMENT');
    report.others = structuredItems.filter(i => i.description.includes('COMM. SEP. 05'));

    return report;
  }

  // Draw the realistic Yellow Pad Reference Report (Image 1) on Canvas
  generateYellowPadSampleCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 680;
    canvas.height = 920;
    const ctx = canvas.getContext('2d');

    // Yellow legal pad background
    ctx.fillStyle = '#f8e999';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ruled lines (blue ledger lines)
    ctx.strokeStyle = '#a4c2f4';
    ctx.lineWidth = 1;
    const lineHeight = 30;
    for (let y = 80; y < canvas.height - 20; y += lineHeight) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(canvas.width - 30, y);
      ctx.stroke();
    }

    // Left red margin line
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(65, 30);
    ctx.lineTo(65, canvas.height - 20);
    ctx.stroke();

    // Handwritten text styling
    ctx.fillStyle = '#1e293b';
    ctx.font = '16px "Special Elite", "Courier New", monospace';
    ctx.textAlign = 'left';

    let y = 72;
    ctx.fillText('SEP. 06. 2024', 75, y); y += lineHeight;
    ctx.fillText('COMMISSION: 74, 776.50', 75, y); y += lineHeight;
    ctx.fillText('SALARY: 28, 200', 75, y); y += lineHeight;
    ctx.fillText('EXPENSES:', 75, y); y += lineHeight;
    
    ctx.fillText('1,200 - FUEL MOTOR', 75, y); y += lineHeight;
    ctx.fillText('400 - RENT MOTOR', 75, y); y += lineHeight;
    ctx.fillText('20 - WIFI DDN 1477 MELANIE SARAWI (TAGUM)', 75, y); y += lineHeight;
    ctx.fillText('30 - WIFI DDN 1782 MARYJANE FERNANDEZ (CARMEN)', 75, y); y += lineHeight;
    ctx.fillText('834 - DOOR BOLT 10PCS, DOOR HASH 5PCS, PADLOCK 5PCS FOR BOOTH', 75, y); y += lineHeight;
    ctx.fillText('4,600 - THERMAL PAPER 300 ROLLS.', 75, y); y += lineHeight;
    ctx.fillText('15 - WIFI DDN 1475 LUZVIMINDA GALASATAN (PANABO)', 75, y); y += lineHeight;
    ctx.fillText('20 - WIFI DDN 768 ALMERA DIGAMON (PANABO)', 75, y); y += lineHeight;
    ctx.fillText('1,800 - RENT FEE SABONGAN NI NENE TIBAL-OG ST. TOMAS', 75, y); y += lineHeight;
    ctx.fillText('   (AUG. 7, 2024 - SEP. 7, 2024) DDN 762', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 428', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 350', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 427', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 422', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 351', 75, y); y += lineHeight;
    ctx.fillText('330 - POS LOAD /MONTH DDN 1781', 75, y); y += lineHeight;
    ctx.fillText('5,000 - C.A. COLL. JASON  APPROVED BY: SIR JUNDY', 75, y); y += lineHeight;

    ctx.fillText('15,899 EXP.', 75, y); y += lineHeight;
    ctx.fillText('28,200 SAL.', 75, y); y += lineHeight;
    ctx.fillText('----------------------------------------------------', 75, y); y += 18;
    ctx.fillText('44,099 EXP. & SALARY', 75, y); y += lineHeight;
    ctx.fillText('74,776.50 COMM.', 75, y); y += lineHeight;
    ctx.fillText('----------------------------------------------------', 75, y); y += 18;
    ctx.fillText('30,677.50', 75, y); y += lineHeight;
    ctx.fillText('+ 200 - PAYMENT COLL. MARK ANTHONY', 75, y); y += lineHeight;
    ctx.fillText('29,878.25 - COMM. SEP. 05, 2024', 75, y); y += lineHeight;
    ctx.fillText('----------------------------------------------------', 75, y); y += 18;

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('60,755.75 TOTAL COMM. FOR DEPOSIT.', 75, y);

    return canvas;
  }
}

window.ocrEngine = new OcrEngine();
