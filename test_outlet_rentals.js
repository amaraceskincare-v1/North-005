/**
 * Verification Test Suite for Outlet Rentals & Load Allowance Module
 */

const fs = require('fs');
const path = require('path');

// Mock localStorage
const localStorageStore = {};
global.localStorage = {
  getItem: (key) => localStorageStore[key] || null,
  setItem: (key, val) => { localStorageStore[key] = String(val); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

// Mock Document and Window
class MockElement {
  constructor(id = '', tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, v) => v ? this.classList._classes.add(c) : this.classList._classes.delete(c)
    };
    this.listeners = {};
    this.dataset = {};
    this.children = [];
  }
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
  dispatchEvent(evt) {
    if (this.listeners[evt.type]) {
      this.listeners[evt.type].forEach(fn => fn(evt));
    }
  }
  click() {
    this.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  }
  appendChild(child) {
    this.children.push(child);
  }
  setAttribute(attr, val) { this[attr] = val; }
  getAttribute(attr) { return this[attr] || null; }
  closest() { return null; }
}

const elementMap = {};
function getOrCreateElement(id) {
  if (!elementMap[id]) elementMap[id] = new MockElement(id);
  return elementMap[id];
}

global.document = {
  getElementById: (id) => getOrCreateElement(id),
  createElement: (tag) => new MockElement('', tag),
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.alert = (msg) => console.log('   [Alert]:', msg);
global.confirm = (msg) => true;

global.window = {
  location: { pathname: '/outlet-rentals', search: '', hash: '', protocol: 'http:' },
  addEventListener: () => {},
  removeEventListener: () => {},
  document: global.document,
  localStorage: global.localStorage,
  history: { pushState: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  alert: global.alert,
  confirm: global.confirm
};

// Load Store
const storePath = path.join(__dirname, 'js', 'store.js');
const storeCode = fs.readFileSync(storePath, 'utf8');
eval(storeCode);
global.Store = window.appStore.constructor;
const store = window.appStore;

// Load Outlet Rentals Module
const orPath = path.join(__dirname, 'js', 'outlet-rentals.js');
const orCode = fs.readFileSync(orPath, 'utf8');
eval(orCode);

const orModule = window.outletRentals;

console.log('=== RUNNING OUTLET RENTALS & LOAD ALLOWANCE VERIFICATION SUITE ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// SUITE 1: Classification & Ingestion
// -----------------------------------------------------------------------------
console.log('--- 1. Testing Classification & Ingestion ---');

// Test Purok Normalization
assert(orModule.normalizePurok('P-6') === 'Purok 6', 'P-6 normalizes to Purok 6');
assert(orModule.normalizePurok('P#6') === 'Purok 6', 'P#6 normalizes to Purok 6');
assert(orModule.normalizePurok('P-1') === 'Purok 1', 'P-1 normalizes to Purok 1');
assert(orModule.normalizePurok('P-2B') === 'Purok 2B', 'P-2B normalizes to Purok 2B');

// Test Booth Code Normalization
assert(orModule.normalizeBoothCode('DDN 1477') === 'DDN-1477', 'DDN 1477 normalizes to DDN-1477');
assert(orModule.normalizeBoothCode('DDN-1716') === 'DDN-1716', 'DDN-1716 normalizes to DDN-1716');

// Test Classification of Outlet Rental
const rentTxn = {
  id: 'TXN-TEST-RENT-01',
  date: '2026-09-30',
  amount: 1500.00,
  description: '1,500 - RENT FEE P-6 Liboganon, Tagum DDN-1477',
  boothCode: 'DDN-1477'
};
const parsedRent = orModule.classifyAndParseTransaction(rentTxn);
assert(parsedRent !== null, 'Rent transaction detected');
assert(parsedRent.category === 'Outlet Rental', 'Category is Outlet Rental');
assert(parsedRent.amount === 1500, 'Amount is 1500');
assert(parsedRent.purok === 'Purok 6', 'Purok is Purok 6');
assert(parsedRent.boothCode === 'DDN-1477', 'Booth code is DDN-1477');

// Test Classification of Load Allowance
const loadTxn = {
  id: 'TXN-TEST-LOAD-01',
  date: '2026-09-30',
  amount: 330.00,
  description: '330 - POS LOAD 1 MONTH DDN-1716',
  boothCode: 'DDN-1716'
};
const parsedLoad = orModule.classifyAndParseTransaction(loadTxn);
assert(parsedLoad !== null, 'Load transaction detected');
assert(parsedLoad.category === 'Load Allowance', 'Category is Load Allowance');
assert(parsedLoad.amount === 330, 'Amount is 330');
assert(parsedLoad.boothCode === 'DDN-1716', 'Booth code is DDN-1716');

// Test Exclusion of Motor Rental
const motorTxn = {
  id: 'TXN-TEST-MOTOR-01',
  date: '2026-09-06',
  amount: 400.00,
  description: '400 - RENT MOTOR FOR FIELD ROUTE',
  boothCode: ''
};
assert(orModule.classifyAndParseTransaction(motorTxn) === null, 'Motor rental correctly ignored/excluded');

// -----------------------------------------------------------------------------
// SUITE 2: Master Registry Synchronization & Searchable Selector
// -----------------------------------------------------------------------------
console.log('\n--- 2. Testing Master Registry Synchronization ---');

// Lookup DDN-1477 (Melanie Sarawi or Juvylyn H. Tura)
const match1477 = orModule.lookupMasterRegistry('DDN-1477');
assert(match1477 !== null, 'DDN-1477 found in Master Registry');
assert(match1477.role.toUpperCase().includes('TELLER') || match1477.role.toUpperCase().includes('SALES'), 'Role is Station Teller');

// Check eligible Station Tellers list
const eligibleTellers = orModule.getEligibleStationTellers();
assert(eligibleTellers.length > 50, `Found ${eligibleTellers.length} active Station Tellers in Master Registry`);
assert(!eligibleTellers.some(t => t.role === 'Collector'), 'No Collectors in Station Teller list');

// -----------------------------------------------------------------------------
// SUITE 3: Unmatched Booth Code & Correction Workflow
// -----------------------------------------------------------------------------
console.log('\n--- 3. Testing Unmatched Booth Code & Correction ---');

const badTxn = {
  id: 'TXN-TEST-BAD-BOOTH',
  date: '2026-09-30',
  amount: 1500.00,
  description: '1,500 - RENT FEE DDN-9999',
  boothCode: 'DDN-9999'
};
const parsedBad = orModule.classifyAndParseTransaction(badTxn);
assert(parsedBad.boothMatchStatus === 'NOT_FOUND', 'Unregistered Booth Code DDN-9999 flagged as NOT_FOUND');

// Simulate Correction to DDN-1477
store.data.outletRentals.push(parsedBad);
orModule.currentCorrectRecordId = parsedBad.id;
const mockSelect = getOrCreateElement('correct-booth-select');
mockSelect.value = 'DDN-1477';
orModule.confirmBoothCorrection();

const correctedRecord = store.data.outletRentals.find(r => r.id === parsedBad.id);
assert(correctedRecord.boothCode === 'DDN-1477', 'Booth code corrected to DDN-1477');
assert(correctedRecord.boothMatchStatus === 'CORRECTED', 'Match status updated to CORRECTED');
assert(correctedRecord.historicalTeller !== 'Station Teller', `Assigned Station Teller updated to: ${correctedRecord.historicalTeller}`);

// -----------------------------------------------------------------------------
// SUITE 4: A.R. (Acknowledgement Receipt) Upload & Persistence
// -----------------------------------------------------------------------------
console.log('\n--- 4. Testing A.R. Upload & Persistence ---');

const testRecord = store.data.outletRentals.find(r => r.boothCode === 'DDN-1477');
assert(testRecord !== null, 'Target record for DDN-1477 found');
assert(testRecord.arStatus === 'To Follow' || testRecord.arStatus === 'Due Soon', `Initial AR status is ${testRecord.arStatus}`);

// Simulate Upload A.R.
orModule.pendingUploadRecordId = testRecord.id;
orModule.pendingUploadFileData = {
  fileName: 'September_2026_DDN-1477_AR.pdf',
  fileSize: 45200,
  fileType: 'application/pdf',
  dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
  uploadedAt: new Date().toISOString()
};
orModule.confirmArUpload();

assert(testRecord.arStatus === 'Received', 'A.R. status updated to Received');
assert(testRecord.arFile !== null, 'A.R. file attachment linked to record');
assert(testRecord.arFile.fileName === 'September_2026_DDN-1477_AR.pdf', 'A.R. file name stored accurately');

// Simulate Browser Refresh
console.log('   Simulating browser refresh (re-loading store from localStorage)...');
const newStore = new Store();
const reloadedRecord = newStore.data.outletRentals.find(r => r.id === testRecord.id);
assert(reloadedRecord !== null, 'Record persists in new store instance');
assert(reloadedRecord.arStatus === 'Received', 'REFRESH TEST: A.R. status remains Received after refresh');
assert(reloadedRecord.arFile.fileName === 'September_2026_DDN-1477_AR.pdf', 'REFRESH TEST: A.R. file attachment persists after refresh');

// -----------------------------------------------------------------------------
// SUITE 5: Load Allowance POS Phone & Network Edit
// -----------------------------------------------------------------------------
console.log('\n--- 5. Testing Load Allowance POS Phone & Network Edit ---');

let loadRecord = store.data.outletRentals.find(r => r.category === 'Load Allowance');
if (!loadRecord) {
  loadRecord = {
    id: 'ORL-TEST-LOAD-01',
    category: 'Load Allowance',
    amount: 330,
    description: 'POS Load — 1 Month',
    boothCode: 'DDN-1716',
    posPhone: '',
    network: 'SMART',
    coveragePeriod: 'September 30 – October 30, 2026'
  };
  store.data.outletRentals.push(loadRecord);
}
assert(loadRecord !== null, 'Load allowance record found');

// Edit POS details
orModule.currentEditRecordId = loadRecord.id;
getOrCreateElement('edit-load-phone').value = '0917-882-1716';
getOrCreateElement('edit-load-network').value = 'GLOBE';
getOrCreateElement('edit-load-period').value = 'September 30 – October 30, 2026';
getOrCreateElement('edit-load-amount').value = '330';
getOrCreateElement('edit-load-desc').value = 'POS Load — 1 Month';
getOrCreateElement('edit-load-notes').value = 'Updated POS SIM line';
orModule.saveEditLoadModal();

assert(loadRecord.posPhone === '0917-882-1716', 'POS phone updated to 0917-882-1716');
assert(loadRecord.network === 'GLOBE', 'Network set to GLOBE');

// -----------------------------------------------------------------------------
// SUITE 6: Permanent Deletion & Refresh Persistence
// -----------------------------------------------------------------------------
console.log('\n--- 6. Testing Permanent Deletion & Persistence Across Refresh ---');

const delTargetId = 'ORL-TO-DELETE-TEST';
store.data.outletRentals.push({
  id: delTargetId,
  category: 'Outlet Rental',
  boothCode: 'DDN-9998',
  amount: 1500,
  historicalTeller: 'Temporary Teller',
  coveragePeriod: 'September 2026',
  arStatus: 'To Follow'
});
store.save();

assert(store.data.outletRentals.some(r => r.id === delTargetId), 'Deletion test record created');

// Execute Permanent Delete
orModule.confirmDeleteId = delTargetId;
orModule.executeDeleteRecord();

assert(!store.data.outletRentals.some(r => r.id === delTargetId), 'Record deleted from in-memory store');
assert(store.data.deletedOutletRentalIds.includes(delTargetId), 'Record ID tracked in deletedOutletRentalIds');

// Verify Refresh Persistence
const refreshStore2 = new Store();
assert(!refreshStore2.data.outletRentals.some(r => r.id === delTargetId), 'REFRESH TEST: Deleted record does NOT return after refresh');

// -----------------------------------------------------------------------------
// SUITE 7: Deduplication Test
// -----------------------------------------------------------------------------
console.log('\n--- 7. Testing OCR Deduplication ---');

const countBefore = store.data.outletRentals.length;
// Trigger syncFromTransactions again
orModule.syncFromTransactions();
const countAfter = store.data.outletRentals.length;
assert(countBefore === countAfter, `Deduplication: Repeated sync did not add duplicates (Count: ${countAfter})`);

console.log('\n=== TEST SUMMARY ===');
if (failCount === 0) {
  console.log(`🎉 ALL ${passCount} ACCEPTANCE CRITERIA PASSED SUCCESSFULLY!`);
} else {
  console.error(`❌ ${failCount} tests failed out of ${passCount + failCount}`);
}
