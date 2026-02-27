import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Star, Film, Plus, ThumbsUp, ThumbsDown } from "lucide-react";
import MovieRatingInput, { type RatedMovie } from "@/components/MovieRatingInput";

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
  final_score: number;
  explanation: string | null;
}

interface Feedback {
  title: string;
  genres: string[];
}

const DEFAULT_MOVIE: RatedMovie = { title: "", rating: 5 };
const MIN_MOVIES = 2;
const MAX_MOVIES = 7;

const Index = () => {
  const [ratedMovies, setRatedMovies] = useState<RatedMovie[]>(
    Array.from({ length: MIN_MOVIES }, () => ({ ...DEFAULT_MOVIE }))
  );
  const [likes, setLikes] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [matchCount, setMatchCount] = useState(5);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [moreLike, setMoreLike] = useState<Feedback[]>([]);
  const [lessLike, setLessLike] = useState<Feedback[]>([]);
  const { toast } = useToast();

  const updateMovie = (index: number, value: RatedMovie) => {
    setRatedMovies((prev) => prev.map((m, i) => (i === index ? value : m)));
  };

  const removeMovie = (index: number) => {
    if (ratedMovies.length <= MIN_MOVIES) return;
    setRatedMovies((prev) => prev.filter((_, i) => i !== index));
  };

  const addMovie = () => {
    if (ratedMovies.length >= MAX_MOVIES) return;
    setRatedMovies((prev) => [...prev, { ...DEFAULT_MOVIE }]);
  };

  const canSubmit =
    ratedMovies.every(
      (m) =>
        m.title.trim() !== "" &&
        (m.description === undefined || m.description.trim() !== "")
    ) &&
    matchCount >= 1 &&
    matchCount <= 20;

  const buildPayload = useCallback(
    (extraMoreLike: Feedback[], extraLessLike: Feedback[]) => {
      const moreLikeText = extraMoreLike
        .map((f) => `${f.title} (${f.genres.join(", ")})`)
        .join("; ");
      const lessLikeText = extraLessLike
        .map((f) => `${f.title} (${f.genres.join(", ")})`)
        .join("; ");

      const combinedLikes = [likes.trim(), moreLikeText].filter(Boolean).join(". ");
      const combinedDislikes = [dislikes.trim(), lessLikeText].filter(Boolean).join(". ");

      return {
        ratings: ratedMovies.map((m) => ({
          title: m.title.trim(),
          rating: m.rating,
          ...(m.description ? { description: m.description.trim() } : {}),
        })),
        ...(combinedLikes ? { likes: combinedLikes } : {}),
        ...(combinedDislikes ? { dislikes: combinedDislikes } : {}),
        matchCount,
      };
    },
    [ratedMovies, likes, dislikes, matchCount]
  );

  const runRecommendation = async (payload: ReturnType<typeof buildPayload>) => {
    setIsLoading(true);
    setMovies([]);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-movies", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMovies(data.recommendations ?? []);
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

  const handleRecommend = () => {
    setMoreLike([]);
    setLessLike([]);
    runRecommendation(buildPayload([], []));
  };

  const handleFeedback = (movie: Movie, type: "more" | "less") => {
    const feedback: Feedback = { title: movie.movie_title, genres: movie.genres };
    const nextMore = type === "more" ? [...moreLike, feedback] : moreLike;
    const nextLess = type === "less" ? [...lessLike, feedback] : lessLike;
    setMoreLike(nextMore);
    setLessLike(nextLess);
    runRecommendation(buildPayload(nextMore, nextLess));
  };

  const feedbackTitles = new Set([
    ...moreLike.map((f) => f.title),
    ...lessLike.map((f) => f.title),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <Film className="h-8 w-8 text-primary" />
            Movie Recommender
          </h1>
          <p className="mt-1 text-muted-foreground">
            Rate some movies you've seen and get AI-powered recommendations.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Rated Movies */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Your Rated Movies</h2>
          {ratedMovies.map((m, i) => (
            <MovieRatingInput
              key={i}
              index={i}
              value={m}
              onChange={(v) => updateMovie(i, v)}
              onRemove={ratedMovies.length > MIN_MOVIES ? () => removeMovie(i) : undefined}
            />
          ))}
          {ratedMovies.length < MAX_MOVIES && (
            <Button type="button" variant="outline" onClick={addMovie} className="w-full">
              <Plus className="h-4 w-4" />
              Add Movie ({ratedMovies.length}/{MAX_MOVIES})
            </Button>
          )}
        </section>

        {/* Global preferences — no card wrapper, side by side */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="likes" className="flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-primary" />
                What do you enjoy?
              </Label>
              <Textarea
                id="likes"
                placeholder="e.g. Unexpected plot twists, strong character development..."
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dislikes" className="flex items-center gap-1.5">
                <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
                What do you dislike?
              </Label>
              <Textarea
                id="dislikes"
                placeholder="e.g. Too much romance, slow pacing..."
                value={dislikes}
                onChange={(e) => setDislikes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="space-y-2 w-48">
              <Label htmlFor="match-count">Results</Label>
              <Input
                id="match-count"
                type="number"
                min={1}
                max={20}
                value={matchCount}
                onChange={(e) => setMatchCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>
        </section>

        {/* Global Recommend button */}
        <div className="sticky bottom-4 z-40">
          <Button
            onClick={handleRecommend}
            disabled={!canSubmit || isLoading}
            size="lg"
            className="w-full text-base font-semibold shadow-[0_0_25px_-5px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_35px_-5px_hsl(var(--primary)/0.6)] transition-shadow"
          >
            {isLoading && <Loader2 className="animate-spin" />}
            <Film className="h-5 w-5" />
            Get Recommendations
          </Button>
        </div>

        {/* Feedback chips */}
        {(moreLike.length > 0 || lessLike.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {moreLike.map((f) => (
              <Badge key={`more-${f.title}`} variant="default" className="text-xs">
                <ThumbsUp className="h-3 w-3 mr-1" /> {f.title}
              </Badge>
            ))}
            {lessLike.map((f) => (
              <Badge key={`less-${f.title}`} variant="destructive" className="text-xs">
                <ThumbsDown className="h-3 w-3 mr-1" /> {f.title}
              </Badge>
            ))}
          </div>
        )}

        {/* Results */}
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
                      {movie.explanation && (
                        <p className="text-sm text-primary/80 italic">{movie.explanation}</p>
                      )}
                      {movie.overview && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{movie.overview}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-xs text-muted-foreground">
                          Score: {(movie.final_score * 100).toFixed(1)}% · Similarity: {(movie.similarity * 100).toFixed(1)}%
                        </p>
                        {!feedbackTitles.has(movie.movie_title) && (
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isLoading}
                              onClick={() => handleFeedback(movie, "more")}
                              className="h-7 px-2 text-xs"
                            >
                              <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                              More like this
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isLoading}
                              onClick={() => handleFeedback(movie, "less")}
                              className="h-7 px-2 text-xs"
                            >
                              <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                              Less like this
                            </Button>
                          </div>
                        )}
                      </div>
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
