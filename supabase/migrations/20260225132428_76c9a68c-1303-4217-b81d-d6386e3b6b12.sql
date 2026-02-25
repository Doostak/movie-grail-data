
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-data', 'temp-data', true);

CREATE POLICY "Public read temp-data" ON storage.objects FOR SELECT USING (bucket_id = 'temp-data');
CREATE POLICY "Service insert temp-data" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'temp-data');
