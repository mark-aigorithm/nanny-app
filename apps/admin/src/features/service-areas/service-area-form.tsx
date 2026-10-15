import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Redo2, Shrink, Spline, Undo2 } from 'lucide-react';

import {
  CreateServiceAreaSchema,
  isPointInPolygon,
  FEWER_CORNERS_TARGET,
  polygonAreaKm2,
  simplifyPolygon,
  type ServiceArea,
} from '@nanny-app/shared';

import { Button, Field, FormModal, ICON_SIZE, Input, Select, useToast } from '@admin/components/ui';
import { AreaMap } from '@admin/features/service-areas/area-map';
import { useOutlineHistory } from '@admin/features/service-areas/use-outline-history';
import {
  createServiceArea,
  fetchMotherPins,
  lookupServiceArea,
  updateServiceArea,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { isMapsAvailable } from '@admin/lib/maps';

type Props = {
  /** The area to edit; omit to add one. */
  area?: ServiceArea;
  onClose: () => void;
};

/**
 * Add or edit a service area. Find looks the name up on OpenStreetMap and draws
 * its border as a starting shape — which can be badly off for informal names,
 * so the dialog says to check it — and the admin drags corners or draws by
 * hand. Every change to the outline can be undone (Ctrl+Z) and redone
 * (Ctrl+Shift+Z or Ctrl+Y). The coverage line counts mothers' default
 * addresses inside.
 */
export function ServiceAreaFormModal({ area, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(area?.name ?? '');
  const history = useOutlineHistory({
    polygon: area?.polygon ?? null,
    source: area?.source ?? 'drawn',
  });
  const { polygon, source } = history.outline;
  const [isActive, setIsActive] = useState(area?.isActive ?? false);
  const [drawing, setDrawing] = useState(false);
  // Tells the map the outline was replaced from here (not edited on the map).
  const [version, setVersion] = useState(0);
  // Asks the map to frame the outline; an area being edited is framed on open.
  const [fitRequest, setFitRequest] = useState(area ? 1 : 0);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mapsAvailable = isMapsAvailable();

  const { data: pins = [] } = useQuery({
    queryKey: ['service-area-pins'],
    queryFn: fetchMotherPins,
  });

  const inside = useMemo(
    () =>
      polygon ? pins.filter((p) => isPointInPolygon(p.latitude, p.longitude, polygon)).length : 0,
    [pins, polygon],
  );

  const find = useMutation({
    mutationFn: () => lookupServiceArea(name.trim()),
    onSuccess: (found) => {
      setDrawing(false);
      history.set({ polygon: found.polygon, source: found.source });
      setVersion((v) => v + 1);
      setFitRequest((f) => f + 1);
      setNotice(
        found.source === 'osm'
          ? `Found “${found.displayName}”. Check the border before saving — informal names can be off.`
          : `No border is mapped for “${found.displayName}”, so this is a rough box. Drag the corners to fit.`,
      );
    },
    onError: (err) => setNotice(apiErrorMessage(err)),
  });

  const save = useMutation({
    mutationFn: (run: () => Promise<ServiceArea>) => run(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['service-areas'] });
      toast.success(area ? 'Area updated' : 'Area added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const corners = polygon ? polygon.coordinates[0]!.length - 1 : 0;
  const canFind = name.trim() !== '' && !find.isPending && mapsAvailable;

  // Undo and Redo replace the outline, so the map must redraw it.
  function undo() {
    if (!history.canUndo) return;
    history.undo();
    setVersion((v) => v + 1);
  }
  function redo() {
    if (!history.canRedo) return;
    history.redo();
    setVersion((v) => v + 1);
  }

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y act on the outline, except inside a text
  // field, where they keep undoing typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
      else return;
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function fewerCorners() {
    if (!polygon) return;
    const thinned = simplifyPolygon(polygon);
    history.set({ polygon: thinned, source });
    setVersion((v) => v + 1);
    setNotice(
      `Thinned to ${thinned.coordinates[0]!.length - 1} corners. Undo brings the detail back.`,
    );
  }

  function submit() {
    setFormError(null);
    const parsed = CreateServiceAreaSchema.safeParse({
      name: name.trim(),
      polygon,
      source,
      isActive,
    });
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    save.mutate(() =>
      area ? updateServiceArea(area.id, parsed.data) : createServiceArea(parsed.data),
    );
  }

  return (
    <FormModal
      title={area ? 'Edit area' : 'Add area'}
      submitLabel={area ? 'Save changes' : 'Add area'}
      busy={save.isPending}
      submitDisabled={name.trim() === '' || polygon === null}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="area-form-find">
        <Field label="Area name">
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter looks the name up rather than saving the area.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (canFind) find.mutate();
            }}
            placeholder="New Cairo"
          />
        </Field>
        <Button variant="ghost" disabled={!canFind} onClick={() => find.mutate()}>
          Find on map
        </Button>
      </div>
      {notice && <p className="area-form-notice">{notice}</p>}

      {mapsAvailable ? (
        <>
          <AreaMap
            polygon={polygon}
            drawing={drawing}
            pins={pins}
            version={version}
            fitRequest={fitRequest}
            onChange={(p) => history.set({ polygon: p, source: drawing ? 'drawn' : source })}
            toolbar={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Undo"
                  title="Undo (Ctrl+Z)"
                  disabled={!history.canUndo}
                  onClick={undo}
                >
                  <Undo2 size={ICON_SIZE.inline} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Redo"
                  title="Redo (Ctrl+Shift+Z)"
                  disabled={!history.canRedo}
                  onClick={redo}
                >
                  <Redo2 size={ICON_SIZE.inline} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title={`Thin the outline to at most ${FEWER_CORNERS_TARGET} corners`}
                  disabled={corners <= FEWER_CORNERS_TARGET}
                  onClick={fewerCorners}
                >
                  <Shrink size={ICON_SIZE.inline} aria-hidden />
                  Fewer corners
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    history.set({ polygon: null, source: 'drawn' });
                    setVersion((v) => v + 1);
                    setDrawing(true);
                    setNotice(
                      'Click the map to place each corner. From three corners the outline appears; drag corners to adjust.',
                    );
                  }}
                >
                  <Spline size={ICON_SIZE.inline} aria-hidden />
                  Draw by hand
                </Button>
              </>
            }
          />
          <p className="area-form-hint">
            Drag a corner to move it, a midpoint to add one; right-click a corner to remove it. Zoom
            with the + and − buttons or the scroll wheel.
          </p>
          {polygon && (
            <p className="area-form-coverage">
              {polygonAreaKm2(polygon).toFixed(1)} km² · {inside} of {pins.length} mothers’
              addresses are inside
            </p>
          )}
        </>
      ) : (
        <p className="area-form-notice">
          Drawing an area needs the Google Maps key (VITE_GOOGLE_MAPS_API_KEY). You can still switch
          existing areas on and off.
        </p>
      )}

      <Field label="Status" hint="New areas start inactive. Only active areas limit booking.">
        <Select
          value={isActive ? 'active' : 'inactive'}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          onChange={(v) => setIsActive(v === 'active')}
        />
      </Field>
    </FormModal>
  );
}
