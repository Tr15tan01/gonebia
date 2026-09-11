alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check
  check (status in ('running','done','failed','safety_blocked'));
