BEGIN;

LOCK TABLE public.organizations,public.issuers,public.templates,public.credentials IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.subscription_plans (
  id TEXT PRIMARY KEY CHECK(id IN ('starter','professional','enterprise')),
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL CHECK(monthly_price_cents>=0),
  issuer_limit INTEGER CHECK(issuer_limit>0),
  template_limit INTEGER CHECK(template_limit>0),
  certificate_limit INTEGER CHECK(certificate_limit>0)
);
INSERT INTO public.subscription_plans VALUES
  ('starter','Starter',4900,1,5,100),
  ('professional','Professional',29900,5,10,1000),
  ('enterprise','Enterprise',89900,NULL,NULL,NULL);
ALTER TABLE public.subscriptions
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'enterprise' REFERENCES public.subscription_plans(id),
  ADD COLUMN started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN renewed_at TIMESTAMPTZ,
  ADD COLUMN renews_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN billable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN monthly_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(monthly_price_cents>=0),
  ADD COLUMN grandfathered BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN usage_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN legacy_metadata JSONB;
UPDATE public.subscriptions SET legacy_metadata=jsonb_build_object(
  'plan_code',plan_code,'status',status,'seats',seats,'current_period_ends_at',current_period_ends_at),
  started_at=created_at,status='active';
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE public.subscriptions
  ALTER COLUMN plan_code SET DEFAULT 'enterprise',
  ALTER COLUMN grandfathered SET DEFAULT false,
  ADD CHECK(status IN ('pending','active','suspended','expired','canceled')),
  ADD CHECK(expires_at IS NULL OR expires_at>started_at),
  ADD CHECK(renews_at IS NULL OR renews_at>started_at),
  ADD CHECK(billable OR monthly_price_cents=0),
  ADD CHECK(NOT grandfathered OR (plan='enterprise' AND NOT billable));
INSERT INTO public.subscriptions(organization_id,plan,status,grandfathered)
SELECT id,'enterprise','active',true FROM public.organizations ON CONFLICT(organization_id) DO NOTHING;
CREATE TABLE public.organization_usage_monthly (
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  month DATE NOT NULL,
  certificates_issued BIGINT NOT NULL DEFAULT 0 CHECK(certificates_issued>=0),
  issuers_created BIGINT NOT NULL DEFAULT 0 CHECK(issuers_created>=0),
  templates_created BIGINT NOT NULL DEFAULT 0 CHECK(templates_created>=0),
  PRIMARY KEY(organization_id,month)
);
CREATE TABLE public.subscription_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  requested_plan TEXT NOT NULL REFERENCES public.subscription_plans(id),
  requested_by UUID NOT NULL REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_subscription_request ON public.subscription_requests(organization_id) WHERE status='pending';
INSERT INTO public.organization_usage_monthly(organization_id,month,certificates_issued,issuers_created,templates_created)
SELECT organization_id,month,sum(c),sum(i),sum(t) FROM (
  SELECT organization_id,date_trunc('month',issued_at AT TIME ZONE 'UTC')::date AS month,count(*) AS c,0 AS i,0 AS t
    FROM credentials GROUP BY 1,2
  UNION ALL SELECT organization_id,date_trunc('month',created_at AT TIME ZONE 'UTC')::date,0,count(*),0 FROM issuers GROUP BY 1,2
  UNION ALL SELECT organization_id,date_trunc('month',created_at AT TIME ZONE 'UTC')::date,0,0,count(*) FROM templates GROUP BY 1,2
) counts GROUP BY 1,2;

CREATE FUNCTION public.subscription_new_organization() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO subscriptions(organization_id,plan,plan_code,status) VALUES(NEW.id,'starter','starter','pending');
  RETURN NEW;
END;$$;
CREATE TRIGGER subscription_new_organization AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.subscription_new_organization();

CREATE FUNCTION public.subscription_enforce() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sub subscriptions; limits subscription_plans; used BIGINT; ceiling INTEGER;
BEGIN
  SELECT * INTO sub FROM subscriptions WHERE organization_id=NEW.organization_id FOR UPDATE;
  IF sub.organization_id IS NULL OR sub.status<>'active' OR sub.expires_at<=now() THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SUBSCRIPTION_INACTIVE: New creation requires an active subscription. Contact your organization administrator.';
  END IF;
  SELECT * INTO limits FROM subscription_plans WHERE id=sub.plan;
  UPDATE subscriptions SET usage_revision=usage_revision+1 WHERE organization_id=NEW.organization_id;
  IF TG_TABLE_NAME='credentials' THEN
    ceiling:=limits.certificate_limit;
    SELECT certificates_issued INTO used FROM organization_usage_monthly
      WHERE organization_id=NEW.organization_id AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
  ELSIF TG_TABLE_NAME='issuers' THEN
    ceiling:=limits.issuer_limit;
    SELECT count(*) INTO used FROM issuers WHERE organization_id=NEW.organization_id AND status<>'deleted';
  ELSE
    ceiling:=limits.template_limit;
    SELECT count(*) INTO used FROM templates WHERE organization_id=NEW.organization_id;
  END IF;
  IF ceiling IS NOT NULL AND (
    TG_TABLE_NAME='credentials' AND coalesce(used,0)>=ceiling
    OR TG_TABLE_NAME<>'credentials' AND used>ceiling
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SUBSCRIPTION_LIMIT: '||TG_TABLE_NAME||' plan limit reached. Request a plan upgrade.';
  END IF;
  INSERT INTO organization_usage_monthly(organization_id,month,certificates_issued,issuers_created,templates_created)
  VALUES(NEW.organization_id,date_trunc('month',now() AT TIME ZONE 'UTC')::date,
    CASE WHEN TG_TABLE_NAME='credentials' THEN 1 ELSE 0 END,
    CASE WHEN TG_TABLE_NAME='issuers' THEN 1 ELSE 0 END,
    CASE WHEN TG_TABLE_NAME='templates' THEN 1 ELSE 0 END)
  ON CONFLICT(organization_id,month) DO UPDATE SET
    certificates_issued=organization_usage_monthly.certificates_issued+excluded.certificates_issued,
    issuers_created=organization_usage_monthly.issuers_created+excluded.issuers_created,
    templates_created=organization_usage_monthly.templates_created+excluded.templates_created;
  RETURN NEW;
END;$$;
CREATE TRIGGER zz_subscription_quota AFTER INSERT ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.subscription_enforce();
CREATE TRIGGER zz_subscription_quota AFTER INSERT ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.subscription_enforce();
CREATE TRIGGER zz_subscription_quota AFTER INSERT ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.subscription_enforce();

CREATE FUNCTION public.subscription_admin_action(p_org UUID,p_actor UUID,p_action TEXT,p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE platform BOOLEAN; current_sub subscriptions; price INTEGER; target_plan subscription_plans;
BEGIN
  SELECT coalesce(roles && ARRAY['platform_admin','platform-admin'],false) INTO platform FROM users WHERE id=p_actor;
  IF NOT coalesce(platform,false) AND NOT EXISTS (
    SELECT 1 FROM users u JOIN organization_members m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id
    WHERE u.id=p_actor AND u.organization_id=p_org AND m.organization_id=p_org AND m.role='organization_admin'
      AND o.status='active' AND o.soft_deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Subscription administration denied'; END IF;
  SELECT * INTO current_sub FROM subscriptions WHERE organization_id=p_org FOR UPDATE;
  IF current_sub.organization_id IS NULL THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF p_action='request' THEN
    INSERT INTO subscription_requests(organization_id,requested_plan,requested_by)
      VALUES(p_org,p_payload->>'plan',p_actor);
  ELSIF p_action='assign' THEN
    IF NOT coalesce(platform,false) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
    IF (p_payload->>'version')::integer IS DISTINCT FROM current_sub.version THEN RAISE EXCEPTION 'Subscription changed. Refresh before saving'; END IF;
    SELECT * INTO target_plan FROM subscription_plans WHERE id=p_payload->>'plan';
    IF target_plan.id IS NULL THEN RAISE EXCEPTION 'Unknown subscription plan'; END IF;
    price:=CASE WHEN (p_payload->>'billable')::boolean THEN
      CASE WHEN target_plan.id='enterprise' THEN (p_payload->>'monthlyPriceCents')::integer ELSE target_plan.monthly_price_cents END ELSE 0 END;
    IF price IS NULL OR price<0 OR ((p_payload->>'billable')::boolean AND price<target_plan.monthly_price_cents) THEN
      RAISE EXCEPTION 'Contracted monthly price is below the plan minimum'; END IF;
    UPDATE subscriptions SET plan=target_plan.id,plan_code=target_plan.id,status=p_payload->>'status',
      renewed_at=CASE WHEN (p_payload->>'renew')::boolean THEN now() ELSE renewed_at END,
      renews_at=(p_payload->>'renewsAt')::timestamptz,expires_at=(p_payload->>'expiresAt')::timestamptz,
      billable=(p_payload->>'billable')::boolean,monthly_price_cents=price,grandfathered=false,
      version=version+1,updated_at=now() WHERE organization_id=p_org;
    UPDATE subscription_requests SET status='resolved' WHERE organization_id=p_org AND status='pending';
  ELSE RAISE EXCEPTION 'Unknown subscription action'; END IF;
  INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(p_org,p_actor,'subscription.'||p_action,'subscription',p_org,
    jsonb_build_object('previousPlan',current_sub.plan,'plan',p_payload->>'plan','previousStatus',current_sub.status,
      'status',p_payload->>'status','previousMonthlyPriceCents',current_sub.monthly_price_cents,
      'monthlyPriceCents',price,'billable',p_payload->>'billable','renewsAt',p_payload->>'renewsAt','expiresAt',p_payload->>'expiresAt'));
END;$$;

CREATE FUNCTION public.subscription_snapshot(p_org UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('subscription',to_jsonb(s),'limits',to_jsonb(p),
    'usage',jsonb_build_object(
      'month',date_trunc('month',now() AT TIME ZONE 'UTC')::date,
      'certificatesIssued',coalesce(m.certificates_issued,0),
      'issuersCreated',coalesce(m.issuers_created,0),'templatesCreated',coalesce(m.templates_created,0),
      'issuers',(SELECT count(*) FROM issuers WHERE organization_id=p_org AND status<>'deleted'),
      'templates',(SELECT count(*) FROM templates WHERE organization_id=p_org),
      'storageBytes',coalesce((SELECT sum(octet_length(credential::text)) FROM credentials WHERE organization_id=p_org),0)
        +coalesce((SELECT sum(octet_length(definition::text)) FROM templates WHERE organization_id=p_org),0)),
    'request',(SELECT to_jsonb(r) FROM subscription_requests r WHERE r.organization_id=p_org AND r.status='pending'))
  FROM subscriptions s JOIN subscription_plans p ON p.id=s.plan
  LEFT JOIN organization_usage_monthly m ON m.organization_id=p_org AND m.month=date_trunc('month',now() AT TIME ZONE 'UTC')::date
  WHERE s.organization_id=p_org;
$$;
CREATE FUNCTION public.subscription_platform_metrics() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'mrrCents',coalesce(sum(monthly_price_cents) FILTER(WHERE s.billable AND s.status='active'
      AND (s.expires_at IS NULL OR s.expires_at>now()) AND o.status='active' AND o.soft_deleted_at IS NULL),0),
    'organizations',(SELECT count(*) FROM organizations WHERE soft_deleted_at IS NULL),
    'activeIssuers',(SELECT count(*) FROM issuers i JOIN organizations org ON org.id=i.organization_id
      WHERE i.status='active' AND i.active AND org.status='active' AND org.soft_deleted_at IS NULL),
    'credentialsIssued',(SELECT count(*) FROM credentials),
    'certificatesThisMonth',(SELECT coalesce(sum(certificates_issued),0) FROM organization_usage_monthly
      WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),
    'verificationVolume',(SELECT count(*) FROM verification_logs),
    'subscriptions',count(*),
    'activeSubscriptions',count(*) FILTER(WHERE s.status='active' AND (s.expires_at IS NULL OR s.expires_at>now())),
    'pendingRequests',(SELECT count(*) FROM subscription_requests WHERE status='pending'))
  FROM subscriptions s JOIN organizations o ON o.id=s.organization_id;
$$;
CREATE FUNCTION public.subscription_directory(p_offset INTEGER DEFAULT 0) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb),
    'hasMore',(SELECT count(*)>greatest(p_offset,0)+50 FROM subscriptions s
      JOIN organizations o ON o.id=s.organization_id WHERE o.soft_deleted_at IS NULL))
  FROM (
    SELECT o.id AS "organizationId",o.display_name AS "organizationName",s.plan,s.status,
      s.renews_at AS "renewsAt",s.expires_at AS "expiresAt",s.monthly_price_cents AS "monthlyPriceCents",
      s.billable,s.grandfathered,r.requested_plan AS "requestedPlan"
    FROM subscriptions s JOIN organizations o ON o.id=s.organization_id
    LEFT JOIN subscription_requests r ON r.organization_id=o.id AND r.status='pending'
    WHERE o.soft_deleted_at IS NULL
    ORDER BY (r.id IS NOT NULL) DESC,o.display_name,o.id LIMIT 50 OFFSET greatest(p_offset,0)
  ) page;
$$;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY subscriptions_own_org ON public.subscriptions;
REVOKE ALL ON public.subscription_plans,public.subscriptions,public.organization_usage_monthly,public.subscription_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.subscription_plans,public.subscriptions,public.organization_usage_monthly,public.subscription_requests TO authenticated,service_role;
CREATE POLICY subscription_plans_read ON public.subscription_plans FOR SELECT TO authenticated USING(true);
CREATE POLICY subscriptions_read ON public.subscriptions FOR SELECT TO authenticated
USING(phase1_owns_organization(organization_id,ARRAY['organization_admin']));
CREATE POLICY subscription_usage_read ON public.organization_usage_monthly FOR SELECT TO authenticated
USING(phase1_owns_organization(organization_id,ARRAY['organization_admin']));
CREATE POLICY subscription_requests_read ON public.subscription_requests FOR SELECT TO authenticated
USING(phase1_owns_organization(organization_id,ARRAY['organization_admin']));
REVOKE INSERT ON public.verification_logs FROM anon,authenticated;
GRANT INSERT,SELECT ON public.verification_logs TO service_role;
REVOKE ALL ON FUNCTION public.subscription_new_organization(),public.subscription_enforce(),
  public.subscription_admin_action(UUID,UUID,TEXT,JSONB),public.subscription_snapshot(UUID),public.subscription_platform_metrics(),public.subscription_directory(INTEGER)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_admin_action(UUID,UUID,TEXT,JSONB),public.subscription_snapshot(UUID),public.subscription_platform_metrics(),public.subscription_directory(INTEGER) TO service_role;
COMMIT;
