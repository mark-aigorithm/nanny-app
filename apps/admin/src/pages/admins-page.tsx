import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { AdminUser } from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  type Column,
  ErrorState,
  Field,
  PageHeader,
  Table,
  TableSkeleton,
  useToast,
} from '@admin/components/ui';
import { createAdmin, fetchAdmins } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function AdminsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { data: admins, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  const createMutation = useMutation({
    mutationFn: createAdmin,
    onSuccess: (admin) => {
      setName('');
      setEmail('');
      setPassword('');
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast.success('Admin created', admin.email);
    },
    onError: (err) => toast.error('Couldn’t create admin', apiErrorMessage(err)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({ name: name.trim(), email: email.trim(), password });
  };

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (admin) => admin.name },
    { key: 'email', header: 'Email', render: (admin) => admin.email },
    {
      key: 'role',
      header: 'Role',
      render: (admin) => (
        <Badge tone={admin.role === 'SUPERUSER' ? 'success' : 'neutral'}>
          {admin.role.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (admin) => new Date(admin.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Admins"
        subtitle="Create admin accounts. Only the superuser can access this page."
      />
      <Card title="New admin">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <Field label="Name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </Field>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create admin'}
          </Button>
        </form>
      </Card>
      {isLoading && <TableSkeleton columns={4} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {admins && (
        <Table columns={columns} rows={admins} rowKey={(admin) => admin.id} empty="No admins yet." />
      )}
    </section>
  );
}
