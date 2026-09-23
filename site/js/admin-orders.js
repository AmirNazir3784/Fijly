/* Admin Orders: video orders placed on order.html. Orders load on their own
   (not with the rest of the studio's data), so a problem here never blocks
   the other screens. The studio creates each customer's account and
   workspace by hand for now; this screen tracks the order's status. */
(function () {
  'use strict';
  var api = window.FijlyData;
  if (!document.getElementById('screen-orders')) return;

  // The published price for each length; order.html sends the price, so any
  // order that doesn't match is flagged for a check before invoicing.
  var PRICES = { 30: 300, 60: 500, 90: 700, 120: 950 };
  var TONES = { pending: 'badge-warning', paid: 'badge-info', processing: 'badge-warning', completed: 'badge-success', cancelled: 'badge-danger' };
  var search = document.getElementById('order-search');
  var statusFilter = document.getElementById('order-status-filter');
  var rowsEl = document.getElementById('order-rows');
  var countEl = document.getElementById('order-count');
  var empty = document.getElementById('order-empty');
  var emptyTitle = document.getElementById('order-empty-title');
  var emptyText = document.getElementById('order-empty-text');
  var emptyAction = document.getElementById('order-empty-action');
  var saveStatus = document.getElementById('order-save-status');
  var refresh = document.getElementById('orders-refresh');
  var dialog = document.getElementById('order-detail');
  var detailStatus = document.getElementById('order-detail-status');
  var detailError = document.getElementById('order-detail-error');
  var saveButton = document.getElementById('order-status-save');
  var orders = [], loaded = false, loading = null, failed = null, selected = null;

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function busy(control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); return function () { control.disabled = false; control.removeAttribute('aria-busy'); }; }
  function label(status) { return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'; }
  function badge(status) { return node('span', 'badge ' + (TONES[status] || ''), label(status)); }
  function money(value) { return value == null ? '—' : '$' + Number(value).toLocaleString('en-US'); }
  function seconds(order) { var match = /^(\d+)/.exec(String(order.duration || '')); return match ? Number(match[1]) : null; }
  function priceMismatch(order) { var expected = PRICES[seconds(order)]; return !expected || Number(order.price) !== expected; }

  /* List ------------------------------------------------------------------ */
  function visible() {
    var query = search.value.trim().toLowerCase();
    return orders.filter(function (order) {
      return (statusFilter.value === 'all' || (order.status || 'pending') === statusFilter.value)
        && [order.name, order.email, order.company, order.video_type].join(' ').toLowerCase().includes(query);
    });
  }
  function render() {
    var records = visible();
    rowsEl.replaceChildren();
    records.forEach(function (order) {
      var row = node('tr');
      function cell(child, className) { var td = node('td', className); td.append(child); row.append(td); }
      cell(api.formatDate(order.created_at, '—'), 'admin-date');
      var name = node('button', 'btn-link', order.name);
      name.type = 'button'; name.dataset.order = order.id; name.setAttribute('aria-label', 'View order from ' + order.name);
      cell(name);
      cell(order.email);
      cell(order.company);
      cell(order.video_type);
      cell(order.duration);
      var price = node('span', null, money(order.price));
      if (priceMismatch(order)) { price = node('span'); price.append(money(order.price), ' ', node('span', 'badge badge-danger', 'Check price')); }
      cell(price, 'num');
      cell(badge(order.status || 'pending'));
      var open = node('button', 'btn-link', 'View →');
      open.type = 'button'; open.dataset.order = order.id; open.setAttribute('aria-label', 'View order from ' + order.name);
      cell(open);
      rowsEl.append(row);
    });
    countEl.textContent = loaded ? records.length + ' of ' + orders.length + ' orders' : '';
    var filtered = orders.length > 0;
    empty.hidden = records.length > 0 || (!loaded && !failed);
    emptyTitle.textContent = failed ? 'Orders couldn’t be loaded' : filtered ? 'No matching orders' : 'No orders yet';
    emptyText.textContent = failed ? failed : filtered ? 'Try a different search or status.' : 'Orders placed on fijly.com will appear here.';
    emptyAction.hidden = !failed && !filtered;
    emptyAction.textContent = failed ? 'Try again' : 'Clear filters';
    updateCount();
  }
  // Pending orders show as a count on the sidebar link, like other queues.
  function updateCount() {
    var link = document.querySelector('.sidebar-link[data-screen="orders"]');
    if (!link) return;
    var counter = link.querySelector('[data-order-badge]');
    if (!counter) { counter = node('span', 'sidebar-count'); counter.dataset.orderBadge = ''; link.append(counter); }
    var count = orders.filter(function (order) { return (order.status || 'pending') === 'pending'; }).length;
    counter.textContent = count; counter.hidden = !count;
    counter.setAttribute('aria-label', count + (count === 1 ? ' new order' : ' new orders'));
  }

  async function load() {
    if (loading) return loading;
    loading = (async function () {
      var release = busy(refresh);
      if (!loaded) countEl.textContent = 'Loading orders…';
      try {
        if (!(await window.FijlyAuthReady)) return; // Not signed in as an admin.
        orders = await api.admin.getOrders();
        loaded = true; failed = null;
      } catch (error) {
        failed = (error && error.message) || 'Something went wrong.';
      } finally { release(); }
      render();
      if (dialog.open && selected) { if (orders.some(function (o) { return o.id === selected; })) openDetail(selected); else dialog.close(); }
    })();
    try { await loading; } finally { loading = null; }
  }

  /* Detail ---------------------------------------------------------------- */
  function openDetail(id) {
    var order = orders.find(function (item) { return item.id === id; });
    if (!order) return;
    selected = id;
    document.getElementById('order-detail-title').textContent = order.video_type + ' · ' + order.duration;
    var body = document.getElementById('order-detail-body');
    var intro = node('div', 'admin-detail-intro');
    intro.append(badge(order.status || 'pending'), node('span', 'admin-muted', order.company));
    var facts = node('dl', 'admin-detail-facts');
    var email = node('a', null, order.email); email.href = 'mailto:' + order.email;
    var price = node('span', null, money(order.price));
    if (priceMismatch(order)) price.append(' — doesn’t match the ' + (PRICES[seconds(order)] ? money(PRICES[seconds(order)]) + ' list price' : 'price list'));
    [['Placed', api.formatDateTime(order.created_at, '—')], ['Name', order.name], ['Email', email], ['Company', order.company],
     ['Video', order.video_type + ' · ' + order.duration], ['Price', price]].forEach(function (pair) {
      var group = node('div'), value = node('dd');
      value.append(pair[1]);
      group.append(node('dt', null, pair[0]), value);
      facts.append(group);
    });
    body.replaceChildren(intro, facts, node('h3', null, 'Brief'), node('p', 'admin-detail-notes order-brief', order.brief || 'No brief provided.'));
    if (!dialog.open) {
      detailStatus.value = order.status || 'pending';
      detailError.textContent = '';
      dialog.showModal();
      document.body.classList.add('admin-dialog-open');
    }
  }

  saveButton.addEventListener('click', async function () {
    var order = orders.find(function (item) { return item.id === selected; });
    if (!order || saveButton.disabled) return;
    if (detailStatus.value === (order.status || 'pending')) { dialog.close(); return; }
    var release = busy(saveButton);
    detailError.textContent = '';
    try {
      var saved = await api.admin.updateOrder(order.id, { status: detailStatus.value });
      orders = orders.map(function (item) { return item.id === saved.id ? saved : item; });
      saveStatus.textContent = 'Order from ' + saved.name + ' marked ' + label(saved.status).toLowerCase() + '.';
      render();
      dialog.close();
    } catch (error) {
      detailError.textContent = error.message;
    } finally { release(); }
  });

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-order]');
    if (target) openDetail(target.dataset.order);
    if (event.target.closest('[data-close-order]')) dialog.close();
  });
  [search, statusFilter].forEach(function (control) { control.addEventListener(control.type === 'search' ? 'input' : 'change', render); });
  refresh.addEventListener('click', function () { saveStatus.textContent = ''; load(); });
  emptyAction.addEventListener('click', function () {
    if (failed) { load(); return; }
    search.value = ''; statusFilter.value = 'all'; render(); search.focus();
  });
  // Fresh data each time the screen opens; the sidebar count loads at sign-in.
  document.addEventListener('studio:screenchange', function (event) { if (event.detail.name === 'orders') load(); });
  window.addEventListener('fijly:auth', function () { load(); });
})();
