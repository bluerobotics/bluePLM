-- The schema-94 workflow_gate_review UPDATE policy, verbatim from HEAD.
--
-- Organization membership and nothing else, so any member could approve any
-- review over PostgREST and write whatever they liked into reviewed_by -
-- including somebody else's id, which is the column workflow_review_history
-- copies as the record of who approved.
DROP POLICY IF EXISTS "Users can update pending reviews" ON workflow_gate_review;
CREATE POLICY "Users can update pending reviews"
  ON workflow_gate_review FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));
