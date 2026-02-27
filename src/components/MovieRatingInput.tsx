import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { X, Check, Film, Star } from "lucide-react";

export interface RatedMovie {
  title: string;
  rating: number;
  description?: string;
}

interface MovieDetails {
  movie_title: string;
  genres: string[];
  imdb_rating: number | null;
  director: string | null;
  released_year: number | null;
  poster_link: string | null;
}

interface Props {
  index: number;
  value: RatedMovie;
  onChange: (value: RatedMovie) => void;
  onRemove?: () => void;
}

const MovieRatingInput = ({ index, value, onChange, onRemove }: Props) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [titleFound, setTitleFound] = useState<boolean | null>(null);
  const [searching, setSearching] = useState(false);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchTitles = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setTitleFound(null);
      setMovieDetails(null);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("imdb_movies")
      .select("movie_title, genres, imdb_rating, director, released_year, poster_link")
      .ilike("movie_title", `%${query}%`)
      .limit(8);

    const titles = data?.map((r) => r.movie_title) ?? [];
    setSuggestions(titles);
    setShowSuggestions(titles.length > 0);

    const exactMatch = data?.find((r) => r.movie_title.toLowerCase() === query.toLowerCase());
    if (exactMatch) {
      setTitleFound(true);
      setMovieDetails(exactMatch);
      onChange({ ...value, title: value.title, description: undefined });
    } else {
      const notFound = titles.length === 0;
      setTitleFound(notFound ? false : null);
      setMovieDetails(null);
      if (notFound && value.description === undefined) {
        onChange({ ...value, title: value.title, description: "" });
      }
    }
    setSearching(false);
  };

  const handleTitleChange = (val: string) => {
    onChange({ ...value, title: val, description: value.description });
    setMovieDetails(null);
    setTitleFound(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTitles(val), 300);
  };

  const selectSuggestion = async (title: string) => {
    onChange({ ...value, title, description: undefined });
    setShowSuggestions(false);
    setSuggestions([]);

    const { data } = await supabase
      .from("imdb_movies")
      .select("movie_title, genres, imdb_rating, director, released_year, poster_link")
      .eq("movie_title", title)
      .limit(1)
      .single();

    if (data) {
      setMovieDetails(data);
      setTitleFound(true);
    }
  };

  const needsDescription = value.title.length >= 2 && titleFound === false && !searching;
  const isMatched = titleFound === true && movieDetails;

  const ratingColor =
    value.rating <= 3
      ? `hsl(0, 80%, 55%)`
      : value.rating <= 6
        ? `hsl(${(value.rating - 3) * 15}, 90%, 50%)`
        : `hsl(${90 + (value.rating - 7) * 10}, 70%, 45%)`;

  return (
    <div
      ref={containerRef}
      className={`rounded-lg border p-4 transition-all duration-300 ${
        isMatched
          ? "border-primary/40 bg-primary/5 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.15)]"
          : needsDescription
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium text-foreground">Movie {index + 1}</Label>
          {isMatched && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3 w-3" /> Found
            </span>
          )}
          {needsDescription && (
            <span className="text-xs text-destructive">Not in database</span>
          )}
        </div>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className={`grid gap-4 ${isMatched || needsDescription ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {/* Left: title + rating */}
        <div className="space-y-3">
          <div className="relative">
            <Input
              placeholder="Search movie title..."
              value={value.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            {showSuggestions && (
              <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
                {suggestions.map((s) => (
                  <li
                    key={s}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={() => selectSuggestion(s)}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Rating</Label>
              <span className="text-sm font-semibold" style={{ color: ratingColor }}>
                {value.rating}/10
              </span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[value.rating]}
              onValueChange={([v]) => onChange({ ...value, rating: v })}
            />
          </div>
        </div>

        {/* Right: movie details or description */}
        {isMatched && movieDetails && (
          <div className="flex gap-3 items-start">
            {movieDetails.poster_link && (
              <img
                src={movieDetails.poster_link}
                alt={movieDetails.movie_title}
                className="w-16 h-24 object-cover rounded flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground leading-tight truncate">
                {movieDetails.movie_title}
                {movieDetails.released_year && (
                  <span className="ml-1 text-xs text-muted-foreground">({movieDetails.released_year})</span>
                )}
              </p>
              {movieDetails.director && (
                <p className="text-xs text-muted-foreground">Dir. {movieDetails.director}</p>
              )}
              {movieDetails.imdb_rating && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-current" style={{ color: "hsl(45, 93%, 47%)" }} />
                  {movieDetails.imdb_rating}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {movieDetails.genres?.slice(0, 3).map((g) => (
                  <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {g}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {needsDescription && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Describe this movie briefly <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="e.g. A sci-fi thriller about time loops set in a space station..."
              value={value.description ?? ""}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              className="min-h-[80px]"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieRatingInput;
