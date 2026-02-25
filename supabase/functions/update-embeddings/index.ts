import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch embeddings from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("temp-data")
      .download("embeddings.json");

    if (downloadError) throw downloadError;

    const text = await fileData.text();
    const parsed = JSON.parse(text);
    const embeddings = parsed.embeddings;
    const total = embeddings.length;
    let updated = 0;
    const batchSize = 50;

    for (let i = 0; i < total; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      const promises = batch.map((emb: any, idx: number) => {
        const movieId = i + idx + 1;
        const vector = `[${emb.values.join(",")}]`;
        return supabase
          .from("imdb_movies")
          .update({ embedding: vector })
          .eq("id", movieId);
      });

      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.error) {
          console.error("Update error for batch starting at", i, res.error);
        } else {
          updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, total, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
