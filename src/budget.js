// Every render-cost number the galaxy uses, in one place (ORB-1 spec section 2).
const DESKTOP = {stars: 118000, dust: 3600, maxPixelRatio: 1.8, sphereSegments: [96, 64], foregroundStars: 260, bloom: true, maxPlanets: 12};
const LITE = {stars: 24000, dust: 800, maxPixelRatio: 1.25, sphereSegments: [40, 28], foregroundStars: 80, bloom: false, maxPlanets: 8};
export function renderBudget({lite = false, fallback = false} = {}) {
  const base = lite ? LITE : DESKTOP;
  const budget = {...base, sphereSegments: [...base.sphereSegments]};
  if (fallback) {
    budget.stars = 22000;
    budget.dust = 600;
  }
  return budget;
}
