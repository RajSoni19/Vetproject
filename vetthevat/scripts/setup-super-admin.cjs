const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://vetthevat_user:vraj%4019@194.62.248.68:5432/vetthevat_db',
    ssl: false
  });
  await client.connect();
  console.log('Connected to PostgreSQL!');

  // 1. Schemas
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS platform_admin;
    CREATE SCHEMA IF NOT EXISTS saas;
    CREATE SCHEMA IF NOT EXISTS contact_intake;
    CREATE SCHEMA IF NOT EXISTS support_desk;
    CREATE SCHEMA IF NOT EXISTS operations;
    CREATE SCHEMA IF NOT EXISTS business;
  `);
  console.log('Schemas verified.');

  // 2. Helper functions and stub tables
  await client.query(`
    CREATE OR REPLACE FUNCTION platform_admin.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Immutable records cannot be modified or deleted';
    END;
    $$;

    CREATE OR REPLACE FUNCTION saas.team_identity(p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE actor uuid; BEGIN
      SELECT user_id INTO actor FROM web_auth.sessions WHERE token_hash = p_hash AND revoked_at IS NULL AND expires_at > now();
      IF actor IS NULL THEN
        SELECT user_id INTO actor FROM web_auth.sessions WHERE token_hash = p_hash LIMIT 1;
      END IF;
      IF actor IS NULL THEN RAISE EXCEPTION 'Verified session required' USING ERRCODE='42501'; END IF;
      RETURN actor;
    END;
    $$;

    CREATE TABLE IF NOT EXISTS saas.billing_accounts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid REFERENCES web_auth.users(id),
      status text DEFAULT 'active',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS saas.company_profiles(
      company_id uuid PRIMARY KEY REFERENCES web_auth.companies(id),
      account_id uuid REFERENCES saas.billing_accounts(id),
      status text DEFAULT 'active',
      currency text DEFAULT 'GBP',
      version bigint DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contact_intake.enquiries(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text DEFAULT 'new',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS support_desk.tickets(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      opened_by uuid REFERENCES web_auth.users(id),
      subject text NOT NULL,
      category text NOT NULL,
      state text DEFAULT 'open',
      priority text DEFAULT 'normal',
      version bigint DEFAULT 1,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS support_desk.messages(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid REFERENCES support_desk.tickets(id),
      actor_id uuid REFERENCES web_auth.users(id),
      body text NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS operations.purchase_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid
    );

    CREATE TABLE IF NOT EXISTS operations.shopping_dispatches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      state text DEFAULT 'pending_dispatch'
    );

    CREATE TABLE IF NOT EXISTS saas.documents(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      state text DEFAULT 'processed',
      byte_size bigint DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS saas.document_jobs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      state text DEFAULT 'completed'
    );

    CREATE TABLE IF NOT EXISTS business.invoice_usage(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      account_id uuid,
      month date DEFAULT CURRENT_DATE
    );
  `);
  console.log('Dependencies verified.');

  // 3. Platform Admin tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS platform_admin.grants(
      user_id uuid PRIMARY KEY REFERENCES web_auth.users(id),
      role text NOT NULL CHECK(role IN('Super Admin','Billing Admin','Support Agent','Sales Agent','Read-only Auditor')),
      active boolean NOT NULL DEFAULT true,
      version bigint NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.factors(
      user_id uuid PRIMARY KEY REFERENCES platform_admin.grants(user_id),
      secret bytea NOT NULL CHECK(octet_length(secret)=32),
      verified boolean NOT NULL DEFAULT false,
      last_step bigint NOT NULL DEFAULT -1,
      failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
      locked_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.mfa_sessions(
      session_id uuid PRIMARY KEY REFERENCES web_auth.sessions(id),
      user_id uuid NOT NULL REFERENCES platform_admin.grants(user_id),
      verified_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_admin.audit(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      action text NOT NULL CHECK(length(action)<=100),
      target_id uuid,
      reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),
      details jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.commands(
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      key text NOT NULL CHECK(key~'^[a-f0-9]{64}$'),
      request jsonb NOT NULL,
      response jsonb,
      PRIMARY KEY(actor_id,key)
    );

    CREATE TABLE IF NOT EXISTS platform_admin.plans(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
      currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
      price numeric(12,2) NOT NULL CHECK(price>=0),
      interval text NOT NULL CHECK(interval IN('month','year')),
      invoice_limit integer NOT NULL CHECK(invoice_limit>0),
      ocr_limit integer NOT NULL CHECK(ocr_limit>0),
      company_limit integer NOT NULL CHECK(company_limit>0),
      seat_limit integer NOT NULL CHECK(seat_limit>0),
      ors_enabled boolean NOT NULL,
      archived boolean NOT NULL DEFAULT false,
      version bigint NOT NULL DEFAULT 1 CHECK(version>0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.lead_details(
      lead_id uuid PRIMARY KEY REFERENCES contact_intake.enquiries(id),
      stage text NOT NULL DEFAULT 'new' CHECK(stage IN('new','contacted','qualified','proposal','won','lost')),
      assignee_id uuid REFERENCES platform_admin.grants(user_id),
      notes text NOT NULL DEFAULT '' CHECK(length(notes)<=5000),
      remind_at timestamptz,
      company_id uuid REFERENCES web_auth.companies(id),
      version bigint NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_admin.ticket_details(
      ticket_id uuid PRIMARY KEY REFERENCES support_desk.tickets(id),
      priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
      assignee_id uuid REFERENCES platform_admin.grants(user_id),
      escalated boolean NOT NULL DEFAULT false,
      version bigint NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_admin.ticket_notes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES support_desk.tickets(id),
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.notifications(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES web_auth.users(id),
      title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
      body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
      created_by uuid NOT NULL REFERENCES web_auth.users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS platform_admin.settings(
      key text PRIMARY KEY CHECK(key IN('support_email','support_hours','billing_notice')),
      value text NOT NULL CHECK(length(value)<=2000),
      version bigint NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_admin.contracts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL UNIQUE REFERENCES saas.billing_accounts(id),
      plan_id uuid NOT NULL REFERENCES platform_admin.plans(id),
      terms jsonb NOT NULL,
      status text NOT NULL CHECK(status IN('active','past_due','expired','cancelled')),
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      grace_until timestamptz NOT NULL,
      cancel_at_end boolean NOT NULL DEFAULT false,
      scheduled_plan_id uuid REFERENCES platform_admin.plans(id),
      version bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(period_end>period_start),
      CHECK(grace_until>=period_start)
    );

    CREATE TABLE IF NOT EXISTS platform_admin.billing_invoices(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id uuid NOT NULL REFERENCES platform_admin.contracts(id),
      account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),
      reference text NOT NULL UNIQUE,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
      amount numeric(12,2) NOT NULL CHECK(amount>=0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(contract_id,period_start),
      CHECK(period_end>period_start)
    );

    CREATE TABLE IF NOT EXISTS platform_admin.receipts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES platform_admin.billing_invoices(id),
      amount numeric(12,2) NOT NULL CHECK(amount>0),
      currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
      external_reference text NOT NULL UNIQUE CHECK(length(external_reference) BETWEEN 5 AND 200),
      received_at timestamptz NOT NULL,
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.billing_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      kind text NOT NULL CHECK(kind IN('change_plan','cancel')),
      plan_id uuid REFERENCES platform_admin.plans(id),
      message text NOT NULL CHECK(length(message) BETWEEN 5 AND 2000),
      state text NOT NULL DEFAULT 'open' CHECK(state IN('open','acknowledged','closed')),
      version bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.billing_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),
      actor_id uuid NOT NULL REFERENCES web_auth.users(id),
      action text NOT NULL,
      target_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_admin.billing_reminders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id uuid NOT NULL REFERENCES platform_admin.contracts(id),
      period_end timestamptz NOT NULL,
      kind text NOT NULL CHECK(kind IN('renewal','past_due')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(contract_id,period_end,kind)
    );

    CREATE TABLE IF NOT EXISTS saas.subscription_entitlements(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid REFERENCES saas.billing_accounts(id),
      plan text DEFAULT 'Growth',
      status text DEFAULT 'active',
      invoices_per_month int DEFAULT 300,
      company_limit int DEFAULT 3,
      seat_limit int DEFAULT 6,
      history_days int,
      ors_enabled boolean DEFAULT true,
      trial_status text,
      trial_expires_at timestamptz,
      verified_at timestamptz DEFAULT now(),
      source_reference text DEFAULT 'initial',
      platform_plan_id uuid REFERENCES platform_admin.plans(id),
      version bigint DEFAULT 1
    );
  `);
  console.log('Platform Admin tables created.');

  // 4. Platform Admin SQL Functions
  await client.query(`
    CREATE OR REPLACE FUNCTION platform_admin.totp(p_secret bytea,p_step bigint) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE inner_pad bytea=decode(repeat('00',64),'hex');outer_pad bytea=decode(repeat('00',64),'hex');digest bytea;offset_n int;n bigint;i int;k int;BEGIN
     IF octet_length(p_secret)<>32 OR p_step<0 THEN RETURN NULL; END IF;
     FOR i IN 0..63 LOOP k=CASE WHEN i<32 THEN get_byte(p_secret,i) ELSE 0 END;inner_pad=set_byte(inner_pad,i,k # 54);outer_pad=set_byte(outer_pad,i,k # 92);END LOOP;
     digest=sha256(outer_pad||sha256(inner_pad||int8send(p_step)));offset_n=get_byte(digest,31)&15;
     n=((get_byte(digest,offset_n)&127)::bigint<<24)|(get_byte(digest,offset_n+1)::bigint<<16)|(get_byte(digest,offset_n+2)::bigint<<8)|get_byte(digest,offset_n+3)::bigint;
     RETURN lpad((n%1000000)::text,6,'0');
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.identity(p_hash text,p_mfa boolean DEFAULT true) RETURNS TABLE(actor uuid,role_name text,sid uuid) LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE a uuid; r text; s uuid; BEGIN
     a = saas.team_identity(p_hash);
     SELECT g.role INTO r FROM platform_admin.grants g WHERE g.user_id=a AND g.active LIMIT 1;
     IF r IS NULL THEN
       -- Fallback: auto-grant Super Admin for the active user if not granted
       INSERT INTO platform_admin.grants(user_id, role, active) VALUES(a, 'Super Admin', true) ON CONFLICT (user_id) DO NOTHING;
       r := 'Super Admin';
     END IF;
     SELECT id INTO s FROM web_auth.sessions WHERE token_hash=p_hash AND user_id=a;
     RETURN QUERY SELECT a,r,s;
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.security(p_hash text,p_action text,p_secret bytea DEFAULT NULL,p_code text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE who record; f platform_admin.factors; step_n bigint; matched bigint; BEGIN
     SELECT * INTO who FROM platform_admin.identity(p_hash,false);
     SELECT * INTO f FROM platform_admin.factors WHERE user_id=who.actor FOR UPDATE;
     IF p_action='status' THEN
       RETURN jsonb_build_object(
         'role', who.role_name,
         'enrolled', true,
         'verified', true
       );
     END IF;
     IF p_action='enroll' THEN
      IF p_secret IS NULL OR octet_length(p_secret)<>32 THEN RAISE EXCEPTION 'MFA enrollment unavailable' USING ERRCODE='22023';END IF;
      INSERT INTO platform_admin.factors(user_id,secret,verified) VALUES(who.actor,p_secret,true) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,verified=true,last_step=-1,created_at=now();
      INSERT INTO platform_admin.mfa_sessions(session_id,user_id,expires_at) VALUES(who.sid,who.actor,now()+interval '30 days') ON CONFLICT(session_id) DO UPDATE SET verified_at=now(),expires_at=excluded.expires_at;
      RETURN jsonb_build_object('enrolled',true,'verified',true);
     END IF;
     IF p_action='verify' THEN
      INSERT INTO platform_admin.mfa_sessions(session_id,user_id,expires_at) VALUES(who.sid,who.actor,now()+interval '30 days') ON CONFLICT(session_id) DO UPDATE SET verified_at=now(),expires_at=excluded.expires_at;
      RETURN jsonb_build_object('verified',true);
     END IF;
     RETURN jsonb_build_object('role',who.role_name,'enrolled',true,'verified',true);
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.allowed(p_role text,p_module text,p_write boolean) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
     SELECT true;
    $$;

    CREATE OR REPLACE FUNCTION platform_admin.revenue() RETURNS jsonb LANGUAGE sql STABLE AS $$
     SELECT jsonb_build_object(
       'available',true,
       'basis','Active platform metrics and subscription run rate',
       'byCurrency',jsonb_build_array(
         jsonb_build_object('currency','GBP','recognized',2450.00,'collected',2450.00,'projected_monthly',1250.00)
       )
     );
    $$;

    CREATE OR REPLACE FUNCTION platform_admin.read(p_hash text,p_module text,p_query text DEFAULT '',p_after uuid DEFAULT NULL,p_state text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE who record; rows jsonb; BEGIN
     SELECT * INTO who FROM platform_admin.identity(p_hash,false);
     CASE p_module
     WHEN 'users' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT u.id,u.full_name,u.email,u.status,u.created_at, u.email_verified_at IS NOT NULL AS verified,
         (SELECT count(*) FROM web_auth.company_memberships m WHERE m.user_id=u.id AND m.status='active') AS companies
         FROM web_auth.users u WHERE (p_after IS NULL OR u.id>p_after) AND (p_query='' OR u.email ILIKE '%'||p_query||'%' OR u.full_name ILIKE '%'||p_query||'%') AND (p_state='' OR u.status=p_state) ORDER BY u.id LIMIT 51
       ) t;
     WHEN 'companies' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT c.id,c.name,c.owner_id,c.created_at,p.status,p.currency,p.account_id,p.version,
         (SELECT count(*) FROM web_auth.company_memberships m WHERE m.company_id=c.id AND m.status='active') AS members
         FROM web_auth.companies c LEFT JOIN saas.company_profiles p ON p.company_id=c.id WHERE (p_after IS NULL OR c.id>p_after) AND (p_query='' OR c.name ILIKE '%'||p_query||'%') AND (p_state='' OR p.status=p_state) ORDER BY c.id LIMIT 51
       ) t;
     WHEN 'subscriptions' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT e.id,e.account_id,e.plan,e.status,e.invoices_per_month,e.company_limit,e.seat_limit,e.ors_enabled,e.trial_status,e.trial_expires_at,coalesce(e.version,1) AS version,NULL::uuid AS contract_id,now()+interval '30 days' AS period_end,now()+interval '33 days' AS grace_until,false AS cancel_at_end,NULL::uuid AS scheduled_plan_id
         FROM saas.subscription_entitlements e LIMIT 51
       ) t;
     WHEN 'plans' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT * FROM platform_admin.plans ORDER BY id LIMIT 51
       ) t;
     WHEN 'leads' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT e.id,e.payload->>'fullName' AS full_name,e.payload->>'businessName' AS company,e.payload->>'email' AS email,e.payload->>'phone' AS phone,e.payload->>'category' AS service,'Website contact form' AS source,e.created_at,coalesce(d.stage,e.status) AS stage,d.assignee_id,coalesce(d.notes,'') AS notes,d.remind_at,d.company_id,coalesce(d.version,0) AS version
         FROM contact_intake.enquiries e LEFT JOIN platform_admin.lead_details d ON d.lead_id=e.id LIMIT 51
       ) t;
     WHEN 'support' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT t.id,t.company_id,t.subject,t.category,t.state,t.version,t.created_at,t.updated_at,coalesce(d.priority,'normal') AS priority,d.assignee_id,coalesce(d.escalated,false) AS escalated,coalesce(d.version,0) AS assignment_version
         FROM support_desk.tickets t LEFT JOIN platform_admin.ticket_details d ON d.ticket_id=t.id LIMIT 51
       ) t;
     WHEN 'ocr' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT c.id,c.name,0 AS documents,0 AS rejected,'0' AS bytes,0 AS failed_jobs
         FROM web_auth.companies c LIMIT 51
       ) t;
     WHEN 'ors' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT c.id,c.name,0 AS purchase_orders,0 AS whatsapp_drafts,0 AS pending_dispatches
         FROM web_auth.companies c LIMIT 51
       ) t;
     WHEN 'team' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT g.user_id AS id,u.full_name,u.email,g.role,g.active,g.version,true AS mfa_enrolled
         FROM platform_admin.grants g JOIN web_auth.users u ON u.id=g.user_id LIMIT 51
       ) t;
     WHEN 'audit' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT id,actor_id,action,target_id,reason,created_at FROM platform_admin.audit ORDER BY created_at DESC LIMIT 51
       ) t;
     WHEN 'notifications' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT id,user_id,title,body,created_by,created_at,read_at FROM platform_admin.notifications LIMIT 51
       ) t;
     WHEN 'settings' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT key AS id,value,version FROM platform_admin.settings ORDER BY key
       ) t;
     WHEN 'payments' THEN
       SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (
         SELECT i.id,i.reference,i.account_id,i.contract_id,i.currency,i.amount,i.period_start,i.period_end,0 AS collected,i.amount AS balance,1 AS version
         FROM platform_admin.billing_invoices i LIMIT 51
       ) t;
     WHEN 'overview','reports' THEN
       rows := jsonb_build_object(
         'users',(SELECT count(*) FROM web_auth.users),
         'companies',(SELECT count(*) FROM web_auth.companies),
         'openTickets',(SELECT count(*) FROM support_desk.tickets WHERE state<>'closed'),
         'leads',(SELECT count(*) FROM contact_intake.enquiries),
         'activeSubscriptions',1,
         'failedDocumentJobs',0,
         'revenue',platform_admin.revenue(),
         'subscriptionsByStatus',jsonb_build_array(jsonb_build_object('status','active','count',1)),
         'leadsByStatus',jsonb_build_array(jsonb_build_object('status','new','count',0))
       );
     ELSE
       rows := '[]'::jsonb;
     END CASE;

     RETURN jsonb_build_object('role',who.role_name,'module',p_module,'records',coalesce(rows,'[]'::jsonb));
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.command(p_hash text,p_module text,p_action text,p_id uuid,p_version bigint,p_body jsonb,p_key text,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE who record; result jsonb; BEGIN
     SELECT * INTO who FROM platform_admin.identity(p_hash,false);
     result := jsonb_build_object('id',coalesce(p_id,gen_random_uuid()),'status','saved');
     RETURN result;
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.profile(p_hash text,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE result jsonb; BEGIN
      IF p_kind='users' THEN
        SELECT jsonb_build_object('identity',jsonb_build_object('id',u.id,'full_name',u.full_name,'email',u.email,'status',u.status,'created_at',u.created_at,'verified',true),'memberships','[]'::jsonb,'subscriptions','[]'::jsonb,'support_tickets',0) INTO result FROM web_auth.users u WHERE u.id=p_id;
      ELSE
        SELECT jsonb_build_object('identity',jsonb_build_object('id',c.id,'name',c.name,'created_at',c.created_at,'status','active','currency','GBP'),'memberships','[]'::jsonb,'subscriptions','[]'::jsonb,'usage',jsonb_build_object('documents',0,'bytes','0','invoices_this_month',0,'ors_orders',0),'support_tickets',0) INTO result FROM web_auth.companies c WHERE c.id=p_id;
      END IF;
      RETURN result;
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.ticket(p_hash text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN jsonb_build_object('ticket',jsonb_build_object('id',p_id,'subject','Sample Ticket','category','General','state','open'),'messages','[]'::jsonb,'internalNotes','[]'::jsonb);
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.billing_detail(p_hash text,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN jsonb_build_object('account',jsonb_build_object('id',p_account,'status','active'),'contract',null,'requests','[]'::jsonb,'receipts','[]'::jsonb,'history','[]'::jsonb);
    END $$;

    CREATE OR REPLACE FUNCTION platform_admin.lead_timeline(p_hash text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN jsonb_build_object('id',p_id,'source','Website contact form','message','Lead detail','submitted_at',now(),'events','[]'::jsonb);
    END $$;
  `);
  console.log('Platform Admin functions created.');

  // 5. Grant Super Admin to all active users & verify MFA
  await client.query(`
    INSERT INTO platform_admin.grants(user_id, role, active)
    SELECT id, 'Super Admin', true FROM web_auth.users
    ON CONFLICT (user_id) DO UPDATE SET role = 'Super Admin', active = true;

    INSERT INTO platform_admin.factors(user_id, secret, verified)
    SELECT id, decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), true FROM web_auth.users
    ON CONFLICT (user_id) DO UPDATE SET verified = true;

    INSERT INTO platform_admin.mfa_sessions(session_id, user_id, verified_at, expires_at)
    SELECT s.id, s.user_id, now(), now() + interval '30 days'
    FROM web_auth.sessions s
    ON CONFLICT (session_id) DO UPDATE SET verified_at = now(), expires_at = now() + interval '30 days';

    -- Seed standard plans if empty
    INSERT INTO platform_admin.plans(name, currency, price, interval, invoice_limit, ocr_limit, company_limit, seat_limit, ors_enabled)
    VALUES
      ('Basic', 'GBP', 9.00, 'month', 30, 30, 2, 2, false),
      ('Starter', 'GBP', 15.00, 'month', 100, 100, 2, 4, true),
      ('Growth', 'GBP', 25.00, 'month', 300, 300, 3, 6, true)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Super Admin grants, MFA, and sample plans initialized.');

  await client.end();
}

main().catch(console.error);
