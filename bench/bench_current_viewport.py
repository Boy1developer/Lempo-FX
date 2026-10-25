"""Measure the existing Dear PyGui viewport on built-in templates.

Usage: python bench/bench_current_viewport.py [--seconds 5] [--warmup 2]
The real editor window is shown during the run. Results go to
bench/baseline-viewport.json unless --output is supplied.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import platform
import statistics
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "editor"), str(ROOT)]


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def measure(dpg, studio, template: str, mode: str,
            warmup_s: float, sample_s: float) -> dict:
    studio.choose(mode)
    studio.apply_template(template)
    studio.APP._live_push_on = False

    deadline = time.perf_counter() + warmup_s
    while time.perf_counter() < deadline and dpg.is_dearpygui_running():
        studio.frame()
        dpg.render_dearpygui_frame()

    wall_ms: list[float] = []
    cpu_ms: list[float] = []
    command_counts: list[int] = []
    start_wall = time.perf_counter()
    start_cpu = time.process_time()
    end_at = start_wall + sample_s
    while time.perf_counter() < end_at and dpg.is_dearpygui_running():
        t0 = time.perf_counter()
        c0 = time.process_time()
        studio.frame()
        dpg.render_dearpygui_frame()
        wall_ms.append((time.perf_counter() - t0) * 1000.0)
        cpu_ms.append((time.process_time() - c0) * 1000.0)
        try:
            # Drawlist primitives live in DPG's draw-command slot (2).
            command_counts.append(len(dpg.get_item_children("vp_draw", slot=2)))
        except Exception:
            command_counts.append(0)
    elapsed = max(time.perf_counter() - start_wall, 1e-9)
    cpu_total = time.process_time() - start_cpu
    if not wall_ms:
        raise RuntimeError("No viewport frames captured; the window closed.")

    return {
        "template": template,
        "mode": mode,
        "samples": len(wall_ms),
        "frame_ms": {
            "p50": round(percentile(wall_ms, 0.50), 3),
            "p95": round(percentile(wall_ms, 0.95), 3),
        },
        "cpu": {
            "mean_ms_per_frame": round(statistics.mean(cpu_ms), 3),
            "process_utilization_percent": round(100.0 * cpu_total / elapsed, 1),
        },
        "drawlist_commands": {
            "mean": round(statistics.mean(command_counts), 1),
            "p95": round(percentile([float(n) for n in command_counts], 0.95), 1),
        },
        "draw_calls": None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=float, default=5.0,
                        help="measured seconds per scene (default: 5)")
    parser.add_argument("--warmup", type=float, default=2.0,
                        help="warm-up seconds per scene (default: 2)")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "bench" / "baseline-viewport.json")
    args = parser.parse_args()
    if args.seconds <= 0 or args.warmup < 0:
        parser.error("--seconds must be positive and --warmup nonnegative")

    import dearpygui.dearpygui as dpg
    import particle_studio as ps
    import studio_imgui as studio

    results = []
    try:
        dpg.create_context()
        dpg.create_viewport(title="Lempo viewport baseline benchmark",
                            width=1280, height=800)
        studio.apply_theme()
        studio.load_fonts()
        studio.trail_ui_state(load=True)
        studio.init_tpl_ctx()
        studio.build_ui()
        studio.APP.sync_all()
        studio.APP.sim.reset()
        studio.APP._live_push_on = False
        dpg.setup_dearpygui()
        dpg.show_viewport()

        for template in ("Explosion", "Fire", "Rain", "Snow"):
            for mode in ("2d", "3d"):
                print(f"Measuring {template} / {mode}…", flush=True)
                results.append(measure(dpg, studio, template, mode,
                                       args.warmup, args.seconds))
    finally:
        try:
            dpg.destroy_context()
        except Exception:
            pass

    payload = {
        "schema_version": 1,
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "environment": {
            "os": platform.platform(),
            "machine": platform.node(),
            "processor": platform.processor(),
            "python": platform.python_version(),
            "dearpygui": __import__("dearpygui").__version__,
            "particle_core": getattr(studio, "HAS_CPP_CORE", False),
        },
        "method": {
            "warmup_seconds_per_scene": args.warmup,
            "measured_seconds_per_scene": args.seconds,
            "frame_interval": "wall time around studio.frame() + render_dearpygui_frame()",
            "draw_calls": "Dear PyGui does not expose GPU draw-call statistics; null means unavailable. drawlist_commands is a CPU-side command-count proxy, not GPU draw calls.",
            "cpu": "process CPU time per frame plus process utilization over each measured interval",
        },
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
