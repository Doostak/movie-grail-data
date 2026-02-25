
CREATE OR REPLACE FUNCTION public.match_movies(
  query_embedding vector(768),
  match_count integer
)
RETURNS TABLE(id integer, similarity double precision)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM imdb_movies m
  WHERE m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;
