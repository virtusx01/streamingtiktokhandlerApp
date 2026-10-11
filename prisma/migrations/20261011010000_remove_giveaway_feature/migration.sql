BEGIN;

DELETE FROM public.settings
WHERE key LIKE 'giveaway_%';

DROP TABLE IF EXISTS public.giveaway_participants;
DROP TABLE IF EXISTS public.wa_group_members;

COMMIT;
