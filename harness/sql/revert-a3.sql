-- The schema-94 share-link INSERT policy, verbatim from HEAD.
--
-- org_id is constrained and file_id is not, so a member of one organization can
-- file a link under their own organization pointing at another organization's
-- file. created_by is not constrained either, so the column
-- file_share_link_remediate_cross_tenant() reads to tell a stolen link from an
-- innocent one is whatever the request body said it was.
DROP POLICY IF EXISTS "file_share_link: engineers insert" ON file_share_link;
CREATE POLICY "file_share_link: engineers insert"
  ON file_share_link FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:explorer', 'create'));
