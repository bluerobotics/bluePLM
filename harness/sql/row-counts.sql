-- Rows per table in public, keyed by the table's oid. A rename keeps the oid, so
-- the upgrade lane compares counts across 0500_from_4x.sql even though every
-- table name changed. Output: oid|relname|rows, one line per table.
SELECT c.oid::bigint AS oid,
       c.relname,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS rows
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
ORDER BY 1;
