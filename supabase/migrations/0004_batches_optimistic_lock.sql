alter table batches
add column if not exists version bigint not null default 1;
