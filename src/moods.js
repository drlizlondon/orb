export const moods = [
  {name:'Night', background:'#010105', light:'#9894ff', tint:'#b9caff', accent:'#c1bbff', ink:'#f2f0f8', muted:'#aaaec5', panel:'#101221', speed:1, warmth:0, sun:.08},
  {name:'Dusk', background:'#09020d', light:'#dd7bca', tint:'#ff9cc7', accent:'#efb9df', ink:'#fff0fa', muted:'#c6aabe', panel:'#211020', speed:.88, warmth:.32, sun:.28},
  {name:'Evening', background:'#0b0403', light:'#f1a15f', tint:'#ffc28e', accent:'#f2c39b', ink:'#fff3e7', muted:'#c9b2a2', panel:'#231710', speed:.76, warmth:.56, sun:.55},
  {name:'Day', background:'#100d09', light:'#ffe6a8', tint:'#fff2cc', accent:'#ffe1a3', ink:'#fffaf0', muted:'#d2c9b6', panel:'#252216', speed:.66, warmth:.72, sun:.95},
];

export function createMoods(THREE, gsap, reduced, blocked) {
  let current = 0;
  const state = {
    background: new THREE.Color(moods[0].background),
    light: new THREE.Color(moods[0].light),
    tint: new THREE.Color(moods[0].tint),
    speed: 1, warmth: 0, sun: moods[0].sun,
  };
  const button = document.querySelector('#mood');
  const label = button.querySelector('span');
  function select(index) {
    current = index;
    const mood = moods[current], duration = reduced.matches ? 0 : 2.1;
    document.documentElement.dataset.mood = mood.name.toLowerCase();
    for (const key of ['accent','ink','muted','panel']) document.documentElement.style.setProperty(`--mood-${key}`, mood[key]);
    document.documentElement.style.setProperty('--mood-light', mood.light);
    label.textContent = mood.name;
    button.setAttribute('aria-label', `Lighting: ${mood.name}. Change mood`);
    for (const key of ['background','light','tint']) {
      const color = new THREE.Color(mood[key]);
      gsap.to(state[key], {r:color.r,g:color.g,b:color.b,duration,ease:'power2.inOut',overwrite:true});
    }
    gsap.to(state,{speed:mood.speed,warmth:mood.warmth,sun:mood.sun,duration,ease:'power2.inOut',overwrite:true});
  }
  function cycle() {if (!blocked()) select((current + 1) % moods.length);}
  button.addEventListener('click',cycle);
  // A tap on empty space changes the light. Orbit drags never do.
  const space = document;
  let gesture = null;
  const pointers = new Set();
  space.addEventListener('pointerdown', event => {
    if (event.target.closest('a,button,dialog,[role=dialog]')) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) {gesture = null; return;}
    if (event.button !== 0) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  });
  space.addEventListener('pointermove', event => {
    if (gesture && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>7) gesture.moved=true;
  });
  space.addEventListener('pointerup', event => {
    if (gesture?.id === event.pointerId && !gesture.moved && pointers.size === 1) cycle();
    pointers.delete(event.pointerId); gesture=null;
  });
  space.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);gesture=null;});
  select(0);
  return state;
}
