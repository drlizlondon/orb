# Orbit

A cinematic project universe for Dr Lizzie Soyode. Wheel or trackpad movement pulls the camera outward from the galaxy core; the interface stays fixed in the viewport. Five project worlds emerge along the outer constellation.

## Experience

- Three.js r170 with custom GLSL particle, planet-surface and atmosphere shaders.
- 130,000 stars plus 4,800 dust particles on desktop; reduced budgets on mobile.
- Slow rotation, subtle core breathing, hover emphasis and project fly-to transitions.
- Project detail dialogs with original destination links; Escape returns to the galaxy.
- Drag to orbit, scroll to travel, and explicit zoom, reset, palette and pause controls.
- Keyboard-accessible project index, reduced-motion support, and Canvas fallback when WebGL is unavailable.
- Subtle founder credit and LinkedIn link. No NHS affiliation or endorsement claims.

## Run locally

Requires Node 20+ and Python 3.

```sh
npm install
npm run build
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Do not open the HTML directly with a file URL: ES modules require HTTP.

## Edit

| File | Purpose |
| --- | --- |
| `dist/projects.js` | Five project names, descriptions, original URLs, colors and 3D positions |
| `dist/app.js` | Scene generation, camera journey, interactions and shaders |
| `dist/canvas-fallback.js` | Lightweight renderer for devices without WebGL |
| `dist/style.css` | Responsive typography and fixed interface |
| `dist/index.html` | Clean presentation and accessible dialogs |

The only runtime dependency is Three.js, pinned to 0.170.0. The build copies its module and license into `dist/vendor`. Fonts use Google Fonts with system fallbacks. No backend, analytics, accounts or API keys are required.

## Deploy

Publish the `dist` directory on any static host. Netlify configuration is included. The ChatGPT-hosted version uses its own private source mirror and deployment manifest; GitHub contains portable site source.

## Content sources

Project names, descriptions and destination URLs were verified against https://galaxycloud.lovable.app/ on 4 November 2026. Founder identity and LinkedIn URL were supplied by the project owner. The visual galaxy is procedural, not a screenshot or generated image.

## Review notes

The initial cloud QA browser disables WebGL. It can validate the Canvas fallback, navigation and dialogs; a GPU-enabled browser is required to evaluate the full shader path. Target-device frame rate varies with display size, pixel density and GPU.
