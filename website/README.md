# Lempo Particle FX — Docs Site

Static documentation site for **Lempo Particle Editor v0.2.0** and the
**Advanced Particle Emitter** GDevelop extension.

## Open it

Open `index.html` in a browser, or serve the folder locally:

```bash
python -m http.server 8137
# http://127.0.0.1:8137/index.html
```

## Rebuild the pages

All HTML is generated from one template file — **do not hand-edit the
`.html` files**, edit `build.py` instead:

```bash
python build.py
```

This writes the 10 pages:

| Page | Contents |
| --- | --- |
| `index.html` | Home — overview, screenshots, doc index |
| `getting-started.html` | Download, requirements, startup dialog, run from source |
| `editor.html` | Editor tour — toolbar, emitter panel, states, shapes, navigation |
| `previews.html` | Dear PyGui viewport, OpenGL raster layer, separate browser fast preview |
| `trails.html` | Trails & Ribbons — modes, inspector, templates, C++ API |
| `blend-modes.html` | The seven blend modes and their renderer mappings |
| `gdevelop.html` | Import the extension, resources, in-game features |
| `contracts.html` | Export format v1.2, particle record layout, determinism |
| `testing.html` | Full test matrix and local commands |
| `roadmap.html` | Roadmap, FAQ, links, credits |

## Structure

```
build.py          # template + page content (source of truth)
assets/css/style.css   # dark theme matching the editor UI
assets/js/nav.js       # active nav, mobile sidebar, image lightbox
assets/img/            # screenshots copied from the Lempo-FX repo
LICENSE           # MIT
```

## License

MIT — see [LICENSE](LICENSE).
