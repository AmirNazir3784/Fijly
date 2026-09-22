/* The signed-in person's profile UI. Name and photo are saved to their
   Supabase `profiles` row (the Admin's through Settings); form edits and the
   photo preview are temporary until Save. */
(function () {
  'use strict';
  var api = window.FijlyData, admin = document.body.classList.contains('admin-body');
  // `profiles` has no phone column, so neither portal offers a phone field.
  var phoneSupported = false;
  var trigger = document.querySelector('.sidebar-user');
  var modal = document.getElementById('profile-dialog');
  modal.id = 'profile-dialog'; modal.className = 'admin-dialog profile-dialog';
  modal.setAttribute('aria-labelledby', 'profile-title');
  modal.innerHTML = '<div class="admin-dialog-head"><h2 id="profile-title">Your profile</h2><button class="icon-btn" type="button" data-profile-close aria-label="Close profile"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<form id="profile-form"><div class="admin-dialog-fields profile-fields"><div class="profile-intro"><span class="avatar profile-avatar" id="profile-avatar" aria-hidden="true"></span><div><p id="profile-display-name"></p><p class="admin-muted" id="profile-display-role"></p></div></div>' +
    '<div class="profile-photo"><h3>Profile photo</h3><div class="profile-photo-actions"><button class="btn btn-outline btn--md" type="button" id="profile-change-photo">Change photo</button><button class="btn btn-ghost btn--md" type="button" id="profile-remove-photo">Remove photo</button></div><input id="profile-photo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="field-hint">PNG, JPG or WebP, up to 5 MB. Your photo is saved to your profile.</p><p class="workflow-error" role="alert" id="profile-photo-error"></p></div>' +
    '<div class="form-group"><label class="field-label" for="profile-name">Full name</label><input class="input" id="profile-name" name="fullName" autocomplete="name" maxlength="80" required></div>' +
    '<div class="form-group"><label class="field-label" for="profile-phone">Phone number <span class="admin-muted">(optional)</span></label><input class="input" id="profile-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="+1 555 123 4567"></div>' +
    '<div class="profile-readonly"><div class="form-group"><label class="field-label" for="profile-email">Email</label><input class="input" id="profile-email" type="email" autocomplete="email" readonly></div><div class="form-group"><label class="field-label" for="profile-role">Role</label><input class="input" id="profile-role" readonly></div></div>' +
    '<p class="workflow-notice" id="profile-status" role="status" hidden></p><p class="workflow-error" id="profile-error" role="alert"></p></div>' +
    '<div class="admin-dialog-foot"><button class="btn btn-ghost btn--md dialog-dismiss" type="button" data-profile-close>Close</button><button class="btn btn-primary btn--md" type="submit" id="profile-save">Save changes</button></div></form>';
  document.body.append(modal);
  if (!phoneSupported) document.getElementById('profile-phone').closest('.form-group').hidden = true;
  var form = modal.querySelector('form'), nameField = document.getElementById('profile-name'), phoneField = document.getElementById('profile-phone');
  var photoInput = document.getElementById('profile-photo-file'), save = document.getElementById('profile-save');
  var status = document.getElementById('profile-status'), error = document.getElementById('profile-error'), photoError = document.getElementById('profile-photo-error');
  var dirty = new Set(), draftPhoto = '', imageTask = 0, photoLoading = false, openedId = null;
  var settingsForm = document.getElementById(admin ? 'settings-form' : 'client-settings-form');
  // Admin Settings shows the admin's own name and email. The Client Settings
  // contact is the company's contact, not necessarily this person, so it is
  // not mirrored.
  var settingsFields = admin ? { name:'set-admin-name', email:'set-admin-email', role:'set-admin-role' } : {};
  // Only mirror fields this page has (the Supabase Admin Settings has no Role field).
  Object.keys(settingsFields).forEach(function (key) { if (!document.getElementById(settingsFields[key])) delete settingsFields[key]; });
  var settingsEdits = new Set();
  Object.keys(settingsFields).forEach(function (key) { document.getElementById(settingsFields[key]).addEventListener('input', function () { settingsEdits.add(key); }); });
  // Refresh untouched profile references even if an unrelated Settings field
  // has a draft. Preserve explicit, unsaved edits to the same field.
  settingsForm.addEventListener('submit', function () { queueMicrotask(function () {
    var profile = current(); if (!profile) return;
    Object.keys(settingsFields).forEach(function (key) { if (document.getElementById(settingsFields[key]).value === (profile[key] || '')) settingsEdits.delete(key); });
    render();
  }); });
  document.getElementById(admin ? 'settings-reset' : 'client-discard-settings').addEventListener('click', function () { settingsEdits.clear(); render(); });
  function current() {
    if (admin) {
      var record = api.state.settings;
      return { id: 'admin', name: record.adminName, email: record.adminEmail, role: record.adminRole, phone: '', photo: record.adminPhoto || '' };
    }
    // A client sees their own profile, with their workspace beneath their name.
    var me = api.me || {}, workspace = api.client.current();
    if (!workspace || !me.id) return null;
    return { id: me.id, name: me.full_name || me.email || 'Client', email: me.email || '', role: 'Client', subtitle: workspace.name, phone: '', photo: me.avatar_url || '' };
  }
  function avatar(target, name, photo) {
    if (target.dataset.photo === photo && target.dataset.name === name) return;
    target.dataset.photo = photo; target.dataset.name = name; target.replaceChildren();
    if (/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
      var image = document.createElement('img'); image.src = photo; image.alt = ''; target.append(image);
    } else target.textContent = (name || '?').charAt(0).toUpperCase();
  }
  // The Settings reference reads the same record, even while other Settings
  // fields have unsaved edits. It is not another editable profile model.
  var reference = document.createElement('div'); reference.className = 'profile-reference';
  reference.innerHTML = '<span class="avatar" data-profile-avatar aria-hidden="true"></span><div><p data-profile-name></p><p class="admin-muted" data-profile-phone></p></div><button class="btn btn-outline btn--md" type="button" data-profile-open aria-haspopup="dialog" aria-controls="profile-dialog">Edit profile</button>';
  document.getElementById(admin ? 'h-set-profile' : 'h-workspace').insertAdjacentElement('afterend', reference);
  function render() {
    var profile = current(); trigger.disabled = !profile;
    reference.hidden = !profile;
    if (!profile) { trigger.querySelector('.sidebar-user__name').textContent = 'No workspace'; trigger.querySelector('.sidebar-user__email').textContent = ''; avatar(trigger.querySelector('.avatar'), '?', ''); if (modal.open) modal.close(); return; }
    trigger.querySelector('.sidebar-user__name').textContent = profile.name;
    trigger.querySelector('.sidebar-user__email').textContent = profile.subtitle || profile.role;
    trigger.setAttribute('aria-label', 'Open profile for ' + profile.name);
    avatar(trigger.querySelector('.avatar'), profile.name, profile.photo);
    avatar(reference.querySelector('[data-profile-avatar]'), profile.name, profile.photo);
    reference.querySelector('[data-profile-name]').textContent = profile.name;
    reference.querySelector('[data-profile-phone]').textContent = profile.phone || (phoneSupported ? 'Add a phone number or profile photo' : 'Add a profile photo');
    Object.keys(settingsFields).forEach(function (key) { if (!settingsEdits.has(key)) document.getElementById(settingsFields[key]).value = profile[key] || ''; });
    if (!modal.open) return;
    if (openedId !== profile.id) { modal.close(); return; }
    document.getElementById('profile-display-name').textContent = profile.name;
    document.getElementById('profile-display-role').textContent = profile.role;
    document.getElementById('profile-email').value = profile.email || '';
    document.getElementById('profile-role').value = profile.role;
    if (!dirty.has('name')) nameField.value = profile.name;
    if (!dirty.has('phone')) phoneField.value = profile.phone;
    if (!dirty.has('photo')) draftPhoto = profile.photo;
    avatar(document.getElementById('profile-avatar'), nameField.value, draftPhoto);
    document.getElementById('profile-remove-photo').disabled = !draftPhoto || photoLoading;
  }
  function open() {
    var profile = current(); if (!profile) return;
    dirty.clear(); imageTask++; photoLoading = false; save.disabled = false; openedId = profile.id;
    photoInput.value = ''; photoError.textContent = ''; error.textContent = ''; status.hidden = true; nameField.setCustomValidity('');
    modal.showModal(); document.body.classList.add('admin-dialog-open'); render(); nameField.focus();
  }
  document.addEventListener('click', function (event) { if (event.target.closest('[data-profile-open]')) open(); if (event.target.closest('[data-profile-close]')) modal.close(); });
  modal.addEventListener('close', function () { imageTask++; photoLoading = false; dirty.clear(); draftPhoto = ''; });
  modal.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var fields = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled])')).filter(function (field) { return field.checkVisibility(); });
    var first = fields[0], last = fields[fields.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  nameField.addEventListener('input', function () { dirty.add('name'); nameField.setCustomValidity(''); status.hidden = true; });
  phoneField.addEventListener('input', function () { dirty.add('phone'); status.hidden = true; });
  document.getElementById('profile-change-photo').onclick = function () { photoInput.click(); };
  document.getElementById('profile-remove-photo').onclick = function () { imageTask++; draftPhoto = ''; dirty.add('photo'); photoInput.value = ''; photoError.textContent = ''; status.hidden = true; render(); };
  photoInput.addEventListener('change', async function () {
    var file = photoInput.files[0]; if (!file) return;
    var task = ++imageTask; photoError.textContent = ''; status.hidden = true; photoLoading = false; save.disabled = false; render();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { photoError.textContent = 'Choose a PNG, JPG or WebP image smaller than 5 MB.'; photoInput.value = ''; return; }
    photoLoading = true; save.disabled = true; render();
    try {
      var url = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(file); });
      var image = new Image(); image.src = url; await image.decode();
      var canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
      var context = canvas.getContext('2d'), side = Math.min(image.naturalWidth, image.naturalHeight);
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 192, 192);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
      if (task !== imageTask || !modal.open) return;
      draftPhoto = canvas.toDataURL('image/jpeg', 0.85); dirty.add('photo');
    } catch (_) { if (task === imageTask) photoError.textContent = 'This image could not be opened. Please choose another photo.'; }
    finally { if (task === imageTask) { photoLoading = false; save.disabled = false; render(); } }
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (photoLoading || !modal.open || save.getAttribute('aria-busy') === 'true') return;
    var profile = current(); if (!profile || openedId !== profile.id) { modal.close(); return; }
    nameField.setCustomValidity(nameField.value.trim() ? '' : 'Please enter your full name.');
    if (!form.reportValidity()) return;
    error.textContent = '';
    save.disabled = true; save.setAttribute('aria-busy', 'true');
    try {
      if (admin) {
        var patch = {};
        if (dirty.has('name')) patch.adminName = nameField.value.trim();
        if (dirty.has('phone')) patch.adminPhone = phoneField.value.trim();
        if (dirty.has('photo')) patch.adminPhoto = draftPhoto;
        await api.saveSettings(patch);
      } else if (dirty.size) {
        var values = {};
        if (dirty.has('name')) values.fullName = nameField.value.trim();
        if (dirty.has('photo')) values.photo = draftPhoto;
        await api.saveMyProfile(values);
      }
      dirty.clear(); render(); status.textContent = 'Profile updated.'; status.hidden = false;
    } catch (err) { error.textContent = err.message; }
    finally { save.disabled = photoLoading; save.removeAttribute('aria-busy'); }
  });
  api.subscribe(function (changed) { if (changed.some(function (key) { return key === 'clients' || key === 'settings'; })) render(); });
  render();
})();
