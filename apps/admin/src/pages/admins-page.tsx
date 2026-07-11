import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { Badge, Button, Card, Feedback, Field, PageHeader } from '@admin/components/ui';
import { createAdmin, fetchAdmins } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function AdminsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { data: admins, isLoading, error } = useQuery({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  const createMutation = useMutation({
    mutationFn: createAdmin,
    onSuccess: () => {
      setName('');
      setEmail('');
      setPassword('');
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({ name: name.trim(), email: email.trim(), password });
  };

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
        {createMutation.error != null && (
          <Feedback tone="error">{apiErrorMessage(createMutation.error)}</Feedback>
        )}
        {createMutation.isSuccess && (
          <Feedback tone="success">Admin account created.</Feedback>
        )}
      </Card>
      {isLoading && <p>Loading admins…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {admins && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.name}</td>
                    <td>{admin.email}</td>
                    <td>
                      <Badge tone={admin.role === 'SUPERUSER' ? 'success' : 'neutral'}>
                        {admin.role.toLowerCase()}
                      </Badge>
                    </td>
                    <td>{new Date(admin.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
