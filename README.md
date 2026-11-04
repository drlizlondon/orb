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

Project planets sit at five distinct radii, from 6.1 to 8.3 scene units. GirlPlanner has a single textured planetary ring with directional star lighting and a soft planet shadow that scales with its inspection view; the other worlds are ring-free and no orbit paths or connecting lines are drawn. Original outbound URLs are checked in the test suite.

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
| `src/galaxy.js` | Scene composition, camera integration, input, lighting and rendering |
| `src/camera-motion.js` | Coordinated camera travel, drag, inspection and return |
| `src/touch-gesture.js` | Touch lifecycle and multi-touch gesture ownership |
| `src/render-profiler.js` | Optional CPU and GPU timing diagnostics |
| `src/inspector.jsx` | Radix project inspector and Sonner notifications |
| `src/planet-portrait.js` | Card portraits rendered from the actual selected world |
| `dist/canvas-fallback.js` | Lightweight renderer for devices without WebGL |
| `dist/style.css` | Responsive typography and fixed interface |
| `dist/index.html` | Clean presentation and accessible dialogs |

Three.js is pinned to 0.187.0. A single critically damped camera controller handles travel, drag, inspection and return with frame-rate-independent updates. GSAP 3.15.1 animates the founder typography and lighting moods; Lenis 1.3.27 normalizes wheel and touch input without moving the document. The project inspector uses React, Radix Dialog and Sonner, bundled locally with esbuild. The build bundles the runtime locally and preserves third-party notices. Fonts use Google Fonts with system fallbacks. No backend, analytics or API keys are required. The ChatGPT site is publicly accessible; the GitHub source repository remains private.

## Deploy

Publish the `dist` directory on any static host. Netlify configuration is included. The ChatGPT-hosted version uses its own private source mirror and deployment manifest; GitHub contains portable site source.

## Sharing

Canonical deployment: https://lizzie-in-orbit.techtideai.chatgpt.site

The Open Graph and Twitter metadata use the included 1200 × 630 social image. Link previews on external social networks require public access; the current site is public.

The social cover is generated promotional artwork; the interactive scene remains real-time Three.js.

## Content sources

Project names, descriptions and destination URLs were verified against https://galaxycloud.lovable.app/ on 4 November 2026. Founder identity and LinkedIn URL were supplied by the project owner. The visual galaxy is procedural, not a screenshot or generated image.

## Rendering and motion

The galaxy uses two particle clouds with irregular spiral density, narrow dark lanes, sparse clusters and a soft outer falloff. Particle counts and render passes are unchanged. Planet and star detail uses seamless procedural shaders with derivative filtering; the material refinement retains the existing noise-sample budget.

Wheel events are coalesced once per frame. The camera uses one critically damped response for each conceptual channel, with no second position or look-at smoothing layer. Direction reversal clears the pending tail of the old gesture. Inspection and return begin at the current rendered pose, so selecting another world during a return remains continuous. Phone framing fades through the close-to-wide transition rather than switching abruptly.

Project cards use a one-time 192 px render of the selected planet mesh, atmosphere and optional GirlPlanner ring. They share the live geometry, materials, orientation and mood, with the same ACES and sRGB output conversion. No second WebGL context or continuous card render loop is created. Canvas fallback portraits use the fallback scene renderer.

Mobile uses smaller particle and pixel budgets. Sustained slow WebGL frames reduce resolution, then drawn particles to a minimum of 70 percent. After eight consistently healthy measurement windows, detail returns gradually. Label dimensions are cached and updated when fonts or responsive wrapping change.

## Verification and profiling

`npm run check` runs 35 tests covering camera response at 30, 60 and 144 Hz, wheel reversal, touch release, multi-touch identity and zoom limits, interrupted inspection, mobile framing, reduced motion, label collisions, original project destinations, portrait fallback, shared ring lighting, quality adaptation and profiler resource handling.

Frame interval diagnostics are published on the canvas data attributes. Add `?profile=1` for CPU frame, label-layout and render-submission timings plus asynchronous GPU timer queries when the browser supports them. Add `&still=1` for a deterministic paused opening view. Profiling adds no interface and transmits no telemetry. GPU queries are sparse, nonblocking and discarded during disjoint intervals. Unsupported timers are reported as unavailable, never substituted with CPU time.

Compare the same viewport, device, mood, camera and quality settings. Browser frame intervals include scheduling delays and are distinct from GPU execution time. The baseline review at 1719 × 1220, Night, close view and rendering scale 1.00 varied from 5.7 to 17.1 ms median across successive windows; this variation cannot establish a reliable performance improvement. Physical-phone GPU benchmarking remains outside the desktop browser review.
