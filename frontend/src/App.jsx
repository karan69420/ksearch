import { useState } from "react";

function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("web");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [aiAnswer, setAiAnswer] = useState("");
  const [aiSources, setAiSources] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Conversation history for follow-up questions
  const [conversation, setConversation] = useState([]);

  // Follow-up input
  const [followUp, setFollowUp] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // ==========================================
  // NORMAL SEARCH
  // ==========================================

  const searchWithCategory = async (selectedCategory) => {
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setAiAnswer("");
    setAiSources([]);
    setConversation([]);
    setFollowUp("");

    if (selectedCategory === "web") {
      setAiLoading(true);
    } else {
      setAiLoading(false);
    }

    try {
      // Step 1: Search SearXNG
      const searchResponse = await fetch(
        `http://localhost:8000/search?q=${encodeURIComponent(
          query
        )}&category=${selectedCategory}`
      );

      if (!searchResponse.ok) {
        throw new Error("Search request failed");
      }

      const data = await searchResponse.json();
      const searchResults = data.results || [];

      setResults(searchResults);

      // Step 2: Generate AI answer using the SAME search results
      if (selectedCategory === "web" && searchResults.length > 0) {
        const aiResponse = await fetch(
          "http://localhost:8000/ai-answer",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: query,
              results: searchResults.slice(0, 8),
              conversation: [],
            }),
          }
        );

        if (!aiResponse.ok) {
          throw new Error("AI answer request failed");
        }

        const aiData = await aiResponse.json();

        const answer = aiData.answer || "";
        const sources = aiData.sources || [];

        setAiAnswer(answer);
        setAiSources(sources);

        // Save conversation for follow-up questions
        setConversation([
          {
            role: "user",
            content: query,
          },
          {
            role: "assistant",
            content: answer,
          },
        ]);
      }
    } catch (error) {
      console.error("Search failed:", error);

      setResults([]);
      setAiAnswer("");
      setAiSources([]);
      setConversation([]);
    }

    setLoading(false);
    setAiLoading(false);
  };

  // ==========================================
  // FOLLOW-UP QUESTION
  // ==========================================

  const askFollowUp = async () => {
    if (!followUp.trim() || followUpLoading) return;

    const followUpQuestion = followUp.trim();

    setFollowUpLoading(true);
    setFollowUp("");

    try {
      /*
        Build a contextual search query.

        Example:

        Previous:
        "What is RAG?"

        Follow-up:
        "What are its main components?"

        SearXNG receives:
        "What is RAG? What are its main components?"

        This prevents the search engine from interpreting
        "its" as an unrelated topic.
      */

      const previousQuestions = conversation
        .filter((message) => message.role === "user")
        .slice(-2)
        .map((message) => message.content);

      const contextualQuery = [
        ...previousQuestions,
        followUpQuestion,
      ].join(" ");

      // Step 1: Search SearXNG using contextual query
      const searchResponse = await fetch(
        `http://localhost:8000/search?q=${encodeURIComponent(
          contextualQuery
        )}&category=web`
      );

      if (!searchResponse.ok) {
        throw new Error("Follow-up search failed");
      }

      const searchData = await searchResponse.json();
      const followUpResults = searchData.results || [];

      if (followUpResults.length === 0) {
        setAiAnswer(
          "I couldn't find any relevant information for that follow-up question."
        );

        setAiSources([]);
        setFollowUpLoading(false);
        return;
      }

      /*
        Step 2:
        Send the ORIGINAL follow-up question,
        fresh search results, and conversation history
        to Ollama.
      */

      const aiResponse = await fetch(
        "http://localhost:8000/ai-answer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: followUpQuestion,
            results: followUpResults.slice(0, 8),
            conversation: conversation,
          }),
        }
      );

      if (!aiResponse.ok) {
        throw new Error("AI follow-up request failed");
      }

      const aiData = await aiResponse.json();

      const newAnswer = aiData.answer || "";
      const newSources = aiData.sources || [];

      setResults(followUpResults);
      setAiAnswer(newAnswer);
      setAiSources(newSources);

      // Add the new exchange to conversation history
      setConversation((previousConversation) => [
        ...previousConversation,
        {
          role: "user",
          content: followUpQuestion,
        },
        {
          role: "assistant",
          content: newAnswer,
        },
      ]);
    } catch (error) {
      console.error("Follow-up failed:", error);

      setAiAnswer(
        "Sorry, I couldn't process that follow-up question."
      );

      setAiSources([]);
    }

    setFollowUpLoading(false);
  };

  // ==========================================
  // SEARCH CONTROLS
  // ==========================================

  const search = () => {
    searchWithCategory(category);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      search();
    }
  };

  const handleFollowUpKeyDown = (event) => {
    if (event.key === "Enter") {
      askFollowUp();
    }
  };

  const changeCategory = (newCategory) => {
    setCategory(newCategory);

    if (searched && query.trim()) {
      searchWithCategory(newCategory);
    }
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="app">

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-k">K</span>Search
        </div>

        <div className="tagline">
          Search privately. Search freely.
        </div>
      </header>

      {/* Main */}
      <main className={searched ? "main searched" : "main"}>

        {/* Hero */}
        {!searched && (
          <div className="hero">
            <h1>
              What do you want to find?
            </h1>

            <p>
              Private search powered by your own infrastructure.
            </p>
          </div>
        )}

        {/* Search Bar */}
        <div className="search-container">
          <input
            type="text"
            placeholder="Search the web..."
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            onKeyDown={handleKeyDown}
          />

          <button onClick={search}>
            🔍
          </button>
        </div>

        {/* Search Tabs */}
        <div className="tabs">

          <button
            className={category === "web" ? "active" : ""}
            onClick={() => changeCategory("web")}
          >
            Web
          </button>

          <button
            className={category === "news" ? "active" : ""}
            onClick={() => changeCategory("news")}
          >
            News
          </button>

          <button
            className={category === "images" ? "active" : ""}
            onClick={() => changeCategory("images")}
          >
            Images
          </button>

        </div>

        {/* Search Loading */}
        {loading && (
          <div className="loading">
            Searching...
          </div>
        )}

        {/* AI Loading */}
        {category === "web" && aiLoading && (
          <div className="ai-card">
            <div className="ai-header">
              ✨ AI Answer
            </div>

            <div className="ai-loading">
              Thinking...
            </div>
          </div>
        )}

        {/* AI Answer */}
        {category === "web" &&
          !aiLoading &&
          aiAnswer && (
            <div className="ai-card">

              <div className="ai-header">
                ✨ AI Answer
              </div>

              {/* Answer with clickable citations */}
              <div className="ai-answer">
                {aiAnswer
                  .split(/(\[\d+\])/g)
                  .map((part, index) => {
                    const match =
                      part.match(/^\[(\d+)\]$/);

                    if (match) {
                      const sourceNumber =
                        parseInt(match[1], 10);

                      const source =
                        aiSources[sourceNumber - 1];

                      if (source) {
                        return (
                          <a
                            key={index}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-citation"
                            title={source.title}
                          >
                            [{sourceNumber}]
                          </a>
                        );
                      }
                    }

                    return (
                      <span key={index}>
                        {part}
                      </span>
                    );
                  })}
              </div>

              {/* Sources */}
              {aiSources.length > 0 && (
                <div className="ai-sources">

                  <div className="sources-title">
                    Sources
                  </div>

                  <div className="sources-list">
                    {aiSources.map(
                      (source, index) => (
                        <a
                          key={index}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-link"
                        >
                          <span className="source-number">
                            {index + 1}
                          </span>

                          <span>
                            {source.title}
                          </span>
                        </a>
                      )
                    )}
                  </div>

                </div>
              )}

              {/* Follow-up */}
              {conversation.length > 0 && (
                <div className="follow-up">

                  <div className="follow-up-title">
                    Ask a follow-up question
                  </div>

                  <div className="follow-up-container">

                    <input
                      type="text"
                      placeholder="Ask something about this..."
                      value={followUp}
                      onChange={(event) =>
                        setFollowUp(event.target.value)
                      }
                      onKeyDown={
                        handleFollowUpKeyDown
                      }
                      disabled={followUpLoading}
                    />

                    <button
                      onClick={askFollowUp}
                      disabled={
                        followUpLoading ||
                        !followUp.trim()
                      }
                    >
                      {followUpLoading
                        ? "..."
                        : "Ask"}
                    </button>

                  </div>

                </div>
              )}

            </div>
          )}

        {/* IMAGE RESULTS */}
        {!loading &&
          category === "images" &&
          results.length > 0 && (
            <div className="image-grid">

              {results.map((result, index) => {
                const imageUrl =
                  result.img_src ||
                  result.thumbnail_src ||
                  result.image ||
                  result.image_url;

                return (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="image-card"
                    key={index}
                  >

                    <div className="image-wrapper">

                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={
                            result.title || query
                          }
                          loading="lazy"
                        />
                      ) : (
                        <div className="image-placeholder">
                          No preview
                        </div>
                      )}

                    </div>

                    <div className="image-title">
                      {result.title || "Image"}
                    </div>

                    <div className="image-source">
                      {result.source ||
                        result.url}
                    </div>

                  </a>
                );
              })}

            </div>
          )}

        {/* WEB + NEWS RESULTS */}
        {!loading &&
          category !== "images" &&
          results.length > 0 && (
            <div className="results">

              {results.map((result, index) => (
                <article
                  className="result-card"
                  key={index}
                >

                  <div className="result-url">
                    {result.url}
                  </div>

                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="result-title"
                  >
                    {result.title}
                  </a>

                  <p className="result-content">
                    {result.content}
                  </p>

                </article>
              ))}

            </div>
          )}

        {/* No Results */}
        {!loading &&
          searched &&
          results.length === 0 &&
          !aiLoading && (
            <div className="no-results">
              No results found.
            </div>
          )}

      </main>

    </div>
  );
}

export default App;