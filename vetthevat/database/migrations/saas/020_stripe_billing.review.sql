-- REVIEW ONLY. Separate approval required. TEST MODE ONLY; no provider calls.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regprocedure('saas.team_identity(text)') IS NULL OR to_regclass('saas.provider_events') IS NULL OR to_regclass('saas.stripe_accounts') IS NOT NULL THEN RAISE EXCEPTION 'Unapproved billing target or schema state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE saas.stripe_accounts(
 account_id uuid PRIMARY KEY REFERENCES saas.billing_accounts(id),customer_id text UNIQUE CHECK(customer_id~'^cus_[A-Za-z0-9]+$'),
 subscription_id text UNIQUE CHECK(subscription_id~'^sub_[A-Za-z0-9]+$'),checkout_key text CHECK(length(checkout_key) BETWEEN 16 AND 128),
 checkout_plan text CHECK(checkout_plan IN('Basic','Starter','Growth')),checkout_addon boolean,checkout_id text UNIQUE CHECK(checkout_id~'^cs_test_[A-Za-z0-9]+$'),checkout_url text,
 reconcile_lease uuid,reconcile_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((reconcile_lease IS NULL)=(reconcile_until IS NULL)),CHECK(checkout_addon IS DISTINCT FROM true OR checkout_plan='Basic'));
ALTER TABLE saas.stripe_accounts ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.stripe_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_stripe ON saas.stripe_accounts TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_billing_activation ON saas.billing_accounts FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(status IN('pending','active','suspended','closed'));
CREATE POLICY owner_entitlement_insert ON saas.subscription_entitlements FOR INSERT TO vtv_saas_owner WITH CHECK(true);
CREATE POLICY owner_entitlement_update ON saas.subscription_entitlements FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_profile_activation ON saas.company_profiles FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(status IN('pending','active','suspended','archived'));
CREATE FUNCTION saas.billing_context(p_hash text,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; a saas.billing_accounts; binding saas.stripe_accounts; BEGIN
 actor=saas.team_identity(p_hash);SELECT * INTO a FROM saas.billing_accounts WHERE id=p_account AND owner_id=actor FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Billing owner required' USING ERRCODE='42501';END IF;
 SELECT * INTO binding FROM saas.stripe_accounts WHERE account_id=p_account;
 RETURN jsonb_build_object('accountId',a.id,'status',a.status,'customerId',binding.customer_id,'subscriptionId',binding.subscription_id,'checkoutKey',binding.checkout_key,'checkoutPlan',binding.checkout_plan,'checkoutAddon',binding.checkout_addon,'checkoutId',binding.checkout_id,'checkoutUrl',binding.checkout_url);
 END $$;
CREATE FUNCTION saas.bind_stripe_customer(p_hash text,p_account uuid,p_customer text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE context jsonb; existing text;BEGIN
 context=saas.billing_context(p_hash,p_account);
 IF context->>'status'='closed' OR p_customer IS NULL OR p_customer!~'^cus_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid billing customer' USING ERRCODE='22023';END IF;
 INSERT INTO saas.stripe_accounts(account_id,customer_id) VALUES(p_account,p_customer) ON CONFLICT(account_id) DO NOTHING;
 SELECT customer_id INTO existing FROM saas.stripe_accounts WHERE account_id=p_account FOR UPDATE;
 IF existing IS DISTINCT FROM p_customer THEN RAISE EXCEPTION 'Customer identity conflict' USING ERRCODE='23505';END IF;RETURN true;
 END $$;
CREATE FUNCTION saas.reserve_stripe_checkout(p_hash text,p_account uuid,p_key text,p_plan text,p_addon boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE context jsonb; b saas.stripe_accounts;BEGIN
 context=saas.billing_context(p_hash,p_account);
 IF context->>'status'='closed' OR p_key IS NULL OR p_key!~'^[A-Za-z0-9_-]{16,128}$' OR p_plan IS NULL OR p_plan NOT IN('Basic','Starter','Growth') OR p_addon IS NULL OR (p_addon AND p_plan<>'Basic') THEN RAISE EXCEPTION 'Invalid checkout selection' USING ERRCODE='22023';END IF;
 SELECT * INTO b FROM saas.stripe_accounts WHERE account_id=p_account FOR UPDATE;
 IF b.customer_id IS NULL OR b.subscription_id IS NOT NULL THEN RAISE EXCEPTION 'Customer required or subscription already exists' USING ERRCODE='23505';END IF;
 IF b.checkout_key IS NOT NULL AND (b.checkout_key<>p_key OR b.checkout_plan<>p_plan OR b.checkout_addon<>p_addon) THEN RAISE EXCEPTION 'Resume or expire the existing checkout first' USING ERRCODE='23505';END IF;
 UPDATE saas.stripe_accounts SET checkout_key=p_key,checkout_plan=p_plan,checkout_addon=p_addon,updated_at=now() WHERE account_id=p_account;
 RETURN jsonb_build_object('customerId',b.customer_id,'checkoutId',b.checkout_id,'checkoutUrl',b.checkout_url);
 END $$;
CREATE FUNCTION saas.complete_stripe_checkout(p_hash text,p_account uuid,p_key text,p_id text,p_url text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE context jsonb;BEGIN
 context=saas.billing_context(p_hash,p_account);
 IF p_id IS NULL OR p_id!~'^cs_test_[A-Za-z0-9]+$' OR p_url IS NULL OR p_url!~'^https://checkout[.]stripe[.]com/[^[:cntrl:]]{1,2000}$' THEN RAISE EXCEPTION 'Invalid checkout receipt' USING ERRCODE='22023';END IF;
 UPDATE saas.stripe_accounts SET checkout_id=p_id,checkout_url=p_url,updated_at=now() WHERE account_id=p_account AND checkout_key=p_key AND (checkout_id IS NULL OR checkout_id=p_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout reference conflict' USING ERRCODE='23505';END IF;RETURN true;
 END $$;
CREATE FUNCTION saas.claim_stripe_reconciliation() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE event saas.provider_events; b saas.stripe_accounts; token uuid;BEGIN
 IF session_user<>'vtv_saas_provider_runtime' THEN RAISE EXCEPTION 'Provider worker required' USING ERRCODE='42501';END IF;
 UPDATE saas.provider_events SET state='failed',lease_id=NULL,lease_until=NULL WHERE provider='stripe' AND attempts>=10 AND state='processing' AND lease_until<=now();
 SELECT e.* INTO event FROM saas.provider_events e WHERE e.provider='stripe' AND e.attempts<10 AND e.available_at<=now() AND (e.state='queued' OR (e.state='processing' AND e.lease_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM saas.stripe_accounts x WHERE x.customer_id=e.payload#>>'{data,object,customer}' AND x.reconcile_until>now()) ORDER BY e.available_at,e.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF event.id IS NULL THEN RETURN NULL;END IF;
 token=gen_random_uuid();SELECT * INTO b FROM saas.stripe_accounts WHERE customer_id=event.payload#>>'{data,object,customer}' FOR UPDATE;
 IF b.reconcile_until>now() THEN RETURN NULL;END IF;
 IF b.account_id IS NOT NULL THEN UPDATE saas.stripe_accounts SET reconcile_lease=token,reconcile_until=now()+interval '120 seconds' WHERE account_id=b.account_id;END IF;
 UPDATE saas.provider_events SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=event.id;
 RETURN jsonb_build_object('jobId',event.id,'leaseId',token,'event',event.payload,'accountId',b.account_id,'customerId',b.customer_id,'subscriptionId',b.subscription_id,'checkoutId',b.checkout_id);
 END $$;
CREATE FUNCTION saas.finish_stripe_reconciliation(p_job uuid,p_lease uuid,p_subscription text,p_plan text,p_status text,p_addon boolean,p_failure boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE event saas.provider_events; b saas.stripe_accounts;BEGIN
 IF session_user<>'vtv_saas_provider_runtime' THEN RAISE EXCEPTION 'Provider worker required' USING ERRCODE='42501';END IF;
 SELECT * INTO event FROM saas.provider_events WHERE id=p_job AND provider='stripe' AND state='processing' AND lease_id=p_lease AND lease_until>now() FOR UPDATE;
 IF event.id IS NULL THEN RETURN false;END IF;
 SELECT * INTO b FROM saas.stripe_accounts WHERE customer_id=event.payload#>>'{data,object,customer}';
 IF b.account_id IS NOT NULL THEN PERFORM 1 FROM saas.billing_accounts WHERE id=b.account_id FOR UPDATE;END IF;
 SELECT * INTO b FROM saas.stripe_accounts WHERE customer_id=event.payload#>>'{data,object,customer}' AND reconcile_lease=p_lease AND reconcile_until>now() FOR UPDATE;
 IF p_failure THEN
  UPDATE saas.provider_events SET state=CASE WHEN attempts>=10 THEN 'failed' ELSE 'queued' END,available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::int)),lease_id=NULL,lease_until=NULL WHERE id=p_job;
 ELSE
  IF p_status='ignored' THEN NULL;
  ELSIF p_status='expired' THEN
   IF b.account_id IS NOT NULL AND event.payload->>'type'='checkout.session.expired' AND b.checkout_id=event.payload#>>'{data,object,id}' THEN UPDATE saas.stripe_accounts SET checkout_key=NULL,checkout_id=NULL,checkout_url=NULL,checkout_plan=NULL,checkout_addon=NULL WHERE account_id=b.account_id;END IF;
  ELSE
   IF event.payload->>'livemode' IS DISTINCT FROM 'false' OR b.account_id IS NULL OR p_subscription IS NULL OR p_subscription!~'^sub_[A-Za-z0-9]+$' OR p_plan IS NULL OR p_plan NOT IN('Basic','Starter','Growth') OR p_status IS NULL OR p_status NOT IN('active','past_due','cancelled','pending') OR p_addon IS NULL OR (p_addon AND p_plan<>'Basic') OR (b.subscription_id IS NOT NULL AND b.subscription_id<>p_subscription) THEN RAISE EXCEPTION 'Invalid subscription reconciliation' USING ERRCODE='22023';END IF;
   PERFORM 1 FROM saas.billing_accounts WHERE id=b.account_id AND status<>'closed' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Billing account closed' USING ERRCODE='42501';END IF;
   INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference)
   VALUES(b.account_id,p_plan,p_status,CASE p_plan WHEN 'Basic' THEN 30 WHEN 'Starter' THEN 100 ELSE 300 END,CASE p_plan WHEN 'Growth' THEN 3 ELSE 2 END,CASE p_plan WHEN 'Basic' THEN 2 WHEN 'Starter' THEN 4 ELSE 6 END,CASE p_plan WHEN 'Basic' THEN 90 WHEN 'Starter' THEN 180 ELSE NULL END,p_plan<>'Basic' OR p_addon,now(),'stripe-test:'||event.provider_event_id)
   ON CONFLICT(account_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,invoices_per_month=excluded.invoices_per_month,company_limit=excluded.company_limit,seat_limit=excluded.seat_limit,history_days=excluded.history_days,ors_enabled=excluded.ors_enabled,verified_at=excluded.verified_at,source_reference=excluded.source_reference,version=saas.subscription_entitlements.version+1;
   UPDATE saas.billing_accounts SET status=CASE WHEN p_status='active' THEN 'active' WHEN p_status='pending' THEN 'pending' ELSE 'suspended' END,version=version+1 WHERE id=b.account_id;
   IF p_status='active' THEN UPDATE saas.company_profiles SET status='active',version=version+1 WHERE account_id=b.account_id AND status='pending';END IF;
   UPDATE saas.stripe_accounts SET subscription_id=CASE WHEN p_status='cancelled' THEN NULL ELSE p_subscription END,checkout_key=NULL,checkout_id=NULL,checkout_url=NULL,checkout_plan=NULL,checkout_addon=NULL,updated_at=now() WHERE account_id=b.account_id;
   INSERT INTO web_auth.audit_logs(actor_user_id,action,metadata) SELECT owner_id,'billing.reconciled',jsonb_build_object('accountId',b.account_id,'eventId',event.provider_event_id,'plan',p_plan,'status',p_status) FROM saas.billing_accounts WHERE id=b.account_id;
  END IF;
  UPDATE saas.provider_events SET state='completed',lease_id=NULL,lease_until=NULL WHERE id=p_job;
 END IF;
 UPDATE saas.stripe_accounts SET reconcile_lease=NULL,reconcile_until=NULL WHERE reconcile_lease=p_lease;
 RETURN true;
 END $$;
REVOKE ALL ON TABLE saas.stripe_accounts FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime,vtv_saas_provider_runtime;
REVOKE ALL ON FUNCTION saas.billing_context(text,uuid),saas.bind_stripe_customer(text,uuid,text),saas.reserve_stripe_checkout(text,uuid,text,text,boolean),saas.complete_stripe_checkout(text,uuid,text,text,text),saas.claim_stripe_reconciliation(),saas.finish_stripe_reconciliation(uuid,uuid,text,text,text,boolean,boolean) FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime,vtv_saas_provider_runtime;
GRANT EXECUTE ON FUNCTION saas.billing_context(text,uuid),saas.bind_stripe_customer(text,uuid,text),saas.reserve_stripe_checkout(text,uuid,text,text,boolean),saas.complete_stripe_checkout(text,uuid,text,text,text) TO vtv_web_runtime;
GRANT EXECUTE ON FUNCTION saas.claim_stripe_reconciliation(),saas.finish_stripe_reconciliation(uuid,uuid,text,text,text,boolean,boolean) TO vtv_saas_provider_runtime;
GRANT SELECT ON saas.schema_version TO vtv_saas_provider_runtime;
COMMIT;
