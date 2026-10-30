import { describe, expect, it } from 'vitest'

import { buildLookups } from './maps.mjs'
import { renameSql } from './renameSql.mjs'
import { renameTs } from './renameTs.mjs'

// A small map in the shape of supabase/rename-map-5.0.json, so these cases do not move when the real
// map's decisions change.
const MAP = {
  tables: {
    files: { to: 'file' },
    file_versions: { to: 'file_version' },
    users: { to: 'app_user' },
    notifications: { to: 'notification' },
    team_members: { to: 'team_member' },
    reviews: { to: 'review' },
    file_comments: { to: 'file_comment' },
    user_sessions: { to: 'user_session' },
  },
  views: {},
  columns: [
    { table: 'notifications', column: 'read', to: 'is_read', scope: 'table' },
    { table: 'file_comments', column: 'resolved', to: 'is_resolved', scope: 'table' },
    { table: 'user_sessions', column: 'last_seen', to: 'last_seen_at', scope: 'global' },
  ],
  functions: {
    'checkout_file(uuid, uuid)': { name: 'checkout_file', to: 'file_checkout' },
    'notify_on_read()': { name: 'notify_on_read', to: 'trg_notification_notify' },
  },
  triggers: [{ table: 'notifications', name: 'notify_on_read_trigger', to: 'trg_notification_notify', function: 'notify_on_read' }],
  policies: [{ table: 'notifications', name: 'Users can view their notifications', to: 'notification: users read own' }],
  indexes: { idx_files_vault_id: { to: 'file_vault_id_idx' } },
  constraints: {},
  derivedConstraints: { team_members_user_id_fkey: { to: 'team_member_user_id_fkey' } },
  unchanged: { tables: ['activity'] },
}
const L = buildLookups(MAP)
const sql = (s: string) => renameSql(s, L, { triggerTables: new Map([['notify_on_read', new Set(['notifications'])]]) })
const ts = (s: string) => renameTs(s, L, { file: 'src/example.ts' })

describe('SQL mode', () => {
  it('renames on word boundaries only', () => {
    const r = sql('SELECT f.id FROM files f JOIN file_versions fv ON fv.file_id = f.id WHERE files_total > 0 AND p_files IS NULL;')
    expect(r.text).toBe('SELECT f.id FROM file f JOIN file_version fv ON fv.file_id = f.id WHERE files_total > 0 AND p_files IS NULL;')
  })

  it('never touches auth.users or storage, but follows public.', () => {
    const r = sql('INSERT INTO public.users (id) SELECT id FROM auth.users; DROP POLICY x ON storage.objects;')
    expect(r.text).toBe('INSERT INTO public.app_user (id) SELECT id FROM auth.users; DROP POLICY x ON storage.objects;')
  })

  it('renames functions in calls, grants and the manifest signature literal', () => {
    const r = sql(
      "GRANT EXECUTE ON FUNCTION checkout_file(UUID, UUID) TO authenticated;\n" +
        "SELECT * FROM (VALUES ('core', NULL, 'function', 'checkout_file(uuid,uuid)', 'checkout_file')) v;",
    )
    expect(r.text).toContain('GRANT EXECUTE ON FUNCTION file_checkout(UUID, UUID)')
    expect(r.text).toContain("'file_checkout(uuid,uuid)', 'file_checkout'")
  })

  it('renames a table-scoped column only where the table is in scope', () => {
    const r = sql(
      'UPDATE notifications SET read = true WHERE id = p_id;\n' +
        'SELECT read FROM activity;\n' +
        'SELECT n.read, a.id FROM notifications n JOIN activity a ON a.id = n.id;',
    )
    expect(r.text).toContain('UPDATE notification SET is_read = true')
    expect(r.text).toContain('SELECT read FROM activity;')
    expect(r.text).toContain('SELECT n.is_read, a.id FROM notification n')
  })

  it('uses the innermost subquery for an unqualified column', () => {
    const r = sql('SELECT (SELECT count(*) FROM notifications WHERE NOT read) AS unread, a.id FROM activity a;')
    expect(r.text).toContain('FROM notification WHERE NOT is_read)')
  })

  it('renames the column, not the table, when a column is named like a table', () => {
    const r = sql('CREATE TABLE IF NOT EXISTS file_comments (\n  file_version INTEGER,\n  resolved BOOLEAN\n);')
    expect(r.text).toBe('CREATE TABLE IF NOT EXISTS file_comment (\n  file_version INTEGER,\n  is_resolved BOOLEAN\n);')
  })

  it('follows NEW./OLD. in a trigger function to the trigger table', () => {
    const r = sql(
      'CREATE OR REPLACE FUNCTION notify_on_read() RETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  IF NEW.read THEN RETURN NEW; END IF;\nEND $$;\n' +
        'CREATE TRIGGER notify_on_read_trigger AFTER UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION notify_on_read();',
    )
    expect(r.text).toContain('FUNCTION trg_notification_notify()')
    expect(r.text).toContain('IF NEW.is_read THEN')
    expect(r.text).toContain('CREATE TRIGGER trg_notification_notify AFTER UPDATE ON notification')
  })

  it('reports RETURNS TABLE columns and unresolved records instead of renaming them', () => {
    const r = sql('CREATE FUNCTION f() RETURNS TABLE (read BOOLEAN) AS $$ SELECT r.read FROM x r $$ LANGUAGE sql;')
    expect(r.text).toContain('RETURNS TABLE (read BOOLEAN)')
    expect(r.ambiguous.map((a) => a.reason)).toEqual(
      expect.arrayContaining(['column name as a RETURNS TABLE column (API output)']),
    )
  })

  it('treats string literals by what they are', () => {
    const r = sql(
      "SELECT 1 FROM pg_class WHERE relname = 'files';\n" +
        "SELECT jsonb_build_object('files', 1);\n" +
        "RAISE EXCEPTION 'call checkout_file on file_versions first';\n" +
        "SELECT '{\"files\": 1}'::jsonb;\n" +
        "EXECUTE 'UPDATE files SET x = 1';",
    )
    expect(r.text).toContain("relname = 'file'")
    expect(r.text).toContain("jsonb_build_object('files', 1)")
    expect(r.text).toContain("'call file_checkout on file_version first'")
    expect(r.text).toContain('\'{"files": 1}\'')
    expect(r.text).toContain("EXECUTE 'UPDATE file SET x = 1'")
    expect(r.ambiguous.map((a) => a.token)).toEqual(expect.arrayContaining(["'files'", 'files']))
  })

  it('renames quoted policy names, comments and backticked names, but not file names', () => {
    const r = sql(
      '-- see 10-source-files.sql; `files` and team_members are renamed, files in prose is not\n' +
        'DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;',
    )
    expect(r.text).toBe(
      '-- see 10-source-files.sql; `file` and team_member are renamed, files in prose is not\n' +
        'DROP POLICY IF EXISTS "notification: users read own" ON notification;',
    )
  })

  it('renames indexes, triggers and derived constraint names', () => {
    const r = sql('DROP INDEX IF EXISTS idx_files_vault_id; ALTER TABLE team_members DROP CONSTRAINT team_members_user_id_fkey;')
    expect(r.text).toBe('DROP INDEX IF EXISTS file_vault_id_idx; ALTER TABLE team_member DROP CONSTRAINT team_member_user_id_fkey;')
  })

  it('renames a global column everywhere but not inside larger words', () => {
    const r = sql('UPDATE x SET last_seen = now(), last_seen_by = 1, my_last_seen = 2;')
    expect(r.text).toBe('UPDATE x SET last_seen_at = now(), last_seen_by = 1, my_last_seen = 2;')
  })
})

describe('TS mode', () => {
  it('renames .from, .rpc and the untyped rpc form', () => {
    const r = ts("await supabase.from('files').select('id')\nawait supabase.rpc('checkout_file', {})\nawait (supabase.rpc as any)('checkout_file', {})")
    expect(r.text).toBe("await supabase.from('file').select('id')\nawait supabase.rpc('file_checkout', {})\nawait (supabase.rpc as any)('file_checkout', {})")
  })

  it('renames select embeds, hints and columns with the right table', () => {
    const r = ts(
      "supabase.from('files').select(`id, files_total, checked_out_user:users!checked_out_by(id), file_versions!inner(version), " +
        "member:users!team_members_user_id_fkey(id)`)\n" +
        "supabase.from('notifications').select('id, read, user:users!user_id(id)')",
    )
    expect(r.text).toContain(
      'id, files_total, checked_out_user:app_user!checked_out_by(id), file_version!inner(version), member:app_user!team_member_user_id_fkey(id)',
    )
    expect(r.text).toContain("'id, is_read, user:app_user!user_id(id)'")
  })

  it('keeps a column named like a table and only renames embeds', () => {
    const r = ts("supabase.from('reviews').select('id, file_version, file_versions(id)')")
    expect(r.text).toBe("supabase.from('review').select('id, file_version, file_version(id)')")
  })

  it('renames filter columns and payload keys through the chain table', () => {
    const r = ts(
      "await supabase.from('notifications').update({ read: true, title }).eq('read', false).order('read')\n" +
        "await supabase.from('activity').update({ read: true })",
    )
    expect(r.text).toContain(".from('notification').update({ is_read: true, title }).eq('is_read', false).order('is_read')")
    expect(r.text).toContain(".from('activity').update({ read: true })")
  })

  it('rewrites a shorthand global column as key: value', () => {
    const r = ts('const { last_seen } = row\nsession.last_seen = 1')
    expect(r.text).toBe('const { last_seen_at: last_seen } = row\nsession.last_seen_at = 1')
  })

  it('renames Realtime table and filter', () => {
    const r = ts("channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `read=eq.${x}` }, cb)\nif (payload.table === 'files') {}")
    expect(r.text).toContain("table: 'notification', filter: `is_read=eq.${x}`")
    expect(r.text).toContain("payload.table === 'file'")
  })

  it('renames type references to tables and their columns', () => {
    const r = ts(
      "type A = Database['public']['Tables']['files']['Row']\ntype B = Tables<'file_versions'>\ntype C = Database['public']['Tables']['notifications']['Row']['read']",
    )
    expect(r.text).toBe(
      "type A = Database['public']['Tables']['file']['Row']\ntype B = Tables<'file_version'>\ntype C = Database['public']['Tables']['notification']['Row']['is_read']",
    )
  })

  it('renames the test fake table methods and seed payloads', () => {
    const r = ts("db.seed('notifications', { id: '1', read: false })\ndb.defineRpc('checkout_file', fn)\nexpect(db.rows('team_members')).toHaveLength(1)")
    expect(r.text).toBe("db.seed('notification', { id: '1', is_read: false })\ndb.defineRpc('file_checkout', fn)\nexpect(db.rows('team_member')).toHaveLength(1)")
  })

  it('reports a one-word table name in an unknown position and leaves it', () => {
    const r = ts("const activeView = 'files'\nconst tables = ['team_members']")
    expect(r.text).toBe("const activeView = 'files'\nconst tables = ['team_member']")
    expect(r.ambiguous).toEqual([expect.objectContaining({ token: "'files'" })])
  })

  it('rewrites the generated types by structure', () => {
    const gen = [
      'export type Database = {',
      '  __InternalSupabase: { PostgrestVersion: "14.5" }',
      '  public: {',
      '    Tables: {',
      '      notifications: {',
      '        Row: {',
      '          read: boolean',
      '          user_id: string',
      '        }',
      '        Relationships: [',
      '          {',
      '            foreignKeyName: "team_members_user_id_fkey"',
      '            columns: ["read"]',
      '            referencedRelation: "users"',
      '            referencedColumns: ["id"]',
      '          },',
      '        ]',
      '      }',
      '    }',
      '    Functions: {',
      '      checkout_file: {',
      '        Returns: Database["public"]["Tables"]["files"]["Row"][]',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n')
    const r = renameTs(gen, L, { file: 'src/types/supabase.ts' })
    expect(r.text).toContain('      notification: {')
    expect(r.text).toContain('          is_read: boolean')
    expect(r.text).toContain('foreignKeyName: "team_member_user_id_fkey"')
    expect(r.text).toContain('columns: ["is_read"]')
    expect(r.text).toContain('referencedRelation: "app_user"')
    expect(r.text).toContain('      file_checkout: {')
    expect(r.text).toContain('Database["public"]["Tables"]["file"]["Row"][]')
  })
})
