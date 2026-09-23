/* The contact form saves briefs to the Supabase `contact_submissions` table,
   which accepts anonymous inserts only (RLS). The anon key is a public key;
   no secret belongs here. If saving fails, the form offers an email draft. */
window.FIJLY_CONFIG = {
  supabaseUrl: 'https://eaddovqkarognynnybeh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZGRvdnFrYXJvZ255bm55YmVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDE3NzgsImV4cCI6MjEwNTYxNzc3OH0.XvU02Bf6ZIEx_9kETQjTp3OLTP-VDx_FgdZIEQF3FiI',
  contactEmail: 'hello@fijly.com'
};
