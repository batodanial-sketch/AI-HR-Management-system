# Supabase Storage setup

Resume uploads require one public bucket. Storage buckets are managed via the
Supabase dashboard or the Storage API — **not** SQL migrations.

## Create the bucket (dashboard)

1. Open your project → **Storage** → **New bucket**.
2. Name: `candidate-resumes`
3. **Public bucket**: ON
4. Save.

## Or via the CLI

```bash
supabase storage create candidate-resumes --public
```

## RLS policy for the bucket

Uploads happen with the anon key from an authenticated browser session, so add
a storage policy that lets authenticated org members upload/read:

```sql
-- storage.objects policy (run in SQL editor)
create policy "Authenticated users can upload resumes"
on storage.objects for insert
with check (bucket_id = 'candidate-resumes' and auth.role() = 'authenticated');

create policy "Public read of candidate resumes"
on storage.objects for select
using (bucket_id = 'candidate-resumes');
```

Without this bucket, the resume upload button surfaces a clear error and the
rest of the app is unaffected.
