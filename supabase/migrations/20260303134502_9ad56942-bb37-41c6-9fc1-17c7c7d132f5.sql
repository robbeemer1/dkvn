
-- Tighten audit_logs INSERT to require user_id matches auth.uid()
DROP POLICY "Insert audit logs" ON public.audit_logs;
CREATE POLICY "Insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
