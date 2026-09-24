/* Landing page settings. Sign-up uses the shared Supabase client
   (js/supabase-client.js); the anon key there is public and RLS protects data.
   Set googleSignIn to true once the Google provider is enabled in Supabase
   (see DEPLOYMENT.md, "Google sign-in"). Until then the button stays disabled. */
window.FIJLY_CONFIG = {
  contactEmail: 'hello@fijly.com',
  googleSignIn: false
};
