DO $$
DECLARE
  event_ids uuid[] := ARRAY[
    '619e8154-11c1-4a0f-8cbe-5acfa9ff86f6',
    '694415cd-5ad2-4cba-8605-b937a96b1077',
    'cc78dbb8-fbd9-418f-9452-770dca2561f5',
    '162b9a5f-2d48-4eab-978b-9559bf8a65d9',
    'e9f1bb63-6e6e-403d-b4e6-971899d5cc1d',
    '926a8391-263b-4550-a1d7-2373e9e94a9c',
    '14dbe93d-4acd-4bd3-8f53-a044192ae97e',
    '7264d16e-b12a-4ba9-9415-1eb2f58b4f7c',
    '79fd3e73-52ec-4945-8372-0e6c9d1a9e52',
    '9e2119da-6a2b-4600-b48d-a6a1ea38ad97',
    '09db5fd2-4c4b-4b1f-b049-a0c8f72f2cdb',
    'e92f86d7-9b25-4941-a4d0-ce9dc61ce511',
    'ac5fe189-ce6d-44d3-9fd3-830d63a9d735',
    'b832de17-a65b-42e1-9808-d046fcb2a630',
    '9b098261-34ee-4576-8cd1-5c49a2901a88',
    '0887a95b-7d2e-440c-a4a8-16ea1f0beda3'
  ];
BEGIN
  DELETE FROM table_seats WHERE table_id IN (
    SELECT et.id FROM event_tables et JOIN event_rounds er ON er.id = et.round_id WHERE er.event_id = ANY(event_ids)
  );
  DELETE FROM event_tables WHERE round_id IN (
    SELECT id FROM event_rounds WHERE event_id = ANY(event_ids)
  );
  DELETE FROM meeting_history WHERE event_id = ANY(event_ids);
  DELETE FROM event_registrations WHERE event_id = ANY(event_ids);
  DELETE FROM event_rounds WHERE event_id = ANY(event_ids);
  DELETE FROM event_agenda_items WHERE event_id = ANY(event_ids);
  DELETE FROM event_tasks WHERE event_id = ANY(event_ids);
  DELETE FROM seating_versions WHERE event_id = ANY(event_ids);
  DELETE FROM events WHERE id = ANY(event_ids);
END $$