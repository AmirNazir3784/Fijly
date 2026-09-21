/* FIJLY Studio — dashboard interactions (vanilla JS, no dependencies) */
(function () {
  'use strict';

  /* 4. Settings toggles --------------------------------------------------- */
  // Native checkboxes drive the CSS toggles; mirror state for assistive tech.
  document.querySelectorAll('.toggle-switch input[type="checkbox"]').forEach(function (input) {
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-checked', String(input.checked));
    input.addEventListener('change', function () {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });

  /* 5. Play / pause on the overview preview ------------------------------ */
  var preview = document.getElementById('preview');
  document.addEventListener('studio:screenchange', function (event) {
    if (event.detail.name !== 'overview') setPlaying(false);
  });
  var playButtons = document.querySelectorAll('[data-play-toggle]');
  var track = document.querySelector('.timeline__track');
  var clock = document.querySelector('.timeline__time');
  var motion = [
    document.querySelector('.timeline__fill').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 64000, fill: 'both' }),
    document.querySelector('.timeline__knob').animate([{ left: '0%' }, { left: '100%' }], { duration: 64000, fill: 'both' })
  ];
  motion.forEach(function (animation) { animation.pause(); animation.currentTime = 24000; });
  function updatePosition() {
    var seconds = Math.min(64, Math.floor(motion[0].currentTime / 1000));
    clock.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    track.setAttribute('aria-valuenow', String(Math.round(seconds / 64 * 100)));
    track.setAttribute('aria-valuetext', seconds + ' seconds of 64-second production preview');
  }
  var playbackTimer = null;
  function setPlaying(playing) {
    clearInterval(playbackTimer);playbackTimer = playing ? setInterval(updatePosition,250) : null;
    preview.classList.toggle('is-playing', playing);
    motion.forEach(function (animation) {
      if (playing) { if (animation.currentTime >= 64000) animation.currentTime = 0; animation.play(); }
      else animation.pause();
    });
    playButtons.forEach(function (button) { button.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview'); });
  }
  playButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setPlaying(!preview.classList.contains('is-playing'));
    });
  });
  motion[0].onfinish = function () { setPlaying(false); updatePosition(); };
  window.addEventListener('pagehide',function(){setPlaying(false);});
  document.querySelector('[data-preview-restart]').addEventListener('click', function () {
    motion.forEach(function (animation) { animation.currentTime = 0; });
    updatePosition();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPlaying(false); });
  updatePosition();

  var fullscreenButton = document.querySelector('[data-fullscreen]');
  if (fullscreenButton) {
    if (!document.fullscreenEnabled) {
      fullscreenButton.disabled = true;
      fullscreenButton.title = 'Fullscreen is unavailable in this browser';
    } else {
      fullscreenButton.addEventListener('click', function () {
        var action = document.fullscreenElement ? document.exitFullscreen() : preview.requestFullscreen();
        action.catch(function () { fullscreenButton.title = 'Fullscreen is unavailable in this browser'; });
      });
      document.addEventListener('fullscreenchange', function () {
        fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
      });
    }
  }

})();
