import { useEffect, useRef, type ReactNode } from 'react';

import { APIProvider, ControlPosition, Map, MapControl, useMap } from '@vis.gl/react-google-maps';
import { Scan } from 'lucide-react';
import type { MotherPin, Polygon, Position } from '@nanny-app/shared';
import { isPointInPolygon } from '@nanny-app/shared';

import { Button, ICON_SIZE } from '@admin/components/ui';
import { mapsApiKey } from '@admin/lib/maps';

/** New Cairo, where the first area is expected. */
const DEFAULT_CENTER = { lat: 30.02, lng: 31.47 };

type AreaMapProps = {
  polygon: Polygon | null;
  /** Each map click adds a corner (the outline closes itself from 3). */
  drawing: boolean;
  pins: MotherPin[];
  /**
   * Bumped by the form whenever it replaces the outline (Find, Draw by hand,
   * Undo, Redo, Fewer corners), so the map redraws it.
   */
  version: number;
  /** Bumped when the view should frame the outline (Find, opening an area). */
  fitRequest: number;
  onChange: (polygon: Polygon | null) => void;
  /** The form's tools, shown on the map so they stay reachable in full screen. */
  toolbar?: ReactNode;
};

/**
 * The outline on Google's map as an editable polygon: drag a corner to move
 * it, drag a midpoint to add one, right-click a corner to remove it. Mothers'
 * default addresses are drawn as dots, green inside the outline, grey outside.
 */
export function AreaMap(props: AreaMapProps) {
  return (
    <APIProvider apiKey={mapsApiKey()}>
      <div className="area-map">
        <Map
          className="area-map-canvas"
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          fullscreenControl
          clickableIcons={false}
          draggableCursor={props.drawing ? 'crosshair' : undefined}
        />
        <Toolbar polygon={props.polygon}>{props.toolbar}</Toolbar>
        <FitToOutline polygon={props.polygon} fitRequest={props.fitRequest} />
        <EditablePolygon {...props} />
        <Pins pins={props.pins} polygon={props.polygon} />
      </div>
    </APIProvider>
  );
}

function toPath(polygon: Polygon): google.maps.LatLngLiteral[] {
  return polygon.coordinates[0]!.slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

function fromPath(path: google.maps.MVCArray<google.maps.LatLng>): Polygon | null {
  const ring: Position[] = path.getArray().map((p) => [p.lng(), p.lat()]);
  if (ring.length < 3) return null;
  return { type: 'Polygon', coordinates: [[...ring, ring[0] as Position]] };
}

/** A colour token from global.css, for drawing on Google's map. */
function token(name: string): string | undefined {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
}

/** The console's primary colour, for the outline and the corners being placed. */
function primaryColor(): string | undefined {
  return token('--color-primary');
}

function fitTo(map: google.maps.Map, polygon: Polygon): void {
  const bounds = new google.maps.LatLngBounds();
  toPath(polygon).forEach((pt) => bounds.extend(pt));
  map.fitBounds(bounds, 40);
}

function Toolbar({ polygon, children }: { polygon: Polygon | null; children: ReactNode }) {
  const map = useMap();
  return (
    <MapControl position={ControlPosition.TOP_LEFT}>
      <div className="area-map-toolbar">
        {children}
        <Button
          variant="ghost"
          size="sm"
          disabled={!map || !polygon}
          onClick={() => map && polygon && fitTo(map, polygon)}
        >
          <Scan size={ICON_SIZE.inline} aria-hidden />
          Fit to area
        </Button>
      </div>
    </MapControl>
  );
}

/**
 * Frames the outline when the form asks (Find, opening an area) — never on
 * an edit, Undo or a corner placed by hand, which would move the map under
 * the cursor.
 */
function FitToOutline({ polygon, fitRequest }: { polygon: Polygon | null; fitRequest: number }) {
  const map = useMap();
  const polygonRef = useRef(polygon);
  polygonRef.current = polygon;
  const lastFit = useRef(0);
  useEffect(() => {
    if (!map || fitRequest === lastFit.current) return;
    lastFit.current = fitRequest;
    if (polygonRef.current) fitTo(map, polygonRef.current);
  }, [map, fitRequest]);
  return null;
}

function EditablePolygon({ polygon, drawing, version, onChange }: AreaMapProps) {
  const map = useMap();
  const shape = useRef<google.maps.Polygon | null>(null);
  const draft = useRef<google.maps.LatLngLiteral[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const polygonRef = useRef(polygon);
  polygonRef.current = polygon;
  // Set while drawing: adds a corner where the map (or the outline) was clicked.
  const addCornerRef = useRef<((at: google.maps.LatLng) => void) | null>(null);
  // While drawing, each added corner changes the outline from outside the
  // editable shape, so the corner count joins the redraw key; otherwise only
  // the form's version does, and a corner drag is never redrawn mid-drag.
  const corners = polygon === null ? 0 : polygon.coordinates[0]!.length;
  const drawKey = drawing ? corners : -1;

  // Draw (or redraw) the outline whenever it changes from outside — a lookup,
  // Draw by hand, Undo/Redo, Fewer corners, opening an existing area. Edits
  // made on the map report through onChange and come back here as the same
  // path, which is a cheap no-op.
  useEffect(() => {
    if (!map) return;
    shape.current?.setMap(null);
    if (!polygon) {
      shape.current = null;
      return;
    }
    const outline = primaryColor();
    const p = new google.maps.Polygon({
      map,
      paths: toPath(polygon),
      editable: true,
      strokeColor: outline,
      fillColor: outline,
      strokeWeight: 2,
      fillOpacity: 0.15,
    });
    const path = p.getPath();
    const report = () => onChangeRef.current(fromPath(path));
    const listeners = [
      path.addListener('set_at', report),
      path.addListener('insert_at', report),
      path.addListener('remove_at', report),
      p.addListener('contextmenu', (e: google.maps.PolyMouseEvent) => {
        if (e.vertex !== undefined && path.getLength() > 3) path.removeAt(e.vertex);
      }),
      // The outline swallows clicks on it, so while drawing a click inside it
      // still adds a corner (a click on a corner or midpoint handle does not).
      p.addListener('click', (e: google.maps.PolyMouseEvent) => {
        if (e.latLng && e.vertex === undefined && e.edge === undefined) {
          addCornerRef.current?.(e.latLng);
        }
      }),
    ];
    shape.current = p;
    return () => {
      listeners.forEach((l) => l.remove());
      p.setMap(null);
    };
    // Only a new outline from outside redraws; map edits keep the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, version, polygon === null, drawKey]);

  // Draw mode: each click adds a corner; from three corners the outline exists.
  // Until then the first corners show as dots joined by a line, so every click
  // visibly does something.
  useEffect(() => {
    if (!map || !drawing) return;
    draft.current = [];
    const color = primaryColor();
    const edge = token('--color-surface');
    const line = new google.maps.Polyline({
      map,
      clickable: false,
      strokeColor: color,
      strokeWeight: 2,
    });
    let dots: google.maps.Marker[] = [];
    const showDraft = (points: google.maps.LatLngLiteral[]) => {
      line.setPath(points);
      dots.forEach((d) => d.setMap(null));
      dots = points.map(
        (position) =>
          new google.maps.Marker({
            map,
            position,
            clickable: false,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: color,
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: edge,
            },
          }),
      );
    };
    const addCorner = (at: google.maps.LatLng) => {
      // Continue from the current outline so corners dragged since the last
      // click are kept; before three corners there is no outline yet.
      const current = polygonRef.current ? toPath(polygonRef.current) : draft.current;
      draft.current = [...current, { lat: at.lat(), lng: at.lng() }];
      if (draft.current.length >= 3) {
        showDraft([]);
        const ring: Position[] = draft.current.map(({ lat, lng }) => [lng, lat]);
        onChangeRef.current({ type: 'Polygon', coordinates: [[...ring, ring[0] as Position]] });
      } else {
        showDraft(draft.current);
      }
    };
    addCornerRef.current = addCorner;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) addCorner(e.latLng);
    });
    return () => {
      listener.remove();
      addCornerRef.current = null;
      showDraft([]);
      line.setMap(null);
    };
  }, [map, drawing, version]);

  return null;
}

function Pins({ pins, polygon }: { pins: MotherPin[]; polygon: Polygon | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim() || undefined;
    const insideColor = token('--color-success-text');
    const outsideColor = token('--color-text-muted');
    const edge = token('--color-surface');
    const dots = pins.map(
      (pin) =>
        new google.maps.Marker({
          map,
          position: { lat: pin.latitude, lng: pin.longitude },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor:
              polygon && isPointInPolygon(pin.latitude, pin.longitude, polygon)
                ? insideColor
                : outsideColor,
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: edge,
          },
          clickable: false,
        }),
    );
    return () => dots.forEach((d) => d.setMap(null));
  }, [map, pins, polygon]);
  return null;
}
