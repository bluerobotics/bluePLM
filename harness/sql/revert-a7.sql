-- The schema-94 files UPDATE policy, verbatim from HEAD.
--
-- No WITH CHECK, so the 'edit' term in USING is the only permission consulted -
-- and trashing a file in this product is UPDATE files SET deleted_at, not
-- DELETE. An organization that granted edit and deliberately withheld delete
-- had still granted the ability to empty its vault into the trash.
DROP POLICY IF EXISTS "file: engineers update" ON file;
CREATE POLICY "file: engineers update"
  ON file FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:explorer', 'edit'));
