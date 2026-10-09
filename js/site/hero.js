/* A short, user-initiated UI motion study. No autoplay or video download. */
(function () {
  'use strict';
  var preview = document.querySelector('[data-hero-preview]');
  if (!preview) return;
  var button = preview.querySelector('[data-hero-play]');
  var time = preview.querySelector('[data-hero-time]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var duration = 8000;
  var frame;
  var progress = preview.querySelector('.hero-showcase__playhead').animate(
    [{ left: '0%' }, { left: '100%' }], { duration: duration, fill: 'both' }
  );
  var movement = [
    ['.motion-card--main', ['rotate(-5deg) translateY(0)', 'rotate(0deg) translateY(-5px)', 'rotate(-5deg) translateY(0)']],
    ['.motion-scene', ['rotate(4deg) translateY(0)', 'rotate(0deg) translateY(-12px)', 'rotate(4deg) translateY(0)']],
    ['.motion-cursor', ['translate(0, 0)', 'translate(-35px, 22px)', 'translate(0, 0)']],
    ['.motion-card__tile--three', ['rotate(-3deg) scale(1)', 'rotate(5deg) scale(1.1)', 'rotate(-3deg) scale(1)']]
  ].map(function (item) {
    return preview.querySelector(item[0]).animate(item[1].map(function (transform) {
      return { transform: transform };
    }), { duration: duration, easing: 'ease-in-out', fill: 'both' });
  });
  [progress].concat(movement).forEach(function (animation) { animation.pause(); animation.currentTime = 0; });
  function updateTime() {
    time.textContent = '00:' + String(Math.min(8, Math.floor(progress.currentTime / 1000))).padStart(2, '0');
    if (preview.classList.contains('is-playing')) frame = requestAnimationFrame(updateTime);
  }
  function setPlaying(playing) {
    cancelAnimationFrame(frame);
    if (playing && progress.currentTime >= duration) {
      [progress].concat(movement).forEach(function (animation) { animation.currentTime = 0; });
    }
    preview.classList.toggle('is-playing', playing);
    button.setAttribute('aria-label', playing ? 'Pause motion study' : 'Play motion study');
    if (playing) progress.play(); else progress.pause();
    movement.forEach(function (animation) {
      if (playing && !reducedMotion.matches) { animation.currentTime = progress.currentTime; animation.play(); }
      else animation.pause();
    });
    updateTime();
  }
  button.addEventListener('click', function () { setPlaying(!preview.classList.contains('is-playing')); });
  progress.onfinish = function () { setPlaying(false); };
  reducedMotion.addEventListener('change', function () { setPlaying(false); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPlaying(false); });
})();
