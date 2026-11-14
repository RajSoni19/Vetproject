-- REVIEW ONLY. Not approved and not executed. Existing isolated development DB ONLY.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regprocedure('saas.team_identity(text)') IS NULL OR to_regnamespace('support_desk') IS NOT NULL THEN RAISE EXCEPTION 'Unapproved support target/schema'; END IF;
END $$;
GRANT SELECT ON web_auth.roles,web_auth.user_roles TO vtv_saas_owner;
CREATE SCHEMA support_desk AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA support_desk REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA support_desk REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE support_desk.tickets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),opened_by uuid NOT NULL REFERENCES web_auth.users(id),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),category text NOT NULL CHECK(category IN('Invoices','VAT','Reports','Account','Billing','Other')),
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','pending','closed')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX support_company ON support_desk.tickets(company_id,id);
CREATE TABLE support_desk.messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES support_desk.tickets(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX support_messages ON support_desk.messages(ticket_id,created_at,id);
CREATE TRIGGER support_immutable_message BEFORE UPDATE OR DELETE ON support_desk.messages FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TABLE support_desk.commands(actor_id uuid NOT NULL REFERENCES web_auth.users(id),key_hash char(64) NOT NULL CHECK(key_hash~'^[a-f0-9]{64}$'),payload jsonb NOT NULL,response jsonb,PRIMARY KEY(actor_id,key_hash));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['tickets','messages','commands'] LOOP
 EXECUTE format('ALTER TABLE support_desk.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE support_desk.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_commands ON support_desk.%I TO vtv_saas_owner USING(true) WITH CHECK(true)',t);
END LOOP;END $$;
CREATE FUNCTION support_desk.is_admin(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=p_actor AND r.name='software_administrator');
$$;
CREATE FUNCTION support_desk.authorize(p_hash text,p_company uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 actor=saas.team_identity(p_hash);
 -- Lock the exact live grant/membership until commit. No email or browser role authorizes support.
 IF support_desk.is_admin(actor) THEN
  PERFORM 1 FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=actor AND r.name='software_administrator' FOR SHARE OF ur,r;
  IF FOUND THEN RETURN actor;END IF;
 END IF;
 IF p_company IS NOT NULL THEN
  PERFORM 1 FROM web_auth.company_memberships WHERE user_id=actor AND company_id=p_company AND status='active' FOR SHARE;
  IF FOUND THEN RETURN actor;END IF;
 END IF;
 RAISE EXCEPTION 'Support permission required' USING ERRCODE='42501';
END $$;
CREATE FUNCTION support_desk.list_tickets(p_hash text,p_company uuid,p_after uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;result jsonb;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 SELECT coalesce(jsonb_agg(t ORDER BY t.id),'[]'::jsonb) INTO result FROM
 (SELECT id::text,company_id::text,subject,category,state,version,created_at::text,updated_at::text FROM support_desk.tickets WHERE (p_company IS NULL OR company_id=p_company) AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 51) t;
 RETURN result;
END $$;
CREATE FUNCTION support_desk.ticket_detail(p_hash text,p_company uuid,p_ticket uuid,p_before timestamptz,p_before_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;t support_desk.tickets;items jsonb;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid message cursor' USING ERRCODE='22023';END IF;
 SELECT * INTO t FROM support_desk.tickets WHERE id=p_ticket AND (p_company IS NULL OR company_id=p_company);
 IF t.id IS NULL THEN RAISE EXCEPTION 'Support ticket unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(m ORDER BY m.created_at DESC,m.id DESC),'[]'::jsonb) INTO items FROM
 (SELECT id::text,body,actor_id::text,created_at::text FROM support_desk.messages WHERE ticket_id=t.id AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 51) m;
 RETURN jsonb_build_object('ticket',to_jsonb(t),'messages',items);
END $$;
CREATE FUNCTION support_desk.command(p_hash text,p_company uuid,p_ticket uuid,p_action text,p_body jsonb,p_version bigint,p_key char(64)) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;t support_desk.tickets;existing support_desk.commands;receipt jsonb;request jsonb;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 IF p_action IS NULL OR p_action NOT IN('create','reply','state') OR p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR octet_length(p_body::text)>25000 OR p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid support command' USING ERRCODE='22023';END IF;
 request=jsonb_build_object('company',p_company,'ticket',p_ticket,'action',p_action,'body',p_body,'version',p_version);
 INSERT INTO support_desk.commands(actor_id,key_hash,payload) VALUES(actor,p_key,request) ON CONFLICT DO NOTHING;
 SELECT * INTO existing FROM support_desk.commands WHERE actor_id=actor AND key_hash=p_key FOR UPDATE;
 IF existing.payload IS DISTINCT FROM request THEN RAISE EXCEPTION 'Support request conflict' USING ERRCODE='23505';END IF;
 IF existing.response IS NOT NULL THEN RETURN existing.response;END IF;
 IF p_action='create' THEN
  IF p_company IS NULL OR p_ticket IS NOT NULL OR p_version IS DISTINCT FROM 1 OR (p_body-ARRAY['subject','category','body'])<>'{}'::jsonb OR jsonb_typeof(p_body->'subject') IS DISTINCT FROM 'string' OR length(trim(p_body->>'subject')) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_body->'category') IS DISTINCT FROM 'string' OR (p_body->>'category') NOT IN('Invoices','VAT','Reports','Account','Billing','Other') THEN RAISE EXCEPTION 'Invalid ticket' USING ERRCODE='22023';END IF;
  INSERT INTO support_desk.tickets(company_id,opened_by,subject,category) VALUES(p_company,actor,trim(p_body->>'subject'),p_body->>'category') RETURNING * INTO t;
 ELSE
  SELECT * INTO t FROM support_desk.tickets WHERE id=p_ticket AND (p_company IS NULL OR company_id=p_company) FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501';END IF;
  IF p_version IS NULL OR t.version<>p_version THEN RAISE EXCEPTION 'Ticket version conflict' USING ERRCODE='23505';END IF;
  IF p_action='reply' AND ((p_body-ARRAY['body'])<>'{}'::jsonb OR t.state='closed') THEN RAISE EXCEPTION 'Reopen the ticket before replying' USING ERRCODE='22023';END IF;
  IF p_action='state' THEN
   IF (p_body-ARRAY['state'])<>'{}'::jsonb OR jsonb_typeof(p_body->'state') IS DISTINCT FROM 'string' OR (p_body->>'state') NOT IN('open','pending','closed') THEN RAISE EXCEPTION 'Invalid ticket state' USING ERRCODE='22023';END IF;
   UPDATE support_desk.tickets SET state=p_body->>'state' WHERE id=t.id;
  END IF;
  UPDATE support_desk.tickets SET version=version+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 END IF;
 IF p_action IN('create','reply') THEN
  IF jsonb_typeof(p_body->'body') IS DISTINCT FROM 'string' OR length(trim(p_body->>'body')) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Message required' USING ERRCODE='22023';END IF;
  INSERT INTO support_desk.messages(ticket_id,actor_id,body) VALUES(t.id,actor,trim(p_body->>'body'));
 END IF;
 INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,t.company_id,'support.'||p_action,jsonb_build_object('ticketId',t.id,'version',t.version));
 receipt=jsonb_build_object('id',t.id,'version',t.version,'state',t.state);
 UPDATE support_desk.commands SET response=receipt WHERE actor_id=actor AND key_hash=p_key;RETURN receipt;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA support_desk FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA support_desk FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT USAGE ON SCHEMA support_desk TO vtv_web_runtime;
GRANT EXECUTE ON FUNCTION support_desk.list_tickets(text,uuid,uuid),support_desk.ticket_detail(text,uuid,uuid,timestamptz,uuid),support_desk.command(text,uuid,uuid,text,jsonb,bigint,char(64)) TO vtv_web_runtime;
RESET ROLE;
COMMIT;
