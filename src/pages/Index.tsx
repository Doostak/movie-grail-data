import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Star, Film } from "lucide-react";

interface Movie {
  id: number;
  movie_title: string;
  genres: string[];
  imdb_rating: number | null;
  overview: string | null;
  director: string | null;
  released_year: number | null;
  poster_link: string | null;
  similarity: number;
}

const Index = () => {
  const [description, setDescription] = useState("");
  const [matchCount, setMatchCount] = useState("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const canSubmit = description.trim() !== "" && matchCount !== "";

  const handleRecommend = async () => {
    setIsLoading(true);
    setMovies([]);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-movies", {
        body: { description: description.trim(), matchCount: parseInt(matchCount) },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMovies(data.movies ?? []);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to get recommendations.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <Film className="h-8 w-8 text-primary" />
            Movie Recommender
          </h1>
          <p className="mt-1 text-muted-foreground">
            Describe what you're in the mood for and get AI-powered movie recommendations.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Input Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g. A thrilling sci-fi movie with a twist ending set in space..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 w-full sm:w-48">
                <Label htmlFor="match-count">Number of Movies</Label>
                <Select value={matchCount} onValueChange={setMatchCount}>
                  <SelectTrigger id="match-count">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleRecommend} disabled={!canSubmit || isLoading} className="w-full sm:w-auto">
                {isLoading && <Loader2 className="animate-spin" />}
                Recommend
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {movies.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Recommendations</h2>
            <div className="grid gap-4">
              {movies.map((movie) => (
                <Card key={movie.id}>
                  <CardContent className="flex gap-4 py-4">
                    {movie.poster_link && (
                      <img
                        src={movie.poster_link}
                        alt={movie.movie_title}
                        className="w-20 h-28 object-cover rounded-md flex-shrink-0"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground leading-tight">
                          {movie.movie_title}
                          {movie.released_year && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              ({movie.released_year})
                            </span>
                          )}
                        </h3>
                        {movie.imdb_rating && (
                          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground flex-shrink-0">
                            <Star className="h-3.5 w-3.5 fill-current" style={{ color: 'hsl(45, 93%, 47%)' }} />
                            {movie.imdb_rating}
                          </span>
                        )}
                      </div>
                      {movie.director && (
                        <p className="text-sm text-muted-foreground">Dir. {movie.director}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {movie.genres.map((genre) => (
                          <Badge key={genre} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                      {movie.overview && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{movie.overview}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Similarity: {(movie.similarity * 100).toFixed(1)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
