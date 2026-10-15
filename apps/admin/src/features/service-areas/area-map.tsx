import { useEffect, useRef } from 'react';

import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import type { MotherPin, Polygon, Position } from '@nanny-app/shared';
import { isPointInPolygon } from '@nanny-app/shared';

import { mapsApiKey } from '@admin/lib/maps';

/** New Cairo, where the first area is expected. */
const DEFAULT_CENTER = { lat: 30.02, lng: 31.47 };

type AreaMapProps = {
  polygon: Polygon | null;
  /** Each map click adds a corner (the outline closes itself from 3). */
  drawing: boolean;
  pins: MotherPin[];
  /** Bumped by the form whenever it replaces the outline (Find, Draw by hand, open). */
  version: number;
  onChange: (polygon: Polygon | null) => void;
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
          clickableIcons={false}
          draggableCursor={props.drawing ? 'crosshair' : undefined}
        />
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

function EditablePolygon({ polygon, drawing, version, onChange }: AreaMapProps) {
  const map = useMap();
  const shape = useRef<google.maps.Polygon | null>(null);
  const draft = useRef<google.maps.LatLngLiteral[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastFittedVersion = useRef<number | null>(null);
  const polygonRef = useRef(polygon);
  polygonRef.current = polygon;
  // While drawing, each added corner changes the outline from outside the
  // editable shape, so the corner count joins the redraw key; otherwise only
  // the form's version does, and a corner drag is never redrawn mid-drag.
  const corners = polygon === null ? 0 : polygon.coordinates[0]!.length;
  const drawKey = drawing ? corners : -1;

  // Draw (or redraw) the outline whenever it changes from outside — a lookup,
  // "Clear", opening an existing area. Edits made on the map report through
  // onChange and come back here as the same path, which is a cheap no-op.
  useEffect(() => {
    if (!map) return;
    shape.current?.setMap(null);
    if (!polygon) {
      shape.current = null;
      // Nothing to fit; the outline that follows (drawn by hand) must not fit either.
      lastFittedVersion.current = version;
      return;
    }
    const p = new google.maps.Polygon({
      map,
      paths: toPath(polygon),
      editable: true,
      strokeColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() ||
        undefined,
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
    ];
    shape.current = p;
    // Fit the view only to an outline that came from outside (Find, open);
    // never while corners are being placed or edited, which would move the map
    // under the cursor.
    if (lastFittedVersion.current !== version) {
      lastFittedVersion.current = version;
      const bounds = new google.maps.LatLngBounds();
      toPath(polygon).forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 40);
    }
    return () => {
      listeners.forEach((l) => l.remove());
      p.setMap(null);
    };
    // Only a new outline from outside redraws; map edits keep the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, version, polygon === null, drawKey]);

  // Draw mode: each click adds a corner; from three corners the outline exists.
  useEffect(() => {
    if (!map || !drawing) return;
    draft.current = [];
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      // Continue from the current outline so corners dragged since the last
      // click are kept; before three corners there is no outline yet.
      const current = polygonRef.current ? toPath(polygonRef.current) : draft.current;
      draft.current = [...current, { lat: e.latLng.lat(), lng: e.latLng.lng() }];
      if (draft.current.length >= 3) {
        const ring: Position[] = draft.current.map(({ lat, lng }) => [lng, lat]);
        onChangeRef.current({ type: 'Polygon', coordinates: [[...ring, ring[0] as Position]] });
      }
    });
    return () => listener.remove();
  }, [map, drawing, version]);

  return null;
}

function Pins({ pins, polygon }: { pins: MotherPin[]; polygon: Polygon | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const dots = pins.map(
      (pin) =>
        new google.maps.Circle({
          map,
          center: { lat: pin.latitude, lng: pin.longitude },
          radius: 60,
          strokeWeight: 0,
          fillOpacity: 0.9,
          fillColor:
            polygon && isPointInPolygon(pin.latitude, pin.longitude, polygon)
              ? getComputedStyle(document.documentElement)
                  .getPropertyValue('--color-success')
                  .trim()
              : getComputedStyle(document.documentElement)
                  .getPropertyValue('--color-text-muted')
                  .trim(),
          clickable: false,
        }),
    );
    return () => dots.forEach((d) => d.setMap(null));
  }, [map, pins, polygon]);
  return null;
}
