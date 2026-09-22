-- FIJLY Studio — starter data for testing the Admin portal.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again: existing clients (matched by name) are left as they are.
-- Not deployed: this file lives outside site/, which is the web root.

-- Two test clients
INSERT INTO public.clients (name, status, contact_name, contact_email, website, notes)
SELECT v.name, v.status, v.contact_name, v.contact_email, v.website, v.notes
FROM (VALUES
  ('Northbeam', 'Active', 'Alex Rivera', 'alex@northbeam.io', 'https://northbeam.io', 'Marketing attribution platform'),
  ('CloudDesk', 'Active', 'Jordan Keller', 'jordan@clouddesk.io', 'https://clouddesk.io', 'Remote workspace solution')
) AS v(name, status, contact_name, contact_email, website, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE lower(c.name) = lower(v.name));

-- Each client gets a settings row, as the Admin portal creates for new clients
INSERT INTO public.client_settings (client_id)
SELECT c.id
FROM public.clients c
WHERE c.name IN ('Northbeam', 'CloudDesk')
  AND NOT EXISTS (SELECT 1 FROM public.client_settings s WHERE s.client_id = c.id);

-- Check the result
SELECT c.name, c.status, c.contact_name, c.contact_email, (s.id IS NOT NULL) AS has_settings
FROM public.clients c
LEFT JOIN public.client_settings s ON s.client_id = c.id
ORDER BY c.name;
