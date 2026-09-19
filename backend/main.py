from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import time

app = FastAPI(
    title="KSearch API",
    description="Private search engine backend powered by SearXNG",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEARXNG_URL = "http://localhost:8080/search"

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2"


class ConversationMessage(BaseModel):
    role: str
    content: str


class AIRequest(BaseModel):
    query: str
    results: list
    conversation: list[ConversationMessage] = []


@app.get("/")
async def root():
    return {
        "message": "KSearch API is running",
        "status": "ok",
        "version": "4.0.0"
    }


async def generate_ai_answer(
    query,
    results,
    conversation=None
):
    if not results:
        return {
            "answer": "I couldn't find any relevant search results.",
            "sources": []
        }

    if conversation is None:
        conversation = []

    # Build search context
    context_parts = []

    for i, result in enumerate(results, start=1):

        title = result.get("title", "")
        content = result.get("content", "")
        url = result.get("url", "")

        context_parts.append(
            f"Source {i}:\n"
            f"Title: {title}\n"
            f"URL: {url}\n"
            f"Content: {content}\n"
        )

    context = "\n".join(context_parts)

    # Build conversation context
    conversation_parts = []

    for message in conversation[-6:]:

        role = message.role
        content = message.content

        conversation_parts.append(
            f"{role.upper()}: {content}"
        )

    conversation_context = "\n".join(
        conversation_parts
    )

    # Prompt Ollama
    prompt = f"""
You are the AI assistant inside KSearch, a private search engine.

Answer the user's latest question using the search results and conversation context below.

Previous conversation:
{conversation_context}

Latest user question:
{query}

Search results:
{context}

Instructions:

- Answer the latest question directly.
- Use ONLY information supported by the search results.
- Use the previous conversation to understand references such as "it", "they", "this", or "that".
- Do not invent facts.
- Cite factual claims using the source numbers provided.
- Use citations in this exact format: [1], [2], [3], etc.
- Put citations immediately after the statement they support.
- You may use multiple citations together, such as [1][3].
- Do not cite every sentence unnecessarily.
- Every important factual claim should have at least one citation.
- Only use a citation number if that source actually supports the statement.
- Do not create citation numbers that do not exist.
- Do not include a separate Sources section.
- Keep the answer reasonably concise and easy to read.
"""

    ollama_payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }

    async with httpx.AsyncClient() as client:

        ollama_response = await client.post(
            OLLAMA_URL,
            json=ollama_payload,
            timeout=120.0
        )

    ollama_response.raise_for_status()

    ollama_data = ollama_response.json()

    answer = ollama_data.get(
        "response",
        "I couldn't generate an answer."
    )

    sources = []

    for result in results:

        sources.append({
            "title": result.get("title", ""),
            "url": result.get("url", "")
        })

    return {
        "answer": answer,
        "sources": sources
    }


@app.post("/ai-answer")
async def ai_answer(request: AIRequest):

    if not request.query.strip():

        return {
            "answer": "Please enter a search query.",
            "sources": []
        }

    return await generate_ai_answer(
        request.query,
        request.results[:8],
        request.conversation
    )


@app.get("/search")
async def search(
    q: str = Query(..., min_length=1),
    category: str = Query("web"),
    page: int = Query(1, ge=1)
):

    start_time = time.perf_counter()

    if category == "news":
        searx_category = "news"

    elif category == "images":
        searx_category = "images"

    else:
        searx_category = "general"

    params = {
        "q": q,
        "format": "json",
        "pageno": page,
        "categories": searx_category
    }

    # Search SearXNG once
    async with httpx.AsyncClient() as client:

        response = await client.get(
            SEARXNG_URL,
            params=params,
            timeout=30.0
        )

    response.raise_for_status()

    data = response.json()

    results = data.get("results", [])

    elapsed = round(
        time.perf_counter() - start_time,
        2
    )

    return {
        "query": q,
        "category": category,
        "page": page,
        "search_time": elapsed,
        "result_count": len(results),
        "results": results
    }