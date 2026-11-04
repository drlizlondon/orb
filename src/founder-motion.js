// A quiet editorial rhythm, independent of camera travel.
export function createFounderMotion(gsap, reduced) {
  const line = document.querySelector('#rotating-idea');
  const prefix = line.querySelector('.idea-preposition');
  const word = line.querySelector('em');
  const hero = document.querySelector('#origin');
  const phrases = [
    {prefix: 'in ', word: 'orbit.'},
    {prefix: 'in ', word: 'the ER.'},
    {prefix: 'on ', word: 'the way home.', long: true},
    {prefix: 'on ', word: 'a walk.'},
  ];
  let paused = true;
  const cycle = gsap.timeline({repeat: -1, paused: true});
  for (let step = 1; step <= phrases.length; step++) {
    const phrase = phrases[step % phrases.length];
    cycle.to(line, {opacity: 0, y: -9, filter: 'blur(4px)', duration: .3, ease: 'power2.in'}, '+=4.8')
      .call(() => {
        prefix.textContent = phrase.prefix;
        word.textContent = phrase.word;
        line.classList.toggle('is-long', !!phrase.long);
      })
      .set(line, {y: 11})
      .to(line, {opacity: 1, y: 0, filter: 'blur(0px)', duration: .65, ease: 'power3.out'});
  }
  function sync() {
    cycle.paused(paused || reduced.matches || document.hidden || !hero.classList.contains('active') || document.body.classList.contains('detail-open'));
    if (reduced.matches) {
      cycle.pause(0);
      prefix.textContent = phrases[0].prefix;
      word.textContent = phrases[0].word;
      line.classList.remove('is-long');
      gsap.set(line, {opacity: 1, y: 0, filter: 'none'});
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(hero, {attributes: true, attributeFilter: ['class']});
  observer.observe(document.body, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('visibilitychange', sync);
  return {setPaused(value) {paused = value; sync();}};
}
