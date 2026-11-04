# Lizzie in Orbit

A cinematic project universe for Dr Lizzie Soyode. Wheel, trackpad and touch movement pull the camera outward from the galaxy core. The document itself never scrolls; the interface stays fixed in the viewport. Five project worlds emerge along the outer galaxy. Sparse foreground stars, spiral filaments with narrow dark lanes and a gentle local pointer response add depth. Planet surfaces and atmospheric rims follow the nearby star’s lighting mood.

## Experience

Doctor by day. Building with AI by night. The headline rotates between orbit, the ER, the way home and a walk.

- Four lighting moods: Night, Dusk, Evening and Day. Click the background or use the lighting button; dragging and project selection stay separate. A nearby star, the particle colors, planets and interface transition together.
- Logo orbit and headline transitions respect reduced motion and the pause control. Pausing settles the rotating headline into a fully readable phrase; reduced motion disables the decorative animation toggle.
- The nearby star uses a 192 × 128 desktop sphere, seamless per-pixel plasma, granulation, dark regions, limb darkening and a separate textured corona. Mobile uses reduced geometry and the no-WebGL renderer includes a textured fallback.
- Three.js r187 with custom GLSL particle, planet-surface and atmosphere shaders. Five world types use ocean shelves and clouds, gas bands and storms, ice fractures, mineral strata, and volcanic fissures. Fine detail fades with pixel footprint to limit shimmer.
- 118,000 stars plus 3,600 dust particles on desktop; reduced budgets on mobile.
- Slow rotation, subtle core breathing, hover emphasis and project fly-to transitions. Orbital movement holds while a project has keyboard focus.
- Clickable project names remain beneath visible planets at every zoom level. Radix detail dialogs expose the original destination links; Escape returns to the galaxy.
- Drag to orbit, scroll to travel, and a discreet pause control. Home/End and arrow keys also control the journey.
- Keyboard-accessible project index, reduced-motion support, and Canvas fallback when WebGL is unavailable.
- Subtle founder credit and LinkedIn link. No NHS affiliation or endorsement claims.

Project planets sit at five distinct radii, from 6.1 to 8.3 scene units. GirlPlanner has a single textured planetary ring that scales with its inspection view; the other worlds are ring-free and no orbit paths or connecting lines are drawn. Original outbound URLs are checked in the test suite.

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

Three.js is pinned to 0.187.0. GSAP 3.15.1 provides the travel and fly-in easing; Lenis 1.3.27 normalizes wheel and touch gestures without moving the document. The project inspector uses React, Radix Dialog and Sonner, bundled locally with esbuild. The build bundles the runtime locally and preserves third-party notices. Fonts use Google Fonts with system fallbacks. No backend, analytics or API keys are required. The ChatGPT site is publicly accessible; the GitHub source repository remains private.

## Deploy

Publish the `dist` directory on any static host. Netlify configuration is included. The ChatGPT-hosted version uses its own private source mirror and deployment manifest; GitHub contains portable site source.

## Sharing

Canonical deployment: https://lizzie-in-orbit.techtideai.chatgpt.site

The Open Graph and Twitter metadata use the included 1200 × 630 social image. Link previews on external social networks require public access; the current site is public.

The social cover is generated promotional artwork; the interactive scene remains real-time Three.js.

## Content sources

Project names, descriptions and destination URLs were verified against https://galaxycloud.lovable.app/ on 4 November 2026. Founder identity and LinkedIn URL were supplied by the project owner. The visual galaxy is procedural, not a screenshot or generated image.

## Performance and review notes

The cloud QA browser validated the Canvas fallback, navigation and dialogs. The deployed WebGL shader path was also checked in a GPU-enabled browser, with no console errors. Target-device frame rate varies with display size, pixel density and GPU.

On the review desktop at 1729 × 1220 in the Night hero, a rolling 120-frame sample measured a median frame interval of 5.7 ms before and after this refinement, with p95 at 5.8 ms before and 5.9 ms after. These are browser frame intervals, not GPU timer measurements or a device guarantee. The Canvas fallback at 1363 × 936 measured median intervals of 66.7 ms before and 50.0 ms after in short review samples.

Mobile uses smaller particle and pixel budgets. Sustained slow WebGL frames first reduce resolution, then reduce drawn particles to a minimum of 70 percent. Diagnostic values live on the canvas data attributes without adding visible interface controls. Asset URLs carry content hashes so updated builds load the matching code and styles. Lower-density displays receive restrained FXAA after tone mapping; distant planet patterns blend toward simpler terrain to reduce shimmer. Adaptive rendering preserves an initial pixel ratio below one rather than increasing it.

A further restrained review on 4 November 2026 added spiral lane attenuation during geometry creation, without another draw pass, and directional planet atmosphere lighting. The review browser reported roughly 1000 ms frame intervals while the page remained marked visible, indicating browser scheduling throttling. This session does not establish a reliable performance gain or regression; the earlier measurements above are historical samples, not results for this additional pass.


The cinematic materials pass on 4 November 2026 retained the particle counts and render-pass count, added filtered surface relief and latitude-dependent stellar plasma flow, and refined the inspection camera and card transitions. On the GPU review browser at 1729 × 1220 in the Night wide view, both baseline and updated 120-frame windows reported a 5.7 ms median interval and 5.8 ms p95 at rendering scale 1.00. These are short browser frame-interval samples, not isolated GPU benchmarks. The review covered all four moods, desktop close/wide views, a 390 × 844 mobile viewport, all five project cards and destination hrefs, keyboard opening/return, and pause state. The 12 automated checks passed and live WebGL logs had no shader errors. Reduced-motion behavior was reviewed in source; a physical phone performance benchmark is still outside this browser review.
