-- 054: Allow Romanian (ro-RO) as a saved language preference.
ALTER TABLE web_auth.users DROP CONSTRAINT IF EXISTS users_preferred_locale_check;
ALTER TABLE web_auth.users ADD CONSTRAINT users_preferred_locale_check
  CHECK (preferred_locale IN ('en-GB','hi-IN','gu-IN','es-ES','fr-FR','ar','pt-PT','de-DE','it-IT','pl-PL','ur-PK','pa-IN','ro-RO'));
