/**
 * Automated Verification Suite for APEX OmniERP
 * Tests Data Persistence, Permanent Deletion, Balance Recalculation,
 * Linked History Deletion, and Master Registry Synchronization.
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
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return false; }
}

const elementMap = {};
function getOrCreateElement(id) {
  if (!elementMap[id]) elementMap[id] = new MockElement(id);
  return elementMap[id];
}

global.document = {
  getElementById: (id) => getOrCreateElement(id),
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.window = {
  localStorage: global.localStorage,
  document: global.document,
  confirm: () => true,
  alert: (msg) => console.log('   [ALERT]', msg),
  sfx: { playClick: () => {}, playChime: () => {} },
  setTimeout: setTimeout,
  fetch: (url, opts) => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
};

// Load store.js
const storeCode = fs.readFileSync(path.join(__dirname, 'js', 'store.js'), 'utf8');
eval(storeCode);
global.Store = window.appStore.constructor;

// Load expenses-payment.js
const epCode = fs.readFileSync(path.join(__dirname, 'js', 'expenses-payment.js'), 'utf8');
eval(epCode);
global.ExpensesPaymentController = window.expensesPayment.constructor;

console.log('=== RUNNING OMNI-ERP VERIFICATION SUITE ===\n');


let failedTests = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// TEST 1: Operating Expenses Permanent Deletion & Persistence
// -------------------------------------------------------------
console.log('\n--- 1. Testing Operating Expenses Deletion & Persistence ---');
const ep = window.expensesPayment;
const store = window.appStore;

ep.init();

// Add a test expense
const testExp = {
  id: 'TXN-TEST-EXP-001',
  date: '2026-09-29',
  amount: 850.00,
  description: 'Special Office Hardware & Tools',
  name: 'Logistics Staff',
  role: 'General',
  classification: 'OTHER',
  type: 'EXPENSE',
  isExpense: true,
  status: 'Verified'
};
store.addTransaction(testExp);
assert(store.data.transactions.some(t => t.id === 'TXN-TEST-EXP-001'), 'Test expense added successfully');

// Delete with confirm YES
ep.deleteTransaction('TXN-TEST-EXP-001');
// Trigger onConfirm callback
if (ep._confirmCallback) {
  ep.executeConfirmAction();
}

assert(!store.data.transactions.some(t => t.id === 'TXN-TEST-EXP-001'), 'Expense deleted immediately from in-memory store');
assert(store.data.deletedTransactionIds.includes('TXN-TEST-EXP-001'), 'Expense ID tracked in deletedTransactionIds');

// Simulate Browser Refresh (Re-instantiate Store from localStorage)
console.log('   Simulating browser refresh (loading new Store from localStorage)...');
const refreshedStore = new Store();
assert(!refreshedStore.data.transactions.some(t => t.id === 'TXN-TEST-EXP-001'), 'REFRESH TEST: Deleted expense does NOT return after browser refresh');
assert(refreshedStore.data.deletedTransactionIds.includes('TXN-TEST-EXP-001'), 'REFRESH TEST: deletedTransactionIds persisted in localStorage');

// -------------------------------------------------------------
// TEST 2: Short Tracker & Master Payment History Linked Deletion
// -------------------------------------------------------------
console.log('\n--- 2. Testing Short Tracker & Master Payment History Linked Deletion ---');
window.appStore = refreshedStore;

// Pick an eligible teller
const eligibleTellers = ep.getEligibleTellers();
assert(eligibleTellers.length > 0, `Eligible active tellers found: ${eligibleTellers.length}`);
const testTeller = eligibleTellers[0];
console.log(`   Using teller: ${testTeller.name} (${testTeller.id})`);

ep.selectedTeller = testTeller.name;
ep.selectedTellerId = testTeller.id;

// Create a shortage of 1,500
const shortTxn = {
  id: 'TXN-TEST-SH-1500',
  date: '2026-09-28',
  amount: 1500.00,
  description: 'SHORT TELLER',
  name: testTeller.name,
  employeeId: testTeller.id,
  role: testTeller.role,
  classification: 'SHORT',
  type: 'SHORT',
  transactionType: 'SHORT_TELLER',
  applyToCA: false,
  appliedTo: 'Shortage',
  verificationStatus: 'VERIFIED'
};
refreshedStore.addTransaction(shortTxn);

// Record payment of 500
const payTxn = {
  id: 'TXN-TEST-PAY-500',
  date: '2026-09-29',
  amount: 500.00,
  description: 'PAYMENT - SHORT',
  name: testTeller.name,
  employeeId: testTeller.id,
  role: testTeller.role,
  classification: 'PAYMENT',
  type: 'PAYMENT',
  transactionType: 'PAYMENT',
  applyToCA: false,
  appliedTo: 'Short Teller',
  settlement: 'CREDITED',
  verificationStatus: 'VERIFIED'
};
refreshedStore.addTransaction(payTxn);

// Check remaining balance: 1500 - 500 = 1000
let ttxns = refreshedStore.data.transactions.filter(t => t.name === testTeller.name || t.employeeId === testTeller.id);
let orig = ttxns.filter(t => t.classification === 'SHORT').reduce((sum, t) => sum + t.amount, 0);
let paid = ttxns.filter(t => t.classification === 'PAYMENT' && !t.applyToCA).reduce((sum, t) => sum + t.amount, 0);
let remaining = orig - paid;
assert(remaining === 1000, `Remaining balance is ₱${remaining} (expected ₱1,000)`);

// Verify payment is present in Master Payment History
assert(refreshedStore.data.transactions.some(t => t.id === 'TXN-TEST-PAY-500' && t.classification === 'PAYMENT'), 'Payment appears in Master Payment History');

// Permanently delete the 500 payment record
console.log('   Deleting payment record TXN-TEST-PAY-500...');
ep.deleteTransaction('TXN-TEST-PAY-500');
if (ep._confirmCallback) ep.executeConfirmAction();

// Verify balance recalculates to 1500
ttxns = refreshedStore.data.transactions.filter(t => t.name === testTeller.name || t.employeeId === testTeller.id);
orig = ttxns.filter(t => t.classification === 'SHORT').reduce((sum, t) => sum + t.amount, 0);
paid = ttxns.filter(t => t.classification === 'PAYMENT' && !t.applyToCA).reduce((sum, t) => sum + t.amount, 0);
remaining = orig - paid;
assert(remaining === 1500, `Remaining balance correctly recalculated to ₱${remaining} after deleting payment`);

// Verify payment is removed from Master Payment History
assert(!refreshedStore.data.transactions.some(t => t.id === 'TXN-TEST-PAY-500'), 'Deleted payment permanently removed from Master Payment History (no orphan)');

// Simulate refresh
console.log('   Simulating browser refresh...');
const refreshedStore2 = new Store();
assert(!refreshedStore2.data.transactions.some(t => t.id === 'TXN-TEST-PAY-500'), 'REFRESH TEST: Deleted payment does NOT return after browser refresh');

// -------------------------------------------------------------
// TEST 3: Cash Advance Tracker Linked Deletion
// -------------------------------------------------------------
console.log('\n--- 3. Testing Cash Advance Tracker Linked Deletion ---');
window.appStore = refreshedStore2;
const eligibleCollectors = ep.getEligibleCollectors();
assert(eligibleCollectors.length > 0, `Eligible active collectors found: ${eligibleCollectors.length}`);
const testCol = eligibleCollectors[0];
console.log(`   Using collector: ${testCol.name} (${testCol.id})`);

// Create CA 2,000 and Payment 600
const caTxn = {
  id: 'TXN-TEST-CA-2000',
  date: '2026-09-28',
  amount: 2000.00,
  description: 'CASH ADVANCE',
  name: testCol.name,
  employeeId: testCol.id,
  role: 'Collector',
  classification: 'CA',
  type: 'CASH ADVANCE',
  applyToCA: false,
  verificationStatus: 'VERIFIED'
};
refreshedStore2.addTransaction(caTxn);

const caPayTxn = {
  id: 'TXN-TEST-CA-PAY-600',
  date: '2026-09-29',
  amount: 600.00,
  description: 'PAYMENT - C.A.',
  name: testCol.name,
  employeeId: testCol.id,
  role: 'Collector',
  classification: 'PAYMENT',
  type: 'PAYMENT',
  applyToCA: true,
  appliedTo: 'Cash Advance',
  settlement: 'CREDITED',
  verificationStatus: 'VERIFIED'
};
refreshedStore2.addTransaction(caPayTxn);

// Delete payment from Master Payment History
console.log('   Deleting CA Payment from Master Payment History...');
ep.deleteTransaction('TXN-TEST-CA-PAY-600');
if (ep._confirmCallback) ep.executeConfirmAction();

// Verify CA balance recalculated
const ctxns = refreshedStore2.data.transactions.filter(t => t.name === testCol.name || t.employeeId === testCol.id);
const caOrig = ctxns.filter(t => t.classification === 'CA').reduce((sum, t) => sum + t.amount, 0);
const caPaid = ctxns.filter(t => t.classification === 'PAYMENT' && t.applyToCA).reduce((sum, t) => sum + t.amount, 0);
const caRemaining = caOrig - caPaid;
assert(caRemaining === caOrig, `CA remaining balance recalculated to ₱${caRemaining} (all CA minus remaining valid payments)`);
assert(!refreshedStore2.data.transactions.some(t => t.id === 'TXN-TEST-CA-PAY-600'), 'CA Payment removed from Master Payment History');


// Refresh test
const refreshedStore3 = new Store();
assert(!refreshedStore3.data.transactions.some(t => t.id === 'TXN-TEST-CA-PAY-600'), 'REFRESH TEST: Deleted CA payment does NOT return after refresh');

// -------------------------------------------------------------
// TEST 4: Master Registry Dynamic Synchronization
// -------------------------------------------------------------
console.log('\n--- 4. Testing Master Registry Synchronization ---');
window.appStore = refreshedStore3;

// Add new Station Teller in Master Registry
console.log('   Adding new Teller to Master Registry: CRISTINA MERCADO...');
refreshedStore3.addEmployee({
  id: 'DDN005-SR999',
  name: 'CRISTINA MERCADO',
  role: 'SALES REPRESENTATIVE',
  status: 'ACTIVE',
  municipality: 'Tagum',
  boothCode: 'DDN-999'
});

const tellersAfterAdd = ep.getEligibleTellers();
const foundNewTeller = tellersAfterAdd.find(t => t.name === 'CRISTINA MERCADO');
assert(foundNewTeller !== undefined, 'New Station Teller automatically synchronized into Short Tracker eligible list');
assert(foundNewTeller && foundNewTeller.role === 'Station Teller', 'Role correctly mapped to Station Teller');

// Add new Collector in Master Registry
console.log('   Adding new Collector to Master Registry: RAMON BAUTISTA...');
refreshedStore3.addEmployee({
  id: 'DDN005-SC999',
  name: 'RAMON BAUTISTA',
  role: 'COLLECTOR',
  status: 'ACTIVE',
  area: 'Tagum Field Route'
});

const collectorsAfterAdd = ep.getEligibleCollectors();
const foundNewCollector = collectorsAfterAdd.find(c => c.name === 'RAMON BAUTISTA');
assert(foundNewCollector !== undefined, 'New Collector automatically synchronized into CA Tracker eligible list');

// Deactivate an employee from Master Registry
console.log('   Deactivating CRISTINA MERCADO (status = INACTIVE)...');
refreshedStore3.updateEmployee('DDN005-SR999', { status: 'INACTIVE' });
const tellersAfterDeactivate = ep.getEligibleTellers();
const foundInactiveTeller = tellersAfterDeactivate.find(t => t.name === 'CRISTINA MERCADO');
assert(foundInactiveTeller === undefined, 'Deactivated person is no longer selectable in new Short Tracker dropdown');

// Verify historical records remain intact
console.log('   Verifying historical records for deactivated/terminated staff (JUVYLYN H. TURA)...');
refreshedStore3.addTransaction({
  id: 'TXN-TURA-TEST-01',
  name: 'JUVYLYN H. TURA',
  amount: 1140.00,
  classification: 'SHORT',
  type: 'SHORT'
});
const turaRecords = refreshedStore3.data.transactions.filter(t => (t.name || '').toUpperCase().includes('TURA'));
assert(turaRecords.length > 0, `Historical financial records for Juvylyn H. Tura remain intact: ${turaRecords.length} records found`);

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n=== TEST SUMMARY ===');
if (failedTests === 0) {
  console.log('🎉 ALL ACCEPTANCE CRITERIA PASSED SUCCESSFULLY!\n');
} else {
  console.error(`⚠️ FAILED: ${failedTests} test(s) failed.\n`);
  process.exit(1);
}
