/* FIJLY Studio — dashboard interactions (vanilla JS, no dependencies) */
(function () {
  'use strict';

  /* Settings toggles ------------------------------------------------------ */
  // Native checkboxes drive the CSS toggles; mirror state for assistive tech.
  document.querySelectorAll('.toggle-switch input[type="checkbox"]').forEach(function (input) {
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-checked', String(input.checked));
    input.addEventListener('change', function () {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });

})();
