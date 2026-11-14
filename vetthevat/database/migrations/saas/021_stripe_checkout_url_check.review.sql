-- REVIEW ONLY. Separately approve this one-function correction.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.stripe_accounts') IS NULL
 OR encode(sha256(convert_to(pg_get_functiondef('saas.complete_stripe_checkout(text,uuid,text,text,text)'::regprocedure),'UTF8')),'hex')<>'829a19acd8dc56f9f82aed882f61d5e3adab6360c923596dc845937df1e17e26'
 THEN RAISE EXCEPTION 'Unapproved correction target or changed function';END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE OR REPLACE FUNCTION saas.complete_stripe_checkout(p_hash text,p_account uuid,p_key text,p_id text,p_url text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb;BEGIN
 context=saas.billing_context(p_hash,p_account);
 IF p_id IS NULL OR p_id!~'^cs_test_[A-Za-z0-9]+$' OR p_url IS NULL OR length(p_url)>2048 OR p_url!~'^https://checkout[.]stripe[.]com/[^[:cntrl:]]+$' THEN RAISE EXCEPTION 'Invalid checkout receipt' USING ERRCODE='22023';END IF;
 UPDATE saas.stripe_accounts SET checkout_id=p_id,checkout_url=p_url,updated_at=now() WHERE account_id=p_account AND checkout_key=p_key AND (checkout_id IS NULL OR checkout_id=p_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout reference conflict' USING ERRCODE='23505';END IF;RETURN true;
END $$;
COMMIT;
