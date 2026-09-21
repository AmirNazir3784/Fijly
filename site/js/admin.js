/* Admin milestone 1: Dashboard and Clients. Uses the shared session mock service. */
(function () {
  'use strict';
  var data = window.FijlyMock.state;
  var search = document.getElementById('client-search');
  var status = document.getElementById('client-status');
  var sort = document.getElementById('client-sort');
  var detail = document.getElementById('client-detail');
  var editor = document.getElementById('client-editor');
  var form = document.getElementById('client-form');
  var selectedId = null;
  var editingId = null;
  var returnToDetail = false;

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function client(id) { return data.clients.find(function (item) { return item.id === id; }); }
  function projects(id) { return data.projects.filter(function (item) { return item.client === id; }); }
  function pending(id) { return window.FijlyMock.pendingRequests(id); }
  // Open work: every video not yet completed, plus requests still waiting to
  // become a video. A request that has a video is counted once, as the video.
  function openCount(id) { return projects(id).filter(function (item) { return item.status !== 'Completed'; }).length + pending(id).length; }
  function badge(value) {
    var classes = { Active: 'badge-success', Onboarding: 'badge-info', Paused: '', 'In Production': 'badge-warning', 'Draft Ready': 'badge-info', 'Client Review': 'badge-info', 'In Revision': 'badge-warning', Approved: 'badge-success', Completed: 'badge-success', Submitted: 'badge-info', 'Under Review': 'badge-info', Overdue: 'badge-danger' };
    return node('span', 'badge ' + (classes[value] || ''), value);
  }
  function date(value) {
    return new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  // Deadlines are calendar dates, so compare them with the local calendar date.
  function localDay(value) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  function clientButton(item, text) {
    var button = node('button', 'btn-link', text || item.name);
    button.type = 'button';
    button.dataset.client = item.id;
    button.setAttribute('aria-label', 'View ' + item.name + ' client profile');
    return button;
  }
  function appendCell(row, child, className) {
    var cell = node('td', className);
    cell.append(typeof child === 'string' ? document.createTextNode(child) : child);
    row.append(cell);
  }
  function renderDashboard() {
    var allProjects = data.projects;
    var active = data.clients.filter(function (item) { return item.status === 'Active'; }).length;
    var review = allProjects.filter(function (item) { return item.status === 'Client Review'; }).length;
    var production = allProjects.filter(function (item) { return item.status === 'In Production'; }).length;
    var openVideos = allProjects.filter(function (item) { return item.status !== 'Completed'; });
    var waiting = pending().length;
    // The current week runs Monday to Sunday.
    var now = new Date();
    var today = localDay(now);
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    var weekStart = localDay(monday);
    var weekEnd = localDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
    var thisWeek = openVideos.filter(function (item) { return item.due >= weekStart && item.due <= weekEnd; });
    var overdue = openVideos.filter(function (item) { return item.due < today; });
    // Overdue work stays listed alongside the rest of this week's deadlines.
    var due = openVideos.filter(function (item) { return item.due <= weekEnd; }).sort(function (a, b) { return a.due.localeCompare(b.due); });
    document.getElementById('dashboard-date').textContent = 'OPERATIONS / ' + now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    var stats = document.getElementById('admin-stats');
    stats.replaceChildren();
    [
      ['Active clients', active, data.clients.length + ' clients in the studio'],
      ['Active projects', openVideos.length + waiting, production + ' in production · +' + waiting + ' pending ' + (waiting === 1 ? 'request' : 'requests')],
      ['Awaiting review', review, 'Ready for client feedback'],
      ['Due this week', thisWeek.length, date(weekStart) + '–' + date(weekEnd) + (overdue.length ? ' · ' + overdue.length + ' overdue' : '')]
    ].forEach(function (stat) {
      var card = node('article', 'stat-card');
      card.append(node('h2', 'stat-card__label', stat[0]), node('div', 'stat-card__value', String(stat[1]).padStart(2, '0')), node('div', 'stat-card__delta stat-card__delta--muted', stat[2]));
      stats.append(card);
    });
    var priorities = document.getElementById('admin-priorities');
    priorities.replaceChildren();
    document.getElementById('due-count').textContent = due.length + ' projects';
    due.forEach(function (project) {
      var row = node('tr');
      var identity = node('div', 'admin-project-identity');
      identity.append(node('strong', '', project.title), clientButton(client(project.client)));
      appendCell(row, identity);
      appendCell(row, badge(project.status));
      var when = node('div', 'admin-due');
      when.append(document.createTextNode(date(project.due)));
      if (project.due < today) when.append(badge('Overdue'));
      appendCell(row, when, 'admin-date');
      if (project.due < today) row.classList.add('admin-row--overdue');
      priorities.append(row);
    });
    var pipeline = document.getElementById('admin-pipeline');
    pipeline.replaceChildren();
    window.FijlyMock.videoStatuses.forEach(function (stage) {
      var count = allProjects.filter(function (item) { return item.status === stage; }).length;
      var item = node('li');
      var label = node('div', 'admin-pipeline-label');
      label.append(node('span', '', stage), node('strong', '', String(count)));
      var bar = node('div', 'progress-bar');
      bar.setAttribute('aria-hidden', 'true');
      var fill = node('div', 'progress-bar__fill');
      fill.style.width = (allProjects.length ? count / allProjects.length * 100 : 0) + '%';
      bar.append(fill); item.append(label, bar); pipeline.append(item);
    });
    var activity = document.getElementById('admin-activity');
    activity.replaceChildren();
    var recent = data.videos.flatMap(function(v){return v.activity.map(function(a){return {client:window.FijlyMock.requestFor(v).client,text:a.text,time:new Date(a.at).toLocaleString(),at:a.at};});}).sort(function(a,b){return b.at.localeCompare(a.at);});
    recent.slice(0, 4).forEach(function (item) {
      var entry = node('li');
      var avatar = node('span', 'avatar avatar--sm', client(item.client).name.charAt(0));
      avatar.setAttribute('aria-hidden', 'true');
      var content = node('div');
      content.append(clientButton(client(item.client)), node('p', '', item.text), node('span', 'admin-muted', item.time));
      entry.append(avatar, content); activity.append(entry);
    });
    var summary = document.getElementById('admin-client-overview');
    summary.replaceChildren();
    ['Active', 'Onboarding', 'Paused'].forEach(function (state) {
      var item = node('li');
      item.append(badge(state), node('strong', '', String(data.clients.filter(function (record) { return record.status === state; }).length)));
      summary.append(item);
    });
  }
  function renderClients() {
    var query = search.value.trim().toLowerCase();
    var records = data.clients.filter(function (item) {
      return (status.value === 'all' || item.status === status.value) && [item.name, item.contact, item.email].join(' ').toLowerCase().includes(query);
    }).sort(function (a, b) {
      return (sort.value === 'projects' ? openCount(b.id) - openCount(a.id) : 0) || a.name.localeCompare(b.name);
    });
    var rows = document.getElementById('client-rows');
    rows.replaceChildren();
    records.forEach(function (item) {
      var row = node('tr');
      var company = node('div', 'cell-project');
      var avatar = node('span', 'avatar', item.name.charAt(0));
      avatar.setAttribute('aria-hidden', 'true');
      var name = node('div'); name.append(clientButton(item), node('span', 'admin-muted admin-block', item.industry || 'Industry not specified'));
      company.append(avatar, name); appendCell(row, company);
      var contact = node('div'); contact.append(node('span', '', item.contact), node('span', 'admin-muted admin-block', item.email));
      appendCell(row, contact); appendCell(row, badge(item.status));
      appendCell(row, String(openCount(item.id)), 'num');
      appendCell(row, String(projects(item.id).filter(function (project) { return project.status === 'Completed'; }).length), 'num');
      appendCell(row, clientButton(item, 'View →'));
      rows.append(row);
    });
    document.getElementById('client-count').textContent = records.length + ' of ' + data.clients.length + ' clients';
    document.getElementById('client-empty').hidden = records.length > 0;
  }
  function openDetail(id) {
    var item = client(id);
    if (!item) return;
    selectedId = id;
    document.getElementById('client-detail-title').textContent = item.name;
    var body = document.getElementById('client-detail-body'); body.replaceChildren();
    var intro = node('div', 'admin-detail-intro');
    intro.append(badge(item.status), node('span', 'admin-muted', item.industry || 'Industry not specified'));
    var facts = node('dl', 'admin-detail-facts');
    [['Primary contact', item.contact], ['Email', item.email], ['Open projects & requests', String(openCount(id))], ['Brand assets', window.FijlyMock.assetsFor(id).length + ' files']].forEach(function (pair) {
      var group = node('div'); group.append(node('dt', '', pair[0]), node('dd', '', pair[1])); facts.append(group);
    });
    body.append(intro, facts, node('h3', '', 'Production notes'), node('p', 'admin-detail-notes', item.notes || 'No production notes yet.'), node('h3', '', 'Project history'));
    var list = node('ul', 'admin-project-list');
    projects(id).forEach(function (project) {
      var row = node('li'); var text = node('div');
      text.append(node('strong', '', project.title), node('span', 'admin-muted admin-block', project.format + ' / ' + date(project.due)));
      row.append(text, badge(project.status)); list.append(row);
    });
    pending(id).forEach(function (request) {
      var row = node('li'); var text = node('div');
      text.append(node('strong', '', request.title), node('span', 'admin-muted admin-block', request.videoType + ' / ' + date(request.deadline) + ' / Awaiting production'));
      row.append(text, badge(request.status)); list.append(row);
    });
    if (!list.children.length) list.append(node('li', 'admin-muted', 'No projects yet. This client is ready for a first brief.'));
    body.append(list);
    if(!detail.open)detail.showModal();
  }
  function openEditor(id) {
    editingId = id || null;
    form.reset();
    Array.from(form.elements).forEach(function (field) { if (field.setCustomValidity) field.setCustomValidity(''); });
    document.getElementById('client-editor-title').textContent = id ? 'Edit client' : 'Add client';
    if (id) {
      var item = client(id);
      form.elements.company.value = item.name;
      ['contact', 'email', 'industry', 'status', 'notes'].forEach(function (key) { form.elements[key].value = item[key]; });
    }
    editor.showModal();
    form.elements.company.focus();
  }
  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-client]');
    if (target) openDetail(target.dataset.client);
    if (event.target.closest('[data-add-client]')) { returnToDetail = false; openEditor(); }
    if (event.target.closest('[data-close-detail]')) detail.close();
    if (event.target.closest('[data-close-editor]')) editor.close();
  });
  document.getElementById('edit-client').addEventListener('click', function () {
    returnToDetail = true;
    detail.close();
    openEditor(selectedId);
  });
  editor.addEventListener('close', function () {
    if (returnToDetail) { returnToDetail = false; openDetail(selectedId); }
  });
  [detail, editor].forEach(function (dialog) {
    dialog.addEventListener('close', function () {
      document.body.classList.toggle('admin-dialog-open', detail.open || editor.open);
    });
    new MutationObserver(function () {
      document.body.classList.toggle('admin-dialog-open', detail.open || editor.open);
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  form.addEventListener('input', function (event) { if (event.target.setCustomValidity) event.target.setCustomValidity(''); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if(!editor.open)return;
    ['company', 'contact', 'email'].forEach(function (key) {
      var field = form.elements[key]; field.value = field.value.trim();
      field.setCustomValidity(field.value ? '' : 'Please complete this field.');
    });
    if (data.clients.some(function (item) { return item.id !== editingId && item.name.toLowerCase() === form.elements.company.value.toLowerCase(); })) {
      form.elements.company.setCustomValidity('A client with this company name already exists.');
    }
    if (!form.reportValidity()) return;
    var item = editingId ? Object.assign({}, client(editingId)) : {};
    item.name = form.elements.company.value;
    ['contact', 'email', 'industry', 'status', 'notes'].forEach(function (key) { item[key] = form.elements[key].value.trim(); });
    if (!editingId) { search.value = ''; status.value = 'all'; }
    try { window.FijlyMock.saveClient(item); } catch(error) { form.elements.company.setCustomValidity(error.message);form.reportValidity();return; }
    document.getElementById('admin-save-status').textContent = item.name + ' saved in this mock workspace. Changes are shared in this mock session.';
    editor.close();
  });
  search.addEventListener('input', renderClients);
  status.addEventListener('change', renderClients);
  sort.addEventListener('change', renderClients);
  document.getElementById('clear-client-filters').addEventListener('click', function () {
    search.value = ''; status.value = 'all'; renderClients(); search.focus();
  });
  window.FijlyMock.subscribe(function (changed) { if(changed.some(function(k){return ['clients','requests','videos'].includes(k);})) {renderDashboard();renderClients();}if(detail.open){if(client(selectedId))openDetail(selectedId);else detail.close();} });
  renderDashboard(); renderClients();
})();
