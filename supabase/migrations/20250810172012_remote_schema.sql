drop trigger if exists "update_goals_updated_at" on "public"."goals";

drop trigger if exists "update_rewards_updated_at" on "public"."rewards";

drop policy "Parents can view audit logs for their family" on "public"."audit_log";

drop policy "System can insert audit logs" on "public"."audit_log";

drop policy "audit_insert_onboarding" on "public"."audit_log";

drop policy "Parents can manage goals for their family children" on "public"."goals";

drop policy "interest_runs_rw" on "public"."interest_runs_prd";

drop policy "tiers_rw" on "public"."interest_tiers";

drop policy "transactions_rw" on "public"."transactions_prd";

revoke delete on table "public"."interest_runs_prd" from "anon";

revoke insert on table "public"."interest_runs_prd" from "anon";

revoke references on table "public"."interest_runs_prd" from "anon";

revoke select on table "public"."interest_runs_prd" from "anon";

revoke trigger on table "public"."interest_runs_prd" from "anon";

revoke truncate on table "public"."interest_runs_prd" from "anon";

revoke update on table "public"."interest_runs_prd" from "anon";

revoke delete on table "public"."interest_runs_prd" from "authenticated";

revoke insert on table "public"."interest_runs_prd" from "authenticated";

revoke references on table "public"."interest_runs_prd" from "authenticated";

revoke select on table "public"."interest_runs_prd" from "authenticated";

revoke trigger on table "public"."interest_runs_prd" from "authenticated";

revoke truncate on table "public"."interest_runs_prd" from "authenticated";

revoke update on table "public"."interest_runs_prd" from "authenticated";

revoke delete on table "public"."interest_runs_prd" from "service_role";

revoke insert on table "public"."interest_runs_prd" from "service_role";

revoke references on table "public"."interest_runs_prd" from "service_role";

revoke select on table "public"."interest_runs_prd" from "service_role";

revoke trigger on table "public"."interest_runs_prd" from "service_role";

revoke truncate on table "public"."interest_runs_prd" from "service_role";

revoke update on table "public"."interest_runs_prd" from "service_role";

revoke delete on table "public"."transactions_prd" from "anon";

revoke insert on table "public"."transactions_prd" from "anon";

revoke references on table "public"."transactions_prd" from "anon";

revoke select on table "public"."transactions_prd" from "anon";

revoke trigger on table "public"."transactions_prd" from "anon";

revoke truncate on table "public"."transactions_prd" from "anon";

revoke update on table "public"."transactions_prd" from "anon";

revoke delete on table "public"."transactions_prd" from "authenticated";

revoke insert on table "public"."transactions_prd" from "authenticated";

revoke references on table "public"."transactions_prd" from "authenticated";

revoke select on table "public"."transactions_prd" from "authenticated";

revoke trigger on table "public"."transactions_prd" from "authenticated";

revoke truncate on table "public"."transactions_prd" from "authenticated";

revoke update on table "public"."transactions_prd" from "authenticated";

revoke delete on table "public"."transactions_prd" from "service_role";

revoke insert on table "public"."transactions_prd" from "service_role";

revoke references on table "public"."transactions_prd" from "service_role";

revoke select on table "public"."transactions_prd" from "service_role";

revoke trigger on table "public"."transactions_prd" from "service_role";

revoke truncate on table "public"."transactions_prd" from "service_role";

revoke update on table "public"."transactions_prd" from "service_role";

alter table "public"."goals" drop constraint "fk_goals_reward_id";

alter table "public"."interest_runs_prd" drop constraint "interest_runs_prd_account_id_fkey";

alter table "public"."interest_runs_prd" drop constraint "interest_runs_prd_account_id_run_date_key";

alter table "public"."transactions_prd" drop constraint "transactions_prd_account_id_fkey";

drop function if exists "public"."log_audit_event"(p_family_id uuid, p_user_type user_type, p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb);

alter table "public"."interest_runs_prd" drop constraint "interest_runs_prd_pkey";

alter table "public"."transactions_prd" drop constraint "transactions_prd_pkey";

drop index if exists "public"."idx_audit_log_created_at";

drop index if exists "public"."idx_audit_log_entity";

drop index if exists "public"."idx_audit_log_family_id";

drop index if exists "public"."idx_goals_child_id";

drop index if exists "public"."idx_interest_runs_prd_account_date";

drop index if exists "public"."idx_transactions_prd_account_date";

drop index if exists "public"."interest_runs_prd_account_id_run_date_key";

drop index if exists "public"."interest_runs_prd_pkey";

drop index if exists "public"."transactions_prd_pkey";

drop table "public"."interest_runs_prd";

drop table "public"."transactions_prd";

alter table "public"."goals" drop column "reward_id";

drop type "public"."delivery_status";

drop type "public"."user_type";


