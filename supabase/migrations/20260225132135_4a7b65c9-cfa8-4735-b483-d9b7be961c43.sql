
CREATE OR REPLACE FUNCTION public.seed_imdb_from_csv(csv_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line TEXT;
  fields TEXT[];
  field TEXT;
  in_quotes BOOLEAN;
  current_field TEXT;
  char TEXT;
  i INTEGER;
  row_count INTEGER := 0;
  line_num INTEGER := 0;
  genres_arr TEXT[];
  genre TEXT;
  raw_genres TEXT;
  year_val INTEGER;
BEGIN
  FOR line IN SELECT unnest(string_to_array(csv_text, E'\n'))
  LOOP
    line_num := line_num + 1;
    IF line_num = 1 OR trim(line) = '' THEN
      CONTINUE;
    END IF;
    
    -- Parse CSV line with proper quote handling
    fields := ARRAY[]::TEXT[];
    in_quotes := FALSE;
    current_field := '';
    
    FOR i IN 1..length(line)
    LOOP
      char := substr(line, i, 1);
      IF in_quotes THEN
        IF char = '"' THEN
          IF i < length(line) AND substr(line, i+1, 1) = '"' THEN
            current_field := current_field || '"';
            -- skip next char handled by checking i+1
          ELSIF i > 1 AND substr(line, i-1, 1) = '"' AND 
                (i < 2 OR substr(line, i-2, 1) != '"') THEN
            -- This was the escaped quote, skip
            CONTINUE;
          ELSE
            in_quotes := FALSE;
          END IF;
        ELSE
          current_field := current_field || char;
        END IF;
      ELSE
        IF char = '"' THEN
          in_quotes := TRUE;
        ELSIF char = ',' THEN
          fields := array_append(fields, current_field);
          current_field := '';
        ELSE
          current_field := current_field || char;
        END IF;
      END IF;
    END LOOP;
    fields := array_append(fields, current_field);
    
    -- Parse genres into array
    raw_genres := fields[4];
    genres_arr := ARRAY[]::TEXT[];
    FOR genre IN SELECT trim(g) FROM unnest(string_to_array(raw_genres, ',')) AS g
    LOOP
      IF genre != '' THEN
        genres_arr := array_append(genres_arr, genre);
      END IF;
    END LOOP;
    
    -- Parse year
    BEGIN
      year_val := fields[8]::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      year_val := NULL;
    END;
    
    INSERT INTO public.imdb_movies (id, poster_link, movie_title, genres, imdb_rating, overview, director, released_year)
    VALUES (
      fields[1]::INTEGER,
      fields[2],
      fields[3],
      genres_arr,
      fields[5]::NUMERIC,
      fields[6],
      fields[7],
      year_val
    )
    ON CONFLICT (id) DO NOTHING;
    
    row_count := row_count + 1;
  END LOOP;
  
  RETURN row_count;
END;
$$;
