import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { description, matchCount } = await req.json();
    if (!description || !matchCount) {
      return new Response(JSON.stringify({ error: "description and matchCount are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Generate embedding using Gemini embedding model via Lovable AI gateway
    const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-embedding-001",
        input: description,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding error:", embeddingResponse.status, errorText);
      if (embeddingResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (embeddingResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Embedding generation failed: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data?.[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned");

    // Format as pgvector string
    const vectorStr = `[${embedding.join(",")}]`;

    // Query match_movies RPC
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: matches, error: matchError } = await supabase.rpc("match_movies", {
      query_embedding: vectorStr,
      match_count: matchCount,
    });

    if (matchError) throw matchError;

    // Fetch full movie details for matched IDs
    const movieIds = matches.map((m: any) => m.id);
    const { data: movies, error: moviesError } = await supabase
      .from("imdb_movies")
      .select("id, movie_title, genres, imdb_rating, overview, director, released_year, poster_link")
      .in("id", movieIds);

    if (moviesError) throw moviesError;

    // Merge similarity scores and sort
    const results = movies.map((movie: any) => ({
      ...movie,
      similarity: matches.find((m: any) => m.id === movie.id)?.similarity ?? 0,
    })).sort((a: any, b: any) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ movies: results }), {
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
