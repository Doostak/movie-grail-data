
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create imdb_movies table
CREATE TABLE public.imdb_movies (
  id INTEGER PRIMARY KEY,
  poster_link TEXT,
  movie_title TEXT NOT NULL,
  genres TEXT[] NOT NULL DEFAULT '{}',
  imdb_rating NUMERIC(3,1),
  overview TEXT,
  director TEXT,
  released_year INTEGER,
  embedding vector(768)
);

-- This is public reference data, allow read access to everyone
ALTER TABLE public.imdb_movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read imdb_movies"
  ON public.imdb_movies
  FOR SELECT
  USING (true);
