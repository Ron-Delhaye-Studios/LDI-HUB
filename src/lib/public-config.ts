// These values identify the public browser client. RLS protects database rows.
// Never put a service-role key or account password in this file.
export const ownerEmail = 'RonDelhayeStudios@gmail.com';
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://ypfhcqeispdunewubxjm.supabase.co';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZmhjcWVpc3BkdW5ld3VieGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NjgxNTIsImV4cCI6MjEwNTQ0NDE1Mn0.sWeW1a_ETqj16NFfilNBLqYI_5OimTbQiVp0pNpsbWA';
