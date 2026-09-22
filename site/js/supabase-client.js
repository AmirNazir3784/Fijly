'use strict';

// FIJLY Studio — Supabase client
// The anon key is a public key. Row Level Security protects all data.

const SUPABASE_URL = 'https://eaddovqkarognynnybeh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZGRvdnFrYXJvZ255bm55YmVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDE3NzgsImV4cCI6MjEwNTYxNzc3OH0.XvU02Bf6ZIEx_9kETQjTp3OLTP-VDx_FgdZIEQF3FiI';

// The SDK's UMD build declares a global `var supabase` (the library), so the
// client instance uses its own name; `let supabase` here would be a SyntaxError.
let supabaseClient = null;

// Each role has exactly one portal.
const PORTAL_FOR_ROLE = { admin: 'admin.html', client: 'studio.html' };

// One redirect to sign in, even when sign-out and the auth listener both ask.
let leavingForLogin = false;
function goToLogin() {
  if (leavingForLogin) return;
  leavingForLogin = true;
  window.location.replace('login.html');
}

// Initialize after the Supabase CDN script loads
function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }
  console.error('Supabase SDK not loaded');
  return null;
}

// Auth helpers
async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

// Validates the stored token with the auth server, unlike getSession().
async function getUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

// Returns the profile, or null when the account has none. Transport and
// server errors throw, so a flaky connection never signs anyone out.
async function getUserProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

async function signOut(options) {
  const redirect = !options || options.redirect !== false;
  let { error } = await supabaseClient.auth.signOut();
  // If the server can't be reached, still end the session in this browser.
  if (error) ({ error } = await supabaseClient.auth.signOut({ scope: 'local' }));
  if (!error && redirect) goToLogin();
  return { error };
}

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

// Auth guard — call on every protected page
async function requireAuth(allowedRoles) {
  const session = await getSession();
  if (!session) {
    goToLogin();
    return null;
  }

  const profile = await getUserProfile();
  const portal = profile && PORTAL_FOR_ROLE[profile.role];
  if (!portal) {
    // No profile, or a role without a portal: this account can't use FIJLY Studio.
    await signOut();
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    // Wrong role — redirect to correct portal (never back to this page).
    if (portal === currentPage()) await signOut();
    else window.location.replace(portal);
    return null;
  }

  return profile;
}

// Session expiry or sign-out in another tab sends the portal back to sign in.
function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      const page = currentPage();
      if (!session && page !== 'login.html' && page !== 'index.html') goToLogin();
    }
    if (callback) callback(event, session);
  });
}

// Admin: create a client user account
async function adminCreateUser(email, password, fullName, clientId) {
  // This uses the admin API through a Supabase Edge Function or direct insert
  // For now, admin creates users through Supabase dashboard
  // This function will be expanded when we add the invite flow
  return { error: 'Use Supabase dashboard to create users for now' };
}
