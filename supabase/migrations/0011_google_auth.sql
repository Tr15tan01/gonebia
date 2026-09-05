-- Google sign-in creates a user with no password at all - make room for that.
alter table users alter column password_hash drop not null;
