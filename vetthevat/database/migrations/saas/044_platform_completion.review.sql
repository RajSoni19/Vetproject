-- REVIEW ONLY. Explicit approval required for live development. Disposable UAT
-- rehearsal is separate. No customer data, identity or queue is bootstrapped.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR to_regprocedure('platform_admin.identity(text,boolean)') IS NULL OR to_regclass('support_desk.attachments') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved completion target';END IF;
END $$;
GRANT SELECT(created_at,last_seen_at) ON web_auth.sessions TO vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE support_desk.attachments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES support_desk.tickets(id),company_id uuid NOT NULL,
 document_id uuid NOT NULL,shared_by uuid NOT NULL REFERENCES web_auth.users(id),description text NOT NULL CHECK(length(description) BETWEEN 5 AND 300),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(ticket_id,document_id),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id));
ALTER TABLE support_desk.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_desk.attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_commands ON support_desk.attachments TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE TRIGGER immutable_attachment BEFORE UPDATE OR DELETE ON support_desk.attachments FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE FUNCTION support_desk.attach(p_hash text,p_company uuid,p_ticket uuid,p_document uuid,p_description text,p_consent boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;d saas.documents;new_id uuid;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 IF p_company IS NULL OR p_consent IS DISTINCT FROM true OR length(trim(p_description)) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'Explicit redacted screenshot sharing consent required' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM support_desk.tickets WHERE id=p_ticket AND company_id=p_company AND state<>'closed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open company ticket required' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM saas.documents WHERE id=p_document AND company_id=p_company;
 IF d.id IS NULL OR d.state<>'clean' OR d.mime_type NOT IN('image/png','image/jpeg','image/webp') OR d.byte_size>5242880 OR EXISTS(SELECT 1 FROM business.invoice_attachments WHERE company_id=p_company AND document_id=d.id) THEN RAISE EXCEPTION 'Share a clean redacted screenshot, not an invoice original' USING ERRCODE='22023';END IF;
 SELECT id INTO new_id FROM support_desk.attachments WHERE ticket_id=p_ticket AND document_id=p_document;
 IF new_id IS NULL THEN
  IF (SELECT count(*) FROM support_desk.attachments WHERE ticket_id=p_ticket)>=10 THEN RAISE EXCEPTION 'Ticket attachment limit reached' USING ERRCODE='22023';END IF;
  INSERT INTO support_desk.attachments(ticket_id,company_id,document_id,shared_by,description) VALUES(p_ticket,p_company,p_document,actor,trim(p_description)) RETURNING id INTO new_id;
  INSERT INTO platform_admin.audit(actor_id,action,target_id,details) VALUES(actor,'support.attachment.shared',p_ticket,jsonb_build_object('attachmentId',new_id));
 END IF;
 RETURN jsonb_build_object('id',new_id);
END $$;
CREATE FUNCTION support_desk.attachment_list(p_hash text,p_company uuid,p_ticket uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;result jsonb;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 PERFORM 1 FROM support_desk.tickets WHERE id=p_ticket AND (p_company IS NULL OR company_id=p_company);
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('attachments',(SELECT coalesce(jsonb_agg(t ORDER BY t.created_at,t.id),'[]') FROM (SELECT a.id,a.description,a.created_at,d.mime_type,d.byte_size FROM support_desk.attachments a JOIN saas.documents d ON d.id=a.document_id AND d.company_id=a.company_id WHERE a.ticket_id=p_ticket AND d.state='clean' AND NOT EXISTS(SELECT 1 FROM business.invoice_attachments i WHERE i.company_id=d.company_id AND i.document_id=d.id)) t),
 'available',CASE WHEN p_company IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT d.id,d.original_name,d.created_at FROM saas.documents d WHERE d.company_id=p_company AND d.state='clean' AND d.mime_type IN('image/png','image/jpeg','image/webp') AND d.byte_size<=5242880 AND NOT EXISTS(SELECT 1 FROM business.invoice_attachments i WHERE i.company_id=d.company_id AND i.document_id=d.id) ORDER BY d.created_at DESC,d.id LIMIT 100) t) END) INTO result;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(actor,'support.attachments.read',p_ticket);RETURN result;
END $$;
CREATE FUNCTION support_desk.attachment_original(p_hash text,p_company uuid,p_ticket uuid,p_attachment uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;result jsonb;BEGIN
 actor=support_desk.authorize(p_hash,p_company);
 SELECT jsonb_build_object('key',d.object_key,'version',d.object_version,'sha256',d.sha256,'byteSize',d.byte_size,'mime',d.mime_type) INTO result
 FROM support_desk.attachments a JOIN support_desk.tickets t ON t.id=a.ticket_id AND t.company_id=a.company_id JOIN saas.documents d ON d.id=a.document_id AND d.company_id=a.company_id
 WHERE a.id=p_attachment AND a.ticket_id=p_ticket AND (p_company IS NULL OR a.company_id=p_company) AND d.state='clean' AND d.mime_type IN('image/png','image/jpeg','image/webp') AND NOT EXISTS(SELECT 1 FROM business.invoice_attachments i WHERE i.company_id=d.company_id AND i.document_id=d.id) ;
 IF result IS NULL THEN RAISE EXCEPTION 'Shared attachment unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO platform_admin.audit(actor_id,action,target_id,details) VALUES(actor,'support.attachment.download',p_ticket,jsonb_build_object('attachmentId',p_attachment));RETURN result;
END $$;
CREATE FUNCTION platform_admin.analytics(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,'reports',false) THEN RAISE EXCEPTION 'Analytics scope denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('at',statement_timestamp(),'definitions',jsonb_build_object('mrr','Active, unexpired contract monthly price; annual price divided by 12. Currency totals remain separate.','retention','Accounts with a current active contract divided by accounts with any recorded platform contract.','churn','Cancelled platform contracts divided by all recorded platform contracts. Legacy subscriptions are excluded from contract cohorts.','growth','Verified account registrations and company registrations grouped by calendar month UTC.'),
 'users',(SELECT count(*) FROM web_auth.users),'activeCompanies',(SELECT count(*) FROM saas.company_profiles WHERE status='active'),
 'trials',(SELECT count(*) FROM saas.subscription_entitlements WHERE trial_status='active' AND trial_expires_at>now()),
 'expiringPlans',(SELECT count(*) FROM platform_admin.contracts WHERE status='active' AND period_end>now() AND period_end<=now()+interval '7 days'),
 'revenue',platform_admin.revenue(),
 'cohorts',(SELECT jsonb_build_object('accounts',count(*),'active',count(*) FILTER(WHERE status='active' AND period_end>now()),'cancelled',count(*) FILTER(WHERE status='cancelled'),'retentionPercent',coalesce(round(100.0*count(*) FILTER(WHERE status='active' AND period_end>now())/nullif(count(*),0),2),0),'churnPercent',coalesce(round(100.0*count(*) FILTER(WHERE status='cancelled')/nullif(count(*),0),2),0)) FROM platform_admin.contracts),
 'leads',(SELECT jsonb_build_object('total',count(*),'conversions',count(*) FILTER(WHERE d.stage='won' AND d.company_id IS NOT NULL),'followupsDue',count(*) FILTER(WHERE d.remind_at<=now() AND d.stage NOT IN('won','lost'))) FROM contact_intake.enquiries e LEFT JOIN platform_admin.lead_details d ON d.lead_id=e.id),
 'support',(SELECT jsonb_build_object('total',count(*),'open',count(*) FILTER(WHERE state='open'),'pending',count(*) FILTER(WHERE state='pending'),'closed',count(*) FILTER(WHERE state='closed'),'averageFirstResponseHours',(SELECT round(avg(extract(epoch FROM (first_reply-t.created_at))/3600),2) FROM support_desk.tickets t CROSS JOIN LATERAL (SELECT min(m.created_at) AS first_reply FROM support_desk.messages m WHERE m.ticket_id=t.id AND m.actor_id<>t.opened_by) r WHERE r.first_reply IS NOT NULL)) FROM support_desk.tickets),
 'ocr',(SELECT jsonb_build_object('documents',count(*),'bytes',coalesce(sum(byte_size),0),'quarantined',count(*) FILTER(WHERE state='quarantined'),'rejected',count(*) FILTER(WHERE state='rejected')) FROM saas.documents),
 'ors',(SELECT jsonb_build_object('drafts',count(*),'pending',count(*) FILTER(WHERE state='pending_dispatch'),'confirmed',count(*) FILTER(WHERE state IN('delivered','accepted'))) FROM operations.shopping_dispatches),
 'monthlyGrowth',(SELECT jsonb_agg(t ORDER BY t.month) FROM (SELECT to_char(m,'YYYY-MM') AS month,(SELECT count(*) FROM web_auth.users WHERE email_verified_at IS NOT NULL AND created_at>=m AND created_at<m+interval '1 month') AS users,(SELECT count(*) FROM web_auth.companies WHERE created_at>=m AND created_at<m+interval '1 month') AS companies FROM generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '11 months',date_trunc('month',now() AT TIME ZONE 'UTC'),interval '1 month') m) t)) INTO result;
 INSERT INTO platform_admin.audit(actor_id,action) VALUES(who.actor,'analytics.read');RETURN result;
END $$;
CREATE FUNCTION platform_admin.user_profile_extra(p_hash text,p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,'users',false) THEN RAISE EXCEPTION 'User profile scope denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('lastLogin',(SELECT max(created_at) FROM web_auth.sessions WHERE user_id=p_user),
 'usage',jsonb_build_object('documents',(SELECT count(*) FROM saas.documents d WHERE EXISTS(SELECT 1 FROM web_auth.company_memberships m WHERE m.user_id=p_user AND m.company_id=d.company_id AND m.status='active')),'orsDrafts',(SELECT count(*) FROM operations.shopping_dispatches d WHERE EXISTS(SELECT 1 FROM web_auth.company_memberships m WHERE m.user_id=p_user AND m.company_id=d.company_id AND m.status='active'))),
 'supportHistory',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT id,company_id,category,state,created_at FROM support_desk.tickets WHERE opened_by=p_user ORDER BY created_at DESC,id DESC LIMIT 100) t),
 'billingStatus',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT a.id AS account_id,c.status,c.period_end AS renewal_at,c.grace_until,c.cancel_at_end,coalesce((SELECT sum(i.amount)-(SELECT coalesce(sum(r.amount),0) FROM platform_admin.receipts r JOIN platform_admin.billing_invoices b ON b.id=r.invoice_id WHERE b.account_id=a.id) FROM platform_admin.billing_invoices i WHERE i.account_id=a.id),0) AS outstanding FROM saas.billing_accounts a LEFT JOIN platform_admin.contracts c ON c.account_id=a.id WHERE a.owner_id=p_user) t)) INTO result;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(who.actor,'profile.user_activity',p_user);RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform_admin.user_profile_extra(text,uuid) FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION platform_admin.user_profile_extra(text,uuid) TO vtv_web_runtime;
-- Isolated local UAT may reuse the existing web runtime credential without
-- creating or changing cluster roles. These wrappers refuse every non-UAT DB.
CREATE TABLE platform_admin.uat_automation_identity(singleton boolean PRIMARY KEY CHECK(singleton),user_id uuid NOT NULL REFERENCES web_auth.users(id));
ALTER TABLE platform_admin.uat_automation_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin.uat_automation_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_commands ON platform_admin.uat_automation_identity TO vtv_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON platform_admin.uat_automation_identity FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
CREATE FUNCTION platform_admin.uat_maintenance() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c record;actor uuid;n int=0;BEGIN
 IF current_database()!~'^vtv_uat_[0-9]{14}_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Isolated UAT required' USING ERRCODE='42501';END IF;
 SELECT i.user_id INTO actor FROM platform_admin.uat_automation_identity i JOIN web_auth.users u ON u.id=i.user_id WHERE i.singleton AND u.status='disabled';
 IF actor IS NULL THEN RAISE EXCEPTION 'Disabled synthetic automation identity required' USING ERRCODE='42501';END IF;
 FOR c IN SELECT id,version FROM platform_admin.contracts WHERE status<>'cancelled' AND (period_end<=now() OR status='past_due' AND grace_until<=now() OR (status='past_due' OR status='active' AND period_end<=now()+interval '7 days') AND NOT EXISTS(SELECT 1 FROM platform_admin.billing_reminders r WHERE r.contract_id=platform_admin.contracts.id AND r.period_end=platform_admin.contracts.period_end AND r.kind=CASE WHEN status='past_due' THEN 'past_due' ELSE 'renewal' END)) ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   PERFORM platform_admin.billing_action(actor,'reconcile',c.id,c.version,'{}');n=n+1;
   INSERT INTO platform_admin.audit(actor_id,action,target_id,details) VALUES(actor,'system.uat.subscription.reconciled',c.id,jsonb_build_object('actorKind','disabled synthetic automation identity'));
  EXCEPTION WHEN invalid_parameter_value OR unique_violation THEN
   INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(actor,'system.uat.subscription.review_required',c.id);
  END;
 END LOOP;RETURN n;
END $$;
CREATE FUNCTION platform_admin.uat_contact_rate(p_key text,p_limit int,p_seconds int) RETURNS TABLE(allowed boolean,retry_after int) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF current_database()!~'^vtv_uat_[0-9]{14}_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Isolated UAT required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT * FROM contact_intake.consume_rate(p_key,p_limit,p_seconds);
END $$;
CREATE FUNCTION platform_admin.uat_contact_save(p_body jsonb,p_key text,p_digest text,p_duplicate text) RETURNS TABLE(id uuid,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF current_database()!~'^vtv_uat_[0-9]{14}_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Isolated UAT required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT * FROM contact_intake.save_enquiry(p_body,p_key,p_digest,p_duplicate);
END $$;
REVOKE ALL ON FUNCTION platform_admin.uat_contact_rate(text,int,int),platform_admin.uat_contact_save(jsonb,text,text,text) FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION platform_admin.uat_contact_rate(text,int,int),platform_admin.uat_contact_save(jsonb,text,text,text) TO vtv_web_runtime;
REVOKE ALL ON FUNCTION platform_admin.uat_maintenance() FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION platform_admin.uat_maintenance() TO vtv_web_runtime;
REVOKE ALL ON support_desk.attachments FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON FUNCTION support_desk.attach(text,uuid,uuid,uuid,text,boolean),support_desk.attachment_list(text,uuid,uuid),support_desk.attachment_original(text,uuid,uuid,uuid),platform_admin.analytics(text) FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION support_desk.attach(text,uuid,uuid,uuid,text,boolean),support_desk.attachment_list(text,uuid,uuid),support_desk.attachment_original(text,uuid,uuid,uuid),platform_admin.analytics(text) TO vtv_web_runtime;
RESET ROLE;
COMMIT;
