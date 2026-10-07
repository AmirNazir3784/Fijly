/* Landing page settings. Sign-up uses the shared Supabase client
   (js/supabase-client.js); the anon key there is public and RLS protects data.
   Set googleSignIn to true once the Google provider is enabled in Supabase
   (see DEPLOYMENT.md, "Google sign-in"). Until then the button stays disabled.
   paypalEnabled stays false while milestone payments are invoiced by hand: the
   order page shows a disabled "Pay with PayPal" button and we email a PayPal
   invoice instead. No PayPal code is loaded. */
window.FIJLY_CONFIG = {
  contactEmail: 'hello@fijly.com',
  googleSignIn: false,
  paypalEnabled: false
};
