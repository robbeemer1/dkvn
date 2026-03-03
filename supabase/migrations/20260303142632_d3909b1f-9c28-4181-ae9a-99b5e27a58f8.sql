-- Allow super_admins to update any profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile or admin"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR is_super_admin(auth.uid()));

-- Allow super_admins to insert profiles
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;
CREATE POLICY "System or admin creates profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR is_super_admin(auth.uid()));