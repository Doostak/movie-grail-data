# Project Title

AI Movie Recommender Assistant

## Problem

Most AI recommenders rely on vague prompts and hallucinated suggestions.  
This project explores a hybrid recommendation architecture combining structured user signals with semantic retrieval.

## Solution

Users rate several movies and optionally describe preferences.  
The system builds a taste profile embedding and retrieves candidates using vector similarity across the IMDB Top 1000 dataset.

## Architecture

User Input  
↓  
Taste Profile Builder  
↓  
Embedding Generation  
↓  
Vector Search (pgvector)  
↓  
Candidate Retrieval  
↓  
Hybrid Ranking  
↓  
Diversity Control  
↓  
LLM Explanation Layer

## Key Features

- Hybrid recommendation engine

- Support for custom movie descriptions

- Vector search using embeddings

- Multi-factor ranking

- Explainable recommendations

- Feedback loop for refinement

## Technologies

- React + Lovable

- Supabase

- pgvector

- Gemini/OpenAI APIs

- Edge Functions

## Future Improvements

- Collaborative filtering

- Learning-to-rank models

- Offline evaluation metrics (Precision@K)

## Live Demo

**URL**: https://movie-grail-data.lovable.app/
