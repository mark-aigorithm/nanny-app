import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  CreateServiceAreaSchema,
  isPointInPolygon,
  polygonAreaKm2,
  type Polygon,
  type ServiceArea,
  type ServiceAreaSource,
} from '@nanny-app/shared';

import { Button, Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { AreaMap } from '@admin/features/service-areas/area-map';
import { createServiceArea, fetchMotherPins, lookupServiceArea, updateServiceArea } from '@admin/lib/api';
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
 * hand. The coverage line counts mothers' default addresses inside.
 */
export function ServiceAreaFormModal({ area, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(area?.name ?? '');
  const [polygon, setPolygon] = useState<Polygon | null>(area?.polygon ?? null);
  const [source, setSource] = useState<ServiceAreaSource>(area?.source ?? 'drawn');
  const [isActive, setIsActive] = useState(area?.isActive ?? true);
  const [drawing, setDrawing] = useState(false);
  // Tells the map the outline was replaced from here (not edited on the map).
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mapsAvailable = isMapsAvailable();

  const { data: pins = [] } = useQuery({ queryKey: ['service-area-pins'], queryFn: fetchMotherPins });

  const inside = useMemo(
    () => (polygon ? pins.filter((p) => isPointInPolygon(p.latitude, p.longitude, polygon)).length : 0),
    [pins, polygon],
  );

  const find = useMutation({
    mutationFn: () => lookupServiceArea(name.trim()),
    onSuccess: (found) => {
      setDrawing(false);
      setPolygon(found.polygon);
      setVersion((v) => v + 1);
      setSource(found.source);
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

  function submit() {
    setFormError(null);
    const parsed = CreateServiceAreaSchema.safeParse({ name: name.trim(), polygon, source, isActive });
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    save.mutate(() => (area ? updateServiceArea(area.id, parsed.data) : createServiceArea(parsed.data)));
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
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="New Cairo" />
        </Field>
        <Button
          variant="ghost"
          disabled={name.trim() === '' || find.isPending || !mapsAvailable}
          onClick={() => find.mutate()}
        >
          Find on map
        </Button>
      </div>
      {notice && <p className="area-form-notice">{notice}</p>}

      {mapsAvailable ? (
        <>
          <AreaMap polygon={polygon} drawing={drawing} pins={pins} version={version} onChange={(p) => { setPolygon(p); if (p && drawing) setSource('drawn'); }} />
          <div className="area-form-tools">
            <Button
              variant="ghost"
              onClick={() => {
                setPolygon(null);
                setVersion((v) => v + 1);
                setDrawing(true);
                setNotice('Click the map to place each corner. From three corners the outline appears; drag corners to adjust.');
              }}
            >
              Draw by hand
            </Button>
            <span className="area-form-hint">Drag a corner to move it, a midpoint to add one; right-click a corner to remove it.</span>
          </div>
          {polygon && (
            <p className="area-form-coverage">
              {polygonAreaKm2(polygon).toFixed(1)} km² · {inside} of {pins.length} mothers’ addresses are inside
            </p>
          )}
        </>
      ) : (
        <p className="area-form-notice">Drawing an area needs the Google Maps key (VITE_GOOGLE_MAPS_API_KEY). You can still switch existing areas on and off.</p>
      )}

      <Field label="Status" hint="Only active areas limit booking.">
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
