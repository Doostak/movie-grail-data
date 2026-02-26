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

    // Build set of genres the user strongly liked for rating_affinity
    const likedGenres = new Map<string, number>(); // genre -> max rating
    for (const r of ratings) {
      if (r.rating >= 8) {
        const found = dbMap.get(r.title.toLowerCase());
        if (found && Array.isArray(found.genres)) {
          for (const g of found.genres) {
            likedGenres.set(g, Math.max(likedGenres.get(g) ?? 0, r.rating));
          }
        }
      }
    }

    // Merge similarity, compute final_score, filter rated movies
    const scored = matchedMovies
      .map((movie: any) => {
        const similarity = matches.find((m: any) => m.id === movie.id)?.similarity ?? 0;
        const normalizedImdb = (movie.imdb_rating ?? 5) / 10;

        // rating_affinity: how well this movie's genres overlap with strongly-liked genres
        const genres: string[] = Array.isArray(movie.genres) ? movie.genres : [];
        let affinity = 0;
        if (likedGenres.size > 0 && genres.length > 0) {
          let genreHits = 0;
          for (const g of genres) {
            if (likedGenres.has(g)) genreHits++;
          }
          affinity = genreHits / genres.length;
        }

        const finalScore = 0.6 * similarity + 0.2 * normalizedImdb + 0.2 * affinity;

        return { ...movie, similarity, final_score: finalScore, _primaryGenre: genres[0] ?? "Unknown" };
      })
      .filter((movie: any) => !ratedTitlesLower.has(movie.movie_title.toLowerCase()))
      .sort((a: any, b: any) => b.final_score - a.final_score);

    // Diversity control: max 2 per primary genre
    const genreCounts = new Map<string, number>();
    const diverseResults: any[] = [];
    for (const movie of scored) {
      const g = movie._primaryGenre;
      const count = genreCounts.get(g) ?? 0;
      if (count >= 2) continue;
      genreCounts.set(g, count + 1);
      diverseResults.push(movie);
      if (diverseResults.length >= matchCount) break;
    }

    // Clean up internal fields
    const candidates = diverseResults.map(({ _primaryGenre, ...rest }) => rest);

    // Generate explanations via LLM
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const candidateSummaries = candidates.map((m: any) => ({
      id: m.id,
      movie_title: m.movie_title,
      genres: m.genres,
      overview: m.overview,
    }));

    const llmPrompt = `User taste profile:\n${tasteText}\n\nCandidate movies:\n${JSON.stringify(candidateSummaries, null, 2)}\n\nFor each candidate movie, write a 1–2 sentence explanation of why it matches the user's preferences. Return a JSON array of objects with "id" and "explanation" fields only.`;

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a movie recommendation assistant. Explain briefly (1–2 sentences per movie) why each recommended movie matches the user's preferences. Only use information from the provided candidate movies. Do not invent facts. Respond with a JSON array of objects with \"id\" (number) and \"explanation\" (string) fields. No markdown, no code fences, just raw JSON.",
          },
          { role: "user", content: llmPrompt },
        ],
      }),
    });

    let explanationMap = new Map<number, string>();
    if (llmResponse.ok) {
      try {
        const llmData = await llmResponse.json();
        const raw = llmData.choices?.[0]?.message?.content ?? "";
        const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
        const explanations: { id: number; explanation: string }[] = JSON.parse(cleaned);
        for (const e of explanations) {
          explanationMap.set(e.id, e.explanation);
        }
      } catch (err) {
        console.error("Failed to parse LLM explanations:", err);
      }
    } else {
      console.error("LLM call failed:", llmResponse.status, await llmResponse.text());
    }

    const recommendations = candidates.map((m: any) => ({
      id: m.id,
      movie_title: m.movie_title,
      genres: m.genres,
      imdb_rating: m.imdb_rating,
      overview: m.overview,
      director: m.director,
      released_year: m.released_year,
      poster_link: m.poster_link,
      similarity: m.similarity,
      final_score: m.final_score,
      explanation: explanationMap.get(m.id) ?? null,
    }));

    return new Response(JSON.stringify({ recommendations }), {
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
