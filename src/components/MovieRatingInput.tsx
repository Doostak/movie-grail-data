import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

export interface RatedMovie {
  title: string;
  rating: number;
  description?: string;
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
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
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("imdb_movies")
      .select("movie_title")
      .ilike("movie_title", `%${query}%`)
      .limit(8);

    const titles = data?.map((r) => r.movie_title) ?? [];
    setSuggestions(titles);
    setShowSuggestions(titles.length > 0);

    const exactMatch = titles.some(
      (t) => t.toLowerCase() === query.toLowerCase()
    );
    setTitleFound(exactMatch);
    setSearching(false);
  };

  const handleTitleChange = (val: string) => {
    onChange({ ...value, title: val, description: value.description });
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTitles(val), 300);
  };

  const selectSuggestion = (title: string) => {
    onChange({ ...value, title, description: undefined });
    setTitleFound(true);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const needsDescription = value.title.length >= 2 && titleFound === false && !searching;

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-4 space-y-3 relative">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">
          Movie {index + 1}
        </Label>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Title with autocomplete */}
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

      {/* Rating slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Rating</Label>
          <span
            className="text-sm font-semibold"
            style={{
              color: value.rating <= 3
                ? `hsl(0, 80%, 55%)`
                : value.rating <= 6
                ? `hsl(${(value.rating - 3) * 15}, 90%, 50%)`
                : `hsl(${90 + (value.rating - 7) * 10}, 70%, 45%)`,
            }}
          >
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

      {/* Description when title not found */}
      {needsDescription && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Title not found — please describe this movie briefly (required)
          </Label>
          <Textarea
            placeholder="e.g. A sci-fi thriller about time loops set in a space station..."
            value={value.description ?? ""}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            className="min-h-[60px]"
          />
        </div>
      )}
    </div>
  );
};

export default MovieRatingInput;
