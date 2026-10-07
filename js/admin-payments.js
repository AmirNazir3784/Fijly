/* Admin Payments and Pricing.

   Payments: the three milestone rows every project is created with (15% to
   start, 45% at storyboard approval, 40% on final delivery). Marking one paid
   goes through admin_set_payment_status, which also advances the project's
   stage — Awaiting Payment becomes Project Submitted once the deposit is in.
   Nothing here charges a card: invoices are sent by hand through PayPal.

   Pricing: the 3 x 4 grid behind public.pricing (base / script / voice over,
   for 30, 60, 90 and 120 seconds). The order page shows these figures and
   submit_project() prices every project from them server-side, so this screen
   only edits the list. */
(function () {
  'use strict';
  var api = window.FijlyData;
  if (!document.getElementById('screen-payments')) return;
  var state = api.state;

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function cell(row, child, className) {
    var td = node('td', className);
    td.append(typeof child === 'string' ? document.createTextNode(child) : child);
    row.append(td);
  }
  function busy(control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); return function () { control.disabled = false; control.removeAttribute('aria-busy'); }; }
  function clientName(id) { var found = state.clients.find(function (c) { return c.id === id; }); return found ? found.name : 'Client not available'; }

  /* ======================================================================
     Payments
     ====================================================================== */
  var statusFilter = document.getElementById('payment-status-filter');
  var clientFilter = document.getElementById('payment-client-filter');
  var rowsEl = document.getElementById('payment-rows');
  var countEl = document.getElementById('payment-count');
  var empty = document.getElementById('payment-empty');
  var emptyTitle = document.getElementById('payment-empty-title');
  var emptyText = document.getElementById('payment-empty-text');
  var clearFilters = document.getElementById('payment-clear-filters');
  var saveStatus = document.getElementById('payment-save-status');
  var dialog = document.getElementById('payment-detail');
  var dialogTitle = document.getElementById('payment-detail-title');
  var dialogBody = document.getElementById('payment-detail-body');
  var dialogError = document.getElementById('payment-detail-error');
  var methodGroup = document.getElementById('payment-method-group');
  var referenceGroup = document.getElementById('payment-reference-group');
  var methodInput = document.getElementById('payment-method');
  var referenceInput = document.getElementById('payment-reference');
  var confirmButton = document.getElementById('payment-confirm');
  // The payment and the status the open dialog will set.
  var pendingChange = null;

  function visiblePayments() {
    return state.payments.filter(function (payment) {
      return (statusFilter.value === 'all' || payment.status === statusFilter.value)
        && (clientFilter.value === 'all' || payment.client === clientFilter.value);
    });
  }
  // Mark paid / waived / refunded, or put a settled payment back to due.
  function actionsFor(payment) {
    var box = node('div', 'admin-row-actions');
    var offered = payment.status === 'due' ? [['paid', 'Mark paid'], ['waived', 'Mark waived']]
      : payment.status === 'paid' ? [['refunded', 'Mark refunded'], ['due', 'Reset to due']]
      : [['paid', 'Mark paid'], ['due', 'Reset to due']];
    offered.forEach(function (pair) {
      var control = node('button', 'btn-link', pair[1]);
      control.type = 'button';
      control.dataset.payment = payment.id;
      control.dataset.status = pair[0];
      control.setAttribute('aria-label', pair[1] + ': ' + api.milestoneLabel(payment.milestone) + ' for ' + payment.project);
      box.append(control);
    });
    return box;
  }
  function renderPayments() {
    var records = visiblePayments();
    rowsEl.replaceChildren();
    records.forEach(function (payment) {
      var row = node('tr');
      cell(row, clientName(payment.client));
      var project = node('div');
      project.append(node('span', undefined, payment.project));
      if (payment.stage) project.append(node('span', 'admin-muted admin-block', payment.stage));
      cell(row, project);
      cell(row, api.milestoneLabel(payment.milestone));
      cell(row, payment.percent + '%', 'num');
      cell(row, api.formatMoney(payment.amount, 'Not priced'), 'num');
      var status = node('div');
      status.append(node('span', api.paymentClass(payment.status), api.paymentLabel(payment.status)));
      // Due AND required by the stage is what the studio should invoice now.
      if (payment.status === 'due' && payment.required) status.append(node('span', 'admin-muted admin-block', 'Due now'));
      cell(row, status);
      cell(row, payment.paidAt ? api.formatDate(payment.paidAt) : '—', 'admin-date');
      cell(row, actionsFor(payment));
      rowsEl.append(row);
    });
    countEl.textContent = records.length + ' of ' + state.payments.length + (state.payments.length === 1 ? ' payment' : ' payments');
    var filtered = statusFilter.value !== 'all' || clientFilter.value !== 'all';
    empty.hidden = records.length > 0;
    emptyTitle.textContent = state.payments.length ? 'No matching payments' : 'No payments yet';
    emptyText.textContent = state.payments.length
      ? 'Try another status or client.'
      : 'Milestones appear here as soon as a project is submitted.';
    clearFilters.hidden = !filtered || !state.payments.length;
    updateBadge();
  }
  // The sidebar count is the payments that are due and payable right now.
  function updateBadge() {
    var link = document.querySelector('.sidebar-link[data-screen="payments"]');
    if (!link) return;
    var counter = link.querySelector('[data-payment-badge]');
    if (!counter) { counter = node('span', 'sidebar-count'); counter.dataset.paymentBadge = ''; link.append(counter); }
    var count = api.duePayments().length;
    counter.textContent = count;
    counter.hidden = !count;
    counter.setAttribute('aria-label', count + (count === 1 ? ' payment due' : ' payments due'));
  }

  function openPaymentDialog(id, status) {
    var payment = state.payments.find(function (item) { return item.id === id; });
    if (!payment) return;
    pendingChange = { id: id, status: status };
    var labels = { paid: 'Mark paid', waived: 'Mark waived', refunded: 'Mark refunded', due: 'Reset to due' };
    dialogTitle.textContent = labels[status];
    var facts = node('dl', 'admin-detail-facts');
    [['Client', clientName(payment.client)], ['Project', payment.project],
      ['Milestone', api.milestoneLabel(payment.milestone) + ' · ' + payment.percent + '%'],
      ['Amount', api.formatMoney(payment.amount, 'Not priced')], ['Current status', api.paymentLabel(payment.status)]].forEach(function (pair) {
      var group = node('div');
      group.append(node('dt', undefined, pair[0]), node('dd', undefined, pair[1]));
      facts.append(group);
    });
    var note = status === 'paid' ? 'The project moves to its next stage once this is saved.'
      : status === 'waived' ? 'A waived milestone counts as settled and advances the project.'
      : status === 'refunded' ? 'The project stays where it is; only this payment changes.'
      : 'This milestone goes back to due. The project stage is not changed back.';
    dialogBody.replaceChildren(facts, node('p', 'admin-muted', note));
    // Method and reference are only recorded for a payment actually received.
    methodGroup.hidden = referenceGroup.hidden = status !== 'paid';
    if (status === 'paid') { methodInput.value = payment.method || 'PayPal'; referenceInput.value = payment.reference || ''; }
    dialogError.textContent = '';
    confirmButton.textContent = labels[status];
    if (!dialog.open) { dialog.showModal(); document.body.classList.add('admin-dialog-open'); }
  }

  confirmButton.addEventListener('click', async function () {
    if (!pendingChange || confirmButton.disabled) return;
    var change = pendingChange, release = busy(confirmButton);
    dialogError.textContent = '';
    try {
      var saved = await api.setPaymentStatus(change.id, change.status, methodInput.value, referenceInput.value);
      saveStatus.textContent = api.milestoneLabel(saved.milestone) + ' payment for ' + saved.project + ' marked '
        + api.paymentLabel(change.status).toLowerCase() + '.';
      dialog.close();
    } catch (error) {
      dialogError.textContent = error.message;
    } finally { release(); }
  });

  document.addEventListener('click', function (event) {
    var action = event.target.closest('[data-payment][data-status]');
    if (action) openPaymentDialog(action.dataset.payment, action.dataset.status);
    if (event.target.closest('[data-close-payment]')) dialog.close();
  });
  [statusFilter, clientFilter].forEach(function (control) { control.addEventListener('change', renderPayments); });
  clearFilters.addEventListener('click', function () {
    statusFilter.value = 'due'; clientFilter.value = 'all'; renderPayments(); statusFilter.focus();
  });

  /* ======================================================================
     Pricing
     ====================================================================== */
  var pricingForm = document.getElementById('pricing-form');
  var pricingRows = document.getElementById('pricing-rows');
  var pricingStatus = document.getElementById('pricing-status');
  var PRICING_ITEMS = [['base', 'Base video'], ['script', 'Script writing'], ['voice_over', 'Voice over']];
  var DURATIONS = [30, 60, 90, 120];
  // Set while the grid has unsaved edits, so a refresh elsewhere cannot
  // overwrite what is being typed.
  var pricingDirty = false;

  function buildPricingGrid() {
    pricingRows.replaceChildren();
    PRICING_ITEMS.forEach(function (item) {
      var row = node('tr'), head = node('th', undefined, item[1]);
      head.scope = 'row';
      row.append(head);
      DURATIONS.forEach(function (seconds) {
        var td = node('td'), input = node('input', 'input');
        input.type = 'number'; input.min = '0'; input.step = '1'; input.required = true;
        input.id = 'price-' + item[0] + '-' + seconds;
        input.dataset.priceItem = item[0];
        input.dataset.priceSeconds = String(seconds);
        input.setAttribute('aria-label', item[1] + ', ' + seconds + ' second video, price in US dollars');
        td.append(input);
        row.append(td);
      });
      pricingRows.append(row);
    });
  }
  function loadPricing() {
    if (pricingDirty) return;
    pricingRows.querySelectorAll('[data-price-item]').forEach(function (input) {
      var value = api.priceFor(input.dataset.priceItem, Number(input.dataset.priceSeconds));
      input.value = value === null ? '' : String(value);
    });
  }
  pricingForm.addEventListener('input', function () { pricingDirty = true; });
  pricingForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var submit = pricingForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    var values = {}, invalid = null;
    pricingRows.querySelectorAll('[data-price-item]').forEach(function (input) {
      var number = Number(input.value);
      if (input.value === '' || !Number.isFinite(number) || number < 0) { if (!invalid) invalid = input; return; }
      if (!values[input.dataset.priceItem]) values[input.dataset.priceItem] = {};
      values[input.dataset.priceItem][Number(input.dataset.priceSeconds)] = number;
    });
    if (invalid) {
      pricingStatus.textContent = 'Every price must be a number, zero or more.';
      invalid.focus();
      return;
    }
    var release = busy(submit);
    try {
      await api.savePricing(values);
      pricingDirty = false;
      loadPricing();
      pricingStatus.textContent = 'Price list saved. New projects are priced from these figures.';
    } catch (error) {
      pricingStatus.textContent = error.message;
    } finally { release(); }
  });
  document.getElementById('pricing-reset').addEventListener('click', function () {
    pricingDirty = false;
    loadPricing();
    pricingStatus.textContent = 'Unsaved price changes discarded.';
  });

  /* ====================================================================== */
  function fillClients() {
    var value = clientFilter.value;
    clientFilter.replaceChildren();
    var all = node('option', undefined, 'All clients');
    all.value = 'all';
    clientFilter.append(all);
    state.clients.forEach(function (item) {
      var option = node('option', undefined, item.name);
      option.value = item.id;
      clientFilter.append(option);
    });
    clientFilter.value = state.clients.some(function (item) { return item.id === value; }) ? value : 'all';
  }

  api.subscribe(function (changed) {
    if (changed.includes('clients')) fillClients();
    if (changed.some(function (key) { return ['payments', 'requests', 'clients'].includes(key); })) {
      renderPayments();
      // The dialog follows the row it was opened for, or closes with it.
      if (dialog.open && pendingChange) {
        if (state.payments.some(function (item) { return item.id === pendingChange.id; })) openPaymentDialog(pendingChange.id, pendingChange.status);
        else dialog.close();
      }
    }
    if (changed.includes('pricing')) loadPricing();
  });

  buildPricingGrid();
  fillClients();
  loadPricing();
  renderPayments();
})();
