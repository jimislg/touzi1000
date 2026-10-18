-- 需由有权限的维护者审查并在目标云库安装。本轮没有执行此SQL。
-- SECURITY INVOKER：沿用调用者的表权限与RLS，不提升权限，不绕过策略。
-- expected/next通过RPC的POST正文传入，避免把完整配置放进URL或网关日志。
create or replace function public.compare_and_swap_app_config(
  p_expected jsonb,
  p_next jsonb
) returns boolean
language sql
security invoker
set search_path = ''
as $$
  with changed as (
    update public.app_config
       set data = p_next, updated_at = now()
     where key = 'config' and data = p_expected
    returning 1
  )
  select exists(select 1 from changed);
$$;
-- 维护者应按现有部署的实际数据库角色检查EXECUTE权限及app_config的RLS。
-- 不使用SECURITY DEFINER，不新增宽松的读写策略，不自动播种或覆盖配置。
