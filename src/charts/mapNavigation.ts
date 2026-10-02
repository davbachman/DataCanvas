import { geoEqualEarth, geoMercator, geoEquirectangular } from "d3-geo";
import type { MapSettings } from "../domain/geography";
import { mapZoomLimit } from "./tiles";
export function panMap(m: MapSettings, dx: number, dy: number) {
  const p = (
    m.projection === "mercator"
      ? geoMercator()
      : m.projection === "equalEarth"
        ? geoEqualEarth()
        : geoEquirectangular()
  )
    .scale((m.projection === "equalEarth" ? 100 : 85) * m.zoom)
    .translate([280, 170])
    .center([0, m.centerLatitude])
    .rotate([-m.centerLongitude, 0, 0]);
  const point = p.invert?.([280 - dx, 170 - dy]);
  if (!point || !point.every(Number.isFinite)) return m;
  return {
    ...m,
    centerLongitude: ((point[0] + 540) % 360) - 180,
    centerLatitude: Math.max(-85, Math.min(85, point[1])),
  };
}
/** Commit one view change per gesture, keeping tile requests bounded to settled views. */
export function mapNavigation(
  element: HTMLElement,
  settings: MapSettings,
  change: (m: MapSettings) => void,
  suppressClick: () => void,
) {
  let drag:
    { id: number; x: number; y: number; dx: number; dy: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let zoom = settings.zoom;
  const svg = () => element.querySelector("svg");
  const reset = () => {
    const s = svg();
    if (s) s.style.transform = "";
    element.style.cursor = "grab";
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !(e.target as Element).closest("svg")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    if (Math.hypot(drag.dx, drag.dy) > 4) {
      if (!element.hasPointerCapture(e.pointerId))
        element.setPointerCapture(e.pointerId);
      suppressClick();
      element.style.cursor = "grabbing";
      const s = svg();
      if (s) s.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
    }
  };
  const up = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = undefined;
    if (element.hasPointerCapture(e.pointerId))
      element.releasePointerCapture(e.pointerId);
    const s = svg();
    const ratio = s
      ? s.getBoundingClientRect().width / Number(s.getAttribute("width"))
      : 1;
    reset();
    if (Math.hypot(d.dx, d.dy) > 4) {
      suppressClick();
      change(panMap(settings, d.dx / (ratio || 1), d.dy / (ratio || 1)));
    }
  };
  const cancel = () => {
    drag = undefined;
    reset();
  };
  const wheel = (e: WheelEvent) => {
    if (!(e.target as Element).closest("svg")) return;
    e.preventDefault();
    zoom = Math.max(
      0.5,
      Math.min(mapZoomLimit(settings), zoom * (e.deltaY < 0 ? 1.3 : 1 / 1.3)),
    );
    clearTimeout(timer);
    timer = setTimeout(() => change({ ...settings, zoom }), 200);
  };
  const key = (e: KeyboardEvent) => {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [60, 0],
      ArrowRight: [-60, 0],
      ArrowUp: [0, 60],
      ArrowDown: [0, -60],
    };
    if (directions[e.key]) {
      e.preventDefault();
      change(panMap(settings, ...directions[e.key]));
    }
    if (["+", "=", "-"].includes(e.key)) {
      e.preventDefault();
      change({
        ...settings,
        zoom: Math.max(
          0.5,
          Math.min(
            mapZoomLimit(settings),
            settings.zoom * (e.key === "-" ? 1 / 1.5 : 1.5),
          ),
        ),
      });
    }
  };
  element.style.touchAction = "none";
  element.style.cursor = "grab";
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("keydown", key);
  return () => {
    clearTimeout(timer);
    reset();
    element.style.touchAction = "";
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", cancel);
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("keydown", key);
  };
}
