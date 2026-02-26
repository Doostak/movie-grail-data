import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RatingInput {
  title: string;
  rating: number;
  description?: string;
}

interface RequestBody {
  ratings: RatingInput[];
  likes?: string;
  dislikes?: string;
  matchCount?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ratings, likes, dislikes, matchCount = 10 }: RequestBody = await req.json();

    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
      return new Response(JSON.stringify({ error: "ratings array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up each rated movie in the database
    const titles = ratings.map((r) => r.title);
    const { data: dbMovies } = await supabase
      .from("imdb_movies")
      .select("id, movie_title, genres, overview, imdb_rating")
      .in("movie_title", titles);

    const dbMap = new Map<string, typeof dbMovies extends (infer T)[] | null ? T : never>();
    if (dbMovies) {
      for (const m of dbMovies) {
        dbMap.set(m.movie_title.toLowerCase(), m);
      }
    }

    // Build structured taste text
    const strongLikes: string[] = [];
    const neutral: string[] = [];
    const dislikesList: string[] = [];
    const ratedTitlesLower = new Set<string>();

    for (const r of ratings) {
      ratedTitlesLower.add(r.title.toLowerCase());
      const found = dbMap.get(r.title.toLowerCase());

      let line: string;
      if (found) {
        const genres = Array.isArray(found.genres) ? found.genres.join(", ") : "";
        line = `${found.movie_title} | ${genres} | ${found.overview ?? "N/A"} | User rating: ${r.rating}/10`;
      } else {
        line = `${r.title} | ${r.description ?? "No description"} | User rating: ${r.rating}/10`;
      }

      if (r.rating >= 8) strongLikes.push(line);
      else if (r.rating >= 5) neutral.push(line);
      else dislikesList.push(line);
    }

    let tasteText = "USER MOVIE PREFERENCES\n\n";

    if (strongLikes.length > 0) {
      tasteText += "STRONG LIKES (rating >= 8):\n" + strongLikes.map((l) => `- ${l}`).join("\n") + "\n\n";
    }
    if (neutral.length > 0) {
      tasteText += "NEUTRAL (rating 5–7):\n" + neutral.map((l) => `- ${l}`).join("\n") + "\n\n";
    }
    if (dislikesList.length > 0) {
      tasteText += "DISLIKES (rating <= 4):\n" + dislikesList.map((l) => `- ${l}`).join("\n") + "\n\n";
    }
    if (likes) {
      tasteText += `MORE OF THIS:\n${likes}\n\n`;
    }
    if (dislikes) {
      tasteText += `LESS OF THIS:\n${dislikes}\n\n`;
    }

    console.log("tasteText length:", tasteText.length);

    // Generate embedding
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: tasteText }] },
          output_dimensionality: 768,
        }),
      }
    );

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding error:", embeddingResponse.status, errorText);
      if (embeddingResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Embedding generation failed: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding?.values;
    if (!embedding) throw new Error("No embedding returned");

    const vectorStr = `[${embedding.join(",")}]`;

    // Query top 50 matches
    const { data: matches, error: matchError } = await supabase.rpc("match_movies", {
      query_embedding: vectorStr,
      match_count: 50,
    });

    if (matchError) throw matchError;

    // Get full details for matches
    const matchIds = matches.map((m: any) => m.id);
    const { data: matchedMovies, error: moviesError } = await supabase
      .from("imdb_movies")
      .select("id, movie_title, genres, imdb_rating, overview, director, released_year, poster_link")
      .in("id", matchIds);

    if (moviesError) throw moviesError;

    // Merge similarity, filter out already-rated movies, sort and take top matchCount
    const results = matchedMovies
      .map((movie: any) => ({
        ...movie,
        similarity: matches.find((m: any) => m.id === movie.id)?.similarity ?? 0,
      }))
      .filter((movie: any) => !ratedTitlesLower.has(movie.movie_title.toLowerCase()))
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, matchCount);

    return new Response(JSON.stringify({ recommendations: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-movies error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
