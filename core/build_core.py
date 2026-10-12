# -*- coding: utf-8 -*-
"""Build the C++ simulation core (particle_core.pyd) with zero manual setup.

Compiler pick order: MSVC (cl) > g++ > clang++ > Zig (auto-installed via pip).
Output: particle_core.pyd at the repo root (imported by editor/ via bootstrap).
Usage: python core/build_core.py [--clean]
"""
import os
import shutil
import site
import subprocess
import sys
import sysconfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "core", "particle_core.cpp")
HDRS = [os.path.join(ROOT, "core", f) for f in os.listdir(os.path.join(ROOT, "core")) if f.endswith(".h")]
# Extension module suffix per platform: .pyd on Windows, .so elsewhere
# (plain particle_core.so is importable - it is in importlib's
# EXTENSION_SUFFIXES on Linux).
OUT = os.path.join(ROOT, "particle_core" + (".pyd" if sys.platform == "win32" else ".so"))
INC = sysconfig.get_paths()["include"]
LIB = os.path.join(sys.base_prefix, "libs")
PYVER = f"python{sys.version_info.major}{sys.version_info.minor}"  # e.g. python314


def run(cmd, **kw):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, **kw)


def zig_exe():
    for base in (site.getusersitepackages(), *site.getsitepackages()):
        z = os.path.join(base, "ziglang", "zig" + (".exe" if sys.platform == "win32" else ""))
        if os.path.isfile(z):
            return z
    zw = shutil.which("zig")
    return zw


def pip_install_zig():
    run([sys.executable, "-m", "pip", "install", "ziglang", "--quiet"])
    return zig_exe()


def build_msvc():
    run(["cl", "/nologo", "/O2", "/std:c++20", "/EHsc", "/MD", "/LD",
         f"/I{INC}", SRC, f"/link", f"/LIBPATH:{LIB}",
         f"{PYVER}.lib", f"/OUT:{OUT}"])
    for ext in (".exp", ".lib", ".obj"):
        p = os.path.join(ROOT, "particle_core" + ext)
        if os.path.isfile(p):
            os.remove(p)


def build_gnu(cc):
    if sys.platform == "win32":
        # MinGW: needs the import lib for pythonXY.dll. Static gcc runtime
        # (libgcc/libstdc++) so the .pyd doesn't demand those DLLs on
        # machines without this MinGW on PATH; winpthread may still come
        # in as a DLL (some toolchains ship no static libwinpthread.a in
        # their default search path) - if so the smoke test fails and
        # main() falls through to the zig fallback, which statically
        # carries its runtime.
        run([cc, "-shared", "-O2", "-std=c++20", "-DNDEBUG", f"-I{INC}",
             SRC, "-o", OUT, f"-L{LIB}", f"-l{PYVER}",
             "-static-libgcc", "-static-libstdc++"])
    else:
        # Linux/macOS: extension modules must be PIC and do NOT link
        # libpython (symbols resolve against the interpreter at import
        # time; distros frequently ship no libpythonXY.so at all).
        run([cc, "-shared", "-fPIC", "-O2", "-std=c++20", "-DNDEBUG",
             f"-I{INC}", SRC, "-o", OUT])


def build_zig(zig):
    # zig is the Windows fallback (MinGW-style import lib pairing);
    # g++/clang++ cover Linux/macOS natively.
    run([zig, "c++", "-target", "x86_64-windows-gnu", "-shared", "-O2",
         "-std=c++20", "-DNDEBUG", "-Wno-nullability-completeness",
         f"-I{INC}", SRC, "-o", OUT, f"-L{LIB}", f"-l{PYVER}"])


def smoke():
    """Import the freshly built core and run a tiny engine check.

    Raises on failure so main() can fall through to the next compiler
    (a compiler may "succeed" yet produce an unloadable module, e.g.
    MinGW without a static runtime).
    """
    for mod in [m for m in sys.modules if m == "particle_core"
                or m.startswith("particle_core.")]:
        del sys.modules[mod]
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import particle_core
    print("particle_core", particle_core.__version__, "OK;",
          "shapes:", len(particle_core.SHAPE_ORDER))
    e = particle_core.Engine()
    e.configure({"flow": 40, "maxParticles": 300, "mode": "Infinite",
                 "emissionZone": {"shape": "Circle"},
                 "propagationCone": {"direction": 0, "spread": 90}}, [], False)


def main():
    if "--clean" in sys.argv and os.path.isfile(OUT):
        os.remove(OUT)
        print("removed", OUT)
    if not os.path.isfile(SRC):
        sys.exit("missing " + SRC)
    # Try each available compiler in order, falling through on build OR
    # smoke failure, so one broken toolchain (cl without its env, a MinGW
    # g++ emitting unloadable modules, a bad linker pairing) never kills
    # the build while another compiler could succeed.
    attempts = []
    if shutil.which("cl"):
        attempts.append(("cl", build_msvc))
    gnu = "g++" if shutil.which("g++") else (
        "clang++" if shutil.which("clang++") else None)
    if gnu:
        attempts.append((gnu, lambda: build_gnu(gnu)))
    if sys.platform == "win32":
        # zig fallback (Windows-only): it cross-targets mingw import libs
        # and statically carries its runtime; g++/clang++ cover POSIX.
        def _build_zig():
            zig = zig_exe() or pip_install_zig()
            if not zig:
                raise OSError("zig not found / ziglang not installable")
            build_zig(zig)
        attempts.append(("zig", _build_zig))

    last_err = "no compiler tried"
    for label, fn in attempts:
        try:
            fn()
        except (subprocess.CalledProcessError, OSError) as e:
            last_err = f"{label} build failed: {e}"
            print("!", last_err)
            continue
        try:
            smoke()
        except Exception as e:  # noqa: BLE001 - any import/link error counts
            last_err = f"{label} built but smoke failed: {e}"
            print("!", last_err)
            continue
        print("BUILD_OK ->", OUT)
        return
    sys.exit(f"no working C++ compiler ({last_err}; need cl/g++/clang++ or pip install ziglang)")


if __name__ == "__main__":
    main()
