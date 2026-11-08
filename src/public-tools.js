import {seedTools} from './tools.js';

// The short list shown on the public page. Edit this list of ids to change it.
// Departure Alarm and Portfolio Publishing Desk are left out on purpose (ORB-1 spec 3.2).
const PUBLIC_IDS = ['bpp', 'gp', 'sms'];

export const publicTools = seedTools(0).filter(t => PUBLIC_IDS.includes(t.id));
