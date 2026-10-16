# -*- coding: utf-8 -*-
"""Embedded three.js / pixi.js viewport inside the Dear PyGui editor.

The main DPG viewport is CPU vector drawing; real three.js (3D) and pixi.js
(2D) rendering needs a real browser engine. This module hosts the existing
preview page (preview/viewport.html, same main.js — no JS changes) in a
system-browser window:

- Windows: the Edge/Chrome ``--app`` window is re-parented as a WS_CHILD of
  the DPG viewport window and stretched over the drawlist rect, so it looks
  and behaves like the native viewport (three.js for 3D, pixi.js for 2D,
  orbit in-page, live effect sync via the existing last_effect.json poll).
- Linux/other: fragile X11 re-parenting is deliberately NOT attempted;
  a top-level ``--app`` companion window is opened instead (still automatic,
  no preview button needed).
- No browser / headless CI: returns None and the classic DPG drawlist
  viewport keeps working untouched.

Stdlib only (ctypes + subprocess): no new pip deps, no PyInstaller hooks.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

try:
    import winreg as _winreg
except Exception:  # non-Windows
    _winreg = None

VIEW_TITLE = "Lempo Viewport"  # <title> of preview/viewport.html
PARENT_SUB = "Lempo Particle Editor"


# ================= browser discovery =================
def _reg_app_path(exe):
    if _winreg is None:
        return None
    for hive in (_winreg.HKEY_LOCAL_MACHINE, _winreg.HKEY_CURRENT_USER):
        for key in (r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%s" % exe,
                    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\%s" % exe):
            try:
                with _winreg.OpenKey(hive, key) as k:
                    p, _ = _winreg.QueryValueEx(k, "")
                    if p and os.path.isfile(p):
                        return p
            except OSError:
                pass
    return None


def find_browser():
    """(exe_path, kind) or (None, None). kind: 'edge' | 'chrome' | 'chromium'."""
    if sys.platform == "win32":
        for exe, kind in (("msedge.exe", "edge"), ("chrome.exe", "chrome")):
            p = _reg_app_path(exe)
            if p:
                return p, kind
        pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        pf64 = os.environ.get("ProgramFiles", r"C:\Program Files")
        for base, exe, kind in (
                (pf86, r"Microsoft\Edge\Application\msedge.exe", "edge"),
                (pf64, r"Microsoft\Edge\Application\msedge.exe", "edge"),
                (pf64, r"Google\Chrome\Application\chrome.exe", "chrome"),
                (pf86, r"Google\Chrome\Application\chrome.exe", "chrome")):
            p = os.path.join(base, exe)
            if os.path.isfile(p):
                return p, kind
        return None, None
    for exe, kind in (("microsoft-edge", "edge"), ("google-chrome", "chrome"),
                      ("chromium", "chromium"), ("chromium-browser", "chromium")):
        p = shutil.which(exe)
        if p:
            return p, kind
    return None, None


# ================= win32 helpers (ctypes only) =================
class _Win32(object):
    def __init__(self):
        import ctypes
        from ctypes import wintypes
        u32 = ctypes.windll.user32
        self._ct = ctypes
        self._wt = wintypes
        self.u32 = u32
        # prototypes
        u32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
        u32.FindWindowW.restype = wintypes.HWND
        u32.SetParent.argtypes = [wintypes.HWND, wintypes.HWND]
        u32.SetParent.restype = wintypes.HWND
        u32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        u32.GetWindowLongW.restype = ctypes.c_long
        u32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
        u32.SetWindowLongW.restype = ctypes.c_long
        u32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND,
                                     ctypes.c_int, ctypes.c_int,
                                     ctypes.c_int, ctypes.c_int,
                                     ctypes.c_uint]
        u32.SetWindowPos.restype = wintypes.BOOL
        u32.IsWindow.argtypes = [wintypes.HWND]
        u32.IsWindow.restype = wintypes.BOOL
        u32.IsIconic.argtypes = [wintypes.HWND]
        u32.IsIconic.restype = wintypes.BOOL
        u32.ClientToScreen.argtypes = [wintypes.HWND,
                                       ctypes.POINTER(wintypes.POINT)]
        u32.ClientToScreen.restype = wintypes.BOOL
        u32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR,
                                      ctypes.c_int]
        u32.GetClassNameW.restype = ctypes.c_int
        u32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR,
                                       ctypes.c_int]
        u32.GetWindowTextW.restype = ctypes.c_int
        u32.IsWindowVisible.argtypes = [wintypes.HWND]
        u32.IsWindowVisible.restype = wintypes.BOOL
        self.WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND,
                                              wintypes.LPARAM)
        u32.EnumChildWindows.argtypes = [wintypes.HWND, self.WNDENUMPROC,
                                         wintypes.LPARAM]
        u32.EnumChildWindows.restype = wintypes.BOOL
        u32.GetClientRect.argtypes = [wintypes.HWND,
                                      ctypes.POINTER(wintypes.RECT)]
        u32.GetClientRect.restype = wintypes.BOOL
        u32.GetWindowRect.argtypes = [wintypes.HWND,
                                      ctypes.POINTER(wintypes.RECT)]
        u32.GetWindowRect.restype = wintypes.BOOL
        u32.EnumWindows.argtypes = [self.WNDENUMPROC, wintypes.LPARAM]
        u32.EnumWindows.restype = wintypes.BOOL
        try:
            u32.GetDpiForWindow.argtypes = [wintypes.HWND]
            u32.GetDpiForWindow.restype = ctypes.c_uint
            self._dpi = u32.GetDpiForWindow
        except AttributeError:
            self._dpi = None

    # constants
    GWL_STYLE = -16
    WS_CAPTION = 0x00C00000
    WS_CHILD = 0x40000000
    WS_THICKFRAME = 0x00040000
    WS_SYSMENU = 0x00080000
    WS_MINIMIZEBOX = 0x00020000
    WS_MAXIMIZEBOX = 0x00010000
    SWP_FRAMECHANGED = 0x0020
    SWP_SHOWWINDOW = 0x0040
    SWP_HIDEWINDOW = 0x0080
    SWP_NOACTIVATE = 0x0010
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001
    HWND_TOP = 0

    def find_parent(self, exact_title):
        h = self.u32.FindWindowW(None, exact_title)
        if h and self.u32.IsWindow(h):
            return h
        # fallback: any top-level window whose title contains the editor tag
        found = []

        @self.WNDENUMPROC
        def _cb(hwnd, _lp):
            if not self.u32.IsWindowVisible(hwnd):
                return True
            buf = self._ct.create_unicode_buffer(256)
            self.u32.GetWindowTextW(hwnd, buf, 256)
            if PARENT_SUB in (buf.value or ""):
                found.append(hwnd)
            return True

        self.u32.EnumWindows(_cb, 0)
        return found[0] if found else None

    def find_app_window(self, timeout=12.0):
        """Visible Chrome_WidgetWin_1 top-level titled VIEW_TITLE."""
        end = time.time() + timeout

        def _once():
            found = []

            @self.WNDENUMPROC
            def _cb(hwnd, _lp):
                if not self.u32.IsWindowVisible(hwnd):
                    return True
                cls = self._ct.create_unicode_buffer(64)
                self.u32.GetClassNameW(hwnd, cls, 64)
                if (cls.value or "") != "Chrome_WidgetWin_1":
                    return True
                buf = self._ct.create_unicode_buffer(256)
                self.u32.GetWindowTextW(hwnd, buf, 256)
                if VIEW_TITLE in (buf.value or ""):
                    found.append(hwnd)
                return True

            self.u32.EnumWindows(_cb, 0)
            return found[0] if found else None

        h = _once()
        while not h and time.time() < end:
            time.sleep(0.25)
            h = _once()
        return h

    def client_origin(self, hwnd):
        pt = self._wt.POINT(0, 0)
        if not self.u32.ClientToScreen(hwnd, self._ct.byref(pt)):
            return None
        return (pt.x, pt.y)

    def dpi_scale(self, hwnd):
        try:
            if self._dpi is not None:
                return max(1.0, float(self._dpi(hwnd)) / 96.0)
        except Exception:
            pass
        return 1.0

    def embed_child(self, child, parent):
        self.ensure_chromeless(child, force=True)
        self.u32.SetParent(child, parent)

    def ensure_chromeless(self, child, force=False):
        """Force true WS_CHILD + strip caption/frame bits.

        SetParent alone leaves an *owned* top-level window (caption bar
        stays). Chromium also re-asserts its style on window-state
        changes, so this runs on every placement."""
        try:
            style = self.u32.GetWindowLongW(child, self.GWL_STYLE)
        except Exception:
            return False
        strip = (self.WS_CAPTION | self.WS_THICKFRAME | self.WS_SYSMENU |
                 self.WS_MINIMIZEBOX | self.WS_MAXIMIZEBOX)
        want = (style | self.WS_CHILD) & ~strip
        if want != style:
            self.u32.SetWindowLongW(child, self.GWL_STYLE, want)
            return True
        return force

    def place(self, child, x, y, w, h, visible=True):
        flags = (self.SWP_FRAMECHANGED |
                 (self.SWP_SHOWWINDOW if visible else self.SWP_HIDEWINDOW) |
                 self.SWP_NOACTIVATE)
        self.u32.SetWindowPos(child, self.HWND_TOP, int(x), int(y),
                              max(1, int(w)), max(1, int(h)), flags)

    # ---- clip-container host (hides the --app titlebar) ----
    # Chromium draws the --app title strip itself; win32 style ops cannot
    # remove it. Instead the browser is parented into a plain WS_CHILD
    # container sized exactly to the drawlist, and shifted up by the
    # title height so the strip is clipped outside the container.
    _host_cls = "LempoVPHost"
    _host_proc_ref = None

    def _ensure_host_class(self):
        if self._host_proc_ref is not None:
            return True
        WNDPROC = self._ct.WINFUNCTYPE(
            self._ct.c_long, self._wt.HWND, self._ct.c_uint,
            self._wt.WPARAM, self._wt.LPARAM)

        @WNDPROC
        def _proc(hwnd, msg, wp, lp):
            return self.u32.DefWindowProcW(hwnd, msg, wp, lp)

        self._host_proc_ref = _proc  # keep alive (GC would crash windows)
        u32 = self.u32

        class _WNDCLASS(self._ct.Structure):
            _fields_ = [("style", self._ct.c_uint),
                        ("lpfnWndProc", WNDPROC),
                        ("cbClsExtra", self._ct.c_int),
                        ("cbWndExtra", self._ct.c_int),
                        ("hInstance", self._wt.HINSTANCE),
                        ("hIcon", self._wt.HICON),
                        ("hCursor", self._wt.HCURSOR),
                        ("hbrBackground", self._wt.HBRUSH),
                        ("lpszMenuName", self._wt.LPCWSTR),
                        ("lpszClassName", self._wt.LPCWSTR)]

        u32.DefWindowProcW.argtypes = [self._wt.HWND, self._ct.c_uint,
                                       self._wt.WPARAM, self._wt.LPARAM]
        u32.DefWindowProcW.restype = self._ct.c_long
        u32.RegisterClassW.argtypes = [self._ct.POINTER(_WNDCLASS)]
        u32.RegisterClassW.restype = self._wt.ATOM
        u32.CreateWindowExW.argtypes = [self._ct.c_ulong,
                                        self._wt.LPCWSTR, self._wt.LPCWSTR,
                                        self._ct.c_ulong, self._ct.c_int,
                                        self._ct.c_int, self._ct.c_int,
                                        self._ct.c_int, self._wt.HWND,
                                        self._wt.HMENU, self._wt.HINSTANCE,
                                        self._wt.LPVOID]
        u32.CreateWindowExW.restype = self._wt.HWND
        u32.DestroyWindow.argtypes = [self._wt.HWND]
        u32.DestroyWindow.restype = self._wt.BOOL
        u32.MoveWindow.argtypes = [self._wt.HWND, self._ct.c_int,
                                   self._ct.c_int, self._ct.c_int,
                                   self._ct.c_int, self._wt.BOOL]
        u32.MoveWindow.restype = self._wt.BOOL
        wc = _WNDCLASS()
        wc.style = 0
        wc.lpfnWndProc = _proc
        wc.hInstance = self._ct.windll.kernel32.GetModuleHandleW(None)
        wc.lpszClassName = self._host_cls
        atom = u32.RegisterClassW(self._ct.byref(wc))
        return bool(atom)

    def create_host(self, parent, x, y, w, h):
        if not self._ensure_host_class():
            return None
        WS_CHILD = 0x40000000
        WS_VISIBLE = 0x10000000
        WS_CLIPCHILDREN = 0x02000000
        WS_CLIPSIBLINGS = 0x04000000
        h = self.u32.CreateWindowExW(
            0, self._host_cls, "", WS_CHILD | WS_VISIBLE |
            WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
            int(x), int(y), max(1, int(w)), max(1, int(h)),
            parent, None, None, None)
        return h if h and self.u32.IsWindow(h) else None

    def render_top(self, app_window):
        """Screen Y of the page compositor (below the --app title strip)."""
        out = []

        @self.WNDENUMPROC
        def _cb(hwnd, _lp):
            cls = self._ct.create_unicode_buffer(64)
            self.u32.GetClassNameW(hwnd, cls, 64)
            if (cls.value or "") == "Chrome_RenderWidgetHostHWND":
                r = self._wt.RECT()
                self.u32.GetWindowRect(hwnd, self._ct.byref(r))
                out.append(r.top)
            return True

        self.u32.EnumChildWindows(app_window, _cb, 0)
        wr = self._wt.RECT()
        if not self.u32.GetWindowRect(app_window, self._ct.byref(wr)):
            return None
        if not out:
            return None
        return min(out) - wr.top


# ================= DPG rect helper (dpg imported lazily) =================
def drawlist_rect(tag="vp_draw"):
    """(x, y, w, h) of a DPG item in client-area coords, or None.

    Walks the parent chain summing item positions (with child-window
    scroll compensation); size comes from get_item_rect_size.
    """
    try:
        import dearpygui.dearpygui as dpg
    except Exception:
        return None
    try:
        size = dpg.get_item_rect_size(tag)
        x, y = 0.0, 0.0
        cur = tag
        for _ in range(12):
            try:
                px, py = dpg.get_item_pos(cur)
            except Exception:
                break
            x += float(px)
            y += float(py)
            try:
                par = dpg.get_item_parent(cur)
            except Exception:
                par = None
            if not par:
                break
            try:  # scrolled child windows shift content up/left
                x -= float(dpg.get_x_scroll(par) or 0)
                y -= float(dpg.get_y_scroll(par) or 0)
            except Exception:
                pass
            cur = par
        return (x, y, float(size[0]), float(size[1]))
    except Exception:
        return None


# ================= embedded viewport =================
class EmbeddedViewport(object):
    """Owns one system-browser window showing the live preview page."""

    def __init__(self):
        self.mode = None  # 'child' | 'companion' | None
        self.proc = None
        self.child = None
        self.host = None
        self.parent = None
        self.profile = None
        self.browser = None
        self._last = None
        self._edge_geo = None
        self._w32 = None

    def start(self, url, parent_title, w=800, h=536):
        exe, kind = find_browser()
        if not exe:
            return None
        self.browser = exe
        try:
            self.profile = tempfile.mkdtemp(prefix="lempovp_")
        except Exception:
            self.profile = None
        args = [exe, "--app=" + url, "--no-first-run",
                "--no-default-browser-check", "--disable-sync",
                "--disable-features=Translate,TranslateUI",
                "--window-size=%d,%d" % (int(w), int(h))]
        if self.profile:
            args.append("--user-data-dir=" + self.profile)
            # Pre-seed preferences so a FRESH profile never shows first-run
            # bubbles (translate / sync promo) inside the embedded viewport.
            try:
                import json as _json
                _def = os.path.join(self.profile, "Default")
                os.makedirs(_def, exist_ok=True)
                _pref = os.path.join(_def, "Preferences")
                if not os.path.isfile(_pref):
                    with open(_pref, "w", encoding="utf-8") as _f:
                        _json.dump({
                            "translate": {"enabled": False},
                            "translate_site_blacklist_with_time": {},
                            "browser": {"has_seen_welcome_page": True},
                            "signin": {"allowed": False,
                                       "allowed_on_next_startup": False},
                            "sync": {"suppress_startup_errors": True},
                        }, _f)
            except Exception:
                pass
        try:
            if sys.platform == "win32":
                self.proc = subprocess.Popen(
                    args, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
            else:
                if not os.environ.get("DISPLAY"):
                    return None
                self.proc = subprocess.Popen(
                    args, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        except Exception:
            return None
        if sys.platform == "win32":
            try:
                self._w32 = _Win32()
            except Exception:
                self.close()
                return None
            child = self._w32.find_app_window(timeout=15.0)
            if not child:
                self.close()
                return None
            parent = self._w32.find_parent(parent_title)
            if not parent:
                self.close()
                return None
            host = self._w32.create_host(parent, 0, 0, int(w), int(h))
            if not host:
                self.close()
                return None
            try:
                self._w32.embed_child(child, host)
            except Exception:
                self.close()
                return None
            self.child = child
            self.host = host
            self.parent = parent
            self.mode = "child"
            self.place(0, 0, int(w), int(h), force=True)
            return "child"
        self.mode = "companion"
        return "companion"

    def place(self, x, y, w, h, visible=True, force=False):
        if self.mode != "child" or not self.child or not self.host:
            return False
        try:
            key = (int(x), int(y), int(w), int(h), bool(visible))
            restyled = self._w32.ensure_chromeless(self.child)
            if not force and not restyled and key == self._last:
                return True
            if self._w32.u32.IsIconic(self.parent):
                visible = False
            # host sits exactly on the drawlist; the browser inside is
            # shifted up so its --app title strip clips outside the host.
            if self._edge_geo is None or force:
                strip = self._w32.render_top(self.child)
                self._edge_geo = int(strip) if strip else 30
            ex, ey = 0, -self._edge_geo
            ew, eh = max(1, int(w)), max(1, int(h) + self._edge_geo)
            if (ex, ey, ew, eh) != getattr(self, "_edge_last", None):
                self._w32.place(self.child, ex, ey, ew, eh, visible=True)
                self._edge_last = (ex, ey, ew, eh)
            self._w32.place(self.host, int(x), int(y), max(1, int(w)),
                            max(1, int(h)), visible=visible)
            self._last = (int(x), int(y), int(w), int(h), bool(visible))
            return True
        except Exception:
            return False

    def alive(self):
        if self.proc is None:
            return False
        if self.proc.poll() is not None:
            return False
        if self.mode == "child" and self.child:
            try:
                return bool(self._w32.u32.IsWindow(self.child))
            except Exception:
                return False
        return True

    def close(self):
        try:
            if self.host is not None and self._w32 is not None:
                try:
                    self._w32.u32.DestroyWindow(self.host)
                except Exception:
                    pass
        except Exception:
            pass
        self.host = None
        try:
            if self.proc is not None and self.proc.poll() is None:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except Exception:
                    self.proc.kill()
        except Exception:
            pass
        self.proc = None
        self.child = None
        self.mode = None
        if self.profile:
            try:
                import shutil as _sh
                _sh.rmtree(self.profile, ignore_errors=True)
            except Exception:
                pass
            self.profile = None
