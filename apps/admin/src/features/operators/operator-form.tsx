import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminRole, AdminUser, OperatorPermissions } from '@nanny-app/shared';
import { CreateAdminSchema, UpdateAdminUserSchema } from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast, type SelectOption } from '@admin/components/ui';
import { createAdmin, updateAdmin } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { PermissionMatrix } from './permission-matrix';

type OperatorFormModalProps = {
  /** The account to edit; omit to add a new team member. */
  admin?: AdminUser;
  onClose: () => void;
};

const ROLE_OPTIONS: SelectOption<Exclude<AdminRole, 'SUPERUSER'>>[] = [
  { value: 'OPERATOR', label: 'Operator — only the sections you pick' },
  { value: 'ADMIN', label: 'Admin — the whole console' },
];

/**
 * Add a team member, or edit one — the Team page's one dialog for both. The
 * permission matrix only shows for an operator: a full admin's reach comes from
 * their role, so there is nothing to choose.
 */
export function OperatorFormModal({ admin, onClose }: OperatorFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(admin?.name ?? '');
  const [email, setEmail] = useState(admin?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<AdminRole, 'SUPERUSER'>>(
    admin?.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
  );
  const [permissions, setPermissions] = useState<OperatorPermissions>(
    admin?.role === 'OPERATOR' ? admin.permissions : {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AdminUser>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast.success(admin ? 'Access updated' : 'Account created', saved.email);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  // The role is fixed once created — the matrix is only meaningful for operators.
  const showMatrix = admin ? admin.role === 'OPERATOR' : role === 'OPERATOR';

  function submit() {
    setFormError(null);
    // Validate against the same schema the API uses, so the two can't disagree
    // about what a complete payload looks like.
    if (admin) {
      const parsed = UpdateAdminUserSchema.safeParse({ name: name.trim(), permissions });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updateAdmin(admin.id, parsed.data));
    } else {
      const parsed = CreateAdminSchema.safeParse({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        permissions: role === 'OPERATOR' ? permissions : {},
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createAdmin(parsed.data));
    }
  }

  return (
    <FormModal
      title={admin ? `Edit team member — ${admin.name}` : 'Add team member'}
      submitLabel={admin ? 'Save changes' : 'Add team member'}
      size="md"
      busy={saveMutation.isPending}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            placeholder="Nour Hassan"
            required
            autoFocus
          />
        </Field>
        {!admin && (
          <>
            <Field label="Email" hint="They sign in to the console with this.">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters. Share it with them directly.">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </Field>
            <div className="field">
              <span className="field-label">Role</span>
              <Select<Exclude<AdminRole, 'SUPERUSER'>>
                value={role}
                options={ROLE_OPTIONS}
                onChange={setRole}
              />
              <span className="field-hint">
                An admin sees everything. An operator sees only what you grant below.
              </span>
            </div>
          </>
        )}
      </div>

      {showMatrix && (
        <PermissionMatrix
          value={permissions}
          onChange={setPermissions}
          disabled={saveMutation.isPending}
        />
      )}
    </FormModal>
  );
}
