-- Create agenda items table for event schedules
CREATE TABLE public.event_agenda_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIME,
  end_time TIME,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View agenda items" ON public.event_agenda_items FOR SELECT USING (true);
CREATE POLICY "Manage agenda items" ON public.event_agenda_items FOR ALL USING (is_super_admin(auth.uid()));
