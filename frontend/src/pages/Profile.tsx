import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { AvatarSprite, SKINS } from '../components/Avatar';
import { ApiError, auth as authApi } from '../lib/api';

type Note = { kind: 'ok' | 'err'; text: string } | null;

export default function Profile() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, refreshUser, updateProfile, logout, theme, toggleTheme, friends, removeFriend } =
    useStore();

  const [username, setUsername] = useState(user?.username || '');
  const [skin, setSkin] = useState(user?.avatarSkin ?? 0);
  const [nameNote, setNameNote] = useState<Note>(null);
  const [savingName, setSavingName] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailNote, setEmailNote] = useState<Note>(null);
  const [verifyLink, setVerifyLink] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordNote, setPasswordNote] = useState<Note>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteNote, setDeleteNote] = useState<Note>(null);

  const [friendList, setFriendList] = useState<
    { id: string; username: string; avatarSkin: number }[]
  >([]);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username);
    setSkin(user.avatarSkin);
  }, [user?.id]);

  useEffect(() => {
    authApi
      .friends()
      .then((data) => setFriendList(data || []))
      .catch(() => setFriendList([]));
  }, [friends.length]);

  // Landing here from a verification email: ?verify=<token>
  useEffect(() => {
    const token = params.get('verify');
    if (!token) return;
    authApi
      .verifyEmail(token)
      .then(async () => {
        setEmailNote({ kind: 'ok', text: 'Email verified. Nice.' });
        await refreshUser().catch(() => undefined);
      })
      .catch((err) =>
        setEmailNote({
          kind: 'err',
          text: err instanceof ApiError ? err.message : 'That link did not work.',
        }),
      )
      .finally(() => {
        params.delete('verify');
        setParams(params, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const saveIdentity = async () => {
    setNameNote(null);
    const trimmed = username.trim();
    if (trimmed !== user.username) {
      const check = await authApi.usernameAvailable(trimmed).catch(() => null);
      if (check && !check.available) {
        setNameNote({ kind: 'err', text: 'That username is already taken.' });
        return;
      }
    }
    setSavingName(true);
    try {
      await updateProfile({ username: trimmed, avatarSkin: skin });
      setNameNote({ kind: 'ok', text: 'Profile updated.' });
    } catch (err) {
      setNameNote({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not save that.',
      });
    } finally {
      setSavingName(false);
    }
  };

  const changeEmail = async () => {
    setEmailNote(null);
    setVerifyLink('');
    try {
      const data = await authApi.changeEmail(newEmail.trim(), emailPassword);
      setEmailNote({
        kind: 'ok',
        text: `Verification sent to ${data.pendingEmail}. Click the link to confirm.`,
      });
      if (data.verifyLink) setVerifyLink(data.verifyLink);
      setEmailPassword('');
      setNewEmail('');
      await refreshUser().catch(() => undefined);
    } catch (err) {
      setEmailNote({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not change the email.',
      });
    }
  };

  const resendVerification = async () => {
    setEmailNote(null);
    setVerifyLink('');
    try {
      const data = await authApi.resendVerification();
      setEmailNote({ kind: 'ok', text: 'Verification email sent.' });
      if (data.verifyLink) setVerifyLink(data.verifyLink);
    } catch (err) {
      setEmailNote({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not send that.',
      });
    }
  };

  const changePassword = async () => {
    setPasswordNote(null);
    try {
      const data = await authApi.changePassword(currentPassword, newPassword);
      if (data.token) {
        try {
          localStorage.setItem('vibe.token', data.token);
        } catch {
          /* ignore */
        }
      }
      setPasswordNote({ kind: 'ok', text: 'Password changed.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordNote({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not change the password.',
      });
    }
  };

  const deleteAccount = async () => {
    setDeleteNote(null);
    try {
      await authApi.deleteAccount(deletePassword);
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteNote({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not delete the account.',
      });
    }
  };

  return (
    <div className="min-h-screen page-transition" style={{ background: 'var(--background)' }}>
      <header
        className="sticky top-0 z-10 flex items-center gap-4 px-6 py-4 border-b"
        style={{
          background: 'color-mix(in srgb, var(--background) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-ghost px-3 py-2 rounded-xl text-sm"
        >
          <Icon.ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-head)' }}>
          Profile
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleTheme} className="btn-ghost p-2.5 rounded-xl" title={`Theme: ${theme}`}>
            {theme === 'dark' ? <Icon.Moon size={17} /> : theme === 'light' ? <Icon.Sun size={17} /> : <Icon.Layers size={17} />}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost px-3 py-2 rounded-xl text-sm"
          >
            Settings <Icon.ArrowRight size={15} />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
        {/* Identity */}
        <Section title="Who you are" Glyph={Icon.User}>
          <div className="flex items-center gap-5 mb-6">
            <div
              className="rounded-2xl p-4 flex items-center justify-center"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
            >
              <AvatarSprite skin={skin} size={110} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold truncate" style={{ fontFamily: 'var(--font-head)' }}>
                {user.username}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                {user.email}
              </p>
              <span
                className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: user.emailVerified
                    ? 'rgba(74,222,128,0.12)'
                    : 'rgba(234,179,8,0.12)',
                  color: user.emailVerified ? '#4ade80' : '#eab308',
                }}
              >
                {user.emailVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>

          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
            Display name
          </label>
          <input
            className="input-field w-full px-4 py-3 rounded-xl text-sm mb-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
          />

          <p className="text-sm font-semibold mb-3">Avatar</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {SKINS.map((_, index) => (
              <button
                key={index}
                onClick={() => setSkin(index)}
                className="rounded-xl p-2 transition-all"
                style={{
                  background: skin === index ? 'rgba(124,58,237,0.15)' : 'var(--secondary)',
                  border: `2px solid ${skin === index ? 'var(--primary)' : 'var(--border)'}`,
                }}
                title={`Avatar ${index + 1}`}
              >
                <AvatarSprite skin={index} size={40} />
              </button>
            ))}
          </div>

          <Note note={nameNote} />
          <button
            onClick={saveIdentity}
            disabled={savingName}
            className="btn-primary w-full py-3 rounded-xl font-semibold mt-2"
          >
            {savingName ? 'Saving…' : 'Save profile'}
          </button>
        </Section>

        {/* Email */}
        <Section title="Email" Glyph={Icon.Mail}>
          {!user.emailVerified && (
            <button
              onClick={resendVerification}
              className="btn-ghost w-full py-2.5 rounded-xl text-sm mb-4"
              style={{ border: '1px solid var(--border)' }}
            >
              Resend verification email
            </button>
          )}
          {user.pendingEmail && (
            <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
              Waiting on confirmation for <strong>{user.pendingEmail}</strong>.
            </p>
          )}
          <input
            className="input-field w-full px-4 py-3 rounded-xl text-sm mb-3"
            placeholder="new@email.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
          />
          <input
            className="input-field w-full px-4 py-3 rounded-xl text-sm mb-3"
            placeholder="Current password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            type="password"
          />
          <Note note={emailNote} />
          {verifyLink && (
            <p className="text-xs mb-3 break-all" style={{ color: 'var(--muted-foreground)' }}>
              No mail server configured, so here's the link:{' '}
              <a href={verifyLink} style={{ color: 'var(--primary)' }}>
                {verifyLink}
              </a>
            </p>
          )}
          <button
            onClick={changeEmail}
            disabled={!newEmail || !emailPassword}
            className="btn-primary w-full py-3 rounded-xl font-semibold"
          >
            Change email
          </button>
        </Section>

        {/* Password */}
        <Section title="Password" Glyph={Icon.Lock}>
          <input
            className="input-field w-full px-4 py-3 rounded-xl text-sm mb-3"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
          />
          <input
            className="input-field w-full px-4 py-3 rounded-xl text-sm mb-3"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
          />
          <Note note={passwordNote} />
          <button
            onClick={changePassword}
            disabled={!currentPassword || newPassword.length < 6}
            className="btn-primary w-full py-3 rounded-xl font-semibold"
          >
            Update password
          </button>
        </Section>

        {/* Friends */}
        <Section title="Friends" Glyph={Icon.Users}>
          {friendList.length === 0 ? (
            <p className="text-sm py-2" style={{ color: 'var(--muted-foreground)' }}>
              No friends yet — tap someone's avatar inside a room to add them.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {friendList.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 p-2 rounded-xl"
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                >
                  <AvatarSprite skin={friend.avatarSkin} size={30} faceOnly />
                  <span className="text-sm font-semibold flex-1 truncate">{friend.username}</span>
                  <button
                    onClick={async () => {
                      await removeFriend(friend.id);
                      setFriendList((list) => list.filter((f) => f.id !== friend.id));
                    }}
                    className="btn-ghost px-3 py-1.5 rounded-lg text-xs"
                    style={{ color: '#f87171' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" Glyph={Icon.Shield}>
          <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            Deleting your account removes your rooms, messages and queued tracks. This cannot be
            undone.
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{
                background: 'rgba(239,68,68,0.1)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              Delete my account
            </button>
          ) : (
            <>
              <input
                className="input-field w-full px-4 py-3 rounded-xl text-sm mb-3"
                placeholder="Type your password to confirm"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                type="password"
              />
              <Note note={deleteNote} />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeletePassword('');
                  }}
                  className="btn-ghost flex-1 py-3 rounded-xl text-sm"
                  style={{ border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={!deletePassword}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  Delete forever
                </button>
              </div>
            </>
          )}
        </Section>

        <button
          onClick={async () => {
            await logout();
            navigate('/');
          }}
          className="btn-ghost py-3 rounded-xl text-sm"
          style={{ border: '1px solid var(--border)' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  Glyph,
  children,
}: {
  title: string;
  Glyph: React.FC<any>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--elev-1)' }}
    >
      <div className="flex items-center gap-2.5 mb-5" style={{ color: 'var(--primary)' }}>
        <Glyph size={18} />
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function Note({ note }: { note: Note }) {
  if (!note) return null;
  const ok = note.kind === 'ok';
  return (
    <div
      className="px-4 py-2.5 rounded-xl text-xs font-medium mb-3"
      style={{
        background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
        color: ok ? '#4ade80' : '#f87171',
        border: `1px solid ${ok ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }}
    >
      {note.text}
    </div>
  );
}
