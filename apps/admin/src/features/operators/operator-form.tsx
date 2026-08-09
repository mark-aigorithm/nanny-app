import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { AdminRole, AdminUser, OperatorPermissions } from '@nanny-app/shared';
import { CreateAdminSchema, UpdateAdminUserSchema } from '@nanny-app/shared';

import {
  Button,
  Feedback,
  Field,
  Modal,
  Select,
  useToast,
  type SelectOption,
} from '@admin/components/ui';
import { createAdmin, updateAdmin } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { PermissionMatrix } from './permission-matrix';

type Props = {
  /** Provided when editing an existing account; omitted when inviting a new one. */
  editing?: AdminUser;
  onClose: () => void;
};

const ROLE_OPTIONS: SelectOption<Exclude<AdminRole, 'SUPERUSER'>>[] = [
  { value: 'OPERATOR', label: 'Operator — only the sections you pick' },
  { value: 'ADMIN', label: 'Admin — the whole console' },
];

const FORM_ID = 'operator-form';

/**
 * Creates or re-scopes a console account. The permission matrix only shows for
 * an operator: a full admin's reach comes from their role, so there is nothing
 * to choose.
 */
export function OperatorForm({ editing, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEditing = editing != null;

  const [name, setName] = useState(editing?.name ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<AdminRole, 'SUPERUSER'>>(
    editing?.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
  );
  const [permissions, setPermissions] = useState<OperatorPermissions>(
    editing?.role === 'OPERATOR' ? editing.permissions : {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        return updateAdmin(editing.id, { name: name.trim(), permissions });
      }
      return createAdmin({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        permissions: role === 'OPERATOR' ? permissions : {},
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast.success(isEditing ? 'Access updated' : 'Account created', saved.email);
      onClose();
    },
    onError: (err) => toast.error(isEditing ? 'Couldn’t save' : 'Couldn’t create account', apiErrorMessage(err)),
  });

  // The role is fixed once created — the matrix is only meaningful for operators.
  const showMatrix = isEditing ? editing.role === 'OPERATOR' : role === 'OPERATOR';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Validate against the same schema the API uses, so the two can't disagree
    // about what a complete payload looks like.
    const parsed = isEditing
      ? UpdateAdminUserSchema.safeParse({ name: name.trim(), permissions })
      : CreateAdminSchema.safeParse({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          permissions: role === 'OPERATOR' ? permissions : {},
        });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? issue.message : 'Invalid input');
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <Modal
      title={isEditing ? `Edit access — ${editing.name}` : 'New team member'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEditing ? 'Save access' : 'Create account'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="operator-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              placeholder="Nour Hassan"
              required
              autoFocus
            />
          </Field>
          {!isEditing && (
            <>
              <Field label="Email" hint="They sign in to the console with this.">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Password" hint="At least 8 characters. Share it with them directly.">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            disabled={mutation.isPending}
          />
        )}

        {formError && <Feedback tone="error">{formError}</Feedback>}
      </form>
    </Modal>
  );
}
