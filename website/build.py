#!/usr/bin/env python3
"""Static docs site generator for Lempo Particle FX.

Layout + per-page content live here; running `python build.py` writes the
HTML files into this folder. No external dependencies.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

NAV = [
    ("Getting Started", [
        ("index.html", "Home"),
        ("getting-started.html", "Installation & First Run"),
    ]),
    ("Using the Editor", [
        ("editor.html", "Editor Tour"),
        ("previews.html", "Viewports & Previews"),
        ("trails.html", "Trails & Ribbons"),
        ("blend-modes.html", "Blend Modes"),
    ]),
    ("In Your Game", [
        ("gdevelop.html", "GDevelop Guide"),
    ]),
    ("Developers", [
        ("contracts.html", "Contracts & Export"),
        ("testing.html", "Testing"),
    ]),
    ("Project", [
        ("roadmap.html", "Roadmap & FAQ"),
    ]),
]

TOP_LINKS = [
    ("https://github.com/Boy1developer/Lempo-Particle-Editor/releases", "📥 Download", "primary"),
    ("https://github.com/Boy1developer/Lempo-FX", "GitHub", ""),
    ("https://eg-dev1.itch.io/lempo-fx", "itch.io", ""),
    ("https://www.youtube.com/@EG_dev", "YouTube", ""),
]


def sidebar_html():
    out = ['<aside class="sidebar" id="sidebar">']
    for group, links in NAV:
        out.append('<div class="nav-group"><h4>%s</h4>' % group)
        for href, label in links:
            out.append('<a href="%s">%s</a>' % (href, label))
        out.append("</div>")
    out.append("</aside>")
    return "\n".join(out)


def topbar_html():
    links = "".join(
        '<a href="%s" class="%s">%s</a>' % (href, cls, label)
        for href, label, cls in TOP_LINKS)
    return (
        '<header class="topbar">\n'
        '  <button class="nav-toggle" aria-label="Toggle navigation">&#9776;</button>\n'
        '  <a class="brand" href="index.html">'
        '<img src="assets/img/app-icon.png" alt="Lempo">'
        "<span>Lempo Particle FX <em>Docs</em></span></a>\n"
        '  <nav class="top-links">%s</nav>\n'
        "</header>" % links)


FOOTER = (
    '<footer class="site">\n'
    "  <p><strong>Lempo Particle FX</strong> — docs for v0.2.0 "
    "(editor) · extension v0.2.0 · export format v1.2</p>\n"
    "  <p>Made by <a href=\"https://github.com/Boy1developer\">Mostafa Fathy (EG dev)</a> "
    "· <a href=\"https://github.com/Boy1developer/Lempo-Particle-Editor/releases\">Releases</a> "
    "· <a href=\"https://eg-dev1.itch.io/lempo-fx\">itch.io</a> "
    "· MIT License</p>\n"
    "</footer>"
)


def page(filename, title, desc, body):
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="assets/img/app-icon.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/img/app-icon.png">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
{topbar}
<div class="shell">
{sidebar}
  <main class="content"><div class="content-inner">
{body}
  </div></main>
</div>
{footer}
<script src="assets/js/nav.js"></script>
</body>
</html>
""".format(title=title, desc=desc, topbar=topbar_html(),
           sidebar=sidebar_html(), body=body, footer=FOOTER)


def fig(src, caption, alt=None):
    return (
        '<figure><img src="assets/img/%s" alt="%s" loading="lazy">'
        "<figcaption>%s</figcaption></figure>"
        % (src, alt or caption.replace("<b>", "").replace("</b>", ""), caption))


PAGES = []

# ============================================================
# Home
# ============================================================
PAGES.append(dict(
    filename="index.html",
    title="Lempo Particle FX — Documentation",
    desc="Docs for Lempo Particle Editor and the Advanced Particle Emitter "
         "GDevelop extension: design 2D & 3D particle effects visually and "
         "play them in your game.",
    body="""
<p class="breadcrumb">Docs</p>
<div class="hero">
  <img class="logo" src="assets/img/app-icon.png" alt="Lempo Particle FX icon">
  <h1>Lempo Particle FX</h1>
  <p class="lead">Design stunning <strong>2D &amp; 3D particle effects</strong> visually in a
  desktop editor — then play them in <strong>GDevelop</strong> with the
  Advanced Particle Emitter extension. The browser preview shares one simulation
  engine across its renderers; the GDevelop extension keeps a separate runtime.</p>
  <div class="badges">
    <span class="badge">Editor <b>v0.2.0</b></span>
    <span class="badge">Extension <b>v0.2.0</b></span>
    <span class="badge">Export <b>v1.2</b></span>
    <span class="badge">Windows 10/11 · OpenGL 3.3</span>
    <span class="badge">MIT License</span>
  </div>
  <p>
    <a class="btn btn-primary" href="https://github.com/Boy1developer/Lempo-Particle-Editor/releases">📥 Download the editor</a>
    <a class="btn btn-ghost" href="getting-started.html">Quick start →</a>
  </p>
</div>

{demo}

<h2>What's inside?</h2>
<div class="cards">
  <div class="card"><span class="icon">🖥️</span>
    <h3><a href="editor.html">Desktop Editor</a></h3>
    <p>Dear PyGui app with live 3D/2D viewport, 12 particle shapes, per-state
    colors, force fields, deterministic seeds, templates and 100-step
    undo/redo.</p></div>
  <div class="card"><span class="icon">🎬</span>
    <h3><a href="trails.html">Trails &amp; Ribbons</a></h3>
    <p>Unity-style trail inspector with 79 settings, curve &amp; gradient
    editors, and 27 ready-made templates across five categories.</p></div>
  <div class="card"><span class="icon">👁️</span>
    <h3><a href="previews.html">Live Previews</a></h3>
    <p>The Dear PyGui viewport uses its drawlist and optional OpenGL raster layer.
    A separate browser fast preview uses Three.js, PixiJS or Canvas with 500 ms live-sync.</p></div>
  <div class="card"><span class="icon">🎮</span>
    <h3><a href="gdevelop.html">GDevelop Extension</a></h3>
    <p>Advanced Particle Emitter renders your exported JSON in-game —
    2D via PixiJS, 3D via Three.js, trails included.</p></div>
</div>

<h2>Screenshots</h2>
<div class="grid-2">
  {vp3d}
  {vp2d}
</div>
<div class="grid-2">
  {fp3d}
  {fp2d}
</div>

<h2>How the pieces fit together</h2>
<div class="table-wrap"><table>
  <tr><th>Part</th><th>What it is</th></tr>
  <tr><td><strong>Lempo Particle Editor</strong></td>
      <td>A Dear PyGui desktop app (<code>LempoParticleEditor.exe</code>) for designing
      effects with a live viewport, then exporting them as JSON.</td></tr>
  <tr><td><strong>Advanced Particle Emitter</strong></td>
      <td>A GDevelop extension (<code>AdvancedParticleEmitter.json</code>) that renders those
      effects in-game: <strong>2D</strong> via <a href="https://pixijs.com">PixiJS</a> and
      <strong>3D</strong> via <a href="https://threejs.org">Three.js</a>.</td></tr>
</table></div>

<p>The editor, browser preview and extension share export data contracts. The browser
preview's Three.js, PixiJS and Canvas adapters use one TypeScript particle engine;
GDevelop still has a separate simulation implementation, so some runtime behavior can
differ. See <a href="contracts.html">Contracts &amp; Export</a> and the
<a href="https://github.com/Boy1developer/Lempo-FX/blob/main/docs/viewport-migration-notes.md">viewport migration notes</a>.</p>

<div class="tip"><strong>Works in any GDevelop project</strong> — design the effect in the
editor, play it in-game with the Advanced Particle Emitter extension.</div>

<h2>Documentation</h2>
<div class="table-wrap"><table>
  <tr><th>Page</th><th>What's inside</th></tr>
  <tr><td><a href="getting-started.html">Installation &amp; First Run</a></td><td>Download, requirements, the startup dialog, running from source</td></tr>
  <tr><td><a href="editor.html">Editor Tour</a></td><td>Sidebar, emitter panel, force fields, states, shapes, navigation</td></tr>
  <tr><td><a href="previews.html">Viewports &amp; Previews</a></td><td>Dear PyGui viewport, GL raster layer, browser fast preview</td></tr>
  <tr><td><a href="trails.html">Trails &amp; Ribbons</a></td><td>Modes, inspector, emit types, templates, C++ API</td></tr>
  <tr><td><a href="blend-modes.html">Blend Modes</a></td><td>Normal, Additive, Subtractive, Multiply, Screen, Lighten, Overlay</td></tr>
  <tr><td><a href="gdevelop.html">GDevelop Guide</a></td><td>Import the extension, set resources, run in-game</td></tr>
  <tr><td><a href="contracts.html">Contracts &amp; Export</a></td><td>Export format v1.2, particle record layout, migration</td></tr>
  <tr><td><a href="testing.html">Testing</a></td><td>Full test matrix and CI gates</td></tr>
  <tr><td><a href="roadmap.html">Roadmap &amp; FAQ</a></td><td>What's done, what's planned, common questions</td></tr>
</table></div>
""".format(
        demo=fig("demo.gif",
                 "<b>Lempo Particle Editor</b> — live editing with instant viewport feedback"),
        vp3d=fig("viewport-3d.png", "<b>3D viewport</b> — meshes &amp; billboards"),
        vp2d=fig("viewport-2d.png", "<b>2D viewport</b> — sprites &amp; SVG"),
        fp3d=fig("fast-preview-3d.png", "<b>3D browser fast preview</b> (Three.js)"),
        fp2d=fig("fast-preview-2d.png", "<b>2D browser fast preview</b> (PixiJS)"),
)))

# ============================================================
# Installation & First Run
# ============================================================
PAGES.append(dict(
    filename="getting-started.html",
    title="Installation & First Run — Lempo Particle FX Docs",
    desc="Download Lempo Particle Editor, see the requirements and the startup "
         "mode dialog, and run it from source.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Getting Started</p>
<h1>Installation &amp; First Run</h1>
<p class="lead">Two minutes from download to your first live particle effect.</p>

<h2>1. Get the editor</h2>
<p>Download <code>LempoParticleEditor.exe</code> from the
<a href="https://github.com/Boy1developer/Lempo-Particle-Editor/releases"><strong>Releases</strong></a>
page (or from <a href="https://eg-dev1.itch.io/lempo-fx"><strong>itch.io</strong></a>) and run it —
no Python installation required.</p>

<div class="table-wrap"><table>
  <tr><th>Requirement</th><th>Value</th></tr>
  <tr><td>OS</td><td>Windows 10/11 (64-bit)</td></tr>
  <tr><td>GPU</td><td>Any GPU with OpenGL 3.3 support</td></tr>
  <tr><td>Editor version</td><td><code>v0.2.0</code> (shown in the window title)</td></tr>
  <tr><td>Pairs with</td><td>Extension <code>v0.2.0</code> · export format <code>v1.2</code>
      (v1.0 and v1.1 files migrate automatically)</td></tr>
</table></div>

<h2>2. Choose your editor mode</h2>
<p>The first thing you see is the startup dialog — the app logo plus four mode cards.
Each mode pairs a renderer (2D sprites / 3D meshes) with a simulation style
(classic particles / trails &amp; ribbons):</p>

{mainmenu}

<div class="table-wrap"><table>
  <tr><th>Key</th><th>Mode</th><th>Best for</th></tr>
  <tr><td><kbd>2</kbd></td><td><strong>2D | Sprites &amp; SVG</strong></td>
      <td>2D games: point sprites, SVG shapes, images</td></tr>
  <tr><td><kbd>3</kbd></td><td><strong>3D | Meshes &amp; Billboards</strong></td>
      <td>3D scenes: spheres, cubes, custom GLB models, billboards</td></tr>
  <tr><td><kbd>4</kbd></td><td><strong>2D | Trails &amp; Ribbons</strong></td>
      <td>Sword slashes, speed lines, magic beams in 2D</td></tr>
  <tr><td><kbd>5</kbd></td><td><strong>3D | Trails &amp; Ribbons</strong></td>
      <td>Arrows, projectiles, ribbons in 3D</td></tr>
</table></div>

<div class="note">You can switch between the 2D and 3D dot modes any time from the
top toolbar (<strong>2D / 3D</strong> toggle). Trails mode is a dedicated mode chosen at
startup — see <a href="trails.html">Trails &amp; Ribbons</a>.</div>

<h2>3. Play with a template</h2>
<div class="steps">
  <div class="step"><h3>Load a template</h3>
    <p>The editor starts on the <strong>Default</strong> effect. Use the template list in the
    sidebar (<em>Explosion, Fire, Rain, Snow</em> — 2D + 3D variants) to load a finished effect.</p></div>
  <div class="step"><h3>Watch it live</h3>
    <p>The Dear PyGui main viewport renders through its drawlist, with an optional OpenGL
    raster layer for dense scenes. Use Browser Fast Preview for the separate Three.js/PixiJS
    preview window; it syncs edits every 500&nbsp;ms.</p></div>
  <div class="step"><h3>Tweak the numbers</h3>
    <p>Flow, lifetime, colors, gravity, blend mode… every change shows up immediately.
    <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes — 100 steps deep.</p></div>
  <div class="step"><h3>Export</h3>
    <p>Hit <strong>Export JSON</strong> (or <strong>Save</strong>) and you get an
    <code>.json</code> effect file validated against the export schema — ready for the
    GDevelop extension.</p></div>
</div>

<h2>Run from source / rebuild</h2>
<pre><code>pip install dearpygui
python editor/studio_imgui.py        # Dear PyGui UI (full features)</code></pre>

<p>Tk fallback (shared logic layer — no blend/seed/force-field widgets, but those
values are preserved on round-trip):</p>
<pre><code>python editor/particle_studio.py</code></pre>

<p>Rebuild the packaged app (compile check → C++ core build if stale → PyInstaller →
smoke test → Windows shortcut):</p>
<pre><code>python tools/rebuild_app.py</code></pre>

<p>This produces <code>dist/LempoParticleEditor.exe</code> plus the <em>Lempo Particle Editor</em>
desktop shortcut (both carry the Lempo icon).</p>

<div class="note">Binaries (<code>dist/</code>, <code>*.exe</code>, <code>*.pyd</code>,
<code>node_modules/</code>) are never committed — they are rebuilt locally and shipped through
GitHub Releases.</div>

<h2>Next steps</h2>
<div class="cards">
  <div class="card"><h3><a href="editor.html">Editor Tour →</a></h3>
    <p>Learn every panel: emitter, force fields, states, shapes, navigation.</p></div>
  <div class="card"><h3><a href="gdevelop.html">GDevelop Guide →</a></h3>
    <p>Import the extension and play your effect in-game.</p></div>
</div>
""".format(mainmenu=fig(
    "main-menu.jpg",
    "<b>Startup dialog</b> — pick your editor mode (press 2 / 3 / 4 / 5)"),
)))

# ============================================================
# Editor Tour
# ============================================================
PAGES.append(dict(
    filename="editor.html",
    title="Editor Tour — Lempo Particle FX Docs",
    desc="Walkthrough of the Lempo Particle Editor UI: toolbar, emitter panel, "
         "force fields, gravity, emission zone, states, templates, shapes and "
         "viewport navigation.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Using the Editor</p>
<h1>Editor Tour</h1>
<p class="lead">The window is split into four areas: a top toolbar, the settings
sidebar on the left, the live viewport in the middle, and the states/status bar
underneath.</p>

<h2>Top toolbar</h2>
<div class="table-wrap"><table>
  <tr><th>Control</th><th>What it does</th></tr>
  <tr><td><strong>Lempo</strong> menu</td><td>App menu (presets, settings, about)</td></tr>
  <tr><td>Effect name (<em>Default</em>)</td><td>Current effect / preset</td></tr>
  <tr><td><strong>2D / 3D</strong> toggle</td><td>Switch renderer (a purple dot marks the active one)</td></tr>
  <tr><td><strong>FOV</strong> − / +</td><td>3D field of view</td></tr>
  <tr><td><strong>Sens</strong> − / +</td><td>Navigation sensitivity</td></tr>
  <tr><td><strong>New / Save / Save As / Open</strong></td>
      <td>Effect files use the OS-native file dialog</td></tr>
</table></div>

<h2>Sidebar — Emitter panel</h2>
<p>The emitter panel is the heart of the effect. Sections top to bottom:</p>

{emitter}

<div class="table-wrap"><table>
  <tr><th>Section</th><th>Key settings</th></tr>
  <tr><td><strong>Particle output</strong></td>
      <td><code>Flow</code> (particles/sec) · <code>Max</code> cap · <code>Mode</code>
      (Infinite / Burst) · <code>Reverse</code> · <code>Align dir.</code> ·
      <code>Blend</code> mode · <code>Seed</code></td></tr>
  <tr><td><strong>Force fields</strong> <span class="tag">v1.2</span></td>
      <td>Turbulence (amount/scale/speed) · Y-axis vortex · attractor (strength/radius/X/Y) ·
      collision plane (Y, bounce, friction) — <strong>all off by default</strong></td></tr>
  <tr><td><strong>Gravity</strong></td><td>Gravity X / Y (world pull on every particle)</td></tr>
  <tr><td><strong>Emission zone</strong></td>
      <td>Spawn shape (Circle / Rect …), rotation, radius, width, height</td></tr>
</table></div>

<div class="tip"><strong>Deterministic seed.</strong> A nonzero <code>seed</code> makes replay
deterministic within each runtime. Python and C++ parity is tested; the browser preview and
GDevelop extension have separate spawn implementations, so the same seed does not guarantee
identical particle records between them. <code>0</code> keeps legacy unseeded behavior.</div>

<div class="note">The Dear PyGui sidebar exposes blend, seed and force-field widgets.
The Tk fallback preserves those values on round-trip but has no widgets for them.</div>

<h2>States &amp; templates</h2>
<p>Under the viewport sits the <strong>STATES</strong> bar: <em>birth</em> and <em>death</em>
chips (plus <strong>+</strong> to add more). Each state keeps its <strong>own color</strong> —
white means the natural material, any other color tints over the base. Colors cross-fade
between states over the particle's life.</p>

<div class="grid-2">
  {states3d}
  {states2d}
</div>

<p>The sidebar also carries the <strong>templates</strong> list — ready-made effects
(Explosion, Fire, Rain, Snow in 2D + 3D variants) — and the shape picker:</p>

<div class="grid-3">
  {shapes1}
  {shapes2}
  {shapes2d}
</div>

<h3>Shapes &amp; custom assets</h3>
<p><strong>12 particle shapes</strong> are shared by the 2D and 3D renderers: circle, square,
triangle, star, diamond, line, custom, sphere, cube, pyramid, torus, billboard.</p>

{customshape}

<ul>
  <li><strong>Custom 3D models &amp; images</strong> — upload <code>.glb</code> /
      <code>.gltf</code> / <code>.obj</code> (or images for 2D). Models render as themselves in
      the viewport, the browser preview, and in-game. Rigged/skinned GLBs are baked to their
      rest pose automatically.</li>
  <li><strong>Gradual shape morph</strong> — birth-to-death shapes cross-fade inside the
      <code>(0.25, 0.75)</code> window instead of snapping (desktop viewport + browser preview;
      the game runtime keeps the classic swap for meshes).</li>
</ul>

<h2>Force fields in practice</h2>
<div class="table-wrap"><table>
  <tr><th>Field</th><th>Behavior</th></tr>
  <tr><td>Turbulence</td><td>Age-phased noise — subtle drift early, chaos late (or the reverse)</td></tr>
  <tr><td>Vortex</td><td>Swirl around the Y axis</td></tr>
  <tr><td>Attractor</td><td>Pull toward a point with linear falloff over the radius</td></tr>
  <tr><td>Collision plane</td><td>Bounce + friction at a world Y height</td></tr>
</table></div>
<p>All fields are off by default, so legacy motion stays bit-identical when you don't
touch them.</p>

<h2>Viewport navigation</h2>
<div class="table-wrap"><table>
  <tr><th>Mode</th><th>Controls (shown at the bottom of the viewport)</th></tr>
  <tr><td><strong>2D</strong> (GDevelop-style)</td>
      <td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>/arrows move · wheel zooms at
      cursor · <kbd>Space</kbd>+drag pans · <kbd>F</kbd> focus · left-drag gizmo</td></tr>
  <tr><td><strong>3D</strong> (Blender-style)</td>
      <td><kbd>A</kbd>/<kbd>D</kbd> orbit · <kbd>W</kbd>/<kbd>S</kbd> dolly ·
      <kbd>Q</kbd>/<kbd>E</kbd> up-down · MMB orbit · wheel dolly ·
      <kbd>1</kbd>/<kbd>3</kbd>/<kbd>7</kbd> views · <kbd>F</kbd> focus</td></tr>
</table></div>

<h2>Status area</h2>
<ul>
  <li><strong>Particle count &amp; FPS</strong> (top-right of the viewport) — e.g.
      <code>Particles: 20 · FPS: 240 C++</code> shows the compiled core in use.</li>
  <li><strong>STATES chips</strong> + <strong>Fast preview 60FPS</strong> button + a status
      message (Ready / OK — ready).</li>
  <li><strong>Perf HUD</strong> — trails mode shows
      <code>trails: N · verts · draws · sim · render</code> stats.</li>
</ul>

<div class="tip">Above ~900 particles the viewport switches to an <strong>adaptive raster
path</strong>: the particle layer renders offscreen and uploads as a texture while guides and
the gizmo stay crisp vector. You get the same look with far fewer draw calls.</div>
""".format(
        emitter=fig("emitter-panel.png",
                    "<b>Emitter panel</b> — output, force fields, gravity and emission zone"),
        states3d=fig("states-3d.png", "<b>States &amp; templates (3D)</b> — per-state colors"),
        states2d=fig("states-2d.png", "<b>States &amp; templates (2D)</b>"),
        shapes1=fig("shapes-3d-1.png", "<b>3D shapes</b> (1)"),
        shapes2=fig("shapes-3d-2.png", "<b>3D shapes</b> (2)"),
        shapes2d=fig("shapes-2d.png", "<b>2D shapes</b>"),
        customshape=fig("custom-shape.png",
                        "<b>Custom shape system</b> — bring your own image or model"),
)))

# ============================================================
# Viewports & Previews
# ============================================================
PAGES.append(dict(
    filename="previews.html",
    title="Viewports & Previews — Lempo Particle FX Docs",
    desc="The Dear PyGui viewport and OpenGL raster layer, plus the separate browser fast preview.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Using the Editor</p>
<h1>Viewports &amp; Previews</h1>
<p class="lead">The editor's Dear PyGui viewport and the separate browser fast preview
serve different roles. The browser preview renderers share one TypeScript simulation engine;
the editor's viewport and GDevelop extension use separate implementations.</p>

<h2>1. Dear PyGui editor viewport</h2>
<p>The production editor viewport is part of the Dear PyGui interface. It uses the drawlist,
with an optional offscreen OpenGL raster layer for dense particle scenes and vector overlays
for guides and gizmos. Three.js/PixiJS are not embedded in this viewport.</p>

<div class="grid-2">
  {vp3d}
  {vp2d}
</div>

<div class="table-wrap"><table>
  <tr><th>Layer</th><th>Role</th></tr>
  <tr><td><strong>Drawlist</strong></td><td>Viewport drawing and editor overlays</td></tr>
  <tr><td><strong>OpenGL raster</strong></td><td>Optional particle rasterization for dense scenes</td></tr>
  <tr><td><strong>Spike B host</strong></td><td><code>viewport_host.py --viewport-host</code> is a migration spike, not production in-place integration.</td></tr>
</table></div>

<div class="tip"><strong>Migration status.</strong> Spike B demonstrates a possible viewport host.
It does not replace or embed into the production Dear PyGui viewport.</div>

<h2>2. In-editor GL preview</h2>
<p>The optional offscreen <strong>OpenGL 3.3</strong> raster layer is built on raw
<code>ctypes</code> (no PyOpenGL or numpy needed). It accelerates dense particle scenes;
the Dear PyGui drawlist continues to render guides and gizmos over the particle layer.</p>
<ul>
  <li><strong>Adaptive viewport</strong> — crisp vector drawlist for small particle counts;
      above ~900 particles the particle layer renders offscreen and uploads as a texture
      while guides/gizmo stay vector.</li>
  <li><strong>Blend-aware</strong> — every blend mode has an explicit GL formula with a
      single-warning fallback.</li>
</ul>

<h2>3. Browser fast preview</h2>
<p>Click <strong>Fast preview 60FPS</strong> in the status bar. It opens a separate,
self-contained
<code>live_effect.html</code> (≈1.1&nbsp;MB, <strong>zero network fetches</strong>) rendering the
effect live through the shared TypeScript engine: Three.js (3D), PixiJS (2D), with a Canvas
fallback. It has 500&nbsp;ms live-sync, particle count +
FPS readout, an <em>Open JSON</em> button and <em>Replay burst</em>.</p>

<div class="grid-2">
  {fp3d}
  {fp2d}
</div>

<p>Trail mode renders ribbons in the browser preview and hides particle dots. Rendering details
may vary between preview and editor:</p>

{fptrail}

<h2>Live-sync, explained</h2>
<div class="steps">
  <div class="step"><h3>Edit anything in the sidebar</h3>
    <p>Flow, colors, gravity, trail width… every field is part of one effect snapshot.</p></div>
  <div class="step"><h3>Snapshot is serialized (≤ 500 ms cadence)</h3>
    <p>The editor batches rapid changes into one snapshot instead of streaming every keystroke.</p></div>
  <div class="step"><h3>Preview applies it atomically</h3>
    <p>The browser preview applies each snapshot atomically and reinitializes its seeded replay.</p></div>
</div>

<div class="note"><strong>OS-native file dialogs.</strong> Save / Export / Open use the OS file
picker, because Dear PyGui's built-in dialogs return empty results here.</div>

<h2>When something looks wrong</h2>
<div class="table-wrap"><table>
  <tr><th>Symptom</th><th>What to do</th></tr>
  <tr><td>Editor viewport differs from browser output</td>
      <td>The viewport renderers are separate. Compare simulation settings and renderer-specific
      features; report reproducible differences with an exported effect.</td></tr>
  <tr><td>Fast preview doesn't open</td>
      <td>The file is fully offline. Reopen it from the editor's Fast Preview action.</td></tr>
</table></div>
""".format(
        vp3d=fig("viewport-3d.png", "<b>Editor viewport (3D)</b> — Dear PyGui/OpenGL"),
        vp2d=fig("viewport-2d.png", "<b>Editor viewport (2D)</b> — Dear PyGui drawlist"),
        fp3d=fig("fast-preview-3d.png", "<b>Fast preview (3D)</b> — Three.js, 500 ms live-sync"),
        fp2d=fig("fast-preview-2d.png", "<b>Fast preview (2D)</b> — PixiJS, 500 ms live-sync"),
        fptrail=fig("fast-preview-trail-2d.jpg",
                    "<b>Fast preview in trail mode</b> — ribbons only, particle dots hidden"),
)))

# ============================================================
# Trails & Ribbons
# ============================================================
PAGES.append(dict(
    filename="trails.html",
    title="Trails & Ribbons — Lempo Particle FX Docs",
    desc="Lempo trails: modes, Unity-style inspector, time/distance emission, "
         "27 templates, adding your own template and the C++ API.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Using the Editor</p>
<h1>Trails &amp; Ribbons <span class="tag new">v0.2.0</span></h1>
<p class="lead">A dedicated mode for ribbon effects — sword slashes, magic beams,
projectile trails — with a Unity-style inspector, curve editors and 27 ready-made
templates. Trail math and data contracts are shared where documented, while rendering and
simulation remain runtime-specific across the editor, browser preview and GDevelop.</p>

<h2>Modes</h2>
<p>Choose <code>2D | Trails &amp; Ribbons</code> (key <kbd>4</kbd>) or
<code>3D | Trails &amp; Ribbons</code> (key <kbd>5</kbd>) in the startup dialog:</p>
<ul>
  <li><strong>Trail mode</strong> renders ribbons only (the <code>trails_on()</code> gate
      skips dots + raster).</li>
  <li><strong>Particle mode</strong> keeps dots + overlay (per-particle trails on top).</li>
</ul>

<div class="grid-2">
  {tr2d}
  {tr3d}
</div>

<h2>Inspector</h2>
<p>A Unity-style inspector with foldouts <strong>Trail / Shape / Color / Texture /
Per-Particle / Lighting &amp; Sorting / Tools &amp; Motion</strong>, generated from one schema
(<code>TRAIL_SCHEMA</code>, 79 keys):</p>
<ul>
  <li>width / gradient curve editors</li>
  <li>tooltips, min/max clamps, drag-labels, steppers</li>
  <li>per-section reset + copy/paste</li>
  <li>template browser — <strong>27 ready-made templates</strong> across
      combat / magic / movement / nature / stylized, with search, favorites, and your own
      saved presets</li>
</ul>

<div class="grid-2">
  {insp2d}
  {insp3d}
</div>

<p>Curves bake to 64-sample and gradients to 256-entry LUTs on change only; the C++ core
parses the same tables and is covered by the trail parity tests.</p>

<div class="table-wrap"><table>
  <tr><th>Inspector section</th><th>Highlights</th></tr>
  <tr><td><strong>Trail</strong></td><td>Fade tail/length, edge softness, core/edge/glow
      colors &amp; widths, flicker, legacy head/tail colors</td></tr>
  <tr><td><strong>Texture</strong></td><td>Texture slot, blend mode, texture mode (stretch/
      tile), tile length, tiling X/Y, offset X/Y, <strong>scroll U/V</strong>,
      <strong>flipbook cols/rows/FPS</strong></td></tr>
  <tr><td><strong>Per-Particle</strong></td><td>Size/alpha jitter and inherit-color</td></tr>
  <tr><td><strong>Lighting &amp; Sorting</strong></td><td>3D lighting response and draw order</td></tr>
  <tr><td><strong>Tools &amp; Motion</strong></td><td>Point gravity/drag/noise, stats, presets,
      copy/paste trails</td></tr>
</table></div>

<h2>Emit mode</h2>
<div class="table-wrap"><table>
  <tr><th>Mode</th><th>Behavior</th></tr>
  <tr><td><code>time</code></td><td>Legacy — lifetime gates; the particle lives, then fades.</td></tr>
  <tr><td><code>distance</code></td><td>Godot-style — fixed sections ×
      <code>sectionLength</code>, speed-independent, the trail dies with the particle.
      <code>sectionLength=0</code> gives an every-frame FIFO tick, like the Trail2D addon.</td></tr>
</table></div>

<h2>Templates</h2>
<p>The template browser lives at the bottom of the trail inspector — categories like
<em>Combat &amp; Weapons</em>, <em>Magic &amp; Energy</em>, <em>Movement &amp; Vehicles</em>,
<em>Nature &amp; Elements</em>, <em>Stylized &amp; Tools</em>. Applying a template overwrites
<strong>only</strong> trail settings (emitter/states are untouched), so hybrid spark looks come
from your live particles via per-particle trails + <code>inheritColor</code>.</p>

<h3>Adding a new template</h3>
<p>Drop one JSON file in <code>assets/presets/trails/&lt;category&gt;/&lt;id&gt;.json</code>,
where <code>category</code> is one of <code>combat | magic | movement | nature | stylized</code>.
No UI or C++ changes needed.</p>

<pre><code>{{
  "id": "",
  "name": "",
  "category": "",
  "description": "",
  "tags": [],
  "modes": ["2d", "3d"],
  "settings": {{}},          // partial trail fields
  "overrides_2d": {{}},
  "overrides_3d": {{}},
  "texture": "dots|null",  // closest supported procedural; editor falls back gracefully
  "textureHiFi": "",       // deferred-runtime G5 id, e.g. slash_streak
  "version": 1,
  "artNotes": "",          // one sentence: what it must look like
  "demoMotion": ""         // reserved parametric path id, player deferred
}}</code></pre>

<p><strong>Rules:</strong></p>
<ul>
  <li>Curves are <code>[[x, y(, mode)]]</code> key lists.</li>
  <li>Gradients are <code>[[x, "#rrggbb"(, mode)]]</code> (color) or
      <code>[[x, a(, mode)]]</code> (alpha) stop lists.</li>
  <li>Field names and ranges come from <code>TRAIL_SCHEMA</code>. Unknown fields are ignored;
      bad values fall back with a warning.</li>
  <li>Missing fields fall back to schema defaults.</li>
</ul>

<h2>C++ API surface</h2>
<p><code>particle_core</code>, raw C API:</p>
<div class="table-wrap"><table>
  <tr><th>Function</th><th>Returns</th></tr>
  <tr><td><code>templates_init(schema, user_dir)</code></td><td>—</td></tr>
  <tr><td><code>templates_register(id, data, is_user)</code></td><td>—</td></tr>
  <tr><td><code>templates_list(category, query, mode, sort, fav_only)</code></td><td><code>[ids]</code></td></tr>
  <tr><td><code>templates_info(id)</code></td><td>template info</td></tr>
  <tr><td><code>templates_apply(id, mode, defaults, current)</code></td><td><code>(settings, changed_ids)</code></td></tr>
  <tr><td><code>templates_thumbnail(id, w, h)</code></td><td><code>(w, h, bytes)</code></td></tr>
  <tr><td><code>templates_texture(kind, w, h)</code></td><td>texture data</td></tr>
  <tr><td><code>templates_fav(id, on)</code></td><td>—</td></tr>
  <tr><td><code>presets_save(name, settings, meta)</code></td><td><code>path</code></td></tr>
  <tr><td><code>presets_delete(name)</code></td><td>—</td></tr>
</table></div>

<div class="table-wrap"><table>
  <tr><th>Layer</th><th>Responsibility</th></tr>
  <tr><td><strong>C++</strong></td><td>Registry, validation, search, merge, LUT-ready data,
      thumbnails, textures, preset files</td></tr>
  <tr><td><strong>Python</strong> (<code>editor/trail_templates_ui.py</code>)</td>
      <td>Builds Dear PyGui widgets, forwards clicks/keys to one core call, and
      <code>set_value</code>s the changed widgets</td></tr>
</table></div>

<div class="tip"><strong>Measured:</strong> scan + validate 27 templates ≈ 5&nbsp;ms ·
apply ≈ 0.10&nbsp;ms · filter ≈ 0.13&nbsp;ms · thumbnails/textures cached and uploaded once.</div>

<div class="note">Trails in-game are part of the extension (v0.2.0): 2D quad strips and 3D
billboard strips, pooled and blend-aware, with <code>hideParticle</code> honored — no new
objects needed. See the <a href="gdevelop.html">GDevelop Guide</a>.</div>
""".format(
        tr2d=fig("trails-2d.png", "<b>Trail ribbons (2D)</b> in the editor viewport"),
        tr3d=fig("trails-3d.png", "<b>Trail ribbons (3D)</b> in the editor viewport"),
        insp2d=fig("trail-inspector-2d.jpg",
                   "<b>Trail inspector (2D)</b> — texture, motion, stats, presets and template categories"),
        insp3d=fig("trail-inspector-3d.jpg",
                   "<b>Trail inspector (3D)</b> — core/edge/glow colors and texture settings"),
)))

# ============================================================
# Blend Modes
# ============================================================
PAGES.append(dict(
    filename="blend-modes.html",
    title="Blend Modes — Lempo Particle FX Docs",
    desc="The seven blend modes in Lempo Particle FX and how each maps to "
         "PixiJS, Three.js, desktop GL and the browser preview.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Using the Editor</p>
<h1>Blend Modes</h1>
<p class="lead">Seven modes, selectable per emitter from the sidebar dropdown — with the
same intent everywhere your effect renders.</p>

<p>At object level in GDevelop, <code>BlendingMode: 'JSON'</code> uses each emitter's own mode;
any explicit value forces all emitters.</p>

<div class="table-wrap"><table>
  <tr><th>Mode</th><th>2D (PixiJS)</th><th>3D (Three.js)</th><th>Desktop GL preview</th><th>Browser preview</th></tr>
  <tr><td>Normal</td><td><code>normal</code></td><td><code>normal</code></td>
      <td><code>SRC_ALPHA, ONE_MINUS_SRC_ALPHA</code></td><td><code>normal</code></td></tr>
  <tr><td>Additive</td><td><code>add</code></td><td><code>additive</code></td>
      <td><code>SRC_ALPHA, ONE</code></td><td><code>add</code></td></tr>
  <tr><td>Subtractive</td><td><code>erase</code> <sup>1</sup></td><td><code>subtractive</code></td>
      <td>reverse-subtract</td><td><code>erase</code> <sup>1</sup></td></tr>
  <tr><td>Multiply</td><td><code>multiply</code></td><td><code>multiply</code></td>
      <td><code>DST_COLOR, ONE_MINUS_SRC_ALPHA</code></td><td><code>multiply</code></td></tr>
  <tr><td>Screen</td><td><code>screen</code></td>
      <td>custom (add + <code>ONE, ONE_MINUS_SRC_COLOR</code>)</td>
      <td><code>ONE, ONE_MINUS_SRC_COLOR</code></td><td><code>screen</code></td></tr>
  <tr><td>Lighten</td><td>→ Normal <sup>2</sup></td><td>custom max-equation</td>
      <td>max</td><td>→ Normal <sup>2</sup></td></tr>
  <tr><td>Overlay</td><td><code>overlay</code></td><td>→ Normal <sup>3</sup></td>
      <td>→ Normal <sup>3</sup></td><td><code>overlay</code></td></tr>
</table></div>

<p><sub>¹ Pixi core has no subtract · ² Pixi core has no lighten · ³ No fixed-function overlay</sub></p>

<div class="warn"><strong>Fallback policy.</strong> Unsupported combinations fall back to
Normal with a <strong>single</strong> <code>console.warn</code> — never per frame, never
throwing. Extension versions before 0.1.2 don't know Screen / Lighten / Overlay and render
them as Normal.</div>

<h2>Recipes</h2>
<div class="table-wrap"><table>
  <tr><th>Look</th><th>Mode</th></tr>
  <tr><td>Fire, sparks, magic glow</td><td><strong>Additive</strong></td></tr>
  <tr><td>Solid opaque debris, smoke over sky</td><td><strong>Normal</strong></td></tr>
  <tr><td>Darkening/shadow motes, ink</td><td><strong>Subtractive</strong> / <strong>Multiply</strong></td></tr>
  <tr><td>Hazy light through fog</td><td><strong>Screen</strong></td></tr>
  <tr><td>Contrasty highlights</td><td><strong>Overlay</strong> / <strong>Lighten</strong></td></tr>
</table></div>

<div class="tip">Blend modes are covered end-to-end by tests: pixel-level GL formulas
(<code>tests/test_gl_blend.py</code>), round-trip + sanitize (<code>tests/test_blend_modes.py</code>)
and extension mappings with stubbed runtimes (<code>preview/test_blend.mjs</code>).
See <a href="testing.html">Testing</a>.</div>
""" 
))

# ============================================================
# GDevelop Guide
# ============================================================
PAGES.append(dict(
    filename="gdevelop.html",
    title="GDevelop Guide — Lempo Particle FX Docs",
    desc="Import the Advanced Particle Emitter extension into GDevelop, set the "
         "ParticleJSON resource and play your Lempo effect in-game.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / In Your Game</p>
<h1>Using Effects in GDevelop</h1>
<p class="lead">Design in Lempo Particle Editor, export JSON, import the extension, then
preview the effect in GDevelop. The extension has its own simulation and renderer, so some
behavior and visual details can differ from the editor and browser preview.</p>

<h2>Four steps</h2>
<div class="steps">
  <div class="step"><h3>Design &amp; export</h3>
    <p>Create your effect in Lempo Particle Editor and export it as a
    <code>.json</code> file (validated against the export schema).</p></div>
  <div class="step"><h3>Import the extension</h3>
    <p>Import <code>AdvancedParticleEmitter.json</code> into your GDevelop project as an
    extension. Requires GDevelop <strong>≥ 5.6.284</strong> — older versions render 3D
    particles at the wrong scale.</p></div>
  <div class="step"><h3>Add the emitter object</h3>
    <p>Add the emitter object to your scene and set its <strong>ParticleJSON</strong> resource
    to the exported file. If the effect uses a custom model, also set the
    <strong>Models GLB</strong> resource to your <code>.glb</code>.</p></div>
  <div class="step"><h3>Run</h3>
    <p>Press preview and enjoy your effect in-game — 2D via PixiJS, 3D via Three.js,
    trails included.</p></div>
</div>

<div class="note">Exact action/condition names depend on the extension version — see the
extension's in-editor descriptions.</div>

<h2>What the extension does</h2>
<div class="table-wrap"><table>
  <tr><th>Feature</th><th>Details</th></tr>
  <tr><td><strong>2D rendering</strong></td><td>PixiJS sprite pool with per-emitter blend
      mapping</td></tr>
  <tr><td><strong>3D rendering</strong></td><td>Three.js — world-scale fix + sRGB colors on
      GDevelop ≥ 5.6.284, objects attached via <code>add3DRendererObject</code></td></tr>
  <tr><td><strong>InstancedMesh batching</strong></td><td>3D primitives collapse ~580 draw
      calls into ~12 buckets, pixel-identical per particle; automatic classic fallback if
      instancing is unavailable</td></tr>
  <tr><td><strong>Trails &amp; ribbons</strong> <span class="tag new">v0.2.0</span></td>
      <td>2D quad strips / 3D billboard strips, pooled and blend-aware, with
      <code>hideParticle</code> honored — the existing emitters grow trail support, no new
      objects; trail-less effects render bit-identical to before</td></tr>
  <tr><td><strong>Blend modes</strong></td><td>Per-emitter from JSON
      (<code>BlendingMode: 'JSON'</code>) or forced at object level</td></tr>
  <tr><td><strong>Deterministic seed</strong></td><td>Replay is deterministic within each
      runtime; equal seeds do not guarantee identical particle records across preview and game</td></tr>
  <tr><td><strong>Force fields</strong> <span class="tag">v1.2</span></td>
      <td>Turbulence, vortex, attractor, collision plane — computed in the runtime too</td></tr>
</table></div>

<h2>Compatibility notes</h2>
<div class="table-wrap"><table>
  <tr><th>Item</th><th>Value</th></tr>
  <tr><td>GDevelop</td><td><code>&gt;=5.6.284</code> for 3D (world scale + sRGB)</td></tr>
  <tr><td>PixiJS</td><td>Preview 8.21.x; GDevelop 7.4.2</td></tr>
  <tr><td>Extension version</td><td>0.2.0 — pairs with editor v0.2.0 / export v1.2</td></tr>
  <tr><td>Three.js</td><td>0.185.1 in both preview and GDevelop (GDevelop ≥ 5.6.284)</td></tr>
  <tr><td>Older extensions</td><td>&lt; 0.1.2 render Screen/Lighten/Overlay as Normal
      (single warning)</td></tr>
</table></div>

<div class="tip">The shipped runtime is tested headlessly in CI with a stubbed
<code>gdjs</code> + real three.js / PIXI (<code>preview/test_ext_runtime.mjs</code>,
<code>preview/test_ext_trails.mjs</code>) — so regressions in the bundled code are caught
before you ever hit them.</div>

<h2>Export checklist</h2>
<ul>
  <li>☐ Effect exported as <code>.json</code> from the editor (format v1.2; v1.0/v1.1 migrate)</li>
  <li>☐ Extension <code>AdvancedParticleEmitter.json</code> imported (≥ 5.6.284)</li>
  <li>☐ <strong>ParticleJSON</strong> resource set on the object</li>
  <li>☐ <strong>Models GLB</strong> resource set <em>if</em> the effect uses a custom model</li>
  <li>☐ Blend mode left on <code>JSON</code> to respect per-emitter modes</li>
</ul>
"""
))

# ============================================================
# Contracts & Export
# ============================================================
PAGES.append(dict(
    filename="contracts.html",
    title="Contracts & Export — Lempo Particle FX Docs",
    desc="The shared data contracts behind Lempo: contracts.json, generated "
         "bindings, export format v1.2 and the particle record layout.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Developers</p>
<h1>Shared Contracts &amp; Export Format</h1>
<p class="lead">Shared schemas and named data contracts live in one place. Simulation
implementations are not all identical: the browser preview has a shared TypeScript engine,
while the GDevelop extension keeps a separate runtime.</p>

<h2>Single source of truth</h2>
<p><code>contracts/contracts.json</code> — particle record layout, <code>SHAPE_ORDER</code>,
easings, blend modes, export schema, and the morph window.</p>

<pre><code>python tools/generate_contracts.py          # regenerate the bindings
python tools/generate_contracts.py --check  # CI drift gate</code></pre>

<div class="warn"><strong>Edit the JSON, run the generator, never the generated outputs.</strong>
CI fails on stale files or drifted consumers.</div>

<h2>Consumers</h2>
<div class="table-wrap"><table>
  <tr><th>Consumer</th><th>How it reads the contracts</th></tr>
  <tr><td><strong>Python</strong> (<code>editor/particle_studio.py</code>)</td>
      <td>Imports the generated files directly</td></tr>
  <tr><td><strong>C++ core</strong> (<code>core/particle_core.cpp</code>)</td>
      <td>Includes the generated header (<code>contracts/gen/contracts.h</code>)</td></tr>
  <tr><td><strong>Browser TypeScript</strong> (<code>lempo-runtime/</code>)</td>
      <td>Shared source for browser-preview particle simulation and pure trail math; renderer adapters consume typed-array frames</td></tr>
  <tr><td><strong>GDevelop extension</strong></td><td>Separate simulation implementation that consumes the export format</td></tr>
</table></div>

<h2>Export format v1.2</h2>
<ul>
  <li>Validated against <code>contracts/gen/schema.json</code> on <strong>save and load</strong>.</li>
  <li>Easing values are hyphenated: <code>linear</code> / <code>ease-in</code> /
      <code>ease-out</code> / <code>ease-in-out</code>.</li>
  <li><code>migrate_effect()</code> heals old files automatically: missing version,
      v1.0 and v1.1 → v1.2, camelCase easings, missing blend mode / seed.</li>
  <li>The effect version is <strong>append-only</strong> — new fields arrive with defaults
      (all OFF), so old files always load.</li>
</ul>

<h2>Particle record layout</h2>
<p>One flat 22-field record per particle — the exact layout the parity tests compare:</p>

<pre><code>[x, y, vx, vy, age, c0, c1, s0, s1, life, z, vz, shape, tracks,
 dx, dy, dz, gx, gy, gz, sizeRatio, speedRatio]</code></pre>

<div class="table-wrap"><table>
  <tr><th>Fields</th><th>Meaning</th></tr>
  <tr><td><code>x, y, z</code></td><td>position (z/vz used in 3D)</td></tr>
  <tr><td><code>vx, vy, vz</code></td><td>velocity</td></tr>
  <tr><td><code>age, life</code></td><td>age vs lifetime (0..1 drives everything over-life)</td></tr>
  <tr><td><code>c0, c1</code></td><td>state colors (birth → death)</td></tr>
  <tr><td><code>s0, s1</code></td><td>size keyframes</td></tr>
  <tr><td><code>shape, tracks</code></td><td>morph shape ids + track bits</td></tr>
  <tr><td><code>dx, dy, dz</code></td><td>direction / alignment axis</td></tr>
  <tr><td><code>gx, gy, gz</code></td><td>guide/gizmo or per-particle offsets</td></tr>
  <tr><td><code>sizeRatio, speedRatio</code></td><td>per-particle spawn draws (seeded RNG)</td></tr>
</table></div>

<h2>Determinism</h2>
<p>A nonzero <code>seed</code> makes replay deterministic within each runtime. The preview
and GDevelop extension consume random values differently, so equal seeds do not guarantee
identical particle records between them:</p>
<div class="table-wrap"><table>
  <tr><th>Engine</th><th>RNG</th></tr>
  <tr><td>Python (<code>SimEngine</code>)</td><td><code>_rand</code></td></tr>
  <tr><td>C++ core</td><td><code>set_seed</code></td></tr>
  <tr><td>Browser preview</td><td><code>mulberry32</code></td></tr>
  <tr><td>GDevelop extension</td><td><code>F.srand</code> / <code>F.rrand</code></td></tr>
</table></div>

<div class="tip">Force fields (v1.2) followed the same recipe: appended with defaults OFF,
so legacy motion stays <strong>bit-identical</strong> for old files. See
<a href="testing.html">Testing</a> for the gates that enforce this.</div>
"""
))

# ============================================================
# Testing
# ============================================================
PAGES.append(dict(
    filename="testing.html",
    title="Testing — Lempo Particle FX Docs",
    desc="The full Lempo test matrix: Python/C++ parity, behavior, contracts, "
         "UI, preview, extension and perf gates in CI.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Developers</p>
<h1>Testing</h1>
<p class="lead">CI runs the parity, behavior, and contract checks on every push
(<code>.github/workflows/ci.yml</code>).</p>

<div class="note"><strong>Naming note:</strong> the editor UI is built on Dear PyGui, which
wraps Dear ImGui — that is why the UI test files are prefixed <code>test_imgui_</code>.</div>

<h2>Headline numbers</h2>
<div class="cards">
  <div class="card"><h3>99/99 parity</h3><p>Python vs C++ simulation output — every case
    matches</p></div>
  <div class="card"><h3>27 templates</h3><p>Trails load/search/apply + thumbnails and
    user-preset round-trip</p></div>
  <div class="card"><h3>Perf gate</h3><p>C++ throughput floor enforced
    (<code>tools/check_perf.py</code>)</p></div>
</div>

<h2>Full test matrix</h2>
<div class="table-wrap"><table>
  <tr><th>Test</th><th>Covers</th></tr>
  <tr><td><code>core/test_parity.py</code></td><td>Python vs C++ simulation output — 99/99 passing</td></tr>
  <tr><td><code>core/test_behavior.py</code></td><td>Simulation behavior, morph-window keys, performance (~2–3 ms @ 2,000 particles)</td></tr>
  <tr><td><code>tests/test_imgui_build.py</code></td><td>UI builds without errors (blend dropdown, seed box, force-field widgets)</td></tr>
  <tr><td><code>tests/test_imgui_logic.py</code></td><td>Headless simulation logic (C++ path)</td></tr>
  <tr><td><code>tests/test_imgui_nav.py</code></td><td>Viewport navigation (WASD/arrows, Q/E, F, Shift×3) + sidebar splitter hover/drag</td></tr>
  <tr><td><code>tests/test_imgui_color.py</code></td><td>Per-state color persistence across birth/death switches</td></tr>
  <tr><td><code>tests/test_imgui_mesh.py</code></td><td>Uploaded models render as meshes, tint, culling, LOD</td></tr>
  <tr><td><code>tests/test_imgui_morph.py</code></td><td>Shape cross-fade window (edges, split alpha, legacy fallback)</td></tr>
  <tr><td><code>tests/test_imgui_upload.py</code></td><td>Upload chain, OBJ parsing, big-JSON node names, bone-node fallback</td></tr>
  <tr><td><code>tests/test_imgui_raster.py</code></td><td>Raster path: PPM conversion, GL orientation, auto-switch, no-GL fallback</td></tr>
  <tr><td><code>tests/test_preview_blobs.py</code></td><td>Model-blob embedding for the browser preview</td></tr>
  <tr><td><code>tests/test_contracts.py</code></td><td>Generated bindings = source, C++ order, schema accept/reject, migration</td></tr>
  <tr><td><code>tests/test_gl_blend.py</code></td><td>Pixel-level GL formulas per blend mode + fallbacks</td></tr>
  <tr><td><code>tests/test_blend_modes.py</code></td><td>Blend round-trip, sanitize, sample layers</td></tr>
  <tr><td><code>tests/test_seed.py</code></td><td>Seed replay identical (Python + C++), divergence, seed-0 legacy</td></tr>
  <tr><td><code>tests/test_fields.py</code></td><td>Field formulas, off-identical, perturb/replay, collision, attractor (Py + C++)</td></tr>
  <tr><td><code>preview/test_blend.mjs</code></td><td>Extension blend mappings + resolution (stubbed runtimes)</td></tr>
  <tr><td><code>preview/test_seed.mjs</code></td><td>Preview seeded replay and extension RNG helper behavior (not cross-runtime particle-record parity)</td></tr>
  <tr><td><code>preview/test_fields.mjs</code></td><td>Extension helpers == Python + preview field behavior</td></tr>
  <tr><td><code>preview/test_trails.mjs</code></td><td>Preview trails: bake parity vs Python (exact), store semantics, engine wiring 2D/3D, style helpers</td></tr>
  <tr><td><code>preview/test_ext_trails.mjs</code></td><td>Extension trails: shipped-helper parity, 3D ribbons/hide (real three.js), 2D ribbons/hide (stub PIXI), hybrid + legacy</td></tr>
  <tr><td><code>preview/test_ext_runtime.mjs</code></td><td>Shipped 3D runtime headless (stub gdjs + real three.js)</td></tr>
  <tr><td><code>preview/test_engine.mjs</code>, <code>test_engine3d.mjs</code>, <code>test_guides.mjs</code>, <code>test_server.py</code></td><td>Browser preview engine, 2D/3D scene layers, guides</td></tr>
  <tr><td><code>preview/test_frame_buffers.mjs</code></td><td>Typed-array frame contents and stable buffer reuse</td></tr>
  <tr><td><code>preview/test_engine_parity.mjs</code> + <code>engine_parity_baseline.json</code></td><td>Seeded 120-frame 2D/3D snapshots against the pre-refactor browser simulation; this does not assert parity with GDevelop</td></tr>
  <tr><td><code>preview/test_models.mjs</code></td><td>Model-blob caching and live-push behavior</td></tr>
  <tr><td><code>preview/test_morph.mjs</code></td><td>Preview-side <code>morphAt()</code> cross-fade sampling</td></tr>
  <tr><td><code>preview/test_bake.mjs</code> / <code>test_ext_bake.mjs</code></td><td>Skinned-mesh rest-pose baking (preview + shipped extension)</td></tr>
  <tr><td><code>tests/test_trails_schema.py</code></td><td><code>TRAIL_SCHEMA</code> ↔ defaults sync, clamps, LUT sizes</td></tr>
  <tr><td><code>tests/test_trails_roundtrip.py</code></td><td>Trail files byte-stable round-trip + old-file heal</td></tr>
  <tr><td><code>tests/test_trails_parity.py</code></td><td>Python ↔ C++ trail width/gradient/scalars</td></tr>
  <tr><td><code>tests/test_trails_perf.py</code></td><td>Trail update/bake perf budgets</td></tr>
  <tr><td><code>tests/test_trails_flow.py</code></td><td>Time/distance emission, exact spacing, tick FIFO, trail death</td></tr>
  <tr><td><code>tests/test_trails_render.py</code></td><td>Ribbon-strip math + viewport smoke</td></tr>
  <tr><td><code>tests/test_trails_templates.py</code></td><td>27 templates load/search/apply, thumbnails, user-preset round-trip</td></tr>
  <tr><td><code>tests/test_view2d_zoom.py</code></td><td>World-space 2D zoom math, anchors, raster agreement</td></tr>
  <tr><td><code>tools/check_perf.py</code></td><td>CI perf gate: C++ throughput floor</td></tr>
  <tr><td><code>render/test_gl.py</code>, <code>test_clip.py</code>, <code>test_cost.py</code></td><td>GL context init, projection parity, render-cost profiling</td></tr>
</table></div>

<h2>Running locally</h2>
<pre><code>python tools/generate_contracts.py --check   # contract drift gate
python core/test_parity.py                   # Python vs C++
python -m pytest tests/ -q                   # editor + schema suite
node preview/test_ext_trails.mjs             # extension trails headless
python tools/check_perf.py                   # throughput floor</code></pre>

<p>The packaged app has its own smoke path: <code>python editor/studio_imgui.py --smoke 120</code>
boots the UI for 120 frames and reports particle count + FPS.</p>
"""
))

# ============================================================
# Roadmap & FAQ
# ============================================================
PAGES.append(dict(
    filename="roadmap.html",
    title="Roadmap & FAQ — Lempo Particle FX Docs",
    desc="Viewport migration roadmap by phase, current implementation status, and "
         "frequently asked questions.",
    body="""
<p class="breadcrumb"><a href="index.html">Docs</a> / Project</p>
<h1>Roadmap &amp; FAQ</h1>

<h2>Viewport migration roadmap</h2>
<p class="lead">The viewport migration is tracked in phases. Phases 0, 1 and 2 are implemented;
the 100-cycle Phase 2 Chromium/WebGL acceptance passed with live StatsHUD, active trails,
and no browser, canvas, HUD, or continuing renderer-resource leaks. The production editor
still uses its Dear PyGui viewport.</p>
<p>See the full <a href="https://github.com/Boy1developer/Lempo-Particle-Editor/blob/main/LEMPO_VIEWPORT_MIGRATION_PLAN.md">Viewport Migration Plan</a>
and the <a href="https://github.com/Boy1developer/Lempo-Particle-Editor/blob/main/docs/viewport-migration-notes.md">migration notes</a>.</p>

<div class="table-wrap"><table>
  <tr><th>Phase</th><th>Status</th><th>Scope and current result</th></tr>
  <tr><td><strong>0 · Recon, spikes &amp; baselines</strong></td><td><span class="tag new">Complete</span></td>
      <td>Viewport/runtime inventory and renderer-version findings documented; Spike A JSON-lines round trip and Spike B frozen-host launch succeeded; baseline measurements are recorded in <code>bench/baseline-viewport.json</code>; preview tests pass on Three.js 0.185.1. The Spike B host is a demonstration, not production viewport integration.</td></tr>
  <tr><td><strong>1 · Single browser-preview engine</strong></td><td><span class="tag new">Complete</span></td>
      <td><code>lempo-runtime</code> now owns the renderer-agnostic browser simulation and trail math. Preview adapters consume reusable typed-array frames. Seeded 120-frame 2D/3D baselines preserve the pre-refactor preview behavior, and the extension artifact stayed unchanged. GDevelop still has a separate simulation; game-runtime parity is not complete.</td></tr>
  <tr><td><strong>2 · Viewport interface &amp; renderers</strong></td><td><span class="tag new">Implemented</span></td>
      <td>Implemented the viewport contract/controller, persisted adaptive quality, visible StatsHUD, and JSON-lines/WebSocket/polling transports. ThreeViewport uses lazy InstancedMesh buckets with per-particle alpha, a verified pooled classic fallback, model/trail pools, OrbitControls, move-only TransformControls, ViewHelper and guides. PixiViewport uses shape-batched ParticleContainers, pan/zoom, emitter drag, quality caps and pooled dynamic trail meshes. Chromium/WebGL passed 100 controller mode changes (50 per viewport), including HUD lifecycle, active trails, disposal/resource checks, and one warning per unsupported blend fallback. Production editor integration is Phase 3.</td></tr>
  <tr><td><strong>3 · Python bridge</strong></td><td><span class="tag planned">Planned</span></td>
      <td>Connect the editor to a child viewport host over JSON-lines, coalesce incremental edits, handle gizmo events and window lifecycle, and retain the legacy preview path.</td></tr>
  <tr><td><strong>4 · Editor UX parity</strong></td><td><span class="tag planned">Planned</span></td>
      <td>Match the legacy viewport's guides, gizmo, 2D zoom, trails, state colors, shape morph, transport controls and keyboard behavior; document any gaps.</td></tr>
  <tr><td><strong>5 · Parity &amp; performance gates</strong></td><td><span class="tag planned">Planned</span></td>
      <td>Add golden-image and particle-record comparisons plus benchmark gates, then verify the new viewport against the Phase 0 baseline in CI.</td></tr>
  <tr><td><strong>6 · Deprecate legacy paths</strong></td><td><span class="tag planned">Gated: Phase 5 + owner approval</span></td>
      <td>Only after parity is proven and the owner approves: make the web viewport default, remove superseded drawlist/OpenGL viewport paths where safe, update packaging/docs, and rebuild.</td></tr>
  <tr><td><strong>7 · Move editor panels to web</strong></td><td><span class="tag planned">Optional / out of scope</span></td>
      <td>Move inspector and other panels to a web UI only if the owner requests this separate follow-on.</td></tr>
</table></div>

<div class="note"><strong>Current architecture.</strong> Phase 1 made the browser preview renderers
share one TypeScript engine; it did not make the GDevelop extension use that engine. Equal
seeds therefore do not guarantee identical particle records across those runtimes. The
Dear PyGui viewport remains the production editor viewport until the later bridge and parity
phases are implemented.</div>

<h2>FAQ</h2>

<div class="card" style="margin-bottom:12px">
  <h3>Do I need Python to use the editor?</h3>
  <p>No — download <code>LempoParticleEditor.exe</code> from Releases or itch.io and run it.
  Python is only needed to run from source.</p></div>

<div class="card" style="margin-bottom:12px">
  <h3>Which GDevelop version do I need?</h3>
  <p><strong>≥ 5.6.284</strong>. Older versions render 3D particles at the wrong scale
  (the world-scale fix and sRGB colors landed there).</p></div>

<div class="card" style="margin-bottom:12px">
  <h3>Will my old effect files still load?</h3>
  <p>Yes. The export format is append-only: <code>migrate_effect()</code> upgrades v1.0 and v1.1 files to v1.2,
  missing blend mode/seed and camelCase easings, and new fields always ship with their
  defaults (all OFF).</p></div>

<div class="card" style="margin-bottom:12px">
  <h3>Why does my effect look different in the browser?</h3>
  <p>Some differences are expected because the Dear PyGui viewport, browser preview and
  GDevelop extension use different rendering or simulation paths. The browser preview's
  renderers do share one simulation engine; Python/C++ parity is separately tested. Report
  reproducible differences that contradict a documented contract.</p></div>

<div class="card" style="margin-bottom:12px">
  <h3>Is the browser preview embedded in the main editor viewport?</h3>
  <p>No. The production viewport uses Dear PyGui drawlist/OpenGL rendering. Spike B's
  <code>--viewport-host</code> demonstrates a migration option but is not an integrated
  production viewport.</p></div>

<div class="card" style="margin-bottom:12px">
  <h3>Can I use effects in a non-GDevelop game?</h3>
  <p>The export JSON + documented record layout are renderer-agnostic; the supported
  runtimes today are the browser preview (Three.js/PixiJS) and the GDevelop extension.</p></div>

<h2>Links</h2>
<p>
  <a class="btn btn-primary" href="https://github.com/Boy1developer/Lempo-Particle-Editor/releases">📥 Releases</a>
  <a class="btn btn-ghost" href="https://eg-dev1.itch.io/lempo-fx">🎮 itch.io</a>
  <a class="btn btn-ghost" href="https://github.com/Boy1developer/Lempo-FX">💻 Source</a>
  <a class="btn btn-ghost" href="https://www.youtube.com/@EG_dev">🎬 YouTube</a>
</p>

<h2>Credits</h2>
<p><strong>Mostafa Fathy (EG dev)</strong> — independent developer
(<a href="https://github.com/Boy1developer">@Boy1developer</a>).</p>
<div class="table-wrap"><table>
  <tr><th>Library</th><th>License</th><th>Used for</th></tr>
  <tr><td><a href="https://github.com/hoffstadt/DearPyGui">Dear PyGui</a></td><td>MIT</td><td>Desktop editor UI</td></tr>
  <tr><td><a href="https://threejs.org">Three.js</a></td><td>MIT</td><td>3D rendering (browser preview + GDevelop extension; version 0.185.1)</td></tr>
  <tr><td><a href="https://pixijs.com">PixiJS</a></td><td>MIT</td><td>2D rendering (browser preview 8.21.x; GDevelop 7.4.2)</td></tr>
</table></div>
<p>Released under the <a href="https://github.com/Boy1developer/Lempo-Particle-Editor/blob/main/LICENSE">MIT License</a>.</p>
"""
))


def main():
    written = []
    for spec in PAGES:
        html = page(spec["filename"], spec["title"], spec["desc"], spec["body"])
        path = os.path.join(HERE, spec["filename"])
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(html)
        written.append(spec["filename"])
    print("built %d pages: %s" % (len(written), ", ".join(written)))


if __name__ == "__main__":
    main()
