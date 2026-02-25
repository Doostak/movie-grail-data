CREATE OR REPLACE FUNCTION public.match_movies(query_embedding extensions.vector, match_count integer)
RETURNS TABLE(id integer, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    m.id,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM imdb_movies m
  WHERE m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;