import {projects} from '../dist/projects.js';

// Slots for the tools beyond orb's five hand-placed positions (ORB-1 section 8).
export function layoutPosition(n) {
  const angle = n * 2.39996, radius = 6.1 + (n % 5) * 0.55, y = 0.1 + (n % 3) * 0.2;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

// Seed ids keep orb's own position; every other tool takes the next free layout slot.
export function layoutAll(tools) {
  let next = 5;
  return tools.map(tool => {
    const seeded = projects.find(p => p.id === tool.id);
    return seeded ? [...seeded.position] : layoutPosition(next++);
  });
}

// Seed ids keep orb's own colour; others cycle the same five colours.
export function colorFor(tool, index) {
  return (projects.find(p => p.id === tool.id) ?? projects[index % projects.length]).color;
}
