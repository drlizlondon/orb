# Lizzie in Orbit

A cinematic project universe for Dr Lizzie Soyode. Wheel, trackpad and touch movement pull the camera outward from the galaxy core. The document itself never scrolls; the interface stays fixed in the viewport. Five project worlds emerge along the outer constellation.

## Experience

- Three.js r187 with custom GLSL particle, planet-surface and atmosphere shaders.
- 130,000 stars plus 4,800 dust particles on desktop; reduced budgets on mobile.
- Slow rotation, subtle core breathing, hover emphasis and project fly-to transitions.
- Project detail dialogs with original destination links; Escape returns to the galaxy.
- Drag to orbit, scroll to travel, and a discreet pause control. Home/End and arrow keys also control the journey.
- Keyboard-accessible project index, reduced-motion support, and Canvas fallback when WebGL is unavailable.
- Subtle founder credit and LinkedIn link. No NHS affiliation or endorsement claims.

Project planets sit at five distinct radii, from 6.1 to 8.3 scene units. Original outbound URLs are checked in the test suite.

## Run locally

Requires Node 20+ and Python 3.

```sh
npm install
npm run build
npm run check
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Do not open the HTML directly with a file URL: ES modules require HTTP.

The GPU path uses restrained UnrealBloomPass glow, ACES tone mapping and procedural planet-surface lighting. All versions are locked in package-lock.json.

## Edit

| File | Purpose |
| --- | --- |
| `dist/projects.js` | Five project names, descriptions, original URLs, colors and 3D positions |
| `src/galaxy.js` | Scene generation, GSAP camera journey, Lenis input, bloom and shaders |
| `src/inspector.jsx` | Radix project inspector and Sonner notifications |
| `dist/canvas-fallback.js` | Lightweight renderer for devices without WebGL |
| `dist/style.css` | Responsive typography and fixed interface |
| `dist/index.html` | Clean presentation and accessible dialogs |

Three.js is pinned to 0.187.0. GSAP 3.15.1 provides the travel and fly-in easing; Lenis 1.3.27 normalizes wheel and touch gestures without moving the document. The project inspector uses React, Radix Dialog and Sonner, bundled locally with esbuild. The build bundles the runtime locally and preserves third-party notices. Fonts use Google Fonts with system fallbacks. No backend, analytics or API keys are required. The current ChatGPT deployment is owner-private and requires the owner’s ChatGPT account.

## Deploy

Publish the `dist` directory on any static host. Netlify configuration is included. The ChatGPT-hosted version uses its own private source mirror and deployment manifest; GitHub contains portable site source.

## Sharing

Canonical deployment: https://lizzie-in-orbit.techtideai.chatgpt.site

The Open Graph and Twitter metadata use the included 1200 × 630 social image. Link previews on external social networks require public access; the current deployment remains owner-private.

The social cover is generated promotional artwork; the interactive scene remains real-time Three.js.

## Content sources

Project names, descriptions and destination URLs were verified against https://galaxycloud.lovable.app/ on 4 November 2026. Founder identity and LinkedIn URL were supplied by the project owner. The visual galaxy is procedural, not a screenshot or generated image.

## Review notes

The initial cloud QA browser disables WebGL. It can validate the Canvas fallback, navigation and dialogs; a GPU-enabled browser is required to evaluate the full shader path. Target-device frame rate varies with display size, pixel density and GPU.
