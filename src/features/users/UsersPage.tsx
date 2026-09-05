import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, deactivateUser, listUsers } from '@/api/endpoints/users';
import {
  type CreateUserInput,
  PASSWORD_RULES,
  ROLE_NAMES,
  type User,
  createUserSchema,
  passwordScore,
} from '@/api/schemas/users';
import { Button, EmptyState, Eyebrow, Skeleton } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { shortId } from '@/lib/format';

const usersKey = (team: string) => ['users', 'list', team] as const;

export default function UsersPage() {
  const [team, setTeam] = useState('');
  const [pendingDeactivate, setPendingDeactivate] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const { push, pushError } = useToasts();

  const usersQuery = useQuery({
    queryKey: usersKey(team),
    queryFn: ({ signal }) => listUsers(team || undefined, signal),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', full_name: '', password: '', team: 'default', roles: ['ANALYST'] },
  });

  const password = watch('password') ?? '';

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: (user) => {
      push({ tone: 'success', title: 'Account created', detail: `${user.email} on ${user.team}.` });
      reset({ email: '', full_name: '', password: '', team: 'default', roles: ['ANALYST'] });
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
    },
    onError: (error) => pushError(error, 'The account was not created'),
  });

  const deactivate = useMutation({
    mutationFn: (user: User) => deactivateUser(user.id),
    onSuccess: (user) => {
      push({ tone: 'success', title: 'Account deactivated', detail: user.email });
      setPendingDeactivate(null);
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
    },
    onError: (error) => {
      pushError(error, 'The account was not deactivated');
      setPendingDeactivate(null);
    },
  });

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-10">
      <header className="border-b border-rule pb-6">
        <Eyebrow className="!mb-2">01 — Accounts</Eyebrow>
        <h1 className="mb-4">User administration</h1>
        <p className="max-w-2xl text-ink-2">
          {/*
            ADMIN holds users:manage and nothing else — administering accounts
            does not imply reading case files, so this account sees no alerts at
            all and the alert navigation is absent rather than disabled.
          */}
          This account administers people, not cases. It holds no alert scopes, so the alert queue
          is not part of its navigation.
        </p>
      </header>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label htmlFor="team-filter" className="mono-label mb-2 block text-ink-3">
              Filter by team
            </label>
            <input
              id="team-filter"
              className="field w-64"
              placeholder="TEAM-ALPHA"
              value={team}
              onChange={(event) => setTeam(event.target.value.trim().toLowerCase())}
            />
          </div>
          <span className="mono-label text-ink-3">
            {usersQuery.isPending ? 'Loading' : `${users.length} account${users.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {usersQuery.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : usersQuery.isError ? (
          <div className="border border-carmine bg-surface p-6">
            <p className="mono-label mb-2 text-carmine">Accounts unavailable</p>
            <p className="mb-4 text-ink-2">The directory could not be read.</p>
            <Button onClick={() => void usersQuery.refetch()}>Retry</Button>
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No accounts match this team"
            body="Clear the team filter to list every account."
          />
        ) : (
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-rule">
                  {['Email', 'Name', 'Team', 'Scopes', 'State', ''].map((label, index) => (
                    <th
                      key={label || index}
                      scope="col"
                      className={`py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3 ${
                        index === 0 ? 'pl-4 text-left' : index === 5 ? 'pr-4 text-right' : 'text-left'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-rule-soft">
                    <td className="py-3 pl-4 pr-4">
                      <span className="font-mono text-[12px] text-ink" title={user.id}>
                        {user.email}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[14px] text-ink-2">{user.full_name ?? '—'}</td>
                    <td className="py-3 pr-4 font-mono text-[11px] uppercase tracking-tag text-ink-2">
                      {user.team}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="font-mono text-[10px] uppercase tracking-tag text-ink-3"
                        title={user.scopes.join(', ')}
                      >
                        {user.scopes.length} scope{user.scopes.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex border px-2 py-1 font-mono text-[11px] uppercase leading-none tracking-tag ${
                          user.is_active ? 'border-sage text-sage' : 'border-ink-3 text-ink-3'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {user.is_active ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeactivate(user)}
                          className="font-mono text-[11px] uppercase tracking-label text-carmine hover:opacity-70"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <span className="font-mono text-[11px] uppercase tracking-tag text-ink-3">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-6 border-t border-rule pt-10">
        <div>
          <Eyebrow className="!mb-2">02 — Create an account</Eyebrow>
          <p className="max-w-2xl text-ink-2">
            Roles are granted by name and expand to scopes on the server. An unknown role name is
            rejected.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((values) => create.mutate(values))}
          noValidate
          className="grid max-w-3xl gap-6 md:grid-cols-2"
        >
          <div>
            <label htmlFor="email" className="mono-label mb-2 block text-ink-3">
              Email
            </label>
            <input id="email" type="email" className="field" {...register('email')} />
            {errors.email ? <FieldError message={errors.email.message} /> : null}
          </div>

          <div>
            <label htmlFor="full_name" className="mono-label mb-2 block text-ink-3">
              Full name
            </label>
            <input id="full_name" className="field" {...register('full_name')} />
            {errors.full_name ? <FieldError message={errors.full_name.message} /> : null}
          </div>

          <div>
            <label htmlFor="team" className="mono-label mb-2 block text-ink-3">
              Team
            </label>
            <input id="team" className="field" placeholder="team-gamma" {...register('team')} />
            {errors.team ? <FieldError message={errors.team.message} /> : null}
          </div>

          <div>
            <label htmlFor="roles" className="mono-label mb-2 block text-ink-3">
              Role
            </label>
            <select id="roles" className="field" multiple size={3} {...register('roles')}>
              {ROLE_NAMES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {errors.roles ? <FieldError message={errors.roles.message} /> : null}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="password" className="mono-label mb-2 block text-ink-3">
              Password
            </label>
            <input id="password" type="password" className="field" {...register('password')} />
            {/* The meter reads from the same predicates the schema enforces, so
                it can never claim a password is fine when the server will refuse it. */}
            <PasswordMeter value={password} />
            {errors.password ? <FieldError message={errors.password.message} /> : null}
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={isSubmitting || create.isPending}>
              {create.isPending ? 'Creating' : 'Create account'}
            </Button>
          </div>
        </form>
      </section>

      {pendingDeactivate ? (
        <ConfirmDialog
          user={pendingDeactivate}
          pending={deactivate.isPending}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => deactivate.mutate(pendingDeactivate)}
        />
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine">{message}</p>
  );
}

function PasswordMeter({ value }: { value: string }) {
  const score = passwordScore(value);
  return (
    <div className="mt-3">
      <div className="flex gap-1" aria-hidden="true">
        {PASSWORD_RULES.map((rule, index) => (
          <span
            key={rule.id}
            className={`h-[3px] flex-1 ${
              index < score ? (score === PASSWORD_RULES.length ? 'bg-sage' : 'bg-amber') : 'bg-rule'
            }`}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(value);
          return (
            <li
              key={rule.id}
              className={`font-mono text-[10px] uppercase tracking-tag ${
                met ? 'text-sage' : 'text-ink-3'
              }`}
            >
              {met ? '✓' : '·'} {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConfirmDialog({
  user,
  pending,
  onCancel,
  onConfirm,
}: {
  user: User;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md border border-rule bg-surface">
        <div className="border-b border-rule px-6 py-4">
          <p className="eyebrow !mb-0">Confirm deactivation</p>
        </div>
        <div className="space-y-5 p-6">
          <h3 id="confirm-title">Deactivate {user.email}?</h3>
          <p className="text-ink-2">
            The account will no longer be able to sign in. Existing case history is retained and
            still attributes their past actions to them.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-tag text-ink-3">
            {shortId(user.id)} · {user.team}
          </p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {pending ? 'Deactivating' : 'Deactivate'}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
