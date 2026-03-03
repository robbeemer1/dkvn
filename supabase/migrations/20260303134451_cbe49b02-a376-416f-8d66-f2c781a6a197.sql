
-- Enums
CREATE TYPE public.app_role AS ENUM ('super_admin', 'region_admin', 'event_organizer', 'member', 'readonly');
CREATE TYPE public.membership_level AS ENUM ('goud', 'zilver', 'brons', 'gastlid');
CREATE TYPE public.attendance_status AS ENUM ('aangemeld', 'bevestigd', 'aanwezig', 'afgemeld', 'no_show');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE public.seating_version_status AS ENUM ('concept', 'gepubliceerd');

-- Regions
CREATE TABLE public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  company_name TEXT,
  company_role TEXT,
  region_id UUID REFERENCES public.regions(id),
  membership_level public.membership_level NOT NULL DEFAULT 'gastlid',
  bio TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  privacy_consent BOOLEAN NOT NULL DEFAULT false,
  privacy_consent_date TIMESTAMPTZ,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table per security best practices)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  region_id UUID REFERENCES public.regions(id),
  UNIQUE(user_id, role, region_id)
);

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  region_id UUID NOT NULL REFERENCES public.regions(id),
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location_name TEXT,
  location_address TEXT,
  capacity INTEGER,
  price NUMERIC(10,2),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event organizer assignments (many-to-many)
CREATE TABLE public.event_organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(event_id, user_id)
);

-- Event registrations (member attendees)
CREATE TABLE public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL DEFAULT 'aangemeld',
  is_guest_region BOOLEAN NOT NULL DEFAULT false,
  dietary_notes TEXT,
  notes TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_at TIMESTAMPTZ,
  UNIQUE(event_id, member_id)
);

-- Event guests (non-member attendees)
CREATE TABLE public.event_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  invited_by UUID REFERENCES auth.users(id),
  status public.attendance_status NOT NULL DEFAULT 'aangemeld',
  dietary_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event rounds
CREATE TABLE public.event_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  name TEXT,
  UNIQUE(event_id, round_number)
);

-- Tables per round
CREATE TABLE public.event_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  table_name TEXT,
  capacity INTEGER NOT NULL DEFAULT 8,
  host_member_id UUID REFERENCES auth.users(id),
  UNIQUE(round_id, table_number)
);

-- Table seats (assignments)
CREATE TABLE public.table_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.event_tables(id) ON DELETE CASCADE,
  member_id UUID REFERENCES auth.users(id),
  guest_id UUID REFERENCES public.event_guests(id),
  seat_number INTEGER,
  CONSTRAINT one_person CHECK (
    (member_id IS NOT NULL AND guest_id IS NULL) OR
    (member_id IS NULL AND guest_id IS NOT NULL)
  )
);

-- Meeting history (pairwise encounters)
CREATE TABLE public.meeting_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.event_rounds(id),
  met_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ordered_pair CHECK (member_a_id < member_b_id)
);

-- Seating versions (concept/published snapshots)
CREATE TABLE public.seating_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status public.seating_version_status NOT NULL DEFAULT 'concept',
  score NUMERIC(5,2),
  score_details JSONB,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, version_number)
);

-- Event tasks (planning)
CREATE TABLE public.event_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  deadline TIMESTAMPTZ,
  status public.task_status NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_profiles_region ON public.profiles(region_id);
CREATE INDEX idx_profiles_membership ON public.profiles(membership_level);
CREATE INDEX idx_profiles_search ON public.profiles USING gin(to_tsvector('dutch', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(company_name,'')));
CREATE INDEX idx_events_region ON public.events(region_id);
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_events_search ON public.events USING gin(to_tsvector('dutch', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE INDEX idx_registrations_event ON public.event_registrations(event_id);
CREATE INDEX idx_registrations_member ON public.event_registrations(member_id);
CREATE INDEX idx_registrations_status ON public.event_registrations(status);
CREATE INDEX idx_meeting_history_members ON public.meeting_history(member_a_id, member_b_id);
CREATE INDEX idx_meeting_history_event ON public.meeting_history(event_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- Enable RLS on all tables
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_region(_user_id UUID, _role public.app_role, _region_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND region_id = _region_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_event_organizer(_user_id UUID, _event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_organizers WHERE user_id = _user_id AND event_id = _event_id
  )
$$;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_event_tasks_updated_at BEFORE UPDATE ON public.event_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile auto-creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'first_name', ''), COALESCE(NEW.raw_user_meta_data->>'last_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Regions: everyone can read
CREATE POLICY "Anyone can view regions" ON public.regions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage regions" ON public.regions FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- Profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "System creates profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Super admins can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- Events
CREATE POLICY "Authenticated can view events" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and organizers manage events" ON public.events FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) OR public.has_role_in_region(auth.uid(), 'region_admin', region_id)
);
CREATE POLICY "Admins and organizers update events" ON public.events FOR UPDATE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.has_role_in_region(auth.uid(), 'region_admin', region_id) OR public.is_event_organizer(auth.uid(), id)
);
CREATE POLICY "Admins delete events" ON public.events FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.has_role_in_region(auth.uid(), 'region_admin', region_id)
);

-- Event organizers
CREATE POLICY "View event organizers" ON public.event_organizers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage event organizers" ON public.event_organizers FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- Event registrations
CREATE POLICY "View registrations" ON public.event_registrations FOR SELECT TO authenticated USING (
  member_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);
CREATE POLICY "Members register themselves" ON public.event_registrations FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY "Update registrations" ON public.event_registrations FOR UPDATE TO authenticated USING (
  member_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);
CREATE POLICY "Delete registrations" ON public.event_registrations FOR DELETE TO authenticated USING (
  member_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);

-- Event guests
CREATE POLICY "View event guests" ON public.event_guests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage event guests" ON public.event_guests FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);
CREATE POLICY "Update event guests" ON public.event_guests FOR UPDATE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);
CREATE POLICY "Delete event guests" ON public.event_guests FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);

-- Event rounds
CREATE POLICY "View rounds" ON public.event_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage rounds" ON public.event_rounds FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid())
);

-- Event tables
CREATE POLICY "View tables" ON public.event_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage tables" ON public.event_tables FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid())
);

-- Table seats
CREATE POLICY "View seats" ON public.table_seats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage seats" ON public.table_seats FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid())
);

-- Meeting history
CREATE POLICY "View meeting history" ON public.meeting_history FOR SELECT TO authenticated USING (
  member_a_id = auth.uid() OR member_b_id = auth.uid() OR public.is_super_admin(auth.uid())
);
CREATE POLICY "Manage meeting history" ON public.meeting_history FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid())
);

-- Seating versions
CREATE POLICY "View seating versions" ON public.seating_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage seating versions" ON public.seating_versions FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid())
);

-- Event tasks
CREATE POLICY "View tasks" ON public.event_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage tasks" ON public.event_tasks FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_event_organizer(auth.uid(), event_id)
);

-- Audit logs
CREATE POLICY "View audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid())
);
CREATE POLICY "Insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Seed regions
INSERT INTO public.regions (name) VALUES ('Amsterdam'), ('Amersfoort'), ('Almere'), ('Apeldoorn');
